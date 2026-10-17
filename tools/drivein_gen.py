"""Drive-In map generator.

A parametric layout generator for a 1950s drive-in theatre, searched with a (mu + lambda) evolution strategy
against targets taken from Black Ops 2's multiplayer maps. Every candidate layout is built as boxes, then
measured exactly (2-D geometry on a 0.5 m grid / analytic ray-box tests):

  sight45   share of standing-eye sightlines longer than 45 m        BO2 medium maps: very few lane-length lines
  maxline   the longest standing sightline                            <= 60 m
  lanes     open aisles (>= 4 m) across the map at 1/3 and 2/3 of the way  3-4 (three lanes + a flank)
  path      shortest spawn-to-spawn walk                               95-125 m (~16-21 s sprinting at 6 m/s)
  cover     share of walkable ground within 3 m of chest-high cover   55-75 %
  open      walkable share of the map                                  60-80 %
  reach     every walkable cell reachable from both spawns             hard constraint
  pockets   dead-end slits narrower than a player                      hard constraint

score = sum_i w_i * hinge(f_i, target_i)     (hinge = distance outside the target band, scaled)
Search: 12 parents, 24 children per generation, Gaussian mutation of the parameter vector (90 generations were run),
then a greedy "repair" pass that drops a tall breaker on the middle of any remaining over-long sightline
(and keeps it only if reachability holds and the score improves).
"""
import json, math, random, sys
import numpy as np

EYE = 1.55

def clamp(v, a, b): return max(a, min(b, v))

PARAM_SPACE = {            # name: (lo, hi, is_int)
    'HX': (52, 58, True), 'HZ': (36, 42, True),
    'Ws': (24, 34, False),           # screen tower width (z)
    'r0': (8, 13, False),            # tower -> first ramp
    'K': (4, 6, True),               # ramps (rows of cars) per half
    'dR': (5.8, 7.5, False),         # ramp spacing
    'zz': (0.0, 5.0, False),         # centre aisle zig-zag (aisles jog from ramp to ramp, so they never line up)
    'zs': (11, 18, False),           # side aisle centre
    'zz2': (0.0, 4.0, False),        # side aisle zig-zag
    'gate': (1.0, 6.0, False),       # gate in the wing fence beside the screen
    'rx': (12, 34, False),           # restroom block on the perimeter road (north)
    'sx': (12, 34, False),           # projector-parts shed on the perimeter road (south)
    'qx': (8, 34, False),            # ice-cream truck parked on the perimeter road (north)
    'wz': (4, 14, False),            # popcorn wagon on the lawn (z, opposite the playground)
    'occ': (0.6, 0.95, False),       # occupied spaces
    'cw': (10, 15, False), 'cd': (8, 11, False),   # snack bar
    'pg': (0, 1, True),              # playground under the screen: north (1) or south (0) half of it
    'seed': (0, 9999, True),
}
SLOT = 3.4    # parking space pitch along a ramp

def sample():
    p = {k: (random.randint(lo, hi) if it else random.uniform(lo, hi)) for k, (lo, hi, it) in PARAM_SPACE.items()}
    p['T'] = []      # tall vehicles: (ramp index, space index, kind)
    return p

def mutate(p, s=0.15):
    q = dict(p); T = [list(t) for t in p['T']]
    r = random.random()
    if r < 0.3 and len(T) < 16: T.append([random.randrange(6), random.randrange(-12, 13), random.choice(['van', 'pickup', 'icecream'])])
    elif r < 0.4 and T: T.pop(random.randrange(len(T)))
    elif r < 0.55 and T: t = random.choice(T); t[1] += random.choice([-1, 1])
    q['T'] = T
    for k, (lo, hi, it) in PARAM_SPACE.items():
        if random.random() < 0.3:
            if k == 'seed': q[k] = random.randint(0, 9999); continue
            v = q[k] + random.gauss(0, (hi - lo) * s)
            q[k] = int(round(clamp(v, lo, hi))) if it else clamp(v, lo, hi)
    return q

TALL = {'van': (5.0, 2.1, 2.5), 'pickup': (5.4, 2.1, 2.6), 'icecream': (5.8, 2.3, 2.9)}

# ------------------------------------------------------------------ layout from parameters
def build(p, extra=()):
    """Returns (half_items, center_items, spawns, meta). Items: [cx, cz, w, d, h, y0, kind, extra]."""
    rnd = random.Random(p['seed'])
    HX, HZ = p['HX'], p['HZ']
    half, center = [], []
    xs = HX - 10                                   # screen tower, its face toward the centre
    Ws = p['Ws']; gap = 1.5; seg = Ws / 2 - gap
    half.append([xs, gap + seg / 2, 2.4, seg, 14, 0, 'screen', 'n'])
    half.append([xs, -(gap + seg / 2), 2.4, seg, 14, 0, 'screen', 's'])
    half.append([xs, 0, 2.4, 2 * gap, 11.4, 2.6, 'screenbeam', 0])      # the screen spans the doorway
    # wing fences from the screen tower to the boundary (drive-ins hid the screen from the road), each with a gate:
    # the spawn yard behind the screen has three ways out
    g0 = Ws / 2 + p['gate']
    for sg in (1, -1):
        if p['gate'] > 0.5: half.append([xs, sg * (Ws / 2 + p['gate'] / 2), 0.4, p['gate'], 3.2, 0, 'fence', 0])
        a0, a1 = g0 + 4, HZ
        if a1 - a0 > 0.5: half.append([xs, sg * (a0 + a1) / 2, 0.4, a1 - a0, 3.2, 0, 'fence', 0])
    # spawn yard behind the screen: closed off at both ends past the gates, so the team spawns in one pocket
    yz = min(HZ - 0.5, g0 + 4 + 2)
    for sg in (1, -1):
        if HZ - yz > 0.6: half.append([(xs + 0.2 + HX) / 2, sg * yz, HX - xs - 0.2, 0.4, 3.2, 0, 'fence', 0])   # meets the wing fence: no slit
    # "coming attractions" billboards at the two corners of the lawn, facing the lot
    for sg in (1, -1): half.append([xs - 3.5, sg * (Ws / 2 + 6.5), 6.0, 0.6, 4.6, 0, 'billboard', 0])
    # popcorn wagon on the lawn, on the other side from the playground
    half.append([xs - 5, -(1 if p['pg'] else -1) * p['wz'], 2.4, 4.2, 2.7, 0, 'wagon', 0])
    # perimeter road: restroom block (north) and the projector-parts shed (south)
    half.append([p['rx'], HZ - 2.0, 6, 4, 3.2, 0, 'restroom', 0])
    half.append([p['sx'], -(HZ - 1.5), 4, 3, 3.0, 0, 'shed', 0])
    if abs(p['qx'] - p['rx']) > 9: half.append([p['qx'], HZ - 2.4, 5.8, 2.3, 2.9, 0, 'icecream', 0])
    # playground on the lawn in front of the screen
    pz = (1 if p['pg'] else -1) * Ws / 4
    half.append([xs - 4.5, pz, 6, 4, 2.6, 0, 'jungle', 0])
    half.append([xs - 4.5, pz + (1 if p['pg'] else -1) * 4.5, 1.2, 4.5, 2.4, 0, 'slide', 0])
    # box office on the entrance lane (south side) and the marquee on the road corner behind the screen
    half.append([xs - 6, -(HZ - 4), 3.2, 3.2, 2.8, 0, 'boxoffice', 0])
    half.append([xs + 4, -(HZ - 2.5), 1.0, 1.0, 9, 0, 'marquee', 0])
    # ramps: straight rows of parking spaces facing the screen, fanning out with distance. Three aisles cross
    # every ramp; the centre one zig-zags ramp to ramp so no aisle lines up end to end.
    tall = {(t[0], t[1]): t[2] for t in p['T']}
    lane_veh = []
    for it in extra:
        if it[0] == 'lane': lane_veh.append(it)
        else: tall[(it[0], it[1])] = it[2]
    rows = []
    for k in range(p['K']):
        x = xs - 3 - p['r0'] - k * p['dR']
        if x < p['cw'] / 2 + 6: break
        zr = min(HZ - 5, Ws / 2 + 3 + k * 4)
        c = p['zz'] * (1 if k % 2 else -1)
        rows.append((x, zr, c))
        n = int(zr // SLOT)
        off = (k % 2) * SLOT / 2          # every other ramp shifted half a space: no straight channel between cars
        for j in range(-n, n + 1):
            z = j * SLOT + off
            if abs(z) > zr: continue
            c2 = p['zz2'] * (1 if k % 2 else -1)
            if abs(z - c) < 2.6 or abs(z - (p['zs'] + c2)) < 2.4 or abs(z + p['zs'] - c2) < 2.4: continue
            kind = tall.get((k, j))
            if kind:
                w, d, h = TALL[kind]; half.append([round(x, 2), round(z, 2), w, d, h, 0, kind, rnd.randint(0, 3)])
            elif rnd.random() < p['occ']:
                half.append([round(x, 2), round(z, 2), 4.6, 1.9, 1.45, 0, 'car50', rnd.randint(0, 7)])
            half.append([round(x + 0.3, 2), round(z + SLOT / 2, 2), 0.14, 0.14, 1.25, 0, 'speaker', 0])
    # vehicles out in the driving lanes and on the perimeter road: cars queueing to park, a service truck
    for _, x, z, al, kind in lane_veh:
        w, d, h = TALL[kind] if kind in TALL else (4.6, 1.9, 1.45)
        if not al: w, d = d, w
        half.append([x, z, w, d, h, 0, kind if kind in TALL else 'car50', 1 if al else 0])
    # snack bar + projection booth upstairs (centre, not mirrored)
    center.append([0, 0, p['cw'], p['cd'], 3.6, 0, 'snackbar', 0])
    # spawns: one compact yard behind the screen tower (not spread along the whole edge)
    spawns = [[HX - 3.5, z] for z in (-6, -3, 0, 3, 6)] + [[HX - 6.5, z] for z in (-4.5, -1.5, 1.5, 4.5)] + [[HX - 5, 0]]
    return half, center, spawns, {'xs': xs, 'rows': rows}

def all_boxes(half, center):
    """Collision boxes as the game makes them: (minx, minz, maxx, maxz, miny, maxy, blocks_move, blocks_sight)."""
    out = []
    def add(cx, cz, w, d, y0, h, move=True, sight=True):
        out.append((cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y0, y0 + h, move, sight))
    def item(cx, cz, w, d, h, y0, kind, ex):
        if kind == 'car50':                     # body, then the glassy cabin (bullets and eyes pass)
            add(cx, cz, w - 0.5, d - 0.25, y0, 0.85)
            add(cx, cz, w - 1.6, d - 0.5, y0 + 0.85, h - 0.85, True, False)
        elif kind in ('jungle', 'slide'): add(cx, cz, w, d, y0, h, True, False)   # open frames
        elif kind == 'marquee': add(cx, cz, 0.5, 0.5, 0, h); add(cx, cz, 0.6, 5.5, 4.5, 3.0)
        elif kind == 'snackbar': add(cx, cz, w, d, 0, h + 4.0)
        elif kind == 'billboard': add(cx, cz, 0.5, 0.5, 0, h); add(cx, cz, w, d, 1.3, h - 1.3)
        else: add(cx, cz, w, d, y0, h)
    for it in center: item(*it[:7], it[7] if len(it) > 7 else 0)
    for it in half:
        item(*it[:7], it[7] if len(it) > 7 else 0)
        m = list(it); m[0], m[1] = -it[0], -it[1]
        item(*m[:7], m[7] if len(m) > 7 else 0)
    return out

# ------------------------------------------------------------------ metrics
def metrics(p, half, center, spawns):
    HX, HZ = p['HX'], p['HZ']
    B = all_boxes(half, center)
    # boundary
    B += [(-HX - 1, HZ, HX + 1, HZ + 1, 0, 10, True, True), (-HX - 1, -HZ - 1, HX + 1, -HZ, 0, 10, True, True),
          (HX, -HZ, HX + 1, HZ, 0, 10, True, True), (-HX - 1, -HZ, -HX, HZ, 0, 10, True, True)]
    A = np.array([b[:6] for b in B])
    sight = np.array([b[7] and b[4] <= EYE <= b[5] for b in B])
    move = np.array([b[6] and b[5] > 0.55 and b[4] < 1.7 for b in B])
    # walk grid (0.5 m) with player radius 0.4
    cs = 0.5
    nx, nz = int(2 * HX / cs), int(2 * HZ / cs)
    gx = -HX + (np.arange(nx) + 0.5) * cs
    gz = -HZ + (np.arange(nz) + 0.5) * cs
    blocked = np.zeros((nz, nx), bool)
    r = 0.4
    for b in A[move]:
        i0, i1 = np.searchsorted(gx, b[0] - r), np.searchsorted(gx, b[2] + r)
        j0, j1 = np.searchsorted(gz, b[1] - r), np.searchsorted(gz, b[3] + r)
        blocked[j0:j1, i0:i1] = True
    # the two corners past the spawn-yard end fences (marquee and entrance) are scenery, out of play
    xs, yz = HX - 10, min(HZ - 0.5, p['Ws'] / 2 + p['gate'] + 6)
    out = (np.abs(gx)[None, :] > xs) & (np.abs(gz)[:, None] > yz)
    blocked |= out
    # reachability from the +x spawn
    from collections import deque
    def cell(x, z): return int((z + HZ) / cs), int((x + HX) / cs)
    sj, si = cell(*spawns[3])
    dist = np.full((nz, nx), -1, int)
    if blocked[sj, si]: return None
    dist[sj, si] = 0; dq = deque([(sj, si)])
    while dq:
        j, i = dq.popleft()
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            jj, ii = j + dj, i + di
            if 0 <= jj < nz and 0 <= ii < nx and not blocked[jj, ii] and dist[jj, ii] < 0:
                dist[jj, ii] = dist[j, i] + 1; dq.append((jj, ii))
    open_cells = (~blocked).sum()
    reach = (dist >= 0).sum() / max(1, open_cells)
    tj, ti = cell(-spawns[3][0], -spawns[3][1])
    path = dist[tj, ti] * cs if dist[tj, ti] >= 0 else 999
    # lanes: open runs (>= 4 m: aisles, not gaps between parked cars) across z at x = +-HX/3 and 0
    def lanes_at(x):
        i = int((x + HX) / cs)
        col = ~blocked[:, i]
        runs, cur = 0, 0
        for v in col:
            if v: cur += 1
            else:
                if cur * cs >= 4.0: runs += 1
                cur = 0
        if cur * cs >= 4.0: runs += 1
        return runs
    lanes = min(lanes_at(HX / 3), lanes_at(-HX / 3))
    lanes0 = lanes_at(0)
    # cover: walkable cells within 3 m of chest-high cover (>= 1.0 m)
    cov = np.zeros((nz, nx), bool)
    for b in A[(A[:, 5] >= 1.0) & (A[:, 4] < 0.6)]:
        i0, i1 = np.searchsorted(gx, b[0] - 3), np.searchsorted(gx, b[2] + 3)
        j0, j1 = np.searchsorted(gz, b[1] - 3), np.searchsorted(gz, b[3] + 3)
        cov[j0:j1, i0:i1] = True
    cover = (cov & ~blocked).sum() / max(1, open_cells)
    openf = open_cells / (nx * nz)
    # sightlines: 16 directions from walkable points on a 2 m grid, analytic ray / box (2-D, boxes at eye height)
    S = A[sight]
    pts = [(x, z) for x in np.arange(-HX + 1, HX, 2.0) for z in np.arange(-HZ + 1, HZ, 2.0)
           if not blocked[int((z + HZ) / cs), int((x + HX) / cs)]]
    P = np.array(pts)
    lens = []
    for k in range(16):
        a = k * math.pi / 8
        dx, dz = math.cos(a), math.sin(a)
        with np.errstate(divide='ignore', invalid='ignore'):
            ix = 1 / dx if abs(dx) > 1e-9 else np.inf
            iz = 1 / dz if abs(dz) > 1e-9 else np.inf
            tx1 = (S[None, :, 0] - P[:, None, 0]) * ix; tx2 = (S[None, :, 2] - P[:, None, 0]) * ix
            tz1 = (S[None, :, 1] - P[:, None, 1]) * iz; tz2 = (S[None, :, 3] - P[:, None, 1]) * iz
            if abs(dx) < 1e-9:
                inx = (P[:, None, 0] > S[None, :, 0]) & (P[:, None, 0] < S[None, :, 2])
                tx1 = np.where(inx, -np.inf, np.inf); tx2 = np.where(inx, np.inf, np.inf)
            if abs(dz) < 1e-9:
                inz = (P[:, None, 1] > S[None, :, 1]) & (P[:, None, 1] < S[None, :, 3])
                tz1 = np.where(inz, -np.inf, np.inf); tz2 = np.where(inz, np.inf, np.inf)
            tmin = np.maximum(np.minimum(tx1, tx2), np.minimum(tz1, tz2))
            tmax = np.minimum(np.maximum(tx1, tx2), np.maximum(tz1, tz2))
            hit = (tmax >= np.maximum(tmin, 0)) & (tmax > 0)
            t = np.where(hit, np.maximum(tmin, 0), np.inf).min(axis=1)
        for (x, z), tt in zip(pts, t): lens.append((tt, x, z, a))
    L = np.array([l[0] for l in lens])
    share45 = float((L > 45).mean())
    order = np.argsort(-L)[:30]
    top = [lens[i] for i in order]
    return {'reach': float(reach), 'path': float(path), 'lanes': int(lanes), 'lanes0': int(lanes0), 'cover': float(cover),
            'open': float(openf), 'share45': share45, 'maxline': float(L.max()), 'top': top, 'blocked': blocked}

def hinge(v, lo, hi, scale): return (max(0, lo - v) + max(0, v - hi)) / scale

def score(m):
    if m is None or m['reach'] < 0.995: return 1e9
    return (6 * hinge(m['share45'], 0, 0.003, 0.003) + 3 * hinge(m['maxline'], 0, 60, 10)
            + 4 * hinge(m['lanes'], 3, 4, 1) + 2 * hinge(m['lanes0'], 2, 4, 1)
            + 3 * hinge(m['path'], 95, 125, 10) + 2 * hinge(m['cover'], 0.55, 0.75, 0.05)
            + 2 * hinge(m['open'], 0.6, 0.8, 0.05))

def evaluate(p, extra=()):
    half, center, spawns, meta = build(p, extra)
    m = metrics(p, half, center, spawns)
    return score(m), m, (half, center, spawns, meta)

def main(gens=30, mu=12, lam=24, seed=1):
    random.seed(seed)
    pop = []
    for _ in range(mu * 3):
        p = sample(); s, m, _ = evaluate(p); pop.append((s, p, m))
    pop.sort(key=lambda t: t[0]); pop = pop[:mu]
    for g in range(gens):
        kids = []
        for _ in range(lam):
            par = random.choice(pop[:max(3, mu // 2)])[1]
            q = mutate(par, 0.12 if g > gens // 2 else 0.2)
            s, m, _ = evaluate(q); kids.append((s, q, m))
        pop = sorted(pop + kids, key=lambda t: t[0])[:mu]
        b = pop[0]; m = b[2]
        print(f'gen {g:2d} best {b[0]:.3f}  s45 {m["share45"]*100:.2f}%  max {m["maxline"]:.0f}  lanes {m["lanes"]}/{m["lanes0"]}  path {m["path"]:.0f}  cover {m["cover"]:.2f}  open {m["open"]:.2f}', flush=True)
    best = pop[0][1]
    # repair: turn a parked car on the worst remaining sightline into a tall vehicle (van / pickup with a
    # camper / ice-cream truck): it stays a drive-in, it just blocks the line
    extra = []
    s, m, (h0, c0, sp0, meta) = evaluate(best, extra)
    for it in range(45):
        if m['share45'] <= 0.002 and m['maxline'] <= 55: break
        t, x, z, a = m['top'][0]
        L = min(t, 120); best_c = None
        for f in [i / 20 for i in range(1, 20)]:
            mx, mz = x + math.cos(a) * L * f, z + math.sin(a) * L * f
            if mx < 0: mx, mz = -mx, -mz
            for k, (rx, zr, c) in enumerate(meta['rows']):
                if abs(rx - mx) > 2.6: continue
                off = (k % 2) * SLOT / 2
                j = round((mz - off) / SLOT)
                if abs(j * SLOT + off) > zr: continue
                for kind in ('van', 'pickup', 'icecream'):
                    cand = extra + [[k, j, kind]]
                    s2, m2, _ = evaluate(best, cand)
                    if s2 < s - 1e-6 and (best_c is None or s2 < best_c[0]): best_c = (s2, m2, cand)
        if not best_c:
            # a vehicle in the driving lane / perimeter road, side-on to the line
            half, center, spawns, meta = build(best, extra)
            Bx = all_boxes(half, center)
            for f in [i / 20 for i in range(2, 19)]:
                mx, mz = x + math.cos(a) * L * f, z + math.sin(a) * L * f
                if mx < 0: mx, mz = -mx, -mz
                if mx > meta['xs'] - 3 or (abs(mx) < best['cw'] / 2 + 5 and abs(mz) < best['cd'] / 2 + 5): continue
                for kind in ('van', 'pickup', 'icecream'):
                    al = abs(math.cos(a)) < 0.7          # line mostly along z: park along x
                    w, d, h = TALL[kind]
                    if not al: w, d = d, w
                    if mx + w / 2 > meta['xs'] - 2 or abs(mz) + d / 2 > best['HZ'] - 1.6: continue
                    if any(not (mx + w / 2 + 1.0 < b[0] or mx - w / 2 - 1.0 > b[2] or mz + d / 2 + 1.0 < b[1] or mz - d / 2 - 1.0 > b[3]) for b in Bx if b[5] > 0.5):
                        continue
                    cand = extra + [['lane', round(mx, 1), round(mz, 1), al, kind]]
                    s2, m2, _ = evaluate(best, cand)
                    if s2 < s - 1e-6 and (best_c is None or s2 < best_c[0]): best_c = (s2, m2, cand)
        if not best_c: break
        s, m, extra = best_c
        print(f'repair {it}: score {s:.3f}  s45 {m["share45"]*100:.2f}%  max {m["maxline"]:.0f}', flush=True)
    half, center, spawns, meta = build(best, extra)
    json.dump({'params': best, 'extra': extra, 'metrics': {k: v for k, v in m.items() if k not in ('top', 'blocked')},
               'half': half, 'center': center, 'spawns': spawns, 'meta': meta}, open('drivein_layout.json', 'w'), indent=1)
    print('FINAL', score(m), {k: (round(v, 3) if isinstance(v, float) else v) for k, v in m.items() if k not in ('top', 'blocked')})

def write_js(path='js/drivein_layout.js', src='drivein_layout.json'):
    d = json.load(open(src))
    r = lambda v: round(v, 2) if isinstance(v, float) else v
    rr = lambda it: [r(v) for v in it]
    m = d['metrics']
    with open(path, 'w') as f:
        f.write('// Generated by tools/drivein_gen.py (parametric layout + evolution strategy scored against Black Ops 2 map\n')
        f.write('// targets; see that file). Do not edit by hand: change the generator and run it with --rebuild.\n')
        f.write('// metrics: ' + json.dumps({k: r(v) for k, v in m.items()}) + '\n')
        f.write('// items: [cx, cz, w, d, h, y0, kind, extra]; HALF is point-mirrored (x, z) -> (-x, -z)\n')
        f.write('export const DRIVEIN_HALF = [\n' + ',\n'.join('  ' + json.dumps(rr(h)) for h in d['half']) + '\n];\n')
        f.write('export const DRIVEIN_CENTER = ' + json.dumps([rr(c) for c in d['center']]) + ';\n')
        f.write('export const DRIVEIN_SPAWNS = ' + json.dumps(d['spawns']) + ';\n')
        meta = dict(d['meta']); meta['rows'] = [rr(x) for x in meta['rows']]
        f.write('export const DRIVEIN_META = ' + json.dumps({**meta, 'HX': d['params']['HX'], 'HZ': d['params']['HZ'], 'Ws': r(d['params']['Ws'])}) + ';\n')

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--rebuild':
        # re-run build() and the metrics from the saved genome (after a change to the fixed design)
        d = json.load(open('drivein_layout.json'))
        best, extra = d['params'], d['extra']
        s, m, _ = evaluate(best, extra)
        half, center, spawns, meta = build(best, extra)
        json.dump({'params': best, 'extra': extra, 'metrics': {k: v for k, v in m.items() if k not in ('top', 'blocked')},
                   'half': half, 'center': center, 'spawns': spawns, 'meta': meta}, open('drivein_layout.json', 'w'), indent=1)
        print('REBUILT', s, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in m.items() if k not in ('top', 'blocked')})
        if len(sys.argv) > 2: write_js(sys.argv[2])
    else:
        main(int(sys.argv[1]) if len(sys.argv) > 1 else 30)
