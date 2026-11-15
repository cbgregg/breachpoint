"""Tarsa Market: an old market town's square and streets, built as a Blender scene and exported for the game
(helpers: mapkit.py). A fresh layout for the map of that name; the earlier one is kept as 'Tarsa Market (classic)'.

    python3 tools/blender/tarsa.py            (needs Blender's Python module, bpy)

The covered market hall stands in the square in the middle. Market Street runs into the square from each team's end
(the middle lane), between a cafe block (walk-through, with a roof terrace up an alley stair) and an arcaded block
(a colonnade along the street, a passage through to the back). A back lane runs behind each row (the outer lanes),
joined to the square by alleys either side of a row of open-fronted shops. The plan is point-mirrored.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapkit import *

HX, HY = 36, 27
R = 3.8                  # the cafe block's roof terrace
PI = math.pi
STUCCO = {'ochre': 0xf0c078, 'terra': 0xe89870, 'cream': 0xf8ecd0, 'sage': 0xc4d4b0, 'rose': 0xf0c4b4, 'sky': 0xc8d8e4}
setup({
    **{k: ('v_stucco:' + k + ' stucco', c) for k, c in STUCCO.items()},
    'cobble': ('v_cobble:street', 0xe8e0d4), 'paving': ('v_paving:square', 0xf2ead8), 'plinth': ('v_paving:plinth', 0xb8ae9c), 'rooftile': ('v_rooftile:roof tiles', 0xf0e0d0),
    'timber': ('v_timber:timber', 0xc8a880), 'frame': ('flat:white trim', 0xf2eee4), 'glass': ('flat:glass', 0x1c2630), 'iron': ('flat:iron', 0x26292c), 'dark': ('flat:dark', 0x151514),
    'sh green': ('flat:green shutter', 0x3f6a52), 'sh blue': ('flat:blue shutter', 0x3d6088), 'sh red': ('flat:red shutter', 0x8a3a30),
    'aw red': ('cloth:red awning', 0xb03a30), 'aw cream': ('cloth:cream awning', 0xf0e4c8), 'aw green': ('cloth:green awning', 0x3f7a58), 'aw blue': ('cloth:blue awning', 0x3a66a0), 'aw gold': ('cloth:gold awning', 0xd8a838),
    'water': ('flat:water', 0x4aa8c0), 'hedge': ('flat:hedge', 0x4a7a3c), 'tomato': ('flat:tomato', 0xc8322a), 'orange': ('flat:orange', 0xe88a24), 'lemon': ('flat:lemon', 0xe8d040), 'apple': ('flat:apple', 0x78a838), 'plum': ('flat:plum', 0x5a2c58),
    'firs': ('card:tree', 0xffffff), 'cut': ('cutout:greenery', 0x7c8a70), 'decal': ('decal:ground wear', 0xffffff), 'cover': ('flat:cover', 0xc8731a), 'roofdeck': ('v_paving:roof terrace', 0xc8beac),
    'line': ('flat:paint', 0xe8e4d8), 'sign': ('flat:sign', 0x2a3a34), 'gold': ('flat:gold', 0xc8a040),
}, emit={'lamp': 0xffd9a0, 'bulb': 0xffc56e}, rough={'glass': 0.08, 'water': 0.06, 'iron': 0.5, 'gold': 0.35}, metal={'iron': 0.7, 'gold': 0.9}, default='cream',
   shade={**{k: 0xb4a8a0 for k in STUCCO}, 'frame': 0xb8b4c0, 'hedge': 0x2a4a2c, 'tomato': 0x7a1c1c, 'orange': 0x9a5418, 'lemon': 0x9a8a2a, 'apple': 0x4a6a24, 'plum': 0x32183a,
          'sh green': 0x243e30, 'sh blue': 0x243a54, 'sh red': 0x54221c, 'plinth': 0x8a8478})
rnd = random.Random(4)
SHUT = ('sh green', 'sh blue', 'sh red'); AWN = ('aw red', 'aw green', 'aw blue', 'aw gold')
NAMES = ['PANADERIA', 'FRUTAS', 'CAFE TARSA', 'MERCADO', 'FLORES', 'VINOS', 'QUESOS', 'TABACOS', 'LIBROS', 'FARMACIA']

def face(a0, a1, fixed, axis, out, z0, z1, shop=0, seed=0):
    """Dress a wall face: windows with shutters floor by floor, a balcony here and there, a cornice; shop fronts with
    awnings and signs on the ground floor when shop is set. The wall runs along `axis` ('x' or 'y') from a0 to a1 at
    the other coordinate `fixed`, and looks toward `out` (+1 or -1) on that other axis."""
    def at(a, d): return (a, fixed + out * d) if axis == 'x' else (fixed + out * d, a)
    def piece(name, a_lo, a_hi, d_lo, d_hi, zl, zh, k):
        (xa, ya), (xb, yb) = at(a_lo, d_lo), at(a_hi, d_hi); deco(name, min(xa, xb), min(ya, yb), max(xa, xb), max(ya, yb), zl, zh, k)
    n = max(1, round((a1 - a0) / 3.2)); bw = (a1 - a0) / n; gf = 3.5 if shop else 0.4
    piece('plinth', a0, a1, 0, 0.04, z0, z0 + 0.45, 'plinth')
    floors = int((z1 - z0 - gf - 0.6) / 3.0)
    for i in range(n):
        c = a0 + (i + 0.5) * bw; sh = SHUT[(i + seed) % 3]
        for f in range(floors):
            zb = z0 + gf + 0.9 + f * 3.0
            piece('window', c - 0.5, c + 0.5, 0, 0.03, zb, zb + 1.5, 'glass')
            for s in (-1, 1): piece('shutter', c + s * 0.5 if s > 0 else c - 0.95, c + 0.95 if s > 0 else c - 0.5, 0, 0.06, zb, zb + 1.5, sh)
            piece('sill', c - 0.62, c + 0.62, 0, 0.14, zb - 0.1, zb, 'frame'); piece('lintel', c - 0.6, c + 0.6, 0, 0.07, zb + 1.5, zb + 1.62, 'frame')
            if (i + f + seed) % 4 == 1:
                piece('balcony', c - 0.9, c + 0.9, 0, 0.7, zb - 0.22, zb - 0.1, 'frame')
                for t in range(7):
                    (x, y) = at(c - 0.85 + t * 0.283, 0.66); bar('balcony rail', (x, y, zb - 0.1), (x, y, zb + 0.75), 0.015, 'iron')
                (xa, ya), (xb, yb) = at(c - 0.88, 0.66), at(c + 0.88, 0.66); bar('balcony rail', (xa, ya, zb + 0.75), (xb, yb, zb + 0.75), 0.02, 'iron')
        if shop:
            aw = AWN[(i + seed) % 4]
            if i % 2 == 0: piece('shop door', c - 0.55, c + 0.55, 0, 0.05, z0, z0 + 2.2, 'timber'); piece('door glass', c - 0.4, c + 0.4, 0.05, 0.06, z0 + 1.0, z0 + 2.0, 'glass')
            else: piece('shop window', c - 1.15, c + 1.15, 0, 0.04, z0 + 0.7, z0 + 2.3, 'glass'); piece('shop sill', c - 1.25, c + 1.25, 0, 0.12, z0 + 0.55, z0 + 0.7, 'frame')
            (x, y) = at(c, 0.75); slab('awning', x, y, z0 + 2.75, bw - 0.5 if axis == 'x' else 1.6, 1.6 if axis == 'x' else bw - 0.5, 0.05, (out * 0.42, 0, 0) if axis == 'x' else (0, -out * 0.42, 0), aw)
            (x, y) = at(c, 1.45); deco('awning fringe', x - ((bw - 0.5) / 2 if axis == 'x' else 0.02), y - (0.02 if axis == 'x' else (bw - 0.5) / 2), x + ((bw - 0.5) / 2 if axis == 'x' else 0.02), y + (0.02 if axis == 'x' else (bw - 0.5) / 2), z0 + 2.2, z0 + 2.42, 'aw cream')
            if i % 2 == 1:
                piece('sign board', c - 1.2, c + 1.2, 0, 0.05, z0 + 3.0, z0 + 3.42, 'sign')
                (x, y) = at(c, 0.06); text(NAMES[(i + seed) % len(NAMES)], x, y, z0 + 3.2, {('x', -1): 0, ('x', 1): PI, ('y', 1): PI / 2, ('y', -1): -PI / 2}[(axis, out)], 0.26, 'gold', mirror=True, depth=0.01)
    piece('cornice', a0 - 0.15, a1 + 0.15, 0, 0.28, z1 - 0.3, z1, 'frame')
def gable(x0, y0, x1, y1, z, along_x=True, rise=1.6):
    """A tiled pitched roof over a rectangle: two slopes to a ridge along the long way."""
    over = 0.45
    if along_x:
        hw = (y1 - y0) / 2 + over; a = math.atan2(rise, hw); L = math.hypot(hw, rise)
        for s in (-1, 1): slab('roof', (x0 + x1) / 2, (y0 + y1) / 2 + s * hw / 2, z + rise / 2, x1 - x0 + 2 * over, L, 0.14, (-s * a, 0, 0), 'rooftile')
        for x in (x0 - over, x1 + over - 0.1): tri('gable end', ((x, y0, z), (x, y1, z), (x, (y0 + y1) / 2, z + rise)), 'cream')
    else:
        hw = (x1 - x0) / 2 + over; a = math.atan2(rise, hw); L = math.hypot(hw, rise)
        for s in (-1, 1): slab('roof', (x0 + x1) / 2 + s * hw / 2, (y0 + y1) / 2, z + rise / 2, L, y1 - y0 + 2 * over, 0.14, (0, s * a, 0), 'rooftile')
        for y in (y0 - over, y1 + over - 0.1): tri('gable end', ((x0, y, z), (x1, y, z), ((x0 + x1) / 2, y, z + rise)), 'cream')
def produce(x0, y0, x1, y1, z, kinds):
    """Crates of fruit and vegetables on a counter."""
    n = max(1, int((x1 - x0) / 0.62)); m = max(1, int((y1 - y0) / 0.5))
    for i in range(n):
        for j in range(m):
            cx, cy = x0 + (i + 0.5) * (x1 - x0) / n, y0 + (j + 0.5) * (y1 - y0) / m; k = kinds[(i + j) % len(kinds)]
            deco('crate', cx - 0.27, cy - 0.21, cx + 0.27, cy + 0.21, z, z + 0.16, 'timber')
            for q in range(4): ico('produce', cx - 0.12 + (q % 2) * 0.24, cy - 0.09 + (q // 2) * 0.18, z + 0.2, 0.1, 0.1, 0.09, k, sub=1)
def stall(x0, y0, x1, y1, aw, kinds, h=2.5):
    """A market stall: a counter under a striped canopy on four posts, loaded with produce."""
    box('stall counter', x0, y0, x1, y1, 0, 0.95, 'timber', surface='wood'); produce(x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, 0.95, kinds)
    for x in (x0 + 0.05, x1 - 0.05):
        for y in (y0 - 0.25, y1 + 0.25): bar('stall post', (x, y, 0), (x, y, h), 0.03, 'timber')
    slab('stall canopy', (x0 + x1) / 2, (y0 + y1) / 2, h + 0.12, x1 - x0 + 0.5, y1 - y0 + 1.0, 0.04, (0.12, 0, 0), aw)
    for i in range(int((x1 - x0) / 0.8)): slab('canopy stripe', x0 + 0.4 + i * 0.8, (y0 + y1) / 2, h + 0.135, 0.4, y1 - y0 + 1.0, 0.04, (0.12, 0, 0), 'aw cream')
def lamp_post(x, y):
    cyl('lamp post', x, y, 0, 3.6, 0.07, 'iron', seg=8); cyl('lamp foot', x, y, 0, 0.5, 0.13, 'iron', seg=8); deco('lantern', x - 0.16, y - 0.16, x + 0.16, y + 0.16, 3.6, 4.05, 'lamp'); cyl('lantern cap', x, y, 4.05, 4.3, 0.24, 'iron', seg=6, r2=0.02)
    collide(x - 0.1, y - 0.1, x + 0.1, y + 0.1, 0, 3.6, 'metal', soft=1)
def tree(x, y, h=9.5):
    cyl('trunk', x, y, 0, 1.2, 0.26, 'timber', seg=8); collide(x - 0.28, y - 0.28, x + 0.28, y + 0.28, 0, 3.0); card(x, y, h, int(x) % 2, aspect=1.0, mirror=True)
    deco('tree grate', x - 0.9, y - 0.9, x + 0.9, y + 0.9, 0, 0.02, 'iron')

# ---------- ground: cobbled streets, a paved square ----------
deco('streets', -HX - 30, -HY - 30, HX + 30, HY + 30, -0.1, 0, 'cobble', mirror=False)
deco('square paving', -12, -13, 12, 13, 0, 0.015, 'paving', mirror=False)

# ---------- the edge of the map: house fronts all round (the town carries on behind them) ----------
cols = list(STUCCO)
for i, x in enumerate(range(-36, 36, 9)):
    k = cols[i % 6]; h = 8.5 + (i % 3) * 1.4
    box('north terrace', x, HY, x + 9, HY + 5, 0, h, k, top=18); face(x, x + 9, HY, 'x', -1, 0, h, shop=(i % 2), seed=i); gable(x, HY, x + 9, HY + 5, h)
for i, y in enumerate(range(-27, 27, 9)):
    k = cols[(i + 3) % 6]; h = 8.5 + ((i + 1) % 3) * 1.4
    box('west terrace', -HX - 5, y, -HX, y + 9, 0, h, k, top=18); face(y, y + 9, -HX, 'y', 1, 0, h, shop=((i + 1) % 2), seed=i + 5); gable(-HX - 5, y, -HX, y + 9, h, along_x=False)

# ---------- the cafe block (north-west; its twin is the south-east): a walk-through cafe, a roof terrace ----------
B = (-27, 8, -12, 21)
box('cafe block', -27, 8, -22, 21, 0, R, 'ochre'); box('cafe block', -16, 8, -12, 21, 0, R, 'ochre')
wall_x('cafe front', 8, 8.3, -22, -16, R - 0.2, [(-19.6, 1.6, 0, 2.3), (-17.2, 1.6, 1.0, 2.2)], 'ochre')
wall_x('cafe back', 20.7, 21, -22, -16, R - 0.2, [(-18.0, 1.6, 0, 2.3), (-20.6, 1.4, 1.0, 2.2)], 'ochre')
box('cafe ceiling', -22, 8, -16, 21, R - 0.2, R, 'ochre'); deco('cafe floor', -22, 8.3, -16, 20.7, 0, 0.02, 'timber')
box('cafe counter', -21.9, 13.5, -21.2, 17.5, 0, 1.05, 'timber', surface='wood'); deco('counter top', -21.95, 13.4, -21.1, 17.6, 1.05, 1.1, 'frame')
prop('outdoor_table_chair_set_01', -17.6, 11.2, 0, 0, solid=(0.8, 1.7, 0.78, True)); prop('outdoor_table_chair_set_01', -17.4, 17.6, 0, 0.2, solid=(0.8, 1.7, 0.78, True))
prop('potted_plant_02', -16.5, 8.8, 0.02, 1, 1.1, solid=(0.45, 0.45, 0.5, True)); cyl('cafe light', -19, 14.5, R - 0.3, R - 0.2, 0.22, 'lamp', seg=12)
face(-27, -22, 8, 'x', -1, 0, R, shop=1, seed=1); face(-16, -12, 8, 'x', -1, 0, R, shop=1, seed=2); face(8, 21, -27, 'y', -1, 0, R, seed=3); face(-27, -22, 21, 'x', 1, 0, R, seed=4); face(-16, -12, 21, 'x', 1, 0, R, seed=5)
slab('cafe awning', -19, 7.2, 2.75, 5.6, 1.7, 0.05, (-0.42, 0, 0), 'aw red'); text('CAFE TARSA', -19, 7.94, 3.2, 0, 0.3, 'gold', mirror=True, depth=0.012)
deco('roof terrace', -27, 8, -12, 21, R, R + 0.012, 'roofdeck')
for nm, a, h in (('terrace wall', (-27, 20.75, -12, 21), 1.1), ('terrace wall', (-27, 8.25, -26.75, 20.75), 1.1), ('terrace wall', (-27, 8, -12, 8.25), 0.9), ('terrace wall', (-12.25, 14.2, -12, 20.75), 1.1), ('terrace wall', (-12.25, 8.25, -12, 12.2), 1.1)):
    box(nm, *a, R, R + h, 'ochre'); deco('terrace cap', a[0] - 0.04, a[1] - 0.04, a[2] + 0.04, a[3] + 0.04, R + h, R + h + 0.06, 'frame')
box('water tank', -25.6, 16.6, -23.6, 18.6, R, R + 1.5, 'timber', surface='wood'); box('roof hut', -20.4, 11.0, -18.0, 13.0, R, R + 2.2, 'cream'); gable(-20.4, 11.0, -18.0, 13.0, R + 2.2, rise=0.6)
prop('outdoor_table_chair_set_01', -15.2, 16.8, R, PI / 2, solid=(1.7, 0.8, 0.78, True)); prop('potted_plant_02', -26.2, 9.2, R + 0.02, 0, 1.1, solid=(0.45, 0.45, 0.5, True))
for i in range(4): bar('washing line', (-26.6, 11.5 + i * 0.4, R + 1.9), (-21.0, 11.5 + i * 0.4, R + 1.9 - 0.15), 0.008, 'iron')
for i, k in enumerate(('aw cream', 'aw blue', 'aw red', 'aw cream', 'aw green')): slab('washing', -25.8 + i * 1.0, 11.9, R + 1.45, 0.7, 0.02, 0.8, (0, 0, 0), k)
# the stair up the alley side: 24 steps from the back lane end
for i in range(24):
    ya = 20.2 - (i + 1) * 0.3
    box('terrace stairs', -12, ya, -10.6, ya + 0.3, 0, (i + 1) * R / 24, 'plinth')
bar('stair rail', (-10.63, 20.2, 1.0), (-10.63, 13.0, R + 1.0), 0.03, 'iron'); collide(-10.68, 13.0, -10.6, 20.2, 0, 1.0, 'metal', soft=1)

# ---------- the arcade block (south-west; its twin is the north-east): a colonnade on the street, a passage to the back ----------
AH = 7.6
box('arcade block', -27, -21, -20.5, -10.6, 0, AH, 'sage'); box('arcade block', -17.5, -21, -12, -10.6, 0, AH, 'sage'); box('over the passage', -20.5, -21, -17.5, -10.6, 3.0, AH, 'sage')
box('over the arcade', -27, -10.6, -12, -8, 3.4, AH, 'sage'); deco('arcade floor', -27, -10.6, -12, -8, 0, 0.02, 'paving')
for x in (-26.7, -23.7, -20.7, -17.7, -14.7, -12.3):
    box('arcade column', x - 0.25, -8.5, x + 0.25, -8.0, 0, 3.4, 'cream'); deco('column cap', x - 0.32, -8.56, x + 0.32, -7.94, 3.1, 3.4, 'frame'); deco('column foot', x - 0.32, -8.56, x + 0.32, -7.94, 0, 0.3, 'plinth')
face(-27, -12, -8, 'x', 1, 3.4 - 0.4, AH, seed=6); face(-21, -10.6, -27, 'y', -1, 0, AH, seed=7); face(-21, -10.6, -12, 'y', 1, 0, AH, seed=8); face(-27, -20.5, -21, 'x', -1, 0, AH, seed=9); face(-17.5, -12, -21, 'x', -1, 0, AH, seed=10)
gable(-27, -21, -12, -8, AH)
for x, nm in ((-24.2, 'PANADERIA'), (-14.9, 'VINOS')):   # shop fronts inside the arcade
    deco('arcade shop door', x - 0.55, -10.6, x + 0.55, -10.55, 0, 2.2, 'timber'); deco('arcade shop window', x + 0.9, -10.6, x + 2.6, -10.56, 0.7, 2.3, 'glass'); text(nm, x + 0.6, -10.52, 2.75, PI, 0.24, 'gold', mirror=True, depth=0.01)
box('arcade bench', -23.6, -10.5, -21.8, -10.0, 0, 0.5, 'timber', surface='wood'); prop('wine_barrel_01', -13.2, -10.0, 0, 0.3, 1.1, solid=(0.8, 0.8, 0.95, False))
for x in (-25.2, -19.0, -13.4): cyl('arcade lamp', x, -9.3, 3.0, 3.38, 0.12, 'lamp', seg=8)

# ---------- the shop row north of the square (its twin is the south row): three open-fronted shops ----------
box('shop row', -8, 15.4, 8, 21, 0, 8.2, 'terra'); box('over the shops', -8, 13, 8, 15.4, 3.0, 8.2, 'terra')
for xa, xb in ((-8, -6.6), (-2.4, -2.0), (2.0, 2.4), (6.6, 8)): box('shop pier', xa, 13, xb, 15.4, 0, 3.0, 'terra')
for i, (xa, xb) in enumerate(((-6.6, -2.4), (-2.0, 2.0), (2.4, 6.6))):
    deco('shop floor', xa, 13, xb, 15.4, 0, 0.02, 'timber'); box('shop counter', xa + 0.3, 14.3, xb - 0.3, 15.0, 0, 1.0, 'timber', surface='wood')
    produce(xa + 0.4, 14.35, xb - 0.4, 14.95, 1.0, (('tomato', 'apple', 'lemon'), ('orange', 'plum', 'apple'), ('lemon', 'tomato', 'orange'))[i])
    slab('shop awning', (xa + xb) / 2, 12.3, 2.8, xb - xa, 1.7, 0.05, (-0.42, 0, 0), AWN[i]); deco('shop sign', xa + 0.3, 12.94, xb - 0.3, 13.0, 3.05, 3.5, 'sign')
    text(('FRUTAS', 'MERCADO', 'FLORES')[i], (xa + xb) / 2, 12.93, 3.27, 0, 0.28, 'gold', mirror=True, depth=0.01); cyl('shop light', (xa + xb) / 2, 14.2, 2.85, 2.98, 0.14, 'lamp', seg=8)
face(-8, 8, 13, 'x', -1, 3.0 - 0.4, 8.2, seed=11); face(13, 21, -8, 'y', -1, 0, 8.2, seed=12); face(13, 21, 8, 'y', 1, 0, 8.2, seed=13); face(-8, 8, 21, 'x', 1, 0, 8.2, shop=1, seed=14)
gable(-8, 13, 8, 21, 8.2)

# ---------- the market hall in the middle of the square: a tiled roof on iron columns, stalls under it, a kiosk at its heart ----------
for x in (-7, -2.4, 2.4, 7):
    box('hall column', x - 0.2, 4.4, x + 0.2, 4.8, 0, 4.4, 'iron', surface='metal', mirror=False); box('hall column', x - 0.2, -4.8, x + 0.2, -4.4, 0, 4.4, 'iron', surface='metal', mirror=False)
    deco('column base', x - 0.3, 4.3, x + 0.3, 4.9, 0, 0.4, 'plinth'); 
box('hall roof', -8, -5.6, 8, 5.6, 4.4, 4.6, 'timber', surface='wood', mirror=False); gable(-8, -5.6, 8, 5.6, 4.6, rise=2.2)
for x in (-8, 8): deco('hall beam', x - 0.1, -5.6, x + 0.1, 5.6, 4.2, 4.4, 'iron', mirror=False)
for y in (-5.6, 5.5): deco('hall valance', -8, y, 8, y + 0.1, 3.9, 4.4, 'aw cream', mirror=False)
box('kiosk', -1.3, -1.3, 1.3, 1.3, 0, 2.8, 'sage', mirror=False); deco('kiosk roof', -1.6, -1.6, 1.6, 1.6, 2.8, 2.95, 'iron', mirror=False); deco('kiosk band', -1.34, -1.34, 1.34, 1.34, 2.2, 2.6, 'sign', mirror=False)
for yaw, (x, y) in ((0, (0, -1.36)), (PI, (0, 1.36)), (PI / 2, (1.36, 0)), (-PI / 2, (-1.36, 0))): text('TARSA', x, y, 2.4, yaw, 0.26, 'gold', depth=0.01)
stall(-6.2, 2.2, -3.4, 3.1, 'aw red', ('tomato', 'lemon', 'apple')); stall(-6.2, -3.1, -3.4, -2.2, 'aw green', ('orange', 'plum', 'lemon'))
for x in (-4.8, 0, 4.8): cyl('hall lamp', x, 0, 3.7, 4.0, 0.16, 'lamp', seg=8, mirror=False); bar('lamp cord', (x, 0, 4.0), (x, 0, 4.4), 0.01, 'iron', mirror=False)
# the square: trees in iron grates, benches, lamp posts
tree(-10, 9.6); tree(-10, -9.6); lamp_post(-11.2, 4.0); lamp_post(-11.2, -4.0)
prop('painted_wooden_bench', -10, 7.2, 0, 0, 1.0, solid=(1.1, 0.4, 0.5, True)); prop('painted_wooden_bench', -10, -7.2, 0, PI, 1.0, solid=(1.1, 0.4, 0.5, True))

# ---------- Market Street (each team's way in): a fountain, two stalls, the cafe's tables ----------
cyl('fountain basin', -19.5, 0, 0, 0.75, 2.0, 'plinth', seg=16); cyl('fountain water', -19.5, 0, 0.5, 0.78, 1.75, 'water', seg=16); cyl('fountain stem', -19.5, 0, 0.5, 2.2, 0.22, 'plinth', seg=10)
cyl('fountain bowl', -19.5, 0, 2.2, 2.4, 0.4, 'plinth', seg=12, r2=0.75); cyl('fountain jet', -19.5, 0, 2.4, 2.9, 0.06, 'water', seg=6, r2=0.01)
collide(-21.45, -1.95, -17.55, 1.95, 0, 0.78, 'concrete'); collide(-19.75, -0.25, -19.25, 0.25, 0.78, 2.4, 'concrete')
stall(-25.2, 3.6, -22.6, 4.5, 'aw blue', ('apple', 'tomato', 'orange')); stall(-16.4, -5.2, -13.8, -4.3, 'aw gold', ('lemon', 'plum', 'tomato'))
prop('outdoor_table_chair_set_01', -15.4, 6.4, 0, PI / 2, solid=(1.7, 0.8, 0.78, True)); prop('outdoor_table_chair_set_01', -24.2, 6.6, 0, PI / 2, solid=(1.7, 0.8, 0.78, True))
lamp_post(-27.6, 7.4); lamp_post(-27.6, -7.4); lamp_post(-12.6, 7.4)
for x, y in ((-22.4, 7.6), (-13.0, 7.6), (-21.6, -7.5), (-16.6, -7.5)): prop('potted_plant_02', x, y, 0.02, x, 1.15, solid=(0.45, 0.45, 0.5, True))
for a, b in (((-27, 4, 3.6), (-12, -4, 3.6)), ((-27, -4, 3.6), (-12, 4, 3.6))):   # festoon lights across the street
    A, Bv = Vector(a), Vector(b); pts = [A.lerp(Bv, t / 14) - Vector((0, 0, 0.5 * math.sin(PI * t / 14))) for t in range(15)]
    for p, q in zip(pts, pts[1:]): bar('festoon', p, q, 0.008, 'iron')
    for p in pts[1:-1]: ico('festoon bulb', p.x, p.y, p.z - 0.07, 0.055, 0.055, 0.055, 'bulb', sub=1)

# ---------- the back lanes and the ends: vehicles, crates, bins; the alleys between the blocks ----------
vehicle('boxtruck', -5, 23.0, 2, 25.4, 3.0, 0); vehicle('van', -30.2, 12.5, -28.1, 18, 2.3, -PI / 2); vehicle('sedan', 14, 22.4, 18.4, 24.2, 1.4, PI)
for x, y, hh in ((-21.0, 25.4, 1.2), (-19.7, 25.5, 1.2), (-20.4, 25.4, 2.4), (11.0, 22.0, 1.2), (-33.6, -13.5, 1.2), (-10.6, -17.6, 1.2)):
    if hh > 1.3: box('crate', x - 0.6, y - 0.6, x + 0.6, y + 0.6, 1.2, hh, 'timber', surface='wood')
    else: box('crate', x - 0.6, y - 0.6, x + 0.6, y + 0.6, 0, hh, 'timber', surface='wood')
for x, y, a in ((-24.6, 21.8, 0.2), (-23.9, 21.7, 1.5), (9.4, 26.2, 0.8)): prop('trashbag', x, y, 0, a, 1.1, solid=(0.5, 0.5, 0.45, True))
prop('hand_truck', 3.0, 25.6, 0, 0.6, solid=(0.55, 0.55, 1.3, True)); prop('wine_barrel_01', -8.6, 18.4, 0, 0.3, 1.1, solid=(0.8, 0.8, 0.95, False)); prop('wine_barrel_01', -8.7, 19.3, 0, 1.3, 1.1, solid=(0.8, 0.8, 0.95, False))
box('lane wall', -34, 9.0, -30.6, 9.5, 0, 1.2, 'cream'); deco('lane wall cap', -34.05, 8.95, -30.55, 9.55, 1.2, 1.28, 'frame'); box('planter', -29.4, -1.4, -28.4, 1.4, 0, 0.7, 'plinth'); deco('planter soil', -29.3, -1.3, -28.5, 1.3, 0.7, 0.74, 'dark'); collide(-29.4, -1.4, -28.4, 1.4, 0.7, 1.2)
for y in (-0.9, 0, 0.9):
    for a in (0.2, 0.2 + PI / 2): cut(2, -28.9, y, 0.68, 1.1, 0.9, a + y, off=0)
cut(0, -8.0, 17.0, 0.2, 3.2, 5.0, -PI / 2); cut(0, -27, 14.5, 0.3, 3.6, 3.2, -PI / 2); cut(1, -12, -15.5, AH - 3.0, 2.6, 3.0, PI / 2); cut(0, -30.6, 9.25, 0.1, 2.4, 1.0, 0)
for x, y, w, d, a in ((-31, 4, 6, 6, 0.4), (-6, 24.6, 7, 4, 2.0), (-20, -24, 7, 5, 4.1), (-10, 0.5, 4, 5, 1.0)): wear(1, x, y, w, d, a)
for x, y in ((-1.5, 22.8), (16.2, 23.3), (-29.2, 15.2)): wear(0, x, y, 1.8, 2.2, x)
for i in range(60):   # the town beyond: trees over the rooftops
    a = rnd.uniform(0, 2 * PI); d = rnd.uniform(52, 90); card(math.cos(a) * d, math.sin(a) * d * 0.8, rnd.uniform(13, 19), i % 2, aspect=1.0)

# ---------- export ----------
def stair(s):
    xs, zs = sorted((s * -12.2, s * -10.4)), sorted((s * -20.4, s * -12.8))
    return {'rect': [xs[0], zs[0], xs[1], zs[1]], 'climb': [[s * -11.3, 0, s * -20.9], [s * -11.3, 0.2, s * -20.0], [s * -11.3, R / 2, s * -16.6], [s * -11.3, R, s * -13.2], [s * -13.4, R, s * -13.2]]}
export('tarsa', {
    'half': [HX, HY], 'roof': R,
    'spawns': [[32.5, z] for z in (-9, -7, -5, -3, -1, 1, 3, 5, 7, 9)],
    'upper': [{'y': R, 'bounds': {'minX': -27, 'maxX': -12, 'minZ': -21, 'maxZ': -8}, 'portals': [stair(1)]}, {'y': R, 'bounds': {'minX': 12, 'maxX': 27, 'minZ': 8, 'maxZ': 21}, 'portals': [stair(-1)]}],
    'pickups': [['health', -3.2, 0, 0], ['health', 3.2, 0, 0], ['ammo', -19, 0, -14.5], ['ammo', 19, 0, 14.5], ['ammo', 0, 0, -23.6], ['ammo', 0, 0, 23.6], ['health', -19.5, R, -17], ['health', 19.5, R, 17], ['ammo', -19, 0, 15], ['ammo', 19, 0, -15]],
})
