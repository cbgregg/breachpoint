#!/usr/bin/env python3
"""Collision boxes for the subway concourse model (assets/models/station.glb), written to js/station_data.js.

    python3 tools/station_collision.py path/to/subway_station.glb

The model is one merged level (a ticket hall with fare gates, a booth, pillars and two stairs down to the
platforms), so its collision is worked out from the mesh: every wall-like triangle that reaches body height
(0.25-1.8 m over the hall floor) is rasterised into a 20 cm grid, each cell keeps the height of the tallest
such thing in it (2 m or more: a wall, up to the ceiling), and runs of cells are merged into boxes. The boxes are in the model's own coordinates (metres,
floor at y = 3.2); js/station.js moves them into place. Needs numpy.
"""
import json, struct, sys
import numpy as np

FLOOR, CEIL = 3.2, 7.0
C = 0.2
X0, X1, Z0, Z1 = 9.0, 30.4, -48.7, -11.0   # the hall and its entrance; the far stair corridor is walled off
# the model's row of turnstiles: Link stations have no fare gates (you tap an ORCA card), so the low units
# stand open, no collision: players and bots walk through. Its taller fence posts still count.
GATES = (14.15, -19.0, 19.45, -16.85)


def load(path):
    d = open(path, 'rb').read()
    l = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + l])
    b0 = 20 + l + 8

    def acc(i):
        a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        off = b0 + v.get('byteOffset', 0) + a.get('byteOffset', 0)
        isz = np.dtype(dt).itemsize * n; st = v.get('byteStride') or isz
        raw = np.frombuffer(d, np.uint8, count=st * (a['count'] - 1) + isz, offset=off)
        return np.lib.stride_tricks.as_strided(raw, (a['count'], isz), (st, 1)).copy().view(dt).reshape(a['count'], n)

    def mat(n):
        if 'matrix' in n: return np.array(n['matrix']).reshape(4, 4).T
        M = np.eye(4)
        if 'scale' in n: M = np.diag(list(n['scale']) + [1]) @ M
        if 'rotation' in n:
            x, y, z, w = n['rotation']
            R = np.eye(4)
            R[:3, :3] = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
            M = R @ M
        if 'translation' in n: T = np.eye(4); T[:3, 3] = n['translation']; M = T @ M
        return M

    tris = []

    def walk(i, P):
        n = j['nodes'][i]; M = P @ mat(n)
        if 'mesh' in n:
            for p in j['meshes'][n['mesh']]['primitives']:
                pos = acc(p['attributes']['POSITION']).astype(np.float64)
                pos = (np.c_[pos, np.ones(len(pos))] @ M.T)[:, :3]
                idx = acc(p['indices']).reshape(-1) if 'indices' in p else np.arange(len(pos))
                tris.append(pos[idx.reshape(-1, 3)])
        for c in n.get('children', []): walk(c, M)
    for r in j['scenes'][j.get('scene', 0)]['nodes']: walk(r, np.eye(4))
    return np.concatenate(tris)


def main():
    T = load(sys.argv[1])
    nrm = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
    nrm /= np.maximum(1e-9, np.linalg.norm(nrm, axis=1))[:, None]
    lo, hi = T[:, :, 1].min(1), T[:, :, 1].max(1)
    body = (np.abs(nrm[:, 1]) < 0.7) & (hi > FLOOR + 0.25) & (lo < FLOOR + 1.8)
    W, H = int(round((X1 - X0) / C)), int(round((Z1 - Z0) / C))
    top = np.zeros((H, W))
    # occupancy and height from what reaches body height; anything 2 m tall or more is a wall or pillar and
    # goes to the ceiling (walls are split into lower and upper panels; signs hanging over the gates don't count)
    for a, b, c in T[body]:
        L = max(np.linalg.norm(b - a), np.linalg.norm(c - a), np.linalg.norm(c - b))
        n = max(2, int(L / (C * 0.5)) + 1)
        u, v = np.meshgrid(np.linspace(0, 1, n), np.linspace(0, 1, n))
        m = u + v <= 1
        p = a + np.outer(u[m], b - a) + np.outer(v[m], c - a)
        p = p[(p[:, 1] < CEIL) & (p[:, 1] > FLOOR)]
        i = ((p[:, 0] - X0) / C).astype(int); k = ((p[:, 2] - Z0) / C).astype(int)
        ok = (i >= 0) & (i < W) & (k >= 0) & (k < H)
        np.maximum.at(top, (k[ok], i[ok]), p[ok, 1] - FLOOR)
    cls = np.where(top >= 2.0, CEIL - FLOOR, np.round(top, 1))
    cls[top < 0.3] = 0
    used = np.zeros_like(cls, bool)
    boxes = []
    for k in range(H):
        for i in range(W):
            h = cls[k, i]
            if not h or used[k, i]: continue
            i2 = i
            while i2 + 1 < W and cls[k, i2 + 1] == h and not used[k, i2 + 1]: i2 += 1
            k2 = k
            while k2 + 1 < H and all(cls[k2 + 1, i:i2 + 1] == h) and not used[k2 + 1, i:i2 + 1].any(): k2 += 1
            used[k:k2 + 1, i:i2 + 1] = True
            bx0, bz0, bx1, bz1 = X0 + i * C, Z0 + k * C, X0 + (i2 + 1) * C, Z0 + (k2 + 1) * C
            if h < 1.3 and bx0 >= GATES[0] and bz0 >= GATES[1] and bx1 <= GATES[2] and bz1 <= GATES[3]: continue
            boxes.append([round(X0 + i * C, 2), round(Z0 + k * C, 2), round(X0 + (i2 + 1) * C, 2), round(Z0 + (k2 + 1) * C, 2), round(float(h), 2)])
    with open('js/station_data.js', 'w') as f:
        f.write('// Generated by tools/station_collision.py from the subway concourse model: collision boxes\n')
        f.write('// [x0, z0, x1, z1, height over the hall floor] in the model\'s own metres (hall floor at y = 3.2).\n')
        f.write('export const CONCOURSE_BOXES = [\n')
        for b in boxes: f.write('  [' + ', '.join(f'{v:g}' for v in b) + '],\n')
        f.write('];\n')
    print(len(boxes), 'boxes')


if __name__ == '__main__':
    main()
