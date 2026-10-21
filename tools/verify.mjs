// Node check: builds the pod headless (canvas stubbed) and measures it against the sheet. Run:  node tools/verify.mjs
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const ctx = new Proxy({}, { get: (t, k) => (k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
const canvases = [];
globalThis.document = { createElement: () => { const c = { width: 0, height: 0, getContext: () => ctx, style: {} }; canvases.push(c); return c; } };
// resolve the browser import map for Node
import { register } from 'node:module';
const loader = `
export async function resolve(spec, context, next) {
  if (spec === 'three') return { url: 'file://${here}/../js/vendor/three.module.js', shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: 'file://${here}/../js/vendor/addons/' + spec.slice(13), shortCircuit: true };
  return next(spec, context);
}`;
register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);
const THREE = await import(pathToFileURL(path.join(here, '../js/vendor/three.module.js')).href);
const { buildPod } = await import(pathToFileURL(path.join(here, '../js/pod.js')).href);
const { RISE } = await import(pathToFileURL(path.join(here, '../js/chair.js')).href);
const { SPEC: S } = await import(pathToFileURL(path.join(here, '../js/spec.js')).href);

const pod = buildPod();
const K = S.chair.scale;                                    // the chair is built at 90% of the sheet (design change), so sheet sizes are multiplied by K
const near = (a, b, tol = 0.02) => Math.abs(a - b) < tol;
const rows = []; const ok = (name, spec, got, pass) => rows.push([pass ? 'OK ' : 'XX ', name, spec, got]);
const f = (v) => +v.toFixed(2);
const bbox = (obj) => { obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj); };
const sz = (b) => b.getSize(new THREE.Vector3());
// pod frame -> plan: world (x, y_up, z) = plan (x, -z, y_up)
const planBox = (b) => ({ x: [f(b.min.x), f(b.max.x)], y: [f(-b.max.z), f(-b.min.z)], z: [f(b.min.y), f(b.max.y)] });
const len = (r) => f(r[1] - r[0]);
const find = (name) => { const out = []; pod.root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };

let draw = 0; pod.root.traverse((o) => { if (o.isMesh) draw++; });
console.log('meshes in scene:', draw);

// ---- chair (design sheet: 32 W x 48 H x 73 L, 83 with the extension; 110 deg back, 135 deg leg)
const gC = pod.parts.chair, byName = (n) => gC.getObjectByName(n);
const chairMeshes = []; gC.traverse((o) => { if (o.isMesh) chairMeshes.push(o); });
const envelope = () => { pod.root.updateMatrixWorld(true); const b = new THREE.Box3(), t = new THREE.Box3(); for (const m of chairMeshes) { if (m.name === 'chair.remote' || m.name.startsWith('chair.deskM')) continue; t.setFromObject(m, true); b.union(t); } return planBox(b); };
const goPose = (t, x = 0) => { pod.api.rigs.chair.t = pod.api.rigs.chair.target = t; pod.api.rigs.legext.t = pod.api.rigs.legext.target = x; pod.api.rigs.chair.apply(); };
const geoSize = (name) => { const m = chairMeshes.find((o) => o.name === name); m.geometry.computeBoundingBox(); return m.geometry.boundingBox.getSize(new THREE.Vector3()); };
const sz3 = (v) => `${f(v.x)} x ${f(v.y)} x ${f(v.z)}`;
goPose(0.45);
let env = envelope(); const W = len(env.x), Hh = env.z[1], L = len(env.y);
ok('chair width (sheet 32 in)', '32', `${W}`, near(W, 32, 0.15));
ok(`chair height at 110 deg (sheet 48 in + ${RISE} in raised pedestal)`, `${48 + RISE}`, `${Hh}`, near(Hh, 48 + RISE, 0.4));
ok('chair length, extension retracted (sheet 73 in)', '73', `${L}`, near(L, 73, 0.4));
goPose(0.45, 1); env = envelope(); ok('chair length, extension out (sheet 83 in)', '83', `${len(env.y)}`, near(len(env.y), 83, 0.5));
goPose(0.45);
let v = geoSize('chair.headrest'); ok('headrest depth x width x height (sheet 6 x 20 x 9)', '6 x 20 x 9', sz3(v), near(v.x, 6, 0.05) && near(v.y, 20, 0.05) && near(v.z, 9, 0.05));
v = geoSize('chair.backPad'); ok('backrest depth x width x length (sheet 6 x 20 x 30)', '6 x 20 x 30', sz3(v), near(v.x, 6, 0.05) && near(v.y, 20, 0.05) && near(v.z, 30, 0.05));
v = geoSize('chair.seatCushion'); ok('seat length x width x thick (sheet 25 x 20 x 6)', '25 x 20 x 6', sz3(v), near(v.x, 25, 0.05) && near(v.y, 20, 0.05) && near(v.z, 6, 0.1));
v = geoSize('chair.ArmL'); ok('armrest long (sheet 15)', '15', `${f(v.x)}`, near(v.x, 15, 0.05));
v = geoSize('chair.calfPod'); ok('leg rest long (sheet 18)', '18', `${f(v.x)}`, near(v.x, 18, 0.1));
v = geoSize('chair.ext'); ok('leg extension long (sheet 12)', '12', `${f(v.x)}`, near(v.x, 12, 0.05));
const ang = () => ({ back: 90 - THREE.MathUtils.radToDeg(byName('chair.back').rotation.y), leg: 180 - THREE.MathUtils.radToDeg(byName('chair.foot').rotation.y) });
let an = ang(); ok('normal pose: back-to-seat 110 deg, leg-to-foot 135 deg', '110 / 135', `${f(an.back)} / ${f(an.leg)}`, near(an.back, 110, 0.1) && near(an.leg, 135, 0.1));
goPose(0); an = ang(); env = envelope(); ok('upright: back-to-seat angle', '100', `${f(an.back)}`, near(an.back, 100, 0.1));
ok('upright: head end inside the cabin, feet clear of the door', 'y >= 49.6, <= 141', `${env.y[0]} .. ${env.y[1]}`, env.y[0] >= 49.6 && env.y[1] <= 141);
goPose(1); an = ang(); env = envelope(); ok('zero gravity: back-to-seat angle', '126', `${f(an.back)}`, near(an.back, 126, 0.1));
ok('zero gravity: head end inside the cabin, feet clear of the door', 'y >= 49.6, <= 141', `${env.y[0]} .. ${env.y[1]}`, env.y[0] >= 49.6 && env.y[1] <= 141);
console.log('   zero gravity  length', len(env.y), ' height', env.z[1], ' y', env.y);
goPose(0.45, 1); pod.api.rigs.chair.t = pod.api.rigs.chair.target = 1; pod.api.rigs.chair.apply();
ok('leg extension is locked out beyond the normal pose', 'same length as without it', `${len(envelope().y)}`, near(len(envelope().y), len(env.y), 0.01));
goPose(0);

// ---- desks (stored upright in the armrests; plates swing flat over the lap, 12.5 each)
const dp = find('chair.deskPlate');
const upd = () => pod.root.updateMatrixWorld(true);
pod.api.rigs.desk.target = 1; for (let i = 0; i < 400; i++) pod.api.update(0.05);
upd(); const db = new THREE.Box3(); dp.forEach((o) => db.union(new THREE.Box3().setFromObject(o))); const dpb = planBox(db);
ok('joined desk span (across) x (along)', `25 x 10.75`, `${len(dpb.x)} x ${len(dpb.y)}`, near(len(dpb.x), 25, 0.6) && near(len(dpb.y), 10.75, 0.1));
console.log('   desk height z', dpb.z);
pod.api.rigs.desk.target = 0; for (let i = 0; i < 400; i++) pod.api.update(0.05);

// ---- other units (static boxes are merged; check overall extents of known groups through raycast-free bounding of the whole pod)
const whole = planBox(bbox(pod.pod)); ok('pod footprint (incl. ramp/plants)', 'x 0..90', `${whole.x}`, whole.x[0] <= 0 && whole.x[1] >= 90);
// ---- flat roof + moonroof
const roofTop = Math.max(...find('roof.slab').map((o) => planBox(new THREE.Box3().setFromObject(o, true)).z[1])); ok('flat roof height (92 wall + 2 roof)', '94', `${f(roofTop)}`, near(roofTop, 94, 0.05));
const glassB = () => { upd(); const b = new THREE.Box3(); find('roof.glass').forEach((o) => b.union(new THREE.Box3().setFromObject(o, true))); return planBox(b); };
const glassOne = (k) => { upd(); return planBox(new THREE.Box3().setFromObject(find('roof.glass')[k], true)); };
const shadeB = () => { upd(); return planBox(new THREE.Box3().setFromObject(find('roof.shadeSheet')[0], true)); };
const rigGo = (n, v) => { pod.api.rigs[n].target = v; for (let i = 0; i < 400; i++) pod.api.update(0.05); };
let gb = glassB(); ok('moonroof glass (closed): two panels, total width x length, flush in the roof', '60 x 48, top <= 94', `${len(gb.x)} x ${len(gb.y)}, top ${gb.z[1]}`, near(len(gb.x), 60, 0.1) && near(len(gb.y), 48, 0.1) && gb.z[1] <= 94);
ok('each glass panel is 30 wide', '30', `${len(glassOne(0).x)}, ${len(glassOne(1).x)}`, near(len(glassOne(0).x), 30, 0.1) && near(len(glassOne(1).x), 30, 0.1));
ok('moonroof opening sits clear of the TV rail (y 111.5..114.5)', 'y1 < 111.5', `${gb.y[1]}`, gb.y[1] < 111.5);
rigGo('shade', 1); const sb = shadeB(); ok('shade opens on its own: glass stays put', 'shade y1 <= 60.1, glass unchanged', `shade ${sb.y[1]}, glass top ${glassB().z[1]}`, sb.y[1] <= 60.1 && glassB().z[1] <= 94);
rigGo('shade', 0); ok('shade closes again', 'y 60..108', `${shadeB().y}`, near(shadeB().y[0], 60, 0.05) && near(shadeB().y[1], 108, 0.05));
rigGo('tilt', 1); gb = glassB(); ok('glass tilt alone: rear edge up, shade stays closed', 'rear >= 98, shade y0 60', `rear ${gb.z[1]}, shade ${shadeB().y[0]}`, gb.z[1] >= 98 && near(shadeB().y[0], 60, 0.05));
rigGo('tilt', 0);
rigGo('slide', 1); gb = glassB(); ok('glass slide alone (x axis): panels part ~13 each way, above the rails', 'x 2..88, z0 >= 94.5, y unchanged', `x ${gb.x}, z0 ${gb.z[0]}, y ${gb.y}`, near(gb.x[0], 2, 0.1) && near(gb.x[1], 88, 0.1) && gb.z[0] >= 94.5 && near(gb.y[0], 60, 0.05));
ok('open gap between the panels', '>= 26', `${f(glassOne(1).x[0] - glassOne(0).x[1])}`, glassOne(1).x[0] - glassOne(0).x[1] >= 26 - 0.1);
rigGo('slide', 0); gb = glassB(); ok('slide closes again exactly', 'x 15..75, z top <= 94', `${gb.x}, ${gb.z[1]}`, near(gb.x[0], 15, 0.05) && near(gb.x[1], 75, 0.05) && gb.z[1] <= 94);
pod.api.fireVent(1); for (let i = 0; i < 400; i++) pod.api.update(0.05); gb = glassB();
ok('fire vent opens shade and tilts the glass together', 'shade y1 <= 60.1, rear >= 98', `shade ${shadeB().y[1]}, rear ${gb.z[1]}`, shadeB().y[1] <= 60.1 && gb.z[1] >= 98);
pod.api.fireVent(0); for (let i = 0; i < 400; i++) pod.api.update(0.05);

// ---- front block + side vending machines (side machines 40 x 72 x 13; front machines shrunk to fit)
const mk = (n) => pod.solids.filter((r) => r.mat === n);
const sideBox = (x0, x1) => { const b = pod.solids.filter((r) => r.mat === 'graphite' && r.y0 >= 3.4 && r.y1 <= 43.6 && r.x0 >= x0 - 0.01 && r.x1 <= x1 + 0.01 && r.z1 <= 72.01); return { x: [Math.min(...b.map((r) => r.x0)), Math.max(...b.map((r) => r.x1))], y: [Math.min(...b.map((r) => r.y0)), Math.max(...b.map((r) => r.y1))], z: [Math.min(...b.map((r) => r.z0)), Math.max(...b.map((r) => r.z1))], n: b.length }; };
const LM = sideBox(-0.1, 13.05), Rm = sideBox(76.95, 90.1);
ok('left snack machine: wide (y) x tall (z) x deep (x)', '40 x 72 x 13', `${f(LM.y[1] - LM.y[0])} x ${f(LM.z[1] - LM.z[0])} x ${f(LM.x[1] - LM.x[0])}`, near(LM.y[1] - LM.y[0], 40, 0.1) && near(LM.z[1] - LM.z[0], 72, 0.1) && near(LM.x[1] - LM.x[0], 13, 0.1));
ok('right refrigerated machine: wide x tall x deep', '40 x 72 x 13', `${f(Rm.y[1] - Rm.y[0])} x ${f(Rm.z[1] - Rm.z[0])} x ${f(Rm.x[1] - Rm.x[0])}`, near(Rm.y[1] - Rm.y[0], 40, 0.1) && near(Rm.z[1] - Rm.z[0], 72, 0.1) && near(Rm.x[1] - Rm.x[0], 13, 0.1));
ok('side machines sit flush with the outer wall faces (x = 0 and 90)', '0 and 90', `${LM.x[0]} and ${Rm.x[1]}`, LM.x[0] === 0 && Rm.x[1] === 90);
ok('side machines stay beside the ad screen (y 3.5..43.5, ad screen starts y 47.5)', 'y1 < 47.5', `${LM.y[1]}`, LM.y[1] < 47.5);
const fb = (name, x0, x1) => { const b = pod.solids.filter((r) => r.mat === 'graphite' && r.y0 === 0 && r.y1 === 48 && r.z0 === 0 && r.z1 === 92 && r.x0 >= x0 - 0.01 && r.x1 <= x1 + 0.01); return [Math.min(...b.map((r) => r.x0)), Math.max(...b.map((r) => r.x1))]; };
const cold = fb('cold', 12.9, 37.1), snack = fb('snack', 62.9, 77.1);
ok('cold-drink machine (14): width x depth x height (sheet 39 x 48 x 92, shrunk for the side machines)', '24 x 48 x 92', `${f(cold[1] - cold[0])} x 48 x 92`, near(cold[1] - cold[0], 24, 0.01));
ok('snack machine (12): width x depth x height (sheet 15 x 48 x 92)', '14 x 48 x 92', `${f(snack[1] - snack[0])} x 48 x 92`, near(snack[1] - snack[0], 14, 0.01));
const oak = pod.solids.find((r) => r.mat === 'oak' && r.x0 === 37 && r.y0 === 8);
ok('refrigerated storage (11): width x depth x height (sheet 26 x 40 x 92)', '26 x 40 x 92', `${f(oak.x1 - oak.x0)} x ${f(oak.y1 - oak.y0)} x ${f(oak.z1 - oak.z0)}`, near(oak.x1 - oak.x0, 26, 0.01) && near(oak.y1 - oak.y0, 40, 0.01) && near(oak.z1 - oak.z0, 92, 0.01));
ok('front row fits between the side machines with no overlap', 'cold 13..37, storage 37..63, snacks 63..77', `${cold}, ${snack}`, cold[0] === 13 && snack[1] === 77);

// ---- doors
for (const n of ['premium']) { pod.api.rigs[n].target = 1; for (let i = 0; i < 100; i++) pod.api.update(0.05); const g = pod.parts.doorPremium; console.log('   door', n, 'rotation z deg', f(THREE.MathUtils.radToDeg(g.rotation.z))); pod.api.rigs[n].target = 0; for (let i = 0; i < 100; i++) pod.api.update(0.05); }
// ---- tv
pod.api.rigs.tv.target = 1; for (let i = 0; i < 100; i++) pod.api.update(0.05);
upd(); const tvb = new THREE.Box3(); pod.parts.tv.traverse((o) => { if (o.name === 'tv.bezel') tvb.union(new THREE.Box3().setFromObject(o)); });
const tvp = planBox(tvb); ok('TV (watching) wide x high, top below roof', '43.6 x 24.5, 14', `${len(tvp.x)} x ${len(tvp.z)}, ${f(92 - tvp.z[1])}`, len(tvp.x) === 43.6 && len(tvp.z) === 24.5 && f(92 - tvp.z[1]) === 14);
pod.api.rigs.tv.target = 0; for (let i = 0; i < 100; i++) pod.api.update(0.05);
upd(); const tvs = new THREE.Box3(); pod.parts.tv.traverse((o) => { if (o.name === 'tv.bezel') tvs.union(new THREE.Box3().setFromObject(o)); });
console.log('   TV stowed: lowest point z =', planBox(tvs).z[0], '(walking clearance)');

// ---- rig interlock
console.log('   interlock:', JSON.stringify(pod.api.set('chair', 1)), '->', JSON.stringify(pod.api.set('desk', 1)));
// ---- screen / header textures are drawn at the real aspect ratio of the surface (no stretched text)
const has = (w, h) => canvases.some((c) => c.width === w && c.height === h);
ok('touch-screen UI texture (22.8 x 44.8 panel)', '512 x 1008', has(512, 1008) ? '512 x 1008' : 'missing', has(512, 1008) && Math.abs(512 / 1008 - 22.8 / 44.8) < 0.005);
ok('TV + ad screen textures (16:9 panels)', '1024 x 560', has(1024, 560) ? '1024 x 560' : 'missing', has(1024, 560) && Math.abs(1024 / 560 - 42 / 22.9) < 0.01);
ok('vending header 14 (21 x 4 drawn area)', '1536 x 293', has(1536, 293) ? '1536 x 293' : 'missing', has(1536, 293));
ok('vending header 12 (11 x 4 drawn area)', '1536 x 559', has(1536, 559) ? '1536 x 559' : 'missing', has(1536, 559));
ok('side machine headers (37 x 4 drawn area)', '1536 x 166', has(1536, 166) ? '1536 x 166' : 'missing', has(1536, 166));
ok('keypad screen (10 x 6)', '512 x 307', has(512, 307) ? '512 x 307' : 'missing', has(512, 307) && Math.abs(512 / 307 - 10 / 6) < 0.01);
ok('brand bar (24 x 6 = 4:1)', '1024 x 256', has(1024, 256) ? '1024 x 256' : 'missing', has(1024, 256));
// ---- walking through the real pod (same collision code the explorer uses)
const { step: wstep } = await import(pathToFileURL(path.join(here, '../js/walk.js')).href);
const walk = (start, dir, n, speed = 1) => { const p = { x: start[0], y: start[1] }; for (let i = 0; i < n; i++) wstep(p, dir[0] * speed, dir[1] * speed, 8, pod.api.set('tv', 0) || pod.obstacles()); return p; };
let p = walk([38.5, 215], [0, -1], 500);
const cOb = () => pod.obstacles().find((o) => o.tag === 'chair'); let cy1 = cOb().y1;
ok('walk in through the entrance (stops at the chair, upright)', `y ~ ${f(cy1 + 8)}`, `y=${f(p.y)}`, Math.abs(p.y - (cy1 + 8)) < 2);
p = walk([10, 215], [0, -1], 500); ok('open entrance end: walks down the left side until the pillows', 'stops y ~150', `y=${f(p.y)}`, Math.abs(p.y - 150.2) < 1);
p = walk([38.5, 125], [-1, 0], 300); ok('left wall (open entrance end)', 'stops x >= 11.5', `x=${f(p.x)}`, p.x >= 11.5 - 0.01);
p = walk([45, -120], [0, 1], 500); ok('back machines block walking in from behind', 'stops y <= -8', `y=${f(p.y)}`, p.y <= -8 + 0.01);
pod.api.rigs.chair.target = 1; for (let i = 0; i < 400; i++) pod.api.update(0.05); cy1 = cOb().y1;
p = walk([38.5, 138], [0, -1], 400); ok('full recline blocks the pathway', `stays y >= ${f(cy1 + 7.5)}`, `y=${f(p.y)}`, p.y >= cy1 + 7.5);
pod.api.rigs.chair.target = 0; for (let i = 0; i < 400; i++) pod.api.update(0.05);
pod.api.rigs.glass1.target = 1; for (let i = 0; i < 100; i++) pod.api.update(0.05);
p = walk([38.5, 215], [0, -1], 500); ok('closed glass blocks the entrance', 'stays y >= 150', `y=${f(p.y)}`, p.y >= 150);
for (const r of rows) console.log(r.join(' | '));
const bad = rows.filter((r) => r[0] === 'XX ').length; console.log(bad ? `${bad} CHECK(S) FAILED` : 'ALL CHECKS PASSED');
process.exit(bad ? 1 : 0);
