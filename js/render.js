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
import { QUALITY } from './config.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.38 },
    grain: { value: 0.03 },
    ca: { value: 0.0011 },
    damage: { value: 0 },
    flash: { value: 0 },
    saturation: { value: 1.0 },
    contrast: { value: 1.06 },
    lift: { value: new THREE.Vector3(0.018, 0.016, 0.04) },  // blue-violet dusk in the shadows
    gain: { value: new THREE.Vector3(1.08, 0.97, 0.88) },    // warm highlights
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

// dusk: the sun just above the horizon (5°), red-orange and weak; the street lamps carry the scene
export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 5), THREE.MathUtils.degToRad(222));

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
    const float FG = 0.0085;    // ground layer density at y = 0
    float h0 = max(cameraPosition.y, 0.0), dy = fRay.y;
    float integ = abs(dy) > 0.02 ? (exp(-FB * h0) - exp(-FB * (h0 + dy))) / (FB * dy) : exp(-FB * h0);
    float fGround = 1.0 - exp(-FG * fDist * max(integ, 0.0));
    float fogFactor = clamp(fHaze + fGround * (1.0 - fHaze), 0.0, 0.92);
    float fSun = pow(max(dot(fDir, vec3(${fv(_sd.x)}, ${fv(_sd.y)}, ${fv(_sd.z)})), 0.0), 5.0);
    vec3 fCol = mix(fogColor, fogColor * vec3(1.9, 1.05, 0.55), fSun);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fCol, fogFactor);
  }
#endif`;

export class Renderer {
  constructor(container, scene, camera, vmScene, vmCamera) {
    this.scene = scene; this.camera = camera; this.vmScene = vmScene; this.vmCamera = vmCamera;
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.9;
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
    this.outputPass = new OutputPass();
    this.gradePass = new ShaderPass(GradeShader);
    this.smaaPass = new SMAAPass(w, h);
    [this.worldPass, this.aoPass, this.vmPass, this.bloomPass, this.outputPass, this.gradePass, this.smaaPass].forEach(p => this.composer.addPass(p));
    this.grade = this.gradePass.uniforms;
    this.applyQuality('high');
  }

  buildAtmosphere() {
    const scene = this.scene;
    const sky = new Sky();
    sky.scale.setScalar(450);
    const u = sky.material.uniforms;
    u.turbidity.value = 12;
    u.rayleigh.value = 3.2;
    u.mieCoefficient.value = 0.012;
    u.mieDirectionalG.value = 0.93;
    u.sunPosition.value.copy(SUN_DIR);
    scene.add(sky);
    this.sky = sky;

    // image-based lighting from the same sky
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(100);
    Object.keys(u).forEach(k => { envSky.material.uniforms[k].value = u[k].value; });
    envScene.add(envSky);
    // warm ground bounce in the environment
    const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 32), new THREE.MeshBasicMaterial({ color: 0x5e4030 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    envScene.add(ground);
    scene.environment = pmrem.fromScene(envScene, 0.03).texture;
    scene.environmentIntensity = 1;
    pmrem.dispose();

    scene.fog = new THREE.FogExp2(0x7d6a72, 0.0066);

    const sun = new THREE.DirectionalLight(0xff7a42, 2.6);
    sun.position.copy(SUN_DIR).multiplyScalar(80);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = -52; sc.right = 52; sc.top = 52; sc.bottom = -52; sc.near = 10; sc.far = 200;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.04; // grazing evening light needs a little more bias
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    // faint sky fill so shadowed faces keep detail (env map does most of the work)
    scene.add(new THREE.HemisphereLight(0x6f7fb8, 0x3a2a26, 0.45)); // blue dusk sky above, dim warm bounce below
    scene.environmentIntensity = 0.6;
  }

  applyQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    this.quality = q;
    // phones: never render below 1.25× CSS pixels, or distant players blur into the background
    const touch = window.matchMedia('(pointer: coarse)').matches;
    this.basePR = Math.min(window.devicePixelRatio || 1, touch ? Math.max(1.25, q.pixelRatio) : q.pixelRatio);
    this.drs = { scale: 1, slow: 0, fast: 0, ema: 1 / 60, last: 0, ceil: 1, grace: 3 };
    this.applyPR();
    this.renderer.shadowMap.enabled = q.shadows > 0;
    this.renderer.shadowMap.type = q.softShadows === false ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if (q.shadows > 0 && this.sun.shadow.mapSize.x !== q.shadows) {
      this.sun.shadow.mapSize.set(q.shadows, q.shadows);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.scene.traverse(o => {
      if (o.isPointLight && o.userData.mapLight) o.visible = q.label !== 'Low';
      if (o.userData.lampLight) o.visible = q.label !== 'Low';
    });
    this.scene.traverse(o => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => { x.needsUpdate = true; }); } });
    this.aoPass.enabled = q.ao;
    this.bloomPass.enabled = q.bloom;
    this.smaaPass.enabled = q.aa;
    this.setSize();
  }

  // dynamic resolution: when frames run long the render resolution drops in steps (down to 55%), and
  // climbs back when there's headroom. A level that keeps failing becomes the ceiling, so it doesn't
  // bounce up and down.
  applyPR() {
    const pr = Math.max(0.5, this.basePR * (this.dynamic === false ? 1 : this.drs.scale));
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
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix();
  }

  render(dt, showViewmodel) {
    this.updateDRS();
    // the sun's shadow map is the single biggest pass: below Ultra it refreshes every other frame
    const sm = this.renderer.shadowMap;
    if (sm.enabled) {
      const every = this.quality && this.quality.label === 'Ultra' ? 1 : 2;
      sm.autoUpdate = false;
      this.shadowTick = ((this.shadowTick || 0) + 1) % every;
      if (this.shadowTick === 0) sm.needsUpdate = true;
    }
    this.time += dt;
    this.grade.time.value = this.time;
    this.vmPass.enabled = showViewmodel;
    this.composer.render(dt);
  }
}
