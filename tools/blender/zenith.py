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
    'rock': ('v_rock:island rock', 0xe8ecf2), 'grass': ('v_grass:island grass', 0xc4f8d4), 'marble': ('flat:cream stone', 0xf3ecdc), 'floor': ('whitetile:temple floor', 0xf2eee2),
    'gold': ('flat:gold', 0xd8b048), 'goldleaf': ('flat:golden leaves', 0xe8b430), 'bark': ('flat:pale bark', 0xc8bca8), 'cut': ('cutout:greenery', 0xffffff),
    'cloud': ('flat:cloud', 0xffffff), 'water': ('flat:water', 0x5ac8e8), 'rope': ('flat:rope', 0xb8a070), 'plank': ('wood:bridge planks', 0xe8d8b8), 'frame': ('flat:cream trim', 0xe6dcc6),
    'cover': ('flat:cover', 0xc8731a), 'butter': ('flat:butter', 0xffe58a), 'mint': ('flat:mint', 0xa4ecc0), 'sky': ('flat:sky blue', 0x8ccdfc), 'lav': ('flat:lavender', 0xbcaef8),
    'basket': ('flat:basket', 0xb89060), 'pink': ('flat:pink', 0xffa2c8), 'blush': ('flat:cloud blush', 0xffd2e6),
}, emit={'crystal': 0x18c8f0, 'glow': 0xfff0c0, 'fall': 0xbff0ff, 'star': 0xffd84a, 'rb butter': 0xffe27a, 'rb mint': 0x8fe8b4, 'rb sky': 0x7cc4ff, 'rb lav': 0xb4a4ff, 'rb pink': 0xff96c4}, rough={'marble': 0.7, 'gold': 0.3, 'water': 0.05, 'cloud': 1.0}, metal={'gold': 0.9}, emit_strength={'crystal': 1.1, 'glow': 2.0, 'fall': 0.5, 'star': 1.6, 'rb butter': 0.55, 'rb mint': 0.55, 'rb sky': 0.55, 'rb lav': 0.55, 'rb pink': 0.55}, default='marble')
rnd = random.Random(8)
ISLANDS = []   # what you can stand on at z = 0, for bots (this half's; mapkit takes the twins)

def puff(x, y, z, r, flat=0.55, mirror=True, n=4, sub=2, k='cloud'):
    """A cumulus puff: a few soft white masses run together."""
    for i in range(n):
        a = i * 2.4 + x + y; d = 0 if i == 0 else r * 0.55
        ico('cloud', x + math.cos(a) * d, y + math.sin(a) * d, z + (0.15 * r if i == 0 else 0), r * (1 if i == 0 else rnd.uniform(0.55, 0.8)), r * (1 if i == 0 else rnd.uniform(0.55, 0.8)), r * flat * (1 if i == 0 else 0.8), k, mirror, sub=sub)
def island(x0, y0, x1, y1, depth=9.0, lip=True):
    """A floating island: turf on a slab, resting in a bed of cloud that spills out round its edge."""
    box('island', x0, y0, x1, y1, -3, 0, 'rock', surface='grass'); deco('turf', x0 + 0.2, y0 + 0.2, x1 - 0.2, y1 - 0.2, 0, 0.02, 'grass')
    w, d = x1 - x0, y1 - y0; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    ico('cloud bed', cx, cy, -3.4, w * 0.62, d * 0.62, 2.6, 'cloud', sub=3); ico('cloud bed', cx - w * 0.12, cy + d * 0.1, -5.6, w * 0.45, d * 0.45, 2.4, 'cloud', sub=2)
    n = int(2 * (w + d) / 3.0)
    for i in range(n):
        t = (i + rnd.random() * 0.5) / n * 2 * (w + d)
        px, py, ox, oy = (x0 + t, y0, 0, -1) if t < w else (x1, y0 + t - w, 1, 0) if t < w + d else (x1 - (t - w - d), y1, 0, 1) if t < 2 * w + d else (x0, y1 - (t - 2 * w - d), -1, 0)
        r = rnd.uniform(1.5, 2.6); puff(px + ox * r * 0.55, py + oy * r * 0.55, -1.0 - r * 0.45, r, 0.6, n=2)
        if lip and i % 2 == 0: ico('rim puff', px - ox * 0.1, py - oy * 0.1, 0.02, rnd.uniform(0.45, 0.8), rnd.uniform(0.45, 0.8), rnd.uniform(0.16, 0.26), 'blush' if i % 4 == 0 else 'cloud', sub=2)
    ISLANDS.append([x0, y0, x1, y1])
def bridge(x0, y0, x1, y1, wide=False):
    """A bridge between islands: stone when wide (parapets, an arch at the middle), planks on ropes when narrow."""
    along_x = (x1 - x0) > (y1 - y0)
    if wide:
        box('bridge', x0, y0, x1, y1, -0.8, 0, 'marble', surface='concrete'); xm = (x0 + x1) / 2
        for ya, yb in ((y0, y0 + 0.3), (y1 - 0.3, y1)):
            for xa, xb in ((x0, xm - 1.6), (xm + 1.6, x1)): box('parapet', xa, ya, xb, yb, 0, 0.9, 'marble'); deco('parapet cap', xa - 0.03, ya - 0.04, xb + 0.03, yb + 0.04, 0.9, 0.98, 'gold')
        for y in (y0 + 0.45, y1 - 0.45): box('arch pier', xm - 0.45, y - 0.45, xm + 0.45, y + 0.45, 0, 4.2, 'marble'); deco('pier band', xm - 0.5, y - 0.5, xm + 0.5, y + 0.5, 3.6, 3.75, 'gold')
        deco('arch lintel', xm - 0.6, y0 - 0.1, xm + 0.6, y1 + 0.1, 4.2, 4.8, 'marble'); star(xm, (y0 + y1) / 2, 5.7, 0.8, PI / 2)
        for i in range(3): puff(x0 + (i + 0.5) * (x1 - x0) / 3, (y0 + y1) / 2, -2.0, 2.6, 0.5, n=3)
    else:
        box('cloud walk', x0, y0, x1, y1, -0.5, 0, 'cloud', surface='grass')
        ends = ((x0, x1), (y0, y1))[0 if along_x else 1]; sides = ((y0, y1), (x0, x1))[0 if along_x else 1]; n = max(3, int((ends[1] - ends[0]) / 1.6))
        for s in sides:
            for i in range(n + 1):
                t = ends[0] + (ends[1] - ends[0]) * i / n; r = rnd.uniform(0.75, 1.1)
                if along_x: ico('walk puff', t, s, 0.05, r, r * 0.7, r * 0.4, 'blush' if i % 2 else 'cloud', sub=2)
                else: ico('walk puff', s, t, 0.05, r * 0.7, r, r * 0.4, 'blush' if i % 2 else 'cloud', sub=2)
            if along_x: collide(x0, s - 0.3, x1, s + 0.3, 0, 0.45, 'grass', soft=1)
            else: collide(s - 0.3, y0, s + 0.3, y1, 0, 0.45, 'grass', soft=1)
        puff((x0 + x1) / 2, (y0 + y1) / 2, -1.6, max(x1 - x0, y1 - y0) * 0.42, 0.45, n=3)
    ISLANDS.append([x0, y0, x1, y1])
TREE_N = [0]
def tree(x, y, h=6.5):
    """A cotton-ball tree: a pale trunk under a canopy of soft round masses, each tree its own colour."""
    k = ('pink', 'butter', 'mint', 'pink', 'sky', 'lav')[TREE_N[0] % 6]; TREE_N[0] += 1
    cyl('trunk', x, y, 0, h * 0.62, 0.3, 'bark', seg=10, r2=0.18); collide(x - 0.3, y - 0.3, x + 0.3, y + 0.3, 0, h * 0.6)
    for i in range(6):
        a = i * 1.26 + x; r = 0 if i == 0 else h * 0.2
        ico('canopy', x + math.cos(a) * r, y + math.sin(a) * r, h * (0.76 if i else 0.94), h * 0.27, h * 0.27, h * 0.23, k, sub=3)
def boulder(x, y, s=1.0):
    """A low bank of cloud to duck behind."""
    puff(x, y, 0.42 * s, 1.05 * s, 0.62, n=4, k='blush'); collide(x - 0.85 * s, y - 0.7 * s, x + 0.85 * s, y + 0.7 * s, 0, 1.05 * s, 'grass')
def star(x, y, z, r, yaw=0.0, mirror=True, k='star'):
    """A five-pointed star standing upright, seen from both sides."""
    pts = [(math.cos(PI / 2 + i * PI / 5) * (r if i % 2 == 0 else r * 0.45), 0, math.sin(PI / 2 + i * PI / 5) * (r if i % 2 == 0 else r * 0.45)) for i in range(10)]
    vs = [(0, -0.12 * r, 0), (0, 0.12 * r, 0)] + pts; fs = []
    for i in range(10): j = (i + 1) % 10; fs += [(0, 2 + i, 2 + j), (1, 2 + j, 2 + i)]
    me = bpy.data.meshes.new('star'); me.from_pydata(vs, [], fs); me.update(); o = bpy.data.objects.new('star', me); bpy.context.collection.objects.link(o)
    o.matrix_world = Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, 'Z'); return finish(o, k, mirror, uv=False)
def star_post(x, y, h=3.2):
    """A slim post with a glowing star on top."""
    cyl('star post', x, y, 0, h, 0.06, 'gold', seg=8); star(x, y, h + 0.45, 0.5, x); collide(x - 0.1, y - 0.1, x + 0.1, y + 0.1, 0, h, 'metal', soft=1)
def rainbow(cx, cy, r, yaw, mirror=False, w=0.5, z0=-2.0):
    """A pastel rainbow: four bands arching from one foot to the other, in the upright plane through (cx, cy) turned by yaw."""
    for b, k in enumerate(('rb lav', 'rb sky', 'rb mint', 'rb butter', 'rb pink')):
        rr = r - (2 - b) * w * 2; pts = [(cx + math.cos(yaw) * math.cos(PI * t / 28) * rr, cy + math.sin(yaw) * math.cos(PI * t / 28) * rr, z0 + math.sin(PI * t / 28) * rr) for t in range(29)]
        for a, c in zip(pts, pts[1:]): bar('rainbow', a, c, w, k, mirror)
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

# ---------- the whimsy: a rainbow over the temple, star posts and floating stars, cloud banks to hide behind ----------
rainbow(0, 0, 21.5, PI / 2)                     # from the north grove to the south, over the temple
for x, y in ((-33.0, 8.2), (-33.0, -8.2), (-23.4, 0)): star_post(x, y, 3.4)
for x, y in ((-10.6, 22.4), (10.2, 19.0), (-7.6, -2.4)): star_post(x, y, 3.0)
for x, y, z, r in ((-6.4, 5.4, 8.4, 0.7), (-3.0, -6.6, 9.6, 0.5), (-14.5, 5.6, 6.0, 0.6), (-18.5, -6.2, 7.2, 0.45), (-30.0, 0, 9.5, 0.8), (-5.5, 20.5, 9.0, 0.6), (6.5, 22.0, 10.5, 0.5), (-25.5, 18.0, 6.5, 0.5), (-23.5, -20.5, 6.8, 0.55)): star(x, y, z, r, x * 0.7)
for x, y, sc in ((-28.4, 4.4, 1.0), (-25.4, -4.2, 0.9), (-7.2, 6.2, 0.8), (2.0, 16.8, 0.9), (-3.2, 23.0, 0.8)): boulder(x, y, sc)

# ---------- the sky: cloud everywhere. Banks between and under the islands, towers of it beyond, a sea of it below ----------
deco('cloud sea', -500, -500, 500, 500, -30.1, -30, 'cloud', mirror=False)
for i in range(46):       # the floor of cloud, well under the islands
    x, y = rnd.uniform(-75, 75), rnd.uniform(-65, 65); puff(x, y, rnd.uniform(-20, -10), rnd.uniform(9, 15), 0.42, mirror=False, n=3)
for i in range(36):       # banks drifting between the islands, at and just below their level
    a = rnd.uniform(0, 2 * PI); d = rnd.uniform(30, 62); puff(math.cos(a) * d, math.sin(a) * d * 0.85, rnd.uniform(-5, 4), rnd.uniform(5, 9), 0.5, mirror=False, k='blush' if i % 3 == 0 else 'cloud')
for x, y in ((-16, -9), (-15, 9.5), (16, 9), (15, -9.5), (0, 12), (0, -12), (-20, 24), (20, -24), (-33, 22), (33, -22), (-17, -15), (17, 15)): puff(x, y, rnd.uniform(-5.5, -3.5), rnd.uniform(4, 6), 0.5, mirror=False)
for i in range(14):       # towering cumulus far off
    a = i * 2 * PI / 14 + rnd.uniform(-0.1, 0.1); d = rnd.uniform(110, 170); x, y = math.cos(a) * d, math.sin(a) * d
    for k in range(4): puff(x + rnd.uniform(-10, 10), y + rnd.uniform(-10, 10), -12 + k * 13, rnd.uniform(18, 28) * (1 - k * 0.14), 0.7, mirror=False, n=2, k='blush' if (i + k) % 3 == 0 else 'cloud')
rainbow(-95, 70, 46, 0.6, z0=-20, w=1.1); rainbow(100, -40, 36, 2.0, z0=-18, w=0.9)
for x, y, z, s, k in ((-58, 30, 6, 5, 'mint'), (52, -44, -2, 7, 'pink'), (64, 22, 10, 4, 'sky'), (-50, -40, 2, 6, 'pink'), (10, 62, 8, 5, 'butter'), (-14, -64, 0, 6, 'mint')):   # far islets on their own clouds
    ico('islet', x, y, z, s, s * 0.8, s * 0.2, 'grass', mirror=False, sub=2); puff(x, y, z - s * 0.45, s * 1.25, 0.5, mirror=False)
    cyl('islet trunk', x + s * 0.2, y, z, z + s * 0.4, s * 0.05, 'bark', mirror=False, seg=6); ico('islet tree', x + s * 0.2, y, z + s * 0.55, s * 0.3, s * 0.3, s * 0.26, k, mirror=False, sub=2)
for x, y, z, k in ((-70, -18, 14, 'pink'), (48, 58, 20, 'butter'), (84, -12, 9, 'pink'), (-40, 66, 24, 'sky')):   # balloons adrift
    ico('balloon', x, y, z, 3.4, 3.4, 4.0, k, mirror=False, sub=3); ico('balloon band', x, y, z, 3.45, 3.45, 1.1, 'frame', mirror=False, sub=3)
    deco('balloon basket', x - 0.8, y - 0.8, x + 0.8, y + 0.8, z - 6.6, z - 5.5, 'basket', mirror=False)
    for dx, dy in ((-0.75, -0.75), (0.75, -0.75), (0.75, 0.75), (-0.75, 0.75)): bar('balloon rope', (x + dx, y + dy, z - 5.5), (x + dx * 2.6, y + dy * 2.6, z - 2.4), 0.03, 'rope', mirror=False)

# ---------- export ----------
def steps(s): return {'rect': sorted((s * -8.6, s * -6.0)) [:1] + [-2] + sorted((s * -8.6, s * -6.0))[1:] + [2], 'climb': [[s * -9.2, 0, 0], [s * -8.2, 0.2, 0], [s * -7.2, POD / 2, 0], [s * -6.0, POD, 0], [s * -4.8, POD, 0]]}
export('zenith', {
    'half': [HX, HY], 'roof': POD, 'holes': [[-200, -200, 200, 200]],
    'spawns': [[31.5, z] for z in (-9, -7, -5, -3, -1, 1, 3, 5, 7, 9)],
    'upper': [{'y': POD, 'bounds': {'minX': -6, 'maxX': 6, 'minZ': -5, 'maxZ': 5}, 'portals': [steps(1), steps(-1)]}],
    'pickups': [['health', 0, POD, 2.6], ['health', 0, POD, -2.6], ['ammo', -30, 0, 3], ['ammo', 30, 0, -3], ['ammo', 4, 0, -20], ['ammo', -4, 0, 20], ['health', -17.5, 0, -18], ['health', 17.5, 0, 18]],
})
