// Reticle customization: a shape and a colour for every sight. Optic reticles are drawn into a canvas
// texture shared by every gun that carries that optic, so a change shows up live on all of them.
// The sniper scope reticle is the full-screen overlay, drawn as SVG.
import * as THREE from 'three';

export const RET_COLORS = {
  red: ['Red', '#ff3a2a'], green: ['Green', '#3dff6a'], amber: ['Amber', '#ffb020'], cyan: ['Cyan', '#38e8ff'],
  magenta: ['Magenta', '#ff3ad8'], white: ['White', '#f4f4f4'], yellow: ['Yellow', '#f4ff3a'], blue: ['Blue', '#4a7dff'],
};
export const RET_SHAPES = {
  dot: 'Dot', ringdot: 'Ring & Dot', chevron: 'Chevron', cross: 'Crosshair', circlecross: 'Circle Cross', triangle: 'Delta',
  horseshoe: 'Horseshoe', brackets: 'Brackets', diamond: 'Diamond', tpost: 'T-Post', microdot: 'Micro Dot', bigring: 'Wide Ring',
};
export const SCOPE_SHAPES = { duplex: 'Duplex', fine: 'Fine Crosshair', mildot: 'Mil-Dot', german: 'German Post', dotonly: 'Dot & Thin Lines', chevron: 'Chevron' };
export const IRON_SHAPES = { none: 'Plain Post', dot: 'Tritium Dot', ring: 'Tritium Ring' };
export const RET_OPTICS = { reflex: 'Reflex Sight', holo: 'Holographic', acog: '4× Prism Scope', scope: '8× Sniper Scope', iron: 'Iron Sights' };
export const shapesFor = (optic) => optic === 'scope' ? SCOPE_SHAPES : optic === 'iron' ? IRON_SHAPES : RET_SHAPES;
export const DEFAULT_RETICLES = {
  reflex: { shape: 'dot', color: 'red' }, holo: { shape: 'ringdot', color: 'red' }, acog: { shape: 'chevron', color: 'red' },
  scope: { shape: 'duplex', color: 'red' }, iron: { shape: 'none', color: 'green' },
};
export function cleanReticles(r) {
  const out = {};
  for (const o in DEFAULT_RETICLES) {
    const v = (r && r[o]) || {};
    out[o] = { shape: shapesFor(o)[v.shape] ? v.shape : DEFAULT_RETICLES[o].shape, color: RET_COLORS[v.color] ? v.color : DEFAULT_RETICLES[o].color };
  }
  return out;
}
let cfg = cleanReticles(null);

// draw a shape in a square context; units: 1 = half the canvas, y up
export function drawShape(ctx, shape, size, color = '#fff', glow = 0) {
  const h = size / 2, u = (v) => v * h;
  ctx.save();
  ctx.translate(h, h); ctx.scale(1, -1);
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  const lw = (w) => { ctx.lineWidth = u(w); };
  const dot = (r, x = 0, y = 0) => { ctx.beginPath(); ctx.arc(u(x), u(y), u(r), 0, Math.PI * 2); ctx.fill(); };
  const ring = (r, w, a0 = 0, a1 = Math.PI * 2) => { lw(w); ctx.beginPath(); ctx.arc(0, 0, u(r), a0, a1); ctx.stroke(); };
  const line = (pts, w) => { lw(w); ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(u(x), u(y)) : ctx.moveTo(u(x), u(y))); ctx.stroke(); };
  switch (shape) {
    case 'dot': dot(0.13); break;
    case 'microdot': dot(0.07); break;
    case 'ringdot': ring(0.8, 0.06); dot(0.11); break;
    case 'bigring': ring(0.9, 0.05); ring(0.42, 0.04); dot(0.08); break;
    case 'chevron':
      ctx.beginPath(); ctx.moveTo(u(-0.35), u(-0.24)); ctx.lineTo(0, u(0.05)); ctx.lineTo(u(0.35), u(-0.24)); ctx.lineTo(u(0.35), u(-0.15)); ctx.lineTo(0, u(0.16)); ctx.lineTo(u(-0.35), u(-0.15)); ctx.closePath(); ctx.fill();
      line([[0, -0.32], [0, -0.95]], 0.055); break;
    case 'cross': for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) line([[x * 0.22, y * 0.22], [x * 0.75, y * 0.75]], 0.06); dot(0.06); break;
    case 'circlecross': ring(0.78, 0.05); for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) line([[x * 0.3, y * 0.3], [x * 0.78, y * 0.78]], 0.045); dot(0.08); break;
    case 'triangle': line([[0, 0.42], [0.4, -0.28], [-0.4, -0.28], [0, 0.42]], 0.06); dot(0.07); break;
    case 'horseshoe': ring(0.7, 0.07, -Math.PI / 2 + 0.75, Math.PI * 1.5 - 0.75); dot(0.1); break;
    case 'brackets': for (const sx of [-1, 1]) for (const sy of [-1, 1]) line([[sx * 0.62, sy * 0.3], [sx * 0.62, sy * 0.62], [sx * 0.3, sy * 0.62]], 0.06); dot(0.09); break;
    case 'diamond': line([[0, 0.5], [0.5, 0], [0, -0.5], [-0.5, 0], [0, 0.5]], 0.055); dot(0.07); break;
    case 'tpost': line([[-0.65, 0], [-0.18, 0]], 0.06); line([[0.18, 0], [0.65, 0]], 0.06); line([[0, -0.18], [0, -0.85]], 0.06); dot(0.07); break;
    // iron sight inserts
    case 'none': break;
    case 'ring': ring(0.62, 0.3); break;
    // 'dot' above serves iron too (scaled by the mesh)
  }
  ctx.restore();
}

// ---- 3D materials for the optic reticles ----
const mats = {};
const canv = {};
function paint(optic) {
  const m = mats[optic]; if (!m) return;
  const c = canv[optic], ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const shape = optic === 'iron' ? (cfg.iron.shape === 'none' ? 'none' : cfg.iron.shape === 'ring' ? 'ring' : 'irondot') : cfg[optic].shape;
  if (shape === 'irondot') { ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(32, 32, 20, 0, Math.PI * 2); ctx.fill(); }
  else drawShape(ctx, shape, c.width, '#fff', optic === 'iron' ? 6 : 10);
  m.map.needsUpdate = true;
  m.visible = !(optic === 'iron' && cfg.iron.shape === 'none');
  const col = new THREE.Color(RET_COLORS[cfg[optic].color][1]);
  m.color.copy(col).multiplyScalar(optic === 'iron' ? 1.3 : 1.6);   // just over the bloom threshold, like the old red
}
export function reticleMat(optic) {
  if (!mats[optic]) {
    const c = document.createElement('canvas');
    c.width = c.height = optic === 'iron' ? 64 : 256;
    canv[optic] = c;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mats[optic] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    paint(optic);
  }
  return mats[optic];
}
// half-size of the reticle plane per optic (metres), so the stock shapes match the old geometry
const HALF = { reflex: 0.0035, holo: 0.004, acog: 0.0075, iron: 0.0016 };
export function reticleMesh(optic) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(HALF[optic] * 2, HALF[optic] * 2), reticleMat(optic));
  mesh.renderOrder = 3;
  return mesh;
}

// ---- sniper scope overlay (SVG, viewBox -100..100) ----
export function scopeSVG(shape, color, thick = 1) {
  const c = RET_COLORS[color] ? RET_COLORS[color][1] : color;
  const k = '#050505', L = (x1, y1, x2, y2, w) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${k}" stroke-width="${w * thick}"/>`;
  const glowDot = (r) => `<circle r="${r * Math.sqrt(thick)}" fill="${c}" filter="url(#rg)"/>`;
  let s = '';
  switch (shape) {
    case 'fine': s = L(-100, 0, 100, 0, 0.35) + L(0, -100, 0, 100, 0.35) + glowDot(0.9); break;
    case 'mildot': s = L(-100, 0, 100, 0, 0.35) + L(0, -100, 0, 100, 0.35);
      for (let i = 1; i <= 5; i++) for (const sg of [-1, 1]) s += `<circle cx="${sg * i * 9}" r="${thick}" fill="${k}"/><circle cy="${sg * i * 9}" r="${thick}" fill="${k}"/>`;
      s += glowDot(0.8); break;
    case 'german': s = L(-100, 0, -6, 0, 3) + L(6, 0, 100, 0, 3) + `<path d="M -2.2 100 L -2.2 4 L 0 0 L 2.2 4 L 2.2 100 Z" fill="${k}"/>` + glowDot(0.9); break;
    case 'dotonly': s = L(-100, 0, -8, 0, 0.3) + L(8, 0, 100, 0, 0.3) + L(0, -100, 0, -8, 0.3) + L(0, 8, 0, 100, 0.3) + glowDot(1.6); break;
    case 'chevron': s = L(-100, 0, -14, 0, 0.5) + L(14, 0, 100, 0, 0.5) + L(0, 14, 0, 100, 0.5)
      + `<path d="M -5 5 L 0 0 L 5 5" fill="none" stroke="${c}" stroke-width="1.3" filter="url(#rg)"/>`; break;
    default: // duplex: thick outer posts, fine centre
      s = L(-100, 0, -30, 0, 3) + L(30, 0, 100, 0, 3) + L(0, -100, 0, -30, 3) + L(0, 30, 0, 100, 3)
        + L(-30, 0, 30, 0, 0.35) + L(0, -30, 0, 30, 0.35) + glowDot(0.9);
  }
  return `<svg viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid meet"><defs><filter id="rg" x="-3" y="-3" width="7" height="7"><feGaussianBlur stdDeviation="0.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${s}</svg>`;
}

// a flat preview of any reticle (data URL), for menu tiles
const prevCache = new Map();
export function reticlePreview(optic, shape, color, size = 128) {
  const key = [optic, shape, color, size].join('|');
  if (prevCache.has(key)) return prevCache.get(key);
  let url;
  if (optic === 'scope') url = 'data:image/svg+xml;utf8,' + encodeURIComponent(scopeSVG(shape, color, size > 128 ? 3 : 5).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/#050505/g, '#d8d4c8'));
  else {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d'), col = RET_COLORS[color][1];
    if (optic === 'iron') {
      // front post silhouette with the insert on top
      ctx.fillStyle = '#9a968c'; ctx.fillRect(size * 0.44, size * 0.5, size * 0.12, size * 0.5);
      ctx.fillRect(size * 0.2, size * 0.42, size * 0.06, size * 0.58); ctx.fillRect(size * 0.74, size * 0.42, size * 0.06, size * 0.58);
      if (shape !== 'none') { ctx.fillStyle = ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(size * 0.5, size * 0.57, size * (shape === 'dot' ? 0.045 : 0.04), 0, Math.PI * 2); if (shape === 'dot') ctx.fill(); else { ctx.lineWidth = size * 0.02; ctx.stroke(); } }
    } else drawShape(ctx, shape, size, col, size / 18);
    url = c.toDataURL();
  }
  prevCache.set(key, url);
  return url;
}

let scopeEl = null;
export function applyReticles(r) {
  cfg = cleanReticles(r);
  for (const o in mats) paint(o);
  scopeEl = scopeEl || document.querySelector('#scope .lens');
  if (scopeEl) {
    let host = scopeEl.querySelector('.ret');
    if (!host) { scopeEl.querySelectorAll('.h, .v, .dot').forEach(e => e.remove()); host = document.createElement('div'); host.className = 'ret'; scopeEl.appendChild(host); }
    host.innerHTML = scopeSVG(cfg.scope.shape, cfg.scope.color);
  }
  return cfg;
}
export const reticleCfg = () => cfg;
