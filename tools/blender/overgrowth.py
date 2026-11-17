"""Overgrowth: a pumping station the forest has taken back, built as a Blender scene and exported for the game
(helpers: mapkit.py). A fresh layout for the map of that name; the earlier one is kept as 'Overgrowth (classic)'.

    python3 tools/blender/overgrowth.py            (needs Blender's Python module, bpy)

The brick pump house stands in the middle, its hall open at both ends and on one side of each half, its flat roof
reached by a steel stair up each long wall. A gravel track runs to it from each team's end, under a pipe bridge.
Each half has, on one side of the track, the big storage tank, a tank on saddles, the pipe rack and a stack of
containers, and on the other a settling basin, the control hut (walk-through), a water tower, a small tank and a
fallen tree. Ferns, grass, ivy and saplings everywhere; firs all round. Point-mirrored.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapkit import *

HX, HY, T, PI = 40, 28, 0.4, math.pi
R = 4.0                  # the pump house roof (walkable)
setup({
    'ground': ('v_forest:ground', 0x9ea68c), 'outer': ('v_forest:outer forest floor', 0x8a9478), 'track': ('v_gravel:track', 0x8e9a9c), 'pad': ('v_pad:pad', 0xdcdcd4), 'wall': ('v_conc:perimeter wall', 0xd4d4cc),
    'brick': ('v_brick:brick wall', 0xe4d8cc), 'roof': ('v_conc:roof slab', 0xc0c0b8), 'plaster': ('v_plaster:hut wall', 0xe0e0d4), 'rust': ('v_rust:tank', 0xe0d4c8), 'rustd': ('v_rust:tank band', 0x9a8878),
    'corr': ('v_corr:container', 0xd0d8d8), 'corr b': ('v_corr:container blue', 0x7a9ab0), 'corr r': ('v_corr:container red', 0xb47a68), 'sheet': ('v_corr:roof sheet', 0xc8c4bc), 'pump': ('v_paint:pump', 0xd8e0d4), 'pipe': ('v_paint:pipe', 0xc8d0c4),
    'bark': ('v_bark:trunk', 0xd8d0c4), 'steel': ('flat:steel', 0x4a4640), 'tread': ('flat:stairs', 0x56524a), 'dark': ('flat:dark', 0x141412), 'frame': ('v_rust:frame', 0x8a7868), 'yellow': ('flat:faded yellow', 0xb89a3a), 'sign': ('flat:sign', 0xd8d4c4),
    'red': ('flat:valve red', 0x8a2a20), 'water': ('flat:water', 0x2c4438), 'moss': ('flat:moss', 0x4a6a30), 'fir': ('foliage:fir', 0xc8d4c4), 'leaf': ('foliage:leaf', 0xd4dcc0), 'firs': ('card:tree', 0xffffff), 'cut': ('cutout:greenery', 0x8a9a78), 'decal': ('decal:ground wear', 0xffffff),
}, rough={'water': 0.05, 'steel': 0.6}, metal={'steel': 0.5}, default='brick',
   shade={'brick': 0xa89c94, 'plaster': 0xa4a89c, 'wall': 0x90968a, 'moss': 0x2a3e1c})
rnd = random.Random(11); POOLS[0] = False
SOLID = []               # footprints (x0, y0, x1, y1) the scattered greenery keeps clear of
def keep(x0, y0, x1, y1): SOLID.append((x0, y0, x1, y1))
def free(x, y, m=0.5): return all(not (a - m < x < c + m and b - m < y < d + m) for a, b, c, d in SOLID) and abs(x) < HX - 1 and abs(y) < HY - 1
def ivy(x, y, yaw, w=2.6, h=3.4, kind=0, z=0): cut(kind, x, y, z, w, h, yaw)
S_, N_, W_, E_ = 0, PI, -PI / 2, PI / 2   # the way a wall face looks

# ---------- ground ----------
deco('ground', -HX, -HY, 0, HY, -0.06, 0.0, 'ground'); deco('outer ground', -170, -150, -HX, 150, -0.1, -0.02, 'outer'); deco('outer ground', -HX, HY, 0, 150, -0.1, -0.02, 'outer'); deco('outer ground', -HX, -150, 0, -HY, -0.1, -0.02, 'outer')
deco('track', -HX, -2.6, -8, 2.6, 0.0, 0.02, 'track'); deco('track', -13.8, -18, -10.4, 14, 0.0, 0.018, 'track')
for x0, y0, x1, y1 in ((-10, -7.5, 0, 7.5), (-29.5, -19.5, -18.5, -8.5), (-27, 3.2, -17, 11.8), (-34, 4, -27, 11), (-19, -12, -8.5, -8), (-17.5, 10.5, -12.5, 15.5)): deco('pad', x0, y0, x1, y1, 0.0, 0.035, 'pad')
for k_, (x, y, w, d, a) in enumerate(((-6, 6.2, 3, 2, 0.3), (-24, -9.5, 4, 3, 1.2), (-22, 7.5, 3, 3, 2), (-30, 7, 4, 3, 0.5), (-13, -10, 4, 2, 0.2), (-4, -6.4, 3, 2, 1.6), (-20, 0, 5, 3, 0.4), (-30, -1, 4, 3, 2.2))): wear(1 if k_ % 2 else k_ % 4, x, y, w, d, a, z=0.045)

# ---------- the pump house ----------
wall_y('pump house west', -8, -8 + T, -5, 5, R, [(0, 2.4, 0, 2.7), (-3.2, 1.3, 1.2, 2.7), (3.2, 1.3, 1.2, 2.7)])
wall_x('pump house north', 5 - T, 5, -8 + T, 0, R, [(-1.4, 1.5, 1.2, 2.7)]); wall_x('pump house south', -5, -5 + T, -8 + T, 0, R, [(-4, 1.7, 0, 2.5), (-1.3, 1.5, 1.2, 2.7)])
box('pump house roof', -8.3, -5.3, 0, 5.3, R, R + 0.25, 'roof'); deco('roof edge', -8.36, -5.36, 0, 5.36, R - 0.12, R + 0.02, 'pad'); deco('hall floor', -7.6, -4.6, 0, 4.6, 0.035, 0.05, 'pad')
for name, x0, y0, x1, y1 in (('parapet', -8.3, -5.3, -7.95, 5.3), ('parapet', -7.95, -5.3, 0, -4.95), ('parapet', -7.95, 4.95, -2.3, 5.3)): box(name, x0, y0, x1, y1, R + 0.25, R + 1.15, 'brick'); deco('parapet cap', x0 - 0.04, y0 - 0.04, x1 + (0.04 if x1 < 0 else 0), y1 + 0.04, R + 1.15, R + 1.22, 'pad')
keep(-8.4, -5.4, 0, 6.4)
# the stair up the north wall
NS, RUN = 20, 0.32
for i in range(NS):
    xa, xb, top = -8.3 + RUN * i, -8.3 + RUN * (i + 1), (i + 1) * (R + 0.25) / NS
    box('stairs', xa, 5.3, xb, 6.4, 0, top, 'tread', surface='metal'); deco('nosing', xa - 0.01, 5.3, xa + 0.05, 6.4, top - 0.03, top + 0.005, 'yellow'); deco('stair side', xa, 6.4, xb, 6.44, 0, top + 0.1, 'steel')
box('stair landing', -1.9, 5.3, 0, 6.4, 0, R + 0.25, 'tread', surface='metal'); deco('landing side', -1.9, 6.4, 0, 6.44, 0, R + 0.35, 'steel')
bar('stair rail', (-8.3, 6.42, 1.05), (-1.9, 6.42, R + 1.3), 0.03, 'steel'); bar('stair rail', (-8.3, 6.42, 0.55), (-1.9, 6.42, R + 0.8), 0.02, 'steel'); bar('stair rail', (-1.9, 6.42, R + 1.3), (0, 6.42, R + 1.3), 0.03, 'steel'); bar('stair rail', (-1.9, 6.42, R + 0.8), (0, 6.42, R + 0.8), 0.02, 'steel')
for i in range(0, NS + 1, 4): x = -8.3 + RUN * i; bar('stair post', (x, 6.42, i * (R + 0.25) / NS), (x, 6.42, i * (R + 0.25) / NS + 1.05), 0.025, 'steel')
collide(-1.9, 6.38, 0, 6.48, R + 0.25, R + 1.3, 'metal', soft=1)
# inside: two pump sets, their pipework, switchgear on the wall
def pump(x, y):
    """A pump set on its plinth: a finned motor, the coupling, the pump casing with its suction and discharge, a valve on the riser."""
    zc = 0.95; box('pump plinth', x - 1.3, y - 0.7, x + 1.3, y + 0.7, 0.05, 0.4, 'roof'); deco('bed plate', x - 1.15, y - 0.5, x + 1.15, y + 0.5, 0.4, 0.46, 'steel')
    cyl('pump motor', x - 0.55, y, zc - 0.45, zc + 0.45, 0.36, 'pump', seg=18, rot=(0, PI / 2, 0)); cyl('motor end', x - 1.02, y, zc - 0.03, zc + 0.03, 0.3, 'steel', seg=18, rot=(0, PI / 2, 0))
    for i in range(7): cyl('motor fin', x - 0.88 + i * 0.11, y, zc - 0.012, zc + 0.012, 0.4, 'pump', seg=18, rot=(0, PI / 2, 0))
    deco('motor box', x - 0.72, y - 0.14, x - 0.4, y + 0.14, zc + 0.3, zc + 0.52, 'pump'); box('motor foot', x - 0.9, y - 0.3, x - 0.2, y + 0.3, 0.46, zc - 0.3, 'steel', solid=False)
    cyl('coupling', x + 0.02, y, zc - 0.12, zc + 0.12, 0.13, 'yellow', seg=10, rot=(0, PI / 2, 0)); cyl('pump shaft', x + 0.0, y, zc - 0.22, zc + 0.22, 0.05, 'steel', seg=8, rot=(0, PI / 2, 0))
    cyl('pump casing', x + 0.5, y, zc - 0.17, zc + 0.17, 0.46, 'pump', seg=20, rot=(0, PI / 2, 0)); cyl('casing flange', x + 0.5, y, zc - 0.03, zc + 0.03, 0.52, 'steel', seg=20, rot=(0, PI / 2, 0)); cyl('suction', x + 0.95, y, zc - 0.28, zc + 0.28, 0.17, 'pipe', seg=12, rot=(0, PI / 2, 0)); cyl('suction flange', x + 1.2, y, zc - 0.03, zc + 0.03, 0.25, 'steel', seg=12, rot=(0, PI / 2, 0))
    cyl('riser', x + 0.5, y, zc + 0.4, R, 0.15, 'pipe', seg=12); cyl('riser flange', x + 0.5, y, 2.2, 2.26, 0.23, 'steel', seg=12); cyl('valve body', x + 0.5, y, 2.6, 2.95, 0.21, 'pump', seg=12); cyl('riser flange', x + 0.5, y, 3.3, 3.36, 0.23, 'steel', seg=12)
    cyl('valve stem', x + 0.5, y - 0.3, 2.78 - 0.2, 2.78 + 0.2, 0.025, 'steel', seg=6, rot=(PI / 2, 0, 0)); cyl('valve wheel', x + 0.5, y - 0.5, 2.78 - 0.015, 2.78 + 0.015, 0.22, 'red', seg=16, rot=(PI / 2, 0, 0))
    collide(x - 1.3, y - 0.7, x + 1.3, y + 0.7, 0, 1.6, 'metal'); collide(x + 0.3, y - 0.2, x + 0.7, y + 0.2, 1.6, R, 'metal'); keep(x - 1.3, y - 0.8, x + 1.3, y + 0.8)
pump(-4.6, 2.6); pump(-2.0, -2.4)
bar('header pipe', (-7.5, 4.2, 3.4), (0, 4.2, 3.4), 0.18, 'pipe'); bar('header pipe', (-7.5, -4.2, 3.2), (0, -4.2, 3.2), 0.14, 'pipe')
box('switchgear', -7.55, 1.5, -7.0, 4.3, 0.05, 2.1, 'pump', surface='metal')
for i in range(4): deco('switch door', -7.0, 1.6 + i * 0.67, -6.98, 2.2 + i * 0.67, 0.2, 2.0, 'pipe'); deco('gauge', -6.98, 1.8 + i * 0.67, -6.97, 2.0 + i * 0.67, 1.5, 1.7, 'sign'); deco('switch handle', -6.98, 1.85 + i * 0.67, -6.94, 1.9 + i * 0.67, 1.0, 1.2, 'dark')
prop('barrel_03', -6.9, -4.0, 0.05, 0.3, 1.0, solid=(0.65, 0.65, 0.95, False)); prop('barrel_03', -6.2, -4.1, 0.05, 1.3, 1.0, solid=(0.65, 0.65, 0.95, False)); prop('old_tyre', -0.9, 3.9, 0.3, 0.5, 1.0)
deco('puddle', -6.2, -1.6, -3.6, 0.9, 0.052, 0.056, 'water'); text('PUMP HOUSE  No. 2', -8.02, 0, 3.3, W_, 0.3, 'sign', mirror=True, depth=0.02)
for x, yw, w in ((-5.9, N_, 3.0), (-3.0, S_, 2.6)): ivy(x, 5.0 if yw == N_ else -5.0, yw, w, 4.4)
ivy(-8.0, -3.4, W_, 2.4, 4.6); ivy(-8.0, 3.6, W_, 2.0, 3.6, 1, 0.6); ivy(-6.6, -5.0, S_, 2.2, 4.2); ivy(-0.9, -5.0, S_, 1.6, 2.0, 1, 2.2)

# ---------- the tanks ----------
def tank(x, y, r, h, name='tank'):
    cyl(name, x, y, 0, h, r, 'rust', seg=28); cyl(name + ' roof', x, y, h, h + r * 0.22, r + 0.08, 'rustd', seg=28, r2=0.3)
    for z in (0.05, h * 0.33, h * 0.66, h - 0.12): cyl(name + ' band', x, y, z, z + 0.12, r + 0.035, 'rustd', seg=28)
    cyl(name + ' base', x, y, 0, 0.25, r + 0.4, 'pad', seg=28)
    a = r * 0.93; b = r * 0.39
    for q in ((x - a, y - b, x + a, y + b), (x - b, y - a, x + b, y + a), (x - r * 0.68, y - r * 0.68, x + r * 0.68, y + r * 0.68)): collide(*q, 0, h, 'metal')
    keep(x - r - 0.3, y - r - 0.3, x + r + 0.3, y + r + 0.3)
    for i in range(7):   # ivy round the foot, vines from the rim
        t = i * 0.9 + x; cut(0 if i % 3 else 1, x + math.cos(t) * (r + 0.02), y + math.sin(t) * (r + 0.02), 0 if i % 3 else h - 2.6, 2.4, 3.2 if i % 3 else 2.6, t + PI / 2)
    bar(name + ' ladder', (x - r - 0.08, y - 0.25, 0.3), (x - r - 0.08, y - 0.25, h), 0.025, 'steel'); bar(name + ' ladder', (x - r - 0.08, y + 0.25, 0.3), (x - r - 0.08, y + 0.25, h), 0.025, 'steel')
    for i in range(int(h / 0.35)): bar(name + ' rung', (x - r - 0.08, y - 0.25, 0.5 + i * 0.35), (x - r - 0.08, y + 0.25, 0.5 + i * 0.35), 0.014, 'steel')
tank(-24, -14, 4.2, 7.2, 'storage tank'); tank(-31, 17.5, 2.6, 4.6, 'small tank')
text('T-1', -24, -18.25, 4.6, S_, 0.7, 'sign', mirror=True, depth=0.02)
# a tank on saddles
cyl('saddle tank', -14.5, -20.5, 1.7 - 3.2, 1.7 + 3.2, 1.25, 'rust', seg=20, rot=(0, PI / 2, 0))
for x in (-17.7, -11.3): cyl('tank end', x, -20.5, 1.7 - 0.06, 1.7 + 0.06, 1.3, 'rustd', seg=20, rot=(0, PI / 2, 0))
for x in (-16.6, -12.4): box('saddle', x - 0.3, -21.6, x + 0.3, -19.4, 0, 0.75, 'pad')
collide(-17.7, -21.7, -11.3, -19.3, 0.6, 2.95, 'metal'); keep(-17.8, -21.8, -11.2, -19.2); ivy(-14.5, -19.25, N_, 3.2, 2.2, 1, 0.9)
# the water tower
TX, TY = -15, 13
for sx in (-2.0, 2.0):
    for sy in (-2.0, 2.0): bar('tower leg', (TX + sx, TY + sy, 0), (TX + sx * 0.8, TY + sy * 0.8, 9.0), 0.11, 'steel'); box('tower foot', TX + sx - 0.35, TY + sy - 0.35, TX + sx + 0.35, TY + sy + 0.35, 0, 0.4, 'pad'); collide(TX + sx - 0.2, TY + sy - 0.2, TX + sx + 0.2, TY + sy + 0.2, 0, 9, 'metal')
for z0, z1 in ((0.6, 3.2), (3.2, 6.0), (6.0, 8.8)):
    for (ax, ay), (bx, by) in (((-2, -2), (2, -2)), ((2, -2), (2, 2)), ((2, 2), (-2, 2)), ((-2, 2), (-2, -2))):
        k0, k1 = 1 - 0.2 * z0 / 9, 1 - 0.2 * z1 / 9
        bar('tower brace', (TX + ax * k0, TY + ay * k0, z0), (TX + bx * k1, TY + by * k1, z1), 0.035, 'steel'); bar('tower girt', (TX + ax * k1, TY + ay * k1, z1), (TX + bx * k1, TY + by * k1, z1), 0.05, 'steel')
cyl('tower tank', TX, TY, 9.0, 12.6, 3.0, 'rust', seg=24); cyl('tower roof', TX, TY, 12.6, 13.8, 3.15, 'rustd', seg=24, r2=0.2); cyl('tower band', TX, TY, 9.0, 9.15, 3.06, 'rustd', seg=24); cyl('tower band', TX, TY, 12.4, 12.55, 3.06, 'rustd', seg=24)
cyl('tower walk', TX, TY, 8.85, 9.0, 3.7, 'steel', seg=24); cyl('down pipe', TX, TY, 0, 9.0, 0.22, 'pipe', seg=10); collide(TX - 0.25, TY - 0.25, TX + 0.25, TY + 0.25, 0, 9, 'metal'); keep(TX - 2.5, TY - 2.5, TX + 2.5, TY + 2.5)
for i in range(6): t = i * 1.05; cut(1, TX + math.cos(t) * 3.02, TY + math.sin(t) * 3.02, 6.6, 2.4, 2.8, t + PI / 2)
text('OVERGROWTH', TX, TY - 3.03, 10.9, S_, 0.55, 'sign', mirror=True, depth=0.02)

# ---------- the pipe rack and the pipe bridge over the track ----------
for y in (-10.8, -9.9, -9.0):
    bar('rack pipe', (-18.6, y, 0.78), (-8.8, y, 0.78), 0.34, 'pipe')
    for x in (-18.6, -15.4, -12.2, -8.8): cyl('rack flange', x, y, 0.78 - 0.05, 0.78 + 0.05, 0.42, 'steel', seg=12, rot=(0, PI / 2, 0))
for x in (-17.6, -13.7, -9.8): box('rack sleeper', x - 0.25, -11.4, x + 0.25, -8.4, 0, 0.42, 'pad')
collide(-18.6, -11.2, -8.8, -8.6, 0, 1.15, 'metal'); keep(-18.8, -11.5, -8.6, -8.3); cyl('rack valve', -14.2, -9.9, 1.12, 1.5, 0.05, 'steel', seg=6); cyl('rack valve wheel', -14.2, -9.9, 1.5, 1.54, 0.3, 'red', seg=14)
for y0, y1 in ((-19.2, 14.0),):
    bar('pipe bridge', (-12.1, y0, 3.7), (-12.1, y1, 3.7), 0.3, 'pipe'); bar('pipe bridge', (-12.9, y0, 3.6), (-12.9, y1, 3.6), 0.18, 'pipe')
    for y in (-15.5, -6.2, 3.4, 9.6):
        for x in (-13.5, -11.5): bar('bridge post', (x, y, 0), (x, y, 3.4), 0.07, 'steel'); collide(x - 0.12, y - 0.12, x + 0.12, y + 0.12, 0, 3.4, 'metal')
        bar('bridge beam', (-13.6, y, 3.35), (-11.4, y, 3.35), 0.07, 'steel'); bar('bridge brace', (-13.5, y, 2.5), (-12.5, y, 3.35), 0.035, 'steel'); bar('bridge brace', (-11.5, y, 2.5), (-12.5, y, 3.35), 0.035, 'steel')
    for y in (-12, -2, 6): cut(1, -12.1, y, 1.2, 2.6, 2.5, E_); cut(1, -12.9, y + 1.5, 1.4, 2.2, 2.2, W_)

# ---------- the settling basin and the control hut ----------
BX0, BY0, BX1, BY1 = -26.5, 3.6, -18, 11.4
for x0, y0, x1, y1 in ((BX0, BY0, BX1, BY0 + 0.35), (BX0, BY1 - 0.35, BX1, BY1), (BX0, BY0, BX0 + 0.35, BY1), (BX1 - 0.35, BY0, BX1, BY1)): box('basin wall', x0, y0, x1, y1, 0, 1.0, 'wall')
deco('basin water', BX0 + 0.3, BY0 + 0.3, BX1 - 0.3, BY1 - 0.3, 0.5, 0.52, 'water'); collide(BX0 + 0.35, BY0 + 0.35, BX1 - 0.35, BY1 - 0.35, 0, 0.5, 'concrete', soft=0); keep(BX0 - 0.2, BY0 - 0.2, BX1 + 0.2, BY1 + 0.2)
deco('basin walkway', BX0, 7.1, BX1, 7.9, 1.0, 1.06, 'steel'); collide(BX0, 7.1, BX1, 7.9, 0.9, 1.06, 'metal'); bar('walkway rail', (BX0, 7.12, 2.0), (BX1, 7.12, 2.0), 0.025, 'steel')
for x in (BX0 + 0.2, -22.2, BX1 - 0.2): bar('walkway post', (x, 7.12, 1.06), (x, 7.12, 2.0), 0.025, 'steel')
bar('basin inlet', (BX1 - 0.2, 9.8, 0.8), (-13.0, 9.8, 0.8), 0.2, 'pipe'); collide(-18, 9.55, -13.0, 10.05, 0, 1.0, 'metal'); keep(-18, 9.4, -13, 10.2)
for i in range(7): cut(3, BX0 + 0.8 + i * 1.1, BY0 + 0.6 + (i % 3) * 2.6, 0.4, 1.2, 1.2, i * 0.9)
HX0, HY0, HX1, HY1, HH = -34, 4.2, -28.2, 10.4, 3.0
wall_x('hut south', HY0, HY0 + 0.3, HX0, HX1, HH, [(-31.6, 1.4, 0, 2.3), (-29.6, 1.2, 1.1, 2.2)], 'plaster'); wall_x('hut north', HY1 - 0.3, HY1, HX0, HX1, HH, [(-31.2, 1.6, 1.1, 2.2)], 'plaster')
wall_y('hut west', HX0, HX0 + 0.3, HY0 + 0.3, HY1 - 0.3, HH, [(7.3, 1.6, 1.1, 2.2)], 'plaster'); wall_y('hut east', HX1 - 0.3, HX1, HY0 + 0.3, HY1 - 0.3, HH, [(8.6, 1.4, 0, 2.3)], 'plaster')
box('hut roof', HX0 - 0.4, HY0 - 0.4, HX1 + 0.4, HY1 + 0.4, HH, HH + 0.14, 'sheet'); slab('hut roof sheet', (HX0 + HX1) / 2, (HY0 + HY1) / 2, HH + 0.5, HX1 - HX0 + 1.0, HY1 - HY0 + 1.2, 0.06, (0.11, 0, 0), 'sheet'); deco('hut floor', HX0 + 0.3, HY0 + 0.3, HX1 - 0.3, HY1 - 0.3, 0.035, 0.05, 'pad')
keep(HX0 - 0.3, HY0 - 0.3, HX1 + 0.3, HY1 + 0.3)
prop('metal_office_desk', -32.6, 9.5, 0.05, 0, 0.9, solid=(1.8, 0.85, 0.75, False)); prop('utility_box_01', -28.75, 5.6, 0.6, E_, 1.0); prop('utility_box_01', -28.75, 6.4, 0.6, E_, 1.0); prop('portable_generator', -33.2, 5.3, 0.05, 0.4, 1.0, solid=(0.9, 0.7, 0.6, False))
box('hut lockers', -33.7, 6.3, -33.2, 7.9, 0.05, 1.9, 'pump', surface='metal'); prop('old_tyre', -29.2, 9.6, 0.13, 0, 1.0); prop('old_tyre', -29.2, 9.6, 0.3, 0.4, 1.0)
text('CONTROL', -31.6, HY0 - 0.02, 2.62, S_, 0.24, 'sign', mirror=True, depth=0.015); ivy(-33.0, HY0, S_, 2.0, 3.2); ivy(HX0, 5.2, W_, 2.2, 3.4); ivy(-29.4, HY1, N_, 2.6, 3.3); ivy(-32.8, HY1, N_, 1.8, 2.2, 1, 1.0); ivy(HX1, 5.4, E_, 2.0, 3.0)

# ---------- containers, barriers, the fallen tree, the lean-to ----------
for name, x0, y0, x1, y1, z0, k in (('container', -36.5, -23.6, -30.4, -21.1, 0, 'corr b'), ('container', -35.4, -20.7, -29.3, -18.2, 0, 'corr r'), ('container', -36.0, -23.4, -29.9, -20.9, 2.6, 'corr')):
    box(name, x0, y0, x1, y1, z0, z0 + 2.6, k, surface='metal'); deco('container rail', x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, z0 + 2.52, z0 + 2.62, 'steel'); deco('container rail', x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, z0, z0 + 0.1, 'steel')
    for yy in (y0 + 0.62, y1 - 0.62): bar('door rod', (x1 + 0.02, yy, z0 + 0.15), (x1 + 0.02, yy, z0 + 2.45), 0.02, 'steel')
keep(-36.7, -23.8, -29.1, -18.0); ivy(-33.0, -18.2, N_, 3.0, 2.6); ivy(-29.3, -19.5, E_, 2.2, 2.6, 1, 0.2); ivy(-33.0, -23.6, S_, 3.4, 3.6)
for x, y, yaw in ((-27.5, -1.4, 0.2), (-25.9, -1.7, 0.0), (-18.5, 1.5, -0.15), (-16.9, 1.6, 0.1), (-21.5, -5.6, 1.5), (-9.6, 17.8, 0.3), (-28.5, 13.0, 1.2)):
    prop('concrete_road_barrier', x, y, 0, yaw, 1.05, solid=(1.6 if abs(math.cos(yaw)) > 0.7 else 0.7, 0.7 if abs(math.cos(yaw)) > 0.7 else 1.6, 0.85, False)); keep(x - 0.9, y - 0.9, x + 0.9, y + 0.9)
bar('fallen tree', (-26.5, 21.6, 0.5), (-18.2, 22.6, 0.62), 0.5, 'bark'); collide(-26.5, 21.3, -18.2, 22.9, 0, 1.05, 'wood'); keep(-26.6, 21.0, -18.0, 23.2); prop('root_cluster_01', -27.4, 21.5, 0, 1.4, 0.8); prop('dead_tree_trunk', -21.5, 24.2, 0.1, 0.3, 1.6)
for x, y in ((-20.6, 22.4), (-23.4, 22.0)): cut(3, x, y, 0.7, 1.4, 1.0, 0.2); ico('log moss', x, y, 0.98, 0.7, 0.4, 0.12, 'moss', sub=1)
for i in range(4): bar('lean-to post', (-37.5 + (i % 2) * 3.4, -10.5 + (i // 2) * 4.2, 0), (-37.5 + (i % 2) * 3.4, -10.5 + (i // 2) * 4.2, 2.3 + (i % 2) * 0.5), 0.06, 'steel'); collide(-37.6 + (i % 2) * 3.4, -10.6 + (i // 2) * 4.2, -37.4 + (i % 2) * 3.4, -10.4 + (i // 2) * 4.2, 0, 2.4, 'metal')
slab('lean-to roof', -35.8, -8.4, 2.6, 4.2, 5.2, 0.05, (0, -0.145, 0), 'sheet'); slab('fallen sheet', -33.2, -9.4, 0.5, 1.2, 2.4, 0.04, (0, 0.9, 0.3), 'sheet')
for i, (x, y) in enumerate(((-37.0, -9.6), (-36.3, -9.7), (-36.6, -8.9), (-37.1, -7.2), (-36.2, -6.9))): prop('barrel_03', x, y, 0, i * 0.7, 1.0, solid=(0.65, 0.65, 0.95, False)); keep(x - 0.5, y - 0.5, x + 0.5, y + 0.5)
for x, y in ((-10.5, -14.6), (-20.0, 16.5), (-35.5, 0.8)):
    for i in range(3): prop('old_tyre', x + (i % 2) * 0.1, y, 0.09 + i * 0.17, i * 0.8, 1.05)
    collide(x - 0.35, y - 0.35, x + 0.35, y + 0.35, 0, 0.55, 'wood', soft=1)
for x, y, s, yaw in ((-33.5, 23.5, 0.42, 0.3), (-7.5, -22.5, 0.36, 2.0), (-36.5, -15.5, 0.3, 1.1), (-5.5, 12.5, 0.3, 4.0)):
    prop('rock_moss_set_01', x, y, 0.25 * s / 0.4, yaw, s); collide(x - 3.2 * s, y - 2.8 * s, x + 3.2 * s, y + 2.8 * s, 0, 1.5 * s + 0.2, 'concrete'); keep(x - 3.4 * s, y - 3.0 * s, x + 3.4 * s, y + 3.0 * s)
for x, y in ((-30.5, 24.6), (-8.5, 24.0), (-24.5, -24.5), (-3.0, -15.5), (-38.0, 12.5)): prop('tree_stump_01', x, y, 0.1, x, 1.0, solid=(0.9, 0.9, 0.5, False)); keep(x - 0.7, y - 0.7, x + 0.7, y + 0.7)
prop('ladder_sectioned_01', -9.0, 7.0, 0, 0.2, 1.0); prop('modular_industrial_pipes_01', -19.6, -8.2, 1.0, 0, 1.0); prop('rusted_wheel_rim_01', -17.5, -6.8, 0.08, 0.5, 1.0); prop('rusted_wheel_rim_01', -26.8, -8.0, 0.08, 1.5, 1.0)

# ---------- the wall round the station, with the forest pushing over it ----------
for x0, y0, x1, y1 in ((-HX - 0.3, -HY - 0.3, -HX, HY + 0.3), (-HX, HY, 0, HY + 0.3), (-HX, -HY - 0.3, 0, -HY)):
    box('perimeter wall', x0, y0, x1, y1, 0, 2.8, 'wall'); deco('wall cap', x0 - 0.05, y0 - 0.05, x1 + (0.05 if x1 < 0 else 0), y1 + 0.05, 2.8, 2.9, 'pad')
for i in range(13):
    x = -38 + i * 3.0; ivy(x, HY, S_, 3.0, 3.4 + (i % 3) * 0.5, i % 4 == 3 and 1 or 0, 0.9 if i % 4 == 3 else 0); ivy(x + 1.2, -HY, N_, 3.0, 3.2 + (i % 2) * 0.7, i % 4 == 1 and 1 or 0, 0.8 if i % 4 == 1 else 0)
for i in range(18): y = -26 + i * 3.0; ivy(-HX, y, E_, 3.0, 3.3 + (i % 3) * 0.5, i % 5 == 2 and 1 or 0, 0.9 if i % 5 == 2 else 0)

# ---------- trees inside the wall, and everything that grows ----------
for x, y, h, v in ((-36.5, 21.0, 15, 0), (-5.0, 20.5, 13, 1), (-21.0, -23.5, 14, 0), (-37.0, -3.6, 12, 1), (-8.0, -13.5, 11, 1), (-25.5, 15.0, 13, 0), (-3.2, 9.5, 10, 1), (-17.0, 20.2, 12, 0), (-30.0, -8.0, 11, 1)):
    (broadleaf if v else fir)(x, y, h, mirror=True); cyl('tree foot', x, y, 0, 0.5, 0.42 + h * 0.012, 'bark', seg=8, r2=0.2 + h * 0.012); collide(x - 0.3, y - 0.3, x + 0.3, y + 0.3, 0, 6, 'wood'); keep(x - 0.6, y - 0.6, x + 0.6, y + 0.6)
n = 0
while n < 46:    # fern patches and shrubs
    x, y = rnd.uniform(-39, -0.5), rnd.uniform(-27, 27)
    if not free(x, y, 1.2) or abs(y) < 2.9 and x < -8: continue
    q = n % 5
    if q < 2: prop('fern_02', x, y, 0, rnd.uniform(0, 6.3), rnd.uniform(0.8, 1.3))
    elif q == 2: prop('shrub_01', x, y, 0, rnd.uniform(0, 6.3), rnd.uniform(0.8, 1.2))
    elif q == 3: prop('shrub_03', x, y, 0, rnd.uniform(0, 6.3), rnd.uniform(1.0, 1.6))
    else: prop('grass_medium_01', x, y, 0, rnd.uniform(0, 6.3), rnd.uniform(0.7, 1.0))
    n += 1
n = 0
while n < 150:   # tall grass, saplings and bushes on cards
    x, y = rnd.uniform(-39.5, -0.3), rnd.uniform(-27.5, 27.5)
    if not free(x, y, 0.3) or abs(y) < 2.4 and x < -8: continue
    k = 3 if n % 4 else 2; h = rnd.uniform(0.7, 1.3) if k == 3 else rnd.uniform(1.2, 2.2); a = rnd.uniform(0, PI)
    cut(k, x, y, -0.03, h * 1.3, h, a, off=0); cut(k, x, y, -0.03, h * 1.3, h, a + PI / 2, off=0); n += 1
for i in range(5): prop('nettle_plant', -9.4 + i * 0.0, -6.3 - i * 0.0 + (i - 2) * 0.01, 0, i, 1.0) if i == 0 else None
# the forest beyond: three rings of firs and broadleaves, thinning into the mist
for ring, (rx, ry, cnt, hmin, hmax) in enumerate(((HX + 4, HY + 4, 56, 12, 19), (HX + 11, HY + 10, 60, 14, 22), (HX + 22, HY + 20, 64, 16, 26), (HX + 40, HY + 36, 60, 18, 28))):
    for i in range(cnt):
        t = (i + ring * 0.37) / cnt * 2 * PI; x, y = math.cos(t) * rx * 1.3, math.sin(t) * ry * 1.3; x = max(-rx, min(rx, x)) + rnd.uniform(-2.2, 2.2); y = max(-ry, min(ry, y)) + rnd.uniform(-2.2, 2.2)
        (fir if (i + ring) % 4 else broadleaf)(x, y, rnd.uniform(hmin, hmax) * (1 if (i + ring) % 4 else 0.7), seed=i)

def stair(s):
    xs, zs = sorted((s * -8.3, s * -1.9)), sorted((s * -6.4, s * -5.3))
    return {'rect': [xs[0], zs[0], xs[1], zs[1]], 'climb': [[s * -9.0, 0, s * -5.85], [s * -8.2, 0.2, s * -5.85], [s * -5.1, (R + 0.25) / 2, s * -5.85], [s * -1.9, R + 0.25, s * -5.85], [s * -1.0, R + 0.25, s * -5.85], [s * -1.0, R + 0.25, s * -4.2]]}
export('overgrowth', {
    'half': [HX, HY], 'roof': R + 0.25,
    'spawns': [[36.5, z] for z in (-9, -7, -5, -3, -1, 1, 3, 5, 7, 9)],
    'upper': [{'y': R + 0.25, 'bounds': {'minX': -8.3, 'maxX': 8.3, 'minZ': -6.4, 'maxZ': 6.4}, 'portals': [stair(1), stair(-1)]}],
    'pickups': [['health', -4.2, 0, 0.6], ['ammo', 4.2, 0, -0.6], ['health', -3, R + 0.25, 2], ['ammo', 3, R + 0.25, -2], ['health', -22, 0, 0], ['health', 22, 0, 0], ['ammo', -31, 0, -7.3], ['ammo', 31, 0, 7.3], ['ammo', -14, 0, 16], ['ammo', 14, 0, -16]],
}, bake=dict(size=int(os.environ.get('LM', 2048)), samples=int(os.environ.get('LMS', 24)), sky=(0.8, 0.86, 0.9), sky_k=1.0, skip=('card', 'decal', 'soft', 'cutout', 'foliage'),
            only='ground$|track|pad|brick wall|roof slab|hut wall|^tank$|container|roof sheet|perimeter wall|stairs|pump$'))
