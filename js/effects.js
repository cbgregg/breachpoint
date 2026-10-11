// Visual effects: particles, tracers, bullet decals, muzzle lights, explosions
import * as THREE from 'three';

const MAX_PARTICLES = 600;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_PARTICLES);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.frustumCulled = false;
    this.inst.count = 0;
    this.inst.setColorAt(0, _c.set(0xffffff));
    scene.add(this.inst);

    this.tracers = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 48; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, this.tracerMat.clone());
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerIdx = 0;

    this.decals = [];
    const decalTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0, 'rgba(0,0,0,0.95)'); grd.addColorStop(0.45, 'rgba(20,20,20,0.7)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(c);
    })();
    const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const decalGeo = new THREE.PlaneGeometry(0.14, 0.14);
    for (let i = 0; i < 140; i++) {
      const d = new THREE.Mesh(decalGeo, decalMat);
      d.visible = false;
      scene.add(d);
      this.decals.push(d);
    }
    this.decalIdx = 0;

    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffc070, 0, 9, 2);
      scene.add(l);
      this.lights.push({ l, life: 0, max: 1 });
    }
    this.lightIdx = 0;

    this.blasts = [];
    const blastMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), blastMat.clone());
      m.visible = false;
      scene.add(m);
      this.blasts.push({ m, life: 0 });
    }
  }

  spawn(pos, vel, color, size, life, gravity = 9, drag = 1) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ p: pos.clone(), v: vel.clone(), color: new THREE.Color(color), size, life, max: life, gravity, drag });
  }

  tracer(from, to) {
    const t = this.tracers[this.tracerIdx++ % this.tracers.length];
    const arr = t.line.geometry.attributes.position.array;
    // start partway along so it reads as a streak from the muzzle
    arr[0] = from.x; arr[1] = from.y; arr[2] = from.z;
    arr[3] = to.x; arr[4] = to.y; arr[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.geometry.computeBoundingSphere();
    t.line.visible = true;
    t.life = 0.07;
    t.line.material.opacity = 0.9;
  }

  impact(point, normal, kind) {
    if (kind === 'blood') {
      for (let i = 0; i < 8; i++) {
        _p.set(normal.x + (Math.random() - 0.5) * 1.4, normal.y + Math.random() * 0.8, normal.z + (Math.random() - 0.5) * 1.4).multiplyScalar(2 + Math.random() * 2);
        this.spawn(point, _p, Math.random() < 0.5 ? 0x9c1010 : 0xd12020, 0.05 + Math.random() * 0.05, 0.35 + Math.random() * 0.3, 9);
      }
      return;
    }
    for (let i = 0; i < 6; i++) {
      _p.set(normal.x + (Math.random() - 0.5) * 1.6, normal.y + (Math.random() - 0.5) * 1.6, normal.z + (Math.random() - 0.5) * 1.6).multiplyScalar(2 + Math.random() * 4);
      this.spawn(point, _p, i < 2 ? 0xffd27a : 0x8a8a84, i < 2 ? 0.03 : 0.06, 0.25 + Math.random() * 0.35, 12);
    }
    _p.copy(normal).multiplyScalar(0.6).add({ x: 0, y: 0.3, z: 0 });
    this.spawn(point, _p, 0xb8b4aa, 0.18, 0.6, -0.5, 2);
    const d = this.decals[this.decalIdx++ % this.decals.length];
    d.position.copy(point).addScaledVector(normal, 0.012);
    d.lookAt(_p.copy(d.position).add(normal));
    d.rotation.z = Math.random() * Math.PI;
    d.visible = true;
  }

  flashLight(pos, intensity = 6, life = 0.06) {
    const L = this.lights[this.lightIdx++ % this.lights.length];
    L.l.position.copy(pos);
    L.l.intensity = intensity;
    L.life = life; L.max = life; L.peak = intensity;
  }

  muzzle(pos, dir) {
    this.flashLight(pos, 30, 0.05);
    for (let i = 0; i < 2; i++) {
      _p.copy(dir).multiplyScalar(3 + Math.random() * 3).add({ x: (Math.random() - 0.5), y: Math.random() * 0.5, z: (Math.random() - 0.5) });
      this.spawn(pos, _p, 0xffcf66, 0.05, 0.06, 0);
    }
  }

  explosion(pos) {
    const b = this.blasts.find(x => x.life <= 0) || this.blasts[0];
    b.m.position.copy(pos);
    b.m.visible = true;
    b.life = 0.45;
    this.flashLight(pos, 400, 0.35);
    for (let i = 0; i < 40; i++) {
      _p.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 12);
      this.spawn(pos, _p, Math.random() < 0.5 ? 0xffb347 : 0xff6a00, 0.08 + Math.random() * 0.1, 0.4 + Math.random() * 0.5, 14, 1.5);
    }
    for (let i = 0; i < 24; i++) {
      _p.set(Math.random() - 0.5, 0.3 + Math.random(), Math.random() - 0.5).multiplyScalar(2 + Math.random() * 3);
      this.spawn(pos, _p, Math.random() < 0.5 ? 0x4a4744 : 0x6b6662, 0.5 + Math.random() * 0.5, 1.2 + Math.random() * 1.2, -1, 2.5);
    }
  }

  update(dt) {
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
    }
    for (const pt of this.particles) {
      pt.v.y -= pt.gravity * dt;
      pt.v.multiplyScalar(Math.max(0, 1 - pt.drag * dt));
      pt.p.addScaledVector(pt.v, dt);
      if (pt.p.y < 0.02) { pt.p.y = 0.02; pt.v.y *= -0.3; pt.v.x *= 0.6; pt.v.z *= 0.6; }
      const k = pt.life / pt.max;
      const sz = pt.size * (pt.gravity < 0 ? (1.6 - k) : Math.min(1, k * 2));
      _s.set(sz, sz, sz);
      _m.compose(pt.p, _q, _s);
      this.inst.setMatrixAt(n, _m);
      this.inst.setColorAt(n, pt.color);
      n++;
    }
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;

    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const L of this.lights) {
      if (L.life > 0) {
        L.life -= dt;
        L.l.intensity = Math.max(0, L.life / L.max) * L.peak;
      } else L.l.intensity = 0;
    }
    for (const b of this.blasts) {
      if (b.life > 0) {
        b.life -= dt;
        const k = 1 - b.life / 0.45;
        const s = 0.5 + k * 4.5;
        b.m.scale.set(s, s, s);
        b.m.material.opacity = (1 - k) * 0.85;
        if (b.life <= 0) b.m.visible = false;
      }
    }
  }

  clear() {
    this.particles.length = 0;
    this.decals.forEach(d => { d.visible = false; });
    this.tracers.forEach(t => { t.life = 0; t.line.visible = false; });
  }
}
