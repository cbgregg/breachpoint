"""Freshway: a neighbourhood supermarket, built as a Blender scene and exported for the game (helpers: mapkit.py;
its shelves, freezers, coolers, storefront glazing and posters come from the atlas made by facade_atlas.py mart).
A fresh layout for the map of that name; the earlier one is kept as 'Freshway (classic)'.

    python3 tools/blender/mart.py            (needs Blender's Python module, bpy)

The store (x -24..24, y -16..16) stands between two car parks, one at each team's end, with a sliding entrance on
each. Inside, three lanes run end to end: the grocery aisles down the middle (a cross aisle and chest freezers at
the centre), and along each side a front half (produce and the dairy wall, by the checkouts) and a back half (the
deli counter and a stockroom with a dock door onto the yard and a staff door onto the car park). Outside, a yard
with a delivery truck on one side of each end and a planted side strip with a fire exit on the other. Point-mirrored.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapkit import *

HX, HY, H, T, PI = 40, 28, 5.6, 0.4, math.pi
UP = 3.2                 # the offices over each stockroom
setup({
    'shell': ('plaster:store wall', 0xf0ece0), 'inner': ('flat:partition', 0xe9e9e4), 'brick': ('brick:brick base', 0xd8c8b8), 'fascia': ('paint:green fascia', 0x2f7a4e), 'stripe': ('paint:fascia stripe', 0xf2e8c8),
    'floor': ('storefloor:shop floor', 0xe9e5dc), 'slab': ('flat:back floor', 0xa6a6a1), 'lot': ('asphalt:car park', 0xd0d0d0), 'walk': ('flat:pavement', 0xb4b1a9), 'kerb': ('flat:kerb', 0xc2c0b8),
    'roof': ('metal:roof deck', 0xe4e6e8), 'truss': ('metal:truss', 0x9aa0a6), 'steel': ('metal:steel', 0xc4c8cc), 'rack': ('paint:racking', 0x2c5a9a), 'orange': ('paint:rack beam', 0xe07a1c),
    'gondola': ('flat:gondola', 0xdcdcd8), 'case': ('flat:case', 0xf2f2f0), 'cardboard': ('flat:cardboard', 0xb48c5a), 'counter': ('wood:counter', 0xc8a070), 'top': ('marble:counter top', 0xf0f0f0), 'tile': ('whitetile:wall tile', 0xffffff), 'belt': ('rubber:belt', 0x30302e),
    'wood': ('woodold:pallet', 0xd8c0a0), 'atlas': ('atlas:store', 0xffffff), 'glass': ('flat:glass', 0x9ab8c4), 'dark': ('flat:dark', 0x18181a), 'line': ('flat:paint line', 0xf0f0e8), 'yellow': ('flat:yellow paint', 0xe8c020),
    'green': ('paint:dumpster', 0x2c5a40), 'hedge': ('v_hedge:hedge', 0xf0f0f0), 'shadow': ('soft:shadow', 0x000000), 'pool': ('soft:floor light', 0xf0f4ff), 'warm': ('soft:lot light', 0xffe0b0), 'soil': ('dirt:soil', 0x8a7460), 'sign': ('flat:sign white', 0xf8f8f4), 'red': ('flat:sign red', 0xc8281e), 'fence': ('metal:fence', 0x8a9096),
    'frame': ('metal:door frame', 0x8a9096), 'cover': ('flat:cover', 0xc8731a), 'grass': ('v_grass:verge', 0xe0e8d8), 'road': ('asphalt:road', 0xb8b8b8), 'far a': ('flat:far building a', 0xc8b8a0), 'far b': ('flat:far building b', 0xa8b0b8), 'far c': ('flat:far building c', 0xb89888), 'far roof': ('flat:far building roof', 0x5a5450), 'far glass': ('flat:far building glass', 0x2a3640),
    'tread': ('flat:stair tread', 0x4c5054), 'carpet': ('flat:office carpet', 0x55606c), 'checker': ('checker:deli floor', 0xffffff), 'salami': ('flat:salami', 0x7a2420), 'fat': ('flat:fat', 0xf0e4d8), 'ham': ('flat:ham', 0xe08a8c), 'cheese': ('flat:cheese', 0xf0c850), 'rind': ('flat:rind', 0xc8501e), 'cheddar': ('flat:cheddar', 0xf09a30),
    'salad': ('flat:salad', 0x5a9a3c), 'slaw': ('flat:slaw', 0xf0e8c8), 'beet': ('flat:beet', 0x7a2450), 'pasta': ('flat:pasta', 0xf0d070), 'olive': ('flat:olive', 0x3a4a24), 'roast': ('flat:roast', 0xb86a24), 'crust': ('flat:crust', 0xc88a40), 'basket': ('flat:basket', 0xb08850), 'chalk': ('flat:chalkboard', 0x1c2420), 'chalky': ('flat:chalk yellow', 0xf0e090), 'gold': ('flat:gold', 0xd8b050),
    'firs': ('card:tree', 0xffffff), 'cut': ('cutout:greenery', 0x7c8a70), 'decal': ('decal:ground wear', 0xffffff), 'cart': ('metal:trolley', 0xd0d4d8),
    'tomato': ('flat:tomato', 0xc8322a), 'orange f': ('flat:orange', 0xe88a24), 'lemon': ('flat:lemon', 0xe8d040), 'apple': ('flat:apple', 0x78a838), 'plum': ('flat:plum', 0x5a2c58), 'melon': ('flat:melon', 0x3f7a3a),
}, emit={'lamp': 0xf4f8ff, 'glow': 0xdcecff, 'neon': 0x40e070, 'ember': 0xffa850}, emit_strength={'lamp': 3.0, 'glow': 1.6, 'neon': 3.0, 'ember': 2.6}, rough={'glass': 0.08, 'floor': 0.22, 'top': 0.3}, metal={'steel': 0.6, 'cart': 0.8, 'truss': 0.5}, default='shell',
   shade={'shell': 0xb8b4ac, 'inner': 0xb4b8b8, 'hedge': 0x4a5a44, 'tomato': 0x7a1c1c, 'orange f': 0x9a5418, 'lemon': 0x9a8a2a, 'apple': 0x4a6a24, 'plum': 0x32183a, 'melon': 0x1f4420, 'gondola': 0xa8a8a8, 'case': 0xb8bcc4, 'cardboard': 0x7a5c38})
use_atlas('mart'); rnd = random.Random(7); POOLS[0] = False   # (the light is baked: see the export at the foot)
SH = ('shelf_a', 'shelf_b', 'shelf_c', 'shelf_d', 'shelf_e')
SIDES = ((0, (0, -1)), (PI, (0, 1)), (PI / 2, (1, 0)), (-PI / 2, (-1, 0)))   # a face's yaw and the way it looks
def carton_stack(x, y, h=1.34, piece='cartons', mirror=True, name='pallet stack'):
    pool(x, y, 2.3, 2.3, 'shadow', mirror=mirror); box(name, x - 0.6, y - 0.6, x + 0.6, y + 0.6, 0, h, 'cardboard', surface='wood', mirror=mirror)
    for yaw, (dx, dy) in SIDES: facade(piece, x + dx * 0.61, y + dy * 0.61, 0, yaw, mirror=mirror)

# ---------- ground ----------
deco('car park', -HX, -HY, 0, HY, -0.05, 0.0, 'lot'); deco('shop floor', -23.6, -15.6, 0, 15.6, 0.0, 0.02, 'floor'); deco('stock floor', -23.6, 8, -11.2, 15.6, 0.02, 0.025, 'slab')
deco('pavement', -26.5, -16, -24, 16, 0.0, 0.12, 'walk'); collide(-26.5, -16, -24, 16, 0, 0.12, 'concrete')
for y in range(-12, 13, 3): deco('bay line', -37, y - 0.06, -32, y + 0.06, 0.0, 0.012, 'line')
deco('bay line', -32.06, -12, -31.94, 12, 0.0, 0.012, 'line')
for i in range(6): deco('crossing', -29.6, -11 + i * 0.8, -26.6, -10.6 + i * 0.8, 0.0, 0.012, 'line')
for k_, (x, y, w, d, a) in enumerate(((-34, -7, 2.5, 2, 0.3), (-30, 5, 6, 4, 1.2), (-35, 12, 3, 3, 2), (-12, 22, 5, 4, 0.5), (-28, -20, 5, 3, 0.2), (-20, 21, 3, 6, 1.6))): wear(k_ % 4, x, y, w, d, a)

# ---------- the shell ----------
wall_y('front wall', -24, -24 + T, -16, 16, H, [(-9, 4, 0, 2.7), (12, 1.6, 0, 2.3)])
wall_x('side wall', -16, -16 + T, -24 + T, 0, H, [(-8, 1.6, 0, 2.3)]); wall_x('yard wall', 16 - T, 16, -24 + T, 0, H, [(-17, 3.0, 0, 3.0)])
for x0, x1 in ((-24, -16.6), (-15.4, -8.6), (-7.4, -0.6)): box('roof', x0, -16, x1, 16, H, H + 0.25, 'roof')       # (gaps: skylights)
box('roof', -0.6, -16, 0.6, 16, H, H + 0.25, 'roof', mirror=False)
for x in (-16, -8): deco('skylight glass', x - 0.6, -15, x + 0.6, 15, H + 0.2, H + 0.23, 'glass'); deco('skylight bar', x - 0.6, -0.1, x + 0.6, 0.1, H, H + 0.25, 'truss')
for y in range(-12, 13, 4):
    deco('truss', -23.6, y - 0.08, 0, y + 0.08, H - 0.5, H - 0.38, 'truss'); deco('truss', -23.6, y - 0.06, 0, y + 0.06, H - 0.1, H, 'truss')
    for i in range(24): bar('truss web', (-23.6 + i, y, H - 0.44), (-23.1 + i, y, H - 0.05), 0.02, 'truss'); bar('truss web', (-23.1 + i, y, H - 0.05), (-22.6 + i, y, H - 0.44), 0.02, 'truss')
for x in range(-21, 0, 4):
    for y in (-13.5, -9.5, -5.5, -1.5, 2.5, 6.5, 10.5, 14): deco('light fitting', x - 0.75, y - 0.12, x + 0.75, y + 0.12, H - 0.72, H - 0.66, 'steel'); deco('tube', x - 0.7, y - 0.08, x + 0.7, y + 0.08, H - 0.76, H - 0.72, 'lamp'); pool(x, y, 4.2, 2.6, 'pool', 0.034)
# outside: brick base, fascia, a canopy over the entrance, the name, storefront glazing
for a, b in ((-16, -11), (-7, 11.2), (12.8, 16)): deco('brick base', -24.07, a, -24, b, 0, 1.0, 'brick'); deco('base cap', -24.1, a, -24, b, 1.0, 1.07, 'kerb')
deco('fascia', -24.12, -16.1, -24, 16.1, H - 1.3, H + 0.35, 'fascia'); deco('fascia stripe', -24.14, -16.1, -24, 16.1, H - 1.45, H - 1.3, 'stripe')
deco('side fascia', -24.1, -16.12, 0, -16, H - 0.9, H + 0.35, 'fascia'); deco('yard fascia', -24.1, 16, 0, 16.12, H - 0.9, H + 0.35, 'fascia')
text('FRESHWAY', -24.16, -3, H - 0.45, -PI / 2, 1.15, 'sign', mirror=True, depth=0.06); deco('sign leaf', -24.2, 3.3, -24.14, 4.3, H - 0.9, H + 0.0, 'neon')
box('canopy', -28, -12.5, -24, -5.5, 3.0, 3.25, 'fascia'); deco('canopy edge', -28.06, -12.56, -27.9, -5.44, 2.95, 3.3, 'stripe')
for y in (-12.2, -5.8): cyl('canopy post', -27.6, y, 0.12, 3.0, 0.08, 'steel', seg=8); collide(-27.7, y - 0.1, -27.5, y + 0.1, 0, 3, 'metal')
for y in (-4, -0.5, 3, 6.5): facade('storefront', -24.02, y, 1.07, -PI / 2)
for y, p in ((-13.6, 'poster_a'), (9.8, 'poster_b')): facade(p, -24.08, y, 1.35, -PI / 2)
for y in (-9, 12): deco('door lamp', -24.2, y - 0.3, -24.0, y + 0.3, 2.85, 2.95, 'lamp')
for x in (-21, -14, -3): facade('poster_c' if x == -14 else 'poster_a', x, -16.02, 1.5, 0); deco('wall light', x - 3.3, -16.12, x - 2.9, -16, 3.2, 3.35, 'lamp')
facade('rollup', -11, 16.02, 0, PI); facade('rollup', -6, 16.02, 0, PI)
for x in (-18.9, -15.1): box('dock bollard', x - 0.12, 16.5, x + 0.12, 16.74, 0, 1.0, 'yellow')

# ---------- inside: partitions ----------
wall_x('stock wall', 7.8, 8, -23.6, -11, H, [(-15, 2.0, 0, 2.5), (-20.2, 5.0, UP + 1.0, UP + 2.1)], 'inner'); wall_y('deli wall', -11.2, -11, 8, 15.6, H, [(12, 1.6, 0, 2.3), (9.6, 2.4, UP + 1.0, UP + 2.1)], 'inner')
wall_x('deli back', 13.6, 13.8, -11, 0, H, [(-1.4, 1.6, 0, 2.3)], 'tile')       # (the prep room behind the counter)
text('DELI  &  BAKERY', -5.6, 13.56, 3.6, 0, 0.5, 'fascia', mirror=True, depth=0.03)
# freezers along the stock wall, looking over the checkouts
for i in range(8): facade('freezer', -23.1 + i * 0.8, 7.19, 0, 0)
box('freezer bank', -23.6, 7.2, -16.9, 7.8, 0, 2.1, 'case'); deco('freezer top', -23.6, 7.1, -16.9, 7.8, 2.1, 2.5, 'fascia'); text('FROZEN', -20.2, 7.08, 2.3, 0, 0.26, 'sign', mirror=True, depth=0.02)
# the dairy wall along the side wall
for i in range(11): facade('cooler' if i % 2 else 'cooler_b', -22.9 + i * 1.2, -14.99, 0, PI)
box('dairy case', -23.5, -15.6, -10.3, -15.0, 0, 2.0, 'case'); deco('case canopy', -23.5, -15.6, -10.3, -14.7, 2.0, 2.25, 'case'); deco('case glow', -23.4, -15.0, -10.4, -14.75, 1.97, 2.0, 'glow')
text('DAIRY', -16.9, -14.68, 2.12, PI, 0.2, 'fascia', mirror=True, depth=0.02)

# ---------- the grocery aisles ----------
for n, y in enumerate((-5, -1.7, 1.7, 5)):
    pool(-8.4, y, 11.6, 2.3, 'shadow'); box('gondola', -13.2, y - 0.45, -3.6, y + 0.45, 0, 2.0, 'gondola'); deco('gondola top', -13.25, y - 0.5, -3.55, y + 0.5, 2.0, 2.06, 'gondola')
    for i in range(8):
        facade(SH[(i + n) % 5], -12.6 + i * 1.2, y - 0.46, 0, 0); facade(SH[(i + n + 2) % 5], -12.6 + i * 1.2, y + 0.46, 0, PI)
    for x, yaw, o in ((-13.7, -PI / 2, -0.26), (-3.1, PI / 2, 0.26)):   # end caps
        box('end cap', x - 0.25, y - 0.6, x + 0.25, y + 0.6, 0, 2.0, 'gondola'); facade(SH[(n * 2 + (1 if o > 0 else 0)) % 5], x + o, y, 0, yaw)
    if n < 3:   # a sign hung over each aisle
        ym = y + 1.65; deco('aisle sign', -8.9, ym - 0.03, -7.9, ym + 0.03, 3.0, 3.5, 'fascia')
        for sx in (-8.7, -8.1): bar('sign hanger', (sx, ym, 3.5), (sx, ym, H - 0.4), 0.008, 'steel')
        text(str(n + 1), -8.4, ym - 0.035, 3.25, 0, 0.34, 'sign', mirror=True, depth=0.01); text(str(n + 1), -8.4, ym + 0.035, 3.25, PI, 0.34, 'sign', mirror=True, depth=0.01)
# the cross aisle: chest freezers either side of a promo stack at the very middle
carton_stack(0, 0, 1.5, 'cartons_b', mirror=False, name='promo stack')
pool(0, 4.7, 3.0, 4.0, 'shadow'); pool(0, 0, 2.4, 2.4, 'shadow', mirror=False); box('chest freezer', -1.0, 3.2, 1.0, 6.2, 0, 0.9, 'case'); deco('chest rim', -1.04, 3.16, 1.04, 6.24, 0.9, 0.96, 'steel'); deco('chest glow', -0.85, 3.35, 0.85, 6.05, 0.97, 0.975, 'glow')
for i in range(5): deco('frozen box', -0.7 + (i % 2) * 0.75, 3.5 + i * 0.5, -0.1 + (i % 2) * 0.75, 3.9 + i * 0.5, 0.93, 0.99, ('tomato', 'apple', 'lemon', 'plum', 'orange f')[i])

# ---------- produce (the front half of the side lane) ----------
FRUIT = {'apple': ('food_apple_01', 0), 'pomegranate': ('food_pomegranate_01', 0), 'lemon': ('lemon', 0.05), 'lime': ('food_lime_01', 0), 'avocado': ('food_avocado_01', 0), 'onion': ('yellow_onion', 0), 'potato': ('sweet_potato', 0.05), 'pear': ('food_pears_asian_01', 0)}
def fruit(kind, x, y, z, k=1.7):
    name, lift = FRUIT[kind]; prop(name, x, y, z + lift * k, rnd.uniform(0, 2 * PI), k * rnd.uniform(0.9, 1.1))
def heap(x0, y0, x1, y1, z, kinds):
    """A produce table's load: a bay of each kind, the fruit laid in rows with a second, looser layer heaped on top."""
    n = len(kinds); bw = (x1 - x0) / n
    for i, k in enumerate(kinds):
        a, b = x0 + i * bw + 0.03, x0 + (i + 1) * bw - 0.03; deco('produce bed', a, y0, b, y1, z, z + 0.08, 'dark'); deco('bay divider', b, y0, b + 0.06, y1, z, z + 0.2, 'counter')
        step = 0.3 if k == 'pear' else 0.2; nx, ny = max(1, int((b - a) / step)), int((y1 - y0) / step)
        for ix in range(nx):
            for iy in range(ny):
                fruit(k, a + (ix + 0.5) * (b - a) / nx + rnd.uniform(-0.02, 0.02), y0 + (iy + 0.5) * (y1 - y0) / ny + rnd.uniform(-0.02, 0.02), z + 0.08)
                if k != 'pear' and (ix + iy) % 3 == 0 and 0 < iy < ny - 1: fruit(k, a + (ix + 0.5) * (b - a) / nx + 0.08, y0 + (iy + 0.5) * (y1 - y0) / ny + 0.08, z + 0.2)
for x in (-12.5, -7.2):
    pool(x, -11.6, 5.0, 3.2, 'shadow'); box('produce table', x - 1.9, -12.6, x + 1.9, -10.6, 0, 0.85, 'counter', surface='wood'); deco('table skirt', x - 1.95, -12.65, x + 1.95, -10.55, 0.1, 0.3, 'fascia')
    heap(x - 1.8, -12.5, x + 1.8, -10.7, 0.85, ('apple', 'lemon', 'pomegranate', 'lime', 'pear') if x < -10 else ('avocado', 'onion', 'apple', 'potato', 'lemon'))
    deco('price board', x - 0.5, -11.62, x + 0.5, -11.58, 1.25, 1.6, 'sign'); bar('board post', (x, -11.6, 0.85), (x, -11.6, 1.25), 0.012, 'steel')
facade('poster_c', -4.5, -15.58, 1.3, PI); prop('potted_plant_04', -3.6, -14.6, 0, 0.4, 1.3, solid=(0.6, 0.6, 1.2, True)); prop('WetFloorSign_01', -5.6, -8.6, 0.02, 0.6, 1.0)

# ---------- checkouts (inside the entrance) ----------
for y in (-4.4, -1.6, 1.2, 4.0):
    pool(-19.0, y + 0.15, 4.0, 2.2, 'shadow'); box('checkout', -20.4, y - 0.35, -17.6, y + 0.35, 0, 0.92, 'gondola'); deco('belt', -20.3, y - 0.26, -18.6, y + 0.26, 0.92, 0.935, 'belt'); deco('scanner', -18.5, y - 0.26, -17.9, y + 0.26, 0.92, 0.94, 'steel')
    box('till', -18.2, y + 0.35, -17.6, y + 0.85, 0, 1.05, 'gondola'); deco('screen', -18.05, y + 0.5, -17.75, y + 0.56, 1.05, 1.42, 'dark'); deco('screen glow', -18.02, y + 0.495, -17.78, y + 0.5, 1.12, 1.38, 'glow')
    cyl('lane light pole', -17.75, y + 0.75, 1.05, 2.3, 0.02, 'steel', seg=6); deco('lane light', -17.9, y + 0.6, -17.6, y + 0.9, 2.3, 2.55, 'neon' if y != 1.2 else 'red'); deco('bag rack', -17.55, y - 0.3, -17.2, y + 0.3, 0.3, 0.85, 'steel')
    deco('sweet rack', -21.0, y - 0.3, -20.45, y + 0.3, 0, 1.25, 'gondola')
# trolleys nested by the door and in a corral in the car park (wire baskets drawn as frames)
def trolley(x, y):
    deco('trolley basket', x - 0.3, y - 0.45, x + 0.3, y + 0.4, 0.5, 0.56, 'cart')
    for q in range(5):
        z = 0.62 + q * 0.09
        for a, b in ((x - 0.3, x - 0.28), (x + 0.28, x + 0.3)): deco('trolley wire', a, y - 0.45, b, y + 0.4, z, z + 0.015, 'cart')
        deco('trolley wire', x - 0.3, y - 0.45, x + 0.3, y - 0.43, z, z + 0.015, 'cart'); deco('trolley wire', x - 0.3, y + 0.38, x + 0.3, y + 0.4, z, z + 0.015, 'cart')
    deco('trolley handle', x - 0.32, y + 0.42, x + 0.32, y + 0.47, 1.0, 1.05, 'red')
    for sx in (-0.26, 0.26):
        bar('trolley leg', (x + sx, y + 0.4, 0.12), (x + sx, y + 0.44, 1.02), 0.012, 'cart'); bar('trolley frame', (x + sx, y - 0.4, 0.14), (x + sx, y + 0.4, 0.14), 0.012, 'cart')
        for sy in (-0.38, 0.36): cyl('castor', x + sx, y + sy, 0.02, 0.12, 0.05, 'dark', seg=6)
for i in range(5): trolley(-22.6, -13.8 + i * 0.32)
collide(-23.0, -14.3, -22.2, -12.0, 0.02, 1.05, 'metal', soft=1)
for i in range(4): trolley(-29.4, 2.2 + i * 0.32)
for y in (1.6, 4.0):
    for z in (0.5, 1.1): bar('corral rail', (-30.0, y, z), (-28.8, y, z), 0.025, 'steel')
    for x in (-30.0, -28.8): bar('corral post', (x, y, 0), (x, y, 1.1), 0.03, 'steel')
collide(-30.05, 1.5, -28.75, 4.1, 0, 1.1, 'metal', soft=1); deco('corral sign', -29.9, 2.75, -28.9, 2.8, 1.5, 1.9, 'fascia'); bar('corral sign post', (-29.4, 2.78, 0), (-29.4, 2.78, 1.5), 0.02, 'steel')

# ---------- filling the floor: a fifth aisle run, island shelving, bakery tables, bins, a kiosk, banners ----------
pool(-8.4, -8.3, 11.6, 2.3, 'shadow'); box('gondola', -13.2, -8.75, -3.6, -7.85, 0, 2.0, 'gondola'); deco('gondola top', -13.25, -8.8, -3.55, -7.8, 2.0, 2.06, 'gondola')
for i in range(8): facade(SH[(i + 3) % 5], -12.6 + i * 1.2, -8.76, 0, 0); facade(SH[(i + 1) % 5], -12.6 + i * 1.2, -7.84, 0, PI)
for x, yaw, o in ((-13.7, -PI / 2, -0.26), (-3.1, PI / 2, 0.26)): box('end cap', x - 0.25, -8.9, x + 0.25, -7.7, 0, 2.0, 'gondola'); facade(SH[2 if o > 0 else 4], x + o, -8.3, 0, yaw)
box('island shelving', -0.45, 8.2, 0.45, 10.6, 0, 2.0, 'gondola'); deco('gondola top', -0.5, 8.15, 0.5, 10.65, 2.0, 2.06, 'gondola')     # in the cross aisle, by the deli
for i in range(2): facade(SH[i], 0.46, 8.8 + i * 1.2, 0, PI / 2); facade(SH[i + 2], -0.46, 8.8 + i * 1.2, 0, -PI / 2)
def bin_(x, y, kinds, s=0.45):
    """A promo bin: a low cardboard dump bin heaped with one thing, a price card over it."""
    box('promo bin', x - s, y - s, x + s, y + s, 0, 0.8, 'cardboard', surface='wood'); deco('bin band', x - s - 0.01, y - s - 0.01, x + s + 0.01, y + s + 0.01, 0.45, 0.7, kinds[0])
    deco('bin bed', x - s + 0.04, y - s + 0.04, x + s - 0.04, y + s - 0.04, 0.74, 0.8, 'dark')
    for i in range(16): fruit(kinds[1], x - 0.3 + (i % 4) * 0.2, y - 0.3 + (i // 4) * 0.2, 0.8)
    for i in range(5): fruit(kinds[1], x - 0.2 + (i % 3) * 0.2, y - 0.15 + (i // 3) * 0.25, 0.92)
    bar('price post', (x, y, 0.8), (x, y, 1.45), 0.012, 'steel'); deco('price card', x - 0.25, y - 0.015, x + 0.25, y + 0.015, 1.45, 1.8, 'yellow')
for (x, y), k in (((-15.5, -3.35), ('orange f', 'lemon')), ((-15.5, 0), ('tomato', 'apple')), ((-15.5, 3.35), ('melon', 'lime')), ((-18.6, -8.0), ('plum', 'pomegranate')), ((-1.9, -12.9), ('lemon', 'onion'))): bin_(x, y, k)
for x in (-9.5, -5.5):   # bakery tables in front of the deli
    box('bakery table', x - 1.2, 7.1, x + 1.2, 7.9, 0, 0.85, 'counter', surface='wood'); deco('table shelf', x - 1.1, 7.3, x + 1.1, 7.7, 0.85, 1.15, 'counter')
    for i in range(7): prop('croissant', x - 1.0 + i * 0.33, 7.22, 0.85, rnd.uniform(-0.5, 0.5), 1.5); prop('hamburger_buns', x - 0.96 + i * 0.32, 7.5, 1.15, PI / 2 + rnd.uniform(-0.2, 0.2), 0.75)
    deco('table sign', x - 0.4, 7.48, x + 0.4, 7.52, 1.45, 1.75, 'fascia'); bar('sign post', (x, 7.5, 1.15), (x, 7.5, 1.45), 0.012, 'steel')
carton_stack(-18.2, -12.6, 1.34); carton_stack(-2.0, 13.0 - 5.5, 1.0, 'cartons_b'); carton_stack(-20.6, 6.2, 1.0, 'cartons_b')
box('kiosk', -23.5, -6.4, -22.6, -5.0, 0, 1.15, 'gondola'); deco('kiosk top', -23.55, -6.45, -22.55, -4.95, 1.15, 1.2, 'top'); deco('kiosk screen', -23.3, -5.9, -23.2, -5.5, 1.2, 1.6, 'dark'); facade('poster_b', -23.58, -5.7, 1.5, PI / 2)
prop('wine_barrel_01', -16.6, -13.6, 0.02, 0.4, 1.0, solid=(0.8, 0.8, 0.95, False)); prop('wine_barrel_01', -15.7, -13.9, 0.02, 1.3, 1.0, solid=(0.8, 0.8, 0.95, False)); prop('wooden_crate_02', -20.6, -9.6, 0.02, 0.3, 1.0, solid=(0.9, 0.9, 0.8, False)); prop('potted_plant_04', -22.9, -7.4, 0.02, 0.8, 1.2, solid=(0.5, 0.5, 1.1, True))
for (x, y, w, yaw), (top, col) in zip(((-16.0, -9.0, 2.6, PI / 2), (-1.0, -9.5, 2.6, 0), (-16.0, 6.4, 2.6, PI / 2), (-6.0, 8.6, 3.0, 0), (-8.4, -6.5, 2.4, 0)), (('FRESH PRODUCE', 'fascia'), ('WEEKLY DEALS', 'red'), ('FROZEN', 'rack'), ('BAKERY', 'orange'), ('PANTRY', 'fascia'))):
    dx, dy = (w / 2, 0.02) if yaw == 0 else (0.02, w / 2)   # banners hung from the trusses
    deco('banner', x - dx, y - dy, x + dx, y + dy, 3.4, 4.3, col)
    for e in (-0.9, 0.9): bar('banner wire', (x + (e * w / 2.2 if yaw == 0 else 0), y + (0 if yaw == 0 else e * w / 2.2), 4.3), (x + (e * w / 2.2 if yaw == 0 else 0), y + (0 if yaw == 0 else e * w / 2.2), H - 0.4), 0.006, 'steel')
    for sgn in (-1, 1): text(top, x + (0 if yaw == 0 else sgn * 0.03), y + (sgn * -0.03 if yaw == 0 else 0), 3.85, (0 if sgn > 0 else PI) if yaw == 0 else (PI / 2 if sgn > 0 else -PI / 2), 0.26 if len(top) > 8 else 0.4, 'sign', mirror=True, depth=0.01)
# outside: more cars, bollards along the pavement, bins and a bike rack
vehicle('sedan', -36.6, -2.45, -32.4, -0.55, 1.4, PI); vehicle('van', -36.8, -11.6, -32.2, -9.4, 2.3, 0); vehicle('sedan', -30.2, 8.0, -28.3, 12.2, 1.4, PI / 2); vehicle('sedan', -30.2, -19.2, -26.0, -17.3, 1.4, 0)
for y in [q for q in range(-15, 16, 2) if not -13 < q < -5 and not 10 < q < 14]: box('bollard', -26.42, y - 0.1, -26.22, y + 0.1, 0.12, 1.0, 'yellow')
for y in (-4.2, 8.6): box('litter bin', -25.0, y - 0.3, -24.4, y + 0.3, 0.12, 1.05, 'green', surface='metal'); deco('bin lid', -25.03, y - 0.33, -24.37, y + 0.33, 1.05, 1.1, 'dark')
for i in range(4):   # (north of the staff door, clear of it)
    y = 13.9 + i * 0.55
    for x in (-25.6, -24.9): bar('bike hoop', (x, y, 0.12), (x, y, 0.95), 0.025, 'steel')
    bar('bike hoop', (-25.6, y, 0.95), (-24.9, y, 0.95), 0.025, 'steel')
collide(-25.7, 13.8, -24.8, 15.7, 0.12, 0.95, 'metal', soft=1)
for x, y in ((-34, 20), (-36, 23.5), (-33, -22.5), (-12, -26)): carton_stack(x, y, 1.3, 'cartons_b', name='yard pallet')
box('skip', -37.5, -25.5, -33.5, -23.5, 0, 1.5, 'rack', surface='metal'); deco('skip rim', -37.6, -25.6, -33.4, -23.4, 1.5, 1.6, 'dark')

# ---------- deli counter and prep room ----------
pool(-6.4, 10.0, 8.6, 2.0, 'shadow'); pool(-16.9, -14.6, 14.4, 2.6, 'shadow'); pool(-20.2, 7.0, 7.6, 2.2, 'shadow'); deco('deli floor', -11, 8.0, -0.5, 13.6, 0.02, 0.03, 'checker'); deco('prep floor', -11, 13.8, -0.02, 15.6, 0.02, 0.03, 'checker')
# the counter: a long front run with a glazed, lit case over it, and a return for the till
box('deli counter', -10.4, 9.6, -3.0, 10.5, 0, 0.95, 'counter', surface='wood'); box('deli counter', -3.0, 9.6, -2.1, 12.0, 0, 0.95, 'counter', surface='wood')
deco('counter plinth', -10.45, 9.55, -2.05, 9.6, 0, 0.14, 'fascia'); deco('counter band', -10.45, 9.57, -2.05, 9.6, 0.78, 0.9, 'fascia'); deco('counter top', -10.45, 9.55, -2.05, 10.55, 0.95, 1.0, 'top'); deco('counter top', -3.05, 10.55, -2.05, 12.05, 0.95, 1.0, 'top')
deco('case deck', -10.3, 9.68, -3.1, 10.3, 1.0, 1.03, 'steel'); slab('case glass', -6.7, 9.7, 1.24, 7.2, 0.012, 0.5, (0.32, 0, 0), 'glass'); deco('case top', -10.3, 9.78, -3.1, 10.3, 1.46, 1.49, 'steel'); deco('case glow', -10.2, 9.86, -3.2, 9.9, 1.43, 1.46, 'glow')
for x in (-10.3, -8.45, -6.6, -4.75, -3.12): deco('case end', x, 9.68, x + 0.02, 10.3, 1.03, 1.46, 'glass')
for i in range(15): x = -10.1 + i * 0.48; deco('price card', x, 9.69, x + 0.14, 9.7, 1.035, 1.11, 'yellow' if i % 4 else 'sign')
# meats
for i, (x, y, L, r) in enumerate(((-10.0, 9.85, 0.5, 0.05), (-10.0, 10.02, 0.45, 0.055), (-9.35, 9.83, 0.4, 0.045), (-9.3, 10.1, 0.55, 0.06), (-8.75, 9.9, 0.2, 0.05))):
    cyl('salami', x + L / 2, y, 1.03 + r - L / 2, 1.03 + r + L / 2, r, 'salami', seg=10, rot=(0, PI / 2, 0)); cyl('salami end', x + L + 0.004, y, 1.03 + r - 0.004, 1.03 + r + 0.004, r * 0.92, 'fat', seg=10, rot=(0, PI / 2, 0))
for x, y in ((-9.75, 10.2), (-8.95, 10.15), (-8.7, 10.18)): ico('ham', x, y, 1.12, 0.17, 0.12, 0.1, 'ham', sub=1); deco('ham board', x - 0.2, y - 0.14, x + 0.2, y + 0.14, 1.03, 1.045, 'counter')
for i in range(8): cyl('sausage', -9.65 + (i % 4) * 0.07, 9.84 + (i // 4) * 0.02, 1.05 + (i // 4) * 0.04, 1.09 + (i // 4) * 0.04, 0.018, 'roast', seg=6, rot=(PI / 2, 0, 0.3))
# cheese
for i, (x, y, r, h, k) in enumerate(((-8.1, 9.95, 0.17, 0.11, 'cheese'), (-7.65, 10.1, 0.14, 0.09, 'cheddar'), (-7.25, 9.9, 0.12, 0.14, 'rind'), (-6.9, 10.12, 0.15, 0.08, 'cheese'), (-8.05, 10.2, 0.09, 0.07, 'slaw'))):
    cyl('cheese wheel', x, y, 1.03, 1.03 + h, r, k, seg=16); cyl('cheese rind', x, y, 1.03, 1.03 + h * 0.96, r + 0.004, 'rind' if k != 'rind' else 'salami', seg=16); cyl('cheese face', x, y, 1.03 + h * 0.96, 1.03 + h + 0.002, r * 0.97, k if k != 'rind' else 'cheese', seg=16)
for i in range(5): slab('cheese wedge', -7.75 + i * 0.2, 9.82, 1.07, 0.14, 0.09, 0.07, (0, 0, 0.5 + i * 0.3), ('cheddar', 'cheese', 'slaw')[i % 3])
# salads in steel pans
for i in range(6):
    x, y = -6.45 + (i % 3) * 0.55, 9.8 + (i // 3) * 0.27
    deco('salad pan', x, y, x + 0.5, y + 0.24, 1.03, 1.1, 'steel'); deco('salad', x + 0.02, y + 0.02, x + 0.48, y + 0.22, 1.09, 1.12, ('salad', 'slaw', 'beet', 'pasta', 'tomato', 'olive')[i])
    for q in range(6): ico('salad heap', x + 0.08 + (q % 3) * 0.16, y + 0.07 + (q // 3) * 0.1, 1.125, 0.07, 0.05, 0.025, ('salad', 'slaw', 'beet', 'pasta', 'tomato', 'olive')[i], sub=1)
# cakes and pastries
for i in range(6):
    x, y = -4.5 + (i % 3) * 0.5, 9.85 + (i // 3) * 0.28
    cyl('cake plate', x, y, 1.03, 1.045, 0.15, 'case', seg=16); prop('carrot_cake' if (i + i // 3) % 2 else 'strawberry_chocolate_cake', x, y, 1.045, i * 0.7, 1.15)
# on top of the case and the counter
for i, x in enumerate((-9.6, -7.6, -5.6)):
    prop('wicker_basket_01', x, 10.05, 1.49, 0.1 * i, 1.25)
    for q in range(5): prop('croissant' if i != 1 else 'hamburger_buns', x - 0.14 + (q % 3) * 0.14, 10.0 + (q // 3) * 0.1, 1.56 + 0.03 * (q // 3), rnd.uniform(0, 3), 1.1 if i != 1 else 0.5)
cyl('cake stand', -3.9, 10.05, 1.49, 1.66, 0.03, 'steel', seg=8); cyl('cake stand top', -3.9, 10.05, 1.66, 1.68, 0.2, 'case', seg=18); prop('strawberry_chocolate_cake', -3.9, 10.05, 1.68, 0.4, 1.3)
cyl('ticket dispenser', -8.6, 9.68, 1.5, 1.72, 0.06, 'red', seg=10); cyl('ticket post', -8.6, 9.68, 1.49, 1.5, 0.08, 'steel', seg=10)
box('till', -2.85, 10.9, -2.3, 11.4, 1.0, 1.18, 'dark'); deco('till screen', -2.75, 11.0, -2.4, 11.04, 1.18, 1.5, 'dark'); deco('till glow', -2.72, 10.995, -2.43, 11.0, 1.22, 1.46, 'glow'); prop('wine_bottles_01', -2.9, 11.75, 1.0, PI / 2, 1.0); prop('ph_jug', -2.5, 10.7, 1.0, 1.0, 1.0)
for i in range(5): deco('paper bags', -2.85, 9.75 + i * 0.012, -2.55, 9.76 + i * 0.012, 1.0, 1.32, 'cardboard')
for y in (10.8, 11.5): prop('metal_stool_01', -1.78, y, 0.02, 0.3, 0.85, solid=(0.35, 0.35, 0.75, True))
# the back wall: bread shelves, the deck oven, a rotisserie, the coffee machine, salamis on a rail
box('back counter', -10.8, 12.9, -6.1, 13.6, 0, 0.95, 'steel', surface='metal'); deco('back counter top', -10.82, 12.86, -6.08, 13.6, 0.95, 0.98, 'top')
for i, z in enumerate((1.5, 1.95, 2.4)):   # bread wall
    slab('bread shelf', -8.15, 13.38, z, 3.9, 0.42, 0.03, (-0.3, 0, 0), 'counter'); deco('shelf lip', -10.1, 13.17, -6.2, 13.2, z - 0.08, z - 0.01, 'counter')
    for q in range(9):
        x = -9.9 + q * 0.44
        if (q + i) % 3 == 0: ico('loaf', x, 13.38, z + 0.09, 0.19, 0.1, 0.085, 'crust', sub=1); ico('loaf flour', x, 13.38, z + 0.15, 0.13, 0.05, 0.03, 'slaw', sub=1)
        elif (q + i) % 3 == 1: prop('hamburger_buns', x, 13.38, z + 0.02, PI / 2 + rnd.uniform(-0.2, 0.2), (0.75, 0.75, 0.9))
        else:
            for b_ in range(3): ico('baguette', x - 0.1 + b_ * 0.1, 13.38, z + 0.07, 0.04, 0.19, 0.04, 'crust', sub=1, rot=(0.3, 0, rnd.uniform(-0.15, 0.15)))
box('deck oven', -5.9, 12.75, -3.9, 13.6, 0, 2.0, 'steel', surface='metal'); deco('oven plinth', -5.92, 12.73, -3.88, 12.75, 0, 0.3, 'dark'); deco('oven flue', -5.2, 13.1, -4.6, 13.55, 2.0, H - 0.3, 'steel')
for i, z in enumerate((0.4, 0.95, 1.5)):
    deco('oven door', -5.75, 12.72, -4.4, 12.75, z, z + 0.42, 'dark'); deco('oven window', -5.6, 12.715, -4.55, 12.72, z + 0.08, z + 0.34, 'ember'); bar('oven handle', (-5.7, 12.68, z + 0.44), (-4.45, 12.68, z + 0.44), 0.014, 'steel')
    for q in range(3): cyl('oven knob', -4.2 + q * 0.1, 12.74, z + 0.2, z + 0.24, 0.025, 'dark', seg=8, rot=(PI / 2, 0, 0))
    deco('oven lamp', -4.25, 12.745, -4.0, 12.75, z + 0.32, z + 0.36, 'neon' if i else 'ember')
box('rotisserie', -10.6, 13.0, -9.5, 13.55, 0.98, 1.8, 'steel', surface='metal'); deco('rotisserie glow', -10.52, 12.99, -9.58, 13.0, 1.06, 1.72, 'ember'); deco('rotisserie frame', -10.62, 12.97, -9.48, 12.99, 0.98, 1.06, 'dark'); deco('rotisserie frame', -10.62, 12.97, -9.48, 12.99, 1.72, 1.8, 'dark')
for z in (1.25, 1.55):
    bar('spit', (-10.5, 12.95, z), (-9.6, 12.95, z), 0.008, 'steel')
    for q in range(3): ico('roast chicken', -10.32 + q * 0.28, 12.95, z, 0.1, 0.075, 0.07, 'roast', sub=1)
prop('ph_espresso', -7.0, 13.25, 0.98, 0, 0.3); deco('slicer base', -8.5, 13.0, -8.0, 13.45, 0.98, 1.08, 'steel'); cyl('slicer blade', -8.25, 13.2, 1.08, 1.4, 0.16, 'steel', seg=18, rot=(PI / 2, 0, 0.3)); deco('scales', -9.2, 13.05, -8.75, 13.4, 0.98, 1.2, 'case'); deco('scales pan', -9.22, 13.03, -8.73, 13.42, 1.2, 1.22, 'steel')
for i in range(4): cyl('cup stack', -6.45, 13.1 + i * 0.1, 0.98, 1.2, 0.035, 'slaw', seg=8)
bar('salami rail', (-10.5, 12.55, 2.45), (-6.2, 12.55, 2.45), 0.015, 'steel')
for x in (-10.4, -8.3, -6.3): bar('rail hanger', (x, 12.55, 2.45), (x, 12.55, H - 0.4), 0.008, 'steel')
for i in range(13):
    x = -10.3 + i * 0.33; L = 0.3 + (i * 7 % 3) * 0.08
    if i % 5 == 2: ico('hanging ham', x, 12.55, 2.08, 0.1, 0.1, 0.2, 'ham', sub=1); bar('ham string', (x, 12.55, 2.26), (x, 12.55, 2.45), 0.004, 'slaw')
    else: cyl('hanging salami', x, 12.55, 2.36 - L, 2.36, 0.035 + (i % 2) * 0.008, 'salami' if i % 3 else 'roast', seg=8); bar('salami string', (x, 12.55, 2.36), (x, 12.55, 2.45), 0.004, 'slaw')
# the boards over it all, the canopy over the counter, pendant lamps
for i, (head, lines) in enumerate((('BAKERY', ('SOURDOUGH  4.50', 'BAGUETTE  2.20', 'CROISSANT  1.80')), ('DELI', ('SALAMI  2.90', 'ROAST HAM  2.40', 'CHICKEN  8.00')), ('CHEESE', ('CHEDDAR  1.70', 'GOUDA  2.10', 'BRIE  2.60')))):
    x = -9.6 + i * 3.1; deco('menu board', x - 1.4, 13.55, x + 1.4, 13.6, 2.75, 3.95, 'chalk'); deco('menu frame', x - 1.45, 13.57, x + 1.45, 13.6, 2.7, 4.0, 'counter')
    text(head, x, 13.54, 3.75, 0, 0.22, 'chalky', mirror=True, depth=0.006); deco('menu rule', x - 1.2, 13.545, x + 1.2, 13.55, 3.6, 3.615, 'chalky')
    for q, ln in enumerate(lines): text(ln, x, 13.54, 3.4 - q * 0.22, 0, 0.13, 'sign', mirror=True, depth=0.005)
box('canopy board', -10.6, 9.3, -2.0, 9.46, 2.75, 3.3, 'fascia', mirror=True); deco('canopy return', -2.16, 9.46, -2.0, 12.0, 2.75, 3.3, 'fascia'); deco('canopy trim', -10.62, 9.28, -1.98, 9.3, 3.3, 3.36, 'gold'); deco('canopy trim', -10.62, 9.28, -1.98, 9.3, 2.75, 2.79, 'gold')
for i in range(21): deco('valance', -10.6 + i * 0.41, 9.3, -10.6 + (i + 1) * 0.41, 9.32, 2.5 + (0.04 if i % 2 else 0), 2.75, 'stripe' if i % 2 else 'fascia')
text('DELICATESSEN', -8.3, 9.28, 3.03, 0, 0.3, 'gold', mirror=True, depth=0.02); text('BAKERY', -4.0, 9.28, 3.03, 0, 0.3, 'gold', mirror=True, depth=0.02); text('fresh every day', -6.2, 9.28, 2.9, 0, 0.11, 'stripe', mirror=True, depth=0.01)
for x in (-10.4, -6.3, -2.2): bar('canopy rod', (x, 9.38, 3.3), (x, 9.38, H - 0.4), 0.012, 'steel')
for x in (-9.3, -7.5, -5.7, -3.9):
    prop('hanging_industrial_lamp', x, 10.05, 3.55, x, 0.65); bar('lamp cord', (x, 10.05, 3.55), (x, 10.05, H - 0.4), 0.006, 'dark'); ico('lamp bulb', x, 10.05, 2.78, 0.06, 0.06, 0.07, 'ember', sub=1)
# the customer side: a baker's rack, the specials board, a cake table, baskets of baguettes
collide(-2.35, 8.25, -1.5, 9.0, 0, 1.8, 'metal')
for x in (-2.33, -1.54):
    for y in (8.27, 8.96): bar('rack post', (x, y, 0.08), (x, y, 1.8), 0.015, 'steel'); cyl('rack castor', x, y, 0.0, 0.08, 0.04, 'dark', seg=6)
for i in range(6):
    z = 0.3 + i * 0.27; deco('rack tray', -2.33, 8.27, -1.52, 8.98, z, z + 0.02, 'steel')
    for q in range(6): prop('hamburger_buns' if i % 2 else 'croissant', -2.15 + (q % 2) * 0.42, 8.4 + (q // 2) * 0.22, z + 0.02, PI / 2 + rnd.uniform(-0.3, 0.3), 0.55 if i % 2 else 1.1)
prop('standing_chalkboard_01', -10.3, 8.75, 0.02, 0.5, 0.85, solid=(0.7, 0.6, 1.2, True))
cyl('cake table', -4.0, 8.7, 0.72, 0.76, 0.5, 'counter', seg=20); cyl('cake table leg', -4.0, 8.7, 0, 0.72, 0.05, 'steel', seg=8); cyl('cake table foot', -4.0, 8.7, 0, 0.03, 0.3, 'steel', seg=14); collide(-4.45, 8.25, -3.55, 9.15, 0, 0.76, 'wood')
for i in range(5): a_ = i * 1.257; cyl('cake plate', -4.0 + math.cos(a_) * 0.3, 8.7 + math.sin(a_) * 0.3, 0.76, 0.775, 0.13, 'case', seg=14); prop('carrot_cake' if i % 2 else 'strawberry_chocolate_cake', -4.0 + math.cos(a_) * 0.3, 8.7 + math.sin(a_) * 0.3, 0.775, a_, 1.05)
for x in (-7.5, -6.9):
    cyl('baguette basket', x, 8.75, 0, 0.7, 0.2, 'basket', seg=12, r2=0.25); collide(x - 0.25, 8.5, x + 0.25, 9.0, 0, 0.9, 'wood', soft=1)
    for q in range(7): a_ = q * 0.9; ico('baguette', x + math.cos(a_) * 0.11, 8.75 + math.sin(a_) * 0.11, 0.78, 0.04, 0.04, 0.3, 'crust', sub=1, rot=(math.cos(a_) * 0.15, math.sin(a_) * 0.15, 0))
# the prep room behind
for i in range(5): ico('flour sack', -1.0 + (i % 2) * 0.5, 14.3 + (i // 2) * 0.4, 0.2 + (0.3 if i == 4 else 0), 0.3, 0.2, 0.17, 'slaw', sub=1)
for i in range(4): prop('cardboard_box_01', -2.6 + (i % 2) * 0.45, 15.2, 0.02 + (i // 2) * 0.34, 0.1 * i, 1.0)
for i in range(4): deco('dough tray', -9.3 + i * 0.9, 14.5, -8.6 + i * 0.9, 15.1, 0.9, 0.94, 'steel'); [ico('dough', -9.15 + i * 0.9 + (q % 2) * 0.35, 14.65 + (q // 2) * 0.3, 0.97, 0.11, 0.11, 0.05, 'slaw', sub=1) for q in range(4)]
box('prep table', -9.5, 14.4, -5.5, 15.2, 0, 0.9, 'steel', surface='metal'); box('prep fridge', -4.6, 14.7, -3.2, 15.6, 0, 2.0, 'steel', surface='metal'); prop('plastic_crate_02', -10.3, 14.6, 0.02, 0.2, 1.0); prop('plastic_crate_02', -10.3, 14.6, 0.34, 0.5, 1.0)

# ---------- stockroom ----------
def racking(x0, x1, y, top=4.2):
    for x in (x0, x1 - 0.08):
        for dy in (-0.5, 0.42): deco('rack upright', x, y + dy, x + 0.08, y + dy + 0.08, 0, top, 'rack')
    for z in [q for q in (1.4, 2.8, 4.1) if q < top]: deco('rack beam', x0, y - 0.5, x1, y - 0.42, z - 0.1, z, 'orange'); deco('rack beam', x0, y + 0.42, x1, y + 0.5, z - 0.1, z, 'orange'); deco('rack deck', x0, y - 0.5, x1, y + 0.5, z, z + 0.03, 'wood')
    n = int((x1 - x0) / 1.25)
    for z in [q for q in (0, 1.43, 2.83) if q + 1.25 < top]:
        for i in range(n):
            if (i + int(z)) % 4 == 3: continue
            cx = x0 + 0.15 + (i + 0.5) * (x1 - x0 - 0.3) / n; deco('pallet', cx - 0.58, y - 0.48, cx + 0.58, y + 0.48, z, z + 0.14, 'wood'); deco('load', cx - 0.56, y - 0.44, cx + 0.56, y + 0.44, z + 0.14, z + 1.2, 'cardboard')
            for sgn, yw in ((-1, 0), (1, PI)): facade('cartons' if (i % 2) else 'cartons_b', cx, y + sgn * 0.45, z, yw)
    collide(x0, y - 0.5, x1, y + 0.5, 0, top, 'wood'); pool((x0 + x1) / 2, y, x1 - x0 + 1.2, 2.4, 'shadow')
racking(-23.4, -19.6, 10.3, top=2.95); carton_stack(-22.2, 14.2)
# the offices upstairs: a floor over the stockroom, a stair up through it, windows over the shop and the deli
for x0, y0, x1, y1 in ((-23.6, 8, -19.4, 15.6), (-19.4, 8, -11.2, 12.6), (-19.4, 13.8, -11.2, 15.6), (-13, 12.6, -11.2, 13.8)): box('office floor', x0, y0, x1, y1, UP - 0.2, UP, 'slab')
NS, RUN = 20, 0.32
for i in range(NS):
    xa, xb, top = -13.0 - RUN * (i + 1), -13.0 - RUN * i, (i + 1) * UP / NS
    box('office stairs', xa, 12.6, xb, 13.8, 0, top, 'tread', surface='metal'); deco('nosing', xb - 0.05, 12.6, xb + 0.01, 13.8, top - 0.03, top + 0.005, 'yellow')
    for y in (12.56, 13.8): deco('stair side', xa, y, xb, y + 0.04, 0, top + 0.12, 'gondola')
for y in (12.58, 13.82):
    bar('stair rail', (-13.0, y, 1.05), (-19.4, y, UP + 1.05), 0.028, 'steel'); bar('stair rail', (-13.0, y, 0.55), (-19.4, y, UP + 0.55), 0.018, 'steel')
    for i in range(0, NS + 1, 4): x = -13.0 - RUN * i; bar('stair post', (x, y, i * UP / NS), (x, y, i * UP / NS + 1.05), 0.022, 'steel')
    bar('well rail', (-19.4, y, UP + 1.05), (-13, y, UP + 1.05), 0.028, 'steel'); bar('well rail', (-19.4, y, UP + 0.55), (-13, y, UP + 0.55), 0.018, 'steel'); deco('well kick', -19.4, y - 0.02, -13, y + 0.02, UP, UP + 0.12, 'tread')
    for x in (-17.3, -15.1, -13): bar('well post', (x, y, UP), (x, y, UP + 1.05), 0.022, 'steel')
    collide(-19.1, y - 0.05, -13, y + 0.05, UP, UP + 1.05, 'metal', soft=1)
bar('well rail', (-13, 12.58, UP + 1.05), (-13, 13.82, UP + 1.05), 0.028, 'steel'); bar('well rail', (-13, 12.58, UP + 0.55), (-13, 13.82, UP + 0.55), 0.018, 'steel'); collide(-13.05, 12.6, -12.95, 13.8, UP, UP + 1.05, 'metal', soft=1)
for x, y in ((-21, 9.6), (-21, 14.6), (-16, 10.2), (-16, 14.9), (-12.2, 10.4)): deco('stock light', x - 0.6, y - 0.08, x + 0.6, y + 0.08, UP - 0.27, UP - 0.2, 'lamp')
for x0, y0, x1, y1 in ((-23.6, 8, -19.4, 15.6), (-19.4, 8, -11.2, 12.56), (-19.4, 13.86, -11.2, 15.6), (-13, 12.56, -11.2, 13.86)): deco('carpet', x0, y0, x1, y1, UP, UP + 0.012, 'carpet')
def workplace(x, k):
    """A desk under the window over the shop: laptop, lamp, papers, a chair."""
    prop('metal_office_desk', x, 8.72, UP, 0, 1.0, solid=(2.0, 0.95, 0.8, False)); prop('classic_laptop', x - 0.15, 8.62, UP + 0.79, PI + rnd.uniform(-0.2, 0.2), 0.55); prop('desk_lamp_arm_01', x + 0.75, 8.45, UP + 0.84, 0.5, 0.6)
    prop('office_notepads', x - 0.65, 8.8, UP + 0.79, 0.2, 0.3); prop('clipboard' if k % 2 else 'binder_notebook', x + 0.45, 8.9, UP + 0.79, -0.4, 0.8 if k % 2 else 0.6); prop('modern_arm_chair_01', x + rnd.uniform(-0.2, 0.2), 9.75, UP, PI + rnd.uniform(-0.4, 0.4), 0.85, solid=(0.6, 0.6, 0.85, True))
for k, x in enumerate((-22.2, -18.6, -14.6)): workplace(x, k)
# the lounge corner, cabinets, the kitchenette, things on the walls
prop('sofa_03', -15.9, 15.05, UP, 0, 0.8, solid=(2.2, 0.75, 0.8, False)); prop('modern_coffee_table_01', -22.3, 11.6, UP, PI / 2, 0.9, solid=(1.0, 0.55, 0.38, True)); prop('office_notepads', -22.3, 11.6, UP + 0.36, 1.0, 0.25)
prop('modern_arm_chair_01', -23.05, 11.6, UP, -PI / 2, 0.9, solid=(0.6, 0.6, 0.85, True)); prop('modern_arm_chair_01', -22.3, 10.7, UP, PI, 0.9, solid=(0.6, 0.6, 0.85, True)); prop('potted_plant_04', -23.15, 10.5, UP, 0.3, 1.2)
prop('drawer_cabinet', -23.3, 14.2, UP - 0.22, PI / 2, 1.0, solid=(0.5, 1.15, 1.55, False)); prop('drawer_cabinet', -11.5, 11.45, UP - 0.22, -PI / 2, 1.0, solid=(0.5, 1.15, 1.55, False)); prop('wooden_bookshelf_worn', -11.55, 13.2, UP, -PI / 2, 0.85, solid=(0.5, 1.2, 1.75, False))
box('lockers', -22.9, 15.05, -20.3, 15.55, UP, UP + 1.9, 'rack', surface='metal')
for i in range(5): deco('locker door', -22.86 + i * 0.52, 15.03, -22.4 + i * 0.52, 15.05, UP + 0.06, UP + 1.86, 'rack'); deco('locker vent', -22.78 + i * 0.52, 15.02, -22.48 + i * 0.52, 15.03, UP + 1.5, UP + 1.7, 'dark'); deco('locker handle', -22.46 + i * 0.52, 15.0, -22.43 + i * 0.52, 15.03, UP + 0.95, UP + 1.1, 'steel')
for i, (x, y, yaw) in enumerate(((-19.9, 15.1, 0.2), (-19.8, 15.15, 1.4), (-20.0, 14.6, 0.9))): prop('cardboard_box_01', x, y, UP + (0.33 if i == 1 else 0), yaw, 1.0)
box('kitchenette', -13.2, 15.0, -11.3, 15.55, UP, UP + 0.9, 'gondola'); deco('kitchenette top', -13.25, 14.96, -11.25, 15.55, UP + 0.9, UP + 0.94, 'top'); prop('vintage_microwave', -12.75, 15.28, UP + 0.94, 0, 0.5); prop('vintage_electric_kettle', -12.0, 15.25, UP + 0.94, 0.6, 1.0); prop('ph_jug', -11.6, 15.25, UP + 0.94, 0.3, 1.0)
deco('sink', -12.35, 15.08, -11.85, 15.45, UP + 0.93, UP + 0.95, 'steel'); deco('wall cupboard', -13.2, 15.25, -11.3, 15.58, UP + 1.5, UP + 2.1, 'gondola')
prop('wall_clock', -17.5, 15.56, UP + 1.95, 0, 1.0); prop('dartboard', -14.0, 15.56, UP + 1.6, 0, 1.0); facade('poster_b', -18.9, 15.58, UP + 0.75, PI); facade('poster_c', -23.58, 12.0, UP + 0.8, PI / 2)
deco('whiteboard', -23.58, 8.9, -23.54, 10.1, UP + 0.95, UP + 1.95, 'sign'); deco('whiteboard frame', -23.6, 8.85, -23.56, 10.15, UP + 0.9, UP + 2.0, 'steel'); text('ROTA', -23.53, 9.5, UP + 1.75, PI / 2, 0.14, 'rack', mirror=True, depth=0.004)
for i in range(4): deco('rota line', -23.535, 9.0, -23.53, 9.0 + (0.9, 0.6, 1.0, 0.75)[i], UP + 1.5 - i * 0.14, UP + 1.52 - i * 0.14, 'dark')
prop('wooden_crate_02', -17.5, 9.2, 0.02, 0.3, 1.0, solid=(0.9, 0.9, 0.8, False))
prop('hand_truck', -12.2, 9.3, 0.02, 1.2, 1.0, solid=(0.6, 0.6, 1.2, True)); deco('hazard line', -18.6, 14.9, -15.4, 15.0, 0.025, 0.03, 'yellow')
for a, b in ((-23.6, -16.6), (-13.4, -11.2)): deco('stock stripe', a, 8.0, b, 8.02, 1.0, 1.15, 'yellow')

# ---------- the yard (behind the stockroom) and the side strip ----------
vehicle('boxtruck', -18.6, 19.9, -15.4, 27.1, 3.0, -PI / 2); vehicle('sedan', -36.6, -8.6, -32.4, -6.7, 1.4, 0); vehicle('van', -36.8, 3.3, -32.2, 5.5, 2.3, PI); vehicle('sedan', -36.6, 9.5, -32.4, 11.4, 1.4, 0)
for x0, x1 in ((-9.4, -6.6), (-5.8, -3.4)): box('dumpster', x0, 17.0, x1, 18.6, 0, 1.5, 'green', surface='metal'); deco('dumpster lid', x0 - 0.05, 16.95, x1 + 0.05, 18.65, 1.5, 1.58, 'dark')
for x, y in ((-24.5, 20.5), (-23.0, 24.0), (-11, 23.5)): carton_stack(x, y, 1.3, 'cartons_b', name='yard pallet')
prop('trashbag', -2.6, 17.3, 0, 0.4, 1.0); prop('trashbag', -2.0, 17.8, 0, 2.0, 1.0); prop('propane_tank', -26.2, 17.2, 0, 0.3, 1.0, solid=(0.5, 0.5, 1.2, False)); prop('security_light', -17, 16.1, 3.6, PI / 2, 1.0)
box('yard wall', -30, 19, -29.6, 26, 0, 2.2, 'brick'); deco('wall cap', -30.05, 18.95, -29.55, 26.05, 2.2, 2.28, 'kerb')
# planted islands in the car park and along the side strip: cover with hedges
for x0, y0, x1, y1 in ((-31.5, -1.2, -27.5, 1.2), (-38, -15.5, -31, -13.9), (-38, 13.9, -31, 15.5), (-22, -22, -14, -20.4), (-9, -24, -3, -22.4)):
    pool((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0 + 1.0, y1 - y0 + 1.0, 'shadow'); box('planter', x0, y0, x1, y1, 0, 0.45, 'kerb'); deco('planter soil', x0 + 0.12, y0 + 0.12, x1 - 0.12, y1 - 0.12, 0.45, 0.48, 'soil'); box('hedge', x0 + 0.25, y0 + 0.3, x1 - 0.25, y1 - 0.3, 0.45, 1.35, 'hedge', surface='dirt')
prop('painted_wooden_bench', -25.2, 2.0, 0.12, -PI / 2, 1.0, solid=(0.6, 1.6, 0.8, True)); prop('potted_plant_02', -25.3, -4.6, 0.12, 0, 1.4, solid=(0.6, 0.6, 1.0, True)); prop('potted_plant_02', -25.3, -13.4, 0.12, 1, 1.4, solid=(0.6, 0.6, 1.0, True))
for y in (-14, 0, 14):
    cyl('lot lamp', -31.9, y, 0, 6.5, 0.09, 'steel', seg=8); deco('lot lamp arm', -32.9, y - 0.05, -30.9, y + 0.05, 6.45, 6.55, 'steel'); collide(-32, y - 0.1, -31.8, y + 0.1, 0, 6.5, 'metal')
    pool(-31.9, y, 9, 7, 'warm', 0.02)
    for xa in (-33.2, -31.2): deco('lot lamp head', xa, y - 0.15, xa + 0.6, y + 0.15, 6.36, 6.46, 'lamp')
# the fence round it all, trees beyond
for x0, y0, x1, y1 in ((-HX, -HY, -HX + 0.1, HY), (-HX, HY - 0.1, 0, HY), (-HX, -HY, 0, -HY + 0.1)):
    box('fence', x0, y0, x1, y1, 0, 2.6, 'fence'); deco('fence base', x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05, 0, 0.4, 'kerb')
# beyond the fence: a verge, the road past each car park, a line of trees, and the neighbours, fading into the haze
deco('verge', -170, -150, 0, 150, -0.12, -0.06, 'grass'); deco('road', -52, -150, -44, 150, -0.06, -0.03, 'road'); deco('road kerb', -43.9, -150, -43.6, 150, -0.06, 0.1, 'kerb')
for y in range(-146, 150, 8): deco('road line', -48.1, y, -47.9, y + 3.5, -0.03, -0.02, 'line')
def far_building(x, y, w, d, h, k, floors):
    deco('far building', x - w / 2, y - d / 2, x + w / 2, y + d / 2, 0, h, k); deco('far roof', x - w / 2 - 0.4, y - d / 2 - 0.4, x + w / 2 + 0.4, y + d / 2 + 0.4, h, h + 0.5, 'far roof')
    for f in range(floors):
        z = 1.2 + f * (h - 1.0) / floors
        for sx in (-1, 1): deco('far windows', x + sx * w / 2 - 0.05, y - d / 2 + 1, x + sx * w / 2 + 0.05, y + d / 2 - 1, z, z + 1.3, 'far glass')
        for sy in (-1, 1): deco('far windows', x - w / 2 + 1, y + sy * d / 2 - 0.05, x + w / 2 - 1, y + sy * d / 2 + 0.05, z, z + 1.3, 'far glass')
for x, y, w, d, h, k, fl in ((-66, -30, 16, 30, 9, 'far a', 2), (-68, 14, 14, 22, 13, 'far b', 3), (-64, 52, 18, 20, 8, 'far c', 2), (-30, 50, 26, 14, 10, 'far b', 3), (-2, -52, 30, 16, 12, 'far a', 3), (-36, -48, 18, 14, 7, 'far c', 2), (-70, -70, 20, 20, 15, 'far b', 4), (-8, 56, 16, 14, 14, 'far c', 4)):
    far_building(x, y, w, d, h, k, fl)
for i in range(70):   # trees: a close line just past the fence and the road, a looser one behind
    t = i / 70 * 2 * PI; rx, ry = (HX + 4.5, HY + 4.5) if i % 2 else (HX + 16, HY + 13)
    x, y = math.cos(t) * rx * 1.25, math.sin(t) * ry * 1.25; x = max(-rx, min(rx, x)) + rnd.uniform(-1.5, 1.5); y = max(-ry, min(ry, y)) + rnd.uniform(-1.5, 1.5)
    if abs(abs(x) - 48) < 4.5: continue   # (not on the road)
    card(x, y, rnd.uniform(9, 15), i % 2)
for i in range(40):
    a = rnd.uniform(0, 2 * PI); d = rnd.uniform(62, 110); card(math.cos(a) * d, math.sin(a) * d * 0.85, rnd.uniform(12, 19), i % 2)

def stair(s):
    xs, zs = sorted((s * -19.4, s * -13.0)), sorted((s * -13.8, s * -12.6))
    return {'rect': [xs[0], zs[0], xs[1], zs[1]], 'climb': [[s * -12.4, 0, s * -13.2], [s * -13.1, 0.1, s * -13.2], [s * -16.2, UP / 2, s * -13.2], [s * -19.4, UP, s * -13.2], [s * -20.6, UP, s * -13.2]]}
export('mart', {
    'half': [HX, HY], 'roof': H,
    'upper': [{'y': UP, 'bounds': {'minX': -24, 'maxX': -11, 'minZ': -16, 'maxZ': -8}, 'portals': [stair(1)]}, {'y': UP, 'bounds': {'minX': 11, 'maxX': 24, 'minZ': 8, 'maxZ': 16}, 'portals': [stair(-1)]}],
    'spawns': [[37, z] for z in (-9, -7, -5, -3, -1, 1, 3, 5, 7, 9)],
    'pickups': [['health', 0, 0, 1.6], ['health', 0, 0, -1.6], ['ammo', -20, 0, -12], ['ammo', 20, 0, 12], ['ammo', -9.8, 0, 13.6], ['ammo', 9.8, 0, -13.6], ['health', -6, 0, -11.8], ['health', 6, 0, 11.8], ['ammo', -28, 0, -22], ['ammo', 28, 0, 22], ['health', -22, UP, -14.6], ['health', 22, UP, 14.6]],
}, bake=dict(size=int(os.environ.get('LM', 2048)), samples=int(os.environ.get('LMS', 24)), emit_k=4,
            only='wall|partition|floor|verge|road|carpet|tread|car park|pavement|kerb|roof deck|gondola|case|counter|tile|brick|fascia|pallet|cardboard|dumpster|hedge|soil|fence|store|belt|racking'))
