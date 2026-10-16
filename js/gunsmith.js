// Gunsmith preview: a small separate renderer that shows the selected weapon with its attachments,
// lit by a studio environment and slowly turning. Only runs while the canvas is on screen.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildGun } from './weapons.js';

export class GunPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = null;
    this.key = '';
    this.raf = 0;
    this.t = 0;
  }

  init() {
    if (this.r) return true;
    try {
      this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (_) { return false; }
    const r = this.r;
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
    key.position.set(2, 3, 2);
    const rim = new THREE.DirectionalLight(0xbcd4ff, 1.4);
    rim.position.set(-2, 1, -3);
    this.scene.add(key, rim);
    this.camera = new THREE.PerspectiveCamera(22, 640 / 240, 0.05, 20);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    return true;
  }

  show(id, att) {
    if (!this.init()) return;
    const key = id + JSON.stringify(att);
    if (key !== this.key) {
      this.key = key;
      this.pivot.clear();
      const gun = buildGun(id, { att });
      const box = new THREE.Box3().setFromObject(gun.group);
      const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      gun.group.position.sub(c);
      this.pivot.add(gun.group);
      const len = Math.max(size.z, size.y * 2.4, 0.25);
      this.len = len;
    }
    this.resize();
    this.start();
  }

  resize() {
    const w = this.canvas.clientWidth || 640, h = this.canvas.clientHeight || 240;
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h;
    this.r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.raf) return;
    let last = performance.now();
    const loop = (now) => {
      this.raf = 0;
      if (!this.canvas.offsetParent) return; // hidden: stop until shown again
      this.t += Math.min(0.05, (now - last) / 1000);
      last = now;
      this.resize();
      // side profile, gently turning to show both the optic and the muzzle
      const yaw = -Math.PI / 2 + 0.38 + Math.sin(this.t * 0.45) * 0.32;
      this.pivot.rotation.set(0, yaw, 0);
      const tv = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
      const d = Math.max((this.len || 0.8) / 2 / (tv * this.camera.aspect), (this.len || 0.8) * 0.2 / tv) * 1.12;
      this.camera.position.set(0, d * 0.16, d);
      this.camera.lookAt(0, 0, 0);
      this.r.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
}
