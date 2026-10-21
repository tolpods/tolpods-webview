#!/usr/bin/env python3
"""
Generates the site's 2K tileable PBR texture sets (albedo / normal / roughness) into assets/tex/.
    python3 tools/make_textures.py            # everything
    python3 tools/make_textures.py oak quilt  # only some sets
    SIZE=4096 python3 tools/make_textures.py  # sharper (heavier) textures

Needs numpy, scipy and Pillow. Every texture tiles seamlessly (all noise is periodic), so the site can repeat it over any wall.
Naming:  <set>_albedo.webp  <set>_normal.webp  <set>_rough.webp   (normal = OpenGL / three.js convention, green up)
Plaster and powder-coated steel albedos are neutral grey detail: the site multiplies them by the theme colour (zen_sage, sand_calm, twilight).
"""
import os, sys, math
import numpy as np
from scipy import ndimage as ndi
from PIL import Image

N = int(os.environ.get("SIZE", 2048))
TEX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "tex")
OUT = os.path.join(TEX, "2k" if N >= 2048 else str(N))          # full size goes to tex/2k (or tex/<N>); tools/make_tiers.py makes tex/1k and tex/512 from it
os.makedirs(OUT, exist_ok=True)
YY, XX = np.mgrid[0:N, 0:N].astype(np.float32); U = XX / N; V = YY / N

# ------------------------------------------------------------------ periodic noise
def lat(fx, fy, seed, order=3):
    """Smooth periodic noise 0..1 with fx x fy lattice cells across the tile."""
    r = np.random.default_rng(seed); g = r.random((int(fy), int(fx))).astype(np.float32)
    cy = np.linspace(0, fy, N, endpoint=False, dtype=np.float32); cx = np.linspace(0, fx, N, endpoint=False, dtype=np.float32)
    return ndi.map_coordinates(g, np.meshgrid(cy, cx, indexing="ij"), order=order, mode="grid-wrap").astype(np.float32)
def fbm(f, octs, seed, fy=None):
    s = np.zeros((N, N), np.float32); a = 0.5; tot = 0
    for o in range(octs): s += a * lat(f * 2 ** o, (fy or f) * 2 ** o, seed + o * 17); tot += a; a *= 0.5
    return s / tot
def white(seed, blur=0.0):
    r = np.random.default_rng(seed).random((N, N)).astype(np.float32)
    return ndi.gaussian_filter(r, blur, mode="wrap") if blur else r
def smooth01(x, a, b): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def hexc(h): h = h.lstrip("#"); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255
def lerp(a, b, t): return a[None, None, :] + (b - a)[None, None, :] * t[..., None]
def to_lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def normal_from_height(h, strength):
    """Height (any units, 1 unit = 1 texel-ish) -> OpenGL tangent-space normal map, wrapping at the edges."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5; dy_up = (np.roll(h, 1, 0) - np.roll(h, -1, 0)) * 0.5
    n = np.stack([-dx * strength, -dy_up * strength, np.ones_like(h)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5

def save(name, albedo=None, normal=None, rough=None, q=90):
    def w(arr, suffix, mode):
        im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), mode); im.save(os.path.join(OUT, f"{name}_{suffix}.webp"), quality=q, method=4)
    if albedo is not None: w(albedo, "albedo", "RGB")
    if normal is not None: w(normal, "normal", "RGB")
    if rough is not None: w(rough, "rough", "L")
    print("  wrote", name, flush=True)

# ------------------------------------------------------------------ timber
def timber(c1, c2, seed, boards=4, rows_along="v", stagger=False, joint=0.012, ring_f=6.0):
    """Straight-grained boards: growth-ring figure, fibre streaks, pores, hairline joints. Returns albedo, height, rough."""
    rnd = np.random.default_rng(seed)
    if rows_along == "v": lat_ax, run_ax = U, V
    else: lat_ax, run_ax = V, U
    b = np.floor(lat_ax * boards).astype(np.int32) % boards; fu = lat_ax * boards - np.floor(lat_ax * boards)
    tone = (0.86 + 0.28 * rnd.random(boards))[b]; phase = rnd.random(boards)[b] * 3; shift = (rnd.random(boards) - 0.5)[b]
    def L(fx_l, fy_r, s):                       # lattice noise: fx_l cells across the boards, fy_r along them
        n = lat(fx_l, fy_r, s) if rows_along == "v" else lat(fy_r, fx_l, s)
        return n
    warp = (L(boards * 2, 3, seed + 1) - 0.5)
    ring = 0.5 + 0.5 * np.sin(2 * np.pi * (fu * ring_f + warp * 2.2 + phase))
    cath = 0.5 + 0.5 * np.sin(2 * np.pi * (fu * 2.0 + (L(boards, 2, seed + 2) - 0.5) * 3.0 + phase * 0.5))
    fib = L(boards * 110, 6, seed + 3); fib2 = L(boards * 330, 30, seed + 4); pores_n = L(boards * 260, 46, seed + 5)
    pores = smooth01(pores_n, 0.80, 0.93)
    t = np.clip((0.50 * ring + 0.20 * cath + 0.20 * fib + 0.10 * fib2) * tone + shift * 0.12, 0, 1)
    col = lerp(c1, c2, t) * (1 - 0.22 * pores[..., None])
    mott = fbm(3, 3, seed + 9); col *= (0.93 + 0.14 * mott)[..., None]
    h = 0.30 * fib + 0.25 * fib2 - 0.6 * pores + 0.2 * ring
    jd = np.minimum(fu, 1 - fu); groove = smooth01(jd, 0.0, joint * 1.6)
    if stagger:                                  # butt joints at a different place on every board
        off = rnd.random(boards)[b]; ev = np.abs(((run_ax + off) % 1.0)); eg = smooth01(np.minimum(ev, 1 - ev), 0.0, 0.0045); groove = np.minimum(groove, eg)
    col *= (0.38 + 0.62 * groove)[..., None]; h = h * (0.3 + 0.7 * groove) - (1 - groove) * 2.2
    rough = np.clip(0.50 + 0.22 * pores + 0.12 * (fib - 0.5) + 0.35 * (1 - groove), 0.05, 1)
    return col.astype(np.float32), h.astype(np.float32), rough.astype(np.float32)

def mk_wood(name, c1, c2, seed, strength=3.0, **kw):
    a, h, r = timber(hexc(c1), hexc(c2), seed, **kw); save(name, a, normal_from_height(h, strength), r)

# ------------------------------------------------------------------ plaster, steel panel, membrane
def mk_plaster(name, seed, base=0.93, speck=0.05):
    m = fbm(4, 5, seed); trowel = fbm(9, 3, seed + 7, fy=6); sp = white(seed + 2, 0.7)
    v = base + 0.07 * (m - 0.5) * 2 + 0.035 * (trowel - 0.5) + speck * (sp - 0.5)
    h = 6 * (m - 0.5) + 3 * (trowel - 0.5) + 5 * (sp - 0.5)
    save(name, np.repeat(np.clip(v, 0, 1)[..., None], 3, -1), normal_from_height(h, 0.5), np.clip(0.88 + 0.08 * (m - 0.5), 0, 1))
def mk_panel(name, seed):
    """48 in powder-coated steel cladding: orange-peel finish, pressed reveal joints on all four edges (tile = one 48 in panel)."""
    J = 0.0055; d = np.minimum.reduce([U, 1 - U, V, 1 - V])
    peel = ndi.gaussian_filter(white(seed, 1.2), 0.0, mode="wrap") * 0.0 + fbm(48, 2, seed + 3) ; peel2 = white(seed + 5, 1.5)
    v = 0.965 + 0.028 * (fbm(3, 3, seed + 1) - 0.5) * 2 + 0.05 * (peel - 0.5) + 0.07 * (peel2 - 0.5)
    groove = d < J; lip = (d >= J) & (d < 2.2 * J)
    v = np.where(groove, v * 0.30, np.where(lip, np.minimum(1, v * 1.07), v))
    h = 2.2 * (peel - 0.5) + 3.0 * (peel2 - 0.5) - np.where(groove, 14.0, 0) + np.where(lip, 1.5, 0)
    h = ndi.gaussian_filter(h, 0.7, mode="wrap")
    r = np.where(groove, 0.8, 0.46 + 0.1 * (peel2 - 0.5))
    save(name, np.repeat(v[..., None], 3, -1), normal_from_height(h, 0.9), r)
def mk_membrane(name, seed):
    n = fbm(5, 4, seed); g = white(seed + 3, 0.8); k = 0.9 + 0.12 * (n - 0.5) * 2 + 0.06 * (g - 0.5)
    for e in (0.0, 0.5):                          # welded seams every 24 in (tile = 48 in)
        dd = np.minimum(np.abs(U - e), np.abs(U - e - 1)); k = np.where(dd < 0.006, k * 1.35, k)
    base = np.array([52, 54, 57], np.float32) / 255
    h = 2 * (n - 0.5) + 3 * (g - 0.5) + np.where(np.minimum(np.abs(U), np.abs(U - 0.5)) < 0.006, 3.0, 0.0)
    save(name, np.clip(base[None, None, :] * k[..., None] * 1.0 / 0.9 * 0.9, 0, 1), normal_from_height(ndi.gaussian_filter(h, 0.6, mode="wrap"), 0.8), np.clip(0.9 + 0.05 * (g - 0.5), 0, 1))

# ------------------------------------------------------------------ leather
def worley_height(cells, seed, creases=True):
    """Pebbled leather grain: dome per cell, creased between cells. Periodic: computed on a 3x3 tiled grid, centre crop."""
    S = N // 2; r = np.random.default_rng(seed)
    gx, gy = np.meshgrid(np.arange(cells), np.arange(cells)); pts = (np.stack([gx.ravel(), gy.ravel()], 1) + 0.12 + 0.76 * r.random((cells * cells, 2))) * (S / cells)   # jittered grid: even pebbles
    big = np.zeros((S * 3, S * 3), bool)
    for ox in range(3):
        for oy in range(3):
            q = (pts + np.array([ox * S, oy * S])).astype(int); big[q[:, 1] % (S * 3), q[:, 0] % (S * 3)] = True
    d, idx = ndi.distance_transform_edt(~big, return_indices=True)
    cid = idx[0] * (S * 3) + idx[1]
    edge = (cid != np.roll(cid, 1, 0)) | (cid != np.roll(cid, 1, 1))
    rad = S / cells * 0.78; dome = np.clip(1 - d / rad, 0, 1) ** 0.6
    if creases: dome = dome * (1 - 0.8 * ndi.binary_dilation(edge, iterations=1))
    c = dome[S:2 * S, S:2 * S]
    return ndi.zoom(c, N / S, order=3, mode="grid-wrap").astype(np.float32)
def mk_leather_grain(name, seed):
    wh = worley_height(90, seed); h = ndi.gaussian_filter(wh + 0.2 * white(seed + 3, 1.0), 1.6, mode='wrap')
    save(name, None, normal_from_height(h * 5, 1.0), np.clip(0.5 + 0.18 * (1 - wh), 0, 1))
def mk_quilt(name, seed):
    """Diamond-quilted leather: 4 x 4 diamonds per tile, puffed cushions, pinched seams with stitch dashes, fine pebbled grain."""
    x, y = U * 4, V * 4
    d1 = np.abs(np.sin(np.pi * (x + y))); d2 = np.abs(np.sin(np.pi * (x - y)))
    puff = np.clip(d1 * d2 * 1.9, 0, 1) ** 0.55
    grain = worley_height(150, seed)
    base = np.array([0.62, 0.52, 0.40], np.float32)
    k = 0.5 + 0.5 * puff
    # stitch thread: dashes along both seam directions
    seam = np.minimum(np.abs(np.sin(np.pi * (x + y))), np.abs(np.sin(np.pi * (x - y))))
    line = smooth01(0.06 - seam, 0.0, 0.05)
    dash = (np.sin(2 * np.pi * (x * 14)) > 0.2).astype(np.float32)
    thread = line * dash
    col = base[None, None, :] * (k * (0.93 + 0.12 * grain))[..., None]
    col = col * (1 - 0.35 * thread[..., None]) + np.array([0.28, 0.2, 0.12], np.float32)[None, None, :] * (0.35 * thread[..., None])
    h = 55 * puff + 5 * grain - 14 * thread
    h = ndi.gaussian_filter(h, 1.0, mode="wrap")
    save(name, np.clip(col, 0, 1), normal_from_height(h, 0.12), np.clip(0.52 - 0.08 * puff + 0.12 * (1 - grain), 0, 1))

# ------------------------------------------------------------------ airport
def draw_chips(img, seed, per_cell, cells_n, size_scale):
    r = np.random.default_rng(seed); S = N // cells_n
    cols = [(232, 227, 215), (168, 160, 147), (118, 110, 100), (190, 152, 122)]; probs = [0.5, 0.28, 0.14, 0.08]
    for ty in range(cells_n):
        for tx in range(cells_n):
            for _ in range(per_cell):
                sz = (1 + r.random() * r.random() * 7) * size_scale; k = r.choice(4, p=probs)
                w = max(2, int(sz)); h = max(2, int(sz * (0.55 + r.random() * 0.9)))
                x0 = int(tx * S + r.random() * (S - 8 * size_scale)); y0 = int(ty * S + r.random() * (S - 8 * size_scale)); a = 0.3 + r.random() * 0.45
                yy, xx = np.ogrid[:h, :w]; m = ((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2 <= 1
                reg = img[y0:y0 + h, x0:x0 + w]; mm = m[: reg.shape[0], : reg.shape[1]]
                reg[mm] = reg[mm] * (1 - a) + np.array(cols[k], np.float32) / 255 * a
def mk_terrazzo(name, seed=5):
    """Polished terrazzo: 4 x 4 slabs of 48 in per tile (192 in), each its own tone, soft clouds, stone chips of several colours, bevelled joints."""
    r = np.random.default_rng(seed); T = N // 4; img = np.zeros((N, N, 3), np.float32)
    for ty in range(4):
        for tx in range(4):
            tone = (205 + math.floor((r.random() - 0.5) * 16)) / 255
            img[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T] = np.array([tone, tone - 5 / 255, tone - 14 / 255], np.float32)
    cloud = fbm(8, 4, seed + 1); img *= (0.95 + 0.1 * cloud)[..., None]
    draw_chips(img, seed + 2, 760, 4, N / 1024.0)
    jd = np.minimum(((XX % T)), (T - (XX % T))).clip(0); jd2 = np.minimum((YY % T), (T - (YY % T)))
    jw = np.minimum(jd, jd2); joint = jw < 2 * N / 1024; lit = (jw >= 2 * N / 1024) & (jw < 4 * N / 1024)
    img = np.where(joint[..., None], img * 0.55 + 0.5 * np.array([92, 86, 76], np.float32) / 255 * 0.5, img)
    img = np.where(lit[..., None], np.minimum(1, img * 1.06), img)
    h = -np.where(joint, 4.0, 0) + 0.5 * white(seed + 3, 1.0) + 2 * (fbm(24, 2, seed + 4) - 0.5)
    rough = np.clip(0.46 + 0.12 * (fbm(6, 3, seed + 7) - 0.5) + 0.06 * (white(seed + 8, 1.2) - 0.5) + np.where(joint, 0.4, 0), 0.05, 1)
    save(name, np.clip(img, 0, 1), normal_from_height(ndi.gaussian_filter(h, 0.8, mode="wrap"), 0.7), rough)
def mk_carpet(name, seed=41):
    """Woven carpet tiles, 24 in (4 x 4 per tile = 96 in): looped yarn with a little tone change from tile to tile and darker tile joints."""
    r = np.random.default_rng(seed); T = N // 4; tone = np.zeros((N, N), np.float32)
    for ty in range(4):
        for tx in range(4): tone[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T] = (98 + (r.random() - 0.5) * 4) / 255
    loops = np.abs(np.sin(XX * math.pi / (N / 190))) * np.abs(np.sin(YY * math.pi / (N / 190))); yarn = white(seed + 1, 0.9) ; yarn2 = fbm(40, 3, seed + 2)
    k = 0.72 + 0.28 * loops ** 0.7 * (0.7 + 0.5 * yarn)
    col = np.stack([tone * k, (tone - 4 / 255) * k, (tone - 11 / 255) * k], -1) * (0.92 + 0.16 * yarn2)[..., None]
    jw = np.minimum(np.minimum(XX % T, T - XX % T), np.minimum(YY % T, T - YY % T)); col *= np.where(jw < 1.6 * N / 512, 0.8, 1.0)[..., None]
    h = 5 * loops ** 0.7 + 2.5 * (yarn - 0.5) - np.where(jw < 1.6 * N / 512, 3, 0)
    save(name, np.clip(col, 0, 1), normal_from_height(h, 0.6), np.clip(0.93 + 0.05 * (yarn - 0.5), 0, 1))
def mk_asphalt(name, seed=13):
    base = np.array([0x5a, 0x5b, 0x5d], np.float32) / 255; g = white(seed, 0.6); g2 = white(seed + 1, 1.6); st = smooth01(white(seed + 2, 1.0), 0.62, 0.7)
    v = 0.9 + 0.35 * (g - 0.5) + 0.25 * (g2 - 0.5) + 0.25 * st + 0.2 * (fbm(6, 4, seed + 4) - 0.5)
    h = 3 * (g - 0.5) + 2 * st
    save(name, np.clip(base[None, None, :] * v[..., None], 0, 1), normal_from_height(h, 0.7), np.clip(0.93 + 0.06 * (g2 - 0.5), 0, 1))
def mk_hallwall(name, seed=9):
    base = np.array([0xdc, 0xd8, 0xce], np.float32) / 255; sp = white(seed, 0.8); m = fbm(5, 4, seed + 1); tr = fbm(10, 3, seed + 2, fy=6)
    v = 0.96 + 0.06 * (m - 0.5) * 2 + 0.05 * (sp - 0.5) + 0.03 * (tr - 0.5)
    col = base[None, None, :] * v[..., None]; j = np.minimum(U, 1 - U) < 0.0035; col = np.where(j[..., None], col * 0.7, col)
    h = 3 * (sp - 0.5) + 2 * (m - 0.5) - np.where(j, 5, 0)
    save(name, np.clip(col, 0, 1), normal_from_height(ndi.gaussian_filter(h, 0.6, mode="wrap"), 0.5), np.clip(0.86 + 0.06 * (m - 0.5), 0, 1))
def mk_pavers(name, seed=9):
    r = np.random.default_rng(seed); T = N // 4; img = np.zeros((N, N, 3), np.float32); c1 = np.array([117, 115, 110], np.float32) / 255; c2 = np.array([92, 90, 87], np.float32) / 255
    grain = fbm(16, 3, seed + 5); sp = white(seed + 6, 0.8)
    for ty in range(4):
        for tx in range(4):
            t = r.random() * 0.8; img[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T] = c1 * (1 - t) + c2 * t
    img *= (0.9 + 0.14 * grain + 0.06 * (sp - 0.5))[..., None]
    jw = np.minimum(np.minimum(XX % T, T - XX % T), np.minimum(YY % T, T - YY % T)) / T; g = jw < 0.025
    img = np.where(g[..., None], np.array([38, 38, 36], np.float32) / 255, img)
    h = 3 * (sp - 0.5) + 2 * (grain - 0.5) - np.where(g, 6, 0)
    save(name, np.clip(img, 0, 1), normal_from_height(ndi.gaussian_filter(h, 0.7, mode="wrap"), 0.7), np.where(g, 0.95, 0.8))

SETS = {
    "oak": lambda: mk_wood("oak", "#745434", "#b28c60", 3, boards=4),
    "walnut": lambda: mk_wood("walnut", "#1a0d06", "#452412", 8, boards=4, ring_f=5.0),
    "floor": lambda: mk_wood("floor", "#734d29", "#5c3b1f", 11, boards=6, rows_along="u", stagger=True, joint=0.02, ring_f=3.0),
    "plaster": lambda: mk_plaster("plaster", 21),
    "ceil": lambda: mk_plaster("ceil", 23, base=0.95, speck=0.04),
    "ext": lambda: mk_panel("ext", 8),
    "membrane": lambda: mk_membrane("membrane", 12),
    "grain": lambda: mk_leather_grain("grain", 31),
    "quilt": lambda: mk_quilt("quilt", 37),
    "terrazzo": lambda: mk_terrazzo("terrazzo"),
    "carpet": lambda: mk_carpet("carpet"),
    "asphalt": lambda: mk_asphalt("asphalt"),
    "hallwall": lambda: mk_hallwall("hallwall"),
    "pavers": lambda: mk_pavers("pavers"),
}
if __name__ == "__main__":
    want = sys.argv[1:] or list(SETS)
    for k in want:
        print("making", k, flush=True); SETS[k]()
