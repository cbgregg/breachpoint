// Map construction: geometry, colliders, spawns, pickups, nav grid, minimap
import * as THREE from 'three';
import { Box } from './physics.js';
import { NavGrid } from './nav.js';
import { makeTextures } from './textures.js';
import { TEAMS } from './config.js';

export const MAP = { minX: -42, maxX: 42, minZ: -30, maxZ: 30 };

// [cx, cz, w(x), d(z), h, y0, kind, color]
// HALF items are mirrored through the center (x,z) -> (-x,-z) for a fair symmetric map.
const CENTER = [
  [0, 0, 8, 8, 3, 0, 'concrete'],
];

const HALF = [
  // central platform parapets
  [3.75, 2, 0.5, 4, 1.0, 3, 'metal', 0x6f7b85],
  [0, 3.75, 8, 0.5, 1.0, 3, 'metal', 0x6f7b85],
  // long lane walls
  [14, 12, 12, 1, 3.2, 0, 'wall'],
  [14, -12, 12, 1, 3.2, 0, 'wall'],
  // crate cluster
  [8, 8, 1.6, 1.6, 1.6, 0, 'crate'],
  [9.8, 8, 1.6, 1.6, 1.6, 0, 'crate'],
  [8.9, 8, 1.4, 1.4, 1.4, 1.6, 'crate'],
  [6, -10, 2, 2, 1.2, 0, 'crate'],
  [12, -4, 1.5, 1.5, 1.5, 0, 'crate'],
  [26, 6, 1.5, 1.5, 1.5, 0, 'crate'],
  [12, 22, 2, 2, 2, 0, 'crate'],
  // mid-lane cover
  [20, 0, 1.2, 6, 1.4, 0, 'concrete'],
  [14, 4, 3, 0.8, 1.1, 0, 'sand'],
  [24, -5, 0.8, 3, 1.1, 0, 'sand'],
  // containers
  [22, 22, 7, 2.6, 2.6, 0, 'container', 0xc8642c],
  [8, -22, 7, 2.6, 2.6, 0, 'container', 0x2c7f86],
  // pillars
  [4, 16, 1, 1, 4, 0, 'concrete'],
  [4, -16, 1, 1, 4, 0, 'concrete'],
  // hut
  [18, -26.8, 6, 0.4, 3, 0, 'wall'],
  [15.2, -24, 0.4, 6, 3, 0, 'wall'],
  [20.8, -24, 0.4, 6, 3, 0, 'wall'],
  [16, -21.2, 2, 0.4, 3, 0, 'wall'],
  [20, -21.2, 2, 0.4, 3, 0, 'wall'],
  [18, -24, 6.4, 6.4, 0.3, 3, 'concrete'],
  // base walls (red side; mirrored for blue)
  [30, 7, 1, 8, 3.5, 0, 'base'],
  [30, -7, 1, 8, 3.5, 0, 'base'],
  [36, 0, 2, 2, 1.2, 0, 'crate'],
  // boundary
  [0, 30.5, 86, 1, 6, 0, 'boundary'],
  [42.5, 0, 1, 62, 6, 0, 'boundary'],
];

// stairs up to the platform (+x side, mirrored to -x)
for (let k = 1; k <= 6; k++) HALF.push([4 + (6.5 - k) * 0.9, -2.5, 0.9, 3, k * 0.5, 0, 'concrete']);

const SPAWNS_RED = [[38, -24], [38, -16], [38, -8], [38, 8], [38, 16], [38, 24], [34, -14], [34, 14]];

export const PICKUP_SPOTS = [
  { type: 'health', pos: [0, 3, 0] },
  { type: 'health', pos: [18, 0, -24] },
  { type: 'health', pos: [-18, 0, 24] },
  { type: 'ammo', pos: [10, 0, 18] },
  { type: 'ammo', pos: [-10, 0, -18] },
  { type: 'ammo', pos: [24, 0, 0] },
  { type: 'ammo', pos: [-24, 0, 0] },
];

function boxGeo(w, h, d, scale) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!scale) return g;
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / scale, uv.getY(i) * dims[f][1] / scale);
    }
  }
  return g;
}

export function buildWorld(scene, physics) {
  const tex = makeTextures();
  const mats = {
    concrete: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.92 }),
    wall: new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.9 }),
    crate: new THREE.MeshStandardMaterial({ map: tex.crate, roughness: 0.85 }),
    sand: new THREE.MeshStandardMaterial({ map: tex.sand, roughness: 1 }),
    boundary: new THREE.MeshStandardMaterial({ map: tex.wall, color: 0x8d97a3, roughness: 0.95 }),
  };
  const texScale = { concrete: 2, wall: 2, sand: 1.2, boundary: 3, metal: 2, container: 2.6, base: 2 };

  const world = { group: new THREE.Group(), spawns: [[], []], meshes: [] };
  scene.add(world.group);

  const addBox = (cx, cz, w, d, h, y0, kind, color, team) => {
    physics.addBox(new Box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2));
    let mat;
    if (kind === 'metal' || kind === 'container') {
      mat = new THREE.MeshStandardMaterial({ map: tex.metal, color: color ?? 0x888888, roughness: 0.6, metalness: 0.35 });
    } else if (kind === 'base') {
      mat = mats.wall;
    } else {
      mat = mats[kind];
    }
    const geo = boxGeo(w, h, d, kind === 'crate' ? 0 : texScale[kind]);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = kind !== 'boundary';
    mesh.receiveShadow = true;
    world.group.add(mesh);
    if (kind === 'base') {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.25, d + 0.04),
        new THREE.MeshStandardMaterial({ color: TEAMS[team].color, emissive: TEAMS[team].color, emissiveIntensity: 0.6 }));
      stripe.position.set(cx, y0 + h - 0.3, cz);
      world.group.add(stripe);
    }
  };

  // ground
  physics.addBox(new Box(-200, -2, -200, 200, 0, 200));
  const groundTex = tex.ground.clone();
  groundTex.needsUpdate = true;
  groundTex.repeat.set(100 / 4, 100 / 4);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.group.add(ground);

  for (const it of CENTER) addBox(...it);
  for (const [cx, cz, w, d, h, y0, kind, color] of HALF) {
    addBox(cx, cz, w, d, h, y0, kind, color, 1);
    addBox(-cx, -cz, w, d, h, y0, kind, color, 0);
  }

  // team base floor tint
  for (const team of [0, 1]) {
    const sx = team === 1 ? 1 : -1;
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(11, 60),
      new THREE.MeshBasicMaterial({ color: TEAMS[team].color, transparent: true, opacity: 0.12, depthWrite: false }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(sx * 36.5, 0.02, 0);
    world.group.add(zone);
  }

  // spawns
  for (const [x, z] of SPAWNS_RED) {
    world.spawns[1].push(new THREE.Vector3(x, 0, z));
    world.spawns[0].push(new THREE.Vector3(-x, 0, -z));
  }
  world.spawnYaw = [-Math.PI / 2, Math.PI / 2];

  // sky dome
  const skyGeo = new THREE.SphereGeometry(320, 32, 16);
  const colors = [];
  const top = new THREE.Color(0x4f7fb5), horizon = new THREE.Color(0xd3dde6), below = new THREE.Color(0x8a8f86);
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 320;
    const c = y >= 0 ? horizon.clone().lerp(top, Math.pow(y, 0.6)) : horizon.clone().lerp(below, Math.min(1, -y * 4));
    colors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  world.sky = sky;

  // distant scenery blocks for a skyline
  const silMat = new THREE.MeshStandardMaterial({ color: 0x7d8790, roughness: 1 });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 85 + Math.random() * 40;
    const h = 8 + Math.random() * 30;
    const m = new THREE.Mesh(new THREE.BoxGeometry(8 + Math.random() * 14, h, 8 + Math.random() * 14), silMat);
    m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r * 0.8);
    world.group.add(m);
  }

  // lighting
  scene.add(new THREE.HemisphereLight(0xc4dcff, 0x5a5040, 1.7));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
  sun.position.set(30, 55, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -50; sc.right = 50; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 150;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);
  scene.fog = new THREE.Fog(0xc2ccd6, 70, 190);

  world.nav = new NavGrid(physics, MAP, 1, 0.45);
  world.minimap = renderMinimap(physics);
  return world;
}

function renderMinimap(physics) {
  const scale = 3;
  const w = (MAP.maxX - MAP.minX) * scale, h = (MAP.maxZ - MAP.minZ) * scale;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,26,32,0.85)';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(61,139,255,0.18)'; g.fillRect(0, 0, 11 * scale, h);
  g.fillStyle = 'rgba(255,74,74,0.18)'; g.fillRect(w - 11 * scale, 0, 11 * scale, h);
  const sorted = [...physics.boxes].filter(b => b.maxy > 0.3 && b.minx > -100).sort((a, b) => a.maxy - b.maxy);
  for (const b of sorted) {
    const v = Math.min(1, b.maxy / 4);
    g.fillStyle = `rgba(${150 + v * 70},${160 + v * 60},${170 + v * 50},0.9)`;
    g.fillRect((b.minx - MAP.minX) * scale, (b.minz - MAP.minZ) * scale, (b.maxx - b.minx) * scale, (b.maxz - b.minz) * scale);
  }
  return { canvas: c, scale };
}
