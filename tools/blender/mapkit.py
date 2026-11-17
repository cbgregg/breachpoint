"""Shared helpers for maps authored as Blender scenes (tools/blender/<map>.py) and exported for the game.

A map script calls setup(palette, ...) and then builds with box / deco / cyl / bar / text / wall_x / wall_y / prop /
card / wear / paint / vehicle, and ends with export(name, data). Blender axes: x east, y north, z up; the game's are
x east, y up, z south, so a point (x, y, z) here is (x, z, -y) there. Unless told otherwise everything is built
twice: as given, and turned half a turn about the middle of the map for the other team.

A material's name is '<texture set>:<what it is>'; the game swaps in the texture set of that name (its own, or the
map's own when it starts with v_), tinted with the colour given here; UVs are in metres. 'flat' has no texture.
"""
import bpy, json, os, math, re, subprocess, random
from mathutils import Matrix, Vector

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
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
M, EMIT, ROUGH, METAL, EMIT_K, DEFAULT, SHADE = {}, {}, {}, {}, {}, ['stucco'], {}
def setup(palette, emit=None, rough=None, metal=None, emit_strength=None, default=None, shade=None):
    """palette: key -> ('<set>:<what>', 0xrrggbb). emit: key -> colour of a glowing material. default: box()'s material.
    shade: key -> the colour its undersides and feet fall to (baked into vertex colours: see shade_mesh)."""
    SHADE.update(shade or {}); M.update(palette); EMIT.update(emit or {}); ROUGH.update(rough or {}); METAL.update(metal or {}); EMIT_K.update(emit_strength or {})
    if default: DEFAULT[0] = default
def m_(k):
    if k in EMIT: return mat('flat:' + k, EMIT[k], 0.4, 0, EMIT_K.get(k, 4.0))
    name, col = M[k]
    return mat(name, col, ROUGH.get(k, 0.9), METAL.get(k, 0.0))

boxes, vehicles = [], []   # collision in the game's axes: [minx, miny, minz, maxx, maxy, maxz, surface]

CUBE_V = [(-.5, -.5, -.5), (.5, -.5, -.5), (.5, .5, -.5), (-.5, .5, -.5), (-.5, -.5, .5), (.5, -.5, .5), (.5, .5, .5), (-.5, .5, .5)]
CUBE_F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
def cube(name, loc, scale, rot=(0, 0, 0)):
    """A unit cube made directly as mesh data (Blender's add-a-cube operator slows to a crawl in a scene of thousands)."""
    me = bpy.data.meshes.new(name); me.from_pydata(CUBE_V, [], CUBE_F); me.uv_layers.new(name='UVMap'); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); o.location = loc; o.scale = scale; o.rotation_euler = rot
    return o
def quad(name):
    """A unit square in the xy plane with 0..1 UVs, made directly as mesh data (see cube)."""
    me = bpy.data.meshes.new(name); me.from_pydata([(-.5, -.5, 0), (.5, -.5, 0), (.5, .5, 0), (-.5, .5, 0)], [], [(0, 1, 2, 3)]); uv = me.uv_layers.new(name='UVMap')
    for l, c in zip(uv.data, ((0, 0), (1, 0), (1, 1), (0, 1))): l.uv = c
    me.update(); o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); return o
def world_of(o):
    """An unparented object's world matrix from its own transform (no scene update needed: far quicker than waiting on one per piece)."""
    return Matrix.LocRotScale(o.location, o.rotation_euler, o.scale)
def shade_mesh(o, hexcol):
    """Soft shading baked into vertex colours (they multiply the material's colour in the game): white where a
    surface faces up or is high on its object, falling to `hexcol` where it faces down or is at the foot. Gives
    clouds, canopies and plain stone their form whatever the graphics setting."""
    me = o.data; sh = [lin(((hexcol >> b) & 255) / 255) for b in (16, 8, 0)]
    mw = world_of(o); n3 = mw.to_3x3()
    zs = [(mw @ v.co).z for v in me.vertices]; z0 = min(zs); span = max(max(zs) - z0, 1e-6)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for p in me.polygons:
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            n = (n3 @ (me.vertices[vi].normal if p.use_smooth else p.normal)).normalized()
            t = 0.6 * (n.z * 0.5 + 0.5) + 0.4 * (zs[vi] - z0) / span; t = t * t * (3 - 2 * t)
            ca.data[li].color = (sh[0] + (1 - sh[0]) * t, sh[1] + (1 - sh[1]) * t, sh[2] + (1 - sh[2]) * t, 1)
    me.color_attributes.active_color = ca
def finish(o, k, mirror, uv=True):
    """Material, metre UVs, and the half-turn twin."""
    o.data.materials.append(m_(k)); mw = world_of(o)
    if uv and o.data.uv_layers:
        uvl = o.data.uv_layers.active.data; n3 = mw.to_3x3()
        for p in o.data.polygons:
            n = (n3 @ p.normal).normalized(); ax = max(range(3), key=lambda i: abs(n[i]))
            for li in p.loop_indices:
                c = mw @ o.data.vertices[o.data.loops[li].vertex_index].co
                uvl[li].uv = (c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y)
    if k in SHADE: shade_mesh(o, SHADE[k])
    if mirror:
        t = o.copy(); t.data = o.data.copy(); t.name = o.name + '.E'; bpy.context.collection.objects.link(t); t.matrix_world = HALF_TURN @ mw
    return o

def box(name, x0, y0, x1, y1, z0, z1, k=None, solid=True, surface='concrete', mirror=True, top=None):
    """An axis-aligned block (and its half-turn twin unless mirror=False). top: collision reaches higher than what's drawn."""
    o = cube(name, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (abs(x1 - x0), abs(y1 - y0), z1 - z0))
    finish(o, k or DEFAULT[0], mirror)
    if solid:
        for s in ((1, -1) if mirror else (1,)):
            a0, a1 = sorted((s * x0, s * x1)); b0, b1 = sorted((s * y0, s * y1))
            boxes.append([round(a0, 3), round(z0, 3), round(-b1, 3), round(a1, 3), round(top or z1, 3), round(-b0, 3), surface])
    return o
def deco(name, x0, y0, x1, y1, z0, z1, k, mirror=True):
    return box(name, x0, y0, x1, y1, z0, z1, k, solid=False, mirror=mirror)
def tube(name, seg, r1, r2, depth, loc):
    """A cylinder or cone along z, made directly as mesh data (see cube)."""
    ring = lambda r, z: [(r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z) for i in range(seg)]
    v = ring(r1, -depth / 2) + ring(max(r2, 1e-4), depth / 2)
    f = [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)] + [tuple(range(seg - 1, -1, -1)), tuple(range(seg, 2 * seg))]
    me = bpy.data.meshes.new(name); me.from_pydata(v, [], f); me.uv_layers.new(name='UVMap'); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); o.location = loc; return o
def cyl(name, x, y, z0, z1, r, k, mirror=True, seg=10, r2=None, rot=None):
    o = tube(name, seg, r, r if r2 is None else r2, z1 - z0, (x, y, (z0 + z1) / 2))
    if rot: o.rotation_euler = rot
    return finish(o, k, mirror, uv=False)
def bar(name, a, b, r, k, mirror=True):
    """A thin round bar from point a to point b."""
    a, b = Vector(a), Vector(b); d = b - a
    o = tube(name, 6, r, r, d.length, (a + b) / 2); o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return finish(o, k, mirror, uv=False)
def text(body, x, y, z, yaw, size, k, mirror=False, depth=0.03, half_turn=False):
    """Lettering standing upright, centred on (x, y, z), reading left to right for someone it faces (yaw 0 faces south)."""
    bpy.ops.object.text_add(location=(0, 0, 0))
    o = bpy.context.object; o.data.body = body; o.data.resolution_u = 2; o.data.size = size; o.data.extrude = depth; o.data.align_x = 'CENTER'; o.data.align_y = 'CENTER'
    bpy.ops.object.convert(target='MESH'); o = bpy.context.object; o.name = 'text ' + body
    o.matrix_world = (HALF_TURN if half_turn else Matrix.Identity(4)) @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X')
    return finish(o, k, mirror, uv=False)

KITDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'kit')
KIT = {}
def kit(name):
    if name not in KIT:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(KITDIR, name + '.glb'))
        bpy.context.view_layer.update()
        KIT[name] = [(o, o.matrix_world.copy()) for o in bpy.data.objects if o not in before and o.type == 'MESH']
        for o in bpy.data.objects:
            if o not in before: o['kit'] = 1
    return KIT[name]
def prop(name, x, y, z=0, yaw=0, scale=1, mirror=True, solid=None, only=None):
    """A model from tools/blender/kit (CC0, Poly Haven), base at (x, y, z). solid = (w, d, h, soft): its collision, centred
    here; soft stops players but not bullets (a chair, a plant)."""
    for s in ((1, -1) if mirror else (1,)):
        m4 = (HALF_TURN if s < 0 else Matrix.Identity(4)) @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, 'Z') @ (Matrix.Diagonal((*scale, 1)) if isinstance(scale, tuple) else Matrix.Scale(scale, 4))
        for o, mw in kit(name):
            if only and not re.search(only, o.name): continue
            c = o.copy(); c.data = o.data.copy(); del c['kit']; bpy.context.collection.objects.link(c); c.parent = None; c.matrix_world = m4 @ mw
        if solid:
            w, d, h, soft = solid
            boxes.append([round(s * x - w / 2, 3), round(z, 3), round(-s * y - d / 2, 3), round(s * x + w / 2, 3), round(z + h, 3), round(-s * y + d / 2, 3), 'wood', 1 if soft else 0])
def card(x, y, h, v, aspect=0.5, mirror=False):
    """A tree drawn on two crossed cards (assets/textures/<map>/cards.png holds two views side by side). h is the
    card's height; aspect its width over that."""
    for a in (0.4, 0.4 + math.pi / 2):
        bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, h / 2 - 0.15)); o = bpy.context.object; o.name = 'tree card'
        o.scale = (h * aspect, h, 1); o.rotation_euler = (math.pi / 2, 0, a + x)
        for l in o.data.uv_layers.active.data: l.uv = ((v + l.uv.x) / 2, l.uv.y)
        finish(o, 'firs', mirror, uv=False)
ATLAS = {}
def use_atlas(name):
    """Load a map's facade atlas (made by facade_atlas.py) for facade()."""
    ATLAS.update(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), name + '_atlas.json'))))
def facade(piece, x, y, z, yaw=0, k='atlas', mirror=True):
    """A window, shutter, door or shop front from the atlas, flat against a wall. (x, y, z) is where the piece's own
    origin sits (the middle of an opening's foot); yaw 0 faces south, pi/2 east. k: its material (its colour tints it)."""
    p = ATLAS[piece]; (ox, oz), (w, h), (u0, v0, u1, v1) = p['origin'], p['size'], p['uv']
    o = quad(piece); o.scale = (w, h, 1); o.rotation_euler = (math.pi / 2, 0, yaw)
    c, s_ = math.cos(yaw), math.sin(yaw); a = ox + w / 2; o.location = (x + c * a, y + s_ * a, z + oz + h / 2)
    for l in o.data.uv_layers.active.data: l.uv = (u0 + l.uv.x * (u1 - u0), v0 + l.uv.y * (v1 - v0))
    finish(o, k, mirror, uv=False)
def pool(x, y, w, d, k, z=0.03, yaw=0, mirror=True):
    """A soft-edged patch on the floor (assets/textures/<map>/soft.png): a contact shadow spreading from under a
    piece of furniture, or a pool of light under a lamp, by its material k ('soft:shadow' / 'soft:... light')."""
    if not POOLS[0]: return
    o = quad('soft'); o.location = (x, y, z); o.scale = (w, d, 1); o.rotation_euler = (0, 0, yaw); finish(o, k, mirror, uv=False)
def leafquad(name, pts, half, k, mirror):
    """One cut-out from the foliage atlas (assets/textures/<map>/foliage.png: a fir bough in its left half, lying
    along u from the trunk to the tip; a cluster of leaves in its right half) on the quad pts."""
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(p) for p in pts], [], [(0, 1, 2, 3)]); uv = me.uv_layers.new(name='UVMap')
    for l, c in zip(uv.data, ((0, 0), (1, 0), (1, 1), (0, 1))): l.uv = ((half + c[0]) / 2, c[1])
    me.update(); o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); finish(o, k, mirror, uv=False)
def fir(x, y, h, k='fir', bark='bark', mirror=False, seed=0):
    """A fir in the round: a tapering trunk, and tier on tier of boughs drooping from it all the way up, each tier
    turned against the last, so it has depth from every side and from above. About 130 triangles."""
    r = random.Random(int(x * 31 + y * 17 + seed)); cyl('fir trunk', x, y, 0, h * 0.96, 0.1 + h * 0.014, bark, mirror=mirror, seg=7, r2=0.03)
    tiers = max(5, int(h / 1.25)); z0 = h * r.uniform(0.16, 0.26); rmax = h * r.uniform(0.17, 0.22)
    for t in range(tiers):
        f = t / (tiers - 1); z = z0 + (h * 0.97 - z0) * f; L = rmax * (1 - f) ** 0.85 + 0.35; n = 6 if f < 0.6 else 5; a0 = r.uniform(0, 6.3)
        for i in range(n):
            a = a0 + i * 2 * math.pi / n + r.uniform(-0.2, 0.2); Lb = L * r.uniform(0.82, 1.1); wd = Lb * 0.5; drop = Lb * r.uniform(0.28, 0.5) * (1 - f * 0.6); ca, sa = math.cos(a), math.sin(a)
            P = lambda u, v, dz: (x + ca * u - sa * v, y + sa * u + ca * v, z + dz)
            leafquad('fir bough', (P(0.02, -wd, 0.1), P(Lb, -wd, -drop), P(Lb, wd, -drop), P(0.02, wd, 0.1)), 0, k, mirror)
    for a in (0.3, 1.87):   # the leader
        ca, sa = math.cos(a), math.sin(a); wd = h * 0.035 + 0.25
        leafquad('fir tip', ((x - ca * wd, y - sa * wd, h * 0.86), (x - ca * wd, y - sa * wd, h * 1.04), (x + ca * wd, y + sa * wd, h * 1.04), (x + ca * wd, y + sa * wd, h * 0.86)), 0, k, mirror)
def broadleaf(x, y, h, k='leaf', bark='bark', mirror=False, seed=0):
    """A broadleaf in the round: a trunk that forks, and a crown of leaf clusters turned every way."""
    r = random.Random(int(x * 13 + y * 29 + seed)); th = h * 0.5; cyl('tree trunk', x, y, 0, th, 0.12 + h * 0.016, bark, mirror=mirror, seg=8, r2=0.08 + h * 0.006)
    cz, rx, rz = h * 0.7, h * 0.3, h * 0.26
    for i in range(4): a = i * 1.57 + r.uniform(0, 1); bar('tree limb', (x, y, th - 0.3), (x + math.cos(a) * rx * 0.6, y + math.sin(a) * rx * 0.6, cz + r.uniform(-0.1, 0.25) * h), 0.05 + h * 0.004, bark, mirror=mirror)
    for i in range(26):
        u, v, w = r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1); d = max(1e-3, math.sqrt(u * u + v * v + w * w)); q = r.uniform(0.35, 1.0) / d
        c = Vector((x + u * q * rx, y + v * q * rx, cz + w * q * rz)); s = h * r.uniform(0.15, 0.22)
        e1 = Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-0.5, 0.5))).normalized(); e2 = e1.cross(Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1))).normalized()).normalized()
        leafquad('leaf cluster', (c - e1 * s - e2 * s, c + e1 * s - e2 * s, c + e1 * s + e2 * s, c - e1 * s + e2 * s), 1, k, mirror)
def wear(kind, x, y, w, d, yaw=0, z=0.006, mirror=True):
    """Ground wear from the atlas (assets/textures/vacancy/decals.png): 0 oil stain, 1 cracks, 2 tar patch, 3 tyre marks."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, z)); o = bpy.context.object; o.name = 'wear'; o.scale = (w, d, 1); o.rotation_euler = (0, 0, yaw)
    for l in o.data.uv_layers.active.data: l.uv = ((kind % 2 + l.uv.x) / 2, 1 - (kind // 2 + 1 - l.uv.y) / 2)
    finish(o, 'decal', mirror, uv=False)
def paint(body, x, y, yaw, size, mirror=True):
    """Lettering painted flat on the ground, read from the south when yaw is 0."""
    bpy.ops.object.text_add(location=(0, 0, 0)); o = bpy.context.object; o.data.body = body; o.data.resolution_u = 2; o.data.size = size; o.data.align_x = 'CENTER'; o.data.align_y = 'CENTER'
    bpy.ops.object.convert(target='MESH'); o = bpy.context.object; o.name = 'painted ' + body
    o.matrix_world = Matrix.Translation((x, y, 0.013)) @ Matrix.Rotation(yaw, 4, 'Z')
    finish(o, 'line', mirror, uv=False)

def wall_x(name, y0, y1, xa, xb, z1, openings=(), k=None):
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
def wall_y(name, x0, x1, ya, yb, z1, openings=(), k=None):
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
def vehicle(slot, x0, y0, x1, y1, h, yaw):
    """A parked vehicle's footprint: the game draws its model here (nose to `yaw`, 0 = east) and fits the collision to it."""
    for s in (1, -1):
        a0, a1 = sorted((s * x0, s * x1)); b0, b1 = sorted((s * y0, s * y1))
        vehicles.append({'slot': slot, 'x': round((a0 + a1) / 2, 3), 'z': round(-(b0 + b1) / 2, 3), 'w': round(a1 - a0, 3), 'd': round(b1 - b0, 3), 'h': h, 'yaw': round(yaw + (math.pi if s < 0 else 0), 4)})
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, h / 2)); o = bpy.context.object; o.scale = (x1 - x0, y1 - y0, h); o.name = 'VEHICLE ' + slot
    o.data.materials.append(m_('cover')); o['vehicle'] = slot   # (kept in the .blend as a stand-in; not exported)

def cut(kind, x, y, z0, w, h, yaw=0, mirror=True, off=0.03):
    """A cut-out from the map's greenery atlas (assets/textures/<map>/cutouts.png: 0 ivy, 1 hanging vines, 2 a shrub,
    3 tall grass), standing upright with its foot at z0, facing south at yaw 0 and `off` metres proud of (x, y)."""
    o = quad('greenery')
    for l in o.data.uv_layers.active.data: l.uv = ((kind % 2 + l.uv.x) / 2, 1 - (kind // 2 + 1 - l.uv.y) / 2)
    o.location = (x + math.sin(yaw) * off, y - math.cos(yaw) * off, z0 + h / 2); o.rotation_euler = (math.pi / 2, 0, yaw); o.scale = (w, h, 1)
    return finish(o, 'cut', mirror, uv=False)
def slab(name, cx, cy, cz, sx, sy, sz, rot, k, mirror=True):
    """A box turned any way (rot: Euler angles), drawn only: a sloped roof, an awning, a brace."""
    o = cube(name, (cx, cy, cz), (sx, sy, sz), rot)
    return finish(o, k, mirror)
def tri(name, pts, k, mirror=True):
    """A flat triangle seen from both sides (a pennant)."""
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(p) for p in pts], [], [(0, 1, 2), (2, 1, 0)]); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    return finish(o, k, mirror, uv=False)
def ico(name, x, y, z, sx, sy, sz, k, mirror=True, sub=2, rot=(0, 0, 0)):
    """A smooth blob (a boulder, a cloud, a canopy): an icosphere scaled to sx, sy, sz radii."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=1, location=(x, y, z)); o = bpy.context.object; o.name = name; o.scale = (sx, sy, sz); o.rotation_euler = rot
    bpy.ops.object.shade_smooth()
    return finish(o, k, mirror, uv=False)
def void(rects, half, step=0.5, depth=-30):
    """A map with no ground (floating islands): rects = the [x0, y0, x1, y1] you can stand on at z = 0 (this half's and
    their twins are both taken). Everywhere else gets a strip far below that only tells bots not to walk there."""
    hx, hy = half; nx, ny = int(2 * hx / step), int(2 * hy / step)
    both = list(rects) + [[-r[2], -r[3], -r[0], -r[1]] for r in rects]
    solid = lambda cx, cy: any(r[0] - 0.01 <= cx <= r[2] + 0.01 and r[1] - 0.01 <= cy <= r[3] + 0.01 for r in both)
    rows = []
    for j in range(ny):
        cy = -hy + (j + 0.5) * step; runs = []; i = 0
        while i < nx:
            if solid(-hx + (i + 0.5) * step, cy): i += 1; continue
            i0 = i
            while i < nx and not solid(-hx + (i + 0.5) * step, cy): i += 1
            runs.append((i0, i))
        rows.append(runs)
    j = 0
    while j < ny:   # merge identical neighbouring rows
        j0 = j
        while j < ny and rows[j] == rows[j0]: j += 1
        for i0, i1 in rows[j0]:
            x0, x1, y0, y1 = -hx + i0 * step, -hx + i1 * step, -hy + j0 * step, -hy + j * step
            boxes.append([round(x0, 3), depth, round(-y1, 3), round(x1, 3), depth + 0.1, round(-y0, 3), 'ground', 0, 1])
def collide(x0, y0, x1, y1, z0, z1, surface='wood', soft=0, mirror=True):
    """Collision alone, for something drawn with other pieces (and its twin's)."""
    for s in ((1, -1) if mirror else (1,)):
        a0, a1 = sorted((s * x0, s * x1)); b0, b1 = sorted((s * y0, s * y1))
        boxes.append([round(a0, 3), round(z0, 3), round(-b1, 3), round(a1, 3), round(z1, 3), round(-b0, 3), surface] + ([1] if soft else []))

DOOR = (1.5, 0, 2.2); WIN = (1.8, 1.0, 2.1)   # an opening's width, sill, head

POOLS = [True]
def bake_light(name, size=2048, samples=32, sky=(0.78, 0.86, 1.0), sky_k=1.0, emit_k=1.0, scale=0.5, skip=('card', 'decal', 'soft', 'cutout'), hide=('glass', 'water'), only=None):
    """Bake the scene's indirect light (the sky and every glowing material; not the sun, which the game casts live)
    with Cycles into one light map, assets/textures/<name>/light.jpg, on a second UV set unwrapped here. Call from
    export() once the scene is one mesh per material. Stored at `scale` of its value so bright pools fit."""
    import numpy as np
    from PIL import Image
    objs = [o for o in bpy.data.objects if o.type == 'MESH']; bake = []
    for o in objs:
        m = o.data.materials[0] if o.data.materials else None; nm = m.name if m else ''
        glow = bool(m and m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value > 0)
        if nm.split(':')[0] in skip or any(h in nm for h in hide): o.hide_render = True
        elif glow: m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value *= emit_k
        elif only is None or re.search(only, nm.split(':')[-1]): bake.append(o)   # (only: the big surfaces; small parts would eat the map)
    import time; t0 = time.time()
    bpy.ops.object.select_all(action='DESELECT')
    for o in bake:
        if not o.data.uv_layers: o.data.uv_layers.new(name='UVMap')
        o.data.uv_layers.active = o.data.uv_layers.new(name='Light'); o.select_set(True)
    bpy.context.view_layer.objects.active = bake[0]
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale(); bpy.ops.uv.pack_islands(margin=0.0012); bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('light', size, size, float_buffer=True)
    for o in bake:
        nt = o.data.materials[0].node_tree; nd = nt.nodes.new('ShaderNodeTexImage'); nd.image = img; nt.nodes.active = nd
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples; sc.cycles.use_denoising = True; sc.cycles.max_bounces = 4
    w = bpy.data.worlds.new('sky'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (*sky, 1); bg.inputs[1].default_value = sky_k
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=8, use_clear=True)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)[::-1, :, :3] * scale
    out = os.path.join(ROOT, 'assets', 'textures', name); os.makedirs(out, exist_ok=True)
    from PIL import ImageFilter
    Image.fromarray((np.clip(px, 0, 1) ** (1 / 2.2) * 255).astype('uint8')).filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(0.8)).save(os.path.join(out, 'light.jpg'), quality=90)
    print('bake seconds', round(time.time() - t0))
    print('light map: mean', float(px.mean()), 'max', float(px.max()), 'clipped', float((px > 1).mean()))
    for o in bake: o.data.uv_layers.active = o.data.uv_layers[0]; o.data.uv_layers[0].active_render = True
def export(name, data, bake=None):
    """Save the editable scene, export the game's copy (one mesh per material) and its data module."""
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'assets', 'maps', name + '.blend'))   # (keeps every named piece)
    try: os.remove(os.path.join(ROOT, 'assets', 'maps', name + '.blend1'))
    except OSError: pass
    for o in [o for o in bpy.data.objects if 'vehicle' in o or 'kit' in o or o.type != 'MESH']: bpy.data.objects.remove(o)
    by = {}
    for o in list(bpy.data.objects): by.setdefault(o.data.materials[0].name if o.data.materials and o.data.materials[0] else 'none', []).append(o)
    tris = 0
    for mname, objs in by.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        if len(objs) > 1: bpy.ops.object.join()
        bpy.context.object.name = mname
        tris += sum(len(p.vertices) - 2 for p in bpy.context.object.data.polygons)
    if bake is not None: bake_light(name, **bake)
    glb = os.path.join(ROOT, 'assets', 'maps', name + '.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True, export_yup=True, export_vertex_color='ACTIVE' if SHADE else 'MATERIAL')
    # weld and quantize the file if gltf-transform is about (tools/blender/pack.mjs; needs GLTF_TOOLS=<dir with node_modules>)
    tools = os.environ.get('GLTF_TOOLS')
    if tools: subprocess.run(['node', os.path.join(tools, 'pack.mjs'), glb], check=False, capture_output=True)
    data = {**data, 'boxes': boxes, 'vehicles': vehicles}
    with open(os.path.join(ROOT, 'js', 'maps', name + '.data.js'), 'w') as f:
        f.write('// Generated by tools/blender/' + name + '.py from the Blender scene: do not edit by hand.\nexport default ' + json.dumps(data, separators=(',', ':')) + ';\n')
    print(name + ':', len(boxes), 'collision boxes,', len(by), 'meshes,', tris, 'triangles,', len(vehicles), 'vehicles,', round(os.path.getsize(glb) / 1e6, 1), 'MB')
