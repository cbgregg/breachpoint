// Rendering pipeline: physical sky + image-based lighting, shadows, and post-processing
// (ground-truth AO, bloom, filmic tone mapping, color grade, chromatic aberration, grain, SMAA).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { QUALITY, qualityFrom, wantsMsaa } from './config.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.26 },
    grain: { value: 0.03 },
    ca: { value: 0.0011 },
    damage: { value: 0 },
    flash: { value: 0 },
    saturation: { value: 1.0 },
    contrast: { value: 1.08 },
    lift: { value: new THREE.Vector3(0.006, 0.008, 0.016) }, // a touch of cool sky in the shadows
    gain: { value: new THREE.Vector3(1.04, 1.0, 0.95) },     // warm, sunlit highlights
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, vignette, grain, ca, damage, flash, saturation, contrast;
    uniform vec3 lift, gain;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * ca * (1.0 + r2 * 6.0) * (1.0 + damage * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      col = col * gain + lift * (1.0 - col);
      // cool shadows, warm highlights
      col += vec3(-0.012, 0.0, 0.02) * (1.0 - smoothstep(0.0, 0.45, l)) + vec3(0.02, 0.008, -0.015) * smoothstep(0.55, 1.0, l);
      col *= 1.0 - vignette * smoothstep(0.12, 0.9, r2 * 2.4);
      float dl = dot(col, vec3(0.333));
      col = mix(col, vec3(dl), damage * 0.55);
      col = mix(col, vec3(0.38, 0.02, 0.02), damage * smoothstep(0.08, 0.55, r2 * 2.6) * 0.9);
      col = mix(col, vec3(1.0), flash);
      col += (rand(vUv * vec2(1931.0, 1087.0) + fract(time) * 97.0) - 0.5) * grain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

// late afternoon: a warm, strong sun about 32° up, long crisp shadows and a clear sky
export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 32), THREE.MathUtils.degToRad(222));

// Height fog: distance haze plus a dense layer that hugs the ground and thins with altitude,
// glowing warm when looking towards the sun. Patched into three's fog chunks so every lit
// material, particle and sprite gets it for free.
const fv = (v) => v.toFixed(4);
const _sd = SUN_DIR.clone().normalize();
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  {
    vec3 fRay = vFogWorld - cameraPosition;
    float fDist = length(fRay);
    vec3 fDir = fRay / max(fDist, 1e-4);
    #ifdef FOG_EXP2
      float fHaze = 1.0 - exp(-fogDensity * fogDensity * fDist * fDist);
    #else
      float fHaze = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    const float FB = 0.32;      // ground layer falloff per metre of height
    float FG = fogDensity * 1.03;  // ground layer density at y = 0 (follows the map's haze)
    float h0 = max(cameraPosition.y, 0.0), dy = fRay.y;
    float integ = abs(dy) > 0.02 ? (exp(-FB * h0) - exp(-FB * (h0 + dy))) / (FB * dy) : exp(-FB * h0);
    float fGround = 1.0 - exp(-FG * fDist * max(integ, 0.0));
    float fogFactor = clamp(fHaze + fGround * (1.0 - fHaze), 0.0, 0.92);
    float fSun = pow(max(dot(fDir, vec3(${fv(_sd.x)}, ${fv(_sd.y)}, ${fv(_sd.z)})), 0.0), 5.0);
    vec3 fCol = mix(fogColor, fogColor * vec3(1.15, 1.06, 0.92), fSun);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fCol, fogFactor);
  }
#endif`;

export class Renderer {
  constructor(container, scene, camera, vmScene, vmCamera) {
    this.scene = scene; this.camera = camera; this.vmScene = vmScene; this.vmCamera = vmCamera;
    // MSAA only for the fast path (it draws to the canvas); the post-processing path anti-aliases with SMAA
    this.msaa = wantsMsaa();
    const r = new THREE.WebGLRenderer({ antialias: this.msaa, powerPreference: 'high-performance', stencil: false });
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    this.renderer = r;
    this.time = 0;
    this.buildAtmosphere();

    const w = window.innerWidth, h = window.innerHeight;
    this.composer = new EffectComposer(r);
    this.worldPass = new RenderPass(scene, camera);
    this.aoPass = new GTAOPass(scene, camera, w, h);
    this.aoPass.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 8 });
    this.aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
    this.aoPass.blendIntensity = 0.9;
    this.vmPass = new RenderPass(vmScene, vmCamera);
    this.vmPass.clear = false;
    this.vmPass.clearDepth = true;
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.38, 0.55, 1.15);
    // bloom is a soft glow: computing it at half resolution looks the same and costs a quarter of the fill
    const bloomSize = this.bloomPass.setSize.bind(this.bloomPass);
    this.bloomPass.setSize = (bw, bh) => bloomSize(Math.max(1, Math.round(bw / 2)), Math.max(1, Math.round(bh / 2)));
    this.outputPass = new OutputPass();
    this.gradePass = new ShaderPass(GradeShader);
    this.smaaPass = new SMAAPass(w, h);
    [this.worldPass, this.aoPass, this.vmPass, this.bloomPass, this.outputPass, this.gradePass, this.smaaPass].forEach(p => this.composer.addPass(p));
    this.grade = this.gradePass.uniforms;
    this.applyQuality(qualityFrom({ quality: 'high' }));
  }

  buildAtmosphere() {
    const scene = this.scene;
    const sky = new Sky();
    sky.scale.setScalar(450);
    const u = sky.material.uniforms;
    u.turbidity.value = 5;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(SUN_DIR);
    scene.add(sky);
    this.sky = sky;

    this.makeEnv(0x8a7458);

    scene.fog = new THREE.FogExp2(0xa9b6c2, 0.0034); // light afternoon haze

    const sun = new THREE.DirectionalLight(0xffe8c8, 3.4);
    sun.position.copy(SUN_DIR).multiplyScalar(80);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = -52; sc.right = 52; sc.top = 52; sc.bottom = -52; sc.near = 10; sc.far = 200;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    // faint sky fill so shadowed faces keep detail (env map does most of the work)
    this.hemi = new THREE.HemisphereLight(0xb8cff0, 0x8a7458, 0.75); // blue sky above, warm sunlit bounce below
    scene.add(this.hemi);
    scene.environmentIntensity = 0.6;
    // fair-weather cumulus far overhead (shown on maps with a clear look)
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const g = c.getContext('2d');
    let seed = 7; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 26; i++) {
      const cx = rr() * 1024, cy = rr() * 1024, n = 10 + (rr() * 14 | 0), sz = 40 + rr() * 70;
      for (let k = 0; k < n; k++) {
        const x = cx + (rr() - 0.5) * sz * 3.2, y = cy + (rr() - 0.5) * sz * 1.1, r = sz * (0.45 + rr() * 0.7);
        for (const [ox, oy] of [[0, 0], [1024, 0], [-1024, 0], [0, 1024], [0, -1024]]) {
          const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.6, 'rgba(250,250,252,0.25)'); grd.addColorStop(1, 'rgba(240,244,250,0)');
          g.fillStyle = grd; g.beginPath(); g.arc(x + ox, y + oy, r, 0, 6.283); g.fill();
        }
      }
    }
    const ct = new THREE.CanvasTexture(c); ct.colorSpace = THREE.SRGBColorSpace; ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(2, 2);
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: 0.95 }));
    this.clouds.rotation.x = Math.PI / 2; this.clouds.position.y = 170; this.clouds.visible = false; this.clouds.renderOrder = -1;
    scene.add(this.clouds);
    // a plain, deep-blue sky dome for clear-day maps (the physical sky reads milky at this sun height)
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x2f6fc4) }, mid: { value: new THREE.Color(0x7fb0e2) }, bottom: { value: new THREE.Color(0xd4e3ef) }, sunDir: { value: SUN_DIR.clone().normalize() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }',
      fragmentShader: `uniform vec3 top, mid, bottom, sunDir; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, -0.1, 1.0);
          vec3 c = mix(bottom, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));
          float s = max(dot(normalize(vDir), sunDir), 0.0); c += vec3(1.0, 0.95, 0.85) * (pow(s, 600.0) * 18.0 + pow(s, 12.0) * 0.25);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.domeMat);
    this.dome.visible = false; this.dome.renderOrder = -2;
    scene.add(this.dome);
  }

  makeEnv(groundCol) {
    // image-based lighting from the same sky
    const u = this.sky.material.uniforms;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(100);
    Object.keys(u).forEach(k => { envSky.material.uniforms[k].value = u[k].value; });
    if (this.dome && this.dome.visible) envScene.add(new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), this.domeMat)); else envScene.add(envSky);
    // ground bounce in the environment
    const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 32), new THREE.MeshBasicMaterial({ color: groundCol }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    envScene.add(ground);
    if (this.scene.environment) this.scene.environment.dispose();
    this.scene.environment = pmrem.fromScene(envScene, 0.03).texture;
    pmrem.dispose();
  }

  // per-map light and weather: the default is the dusty late-afternoon haze; maps can ask for a clear, blue day
  setLook(look = {}) {
    const L = { turbidity: 5, rayleigh: 1.4, mie: 0.005, fog: 0.0034, fogColor: 0xa9b6c2, sun: 3.4, sunColor: 0xffe8c8, hemi: 0.75, hemiSky: 0xb8cff0, ground: 0x8a7458, exposure: 0.92, env: 0.6, clouds: false, blueSky: false, ...look };
    const key = JSON.stringify(L);
    if (key === this.lookKey) return;
    this.lookKey = key;
    const u = this.sky.material.uniforms;
    u.turbidity.value = L.turbidity; u.rayleigh.value = L.rayleigh; u.mieCoefficient.value = L.mie;
    // the dome: blue for clear-day maps, or a map's own gradient (look.dome: [top, mid, bottom])
    const du = this.domeMat.uniforms, dc = L.dome || [0x2f6fc4, 0x7fb0e2, 0xd4e3ef];
    du.top.value.set(dc[0]); du.mid.value.set(dc[1]); du.bottom.value.set(dc[2]);
    du.sunDir.value.copy(L.sunElev != null ? new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - L.sunElev), THREE.MathUtils.degToRad(L.sunAz ?? 222)) : SUN_DIR);
    this.dome.visible = !!(L.blueSky || L.dome); this.sky.visible = !this.dome.visible;
    this.makeEnv(L.ground);
    this.scene.fog.density = L.fog; this.scene.fog.color.set(L.fogColor);
    // maps can move the sun (a low dusk sun); the default is SUN_DIR
    const sd = L.sunElev != null ? new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - L.sunElev), THREE.MathUtils.degToRad(L.sunAz ?? 222)) : SUN_DIR;
    u.sunPosition.value.copy(sd);
    this.sun.position.copy(sd).multiplyScalar(Math.max(80, this.sun.position.length()));   // keep the distance fitShadows chose
    this.sun.intensity = L.sun; this.sun.color.set(L.sunColor);
    this.hemi.intensity = L.hemi; this.hemi.color.set(L.hemiSky); this.hemi.groundColor.set(L.ground);
    this.renderer.toneMappingExposure = L.exposure;
    this.scene.environmentIntensity = L.env;
    this.clouds.visible = !!L.clouds;
  }

  // q: a resolved quality (qualityFrom in config.js): a preset or the player's custom settings
  applyQuality(q) {
    if (typeof q === 'string') q = qualityFrom({ quality: q });
    this.quality = q;
    this.basePR = q.pr;
    this.drs = { scale: 1, slow: 0, fast: 0, ema: 1 / 60, last: 0, ceil: 1, grace: 3 };
    this.applyPR();
    this.renderer.shadowMap.enabled = q.shadows > 0;
    this.renderer.shadowMap.type = q.softShadows === false ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if (q.shadows > 0 && this.sun.shadow.mapSize.x !== q.shadows) {
      this.sun.shadow.mapSize.set(q.shadows, q.shadows);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.scene.traverse(o => {
      if (o.isPointLight && o.userData.mapLight) o.visible = q.lights;
      if (o.userData.lampLight) o.visible = q.lights;
    });
    this.applyAniso();
    this.scene.traverse(o => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => { x.needsUpdate = true; }); } });
    this.aoPass.enabled = q.ao && !q.fast;
    this.bloomPass.enabled = q.bloom && !q.fast;
    this.smaaPass.enabled = q.aa && !q.fast;
    this.setSize();
  }

  // texture filtering: anisotropy on every texture in the scene (sharper floors and walls at a glancing angle)
  applyAniso() {
    const a = Math.max(1, Math.min(this.renderer.capabilities.getMaxAnisotropy(), (this.quality && this.quality.aniso) || 8));
    const KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap'];
    this.scene.traverse(o => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const k of KEYS) {
        const t = m[k]; if (t && t.isTexture && t.anisotropy !== a) { t.anisotropy = a; t.needsUpdate = true; }
      }
    });
  }

  // dynamic resolution: when frames run long the render resolution drops in steps (down to 55%), and
  // climbs back when there's headroom. A level that keeps failing becomes the ceiling, so it doesn't
  // bounce up and down.
  applyPR() {
    let base = this.basePR;
    // pixel budget (Mobile): a 3x phone screen would otherwise render 9x the pixels of a 1x one
    const mp = this.quality && this.quality.maxPixels;
    if (mp) base = Math.min(base, Math.max(0.6, Math.sqrt(mp / Math.max(1, window.innerWidth * window.innerHeight))));
    const pr = Math.max(0.5, base * (this.dynamic === false ? 1 : this.drs.scale));
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
  }
  resetDRS() { const d = this.drs; d.grace = 3; d.slow = d.fast = 0; d.ema = 1 / 60; d.last = 0; }
  updateDRS() {
    const d = this.drs, now = performance.now();
    const ft = d.last ? Math.min(0.2, (now - d.last) / 1000) : 1 / 60;
    d.last = now;
    if (this.dynamic === false || document.hidden) return;
    if (d.grace > 0) { d.grace -= ft; return; }              // shader compiles right after a load don't count
    d.ema += (ft - d.ema) * 0.08;
    if (d.ema > 1 / 48) { d.slow += ft; d.fast = 0; } else if (d.ema < 1 / 58) { d.fast += ft; d.slow = 0; } else { d.slow = Math.max(0, d.slow - ft); d.fast = 0; }
    if (d.slow > 1.2 && d.scale > 0.55) {
      d.ceil = Math.min(d.ceil, d.scale);                       // this level was too heavy
      d.scale = Math.max(0.55, +(d.scale - 0.1).toFixed(2));
      d.slow = 0; d.ema = 1 / 55; this.applyPR(); this.setSize();
    } else if (d.fast > 8 && d.scale < d.ceil - 0.05) {
      d.scale = Math.min(d.ceil - 0.05, +(d.scale + 0.1).toFixed(2));
      d.fast = 0; this.applyPR(); this.setSize();
    } else if (d.fast > 30 && d.ceil < 1) { d.ceil = Math.min(1, d.ceil + 0.1); d.fast = 0; } // conditions improved: allow a step up again
  }

  setSize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (this.quality && this.quality.maxPixels) this.applyPR();   // the pixel budget depends on the window size
    this.renderer.setSize(w, h);
    // the fast path never uses the composer: don't keep its full-size float targets around
    if (this.quality && this.quality.fast) this.composer.setSize(2, 2); else this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix();
  }

  render(dt, showViewmodel) {
    this.updateDRS();
    // the sun's shadow map is the single biggest pass: below Ultra it refreshes every other frame
    const sm = this.renderer.shadowMap;
    if (sm.enabled) {
      const every = (this.quality && this.quality.shadowEvery) || 2;
      sm.autoUpdate = false;
      this.shadowTick = ((this.shadowTick || 0) + 1) % every;
      if (this.shadowTick === 0) sm.needsUpdate = true;
    }
    this.time += dt;
    this.grade.time.value = this.time;
    if (this.quality && this.quality.fast) { this.renderFast(showViewmodel); return; }
    if (this.fx) this.fx.style.display = 'none';
    this.vmPass.enabled = showViewmodel;
    this.composer.render(dt);
  }

  // Fast path: world, then the viewmodel over a cleared depth buffer, straight to the canvas (tone mapping
  // and sRGB happen in the material shaders; MSAA comes from the canvas). No float render targets or
  // full-screen passes, which is where mobile GPUs spend their bandwidth. The colour grade's damage and
  // flash effects become a CSS overlay.
  renderFast(showViewmodel) {
    const r = this.renderer;
    r.setRenderTarget(null);
    r.autoClear = true;
    r.render(this.scene, this.camera);
    if (showViewmodel) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
      r.autoClear = true;
    }
    if (!this.fx) {
      this.fx = document.createElement('div');
      this.fx.className = 'fast-fx';
      this.fx.innerHTML = '<i class="fx-dmg"></i><i class="fx-flash"></i>';
      r.domElement.parentNode.appendChild(this.fx);
      this.fxDmg = this.fx.children[0]; this.fxFlash = this.fx.children[1];
    }
    this.fx.style.display = '';
    const d = this.grade.damage.value, f = this.grade.flash.value;
    if (d !== this.fxD) { this.fxD = d; this.fxDmg.style.opacity = Math.min(1, d).toFixed(3); }
    if (f !== this.fxF) { this.fxF = f; this.fxFlash.style.opacity = Math.min(1, f).toFixed(3); }
  }
}
