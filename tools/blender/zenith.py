"""Zenith: floating islands over a sea of cloud, built as a Blender scene and exported for the game (helpers: mapkit.py).

    python3 tools/blender/zenith.py            (needs Blender's Python module, bpy)

There is no ground: step off an island and you fall. Each team has a home island; the temple island floats in the
middle, a grove island north and south of it. A wide stone bridge runs from each home island to the temple (the
middle lane); narrow bridges go round by a small isle to the groves (the outer lanes), and each grove has its own
bridge to the temple. The temple stands on a podium, steps up at both ends. The plan is point-mirrored.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapkit import *

HX, HY = 38, 28
POD = 1.2                # the temple's podium
PI = math.pi
setup({
    'rock': ('v_rock:island rock', 0xe8ecf2), 'grass': ('v_grass:island grass', 0xb4f0c8), 'marble': ('concrete:marble', 0xf6f2e8), 'floor': ('whitetile:temple floor', 0xf2eee2),
    'gold': ('flat:gold', 0xd8b048), 'goldleaf': ('flat:golden leaves', 0xe8b430), 'bark': ('flat:pale bark', 0xc8bca8), 'cut': ('cutout:greenery', 0xffffff),
    'cloud': ('flat:cloud', 0xffffff), 'water': ('flat:water', 0x5ac8e8), 'rope': ('flat:rope', 0xb8a070), 'plank': ('wood:bridge planks', 0xe8d8b8), 'frame': ('concrete:marble trim', 0xd8d2c4),
    'cover': ('flat:cover', 0xc8731a),
}, emit={'crystal': 0x18c8f0, 'glow': 0xfff0c0, 'fall': 0xbff0ff}, rough={'marble': 0.35, 'gold': 0.3, 'water': 0.05, 'cloud': 1.0}, metal={'gold': 0.9}, emit_strength={'crystal': 1.1, 'glow': 2.0, 'fall': 0.5}, default='marble')
rnd = random.Random(8)
ISLANDS = []   # what you can stand on at z = 0, for bots (this half's; mapkit takes the twins)

def island(x0, y0, x1, y1, depth=9.0, lip=True):
    """A floating island: a slab of rock under turf, hanging rock tapering to a point below, a rough stone lip round the edge."""
    box('island', x0, y0, x1, y1, -3, 0, 'rock', surface='grass'); deco('turf', x0 + 0.25, y0 + 0.25, x1 - 0.25, y1 - 0.25, 0, 0.02, 'grass')
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for s in (1, -1):
        bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=0.25, radius2=1, depth=depth, location=(s * cx, s * cy, -3 - depth / 2)); o = bpy.context.object; o.name = 'island root'
        o.scale = ((x1 - x0) * 0.56, (y1 - y0) * 0.56, 1); o.rotation_euler = (0, 0, 0.4 * s + cx); finish(o, 'rock', False, uv=True)
    if lip:
        n = int(2 * ((x1 - x0) + (y1 - y0)) / 2.4)
        for i in range(n):
            t = (i + rnd.random() * 0.6) / n * 2 * ((x1 - x0) + (y1 - y0)); w, d = x1 - x0, y1 - y0
            px, py = (x0 + t, y0) if t < w else (x1, y0 + t - w) if t < w + d else (x1 - (t - w - d), y1) if t < 2 * w + d else (x0, y1 - (t - 2 * w - d))
            ico('lip stone', px, py, -0.06, rnd.uniform(0.35, 0.7), rnd.uniform(0.35, 0.7), rnd.uniform(0.12, 0.24), 'rock', sub=1, rot=(0, 0, rnd.uniform(0, 3)))
    ISLANDS.append([x0, y0, x1, y1])
def bridge(x0, y0, x1, y1, wide=False):
    """A bridge between islands: stone when wide (parapets, an arch at the middle), planks on ropes when narrow."""
    along_x = (x1 - x0) > (y1 - y0)
    if wide:
        box('bridge', x0, y0, x1, y1, -0.8, 0, 'marble', surface='concrete'); xm = (x0 + x1) / 2
        for ya, yb in ((y0, y0 + 0.3), (y1 - 0.3, y1)):
            for xa, xb in ((x0, xm - 1.6), (xm + 1.6, x1)): box('parapet', xa, ya, xb, yb, 0, 0.9, 'marble'); deco('parapet cap', xa - 0.03, ya - 0.04, xb + 0.03, yb + 0.04, 0.9, 0.98, 'gold')
        for y in (y0 + 0.45, y1 - 0.45): box('arch pier', xm - 0.45, y - 0.45, xm + 0.45, y + 0.45, 0, 4.2, 'marble'); deco('pier band', xm - 0.5, y - 0.5, xm + 0.5, y + 0.5, 3.6, 3.75, 'gold')
        deco('arch lintel', xm - 0.6, y0 - 0.1, xm + 0.6, y1 + 0.1, 4.2, 4.8, 'marble'); cyl('arch crystal', xm, (y0 + y1) / 2, 4.9, 5.9, 0.28, 'crystal', seg=6, r2=0.02)
        for i in range(3): cyl('bridge rib', x0 + (i + 0.5) * (x1 - x0) / 3, (y0 + y1) / 2, -2.6, -0.8, 0.5, 'marble', seg=6, r2=(y1 - y0) / 2)
    else:
        box('plank bridge', x0, y0, x1, y1, -0.25, 0, 'plank', surface='wood')
        ends = ((x0, x1), (y0, y1))[0 if along_x else 1]; sides = ((y0, y1), (x0, x1))[0 if along_x else 1]
        for s in sides:
            pts = [((ends[0] + (ends[1] - ends[0]) * t / 8, s, 1.0 - 0.25 * math.sin(PI * t / 8)) if along_x else (s, ends[0] + (ends[1] - ends[0]) * t / 8, 1.0 - 0.25 * math.sin(PI * t / 8))) for t in range(9)]
            for a, b in zip(pts, pts[1:]): bar('rope', a, b, 0.025, 'rope')
            for p in pts[::2]: bar('rope post', (p[0], p[1], 0), p, 0.035, 'bark')
            if along_x: collide(x0, s - 0.06, x1, s + 0.06, 0, 0.75, 'wood', soft=1)
            else: collide(s - 0.06, y0, s + 0.06, y1, 0, 0.75, 'wood', soft=1)
    ISLANDS.append([x0, y0, x1, y1])
def tree(x, y, h=6.5):
    """A golden tree: a pale trunk, a canopy of soft golden masses with boughs of leaves through them."""
    cyl('trunk', x, y, 0, h * 0.62, 0.3, 'bark', seg=8, r2=0.16); collide(x - 0.3, y - 0.3, x + 0.3, y + 0.3, 0, h * 0.6)
    for i in range(5):
        a = i * 1.3 + x; r = 0 if i == 0 else h * 0.22
        ico('canopy', x + math.cos(a) * r, y + math.sin(a) * r, h * (0.78 if i else 0.92), h * 0.3, h * 0.3, h * 0.22, 'goldleaf', sub=2)
    for i in range(6):
        a = i * PI / 3 + y; cut(0, x + math.cos(a) * h * 0.2, y + math.sin(a) * h * 0.2, h * 0.5, h * 0.62, h * 0.62, a + PI / 2, off=0)
def boulder(x, y, s=1.0):
    ico('boulder', x, y, 0.45 * s, 1.0 * s, 0.8 * s, 0.75 * s, 'rock', sub=2, rot=(0, 0, x + y)); collide(x - 0.8 * s, y - 0.62 * s, x + 0.8 * s, y + 0.62 * s, 0, 1.05 * s, 'concrete')
def crystals(x, y, s=1.0, z=0.0):
    """A cluster of glowing crystals (cover)."""
    for i, (dx, dy, h, r) in enumerate(((0, 0, 2.6, 0.42), (0.6, 0.25, 1.6, 0.3), (-0.5, 0.35, 1.9, 0.32), (0.15, -0.55, 1.2, 0.26), (-0.45, -0.4, 0.9, 0.2))):
        cyl('crystal', x + dx * s, y + dy * s, z, z + h * s, r * s, 'crystal', seg=6, r2=0.03, rot=(0.12 * dx * 3, 0.12 * dy * 3, i))
    collide(x - 0.8 * s, y - 0.75 * s, x + 0.9 * s, y + 0.7 * s, z, z + 1.5 * s, 'glass')
def ruin(x0, y0, x1, y1, h, broken=True):
    """A length of ruined marble wall (cover), its top stepped where it has fallen."""
    box('ruin', x0, y0, x1, y1, 0, h, 'marble')
    if broken:
        lx = (x1 - x0) > (y1 - y0)
        if lx: deco('ruin step', x0, y0, x0 + (x1 - x0) * 0.4, y1, h, h + 0.6, 'marble')
        else: deco('ruin step', x0, y0, x1, y0 + (y1 - y0) * 0.4, h, h + 0.6, 'marble')
    deco('ruin base', x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, 0, 0.25, 'frame')
def column(x, y, z0, h, solid=True):
    cyl('column', x, y, z0 + 0.3, z0 + h - 0.3, 0.36, 'marble', seg=12); deco('column base', x - 0.48, y - 0.48, x + 0.48, y + 0.48, z0, z0 + 0.3, 'marble'); deco('column head', x - 0.5, y - 0.5, x + 0.5, y + 0.5, z0 + h - 0.3, z0 + h, 'gold')
    if solid: collide(x - 0.38, y - 0.38, x + 0.38, y + 0.38, z0, z0 + h, 'concrete')
def tuft(x, y, s=1.0, kind=3):
    for a in (0.3 + x, 0.3 + x + PI / 2): cut(kind, x, y, 0, s, s * (0.6 if kind == 3 else 0.8), a, off=0)

# ---------- the islands and the bridges between them ----------
island(-37, -12, -22, 12)                       # the west team's home island (its twin is the east's)
island(-10, -9, 0, 9, 11, lip=False)            # the temple island (this half and its twin make the whole)
island(-12, 14, 0, 27); island(0, 14, 12, 27)   # the north grove (two halves: their twins make the south grove)
island(-29, 15, -22, 21, 5)                     # the north-west isle
island(-27, -24, -20, -17.5, 5)                 # the south-west isle
bridge(-22, -2, -10, 2, wide=True)              # home to the temple
bridge(-27.6, 12, -24, 15); bridge(-22, 16.4, -12, 20)        # home to the north grove, by the isle
bridge(-25.6, -17.5, -22, -12); bridge(-20, -22.6, -12, -19)    # home to the south grove, by the isle
bridge(2.4, 9, 6, 14)                           # the north grove to the temple
void(ISLANDS, (HX, HY))

# ---------- the temple: a colonnade on a podium over the middle of the map, a great crystal over its altar ----------
box('podium', -6, -5, 6, 5, 0, POD, 'marble', mirror=False); deco('temple floor', -6, -5, 6, 5, POD, POD + 0.015, 'floor', mirror=False)
deco('podium band', -6.05, -5.05, 6.05, 5.05, POD - 0.18, POD - 0.06, 'gold', mirror=False)
for i in range(6): box('temple steps', -8.4 + i * 0.4, -2, -8.0 + i * 0.4, 2, 0, (i + 1) * POD / 6, 'marble')
for x, y in ((-5.4, -4.4), (-5.4, 4.4), (-1.8, 4.4), (1.8, 4.4)): column(x, y, POD, 4.6)
deco('entablature', -6, 3.9, 6, 4.9, POD + 4.6, POD + 5.3, 'marble'); deco('entablature', -5.9, -3.9, -4.9, 3.9, POD + 4.6, POD + 5.3, 'marble')
deco('cornice', -6.2, 3.8, 6.2, 5.1, POD + 5.3, POD + 5.45, 'gold'); deco('cornice', -6.1, -3.8, -4.8, 3.8, POD + 5.3, POD + 5.45, 'gold')
box('altar', -0.9, -0.9, 0.9, 0.9, POD, POD + 1.0, 'marble', mirror=False); deco('altar top', -1.0, -1.0, 1.0, 1.0, POD + 1.0, POD + 1.1, 'gold', mirror=False)
cyl('great crystal', 0, 0, POD + 2.2, POD + 4.6, 0.7, 'crystal', mirror=False, seg=6, r2=0.02); cyl('great crystal', 0, 0, POD + 1.5, POD + 2.2, 0.02, 'crystal', mirror=False, seg=6, r2=0.7)
ruin(-9.4, 7.6, -6.8, 8.2, 1.5); ruin(-9.6, -8.6, -9.0, -6.0, 2.4); boulder(-2.6, 7.4, 0.9); boulder(-7.8, -3.6, 0.8)
tuft(-8.6, 7.6, 1.2, 2); tuft(-3.4, -7.8, 1.1, 2); tuft(-9.0, 3.6); tuft(-6.8, 7.2); tuft(-1.2, 8.2)

# ---------- a home island: a shrine at the back, ruins and boulders across the front, two golden trees ----------
box('shrine wall', -36.2, -4, -35.6, 4, 0, 3.4, 'marble'); deco('shrine cap', -36.3, -4.15, -35.5, 4.15, 3.4, 3.6, 'gold')
column(-35.2, -4.6, 0, 4.4); column(-35.2, 4.6, 0, 4.4); crystals(-34.6, 0, 0.9)
ruin(-26.2, 3.2, -25.6, 8.2, 2.4); ruin(-27.2, -7.6, -24.0, -7.0, 1.3); ruin(-29.4, -1.0, -28.8, 1.6, 1.2, broken=False)
boulder(-24.6, 9.8, 1.1); boulder(-27.8, -3.4, 0.9); boulder(-23.6, -9.6, 1.0); boulder(-31.5, 10.2, 0.8)
tree(-30.5, 7.6, 7.0); tree(-29.5, -9.0, 6.2); crystals(-23.4, 5.4, 0.7)
column(-23.0, -3.4, 0, 3.0); column(-23.0, 3.4, 0, 2.2)
for x, y in ((-33.4, 9.4), (-32.6, -6.8), (-28.4, 10.6), (-25.2, -1.6), (-34.2, -10.2), (-26.8, 1.8), (-30.8, 2.6), (-24.6, -5.2)): tuft(x, y, 1.0 + (x % 2) * 0.3)
for x, y in ((-35.4, 7.2), (-27.0, -10.6), (-22.8, 10.8)): tuft(x, y, 1.3, 2)

# ---------- the north grove (the south is its twin): a pool spilling over the edge, an old gateway, trees ----------
deco('pool', -4, 21.5, 0, 25.5, 0.02, 0.05, 'water'); ico('pool bank', -4.2, 23.4, 0.05, 0.5, 2.2, 0.28, 'rock', sub=1); ico('pool bank', -2.0, 21.3, 0.05, 2.2, 0.5, 0.28, 'rock', sub=1)
slab('waterfall', -2.0, 27.06, -6.0, 3.0, 0.05, 12.0, (0, 0, 0), 'fall'); slab('waterfall lip', -2.0, 26.6, 0.03, 3.0, 1.0, 0.04, (0, 0, 0), 'water')
box('gateway pier', -1.5, 17.2, -0.7, 18.0, 0, 3.6, 'marble'); box('gateway pier', 0.7, 17.2, 1.5, 18.0, 0, 3.6, 'marble')
deco('gateway lintel', -1.7, 17.1, 1.7, 18.1, 3.6, 4.2, 'marble'); deco('gateway band', -1.75, 17.05, 1.75, 18.15, 4.2, 4.32, 'gold')
ruin(-9.6, 18.4, -6.2, 19.0, 1.4); ruin(-6.4, 15.2, -5.8, 17.6, 2.3); ruin(6.2, 20.6, 9.4, 21.2, 1.2); ruin(3.0, 22.6, 3.6, 25.6, 2.2)
tree(-9.2, 23.6, 7.4); tree(8.6, 24.2, 6.4); tree(9.6, 16.6, 6.8); tree(-4.6, 15.8, 5.6)
boulder(5.2, 17.4, 1.0); boulder(-10.2, 15.6, 0.8); crystals(1.4, 25.2, 0.8); crystals(10.6, 21.0, 0.6)
for x, y in ((-7.4, 21.4), (-1.6, 20.2), (2.4, 19.2), (6.6, 23.6), (10.4, 25.4), (-10.8, 21.0), (4.4, 15.4), (-2.6, 16.2), (7.8, 18.8), (-6.2, 25.6)): tuft(x, y, 1.0 + (y % 2) * 0.3)
for x, y in ((-11.0, 25.8), (11.0, 14.8), (0.6, 22.6), (-8.0, 16.2)): tuft(x, y, 1.3, 2)
# the two small isles
tree(-27.2, 19.4, 5.2); boulder(-23.4, 15.8, 0.7); tuft(-28.2, 16.2); tuft(-24.4, 20.2, 1.2, 2)
crystals(-24.6, -21.6, 0.8); column(-21.6, -18.8, 0, 2.6); tuft(-25.8, -18.6); tuft(-22.2, -22.8, 1.2, 2)

# ---------- the sky: cloud banks under and around the islands, a sea of cloud far below, islets adrift ----------
deco('cloud sea', -400, -400, 400, 400, -34.1, -34, 'cloud', mirror=False)
for i in range(46):
    a = rnd.uniform(0, 2 * PI); d = rnd.uniform(18, 150); x, y, z = math.cos(a) * d, math.sin(a) * d * 0.8, rnd.uniform(-30, -9) if d < 70 else rnd.uniform(-26, 22)
    s = rnd.uniform(5, 13) * (1 + d / 120)
    for k in range(4): ico('cloud', x + rnd.uniform(-s, s) * 0.7, y + rnd.uniform(-s, s) * 0.5, z + rnd.uniform(-1, 1), s * rnd.uniform(0.5, 1.0), s * rnd.uniform(0.4, 0.8), s * rnd.uniform(0.16, 0.3), 'cloud', mirror=False, sub=2)
for x, y, z, s in ((-58, 30, 6, 5), (52, -44, -4, 7), (64, 22, 10, 4), (-50, -40, 2, 6), (10, 62, 8, 5), (-14, -64, -2, 6)):   # far islets
    ico('islet', x, y, z, s, s * 0.8, s * 0.22, 'grass', mirror=False, sub=2)
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=0.2, radius2=s * 0.95, depth=s * 1.5, location=(x, y, z - s * 0.75)); finish(bpy.context.object, 'rock', False, uv=True)
    ico('islet tree', x + s * 0.2, y, z + s * 0.5, s * 0.3, s * 0.3, s * 0.26, 'goldleaf', mirror=False, sub=1)

# ---------- export ----------
def steps(s): return {'rect': sorted((s * -8.6, s * -6.0)) [:1] + [-2] + sorted((s * -8.6, s * -6.0))[1:] + [2], 'climb': [[s * -9.2, 0, 0], [s * -8.2, 0.2, 0], [s * -7.2, POD / 2, 0], [s * -6.0, POD, 0], [s * -4.8, POD, 0]]}
export('zenith', {
    'half': [HX, HY], 'roof': POD, 'holes': [[-200, -200, 200, 200]],
    'spawns': [[31.5, z] for z in (-9, -7, -5, -3, -1, 1, 3, 5, 7, 9)],
    'upper': [{'y': POD, 'bounds': {'minX': -6, 'maxX': 6, 'minZ': -5, 'maxZ': 5}, 'portals': [steps(1), steps(-1)]}],
    'pickups': [['health', 0, POD, 2.6], ['health', 0, POD, -2.6], ['ammo', -30, 0, 3], ['ammo', 30, 0, -3], ['ammo', 4, 0, -20], ['ammo', -4, 0, 20], ['health', -17.5, 0, -18], ['health', 17.5, 0, 18]],
})
