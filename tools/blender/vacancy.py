"""Vacancy: a roadside motel, built as a Blender scene and exported for the game.

    python3 tools/blender/vacancy.py            (needs Blender's Python module, bpy)

Writes assets/maps/vacancy.glb (what you see), js/maps/vacancy.data.js (collision boxes, spawns, parked vehicles,
the roofs' stairs for bots) and assets/maps/vacancy.blend (the scene, to open and edit in Blender). Blender axes:
x east, y north, z up; the game's are x east, y up, z south, so a point (x, y, z) here is (x, z, -y) there.

The plan is point-mirrored: what is built for the west team is turned half a turn for the east. A material's name
is '<texture set>:<what it is>'; the game swaps in its own texture set of that name (js/vacancy.js), tinted with the
colour given here, and the UVs are in metres. 'flat' has no texture.
"""
import bpy, json, os, math
from mathutils import Matrix, Vector

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
HX, HY = 34, 25          # half sizes of the playable ground
H = 3.2                  # a wing's roof (walkable)
T = 0.3                  # wall thickness
HALF_TURN = Matrix.Rotation(math.pi, 4, 'Z')

bpy.ops.wm.read_factory_settings(use_empty=True)
lin = lambda c: ((c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
MATS = {}
def mat(name, hexrgb, rough=0.9, metal=0.0, emit=0.0):
    if name not in MATS:
        rgb = [lin(((hexrgb >> s) & 255) / 255) for s in (16, 8, 0)]
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
        if emit: b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
        MATS[name] = m
    return MATS[name]
M = {
    'asphalt': ('asphalt:lot', 0xb9b9b9), 'verge': ('dirt:verge', 0x8c9a6a), 'deck': ('flat:pool deck', 0xd6d0c2), 'joint': ('flat:paving joint', 0xaaa496), 'walk': ('concrete:walkway', 0xdedad0),
    'stucco': ('plaster:stucco', 0xf0e2c4), 'base': ('plaster:base band', 0xb9a98a), 'fascia': ('paint:fascia', 0x2f7f86), 'roof': ('asphalt:roof', 0x8c8880),
    'cap': ('flat:metal cap', 0x4a4d50), 'door': ('paint:door', 0x2a8c92), 'frame': ('flat:white trim', 0xf2efe6), 'glass': ('flat:glass', 0x1a2430),
    'curtain': ('cloth:curtain', 0xd9c9a0), 'ac': ('metal:air conditioner', 0xbfc3c4), 'dark': ('flat:dark', 0x1c1d1f), 'step': ('concrete:stairs', 0xbdb8ac),
    'rail': ('flat:rail', 0x26474a), 'carpet': ('cloth:carpet', 0x7a3b34), 'wood': ('wood:wood', 0xa97c50), 'sheet': ('flat:bed linen', 0xf1ede2),
    'blanket': ('cloth:blanket', 0x2f7f86), 'tile': ('whitetile:pool tile', 0xe9f3f2), 'water': ('flat:water', 0x2aa6c4), 'hedge': ('flat:hedge', 0x3f6a34),
    'planter': ('concrete:planter', 0xf0ece2), 'block': ('plaster:block wall', 0xe2d8c2), 'line': ('flat:paint line', 0xe8e6da), 'red': ('paint:vending', 0xb3261e),
    'white': ('paint:white', 0xeceae4), 'green': ('paint:dumpster', 0x2f5a3a), 'pine': ('flat:pine', 0x24452c), 'trunk': ('flat:trunk', 0x4a3626),
    'pole': ('flat:pole', 0x5a4a3a), 'sign': ('paint:sign', 0x16636b), 'chrome': ('flat:chrome', 0xc8ccd0), 'far': ('flat:far building', 0x9a948a),
    'cover': ('flat:cover', 0xc8731a), 'lobby': ('tile:lobby floor', 0xd9cfbb),
}
EMIT = {'neon pink': 0xff3d7f, 'neon aqua': 0x39e6d8, 'neon white': 0xfff2d0, 'lamp': 0xffd9a0, 'bulb': 0xffc56e, 'screen': 0xbfe6ff}
def m_(k):
    if k in EMIT: return mat('flat:' + k, EMIT[k], 0.4, 0, 4.0)
    name, col = M[k]
    return mat(name, col, {'glass': 0.08, 'water': 0.05, 'chrome': 0.25, 'cap': 0.5}.get(k, 0.9), {'chrome': 0.9, 'cap': 0.6, 'ac': 0.4}.get(k, 0.0))

boxes, vehicles = [], []   # collision in the game's axes: [minx, miny, minz, maxx, maxy, maxz, surface]

def finish(o, k, mirror, uv=True):
    """Material, metre UVs, and the half-turn twin."""
    o.data.materials.append(m_(k))
    bpy.context.view_layer.update()
    if uv and o.data.uv_layers:
        uvl = o.data.uv_layers.active.data; mw = o.matrix_world; n3 = mw.to_3x3()
        for p in o.data.polygons:
            n = (n3 @ p.normal).normalized(); ax = max(range(3), key=lambda i: abs(n[i]))
            for li in p.loop_indices:
                c = mw @ o.data.vertices[o.data.loops[li].vertex_index].co
                uvl[li].uv = (c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y)
    if mirror:
        t = o.copy(); t.data = o.data.copy(); t.name = o.name + '.E'; bpy.context.collection.objects.link(t); t.matrix_world = HALF_TURN @ o.matrix_world
    return o

def box(name, x0, y0, x1, y1, z0, z1, k='stucco', solid=True, surface='concrete', mirror=True, top=None):
    """An axis-aligned block (and its half-turn twin unless mirror=False). top: collision reaches higher than what's drawn."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.object; o.scale = (abs(x1 - x0), abs(y1 - y0), z1 - z0); o.name = name
    finish(o, k, mirror)
    if solid:
        for s in ((1, -1) if mirror else (1,)):
            a0, a1 = sorted((s * x0, s * x1)); b0, b1 = sorted((s * y0, s * y1))
            boxes.append([round(a0, 3), round(z0, 3), round(-b1, 3), round(a1, 3), round(top or z1, 3), round(-b0, 3), surface])
    return o
def deco(name, x0, y0, x1, y1, z0, z1, k, mirror=True):
    return box(name, x0, y0, x1, y1, z0, z1, k, solid=False, mirror=mirror)
def cyl(name, x, y, z0, z1, r, k, mirror=True, seg=10, r2=None, rot=None):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r if r2 is None else r2, depth=z1 - z0, location=(x, y, (z0 + z1) / 2))
    o = bpy.context.object; o.name = name
    if rot: o.rotation_euler = rot
    return finish(o, k, mirror, uv=False)
def bar(name, a, b, r, k, mirror=True):
    """A thin round bar from point a to point b."""
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object; o.name = name; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return finish(o, k, mirror, uv=False)
def text(body, x, y, z, yaw, size, k, mirror=False, depth=0.03, half_turn=False):
    """Lettering standing upright, centred on (x, y, z), reading left to right for someone it faces (yaw 0 faces south)."""
    bpy.ops.object.text_add(location=(0, 0, 0))
    o = bpy.context.object; o.data.body = body; o.data.size = size; o.data.extrude = depth; o.data.align_x = 'CENTER'; o.data.align_y = 'CENTER'
    bpy.ops.object.convert(target='MESH'); o = bpy.context.object; o.name = 'text ' + body
    o.matrix_world = (HALF_TURN if half_turn else Matrix.Identity(4)) @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X')
    return finish(o, k, mirror, uv=False)

def wall_x(name, y0, y1, xa, xb, z1, openings=(), k='stucco'):
    """A wall running east-west between xa and xb, with (centre, width, sill, head) openings, each framed."""
    cur = xa
    for c, w, s0, s1 in sorted(openings):
        box(name, cur, y0, c - w / 2, y1, 0, z1, k)
        if s0 > 0: box(name + '.sill', c - w / 2, y0, c + w / 2, y1, 0, s0, k)
        if s1 < z1: box(name + '.head', c - w / 2, y0, c + w / 2, y1, s1, z1, k)
        for xx in (c - w / 2 - 0.07, c + w / 2): deco(name + '.frame', xx, y0 - 0.05, xx + 0.07, y1 + 0.05, s0, s1 + 0.07, 'frame')
        deco(name + '.frame', c - w / 2, y0 - 0.05, c + w / 2, y1 + 0.05, s1, s1 + 0.07, 'frame')
        if s0 > 0: deco(name + '.ledge', c - w / 2 - 0.1, y0 - 0.08, c + w / 2 + 0.1, y1 + 0.08, s0 - 0.06, s0, 'frame')
        cur = c + w / 2
    box(name, cur, y0, xb, y1, 0, z1, k)
def wall_y(name, x0, x1, ya, yb, z1, openings=(), k='stucco'):
    cur = ya
    for c, w, s0, s1 in sorted(openings):
        box(name, x0, cur, x1, c - w / 2, 0, z1, k)
        if s0 > 0: box(name + '.sill', x0, c - w / 2, x1, c + w / 2, 0, s0, k)
        if s1 < z1: box(name + '.head', x0, c - w / 2, x1, c + w / 2, s1, z1, k)
        for yy in (c - w / 2 - 0.07, c + w / 2): deco(name + '.frame', x0 - 0.05, yy, x1 + 0.05, yy + 0.07, s0, s1 + 0.07, 'frame')
        deco(name + '.frame', x0 - 0.05, c - w / 2, x1 + 0.05, c + w / 2, s1, s1 + 0.07, 'frame')
        if s0 > 0: deco(name + '.ledge', x0 - 0.08, c - w / 2 - 0.1, x1 + 0.08, c + w / 2 + 0.1, s0 - 0.06, s0, 'frame')
        cur = c + w / 2
    box(name, x0, cur, x1, yb, 0, z1, k)
DOOR = (1.5, 0, 2.2); WIN = (1.8, 1.0, 2.1)   # width, sill, head

# ---------- ground ----------
deco('verge', -HX - 60, -HY - 60, HX + 60, HY + 60, -0.2, -0.02, 'verge', mirror=False)
deco('lot', -HX, -HY, HX, HY, -0.1, 0, 'asphalt', mirror=False)
deco('pool deck', -18, -6.8, 18, 6.8, 0, 0.02, 'deck', mirror=False)
for x in range(-16, 17, 2): deco('paving joint', x - 0.015, -6.8, x + 0.015, 6.8, 0.02, 0.023, 'joint', mirror=False)
for y in range(-6, 7, 2): deco('paving joint', -18, y - 0.015, 18, y + 0.015, 0.02, 0.023, 'joint', mirror=False)
deco('walkway', -18.4, 6.8, 18.4, 8, 0, 0.03, 'walk')             # under each wing's eaves, both sides
deco('walkway', -18.4, 15, 18.4, 16.3, 0, 0.03, 'walk')
for x in range(-16, 17, 3):
    deco('bay line', x - 0.06, 16.5, x + 0.06, 21.2, 0, 0.012, 'line')
    if x < 16: deco('wheel stop', x + 0.5, 16.55, x + 2.5, 16.75, 0, 0.12, 'walk')

# ---------- the perimeter: a block wall round the lot (you can't climb it: the collision goes on up) ----------
box('perimeter N', -HX - 0.4, HY, HX + 0.4, HY + 0.4, 0, 2.6, 'block', top=9)
box('perimeter W', -HX - 0.4, -HY, -HX, HY, 0, 2.6, 'block', top=9)
deco('perimeter cap', -HX - 0.5, HY - 0.05, HX + 0.5, HY + 0.45, 2.6, 2.7, 'fascia')
deco('perimeter band', -HX, HY - 0.02, HX, HY, 0, 0.5, 'base')
deco('perimeter band', -HX, -HY, -HX + 0.02, HY, 0, 0.5, 'base')
deco('perimeter cap', -HX - 0.45, -HY, -HX + 0.05, HY, 2.6, 2.7, 'fascia')
for x in range(-30, 31, 6): deco('pier', x - 0.3, HY - 0.08, x + 0.3, HY, 0, 2.6, 'block')

# ---------- a wing's dressing: one room front (door, window, air conditioner, lamp, number) on a blank wall ----------
def room_front(xc, y, out, number):
    """A room's door and window on the wall face at y, facing `out` (+1 north, -1 south)."""
    f = lambda d: y + out * d                      # d metres proud of the wall
    yy = lambda a, b: sorted((f(a), f(b)))
    dx = xc - 0.72; wx = xc + 0.72                 # door and window centres
    (a, b) = yy(0, 0.04); deco('door', dx - 0.47, a, dx + 0.47, b, 0.03, 2.1, 'door')
    (a, b) = yy(0, 0.07)
    for xx in (dx - 0.54, dx + 0.47): deco('door frame', xx, a, xx + 0.07, b, 0, 2.17, 'frame')
    deco('door frame', dx - 0.47, a, dx + 0.47, b, 2.1, 2.17, 'frame')
    cyl('knob', dx + 0.36, f(0.07), 1.0, 1.06, 0.035, 'chrome', seg=8)
    text(str(number), dx, f(0.045), 1.62, 0 if out < 0 else math.pi, 0.16, 'frame', mirror=True, depth=0.008)
    (a, b) = yy(0, 0.02); deco('window', wx - 0.6, a, wx + 0.6, b, 0.95, 2.1, 'glass')
    (a, b) = yy(0.02, 0.03); deco('curtain', wx - 0.58, a, wx - 0.08, b, 0.97, 2.08, 'curtain'); deco('curtain', wx + 0.12, a, wx + 0.58, b, 0.97, 2.08, 'curtain')
    (a, b) = yy(0, 0.07)
    for xx in (wx - 0.67, wx + 0.6): deco('window frame', xx, a, xx + 0.07, b, 0.88, 2.17, 'frame')
    for zz in (0.88, 2.1): deco('window frame', wx - 0.6, a, wx + 0.6, b, zz, zz + 0.07, 'frame')
    (a, b) = yy(0, 0.22); deco('room air conditioner', wx - 0.38, a, wx + 0.38, b, 0.38, 0.8, 'ac')
    (a, b) = yy(0.22, 0.23); deco('grille', wx - 0.32, a, wx + 0.32, b, 0.44, 0.74, 'dark')
    (a, b) = yy(0, 0.12); deco('door lamp', xc - 0.07, a, xc + 0.07, b, 2.2, 2.42, 'lamp')

# ---------- the north wing (the south wing is its twin): rooms x -18..18, y 8..15 ----------
W0, W1, Y0, Y1 = -18, 18, 8, 15
num = 101
for name, xa, xb in (('rooms 101-102', -18, -12), ('rooms 104-106', -6, 3), ('rooms 107-108', 6, 12)):
    box(name, xa, Y0, xb, Y1, 0, H, 'stucco')
    for i in range(round((xb - xa) / 3)):
        room_front(xa + 1.5 + 3 * i, Y0, -1, num); room_front(xa + 1.5 + 3 * i, Y1, 1, num + 20); num += 1
    if xb == -12: num += 1   # (103 is the walk-through)
for y, out in ((Y0, -1), (Y1, 1)):   # a painted base band along both fronts (not across the breezeway)
    for xa, xb in ((-18, 3), (6, 18)):
        a, b = sorted((y, y + out * 0.025)); deco('base band', xa, a, xb, b, 0, 0.32, 'base')
# room 103 (x -12..-6): a walk-through, door on the courtyard, door and window on the lot
wall_x('room 103 south', Y0, Y0 + T, -12, -6, H - 0.2, [(-9.6, *DOOR)])
wall_x('room 103 north', Y1 - T, Y1, -12, -6, H - 0.2, [(-10.4, *DOOR), (-7.8, *WIN)])
box('room 103 roof', -12, Y0, -6, Y1, H - 0.2, H, 'stucco')
# room 109 (x 12..18): the far walk-through, with an end wall
wall_x('room 109 south', Y0, Y0 + T, 12, 18, H - 0.2, [(14.2, *DOOR), (16.6, *WIN)])
wall_x('room 109 north', Y1 - T, Y1, 12, 18, H - 0.2, [(15.8, *DOOR)])
wall_y('room 109 east', 18 - T, 18, Y0 + T, Y1 - T, H - 0.2, [(11.5, *WIN)])
box('room 109 roof', 12, Y0, 18, Y1, H - 0.2, H, 'stucco')
def furnish(x0, x1, bed_x, flip):
    """A walk-through room: carpet, a made bed against the side wall, a dresser with a TV, a ceiling light, a picture."""
    deco('carpet', x0, Y0 + T, x1, Y1 - T, 0, 0.025, 'carpet')
    bx0, bx1 = bed_x, bed_x + 1.8
    box('bed', bx0, 10.3, bx1, 12.4, 0, 0.28, 'wood', surface='wood')
    box('mattress', bx0 + 0.03, 10.33, bx1 - 0.03, 12.37, 0.28, 0.58, 'sheet', surface='wood')
    hx = bx1 if flip else bx0 - 0.08
    foot = (bx0 + 0.03, bx0 + 1.15) if flip else (bx1 - 1.15, bx1 - 0.03)
    deco('blanket', foot[0], 10.32, foot[1], 12.38, 0.3, 0.6, 'blanket')
    deco('headboard', hx, 10.2, hx + 0.08, 12.5, 0, 1.15, 'wood')
    px = bx1 - 0.5 if flip else bx0 + 0.08
    for yy in (10.55, 11.55): deco('pillow', px, yy, px + 0.42, yy + 0.7, 0.58, 0.72, 'sheet')
    box('nightstand', (bx1 - 0.5) if flip else bx0, 12.55, (bx1) if flip else bx0 + 0.5, 13.05, 0, 0.55, 'wood', surface='wood')
    cyl('bedside lamp', (bx1 - 0.25) if flip else bx0 + 0.25, 12.8, 0.55, 0.85, 0.05, 'chrome'); cyl('lamp shade', (bx1 - 0.25) if flip else bx0 + 0.25, 12.8, 0.8, 1.02, 0.16, 'lamp', r2=0.1)
    dx = x0 + 0.02 if flip else x1 - 0.52
    box('dresser', dx, 9.2, dx + 0.5, 10.0, 0, 0.8, 'wood', surface='wood') if False else None
    cyl('ceiling light', (x0 + x1) / 2, 11.5, H - 0.28, H - 0.2, 0.22, 'lamp', seg=14)
furnish(-12, -6, -8.2, True)
furnish(12, 18, 12.4, False)
# the breezeway (x 3..6): open through the wing, roofed, a vending machine and an ice chest in it
box('breezeway roof', 3, Y0, 6, Y1, H - 0.2, H, 'stucco')
box('vending machine', 3, 12.6, 3.8, 13.7, 0, 1.9, 'red', surface='metal')
deco('vending front', 3.8, 12.68, 3.82, 13.3, 0.5, 1.8, 'screen'); deco('vending slot', 3.8, 13.36, 3.82, 13.62, 0.9, 1.5, 'dark')
box('ice chest', 5.2, 9.4, 6, 10.9, 0, 1.0, 'white', surface='metal')
deco('ice chest lid', 5.16, 9.36, 6, 10.94, 1.0, 1.06, 'ac')
text('ICE', 5.19, 10.15, 0.6, -math.pi / 2, 0.34, 'sign', mirror=True, depth=0.01)
cyl('breezeway light', 4.5, 11.5, H - 0.28, H - 0.2, 0.2, 'lamp', seg=14)
# the eaves: a canopy over each front, teal fascia
box('eave courtyard', W0 - 0.3, Y0 - 1.2, W1 + 0.3, Y0, H - 0.2, H, 'frame')
box('eave lot', W0 - 0.3, Y1, W1 + 0.3, Y1 + 1.3, H - 0.2, H, 'frame')
deco('fascia', W0 - 0.32, Y0 - 1.24, W1 + 0.32, Y0 - 1.2, H - 0.34, H + 0.04, 'fascia')
deco('fascia', W0 - 0.32, Y1 + 1.3, W1 + 0.32, Y1 + 1.34, H - 0.34, H + 0.04, 'fascia')
for x in (W0 - 0.34, W1 + 0.3):
    deco('fascia end', x, Y0 - 1.24, x + 0.04, Y0, H - 0.34, H + 0.04, 'fascia'); deco('fascia end', x, Y1, x + 0.04, Y1 + 1.34, H - 0.34, H + 0.04, 'fascia')
# the roof: gravel, parapets (lower on the courtyard side, to shoot over) with metal caps, air conditioners for cover
deco('roof gravel', W0, Y0, W1, Y1, H, H + 0.012, 'roof')
for nm, a in (('parapet lot side', (W0, Y1 - 0.25, W1, Y1, 1.2)), ('parapet courtyard', (W0 + 3.2, Y0, W1, Y0 + 0.25, 0.9)), ('parapet east end', (W1 - 0.25, Y0 + 0.25, W1, Y1 - 0.25, 1.2)), ('parapet west end', (W0, 10.2, W0 + 0.25, Y1 - 0.25, 1.2))):
    box(nm, a[0], a[1], a[2], a[3], H, H + a[4], 'stucco')
    deco(nm + ' cap', a[0] - 0.03, a[1] - 0.03, a[2] + 0.03, a[3] + 0.03, H + a[4], H + a[4] + 0.05, 'cap')
for x, y in ((-8, 12.2), (1.5, 11), (10, 12.6)):
    box('roof air conditioner', x - 0.9, y - 0.6, x + 0.9, y + 0.6, H + 0.1, H + 1.15, 'ac', surface='metal')
    box('ac feet', x - 0.8, y - 0.5, x + 0.8, y + 0.5, H, H + 0.1, 'dark', surface='metal')
    cyl('ac fan', x, y, H + 1.15, H + 1.19, 0.42, 'dark', seg=16)
    for sx in (-0.91, 0.9): deco('ac louvres', x + sx, y - 0.5, x + sx + 0.01, y + 0.5, H + 0.3, H + 1.0, 'dark')
# outside stairs up to the roof at the wing's west end (16 concrete steps, 1.4 m wide), a rail on the open side
STEPS, SX0, SX1 = 16, -23, -18
for i in range(STEPS):
    xa = SX0 + i * (SX1 - SX0) / STEPS; xb = xa + (SX1 - SX0) / STEPS; top = (i + 1) * H / STEPS
    box('roof stairs', xa, 8.6, xb, 10.0, 0, top, 'step')
    box('stair rail', xa, 8.54, xb, 8.6, 0, top + 1.0, 'rail', surface='metal') if i % 4 == 3 else boxes.extend([[round(s * xa if s > 0 else s * xb, 3), 0, round(-8.6 if s > 0 else 8.54, 3), round(s * xb if s > 0 else s * xa, 3), round(top + 1.0, 3), round(-8.54 if s > 0 else 8.6, 3), 'metal'] for s in (1, -1)])
bar('handrail', (SX0, 8.57, 1.1), (SX1, 8.57, H + 1.0), 0.03, 'rail'); bar('handrail', (SX0, 8.57, 0.6), (SX1, 8.57, H + 0.5), 0.02, 'rail')
box('stair wall', SX0, 10.0, SX1, 10.2, 0, H + 1.0, 'stucco')
deco('stair wall cap', SX0 - 0.03, 9.97, SX1 + 0.03, 10.23, H + 1.0, H + 1.05, 'cap')

# ---------- the courtyard: the pool, cabanas and planters breaking the long views, lights strung between the wings ----------
deco('pool water', -5, -2.5, 5, 2.5, 0.02, 0.27, 'water', mirror=False)
for a in ((-5.4, -2.9, 5.4, -2.5), (-5.4, -2.5, -5, 2.5)):
    box('pool coping', *a, 0, 0.35, 'tile')
for y in (-1.6, -1.0): bar('pool ladder', (-4.9, y, 0.1), (-4.9, y, 1.0), 0.025, 'chrome'); bar('pool ladder', (-4.9, y, 1.0), (-5.5, y, 1.0), 0.025, 'chrome'); bar('pool ladder', (-5.5, y, 1.0), (-5.5, y, 0.02), 0.025, 'chrome')
box('cabana', -11, 2, -8, 5, 0, 3.0, 'stucco')
deco('cabana roof', -11.3, 1.7, -7.7, 5.3, 3.0, 3.14, 'fascia'); deco('cabana base', -11.02, 1.98, -7.98, 5.02, 0, 0.32, 'base')
deco('cabana door', -9.97, 1.96, -9.03, 2.0, 0.03, 2.1, 'door'); deco('cabana vent', -10.2, 5.0, -8.8, 5.02, 2.2, 2.7, 'dark')
text('POOL', -9.5, 1.95, 2.5, 0, 0.3, 'sign', mirror=True, depth=0.012)
for a in ((-16.5, -4.6, -13.5, -3.6), (-4, 5.0, 0, 5.8)):
    box('planter', *a, 0, 0.8, 'planter'); deco('hedge', a[0] + 0.08, a[1] + 0.08, a[2] - 0.08, a[3] - 0.08, 0.8, 1.12, 'hedge')
for s in (1, -1):   # (the hedge tops count as cover: the planters' collision reaches 1.1)
    for a in ((-16.5, -4.6, -13.5, -3.6), (-4, 5.0, 0, 5.8)):
        x0, x1 = sorted((s * a[0], s * a[2])); y0, y1 = sorted((s * a[1], s * a[3])); boxes.append([x0, 0.8, -y1, x1, 1.1, -y0, 'wood'])
box('pool bar', 6.2, 3.4, 7.0, 6.4, 0, 1.1, 'wood', surface='wood')
deco('bar top', 6.1, 3.3, 7.1, 6.5, 1.1, 1.15, 'tile')
cyl('parasol pole', 6.6, 4.9, 1.15, 2.7, 0.03, 'chrome'); cyl('parasol', 6.6, 4.9, 2.45, 2.9, 1.5, 'fascia', seg=10, r2=0.05)
for x in (-3.2, -0.9):   # two loungers end to end
    box('lounger', x, -5.6, x + 2.1, -4.9, 0.18, 0.4, 'sheet', surface='wood'); deco('lounger frame', x + 0.05, -5.55, x + 2.05, -4.95, 0, 0.18, 'chrome')
    deco('lounger back', x + 1.6, -5.6, x + 2.1, -4.9, 0.4, 0.5, 'sheet')
boxes.extend([[round(s * -3.2 if s > 0 else s * 1.2, 3), 0, round(4.9 if s > 0 else -5.6, 3), round(s * 1.2 if s > 0 else s * -3.2, 3), 0.18, round(5.6 if s > 0 else -4.9, 3), 'wood'] for s in (1, -1)])
for x in (-12, -4, 4, 12):   # festoon lights from eave to eave
    pts = [(x, Y0 - 1.2 - (2 * (Y0 - 1.2)) * t / 12, H - 0.25 - 0.55 * math.sin(math.pi * t / 12)) for t in range(13)]
    for a, b in zip(pts, pts[1:]): bar('festoon', a, b, 0.008, 'dark', mirror=False)
    for p in pts[1:-1]:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.055, location=(p[0], p[1], p[2] - 0.06)); finish(bpy.context.object, 'bulb', False, uv=False)

# ---------- each end: the office in the west, the laundry in the east, and the back street behind it ----------
OX0, OX1, OY0, OY1 = -29, -22, -5, 5
wall_y('office west', OX0, OX0 + T, OY0, OY1, H, [(-2.6, *DOOR)])
wall_y('office east', OX1 - T, OX1, OY0, OY1, H, [(2.6, *DOOR), (-1.8, *WIN)])
wall_x('office north', OY1 - T, OY1, OX0 + T, OX1 - T, H, [(-25.5, *WIN)])
wall_x('office south', OY0, OY0 + T, OX0 + T, OX1 - T, H, [(-25.5, *WIN)])
box('office roof', OX0, OY0, OX1, OY1, H, H + 0.2, 'stucco')
deco('office eave', OX0 - 0.6, OY0 - 0.6, OX1 + 0.9, OY1 + 0.6, H + 0.2, H + 0.3, 'frame')
for a in ((OX0 - 0.62, OY0 - 0.64, OX1 + 0.92, OY0 - 0.6), (OX0 - 0.62, OY1 + 0.6, OX1 + 0.92, OY1 + 0.64), (OX0 - 0.64, OY0 - 0.6, OX0 - 0.6, OY1 + 0.6), (OX1 + 0.9, OY0 - 0.6, OX1 + 0.94, OY1 + 0.6)):
    deco('office fascia', *a, H + 0.06, H + 0.34, 'fascia')
deco('office floor', OX0 + T, OY0 + T, OX1 - T, OY1 - T, 0, 0.025, 'lobby')
box('front desk', -26.4, -0.5, -23.4, 0.3, 0, 1.1, 'wood', surface='wood')
deco('desk top', -26.5, -0.6, -23.3, 0.4, 1.1, 1.15, 'tile')
cyl('desk bell', -24.2, -0.1, 1.15, 1.2, 0.06, 'chrome'); deco('key board', -28.69, 1.0, -28.66, 2.6, 1.2, 2.0, 'wood')
cyl('office light', -25.5, 0, H - 0.08, H, 0.3, 'lamp', seg=14)
for side, label in ((False, 'OFFICE'), (True, 'LAUNDRY')):
    text(label, OX1 + 0.96, 0, H + 0.75, math.pi / 2, 0.62, 'neon pink' if not side else 'neon aqua', depth=0.05, half_turn=side)
    for z in (H + 0.36, H + 1.14): box('sign rail', OX1 + 0.9, -2.3, OX1 + 0.96, 2.3, z, z + 0.04, 'dark', solid=False, mirror=False) if not side else None
deco('sign rail', -(OX1 + 0.96), -2.3, -(OX1 + 0.9), 2.3, H + 0.36, H + 0.4, 'dark', mirror=False); deco('sign rail', -(OX1 + 0.96), -2.3, -(OX1 + 0.9), 2.3, H + 1.14, H + 1.18, 'dark', mirror=False)

# ---------- the lot (the outer lane): vehicles (the game parks its own models on these), the sign, dumpsters ----------
def vehicle(slot, x0, y0, x1, y1, h, yaw):
    """A parked vehicle's footprint: the game draws its model here (nose to `yaw`, 0 = east) and fits the collision to it."""
    for s in (1, -1):
        a0, a1 = sorted((s * x0, s * x1)); b0, b1 = sorted((s * y0, s * y1))
        vehicles.append({'slot': slot, 'x': round((a0 + a1) / 2, 3), 'z': round(-(b0 + b1) / 2, 3), 'w': round(a1 - a0, 3), 'd': round(b1 - b0, 3), 'h': h, 'yaw': round(yaw + (math.pi if s < 0 else 0), 4)})
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, h / 2)); o = bpy.context.object; o.scale = (x1 - x0, y1 - y0, h); o.name = 'VEHICLE ' + slot
    o.data.materials.append(m_('cover')); o['vehicle'] = slot   # (kept in the .blend as a stand-in; not exported)
vehicle('boxtruck', -3.5, 18.6, 3.5, 21.0, 3.0, 0)
for i, x in enumerate((-13.5, -7.5, 8.5, 14.5)): vehicle('sedan', x - 0.9, 16.9, x + 0.9, 21.3, 1.4, -math.pi / 2)
vehicle('van', 9, 22.6, 14.5, 24.7, 2.3, math.pi)
vehicle('sedan', -21, 22.8, -16.5, 24.6, 1.4, 0)
# the motel's sign on its block base: the landmark you can see from anywhere on the map
box('sign base', 20, 16, 23, 19, 0, 3.6, 'block')
deco('sign base cap', 19.9, 15.9, 23.1, 19.1, 3.6, 3.75, 'cap')
for x in (20.6, 22.4): cyl('sign post', x, 17.5, 3.75, 9.6, 0.11, 'cap', seg=8)
deco('sign board', 19.3, 17.36, 23.7, 17.64, 7.2, 9.4, 'sign'); deco('sign board edge', 19.24, 17.33, 23.76, 17.67, 9.4, 9.5, 'frame'); deco('sign board edge', 19.24, 17.33, 23.76, 17.67, 7.1, 7.2, 'frame')
deco('vacancy board', 19.9, 17.4, 23.1, 17.6, 5.9, 6.8, 'dark')
for yaw, y in ((0, 17.33), (math.pi, 17.67)):
    text('MOTEL', 21.5, y, 8.3, yaw, 1.25, 'neon white', mirror=True, depth=0.05)
    text('VACANCY', 21.5, y + (0.06 if yaw else -0.06), 6.35, yaw, 0.55, 'neon pink', mirror=True, depth=0.04)
for y in (21.5, 23.2):
    box('dumpster', -27, y, -25, y + 1.4, 0, 1.25, 'green', surface='metal'); deco('dumpster lid', -27.05, y - 0.05, -24.95, y + 1.45, 1.25, 1.32, 'dark')
box('ice machine', -19.4, 15.2, -18.2, 16.1, 0, 1.6, 'white', surface='metal')
deco('ice machine door', -19.3, 16.1, -18.3, 16.12, 0.3, 1.0, 'ac'); text('ICE', -18.8, 16.11, 1.3, math.pi, 0.26, 'sign', mirror=True, depth=0.01)

# ---------- beyond the wall: the highway's poles and wires, pines, a few far buildings ----------
import random
rnd = random.Random(7)
def pine(x, y, h):
    cyl('pine trunk', x, y, 0, h * 0.3, 0.16, 'trunk', mirror=False, seg=6)
    for i in range(3): cyl('pine', x, y, h * (0.2 + 0.24 * i), h * (0.56 + 0.22 * i) if i < 2 else h, h * (0.26 - 0.06 * i), 'pine', mirror=False, seg=7, r2=0.02)
for i in range(46):
    side = i % 4; t = rnd.uniform(-1, 1)
    x, y = ((t * (HX + 14), HY + rnd.uniform(9, 22)), (t * (HX + 14), -HY - rnd.uniform(5, 20)), (HX + rnd.uniform(5, 20), t * (HY + 10)), (-HX - rnd.uniform(5, 20), t * (HY + 10)))[side]
    pine(x, y, rnd.uniform(7, 13))
deco('highway', -HX - 60, HY + 2.5, HX + 60, HY + 8, -0.02, 0.0, 'asphalt', mirror=False)
deco('highway line', -HX - 60, HY + 5.2, HX + 60, HY + 5.32, 0, 0.012, 'line', mirror=False)
for x in range(-70, 71, 20):
    cyl('telephone pole', x, HY + 1.6, 0, 8.5, 0.11, 'pole', mirror=False, seg=6); deco('crossarm', x - 0.9, HY + 1.55, x + 0.9, HY + 1.65, 7.7, 7.8, 'pole', mirror=False)
    if x < 70:
        for dx in (-0.8, 0.8):
            pts = [(x + dx + 20 * t / 6, HY + 1.6, 7.85 - 0.5 * math.sin(math.pi * t / 6)) for t in range(7)]
            for a, b in zip(pts, pts[1:]): bar('wire', a, b, 0.012, 'dark', mirror=False)
for x0, y0, w, d, h in ((-58, -44, 16, 9, 6), (44, -46, 12, 10, 4.5), (50, 6, 9, 14, 5), (-60, 8, 10, 12, 7)):
    deco('far building', x0, y0, x0 + w, y0 + d, 0, h, 'far', mirror=False)

# ---------- export ----------
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'assets', 'maps', 'vacancy.blend'))   # (the editable scene keeps every named piece)
for o in [o for o in bpy.data.objects if 'vehicle' in o]: bpy.data.objects.remove(o)
by = {}
for o in list(bpy.data.objects): by.setdefault(o.data.materials[0].name, []).append(o)
tris = 0
for name, objs in by.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if len(objs) > 1: bpy.ops.object.join()
    bpy.context.object.name = name
    tris += sum(len(p.vertices) - 2 for p in bpy.context.object.data.polygons)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'assets', 'maps', 'vacancy.glb'), export_format='GLB', export_apply=True, export_yup=True)

def stair(s):
    xs, zs = sorted((s * -23.6, s * -17.4)), sorted((s * -10.0, s * -8.6))
    return {'rect': [xs[0], zs[0], xs[1], zs[1]], 'climb': [[s * -24.2, 0, s * -9.3], [s * -23, 0.2, s * -9.3], [s * -20.5, H / 2, s * -9.3], [s * -18.2, H, s * -9.3], [s * -16.5, H, s * -11.5]]}
data = {
    'half': [HX, HY], 'roof': H, 'boxes': boxes, 'vehicles': vehicles,
    # the east team's spawn points (the west team's are these turned half a turn), in the game's x, z
    'spawns': [[32, z] for z in (-9, -7, -5, -3, -1, 1, 3, 5, 7, 9)],
    'upper': [{'y': H, 'bounds': {'minX': -18, 'maxX': 18, 'minZ': -15, 'maxZ': -8}, 'portals': [stair(1)]},
              {'y': H, 'bounds': {'minX': -18, 'maxX': 18, 'minZ': 8, 'maxZ': 15}, 'portals': [stair(-1)]}],
    'pickups': [['health', 0, 0, 4.2], ['health', 0, 0, -4.2], ['ammo', -25, 0, 2], ['ammo', 25, 0, -2], ['ammo', 4.5, 0, -11.5], ['ammo', -4.5, 0, 11.5],
                ['health', 0, H, -11.5], ['health', 0, H, 11.5]],
}
with open(os.path.join(ROOT, 'js', 'maps', 'vacancy.data.js'), 'w') as f:
    f.write('// Generated by tools/blender/vacancy.py from the Blender scene: do not edit by hand.\nexport default ' + json.dumps(data, separators=(',', ':')) + ';\n')
print('vacancy:', len(boxes), 'collision boxes,', len(by), 'meshes,', tris, 'triangles,', len(vehicles), 'vehicles')
