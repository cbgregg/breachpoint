"""Facade atlas: detailed windows, shutters, doors and shop fronts modelled in Blender and rendered face-on into
one texture, so every opening on a map's buildings carries real detail (frames, panes, curtains behind glass,
louvres, panelled doors, a stocked shop window) for the cost of a flat card.

    python3 tools/blender/facade_atlas.py <map>      (needs bpy and Pillow)

Writes assets/textures/<map>/atlas.webp (cut out: transparent around each piece) and tools/blender/<map>_atlas.json: for each piece its size in metres and
where it sits in the picture. Shutters and house doors are rendered in neutral grey so a map can tint them.
"""
import bpy, sys, os, math, json, random, tempfile
from mathutils import Vector
from PIL import Image

MAP = sys.argv[-1]; ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'); PPM = 330
bpy.ops.wm.read_factory_settings(use_empty=True)
rnd = random.Random(2)
def mat(name, rgb, rough=0.6, metal=0.0, trans=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if trans: b.inputs['Transmission Weight'].default_value = trans; b.inputs['IOR'].default_value = 1.1
    return m
STONE = mat('stone', (0.74, 0.69, 0.6), 0.85); WHITE = mat('white wood', (0.82, 0.8, 0.75), 0.45); GREY = mat('tintable', (0.8, 0.8, 0.8), 0.55)
GLASS = mat('glass', (0.85, 0.92, 0.95), 0.03, 0, 0.97); ROOM = mat('room', (0.02, 0.02, 0.025), 1.0); CURTAIN = mat('curtain', (0.8, 0.74, 0.6), 0.9); BRASS = mat('brass', (0.7, 0.5, 0.18), 0.3, 1.0)
TIMBER = mat('dark timber', (0.05, 0.1, 0.08), 0.45); SHELF = mat('shelf', (0.3, 0.2, 0.12), 0.7); IRON = mat('iron', (0.03, 0.03, 0.035), 0.5, 0.6)
def B(x0, x1, z0, z1, y0, y1, m, bevel=0.006):
    """A box: x across, z up, y into the wall (0 is the wall's face, negative stands proud of it)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)); o = bpy.context.object; o.scale = (x1 - x0, y1 - y0, z1 - z0); o.data.materials.append(m)
    if bevel: md = o.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = 2
    return o
def glazing(x0, x1, z0, z1, nx, nz, y=0.16, frame=WHITE, fw=0.055, curtain=True):
    """A glazed frame set back in its opening: frame, glazing bars, glass, a dark room behind, curtains."""
    B(x0, x1, z0, z1, y + 0.02, y + 0.03, GLASS, 0); B(x0 - 0.05, x1 + 0.05, z0 - 0.05, z1 + 0.05, y + 0.5, y + 0.52, ROOM, 0)
    for a, b in ((x0, x0 + fw), (x1 - fw, x1)): B(a, b, z0, z1, y, y + 0.05, frame)
    for a, b in ((z0, z0 + fw), (z1 - fw, z1)): B(x0 + fw, x1 - fw, a, b, y, y + 0.05, frame)
    for i in range(1, nx): c = x0 + i * (x1 - x0) / nx; B(c - 0.022 if i != nx // 2 or nx % 2 else c - 0.035, c + 0.022 if i != nx // 2 or nx % 2 else c + 0.035, z0, z1, y + 0.005, y + 0.045, frame)
    for i in range(1, nz): c = z0 + i * (z1 - z0) / nz; B(x0, x1, c - 0.018, c + 0.018, y + 0.008, y + 0.042, frame)
    if curtain:
        for a, b in ((x0 + fw, x0 + (x1 - x0) * 0.3), (x1 - (x1 - x0) * 0.3, x1 - fw)):
            for k in range(6): xx = a + (k + 0.5) * (b - a) / 6; B(xx - (b - a) / 12, xx + (b - a) / 12, z0 + fw, z1 - fw, y + 0.1 + (k % 2) * 0.03, y + 0.12 + (k % 2) * 0.03, CURTAIN, 0.01)
def reveal(x0, x1, z0, z1, d=0.16, sw=0.11, sill=True):
    """The opening itself: a stone surround standing proud of the wall, its reveals running back to the frame, a sill."""
    for a, b in ((x0 - sw, x0), (x1, x1 + sw)): B(a, b, z0, z1, -0.04, d, STONE)
    B(x0 - sw, x1 + sw, z1, z1 + sw, -0.04, d, STONE); B(x0 - sw - 0.03, x1 + sw + 0.03, z1 + sw, z1 + sw + 0.05, -0.07, 0.02, STONE)
    if sill: B(x0 - sw - 0.05, x1 + sw + 0.05, z0 - 0.09, z0, -0.12, d, STONE)
    else: B(x0 - sw, x1 + sw, z0 - 0.02, z0, -0.02, d + 0.3, STONE)
PIECES = {}
def piece(name, ox, build):
    """Build one piece at x offset ox; build() returns its bounds (x0, x1, z0, z1) to frame."""
    before = set(bpy.data.objects); x0, x1, z0, z1 = build()
    for o in bpy.data.objects:
        if o not in before: o.location.x += ox
    PIECES[name] = (ox + x0, ox + x1, z0, z1)
def window():
    reveal(-0.5, 0.5, 0, 1.5); glazing(-0.5, 0.5, 0, 1.5, 2, 3); return (-0.69, 0.69, -0.12, 1.69)
def window_small():
    reveal(-0.35, 0.35, 0, 0.8, sw=0.09); glazing(-0.35, 0.35, 0, 0.8, 2, 2, curtain=False)
    for i in range(5): xx = -0.28 + i * 0.14; B(xx - 0.012, xx + 0.012, 0, 0.8, 0.02, 0.04, IRON, 0)
    return (-0.5, 0.5, -0.11, 0.97)
def shutter():
    B(-0.24, -0.19, 0, 1.5, 0, 0.04, GREY); B(0.19, 0.24, 0, 1.5, 0, 0.04, GREY); B(-0.19, 0.19, 0, 0.06, 0, 0.04, GREY); B(-0.19, 0.19, 1.44, 1.5, 0, 0.04, GREY); B(-0.19, 0.19, 0.71, 0.85, 0, 0.04, GREY)
    for i in range(24):
        if 11 <= i <= 12: continue
        z = 0.085 + i * 0.058; o = B(-0.19, 0.19, z, z + 0.012, 0.0, 0.045, GREY, 0.002); o.rotation_euler = (math.radians(-32), 0, 0)
    B(-0.19, 0.19, 0.06, 1.44, 0.035, 0.04, ROOM, 0)
    B(0.14, 0.2, 0.7, 0.8, -0.015, 0, IRON); return (-0.25, 0.25, -0.01, 1.51)
def house_door(col=(0.07, 0.2, 0.14)):
    GREY = mat('door paint', col, 0.4); B(-0.5, 0.5, 0, 2.1, 0.1, 0.16, GREY)
    for r, (za, zb) in enumerate(((0.16, 0.72), (0.86, 1.42), (1.56, 1.96))):
        for xa, xb in ((-0.4, -0.06), (0.06, 0.4)): B(xa, xb, za, zb, 0.085, 0.11, GREY, 0.015); B(xa + 0.05, xb - 0.05, za + 0.05, zb - 0.05, 0.07, 0.09, GREY, 0.012)
    B(0.3, 0.36, 1.0, 1.14, 0.05, 0.085, BRASS); B(0.31, 0.35, 0.9, 0.94, 0.03, 0.085, BRASS); B(-0.14, 0.14, 1.22, 1.3, 0.06, 0.085, BRASS, 0.004)
    B(-0.5, 0.5, 2.1, 2.17, 0.06, 0.16, STONE); glazing(-0.5, 0.5, 2.17, 2.52, 3, 1, y=0.1, curtain=False); reveal(-0.5, 0.5, 0, 2.52, sill=False); B(-0.72, 0.72, -0.14, 0, -0.2, 0.2, STONE)
    return (-0.72, 0.72, -0.14, 2.72)
def balcony_door():
    reveal(-0.55, 0.55, 0, 2.2, sill=False); glazing(-0.55, 0.55, 0, 2.2, 2, 4)
    B(-0.55, 0.55, 0, 0.5, 0.15, 0.2, WHITE, 0.01); B(-0.45, -0.06, 0.07, 0.43, 0.135, 0.16, WHITE, 0.012); B(0.06, 0.45, 0.07, 0.43, 0.135, 0.16, WHITE, 0.012)
    return (-0.72, 0.72, -0.03, 2.4)
def shop_window():
    for a, b in ((-1.2, -1.1), (1.1, 1.2)): B(a, b, 0, 2.3, -0.03, 0.16, TIMBER)
    B(-1.1, 1.1, 2.18, 2.3, -0.03, 0.16, TIMBER); B(-1.25, 1.25, 2.3, 2.38, -0.07, 0.05, TIMBER); B(-1.2, 1.2, 0, 0.62, -0.02, 0.16, TIMBER)
    for i in range(3): xa = -1.05 + i * 0.72; B(xa, xa + 0.66, 0.1, 0.52, -0.035, 0.0, TIMBER, 0.014)
    B(-1.24, 1.24, 0.6, 0.67, -0.08, 0.1, TIMBER); glazing(-1.1, 1.1, 0.67, 2.18, 3, 1, y=0.1, frame=TIMBER, fw=0.04, curtain=False)
    B(-1.1, 1.1, 1.7, 2.18, 0.09, 0.1, TIMBER, 0)
    for i in range(1, 3): c = -1.1 + i * 2.2 / 3; B(c - 0.02, c + 0.02, 1.7, 2.18, 0.085, 0.12, TIMBER)
    for zs in (0.68, 1.18):   # shelves of goods behind the glass
        B(-1.05, 1.05, zs, zs + 0.03, 0.2, 0.5, SHELF, 0)
        x = -1.0
        while x < 0.95:
            w = rnd.uniform(0.08, 0.2); h = rnd.uniform(0.12, 0.4); m = mat('goods', (rnd.uniform(0.15, 0.9), rnd.uniform(0.15, 0.8), rnd.uniform(0.1, 0.6)), 0.5)
            if rnd.random() < 0.5: B(x, x + w, zs + 0.03, zs + 0.03 + h, 0.26, 0.26 + w, m, 0.01)
            else: bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=w / 2, depth=h, location=(x + w / 2, 0.3, zs + 0.03 + h / 2)); bpy.context.object.data.materials.append(m)
            x += w + rnd.uniform(0.02, 0.08)
    return (-1.26, 1.26, 0, 2.39)
def shop_door():
    for a, b in ((-0.6, -0.5), (0.5, 0.6)): B(a, b, 0, 2.3, -0.03, 0.16, TIMBER)
    B(-0.5, 0.5, 2.18, 2.3, -0.03, 0.16, TIMBER); B(-0.64, 0.64, 2.3, 2.38, -0.07, 0.05, TIMBER)
    B(-0.5, 0.5, 0, 0.75, 0.1, 0.15, TIMBER); B(-0.4, 0.4, 0.1, 0.65, 0.085, 0.11, TIMBER, 0.014); glazing(-0.5, 0.5, 0.75, 2.18, 1, 1, y=0.1, frame=TIMBER, fw=0.09, curtain=False)
    B(0.36, 0.4, 0.95, 1.3, 0.04, 0.07, BRASS); B(-0.5, 0.5, 0.72, 0.8, 0.09, 0.16, TIMBER); B(-0.16, 0.16, 1.5, 1.72, 0.105, 0.115, mat('open sign', (0.75, 0.7, 0.55), 0.6), 0.004)
    B(-0.66, 0.66, -0.1, 0, -0.16, 0.2, STONE); return (-0.66, 0.66, -0.1, 2.39)

# ---------- a supermarket's pieces (map 'mart') ----------
STEEL = mat('shelf steel', (0.78, 0.78, 0.76), 0.5, 0.3); CASE = mat('case white', (0.9, 0.9, 0.88), 0.35); ALU = mat('aluminium', (0.55, 0.57, 0.6), 0.35, 0.8); CARD = mat('cardboard', (0.5, 0.36, 0.2), 0.9)
GLOW = bpy.data.materials.new('case light'); GLOW.use_nodes = True; GLOW.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 1, 1, 1); GLOW.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 3.0
def colour(): 
    import colorsys; q = rnd.random()
    if q < 0.3: return mat('pack', rnd.choice(((0.86, 0.85, 0.8), (0.8, 0.74, 0.6), (0.5, 0.38, 0.24), (0.08, 0.08, 0.09), (0.7, 0.72, 0.74), (0.9, 0.88, 0.7))), 0.5)
    return mat('pack', colorsys.hsv_to_rgb(rnd.choice((0.0, 0.03, 0.08, 0.12, 0.3, 0.36, 0.58, 0.62, 0.66, 0.98)) + rnd.uniform(-0.02, 0.02), rnd.uniform(0.35, 0.85), rnd.uniform(0.3, 0.85)), 0.45)
def C(x, z0, h, r, y, m): bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=r, depth=h, location=(x, y, z0 + h / 2)); o = bpy.context.object; o.data.materials.append(m); bpy.ops.object.shade_smooth(); return o
def stock(x0, x1, z, room, y=0.06, kinds=('box', 'can', 'bottle', 'jar')):
    """A shelf's worth of goods between x0 and x1 standing on z: runs of one product several facings wide."""
    x = x0 + 0.02
    while x < x1 - 0.1:
        kind = rnd.choice(kinds); m = colour(); lab = colour() if rnd.random() < 0.7 else WHITE; n = rnd.randint(2, 5)
        if kind == 'box':
            w = rnd.uniform(0.11, 0.2); h = min(room - 0.03, rnd.uniform(0.2, 0.32))
            for i in range(n):
                if x + w > x1: break
                B(x, x + w - 0.008, z, z + h, y, y + 0.3, m, 0.004); B(x + 0.015, x + w - 0.023, z + h * 0.35, z + h * 0.8, y - 0.002, y + 0.01, lab, 0); x += w
        elif kind == 'can':
            r = rnd.uniform(0.035, 0.05); h = rnd.uniform(0.09, 0.13)
            for i in range(n + 1):
                if x + 2 * r > x1: break
                for t in range(max(1, min(3, int((room - 0.02) / h)))): C(x + r, z + t * h, h - 0.004, r, y + r + 0.01, STEEL if t < 0 else m); B(x + r * 0.25, x + r * 1.75, z + t * h + h * 0.2, z + t * h + h * 0.8, y + 0.004, y + 0.02, lab, 0)
                x += 2 * r + 0.006
        else:
            r = rnd.uniform(0.035, 0.048); h = min(room - 0.04, rnd.uniform(0.2, 0.3)) if kind == 'bottle' else rnd.uniform(0.12, 0.17)
            for i in range(n + 1):
                if x + 2 * r > x1: break
                C(x + r, z, h * (0.68 if kind == 'bottle' else 0.9), r, y + r + 0.01, m)
                if kind == 'bottle': C(x + r, z + h * 0.68, h * 0.26, r * 0.4, y + r + 0.01, m); C(x + r, z + h * 0.94, h * 0.06, r * 0.45, y + r + 0.01, lab)
                else: C(x + r, z + h * 0.9, h * 0.1, r * 1.02, y + r + 0.01, lab)
                B(x + r * 0.2, x + r * 1.8, z + h * 0.18, z + h * 0.5, y + 0.002, y + 0.02, lab, 0); x += 2 * r + 0.008
        x += rnd.uniform(0.0, 0.03)
def shelf(kinds=('box', 'can', 'bottle', 'jar')):
    def build():
        B(-0.6, 0.6, 0, 2.0, 0.44, 0.47, STEEL, 0); B(-0.6, -0.575, 0, 2.0, 0, 0.47, STEEL, 0.003); B(0.575, 0.6, 0, 2.0, 0, 0.47, STEEL, 0.003); B(-0.6, 0.6, 0, 0.14, 0.03, 0.47, mat('kick', (0.12, 0.12, 0.13), 0.6), 0.003)
        zs = (0.14, 0.52, 0.9, 1.27, 1.62)
        for i, z in enumerate(zs):
            B(-0.575, 0.575, z, z + 0.025, 0.02, 0.45, STEEL, 0.002); B(-0.575, 0.575, z - 0.012, z + 0.03, 0.0, 0.02, WHITE, 0.002)
            x = -0.54
            while x < 0.5: B(x, x + 0.07, z - 0.006, z + 0.024, -0.003, 0.0, mat('tag', (0.95, 0.85, 0.2) if rnd.random() < 0.75 else (0.85, 0.15, 0.12), 0.5), 0); x += rnd.uniform(0.12, 0.22)
            stock(-0.57, 0.57, z + 0.025, (zs[i + 1] if i < 4 else 1.98) - z - 0.03, kinds=kinds)
        return (-0.6, 0.6, 0, 2.0)
    return build
def freezer():
    B(-0.4, 0.4, 0, 2.1, 0.5, 0.52, CASE, 0); B(-0.36, 0.36, 0.2, 2.0, 0.49, 0.5, GLOW, 0)
    for z in (0.2, 0.62, 1.04, 1.46):
        B(-0.37, 0.37, z, z + 0.02, 0.1, 0.5, CASE, 0); stock(-0.35, 0.35, z + 0.02, 0.36, y=0.14, kinds=('box',))
    B(-0.34, 0.34, 0.22, 1.98, 0.05, 0.06, GLASS, 0)
    for a, b in ((-0.4, -0.34), (0.34, 0.4)): B(a, b, 0.16, 2.04, 0, 0.5, mat('door frame', (0.08, 0.08, 0.09), 0.4), 0.004)
    B(-0.34, 0.34, 1.98, 2.04, 0, 0.5, mat('door frame', (0.08, 0.08, 0.09), 0.4), 0.004); B(-0.34, 0.34, 0.16, 0.22, 0, 0.5, mat('door frame', (0.08, 0.08, 0.09), 0.4), 0.004)
    B(-0.4, 0.4, 0, 0.16, 0.0, 0.5, mat('kick', (0.12, 0.12, 0.13), 0.6), 0.003); B(-0.4, 0.4, 2.04, 2.1, 0, 0.5, CASE, 0.003); B(0.25, 0.28, 0.9, 1.3, -0.04, 0, ALU, 0.004)
    return (-0.4, 0.4, 0, 2.1)
def cooler():
    B(-0.6, 0.6, 0, 2.0, 0.5, 0.52, CASE, 0); B(-0.58, 0.58, 0.4, 1.8, 0.49, 0.5, GLOW, 0); B(-0.6, 0.6, 0, 0.4, -0.02, 0.5, CASE, 0.01); B(-0.6, 0.6, 0.34, 0.4, -0.03, 0.0, mat('bumper', (0.1, 0.35, 0.2), 0.5), 0.004)
    B(-0.6, 0.6, 1.8, 2.0, 0.0, 0.5, CASE, 0.01); B(-0.6, 0.6, 1.82, 1.98, -0.005, 0.0, mat('header', (0.1, 0.35, 0.2), 0.5), 0)
    for z in (0.4, 0.76, 1.1, 1.44):
        B(-0.59, 0.59, z, z + 0.02, 0.08, 0.5, CASE, 0); B(-0.59, 0.59, z - 0.01, z + 0.03, 0.06, 0.08, WHITE, 0); stock(-0.57, 0.57, z + 0.02, 0.3, y=0.1, kinds=('box', 'bottle', 'jar'))
    return (-0.6, 0.6, 0, 2.0)
def label(body, x, z, size, m, y=-0.01):
    bpy.ops.object.text_add(location=(x, y, z), rotation=(math.pi / 2, 0, 0)); o = bpy.context.object; o.data.body = body; o.data.size = size; o.data.align_x = 'CENTER'; o.data.align_y = 'CENTER'; o.data.extrude = 0.004; o.data.materials.append(m)
def poster(top, big, small, bg, fg):
    def build():
        B(-0.45, 0.45, 0, 1.2, 0, 0.02, mat('poster', bg, 0.6), 0); B(-0.41, 0.41, 0.04, 1.16, -0.002, 0, mat('poster in', tuple(min(1, c * 1.25 + 0.05) for c in bg), 0.6), 0)
        f = mat('ink', fg, 0.6); label(top, 0, 0.98, 0.14, f); label(big, 0, 0.62, 0.3, f); label(small, 0, 0.24, 0.11, f); return (-0.45, 0.45, 0, 1.2)
    return build
def storefront():
    B(-1.5, 1.5, 0, 2.8, 0.3, 0.32, ROOM, 0); B(-1.45, 1.45, 0.3, 2.74, 0.04, 0.05, GLASS, 0)
    for a, b in ((-1.5, -1.43), (-0.035, 0.035), (1.43, 1.5)): B(a, b, 0, 2.8, 0, 0.1, ALU, 0.004)
    for a, b in ((0.24, 0.31), (2.1, 2.16), (2.73, 2.8)): B(-1.5, 1.5, a, b, 0.002, 0.098, ALU, 0.004)
    B(-1.5, 1.5, 0, 0.24, 0.01, 0.1, mat('stall riser', (0.3, 0.32, 0.34), 0.5), 0.004)
    B(-1.2, -0.3, 0.7, 1.9, 0.07, 0.08, mat('promo', (0.9, 0.75, 0.1), 0.6), 0); f = mat('ink', (0.75, 0.08, 0.06), 0.6); label('SALE', -0.75, 1.5, 0.3, f, 0.065); label('this week', -0.75, 1.05, 0.13, f, 0.065)
    B(0.35, 1.15, 0.9, 1.9, 0.07, 0.08, mat('promo2', (0.1, 0.4, 0.22), 0.6), 0); label('FRESH', 0.75, 1.55, 0.2, WHITE, 0.065); label('every day', 0.75, 1.2, 0.11, WHITE, 0.065)
    return (-1.5, 1.5, 0, 2.8)
def rollup():
    for i in range(30): z = i * 0.1; o = B(-1.5, 1.5, z, z + 0.095, 0.02, 0.05, STEEL, 0.008)
    for a, b in ((-1.6, -1.5), (1.5, 1.6)): B(a, b, 0, 3.1, -0.02, 0.1, mat('guide', (0.75, 0.6, 0.1), 0.5), 0.004)
    B(-1.6, 1.6, 3.0, 3.25, -0.05, 0.1, STEEL, 0.006); B(-0.2, 0.2, 0.02, 0.1, -0.02, 0.02, mat('kick', (0.1, 0.1, 0.1), 0.5), 0.004); return (-1.6, 1.6, 0, 3.25)
def cartons():
    B(-0.6, 0.6, 0, 0.14, 0, 0.5, SHELF, 0.004)
    z = 0.14
    while z < 1.45:
        h = rnd.uniform(0.28, 0.4); x = -0.58
        while x < 0.5:
            w = min(rnd.uniform(0.3, 0.5), 0.58 - x); B(x, x + w - 0.01, z, z + h - 0.008, rnd.uniform(0, 0.04), 0.5, CARD, 0.006); B(x, x + w - 0.01, z + h - 0.06, z + h - 0.008, -0.002, 0.05, mat('tape', (0.62, 0.5, 0.3), 0.4), 0)
            if rnd.random() < 0.5: B(x + 0.05, x + 0.17, z + 0.06, z + 0.16, -0.004, 0.05, WHITE, 0)
            x += w
        z += h
    return (-0.6, 0.6, 0, 1.55)
if MAP == 'mart':
    order = [('shelf_a', shelf(('box',))), ('shelf_b', shelf(('can', 'jar'))), ('shelf_c', shelf(('bottle',))), ('shelf_d', shelf()), ('shelf_e', shelf(('box', 'jar'))), ('freezer', freezer), ('cooler', cooler), ('cooler_b', cooler), ('storefront', storefront),
             ('rollup', rollup), ('cartons', cartons), ('cartons_b', cartons), ('poster_a', poster('TODAY', '2 for 1', 'all bakery', (0.85, 0.12, 0.1), (1, 0.95, 0.8))), ('poster_b', poster('FRESHWAY', 'SAVE', 'with your card', (0.95, 0.8, 0.1), (0.1, 0.3, 0.15))), ('poster_c', poster('LOCAL', 'FARM', 'fresh produce', (0.1, 0.4, 0.2), (1, 1, 0.9)))]
else: order = [('window', window), ('shutter', shutter), ('house_door', house_door), ('house_door2', lambda: house_door((0.3, 0.05, 0.05))), ('balcony_door', balcony_door), ('shop_window', shop_window), ('shop_door', shop_door), ('window_small', window_small)]
for i, (n, f) in enumerate(order): piece(n, i * 6.0, f)
# the wall behind everything (not rendered into the pieces: they are cut out by their bounds), light, camera
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 96; sc.cycles.device = 'CPU'; sc.cycles.use_denoising = True
sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.file_format = 'PNG'; sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.78, 0.84, 0.95, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.55
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 1.7; sun.angle = 0.2; so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(52), 0, math.radians(-28))
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co; co.rotation_euler = (math.pi / 2, 0, 0)
tmp = tempfile.mkdtemp(); shots = {}
for n, (x0, x1, z0, z1) in PIECES.items():
    wd, ht = x1 - x0, z1 - z0; sc.render.resolution_x = round(wd * PPM); sc.render.resolution_y = round(ht * PPM); cam.ortho_scale = max(wd, ht)
    co.location = ((x0 + x1) / 2, -8, (z0 + z1) / 2); sc.render.filepath = os.path.join(tmp, n + '.png'); bpy.ops.render.render(write_still=True); shots[n] = (wd, ht)
# pack into one picture, left to right in rows
ims = {n: Image.open(os.path.join(tmp, n + '.png')).convert('RGBA') for n in shots}; W = 2048; x = y = rowh = 0; place = {}
for n, im in ims.items():
    if x + im.width + 4 > W: x = 0; y += rowh + 4; rowh = 0
    place[n] = (x, y); x += im.width + 4; rowh = max(rowh, im.height)
H = 1 << (y + rowh - 1).bit_length(); atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0)); meta = {}
for n, im in ims.items():
    px, py = place[n]; atlas.paste(im, (px, py)); meta[n] = {'origin': [round(PIECES[n][0] - list(PIECES).index(n) * 6.0, 3), round(PIECES[n][2], 3)], 'size': [round(shots[n][0], 3), round(shots[n][1], 3)], 'uv': [px / W, 1 - (py + im.height) / H, (px + im.width) / W, 1 - py / H]}
os.makedirs(os.path.join(ROOT, 'assets', 'textures', MAP), exist_ok=True); atlas.save(os.path.join(ROOT, 'assets', 'textures', MAP, 'atlas.webp'), quality=90)
json.dump(meta, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), MAP + '_atlas.json'), 'w'), indent=1)
atlas.convert('RGB').save(os.path.join(tmp, 'preview.jpg')); print('ATLAS', atlas.size, tmp)
