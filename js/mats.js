// Procedural textures + PBR materials. Everything is generated in code, so the site needs no image files.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const THEMES = {
  zen_sage: { interior: [0.84, 0.79, 0.68], exterior: [0.30, 0.40, 0.32], light: 0xffd2a0, accent: 0xff8c40 },
  sand_calm: { interior: [0.88, 0.83, 0.75], exterior: [0.52, 0.40, 0.31], light: 0xffdcb2, accent: 0xff9e59 },
  twilight: { interior: [0.55, 0.58, 0.70], exterior: [0.16, 0.19, 0.30], light: 0xccc7ff, accent: 0x8066ff },
};

function hash(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, px, py, seed) {          // periodic value noise, tiles every (px, py) cells
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const m = (a, p) => ((a % p) + p) % p;
  const a = hash(m(ix, px), m(iy, py), seed), b = hash(m(ix + 1, px), m(iy, py), seed);
  const c = hash(m(ix, px), m(iy + 1, py), seed), d = hash(m(ix + 1, px), m(iy + 1, py), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(u, v, f, oct, seed) {
  let s = 0, a = 0.5;
  for (let o = 0; o < oct; o++) { s += a * vnoise(u * f, v * f, f, f, seed + o * 17); f *= 2; a *= 0.5; }
  return s;
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c) => [((c >> 16) & 255), ((c >> 8) & 255), (c & 255)];

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function finish(c, srgb, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function pixelTexture(w, h, fn, { srgb = true, repeat = [1, 1] } = {}) {
  const c = newCanvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = fn(x / w, y / h), i = (y * w + x) * 4;
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, srgb, repeat);
}

// ---------- texture recipes ----------
export const tex = {
  wood(c1, c2, seed = 3, size = 256) {
    return pixelTexture(size, size, (u, v) => {
      const n = vnoise(u * 6, v * 2, 6, 2, seed) * 0.8 + vnoise(u * 24, v * 3, 24, 3, seed + 5) * 0.2;
      const g = 0.5 + 0.5 * Math.sin(TAU * (u * 8 + n * 2.5));
      const fine = vnoise(u * 96, v * 6, 96, 6, seed + 9);
      return mix(c1, c2, Math.min(1, g * 0.78 + fine * 0.22));
    });
  },
  planks(c1, c2, size = 256) {
    return pixelTexture(size, size, (u, v) => {
      const rows = 6, r = Math.floor(v * rows), fv = v * rows - r;
      const off = hash(r, 1, 11), joint = (u + off) % 1;
      const tone = hash(r, Math.floor((u + off) * 2), 5);
      const grain = vnoise(u * 8, v * 40, 8, 40, 7);
      let col = mix(c1, c2, tone * 0.7 + grain * 0.3);
      if (fv < 0.04 || fv > 0.97 || joint < 0.006) col = [col[0] * 0.35, col[1] * 0.35, col[2] * 0.35];
      return col;
    });
  },
  plaster(base, size = 256) {
    return pixelTexture(size, size, (u, v) => {
      const k = 0.9 + 0.1 * fbm(u, v, 4, 4, 21);
      return [base[0] * 255 * k, base[1] * 255 * k, base[2] * 255 * k];
    });
  },
  pavers(c1, c2, size = 256) {
    return pixelTexture(size, size, (u, v) => {
      const n = 4, cu = Math.floor(u * n), cv = Math.floor(v * n), fu = u * n - cu, fv = v * n - cv;
      const tone = hash(cu, cv, 9), grain = fbm(u, v, 16, 3, 5);
      let col = mix(c1, c2, tone * 0.8 + grain * 0.2);
      if (fu < 0.025 || fu > 0.975 || fv < 0.025 || fv > 0.975) col = [38, 38, 36];
      return col;
    });
  },
  grain(size = 128) {        // fine leather / micro-surface grain, for bump maps
    return pixelTexture(size, size, (u, v) => {
      const g = 80 + 175 * (vnoise(u * 48, v * 48, 48, 48, 31) * 0.6 + vnoise(u * 96, v * 96, 96, 96, 37) * 0.4);
      return [g, g, g];
    }, { srgb: false });
  },
  quilt(base, bump = false, size = 256) {      // diamond-quilted leather (colour or bump)
    return pixelTexture(size, size, (u, v) => {
      const N = 4, x = u * N, y = v * N;
      const d1 = Math.abs(Math.sin(Math.PI * (x + y))), d2 = Math.abs(Math.sin(Math.PI * (x - y)));
      const h = Math.pow(Math.min(1, d1 * d2 * 1.9), 0.55);
      if (bump) { const g = 255 * h; return [g, g, g]; }
      const k = 0.5 + 0.5 * h;
      return [base[0] * k, base[1] * k, base[2] * k];
    }, { srgb: !bump });
  },
  screen(c1, c2, label, size = 256) {
    const c = newCanvas(size, size), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (let i = 0; i < 5; i++) ctx.fillRect(size * 0.08, size * (0.18 + i * 0.15), size * (0.84 - i * 0.07), size * 0.06);
    if (label) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = `bold ${Math.round(size * 0.12)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.fillText(label, size / 2, size * 0.1);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  },
  sign(text, color = '#e0b55a', w = 512, h = 128, bg = null) {
    const c = newCanvas(w, h), ctx = c.getContext('2d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(h * 0.62)}px Georgia, serif`;
    ctx.fillText(text, w / 2, h / 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  },
};

// ---------- materials ----------
export function makeMaterials(theme = 'zen_sage') {
  const TH = THEMES[theme] || THEMES.zen_sage;
  const std = (o, tile = 0) => { const m = new THREE.MeshStandardMaterial(o); if (tile) m.userData.tile = tile; return m; };
  const phys = (o, tile = 0) => { const m = new THREE.MeshPhysicalMaterial(o); if (tile) m.userData.tile = tile; return m; };
  const k = tex.grain();
  k.repeat.set(10, 10);
  const M = {};
  M.oak = std({ map: tex.wood([102, 66, 31], [173, 122, 69], 3), roughness: 0.55, metalness: 0 }, 30);
  M.walnut = std({ map: tex.wood([26, 13, 6], [69, 36, 18], 8), roughness: 0.5, metalness: 0 }, 30);
  M.floor = std({ map: tex.planks([115, 77, 41], [92, 59, 31]), roughness: 0.4, metalness: 0 }, 36);
  M.plaster = std({ map: tex.plaster(TH.interior), roughness: 0.85 }, 48);
  M.ext = std({ map: tex.plaster(TH.exterior), roughness: 0.6 }, 48);
  M.ceil = std({ map: tex.plaster([0.9, 0.87, 0.8]), roughness: 0.9 }, 48);
  M.ground = std({ map: tex.pavers([117, 115, 110], [92, 90, 87]), roughness: 0.8 });
  M.deck = std({ color: 0x121214, roughness: 0.5, metalness: 0.6 });
  M.rug = std({ color: 0xb8a380, roughness: 1 });
  M.rugDark = std({ color: 0x4d3d2e, roughness: 1 });
  M.steel = std({ color: 0xc4c6c9, roughness: 0.32, metalness: 1 });
  M.brass = std({ color: 0xd1a050, roughness: 0.3, metalness: 1 });
  M.bronze = std({ color: 0x1a130e, roughness: 0.4, metalness: 1 });
  M.graphite = std({ color: 0x0c0c0e, roughness: 0.4, metalness: 0.8 });
  M.black = std({ color: 0x050506, roughness: 0.35 });
  M.white = std({ color: 0xece9e2, roughness: 0.25 });
  M.rubber = std({ color: 0x050505, roughness: 0.9 });
  M.shell = phys({ color: 0x0a0a0c, roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
  M.leather = phys({ color: 0x0c0c0e, roughness: 0.48, bumpMap: k, bumpScale: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: new THREE.Color(0x222226) });
  M.leather2 = phys({ color: 0x151518, roughness: 0.5, bumpMap: k, bumpScale: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.35 });
  const qb = tex.quilt([0.07, 0.07, 0.08].map((v) => v * 255), false), qh = tex.quilt(null, true);
  qb.repeat.set(2.5, 2.5); qh.repeat.set(2.5, 2.5);
  M.quilt = phys({ map: qb, bumpMap: qh, bumpScale: 2.2, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35 });
  M.glass = phys({ color: 0xf2fbff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.2 });
  M.pdlc = phys({ color: 0xe6f0f2, roughness: 0.3, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  M.smoke = phys({ color: 0x08090a, roughness: 0.1, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  M.mirror = std({ color: 0xffffff, roughness: 0.03, metalness: 1, envMapIntensity: 1.4 });
  M.led = std({ color: 0xfff0d0, emissive: TH.light, emissiveIntensity: 2.4, roughness: 0.4 });
  M.cove = std({ color: 0xffe0b0, emissive: TH.light, emissiveIntensity: 1.6 });
  M.accent = std({ color: TH.accent, emissive: TH.accent, emissiveIntensity: 2 });
  M.green = std({ color: 0x20ff55, emissive: 0x20ff55, emissiveIntensity: 2 });
  M.red = std({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 });
  M.ledcool = std({ color: 0xd9ecff, emissive: 0xd9ecff, emissiveIntensity: 1.2 });
  M.gold = std({ color: 0xffbf40, roughness: 0.25, metalness: 1 });
  M.giftRed = std({ color: 0x990d12, roughness: 0.4 });
  M.pillow = std({ color: 0xece8dc, roughness: 1 });
  M.bin = [0x0a0a0a, 0x1d5a2e, 0x595a5c, 0x1a3a82].map((c) => std({ color: c, roughness: 0.5 }));
  M.binGrey = std({ color: 0x595958, roughness: 0.5 });
  M.coat = [0x1c1c22, 0x6b4527, 0x334e4a].map((c) => std({ color: c, roughness: 0.95 }));
  M.leaf = [0x1f5420, 0x336b29].map((c) => std({ color: c, roughness: 0.55, side: THREE.DoubleSide }));
  M.soil = std({ color: 0x0f0a07, roughness: 1 });
  M.terracotta = std({ color: 0x8c452b, roughness: 0.75 });
  M.person = std({ color: 0xa8a094, roughness: 0.6 });
  M.cabinetInterior = std({ color: 0x2a2724, roughness: 0.9 });
  M.suitcase = std({ color: 0x23324f, roughness: 0.5 });
  M.suitcase2 = std({ color: 0x6b2a2a, roughness: 0.5 });
  M.screenTv = new THREE.MeshBasicMaterial({ map: tex.screen('#15485a', '#e08c47', 'NOW PLAYING') });
  M.screenAd = new THREE.MeshBasicMaterial({ map: tex.screen('#e69a40', '#a6335c', 'TOLPOD') });
  M.screenUi = new THREE.MeshBasicMaterial({ map: tex.screen('#1a8a82', '#33478c', 'TOUCH HERE') });
  M.light = TH.light;
  M.accentColor = TH.accent;
  return M;
}
