#!/usr/bin/env python3
"""Shrink a .glb for the web: resize its embedded textures and recompress them.

    python3 tools/glb_shrink.py in.glb out.glb [--max 1024] [--quality 85] [--png-colors 256] [--drop NAME ...]
                                   [--keep REGEX ...]

Textures larger than --max on their long side are halved until they fit. Images with real transparency stay
PNG (--png-colors N makes them palette PNGs); everything else becomes JPEG, and a blended material whose
colour texture turned out opaque becomes opaque. --drop removes mesh nodes whose
name contains NAME (their geometry stays in the buffer, so dropping saves draw calls, not bytes). --keep keeps
only the mesh nodes whose names match one of the regexes and prunes everything they don't use. The asset's
credit (asset.extras: author, licence, source) is kept. Needs Pillow.
"""
import argparse, io, json, re, struct, sys
from PIL import Image


def read_glb(path):
    d = open(path, 'rb').read()
    magic, ver, _ = struct.unpack('<4sII', d[:12])
    if magic != b'glTF' or ver != 2:
        sys.exit(f'{path}: not a glTF 2.0 binary')
    off, js, binc = 12, None, b''
    while off < len(d):
        ln, kind = struct.unpack('<I4s', d[off:off + 8])
        chunk = d[off + 8:off + 8 + ln]
        if kind == b'JSON': js = json.loads(chunk)
        elif kind == b'BIN\x00': binc = chunk
        off += 8 + ln
    return js, binc


def write_glb(path, js, binc):
    j = json.dumps(js, separators=(',', ':')).encode()
    j += b' ' * (-len(j) % 4)
    binc += b'\0' * (-len(binc) % 4)
    total = 12 + 8 + len(j) + (8 + len(binc) if binc else 0)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(j), b'JSON') + j)
        if binc: f.write(struct.pack('<I4s', len(binc), b'BIN\x00') + binc)


def shrink_image(data, mx, quality, colors=0):
    im = Image.open(io.BytesIO(data))
    im.load()
    alpha = im.mode in ('RGBA', 'LA', 'P') and im.convert('RGBA').getextrema()[3][0] < 128   # real cut-outs, not a faint matte
    while max(im.size) > mx:
        im = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS)
    out = io.BytesIO()
    if alpha:
        im = im.convert('RGBA')
        if colors: im = im.quantize(colors, method=Image.Quantize.FASTOCTREE)   # palette PNG: much smaller, fine for signs and decals
        im.save(out, 'PNG', optimize=True)
        return out.getvalue(), 'image/png'
    im.convert('RGB').save(out, 'JPEG', quality=quality, optimize=True, progressive=True)
    return out.getvalue(), 'image/jpeg'


def prune(js, keep, blobs):
    """Keep only the mesh nodes whose names match, and drop every mesh, accessor, material, texture, image and
    buffer view nothing uses any more. Returns the surviving view blobs."""
    for n in js.get('nodes', []):
        if 'mesh' in n and not any(k.search(n.get('name', '')) for k in keep):
            del n['mesh']
    def remap(key, used):
        old = js.get(key, [])
        idx = {o: i for i, o in enumerate(sorted(used))}
        js[key] = [old[o] for o in sorted(used)]
        return idx
    meshes = remap('meshes', {n['mesh'] for n in js['nodes'] if 'mesh' in n})
    for n in js['nodes']:
        if 'mesh' in n: n['mesh'] = meshes[n['mesh']]
    prims = [p for m in js['meshes'] for p in m['primitives']]
    mats = remap('materials', {p['material'] for p in prims if 'material' in p})
    for p in prims:
        if 'material' in p: p['material'] = mats[p['material']]
    def tex_refs(o):   # every {"index": n} texture reference inside a material
        if isinstance(o, dict):
            if isinstance(o.get('index'), int): yield o
            for v in o.values(): yield from tex_refs(v)
        elif isinstance(o, list):
            for v in o: yield from tex_refs(v)
    refs = [r for m in js['materials'] for r in tex_refs(m)]
    texs = remap('textures', {r['index'] for r in refs})
    for r in refs: r['index'] = texs[r['index']]
    imgs = remap('images', {t['source'] for t in js['textures']})
    for t in js['textures']: t['source'] = imgs[t['source']]
    accs = set()
    for p in prims:
        accs |= set(p['attributes'].values())
        if 'indices' in p: accs.add(p['indices'])
        for t in p.get('targets', []): accs |= set(t.values())
    acc = remap('accessors', accs)
    for p in prims:
        p['attributes'] = {k: acc[v] for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = acc[p['indices']]
        for t in p.get('targets', []):
            for k in t: t[k] = acc[t[k]]
    # every accessor gets its own tightly packed view, so geometry shared with dropped meshes goes too
    size = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    comps = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}
    old_views, out = js['bufferViews'], []
    js['bufferViews'] = []
    for x in js['accessors']:
        if 'bufferView' not in x: continue
        v, el = old_views[x['bufferView']], size[x['componentType']] * comps[x['type']]
        src, st, o = blobs[x['bufferView']], v.get('byteStride') or el, x.get('byteOffset', 0)
        data = b''.join(src[o + i * st:o + i * st + el] for i in range(x['count'])) if st != el else src[o:o + el * x['count']]
        nv = {'buffer': 0, 'byteLength': len(data)}
        if 'target' in v: nv['target'] = v['target']
        x['bufferView'], x['byteOffset'] = len(js['bufferViews']), 0
        js['bufferViews'].append(nv); out.append(data)
    for im in js['images']:
        if 'bufferView' in im:
            data = blobs[im['bufferView']]
            im['bufferView'] = len(js['bufferViews'])
            js['bufferViews'].append({'buffer': 0, 'byteLength': len(data)}); out.append(data)
    for k in ('skins', 'animations'): js.pop(k, None)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--max', type=int, default=1024)
    ap.add_argument('--quality', type=int, default=85)
    ap.add_argument('--png-colors', type=int, default=0, help='quantize transparent textures to this many colours')
    ap.add_argument('--drop', nargs='*', default=[])
    ap.add_argument('--keep', nargs='*', default=[], help='keep only mesh nodes whose name matches one of these regexes; prune the rest')
    a = ap.parse_args()
    js, binc = read_glb(a.src)
    blobs = [binc[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in js.get('bufferViews', [])]
    if a.keep: blobs = prune(js, [re.compile(k) for k in a.keep], blobs)
    views = js.get('bufferViews', [])
    for im in js.get('images', []):
        if 'bufferView' in im:
            blobs[im['bufferView']], im['mimeType'] = shrink_image(blobs[im['bufferView']], a.max, a.quality, a.png_colors)
    # a blended material whose colour texture has no real transparency is opaque (no sorting trouble)
    for m in js.get('materials', []):
        bc = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if m.get('alphaMode') == 'BLEND' and bc and js['images'][js['textures'][bc['index']]['source']].get('mimeType') == 'image/jpeg':
            del m['alphaMode']
    if a.drop:
        for n in js.get('nodes', []):
            if 'mesh' in n and any(s in n.get('name', '') for s in a.drop):
                del n['mesh']
    # repack every view into one buffer, 4-byte aligned
    out = bytearray()
    for v, b in zip(views, blobs):
        out += b'\0' * (-len(out) % 4)
        v['byteOffset'], v['byteLength'], v['buffer'] = len(out), len(b), 0
        out += b
    js['buffers'] = [{'byteLength': len(out)}]
    write_glb(a.dst, js, bytes(out))
    print(f'{a.src}: {len(binc) // 1024} KB -> {len(out) // 1024} KB')


if __name__ == '__main__':
    main()
