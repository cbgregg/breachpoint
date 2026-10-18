// Doors that open and close. Maps list them (world.doors); each one is a moving mesh plus one collision
// box that exists only while the door is shut, so it blocks movement, sight and bullets when closed.
//   swing   - an ordinary hinged door: Use (the reload button) opens / closes it, sprinting into it
//             bashes it open, bots open it when their route goes through
//   traffic - double doors that swing both ways (stockroom, kitchen): anyone walking into them pushes
//             them open, they swing shut again behind you
//   slide   - automatic sliding glass doors (the store entrances): open while anyone is close
// The host (or the local game) decides; guests get the door states in every snapshot.
import * as THREE from 'three';
import { Box } from './physics.js';

const OPEN_ANG = Math.PI * 0.52;
const _f = new THREE.Vector3();

export class Doors {
  constructor(game, specs) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    this.mats = {
      metal: new THREE.MeshStandardMaterial({ color: 0x8a9298, roughness: 0.42, metalness: 0.6 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.28, metalness: 0.85 }),
      paint: new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.55, metalness: 0.3 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5, metalness: 0.4 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xcfe2ec, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 2 }),
      window: new THREE.MeshStandardMaterial({ color: 0x2a3640, roughness: 0.08, metalness: 0.5, envMapIntensity: 1.6 }),
    };
    for (const s of specs || []) this.add(s);
    game.scene.add(this.group);
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const m of Object.values(this.mats)) m.dispose();
    for (const d of this.list) { const i = this.game.physics.boxes.indexOf(d.box); if (i >= 0) this.game.physics.boxes.splice(i, 1); }
    this.list = [];
  }

  add(s) {
    const d = {
      kind: s.kind || 'swing', x: s.x, y: s.y || 0, z: s.z, axis: s.axis, w: s.w, h: s.h || 2.2,
      tint: s.tint, glass: !!s.glass, leaves: [], t: 0, target: 0, clearT: 0, idx: this.list.length,
    };
    // wall direction (the doorway's width) and its normal
    d.dir = d.axis === 'x' ? [1, 0] : [0, 1];
    d.n = d.axis === 'x' ? [0, 1] : [1, 0];
    const ry0 = d.axis === 'x' ? 0 : -Math.PI / 2;
    const mk = (hingeSide, leafW) => {
      // pivot at the hinge; the leaf runs along local +x from it
      const piv = new THREE.Group();
      const hx = d.x + d.dir[0] * hingeSide * d.w / 2, hz = d.z + d.dir[1] * hingeSide * d.w / 2;
      piv.position.set(hx, d.y, hz);
      const base = ry0 + (hingeSide > 0 ? Math.PI : 0);
      piv.rotation.y = base;
      this.leafMesh(piv, d, leafW);
      this.group.add(piv);
      // which way does a positive turn swing the free end (along +n or -n)?
      const a = base + 0.1, fx = Math.cos(a), fz = -Math.sin(a);
      const k = (fx * d.n[0] + fz * d.n[1]) > 0 ? 1 : -1;
      return { piv, base, k, hingeSide, hx, hz, leafW };
    };
    if (d.kind === 'slide') {
      for (const side of [-1, 1]) {
        const piv = new THREE.Group();
        this.leafMesh(piv, d, d.w / 2 + 0.04, true);
        piv.rotation.y = ry0;
        this.group.add(piv);
        d.leaves.push({ piv, side });
      }
    } else if (d.kind === 'traffic' || s.leaves === 2) {
      d.leaves.push(mk(-1, d.w / 2 - 0.02), mk(1, d.w / 2 - 0.02));
    } else d.leaves.push(mk(s.hinge || -1, d.w - 0.03));
    const hw = d.w / 2, th = 0.07;
    d.box = new Box(d.x - (d.axis === 'x' ? hw : th), d.y, d.z - (d.axis === 'x' ? th : hw), d.x + (d.axis === 'x' ? hw : th), d.y + d.h, d.z + (d.axis === 'x' ? th : hw));
    d.box.surface = d.glass ? 'glass' : 'metal';
    d.box.pass = d.glass;
    d.boxY = [d.box.miny, d.box.maxy];
    this.game.physics.addBox(d.box);
    this.pose(d);
    this.list.push(d);
    return d;
  }

  leafMesh(piv, d, lw, slide = false) {
    const M = this.mats, h = d.h - 0.02, add = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = !d.glass; o.receiveShadow = true; piv.add(o); return o; };
    const x0 = slide ? -lw / 2 : 0, cx = x0 + lw / 2;
    if (d.glass) {
      // aluminium frame round a full-height glass pane, a push bar across
      add(new THREE.BoxGeometry(lw, h - 0.12, 0.012), M.glass, cx, h / 2, 0).castShadow = false;
      for (const [w, hh, x, y] of [[lw, 0.1, cx, h - 0.05], [lw, 0.14, cx, 0.07], [0.06, h, x0 + 0.03, h / 2], [0.06, h, x0 + lw - 0.03, h / 2]]) add(new THREE.BoxGeometry(w, hh, 0.06), M.dark, x, y, 0);
      add(new THREE.BoxGeometry(lw * 0.7, 0.04, 0.03), M.steel, cx, 1.0, 0.05);
      add(new THREE.BoxGeometry(lw * 0.7, 0.04, 0.03), M.steel, cx, 1.0, -0.05);
      return;
    }
    const mat = d.kind === 'traffic' ? M.steel : M.paint;
    const leaf = add(new THREE.BoxGeometry(lw, h, 0.05), mat, cx, h / 2, 0);
    if (d.tint !== undefined && d.kind !== 'traffic') { leaf.material = M.paint.clone(); leaf.material.color.setHex(d.tint); M['p' + d.idx + '_' + piv.id] = leaf.material; }
    if (d.kind === 'traffic') {
      // stainless traffic door: a round porthole and a scuffed kick plate
      add(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 18).rotateX(Math.PI / 2), M.window, cx, 1.55, 0);
      add(new THREE.BoxGeometry(lw - 0.06, 0.35, 0.06), M.metal, cx, 0.2, 0);
    } else {
      // steel door: lever handle on the far side from the hinge, a narrow vision panel, kick plate
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.14, 0.03, 0.03), M.steel, x0 + lw - 0.14, 1.02, s * 0.045);
      add(new THREE.BoxGeometry(0.16, 0.6, 0.06), M.window, cx + lw * 0.1, 1.55, 0);
      add(new THREE.BoxGeometry(lw - 0.06, 0.25, 0.06), M.metal, cx, 0.14, 0);
    }
  }

  // place the leaves for the door's current opening (t: -1..1, slide 0..1)
  pose(d) {
    if (d.kind === 'slide') {
      for (const L of d.leaves) {
        const off = L.side * (d.w / 4 + d.t * (d.w / 2 - 0.05));
        // slide along the inside face of the wall
        L.piv.position.set(d.x + d.dir[0] * off - d.n[0] * 0.14, d.y, d.z + d.dir[1] * off - d.n[1] * 0.14);
      }
    } else for (const L of d.leaves) L.piv.rotation.y = L.base + L.k * d.t * OPEN_ANG;
    const shut = d.kind === 'slide' ? d.t < 0.45 : Math.abs(d.t) < 0.12;
    d.box.miny = shut ? d.boxY[0] : -1000; d.box.maxy = shut ? d.boxY[1] : -999;
  }

  // where c stands relative to the doorway: [along the wall, across it (signed), height]
  rel(d, p) {
    const dx = p.x - d.x, dz = p.z - d.z;
    return [dx * d.dir[0] + dz * d.dir[1], dx * d.n[0] + dz * d.n[1], p.y - d.y];
  }

  // the door in front of c you could Use (swing doors only), or null
  near(c) {
    if (!c.alive) return null;
    c.forward(_f);
    let best = null, bd = 2.2;
    for (const d of this.list) {
      if (d.kind !== 'swing') continue;
      const [a, n, y] = this.rel(d, c.pos);
      if (Math.abs(y) > 1.2 || Math.abs(a) > d.w / 2 + 0.6) continue;
      const dist = Math.hypot(Math.max(0, Math.abs(a) - d.w / 2), n);
      if (dist > 1.9) continue;
      // facing it (roughly)
      const tx = d.x - c.pos.x, tz = d.z - c.pos.z, tl = Math.hypot(tx, tz) || 1;
      if ((_f.x * tx + _f.z * tz) / tl < 0.1 && dist > 0.6) continue;
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  // Use: open (away from you) or close the door you're at. True if a door took the press.
  use(c) {
    const d = this.near(c);
    if (!d) return false;
    if (Math.abs(d.target) > 0) { if (!this.occupied(d)) this.set(d, 0); }
    else this.set(d, -Math.sign(this.rel(d, c.pos)[1]) || 1);
    return true;
  }

  occupied(d) {
    for (const c of this.game.characters) {
      if (!c.alive) continue;
      const [a, n, y] = this.rel(d, c.pos);
      if (Math.abs(y) < 1.5 && Math.abs(a) < d.w / 2 + 0.3 && Math.abs(n) < 0.55) return true;
    }
    return false;
  }

  set(d, target, bash = false) {
    if (d.target === target) return;
    d.target = target;
    const a = this.game.audio;
    if (a && d.kind !== 'slide') a.play(bash ? 'doorbash' : target ? 'door' : 'doorshut', new THREE.Vector3(d.x, d.y + 1, d.z));
    else if (a && target) a.play('doorslide', new THREE.Vector3(d.x, d.y + 1, d.z));
  }

  update(dt, authority) {
    const g = this.game;
    for (const d of this.list) {
      if (authority) {
        if (d.kind === 'slide') {
          let near = false;
          for (const c of g.characters) {
            if (!c.alive) continue;
            const [a, n, y] = this.rel(d, c.pos);
            if (Math.abs(y) < 2 && Math.abs(a) < d.w / 2 + 1.2 && Math.abs(n) < 3.2) { near = true; break; }
          }
          if (near) { d.clearT = 0; this.set(d, 1); }
          else if ((d.clearT += dt) > 0.9) this.set(d, 0);
        } else {
          let inBand = false;
          for (const c of g.characters) {
            if (!c.alive) continue;
            const [a, n, y] = this.rel(d, c.pos);
            if (Math.abs(y) > 1.5 || Math.abs(a) > d.w / 2 + 0.2) continue;
            const vn = c.vel.x * d.n[0] + c.vel.z * d.n[1];
            const toward = n * vn < 0;   // moving at the doorway
            if (Math.abs(n) < 0.95) inBand = true;
            if (d.target !== 0 || Math.abs(n) > 0.9 || !toward) continue;
            const sp = Math.hypot(c.vel.x, c.vel.z);
            if (d.kind === 'traffic' && sp > 0.4) this.set(d, -Math.sign(n) || 1);                       // pushed open
            else if (d.kind === 'swing' && c.isBot && sp > 0.4) this.set(d, -Math.sign(n) || 1);         // bots just open it
            else if (d.kind === 'swing' && (c.sprinting || c.slideT > 0) && sp > 4.5) this.set(d, -Math.sign(n) || 1, true); // shoulder-barge
          }
          // traffic doors swing shut once nobody is in them
          if (d.kind === 'traffic' && d.target !== 0) {
            if (inBand) d.clearT = 0; else if ((d.clearT += dt) > 1.4) this.set(d, 0);
          }
        }
      }
      // animate toward the target; never close on someone standing in the doorway
      let tgt = d.target;
      if (tgt === 0 && d.kind !== 'slide' && Math.abs(d.t) > 0.05 && this.occupied(d)) tgt = d.t;
      const rate = d.kind === 'slide' ? 2.2 : d.kind === 'traffic' ? 4.5 : 3.2;
      const prev = d.t;
      d.t += Math.sign(tgt - d.t) * Math.min(Math.abs(tgt - d.t), dt * rate);
      if (d.t !== prev) this.pose(d);
    }
  }

  netState() { return this.list.map(d => d.target); }
  applyNet(a) {
    if (!Array.isArray(a)) return;
    for (let i = 0; i < Math.min(a.length, this.list.length); i++) {
      const v = a[i];
      if (v === -1 || v === 0 || v === 1) this.set(this.list[i], v);
    }
  }
}
