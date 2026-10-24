// Visual effects: soft particles (additive + alpha), streaking tracers, brass casings, debris,
// bullet decals, muzzle flashes with lights, explosions.
import * as THREE from 'three';
import { radialTexture, starTexture } from './textures.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Euler();
const rand = (a, b) => a + Math.random() * (b - a);

function puffTexture() {
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = N / 2 + (Math.random() - 0.5) * N * 0.4, y = N / 2 + (Math.random() - 0.5) * N * 0.4, r = N * (0.12 + Math.random() * 0.22);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, N, N);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Points {
  constructor(scene, max, additive, map) {
    this.max = max;
    this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.alpha = new Float32Array(max); this.size = new Float32Array(max); this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: map }, scale: { value: 500 } }]),
      vertexShader: /* glsl */`
        attribute float alpha; attribute float size; attribute float rot; attribute vec3 color;
        varying float vAlpha; varying vec3 vColor; varying float vRot;
        uniform float scale;
        #include <fog_pars_vertex>
        void main() {
          vAlpha = alpha; vColor = color; vRot = rot;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.05, -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map;
        varying float vAlpha; varying vec3 vColor; varying float vRot;
        #include <fog_pars_fragment>
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;
          vec4 t = texture2D(map, uv);
          gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }

  spawn(p, v, color, size, life, o = {}) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      p: p.clone(), v: v.clone(), c: new THREE.Color(color), size, grow: o.grow ?? 0, life, max: life,
      g: o.gravity ?? 0, drag: o.drag ?? 0.5, a: o.alpha ?? 1, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * (o.spin ?? 1), fadeIn: o.fadeIn ?? 0,
    });
  }

  update(dt) {
    const L = this.list;
    let n = 0;
    for (let i = L.length - 1; i >= 0; i--) if ((L[i].life -= dt) <= 0) L.splice(i, 1);
    for (const q of L) {
      q.v.y -= q.g * dt;
      q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < 0.02 && q.g > 0) { q.p.y = 0.02; q.v.y *= -0.25; q.v.x *= 0.5; q.v.z *= 0.5; }
      q.rot += q.spin * dt;
      const k = q.life / q.max;
      const age = 1 - k;
      const fin = q.fadeIn > 0 ? Math.min(1, age / q.fadeIn) : 1;
      this.pos[n * 3] = q.p.x; this.pos[n * 3 + 1] = q.p.y; this.pos[n * 3 + 2] = q.p.z;
      this.col[n * 3] = q.c.r; this.col[n * 3 + 1] = q.c.g; this.col[n * 3 + 2] = q.c.b;
      this.alpha[n] = q.a * Math.min(1, k * 2.5) * fin;
      this.size[n] = q.size + q.grow * age;
      this.rot[n] = q.rot;
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'color', 'alpha', 'size', 'rot']) this.geo.attributes[k].needsUpdate = true;
  }
}

// Floating dust: a box of slow, drifting motes that follows the camera and wraps around it.
// Bright where they catch the sun, nearly invisible otherwise, so they add depth without noise.
class Motes {
  constructor(scene, map) {
    this.pts = new Points(scene, 320, true, map);
    this.n = 0; this.box = 22; this.t = 0;
    this.seed = [];
  }
  setCount(n) {
    this.n = Math.min(n, this.pts.max);
    this.seed.length = 0;
    for (let i = 0; i < this.n; i++) this.seed.push({ x: Math.random(), y: Math.random(), z: Math.random(), ph: Math.random() * 6.28, s: rand(0.012, 0.03), a: rand(0.25, 0.7) });
  }
  update(dt, cam) {
    const P = this.pts;
    if (!this.n || !cam) { P.geo.setDrawRange(0, 0); return; }
    this.t += dt;
    const B = this.box, t = this.t;
    const wx = 0.35 * t, wz = 0.12 * t; // light breeze
    let n = 0;
    for (const m of this.seed) {
      // position in a camera-centred wrapping box
      const fx = (((m.x * B + wx + Math.sin(t * 0.3 + m.ph) * 0.6 - cam.x) % B) + B) % B;
      const fz = (((m.z * B + wz + Math.cos(t * 0.27 + m.ph) * 0.6 - cam.z) % B) + B) % B;
      const fy = (((m.y * 7 + Math.sin(t * 0.21 + m.ph * 2) * 0.4 - cam.y + 2) % 7) + 7) % 7;
      const x = cam.x + fx - B / 2, z = cam.z + fz - B / 2, y = cam.y + fy - 2;
      if (y < 0.05) continue;
      // fade at the edges of the box so wrapping never pops
      const ex = Math.min(fx, B - fx) / (B * 0.2), ez = Math.min(fz, B - fz) / (B * 0.2);
      const edge = Math.min(1, ex, ez, fy / 1.2, (7 - fy) / 1.2);
      P.pos[n * 3] = x; P.pos[n * 3 + 1] = y; P.pos[n * 3 + 2] = z;
      P.col[n * 3] = 1.0; P.col[n * 3 + 1] = 0.86; P.col[n * 3 + 2] = 0.62;
      P.alpha[n] = m.a * 0.35 * Math.max(0, edge) * (0.65 + 0.35 * Math.sin(t * 1.3 + m.ph * 3));
      P.size[n] = m.s;
      P.rot[n] = 0;
      n++;
    }
    P.geo.setDrawRange(0, n);
    for (const k of ['position', 'color', 'alpha', 'size']) P.geo.attributes[k].needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.starTex = starTexture(128);
    const dot = radialTexture(64, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
    this.glow = new Points(scene, 900, true, dot);
    this.smoke = new Points(scene, 700, false, puffTexture());
    this.flashes = new Points(scene, 32, true, this.starTex);
    this.motes = new Motes(scene, dot);
    // laser beams + dots
    this.laserMax = 24; this.laserN = 0;
    this.laserPos = new Float32Array(this.laserMax * 6); this.laserCol = new Float32Array(this.laserMax * 6);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.laserPos, 3).setUsage(THREE.DynamicDrawUsage));
    lg.setAttribute('color', new THREE.BufferAttribute(this.laserCol, 3).setUsage(THREE.DynamicDrawUsage));
    lg.setDrawRange(0, 0);
    this.laserGeo = lg;
    const ll = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    ll.frustumCulled = false;
    scene.add(ll);
    this.laserDots = new Points(scene, this.laserMax, true, dot);
    this.motes.setCount(200);
    this.camPos = null;

    // lit debris chips
    this.debris = [];
    this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), 240);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.setColorAt(0, new THREE.Color());
    this.debrisMesh.count = 0;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.castShadow = false;
    scene.add(this.debrisMesh);

    // brass
    this.casings = [];
    this.casingMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.03, 6), new THREE.MeshStandardMaterial({ color: 0xc89b45, roughness: 0.3, metalness: 1 }), 120);
    this.casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.casingMesh.count = 0;
    this.casingMesh.frustumCulled = false;
    scene.add(this.casingMesh);

    // streaking tracers
    this.tracers = [];
    this.tracerMax = 64;
    this.tracerPos = new Float32Array(this.tracerMax * 6);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerGeo = tg;
    this.tracerLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: new THREE.Color(7, 4.6, 2.2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracerLines.frustumCulled = false;
    scene.add(this.tracerLines);

    // decals
    this.decals = [];
    const holeTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      let grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
      grd.addColorStop(0, 'rgba(10,8,6,1)'); grd.addColorStop(0.18, 'rgba(20,16,12,0.95)'); grd.addColorStop(0.3, 'rgba(60,50,40,0.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(15,12,10,0.6)'; g.lineWidth = 1;
      for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28; g.beginPath(); g.moveTo(32 + Math.cos(a) * 5, 32 + Math.sin(a) * 5); g.lineTo(32 + Math.cos(a) * (12 + Math.random() * 10), 32 + Math.sin(a) * (12 + Math.random() * 10)); g.stroke(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const decalMat = new THREE.MeshStandardMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1 });
    const decalGeo = new THREE.PlaneGeometry(0.12, 0.12);
    for (let i = 0; i < 160; i++) {
      const d = new THREE.Mesh(decalGeo, decalMat);
      d.visible = false;
      d.matrixAutoUpdate = false;
      scene.add(d);
      this.decals.push(d);
    }
    this.decalIdx = 0;
    const scorchTex = radialTexture(128, [[0, 'rgba(0,0,0,0.85)'], [0.5, 'rgba(10,8,6,0.55)'], [1, 'rgba(0,0,0,0)']]);
    this.scorches = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.scorches.push(m);
    }
    this.scorchIdx = 0;

    this.lights = [];
    for (let i = 0; i < 2; i++) {   // two: every light is paid for on every lit pixel, even when it's off
      const l = new THREE.PointLight(0xffb060, 0, 10, 2);
      scene.add(l);
      this.lights.push({ l, life: 0, max: 1, peak: 0 });
    }
    this.lightIdx = 0;
  }

  setScale(camera, height) {
    const s = height / (2 * Math.tan(camera.fov * Math.PI / 360));
    this.glow.mat.uniforms.scale.value = s;
    this.smoke.mat.uniforms.scale.value = s;
    this.flashes.mat.uniforms.scale.value = s;
    this.motes.pts.mat.uniforms.scale.value = s;
    this.laserDots.mat.uniforms.scale.value = s;
    this.camPos = camera.getWorldPosition(this.camPos || new THREE.Vector3());
  }

  beginLasers() { this.laserN = 0; }
  laser(from, dir, physics, own) {
    if (this.laserN >= this.laserMax) return;
    const hit = physics.raycast(from, dir, 80);
    const len = hit ? hit.t : 80;
    const i = this.laserN++;
    const P = this.laserPos, C = this.laserCol;
    P[i * 6] = from.x; P[i * 6 + 1] = from.y; P[i * 6 + 2] = from.z;
    P[i * 6 + 3] = from.x + dir.x * len; P[i * 6 + 4] = from.y + dir.y * len; P[i * 6 + 5] = from.z + dir.z * len;
    const a = own ? 0.35 : 0.6, b = own ? 0.05 : 0.12;
    C[i * 6] = 1.6 * a; C[i * 6 + 1] = 0.04 * a; C[i * 6 + 2] = 0.03 * a;
    C[i * 6 + 3] = 1.6 * b; C[i * 6 + 4] = 0.04 * b; C[i * 6 + 5] = 0.03 * b;
    if (hit) {
      const D = this.laserDots, k = i;
      D.pos[k * 3] = hit.point.x + hit.normal.x * 0.01; D.pos[k * 3 + 1] = hit.point.y + hit.normal.y * 0.01; D.pos[k * 3 + 2] = hit.point.z + hit.normal.z * 0.01;
      D.col[k * 3] = 2.4; D.col[k * 3 + 1] = 0.12; D.col[k * 3 + 2] = 0.08;
      D.alpha[k] = 0.95; D.size[k] = 0.02 + len * 0.0006; D.rot[k] = 0;
    } else this.laserDots.alpha[i] = 0;
  }
  endLasers() {
    const n = this.laserN;
    this.laserGeo.setDrawRange(0, n * 2);
    this.laserGeo.attributes.position.needsUpdate = true;
    this.laserGeo.attributes.color.needsUpdate = true;
    const D = this.laserDots;
    D.geo.setDrawRange(0, n);
    for (const k of ['position', 'color', 'alpha', 'size', 'rot']) D.geo.attributes[k].needsUpdate = true;
  }

  setQuality(q) { this.motes.setCount(typeof q === 'string' ? ({ low: 0, medium: 140, high: 220, ultra: 300 }[q] ?? 200) : (q.motes ?? 200)); }

  // footfalls / slides kick up a little dust
  kickDust(pos, speed, slide = false) {
    const n = slide ? 2 : 1;
    for (let i = 0; i < n; i++) {
      this.smoke.spawn(_p.set(pos.x + rand(-0.15, 0.15), pos.y + 0.05, pos.z + rand(-0.15, 0.15)),
        _v.set(rand(-0.4, 0.4), rand(0.2, 0.6), rand(-0.4, 0.4)), 0xa89a80, rand(0.12, 0.2) * (slide ? 1.6 : 1), rand(0.7, 1.2),
        { grow: slide ? 1.4 : 0.7, alpha: (slide ? 0.32 : 0.16) * Math.min(1, speed / 6), drag: 2.5, gravity: -0.1 });
    }
  }

  flashLight(pos, intensity, life, color = 0xffb060) {
    const L = this.lights[this.lightIdx++ % this.lights.length];
    L.l.position.copy(pos);
    L.l.color.set(color);
    L.peak = intensity; L.l.intensity = intensity;
    L.life = life; L.max = life;
  }

  tracer(from, to) {
    const d = _v.subVectors(to, from);
    const dist = d.length();
    if (dist < 2) return;
    if (this.tracers.length >= this.tracerMax) this.tracers.shift();
    this.tracers.push({ from: from.clone(), dir: d.clone().divideScalar(dist), dist, t: 0 });
  }

  muzzle(pos, dir, big = false, quiet = false) {
    if (quiet) {
      this.smoke.spawn(pos, _v.copy(dir).multiplyScalar(0.8).add({ x: 0, y: 0.3, z: 0 }), 0xb8b2a6, 0.08, 0.5, { grow: 0.35, alpha: 0.12, drag: 2 });
      return;
    }
    this.flashLight(pos, big ? 60 : 30, 0.05);
    this.flashes.spawn(pos, _v.set(0, 0, 0), 0xffd090, big ? 0.7 : 0.45, 0.05, { alpha: 1 });
    this.smoke.spawn(pos, _v.copy(dir).multiplyScalar(1.2).add({ x: 0, y: 0.4, z: 0 }), 0xb8b2a6, 0.15, 0.6, { grow: 0.6, alpha: 0.18, drag: 2 });
  }

  // launcher backblast: a flash and a cone of dust and smoke thrown out behind the tube
  backblast(pos, dir) {
    this.flashLight(pos, 45, 0.09, 0xffc080);
    this.flashes.spawn(pos, _v.set(0, 0, 0), 0xffc080, 1.1, 0.08, { alpha: 1 });
    for (let i = 0; i < 16; i++) {
      _v.copy(dir).multiplyScalar(-rand(3, 10)).add({ x: rand(-1.6, 1.6), y: rand(-0.4, 1.4), z: rand(-1.6, 1.6) });
      this.smoke.spawn(pos, _v, i < 5 ? 0x8a8278 : 0xc8c0b4, rand(0.25, 0.55), rand(0.9, 1.8), { grow: 1.8, alpha: 0.3, drag: 3 });
    }
  }

  casing(pos, dir, right) {
    if (this.casings.length >= 120) this.casings.shift();
    const v = new THREE.Vector3().copy(right).multiplyScalar(rand(1.5, 2.5)).add({ x: 0, y: rand(1.5, 2.5), z: 0 }).addScaledVector(dir, rand(-0.5, 0.3));
    const hit = this.physics.raycast(pos, new THREE.Vector3(0, -1, 0), 20);
    this.casings.push({ p: pos.clone(), v, floor: hit ? hit.point.y + 0.005 : 0.005, rx: Math.random() * 6, ry: Math.random() * 6, sx: rand(-20, 20), sy: rand(-20, 20), life: 3, bounced: false });
  }

  debrisChip(pos, vel, color, size) {
    if (this.debris.length >= 240) this.debris.shift();
    this.debris.push({ p: pos.clone(), v: vel.clone(), c: new THREE.Color(color), s: size, r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), spin: rand(-12, 12), life: rand(0.8, 1.6) });
  }

  impact(point, normal, kind) {
    const n = normal;
    if (kind === 'blood') {
      for (let i = 0; i < 4; i++) this.smoke.spawn(point, _v.set(n.x + rand(-0.6, 0.6), n.y + rand(0, 0.6), n.z + rand(-0.6, 0.6)).multiplyScalar(rand(0.6, 1.6)), 0x6e0b0b, rand(0.12, 0.22), rand(0.3, 0.5), { grow: 0.5, alpha: 0.75, drag: 3, gravity: 1 });
      for (let i = 0; i < 6; i++) this.glow.spawn(point, _v.set(n.x + rand(-1, 1), n.y + rand(0, 1), n.z + rand(-1, 1)).multiplyScalar(rand(2, 4)), 0x3a0000, 0.03, 0.4, { gravity: 9, alpha: 0.4 });
      return;
    }
    const surf = kind || 'concrete';
    const dust = surf === 'wood' ? 0x8a7458 : surf === 'dirt' || surf === 'ground' ? 0x8b7a5e : surf === 'metal' ? 0x8a8a86 : 0xa8a196;
    const puffs = surf === 'ground' || surf === 'dirt' ? 4 : 2;
    for (let i = 0; i < puffs; i++) {
      this.smoke.spawn(point, _v.copy(n).multiplyScalar(rand(0.8, 2.2)).add({ x: rand(-0.4, 0.4), y: rand(0, 0.6), z: rand(-0.4, 0.4) }), dust, rand(0.15, 0.3), rand(0.6, 1.2), { grow: rand(0.6, 1.2), alpha: 0.45, drag: 2.5, gravity: -0.15 });
    }
    const sparks = surf === 'metal' ? 10 : surf === 'concrete' ? 3 : 0;
    for (let i = 0; i < sparks; i++) {
      this.glow.spawn(point, _v.set(n.x + rand(-0.8, 0.8), n.y + rand(-0.4, 0.8), n.z + rand(-0.8, 0.8)).multiplyScalar(rand(3, 8)), 0xffc070, rand(0.02, 0.035), rand(0.12, 0.3), { gravity: 12, drag: 1 });
    }
    if (surf === 'metal') this.flashLight(point, 6, 0.04, 0xffd0a0);
    const chips = surf === 'metal' ? 0 : 4;
    const chipCol = surf === 'wood' ? 0x7a5a36 : surf === 'ground' || surf === 'dirt' ? 0x6b5a42 : 0x9a958c;
    for (let i = 0; i < chips; i++) this.debrisChip(point, _v.set(n.x + rand(-1, 1), n.y + rand(-0.3, 1.2), n.z + rand(-1, 1)).multiplyScalar(rand(1.5, 4)), chipCol, rand(0.015, 0.035));
    if (surf !== 'ground') {
      const d = this.decals[this.decalIdx++ % this.decals.length];
      _p.copy(point).addScaledVector(n, 0.01);
      _v.copy(_p).add(n);
      d.position.copy(_p);
      d.lookAt(_v);
      d.rotateZ(Math.random() * Math.PI);
      const sc = rand(0.8, 1.3);
      d.scale.set(sc, sc, sc);
      d.updateMatrix();
      d.visible = true;
    }
  }

  explosion(pos) {
    this.flashLight(pos, 900, 0.45, 0xffa040);
    this.flashes.spawn(pos.clone().add({ x: 0, y: 0.4, z: 0 }), _v.set(0, 0, 0), 0xffc070, 4.5, 0.12);
    for (let i = 0; i < 26; i++) {
      this.glow.spawn(pos, _v.set(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).normalize().multiplyScalar(rand(2, 7)), i % 3 ? 0xff8a2a : 0xffd27a, rand(0.6, 1.2), rand(0.25, 0.5), { grow: 1.2, drag: 4, gravity: -1 });
    }
    for (let i = 0; i < 40; i++) {
      this.glow.spawn(pos, _v.set(rand(-1, 1), rand(0, 1.3), rand(-1, 1)).normalize().multiplyScalar(rand(8, 22)), 0xffc070, rand(0.03, 0.05), rand(0.4, 1.1), { gravity: 14, drag: 0.6 });
    }
    for (let i = 0; i < 22; i++) {
      this.smoke.spawn(pos.clone().add({ x: rand(-0.6, 0.6), y: rand(0, 1), z: rand(-0.6, 0.6) }), _v.set(rand(-1.5, 1.5), rand(0.8, 3), rand(-1.5, 1.5)), i % 2 ? 0x3c3834 : 0x5c5650, rand(1.2, 2), rand(2.5, 4.5), { grow: rand(2.5, 4), alpha: 0.6, drag: 1.2, gravity: -0.3, fadeIn: 0.05 });
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.smoke.spawn(pos.clone().setY(0.2), _v.set(Math.cos(a) * 9, 0.4, Math.sin(a) * 9), 0x9c8c70, 0.6, 1.4, { grow: 2.5, alpha: 0.5, drag: 3 });
    }
    for (let i = 0; i < 14; i++) this.debrisChip(pos, _v.set(rand(-1, 1), rand(0.5, 1.5), rand(-1, 1)).multiplyScalar(rand(4, 9)), 0x5a5048, rand(0.04, 0.09));
    const s = this.scorches[this.scorchIdx++ % this.scorches.length];
    const hit = this.physics.raycast(pos.clone().setY(pos.y + 0.2), new THREE.Vector3(0, -1, 0), 4);
    s.position.set(pos.x, hit ? hit.point.y + 0.02 : 0.02, pos.z);
    s.rotation.z = Math.random() * 6;
    s.visible = true;
  }

  update(dt) {
    this.motes.update(dt, this.camPos);
    this.glow.update(dt);
    this.smoke.update(dt);
    this.flashes.update(dt);

    // tracers travel at ~600 m/s with a 4 m streak
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      if (t.t * 600 - 4 > t.dist) this.tracers.splice(i, 1);
    }
    for (const t of this.tracers) {
      const head = Math.min(t.dist, t.t * 600 + 2), tail = Math.max(0, head - 4);
      const a = this.tracerPos;
      a[n * 6] = t.from.x + t.dir.x * tail; a[n * 6 + 1] = t.from.y + t.dir.y * tail; a[n * 6 + 2] = t.from.z + t.dir.z * tail;
      a[n * 6 + 3] = t.from.x + t.dir.x * head; a[n * 6 + 4] = t.from.y + t.dir.y * head; a[n * 6 + 5] = t.from.z + t.dir.z * head;
      n++;
    }
    this.tracerGeo.setDrawRange(0, n * 2);
    this.tracerGeo.attributes.position.needsUpdate = true;

    // casings
    let k = 0;
    for (let i = this.casings.length - 1; i >= 0; i--) if ((this.casings[i].life -= dt) <= 0) this.casings.splice(i, 1);
    for (const c of this.casings) {
      c.v.y -= 14 * dt;
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < c.floor) {
        c.p.y = c.floor;
        if (Math.abs(c.v.y) > 0.8 && !c.bounced) { c.bounced = true; if (this.onCasing) this.onCasing(c.p); }
        c.v.y *= -0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.sx *= 0.5; c.sy *= 0.5;
      }
      c.rx += c.sx * dt; c.ry += c.sy * dt;
      _e.set(c.rx, c.ry, 0);
      _q.setFromEuler(_e);
      _m.compose(c.p, _q, _s.set(1, 1, 1));
      this.casingMesh.setMatrixAt(k++, _m);
    }
    this.casingMesh.count = k;
    this.casingMesh.instanceMatrix.needsUpdate = true;

    // debris
    k = 0;
    for (let i = this.debris.length - 1; i >= 0; i--) if ((this.debris[i].life -= dt) <= 0) this.debris.splice(i, 1);
    for (const d of this.debris) {
      d.v.y -= 12 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < 0.01) { d.p.y = 0.01; d.v.multiplyScalar(0.4); d.v.y = Math.abs(d.v.y) * 0.3; d.spin *= 0.5; }
      d.r.x += d.spin * dt; d.r.y += d.spin * 0.7 * dt;
      _q.setFromEuler(d.r);
      const sc = d.s * Math.min(1, d.life * 3);
      _m.compose(d.p, _q, _s.set(sc, sc, sc));
      this.debrisMesh.setMatrixAt(k, _m);
      this.debrisMesh.setColorAt(k, d.c);
      k++;
    }
    this.debrisMesh.count = k;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;

    for (const L of this.lights) {
      if (L.life > 0) {
        L.life -= dt;
        L.l.intensity = Math.max(0, L.life / L.max) * L.peak;
      } else L.l.intensity = 0;
    }
  }

  clear() {
    this.glow.list.length = 0; this.smoke.list.length = 0; this.flashes.list.length = 0;
    this.tracers.length = 0; this.casings.length = 0; this.debris.length = 0;
    this.decals.forEach(d => { d.visible = false; });
    this.scorches.forEach(s => { s.visible = false; });
  }
}
