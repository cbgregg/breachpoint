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
    saturation: { value: 0.86 },
    contrast: { value: 1.1 },
    lift: { value: new THREE.Vector3(0.012, 0.016, 0.02) },
    gain: { value: new THREE.Vector3(1.04, 1.0, 0.93) },
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

export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 24), THREE.MathUtils.degToRad(215));

export class Renderer {
  constructor(container, scene, camera, vmScene, vmCamera) {
    this.scene = scene; this.camera = camera; this.vmScene = vmScene; this.vmCamera = vmCamera;
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.62;
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
    this.aoPass.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
    this.aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
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
    u.turbidity.value = 7.5;
    u.rayleigh.value = 1.1;
    u.mieCoefficient.value = 0.0065;
    u.mieDirectionalG.value = 0.86;
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
    const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 32), new THREE.MeshBasicMaterial({ color: 0x6b5d48 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    envScene.add(ground);
    scene.environment = pmrem.fromScene(envScene, 0.03).texture;
    scene.environmentIntensity = 1;
    pmrem.dispose();

    scene.fog = new THREE.FogExp2(0xb8b0a0, 0.0075);

    const sun = new THREE.DirectionalLight(0xffe2bd, 3.4);
    sun.position.copy(SUN_DIR).multiplyScalar(80);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = -52; sc.right = 52; sc.top = 52; sc.bottom = -52; sc.near = 10; sc.far = 200;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.025;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    // faint sky fill so shadowed faces keep detail (env map does most of the work)
    scene.add(new THREE.HemisphereLight(0xbcd0e8, 0x5b4c3a, 0.2));
    scene.environmentIntensity = 0.85;
  }

  applyQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    this.quality = q;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = q.shadows > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (q.shadows > 0 && this.sun.shadow.mapSize.x !== q.shadows) {
      this.sun.shadow.mapSize.set(q.shadows, q.shadows);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.scene.traverse(o => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => { x.needsUpdate = true; }); } });
    this.aoPass.enabled = q.ao;
    this.bloomPass.enabled = q.bloom;
    this.smaaPass.enabled = q.aa;
    this.setSize();
  }

  setSize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix();
  }

  render(dt, showViewmodel) {
    this.time += dt;
    this.grade.time.value = this.time;
    this.vmPass.enabled = showViewmodel;
    this.composer.render(dt);
  }
}
