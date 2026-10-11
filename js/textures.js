// Procedural canvas textures (no image assets needed)
import * as THREE from 'three';

function canvasTex(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(g, s, base, amount, count) {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < count; i++) {
    const v = (Math.random() - 0.5) * amount;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    const w = 1 + Math.random() * 3;
    g.fillRect(Math.random() * s, Math.random() * s, w, w);
  }
}

export function makeTextures() {
  return {
    ground: canvasTex(256, (g, s) => {
      speckle(g, s, '#4b5056', 0.22, 5000);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
      g.strokeRect(0, 0, s, s);
      g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    }),
    concrete: canvasTex(256, (g, s) => {
      speckle(g, s, '#9a9ea3', 0.18, 3500);
      g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2;
      g.strokeRect(1, 1, s - 2, s - 2);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      [[20, 20], [s - 24, 20], [20, s - 24], [s - 24, s - 24]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); });
    }),
    wall: canvasTex(256, (g, s) => {
      speckle(g, s, '#7d8896', 0.16, 2500);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
      for (let y = 0; y <= s; y += s / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
      for (let r = 0; r < 4; r++) {
        const off = r % 2 ? s / 4 : 0;
        for (let x = off; x <= s; x += s / 2) { g.beginPath(); g.moveTo(x, r * s / 4); g.lineTo(x, (r + 1) * s / 4); g.stroke(); }
      }
    }),
    crate: canvasTex(256, (g, s) => {
      speckle(g, s, '#8b6a3e', 0.18, 2500);
      g.strokeStyle = 'rgba(40,25,10,0.55)'; g.lineWidth = 3;
      for (let y = s / 6; y < s; y += s / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
      g.fillStyle = '#6b4f2a';
      g.fillRect(0, 0, s, 22); g.fillRect(0, s - 22, s, 22); g.fillRect(0, 0, 22, s); g.fillRect(s - 22, 0, 22, s);
      g.save(); g.translate(s / 2, s / 2); g.rotate(Math.PI / 4); g.fillRect(-s * 0.68, -11, s * 1.36, 22); g.restore();
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; g.strokeRect(2, 2, s - 4, s - 4);
    }, false),
    metal: canvasTex(256, (g, s) => {
      const grad = g.createLinearGradient(0, 0, s / 8, 0);
      grad.addColorStop(0, '#d8d8d8'); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, '#bdbdbd');
      for (let x = 0; x < s; x += s / 8) { g.save(); g.translate(x, 0); g.fillStyle = grad; g.fillRect(0, 0, s / 8, s); g.restore(); }
      for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(80,50,30,${Math.random() * 0.12})`; g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 1 + Math.random() * 3); }
    }),
    sand: canvasTex(128, (g, s) => {
      g.fillStyle = '#7d6c4c'; g.fillRect(0, 0, s, s);
      for (let r = 0; r < 4; r++) {
        const off = r % 2 ? s / 4 : 0;
        for (let x = -s / 2 + off; x < s; x += s / 2) {
          g.fillStyle = '#b39d72';
          g.beginPath(); g.roundRect(x + 2, r * s / 4 + 2, s / 2 - 4, s / 4 - 4, 10); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 8, r * s / 4 + s / 8, s / 2 - 16, 2);
        }
      }
    }),
  };
}
