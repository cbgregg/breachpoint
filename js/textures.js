// Procedural PBR texture sets (albedo + normal + roughness), generated at load. No image assets.
import * as THREE from 'three';

// ---------- tileable value noise ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function makeNoise(seed) {
  const r = rng(seed);
  const t = new Float32Array(256 * 256);
  for (let i = 0; i < t.length; i++) t[i] = r();
  const noise = (x, y, period) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = t[(x0 & 255) + (y0 & 255) * 256], b = t[(x1 & 255) + (y0 & 255) * 256];
    const c = t[(x0 & 255) + (y1 & 255) * 256], d = t[(x1 & 255) + (y1 & 255) * 256];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  // fbm over [0,1) uv, tileable; returns ~0..1
  const fbm = (u, v, period, oct = 4) => {
    let sum = 0, amp = 0.5, norm = 0, p = period;
    for (let o = 0; o < oct; o++) {
      sum += amp * noise(u * p, v * p, p);
      norm += amp; amp *= 0.5; p *= 2;
    }
    return sum / norm;
  };
  return { noise, fbm, r };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;

// Builds textures from per-pixel callbacks. fn(u, v, out) fills out = [r,g,b, height, rough]
function bake(N, fn, normalStrength = 2, opts = {}) {
  const alb = new Uint8ClampedArray(N * N * 4);
  const hgt = new Float32Array(N * N);
  const rough = new Uint8ClampedArray(N * N * 4);
  const out = [0, 0, 0, 0, 0];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      fn(x / N, y / N, out, x, y);
      const i = y * N + x;
      alb[i * 4] = out[0]; alb[i * 4 + 1] = out[1]; alb[i * 4 + 2] = out[2]; alb[i * 4 + 3] = 255;
      hgt[i] = out[3];
      const r = clamp(out[4], 0, 1) * 255;
      rough[i * 4] = r; rough[i * 4 + 1] = r; rough[i * 4 + 2] = r; rough[i * 4 + 3] = 255;
    }
  }
  const nrm = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const xl = (x - 1 + N) % N, xr = (x + 1) % N, yu = (y - 1 + N) % N, yd = (y + 1) % N;
      const du = (hgt[y * N + xr] - hgt[y * N + xl]) * normalStrength;
      const dv = (hgt[yu * N + x] - hgt[yd * N + x]) * normalStrength;
      let nx = -du, ny = -dv, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * N + x) * 4;
      nrm[i] = (nx * 0.5 + 0.5) * 255; nrm[i + 1] = (ny * 0.5 + 0.5) * 255; nrm[i + 2] = (nz * 0.5 + 0.5) * 255; nrm[i + 3] = 255;
    }
  }
  const tex = (data, srgb) => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    c.getContext('2d').putImageData(new ImageData(data, N, N), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  return { map: tex(alb, true), normalMap: tex(nrm, false), roughnessMap: tex(rough, false) };
}

// random crack network mask (tileable), returns Float32Array N*N of 0..1
function crackMask(N, r, count, len) {
  const m = new Float32Array(N * N);
  for (let c = 0; c < count; c++) {
    let x = r() * N, y = r() * N, a = r() * Math.PI * 2;
    const steps = len * (0.5 + r());
    for (let s = 0; s < steps; s++) {
      a += (r() - 0.5) * 0.7;
      x += Math.cos(a); y += Math.sin(a);
      const w = r() < 0.15 ? 2 : 1;
      for (let oy = -w + 1; oy < w; oy++) for (let ox = -w + 1; ox < w; ox++) {
        const xi = ((Math.round(x) + ox) % N + N) % N, yi = ((Math.round(y) + oy) % N + N) % N;
        m[yi * N + xi] = 1;
      }
      if (r() < 0.02) { // branch
        a += (r() < 0.5 ? 1 : -1) * 0.9;
      }
    }
  }
  return m;
}

export function makeTextureSets() {
  const sets = {};

  { // asphalt
    const N = 512, { fbm, r } = makeNoise(11);
    const cracks = crackMask(N, r, 10, 140);
    const stones = new Float32Array(N * N);
    for (let i = 0; i < 9000; i++) stones[(r() * N | 0) + (r() * N | 0) * N] = 0.5 + r() * 0.5;
    sets.asphalt = bake(N, (u, v, o, x, y) => {
      const i = y * N + x;
      const big = fbm(u, v, 4, 3), fine = fbm(u, v, 64, 2);
      const st = stones[i];
      const cr = cracks[i];
      let g = 52 + (big - 0.5) * 26 + (fine - 0.5) * 22 + st * 38;
      const oil = clamp((fbm(u + 0.3, v, 3, 3) - 0.62) * 4, 0, 1);
      g *= 1 - oil * 0.35;
      g *= 1 - cr * 0.55;
      o[0] = g * 1.0; o[1] = g * 0.99; o[2] = g * 0.96;
      o[3] = fine * 0.5 + st * 0.6 - cr * 1.2;
      o[4] = 0.88 - st * 0.12 - oil * 0.3 + (fine - 0.5) * 0.08;
    }, 3);
  }

  { // concrete
    const N = 512, { fbm, r } = makeNoise(23);
    const pores = new Float32Array(N * N);
    for (let i = 0; i < 5000; i++) pores[(r() * N | 0) + (r() * N | 0) * N] = 0.5 + r() * 0.5;
    const cracks = crackMask(N, r, 4, 90);
    sets.concrete = bake(N, (u, v, o, x, y) => {
      const i = y * N + x;
      const big = fbm(u, v, 3, 4), mid = fbm(u, v, 16, 3), fine = fbm(u, v, 96, 2);
      const streak = clamp((fbm(u * 1.0, v * 0.08, 24, 3) - 0.55) * 3, 0, 1) * v; // drips toward bottom
      const seam = (x % (N / 2) < 2 || y % (N / 2) < 2) ? 1 : 0;
      let g = 150 + (big - 0.5) * 40 + (mid - 0.5) * 18 + (fine - 0.5) * 10;
      g *= 1 - streak * 0.25 - pores[i] * 0.3 - seam * 0.25 - cracks[i] * 0.4;
      o[0] = g * 1.0; o[1] = g * 0.975; o[2] = g * 0.93;
      o[3] = fine * 0.3 + mid * 0.2 - pores[i] * 0.8 - seam * 0.6 - cracks[i];
      o[4] = 0.86 + (mid - 0.5) * 0.12 - streak * 0.05;
    }, 2.5);
  }

  { // plaster with chipped brick
    const N = 512, { fbm } = makeNoise(37);
    sets.plaster = bake(N, (u, v, o, x, y) => {
      const big = fbm(u, v, 3, 4), mid = fbm(u, v, 12, 3), fine = fbm(u, v, 80, 2);
      const chip = clamp((fbm(u + 0.17, v + 0.4, 5, 4) - 0.64) * 12, 0, 1);
      // brick pattern under the plaster
      const row = Math.floor(v * 24), off = row % 2 ? 0.5 : 0;
      const bu = (u * 8 + off) % 1, bv = (v * 24) % 1;
      const mortar = bu < 0.06 || bv < 0.12 ? 1 : 0;
      const brickTone = fbm(Math.floor(u * 8 + off) / 8, row / 24, 64, 1);
      const pr = 184 + (big - 0.5) * 34 + (mid - 0.5) * 14, pg = pr * 0.89, pb = pr * 0.74;
      const br = mortar ? 150 : 128 + brickTone * 40, bg = mortar ? 140 : br * 0.62, bb = mortar ? 125 : br * 0.48;
      o[0] = mix(pr, br, chip); o[1] = mix(pg, bg, chip); o[2] = mix(pb, bb, chip);
      o[3] = (1 - chip) * 0.6 + fine * 0.35 + mid * 0.2 - (chip ? mortar * 0.3 : 0);
      o[4] = 0.92 - chip * 0.05 + (fine - 0.5) * 0.06;
    }, 3.5);
  }

  { // brick
    const N = 512, { fbm } = makeNoise(41);
    sets.brick = bake(N, (u, v, o) => {
      const rows = 16, cols = 6;
      const row = Math.floor(v * rows), off = row % 2 ? 0.5 : 0;
      const bu = (u * cols + off) % 1, bv = (v * rows) % 1;
      const mortar = bu < 0.05 || bv < 0.1;
      const id = Math.floor(u * cols + off) * 7 + row * 13;
      const tone = fbm((id % 64) / 64, 0.37, 64, 1);
      const fine = fbm(u, v, 96, 2);
      if (mortar) { const g = 150 + (fine - 0.5) * 20; o[0] = g; o[1] = g * 0.96; o[2] = g * 0.9; o[3] = 0.1; o[4] = 0.95; }
      else {
        const rr = 120 + tone * 60 + (fine - 0.5) * 18;
        o[0] = rr; o[1] = rr * (0.55 + tone * 0.15); o[2] = rr * 0.42; o[3] = 0.7 + fine * 0.3; o[4] = 0.85;
      }
    }, 4);
  }

  { // corrugated painted metal with rust (tinted by material color)
    const N = 512, { fbm } = makeNoise(53);
    sets.metal = bake(N, (u, v, o) => {
      const ridge = Math.sin(u * Math.PI * 2 * 16) * 0.5 + 0.5;
      const rust = clamp((fbm(u, v, 6, 5) - 0.58) * 5, 0, 1);
      const streak = clamp((fbm(u * 1.0, v * 0.1, 32, 3) - 0.5) * 3, 0, 1) * 0.5;
      const fine = fbm(u, v, 128, 2);
      const paint = 205 - streak * 60 + (fine - 0.5) * 16;
      o[0] = mix(paint, 120, rust); o[1] = mix(paint, 72, rust); o[2] = mix(paint, 44, rust);
      o[3] = ridge * 0.9 + rust * fine * 0.3;
      o[4] = mix(0.55, 0.9, rust) + streak * 0.1;
    }, 3);
  }

  { // wood planks
    const N = 256, { fbm } = makeNoise(67);
    sets.wood = bake(N, (u, v, o) => {
      const plank = Math.floor(v * 5), pv = (v * 5) % 1;
      const gap = pv < 0.05 ? 1 : 0;
      const grain = fbm(u * 1, v * 5 + plank * 0.37, 8, 4);
      const ring = Math.sin((grain * 30 + u * 6)) * 0.5 + 0.5;
      const tone = fbm(plank / 5, 0.5, 16, 1);
      const g = 120 + tone * 50 + ring * 22 - gap * 80;
      o[0] = g; o[1] = g * 0.76; o[2] = g * 0.52;
      o[3] = ring * 0.3 - gap; o[4] = 0.8;
    }, 2.5);
  }

  { // packed dirt / gravel
    const N = 512, { fbm, r } = makeNoise(79);
    const pebbles = new Float32Array(N * N);
    for (let i = 0; i < 2500; i++) {
      const cx = r() * N, cy = r() * N, rad = 1 + r() * 3;
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x, y);
        if (d < rad) pebbles[(((cy + y) | 0) % N + N) % N * N + ((((cx + x) | 0) % N) + N) % N] = Math.max(0, 1 - d / rad);
      }
    }
    sets.dirt = bake(N, (u, v, o, x, y) => {
      const i = y * N + x;
      const big = fbm(u, v, 3, 4), mid = fbm(u, v, 20, 3), fine = fbm(u, v, 100, 2);
      const p = pebbles[i];
      const g = 132 + (big - 0.5) * 40 + (mid - 0.5) * 20 + (fine - 0.5) * 14;
      o[0] = mix(g, 150, p * 0.6); o[1] = mix(g * 0.86, 140, p * 0.6); o[2] = mix(g * 0.64, 128, p * 0.6);
      o[3] = mid * 0.4 + fine * 0.3 + p * 0.8;
      o[4] = 0.95 - p * 0.15;
    }, 3);
  }

  { // sandbags
    const N = 256, { fbm } = makeNoise(83);
    sets.sand = bake(N, (u, v, o) => {
      const row = Math.floor(v * 4), off = row % 2 ? 0.5 : 0;
      const bu = (u * 2 + off) % 1, bv = (v * 4) % 1;
      const bulge = Math.sin(bu * Math.PI) * Math.sin(bv * Math.PI);
      const weave = (Math.sin(u * N * 1.6) * Math.sin(v * N * 1.6)) * 0.5 + 0.5;
      const tone = fbm(u, v, 8, 3);
      const g = 140 + tone * 40 - (1 - bulge) * 50;
      o[0] = g; o[1] = g * 0.88; o[2] = g * 0.66;
      o[3] = bulge * 1.4 + weave * 0.05; o[4] = 0.95;
    }, 3);
  }

  { // hesco barrier: wire mesh over geotextile
    const N = 256, { fbm } = makeNoise(97);
    sets.hesco = bake(N, (u, v, o) => {
      const gx = (u * 10) % 1, gy = (v * 10) % 1;
      const wire = gx < 0.06 || gy < 0.06 ? 1 : 0;
      const bulge = Math.sin(gx * Math.PI) * Math.sin(gy * Math.PI);
      const tone = fbm(u, v, 6, 3);
      const fab = 150 + tone * 30;
      o[0] = wire ? 95 : fab; o[1] = wire ? 96 : fab * 0.9; o[2] = wire ? 92 : fab * 0.7;
      o[3] = wire ? 1 : bulge * 0.5; o[4] = wire ? 0.5 : 0.95;
    }, 3);
  }

  { // paving tiles (sidewalks, rooftops)
    const N = 256, { fbm } = makeNoise(101);
    sets.tile = bake(N, (u, v, o) => {
      const gu = (u * 4) % 1, gv = (v * 4) % 1;
      const grout = gu < 0.04 || gv < 0.04;
      const id = Math.floor(u * 4) + Math.floor(v * 4) * 4;
      const tone = ((id * 37) % 17) / 17;
      const fine = fbm(u, v, 64, 2);
      const g = grout ? 95 : 160 + tone * 24 + (fine - 0.5) * 18;
      o[0] = g; o[1] = g * 0.95; o[2] = g * 0.86;
      o[3] = grout ? 0 : 0.6 + fine * 0.2; o[4] = grout ? 0.95 : 0.8;
    }, 3);
  }

  { // fabric detail (characters, cloth)
    const N = 128, { fbm } = makeNoise(113);
    sets.fabric = bake(N, (u, v, o) => {
      const w = Math.sin(u * Math.PI * 2 * 32) * Math.sin(v * Math.PI * 2 * 32);
      const t = fbm(u, v, 8, 3);
      const g = 200 + t * 55;
      o[0] = g; o[1] = g; o[2] = g; o[3] = w * 0.3 + t * 0.4; o[4] = 0.92;
    }, 2);
  }

  return sets;
}

// Small canvas helpers used by effects
export function radialTexture(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function starTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, size / 2);
  grd.addColorStop(0, 'rgba(255,250,230,1)'); grd.addColorStop(0.25, 'rgba(255,200,110,0.9)'); grd.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = grd;
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3 + (i % 2) * 0.2);
    g.beginPath();
    g.moveTo(0, -size * 0.06); g.lineTo(size * 0.5, 0); g.lineTo(0, size * 0.06);
    g.closePath(); g.fill();
  }
  g.beginPath(); g.arc(0, 0, size * 0.18, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
