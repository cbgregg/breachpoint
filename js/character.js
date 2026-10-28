// Shared character logic (player + bots): movement, health, weapons, operator model + animation
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYER, GRENADE, TEAMS, MELEE, FRIENDLY_CSS, ENEMY_CSS, typeOf, EQUIPMENT } from './config.js';
import { WeaponState, buildGun } from './weapons.js';
import { parseLoadout } from './attachments.js';
import { cloneSoldier } from './assets.js';
import { createMotion, driveGait, sense, applyDynamics, hitImpulse, startRagdoll, stepRagdoll, poseRagdoll } from './motion.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

// ---------- operator model ----------
let fabricNormal = null;
export function setCharacterDetail(fabricSet) { fabricNormal = fabricSet ? fabricSet.normalMap : null; }

const teamMats = [];
export function teamMat(team) {
  if (!teamMats[team]) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 });
    if (fabricNormal) {
      const n = fabricNormal.clone();
      n.repeat.set(3, 3);
      n.needsUpdate = true;
      m.normalMap = n;
      m.normalScale = new THREE.Vector2(0.6, 0.6);
    }
    teamMats[team] = m;
  }
  return teamMats[team];
}

export class Seg {
  constructor() { this.geos = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.geos.push(g);
    return this;
  }
  box(color, w, h, d, x, y, z, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz); }
  cap(color, r, len, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { return this.add(new THREE.CapsuleGeometry(r, len, 3, 10), color, x, y, z, rx, ry, rz, sx, sy, sz); }
  build(parent, mat) {
    const mesh = new THREE.Mesh(mergeGeometries(this.geos, false), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    this.geos.forEach(g => g.dispose());
    return mesh;
  }
}

function makeNameSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 30px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 6;
  g.fillStyle = color;
  g.fillText(text.toUpperCase(), 128, 26);
  g.beginPath(); g.moveTo(120, 48); g.lineTo(136, 48); g.lineTo(128, 58); g.closePath(); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
  s.scale.set(1.3, 0.325, 1);
  s.renderOrder = 10;
  return s;
}

// two-bone IK: returns elbow position
function solveElbow(S, H, a, b, pole, out) {
  const d = _v.subVectors(H, S);
  let len = d.length();
  len = clamp(len, 0.05, a + b - 0.002);
  d.normalize();
  const cosA = clamp((a * a + len * len - b * b) / (2 * a * len), -1, 1);
  const along = a * cosA, h = Math.sqrt(Math.max(0, a * a - along * along));
  const pd = _v2.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  return out.copy(S).addScaledVector(d, along).addScaledVector(pd, h);
}
const _E = new THREE.Vector3(), _H = new THREE.Vector3();
function aimLimb(group, from, to) {
  group.position.copy(from);
  _v.subVectors(to, from).normalize();
  group.quaternion.setFromUnitVectors(DOWN, _v);
}

export function buildOperator(team, weaponId, name) {
  const k = TEAMS[team].kit;
  const mat = teamMat(team);
  const skin = 0xb98463;
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.95;
  root.add(pelvis);
  new Seg()
    .box(k.pants, 0.34, 0.2, 0.22, 0, 0, 0)
    .box(k.vest, 0.37, 0.06, 0.25, 0, 0.08, 0)
    .box(k.pouch, 0.08, 0.12, 0.06, 0.17, -0.02, 0.06)
    .box(k.pouch, 0.07, 0.1, 0.07, -0.18, -0.02, 0.0)
    .build(pelvis, mat);

  const mkLeg = (x) => {
    const thigh = new THREE.Group();
    thigh.position.set(x, -0.05, 0);
    pelvis.add(thigh);
    new Seg()
      .cap(k.pants, 0.078, 0.28, 0, -0.2, 0)
      .box(k.pouch, 0.05, 0.12, 0.08, x > 0 ? 0.07 : -0.07, -0.18, 0)
      .box(k.vest, 0.11, 0.1, 0.05, 0, -0.42, -0.07)
      .build(thigh, mat);
    const shin = new THREE.Group();
    shin.position.y = -0.43;
    thigh.add(shin);
    new Seg()
      .cap(k.pants, 0.064, 0.3, 0, -0.21, 0)
      .box(k.boot, 0.12, 0.13, 0.27, 0, -0.415, -0.04)
      .box(k.boot, 0.13, 0.1, 0.14, 0, -0.33, 0.0)
      .build(shin, mat);
    return { thigh, shin };
  };
  const L = mkLeg(-0.1), R = mkLeg(0.1);

  const spine = new THREE.Group();
  spine.position.y = 0.08;
  pelvis.add(spine);
  const torso = new Seg()
    .box(k.shirt, 0.36, 0.48, 0.22, 0, 0.27, 0)
    .cap(k.shirt, 0.085, 0.06, -0.19, 0.45, 0, 0, 0, Math.PI / 2)
    .cap(k.shirt, 0.085, 0.06, 0.19, 0.45, 0, 0, 0, Math.PI / 2)
    .box(k.vest, 0.39, 0.36, 0.29, 0, 0.27, 0)
    .box(k.vest, 0.06, 0.08, 0.29, -0.17, 0.48, 0)
    .box(k.vest, 0.06, 0.08, 0.29, 0.17, 0.48, 0);
  for (let i = 0; i < 3; i++) torso.box(k.pouch, 0.1, 0.13, 0.06, -0.12 + i * 0.12, 0.2, -0.17);
  torso.box(k.pouch, 0.12, 0.1, 0.05, 0, 0.36, -0.165)
    .box(k.pouch, 0.07, 0.16, 0.06, -0.21, 0.24, 0.04)
    .box(k.vest, 0.28, 0.34, 0.1, 0, 0.27, 0.19)
    .cap(0x1a1a1a, 0.012, 0.18, -0.13, 0.42, -0.12, 0.2)
    .box(k.accent, 0.06, 0.04, 0.005, 0.12, 0.42, -0.148)
    .add(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10), skin, 0, 0.54, 0);
  torso.build(spine, mat);

  const head = new THREE.Group();
  head.position.y = 0.6;
  spine.add(head);
  const hs = new Seg();
  if (team === 0) {
    hs.add(new THREE.SphereGeometry(0.105, 14, 10), skin, 0, 0.1, 0, 0, 0, 0, 0.92, 1.08, 1)
      .add(new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), k.helmet, 0, 0.12, 0.005, 0, 0, 0, 1, 0.92, 1.06)
      .box(k.helmet, 0.26, 0.02, 0.26, 0, 0.125, 0.005)
      .box(0x1a1a1a, 0.05, 0.035, 0.03, 0, 0.21, -0.12)
      .box(0x1a1a1a, 0.02, 0.03, 0.12, -0.13, 0.15, 0)
      .box(0x1a1a1a, 0.02, 0.03, 0.12, 0.13, 0.15, 0)
      .add(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), 0x2a2b2c, -0.115, 0.085, 0.0, 0, 0, Math.PI / 2)
      .add(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), 0x2a2b2c, 0.115, 0.085, 0.0, 0, 0, Math.PI / 2)
      .box(0x0c0d0e, 0.17, 0.04, 0.03, 0, 0.115, -0.095);
  } else {
    hs.add(new THREE.SphereGeometry(0.11, 14, 10), k.shirt, 0, 0.1, 0, 0, 0, 0, 0.94, 1.1, 1.02)
      .add(new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), k.helmet, 0, 0.13, 0.005)
      .box(skin, 0.13, 0.03, 0.02, 0, 0.115, -0.1)
      .box(0x0a0a0a, 0.1, 0.012, 0.022, 0, 0.115, -0.101)
      .add(new THREE.TorusGeometry(0.085, 0.045, 6, 14), k.accent, 0, -0.03, 0, Math.PI / 2);
  }
  hs.build(head, mat);

  const aim = new THREE.Group();
  aim.position.set(0, 0.42, 0);
  spine.add(aim);
  const gunHolder = new THREE.Group();
  aim.add(gunHolder);

  const mkArm = () => {
    const upper = new THREE.Group(), fore = new THREE.Group();
    new Seg().cap(k.shirt, 0.058, 0.2, 0, -0.14, 0).box(k.vest, 0.12, 0.08, 0.13, 0, -0.04, 0).build(upper, mat);
    new Seg().cap(k.shirt, 0.05, 0.19, 0, -0.13, 0).box(k.glove, 0.075, 0.1, 0.09, 0, -0.29, 0).build(fore, mat);
    aim.add(upper, fore);
    return { upper, fore };
  };
  const armR = mkArm(), armL = mkArm();

  const nameTag = makeNameSprite(name, team === 0 ? FRIENDLY_CSS : ENEMY_CSS);
  nameTag.position.y = 2.15;
  root.add(nameTag);

  const model = { root, pelvis, L, R, spine, head, aim, gunHolder, armR, armL, nameTag, gun: null, weaponId: null, kick: 0, team };
  setOperatorWeapon(model, weaponId);
  return model;
}

const POLE_R = new THREE.Vector3(0.7, -1, 0.4), POLE_L = new THREE.Vector3(-0.8, -1, 0.1);
const SH_R = new THREE.Vector3(0.19, 0.03, 0), SH_L = new THREE.Vector3(-0.19, 0.03, 0);

// Third-person guns are built once per weapon + attachments and cloned after that: a clone shares the
// template's geometry and materials, so swapping loadouts on respawn costs no rebuild and no new shaders
// (building one from scratch took ~100 ms and caused a visible hitch when bots changed class).
const GUN_CACHE = new Map();
function cachedGun(weaponId, att, key) {
  const ck = weaponId + '|' + key;
  let tpl = GUN_CACHE.get(ck);
  if (!tpl) {
    const gun = buildGun(weaponId, { att });
    flattenGun(gun);
    const nodes = [];
    gun.group.traverse(o => nodes.push(o));
    tpl = { gun, index: new Map(nodes.map((o, i) => [o, i])) };
    GUN_CACHE.set(ck, tpl);
  }
  const group = tpl.gun.group.clone(true);
  const nodes = [];
  group.traverse(o => nodes.push(o));
  const out = {};
  for (const [k, v] of Object.entries(tpl.gun)) {
    if (v && v.isObject3D) out[k] = tpl.index.has(v) ? nodes[tpl.index.get(v)] : v;
    else if (v && v.isVector3) out[k] = v.clone();
    else out[k] = v;
  }
  out.group = group;
  return out;
}

// Third-person guns: every static part merged into one mesh per material (a model gun is 20-40 separate
// meshes, which is 20-40 draw calls per player), and no sun shadow (a few pixels of shadow for thousands of
// triangles in the shadow pass). Moving parts (magazine, pump, bolt) and anything the code points at stay separate.
function flattenGun(gun) {
  const g = gun.group;
  g.updateMatrixWorld(true);
  const keep = new Set(Object.values(gun).filter(v => v && v.isObject3D));
  const moving = [gun.mag, gun.pump, gun.bolt].filter(Boolean);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), rel = new THREE.Matrix4();
  const groups = new Map(), victims = [];
  g.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = false;
    if (keep.has(o) || Array.isArray(o.material) || o.geometry.groups.length > 1 || o.isSkinnedMesh) return;
    for (let p = o.parent; p && p !== g; p = p.parent) if (moving.includes(p) || keep.has(p) && p !== g && p.isMesh) return;
    if (moving.includes(o.parent)) return;
    rel.multiplyMatrices(inv, o.matrixWorld);
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.morphAttributes = {};
    geo.applyMatrix4(rel);
    const k = o.material.uuid;
    if (!groups.has(k)) groups.set(k, { mat: o.material, geos: [], order: o.renderOrder });
    groups.get(k).geos.push(geo);
    victims.push(o);
  });
  if (victims.length < 2) return;
  for (const o of victims) o.parent.remove(o);
  for (const { mat, geos, order } of groups.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach(x => x.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.renderOrder = order; m.castShadow = false; m.receiveShadow = true;
    g.add(m);
  }
}

// build a gun ahead of time (during loading) so it's ready to clone
export function prewarmGun(wdef) { cachedGun(wdef.id, wdef.att, wdef.attKey); }

export function setOperatorWeapon(model, wdef) {
  const weaponId = typeof wdef === 'string' ? wdef : wdef.id;
  const key = typeof wdef === 'string' ? wdef : wdef.attKey;
  if (model.weaponKey === key) return;
  model.weaponKey = key;
  const att = typeof wdef === 'string' ? null : wdef.att;
  if (model.soldier) {
    model.gunHolder.clear();
    model.gun = cachedGun(weaponId, att, key);
    model.weaponId = weaponId;
    model.gunHolder.add(model.gun.group);
    return;
  }
  model.gunHolder.clear();
  const gun = cachedGun(weaponId, att, key);
  model.gun = gun;
  model.weaponId = weaponId;
  model.gunHolder.add(gun.group);
  if (typeOf(weaponId) === 'pistol') model.gunHolder.position.set(0.04, -0.02, -0.46);
  else model.gunHolder.position.set(0.12, -0.06, -0.26);
  // hand targets in aim-group space
  _H.copy(model.gunHolder.position);
  aimArm(model.armR, SH_R, _H, POLE_R);
  _H.copy(gun.foregrip.position).add(model.gunHolder.position);
  aimArm(model.armL, SH_L, _H, POLE_L);
}

function aimArm(arm, S, H, pole) {
  solveElbow(S, H, 0.29, 0.29, pole, _E);
  aimLimb(arm.upper, S, _E);
  aimLimb(arm.fore, _E, H);
}

// melee swing seen from outside: a short wind-up back, the strike, a hold, then an eased recovery (matches the
// first-person animation's timing)
function meleeSwing(t) {
  const p = Math.max(0, Math.min(1, 1 - t / MELEE.time));
  const sm = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const q = Math.max(0, Math.min(1, (p - 0.5) / 0.5)), ease = q * q * q * (q * (q * 6 - 15) + 10);
  return -0.35 * sm(0, 0.2, p) * (1 - sm(0.2, 0.34, p)) + sm(0.2, 0.34, p) * (1 - ease);
}

// ---------- character ----------
export class Character {
  constructor(game, { name, team, isBot, primary, remote = false, puppet = false, id }) {
    this.game = game;
    this.id = id ?? (Character.nextId = (Character.nextId || 0) + 1);
    this.remote = remote;   // host side: a human on another machine, driven by their inputs
    this.puppet = puppet;   // guest side: anyone but ourselves, driven by host snapshots
    this.name = name;
    this.team = team;
    this.isBot = isBot;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.radius = PLAYER.radius;
    this.height = PLAYER.height;
    this.crouchT = 0; this.wantCrouch = false; this.proneT = 0; this.wantProne = false;
    this.onGround = false;
    this.health = PLAYER.maxHealth;
    this.alive = false;
    const lo = parseLoadout(primary);
    this.loadout = lo.str;
    this.primaryId = lo.primary;
    this.weapons = [new WeaponState(lo.primary, lo.att), new WeaponState(lo.secondary || 'pistol', lo.pistolAtt)];
    this.lethal = lo.lethal; this.tactical = lo.tactical; this.tacticals = 0; this.stunT = 0;
    this.pendingLoadout = null;
    this.cur = 0; this.prev = 1; this.switchT = 0;
    this.grenades = GRENADE.start; this.grenadeCd = 0;
    this.meleeCd = 0; this.meleeT = 0;
    this.slideT = 0; this.slideDir = new THREE.Vector3();
    this.kills = 0; this.deaths = 0; this.assists = 0; this.score = 0; this.streak = 0;
    this.respawnT = 0; this.spawnProtect = 0;
    this.lastDamageT = -99; this.lastFireT = -99;
    this.damagers = new Map();
    this.bloom = 0; this.adsT = 0; this.sprinting = false;
    this.tacSprinting = false; this.tacFuel = PLAYER.tacTime; this.tacIdle = 9;
    this.lastAttacker = null; this.lastAttackerT = -99;
    this.killer = null; this.deathT = 0; this.deathDir = 1;
    this.stepAccum = 0; this.animPhase = 0;
    this.model = null;
    if (isBot || remote || puppet) {
      this.model = buildSoldierModel(team, this.weapons[0].def, name) || buildOperator(team, this.weapons[0].def, name);
      game.scene.add(this.model.root);
      this.model.root.visible = false;
    }
  }

  get weapon() { return this.weapons[this.cur]; }
  // Infected: team 1 are the infected (knife only, a step faster)
  get infected() { return !!this.game.inf && this.team === 1; }
  // change sides mid-match (Infected): the third-person model is rebuilt in the new team's kit
  setTeam(t) {
    if (t === this.team) return;
    this.team = t;
    if (this.model) {
      const vis = this.model.root.visible;
      this.game.scene.remove(this.model.root);
      this.model = buildSoldierModel(t, this.weapon.def, this.name) || buildOperator(t, this.weapon.def, this.name);
      this.game.scene.add(this.model.root);
      this.model.root.visible = vis;
      setOperatorWeapon(this.model, this.weapon.def);
    }
  }
  // the character this machine looks through; its sounds play unpositioned
  get local() { return this === this.game.player; }
  get spos() { return this.local ? null : this.pos; }
  get eyeHeight() { return lerp(lerp(PLAYER.eye, PLAYER.crouchEye, this.crouchT), PLAYER.proneEye, this.proneT); }
  eyePos(out) { return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z); }
  chestPos(out) { return out.set(this.pos.x, this.pos.y + this.height * 0.68, this.pos.z); }
  headPos(out) { return out.set(this.pos.x, this.pos.y + this.height - 0.16, this.pos.z); }
  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // swap weapons/attachments (applied at spawn, like changing class in CoD)
  setLoadout(str) {
    const lo = parseLoadout(str);
    this.loadout = lo.str;
    this.primaryId = lo.primary;
    this.weapons = [new WeaponState(lo.primary, lo.att), new WeaponState(lo.secondary || 'pistol', lo.pistolAtt)];
    this.lethal = lo.lethal; this.tactical = lo.tactical;
    this.cur = 0; this.prev = 1;
    if (this.model) setOperatorWeapon(this.model, this.weapon.def);
    if (this === this.game.player && this.game.playerCtl) this.game.playerCtl.buildViewmodels();
  }

  spawn(p, yaw) {
    this.spawnT = this.game.time;
    this.tacFuel = PLAYER.tacTime; this.tacSprinting = false; this.tacIdle = 9;
    if (this.pendingLoadout) { const l = this.pendingLoadout; this.pendingLoadout = null; if (l !== this.loadout) this.setLoadout(l); }
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.health = PLAYER.maxHealth;
    this.alive = true; this.mantle = null;
    this.crouchT = 0; this.wantCrouch = false; this.proneT = 0; this.wantProne = false; this.height = PLAYER.height;
    this.slideT = 0; this.meleeT = 0; this.meleeCd = 0;
    this.weapons.forEach(w => w.refill());
    this.cur = 0; this.prev = 1; this.switchT = 0.4;
    if (this.model) setOperatorWeapon(this.model, this.weapon.def);
    this.grenades = this.game.gg ? 0 : EQUIPMENT[this.lethal].count;   // Gun Game: guns only
    this.tacticals = this.game.gg ? 0 : EQUIPMENT[this.tactical].count;
    this.stunT = 0;
    this.spawnProtect = PLAYER.spawnProtect;
    this.damagers.clear();
    this.streak = 0;
    this.bloom = 0; this.adsT = 0;
    this.lastAttacker = null;
    if (this.model) {
      const r = this.model.root;
      r.visible = true;
      r.rotation.set(0, yaw, 0);
      r.position.copy(p);
    }
  }

  switchTo(i) {
    if (i === this.cur || !this.alive) return;
    this.weapon.cancelReload();
    this.prev = this.cur;
    this.cur = i;
    this.switchT = 0.4;
    if (this.model) setOperatorWeapon(this.model, this.weapon.def);
    this.game.audio.play('switch', this.spos);
  }

  reload() {
    if (this.meleeT > 0) return;
    if (this.weapon.startReload()) {
      this.game.audio.play('reload', this.spos, { duration: this.weapon.reloadTotal, weapon: this.weapon.id });
      if (this.weapon.mag <= this.weapon.def.mag * 0.3 && this.weapon.def.mag >= 5) this.game.callout(this, 'reloading', this.isBot ? 0.15 : 0.2);
    }
  }

  currentSpread() {
    const d = this.weapon.def;
    // aiming: full sight accuracy from 80% of the way in (so quick-scopes land where the reticle is),
    // and moving or recent shots barely widen it while aimed
    let k = Math.min(1, this.adsT / 0.8); k = k * k * (3 - 2 * k);
    let s = lerp(d.spread, d.adsSpread, k);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    s += d.moveSpread * Math.min(1, hs / PLAYER.walk) * (1 - (d.scope ? 0.96 : 0.85) * k);
    if (!this.onGround) s += 0.05 * (1 - 0.5 * k);
    if (this.proneT > 0.6) s *= 0.55;
    else if (this.crouchT > 0.5 && this.slideT <= 0) s *= 0.75;
    return s + this.bloom * (1 - 0.65 * k);
  }

  tryFire(origin, dir) {
    if (this.infected || this.weapon.def.melee) { this.melee(); return false; }   // the knife: fire slashes (no shot, no muzzle flash)
    const w = this.weapon;
    if (!this.alive || this.switchT > 0 || w.reloading || w.cooldown > 0 || this.meleeT > 0) return false;
    if (w.mag <= 0) {
      if (!w.dryClicked) { this.game.audio.play('dry', this.spos); w.dryClicked = true; }
      if (w.reserve > 0) this.reload();
      return false;
    }
    w.mag--;
    // keep the bit of the last frame that ran past when this shot was due: the gun fires at its real rate and
    // an even rhythm at any frame rate (resetting to a whole interval each shot lost up to a frame a shot:
    // a 900 RPM gun fired at 720 at 60 fps, unevenly, and faster or slower on other screens)
    const iv = 60 / w.def.rpm;
    w.cooldown = (w.cooldown < 0 && w.cooldown > -iv ? w.cooldown : 0) + iv;
    this.lastFireT = this.game.time;
    this.spawnProtect = 0;
    this.sprinting = false; this.tacSprinting = false;
    this.game.shoot(this, w.def, origin, dir, this.currentSpread());
    this.bloom = Math.min(0.06, this.bloom + w.def.recoilPitch * 0.35);
    if (this.model) this.model.kick = 1;
    if (w.mag === 0 && w.reserve > 0) setTimeout(() => this.alive && this.reload(), 220);
    return true;
  }

  canThrow() { return this.alive && this.grenades > 0 && this.grenadeCd <= 0 && this.meleeT <= 0; }

  // cook: seconds the grenade was held after pulling the pin (bots cook a little so you can't run)
  canTactical() { return this.alive && this.tacticals > 0 && this.grenadeCd <= 0 && this.meleeT <= 0; }
  throwGrenade(target, cook = target ? 0.5 + Math.random() * 0.8 : 0) {
    if (!this.canThrow()) return false;
    const spec = EQUIPMENT[this.lethal];
    this.grenades--;
    this.grenadeCd = spec.knife ? 0.55 : GRENADE.cooldown;
    this.throwDur = this.grenadeCd;   // the viewmodel's throw swing is timed to this (a knife is quicker than a frag)
    this.game.callout(this, `${this.lethal}_out`, 0.9);
    this.weapon.cancelReload();
    this.game.throwGrenade(this, target, spec.cook ? Math.max(0, Math.min(spec.fuse, cook || 0)) : 0, this.lethal);
    return true;
  }
  throwTactical(target) {
    if (!this.canTactical()) return false;
    this.tacticals--;
    this.grenadeCd = GRENADE.cooldown;
    this.throwDur = this.grenadeCd;
    this.game.callout(this, `${this.tactical}_out`, 0.9);
    this.weapon.cancelReload();
    this.game.throwGrenade(this, target, 0, this.tactical);
    return true;
  }
  // stunned (stun grenade, shock stick): slow feet and slow aim for a few seconds
  stun(sec) { if (this.alive && sec > 0) this.stunT = Math.max(this.stunT || 0, Math.min(5, sec)); }

  melee() {
    if (!this.alive || this.meleeCd > 0 || this.switchT > 0) return false;
    this.weapon.cancelReload();
    this.meleeCd = MELEE.cooldown;
    this.meleeT = MELEE.time;
    this.game.melee(this);
    return true;
  }

  // visual reaction to being hit (runs on every machine): dir = travel direction of the shot
  hitReact(point, dir, power = 1, head = false, up = 0) {
    this.lastHit = { t: this.game.time, point: point.clone(), dir: dir.clone().normalize(), power, head, up };
    if (this.alive && this.model && this.model.motion) hitImpulse(this.model.motion, this.yaw, this.lastHit.dir, power, head);
  }

  takeDamage(amount, attacker, weaponId, headshot, fromPos) {
    if (!this.alive || this.spawnProtect > 0 || !this.game.live || this.game.mode === 'guest') return;
    if (attacker && attacker !== this && !this.game.foes(attacker, this) && !this.game.settings.friendlyFire) return;
    this.health -= amount;
    this.lastDamageT = this.game.time;
    if (attacker && attacker !== this) {
      const rec = this.damagers.get(attacker) || { dmg: 0, t: 0 };
      rec.dmg += amount; rec.t = this.game.time;
      this.damagers.set(attacker, rec);
      this.lastAttacker = attacker; this.lastAttackerT = this.game.time;
    }
    this.game.onDamaged(this, attacker, amount, headshot, fromPos);
    if (this.health <= 0) {
      this.health = 0;
      this.game.onKill(attacker, this, weaponId, headshot);
    } else if (this.isBot && amount >= 20 && this.health < 55) this.game.callout(this, 'hit', 0.1);   // "I'm hit!"
  }

  updateCommon(dt) {
    for (const w of this.weapons) w.update(dt);
    if (this.switchT > 0) this.switchT -= dt;
    if (this.grenadeCd > 0) this.grenadeCd -= dt;
    if (this.stunT > 0) this.stunT = Math.max(0, this.stunT - dt);
    if (this.meleeCd > 0) this.meleeCd -= dt;
    if (this.meleeT > 0) this.meleeT -= dt;
    if (this.spawnProtect > 0) this.spawnProtect -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    if (this.alive && this.health < PLAYER.maxHealth && this.game.time - this.lastDamageT > PLAYER.regenDelay) {
      this.health = Math.min(PLAYER.maxHealth, this.health + PLAYER.regenRate * dt);
    }
  }

  // slideReq: crouch was just pressed this frame (starts a slide when sprinting)
  // Mantle: run into something waist-to-chest high and you vault onto it; press jump in front of anything up
  // to about head height and you pull yourself up. Quick and fully scripted (no physics while it runs), so
  // the host and the player's own machine play it the same way from the same inputs.
  findLedge(wish, maxH) {
    const phys = this.game.physics, p = this.pos, r = this.radius;
    const wl = Math.hypot(wish.x, wish.z);
    if (wl < 0.4) return null;
    const dx = wish.x / wl, dz = wish.z / wl;
    const fx = p.x + dx * (r + 0.32), fz = p.z + dz * (r + 0.32), cw = 0.14;
    let top = -Infinity, wall = false;
    const near = phys.boxesIn(fx - cw, fz - cw, fx + cw, fz + cw);   // (just the boxes there, not the whole map's)
    for (let i = 0; i < near.length; i++) {
      const b = near[i];
      if (fx - cw >= b.maxx || fx + cw <= b.minx || fz - cw >= b.maxz || fz + cw <= b.minz) continue;
      if (b.maxy <= p.y + PLAYER.stepHeight + 0.02 || b.miny > p.y + maxH) continue;
      if (b.maxy > p.y + maxH) { wall = true; break; }
      if (b.maxy > top) top = b.maxy;
    }
    if (wall || top === -Infinity) return null;
    // somewhere to stand on top (crouched if that's all that fits) and nothing above our head on the way up
    const tx = p.x + dx * (r + 0.5), tz = p.z + dz * (r + 0.5);
    let crouch = false;
    if (phys.overlap(tx, top + 0.01, tz, r * 0.9, PLAYER.height - 0.02)) {
      if (phys.overlap(tx, top + 0.01, tz, r * 0.9, PLAYER.crouchHeight - 0.02)) return null;
      crouch = true;
    }
    if (phys.overlap(p.x, p.y + 0.05, p.z, r * 0.9, top - p.y + (crouch ? PLAYER.crouchHeight : PLAYER.height) - 0.05)) return null;
    return { x: tx, z: tz, y: top, crouch, h: top - p.y };
  }

  updateMantle(dt) {
    const m = this.mantle;
    m.t = Math.min(1, m.t + dt / m.dur);
    // up first, then over the edge: height leads the forward motion
    const up = 1 - Math.pow(1 - Math.min(1, m.t / 0.7), 2), fwd = Math.max(0, (m.t - 0.35) / 0.65), fw = fwd * fwd * (3 - 2 * fwd);
    this.pos.set(m.x0 + (m.x - m.x0) * fw, m.y0 + (m.y - m.y0) * up, m.z0 + (m.z - m.z0) * fw);
    this.vel.set(0, 0, 0);
    this.onGround = false;
    if (m.t >= 1) {
      this.pos.set(m.x, m.y, m.z);
      this.vel.set(m.vx, 0, m.vz);
      this.onGround = true;
      this.mantle = null;
    }
  }

  updateMovement(dt, wish, sprint, jump, slideReq = false, tac = false) {
    const phys = this.game.physics;
    if (this.mantle) { if (!this.alive) this.mantle = null; else { this.updateMantle(dt); return; } }
    if (this.alive && this.proneT < 0.1 && this.slideT <= 0) {
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const fwdIn = (this.vel.x * wish.x + this.vel.z * wish.z) / Math.max(1e-3, hs) > 0.5 || hs < 0.5;
      // auto vault when running into it; jump pulls you up onto anything up to about 2 m (also mid-air)
      const autoV = this.onGround && (sprint || hs > 3.2) && fwdIn;
      const L = (jump || autoV) ? this.findLedge(wish, jump ? 2.05 : 1.3) : null;
      if (L && (jump || L.h >= 0.5)) {
        const dur = 0.2 + 0.12 * L.h;
        this.mantle = { t: 0, dur, x0: this.pos.x, y0: this.pos.y, z0: this.pos.z, x: L.x, y: L.y, z: L.z, vx: wish.x * 3, vz: wish.z * 3, h: L.h };
        if (L.crouch) this.wantCrouch = true;
        this.slideT = 0;
        this.game.audio.play('land', this.spos);
        this.updateMantle(dt);
        return;
      }
    }
    const hs0 = Math.hypot(this.vel.x, this.vel.z);
    if (slideReq && this.sprinting && this.onGround && hs0 > PLAYER.walk && this.slideT <= 0) {
      this.slideT = PLAYER.slideTime;
      this.slideDir.set(this.vel.x, 0, this.vel.z).normalize();
      this.vel.x = this.slideDir.x * PLAYER.slideSpeed;
      this.vel.z = this.slideDir.z * PLAYER.slideSpeed;
      this.game.audio.play('slide', this.spos);
    }
    const sliding = this.slideT > 0;
    // tactical sprint charge: drains while in use, refills a second after you stop
    if (this.tacSprinting) { this.tacFuel = Math.max(0, this.tacFuel - dt); this.tacIdle = 0; }
    else { this.tacIdle = (this.tacIdle || 0) + dt; if (this.tacIdle > 1) this.tacFuel = Math.min(PLAYER.tacTime, this.tacFuel + dt * PLAYER.tacTime / PLAYER.tacRecharge); }
    if (sliding) this.tacSprinting = false;
    // prone: only from the ground, not mid-slide; getting up needs room to kneel
    let pTarget = this.wantProne && this.onGround && !sliding ? 1 : this.wantProne && this.proneT > 0 ? 1 : 0;
    if (pTarget === 0 && this.proneT > 0 && phys.overlap(this.pos.x, this.pos.y + 0.05, this.pos.z, this.radius * 0.95, PLAYER.crouchHeight - 0.05)) pTarget = 1;
    this.proneT += Math.sign(pTarget - this.proneT) * Math.min(Math.abs(pTarget - this.proneT), dt * 2.6);
    let target = (this.wantCrouch || sliding || this.proneT > 0) ? 1 : 0;
    if (target === 0 && this.crouchT > 0 && phys.overlap(this.pos.x, this.pos.y + 0.05, this.pos.z, this.radius * 0.95, PLAYER.height - 0.05)) target = 1;
    this.crouchT += Math.sign(target - this.crouchT) * Math.min(Math.abs(target - this.crouchT), dt * (sliding ? 10 : 7));
    this.height = lerp(lerp(PLAYER.height, PLAYER.crouchHeight, this.crouchT), PLAYER.proneHeight, this.proneT);
    const prone = this.proneT > 0.5;

    if (sliding) {
      this.slideT -= dt;
      const k = Math.max(0, this.slideT / PLAYER.slideTime);
      const sp = lerp(PLAYER.crouchSpeed, PLAYER.slideSpeed, k * k);
      this.vel.x = this.slideDir.x * sp + wish.x * 1.2;
      this.vel.z = this.slideDir.z * sp + wish.z * 1.2;
      this.sprinting = false;
      if (jump && this.onGround) { this.slideT = 0; }
    } else {
      this.sprinting = sprint && this.crouchT < 0.3 && this.proneT <= 0;
      this.tacSprinting = !!tac && this.sprinting && this.tacFuel > 0.05;
      let speed = this.proneT > 0.05 ? PLAYER.proneSpeed * (prone ? 1 : 0.4) : this.crouchT > 0.5 ? PLAYER.crouchSpeed : this.tacSprinting ? PLAYER.tacSprint : this.sprinting ? PLAYER.sprint : PLAYER.walk;
      speed *= lerp(1, PLAYER.adsSpeedMult, this.adsT);
      if (this.infected) speed *= 1.12;
      if (this.stunT > 0) speed *= 1 - 0.5 * Math.min(1, this.stunT / 1.5);
      const accel = this.onGround ? PLAYER.accelGround : PLAYER.accelAir;
      const tx = wish.x * speed, tz = wish.z * speed;
      let dx = tx - this.vel.x, dz = tz - this.vel.z;
      const dl = Math.hypot(dx, dz), maxC = accel * dt;
      if (dl > maxC) { dx *= maxC / dl; dz *= maxC / dl; }
      this.vel.x += dx; this.vel.z += dz;
    }

    if (jump && this.proneT > 0) { this.wantProne = false; jump = false; } // jump from prone gets you up to a crouch
    // a moment's grace after running off an edge: the jump still goes (the press was "on time" to the player)
    this.coyote = this.onGround ? 0.1 : Math.max(0, (this.coyote || 0) - dt);
    if (jump && (this.onGround || (this.coyote > 0 && this.vel.y <= 0)) && (this.crouchT < 0.5 || sliding)) {
      this.vel.y = PLAYER.jump;
      this.onGround = false;
      this.coyote = 0;
      this.jumpedT = this.game.time;
      this.wantCrouch = false;
      this.game.audio.play('jump', this.spos);
    }
    const wasGround = this.onGround;
    const fallSpeed = this.vel.y;
    this.vel.y -= PLAYER.gravity * dt;
    phys.moveEntity(this, dt);
    if (!wasGround && this.onGround && fallSpeed < -7) this.game.audio.play('land', this.spos);

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 1.5 && !sliding) {
      this.stepAccum += hs * dt;
      const stride = this.sprinting ? 2.5 : 1.9;
      if (this.stepAccum > stride) {
        this.stepAccum = 0;
        if (this.crouchT < 0.5) {
          // what's underfoot decides the sound (the floor box under the feet)
          const hit = this.game.physics.raycast(_stepO.set(this.pos.x, this.pos.y + 0.2, this.pos.z), _down, 0.6);
          const sf = hit && hit.box.surface, surface = sf === 'ground' ? (this.game.world && this.game.world.groundSurface) || 'concrete' : sf;
          this.game.audio.play('step', this.spos, { self: this.local, run: this.sprinting, surface });
        }
      }
    }
    if (this.pos.y < -15) this.takeDamage(999, null, 'fall', false, this.pos);
  }

  updateModel(dt, showName, lod = 1) {
    if (!this.model) return;
    if (this.model.soldier) {
      // level of detail: off-screen bots only move their root; distant ones animate at a lower rate
      const m = this.model;
      m.accDt = (m.accDt || 0) + dt;
      if (lod === 0 && this.alive) {
        m.root.position.copy(this.pos); m.root.rotation.set(0, this.yaw, 0);
        if (!this.alive && this.game.time - this.deathT > 5) m.root.visible = false;
        return;
      }
      // distant: the body still moves every frame, only the skeleton pose updates at ~30 Hz
      if (((lod === 2 && m.accDt < 1 / 30) || (lod === 3 && m.accDt < 1 / 15)) && this.alive) {
        if (this.alive) { m.root.position.copy(this.pos); m.root.rotation.set(0, this.yaw, 0); }
        return;
      }
      animateSoldier(this, m.accDt, showName);
      m.accDt = 0;
      return;
    }
    const m = this.model;
    const r = m.root;
    if (!this.alive) {
      const t = this.game.time - this.deathT;
      const k1 = Math.min(1, t / 0.3), k2 = clamp((t - 0.15) / 0.55, 0, 1);
      const e2 = k2 * k2 * (3 - 2 * k2);
      m.L.thigh.rotation.x = m.R.thigh.rotation.x = lerp(0, 1.3, k1);
      m.L.shin.rotation.x = m.R.shin.rotation.x = lerp(0, -1.9, k1);
      m.pelvis.position.y = lerp(0.95, 0.5, k1) - e2 * 0.3;
      m.aim.rotation.x = lerp(m.aim.rotation.x, -1.2, Math.min(1, dt * 6));
      m.head.rotation.x = lerp(0, 0.5, e2);
      r.rotation.x = -this.deathDir * e2 * Math.PI / 2.2;
      r.rotation.z = e2 * 0.2 * this.deathDir;
      m.nameTag.visible = false;
      if (t > 5) r.visible = false;
      return;
    }
    r.visible = true;
    r.position.copy(this.pos);
    r.rotation.set(0, this.yaw, 0);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const fwd = -(this.vel.x * s + this.vel.z * c);
    const side = this.vel.x * c - this.vel.z * s;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const sliding = this.slideT > 0;
    this.animPhase += hs * dt * (this.sprinting ? 1.7 : 2.3);
    const amt = Math.min(1, hs / 5) * (this.onGround && !sliding ? 1 : 0.15);
    const fr = hs > 0.2 ? fwd / hs : 1, sr = hs > 0.2 ? side / hs : 0;
    const sw = Math.sin(this.animPhase) * (this.sprinting ? 0.85 : 0.55) * amt;
    const cr = this.crouchT;
    const bend = (ph) => Math.max(0, Math.sin(ph + 1.3)) * (this.sprinting ? 1.4 : 0.9) * amt;
    m.L.thigh.rotation.x = lerp(0, 1.15, cr) + sw * fr;
    m.R.thigh.rotation.x = lerp(0, 1.15, cr) - sw * fr;
    m.L.thigh.rotation.z = -sw * sr * 0.5;
    m.R.thigh.rotation.z = sw * sr * 0.5;
    m.L.shin.rotation.x = lerp(0, -1.95, cr) - bend(this.animPhase);
    m.R.shin.rotation.x = lerp(0, -1.95, cr) - bend(this.animPhase + Math.PI);
    if (sliding) {
      m.L.thigh.rotation.x = 1.4; m.L.shin.rotation.x = -0.4;
      m.R.thigh.rotation.x = 0.9; m.R.shin.rotation.x = -2.0;
    }
    m.pelvis.position.y = lerp(0.95, 0.6, cr) - Math.abs(Math.sin(this.animPhase)) * 0.035 * amt;
    m.spine.rotation.x = -(this.sprinting ? 0.22 : 0.05 * amt) - cr * 0.15;
    m.spine.rotation.y = Math.sin(this.animPhase) * 0.06 * amt;
    m.kick = Math.max(0, m.kick - dt * 12);
    const sprintLower = this.sprinting ? 0.55 : 0;
    m.aim.rotation.x = this.pitch - m.spine.rotation.x - sprintLower;
    m.aim.rotation.y = this.sprinting ? 0.5 : 0;
    m.aim.position.z = m.kick * 0.03;
    m.head.rotation.x = this.pitch * 0.5 - m.spine.rotation.x;
    if (this.meleeT > 0) m.aim.rotation.x -= meleeSwing(this.meleeT) * 0.8;
    m.aim.rotation.z = this.weapon.reloading ? Math.sin(this.weapon.reloadProgress * Math.PI) * 0.5 : 0;
    m.nameTag.visible = false; // names are drawn by the HUD (crisp on every device)
  }

  muzzleWorld(out) {
    if (this.model) {
      this.model.gun.muzzle.getWorldPosition(out);
      return out;
    }
    this.eyePos(out);
    const f = this.forward(_v);
    return out.addScaledVector(f, 0.6).add({ x: Math.cos(this.yaw) * 0.18, y: -0.18, z: -Math.sin(this.yaw) * 0.18 });
  }

  ejectWorld(out) {
    if (this.model) return this.model.gun.eject.getWorldPosition(out);
    return this.eyePos(out);
  }

  dispose() {
    if (this.model) this.game.scene.remove(this.model.root);
  }
}

// ---------- rigged soldier (Mixamo skeleton) ----------
const _stepO = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);
const _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _w3 = new THREE.Vector3(), _w4 = new THREE.Vector3(), _rtIK = new THREE.Vector3(), _ltIK = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qAim = new THREE.Quaternion();
const _eu = new THREE.Euler(0, 0, 0, 'YXZ');
const UP = new THREE.Vector3(0, 1, 0);

// rotate a bone about a world-space axis, keeping the result in its parent's space
function rotateBoneWorld(bone, axis, angle) {
  if (!angle) return;
  _qa.setFromAxisAngle(axis, angle);
  bone.getWorldQuaternion(_qb);
  _qb.premultiply(_qa);
  bone.parent.getWorldQuaternion(_qc).invert();
  bone.quaternion.copy(_qc.multiply(_qb));
  bone.updateMatrixWorld(true);
}
// swing a bone so the direction to its child joint points at `dir` (world)
function swingBone(bone, child, dir) {
  bone.getWorldPosition(_w1);
  child.getWorldPosition(_w2);
  _w2.sub(_w1).normalize();
  _qa.setFromUnitVectors(_w2, dir);
  bone.getWorldQuaternion(_qb);
  _qb.premultiply(_qa);
  bone.parent.getWorldQuaternion(_qc).invert();
  bone.quaternion.copy(_qc.multiply(_qb));
  bone.updateMatrixWorld(true);
}

function buildSoldierModel(team, weaponId, name) {
  const sol = cloneSoldier(team);
  if (!sol) return null;
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  body.add(sol.root);
  root.add(body);
  const gunHolder = new THREE.Group();
  root.add(gunHolder);
  const nameTag = makeNameSprite(name, team === 0 ? FRIENDLY_CSS : ENEMY_CSS);
  nameTag.position.y = 2.15;
  root.add(nameTag);
  const b = sol.bones;
  root.updateMatrixWorld(true);
  const len = (a, c) => b[a].getWorldPosition(_w1).distanceTo(b[c].getWorldPosition(_w2));
  const model = {
    soldier: true, root, body, gunHolder, nameTag, bones: b, mixer: sol.mixer, actions: sol.actions,
    armLen: { upper: len('RightArm', 'RightForeArm'), fore: len('RightForeArm', 'RightHand') },
    legLen: len('RightUpLeg', 'RightLeg'),
    gun: null, weaponId: null, kick: 0, team, blend: { Idle: 1, Walk: 0, Run: 0 }, legYaw: 0,
  };
  setOperatorWeapon(model, weaponId);
  model.motion = createMotion(model);
  return model;
}

// the killing blow: the last recorded hit if it was just now, otherwise a push away from the killer
function deathImpulse(c) {
  const h = c.lastHit;
  if (h && c.game.time - h.t < 0.6) return { point: h.point.clone(), dir: h.dir.clone(), power: h.power * (h.head ? 1.2 : 1), up: h.up || 0 };
  const k = c.killer;
  if (!k || k === c) return null;
  const dir = new THREE.Vector3(c.pos.x - k.pos.x, 0, c.pos.z - k.pos.z);
  if (dir.lengthSq() < 1e-4) return null;
  return { point: c.chestPos(new THREE.Vector3()), dir: dir.normalize(), power: 1 };
}

export const PRONE_POSE = { tilt: 1.42, lift: 0.14, arch: 0.45, head: 0.6 };
let PRONE_TILT = 1.42, PRONE_LIFT = 0.14, PRONE_ARCH = 0.45, PRONE_HEAD = 0.6;
export function setPronePose(p) { ({ tilt: PRONE_TILT, lift: PRONE_LIFT, arch: PRONE_ARCH, head: PRONE_HEAD } = { tilt: PRONE_TILT, lift: PRONE_LIFT, arch: PRONE_ARCH, head: PRONE_HEAD, ...p }); }
function animateSoldier(c, dt, showName) {
  const m = c.model, r = m.root, B = m.bones;
  const alive = c.alive;
  r.position.copy(c.pos);
  r.rotation.set(0, c.yaw, 0);
  const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
  const fwd = -(c.vel.x * s + c.vel.z * co);
  const side = c.vel.x * co - c.vel.z * s;
  const hs = alive ? Math.hypot(c.vel.x, c.vel.z) : 0;
  const sliding = c.slideT > 0;

  // locomotion blend
  const moving = hs > 0.4 && c.onGround && !sliding;
  const run = moving && c.sprinting;
  const target = { Idle: moving ? 0 : 1, Walk: moving && !run ? 1 : 0, Run: run ? 1 : 0 };
  const k = Math.min(1, dt * 8);
  for (const n of ['Idle', 'Walk', 'Run']) {
    m.blend[n] += (target[n] - m.blend[n]) * k;
    m.actions[n].setEffectiveWeight(m.blend[n]);
  }
  const back = fwd < -0.3 && !run;
  const mo = m.motion;
  if (alive) {
    if (mo.rag) { mo.rag = null; mo.lastPos = null; }
    sense(mo, c.pos, c.yaw, dt);
    const ph0 = mo.phase;
    driveGait(mo, m, hs * (c.crouchT > 0.5 ? 1.25 : 1), back, dt);
    // sprinting feet and slides kick up dust (works for every view: local, host and interpolated)
    if (c.onGround !== false && !c.local) {
      const crossed = (x) => (ph0 < x && mo.phase >= x) || (ph0 > mo.phase && (x > ph0 || x <= mo.phase) && !back);
      if (m.blend.Run > 0.5) {
        if (crossed(0.47)) c.game.effects.kickDust(B.LeftFoot.getWorldPosition(_w1), hs);
        if (crossed(0.95)) c.game.effects.kickDust(B.RightFoot.getWorldPosition(_w1), hs);
      }
      if (sliding && (mo.slideDust = (mo.slideDust || 0) + dt) > 0.05) { mo.slideDust = 0; c.game.effects.kickDust(c.pos, 8, true); }
    }
  }
  m.mixer.update(alive ? dt : 0);
  // prone: the whole body tips forward about the feet and slides back so the chest sits over the
  // character's position (head just ahead of it, legs out behind)
  const pr = alive ? (c.proneT || 0) : (m.proneLeft || 0);
  if (alive) m.proneLeft = pr;
  m.body.rotation.x = -pr * PRONE_TILT;
  m.body.position.z = pr * 1.0;
  r.updateMatrixWorld(true);

  // legs face the movement direction, upper body stays on the aim
  let legYaw = 0;
  if (moving) {
    legYaw = back ? Math.atan2(-side, -fwd) : Math.atan2(side, Math.max(0.01, fwd));
    legYaw = -Math.max(-1.1, Math.min(1.1, legYaw));
  }
  m.legYaw += (legYaw - m.legYaw) * Math.min(1, dt * 10);

  const right = _w4.set(co, 0, -s);
  const cr = alive ? c.crouchT : 0;
  if (alive) {
    const ly = m.legYaw * (1 - pr);   // lying down the legs stay straight behind
    rotateBoneWorld(B.Hips, UP, ly);
    rotateBoneWorld(B.Spine, UP, -ly * 0.5);
    rotateBoneWorld(B.Spine1, UP, -ly * 0.5);
  }
  const dyn = alive ? applyDynamics(mo, c, B, rotateBoneWorld, dt) : { knee: 0, drop: 0 };
  // crouch / slide: bend knees and drop the body so the feet stay planted
  let bend = (cr * 1.05 + dyn.knee * (1 - cr)) * (1 - pr);
  if (sliding) bend = 0.9;
  m.body.position.y = -2 * m.legLen * (1 - Math.cos(bend)) * 0.95 - dyn.drop + pr * PRONE_LIFT;
  if (bend > 0.01) {
    for (const sideName of ['Left', 'Right']) {
      rotateBoneWorld(B[sideName + 'UpLeg'], right, bend);
      rotateBoneWorld(B[sideName + 'Leg'], right, -2 * bend);
      rotateBoneWorld(B[sideName + 'Foot'], right, bend);
    }
  }

  if (!alive) {
    const t = c.game.time - c.deathT;
    if (!mo.rag) mo.rag = startRagdoll(m, c.game.physics, mo.vel, deathImpulse(c));
    stepRagdoll(mo.rag, dt);
    poseRagdoll(mo.rag, m, swingBone);
    m.nameTag.visible = false;
    if (t > 5) r.visible = false;
    return;
  }
  r.visible = true;

  // aim: spine pitch, then place the gun in an aim frame in front of the chest
  const tac = c.tacSprinting && c.sprinting;
  // third person: tactical sprint is the sprint carry (gun low and across the body, both hands on it); the high-ported pose is first person only
  const pitch = tac ? -0.85 : c.pitch - (c.sprinting ? 0.5 : 0); // tac: muzzle dropped, held down along the body
  rotateBoneWorld(B.Spine1, right, -pitch * 0.3);
  rotateBoneWorld(B.Spine2, right, -pitch * 0.3);
  rotateBoneWorld(B.Head, right, -pitch * 0.25);
  if (pr > 0.01) { // lying down: arch the chest and lift the head to look along the ground
    rotateBoneWorld(B.Spine1, right, PRONE_ARCH * pr);
    rotateBoneWorld(B.Spine2, right, PRONE_ARCH * pr);
    rotateBoneWorld(B.Head, right, PRONE_HEAD * pr);
  }
  m.kick = Math.max(0, m.kick - dt * 12);
  _eu.set(pitch, c.yaw + (tac ? 0.35 : c.sprinting ? 0.6 : 0), c.weapon.reloading ? Math.sin(c.weapon.reloadProgress * Math.PI) * 0.5 : 0);
  _qAim.setFromEuler(_eu);
  if (c.meleeT > 0) _qAim.multiply(_qa.setFromAxisAngle(_w1.set(1, 0, 0), -meleeSwing(c.meleeT) * 0.7));
  const pistol = typeOf(m.weaponId) === 'pistol';
  B.Spine2.getWorldPosition(_w3);
  _w1.set(pistol ? 0.04 : 0.13, pistol ? 0.12 : tac ? -0.02 : 0.04, (pistol ? -0.42 : tac ? -0.2 : -0.26) + m.kick * 0.04).applyQuaternion(_qAim);
  _w3.add(_w1); // grip, world
  m.gunHolder.position.copy(_w3);
  m.gunHolder.parent.worldToLocal(m.gunHolder.position);
  r.getWorldQuaternion(_qb).invert();
  m.gunHolder.quaternion.copy(_qb.multiply(_qAim));
  m.gunHolder.updateMatrixWorld(true);

  // arm IK onto grip and foregrip
  const gun = m.gun;
  gun.group.localToWorld(_w3.set(0.0, -0.035, 0.065));
  _rtIK.copy(_w3);
  (gun.pump || gun.foregrip).getWorldPosition(_w3);
  _w3.add(_w1.set(-0.03, -0.03, 0.05).applyQuaternion(_qAim));
  _ltIK.copy(_w3);
  ikArms(m, _rtIK, _ltIK, _qAim);

  m.nameTag.visible = false; // names are drawn by the HUD (crisp on every device)
}

// two-bone arm IK for props (the smoking soldier on the supermarket map): reach `target` with the
// hand, elbow towards `pole` (world space)
export function armIK(B, side, target, pole) {
  const upper = B[side + 'Arm'], fore = B[side + 'ForeArm'], hand = B[side + 'Hand'];
  const S = upper.getWorldPosition(new THREE.Vector3());
  const E0 = fore.getWorldPosition(new THREE.Vector3()), H0 = hand.getWorldPosition(new THREE.Vector3());
  const E = solveElbow(S, target, S.distanceTo(E0), E0.distanceTo(H0), pole, new THREE.Vector3());
  swingBone(upper, fore, E.clone().sub(S).normalize());
  swingBone(fore, hand, target.clone().sub(E).normalize());
}

// scratch vectors for the arm IK (it runs for every character every frame: no allocations here)
const _ikS = new THREE.Vector3(), _ikE = new THREE.Vector3(), _ikD = new THREE.Vector3(), _ikP = new THREE.Vector3(), _ikT = new THREE.Vector3();
function ikArms(m, rightTarget, leftTarget, aimQ, leftDir = null, leftFree = false) {
  const B = m.bones;
  const solveArm = (sideName, target, pole) => {
    const upper = B[sideName + 'Arm'], fore = B[sideName + 'ForeArm'], hand = B[sideName + 'Hand'];
    const S = upper.getWorldPosition(_ikS);
    const E = solveElbow(S, target, m.armLen.upper, m.armLen.fore, pole, _ikE);
    swingBone(upper, fore, _ikD.copy(E).sub(S).normalize());
    swingBone(fore, hand, _ikD.copy(target).sub(E).normalize());
  };
  // first person: the right elbow stays out and down in camera space, so canting the gun for a reload or
  // swinging it up for tactical sprint can't flip the arm across the screen (third person keeps it gun-relative)
  _ikT.copy(rightTarget);
  solveArm('Right', _ikT, m.fp ? _ikP.set(1, -1.25, 0.35) : _ikP.set(1, -1.2, 0.4).applyQuaternion(aimQ));
  // a free left hand (reloading, tactical sprint) keeps its elbow down and out in camera space
  _ikT.copy(leftTarget);
  solveArm('Left', _ikT, leftFree ? _ikP.set(-0.25, -1, 0.12) : _ikP.set(-1, -1.3, 0.1).applyQuaternion(aimQ));
  swingBone(B.RightHand, B.RightHandMiddle1, _ikD.set(-0.55, -0.45, -0.7).applyQuaternion(aimQ).normalize());
  swingBone(B.LeftHand, B.LeftHandMiddle1, leftDir ? _ikD.copy(leftDir).normalize() : _ikD.set(0.55, 0.35, -0.75).applyQuaternion(aimQ).normalize());
}

// First-person body: the same rig placed under the camera with the head collapsed, so only
// real sleeves and gloved hands show. Returns null when the model isn't loaded.
export function createFpBody(team) {
  const sol = cloneSoldier(team, { rim: false });
  if (!sol) return null;
  const root = new THREE.Group();
  root.add(sol.root);
  sol.actions.Idle.setEffectiveWeight(1);
  sol.mixer.update(0);
  root.updateMatrixWorld(true);
  const b = sol.bones;
  // viewmodel arms are longer than life (as in every shooter) so the hands reach a rifle's foregrip
  for (const side of ['Left', 'Right']) {
    b[side + 'ForeArm'].position.multiplyScalar(FP_ARM);
    b[side + 'Hand'].position.multiplyScalar(FP_ARM);
  }
  root.updateMatrixWorld(true);
  const len = (a, c) => b[a].getWorldPosition(_w1).distanceTo(b[c].getWorldPosition(_w2));
  const neck = b.Neck.getWorldPosition(new THREE.Vector3());
  sol.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return {
    fp: true,
    root, inner: sol.root, bones: b, mixer: sol.mixer, neck,
    armLen: { upper: len('RightArm', 'RightForeArm'), fore: len('RightForeArm', 'RightHand') },
  };
}

const _I = new THREE.Quaternion();
const FP_ARM = 1.4;
export const FINGER_AXIS = [1, 0, 0], THUMB_AXIS = [0, 0, 1], FINGER_SIGN = [1, 1];
export function poseFpBody(fp, dt, rightTarget, leftTarget, shoulderDrop = 0, gunQ = _I, grip = 1, leftDir = null, leftFree = false, leftGrip = 1) {
  fp.mixer.update(dt);
  // the clip keys bone positions, so re-stretch the arms after every update
  for (const side of ['Left', 'Right']) {
    fp.bones[side + 'ForeArm'].position.multiplyScalar(FP_ARM);
    fp.bones[side + 'Hand'].position.multiplyScalar(FP_ARM);
  }
  // neck sits just behind and below the camera; the head is collapsed so it never clips
  fp.root.position.set(-fp.neck.x, -0.16 - fp.neck.y - shoulderDrop, 0.05 - fp.neck.z);
  fp.bones.Head.scale.setScalar(0.001);
  fp.bones.Neck.scale.setScalar(0.4);
  fp.root.updateMatrixWorld(true);
  ikArms(fp, rightTarget, leftTarget, gunQ, leftDir, leftFree);
  curlFingers(fp.bones, grip, leftGrip);
}

// close the hands around the grips (the idle clip leaves them open)
const _fq = new THREE.Quaternion(), _fa = new THREE.Vector3();
export function curlFingers(B, kR = 1, kL = kR) {
  for (const side of ['Left', 'Right']) {
    const k = side === 'Left' ? kL : kR;
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
      for (let j = 1; j <= 3; j++) {
        const bone = B[side + 'Hand' + f + j];
        if (!bone) continue;
        const amt = (j === 1 ? 0.95 : j === 2 ? 1.25 : 0.8) * k * (f === 'Index' && side === 'Right' ? 0.6 : 1);
        bone.quaternion.multiply(_fq.setFromAxisAngle(_fa.set(FINGER_AXIS[0], FINGER_AXIS[1], FINGER_AXIS[2]), amt * (side === 'Left' ? FINGER_SIGN[0] : FINGER_SIGN[1])));
      }
    }
    for (let j = 1; j <= 3; j++) {
      const bone = B[side + 'HandThumb' + j];
      if (bone) bone.quaternion.multiply(_fq.setFromAxisAngle(_fa.set(THUMB_AXIS[0], THUMB_AXIS[1], THUMB_AXIS[2]), 0.35 * k * (side === 'Left' ? FINGER_SIGN[0] : FINGER_SIGN[1])));
    }
  }
  B.LeftHand.updateMatrixWorld(true);
  B.RightHand.updateMatrixWorld(true);
}
