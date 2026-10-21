// TOLPODS - the full pod, built in code from the sheet's dimensions (inches).
// Plan frame: x right (0..90), y toward the ENTRANCE (0..144), z up. The group is rotated so the scene is Y-up.
import * as THREE from 'three';
import { SPEC as S } from './spec.js';
import { makeMaterials, tex } from './mats.js';
import { Batch, boxGeo, rboxGeo, cylGeo, cylXGeo, cylYGeo, extrudeXZ, extrudeYZ, planeGeo, triPanel } from './geo.js';
import { Products } from './products.js';
import { buildChair, POSES } from './chair.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);
const rng = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
export const planToWorld = (x, y, z) => new THREE.Vector3(x, z, -y);
export const RAMP_LEN = 60;
export function groundZ(x, y) {                      // floor height under a plan point
  if (x >= 0 && x <= 90 && y >= 0 && y <= 144) return 0;
  if (x >= 23.5 && x <= 53.5 && y > 144 && y < 144 + RAMP_LEN) return -(y - 144) * 10 / RAMP_LEN;
  return -10;
}

export function buildPod(opts = {}) {
  const M = makeMaterials(opts.theme);
  const rand = rng(7);
  const root = new THREE.Group(); root.name = 'tolpod';
  const pod = new THREE.Group(); pod.name = 'plan'; pod.rotation.x = -Math.PI / 2; root.add(pod);
  const lights = new THREE.Group(); lights.name = 'lights'; root.add(lights);
  const batch = new Batch();
  const prod = new Products();
  const parts = {};
  const rigs = {};

  // ---- tiny builders (static ones are merged by material)
  const solids = [];                                                       // every static box, kept for tools/collide.mjs
  // Layered construction means many boxes share an exact face plane with an earlier box (cladding over a wall core, trim over a panel).
  // Two faces on one plane z-fight: they flicker as the camera or the pod moves. So a box built later is grown outward by a hair (0.025") on
  // any face it shares with an earlier box facing the same way, which keeps the later, visible layer in front at every zoom level.
  const FACES = [['x0', 'x1', 'y0', 'y1', 'z0', 'z1'], ['y0', 'y1', 'x0', 'x1', 'z0', 'z1'], ['z0', 'z1', 'x0', 'x1', 'y0', 'y1']];
  const LIFT = 0.025;
  const layer = (box) => {
    const lv = {}, out = { ...box };
    for (const [p0, p1, u0, u1, v0, v1] of FACES) {
      for (const f of [p0, p1]) {
        let l = 0;
        for (const a of solids) {
          if (a.flat || Math.abs(a[f] - box[f]) > 0.005) continue;
          if (Math.min(a[u1], box[u1]) - Math.max(a[u0], box[u0]) < 0.05 || Math.min(a[v1], box[v1]) - Math.max(a[v0], box[v0]) < 0.05) continue;
          l = Math.max(l, (a.lv && a.lv[f]) + 1 || 1);
        }
        if (l) { lv[f] = l; out[f] += (f === p0 ? -1 : 1) * l * LIFT; }
      }
    }
    return { out, lv };
  };
  const B = (x0, y0, z0, sx, sy, sz, mat) => {
    const box = { x0, y0, z0, x1: x0 + sx, y1: y0 + sy, z1: z0 + sz, mat };
    const { out, lv } = layer(box);
    solids.push({ ...box, lv });
    return batch.add(boxGeo(out.x0, out.y0, out.z0, out.x1 - out.x0, out.y1 - out.y0, out.z1 - out.z0, mat), mat);
  };
  const R = (x0, y0, z0, sx, sy, sz, r, mat, seg) => (solids.push({ x0, y0, z0, x1: x0 + sx, y1: y0 + sy, z1: z0 + sz, mat, lv: {} }), batch.add(rboxGeo(x0, y0, z0, sx, sy, sz, r, seg), mat));
  const C = (cx, cy, z0, r, h, mat, seg = 24, rTop = r) => batch.add(cylGeo(cx, cy, z0, r, h, seg, rTop), mat);
  const CX = (x0, cy, cz, r, len, mat) => batch.add(cylXGeo(x0, cy, cz, r, len), mat);
  const CY = (cx, y0, cz, r, len, mat) => batch.add(cylYGeo(cx, y0, cz, r, len), mat);
  const PL = (w, h, facing, cx, cy, cz, mat) => batch.add(planeGeo(w, h, facing, cx, cy, cz), mat);
  // vending details: spiral coils (kept in a list so the Blender export can rebuild them), price rails drawn from one atlas per machine
  const coils = [];
  class Helix extends THREE.Curve {
    constructor(ax, c0, c1, r, len, turns) { super(); Object.assign(this, { ax, c0, c1, r, len, turns }); }
    getPoint(t, o = new THREE.Vector3()) {
      const a = this.turns * Math.PI * 2 * t, u = this.len * t, p = [this.c0 + this.r * Math.cos(a), this.c1 + this.r * Math.sin(a)];
      return this.ax === 'y' ? o.set(p[0], u, p[1]) : o.set(u, p[0], p[1]);
    }
  }
  // axis 'y' (lane runs along y from y0) or 'x' (lane runs along x from x0); (c0, c1) = lane centre in the two other axes (x,z) or (y,z)
  const coil = (ax, a0, c0, c1, r, len, mat) => {
    const turns = Math.max(2, Math.round(len / 3.4));
    const g = new THREE.TubeGeometry(new Helix(ax, c0, c1, r, len, turns), turns * 4, 0.12, 3, false);
    if (ax === 'y') g.translate(0, a0, 0); else g.translate(a0, 0, 0);
    coils.push([ax, +a0.toFixed(3), +c0.toFixed(3), +c1.toFixed(3), +r.toFixed(3), +len.toFixed(3), turns]);
    batch.add(g, mat);
  };
  const railUV = (g, row, rows) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) + (rows - 1 - row)) / rows); return g; };
  const mesh = (geo, mat, parent, name, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow && !mat.transparent; m.receiveShadow = true;
    if (name) m.name = name;
    parent.add(m);
    return m;
  };
  const group = (name, x = 0, y = 0, z = 0, parent = pod) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; };
  const sign = (text, w, h, facing, cx, cy, cz, color, bg, style) => {
    const m = new THREE.MeshBasicMaterial({ map: tex.sign(text, color, 1024, Math.round(1024 * h / w), bg, style), transparent: !bg, toneMapped: false });
    batch.add(planeGeo(w, h, facing, cx, cy, cz), m);
  };

  // =========================================================== shell, floor, roof, lights
  B(0, 0, -S.pod.deck, 90, 144, S.pod.deck, M.deck);
  (() => {                                                                                   // soft contact shadow on the floor, following the footprint
    const W = 130, H = 190, k = 2, c = document.createElement('canvas'); c.width = W * k; c.height = H * k; const g = c.getContext('2d');
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 26; g.shadowOffsetX = 2000; g.fillStyle = '#000';   // draw only the blurred shadow, not the rectangle
    g.fillRect(20 * k - 2000, 23 * k, 90 * k, 144 * k);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H).translate(45, 72, -9.7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.renderOrder = 1; pod.add(m);
  })();
  B(3.5, 48, 0, 80, 96, 0.4, M.floor);
  // ---- flat roof with a car-style tilt-and-slide moonroof: tinted glass over a cream sliding shade.
  // Two glass panels, hinged at the entrance edge: they tilt up at the back and/or part sideways over the side roof. The shade slides back into the rear roof.
  parts.roof = group('roof');
  const MX0 = 15, MX1 = 75, MY0 = 60, MY1 = 108, ZR = S.pod.H, ZT = S.pod.H + S.pod.roof;          // opening 60 x 48 in a flat roof, z 92..94
  const slab = (x0, y0, x1, y1) => { mesh(boxGeo(x0, y0, ZR, x1 - x0, y1 - y0, 0.4, M.ceil), M.ceil, parts.roof, 'roof.slab'); mesh(boxGeo(x0, y0, ZR + 0.4, x1 - x0, y1 - y0, ZT - ZR - 0.4, M.roofTop), M.roofTop, parts.roof, 'roof.slab'); };
  slab(0, 0, 90, MY0); slab(0, MY1, 90, 144); slab(0, MY0, MX0, MY1); slab(MX1, MY0, 90, MY1);
  const trim = (x0, y0, sx, sy, z0, h) => mesh(boxGeo(x0, y0, z0, sx, sy, h, M.steel), M.steel, parts.roof, 'roof.item', false);
  trim(MX0 - 1.2, MY0 - 1.2, MX1 - MX0 + 2.4, 1.2, ZT - 0.3, 0.6); trim(MX0 - 1.2, MY1, MX1 - MX0 + 2.4, 1.2, ZT - 0.3, 0.6);   // frame around the opening
  trim(1, MY0 - 1.2, 88, 1.2, ZT - 0.3, 0.8); trim(1, MY1, 88, 1.2, ZT - 0.3, 0.8);                                         // guide rails run sideways over the side roof
  const tint = M.glass.clone(); tint.color.set(0x242c2b); tint.opacity = 0.5; M.glassTint = tint;
  const GL = MY1 - MY0, GW = (MX1 - MX0) / 2, SLIDE = 13;                                                                      // two 30 x 48 panels
  const panels = [-1, 1].map((dir) => {                                                                                     // dir -1 = left panel, +1 = right panel
    const slide = group('roof.slide', 45 + dir * GW / 2, MY1, ZT - 0.9, parts.roof);                                         // hinge line = front (entrance) edge
    const tilt = group('roof.tilt', 0, 0, 0, slide);
    mesh(boxGeo(-GW / 2, -GL, 0, GW, GL, 0.6, tint), tint, tilt, 'roof.glass', false);
    for (const [x0, y0, sx, sy] of [[-GW / 2, -GL, GW, 1.6], [-GW / 2, -1.6, GW, 1.6], [-GW / 2, -GL, 1.6, GL], [GW / 2 - 1.6, -GL, 1.6, GL]]) mesh(boxGeo(x0, y0, 0.6, sx, sy, 0.1, M.graphite), M.graphite, tilt, 'roof.frit', false);
    return { dir, slide, tilt, x: 45 + dir * GW / 2 };
  });
  const shade = group('roof.shade', 0, 0, 0, parts.roof);                                 // sunshade: fabric panel that retracts into the rear roof
  mesh(boxGeo(MX0, MY0, ZR + 0.05, MX1 - MX0, GL, 0.3, M.plaster), M.plaster, shade, 'roof.shadeSheet', false);
  mesh(boxGeo(MX0, MY1 - 1.6, ZR - 0.3, MX1 - MX0, 1.2, 0.4, M.steel), M.steel, shade, 'roof.shadeBar', false);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  // three independent controls: shade (slides back into the rear roof), tilt (glass rear edge up), slide (the two panels part sideways)
  const st = { tilt: 0, slide: 0 };
  const placeGlass = () => {
    const lift = 2.6 * Math.max(st.tilt, clamp01(st.slide / 0.25));            // the glass rises above the roof rails before it slides
    for (const p of panels) {
      p.slide.position.x = p.x + p.dir * SLIDE * clamp01((st.slide - 0.2) / 0.8);
      p.slide.position.z = ZT - 0.9 + lift;
      p.tilt.rotation.x = -THREE.MathUtils.degToRad(11 * st.tilt);
    }
  };
  rigs.shade = { t: 0, target: 0, dur: 2.6, apply: (e) => { shade.position.y = -GL * e; } };
  rigs.tilt = { t: 0, target: 0, dur: 2.4, apply: (e) => { st.tilt = e; placeGlass(); } };
  rigs.slide = { t: 0, target: 0, dur: 3.4, apply: (e) => { st.slide = e; placeGlass(); } };
  parts.moonroof = { x: [MX0, MX1], y: [MY0, MY1], panels, shade };
  for (const x of [20, 39.5, 59]) { B(x - 1.5, 52, 91.6, 3, 8, 0.4, M.led); B(x - 1.5, 114, 91.6, 3, 26, 0.4, M.led); }
  B(MX0 - 2.4, MY0, 91.6, 1, GL, 0.4, M.led); B(MX1 + 1.4, MY0, 91.6, 1, GL, 0.4, M.led);
  for (const y of [58, 112, 130]) B(3.5, y - 2, 90.4, y > 98 ? 68 : 80, 4, 1.6, M.oak);          // oak ceiling beams: the two in the opening are gone so the moonroof is clear
  B(3.5, 48.2, 88.2, 80, 1.2, 0.5, M.cove); B(3.5, 48, 88.8, 80, 3, 0.8, M.oak);          // warm cove light + ledge

  // ---- left wall strip (x 0..3.5): plain, with the ad screen. A 40" wide opening (y 3.5..43.5, up to z 72) holds the snack machine
  const WY0 = 3.5, WY1 = 43.5, WZ = 72;
  B(0, 0, 86, 3.5, 144, 6, M.ext); B(0, 0, 0, 3.5, WY0, 8, M.graphite); B(0, WY1, 0, 3.5, 144 - WY1, 8, M.graphite);
  for (const y of [0, 71.4, 142.8]) B(0, y, 0, 3.5, 1.2, 92, M.ext);
  B(0, 1.2, 8, 3.5, WY0 - 1.2, 78, M.ext); B(0, WY1, 8, 3.5, 71.4 - WY1, 78, M.ext); B(0, WY0, WZ, 3.5, WY1 - WY0, 86 - WZ, M.ext); B(0, 72.6, 8, 3.5, 70.2, 78, M.ext);
  B(2.9, 0, 0, 0.6, WY0, 92, M.plaster); B(2.9, WY1, 0, 0.6, 144 - WY1, 92, M.plaster); B(2.9, WY0, WZ, 0.6, WY1 - WY0, 92 - WZ, M.plaster);   // inner skin goes on last, so the cream plaster (not the sage shell) faces the cabin
  // ---- right wall strip (x 83.5..90): same opening for the refrigerated machine
  B(83.5, 0, 86, 6.5, 144, 6, M.ext); B(83.5, 0, 0, 6.5, WY0, 8, M.graphite); B(83.5, WY1, 0, 6.5, 144 - WY1, 8, M.graphite);
  B(83.5, 0, 8, 6.5, WY0, 78, M.ext); B(83.5, WY1, 8, 6.5, 144 - WY1, 78, M.ext); B(83.5, WY0, WZ, 6.5, WY1 - WY0, 86 - WZ, M.ext);
  B(83.5, 0, 0, 0.6, WY0, 92, M.plaster); B(83.5, WY1, 0, 0.6, 144 - WY1, 92, M.plaster); B(83.5, WY0, WZ, 0.6, WY1 - WY0, 92 - WZ, M.plaster);
  // ---- cabin back wall (y 47.2..48): solid, so the machines behind it cannot be seen from inside (or the other way round)
  // ---- front: 30" entrance opening, frame, rails for the two glass layers
  B(3.5, 142.8, 35, 12, 1.2, 57, M.ext);
  B(23.5, 142.5, 80, 30, 2, 1.5, M.graphite); B(23.5, 143.2, 81.5, 30, 0.6, 10.5, M.glass); B(23.5, 142, 0, 30, 3, 0.5, M.steel);
  B(22.7, 142.2, 0, 0.8, 2.6, 82, M.steel); B(53.5, 142.2, 0, 0.8, 2.6, 82, M.steel);
  for (const yy of [144.0, 144.6]) { B(23.5, yy, 0.5, 60, 0.4, 0.3, M.steel); B(23.5, yy, 79.4, 60, 0.4, 0.6, M.steel); }
  B(53.5, 144.6, 73.6, 18, 0.7, 18.4, M.graphite);                                          // solid sign panel, outermost layer: covers the whole upper space beside the door
  B(53.5, 144.6, 73.6, 18, 0.85, 0.5, M.steel); B(53.5, 144.6, 91.5, 18, 0.85, 0.5, M.steel);   // steel trim, top and bottom
  B(53.5, 144.6, 73.6, 0.5, 0.85, 18.4, M.steel); B(71, 144.6, 73.6, 0.5, 0.85, 18.4, M.steel); B(54.6, 145.3, 74.9, 15.8, 0.05, 0.25, M.brass); B(54.6, 145.3, 90.4, 15.8, 0.05, 0.25, M.brass);   // brass inlay lines
  sign('TOLPODS', 15, 4.4, '+y', 62.5, 145.36, 85.2, '#e0b55a');
  sign('rest \u00b7 recharge', 15, 2.6, '+y', 62.5, 145.36, 79.2, '#e0b55a', null, 'serif');
  // privacy cameras (7)
  B(36.5, 144.5, 84, 3, 3, 3, M.graphite); B(36.2, 148.2, 84.1, 3.6, 0.3, 1.6, M.steel); CY(38, 147, 85.5, 1, 1.2, M.black);
  B(40.5, 139.5, 84, 3, 3, 3, M.graphite); CY(42, 138.2, 85.5, 1, 1.2, M.black); B(43, 142.6, 84.3, 0.5, 0.3, 0.5, M.red);

  // fixed glass, 2nd layer, left of the door (cannot open): fills the gap the sliding glass leaves beside the entrance
  B(3.5, 144.6, 0.8, 20, 0.4, 34.2, M.glass); B(15.5, 144.6, 35, 8, 0.4, 45, M.glass);
  B(3.5, 144.5, 0.5, 20, 0.6, 0.4, M.steel); B(15.5, 144.5, 79.4, 8, 0.6, 0.6, M.steel); B(3.5, 144.5, 35, 12, 0.6, 0.5, M.steel);
  B(15.2, 144.5, 35, 0.6, 0.6, 45, M.steel); B(23.1, 144.5, 0.5, 0.6, 0.6, 80, M.steel); B(3.5, 144.5, 0.5, 0.6, 0.6, 35, M.steel);
  // sage panel over the strip above the left fixed glass (x 15.5..23.5, z 80..92) and a lintel bar over the glass/door seam, so nothing is open up to the roof
  B(15.5, 142.8, 80, 8, 1.2, 12, M.ext); B(15.5, 142.7, 80, 8, 0.3, 12, M.plaster); B(15.5, 144.2, 80, 8, 0.4, 0.8, M.steel);
  B(23.5, 142.5, 79.6, 30, 2.1, 0.5, M.graphite);
  // fixed glass, right of the door (cannot open): closes the 18" gap between the sliding glass and the premium storage block
  B(53.9, 144.6, 0.8, 17.6, 0.4, 72.8, M.glass);
  B(53.5, 144.5, 0.5, 18, 0.6, 0.4, M.steel); B(53.5, 144.5, 73.4, 18, 0.6, 0.6, M.steel); B(53.5, 144.5, 0.5, 0.6, 0.6, 73, M.steel); B(70.9, 144.5, 0.5, 0.6, 0.6, 73, M.steel);

  // smart glass layers (outside the front wall, sliding sideways over the front of Block 5)
  const glassG1 = group('glass1', 0, 0, 0); mesh(boxGeo(23.5, 144.0, 0.8, 30, 0.4, 36, M.pdlc), M.pdlc, glassG1, 'glass.layer1', false);
  const glassG2 = group('glass2', 0, 0, 0); mesh(boxGeo(23.5, 144.6, 36.8, 30, 0.4, 42.6, M.glass), M.glass, glassG2, 'glass.layer2', false);
  rigs.glass1 = { t: 0, target: 0, dur: 1.2, apply: (e) => { glassG1.position.x = 30 * (1 - e); } };      // t = 1 -> closed
  rigs.glass2 = { t: 0, target: 0, dur: 1.2, apply: (e) => { glassG2.position.x = 30 * (1 - e); } };

  // =========================================================== 1  massage chair (rigged)
  const chair = buildChair({ M, S, group, mesh, rigs, parts, pod, clamp });          // see js/chair.js


  // =========================================================== 3  TV on a ceiling rail
  (() => {
    const cx = S.chair.centreX, yh = 113, zh = 85.5, tw = S.tv.w, th = S.tv.h;
    B(21.3, 111.5, 89, 36, 3, S.tv.rail, M.steel); B(cx - 5, 110.5, 83.5, 10, 5, 6, M.graphite);
    const g = group('tv', cx, yh, zh);
    const L = [0, 0, 0];
    mesh(boxGeo(-1.5, -1, -7.5, 3, 2, 7.5, M.graphite), M.graphite, g, 'tv.arm');
    mesh(boxGeo(-tw / 2, -0.5, -7.5 - th, tw, 1.6, th, M.black), M.black, g, 'tv.bezel');
    mesh(planeGeo(tw - 1.6, th - 1.6, '-y', 0, -0.52, -7.5 - th / 2), M.screenTv, g, 'tv.screen', false);
    rigs.tv = { t: 0, target: 0, dur: 1.8, apply: (e) => { g.rotation.x = -(Math.PI / 2) * (1 - e); } };   // 0 = flipped up (stowed), 1 = watching
    parts.tv = g;
  })();

  // (coat station, fridge/microwave block and the free-storage locker were removed: the entrance end is now open floor)

  // =========================================================== premium storage (rigged door)
  (() => {
    const w = 0.8;
    // premium storage 12 x 44 x 92, door on the inside face (x = 71.5)
    B(71.5, 100, 0, 12, 44, w, M.cabinetInterior); B(71.5, 100, 92 - w, 12, 44, w, M.oak); B(83.5 - w, 100, 0, w, 44, 92, M.oak);
    B(71.5, 100, 0, 12, w, 92, M.oak); B(71.5, 143.2, 0, 12, w, 92, M.oak);
    B(71.5, 100, 0, w, 1, 92, M.oak); B(71.5, 115, 0, w, 29, 92, M.oak); B(71.5, 100, 0, w, 44, 2, M.oak); B(71.5, 100, 90, w, 44, 2, M.oak);
    R(73, 102, 0.8, 10, 18, 28, 1.5, M.suitcase2, 3); B(77, 108, 28.8, 3, 6, 1.2, M.steel);
    R(73, 122, 0.8, 10, 17, 24, 1.5, M.suitcase, 3);
    const dP = group('door.premium', 71.5, 115, 2);
    mesh(boxGeo(-0.5, -14, 0, 0.5, 14, 88, M.walnut), M.walnut, dP, 'door.premium');
    mesh(boxGeo(-1.7, -3, 38, 1.2, 1, 20, M.brass), M.brass, dP, 'door.premium'); mesh(boxGeo(-0.8, -12, 60, 0.3, 1.2, 1.2, M.green), M.green, dP, 'door.premium', false);
    rigs.premium = { t: 0, target: 0, dur: 1.6, apply: (e) => { dP.rotation.z = -(Math.PI / 2) * 0.96 * e; } };
    parts.doorPremium = dP;
  })();

  // =========================================================== 8  pillows & blankets (12 x 42 x 45): floor-standing unit against the left wall, at the entrance end
  (() => {
    const PY = 99.6, z0 = 10, teal = new THREE.MeshStandardMaterial({ color: 0x335a54, roughness: 0.95 }), tan = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.95 }), sage = new THREE.MeshStandardMaterial({ color: 0x597a5c, roughness: 0.95 });
    const bl = [teal, tan, sage];
    B(3.5, PY, 0, 11, 42, 3, M.graphite);                                       // recessed toe-kick
    B(3.5, PY, 3, 12.2, 42, 6.5, M.walnut);                                     // plinth / base
    B(15.4, PY + 0.4, 9.2, 0.5, 41.2, 0.3, M.brass); B(3.6, PY, 2.6, 11, 42, 0.4, M.cove);   // brass cap line, warm toe-kick glow
    B(3.5, PY - 0.6, 0, 12.2, 0.6, z0 + 51.5, M.walnut); B(3.5, PY + 42, 0, 12.2, 0.6, z0 + 51.5, M.walnut);   // end panels
    B(3.5, PY, 9.5, 0.5, 42, 47, M.graphite);                                   // back panel on the wall
    for (let d = 0; d < 3; d++) {
      const y0 = PY + d * 14;
      for (let p = 0; p < 5; p++) {
        const z = z0 + p * 9;
        R(3.5, y0, z, 12, 14, 6, 1.4, M.pillow); R(3.5, y0, z + 6, 12, 14, 3, 0.5, bl[d]); B(3.45, y0 - 0.05, z + 5.75, 12.1, 14.1, 0.5, M.brass);
      }
      B(15.6, y0 + 1.5, 4.2, 0.2, 11, 2.2, M.green);                            // division label on the plinth
      B(4.1, y0 + 0.6, z0 + 45.4, 10, 12.8, 0.3, M.cove);
      B(15.1, y0 + 0.6, z0, 0.4, 12.8, 1.6, M.glass);
    }
    B(3.5, PY, z0 + 46, 12.2, 42, 5.5, M.walnut);
    sign('PILLOWS & BLANKETS', 40, 4.2, '+x', 15.75, PY + 21, z0 + 48.8, '#e0b55a');
  })();

  // =========================================================== 9  weight-sensor minibar (12 x 26 x 36): left wall, beside the pillow unit
  (() => {
    const MY = 72.8;
    R(3.5, MY, 0, 12, 26, 16, 0.3, M.oak);
    for (let i = 0; i < 2; i++) { B(15.5, MY + 0.4 + i * 12.8, 0.6, 0.4, 12.4, 14.8, M.white); B(15.9, MY + 5 + i * 11.4, 6, 0.6, 0.6, 5, M.steel); }
    B(3.5, MY, 16, 12, 26, 0.8, M.steel); B(3.5, MY, 16, 0.5, 26, 20, M.graphite); B(3.5, MY, 16, 12, 0.5, 20, M.graphite); B(3.5, MY + 25.5, 16, 12, 0.5, 20, M.graphite);
    B(3.5, MY, 35.5, 12, 26, 0.5, M.graphite); B(3.5, MY, 26, 12, 26, 0.5, M.steel); B(14.6, MY + 0.5, 35, 0.6, 25, 0.4, M.led);
    for (const z of [16.8, 26.5]) {
      for (let c = 0; c < 9; c++) for (let r = 0; r < 2; r++) {
        const y = MY + 1.6 + c * 2.7, x = 3.5 + 3.2 + r * 5;
        B(x - 1.9, y - 1.3, z - 0.3, 3.8, 2.6, 0.3, M.black);
        const [kd, ci] = Products.random(rand, 'mix'); prod.add(kd, x, y + 0.1, z, Math.PI / 2, 0.7, ci);
      }
    }
  })();

  // =========================================================== 9b  left-wall extras: coat & bag hooks, charging panel, info screen
  (() => {
    // coat & bag hooks with a shelf, in the free bay between the back wall and the minibar (y 50..71)
    B(3.5, 50, 46, 0.8, 21, 36, M.oak);
    for (const y of [54.5, 60.5, 66.5]) { B(4.3, y - 1, 70.6, 0.5, 2, 2.8, M.brass); B(4.8, y - 0.4, 71.4, 2.8, 0.8, 0.8, M.brass); B(7.2, y - 0.4, 71.4, 0.8, 0.8, 2.2, M.brass); }
    B(3.5, 49, 52, 8, 23, 0.8, M.walnut); B(3.8, 50, 51.7, 7, 21, 0.3, M.cove);
    C(8, 68, 52.8, 2.6, 0.4, M.black, 24); C(8, 68, 53.2, 2.2, 0.1, M.led, 24);                           // wireless charging puck
    sign('COATS & BAGS', 17, 2, '+x', 4.35, 60.5, 77.4, '#e0b55a', '#2a1f14');
    // charging panel above the weight-sensor minibar: 4 USB-C, 2 USB-A, a universal outlet, wireless pad shelf
    const cy0 = 75.3;
    B(3.5, cy0, 41, 0.8, 21, 22, M.graphite);
    B(3.5, cy0, 40.3, 5, 21, 0.7, M.walnut); B(3.7, cy0 + 0.8, 41, 4, 19.4, 0.2, M.black); B(3.7, cy0 + 9, 41.1, 4, 3, 0.1, M.ledcool);   // phone pad
    for (let i = 0; i < 4; i++) { B(4.3, cy0 + 2.2 + i * 4.6, 55.5, 0.4, 3, 1.3, M.black); B(4.65, cy0 + 2.9 + i * 4.6, 56, 0.1, 1.6, 0.3, M.steel); B(4.3, cy0 + 2.2 + i * 4.6, 57.2, 0.4, 3, 0.25, M.ledcool); }
    for (let i = 0; i < 2; i++) { B(4.3, cy0 + 2.2 + i * 5.4, 49.5, 0.4, 4.4, 2, M.black); B(4.65, cy0 + 2.8 + i * 5.4, 50.1, 0.1, 3.2, 0.5, M.white); }
    B(4.3, cy0 + 12.6, 48.6, 0.5, 6.6, 4.2, M.white); B(4.8, cy0 + 14.1, 50.2, 0.1, 0.5, 1, M.black); B(4.8, cy0 + 17, 50.2, 0.1, 0.5, 1, M.black);
    sign('CHARGE', 9, 1.7, '+x', 4.35, cy0 + 10.5, 60.4, '#e0b55a', '#2a1f14');
    // slim info screen above the pillow unit
    B(3.5, 102.6, 66.5, 0.7, 36, 13, M.graphite); PL(35, 12, '+x', 4.25, 120.6, 73, M.screenInfo);
  })();

  // =========================================================== 10  trash (20 x 32 x 36) + second snack minibar + used-pillow bucket
  (() => {
    const x1 = 83.5, y0 = 68;                          // back of the unit against the right wall
    B(82.7, y0, 0, 0.8, 32, 36, M.graphite); B(63.5, y0, 0, 20, 0.8, 36, M.smoke); B(63.5, y0 + 31.2, 0, 20, 0.8, 36, M.smoke); B(63.5, y0, 0, 0.6, 32, 36, M.smoke);
    B(63.5, y0, 35.2, 20, 32, 0.8, M.steel); B(64.5, y0 + 1, 4.8, 18, 30, 1.2, M.steel);
    const cans = [[8, 5, 0], [24, 5, 1], [8, 15, 2], [24, 15, 3]];
    for (const [u, v, i] of cans) {
      const cx = x1 - v, cy = y0 + u;
      C(cx, cy, 6, 5, 30, M.bin[i], 28);
      C(cx, cy, 29, 0.5, 6, M.steel, 10); C(cx, cy, 28.4, 4.2, 0.5, M.steel, 20);   // compactor
      C(cx, cy, 36.0, 4.9, 0.15, M.bin[i], 28); C(cx, cy, 36.1, 4.3, 0.1, M.black, 28);   // no-touch opening
      B(cx - 0.5, cy + 3.9, 36.0, 1, 0.5, 0.2, M.red);
    }
    B(63.4, y0 + 27, 31, 0.3, 3, 1, M.green); B(62.6, y0 + 14, 0.5, 1, 4, 1, M.steel); B(62.2, y0 + 13, 0.5, 1.4, 6, 1, M.rubber);   // fullness LED + foot lever
    // second minibar with snacks: weight-sensor shelves on the right wall, a sliding glass door with an app lock, a price strip per shelf,
    // a lit header sign and a chilled drinks compartment below
    const dz = 8;                                                                               // the whole unit hangs 8" higher, clear above the trash bin
    const Bz = (x, y, z, ...r) => B(x, y, z + dz, ...r), boxGz = (x, y, z, ...r) => boxGeo(x, y, z + dz, ...r);
    const prodz = (k, x, y, z, ...r) => prod.add(k, x, y, z + dz, ...r), signz = (t, w, h, f, cx, cy, cz, ...r) => sign(t, w, h, f, cx, cy, cz + dz, ...r);
    const sy = y0 + 3;                                                                          // unit runs y 71..97
    Bz(82.9, sy, 37, 0.6, 26, 33, M.graphite); Bz(76.5, sy, 46, 7, 26, 0.8, M.walnut); Bz(76.5, sy, 69.2, 7, 26, 0.8, M.walnut); Bz(76.5, sy, 58, 7, 26, 0.6, M.steel);
    Bz(77, sy + 0.5, 68.6, 0.6, 25, 0.4, M.cove);
    for (const z of [46.8, 58.6]) for (let c = 0; c < 8; c++) {
      const yy = sy + 1.6 + c * 3.1;
      Bz(79.5, yy - 1.4, z - 0.2, 4.6, 2.8, 0.2, M.black);                                     // weight-sensor pad
      Bz(76.55, yy - 1.4, z - 0.6, 0.25, 2.8, 0.5, M.white);                                   // price strip on the shelf edge
      for (let dep = 0; dep < 2; dep++) { const [kd, ci] = Products.random(rand, 'snack'); prodz(kd, 81.6 - dep * 3, yy, z, -Math.PI / 2, 0.85, ci); }
    }
    // chilled drinks compartment (z 37..46): frosted door, cold LED, a temperature display and weight pads
    Bz(76.5, sy, 36.6, 7, 26, 0.8, M.walnut); Bz(76.5, sy, 37.4, 0.6, 26, 0.5, M.steel);
    Bz(77, sy + 0.5, 45.2, 0.6, 25, 0.4, M.led);
    for (let c = 0; c < 8; c++) {
      const yy = sy + 1.6 + c * 3.1;
      Bz(79.5, yy - 1.4, 37.4, 4.6, 2.8, 0.2, M.black);
      for (let dep = 0; dep < 2; dep++) { const [kd, ci] = Products.random(rand, 'drink'); prodz(kd, 81.6 - dep * 3, yy, 37.6, -Math.PI / 2, 0.55, ci); }
    }
    Bz(76.1, sy, 37.4, 0.35, 26, 8.4, M.pdlc);                                                   // frosted chilled door
    Bz(75.9, sy + 12, 41, 0.3, 2, 1, M.steel); Bz(75.8, sy + 21.5, 38.5, 0.3, 2.6, 4, M.graphite);   // handle, temperature display
    signz('4\u00b0C', 2.2, 1.2, '-x', 75.6, sy + 22.8, 40.2, '#7fe0ff', '#10181c');
    signz('SNACK BAR \u00b7 CHILLED', 22, 1.8, '-x', 75.6, sy + 11, 71.2, '#e0b55a', '#2a1f14');   // lit header sign
    Bz(76.2, sy, 70.8, 0.8, 26, 0.4, M.cove);
    // sliding glass door in two panes: the front pane slides over the fixed one, so half the shelves open at a time
    Bz(75.9, sy, 46, 0.3, 26.4, 0.5, M.steel); Bz(75.9, sy, 69.5, 0.3, 26.4, 0.5, M.steel);       // top / bottom rails
    Bz(75.9, sy + 13, 46.5, 0.3, 13, 23, M.glass);                                               // fixed pane (back half)
    const snackSlide = group('door.snack', 0, 0, 0), lockLed = new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false });
    mesh(boxGz(75.4, sy, 46.5, 0.3, 13.2, 23, M.glass), M.glass, snackSlide, 'door.snack', false);
    mesh(boxGz(75.2, sy + 11.4, 51, 0.3, 0.9, 14, M.brass), M.brass, snackSlide, 'door.snack', false);   // handle
    mesh(boxGz(75.35, sy, 46.5, 0.15, 13.2, 0.8, M.steel), M.steel, snackSlide, 'door.snack', false);
    mesh(boxGz(75.35, sy + 12.4, 46.5, 0.15, 0.8, 23, M.steel), M.steel, snackSlide, 'door.snack', false);
    Bz(75.7, sy + 24, 58.5, 1.3, 1.7, 5, M.black);                                               // app lock + card tap, on the fixed pane's frame
    mesh(boxGz(75.4, sy + 24.4, 62.6, 0.3, 0.9, 0.9, lockLed), lockLed, pod, 'lock.led', false);
    rigs.snack = { t: 0, target: 0, dur: 1.2, apply: (e) => { snackSlide.position.y = 12.6 * e; lockLed.color.setHex(e > 0.5 ? 0x3cff7a : 0xff3b30); } };
    // used pillows & blankets bucket 20 x 20 x 36
    R(63.5, 48, 0.4, 20, 20, 36, 1, M.binGrey); B(63, 47.5, 36, 21, 21, 1.2, M.graphite); B(70, 56, 37.1, 2.5, 8, 0.2, M.black);
  })();

  // =========================================================== back block: 14, 11, 13, 12 (open to the public side, y = 0)
  const vending = (x0, w, cols, rows, drinkRatio, title, sub, c1, c2) => {
    const d = 48, t = 1, gx = 1.5, gw = w - 3, w0 = 36, w1 = 86, pitch = (w1 - w0) / rows, iw = gw / cols;
    B(x0, 0, 0, t, d, 92, M.graphite); B(x0 + w - t, 0, 0, t, d, 92, M.graphite); B(x0, 0, 91, w, d, 1, M.graphite); B(x0, 0, 0, w, d, 1, M.graphite);
    B(x0, d - 2.2, 0, w, t, 92, M.graphite);                         // closed back, a hair in front of the cabin wall
    B(x0 + gx, d - 3.0, w0, gw, 0.3, w1 - w0, M.vend);              // soft light behind the products
    const rails = new THREE.MeshBasicMaterial({ map: tex.priceRails(cols, rows, x0), toneMapped: false });
    const nDrink = drinkRatio < 0.3 ? 0 : Math.round(rows * drinkRatio);
    for (let r = 0; r < rows; r++) {
      const wz = w0 + (rows - 1 - r) * pitch;                         // row 0 (letter A) is the top shelf
      B(x0 + gx, 1, wz, gw, d - 4, 0.4, M.steel); B(x0 + gx, 1.4, wz + 0.4, gw, 0.2, 0.6, M.white);
      batch.add(railUV(planeGeo(gw, 1.3, '-y', x0 + w / 2, 0.88, wz - 0.1), r, rows), rails);          // slot codes + prices under every shelf
      for (let c = 1; c < cols; c++) B(x0 + gx + c * iw - 0.05, 4, wz + 0.4, 0.1, 26, pitch - 3, M.graphite);   // slim dark slot dividers
      const grp = r < nDrink ? 'drink' : 'snack', rr = rng(x0 * 131 + r * 17 + 5), kd = (grp === 'drink' ? ['pet', 'can', 'slimcan', 'water', 'carton'] : ['bag', 'bars', 'cracker', 'candy', 'bag'])[(r + (x0 | 0)) % 5];   // one product family per row, colours alternate along it
      for (let c = 0; c < cols; c++) {
        const cx = x0 + gx + c * iw + iw / 2, ci = (r * 3 + c * 2 + (rr() * 3 | 0)) % 8;
        coil('y', 1.8, cx, wz + 0.4 + 1.55, Math.min(iw * 0.42, 1.55), 27, M.steel);
        for (let dep = 0; dep < 2; dep++) prod.add(kd, cx, t + 4.5 + dep * 9, wz + 0.4, 0, 1, ci);
      }
    }
    B(x0 + gx, 0.4, w0, gw, 0.4, w1 - w0, M.glass);
    const hm = new THREE.MeshBasicMaterial({ map: tex.header(title, sub, c1, c2, gw / 4), toneMapped: false });
    B(x0 + gx, 0, 87, gw, 0.4, 4, M.graphite); PL(gw, 4, '-y', x0 + w / 2, -0.06, 89, hm);          // header drawn at its real 9:1 / 3:1 proportions
    // payment panel: keypad screen, card reader glow, coin slot + return, bill acceptor
    B(x0 + gx, 0, 20.5, gw, 0.6, 13, M.black);
    const kw = Math.min(gw - 2, 10); PL(kw, kw * 0.6, '-y', x0 + gx + 1 + kw / 2, -0.08, 22 + kw * 0.3, M.screenKey);
    B(x0 + gx + 1, -0.1, 29, Math.min(gw - 2, 4), 0.4, 3, M.led);
    const bx = x0 + gx + gw - 5.5;
    if (gw > 14) { B(bx, -0.2, 29.2, 4.6, 0.5, 1.1, M.graphite); B(bx + 0.4, -0.3, 29.55, 3.8, 0.2, 0.3, M.led); }          // bill acceptor + lit slit
    B(bx + 1, -0.2, 24.6, 1.1, 0.5, 2.6, M.graphite); B(bx + 1.3, -0.3, 25.4, 0.5, 0.2, 1.1, M.black); B(bx + 3.2, -0.25, 24.8, 1.3, 0.45, 1.3, M.steel);   // coin slot + return button
    // pickup bay: lit, with a hinged smoked flap that hangs a little open
    B(x0 + gx, 0, 2, gw, 0.6, 17, M.black); B(x0 + gx + 0.5, 0.3, 2.5, gw - 1, 0.35, 16, M.smoke);
    B(x0 + gx + 0.5, 0.3, 18.4, gw - 1, 0.4, 0.4, M.led); B(x0 + gx + 0.5, 0.3, 2.5, gw - 1, 5, 0.3, M.rubber);
    batch.add(boxGeo(x0 + gx + 0.5, 0, -15, gw - 1, 0.5, 15, M.smoke).rotateX(THREE.MathUtils.degToRad(-12)).translate(0, -0.15, 19.2), M.smoke);
    B(x0 + gx + gw / 2 - 2, -3.6, 6, 4, 0.5, 0.9, M.steel);                                       // flap pull
  };
  // end fillers: close the open gaps between the side walls and the back machines (x 3.5..13 and 77..83.5), so the back reads as one flat face
  for (const [fx, fw] of [[3.5, 9.5], [77, 6.5]]) {
    B(fx, 0, 8, fw, 1.2, 78, M.ext); B(fx, 0, 0, fw, 1.2, 8, M.graphite); B(fx, 0, 86, fw, 1.2, 6, M.ext);          // sage panel with the same graphite skirt as the side walls
    B(fx, 1.2, 0, fw, 46, 92, M.graphite);                                                                          // dark core behind it, so nothing shows through
    B(fx + (fx < 10 ? 0 : fw - 0.5), -0.05, 8, 0.5, 1.3, 78, M.graphite);                                           // thin trim against the wall / machine
  }
  vending(13, 24, 6, 5, 0.75, 'COLD DRINKS', 'FRESH  -  ICE COLD', '#14485c', '#c9793a');
  vending(63, 14, 3, 5, 0.25, 'SNACKS', 'TAKE A TREAT', '#9b3a56', '#d9893f');
  B(37, 8, 0, 26, 40, 92, M.oak); B(39, 7.6, 80, 22, 0.4, 8, M.black); B(39, 7.7, 76, 22, 0.3, 0.6, M.ledcool);       // 11 refrigerated storage
  B(37, 0, 0, 26, 8, 92, M.graphite); B(38, -0.1, 30, 24, 0.8, 46, M.black); PL(22.8, 44.8, '-y', 50, -0.5, 52.8, M.screenKiosk);   // 13 touch screen
  B(38, -0.05, 82, 24, 0.4, 6, M.graphite); PL(24, 6, '-y', 50, -0.3, 85, M.screenBrand);

  // ---- side vending machines, one on each side wall beside the ad screen: 40" wide x 72" tall x 13" deep, doors open to the outside.
  // Left = snacks, right = refrigerated, both with a smart lock you open from the app.
  const SIDE_D = 13, SIDE_W = 40, SIDE_H = 72;
  const sideMachine = (right, title, sub, c1, c2, cols, drinkRatio, fridge) => {
    const D = SIDE_D, ya = WY0, yb = WY0 + SIDE_W, t = 0.8, gx = 1.5, gw = SIDE_W - 3, w0 = 29.5, rows = 4, pitch = 9, iw = gw / cols;
    const SB = (u0, u1, y0, y1, z0, z1, mat) => B(right ? 90 - u1 : u0, y0, z0, u1 - u0, y1 - y0, z1 - z0, mat);   // u = depth in from the outer face
    const SP = (wd, ht, yc, zc, mat, u = -0.06) => PL(wd, ht, right ? '+x' : '-x', right ? 90 - u : u, yc, zc, mat);
    SB(0, D, ya, ya + t, 0, SIDE_H, M.graphite); SB(0, D, yb - t, yb, 0, SIDE_H, M.graphite);
    SB(0, D, ya, yb, SIDE_H - 1, SIDE_H, M.graphite); SB(0, D, ya, yb, 0, 1, M.graphite); SB(D - 0.8, D, ya, yb, 0, SIDE_H, M.graphite);
    SB(D - 1.6, D - 1.3, ya + gx, yb - gx, w0, w0 + rows * pitch, M.vend);
    const rails = new THREE.MeshBasicMaterial({ map: tex.priceRails(cols, rows, right ? 91 : 19), toneMapped: false });
    for (let r = 0; r < rows; r++) {
      const wz = w0 + r * pitch, rowTop = rows - 1 - r;               // r = 0 is the bottom shelf; the codes run A (top) downwards
      SB(1, D - 2, ya + gx, yb - gx, wz, wz + 0.4, M.steel); SB(0.9, 1.1, ya + gx, yb - gx, wz + 0.4, wz + 1, M.white);
      batch.add(railUV(planeGeo(gw, 1.3, right ? '+x' : '-x', right ? 90 - 0.85 : 0.85, (ya + yb) / 2, wz - 0.1), rowTop, rows), rails);
      for (let c = 1; c < cols; c++) SB(1, D - 2, ya + gx + c * iw - 0.05, ya + gx + c * iw + 0.05, wz + 0.4, wz + pitch - 1.5, M.graphite);
      const grp = fridge || drinkRatio >= 0.5 ? (rowTop < 3 ? 'drink' : 'snack') : 'snack', rr = rng((right ? 977 : 331) + r * 29), kd = (grp === 'drink' ? ['pet', 'can', 'slimcan', 'water'] : ['bag', 'bars', 'cracker', 'candy'])[(r + (right ? 2 : 0)) % 4];
      for (let c = 0; c < cols; c++) {
        const yc = ya + gx + c * iw + iw / 2, ci = (r * 3 + c * 2 + (rr() * 3 | 0)) % 8, len = D - 5;
        coil('x', right ? 90 - 1.6 - len : 1.6, yc, wz + 0.4 + 1.55, Math.min(iw * 0.4, 1.55), len, M.steel);
        for (let dep = 0; dep < 2; dep++) { const u = 3.2 + dep * 4.8; prod.add(kd, right ? 90 - u : u, yc, wz + 0.4, right ? Math.PI / 2 : -Math.PI / 2, 1, ci); }
      }
    }
    SB(0.3, 0.7, ya + gx, yb - gx, w0, w0 + rows * pitch, M.glass);                                // glass door over the products
    const hm = new THREE.MeshBasicMaterial({ map: tex.header(title, sub, c1, c2, gw / 4), toneMapped: false });
    SB(0, 0.4, ya + gx, yb - gx, 66, 70.5, M.graphite); SP(gw, 4, (ya + yb) / 2, 68.3, hm);       // header at 9:1
    SB(0, 0.6, ya + gx, yb - gx, 12.5, 27.5, M.black);                                              // payment panel
    SP(7.5, 14.7, ya + gx + 6, 20, M.screenKiosk, -0.35); SP(8, 4.8, ya + gx + 16, 23.5, M.screenKey, -0.35);
    SB(-0.1, 0.4, ya + gx + 12.5, ya + gx + 20.5, 15.5, 17.5, M.led);                              // card reader glow
    SB(0, 0.6, ya + gx, yb - gx, 1.5, 11.5, M.black); SB(0.3, 0.65, ya + gx + 0.5, yb - gx - 0.5, 2, 11, M.smoke);   // drop bay
    SB(0.3, 0.7, ya + gx + 0.5, yb - gx - 0.5, 10.9, 11.3, M.led); SB(0.3, 0.7, ya + gx + 0.5, yb - gx - 0.5, 2, 2.3, M.rubber);   // bay light + rubber lip
    batch.add((right ? boxGeo(-0.5, ya + gx + 0.5, -9, 0.5, gw - 1, 9, M.smoke).rotateY(THREE.MathUtils.degToRad(-12)).translate(90.15, 0, 11.7)
      : boxGeo(0, ya + gx + 0.5, -9, 0.5, gw - 1, 9, M.smoke).rotateY(THREE.MathUtils.degToRad(12)).translate(-0.15, 0, 11.7)), M.smoke);      // hinged smoked flap
    // smart lock: steel module on the door edge with a status LED (green = unlocked, red = locked)
    SB(-0.5, 0.3, yb - gx - 3.2, yb - gx - 0.2, 38, 44, M.steel); SB(-0.75, -0.5, yb - gx - 2.4, yb - gx - 1.0, 41.5, 42.7, fridge ? M.red : M.green);
    if (fridge) { SB(-0.9, -0.3, yb - gx - 5.2, yb - gx - 4.6, 31, 63, M.steel); SB(D - 2.6, D - 2.2, ya + gx, yb - gx, 66.5 - 3, 66.5 - 2.4, M.ledcool); }   // door handle + cold-light strip
  };
  sideMachine(false, 'SNACKS', 'TAKE A TREAT', '#9b3a56', '#d9893f', 6, 0.1, false);
  sideMachine(true, 'COLD STORAGE', 'FRESH  -  LOCKABLE', '#14485c', '#c9793a', 7, 0.8, true);

  // =========================================================== decor
  R(16.5, 49, 0.4, 46, 72, 0.3, 0.1, M.rugDark); R(17.5, 50, 0.4, 44, 70, 0.5, 0.2, M.rug);
  for (const [a, b] of [[15.5, 20], [40, 63.5]]) for (let x = a + 0.5; x + 1.2 <= b; x += 2.1) B(x, 48, 3, 1.2, 1.4, 85, M.oak);   // slat wall
  batch.add(new THREE.RingGeometry(9.2, 10.6, 96).rotateX(-Math.PI / 2).translate(52, 49.5, 62), M.cove);                        // thin glowing ring on the slat wall
  for (const x of [24.0, 52.4]) B(x, 118, 0.4, 0.6, 26, 0.3, M.accent);                                                         // path lights
  CX(21, 52, 89, 0.4, 48, M.steel); for (const x of [26, 39.5, 53]) C(x, 52, 88.3, 0.5, 1.2, M.brass, 8);                      // odor misters
  const plant = (x, y, z, sc, n) => {
    const r = 3.2 * sc;
    C(x, y, z, r * 0.8, 7 * sc, M.terracotta, 16, r); C(x, y, z + 7 * sc, r - 0.4, 0.2, M.soil, 16);
    for (let i = 0; i < n; i++) {
      const a = i * Math.PI * 2 / n + (rand() - 0.5) * 0.4, t = (20 + rand() * 40) * Math.PI / 180, L = (3.5 + rand() * 2.5) * sc;
      const dir = new THREE.Vector3(Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a), Math.cos(t));
      const g = new THREE.SphereGeometry(1, 8, 6); g.rotateX(Math.PI / 2); g.scale(1.1 * sc, 0.12 * sc, L);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t));
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z + 7 * sc).addScaledVector(dir, L), q, new THREE.Vector3(1, 1, 1)));
      batch.add(g, M.leaf[i % 2]);
    }
  };
  plant(9.5, 56, 36, 0.7, 11); plant(12, 158, -10, 1.5, 16); plant(66, 158, -10, 1.5, 16);
  batch.add(extrudeYZ([[144, 0], [144 + RAMP_LEN, -10], [144, -10]], 23.5, 53.5, 0), M.oak);                                      // entrance ramp
  for (const [x, d] of [[7, 4], [82, 4], [7, 48], [82, 48], [7, 95], [44, 95], [82, 95], [7, 140], [44, 140], [82, 140]]) {     // wheels
    B(x - 3, 144 - d - 2.5, -6, 6, 5, 2, M.steel); batch.add(cylXGeo(x - 1.2, 144 - d, -7, 3, 2.4, 16), M.rubber);
  }

  // ---- exterior finishing: wordmark, data plate, service inlet with its cable and floor box, wheel chocks, skirt lights
  // side walls (both): TOLPODS strip on top, one big TV filling the rest, vending-machine end plain
  for (const [x0, dir, f] of [[0, -1, '-x'], [90, 1, '+x']]) {
    const xo = x0 + dir * 0.0;
    B(dir < 0 ? -0.5 : 90, 1.5, 70.5, 0.5, 141, 16, M.graphite);                              // dark strip
    PL(140, 14, f, x0 + dir * 0.54, 72, 78.5, M.stripMark);
    B(dir < 0 ? -0.6 : 90, 47.5, 7.5, 0.6, 95, 63, M.black);                                  // TV bezel
    PL(92, 60, f, x0 + dir * 0.64, 95, 39, M.screenSide);
  }
  PL(12, 5, '-x', -0.06, 100, 3.6, M.plate);   // data plate, under the ad screen
  B(90, 120, 1.5, 1.5, 9, 5.5, M.steel); B(90.2, 122.2, 2.9, 1.4, 4.6, 3, M.black); B(90.3, 126.6, 4.6, 0.3, 1.4, 1.4, M.green);   // service inlet, below the ad screen
  batch.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[91.5, 124.5, 4.5], [94, 124.5, 2.5], [97.5, 125.5, -4], [101, 127, -9.4], [112, 133, -9.5], [124, 130, -9.5], [133, 125, -9.5]].map((q) => new THREE.Vector3(...q))), 48, 0.55, 8), M.rubber);
  B(133, 119, -10, 11, 11, 1.7, M.steel); B(134.4, 120.4, -8.4, 8.2, 8.2, 0.3, M.brass);       // floor service box the cable runs to
  for (const x0 of [4, 79]) batch.add(extrudeYZ([[143.2, -10], [150.6, -10], [143.2, -6.2]], x0, x0 + 6, 0.2), M.safety);   // wheel chocks
  B(-0.05, 3, -3.5, 0.1, 138, 0.5, M.skirt); B(89.95, 3, -3.5, 0.1, 138, 0.5, M.skirt); B(3, 143.95, -3.5, 84, 0.1, 0.5, M.skirt); B(3, -0.05, -3.5, 84, 0.1, 0.5, M.skirt);   // warm light under the skirt

  // mannequin for scale (hidden by default)
  const person = group('person', 38.5, 132, 0); person.visible = false;
  const ph = 66;
  for (const dx of [-3.6, 3.6]) mesh(cylGeo(dx, 0, 0, 3, 0.47 * ph, 12), M.person, person, 'person');
  mesh(rboxGeo(-8.5, -4.5, 0.47 * ph - 2, 17, 9, 0.82 * ph - 0.47 * ph + 2, 2), M.person, person, 'person');
  mesh(new THREE.SphereGeometry(4.4, 14, 10).translate(0, 0, ph - 4.6), M.person, person, 'person');
  parts.person = person;

  // ---------- flush the static batch + instanced products
  const fixed = group('static');
  B(3.5, 47.2, 0, 80, 0.8, 92, M.plaster);                  // cabin back wall: built last so its cabin-side face is the one that shows (machine-side panels share that plane)
  batch.flush(fixed);
  prod.build(pod);

  // ---------- interior lights (world space)
  const addRect = (x, yPlan, w, len, color, intensity) => {
    const l = new THREE.RectAreaLight(color, intensity, w, len);
    l.position.copy(planToWorld(x, yPlan, 91)); l.rotation.x = -Math.PI / 2; lights.add(l); return l;
  };
  let lightsOn = true, rectsOff = true;
  const rects = [20, 39.5, 59].map((x) => addRect(x, 96, 3, 88, M.light, 5));
  const warm = new THREE.PointLight(M.light, 1600, 130, 2); warm.position.copy(planToWorld(39.5, 92, 80)); lights.add(warm);
  const warm2 = new THREE.PointLight(M.light, 900, 100, 2); warm2.position.copy(planToWorld(38.5, 128, 78)); lights.add(warm2);

  // =========================================================== rig driver + API
  for (const r of Object.values(rigs)) r.apply(ease(r.t));
  const names = Object.keys(rigs);
  let pending = null, pendingDesk = null;
  const api = {
    rigs, parts,
    update(dt) {
      if (pending !== null && rigs.desk.t < 0.02) { rigs.chair.target = pending; pending = null; }
      if (pendingDesk !== null && rigs.chair.t < 0.02) { rigs.desk.target = pendingDesk; pendingDesk = null; }
      for (const n of names) {
        const r = rigs[n];
        if (r.t === r.target) continue;
        const step = dt / r.dur, d = r.target - r.t;
        r.t = Math.abs(d) <= step ? r.target : r.t + Math.sign(d) * step;
        r.apply(ease(r.t));
      }
    },
    busy() { return names.some((n) => rigs[n].t !== rigs[n].target); },
    get(n) { return rigs[n].target; },
    set(n, v) {
      if (n === 'desk') {
        if (v > 0 && (rigs.chair.t > 0.02 || rigs.chair.target > 0.02)) { rigs.chair.target = 0; rigs.legext.target = 0; pendingDesk = v; return 'Setting the chair upright first...'; }
        pending = null; pendingDesk = null;
      }
      if (n === 'chair') {
        if (v > 0.02 && (rigs.desk.t > 0.02 || rigs.desk.target > 0)) { rigs.desk.target = 0; pending = v; return 'Closing the desks first...'; }
        pending = null; pendingDesk = null;
      }
      if (n === 'legext' && v > 0 && rigs.chair.t > 0.55) return 'The leg extension works from upright to the normal 110\u00b0 pose. Bring the chair back to normal first.';
      rigs[n].target = v;
      return '';
    },
    toggle(n) { return this.set(n, rigs[n].target > 0.5 ? 0 : 1); },
    // slider: jump straight to a pose (0..1) with the same interlocks
    scrub(n, v) {
      if (n === 'chair' && v > 0.02 && (rigs.desk.t > 0.02 || rigs.desk.target > 0)) { rigs.desk.target = 0; return 'Closing the desks first...'; }
      pending = null; pendingDesk = null;
      const r = rigs[n]; r.t = r.target = v; r.apply(ease(v));
      return '';
    },
    state(n) { return rigs[n].t; },
    setRoof(v) { parts.roof.visible = v; },
    fireVent(v) { rigs.shade.target = v; rigs.tilt.target = v; },       // fire: shade opens and the glass tilts, together
    ventOpen() { return rigs.shade.target > 0.5 && rigs.tilt.target > 0.5; },
    setPerson(v) { parts.person.visible = v; },
    setInteriorLights(v) { lightsOn = v; rects.forEach((l) => { l.visible = v && !rectsOff; }); warm.visible = v; warm2.visible = v; },
    setLightQuality(low) { rectsOff = !!low; rects.forEach((l) => { l.visible = lightsOn && !rectsOff; }); },       // area lights are the costliest lights per pixel: low quality drops them (the baked glow stays)
  };

  // plan-view walls and units that block walking (AABBs in plan inches); chair, TV and glass depend on their pose
  function obstacles() {
    const o = [];
    const bx = (x0, x1, y0, y1, tag) => o.push({ x0, x1, y0, y1, tag });
    bx(-3, 3.5, 0, 144, 'leftWall'); bx(83.5, 93, 0, 144, 'rightWall'); bx(3.5, 83.5, 0, 48.8, 'backBlock');
    bx(71.5, 83.5, 100, 144, 'premium'); bx(53.5, 71.5, 142.8, 145, 'fixedGlass');
    bx(3.5, 15.7, 99, 142.2, 'pillows'); bx(3.5, 15.5, 72.8, 98.8, 'minibar'); bx(3.5, 11.5, 49, 72, 'hooks'); bx(63.5, 83.5, 68, 100, 'trash'); bx(63.5, 83.5, 48, 68, 'bucket');
    const [cy0, cy1] = chair.extent(); bx(S.chair.centreX - S.chair.width / 2 - 0.5, S.chair.centreX + S.chair.width / 2 + 0.5, cy0, cy1, 'chair');
    if (rigs.tv.t > 0.5) bx(17.7, 61.3, 112.4, 115.9, 'tv');
    if (rigs.glass1.t > 0.5 || rigs.glass2.t > 0.5) bx(23.5, 53.5, 142.8, 145, 'glass');
    return o;
  }
  const nameOf = (m) => { for (const k in M) if (M[k] === m) return k; return '?'; };
  return { root, pod, parts, M, api, obstacles, rects, lights, coils, solids: solids.map((r) => ({ ...r, mat: nameOf(r.mat) })) };
}
