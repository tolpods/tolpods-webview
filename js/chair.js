// TOLPODS massage chair, rebuilt from the design sheet ("Massage chair - final model").
// Sheet: 32" wide, 48" high at the 110 deg pose, 73" long (83" with the leg extension).
//   headrest 9 H x 20 W x 6 D | backrest 30 L x 20 W x 6 D | armrest 15 L | seat 25 L x 20 W x 6 D | leg rest 18 L (elevatable) | leg extension 12 L
//   110 deg back-to-seat angle and 135 deg between the leg rest and the foot plate in the normal pose.
// Chair frame (inches): x forward (toward the feet), y across, z up from the floor, x = 0 at the rear of the base.
// Kinematics: the whole body (shell, seat, arms, back, legs) tilts about a rear pivot P; the back hinges at H; the calf rest hinges at the
// seat front (LP) and carries the foot plate, which carries the sliding extension.
import * as THREE from 'three';
import { boxGeo, rboxGeo, cylGeo, cylYGeo, extrudeXZ, extrudeYZ } from './geo.js';
import { usePBR } from './pbr.js';
import PRE from './chair-table.js';          // pre-measured slide + extent tables (tools/measure-chair.mjs); null = measure at startup

const D = THREE.MathUtils.degToRad;
export const RISE = 6;                                                      // extra pedestal height (inches) under the whole body
export const POSES = { upright: 0, normal: 0.45, full: 1 };       // positions on the recline rig (t)
// pose keyframes at t = 0 (upright), POSES.normal (110 deg), 1 (zero gravity)
const KEY = {
  phi: [0, 0, 16],          // body tilt: front of the seat rises (deg)
  psi: [100, 110, 126],     // back-to-seat angle (deg)
  calf: [40, 14, -5],       // calf rest below the seat plane (deg, negative = raised above it)
  foot: [-28, 45, 22],       // foot plate bent further down from the calf rest (deg); 45 = the sheet's 135 deg
};
export const EXT_TRAVEL = 9.7;
const EXT_CALF = 4, EXT_FOOT = 8;                                // with the extension out the leg rest straightens a little, as in the sheet                                      // the 12" extension slides out 10"
const MINY = 50.3;                                                 // plan y of the cabin back wall's inner face (plaster + slats), nothing may go behind it

const smooth = (pts, n = 6) => new THREE.CatmullRomCurve3(pts.map(([a, b]) => new THREE.Vector3(a, b, 0)), true, 'centripetal').getPoints(pts.length * n).slice(0, -1).map((v) => [v.x, v.y]);
// thin ribbon (closed polygon) along an open curve of (x, z) points
const ribbon = (pts, w, n = 24) => {
  const c = new THREE.CatmullRomCurve3(pts.map(([a, b]) => new THREE.Vector3(a, b, 0)), false, 'centripetal'), p = c.getPoints(n), L = [], R = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    L.push([p[i].x + nx * w / 2, p[i].y + ny * w / 2]); R.push([p[i].x - nx * w / 2, p[i].y - ny * w / 2]);
  }
  return L.concat(R.reverse());
};

export function buildChair(ctx) {
  const { M, S, group, mesh, rigs, parts, pod, clamp } = ctx;
  const C0 = S.chair, ease = (x) => x * x * (3 - 2 * x), N = POSES.normal;
  const g = group('chair', C0.centreX, C0.headY, 0); g.rotation.z = Math.PI / 2;          // local x = along the chair (-> plan +y), local y = across
  const slide = group('chair.slide', 0, 0, 0, g);

  const P = [12, 0, 8], H = [15, 0, 13], LP = [43.15, 0, 13];
  const body = group('chair.body', P[0], 0, P[2] + RISE, slide);                                  // tilts about P
  const back = group('chair.back', H[0] - P[0], 0, H[2] - P[2], body);                     // hinges at H
  const leg = group('chair.leg', LP[0] - P[0], 0, LP[2] - P[2], body);                     // calf rest, hinges at the seat front
  const foot = group('chair.foot', 18, 0, 0, leg);                                         // foot plate, 18" along the calf rest
  const ext = group('chair.ext', 0, 0, 0, foot);                                           // extension, slides along the foot plate

  // primitives that take coordinates in a frame whose origin is o (absolute design coordinates for base/body, local for back/leg/foot)
  const fr = (parent, o = [0, 0, 0]) => ({
    bx: (x0, y0, z0, sx, sy, sz, mat, name) => mesh(boxGeo(x0 - o[0], y0 - o[1], z0 - o[2], sx, sy, sz, mat), mat, parent, name),
    rb: (x0, y0, z0, sx, sy, sz, r, mat, name) => mesh(rboxGeo(x0 - o[0], y0 - o[1], z0 - o[2], sx, sy, sz, r), mat, parent, name),
    ex: (pts, y0, y1, mat, bevel, name) => mesh(extrudeXZ(pts, y0, y1, bevel, o), mat, parent, name),
    eyz: (pts, x0, x1, mat, bevel, name) => mesh(extrudeYZ(pts, x0, x1, bevel, o), mat, parent, name),
    cy: (cx, y0, cz, r, len, mat, name) => mesh(cylYGeo(cx - o[0], y0 - o[1], cz - o[2], r, len, 24), mat, parent, name),
    cz: (cx, cy, z0, r, h, mat, name, rt = r) => mesh(cylGeo(cx - o[0], cy - o[1], z0 - o[2], r, h, 20, rt), mat, parent, name),
  });
  const quiltFor = (zlen, ylen) => {                       // diamond size stays ~4" whatever the part's proportions
    const m = M.quilt.clone(); m.map = M.quilt.map.clone(); m.bumpMap = M.quilt.bumpMap.clone();
    m.map.repeat.set(zlen / 16, ylen / 16); m.bumpMap.repeat.copy(m.map.repeat); m.map.needsUpdate = true; m.bumpMap.needsUpdate = true;
    usePBR(m, 'quilt', { repeat: [zlen / 16, ylen / 16], normalScale: 1.1, rough: 1 });     // 2K leather set replaces the procedural one when it loads
    return m;
  };
  const SG = [-1, 1];

  // ===================================================== base: floor skid + pedestal (does not tilt)
  const b0 = fr(slide);
  b0.ex(smooth([[1, 0.4], [35, 0.4], [38, 2.2], [36, 4.4], [10, 4.7], [2, 3]]), -14, 14, M.black, 0.9, 'chair.basePlate');                  // skid ends under the seat front so the feet can hang past it
  b0.ex(smooth([[8, 4.4], [38, 4.4], [36, 7.7 + RISE], [14, 8.2 + RISE]]), -11.5, 11.5, M.graphite, 1, 'chair.pedestal');
  for (const sg of SG) b0.bx(5, sg > 0 ? 13.92 : -14.08, 2.3, 36, 0.16, 0.55, M.bronze, 'chair.baseTrim');
  b0.cy(P[0], -13, P[2] + RISE, 1.1, 26, M.bronze, 'chair.axle');
  b0.bx(36, -11, 4.45, 4, 22, 0.25, M.accent, 'chair.underglow');

  // ===================================================== body (tilts): dark shell, seat, side slabs, armrests, controller
  const b = fr(body, P);
  const side = smooth([[5, 8.6], [1.8, 12.5], [2, 18], [5.5, 22.5], [14, 24.2], [28, 24.2], [38, 22], [46, 18.6], [49.4, 14.5], [48.4, 10.4], [44, 8.5], [24, 8.2]]);
  const core = smooth([[5, 8.8], [3, 12], [4, 14.2], [24, 14.8], [44, 14.2], [47.5, 13], [48, 11], [44, 8.6], [24, 8.4]]);
  b.ex(core, -14.95, 14.95, M.shell, 0.8, 'chair.housing');
  for (const sg of SG) {
    b.ex(side, sg > 0 ? 14.4 : -15.88, sg > 0 ? 15.88 : -14.4, M.shell, 0.5, 'chair.shellSide');
    b.ex(ribbon([[6, 12], [18, 14.2], [30, 16.6], [41, 17.2], [47.6, 14.5]], 0.55), sg > 0 ? 15.84 : -16, sg > 0 ? 16 : -15.84, M.bronze, 0, 'chair.swoosh');
    b.rb(17, sg > 0 ? 9.9 : -15.1, 13.2, 31.6, 5.2, 6.4, 2.2, M.leather, 'chair.sideSlab');
    for (let i = 0; i < 7; i++) b.bx(21 + i * 1.5, sg > 0 ? 15.84 : -15.96, 10.4 + (i % 2) * 0.2, 0.55, 0.12, 4.2, M.black, 'chair.grille');   // speaker slots                 // beige side leather
  }
  b.rb(16, -10, 9.4, 25, 20, 6, 2.4, M.leather, 'chair.seatCushion');                                    // seat 25 L x 20 W
  b.rb(17.5, -9, 15.2, 22.5, 18, 1.7, 0.85, M.leather, 'chair.seatCrown');                                 // crowned seat cushion
  b.rb(40.6, -9.8, 10.6, 4.2, 19.6, 4.6, 2, M.leather2, 'chair.seatLip');                                 // knee roll over the leg-rest hinge
  b.bx(16.8, -9.9, 15.1, 23.6, 0.12, 0.12, M.leather2, 'chair.piping'); b.bx(16.8, 9.78, 15.1, 23.6, 0.12, 0.12, M.leather2, 'chair.piping');
  const TOP = 24;                                                                                         // armrest top
  for (const [sg, nm] of [[-1, 'ArmR'], [1, 'ArmL']]) {
    const y0 = sg > 0 ? 9.4 : -15.4, yc = sg * 12.4;
    b.rb(19, y0, 17.6, 15, 6, TOP - 17.6, 2.95, M.leather2, 'chair.' + nm);                                  // armrest 15 L x 6 W
    b.bx(19.6, y0 + 0.5, TOP - 0.06, 13.8, 5, 0.1, M.bronze, 'chair.' + nm + 'Line');
    b.bx(21.2, yc - 1.2, TOP - 0.02, 10.8, 2.4, 0.1, M.black, 'chair.slot');                              // slot the desk plate rises through
  }
  // controller tablet on a stalk at the right armrest
  b.cz(36, -14.6, TOP - 0.5, 0.5, 8.6, M.bronze, 'chair.remote'); b.cz(36, -14.6, TOP - 0.4, 1.3, 0.5, M.bronze, 'chair.remote');
  const tab = group('chair.tablet', 36 - P[0], -14.6, 33 - P[2], body); tab.rotation.y = -1.05;
  const tb = fr(tab);
  tb.rb(-2.5, -4, -0.3, 5, 8, 0.6, 0.3, M.black, 'chair.remote');
  mesh(new THREE.PlaneGeometry(4.5, 7.2).translate(0, 0, 0.35), M.screenKey, tab, 'chair.remote', false);

  // ===================================================== back: S-track pad, bolsters, dark shell and wings, headrest
  const k = fr(back);
  const quiltBack = quiltFor(22, 10.8);
  k.rb(-3.5, -10, 2.5, 6, 20, 30, 2.4, M.leather, 'chair.backPad');                                       // backrest 30 L x 20 W x 6 D
  for (const sg of SG) k.rb(-3.5, sg > 0 ? 6.2 : -10, 4, 8, 3.8, 26, 1.8, M.leather2, 'chair.bolster');
  k.rb(2.3, -5.4, 7, 0.9, 10.8, 22, 0.4, quiltBack, 'chair.backQuilt');
  k.rb(2.3, -4.5, 9, 2.2, 9, 8, 1.6, M.leather, 'chair.lumbar');
  for (const yy of [-5.6, 5.5]) k.bx(2.35, yy, 5.5, 0.18, 0.14, 25, M.bronze, 'chair.piping');                // S-track seams
  for (const yy of [-6.3, 6.2]) k.bx(2.5, yy - 0.07, 4, 0.1, 0.14, 26.5, M.leather2, 'chair.seam');
  k.bx(2.4, -10, 31.9, 0.12, 20, 0.14, M.bronze, 'chair.piping');                                           // line where the headrest meets the back
  k.rb(-9, -16, -1.5, 5.5, 32, 35.5, 2.7, M.shell, 'chair.backShell');                                  // dark rear shell, full 32" width
  const cheek = smooth([[-8.2, -1.5], [-8.2, 30], [-5.5, 35.5], [1, 36], [4.5, 32.5], [5.5, 22], [8.5, 13], [10.5, 5], [8.5, -1.8]]);
  for (const sg of SG) {
    k.ex(cheek, sg > 0 ? 10.2 : -15.88, sg > 0 ? 15.88 : -10.2, M.shell, 0.6, 'chair.wingRear');
    k.ex(ribbon([[-7.5, 4], [-5, 16], [-1, 27], [3, 33]], 0.6), sg > 0 ? 15.84 : -16, sg > 0 ? 16 : -15.84, M.bronze, 0, 'chair.swoosh');
  }
  k.bx(-9.14, -15.6, 14, 0.14, 31.2, 0.7, M.bronze, 'chair.swoosh');
  k.rb(-3, -10, 27.1, 6, 20, 9, 2.8, M.leather, 'chair.headrest');                                          // headrest 9 H x 20 W x 6 D
  for (const sg of SG) k.rb(-1.5, sg > 0 ? 8.2 : -10.4, 29.0, 7, 2.2, 6.6, 1.1, M.leather2, 'chair.headWing');
  k.bx(-7, -3.5, 24.5, 5, 7, 5, M.shell, 'chair.neck');

  // ===================================================== leg rest (18 L calf pods), foot plate, extension
  const lg = fr(leg), ft = fr(foot), ex2 = fr(ext), HW = 4.75;
  // calf pods: thick at the knee, tapering to the ankle, rounded ends (profile in x-z, extruded across the pod)
  const calfProf = smooth([[0.4, 3.2], [9, 3.4], [16.2, 3], [17.85, 1.4], [17.3, -1.4], [15.4, -3.4], [9, -4.1], [2, -4.8], [0.3, -3.6], [0, 0]]);
  const footProf = smooth([[0.5, 3.2], [5.2, 3.4], [7.3, 2.6], [8.1, 0.4], [7.6, -2.4], [6, -4.2], [2.4, -4.5], [0.4, -3.4], [0, 0]]);
  for (const sg of SG) {
    const yc = sg * (HW + 0.5), y0 = yc - HW;
    lg.ex(calfProf, y0, y0 + 2 * HW, M.leather, 1.1, 'chair.calfPod');
    lg.bx(1.2, yc - 2.2, 3.1, 15.4, 4.4, 0.3, M.black, 'chair.calfPad');                                        // the channel the calf rests in
    for (const o of [y0 + 0.2, yc + HW - 2.6]) lg.rb(0.3, o, 2.2, 17.2, 2.4, 3.2, 1.1, M.leather2, 'chair.calfBag');      // padded side bolsters, run the full length
    ex2.ex(footProf, y0, y0 + 2 * HW, M.leather, 1.1, 'chair.footCradle');                                       // foot boot, rounded toe
    ex2.bx(0.9, yc - 2.2, 3.2, 5.8, 4.4, 0.3, M.black, 'chair.footPad');
    for (const o of [y0 + 0.2, yc + HW - 2.6]) ex2.rb(0.4, o, 2.3, 6.9, 2.4, 3.2, 1.1, M.leather2, 'chair.calfBag');
  }
  lg.bx(0.5, -0.5, -5.2, 17, 1, 7, M.shell, 'chair.legSpine');
  // calf extender: grows out of the calf rest behind the foot boot as the extension slides out (scaled along x by the extension)
  const bridge = group('chair.bridge', 0, 0, 0, foot), br = fr(bridge);
  for (const sg of SG) br.rb(-0.2, sg * (HW + 0.5) - HW + 0.2, -4.2, EXT_TRAVEL + 0.4, 2 * HW - 0.4, 7.4, 1.5, M.leather, 'chair.extBridge');
  br.bx(-0.2, -0.5, -5.2, EXT_TRAVEL + 0.4, 1, 6.6, M.shell, 'chair.extBridge');
  ex2.bx(-6, -9.4, -5.9, 12, 18.8, 1.1, M.leather2, 'chair.ext');                                        // 12 L foot plate, nested under the boot, slides out

  // ===================================================== pull-out desks, stored upright inside the armrests
  const desks = [], dl = Math.min(S.desk.long, 12.5), deskTop = 26.5, d0 = fr(body, P);
  for (const sg of SG) {
    const d = group('chair.desk', 26.5 - P[0], sg * 12.4, (TOP - 0.2 - dl) - P[2], body);
    mesh(boxGeo(-S.desk.wide / 2, -1, 0, S.desk.wide, 2, dl, M.oak), M.oak, d, 'chair.deskPlate');
    mesh(boxGeo(-1.2, -1.1, dl - 3.2, 2.4, 2.2, 1.5, M.brass), M.brass, d, 'chair.deskMagnet');
    desks.push({ d, sg });
  }
  const deskRise = deskTop - (TOP - 0.2 - dl);
  rigs.desk = {
    t: 0, target: 0, dur: 2.6,
    apply: (e) => {
      const up = clamp(e / 0.45), rot = clamp((e - 0.45) / 0.55);
      for (const { d, sg } of desks) { d.position.z = (TOP - 0.2 - dl - P[2]) + deskRise * ease(up); d.rotation.x = sg * (Math.PI / 2) * ease(rot); }
    },
  };

  // ===================================================== poses
  const mix = (a, t) => (t <= N ? a[0] + (a[1] - a[0]) * ease(t / N) : a[1] + (a[2] - a[1]) * ease((t - N) / (1 - N)));
  let SL = [[0, 0]];                                                                                       // slide forward (t, inches), filled in below
  const slideAt = (t) => { for (let i = 1; i < SL.length; i++) if (t <= SL[i][0]) { const [a, sa] = SL[i - 1], [c, sc] = SL[i]; return sa + (sc - sa) * (t - a) / (c - a || 1); } return SL.at(-1)[1]; };
  const lim = (t) => clamp((0.62 - t) / 0.17);                                                              // the extension only works up to the normal pose
  const pose = (t, x, s) => {
    const xx = x * lim(t);
    slide.position.x = s;
    body.rotation.y = -D(mix(KEY.phi, t));
    back.rotation.y = -D(mix(KEY.psi, t) - 90);
    leg.rotation.y = D(mix(KEY.calf, t) + (EXT_CALF - mix(KEY.calf, t)) * xx);
    foot.rotation.y = D(mix(KEY.foot, t) + (EXT_FOOT - mix(KEY.foot, t)) * xx);
    ext.position.x = EXT_TRAVEL * xx; bridge.scale.x = Math.max(xx, 0.001); bridge.visible = xx > 0.01;
  };
  rigs.legext = { t: 0, target: 0, dur: 1.6, apply: () => pose(rigs.chair.t, rigs.legext.t, slideAt(rigs.chair.t)) };
  rigs.chair = { t: N, target: N, dur: 6, apply: () => pose(rigs.chair.t, rigs.legext.t, slideAt(rigs.chair.t)) };

  // measure the chair at each pose (plan y extents), so it slides just far enough to keep its head off the back wall, and so walking collision knows its size.
  // The result is stored in chair-table.js (the measuring costs ~0.5 s on a laptop and several seconds on a phone); with no table it is measured here.
  const T = []; for (let i = 0; i <= 40; i++) T.push(i / 40);
  let EXTENT;
  if (PRE) { SL = PRE.SL; EXTENT = PRE.EXTENT; }
  else {
    const meshes = []; g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const measure = () => {
      pod.updateMatrixWorld(true); const bb = new THREE.Box3(), tmp = new THREE.Box3();
      for (const m of meshes) { if (m.name === 'chair.tablet') continue; tmp.setFromObject(m, true); bb.union(tmp); }
      return [-bb.max.z, -bb.min.z, bb.min.x, bb.max.x];                                                      // plan y0, y1, x0, x1
    };
    const raw = T.map((t) => { pose(t, 0, 0); return measure()[0]; });
    let run = 0; SL = T.map((t, i) => [t, (run = Math.max(run, MINY - raw[i], 0))]);
    EXTENT = { plain: [], ext: [] };
    for (const t of T) {
      for (const key of ['plain', 'ext']) { pose(t, key === 'ext' ? 1 : 0, slideAt(t)); const m = measure(); EXTENT[key].push([t, m[0], m[1], m[2], m[3]]); }
    }
  }
  const interp = (arr, t) => { for (let i = 1; i < arr.length; i++) if (t <= arr[i][0]) { const a = arr[i - 1], c = arr[i], u = (t - a[0]) / (c[0] - a[0] || 1); return a.slice(1).map((v, j) => v + (c[j + 1] - v) * u); } return arr.at(-1).slice(1); };
  const extent = () => { const t = rigs.chair.t, x = rigs.legext.t * lim(t), p = interp(EXTENT.plain, t), e = interp(EXTENT.ext, t); return p.map((v, j) => v + (e[j] - v) * x); };   // [y0, y1, x0, x1]
  pose(rigs.chair.t, 0, slideAt(rigs.chair.t));
  parts.chair = g; g.userData.table = { SL, EXTENT };
  return { g, extent, slideAt, EXTENT };
}
