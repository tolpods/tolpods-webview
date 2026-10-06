// TOLPOD - the full pod, built in code from the sheet's dimensions (inches).
// Plan frame: x right (0..90), y toward the ENTRANCE (0..144), z up. The group is rotated so the scene is Y-up.
import * as THREE from 'three';
import { SPEC as S } from './spec.js';
import { makeMaterials, tex } from './mats.js';
import { Batch, boxGeo, rboxGeo, cylGeo, cylXGeo, cylYGeo, extrudeXZ, extrudeYZ, planeGeo } from './geo.js';
import { Products } from './products.js';

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
  const B = (x0, y0, z0, sx, sy, sz, mat) => batch.add(boxGeo(x0, y0, z0, sx, sy, sz, mat), mat);
  const R = (x0, y0, z0, sx, sy, sz, r, mat, seg) => batch.add(rboxGeo(x0, y0, z0, sx, sy, sz, r, seg), mat);
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
  parts.roof = mesh(boxGeo(0, 0, 92, 90, 144, 2, M.ceil), M.ceil, pod, 'roof');
  for (const x of [20, 39.5, 59]) B(x - 1.5, 52, 91.6, 3, 88, 0.4, M.led);
  for (const y of [58, 76, 94, 112, 130]) B(16, y - 2, 90.4, 48, 4, 1.6, M.oak);          // oak ceiling beams
  B(3.5, 48.2, 88.2, 80, 1.2, 0.5, M.cove); B(3.5, 48, 88.8, 80, 3, 0.8, M.oak);          // warm cove light + ledge

  // ---- left wall strip (x 0..3.5): plain, with the ad screen
  B(2.9, 0, 0, 0.6, 144, 92, M.plaster); B(0, 0, 86, 3.5, 144, 6, M.ext); B(0, 0, 0, 3.5, 144, 8, M.graphite);
  for (const y of [0, 71.4, 142.8]) B(0, y, 0, 3.5, 1.2, 92, M.ext);
  B(0, 1.2, 8, 3.5, 70.2, 78, M.ext); B(0, 72.6, 8, 3.5, 70.2, 78, M.ext);
  B(-0.15, 12, 38, 2.75, 48, 27, M.black); PL(46.4, 25.4, '-x', -0.2, 36, 51.5, M.screenAd);
  // ---- right wall strip (x 83.5..90): plain
  B(83.5, 0, 0, 0.6, 144, 92, M.plaster); B(83.5, 0, 86, 6.5, 144, 6, M.ext); B(83.5, 0, 0, 6.5, 144, 8, M.graphite);
  B(83.5, 0, 8, 6.5, 144, 78, M.ext);
  // ---- cabin back wall (y 47.2..48): solid, so the machines behind it cannot be seen from inside (or the other way round)
  B(3.5, 47.2, 0, 80, 0.8, 92, M.plaster);
  // ---- front: 30" entrance opening, frame, rails for the two glass layers
  B(3.5, 142.8, 35, 12, 1.2, 57, M.ext);
  B(23.5, 142.5, 80, 30, 2, 1.5, M.graphite); B(23.5, 143.2, 81.5, 30, 0.6, 10.5, M.glass); B(23.5, 142, 0, 30, 3, 0.5, M.steel);
  B(22.7, 142.2, 0, 0.8, 2.6, 82, M.steel); B(53.5, 142.2, 0, 0.8, 2.6, 82, M.steel);
  for (const yy of [144.0, 144.6]) { B(23.5, yy, 0.5, 60, 0.4, 0.3, M.steel); B(23.5, yy, 79.4, 60, 0.4, 0.6, M.steel); }
  B(54.5, 144.0, 73.6, 16, 0.35, 12.4, M.graphite);                                          // dark plaque, so the sign reads against the wood
  sign('TOLPOD', 15, 4.4, '+y', 62.5, 144.4, 83.4, '#e0b55a');
  sign('rest \u00b7 recharge', 15, 2.6, '+y', 62.5, 144.4, 76.3, '#e0b55a', null, 'serif');
  // privacy cameras (7)
  B(36.5, 144.5, 84, 3, 3, 3, M.graphite); B(36.2, 148.2, 84.1, 3.6, 0.3, 1.6, M.steel); CY(38, 147, 85.5, 1, 1.2, M.black);
  B(40.5, 139.5, 84, 3, 3, 3, M.graphite); CY(42, 138.2, 85.5, 1, 1.2, M.black); B(43, 142.6, 84.3, 0.5, 0.3, 0.5, M.red);

  // smart glass layers (outside the front wall, sliding sideways over the front of Block 5)
  const glassG1 = group('glass1', 0, 0, 0); mesh(boxGeo(23.5, 144.0, 0.8, 30, 0.4, 36, M.pdlc), M.pdlc, glassG1, 'glass.layer1', false);
  const glassG2 = group('glass2', 0, 0, 0); mesh(boxGeo(23.5, 144.6, 36.8, 30, 0.4, 42.6, M.glass), M.glass, glassG2, 'glass.layer2', false);
  rigs.glass1 = { t: 0, target: 0, dur: 1.2, apply: (e) => { glassG1.position.x = 30 * (1 - e); } };      // t = 1 -> closed
  rigs.glass2 = { t: 0, target: 0, dur: 1.2, apply: (e) => { glassG2.position.x = 30 * (1 - e); } };

  // =========================================================== 1  massage chair (rigged)
  const chair = (() => {
    const C0 = S.chair, side = C0.side, st = C0.seatTop, yw = C0.width - 2 * side, o = yw / 2 + side;
    const g = group('chair', C0.centreX, C0.headY, 0); g.rotation.z = Math.PI / 2;          // local x = along the chair, local y = across
    const slide = group('chair.slide', 0, 0, 0, g);
    const Z = [0, 0, 0];
    const bx = (p, pv, x0, y0, z0, sx, sy, sz, mat, name) => mesh(boxGeo(x0 - pv[0], y0 - pv[1], z0 - pv[2], sx, sy, sz, mat), mat, p, name);
    const rb = (p, pv, x0, y0, z0, sx, sy, sz, r, mat, name) => mesh(rboxGeo(x0 - pv[0], y0 - pv[1], z0 - pv[2], sx, sy, sz, r), mat, p, name);
    const ex = (p, pv, pts, y0, y1, mat, bevel, name) => mesh(extrudeXZ(pts, y0, y1, bevel, pv), mat, p, name);
    const wt = st + 7 - 3.5;
    const quiltFor = (zlen, ylen) => {                       // diamond size stays ~4" whatever the part's proportions
      const m = M.quilt.clone(); m.map = M.quilt.map.clone(); m.bumpMap = M.quilt.bumpMap.clone();
      m.map.repeat.set(zlen / 16, ylen / 16); m.bumpMap.repeat.copy(m.map.repeat); m.map.needsUpdate = true; m.bumpMap.needsUpdate = true;
      return m;
    };
    const quiltHead = quiltFor(9, yw - 3), quiltBack = quiltFor(30, 14);

    // ---- base: rail plate, back base, seat body, quilted seat cushion
    bx(slide, Z, -9, -yw / 2, 0.4, 55, yw, 1.2, M.bronze, 'chair.basePlate');
    rb(slide, Z, -10, -yw / 2, 1.6, 18, yw, st - 1.6, 0.8, M.shell, 'chair.backBase');
    rb(slide, Z, 5, -yw / 2, 1.6, 27, yw, st - 7.6, 0.8, M.shell, 'chair.seatBody');
    bx(slide, Z, 6, -yw / 2 + 1, 1.3, 25, yw - 2, 0.3, M.accent, 'chair.underglow');
    const sw = (yw - 1) / 3;
    for (let i = 0; i < 3; i++) rb(slide, Z, 6, -yw / 2 + i * (sw + 0.5), st - 6, 25, sw, 6, 1.3, M.leather, 'chair.seatCushion');
    bx(slide, Z, 30.4, -yw / 2, st - 5.4, 0.9, yw, 0.9, M.leather2, 'chair.piping');
    bx(slide, Z, 29, -3, 1, 3, 6, st - 7, M.bronze, 'chair.actuator');

    // ---- back: pivots at the seat's rear edge (x = 8, z = seat top)
    const BP = [8, 0, st];
    const back = group('chair.back', BP[0], BP[1], BP[2], slide);
    ex(back, BP, [[-10, st], [5.5, st], [5.5, st + 28.5], [-6, st + 28.5], [-8, st + 24], [-9.4, st + 16], [-10, st + 6]], -yw / 2, yw / 2, M.shell, 1.2, 'chair.backShell');
    rb(back, BP, 5.5, -7, st - 2, 2.5, 14, 30, 0.9, quiltBack, 'chair.backPad');
    rb(back, BP, 4, -yw / 2 + 0.5, st, 4, 10.5, 27, 1.5, M.leather2, 'chair.bolster');
    rb(back, BP, 4, 7.5, st, 4, 10.5, 27, 1.5, M.leather2, 'chair.bolster');
    const wingRear = [[-10, st], [9, st], [9, wt], [6, wt + 1.5], [2, st + 13], [-2, st + 22], [-6, st + 27.5], [-9, st + 28.5], [-10, st + 25]];
    ex(back, BP, wingRear, yw / 2, o, M.shell, 0.7, 'chair.wingRear');
    ex(back, BP, wingRear, -o, -yw / 2, M.shell, 0.7, 'chair.wingRear');
    const head = group('chair.head', 0, 0, 0, back);
    rb(head, BP, -10, -(yw - 3) / 2, st + 28.5, 18, yw - 3, 9, 3, quiltHead, 'chair.headrest');

    // ---- leg rest: pivots at the seat's front edge; hangs 49 deg, lifts to flat
    const LP = [31, 0, st - 3];
    const leg = group('chair.leg', LP[0], LP[1], LP[2], slide);
    const gap = 1, hw = (yw - gap) / 4;
    for (const sg of [-1, 1]) {
      const y0 = sg * (hw + gap / 2);
      const calf = [[y0 - hw, st], [y0 - hw, st - 9], [y0 - hw + 2.5, st - 12], [y0 + hw - 2.5, st - 12], [y0 + hw, st - 9], [y0 + hw, st], [y0 + hw - 1.4, st], [y0 + hw - 2.8, st - 2.5], [y0 + hw - 5, st - 4.5], [y0, st - 5.5], [y0 - hw + 5, st - 4.5], [y0 - hw + 2.8, st - 2.5], [y0 - hw + 1.4, st]];
      const foot = [[y0 - hw, st], [y0 - hw, st - 9], [y0 - hw + 2.5, st - 12], [y0 + hw - 2.5, st - 12], [y0 + hw, st - 9], [y0 + hw, st], [y0 + hw - 1.8, st], [y0 + hw - 3, st - 3], [y0 + hw - 5, st - 6], [y0, st - 7], [y0 - hw + 5, st - 6], [y0 - hw + 3, st - 3], [y0 - hw + 1.8, st]];
      mesh(extrudeYZ(calf, 31, 43, 0.5, LP), M.leather, leg, 'chair.calfPod');
      mesh(extrudeYZ(foot, 43, 49, 0.5, LP), M.shell, leg, 'chair.footCradle');
      rb(leg, LP, 47.6, y0 - hw + 1.2, st - 6, 1.4, 2 * hw - 2.4, 6.8, 0.5, M.leather, 'chair.toeLip');
    }
    const ext = group('chair.ext', 0, 0, 0, leg);
    bx(ext, LP, 37, -(yw - 4) / 2, st - 11, 12, yw - 4, 6, M.leather2, 'chair.ext');

    // ---- armrests, wing fronts, cupholders, tablet remote (lower flush with the bed)
    const arms = group('chair.arms', 0, 0, 0, slide);
    const wingFront = [[9, 1.6], [30, 1.6], [33, 5], [33.5, 12], [31, wt - 6], [27, wt - 3], [24, wt], [9, wt]];
    ex(arms, Z, wingFront, yw / 2, o, M.shell, 0.7, 'chair.wingFront');
    ex(arms, Z, wingFront, -o, -yw / 2, M.shell, 0.7, 'chair.wingFront');
    bx(arms, Z, 4, o, 9, 1.2, 0.25, 16, M.steel, 'chair.trim'); bx(arms, Z, 4, -o - 0.25, 9, 1.2, 0.25, 16, M.steel, 'chair.trim');
    const top = st + 7, cups = [];
    const armDefs = [['ArmL', -o, 9, 15, 5], ['ArmR', yw / 2, 9, 15, 5], ['ArmMid', -yw / 2 + C0.midArm.fromLeft, 13.5, 12, 4]];
    for (const [nm, yy, xa, AL, cs] of armDefs) {
      rb(arms, Z, xa, yy, top - 3.5, AL, side, 3.0, 0.9, M.leather2, 'chair.' + nm);
      bx(arms, Z, xa + 0.2, yy + 0.2, top - 0.5, AL - 0.4, side - 0.4, 0.5, M.shell, 'chair.' + nm + 'Cap');
      bx(arms, Z, xa + (AL - 7) / 2, yy + 0.5, st - 6, 7, side - 1, top - 3.5 - (st - 6), M.bronze, 'chair.armSupport');
      bx(arms, Z, xa - 0.1, yy + 1, top - 2.5, 0.2, side - 2, 1, M.accent, 'chair.armPanel');
      for (let k = 0; k < 3; k++) {
        const cx = xa + (AL - 2 * cs) / 2 + cs * k, cy = yy + side / 2;
        const ring = mesh(cylGeo(cx, cy, top + 0.0, 1.85, 0.3, 20), M.steel, arms, 'chair.cup');
        const well = mesh(cylGeo(cx, cy, top + 0.1, 1.5, 0.3, 20), M.black, arms, 'chair.cup');
        cups.push(ring, well);
      }
    }
    const ry = yw / 2 + side / 2;                                  // tablet remote on a stalk
    mesh(cylGeo(26, ry, 22, 0.5, 10, 10), M.bronze, arms, 'chair.remote');
    const tab = group('chair.tablet', 26, ry, 33, arms); tab.rotation.x = 0.61;
    mesh(boxGeo(-2.8, -1.8, -0.25, 5.6, 3.6, 0.5, M.black), M.black, tab, 'chair.remote');
    mesh(new THREE.PlaneGeometry(4.6, 2.8).translate(0, 0, 0.3), M.screenKey, tab, 'chair.remote', false);

    // ---- pull-out desks: two 21.5 x 10.75 plates that rise out of the 2.5" armrest slots, rotate flat and join (43")
    const desks = [];
    for (const sg of [-1, 1]) {
      const px = 16.5, py = sg * (o - 1.25);
      const d = group('chair.desk', px, py, 0, slide);
      mesh(boxGeo(-S.desk.wide / 2, -1, 0, S.desk.wide, 2, S.desk.long, M.oak), M.oak, d, 'chair.deskPlate');
      mesh(boxGeo(-1.2, -1.1, S.desk.long - 3.5, 2.4, 2.2, 1.5, M.brass), M.brass, d, 'chair.deskMagnet');
      desks.push({ d, sg });
    }
    const deskRise = (st + 10) - (top - S.desk.long);            // plate bottom: armrest top - 21.5  ->  desk height
    rigs.desk = {
      t: 0, target: 0, dur: 2.6,
      apply: (e) => {
        const up = clamp(e / 0.45), rot = clamp((e - 0.45) / 0.55);
        for (const { d, sg } of desks) {
          d.position.z = (top - S.desk.long) + deskRise * ease(up);
          d.rotation.x = sg * (Math.PI / 2) * ease(rot);
        }
      },
    };

    // ---- recline rig: 0 = sitting, 1 = full flat bed (75", 85" with extension)
    rigs.chair = {
      t: 0, target: 0, dur: 4.5,
      apply: (e) => {
        slide.position.x = 15.5 * e;                                        // slides forward on its floor rails
        back.rotation.y = -Math.PI / 2 * e;                                 // back folds down behind the seat
        head.position.z = -3.5 * e;                                         // headrest slides onto the back
        leg.rotation.y = THREE.MathUtils.degToRad(C0.leg.hang) * (1 - e);   // leg rest lifts from hanging to flat
        const u = clamp((e - 0.55) / 0.45);
        ext.position.set(10 * u, 0, 5.2 * u);                               // extension slides out 10"
        const a = clamp((e - 0.5) / 0.5);
        arms.position.z = -7 * a;                                           // armrests lower flush with the bed
        for (const c of cups) c.visible = a < 0.6;
      },
    };
    parts.chair = g;
    return g;
  })();

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

  // =========================================================== 4  coat station (8 x 28 x 60)
  B(15.5, 116, 0, 0.6, 28, 92, M.oak); B(16.1, 143, 0, 7.4, 1, 60, M.oak); B(15.5, 116, 59, 8, 28, 1, M.oak);
  B(15.5, 116, 60, 8, 28, 32, M.plaster); B(16.1, 117, 0, 7.4, 27, 3, M.graphite);
  B(16.8, 115.6, 0, 6, 0.4, 60, M.mirror); B(16.4, 115.4, 0, 6.8, 0.2, 1.2, M.steel);
  CY(21, 118, 56.5, 0.5, 24, M.brass);
  for (const y of [119, 141]) B(16.1, y, 56, 4.9, 1, 1, M.steel);
  for (const y of [122, 130, 138]) B(16.1, y, 50, 2, 1, 1, M.brass);
  [[0, M.coat[0]], [1, M.coat[1]], [3, M.coat[2]]].forEach(([i, m]) => R(17.8, 140 - 4.6 * i - 1.6, 27, 5, 3.4, 27, 1, m));

  // =========================================================== 5  fridge / microwave block (28 x 18 x 92)
  (() => {
    const x0 = 53.5, y0 = 116, zf = 3, zs = zf + 31.2, zm = zs + 12.8, zc = zm + 10.2;
    B(x0, y0, 0, 18, 0.8, 92, M.oak); B(x0, 143.2, 0, 18, 0.8, 92, M.oak); B(70.9, y0, 0, 0.6, 28, 92, M.oak); B(x0, y0, 91.2, 18, 28, 0.8, M.oak);
    B(54.1, 120.45, zf, 16.8, 19.1, 31.2, M.steel);                               // fridge 19.1 x 17.5 x 31.2
    B(53.5, 120.45, zf + 21.8, 0.6, 19.1, 9.4, M.white); B(53.5, 120.45, zf, 0.6, 19.1, 21.5, M.white);
    B(52.7, 136.5, zf + 24, 0.8, 0.8, 5, M.steel); B(52.7, 136.5, zf + 12, 0.8, 0.8, 8, M.steel);
    B(53.9, 116.8, zs, 17, 26.4, 0.5, M.oak);                                       // surprise-box compartment, 12.8" high
    R(59.5, 126, zs + 0.5, 8, 8, 8, 0.3, M.giftRed); B(59.4, 129.3, zs + 0.5, 8.2, 1.4, 8.2, M.gold); B(62.8, 125.9, zs + 0.5, 1.4, 8.2, 8.2, M.gold);
    B(53.5, 116.8, zs + 0.5, 0.4, 26.4, 11.8, M.glass); B(54, 116.8, zs + 12.3, 16, 26, 0.4, M.led);
    B(53.9, 116.8, zm - 0.5, 17, 26.4, 0.5, M.oak);
    R(53.5, 119.5, zm, 13, 17.3, 10.2, 0.4, M.black);                               // microwave 17.3 x 13 x 10.2
    B(53.3, 120.3, zm + 1, 0.2, 10.5, 8.2, M.smoke); B(53.3, 132, zm + 0.8, 0.2, 4, 8.6, M.graphite); B(53.2, 133, zm + 6.8, 0.15, 3, 1.2, M.green);
    for (let i = 0; i < 2; i++) { B(53.4, 116.8 + i * 13.2, zc, 0.5, 13.2, 92 - zc, M.oak); B(52.8, 127 + i * 6.2, zc + 3, 0.7, 0.7, 7, M.brass); }
  })();

  // =========================================================== free storage + premium storage (rigged doors)
  (() => {
    // free storage 12 x 28 x 35, door on the outside (front)
    const w = 0.8;
    B(3.5, 116, 0, 12, 28, w, M.cabinetInterior); B(3.5, 116, 35 - w, 12, 28, w, M.oak); B(3.5, 116, 0, 12, w, 35, M.oak);
    B(3.5, 116, 0, w, 28, 35, M.oak); B(15.5 - w, 116, 0, w, 28, 35, M.oak);
    B(3.5, 143.2, 0, 1, 0.8, 35, M.oak); B(14.5, 143.2, 0, 1, 0.8, 35, M.oak); B(3.5, 143.2, 0, 12, 0.8, 2, M.oak); B(3.5, 143.2, 33, 12, 0.8, 2, M.oak);
    B(4.3, 118, 17, 10.4, 24, 0.4, M.oak);
    R(5, 124, 0.8, 9, 14, 22, 1.2, M.suitcase, 3); B(8, 129, 22.8, 3, 4, 1, M.steel);                  // a carry-on inside
    const dF = group('door.free', 4.5, 144, 2);
    mesh(boxGeo(0, 0, 0, 10, 0.5, 31, M.walnut), M.walnut, dF, 'door.free');
    mesh(boxGeo(8, 0.5, 9, 1, 1.2, 12, M.brass), M.brass, dF, 'door.free'); mesh(boxGeo(1.5, 0.5, 27, 1.2, 0.3, 1.2, M.green), M.green, dF, 'door.free', false);
    rigs.free = { t: 0, target: 0, dur: 1.4, apply: (e) => { dF.rotation.z = (Math.PI / 2) * 0.96 * e; } };
    parts.doorFree = dF;
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
      B(5, 74 + d * 14 + 1.5, z0 - 1.2, 11.5, 11, 0.3, M.green);
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
    B(63.4, y0 + 27, 31, 0.3, 3, 1, M.green); B(61.8, y0 + 14, 1.5, 3.5, 4, 1.2, M.steel); B(58.8, y0 + 13, 0.6, 2.5, 6, 1.2, M.rubber);   // fullness LED + foot lever
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

  // mannequin for scale (hidden by default)
  const person = group('person', 38.5, 132, 0); person.visible = false;
  const ph = 66;
  for (const dx of [-3.6, 3.6]) mesh(cylGeo(dx, 0, 0, 3, 0.47 * ph, 12), M.person, person, 'person');
  mesh(rboxGeo(-8.5, -4.5, 0.47 * ph - 2, 17, 9, 0.82 * ph - 0.47 * ph + 2, 2), M.person, person, 'person');
  mesh(new THREE.SphereGeometry(4.4, 14, 10).translate(0, 0, ph - 4.6), M.person, person, 'person');
  parts.person = person;

  // ---------- flush the static batch + instanced products
  const fixed = group('static');
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
  let pending = null;
  const api = {
    rigs, parts,
    update(dt) {
      if (pending !== null && rigs.desk.t < 0.02) { rigs.chair.target = pending; pending = null; }
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
        if (v > 0 && (rigs.chair.t > 0.05 || rigs.chair.target > 0)) return 'Return the chair to normal before opening the desks.';
        pending = null;
      }
      if (n === 'chair') {
        if (v > 0 && (rigs.desk.t > 0.02 || rigs.desk.target > 0)) { rigs.desk.target = 0; pending = v; return 'Closing the desks first...'; }
        pending = null;
      }
      rigs[n].target = v;
      return '';
    },
    toggle(n) { return this.set(n, rigs[n].target > 0.5 ? 0 : 1); },
    // slider: jump straight to a pose (0..1) with the same interlocks
    scrub(n, v) {
      if (n === 'chair' && v > 0 && (rigs.desk.t > 0.02 || rigs.desk.target > 0)) { rigs.desk.target = 0; return 'Closing the desks first...'; }
      pending = null;
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
    bx(3.5, 15.5, 116, 144, 'free'); bx(15.5, 23.5, 116, 144, 'coat'); bx(53.5, 71.5, 116, 144, 'block5'); bx(71.5, 83.5, 100, 144, 'premium');
    bx(3.5, 15.5, 74, 116, 'pillows'); bx(3.5, 15.5, 48, 74, 'minibar'); bx(63.5, 83.5, 68, 100, 'trash'); bx(63.5, 83.5, 48, 68, 'bucket');
    const e = ease(rigs.chair.t);
    bx(16.5, 62.5, 51 - 0.5 * e, 104 + 31.5 * e, 'chair');
    if (rigs.tv.t > 0.5) bx(17.7, 61.3, 112.4, 115.9, 'tv');
    if (rigs.glass1.t > 0.5 || rigs.glass2.t > 0.5) bx(23.5, 53.5, 142.8, 145, 'glass');
    return o;
  }
  return { root, pod, parts, M, api, obstacles, rects, lights };
}
