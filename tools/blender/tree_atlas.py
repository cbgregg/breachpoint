"""Foliage atlas for the trees mapkit builds in the round (fir / broadleaf): boughs photographed from real scanned
trees (CC0, Poly Haven: fir_tree_01, tree_small_02), cut out, four to a sheet.

    python3 tools/blender/tree_atlas.py <fir .gltf> <fir twig alpha> <broadleaf .gltf> <leaves alpha> <out foliage.png>

Cells 0-2 (bottom-left, bottom-right, top-left): a fir bough seen from above, the trunk at the left edge and the tip
at the right. Cell 3 (top-right): a spray of broadleaf branches seen from the side.
"""
import bpy, sys, os, math, tempfile
from mathutils import Vector
from PIL import Image
FIR, FIR_A, LEAF, LEAF_A, OUT = sys.argv[-5:]
def load(path, alpha, what):
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=path)
    img = bpy.data.images.load(alpha); img.colorspace_settings.name = 'Non-Color'
    for m in bpy.data.materials:
        if what in m.name:
            nt = m.node_tree; b = nt.nodes['Principled BSDF']; t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; nt.links.new(t.outputs['Color'], b.inputs['Alpha'])
            if 'Subsurface Weight' in b.inputs: b.inputs['Subsurface Weight'].default_value = 0
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = True; sc.render.film_transparent = True; sc.cycles.transparent_max_bounces = 24
    sc.render.resolution_x = sc.render.resolution_y = 512; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.9, 0.95, 1, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.6
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 2.2; so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (0.5, 0.2, 0.6)
    cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    bpy.context.view_layer.update(); return sc, cam, co
def bounds(o):
    ps = [o.matrix_world @ Vector(c) for c in o.bound_box]; return [min(p[i] for p in ps) for i in range(3)], [max(p[i] for p in ps) for i in range(3)]
tmp = tempfile.mkdtemp(); cells = []
sc, cam, co = load(FIR, FIR_A, 'twig')
tree = min((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.polygons))   # (the smallest of the set)
for o in bpy.data.objects:
    if o.type == 'MESH' and o is not tree: o.hide_render = True
lo, hi = bounds(tree); cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2; H = hi[2] - lo[2]; rad = max(hi[0] - lo[0], hi[1] - lo[1]) / 2
print('fir', H, rad)
for i, (f, a) in enumerate(((0.3, 0.4), (0.45, 2.5), (0.6, 4.4))):
    S = rad * (1 - f * 0.75) * 0.95; z = lo[2] + H * f
    cam.ortho_scale = S; cam.clip_start = 6 - 0.55; cam.clip_end = 6 + 0.55; co.location = (cx + math.cos(a) * S / 2, cy + math.sin(a) * S / 2, z + 6); co.rotation_euler = (0, 0, a)
    sc.render.filepath = os.path.join(tmp, 'c%d.png' % i); bpy.ops.render.render(write_still=True); cells.append(sc.render.filepath)
sc, cam, co = load(LEAF, LEAF_A, 'leaves')
tree = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.polygons)); lo, hi = bounds(tree); H = hi[2] - lo[2]
S = H * 0.62; cam.ortho_scale = S; co.location = ((lo[0] + hi[0]) / 2, lo[1] - 10, lo[2] + H * 0.66); co.rotation_euler = (math.pi / 2, 0, 0); cam.clip_start = 0.1; cam.clip_end = 40
sc.render.filepath = os.path.join(tmp, 'c3.png'); bpy.ops.render.render(write_still=True); cells.append(sc.render.filepath)
at = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
for i, f in enumerate(cells): at.paste(Image.open(f).convert('RGBA'), ((i % 2) * 512, 512 - (i // 2) * 512))
at.save(OUT); print('wrote', OUT)
