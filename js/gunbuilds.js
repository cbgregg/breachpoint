// Dedicated procedural models for the added weapons (each one its own gun, not a re-skinned base model).
// Same conventions as weapons.js: origin = top of the pistol grip, barrel toward -z; profile points are
// [forward f, up y] (z = -f); lathe points are [radius, f]. Every builder gets the toolkit `k` and returns
// { muzF, sight, laser } (sight = { sightY, sightZ, eyeRelief?, frontZ?, postTop?, sightX? }).
import * as THREE from 'three';

const vgripAt = (k, f, y) => {
  // vertical foregrip: lathe swung down, bottom raked back (same part as the stock carbine)
  const { p, B } = k;
  p.lathe(B.poly, [[0, 0], [0.0125, 0], [0.014, 0.012], [0.0145, 0.06], [0.012, 0.075], [0, 0.077]], 0, 0, 16);
  const v = p.by.get(B.poly).pop();
  v.applyMatrix4(new THREE.Matrix4().makeRotationX(-(Math.PI / 2 + 0.12)));
  v.translate(0, y, -f);
  p.by.get(B.poly).push(v);
  p.rbox(B.poly, 0.018, 0.006, 0.04, 0, y - 0.0015, -f, 0.002);
  k.foregrip.position.set(0, y - 0.036, -f - 0.005);
};
const agripAt = (k, f, y) => {
  k.p.profile(k.B.poly, [[f - 0.06, y], [f + 0.045, y], [f + 0.03, y - 0.014, 0.006], [f - 0.015, y - 0.03, 0.008], [f - 0.04, y - 0.026, 0.006]], 0.028, { r: 0.006, bevel: 0.003 });
  k.foregrip.position.set(0, y - 0.022, -f + 0.03);
};
const underbarrel = (k, f, y, rest) => {
  if (k.A.under === 'vgrip') vgripAt(k, f, y);
  else if (k.A.under === 'agrip') agripAt(k, f, y);
  else k.foregrip.position.set(...rest);
};
// trigger guard loop + blade
const guard = (p, mat, f0, y0, len, depth, width = 0.009, blade = null) => {
  p.profile(mat, [[f0, y0], [f0 + len, y0], [f0 + len - 0.004, y0 - depth, 0.008], [f0 + 0.006, y0 - depth - 0.002, 0.01]], width,
    { r: 0.008, holes: [[[f0 + 0.008, y0 - 0.006], [f0 + len - 0.009, y0 - 0.006], [f0 + len - 0.012, y0 - depth + 0.007], [f0 + 0.012, y0 - depth + 0.006]]] });
  p.profile(blade || mat, [[f0 + 0.03, y0 - 0.002], [f0 + 0.042, y0 - 0.002], [f0 + 0.036, y0 - depth * 0.62], [f0 + 0.03, y0 - depth * 0.58]], 0.006, { r: 0.004, bevel: 0.001 });
};
// iron sight pieces: an aperture plate and a post between protective ears, both centred on the sight line SY
const aperture = (p, mat, f, base, SY, w = 0.024) => p.frontal(mat, [[-w / 2, base], [w / 2, base], [w / 2, SY + 0.009], [-w / 2, SY + 0.009]], f - 0.003, f + 0.003,
  [[[-0.004, SY - 0.004], [0.004, SY - 0.004], [0.004, SY + 0.004], [-0.004, SY + 0.004]]], 0.003, 0.0008);
const notch = (p, mat, f, base, SY, w = 0.022) => { for (const s of [-1, 1]) p.rbox(mat, (w - 0.005) / 2, SY + 0.003 - base, 0.006, s * (w + 0.005) / 4, (SY + 0.003 + base) / 2, -f, 0.0012); };
const post = (p, mat, f, base, SY, ears = true) => {
  p.rbox(mat, 0.0024, SY - base, 0.003, 0, (SY + base) / 2, -f, 0.0006);
  if (ears) for (const s of [-1, 1]) p.rbox(mat, 0.0026, SY + 0.004 - base, 0.009, s * 0.0085, (SY + 0.004 + base) / 2, -f, 0.0008);
  return { frontZ: -f + 0.0016, postTop: SY };
};
const ribs = (p, mat, n, f0, df, y, h, w, x = 0) => { for (let i = 0; i < n; i++) p.rbox(mat, w, h, 0.003, x, y, -(f0 + i * df), 0.0008); };

export const BUILDS = {
  // ---------- KV-47: stamped AK, wood furniture, bakelite banana magazine ----------
  kv47(k) {
    const { p, mp, g, B, A, vm, tinted } = k;
    const wood = tinted(B.wood, 0xa8683c), bake = tinted(B.poly, 0x6a2c12), steel = B.metal, dark = B.steel;
    const BY = 0.038, SY = 0.074;
    // receiver: stamped box with the rounded, ribbed top cover
    p.profile(steel, [[-0.062, -0.004], [0.215, -0.004], [0.215, 0.044], [-0.062, 0.044]], 0.031, { r: 0.004, bevel: 0.0015 });
    p.frontal(steel, [[-0.0165, 0.04], [0.0165, 0.04], [0.0165, 0.05], [0.011, 0.058], [-0.011, 0.058], [-0.0165, 0.05]], -0.058, 0.205, [], 0.004, 0.0012);
    for (let i = 0; i < 4; i++) p.rbox(dark, 0.024, 0.0018, 0.004, 0, 0.0585, 0.045 - i * 0.012, 0.0006); // cover ribs
    p.rbox(steel, 0.008, 0.008, 0.012, 0, 0.056, 0.062, 0.002);                       // cover latch button
    p.rbox(B.recess, 0.002, 0.014, 0.1, 0.0157, 0.03, -0.1, 0.002);                     // ejection port
    for (const [f, y] of [[0.0, 0.02], [0.18, 0.02], [0.19, 0.034], [-0.04, 0.03]]) for (const s of [-1, 1]) p.add(dark, new THREE.CylinderGeometry(0.0022, 0.0022, 0.002, 8), s * 0.0158, y, -f, 0, 0, Math.PI / 2); // rivets
    p.profile(dark, [[0.02, 0.038], [0.165, 0.042], [0.165, 0.033], [0.03, 0.03]], 0.002, { x: 0.0167, r: 0.001, bevel: 0.0004 });                   // long safety lever
    p.rbox(dark, 0.004, 0.012, 0.012, 0.0185, 0.034, -0.02, 0.002);
    p.rbox(dark, 0.014, 0.008, 0.012, 0.022, 0.034, -0.172, 0.002); p.add(dark, new THREE.SphereGeometry(0.0055, 10, 8), 0.03, 0.035, -0.172); // charging handle
    // trunnion + rear sight block with the tangent leaf
    p.profile(steel, [[0.2, 0.028], [0.262, 0.028], [0.258, 0.054, 0.004], [0.2, 0.06, 0.004]], 0.027, { r: 0.004, bevel: 0.0015 });
    p.rbox(dark, 0.02, 0.005, 0.06, 0, 0.062, -0.235, 0.0015);
    notch(p, dark, 0.212, 0.062, SY);
    // gas tube under its upper handguard, lower handguard, retainer, gas block, cleaning rod
    p.frontal(wood, [[-0.0165, 0.049], [0.0165, 0.049], [0.0175, 0.058], [0.012, 0.067], [-0.012, 0.067], [-0.0175, 0.058]], 0.262, 0.43, [], 0.005, 0.0015);
    p.lathe(steel, [[0, 0.43], [0.0085, 0.43], [0.0085, 0.505], [0, 0.505]], 0.057, 0, 14);
    p.profile(wood, [[0.258, 0.044], [0.43, 0.044], [0.436, 0.03, 0.006], [0.43, -0.006, 0.012], [0.272, -0.01, 0.012], [0.258, 0.012, 0.006]], 0.046, { bevel: 0.006, r: 0.01 });
    for (const s of [-1, 1]) for (const y of [0.008, 0.024]) p.rbox(B.recess, 0.002, 0.003, 0.13, s * 0.0232, y, -0.35, 0.001); // finger grooves
    p.frontal(dark, [[-0.0235, -0.008], [0.0235, -0.008], [0.0235, 0.068], [-0.0235, 0.068]], 0.43, 0.442, [], 0.008, 0.001);
    p.profile(steel, [[0.5, 0.03], [0.538, 0.03], [0.536, 0.066, 0.004], [0.502, 0.066, 0.004]], 0.022, { r: 0.004 });
    p.lathe(dark, [[0, 0.27], [0.003, 0.27], [0.003, 0.625], [0, 0.625]], 0.022, 0, 8);
    p.lathe(dark, [[0, 0.2], [0.0095, 0.2], [0.0095, 0.645], [0, 0.645]], BY, 0, 18);
    // front sight block: post between ears on the sight line
    p.profile(steel, [[0.6, 0.026], [0.642, 0.026], [0.642, 0.05], [0.628, 0.056], [0.61, 0.056], [0.6, 0.048]], 0.024, { r: 0.004, bevel: 0.0012 });
    const fp = post(p, dark, 0.623, 0.054, SY);
    let muzF;
    if (A.muzzle === 'none') { // slant compensator
      p.lathe(steel, [[0, 0.645], [0.0115, 0.645], [0.0115, 0.68], [0.0095, 0.688], [0, 0.688]], BY, 0, 16);
      p.rbox(B.recess, 0.012, 0.004, 0.022, 0.004, BY + 0.01, -0.67, 0.001, 0, 0, -0.3);
      muzF = 0.69;
    } else muzF = k.muzzleDevice(p, B, A.muzzle, BY, 0.645, 0.0095);
    // stock: dropped AK buttstock in wood with a steel buttplate
    p.profile(wood, [[-0.06, 0.044], [-0.33, 0.016, 0.006], [-0.336, -0.088, 0.006], [-0.3, -0.1, 0.012], [-0.15, -0.046, 0.04], [-0.062, -0.026, 0.01]], 0.037, { bevel: 0.005, r: 0.008 });
    p.profile(steel, [[-0.33, 0.018], [-0.343, 0.018], [-0.349, -0.088, 0.004], [-0.336, -0.1, 0.004]], 0.039, { bevel: 0.002, r: 0.004 });
    p.profile(bake, k.GRIP, 0.03, { bevel: 0.005, r: 0.01 });
    guard(p, steel, 0.002, -0.004, 0.098, 0.044, 0.008, dark);
    // optic: side-mount bridge with a top rail when one is fitted
    let sight;
    if (A.optic === 'iron') sight = { sightY: SY, sightZ: -0.212, ...fp };
    else {
      p.rbox(dark, 0.006, 0.03, 0.12, -0.02, 0.045, -0.05, 0.002);
      p.rail(steel, -0.04, 0.16, 0.06);
      sight = k.addOptic(A.optic, p, g, B, vm, 0.069, 0.06);
    }
    underbarrel(k, 0.36, -0.006, [0, -0.026, -0.35]);   // low on the handguard: the AK's sight line runs just over it, so the glove stays below
    const laser = A.laser === 'laser' ? k.laserModule(p, g, B, 0.031, 0.022, 0.4) : null;
    // magazine: 30-round bakelite banana curve, ribbed, with its locking lug
    mp.profile(bake, [[0.106, -0.004], [0.16, -0.004], [0.168, -0.07, 0.03], [0.196, -0.15, 0.06], [0.24, -0.214, 0.008], [0.198, -0.24, 0.008], [0.158, -0.176, 0.06], [0.128, -0.09, 0.03], [0.11, -0.03]], 0.026, { r: 0.004, bevel: 0.002 });
    for (let i = 0; i < 4; i++) { const t = i / 3; mp.rbox(bake, 0.0275, 0.004, 0.045, 0, -0.06 - t * 0.12, -(0.142 + t * 0.055), 0.0012, -0.45 - t * 0.35); }
    mp.profile(steel, [[0.198, -0.232], [0.238, -0.208], [0.243, -0.216, 0.002], [0.202, -0.242, 0.003]], 0.028, { r: 0.002, bevel: 0.001 });
    mp.add(B.brass, new THREE.CylinderGeometry(0.005, 0.005, 0.034, 10), 0, -0.002, -0.134, Math.PI / 2 + 0.05, 0, 0);
    k.eject.position.set(0.02, 0.032, -0.1);
    return { muzF, BY, sight, laser };
  },

  // ---------- BR-308: monolithic-upper battle rifle (tan), folding stock, 20-round steel mag ----------
  br308(k) {
    const { p, mp, g, B, A, vm } = k;
    const tan = B.tan, blk = B.poly, steel = B.metal;
    const BY = 0.036;
    // upper: receiver and handguard in one tan forging, full-length top rail, side and bottom rails
    p.profile(tan, [[-0.072, 0.0], [0.2, 0.0], [0.205, 0.008], [0.425, 0.008, 0.006], [0.43, 0.02], [0.43, 0.058], [-0.072, 0.058]], 0.036, { r: 0.006, bevel: 0.002 });
    p.rail(steel, -0.07, 0.425, 0.058);
    for (const s of [-1, 1]) {
      p.rbox(steel, 0.006, 0.012, 0.16, s * 0.0195, 0.03, -0.33, 0.0015);
      for (let i = 0; i < 4; i++) p.rbox(B.recess, 0.002, 0.012, 0.03, s * 0.0181, 0.03, -(0.215 + i * 0.002) + 0.0, 0.001); // vents near the receiver
      for (let i = 0; i < 6; i++) p.rbox(B.recess, 0.002, 0.004, 0.012, s * 0.0181, 0.016, -(0.24 + i * 0.03), 0.001);
    }
    p.rbox(steel, 0.02, 0.008, 0.17, 0, 0.004, -0.33, 0.0015);
    p.rbox(B.recess, 0.002, 0.016, 0.07, 0.0181, 0.034, -0.08, 0.002);                // ejection port
    p.rbox(blk, 0.012, 0.012, 0.02, -0.026, 0.042, -0.25, 0.003); p.add(blk, new THREE.SphereGeometry(0.007, 10, 8), -0.034, 0.042, -0.25); // reciprocating charging handle
    // lower: black polymer, flared magwell
    p.profile(blk, [[-0.062, 0.002], [0.185, 0.002], [0.19, -0.012], [0.178, -0.052, 0.004], [0.09, -0.054, 0.004], [0.082, -0.014], [-0.062, -0.012]], 0.031, { r: 0.004, bevel: 0.0015 });
    p.profile(blk, [[0.086, -0.046], [0.182, -0.046], [0.184, -0.058, 0.002], [0.084, -0.06, 0.002]], 0.035, { r: 0.002, bevel: 0.0012 });
    p.profile(blk, k.GRIP, 0.031, { bevel: 0.005, r: 0.01 });
    k.triggerGroup(p, { ...B, poly: blk }, -0.005);
    p.add(steel, new THREE.CylinderGeometry(0.0055, 0.0055, 0.0035, 14), -0.0165, -0.004, 0.0, 0, 0, Math.PI / 2);   // selector
    // barrel + gas block peeking out of the handguard
    p.lathe(B.steel, [[0, 0.42], [0.0115, 0.42], [0.0115, 0.47], [0.0105, 0.475], [0.0105, 0.6], [0, 0.6]], BY, 0, 18);
    p.lathe(steel, [[0, 0.43], [0.016, 0.43], [0.016, 0.455], [0, 0.455]], BY + 0.004, 0, 14);
    const muzF = k.muzzleDevice(p, B, A.muzzle, BY, 0.6, 0.0105);
    // folding stock: hinge block, skeleton body with a cheek riser, adjustable butt
    p.profile(blk, [[-0.07, 0.056], [-0.105, 0.056], [-0.105, 0.0], [-0.07, 0.004]], 0.038, { r: 0.006, bevel: 0.002 });
    p.profile(tan, [[-0.1, 0.054], [-0.33, 0.054, 0.008], [-0.345, 0.04], [-0.35, -0.072, 0.008], [-0.326, -0.082, 0.01], [-0.29, -0.076, 0.01], [-0.2, -0.018, 0.03], [-0.1, 0.004, 0.006]], 0.034,
      { bevel: 0.005, r: 0.008, holes: [[[-0.2, 0.034], [-0.3, 0.034], [-0.31, -0.04], [-0.28, -0.05], [-0.21, -0.004]]] });
    p.profile(blk, [[-0.16, 0.054], [-0.31, 0.054], [-0.31, 0.07, 0.006], [-0.17, 0.068, 0.006]], 0.03, { bevel: 0.003, r: 0.006 });
    p.profile(B.rubber, [[-0.343, 0.044], [-0.358, 0.044], [-0.364, -0.076], [-0.348, -0.084]], 0.04, { bevel: 0.004, r: 0.006 });
    let sight;
    if (A.optic === 'iron') sight = k.ironSights(p, B, -0.05, 0.068, 0.41, 0.068, 0.016);
    else sight = k.addOptic(A.optic, p, g, B, vm, 0.068, 0.07);
    underbarrel(k, 0.33, 0.0, [0, -0.006, -0.33]);
    const laser = A.laser === 'laser' ? k.laserModule(p, g, B, 0.03, 0.03, 0.37) : null;
    // 20-round steel magazine, nearly straight, ribbed
    mp.profile(steel, [[0.094, -0.012], [0.168, -0.012], [0.172, -0.1, 0.02], [0.18, -0.16, 0.006], [0.104, -0.168, 0.006], [0.098, -0.1, 0.02]], 0.027, { r: 0.004, bevel: 0.0015 });
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) mp.rbox(B.recess, 0.002, 0.004, 0.055, s * 0.0137, -0.07 - i * 0.022, -0.135, 0.001);
    mp.profile(steel, [[0.1, -0.162], [0.186, -0.156], [0.188, -0.168, 0.002], [0.102, -0.176, 0.003]], 0.031, { r: 0.002, bevel: 0.001 });
    k.eject.position.set(0.02, 0.034, -0.08);
    return { muzF, BY, sight, laser };
  },

  // ---------- HX-60: belt-fed LMG (olive), feed cover, ammo pouch + belt, heat shield, folded bipod ----------
  hx60(k) {
    const { p, mp, g, B, A, vm } = k;
    const od = B.olive, steel = B.metal, dark = B.steel;
    const BY = 0.044, SY = 0.104;
    p.profile(steel, [[-0.085, -0.006], [0.225, -0.006], [0.225, 0.07], [-0.085, 0.07]], 0.046, { r: 0.006, bevel: 0.002 });
    p.profile(steel, [[-0.07, 0.068], [0.205, 0.068], [0.205, 0.078, 0.004], [0.06, 0.086, 0.04], [-0.07, 0.082, 0.004]], 0.05, { r: 0.004, bevel: 0.0015 }); // feed cover
    p.rbox(dark, 0.012, 0.01, 0.014, 0.026, 0.074, -0.18, 0.002);                                 // cover latch
    for (const s of [-1, 1]) p.rbox(B.recess, 0.002, 0.004, 0.26, s * 0.0232, 0.02, -0.07, 0.001); // receiver seams
    p.rbox(B.recess, 0.003, 0.03, 0.07, -0.0232, 0.045, -0.135, 0.002);                            // feed port (left)
    p.rbox(dark, 0.02, 0.01, 0.014, 0.03, 0.03, -0.12, 0.002); p.add(dark, new THREE.SphereGeometry(0.007, 10, 8), 0.042, 0.03, -0.12); // charging handle
    // barrel with heat shield, carry handle, gas tube, gas block
    p.lathe(dark, [[0, 0.225], [0.013, 0.225], [0.013, 0.3], [0.0115, 0.31], [0.0115, 0.7], [0, 0.7]], BY, 0, 18);
    p.frontal(steel, [[-0.019, BY + 0.006], [0.019, BY + 0.006], [0.019, BY + 0.018], [0.012, BY + 0.025], [-0.012, BY + 0.025], [-0.019, BY + 0.018]], 0.225, 0.46, [], 0.004, 0.0012);
    for (let i = 0; i < 7; i++) p.rbox(B.recess, 0.03, 0.002, 0.012, 0, BY + 0.0255, -(0.25 + i * 0.03), 0.001);
    p.profile(od, [[0.33, BY + 0.024], [0.43, BY + 0.024], [0.42, BY + 0.05, 0.012], [0.34, BY + 0.05, 0.012]], 0.01, { x: -0.03, r: 0.006, holes: [[[0.35, BY + 0.03], [0.41, BY + 0.03], [0.403, BY + 0.042], [0.357, BY + 0.042]]] });
    p.rbox(steel, 0.02, 0.012, 0.03, -0.018, BY + 0.024, -0.38, 0.003);
    p.lathe(steel, [[0, 0.225], [0.0085, 0.225], [0.0085, 0.6], [0, 0.6]], 0.018, 0, 12);
    p.profile(steel, [[0.58, 0.008], [0.61, 0.008], [0.61, BY + 0.012], [0.58, BY + 0.012]], 0.026, { r: 0.004 });
    // tall front sight tower and rear aperture on the feed cover
    p.profile(steel, [[0.632, BY + 0.008], [0.664, BY + 0.008], [0.66, 0.084], [0.638, 0.084]], 0.018, { r: 0.004 });
    const fp = post(p, dark, 0.65, 0.082, SY);
    const muzF = k.muzzleDevice(p, B, A.muzzle === 'none' ? 'brake' : A.muzzle, BY, 0.7, 0.0115);
    // forend around the gas tube; folded bipod underneath
    p.profile(od, [[0.225, BY - 0.004], [0.4, BY - 0.004], [0.41, 0.026, 0.008], [0.4, -0.012, 0.012], [0.245, -0.014, 0.012], [0.225, 0.0]], 0.058, { bevel: 0.006, r: 0.012 });
    for (let i = 0; i < 5; i++) p.rbox(B.recess, 0.06, 0.003, 0.006, 0, -0.012, -(0.27 + i * 0.026), 0.001);
    p.rbox(steel, 0.044, 0.016, 0.03, 0, 0.012, -0.62, 0.004);
    for (const s of [-1, 1]) {
      p.lathe(dark, [[0, 0.44], [0.0045, 0.44], [0.0045, 0.615], [0, 0.615]], 0.004, s * 0.016, 8);
      p.rbox(B.rubber, 0.012, 0.01, 0.022, s * 0.016, 0.0, -0.44, 0.003);
    }
    // stock + grip
    p.lathe(steel, [[0, -0.09], [0.016, -0.09], [0.016, -0.085], [0, -0.085]], 0.04, 0, 14);
    p.profile(od, [[-0.085, 0.064], [-0.36, 0.052, 0.01], [-0.37, -0.08, 0.008], [-0.332, -0.092, 0.012], [-0.2, -0.04, 0.03], [-0.085, -0.004, 0.006]], 0.046,
      { bevel: 0.006, r: 0.01, holes: [[[-0.2, 0.036], [-0.32, 0.03], [-0.325, -0.05], [-0.3, -0.06], [-0.21, -0.012]]] });
    p.profile(B.rubber, [[-0.36, 0.054], [-0.376, 0.054], [-0.384, -0.082], [-0.368, -0.094]], 0.05, { bevel: 0.004, r: 0.006 });
    p.profile(od, k.GRIP, 0.032, { bevel: 0.005, r: 0.01 });
    k.triggerGroup(p, { ...B, poly: od }, -0.002, 0.013);
    let sight;
    if (A.optic === 'iron') { aperture(p, dark, -0.022, 0.08, SY); sight = { sightY: SY, sightZ: 0.022, ...fp }; }
    else { p.rail(steel, -0.05, 0.15, 0.084); sight = k.addOptic(A.optic, p, g, B, vm, 0.094, 0.05); }
    k.foregrip.position.set(0, -0.008, -0.33);
    const laser = A.laser === 'laser' ? k.laserModule(p, g, B, 0.038, 0.02, 0.37) : null;
    // the "magazine": a 100-round soft pouch on the left with the belt feeding up into the receiver
    mp.rbox(od, 0.058, 0.1, 0.13, -0.014, -0.064, -0.13, 0.014);
    mp.rbox(od, 0.06, 0.016, 0.13, -0.014, -0.012, -0.13, 0.006);                                   // flap
    mp.rbox(dark, 0.002, 0.07, 0.012, 0.0155, -0.065, -0.13, 0.001);                                // strap
    for (let i = 0; i < 6; i++) {
      const t = i / 5, y = -0.006 + t * 0.05, x = -0.028 - Math.sin(t * Math.PI) * 0.012;
      mp.lathe(B.brass, [[0, 0.105], [0.0052, 0.105], [0.0052, 0.148], [0.003, 0.158], [0, 0.161]], y, x, 8);
      mp.rbox(dark, 0.004, 0.009, 0.02, x - 0.004, y, -0.12, 0.001);                                  // link
    }
    k.eject.position.set(0.026, 0.0, -0.1);
    return { muzF, BY, sight, laser };
  },

  // ---------- KRV-45: Vector-style .45 SMG, tall slanted body, high bore, collapsible stock ----------
  krv45(k) {
    const { p, mp, g, B, A, vm, tinted } = k;
    const fur = tinted(B.poly, 0x3b4652), blk = B.poly, steel = B.metal;
    const BY = 0.052;
    p.profile(fur, [[-0.05, 0.07], [0.27, 0.07], [0.292, 0.058, 0.01], [0.292, 0.03, 0.012], [0.262, 0.0, 0.02], [0.222, -0.064, 0.008], [0.152, -0.066, 0.006], [0.128, -0.018, 0.012], [0.05, -0.006, 0.01], [-0.05, 0.0]], 0.044, { bevel: 0.006, r: 0.01 });
    p.profile(blk, [[0.1, 0.04], [0.25, 0.04], [0.24, 0.0, 0.02], [0.14, -0.002, 0.01]], 0.0455, { bevel: 0.002, r: 0.006 });     // side panels
    p.rail(steel, -0.045, 0.26, 0.07);
    p.rbox(steel, 0.02, 0.008, 0.05, 0, 0.004, -0.27, 0.0015, -0.6);                                 // bottom rail on the chin
    p.rbox(B.recess, 0.002, 0.014, 0.05, 0.0225, 0.045, -0.06, 0.002);                                // ejection port
    p.rbox(steel, 0.006, 0.012, 0.016, 0.026, 0.056, -0.2, 0.002);                                    // charging handle
    for (const s of [-1, 1]) p.add(steel, new THREE.CylinderGeometry(0.006, 0.006, 0.0035, 14), s * 0.0235, 0.012, 0.0, 0, 0, Math.PI / 2); // ambi selector
    p.lathe(B.steel, [[0, 0.285], [0.0095, 0.285], [0.0095, 0.33], [0.0115, 0.332], [0.0115, 0.345], [0, 0.345]], BY, 0, 16);
    const muzF = Math.max(0.35, k.muzzleDevice(p, B, A.muzzle, BY, 0.345, 0.0095, 0.17));
    // buffer tube + collapsible stock
    p.lathe(steel, [[0, -0.27], [0.0145, -0.27], [0.0145, -0.05], [0, -0.05]], 0.045, 0, 18);
    p.profile(fur, [[-0.16, 0.066], [-0.29, 0.066], [-0.3, 0.056], [-0.306, -0.05], [-0.29, -0.062], [-0.24, -0.026, 0.02], [-0.16, 0.022, 0.01]], 0.036, { bevel: 0.005, r: 0.008, holes: [[[-0.2, 0.03], [-0.275, 0.03], [-0.28, -0.03], [-0.245, -0.012]]] });
    p.profile(B.rubber, [[-0.3, 0.066], [-0.314, 0.066], [-0.318, -0.054], [-0.304, -0.064]], 0.04, { bevel: 0.004, r: 0.006 });
    p.profile(fur, k.GRIP, 0.032, { bevel: 0.005, r: 0.01 });
    k.triggerGroup(p, { ...B, poly: fur }, -0.002, 0.012);
    let sight;
    if (A.optic === 'iron') sight = k.ironSights(p, B, -0.03, 0.08, 0.25, 0.08, 0.016);
    else sight = k.addOptic(A.optic, p, g, B, vm, 0.08, 0.1);
    underbarrel(k, 0.268, 0.0, [0, -0.026, -0.24]);
    const laser = A.laser === 'laser' ? k.laserModule(p, g, B, 0.033, 0.04, 0.24) : null;
    // straight double-stack .45 magazine in the chin
    mp.profile(blk, [[0.158, -0.05], [0.212, -0.05], [0.218, -0.19, 0.006], [0.164, -0.196, 0.006]], 0.025, { r: 0.004, bevel: 0.0015 });
    mp.profile(blk, [[0.16, -0.188], [0.222, -0.182], [0.224, -0.196, 0.003], [0.162, -0.204, 0.003]], 0.029, { r: 0.002, bevel: 0.0012 });
    k.eject.position.set(0.024, 0.045, -0.06);
    return { muzF, BY, sight, laser };
  },

  // ---------- MR-14: wood-stocked battle rifle as a DMR, rail bridge for optics ----------
  mr14(k) {
    const { p, mp, g, B, A, vm, tinted } = k;
    const wood = tinted(B.wood, 0xb27a48), steel = tinted(B.metal, 0x4a4d50), dark = B.steel;
    const BY = 0.05, SY = 0.088;
    p.profile(wood, [[0.47, 0.042], [0.21, 0.042], [0.2, 0.03], [-0.05, 0.03], [-0.2, 0.034, 0.03], [-0.345, 0.04, 0.006], [-0.35, -0.098, 0.006], [-0.33, -0.104, 0.012],
      [-0.12, -0.046, 0.05], [-0.056, -0.04, 0.02], [-0.03, -0.078, 0.012], [0.016, -0.074, 0.012], [0.05, -0.022, 0.015], [0.2, -0.008, 0.04], [0.44, 0.0, 0.012], [0.47, 0.022, 0.006]], 0.042, { bevel: 0.006, r: 0.008 });
    p.profile(dark, [[-0.345, 0.04], [-0.358, 0.04], [-0.364, -0.098], [-0.35, -0.104]], 0.044, { bevel: 0.002, r: 0.004 });   // buttplate
    p.profile(wood, [[0.22, 0.042], [0.41, 0.042], [0.42, 0.054, 0.006], [0.24, 0.066, 0.008]], 0.03, { bevel: 0.004, r: 0.006 }); // upper handguard
    p.profile(steel, [[-0.05, 0.028], [0.215, 0.028], [0.215, 0.066, 0.004], [0.06, 0.07, 0.01], [-0.04, 0.068, 0.004], [-0.05, 0.06]], 0.03, { r: 0.004, bevel: 0.0015 });
    p.rbox(B.recess, 0.014, 0.002, 0.09, 0.0, 0.0702, -0.06, 0.001);                                  // bolt slot
    p.rbox(steel, 0.006, 0.01, 0.12, 0.019, 0.048, -0.16, 0.002); p.rbox(steel, 0.012, 0.016, 0.012, 0.024, 0.05, -0.105, 0.003); // op rod + handle
    p.lathe(dark, [[0, 0.41], [0.0105, 0.41], [0.0095, 0.43], [0.0095, 0.66], [0, 0.66]], BY, 0, 18);
    p.lathe(steel, [[0, 0.47], [0.0095, 0.47], [0.0095, 0.58], [0, 0.58]], 0.03, 0, 14);               // gas cylinder
    p.frontal(steel, [[-0.012, 0.018], [0.012, 0.018], [0.012, 0.062], [-0.012, 0.062]], 0.56, 0.585, [], 0.008, 0.001);
    p.frontal(dark, [[-0.0225, -0.004], [0.0225, -0.004], [0.0225, 0.05], [-0.0225, 0.05]], 0.44, 0.452, [], 0.008, 0.001);   // stock ferrule
    p.profile(steel, [[0.638, 0.056], [0.664, 0.056], [0.66, 0.074], [0.642, 0.074]], 0.02, { r: 0.004 });
    const fp = post(p, dark, 0.652, 0.072, SY);
    const muzF = k.muzzleDevice(p, B, A.muzzle, BY, 0.66, 0.0095);
    guard(p, dark, -0.002, -0.034, 0.088, 0.04, 0.01);
    let sight;
    if (A.optic === 'iron') { aperture(p, dark, -0.03, 0.066, SY, 0.02); sight = { sightY: SY, sightZ: 0.03, ...fp }; }
    else {
      p.rbox(dark, 0.008, 0.026, 0.14, -0.02, 0.062, -0.04, 0.002);                                  // side mount
      p.rail(steel, -0.07, 0.15, 0.074, 0.021);
      sight = k.addOptic(A.optic, p, g, B, vm, 0.084, 0.04);
    }
    k.foregrip.position.set(0, -0.004, -0.33);
    const laser = A.laser === 'laser' ? k.laserModule(p, g, B, 0.028, 0.026, 0.36) : null;
    mp.profile(steel, [[0.084, -0.004], [0.152, -0.004], [0.158, -0.11, 0.02], [0.164, -0.152, 0.006], [0.094, -0.158, 0.006], [0.088, -0.11, 0.02]], 0.027, { r: 0.004, bevel: 0.0015 });
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) mp.rbox(B.recess, 0.002, 0.004, 0.05, s * 0.0138, -0.06 - i * 0.025, -0.124, 0.001);
    k.eject.position.set(0.02, 0.05, -0.08);
    return { muzF, BY, sight, laser };
  },

  // ---------- SA-12: boxy automatic shotgun, carry-handle rail, ported shroud, drum magazine ----------
  sa12(k) {
    const { p, mp, g, B, A, vm, tinted } = k;
    const fur = tinted(B.poly, 0x2d302c), steel = B.metal, dark = B.steel;
    const BY = 0.05;
    p.profile(fur, [[-0.1, -0.006], [0.33, -0.006], [0.345, 0.01, 0.012], [0.345, 0.086, 0.012], [-0.1, 0.086, 0.012]], 0.052, { bevel: 0.006, r: 0.012 });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) p.rbox(B.recess, 0.002, 0.004, 0.18, s * 0.0262, 0.02 + i * 0.022, -0.2, 0.001);
    p.rbox(B.recess, 0.002, 0.024, 0.07, 0.0262, 0.05, -0.06, 0.003);                                  // ejection port
    p.profile(fur, [[0.0, 0.084], [0.03, 0.084], [0.042, 0.112, 0.01], [0.27, 0.112, 0.01], [0.285, 0.084], [0.32, 0.084], [0.31, 0.126, 0.012], [0.006, 0.126, 0.012]], 0.03, { bevel: 0.004, r: 0.008 }); // carry handle
    p.rail(steel, 0.006, 0.31, 0.124);
    p.lathe(steel, [[0, 0.345], [0.024, 0.345], [0.024, 0.52], [0.019, 0.53], [0, 0.53]], BY, 0, 22);   // ported shroud
    for (let i = 0; i < 6; i++) for (let a = 0; a < 6; a++) { const t = a / 6 * Math.PI * 2; p.rbox(B.recess, 0.006, 0.006, 0.012, Math.cos(t) * 0.0236, BY + Math.sin(t) * 0.0236, -(0.37 + i * 0.026), 0.002, 0, 0, t); }
    p.lathe(dark, [[0, 0.52], [0.0125, 0.52], [0.0125, 0.6], [0, 0.6]], BY, 0, 18);
    const muzF = Math.max(0.6, k.muzzleDevice(p, B, A.muzzle, BY, 0.6, 0.0125, 0.18));
    p.profile(fur, [[-0.1, 0.082], [-0.37, 0.078, 0.01], [-0.382, 0.066], [-0.382, -0.062], [-0.36, -0.072, 0.01], [-0.24, -0.044, 0.03], [-0.1, -0.006]], 0.05, { bevel: 0.006, r: 0.012 });
    p.profile(B.rubber, [[-0.378, 0.078], [-0.394, 0.078], [-0.398, -0.068], [-0.382, -0.076]], 0.054, { bevel: 0.004, r: 0.006 });
    p.profile(fur, k.GRIP, 0.034, { bevel: 0.005, r: 0.01 });
    k.triggerGroup(p, { ...B, poly: fur }, -0.002, 0.014);
    let sight;
    if (A.optic === 'iron') sight = k.ironSights(p, B, 0.02, 0.134, 0.29, 0.134, 0.014);
    else sight = k.addOptic(A.optic, p, g, B, vm, 0.134, 0.14);
    k.foregrip.position.set(0, -0.01, -0.3);
    const laser = A.laser === 'laser' ? k.laserModule(p, g, B, 0.036, 0.03, 0.3) : null;
    // drum: feed neck, drum body with ribs, winding key
    mp.rbox(fur, 0.044, 0.04, 0.07, 0, -0.026, -0.16, 0.006);
    mp.add(steel, new THREE.CylinderGeometry(0.074, 0.074, 0.068, 30), 0, -0.105, -0.16, 0, 0, Math.PI / 2);
    for (const s of [-1, 1]) {
      mp.add(dark, new THREE.CylinderGeometry(0.068, 0.068, 0.004, 30), s * 0.035, -0.105, -0.16, 0, 0, Math.PI / 2);
      mp.add(steel, new THREE.CylinderGeometry(0.012, 0.012, 0.012, 12), s * 0.04, -0.105, -0.16, 0, 0, Math.PI / 2);
    }
    mp.add(dark, new THREE.TorusGeometry(0.074, 0.003, 6, 30), 0, -0.105, -0.16, 0, Math.PI / 2, 0);
    k.eject.position.set(0.028, 0.05, -0.06);
    return { muzF, BY, sight, laser };
  },

  // ---------- D-50: big-bore hand cannon, stainless, angular fixed barrel, exposed hammer ----------
  d50(k) {
    const { p, mp, g, B, A, tinted } = k;
    const ss = tinted(B.metal, 0x6c6e6c), dark = B.steel;
    const SY = 0.08;
    p.profile(ss, [[-0.034, 0.03], [0.05, 0.03], [0.05, 0.07, 0.004], [-0.028, 0.07, 0.004], [-0.034, 0.062]], 0.031, { r: 0.004, bevel: 0.0018 });            // slide
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) p.rbox(B.recess, 0.0012, 0.026, 0.0016, s * 0.0155, 0.05, 0.022 - i * 0.0048, 0.0005);
    p.frontal(ss, [[-0.0155, 0.03], [0.0155, 0.03], [0.0155, 0.06], [0.0095, 0.074], [-0.0095, 0.074], [-0.0155, 0.06]], 0.048, 0.218, [], 0.003, 0.0015);   // triangular barrel
    p.rbox(B.recess, 0.006, 0.002, 0.15, 0, 0.0745, -0.135, 0.001);                                  // top groove
    p.add(B.recess, new THREE.CircleGeometry(0.0072, 14), 0, 0.05, -0.2185);
    p.rbox(B.recess, 0.0012, 0.03, 0.002, 0.0157, 0.05, -0.05, 0.0005);
    p.profile(ss, [[-0.03, 0.031], [0.17, 0.031], [0.172, 0.012, 0.004], [0.078, 0.01], [0.06, 0.0], [-0.022, 0.0]], 0.029, { r: 0.004, bevel: 0.0015 });          // frame
    p.profile(ss, [[0.0, 0.004], [0.086, 0.004], [0.089, -0.004], [0.086, -0.038, 0.004], [0.012, -0.04, 0.01]], 0.012, { r: 0.004, holes: [[[0.009, -0.002], [0.079, -0.002], [0.079, -0.031], [0.014, -0.033]]] });
    p.profile(dark, [[0.03, 0.0], [0.04, 0.0], [0.036, -0.024], [0.03, -0.022]], 0.006, { r: 0.003, bevel: 0.001 });
    p.profile(B.rubber, [[-0.008, 0.022], [0.036, 0.014], [0.034, -0.01, 0.008], [0.024, -0.106, 0.012], [-0.028, -0.114, 0.01], [-0.04, -0.092, 0.01], [-0.032, -0.02, 0.02], [-0.04, 0.016, 0.008]], 0.036, { bevel: 0.006, r: 0.01 });
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) p.rbox(B.recess, 0.002, 0.003, 0.03, s * 0.0181, -0.03 - i * 0.015, 0.0 + i * 0.002, 0.001, -0.15);
    p.profile(ss, [[-0.03, 0.05], [-0.042, 0.068, 0.004], [-0.05, 0.066, 0.004], [-0.04, 0.044]], 0.009, { r: 0.002, bevel: 0.001 });   // hammer
    p.rbox(ss, 0.036, 0.006, 0.012, 0, 0.058, 0.02, 0.002);                                          // ambi safety
    notch(p, dark, -0.018, 0.072, SY, 0.02);
    p.rbox(dark, 0.0035, SY - 0.072, 0.008, 0, (SY + 0.072) / 2, -0.205, 0.001);
    let sight = { sightY: SY - 0.0005, sightZ: 0.018, eyeRelief: -0.28, frontZ: -0.205 + 0.0045, postTop: SY };
    if (A.optic === 'reflex') sight = { ...k.opticReflex(p, g, B, 0.075, 0.04, 0.8), eyeRelief: -0.3 };
    const muzF = Math.max(0.219, k.muzzleDevice(p, B, A.muzzle, 0.05, 0.218, 0.0095, 0.14));
    const laser = A.laser === 'laser' ? k.laserModule(p, g, B, 0, -0.002, 0.14, 0.022) : null;
    mp.rbox(B.rubber, 0.03, 0.014, 0.05, 0, -0.114, 0.002, 0.004, 0.22);
    mp.rbox(dark, 0.024, 0.02, 0.03, 0, -0.1, -0.002, 0.003, 0.22);
    k.eject.position.set(0.016, 0.065, -0.04);
    k.foregrip.position.set(-0.004, -0.06, 0.012);
    return { muzF, BY: 0.05, sight, laser };
  },

  // ---------- R-357: double-action revolver, fluted cylinder, full-lug barrel, wood grips ----------
  r357(k) {
    const { p, g, B, A, tinted } = k;
    const blue = tinted(B.metal, 0x2c2c30), wood = tinted(B.wood, 0x8c4a26), dark = B.steel;
    const AX = 0.045, SY = 0.0715;
    p.profile(blue, [[-0.032, 0.012], [-0.018, 0.058, 0.008], [0.0, 0.066], [0.09, 0.066], [0.095, 0.06], [0.095, 0.022], [0.075, 0.012], [0.02, 0.01], [0.0, 0.0], [-0.032, 0.0]], 0.027,
      { r: 0.004, bevel: 0.0015, holes: [[[0.019, 0.021], [0.081, 0.021], [0.081, 0.064], [0.019, 0.064]]] });
    // cylinder: six flutes, chambers showing at the front
    p.lathe(B.steel, [[0, 0.022], [0.0195, 0.022], [0.0215, 0.027], [0.0215, 0.073], [0.0195, 0.078], [0, 0.078]], AX, 0, 30);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + Math.PI / 6;
      p.rbox(B.recess, 0.005, 0.005, 0.034, Math.cos(a) * 0.0205, AX + Math.sin(a) * 0.0205, -0.05, 0.0024, 0, 0, a);
      const c = new THREE.CircleGeometry(0.0046, 12); c.rotateY(Math.PI);
      p.add(B.recess, c, Math.cos(a + Math.PI / 6) * 0.0125, AX + Math.sin(a + Math.PI / 6) * 0.0125, -0.0782);
    }
    p.lathe(blue, [[0, 0.093], [0.0095, 0.093], [0.0095, 0.225], [0, 0.225]], 0.047, 0, 18);           // barrel
    p.profile(blue, [[0.093, 0.026], [0.225, 0.026], [0.225, 0.046], [0.093, 0.046]], 0.016, { r: 0.004, bevel: 0.0015 });   // full underlug
    p.profile(blue, [[0.08, 0.054], [0.225, 0.054], [0.225, 0.061], [0.08, 0.064]], 0.009, { r: 0.002, bevel: 0.001 });       // vent rib
    for (let i = 0; i < 6; i++) p.rbox(B.recess, 0.0092, 0.003, 0.008, 0, 0.0585, -(0.105 + i * 0.02), 0.001);
    p.add(B.recess, new THREE.CircleGeometry(0.0045, 12).rotateY(Math.PI), 0, 0.047, -0.2255);
    p.profile(dark, [[0.198, 0.06], [0.218, 0.06], [0.216, SY], [0.21, SY]], 0.0035, { r: 0.001, bevel: 0.0005 });           // ramp front sight
    notch(p, dark, 0.004, 0.064, SY, 0.016);
    p.profile(blue, [[-0.022, 0.048], [-0.034, 0.072], [-0.046, 0.074, 0.004], [-0.04, 0.064], [-0.03, 0.044]], 0.009, { r: 0.002, bevel: 0.001 });  // hammer
    p.rbox(blue, 0.004, 0.008, 0.014, -0.0145, 0.047, -0.005, 0.002);                                 // cylinder latch
    guard(p, blue, -0.002, 0.012, 0.07, 0.038, 0.008, dark);
    p.profile(wood, [[-0.034, 0.012], [0.02, 0.006], [0.017, -0.03, 0.01], [0.012, -0.1, 0.014], [-0.03, -0.106, 0.012], [-0.046, -0.08, 0.012], [-0.042, -0.02, 0.012]], 0.032, { bevel: 0.006, r: 0.01 });
    for (let i = 0; i < 2; i++) p.rbox(B.recess, 0.033, 0.003, 0.012, 0, -0.04 - i * 0.024, -0.016, 0.001);
    let sight = { sightY: SY - 0.0005, sightZ: 0.0, eyeRelief: -0.28, frontZ: -0.213 + 0.0025, postTop: SY };
    if (A.optic === 'reflex') sight = { ...k.opticReflex(p, g, B, 0.066, 0.03, 0.8), eyeRelief: -0.3 };
    const muzF = Math.max(0.226, k.muzzleDevice(p, B, A.muzzle, 0.047, 0.225, 0.0095, 0.13));
    const laser = A.laser === 'laser' ? k.laserModule(p, g, B, 0, 0.008, 0.16, 0.016) : null;
    k.eject.position.set(0.0, 0.045, -0.05);
    k.foregrip.position.set(-0.004, -0.06, 0.012);
    return { muzF, BY: 0.047, sight, laser };
  },

  // ---------- MP-18: select-fire machine pistol, open-top slide, ported comp, folding front grip ----------
  mp18(k) {
    const { p, mp, g, B, A, tinted } = k;
    const sl = tinted(B.metal, 0x46523f), fr = B.poly, dark = B.steel;
    p.profile(sl, [[-0.025, 0.03], [0.225, 0.03], [0.235, 0.04, 0.004], [0.235, 0.058, 0.004], [0.226, 0.064, 0.004], [0.12, 0.064], [0.112, 0.056], [0.042, 0.056], [0.034, 0.064], [-0.02, 0.064, 0.004], [-0.025, 0.058]], 0.026, { r: 0.003, bevel: 0.0018 });
    p.lathe(dark, [[0, 0.036], [0.0085, 0.036], [0.0085, 0.12], [0, 0.12]], 0.05, 0, 14);               // barrel in the open top
    for (let i = 0; i < 3; i++) p.rbox(B.recess, 0.012, 0.004, 0.006, 0, 0.0642, -(0.2 + i * 0.011), 0.001);   // comp ports
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) p.rbox(B.recess, 0.0012, 0.022, 0.0016, s * 0.0131, 0.046, 0.016 - i * 0.0052, 0.0005);
    p.add(B.recess, new THREE.CircleGeometry(0.0045, 12).rotateY(Math.PI), 0, 0.047, -0.2355);
    p.profile(fr, [[-0.022, 0.031], [0.185, 0.031], [0.188, 0.012, 0.004], [0.078, 0.01], [0.058, 0.0], [0.0, 0.0]], 0.027, { r: 0.004, bevel: 0.0015 });
    // extended guard with the fold-down front grip
    p.profile(fr, [[0.0, 0.004], [0.102, 0.004], [0.106, -0.004], [0.104, -0.034, 0.004], [0.094, -0.04, 0.004], [0.01, -0.042, 0.01]], 0.012, { r: 0.004, holes: [[[0.009, -0.002], [0.088, -0.002], [0.088, -0.034], [0.013, -0.036]]] });
    p.profile(dark, [[0.03, 0.0], [0.04, 0.0], [0.036, -0.024], [0.03, -0.022]], 0.006, { r: 0.003, bevel: 0.001 });
    p.profile(fr, [[0.104, -0.0], [0.126, -0.0], [0.124, -0.068, 0.006], [0.106, -0.07, 0.006]], 0.016, { r: 0.004, bevel: 0.002 });
    p.profile(fr, [[-0.004, 0.02], [0.034, 0.014], [0.031, -0.006, 0.008], [0.024, -0.098, 0.01], [-0.022, -0.104, 0.008], [-0.03, -0.088, 0.008], [-0.026, -0.03, 0.02], [-0.034, 0.014, 0.008], [-0.024, 0.026, 0.006]], 0.03, { bevel: 0.005, r: 0.01 });
    p.rbox(dark, 0.004, 0.01, 0.012, -0.0158, 0.016, -0.004, 0.002);                                    // select-fire lever
    for (const x of [-0.0072, 0.0072]) p.rbox(dark, 0.0068, 0.0075, 0.007, x, 0.0665, 0.012, 0.0014);
    p.rbox(dark, 0.0038, 0.007, 0.005, 0, 0.0665, -0.215, 0.0012);
    let sight = { sightY: 0.0695, sightZ: 0.012, eyeRelief: -0.27, frontZ: -0.215 + 0.003, postTop: 0.07 };
    if (A.optic === 'reflex') sight = { ...k.opticReflex(p, g, B, 0.0645, 0.035, 0.8), eyeRelief: -0.3 };
    const muzF = Math.max(0.236, k.muzzleDevice(p, B, A.muzzle, 0.047, 0.235, 0.0075, 0.13));
    const laser = A.laser === 'laser' ? k.laserModule(p, g, B, 0, 0.0, 0.16, 0.02) : null;
    // 20-round extended magazine sticking out of the grip
    mp.profile(dark, [[-0.024, -0.09], [0.018, -0.09], [0.024, -0.165, 0.004], [-0.018, -0.17, 0.004]], 0.024, { r: 0.003, bevel: 0.0012 });
    mp.profile(fr, [[-0.02, -0.162], [0.028, -0.158], [0.03, -0.172, 0.003], [-0.02, -0.178, 0.003]], 0.028, { r: 0.002, bevel: 0.0012 });
    k.eject.position.set(0.016, 0.062, -0.07);
    k.foregrip.position.set(-0.004, -0.06, 0.012);
    return { muzF, BY: 0.047, sight, laser };
  },

  // ---------- The Monte: shoulder-fired launcher. Side-mounted sight (left of the tube) so aiming
  // looks past the tube, not through it; the warhead sits in the muzzle and is the "magazine". ----------
  monte(k) {
    const { p, mp, g, B, A, vm, Parts } = k;
    const od = B.olive, steel = B.metal, dark = B.steel;
    const AX = 0.075, SX = -0.074;
    p.lathe(od, [[0, -0.44], [0.044, -0.44], [0.047, -0.42], [0.047, 0.49], [0.05, 0.5], [0.05, 0.53], [0.0, 0.53]], AX, 0, 26);         // fibreglass tube
    p.lathe(steel, [[0.044, -0.44], [0.068, -0.58], [0.072, -0.6], [0.066, -0.6], [0.04, -0.46]], AX, 0, 26);                          // venturi
    p.lathe(dark, [[0.0, -0.47], [0.03, -0.47], [0.03, -0.46], [0.0, -0.46]], AX, 0, 16);
    for (const f of [-0.3, -0.02, 0.2, 0.44]) p.lathe(steel, [[0.047, f], [0.0505, f], [0.0505, f + 0.022], [0.047, f + 0.022]], AX, 0, 26);  // bands
    p.lathe(B.rubber, [[0.048, -0.24], [0.054, -0.235], [0.054, -0.08], [0.048, -0.075]], AX, 0, 26);                                      // shoulder wrap
    p.rbox(B.recess, 0.002, 0.03, 0.4, 0.047, AX, -0.05, 0.001);                                                                       // seam
    // stencil band near the muzzle
    p.lathe(tintedYellow(k), [[0.0472, 0.36], [0.0478, 0.36], [0.0478, 0.375], [0.0472, 0.375]], AX, 0, 26);
    // trigger housing + pistol grip, forward grip
    p.profile(od, [[-0.04, AX - 0.04], [0.11, AX - 0.04], [0.1, AX - 0.06, 0.006], [0.07, AX - 0.07], [-0.03, AX - 0.07]], 0.03, { r: 0.006, bevel: 0.003 });
    p.profile(B.poly, k.GRIP, 0.032, { bevel: 0.005, r: 0.01 });
    guard(p, steel, 0.002, -0.006, 0.09, 0.04, 0.009, dark);
    p.profile(od, [[0.24, AX - 0.044], [0.3, AX - 0.044], [0.296, -0.062, 0.01], [0.252, -0.066, 0.01]], 0.034, { r: 0.01, bevel: 0.004 });
    p.profile(od, [[0.22, AX - 0.04], [0.32, AX - 0.04], [0.31, AX - 0.056], [0.23, AX - 0.056]], 0.03, { r: 0.004 });
    // folded backup sights on top
    p.rbox(steel, 0.02, 0.006, 0.03, 0, AX + 0.05, -0.02, 0.002);
    p.rbox(steel, 0.02, 0.006, 0.03, 0, AX + 0.05, -0.4, 0.002);
    // side sight: bracket out to the left and a hooded holographic sight on it
    p.profile(steel, [[0.02, AX - 0.012], [0.16, AX - 0.012], [0.16, AX + 0.012], [0.02, AX + 0.012]], 0.03, { x: -0.052, r: 0.004, bevel: 0.0015 });
    p.rbox(steel, 0.04, 0.012, 0.11, SX + 0.012, AX + 0.006, -0.09, 0.003);
    const sp = new Parts(), sg = new THREE.Group();
    const hs = k.opticHolo(sp, sg, B, AX + 0.012, 0.08);
    sp.by.forEach(arr => arr.forEach(geo => geo.translate(SX, 0, 0)));
    sg.position.x = SX;
    sp.by.forEach((arr, mat) => arr.forEach(geo => p.add(mat, geo)));
    g.add(sg);
    // the rocket: olive warhead with a standoff probe, sitting in the muzzle
    mp.lathe(od, [[0, 0.51], [0.043, 0.51], [0.044, 0.54], [0.06, 0.6], [0.064, 0.66], [0.058, 0.72], [0.034, 0.79], [0.012, 0.83], [0, 0.832]], AX, 0, 26);
    mp.lathe(steel, [[0.0435, 0.53], [0.047, 0.53], [0.047, 0.545], [0.0435, 0.545]], AX, 0, 22);
    mp.lathe(dark, [[0, 0.83], [0.006, 0.83], [0.006, 0.87], [0.009, 0.875], [0, 0.88]], AX, 0, 12);
    mp.lathe(tintedYellow(k), [[0.0642, 0.64], [0.0646, 0.64], [0.0646, 0.655], [0.0642, 0.655]], AX, 0, 26);
    k.eject.position.set(0, AX, 0.6);   // the venturi: backblast comes out here
    k.foregrip.position.set(0, -0.03, -0.27);
    return { muzF: 0.88, BY: AX, sight: { ...hs, sightX: SX, eyeRelief: -0.26 }, laser: null };
  },

  // ---------- Knife Slingshot: a walnut Y-fork, black surgical-tube bands to a leather pouch, a throwing knife
  // loaded in it pointing out through the fork (the knife is the "magazine": it goes with the shot) ----------
  sling(k) {
    const { p, mp, B, tinted } = k;
    const wood = B.wood || tinted(B.poly, 0x8a5a32), band = B.rubber, leather = tinted(B.poly, 0x5a3a22), steel = B.steel;
    const AY = 0.097;                                                            // the shot line (fork gap, pouch)
    p.profile(wood, k.GRIP, 0.03, { bevel: 0.006, r: 0.012 });                   // handle
    p.add(wood, new THREE.CylinderGeometry(0.011, 0.013, 0.04, 12), 0, 0.016, 0);                             // stem
    const arm = (sx) => {
      const a = new THREE.Vector3(0, 0.032, 0), b = new THREE.Vector3(sx * 0.046, 0.108, 0), d = b.clone().sub(a);
      const g = new THREE.CylinderGeometry(0.007, 0.0095, d.length(), 12);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      p.add(wood, g, 0, 0, 0);
      p.add(wood, new THREE.SphereGeometry(0.0085, 10, 8), b.x, b.y, b.z);   // rounded tip
      p.add(band, new THREE.CylinderGeometry(0.0095, 0.0095, 0.012, 12), b.x, b.y - 0.01, b.z);   // band wrap at the tip
      return b;
    };
    // drawn back to the left cheek, the way you aim one: the pouch sits back and to the left, out of the sight
    // line through the fork (straight back, the pulling hand covered the whole view)
    const pouch = new THREE.Vector3(-0.12, AY - 0.05, 0.16), aim = new THREE.Vector3(0, AY, 0).sub(pouch).normalize();
    for (const sx of [-1, 1]) {
      const t = arm(sx), d = pouch.clone().add(new THREE.Vector3(0, sx * 0.008, 0)).sub(t);
      const g = new THREE.CylinderGeometry(0.0028, 0.0028, d.length(), 8);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      g.translate(t.x + d.x / 2, t.y - 0.01 + d.y / 2, t.z + d.z / 2);
      p.add(band, g, 0, 0, 0);
    }
    const toAim = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), aim);
    const pg = new THREE.BoxGeometry(0.026, 0.022, 0.03); pg.applyQuaternion(toAim); pg.translate(pouch.x, pouch.y, pouch.z);
    p.add(leather, pg, 0, 0, 0);                                                  // pouch
    // the knife: blade forward along the draw, out through the fork; handle back in the pouch
    const blade = new THREE.Shape(); blade.moveTo(0, -0.011); blade.lineTo(0.15, -0.004); blade.lineTo(0.18, 0.0); blade.lineTo(0.15, 0.011); blade.lineTo(0, 0.011);
    const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.003, bevelEnabled: false }); bg.rotateY(Math.PI / 2); bg.translate(-0.0015, 0, -0.02);
    bg.applyQuaternion(toAim); bg.translate(pouch.x, pouch.y, pouch.z);
    mp.add(steel, bg, 0, 0, 0);
    const hg = new THREE.BoxGeometry(0.011, 0.02, 0.07); hg.translate(0, 0, 0.015); hg.applyQuaternion(toAim); hg.translate(pouch.x, pouch.y, pouch.z);
    mp.add(B.rubber, hg, 0, 0, 0);
    k.eject.position.copy(pouch);
    k.foregrip.position.copy(pouch).add(new THREE.Vector3(-0.01, -0.01, 0.025));   // the left hand pinches the pouch here
    return { muzF: 0.07, BY: AY, sight: { sightY: AY, sightZ: 0, eyeRelief: -0.36 }, laser: null };   // the sight: the gap between the fork tips
  },
};
let yellow = null;
function tintedYellow(k) { return yellow || (yellow = k.tinted(k.B.poly, 0xc8a020)); }
