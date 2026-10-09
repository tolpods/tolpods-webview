// Procedural textures + PBR materials. Everything is generated in code, so the site needs no image files.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const THEMES = {
  zen_sage: { interior: [0.84, 0.79, 0.68], exterior: [0.36, 0.46, 0.37], light: 0xffd2a0, accent: 0xff8c40 },
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

// ---------- fonts and canvas helpers for text / UI textures ----------
const SANS = '"DM Sans", system-ui, "Segoe UI", sans-serif';
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO = '"DM Mono", "IBM Plex Mono", ui-monospace, monospace';
function rr(g, x, y, w, h, r) {                                   // rounded rectangle path
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function spaced(g, px) { try { g.letterSpacing = px + 'px'; } catch (e) { /* older browsers: no letter spacing */ } }
function fitFont(g, text, weight, family, size, maxW) {          // shrink until the text fits the width
  let s = size;
  for (let i = 0; i < 16; i++) {
    g.font = `${weight} ${Math.round(s)}px ${family}`;
    const m = g.measureText ? g.measureText(text) : null;
    if (!m || !m.width || m.width <= maxW) break;
    s *= 0.92;
  }
  return s;
}
function uiTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

// ---------- texture recipes ----------
export const tex = {
  wood(c1, c2, seed = 3, size = 512) {                       // boards of straight-grained timber: each board has its own tone, rings, pores and a hairline joint
    return pixelTexture(size, size, (u, v) => {
      const boards = 4, b = Math.floor(u * boards), fu = u * boards - b;
      const tone = 0.86 + 0.28 * hash(b, 3, seed);
      const wander = vnoise(u * 3, v * 1, 3, 1, seed) - 0.5;
      const ring = 0.5 + 0.5 * Math.sin(TAU * (fu * 7 + wander * 0.9 + hash(b, 9, seed) * 3));
      const pores = vnoise(u * 160, v * 6, 160, 6, seed + 9);
      const t = Math.min(1, Math.max(0, (ring * 0.6 + pores * 0.4) * tone));
      let col = mix(c1, c2, t);
      if (fu < 0.012 || fu > 0.988) col = [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5];
      return col;
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
  panel(base, size = 512) {                                  // powder-coated steel cladding: fine orange-peel, 48" panels with pressed reveal joints
    const J = 0.0055;                                         // half joint width in tile units (about 0.27")
    return pixelTexture(size, size, (u, v) => {
      const px = Math.floor(u * size), py = Math.floor(v * size);
      const k = 0.965 + 0.03 * fbm(u, v, 3, 3, 8) + 0.03 * (hash(px, py, 3) - 0.5);
      let c = [base[0] * 255 * k, base[1] * 255 * k, base[2] * 255 * k];
      const d = Math.min(u, 1 - u, v, 1 - v);
      if (d < J) c = c.map((x) => x * 0.3);                   // the groove
      else if (d < 2.2 * J) c = c.map((x) => Math.min(255, x * 1.07));   // the lit lip beside it
      return c;
    });
  },
  membrane(size = 256) {                                      // roof membrane: dark grey, welded seams every 24"
    return pixelTexture(size, size, (u, v) => {
      let k = 0.9 + 0.12 * fbm(u, v, 5, 4, 12) + 0.04 * (hash(Math.floor(u * size), Math.floor(v * size), 5) - 0.5);
      const e = Math.min(Math.abs(u - 0.5), Math.abs(u - 0), Math.abs(u - 1));
      if (e < 0.006) k *= 1.35;
      return [52 * k, 54 * k, 57 * k];
    });
  },
  wordmark() {                                                // big mark for the right wall: 96" x 22", transparent background
    const w = 2048, h = 469, c = newCanvas(w, h), g = c.getContext('2d');
    g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = '#ebe4d2';
    const fs = fitFont(g, 'TOLPOD', '700', SANS, h * 0.66, w * 0.6); spaced(g, fs * 0.14); g.fillText('TOLPOD', 12, h * 0.62); spaced(g, 0);
    g.fillRect(14, h * 0.74, w * 0.9, 3);
    g.fillStyle = 'rgba(235,228,210,0.8)'; g.font = `500 ${Math.round(h * 0.11)}px ${MONO}`; spaced(g, h * 0.018);
    g.fillText('PRIVATE REST POD   -   UNIT TP-01   -   TOLPOD.COM', 14, h * 0.93); spaced(g, 0);
    return uiTex(c);
  },
  plate() {                                                   // stainless data plate, 24" x 10"
    const w = 960, h = 400, c = newCanvas(w, h), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c9ccce'); gr.addColorStop(0.5, '#e1e3e4'); gr.addColorStop(1, '#b8bbbd');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 4; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#26282a'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = `700 64px ${SANS}`; spaced(g, 8); g.fillText('TOLPOD', 44, 70); spaced(g, 0);
    g.font = `500 34px ${MONO}`;
    ['MODEL TP-1        UNIT 0001', '90 x 144 x 94 IN    OCC. 1', 'WHEELS LOCKED WHEN PARKED', 'SERVICE: 120 V / 15 A'].forEach((t, i) => g.fillText(t, 44, 150 + i * 62));
    for (const [x, y] of [[40, 40], [w - 40, 40], [40, h - 40], [w - 40, h - 40]]) { g.fillStyle = '#8d9093'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); }
    return uiTex(c);
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
  // ---- text/UI textures: drawn at the real aspect ratio of the surface they go on, with the site's fonts
  header(title, sub, c1, c2, aspect) {                       // vending-machine header strip
    const w = 1536, h = Math.round(w / aspect), c = newCanvas(w, h), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, 0, w, h * 0.5);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - Math.max(3, h * 0.045), w, Math.max(3, h * 0.045));
    g.textBaseline = 'middle'; g.fillStyle = '#fffaf0';
    if (aspect > 5) {                                        // wide: title left, small caption right
      const fs = fitFont(g, title, '700', SANS, h * 0.5, w * 0.6); spaced(g, fs * 0.08); g.textAlign = 'left'; g.fillText(title, w * 0.04, h * 0.53);
      g.font = `500 ${Math.round(h * 0.2)}px ${MONO}`; spaced(g, h * 0.03); g.textAlign = 'right'; g.fillStyle = 'rgba(255,250,240,0.85)'; g.fillText(sub, w * 0.96, h * 0.53);
    } else {                                                 // narrow: title centred, caption underneath
      const fs = fitFont(g, title, '700', SANS, h * 0.36, w * 0.84); spaced(g, fs * 0.06); g.textAlign = 'center'; g.fillText(title, w / 2, h * 0.42);
      g.font = `500 ${Math.round(h * 0.1)}px ${MONO}`; spaced(g, h * 0.02); g.fillStyle = 'rgba(255,250,240,0.85)'; g.fillText(sub, w / 2, h * 0.76);
    }
    spaced(g, 0); return uiTex(c);
  },
  kiosk() {                                                  // 13: touch-screen UI, portrait 22.8 x 44.8
    const w = 512, h = 1008, c = newCanvas(w, h), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0f1416'); gr.addColorStop(1, '#1d2b2e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#8f9b98'; g.font = `500 22px ${MONO}`; g.fillText('09:41', 36, 44);
    g.textAlign = 'right'; g.fillText('WI-FI  100%', w - 36, 44);
    g.textAlign = 'center'; g.fillStyle = '#d9a95a'; g.font = `italic 400 104px ${SERIF}`; g.fillText('Tolpod', w / 2, 150);
    g.fillStyle = '#8f9b98'; g.font = `500 20px ${MONO}`; spaced(g, 3); g.fillText('A PRIVATE PAUSE, BETWEEN PLACES', w / 2, 222); spaced(g, 0);
    const tiles = [['Drinks', 0], ['Snacks', 1], ['Rest', 2], ['Info', 3]];
    tiles.forEach(([label, k], i) => {
      const x = 36 + (i % 2) * 226, y = 290 + Math.floor(i / 2) * 236;
      rr(g, x, y, 214, 214, 26); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = '#d9a95a'; g.fillStyle = '#d9a95a'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
      const cx = x + 107, cy = y + 88;
      if (k === 0) { g.beginPath(); g.moveTo(cx - 26, cy - 34); g.lineTo(cx + 26, cy - 34); g.lineTo(cx + 18, cy + 40); g.lineTo(cx - 18, cy + 40); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(cx + 6, cy - 34); g.lineTo(cx + 22, cy - 56); g.stroke(); }
      if (k === 1) { g.beginPath(); g.moveTo(cx - 30, cy - 38); g.lineTo(cx + 30, cy - 38); g.lineTo(cx + 36, cy + 40); g.lineTo(cx - 36, cy + 40); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(cx - 30, cy - 22); g.lineTo(cx + 30, cy - 22); g.stroke(); }
      if (k === 2) { g.beginPath(); g.arc(cx, cy, 38, 0.5 * Math.PI, 1.5 * Math.PI, false); g.arc(cx - 14, cy, 30, 1.5 * Math.PI, 0.5 * Math.PI, true); g.closePath(); g.fill(); }
      if (k === 3) { g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(cx, cy - 4); g.lineTo(cx, cy + 22); g.stroke(); g.beginPath(); g.arc(cx, cy - 20, 3, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#ece7db'; g.textAlign = 'center'; g.font = `600 34px ${SANS}`; g.fillText(label, cx, y + 176);
    });
    rr(g, 36, 800, 440, 92, 46); g.fillStyle = '#d9a95a'; g.fill();
    g.fillStyle = '#1a1409'; g.font = `700 38px ${SANS}`; g.textAlign = 'center'; g.fillText('Touch to begin', w / 2, 847);
    g.fillStyle = '#8f9b98'; g.font = `500 20px ${MONO}`; g.fillText('PAY BY CARD OR APP', w / 2, 950);
    return uiTex(c);
  },
  keypad() {                                                 // vending keypad screen 10 x 6
    const w = 512, h = 307, c = newCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#101417'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b2a2d'; g.fillRect(0, 0, w, 54);
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#8f9b98'; g.font = `500 24px ${MONO}`; spaced(g, 3); g.fillText('SELECT', 28, 28); spaced(g, 0);
    g.fillStyle = '#ece7db'; g.font = `700 150px ${SANS}`; g.fillText('A4', 28, 168);
    g.textAlign = 'right'; g.fillStyle = '#d9a95a'; g.font = `700 76px ${SANS}`; g.fillText('$2.50', w - 28, 150);
    g.fillStyle = '#8f9b98'; g.font = `500 22px ${MONO}`; spaced(g, 3); g.fillText('TAP TO PAY', w - 28, 252); spaced(g, 0);
    return uiTex(c);
  },
  tvScene() {                                                // the 50" TV / a calm landscape, 16:9
    const w = 1024, h = 560, c = newCanvas(w, h), g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#15405a'); sky.addColorStop(0.62, '#e7a56e'); sky.addColorStop(1, '#f4d3a2'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const sun = g.createRadialGradient(690, 330, 10, 690, 330, 190); sun.addColorStop(0, 'rgba(255,248,220,1)'); sun.addColorStop(0.3, 'rgba(255,214,150,0.65)'); sun.addColorStop(1, 'rgba(255,214,150,0)'); g.fillStyle = sun; g.fillRect(0, 0, w, h);
    [['#4a6b5a', 400, 60], ['#2f5146', 440, 80], ['#1b3430', 480, 70]].forEach(([col, y, amp], i) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, h); g.lineTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.006 + i * 1.7) * amp * 0.5 + Math.sin(x * 0.017 + i) * amp * 0.2);
      g.lineTo(w, h); g.closePath(); g.fill();
    });
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = `500 22px ${MONO}`; spaced(g, 3); g.fillText('NOW PLAYING  -  04:32', 48, 52); spaced(g, 0);
    g.font = `italic 400 120px ${SERIF}`; g.fillText('Calm', 48, 470);
    return uiTex(c);
  },
  adScreen() {                                               // ad screen on the left wall, 16:9
    const w = 1024, h = 560, c = newCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#e9e5dd'; g.fillRect(0, 0, w, h);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillStyle = '#987347'; g.font = `500 22px ${MONO}`; spaced(g, 4); g.fillText('TOLPOD  -  A PRIVATE PAUSE', 64, 96); spaced(g, 0);
    g.fillStyle = '#272622'; g.font = `400 100px ${SANS}`; spaced(g, -3); g.fillText('Make room for', 60, 230); spaced(g, 0);
    g.fillStyle = '#987347'; g.font = `italic 400 170px ${SERIF}`; g.fillText('rest.', 60, 380);
    rr(g, 64, 428, 300, 64, 32); g.fillStyle = '#272622'; g.fill();
    g.fillStyle = '#f3efe7'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 26px ${SANS}`; g.fillText('Scan to book', 214, 462);
    return uiTex(c);
  },
  brandBar() {                                               // header above the touch screen, 4:1
    const w = 1024, h = 256, c = newCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#101315'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9a95a'; g.fillRect(0, h - 8, w, 8);
    g.fillStyle = '#f3efe7'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `500 98px ${MONO}`; spaced(g, 22); g.fillText('TOLPOD', w / 2 + 11, h * 0.46); spaced(g, 0);
    return uiTex(c);
  },
  sign(text, color = '#e0b55a', w = 512, h = 128, bg = null, style = 'sans') {
    const c = newCanvas(w, h), ctx = c.getContext('2d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fam = style === 'serif' ? SERIF : SANS, wt = style === 'serif' ? 'italic 400' : '700';
    const fs = fitFont(ctx, text, wt, fam, h * 0.62, w * 0.92);
    if (style !== 'serif') spaced(ctx, fs * 0.1);
    ctx.fillText(text, w / 2, h / 2); spaced(ctx, 0);
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
  const oakMap = tex.wood([116, 84, 52], [178, 140, 96], 3), walMap = tex.wood([26, 13, 6], [69, 36, 18], 8), floorMap = tex.planks([115, 77, 41], [92, 59, 31]);
  M.oak = std({ map: oakMap, bumpMap: oakMap, bumpScale: 0.35, roughness: 0.55, metalness: 0 }, 30);
  M.walnut = std({ map: walMap, bumpMap: walMap, bumpScale: 0.3, roughness: 0.5, metalness: 0 }, 30);
  M.floor = std({ map: floorMap, bumpMap: floorMap, bumpScale: 0.6, roughness: 0.4, metalness: 0 }, 36);
  M.plaster = std({ map: tex.plaster(TH.interior), roughness: 0.85 }, 48);
  const extMap = tex.panel(TH.exterior);
  M.ext = std({ map: extMap, bumpMap: extMap, bumpScale: 0.9, roughness: 0.5, metalness: 0.12 }, 48);
  M.roofTop = std({ map: tex.membrane(), roughness: 0.92 });
  M.hvac = std({ color: 0xc9cbcd, roughness: 0.5, metalness: 0.5 });
  M.safety = std({ color: 0xe0b01c, roughness: 0.6 });
  M.skirt = std({ color: 0xffd9a0, emissive: 0xffa24a, emissiveIntensity: 0.9, roughness: 0.5 });
  M.wordmark = std({ map: tex.wordmark(), transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  M.plate = std({ map: tex.plate(), roughness: 0.35, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
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
  const screen = (map) => new THREE.MeshBasicMaterial({ map, toneMapped: false });      // screens glow with their own colours
  M.screenTv = screen(tex.tvScene()); M.screenAd = screen(tex.adScreen()); M.screenKiosk = screen(tex.kiosk());
  M.screenKey = screen(tex.keypad()); M.screenBrand = screen(tex.brandBar()); M.screenUi = M.screenKiosk;
  M.vend = std({ color: 0xf4efe6, emissive: 0xfff1dc, emissiveIntensity: 0.55, roughness: 0.6 });      // soft light behind the products
  M.light = TH.light;
  M.accentColor = TH.accent;
  return M;
}
