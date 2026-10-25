// Map photos: renders each map in the engine (Ultra graphics, no HUD, no viewmodel) from fixed camera spots and
// saves them as the loading-screen / menu pictures and the map thumbnails.
//   node tools/map_photos.mjs [--url http://localhost:3000] [--maps tarsa,link] [--out assets/loading]
//                             [--plan] [--size 1600x900] [--redo '{"map":{"2":[[x,y,z],[lx,ly,lz]]}}']
// Writes <out>/<map>-<n>.jpg for every shot in SHOTS, and <out>/thumbs/<map>.jpg (the first shot, 480 x 270).
// --plan instead renders four automatic views of each map (from behind each spawn, the middle, high over a
// corner) as <out>/plan-<map>-<k>.jpg, for picking camera spots. Needs Playwright (and sharp-free: the browser
// does the JPEG encoding and the thumbnail scaling).
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://localhost:3000');
const out = arg('out', 'assets/loading');
const plan = process.argv.includes('--plan');
const [W, H] = arg('size', '1600x900').split('x').map(Number);

// [camera position, point it looks at] per shot, in world metres; the first of each map is its thumbnail
const SHOTS = {
  tarsa: [[[44, 22, 30], [0, 0, 0]], [[-52, 9, -24], [10, 1, -18]], [[30, 8, 0], [-20, 2, 0]]],
  shuran: [[[37, 22, 28], [0, 0, 0]], [[-32, 11, -16], [15, 1, -8]], [[32, 11, 16], [-15, 1, 8]]],
  pioneer: [[[40, 24, 30], [0, 0, 0]], [[-15, 7, -36], [-12, 1, 10]], [[-10, -1.7, 20], [-20, -2.2, 10]]],   // the third: down in the Underground
  mart: [[[-40, 4, -14], [-22, 3, 4]], [[8, 4.8, 18], [-12, 1, -6]], [[-16, 1.8, -3], [16, 1.5, -3]]],
  drivein: [[[39, 18, 27], [0, 0, 0]], [[-10, 3.5, -20], [44, 7, 0]], [[14, 4, 10], [-44, 7, 0]]],
  link: [[[-21, 6.7, -30], [4, 1.2, -6]], [[-99, -4.9, 12], [-99, -4.6, -30]], [[99, 6.7, -38.5], [99, 1, 5]], [[123, 1.7, 14], [95, 2.5, -30]]],
};

fs.mkdirSync(path.join(out, 'thumbs'), { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.setItem('breachpoint.settings.v2', JSON.stringify({ quality: 'ultra', gfxRes: 100, menuBg: 'live' })); } catch (_) { /* private mode */ } });
await page.goto(url + '/index.html');
await page.waitForFunction('window.__game && window.__game.world && !window.__game.warming', null, { timeout: 300000 });
await page.addStyleTag({ content: 'body > *:not(#app){display:none!important} #app > *:not(canvas){display:none!important}' });   // just the 3D view
const maps = arg('maps', null)?.split(',') || await page.evaluate(async () => (await import('/js/world.js')).MAP_IDS);

for (const map of maps) {
  const views = await page.evaluate(async (map) => {
    const g = window.__game;
    g.loadMap(map, true);
    await new Promise(r => setTimeout(r, 500));
    const w = g.world, c = (l) => l.reduce((a, p) => [a[0] + p.x / l.length, a[1] + p.z / l.length], [0, 0]);
    const [ax, az] = c(w.spawns[0]), [bx, bz] = c(w.spawns[1]), b = w.bounds || { hx: 50, hz: 40 };
    const back = (x, z, k) => [x * k, 0, z * k];
    return [
      [[...back(ax, az, 1.12).map((v, i) => (i === 1 ? 6 : v))], [0, 1, 0]],
      [[...back(bx, bz, 1.12).map((v, i) => (i === 1 ? 3 : v))], [0, 1, 0]],
      [[0, 1.7, 0], [ax, 1.5, az]],
      [[b.hx * 0.75, 24, b.hz * 0.75], [0, 0, 0]],
    ];
  }, map);
  // --redo '{"shuran":{"2":[[x,y,z],[x,y,z]]}}': re-render only these shots (1-based) with these cameras
  const redo = arg('redo', null) && JSON.parse(arg('redo'))[map];
  const list = plan ? views : SHOTS[map] || views.slice(0, 3);
  if (redo) for (const [k, v] of Object.entries(redo)) list[k - 1] = v;
  for (let k = 0; k < list.length; k++) {
    if (redo && !redo[k + 1]) continue;
    const [pos, look] = list[k];
    await page.evaluate(([pos, look]) => {
      const g = window.__game;
      g.world.menuCam = (t, cam) => { cam.position.set(...pos); cam.lookAt(...look); };
      g.menuStill = false;
      g.state = 'menu';
    }, [pos, look]);
    await page.waitForTimeout(plan ? 4000 : 9000);   // shadows, the light pool and the frame-rate scaler settle
    const name = plan ? `plan-${map}-${k + 1}.jpg` : `${map}-${k + 1}.jpg`;
    const jpg = await page.evaluate(async ([thumb]) => {
      const src = document.querySelector('#app canvas');
      const enc = (w, h, q) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h); return c.toDataURL('image/jpeg', q); };
      window.__game.renderer.render(0, false);   // (the canvas keeps its last frame only right after a render)
      return [enc(src.width, src.height, 0.84), thumb ? enc(480, 270, 0.82) : null];
    }, [!plan && k === 0]);
    fs.writeFileSync(path.join(out, name), Buffer.from(jpg[0].split(',')[1], 'base64'));
    if (jpg[1]) fs.writeFileSync(path.join(out, 'thumbs', `${map}.jpg`), Buffer.from(jpg[1].split(',')[1], 'base64'));
    console.log(map, name);
  }
}
if (errors.length) console.log('page errors', errors.slice(0, 5));
await browser.close();
