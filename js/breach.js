// Breaching: the parts of a map you can break through. Maps list them (world.breakables); each one is a
// collision box that blocks movement, sight and bullets until it's broken, plus the thing you see.
//   glass  - a window pane: the first bullet shatters it (and flies on), a kick or any blast breaks it
//   boards - planks nailed over an opening: a kick breaks them, so do a few rounds or a blast; a new way in
// The host (or the local game) decides what breaks; guests get it as an event, and the whole state in every
// snapshot (a string of 0/1, like the doors), so a late joiner sees the same holes.
import * as THREE from 'three';
import { Box } from './physics.js';

const _p = new THREE.Vector3(), _n = new THREE.Vector3();

export class Breakables {
  constructor(game, specs) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    this.mats = {
      glass: new THREE.MeshStandardMaterial({ color: 0xd6e6ee, roughness: 0.05, metalness: 0.25, transparent: true, opacity: 0.28, depthWrite: false, envMapIntensity: 2, side: THREE.DoubleSide }),
      shard: new THREE.MeshStandardMaterial({ color: 0xd6e6ee, roughness: 0.05, metalness: 0.25, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
      wood: new THREE.MeshStandardMaterial({ color: 0x7a5d3a, roughness: 0.85, metalness: 0 }),
      woodDark: new THREE.MeshStandardMaterial({ color: 0x4e3a22, roughness: 0.9, metalness: 0 }),
      nail: new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.5, metalness: 0.7 }),
    };
    for (const s of specs || []) this.add(s);
    game.scene.add(this.group);
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const m of Object.values(this.mats)) m.dispose();
    for (const b of this.list) { const i = this.game.physics.boxes.indexOf(b.box); if (i >= 0) this.game.physics.boxes.splice(i, 1); }
    this.list = [];
  }

  // spec: { kind: 'glass' | 'boards', x, y, z, axis: 'x' | 'z', w, h, hp? }   (x, z: the opening's centre; y: its bottom)
  add(s) {
    const b = { kind: s.kind, x: s.x, y: s.y, z: s.z, axis: s.axis, w: s.w, h: s.h, hp: s.hp ?? (s.kind === 'glass' ? 1 : 60), broken: false, idx: this.list.length, whole: new THREE.Group(), bits: new THREE.Group() };
    const hw = b.w / 2, th = b.kind === 'glass' ? 0.04 : 0.1;
    b.box = new Box(b.x - (b.axis === 'x' ? hw : th), b.y, b.z - (b.axis === 'x' ? th : hw), b.x + (b.axis === 'x' ? hw : th), b.y + b.h, b.z + (b.axis === 'x' ? th : hw));
    b.box.surface = b.kind === 'glass' ? 'glass' : 'wood';
    b.box.breakable = b.idx;
    b.box.navIgnore = true;   // bots path as if it were open; one in the way gets kicked through (see bot.js)
    b.boxY = [b.box.miny, b.box.maxy];
    this.game.physics.addBox(b.box);
    const ry = b.axis === 'x' ? 0 : Math.PI / 2;
    for (const g of [b.whole, b.bits]) { g.position.set(b.x, b.y, b.z); g.rotation.y = ry; this.group.add(g); }
    this.build(b);
    b.bits.visible = false;
    this.list.push(b);
    return b;
  }

  build(b) {
    const M = this.mats, add = (parent, geo, mat, x, y, z, rz = 0, rx = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = b.kind !== 'glass'; o.receiveShadow = true; parent.add(o); return o; };
    if (b.kind === 'glass') {
      add(b.whole, new THREE.PlaneGeometry(b.w - 0.02, b.h - 0.02), M.glass, 0, b.h / 2, 0).castShadow = false;
      // what's left after: jagged shards in the corners
      for (const [sx, sy] of [[-1, 0], [1, 0], [-1, 1], [1, 1], [0, 1]]) {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(sx ? sx * (0.12 + Math.random() * 0.16) : (Math.random() - 0.5) * 0.3, sy ? 0 : 0.02, 0), new THREE.Vector3(sx ? 0 : (Math.random() - 0.5) * 0.1, (sy ? -1 : 1) * (0.14 + Math.random() * 0.2), 0)]);
        g.setIndex([0, 1, 2]); g.computeVertexNormals();
        add(b.bits, g, M.shard, sx * (b.w / 2 - 0.02), sy ? b.h - 0.02 : 0.02, 0).castShadow = false;
      }
      return;
    }
    // boards: planks across the opening, a little askew, nailed at the ends; broken: splintered stubs at the sides
    const n = Math.max(2, Math.round(b.h / 0.34)), pw = b.w + 0.26;
    for (let i = 0; i < n; i++) {
      const y = b.h * (i + 0.5) / n, rz = ((i % 2) * 2 - 1) * (0.04 + (i * 0.37 % 1) * 0.06);
      add(b.whole, new THREE.BoxGeometry(pw, 0.17, 0.045), i % 3 === 1 ? M.woodDark : M.wood, 0, y, 0, rz);
      for (const sx of [-1, 1]) add(b.whole, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6).rotateX(Math.PI / 2), M.nail, sx * (b.w / 2 + 0.06), y + rz * sx * (b.w / 2 + 0.06), 0.03);
      for (const sx of [-1, 1]) add(b.bits, new THREE.BoxGeometry(0.22 + (i * 0.53 % 1) * 0.12, 0.17, 0.045), i % 3 === 1 ? M.woodDark : M.wood, sx * (b.w / 2 + 0.04), y + rz * sx * (b.w / 2), 0, rz + sx * 0.25);
    }
  }

  // damage from a bullet (dmg per round), a kick (60) or a blast (999); point/normal for the effects
  hit(idx, dmg, point, normal, who) {
    const b = this.list[idx];
    if (!b || b.broken) return false;
    if (this.game.mode === 'guest') return false;   // (the host decides; we'll hear about it)
    b.hp -= dmg;
    if (b.hp > 0) { if (b.kind === 'boards') this.game.audio.play('impact', point, { surface: 'wood' }); return false; }
    this.smash(b, point, normal, who);
    this.game.emit(['brk', b.idx, +(point ? point.x : b.x).toFixed(2), +(point ? point.y : b.y + b.h / 2).toFixed(2), +(point ? point.z : b.z).toFixed(2)]);
    return true;
  }

  // the break itself, on every machine: the box goes, the pieces show, glass rains or planks burst
  smash(b, point, normal, who) {
    if (b.broken) return;
    b.broken = true;
    b.box.miny = -1000; b.box.maxy = -999;
    b.whole.visible = false; b.bits.visible = true;
    const fx = this.game.effects, a = this.game.audio;
    const p = point ? _p.copy(point) : _p.set(b.x, b.y + b.h / 2, b.z);
    const nrm = normal ? _n.copy(normal) : _n.set(b.axis === 'x' ? 0 : 1, 0, b.axis === 'x' ? 1 : 0);
    if (b.kind === 'glass') {
      // a shower across the whole pane
      for (let i = 0; i < 7; i++) { const q = p.clone(); q.y = b.y + Math.random() * b.h; if (b.axis === 'x') q.x = b.x + (Math.random() - 0.5) * b.w; else q.z = b.z + (Math.random() - 0.5) * b.w; fx.impact(q, nrm, 'glass'); }
      a.play('shatter', p.clone());
    } else {
      for (let i = 0; i < 5; i++) { const q = p.clone(); q.y = b.y + Math.random() * b.h; fx.impact(q, nrm, 'wood'); }
      a.play('breach', p.clone());
    }
    if (who === this.game.player) this.game.hud.toast(b.kind === 'glass' ? 'GLASS SHATTERED' : 'BREACHED');
  }

  // the breakable right in front of c (within reach), or null
  near(c, reach = 1.7) {
    if (!c.alive) return null;
    c.forward(_n);
    const eye = c.eyePos(_p);
    const w = this.game.physics.raycast(eye, _n, reach);
    if (!w || w.box.breakable === undefined) return null;
    const b = this.list[w.box.breakable];
    return b && !b.broken ? { b, point: w.point.clone(), normal: w.normal } : null;
  }

  // every breakable inside a blast
  blast(pos, radius, who) {
    for (const b of this.list) {
      if (b.broken) continue;
      const dx = Math.max(b.box.minx - pos.x, 0, pos.x - b.box.maxx), dy = Math.max(b.box.miny - pos.y, 0, pos.y - b.box.maxy), dz = Math.max(b.box.minz - pos.z, 0, pos.z - b.box.maxz);
      if (dx * dx + dy * dy + dz * dz <= radius * radius) this.hit(b.idx, 999, null, null, who);
    }
  }

  netState() { return this.list.map(b => (b.broken ? '1' : '0')).join(''); }
  applyNet(s) {
    if (typeof s !== 'string') return;
    for (let i = 0; i < this.list.length && i < s.length; i++) if (s[i] === '1' && !this.list[i].broken) this.smash(this.list[i]);
  }
  // the host's event: break it where it was hit (the sound and the shower where they'd be)
  event(idx, x, y, z) {
    const b = this.list[idx];
    if (!b || b.broken) return;
    this.smash(b, Number.isFinite(x) ? new THREE.Vector3(x, y, z) : null);
  }
}
