"""Castle: a medieval castle's wards, built as a Blender scene and exported for the game (helpers: mapkit.py).

    python3 tools/blender/castle.py            (needs Blender's Python module, bpy)

The keep and its great hall stand in the middle. Cross-walls with archways run from the keep to the curtain walls
and divide the grounds into wards: each team's ward at its gatehouse (stables, a smithy, a statue), and a small ward
north and south of the keep (the well, a hay cart). The north and south curtain walls carry a wall-walk behind
battlements, reached by two stone stairs each. The plan is point-mirrored.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapkit import *

HX, HY = 34, 24          # half sizes of the castle
WW = 4.5                 # the wall-walk
KH = 7.0                 # the keep
PI = math.pi
setup({
    'wall': ('v_wall:curtain wall', 0xe6e2d8), 'ashlar': ('v_ashlar:keep', 0xe0d8c8), 'cobble': ('v_cobble:ward', 0xd8d4cc), 'mud': ('v_mud:earth', 0xc8c0b0),
    'flag': ('v_flag:hall floor', 0xd0c8bc), 'timber': ('v_timber:timber', 0xb89a78), 'frame': ('v_timber:door frame', 0x7a6248), 'slate': ('v_slate:roof', 0xb8b4ac),
    'thatch': ('v_thatch:thatch', 0xd8c890), 'hay': ('cloth:hay', 0xd8b452), 'dark': ('flat:dark', 0x141312), 'iron': ('flat:iron', 0x2a2c2e),
    'red': ('cloth:banner red', 0x8a1c1c), 'gold': ('flat:gold', 0xc8a040), 'water': ('flat:water', 0x2a4a50), 'sack': ('cloth:sack', 0xb8a480), 'rope': ('flat:rope', 0x8a7450),
    'firs': ('card:fir', 0xffffff), 'cover': ('flat:cover', 0xc8731a), 'coal': ('flat:coal', 0x1a1412), 'cut': ('cutout:greenery', 0x6c7862),
    'grass': ('v_grass:lawn', 0xc8d4b0), 'plaster': ('plaster:whitewash', 0xf2e8d0), 'plank': ('v_timber:floorboards', 0xd8b890), 'carpet': ('cloth:carpet', 0x7a1818),
    'blue': ('cloth:blue cloth', 0x24407a), 'cream': ('cloth:cream cloth', 0xe8dcc0), 'green': ('cloth:green cloth', 0x2f5a3a), 'bread': ('flat:bread', 0xb88a50),
}, emit={'flame': 0xff9a2e, 'ember': 0xff5a1a}, rough={'water': 0.08, 'iron': 0.45, 'gold': 0.35}, metal={'iron': 0.8, 'gold': 0.9}, emit_strength={'flame': 6.0, 'ember': 3.0}, default='wall')

def torch(x, y, z, nx, ny, mirror=True):
    """A wall torch: an iron bracket and a flame, on a wall whose face looks toward (nx, ny)."""
    bar('torch bracket', (x, y, z), (x + nx * 0.28, y + ny * 0.28, z + 0.22), 0.025, 'iron', mirror)
    cyl('torch', x + nx * 0.3, y + ny * 0.3, z + 0.18, z + 0.5, 0.045, 'timber', mirror, seg=6)
    cyl('flame', x + nx * 0.3, y + ny * 0.3, z + 0.5, z + 0.78, 0.07, 'flame', mirror, seg=6, r2=0.01)
def banner(x, y, z, yaw, mirror=True):
    """A long red banner with a gold band, hung flat on a wall (yaw 0 faces south)."""
    for k, zz0, zz1, w in (('red', z - 3.0, z, 1.1), ('gold', z - 0.5, z - 0.38, 1.1), ('gold', z - 2.9, z - 2.8, 1.1)):
        c, s = math.cos(yaw), math.sin(yaw); d = 0.03 if k == 'red' else 0.04
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x + s * d, y - c * d, (zz0 + zz1) / 2)); o = bpy.context.object; o.name = 'banner'
        o.scale = (w, 0.02, zz1 - zz0); o.rotation_euler = (0, 0, yaw); finish(o, k, mirror)
    bar('banner pole', (x - math.cos(yaw) * 0.7, y - math.sin(yaw) * 0.7, z + 0.03), (x + math.cos(yaw) * 0.7, y + math.sin(yaw) * 0.7, z + 0.03), 0.03, 'frame', mirror)
def merlons(x0, y0, x1, y1, z, along_x, step=2.0, w=1.0, h=0.9):
    """Battlements along a parapet's top."""
    n = int(((x1 - x0) if along_x else (y1 - y0)) / step)
    for i in range(n):
        if along_x: a = x0 + (i + 0.25) * step; deco('merlon', a, y0, a + w, y1, z, z + h, 'wall')
        else: a = y0 + (i + 0.25) * step; deco('merlon', x0, a, x1, a + w, z, z + h, 'wall')

# ---------- ground ----------
deco('earth', -HX - 70, -HY - 70, HX + 70, HY + 70, -0.2, -0.02, 'mud', mirror=False)
deco('ward lawn', -31, -21, 31, 21, -0.1, 0, 'grass', mirror=False)
deco('keep court cobbles', -10.5, -21, 10.5, 21, 0, 0.012, 'cobble', mirror=False)        # round the keep and both small wards
deco('gate road', -30, -2.2, -10.5, 2.2, 0, 0.012, 'cobble'); deco('ward path', -13, 2.2, -10.5, 16.5, 0, 0.012, 'cobble'); deco('ward path', -13, -12.5, -10.5, -2.2, 0, 0.012, 'cobble')
deco('stable yard', -29, 12.5, -18.5, 16, 0, 0.012, 'mud'); deco('training yard', -24, -6, -19, 6, 0, 0.012, 'mud')

# ---------- the curtain walls: a wall-walk on the north and south walls, towers at the corners ----------
box('north curtain wall', -28, 21, 28, 24, 0, WW, 'wall')
box('north parapet', -28, 23.4, 28, 24, WW, WW + 1.0, 'wall', top=14)
merlons(-28, 23.4, 28, 24, WW + 1.0, True)
deco('wall-walk flags', -28, 21, 28, 23.4, WW, WW + 0.012, 'flag')
box('corner tower', -34.5, 18, -28, 24.5, 0, 9.5, 'wall', top=14)
box('corner tower', -34.5, -24.5, -28, -18, 0, 9.5, 'wall', top=14)
for y in (21.25, -21.25):
    cyl('tower roof', -31.25, y, 9.5, 13.5, 4.9, 'slate', seg=8, r2=0.05); deco('tower eave', -34.7, y - 3.45, -27.8, y + 3.45, 9.5, 9.7, 'frame')
box('west curtain wall', -34, -18, -31, 18, 0, 6, 'wall', top=14)
merlons(-34, -18, -33.4, 18, 6.0, False)
# the gatehouse: the gate is shut (a portcullis in the arch); each team starts in front of its own
box('gatehouse', -34.5, -4.5, -30, 4.5, 0, 8, 'wall', top=14)
for y0, y1 in ((4.5, 7.5), (-7.5, -4.5)): box('gate tower', -35, y0, -29.4, y1, 0, 9.6, 'wall', top=14); merlons(-35, y0, -29.4, y1, 9.6, True, 1.4, 0.7, 0.7)
merlons(-34.5, -4.5, -30, 4.5, 8.0, True, 1.5, 0.8, 0.8)
deco('gate arch', -30.02, -1.9, -29.98, 1.9, 0, 3.7, 'dark')
for y in (-1.5, -0.9, -0.3, 0.3, 0.9, 1.5): bar('portcullis', (-29.95, y, 0), (-29.95, y, 3.7), 0.04, 'iron')
for z in (0.7, 1.5, 2.3, 3.1): bar('portcullis', (-29.95, -1.9, z), (-29.95, 1.9, z), 0.035, 'iron')
deco('gate lintel', -30.06, -2.3, -29.94, 2.3, 3.7, 4.2, 'ashlar'); banner(-29.97, -3.2, 7.2, -PI / 2); banner(-29.97, 3.2, 7.2, -PI / 2)
torch(-30, -2.6, 2.2, 1, 0); torch(-30, 2.6, 2.2, 1, 0)
# stone stairs up to each wall-walk: 24 steps along the wall's inner face, in each team's ward
STEPS, SX0, SX1 = 24, -17.2, -10.0
for ya, yb in ((19.6, 21.0), (-21.0, -19.6)):
    for i in range(STEPS):
        xa = SX0 + i * (SX1 - SX0) / STEPS
        box('wall stairs', xa, ya, xa + (SX1 - SX0) / STEPS, yb, 0, (i + 1) * WW / STEPS, 'ashlar')
for x in range(-26, 27, 6): torch(x, 21, 3.0, 0, -1)

# ---------- the keep: the great hall, a door in each face (never opposite one another), arrow slits ----------
ARCH = (2.0, 0, 2.8); SLIT = (0.45, 1.0, 2.4)
wall_y('keep west wall', -8, -7, -6, 6, KH, [(-2, *ARCH), (3.2, *SLIT)], 'ashlar')
wall_x('keep north wall', 5, 6, -7, 7, KH, [(3, *ARCH), (-4, *SLIT)], 'ashlar')
box('keep roof', -8, -6, 8, 6, KH - 0.4, KH, 'ashlar')
box('keep parapet', -8, 5.5, 8, 6, KH, KH + 0.9, 'ashlar'); box('keep parapet', -8, -5.5, -7.5, 5.5, KH, KH + 0.9, 'ashlar')
merlons(-8, 5.5, 8, 6, KH + 0.9, True, 2.0, 1.0, 0.8); merlons(-8, -5.5, -7.5, 5.5, KH + 0.9, False, 2.0, 1.0, 0.8)
deco('hall floor', -7, -5, 7, 5, 0, 0.02, 'flag', mirror=False)
for y0, y1 in ((-6, -3.05), (-0.95, 6)): deco('keep plinth', -8.12, y0, -8, y1, 0, 0.5, 'ashlar')     # a footing course outside (not across the doors)
for x0, x1 in ((-8.12, 1.95), (4.05, 8.12)): deco('keep plinth', x0, 6, x1, 6.12, 0, 0.5, 'ashlar')
for x in (-4, 0, 4):
    box('hall pillar', x - 0.4, 2.0, x + 0.4, 2.8, 0, KH - 0.4, 'ashlar'); deco('pillar base', x - 0.52, 1.88, x + 0.52, 2.92, 0, 0.3, 'ashlar'); deco('pillar head', x - 0.52, 1.88, x + 0.52, 2.92, KH - 0.8, KH - 0.4, 'ashlar')
for x in (-6, -2, 2, 6): deco('hall beam', x - 0.15, -5, x + 0.15, 5, KH - 0.75, KH - 0.4, 'frame', mirror=False)
box('long table', -5.6, 3.5, -1.6, 4.5, 0.72, 0.85, 'timber', surface='wood')
for x in (-5.2, -2.0): box('table trestle', x - 0.08, 3.6, x + 0.08, 4.4, 0, 0.72, 'frame', surface='wood')
prop('painted_wooden_bench', -4.6, 3.05, 0, 0, 1.0, solid=(1.1, 0.4, 0.5, True)); prop('painted_wooden_bench', -2.6, 3.05, 0, 0, 1.0, solid=(1.1, 0.4, 0.5, True))
prop('wooden_bucket_01', -5.0, 4.0, 0.85, 0.5, 0.7); prop('wine_barrel_01', 6.3, 4.3, 0, 0.3, 1.1, solid=(0.8, 0.8, 0.95, False)); prop('wine_barrel_01', 5.5, 4.4, 0, 1.3, 1.1, solid=(0.8, 0.8, 0.95, False))
prop('stone_fire_pit', 0, 0, 0.22, 0, 1.25, mirror=False, solid=(1.7, 1.7, 0.5, False)); cyl('embers', 0, 0, 0.3, 0.42, 0.55, 'ember', mirror=False, seg=12); cyl('hall fire', 0, 0, 0.4, 1.1, 0.32, 'flame', mirror=False, seg=7, r2=0.02)
for x in (-3.6, 3.6): prop('lantern_chandelier_01', x, 0, KH - 0.75, 0, 2.2, mirror=False)
prop('kite_shield', -6.95, -4.2, 2.0, PI / 2 + PI, 1.2); prop('kite_shield', 1.0, 4.95, 2.0, 0, 1.2)
torch(-7, -3.6, 2.4, 1, 0); torch(-7, 4.4, 2.4, 1, 0); torch(0.6, 5, 2.4, 0, -1)
for x, y, nx, ny in ((-8, -3.5, -1, 0), (-8, -0.5, -1, 0), (1.5, 6, 0, 1), (4.5, 6, 0, 1)): torch(x, y, 2.6, nx, ny)
banner(-8.02, 2.6, 6.2, PI / 2 + PI); banner(-1.5, 6.02, 6.2, PI)

# ---------- the cross-walls from the keep to the curtain: an archway through each ----------
wall_y('cross-wall north', -9, -8, 6, 21, 6.2, [(14.5, 3.0, 0, 3.3)], 'wall')
wall_y('cross-wall south', -9, -8, -21, -6, 6.2, [(-10.5, 3.0, 0, 3.3)], 'wall')
for y0, y1 in ((6, 21), (-21, -6)): merlons(-9, y0, -8, y1, 6.2, False, 1.6, 0.8, 0.6)
torch(-9, 12.4, 2.6, -1, 0); torch(-9, 16.6, 2.6, -1, 0); torch(-9, -12.6, 2.6, -1, 0); torch(-9, -8.4, 2.6, -1, 0)

# ---------- the ward north of the keep (and its twin south): the well, a hay cart, barrels ----------
cyl('well', -2.2, 13.5, 0, 0.95, 1.15, 'ashlar', seg=14); cyl('well water', -2.2, 13.5, 0.6, 0.97, 0.9, 'water', seg=14)
boxes.extend([[round(s * -2.2 - 1.1, 3), 0, round(-s * 13.5 - 1.1, 3), round(s * -2.2 + 1.1, 3), 0.95, round(-s * 13.5 + 1.1, 3), 'concrete'] for s in (1, -1)])
for dx in (-1.05, 1.05): box('well post', -2.2 + dx - 0.08, 13.42, -2.2 + dx + 0.08, 13.58, 0.95, 2.6, 'frame', surface='wood')
bar('well beam', (-3.4, 13.5, 2.5), (-1.0, 13.5, 2.5), 0.07, 'frame'); bar('well rope', (-2.2, 13.5, 2.5), (-2.2, 13.5, 1.1), 0.015, 'rope'); prop('wooden_bucket_01', -2.2, 13.5, 0.75, 0, 0.8)
deco('well roof', -3.6, 12.6, -0.8, 14.4, 2.6, 2.75, 'thatch')
def cart(x, y, yaw_x=True):
    """A two-wheeled hay cart (cover): bed, sides, wheels, a load of hay."""
    box('cart bed', x - 1.2, y - 0.7, x + 1.2, y + 0.7, 0.55, 0.7, 'timber', surface='wood')
    box('cart load', x - 1.1, y - 0.6, x + 1.1, y + 0.6, 0.7, 1.45, 'hay', surface='wood')
    for dy in (-0.7, 0.66): deco('cart side', x - 1.2, y + dy, x + 1.2, y + dy + 0.04, 0.7, 1.1, 'timber')
    for dy in (-0.82, 0.82): cyl('cart wheel', x + 0.2, y + dy, -0.04, 0.04, 0.55, 'frame', seg=12, rot=(PI / 2, 0, 0)).location.z = 0.55
    bar('cart shaft', (x - 1.2, y - 0.3, 0.6), (x - 2.6, y - 0.3, 0.25), 0.04, 'frame'); bar('cart shaft', (x - 1.2, y + 0.3, 0.6), (x - 2.6, y + 0.3, 0.25), 0.04, 'frame')
    boxes.extend([[round(s * x - 1.2, 3), 0, round(-s * y - 0.7, 3), round(s * x + 1.2, 3), 0.55, round(-s * y + 0.7, 3), 'wood'] for s in (1, -1)])
cart(4.0, 17.4)
for x, y in ((6.6, 8.2), (5.8, 7.6), (6.7, 7.2)): prop('wine_barrel_01', x, y, 0, x, 1.1, solid=(0.8, 0.8, 0.95, False))
prop('wooden_crate_02', -6.6, 17.2, 0, 0.2, 1.3, solid=(0.7, 1.5, 0.6, False))

# ---------- each team's ward: stables on the north wall, a smithy on the south, a statue, the training yard ----------
box('stable wall', -29.2, 16, -29, 21, 0, 3.0, 'timber', surface='wood'); box('stable wall', -19.2, 16, -19, 21, 0, 3.0, 'timber', surface='wood')
box('stable roof', -29.6, 15.2, -18.6, 21, 3.0, 3.25, 'thatch', surface='wood')
for x in (-25.7, -22.4): box('stall divider', x - 0.06, 17.2, x + 0.06, 21, 0, 1.5, 'timber', surface='wood')
for x in (-29, -25.7, -22.4, -19.1): box('stable post', x - 0.1, 15.9, x + 0.1, 16.1, 0, 3.0, 'frame', surface='wood')
for x, y in ((-27.6, 20.2), (-24.0, 20.2), (-20.6, 19.9)):
    box('hay bale', x - 0.6, y - 0.4, x + 0.6, y + 0.4, 0, 0.75, 'hay', surface='wood')
box('trough', -27.9, 16.4, -26.3, 16.9, 0, 0.6, 'timber', surface='wood'); deco('trough water', -27.8, 16.45, -26.4, 16.85, 0.5, 0.56, 'water')
prop('wooden_ladder', -19.6, 17.0, 0, PI / 2, 1.4, solid=(0.5, 1.0, 1.8, True))
# the smithy: a stone hut, a door to the yard and one to the east, the forge glowing inside
SX, SY0, SY1 = (-28, -22), -21, -15.5
wall_x('smithy north', SY1 - 0.5, SY1, SX[0], SX[1], 3.2, [(-25.6, 1.6, 0, 2.3)], 'wall')
wall_y('smithy east', SX[1] - 0.5, SX[1], SY0, SY1 - 0.5, 3.2, [(-18.6, 1.6, 0, 2.3)], 'wall')
box('smithy west', SX[0], SY0, SX[0] + 0.5, SY1 - 0.5, 0, 3.2, 'wall')
box('smithy roof', SX[0] - 0.4, SY0, SX[1] + 0.4, SY1 + 0.4, 3.2, 3.45, 'slate')
box('forge', -27.4, -20.6, -26.0, -19.4, 0, 1.0, 'ashlar'); deco('forge coals', -27.25, -20.45, -26.15, -19.55, 1.0, 1.06, 'ember'); box('forge hood', -27.5, -20.9, -25.9, -20.5, 1.0, 3.2, 'ashlar')
box('anvil', -24.9, -19.6, -24.3, -19.3, 0, 0.55, 'frame', surface='wood'); deco('anvil top', -25.05, -19.65, -24.15, -19.25, 0.55, 0.75, 'iron')
prop('wine_barrel_01', -22.9, -20.3, 0, 0.4, 1.1, solid=(0.8, 0.8, 0.95, False)); prop('wooden_bucket_01', -25.4, -20.4, 0, 1, 1.0)
prop('kite_shield', -27.45, -17.6, 1.7, PI / 2 + PI, 1.1); torch(-27.5, -18.6, 2.2, 1, 0)
# the statue on its plinth (the ward's landmark), the training yard's dummies, carts and stores
box('plinth', -16.9, -0.9, -15.1, 0.9, 0, 1.5, 'ashlar'); deco('plinth cap', -17.05, -1.05, -14.95, 1.05, 1.5, 1.65, 'ashlar'); prop('horse_statue_01', -16, 0, 1.65, 0, 12.0)
for y in (-4.2, 0, 4.2):
    box('training dummy', -21.7, y - 0.12, -21.46, y + 0.12, 0, 1.9, 'frame', surface='wood'); bar('dummy arms', (-21.58, y - 0.6, 1.45), (-21.58, y + 0.6, 1.45), 0.05, 'frame')
    cyl('dummy body', -21.58, y, 0.9, 1.6, 0.26, 'sack', seg=8); cyl('dummy head', -21.58, y, 1.62, 1.95, 0.16, 'sack', seg=8)
cart(-13.5, 6.2)
for x, y in ((-12.6, -3.0), (-12.6, -4.0)): box('hay bale', x - 0.6, y - 0.4, x + 0.6, y + 0.4, 0, 0.75, 'hay', surface='wood')
box('hay bale', -12.6, -3.9, -11.4, -3.1, 0.75, 1.5, 'hay', surface='wood')
for x, y in ((-12.0, 10.2), (-11.2, 10.7), (-12.1, 11.1)): prop('wine_barrel_01', x, y, 0, x, 1.1, solid=(0.8, 0.8, 0.95, False))
for x, y, a in ((-17.5, -10.5, 0.3), (-18.9, -10.2, 1.2)): prop('wooden_crate_02', x, y, 0, a, 1.3, solid=(0.9, 1.2, 0.6, False))
prop('wine_barrel_01', -29.0, -11.5, 0, 0, 1.1, solid=(0.8, 0.8, 0.95, False)); prop('wine_barrel_01', -29.2, 11.6, 0, 1, 1.1, solid=(0.8, 0.8, 0.95, False))
torch(-31, -12, 2.6, 1, 0); torch(-31, 12, 2.6, 1, 0)

# ================= the dressing: timber, plaster, cloth and green over the stone =================
def sack(x, y, z=0, a=0, mirror=True):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=(x, y, z + 0.2)); o = bpy.context.object; o.name = 'sack'; o.scale = (0.36, 0.26, 0.2); o.rotation_euler = (0, 0, a); bpy.ops.object.shade_smooth(); finish(o, 'sack', mirror, uv=False)
def shrub(x, y, size=1.3, kind=2, mirror=True):
    for a in (0.3 + x, 0.3 + x + PI / 2): cut(kind, x, y, 0, size, size * (0.8 if kind == 2 else 0.6), a, mirror, off=0)
def bunting(a, b, sag=1.2, mirror=True):
    """A line of pennants strung from a to b."""
    a, b = Vector(a), Vector(b); n = max(6, int((b - a).length / 0.75)); pts = [a.lerp(b, t / n) - Vector((0, 0, sag * math.sin(PI * t / n))) for t in range(n + 1)]
    d = (b - a).normalized()
    for i, (p, q) in enumerate(zip(pts, pts[1:])):
        bar('bunting line', p, q, 0.008, 'rope', mirror)
        m = (p + q) / 2; tri('pennant', (m - d * 0.2, m + d * 0.2, m - Vector((0, 0, 0.5))), ('red', 'gold', 'blue', 'cream')[i % 4], mirror)
def front_e(x, y0, y1, h=4.0):
    """A half-timbered lean-to built against a wall whose face at x looks east: whitewash between dark beams, a door,
    shuttered windows, a slate pentice roof. Half a metre deep."""
    box('lean-to', x, y0, x + 0.5, y1, 0, h, 'plaster'); f = x + 0.5
    for y in [y0 + i * (y1 - y0) / round((y1 - y0) / 1.5) for i in range(round((y1 - y0) / 1.5) + 1)]: deco('post', f, y - 0.09, f + 0.05, y + 0.09, 0, h, 'frame')
    for z in (0, 2.05, h - 0.18): deco('rail', f, y0, f + 0.05, y1, z, z + 0.18, 'frame')
    ym = (y0 + y1) / 2
    deco('door', f, ym - 0.5, f + 0.07, ym + 0.5, 0, 2.0, 'timber'); cyl('door ring', f + 0.09, ym + 0.3, 1.0, 1.04, 0.05, 'iron', seg=8, rot=(0, PI / 2, 0))
    for yy in (y0 + 1.6, y1 - 1.6):
        deco('window', f, yy - 0.35, f + 0.04, yy + 0.35, 2.5, 3.4, 'dark')
        for sy in (-0.72, 0.37): deco('shutter', f, yy + sy, f + 0.06, yy + sy + 0.35, 2.5, 3.4, 'timber')
        deco('window box', f, yy - 0.4, f + 0.25, yy + 0.4, 2.3, 2.5, 'timber'); cut(3, f + 0.14, yy, 2.45, 0.8, 0.45, PI / 2, off=0)
    slab('pentice roof', f + 0.35, ym, h + 0.25, 1.9, y1 - y0 + 0.5, 0.1, (0, 0.42, 0), 'slate')
def front_s(y, x0, x1, h=4.0):
    """The same against a wall whose face at y looks south."""
    box('lean-to', x0, y - 0.5, x1, y, 0, h, 'plaster'); f = y - 0.5
    for x in [x0 + i * (x1 - x0) / round((x1 - x0) / 1.5) for i in range(round((x1 - x0) / 1.5) + 1)]: deco('post', x - 0.09, f - 0.05, x + 0.09, f, 0, h, 'frame')
    for z in (0, 2.05, h - 0.18): deco('rail', x0, f - 0.05, x1, f, z, z + 0.18, 'frame')
    for xm in (x0 + (x1 - x0) * 0.25, x0 + (x1 - x0) * 0.75):
        deco('door', xm - 0.5, f - 0.07, xm + 0.5, f, 0, 2.0, 'timber')
        for xx in (xm - 2.0, xm + 2.0):
            deco('window', xx - 0.35, f - 0.04, xx + 0.35, f, 2.5, 3.4, 'dark')
            for sx in (-0.72, 0.37): deco('shutter', xx + sx, f - 0.06, xx + sx + 0.35, f, 2.5, 3.4, 'timber')
    slab('pentice roof', (x0 + x1) / 2, f - 0.35, h + 0.25, x1 - x0 + 0.5, 1.9, 0.1, (0.42, 0, 0), 'slate')
front_e(-31, 8.6, 17.4); front_e(-31, -17.4, -8.6); front_s(21, -7.2, 7.2)
# ivy over the stone: the cross-walls, the keep, the gate towers and the corner towers; vines from the parapets
W_, E_, S_, N_ = -PI / 2, PI / 2, 0, PI      # the way a cut-out faces
for y, w, h in ((8.6, 3.6, 4.6), (18.6, 3.2, 3.8), (-18.4, 3.4, 4.4), (-7.8, 2.8, 3.6)): cut(0, -9, y, 0.1, w, h, W_)
for y, w, h in ((9.6, 3.2, 4.2), (19.2, 2.8, 5.0), (-16.5, 3.6, 4.6), (-7.4, 2.4, 3.0)): cut(0, -8, y, 0.1, w, h, E_)
for y, w, h in ((4.0, 3.2, 5.2), (-5.0, 1.8, 4.0)): cut(0, -8.12, y, 0.4, w, h, W_)
for x, w, h in ((-5.8, 3.6, 5.4), (6.2, 2.6, 4.2), (0.2, 2.2, 3.0)): cut(0, x, 6.12, 0.4, w, h, N_)
for y in (-2.6, 1.6): cut(1, -8.02, y, 4.2, 2.6, 2.8, W_)
for x in (-2.4, 5.6): cut(1, x, 6.02, 4.2, 2.6, 2.8, N_)
cut(0, -29.4, 6.0, 0.1, 2.8, 5.6, E_); cut(0, -29.4, -6.0, 0.1, 2.8, 4.6, E_); cut(0, -31.2, 18, 0.1, 4.6, 6.4, S_); cut(0, -31.2, -18, 0.1, 4.6, 5.4, N_); cut(0, -28, 20.2, 0.1, 3.0, 5.0, E_)
for x, w, h in ((-13.6, 3.0, 2.0), (15.5, 3.4, 4.0), (22.5, 3.0, 3.6)): cut(0, x, 21, 0.1 if x > 0 else 2.4, w, h, S_)
for x in (-24, -10, 12, 20): cut(1, x, 21, WW - 2.4, 2.4, 2.4, S_)
# shrubs, flowers and long grass on the lawns; a fir in each team's ward
for x, y, k in ((-29.5, -13.5, 1.5), (-20.5, -13.8, 1.2), (-27.5, 13.2, 1.3), (-17.8, 16.6, 1.2), (-10.2, 18.4, 1.4), (-10.0, -17.6, 1.5), (-18.5, 9.2, 1.1), (-24.6, -8.2, 1.3), (-10.4, -6.6, 1.2), (-10.4, 7.2, 1.2)): shrub(x, y, k)
for i, (x, y) in enumerate(((-26, 8), (-23.2, 9.6), (-17, -5.6), (-15, -8), (-27.2, -9), (-20, 11.5), (-15.4, 9.4), (-12.6, -9.6), (-28.6, 5.4), (-28.8, -6), (-18, -15), (-23, -13), (-25, 12.4), (-14.2, 17.6), (-19.8, -7.4), (-16.6, 13.4))): shrub(x, y, 1.0 + (i % 3) * 0.25, 3)
for x, y in ((-3.4, 11.8), (-0.9, 15.0), (-4.0, 15.2), (7.0, 20.2), (-7.2, 7.0)): shrub(x, y, 1.0, 2)
cyl('fir trunk', -24.6, -11.0, 0, 3.0, 0.22, 'frame', seg=8); collide(-24.9, -11.3, -24.3, -10.7, 0, 3.0)
for a in (0.2, 0.2 + PI / 2):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(-24.6, -11.0, 5.2)); o = bpy.context.object; o.name = 'ward fir'; o.scale = (5.0, 10.0, 1); o.rotation_euler = (PI / 2, 0, a)
    for l in o.data.uv_layers.active.data: l.uv = (l.uv.x / 2, l.uv.y)
    finish(o, 'firs', True, uv=False)
# a striped pavilion in each ward
cyl('pavilion wall', -14.4, -15.2, 0, 1.75, 1.85, 'cream', seg=12); cyl('pavilion roof', -14.4, -15.2, 1.75, 3.6, 2.15, 'red', seg=12, r2=0.06); cyl('pavilion valance', -14.4, -15.2, 1.6, 1.78, 2.17, 'gold', seg=12)
cyl('pavilion pole', -14.4, -15.2, 3.6, 4.3, 0.03, 'frame', seg=6); tri('pavilion pennant', ((-14.4, -15.2, 4.3), (-14.4, -15.2, 3.95), (-13.7, -15.2, 4.12)), 'gold')
deco('pavilion door', -14.9, -13.42, -13.9, -13.36, 0, 1.7, 'dark'); collide(-16.0, -16.8, -12.8, -13.6, 0, 2.2, 'cloth')
# a market stall by the north arch: a counter under a striped awning, sacks and a crate
box('stall counter', -15.8, 12.4, -13.4, 13.3, 0, 0.9, 'timber', surface='wood')
for x in (-15.75, -13.45):
    for y, z in ((12.45, 2.5), (13.25, 2.0)): deco('stall post', x - 0.05, y - 0.05, x + 0.05, y + 0.05, 0.9, z, 'frame')
slab('stall awning', -14.6, 12.8, 2.32, 2.9, 1.5, 0.04, (0.55, 0, 0), 'blue'); slab('awning stripe', -14.6, 12.8, 2.345, 0.5, 1.5, 0.04, (0.55, 0, 0), 'cream')
for x, y, z in ((-15.3, 12.8, 0.9), (-14.6, 12.9, 0.9), (-13.9, 12.75, 0.9), (-16.3, 12.9, 0), (-16.3, 13.4, 0), (-16.25, 13.15, 0.32)): sack(x, y, z, x)
prop('wooden_bucket_01', -13.1, 12.0, 0, 0.7, 1.0); prop('wooden_crate_02', -13.0, 13.4, 0, PI / 2, 1.0, solid=(1.2, 0.55, 0.47, True))
# firewood by the smithy, a weapon rack by the training yard, sacks and tools by the stables
box('firewood', -21.9, -21, -21.1, -19.7, 0, 0.9, 'timber', surface='wood')
for i in range(12): cyl('log end', -21.08, -20.9 + (i % 4) * 0.34, -0.04, 0.04, 0.14, 'frame', seg=7, rot=(0, PI / 2, 0)).location.z = 0.18 + (i // 4) * 0.3
for y in (3.9, 5.3): deco('rack post', -18.66, y - 0.05, -18.54, y + 0.05, 0, 1.5, 'frame')
for z in (0.5, 1.35): bar('rack rail', (-18.6, 3.9, z), (-18.6, 5.3, z), 0.03, 'frame')
for i in range(5): bar('spear', (-18.3, 4.05 + i * 0.28, 0), (-18.62, 4.05 + i * 0.28, 2.3), 0.018, 'timber'); cyl('spear head', -18.64, 4.05 + i * 0.28, 2.28, 2.55, 0.035, 'iron', seg=5, r2=0.002)
collide(-18.75, 3.8, -18.2, 5.4, 0, 1.6, 'wood', soft=1)
for x, y, z, a in ((-19.7, 18.4, 0, 0.3), (-19.75, 18.95, 0, 1.2), (-19.7, 18.7, 0.3, 2.0), (-23.2, -15.0, 0, 0.5), (-23.75, -15.1, 0, 2.2), (5.2, -4.5, 0, 0.4), (4.7, -4.4, 0, 1.4), (4.95, -4.45, 0.32, 0.9)): sack(x, y, z, a)
bar('pitchfork', (-22.7, 20.8, 0), (-22.9, 20.95, 1.9), 0.02, 'timber'); prop('wooden_bucket_01', -24.2, 16.5, 0, 0.3, 1.0); prop('kite_shield', -18.98, 18.2, 1.6, W_, 1.1)
bar('saddle rail', (-27.9, 17.4, 1.1), (-26.3, 17.4, 1.1), 0.05, 'frame'); slab('saddle blanket', -27.1, 17.4, 1.13, 0.7, 0.5, 0.05, (0.2, 0, 0), 'red')
# bunting from the keep to the gatehouse and to the walls, across each ward; flags over the gate towers
bunting((-8, -4.5, 7.4), (-30, -4.0, 8.0), 2.2); bunting((-8, 4.5, 7.4), (-30, 4.0, 8.0), 2.2)
bunting((-5, 6, 7.4), (-5, 23.4, 5.7), 1.4); bunting((5, 6, 7.4), (5, 23.4, 5.7), 1.4); bunting((-20, 21, 5.0), (-20, -21, 5.0), 1.6)
for y in (6.0, -6.0):
    cyl('flag pole', -32.2, y, 9.6, 13.0, 0.05, 'frame', seg=6); slab('flag', -31.35, y, 12.3, 1.6, 0.03, 1.0, (0, 0, 0), 'red'); slab('flag band', -31.35, y, 12.3, 1.6, 0.035, 0.22, (0, 0, 0), 'gold')
# the wall-walks: braziers, stores, a timber hoarding over the middle
for x in (-21, -7, 7, 21):
    cyl('brazier', x, 22.9, WW, WW + 0.75, 0.2, 'iron', seg=8, r2=0.34); cyl('brazier coals', x, 22.9, WW + 0.72, WW + 0.8, 0.3, 'ember', seg=8); cyl('brazier fire', x, 22.9, WW + 0.78, WW + 1.25, 0.2, 'flame', seg=6, r2=0.02)
    collide(x - 0.32, 22.58, x + 0.32, 23.22, WW, WW + 0.9, 'metal')
prop('wine_barrel_01', -14.5, 22.8, WW, 0.5, 1.1, solid=(0.8, 0.8, 0.95, False)); prop('wooden_crate_02', 12.2, 22.7, WW, PI / 2, 1.2, solid=(1.4, 0.65, 0.55, False))
for x in (-5, 0, 5): box('hoarding post', x - 0.09, 21.05, x + 0.09, 21.23, WW, WW + 2.5, 'frame', surface='wood')
box('hoarding roof', -5.5, 20.8, 5.5, 24.3, WW + 2.5, WW + 2.65, 'timber', surface='wood'); slab('hoarding shingles', 0, 22.55, WW + 2.72, 11.2, 3.7, 0.06, (0.06, 0, 0), 'slate')
# the keep outside: a canopy over each door, shields beside them
slab('door canopy', -8.75, -2, 3.45, 1.7, 3.0, 0.1, (0, -0.4, 0), 'slate'); slab('door canopy', 3, 6.75, 3.45, 3.0, 1.7, 0.1, (-0.4, 0, 0), 'slate')
for y in (-3.3, -0.7): bar('canopy brace', (-8.05, y, 2.5), (-9.3, y, 3.2), 0.05, 'frame')
for x in (1.7, 4.3): bar('canopy brace', (x, 6.05, 2.5), (x, 7.3, 3.2), 0.05, 'frame')
prop('kite_shield', -8.14, 0.2, 2.2, W_, 1.3); prop('kite_shield', 0.6, 6.14, 2.2, N_, 1.3)
# the great hall: boards and a runner on the floor, panelling to head height and whitewash above, tapestries, a set table
deco('hall boards', -7, -5, 7, 5, 0.02, 0.035, 'plank', mirror=False)
deco('hall runner', -6.6, -0.8, 6.6, 0.8, 0.035, 0.045, 'carpet', mirror=False)
for y in (-0.8, 0.72): deco('runner edge', -6.6, y, 6.6, y + 0.08, 0.045, 0.05, 'gold', mirror=False)
for y0, y1 in ((-5, -3.05), (-0.95, 2.95), (3.45, 5)):
    deco('hall panelling', -7, y0, -6.94, y1, 0, 2.2, 'timber'); deco('panel rail', -7, y0, -6.9, y1, 2.2, 2.3, 'frame'); deco('hall whitewash', -7, y0, -6.97, y1, 2.3, KH - 0.4, 'plaster')
deco('hall whitewash', -7, -3.05, -6.97, -0.95, 2.9, KH - 0.4, 'plaster')
for x0, x1 in ((-7, -4.25), (-3.75, 1.95), (4.05, 7)):
    deco('hall panelling', x0, 4.94, x1, 5, 0, 2.2, 'timber'); deco('panel rail', x0, 4.9, x1, 5, 2.2, 2.3, 'frame'); deco('hall whitewash', x0, 4.97, x1, 5, 2.3, KH - 0.4, 'plaster')
deco('hall whitewash', 1.95, 4.97, 4.05, 5, 2.9, KH - 0.4, 'plaster')
for x in (-4, 0, 4): deco('pillar panelling', x - 0.44, 1.96, x + 0.44, 2.84, 0, 2.2, 'timber'); deco('pillar rail', x - 0.47, 1.93, x + 0.47, 2.87, 2.2, 2.3, 'frame')
def tapestry(x0, y0, x1, y1, z0, z1, k):
    """A wall hanging: a coloured field in a gold border with a lozenge."""
    deco('tapestry', x0, y0, x1, y1, z0, z1, 'gold'); thin_x = abs(x1 - x0) < 0.2
    g = 0.14; a = (x0 + (0.012 if thin_x else g), y0 + (g if thin_x else -0.012), x1 + (0.012 if thin_x else -g), y1 + (-g if thin_x else -0.012))
    deco('tapestry field', min(a[0], a[2]), min(a[1], a[3]), max(a[0], a[2]), max(a[1], a[3]), z0 + g, z1 - g, k)
    cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    slab('tapestry lozenge', cx + (0.02 if thin_x else 0), cy - (0 if thin_x else 0.02), cz, 0.03 if thin_x else 0.9, 0.9 if thin_x else 0.03, 0.9, (PI / 4, 0, 0) if thin_x else (0, PI / 4, 0), 'gold')
tapestry(-6.96, -0.4, -6.93, 2.4, 2.75, 5.6, 'blue'); tapestry(-3.2, 4.93, -0.2, 4.96, 2.75, 5.6, 'green')
for x, y in ((-6.3, -4.5), (-0.6, 4.4)):
    cyl('candle stand', x, y, 0, 1.5, 0.03, 'iron', seg=6); cyl('candle dish', x, y, 1.5, 1.54, 0.16, 'iron', seg=8)
    for dx in (-0.09, 0, 0.09): cyl('candle', x + dx, y, 1.54, 1.75, 0.02, 'cream', seg=5); cyl('candle flame', x + dx, y, 1.75, 1.85, 0.018, 'flame', seg=5, r2=0.002)
for x in (-6.05, -1.15):   # a high-backed chair at each end of the long table
    box('chair', x - 0.25, 3.75, x + 0.25, 4.25, 0, 0.48, 'timber', surface='wood'); deco('chair back', x - (0.25 if x < -3 else -0.19), 3.75, x - (0.19 if x < -3 else -0.25), 4.25, 0.48, 1.5, 'timber')
for i, x in enumerate((-5.0, -4.2, -3.4, -2.6, -2.0)):
    cyl('dish', x, 3.8 + (i % 2) * 0.4, 0.85, 0.88, 0.13, 'gold', seg=10); cyl('goblet', x + 0.25, 4.25 - (i % 2) * 0.4, 0.85, 1.0, 0.035, 'gold', seg=6, r2=0.05)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.14, location=(-3.8, 4.0, 0.93)); bpy.context.object.scale = (1.5, 1, 0.7); bpy.ops.object.shade_smooth(); finish(bpy.context.object, 'bread', True, uv=False)
prop('wine_barrel_01', 5.6, -1.6, 0, 0.2, 1.1, solid=(0.8, 0.8, 0.95, False)); prop('kite_shield', -6.92, 4.3, 3.6, E_, 1.2); prop('kite_shield', 5.6, 4.92, 3.6, S_, 1.2)
# the well ward: a bench against the lean-to, a herb bed
prop('painted_wooden_bench', -2.4, 20.1, 0, 0, 1.0, solid=(1.1, 0.4, 0.5, True)); deco('herb bed', -7.4, 8.0, -4.8, 9.6, 0, 0.03, 'mud')
for x, y in ((-6.9, 8.4), (-6.0, 9.2), (-5.3, 8.5), (-6.4, 8.9)): shrub(x, y, 0.8, 3)

# ---------- beyond the walls: firs ----------
rnd = random.Random(3)
for i in range(64):
    side = i % 4; t = rnd.uniform(-1, 1)
    x, y = ((t * (HX + 24), HY + rnd.uniform(8, 30)), (t * (HX + 24), -HY - rnd.uniform(8, 30)), (HX + rnd.uniform(8, 30), t * (HY + 18)), (-HX - rnd.uniform(8, 30), t * (HY + 18)))[side]
    card(x, y, rnd.uniform(12, 20), i % 2)

# ---------- export ----------
def stair(s, sy):
    """The stair in the ward at x = s * (-17.2..-10) on the wall at y = sy * 21, as a bot's way up."""
    z = -sy * 20.3; xs = sorted((s * -17.8, s * -9.4)); zs = sorted((-sy * 21.0, -sy * 19.6))
    return {'rect': [xs[0], zs[0], xs[1], zs[1]], 'climb': [[s * -18.2, 0, z], [s * -17.0, 0.2, z], [s * -13.6, WW / 2, z], [s * -10.2, WW, z], [s * -10.4, WW, -sy * 22.3]]}
export('castle', {
    'half': [HX, HY], 'roof': WW,
    'spawns': [[28, z] for z in (-9, -7, -5, -3, -1, 1, 3, 5, 7, 9)],
    # the wall-walks: the north wall's stairs are the west ward's (as built) and the east ward's (the south-west stair's twin)
    'upper': [{'y': WW, 'bounds': {'minX': -28, 'maxX': 28, 'minZ': -23.4, 'maxZ': -21}, 'portals': [stair(1, 1), stair(-1, 1)]},
              {'y': WW, 'bounds': {'minX': -28, 'maxX': 28, 'minZ': 21, 'maxZ': 23.4}, 'portals': [stair(1, -1), stair(-1, -1)]}],
    'pickups': [['health', 0, 0, 2.2], ['health', 0, 0, -2.2], ['ammo', -25, 0, 18], ['ammo', 25, 0, -18], ['ammo', 2, 0, -15.5], ['ammo', -2, 0, 15.5],
                ['health', 0, WW, -22.2], ['health', 0, WW, 22.2], ['ammo', -24, 0, -18.5], ['ammo', 24, 0, 18.5]],
})
