// Gunsmith: attachment slots per weapon, their stat trade-offs, and the compact loadout string
// that travels over the network ("rifle:acog,sup,agrip,ext,laser/pistol:iron,none,std,none").
import { WEAPONS, PRIMARIES } from './config.js';

export const SLOTS = ['optic', 'muzzle', 'under', 'mag', 'laser'];
export const SLOT_NAMES = { optic: 'Optic', muzzle: 'Muzzle', under: 'Underbarrel', mag: 'Magazine', laser: 'Laser' };

// mods are multipliers on weapon stats; `set` overrides. Effects are applied relative to the
// weapon's default attachment, so stock loadouts keep their exact balance.
export const ATTACHMENTS = {
  optic: {
    iron: { name: 'Iron Sights', desc: 'Widest view, fastest aim', mods: { adsTime: 0.9 }, fov: 58 },
    reflex: { name: 'Reflex Sight', desc: 'Clean red dot, quick to aim', mods: { adsTime: 0.95 }, fov: 55 },
    holo: { name: 'Holographic', desc: 'Ring-and-dot reticle, slight zoom', mods: { adsTime: 1 }, fov: 50 },
    acog: { name: '4× Prism Scope', desc: 'Magnified chevron for range · slower aim', mods: { adsTime: 1.16, adsSpread: 0.85 }, fov: 32 },
    scope: { name: '8× Sniper Scope', desc: 'Full scope, hold breath to steady', mods: { adsTime: 1.25 }, fov: 20 },
  },
  muzzle: {
    none: { name: 'Standard', desc: 'No muzzle device', mods: {} },
    brake: { name: 'Muzzle Brake', desc: 'Factory brake', mods: {} },
    comp: { name: 'Compensator', desc: '−22% vertical recoil · +10% horizontal', mods: { recoilPitch: 0.78, recoilYaw: 1.1 } },
    sup: { name: 'Suppressor', desc: 'Off the compass and radar · quieter · −15% range', mods: { falloffStart: 0.85, falloffEnd: 0.85, adsTime: 1.04, recoilPitch: 0.94 }, quiet: true },
    choke: { name: 'Full Choke', desc: '−28% pellet spread · +25% range', mods: { spread: 0.72, adsSpread: 0.72, falloffStart: 1.25, falloffEnd: 1.25 } },
  },
  under: {
    none: { name: 'None', desc: 'Lightest handling', mods: { adsTime: 0.97 } },
    vgrip: { name: 'Vertical Grip', desc: '−15% vertical recoil · −25% horizontal', mods: { recoilPitch: 0.85, recoilYaw: 0.75 } },
    agrip: { name: 'Angled Grip', desc: '−15% aim time · −8% vertical recoil', mods: { adsTime: 0.85, recoilPitch: 0.92 } },
  },
  mag: {
    std: { name: 'Standard', desc: 'Factory magazine', mods: {} },
    ext: { name: 'Extended Mag', desc: '+50% capacity · slower reload and aim', mods: { mag: 1.5, reserve: 1.5, reload: 1.12, adsTime: 1.06 } },
    fast: { name: 'Fast Mag', desc: '−28% reload time', mods: { reload: 0.72 } },
  },
  laser: {
    none: { name: 'None', desc: 'No laser', mods: {} },
    laser: { name: 'Tac Laser', desc: '−22% hip-fire spread · faster aim · visible beam', mods: { spread: 0.78, moveSpread: 0.8, adsTime: 0.95 } },
  },
};

// options per weapon (first entry = default, matching the stock model)
export const GUNSMITH = {
  rifle: { optic: ['holo', 'reflex', 'acog', 'iron'], muzzle: ['brake', 'comp', 'sup'], under: ['vgrip', 'agrip', 'none'], mag: ['std', 'ext', 'fast'], laser: ['none', 'laser'] },
  smg: { optic: ['reflex', 'holo', 'acog', 'iron'], muzzle: ['none', 'comp', 'sup'], under: ['none', 'vgrip', 'agrip'], mag: ['std', 'ext', 'fast'], laser: ['none', 'laser'] },
  shotgun: { optic: ['iron', 'reflex', 'holo'], muzzle: ['none', 'choke', 'sup'], mag: ['std', 'ext'], laser: ['none', 'laser'] },
  sniper: { optic: ['scope', 'acog', 'holo', 'iron'], muzzle: ['brake', 'sup'], mag: ['std', 'ext', 'fast'] },
  pistol: { optic: ['iron', 'reflex'], muzzle: ['none', 'comp', 'sup'], mag: ['std', 'ext'], laser: ['none', 'laser'] },
};

export function defaultsFor(id) {
  const g = GUNSMITH[id] || {};
  const out = {};
  for (const s of SLOTS) if (g[s]) out[s] = g[s][0];
  return out;
}

export function cleanAtt(id, att) {
  const g = GUNSMITH[id] || {};
  const out = {};
  for (const s of SLOTS) if (g[s]) out[s] = att && g[s].includes(att[s]) ? att[s] : g[s][0];
  return out;
}

// weapon definition with attachments applied (a fresh object; WEAPONS stays untouched)
const cache = new Map();
export function weaponDef(id, att) {
  const a = cleanAtt(id, att);
  const key = id + ':' + SLOTS.map(s => a[s] || '').join(',');
  if (cache.has(key)) return cache.get(key);
  const base = WEAPONS[id];
  const d = { ...base, model: { ...base.model }, att: a, attKey: key };
  const def = defaultsFor(id);
  const mult = {};
  for (const s of SLOTS) {
    if (!a[s]) continue;
    const cur = ATTACHMENTS[s][a[s]].mods, std = ATTACHMENTS[s][def[s]].mods;
    for (const k of new Set([...Object.keys(cur), ...Object.keys(std)])) mult[k] = (mult[k] ?? 1) * (cur[k] ?? 1) / (std[k] ?? 1);
  }
  for (const [k, m] of Object.entries(mult)) if (typeof d[k] === 'number') d[k] = d[k] * m;
  if (mult.mag) d.mag = Math.round(base.mag * mult.mag);
  if (mult.reserve) d.reserve = Math.round(base.reserve * mult.reserve);
  if (a.optic) {
    d.model.sight = a.optic;
    d.adsFov = ATTACHMENTS.optic[a.optic].fov;
    d.scope = a.optic === 'scope';
  }
  d.quiet = a.muzzle === 'sup';
  d.laser = a.laser === 'laser';
  cache.set(key, d);
  return d;
}

// ---------- loadout string ----------
const part = (id, att) => `${id}:${SLOTS.filter(s => GUNSMITH[id][s]).map(s => att[s]).join(',')}`;
function parsePart(str, allowed) {
  if (typeof str !== 'string') return null;
  const [id, rest = ''] = str.slice(0, 80).split(':');
  if (!allowed.includes(id)) return null;
  const vals = rest.split(',');
  const att = {};
  SLOTS.filter(s => GUNSMITH[id][s]).forEach((s, i) => { att[s] = vals[i]; });
  return { id, att: cleanAtt(id, att) };
}

export function encodeLoadout(primary, att, pistolAtt) {
  const p = PRIMARIES.includes(primary) ? primary : 'rifle';
  return part(p, cleanAtt(p, att)) + '/' + part('pistol', cleanAtt('pistol', pistolAtt));
}

// accepts a loadout string or a bare weapon id (older clients); always returns something valid
export function parseLoadout(str) {
  const [a, b] = typeof str === 'string' ? str.split('/') : [];
  const prim = parsePart(a, PRIMARIES) || { id: 'rifle', att: defaultsFor('rifle') };
  const pist = parsePart(b, ['pistol']) || { id: 'pistol', att: defaultsFor('pistol') };
  return { primary: prim.id, att: prim.att, pistolAtt: pist.att, str: part(prim.id, prim.att) + '/' + part('pistol', pist.att) };
}

export function loadoutFromSettings(s) {
  const all = s.attachments || {};
  return encodeLoadout(s.primary, all[s.primary], all.pistol);
}

export function randomLoadout(primary) {
  const pick = (id) => {
    const g = GUNSMITH[id], att = {};
    for (const s of SLOTS) if (g[s]) att[s] = Math.random() < 0.4 ? g[s][0] : g[s][(Math.random() * g[s].length) | 0];
    return att;
  };
  return encodeLoadout(primary, pick(primary), pick('pistol'));
}

// short human summary of a weapon's attachments (non-default only)
export function attSummary(id, att) {
  const a = cleanAtt(id, att), def = defaultsFor(id);
  return SLOTS.filter(s => a[s] && a[s] !== def[s]).map(s => ATTACHMENTS[s][a[s]].name);
}
