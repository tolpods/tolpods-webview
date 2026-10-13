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
  // ---- pyramid roof: four triangular panels, each hinged along its eave. In a fire they swing outward like petals to vent the smoke.
  parts.roof = group('roof');
  const RISE = 34, APEX = [45, 72, 92 + RISE], panels = [];
  [[0, 0, 0, 144, -Math.PI / 2, 45], [90, 144, 0, 144, Math.PI / 2, 45], [0, 0, 90, 0, 0, 72], [90, 144, 90, 144, Math.PI, 72]].forEach(([hx, hy, , , rz, run], i) => {
    const len = i < 2 ? 144 : 90;
    const outer = group('roof.hinge', i < 2 ? (i === 0 ? 0 : 90) : 45, i < 2 ? 72 : (i === 2 ? 0 : 144), 92, parts.roof); outer.rotation.z = rz;
    const inner = group('roof.panel', 0, 0, 0, outer);
    const geo = triPanel([-len / 2, 0, 0], [len / 2, 0, 0], [0, run, RISE], 1.4);
    mesh(geo, [M.hvac, M.ceil, M.graphite], inner, 'roof.slab');
    const hinge = mesh(boxGeo(-len / 2, -1.2, -1, len, 1.2, 2, M.steel), M.steel, outer, 'roof.item', false);   // eave beam stays put
    panels.push({ inner, open: Math.PI - Math.atan2(RISE, run) - 0.35 });
  });
  rigs.roof = { t: 0, target: 0, dur: 2.6, apply: (e) => { for (const p of panels) p.inner.rotation.x = p.open * e; } };
  parts.roofApex = APEX;
  for (const x of [20, 39.5, 59]) B(x - 1.5, 52, 91.6, 3, 88, 0.4, M.led);
  for (const y of [58, 76, 94, 112, 130]) B(3.5, y - 2, 90.4, y > 98 ? 68 : 80, 4, 1.6, M.oak);          // oak ceiling beams, wall to wall now that the flat slab is gone
  B(3.5, 48.2, 88.2, 80, 1.2, 0.5, M.cove); B(3.5, 48, 88.8, 80, 3, 0.8, M.oak);          // warm cove light + ledge

  // ---- left wall strip (x 0..3.5): plain, with the ad screen
  B(0, 0, 86, 3.5, 144, 6, M.ext); B(0, 0, 0, 3.5, 144, 8, M.graphite);
  for (const y of [0, 71.4, 142.8]) B(0, y, 0, 3.5, 1.2, 92, M.ext);
  B(0, 1.2, 8, 3.5, 70.2, 78, M.ext); B(0, 72.6, 8, 3.5, 70.2, 78, M.ext);
  B(2.9, 0, 0, 0.6, 144, 92, M.plaster);                                    // inner skin goes on last, so the cream plaster (not the sage shell) faces the cabin
  // ---- right wall strip (x 83.5..90): plain
  B(83.5, 0, 86, 6.5, 144, 6, M.ext); B(83.5, 0, 0, 6.5, 144, 8, M.graphite);
  B(83.5, 0, 8, 6.5, 144, 78, M.ext);
  B(83.5, 0, 0, 0.6, 144, 92, M.plaster);
  // ---- cabin back wall (y 47.2..48): solid, so the machines behind it cannot be seen from inside (or the other way round)
  // ---- front: 30" entrance opening, frame, rails for the two glass layers
  B(3.5, 142.8, 35, 12, 1.2, 57, M.ext);
  B(23.5, 142.5, 80, 30, 2, 1.5, M.graphite); B(23.5, 143.2, 81.5, 30, 0.6, 10.5, M.glass); B(23.5, 142, 0, 30, 3, 0.5, M.steel);
  B(22.7, 142.2, 0, 0.8, 2.6, 82, M.steel); B(53.5, 142.2, 0, 0.8, 2.6, 82, M.steel);
  for (const yy of [144.0, 144.6]) { B(23.5, yy, 0.5, 60, 0.4, 0.3, M.steel); B(23.5, yy, 79.4, 60, 0.4, 0.6, M.steel); }
  B(54.5, 144.0, 73.6, 16, 0.35, 12.4, M.graphite);                                          // dark plaque, so the sign reads against the wood
  sign('TOLPODS', 15, 4.4, '+y', 62.5, 144.4, 83.4, '#e0b55a');
  sign('rest \u00b7 recharge', 15, 2.6, '+y', 62.5, 144.4, 76.3, '#e0b55a', null, 'serif');
  // privacy cameras (7)
  B(36.5, 144.5, 84, 3, 3, 3, M.graphite); B(36.2, 148.2, 84.1, 3.6, 0.3, 1.6, M.steel); CY(38, 147, 85.5, 1, 1.2, M.black);
  B(40.5, 139.5, 84, 3, 3, 3, M.graphite); CY(42, 138.2, 85.5, 1, 1.2, M.black); B(43, 142.6, 84.3, 0.5, 0.3, 0.5, M.red);

  // fixed glass, 2nd layer, left of the door (cannot open): fills the gap the sliding glass leaves beside the entrance
  B(3.5, 144.6, 0.8, 20, 0.4, 34.2, M.glass); B(15.5, 144.6, 35, 8, 0.4, 45, M.glass);
  B(3.5, 144.5, 0.5, 20, 0.6, 0.4, M.steel); B(15.5, 144.5, 79.4, 8, 0.6, 0.6, M.steel); B(3.5, 144.5, 35, 12, 0.6, 0.5, M.steel);
  B(15.2, 144.5, 35, 0.6, 0.6, 45, M.steel); B(23.1, 144.5, 0.5, 0.6, 0.6, 80, M.steel); B(3.5, 144.5, 0.5, 0.6, 0.6, 35, M.steel);

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

  // =========================================================== 8  pillows & blankets (12 x 42 x 45, floats at z 18)
  (() => {
    const z0 = 18, teal = new THREE.MeshStandardMaterial({ color: 0x335a54, roughness: 0.95 }), tan = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.95 }), sage = new THREE.MeshStandardMaterial({ color: 0x597a5c, roughness: 0.95 });
    const bl = [teal, tan, sage];
    B(3.5, 74, z0 - 1, 0.5, 42, 47, M.graphite);
    for (let d = 0; d < 3; d++) {
      for (let p = 0; p < 5; p++) {
        const z = z0 + p * 9, y = 74 + d * 14;
        R(3.5, y, z, 12, 14, 6, 1.4, M.pillow); R(3.5, y, z + 6, 12, 14, 3, 0.5, bl[d]); B(3.45, y - 0.05 + 6, z + 5.75, 12.1, 14.1, 0.5, M.brass);
      }
      B(5, 74 + d * 14 + 1.5, z0 - 1.2, 10.5, 11, 0.3, M.green);
      B(4.1, 74 + d * 14 + 0.6, z0 + 45.4, 10, 12.8, 0.3, M.cove);
      B(15.1, 74 + d * 14 + 0.6, z0, 0.4, 12.8, 1.6, M.glass);
    }
    B(3.5, 74, z0 + 46, 12.2, 42, 5.5, M.walnut);
    sign('PILLOWS & BLANKETS', 40, 4.2, '+x', 15.75, 95, z0 + 48.8, '#e0b55a');
  })();

  // =========================================================== 9  weight-sensor minibar (12 x 26 x 36)
  (() => {
    R(3.5, 48, 0, 12, 26, 16, 0.3, M.oak);
    for (let i = 0; i < 2; i++) { B(15.5, 48.4 + i * 12.8, 0.6, 0.4, 12.4, 14.8, M.white); B(15.9, 53 + i * 11.4, 6, 0.6, 0.6, 5, M.steel); }
    B(3.5, 48, 16, 12, 26, 0.8, M.steel); B(3.5, 48, 16, 0.5, 26, 20, M.graphite); B(3.5, 48, 16, 12, 0.5, 20, M.graphite); B(3.5, 73.5, 16, 12, 0.5, 20, M.graphite);
    B(3.5, 48, 35.5, 12, 26, 0.5, M.graphite); B(3.5, 48, 26, 12, 26, 0.5, M.steel); B(14.6, 48.5, 35, 0.6, 25, 0.4, M.led);
    for (const z of [16.8, 26.5]) {
      for (let c = 0; c < 9; c++) for (let r = 0; r < 2; r++) {
        const y = 48 + 1.6 + c * 2.7, x = 3.5 + 3.2 + r * 5;
        B(x - 1.9, y - 1.3, z - 0.3, 3.8, 2.6, 0.3, M.black);
        const [kd, ci] = Products.random(rand, 'mix'); prod.add(kd, x, y + 0.1, z, Math.PI / 2, 0.7, ci);
      }
    }
  })();

  // =========================================================== 10  trash (20 x 32 x 36) + luxury case + used-pillow bucket
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
    // shelf of luxury items (anti-theft glass case) above the counter
    B(82.9, y0 + 3, 46, 0.6, 26, 24, M.graphite); B(76.5, y0 + 3, 46, 7, 26, 0.8, M.walnut); B(76.5, y0 + 3, 69.2, 7, 26, 0.8, M.walnut); B(76.5, y0 + 3, 58, 7, 26, 0.6, M.steel);
    B(76.5, y0 + 3, 46, 0.8, 26, 24, M.glass); B(77, y0 + 3.5, 68.6, 0.6, 25, 0.4, M.cove);
    for (let k = 0; k < 4; k++) { const sp = new THREE.SphereGeometry(1.8, 12, 10); sp.translate(80.5, y0 + 6.5 + k * 5.5, 60.4); batch.add(sp.toNonIndexed(), M.gold); }
    C(79.5, y0 + 25, 46.8, 1.2, 7, M.gold, 12);
    // used pillows & blankets bucket 20 x 20 x 36
    R(63.5, 48, 0.4, 20, 20, 36, 1, M.binGrey); B(63, 47.5, 36, 21, 21, 1.2, M.graphite); B(70, 56, 37.1, 2.5, 8, 0.2, M.black);
  })();

  // =========================================================== back block: 14, 11, 13, 12 (open to the public side, y = 0)
  const vending = (x0, w, cols, rows, drinkRatio, title, sub, c1, c2) => {
    const d = 48, t = 1, gx = 1.5, gw = w - 3, w0 = 36, w1 = 86, pitch = (w1 - w0) / rows, iw = gw / cols;
    B(x0, 0, 0, t, d, 92, M.graphite); B(x0 + w - t, 0, 0, t, d, 92, M.graphite); B(x0, 0, 91, w, d, 1, M.graphite); B(x0, 0, 0, w, d, 1, M.graphite);
    B(x0, d - 2.2, 0, w, t, 92, M.graphite);                         // closed back, a hair in front of the cabin wall
    B(x0 + gx, d - 3.0, w0, gw, 0.3, w1 - w0, M.vend);              // soft light behind the products
    for (let r = 0; r < rows; r++) {
      const wz = w0 + r * pitch;
      B(x0 + gx, 1, wz, gw, d - 4, 0.4, M.steel); B(x0 + gx, 1.4, wz + 0.4, gw, 0.2, 0.6, M.white);
      for (let c = 1; c < cols; c++) B(x0 + gx + c * iw - 0.05, 4, wz + 0.4, 0.1, 26, pitch - 3, M.graphite);   // slim dark slot dividers
      for (let c = 0; c < cols; c++) {
        const seed = Math.floor(rand() * 1e6), grp = rand() < drinkRatio ? 'drink' : 'snack';
        for (let dep = 0; dep < 3; dep++) {
          const [kd, ci] = Products.random(rng(seed), grp);
          prod.add(kd, x0 + gx + c * iw + iw / 2, t + 4.5 + dep * 8, wz + 0.4, 0, 1, ci);
        }
      }
    }
    B(x0 + gx, 0.4, w0, gw, 0.4, w1 - w0, M.glass);
    const hm = new THREE.MeshBasicMaterial({ map: tex.header(title, sub, c1, c2, gw / 4), toneMapped: false });
    B(x0 + gx, 0, 87, gw, 0.4, 4, M.graphite); PL(gw, 4, '-y', x0 + w / 2, -0.06, 89, hm);          // header drawn at its real 9:1 / 3:1 proportions
    B(x0 + gx, 0, 20.5, gw, 0.6, 13, M.black);
    const kw = Math.min(gw - 2, 10); PL(kw, kw * 0.6, '-y', x0 + gx + 1 + kw / 2, -0.08, 22 + kw * 0.3, M.screenKey);
    B(x0 + gx + 1, -0.1, 29, Math.min(gw - 2, 4), 0.4, 3, M.led);
    B(x0 + gx, 0, 2, gw, 0.6, 17, M.black); B(x0 + gx + 0.5, 0.3, 2.5, gw - 1, 0.35, 16, M.smoke);
  };
  vending(3.5, 39, 8, 5, 0.75, 'COLD DRINKS', 'FRESH  -  ICE COLD', '#14485c', '#c9793a');
  vending(68.5, 15, 3, 5, 0.25, 'SNACKS', 'TAKE A TREAT', '#9b3a56', '#d9893f');
  B(42.5, 8, 0, 26, 40, 92, M.oak); B(44.5, 7.6, 80, 22, 0.4, 8, M.black); B(44.5, 7.7, 76, 22, 0.3, 0.6, M.ledcool);       // 11 refrigerated storage
  B(42.5, 0, 0, 26, 8, 92, M.graphite); B(43.5, -0.1, 30, 24, 0.8, 46, M.black); PL(22.8, 44.8, '-y', 55.5, -0.5, 52.8, M.screenKiosk);   // 13 touch screen
  B(43.5, -0.05, 82, 24, 0.4, 6, M.graphite); PL(24, 6, '-y', 55.5, -0.3, 85, M.screenBrand);

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
  plant(9.5, 128, 35, 0.9, 11); plant(9.5, 56, 36, 0.7, 11); plant(12, 158, -10, 1.5, 16); plant(66, 158, -10, 1.5, 16);
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
  PL(24, 10, '-x', -0.06, 24, 40, M.plate);   // data plate on the vending end
  B(90, 36, 3, 1.5, 9, 6, M.steel); B(90.2, 38.2, 4.4, 1.4, 4.6, 3.2, M.black); B(90.3, 42.6, 6.2, 0.3, 1.4, 1.4, M.green);   // service inlet
  batch.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[91.5, 40.5, 5.6], [94, 40.5, 2.5], [97.5, 41.5, -4], [101, 43, -9.4], [112, 49, -9.5], [124, 46, -9.5], [133, 41, -9.5]].map((q) => new THREE.Vector3(...q))), 48, 0.55, 8), M.rubber);
  B(133, 35, -10, 11, 11, 1.7, M.steel); B(134.4, 36.4, -8.4, 8.2, 8.2, 0.3, M.brass);       // floor service box the cable runs to
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
    setPerson(v) { parts.person.visible = v; },
    setInteriorLights(v) { rects.forEach((l) => { l.visible = v; }); warm.visible = v; warm2.visible = v; },
  };

  // plan-view walls and units that block walking (AABBs in plan inches); chair, TV and glass depend on their pose
  function obstacles() {
    const o = [];
    const bx = (x0, x1, y0, y1, tag) => o.push({ x0, x1, y0, y1, tag });
    bx(-3, 3.5, 0, 144, 'leftWall'); bx(83.5, 93, 0, 144, 'rightWall'); bx(3.5, 83.5, 0, 48.8, 'backBlock');
    bx(71.5, 83.5, 100, 144, 'premium');
    bx(3.5, 15.5, 74, 116, 'pillows'); bx(3.5, 15.5, 48, 74, 'minibar'); bx(63.5, 83.5, 68, 100, 'trash'); bx(63.5, 83.5, 48, 68, 'bucket');
    const [cy0, cy1] = chair.extent(); bx(S.chair.centreX - S.chair.width / 2 - 0.5, S.chair.centreX + S.chair.width / 2 + 0.5, cy0, cy1, 'chair');
    if (rigs.tv.t > 0.5) bx(17.7, 61.3, 112.4, 115.9, 'tv');
    if (rigs.glass1.t > 0.5 || rigs.glass2.t > 0.5) bx(23.5, 53.5, 142.8, 145, 'glass');
    return o;
  }
  const nameOf = (m) => { for (const k in M) if (M[k] === m) return k; return '?'; };
  return { root, pod, parts, M, api, obstacles, rects, lights, solids: solids.map((r) => ({ ...r, mat: nameOf(r.mat) })) };
}
