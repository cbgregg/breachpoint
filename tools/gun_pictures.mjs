#!/usr/bin/env node
// Weapon pictures for Create a Class: every weapon, stock build, side-on on a transparent background, rendered in
// the game's own engine and saved as assets/ui/guns/<id>.webp. Re-run after changing a gun model.
//
//   npx http-server -p 8124 -s .            (or any static server on the repo)
//   node tools/gun_pictures.mjs [--url http://127.0.0.1:8124]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const argv = process.argv.slice(2), ui = argv.indexOf('--url');
const URL0 = (ui >= 0 ? argv[ui + 1] : 'http://127.0.0.1:8124').replace(/\/$/, '');
const OUT = new URL('../assets/ui/guns/', import.meta.url).pathname;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(URL0 + '/index.html');
await p.waitForFunction('window.__game && !window.__game.warming', null, { timeout: 300000 });
const out = await p.evaluate(async () => {
  const THREE = await import('three');
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
  const { buildGun } = await import('/js/weapons.js');
  const { PRIMARIES, SECONDARIES } = await import('/js/config.js');
  const { cleanAtt } = await import('/js/attachments.js');
  const W = 1200, H = 480;
  const cv = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(W, H, false); r.setPixelRatio(1);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1; r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const k = new THREE.DirectionalLight(0xfff0dc, 2.6); k.position.set(1.5, 3, 2.5);
  const rim = new THREE.DirectionalLight(0xbcd4ff, 1.6); rim.position.set(-2, 1.5, -3);
  scene.add(k, rim);
  const cam = new THREE.PerspectiveCamera(18, W / H, 0.05, 20);
  const res = {};
  for (const id of [...PRIMARIES, ...SECONDARIES]) {
    const gun = buildGun(id, { att: cleanAtt(id, {}), detail: 2 });
    const g = new THREE.Group(); g.add(gun.group);
    g.rotation.y = -Math.PI / 2 + 0.1; g.rotation.x = 0.02;
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    g.position.sub(c);
    scene.add(g);
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const d = Math.max(s.x / 2 / (tv * cam.aspect), s.y / 2 / tv) * 1.06 + s.z / 2;
    cam.position.set(0, d * 0.07, d); cam.lookAt(0, 0, 0);
    r.render(scene, cam);
    res[id] = cv.toDataURL('image/webp', 0.9);
    scene.remove(g);
  }
  return res;
});
for (const [id, url] of Object.entries(out)) { fs.writeFileSync(OUT + id + '.webp', Buffer.from(url.split(',')[1], 'base64')); }
console.log(Object.keys(out).length, 'guns', 'errors', JSON.stringify(errs));
await b.close();
