"""Vacancy: a roadside motel, built as a Blender scene and exported for the game.

    python3 tools/blender/vacancy.py            (needs Blender's Python module, bpy)

Writes assets/maps/vacancy.glb (what you see), js/maps/vacancy.data.js (collision boxes, spawns, the roofs' stairs
for bots) and assets/maps/vacancy.blend (the scene, to open and edit in Blender). Blender axes: x east, y north,
z up; the game's are x east, y up, z south, so a point (x, y, z) here is (x, z, -y) there.

Stage 1 is a blockout: plain grey shapes at real sizes, cover in amber, so the layout can be judged before it is
dressed. The plan is point-mirrored (everything built for the west team is turned half a turn for the east).
"""
import bpy, json, os, math

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
HX, HY = 34, 25          # half sizes of the playable ground
H = 3.2                  # a wing's roof (walkable)
T = 0.3                  # wall thickness

bpy.ops.wm.read_factory_settings(use_empty=True)
MATS = {}
def mat(name, rgb, rough=0.9):
    if name not in MATS:
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
        MATS[name] = m
    return MATS[name]
C = {
    'ground': (0.23, 0.23, 0.24), 'deck': (0.52, 0.5, 0.46), 'wall': (0.62, 0.61, 0.58), 'solid': (0.5, 0.5, 0.5), 'roof': (0.36, 0.36, 0.37),
    'floor': (0.55, 0.47, 0.36), 'cover': (0.78, 0.45, 0.1), 'stairs': (0.36, 0.44, 0.55), 'trim': (0.16, 0.16, 0.17), 'pool': (0.12, 0.42, 0.6),
    'perim': (0.4, 0.4, 0.4), 'line': (0.8, 0.8, 0.75), 'westTeam': (0.2, 0.4, 0.75), 'eastTeam': (0.75, 0.3, 0.2),
}
boxes = []   # collision, in the game's axes: [minx, miny, minz, maxx, maxy, maxz, surface]
def box(name, x0, y0, x1, y1, z0, z1, m='wall', solid=True, surface='concrete', mirror=True):
    """An axis-aligned block (and its half-turn twin unless mirror=False)."""
    for s in ((1, -1) if mirror else (1,)):
        a0, a1 = sorted((s * x0, s * x1)); b0, b1 = sorted((s * y0, s * y1))
        bpy.ops.mesh.primitive_cube_add(size=1, location=((a0 + a1) / 2, (b0 + b1) / 2, (z0 + z1) / 2))
        o = bpy.context.object; o.scale = (a1 - a0, b1 - b0, z1 - z0); o.name = name + ('' if s > 0 else '.E')
        o.data.materials.append(mat(m, C[m]))
        if solid: boxes.append([round(a0, 3), round(z0, 3), round(-b1, 3), round(a1, 3), round(z1, 3), round(-b0, 3), surface])

def wall_x(name, y0, y1, xa, xb, z1, openings=()):
    """A wall running east-west between xa and xb, with (centre, width, sill, head) openings."""
    cur = xa
    for c, w, s0, s1 in sorted(openings):
        box(name, cur, y0, c - w / 2, y1, 0, z1)
        if s0 > 0: box(name + '.sill', c - w / 2, y0, c + w / 2, y1, 0, s0)
        if s1 < z1: box(name + '.head', c - w / 2, y0, c + w / 2, y1, s1, z1)
        box(name + '.frame', c - w / 2 - 0.06, y0 - 0.04, c - w / 2, y1 + 0.04, s0, s1, 'trim', solid=False)
        box(name + '.frame', c + w / 2, y0 - 0.04, c + w / 2 + 0.06, y1 + 0.04, s0, s1, 'trim', solid=False)
        cur = c + w / 2
    box(name, cur, y0, xb, y1, 0, z1)
def wall_y(name, x0, x1, ya, yb, z1, openings=()):
    cur = ya
    for c, w, s0, s1 in sorted(openings):
        box(name, x0, cur, x1, c - w / 2, 0, z1)
        if s0 > 0: box(name + '.sill', x0, c - w / 2, x1, c + w / 2, 0, s0)
        if s1 < z1: box(name + '.head', x0, c - w / 2, x1, c + w / 2, s1, z1)
        box(name + '.frame', x0 - 0.04, c - w / 2 - 0.06, x1 + 0.04, c - w / 2, s0, s1, 'trim', solid=False)
        box(name + '.frame', x0 - 0.04, c + w / 2, x1 + 0.04, c + w / 2 + 0.06, s0, s1, 'trim', solid=False)
        cur = c + w / 2
    box(name, x0, cur, x1, yb, 0, z1)
DOOR = (1.5, 0, 2.2); WIN = (1.8, 1.0, 2.1)   # width, sill, head

# ---------- ground ----------
box('ground', -HX - 20, -HY - 20, HX + 20, HY + 20, -0.2, 0, 'ground', solid=False, mirror=False)
box('courtyard deck', -18, -8, 18, 8, 0, 0.02, 'deck', solid=False, mirror=False)
for x in range(-16, 17, 3):   # parking bays along the north wing's front (and the south wing's, mirrored)
    box('bay line', x - 0.06, 15.3, x + 0.06, 20.2, 0, 0.015, 'line', solid=False)
box('west spawn', -33.5, -10, -30.5, 10, 0, 0.012, 'westTeam', solid=False, mirror=False)
box('east spawn', 30.5, -10, 33.5, 10, 0, 0.012, 'eastTeam', solid=False, mirror=False)

# ---------- the perimeter: a block wall round the lot ----------
box('perimeter N', -HX - 0.4, HY, HX + 0.4, HY + 0.4, 0, 4, 'perim')
box('perimeter W', -HX - 0.4, -HY, -HX, HY, 0, 4, 'perim')

# ---------- the north wing (the south wing is its twin): rooms x -18..18, y 8..15 ----------
W0, W1, Y0, Y1 = -18, 18, 8, 15
box('rooms 101-102', -18, Y0, -12, Y1, 0, H, 'solid')
box('rooms 104-106', -6, Y0, 3, Y1, 0, H, 'solid')
box('rooms 107-108', 6, Y0, 12, Y1, 0, H, 'solid')
# room 103 (x -12..-6): a walk-through, door on the courtyard, door and window on the lot
wall_x('room 103 south', Y0, Y0 + T, -12, -6, H - 0.2, [(-9.6, *DOOR)])
wall_x('room 103 north', Y1 - T, Y1, -12, -6, H - 0.2, [(-10.4, *DOOR), (-7.8, *WIN)])
box('room 103 roof', -12, Y0, -6, Y1, H - 0.2, H, 'roof')
box('room 103 floor', -12, Y0, -6, Y1, 0, 0.02, 'floor', solid=False)
box('room 103 bed', -8.2, 10.3, -6.4, 12.4, 0, 0.6, 'cover', surface='wood')
# room 109 (x 12..18): the far walk-through, with an end wall
wall_x('room 109 south', Y0, Y0 + T, 12, 18, H - 0.2, [(14.2, *DOOR), (16.6, *WIN)])
wall_x('room 109 north', Y1 - T, Y1, 12, 18, H - 0.2, [(15.8, *DOOR)])
wall_y('room 109 east', 18 - T, 18, Y0 + T, Y1 - T, H - 0.2, [(11.5, *WIN)])
box('room 109 roof', 12, Y0, 18, Y1, H - 0.2, H, 'roof')
box('room 109 floor', 12, Y0, 18, Y1, 0, 0.02, 'floor', solid=False)
box('room 109 bed', 12.4, 10.6, 14.2, 12.7, 0, 0.6, 'cover', surface='wood')
# the breezeway (x 3..6): open through the wing, roofed, a vending machine and an ice chest in it
box('breezeway roof', 3, Y0, 6, Y1, H - 0.2, H, 'roof')
box('vending machine', 3, 12.6, 3.8, 13.7, 0, 1.9, 'cover', surface='metal')
box('ice chest', 5.2, 9.4, 6, 10.9, 0, 1.0, 'cover', surface='metal')
# the roof: parapets (lower on the courtyard side, to shoot over), air conditioners for cover
box('parapet lot side', W0, Y1 - 0.25, W1, Y1, H, H + 1.2, 'wall')
box('parapet courtyard', W0 + 3.2, Y0, W1, Y0 + 0.25, H, H + 0.9, 'wall')
box('parapet east end', W1 - 0.25, Y0 + 0.25, W1, Y1 - 0.25, H, H + 1.2, 'wall')
box('parapet west end', W0, 10.2, W0 + 0.25, Y1 - 0.25, H, H + 1.2, 'wall')
for x, y in ((-8, 12.2), (1.5, 11), (10, 12.6)):
    box('air conditioner', x - 0.9, y - 0.6, x + 0.9, y + 0.6, H, H + 1.15, 'cover', surface='metal')
# outside stairs up to the roof at the wing's west end (16 steps, 1.4 m wide)
STEPS, SX0, SX1 = 16, -23, -18
for i in range(STEPS):
    xa = SX0 + i * (SX1 - SX0) / STEPS
    box('roof stairs', xa, 8.6, xa + (SX1 - SX0) / STEPS, 10.0, 0, (i + 1) * H / STEPS, 'stairs')
box('stair wall', SX0, 10.0, SX1, 10.2, 0, H + 1.0, 'wall')

# ---------- the courtyard: pool in the middle, cabanas and planters breaking the long views ----------
box('pool water', -5, -2.5, 5, 2.5, 0.02, 0.06, 'pool', solid=False, mirror=False)
for a in ((-5.4, -2.9, 5.4, -2.5), (-5.4, -2.5, -5, 2.5)):
    box('pool kerb', *a, 0, 0.35, 'deck')
box('cabana', -11, 2, -8, 5, 0, 3.0, 'solid')
box('planter', -16.5, -4.6, -13.5, -3.6, 0, 1.1, 'cover')
box('planter', -4, 5.0, 0, 5.8, 0, 1.1, 'cover')
box('pool bar', 6.2, 3.4, 7.0, 6.4, 0, 1.15, 'cover', surface='wood')
box('loungers', -3.2, -5.6, 1.2, -4.9, 0, 0.5, 'cover', surface='wood')

# ---------- the west end: the office (the east end's twin is the laundry) and the back street behind it ----------
OX0, OX1, OY0, OY1 = -29, -22, -5, 5
wall_y('office west', OX0, OX0 + T, OY0, OY1, H, [(-2.6, *DOOR)])
wall_y('office east', OX1 - T, OX1, OY0, OY1, H, [(2.6, *DOOR), (-1.8, *WIN)])
wall_x('office north', OY1 - T, OY1, OX0 + T, OX1 - T, H, [(-25.5, *WIN)])
wall_x('office south', OY0, OY0 + T, OX0 + T, OX1 - T, H, [(-25.5, *WIN)])
box('office roof', OX0, OY0, OX1, OY1, H, H + 0.2, 'roof')
box('office floor', OX0, OY0, OX1, OY1, 0, 0.02, 'floor', solid=False)
box('front desk', -26.4, -0.5, -23.4, 0.3, 0, 1.15, 'cover', surface='wood')

# ---------- the lot (the outer lane): a box truck, parked cars, a van and the sign's base ----------
box('box truck', -3.5, 18.6, 3.5, 21.0, 0, 3.0, 'cover', surface='metal')
for x in (-13.5, -7.5, 8.5, 14.5):
    box('parked car', x - 0.9, 15.6, x + 0.9, 20.0, 0, 1.4, 'cover', surface='metal')
box('van', 9, 22.6, 14.5, 24.7, 0, 2.3, 'cover', surface='metal')
box('parked car', -21, 22.8, -16.5, 24.6, 0, 1.4, 'cover', surface='metal')
box('sign base', 20, 16, 23, 19, 0, 3.6, 'solid')
box('dumpster', -27, 21.5, -25, 22.9, 0, 1.3, 'cover', surface='metal')
box('dumpster', -27, 23.2, -25, 24.6, 0, 1.3, 'cover', surface='metal')
box('ice machine', -19.4, 15.2, -18.2, 16.1, 0, 1.6, 'cover', surface='metal')

# ---------- export ----------
# one mesh per material (a handful of draw calls)
by = {}
for o in list(bpy.data.objects):
    by.setdefault(o.data.materials[0].name, []).append(o)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'assets', 'maps', 'vacancy.blend'))   # (the editable scene keeps every named piece)
for name, objs in by.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if len(objs) > 1: bpy.ops.object.join()
    bpy.context.object.name = name
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'assets', 'maps', 'vacancy.glb'), export_format='GLB', export_apply=True, export_yup=True)

stair = lambda s: {'rect': sorted([s * -23.6, s * -17.4])[:1] + sorted([s * -10.0, s * -8.6])[:1] + sorted([s * -23.6, s * -17.4])[1:] + sorted([s * -10.0, s * -8.6])[1:],
                   'climb': [[s * -24.2, 0, s * -9.3], [s * -23, 0.2, s * -9.3], [s * -20.5, H / 2, s * -9.3], [s * -18.2, H, s * -9.3], [s * -16.5, H, s * -11.5]]}
data = {
    'half': [HX, HY], 'roof': H, 'boxes': boxes,
    # the east team's spawn points (the west team's are these turned half a turn), in the game's x, z
    'spawns': [[32, z] for z in (-9, -7, -5, -3, -1, 1, 3, 5, 7, 9)],
    'upper': [{'y': H, 'bounds': {'minX': -18, 'maxX': 18, 'minZ': -15, 'maxZ': -8}, 'portals': [stair(1)]},
              {'y': H, 'bounds': {'minX': -18, 'maxX': 18, 'minZ': 8, 'maxZ': 15}, 'portals': [stair(-1)]}],
    'pickups': [['health', 0, 0, 4.2], ['health', 0, 0, -4.2], ['ammo', -25, 0, 2], ['ammo', 25, 0, -2], ['ammo', 4.5, 0, -11.5], ['ammo', -4.5, 0, 11.5],
                ['health', 0, H, -11.5], ['health', 0, H, 11.5]],
}
with open(os.path.join(ROOT, 'js', 'maps', 'vacancy.data.js'), 'w') as f:
    f.write('// Generated by tools/blender/vacancy.py from the Blender scene: do not edit by hand.\nexport default ' + json.dumps(data, separators=(',', ':')) + ';\n')
print('vacancy:', len(boxes), 'collision boxes,', len(by), 'meshes')
