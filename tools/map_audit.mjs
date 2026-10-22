#!/usr/bin/env node
// Audit every map headless (see js/audit.js): what's see-through, flickering, an invisible wall, walk-through
// scenery, a clipping or floating prop, or a spawn / pickup / bomb site in the wrong place.
//
//   npx serve .                                  (or any static server on the repo)
//   node tools/map_audit.mjs [--url http://localhost:3000] [--maps tarsa,pioneer] [--out audit]
//                            [--shots N] [--local-modules path/to/node_modules]
//
// Writes <out>/report.json (every issue) and <out>/report.md (counts and the first issues of each kind per map),
// and with --shots N, N screenshots of each kind of issue per map (taken from where a player would see it).
// --local-modules serves three and three-mesh-bvh from a local node_modules instead of the CDN (offline).
// Needs Playwright (npm i -D playwright) with a Chromium.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://localhost:3000');
const out = arg('out', 'audit');
const shots = +arg('shots', 0);
const local = arg('local-modules', null);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
if (local) {
  for (const [pkg, re] of [['three', /cdn\.jsdelivr\.net\/npm\/three@[^/]+\//], ['three-mesh-bvh', /cdn\.jsdelivr\.net\/npm\/three-mesh-bvh@[^/]+\//]]) {
    await page.route(re, (r) => {
      const rel = r.request().url().split(/@[^/]+\//)[1].split('?')[0];
      r.fulfill({ path: path.resolve(local, pkg, rel), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
    });
  }
}
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// low graphics: the audit reads geometry, not pixels
await page.addInitScript(() => { try { localStorage.setItem('breachpoint.settings.v2', JSON.stringify({ quality: 'low', gfxPath: 'fast', gfxRes: 50 })); } catch (_) { /* private mode */ } });
await page.goto(url + '/index.html');
await page.waitForFunction('window.__game && window.__game.world', null, { timeout: 300000 });
await page.addStyleTag({ content: 'body > *:not(#app){display:none!important} #app > *:not(canvas){display:none!important}' });   // just the 3D view
const maps = arg('maps', null)?.split(',') || await page.evaluate(async () => (await import('/js/world.js')).MAP_IDS);

const all = [];
for (const map of maps) {
  process.stdout.write(`${map}: `);
  const r = await page.evaluate(async (map) => {
    const g = window.__game;
    g.loadMap(map, true);
    const { auditMap, showAudit } = await import('/js/audit.js');
    const res = await auditMap(g);
    showAudit(g, res);
    return res;
  }, map);
  console.log(JSON.stringify(r.counts), `(${r.stats.views} viewpoints, ${r.stats.rays} rays, ${r.stats.faces} box faces, ${r.stats.seconds} s)`);
  all.push(r);
  if (shots) {
    const byType = {};
    for (const i of r.issues) (byType[i.type] = byType[i.type] || []).push(i);
    for (const [type, list] of Object.entries(byType)) {
      for (let k = 0; k < Math.min(shots, list.length); k++) {
        const i = list[Math.floor(k * list.length / Math.min(shots, list.length))];
        // look at it from where it was seen (or from 3 m away, at eye height)
        const from = i.from || [i.at[0] + 2.2, i.at[1] + 1.2, i.at[2] + 2.2];
        await page.evaluate(async ([f, t, issue]) => {
          const g = window.__game, { showAudit } = await import('/js/audit.js');
          showAudit(g, { issues: [issue] });   // only this one marked
          g.menuCamera = function () { this.camera.position.set(...f); this.camera.lookAt(...t); };
        }, [from, i.at, i]);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(out, `${map}-${type}-${k}.png`) });
      }
    }
  }
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(all, null, 1));
let md = '# Map audit\n\n| map | ' + Object.keys(Object.assign({}, ...all.map(r => r.counts))).join(' | ') + ' |\n';
const types = Object.keys(Object.assign({}, ...all.map(r => r.counts)));
md += '|' + ' --- |'.repeat(types.length + 1) + '\n';
for (const r of all) md += `| ${r.map} | ${types.map(t => r.counts[t] || 0).join(' | ')} |\n`;
for (const r of all) {
  md += `\n## ${r.map}\n`;
  const byType = {};
  for (const i of r.issues) (byType[i.type] = byType[i.type] || []).push(i);
  for (const [type, list] of Object.entries(byType)) {
    md += `\n**${type}** (${list.length})\n\n`;
    // grouped by what they're on: the worst offenders first
    const byWhat = {};
    for (const i of list) (byWhat[i.what] = byWhat[i.what] || []).push(i);
    for (const [what, l] of Object.entries(byWhat).sort((a, b) => b[1].length - a[1].length).slice(0, 15)) md += `- ${what}: ${l.length} × e.g. at ${l[0].at.join(', ')}${l[0].into ? ' into ' + l[0].into : ''}${l[0].problem ? ' (' + l[0].problem + ')' : ''}\n`;
  }
}
fs.writeFileSync(path.join(out, 'report.md'), md);
if (errors.length) console.log('page errors:', errors.slice(0, 5));
console.log(`report: ${path.join(out, 'report.md')}`);
await browser.close();
