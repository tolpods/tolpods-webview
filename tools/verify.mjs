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
const { SPEC: S } = await import(pathToFileURL(path.join(here, '../js/spec.js')).href);

const pod = buildPod();
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

// ---- chair, sitting
const chairBox = (pred) => { pod.root.updateMatrixWorld(true); const b = new THREE.Box3(); pod.root.traverse((o) => { if (o.isMesh && pred(o.name)) b.union(new THREE.Box3().setFromObject(o)); }); return planBox(b); };
let hb = chairBox((n) => n === 'chair.headrest'); ok('headrest thick / wide / long', '18 / 34 / 9', `${len(hb.y)} / ${len(hb.x)} / ${len(hb.z)}`, len(hb.y) === 18 && len(hb.x) === 34 && len(hb.z) === 9);
let sc = chairBox((n) => n === 'chair.seatCushion'); ok('seat long / wide', '25 / 37', `${len(sc.y)} / ${len(sc.x)}`, len(sc.y) === 25 && len(sc.x) === 37);
let ar = chairBox((n) => n === 'chair.ArmMid'); ok('middle armrest long', '12', `${len(ar.y)}`, len(ar.y) === 12);
ar = chairBox((n) => n === 'chair.ArmL'); ok('side armrest long / wide', '15 / 4.5', `${len(ar.y)} / ${len(ar.x)}`, len(ar.y) === 15 && len(ar.x) === 4.5);
const legSit = chairBox((n) => n === 'chair.calfPod' || n === 'chair.footCradle');
const cupCount = find('chair.cup').length; ok('cupholder parts (9 x ring+well)', '18', `${cupCount}`, cupCount === 18);
const wholeChair = chairBox((n) => n.startsWith('chair.') && n !== 'chair.deskPlate' && n !== 'chair.deskMagnet' && n !== 'chair.remote' && n !== 'chair.basePlate' && n !== 'chair.trim');
ok('chair overall width (with wings)', '46', `${len(wholeChair.x)}`, len(wholeChair.x) === 46);

// ---- flat bed
pod.api.rigs.chair.target = 1; for (let i = 0; i < 400; i++) pod.api.update(0.05);
const bed = chairBox((n) => ['chair.headrest', 'chair.backPad', 'chair.seatCushion', 'chair.calfPod', 'chair.footCradle', 'chair.toeLip'].includes(n));
const bedExt = chairBox((n) => ['chair.headrest', 'chair.backPad', 'chair.seatCushion', 'chair.calfPod', 'chair.footCradle', 'chair.toeLip', 'chair.ext'].includes(n));
ok('flat bed length (head -> leg rest end)', '75', `${len(bed.y)}`, Math.abs(len(bed.y) - 75) < 1.0);
ok('flat bed with leg extension', '85', `${len(bedExt.y)}`, Math.abs(len(bedExt.y) - 85) < 1.0);
console.log('   bed y range', bedExt.y, ' head end must stay inside the cabin (y >= 48.8):', bedExt.y[0] >= 48.8, ' feet end < 144:', bedExt.y[1] < 144);
const topZ = bed.z[1]; ok('bed top height = seat top', '23', `${topZ}`, Math.abs(topZ - 23) < 1.2);
pod.api.rigs.chair.target = 0; for (let i = 0; i < 400; i++) pod.api.update(0.05);

// ---- desks
const dp = find('chair.deskPlate');
const upd = () => pod.root.updateMatrixWorld(true);
pod.api.rigs.desk.target = 1; for (let i = 0; i < 400; i++) pod.api.update(0.05);
upd(); const db = new THREE.Box3(); dp.forEach((o) => db.union(new THREE.Box3().setFromObject(o))); const dpb = planBox(db);
ok('joined desk span (across) x (along)', '43 x 10.75', `${len(dpb.x)} x ${len(dpb.y)}`, Math.abs(len(dpb.x) - 43.5) < 0.6 && Math.abs(len(dpb.y) - 10.75) < 0.1);
console.log('   desk height z', dpb.z);
pod.api.rigs.desk.target = 0; for (let i = 0; i < 400; i++) pod.api.update(0.05);

// ---- other units (static boxes are merged; check overall extents of known groups through raycast-free bounding of the whole pod)
const whole = planBox(bbox(pod.pod)); ok('pod footprint (incl. ramp/plants)', 'x 0..90', `${whole.x}`, whole.x[0] <= 0 && whole.x[1] >= 90);
const roof = planBox(bbox(find('roof.slab')[0])); ok('roof top height', '94', `${roof.z[1]}`, roof.z[1] === 94);

// ---- doors
for (const n of ['free', 'premium']) { pod.api.rigs[n].target = 1; for (let i = 0; i < 100; i++) pod.api.update(0.05); const g = n === 'free' ? pod.parts.doorFree : pod.parts.doorPremium; console.log('   door', n, 'rotation z deg', f(THREE.MathUtils.radToDeg(g.rotation.z))); pod.api.rigs[n].target = 0; for (let i = 0; i < 100; i++) pod.api.update(0.05); }
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
ok('vending header 14 (36 x 4 = 9:1)', '1536 x 171', has(1536, 171) ? '1536 x 171' : 'missing', has(1536, 171));
ok('vending header 12 (12 x 4 = 3:1)', '1536 x 512', has(1536, 512) ? '1536 x 512' : 'missing', has(1536, 512));
ok('keypad screen (10 x 6)', '512 x 307', has(512, 307) ? '512 x 307' : 'missing', has(512, 307) && Math.abs(512 / 307 - 10 / 6) < 0.01);
ok('brand bar (24 x 6 = 4:1)', '1024 x 256', has(1024, 256) ? '1024 x 256' : 'missing', has(1024, 256));
// ---- walking through the real pod (same collision code the explorer uses)
const { step: wstep } = await import(pathToFileURL(path.join(here, '../js/walk.js')).href);
const walk = (start, dir, n, speed = 1) => { const p = { x: start[0], y: start[1] }; for (let i = 0; i < n; i++) wstep(p, dir[0] * speed, dir[1] * speed, 8, pod.api.set('tv', 0) || pod.obstacles()); return p; };
let p = walk([38.5, 215], [0, -1], 500);
ok('walk in through the entrance (stops at the chair)', 'reaches y ~112', `y=${f(p.y)}`, p.y > 108 && p.y < 116);
p = walk([10, 215], [0, -1], 500); ok('cannot walk through the wall beside the entrance', 'stays y >= 152', `y=${f(p.y)}`, p.y >= 152 - 0.01);
p = walk([38.5, 125], [-1, 0], 300); ok('left wall beside the pathway (coat station)', 'stops x >= 31.5', `x=${f(p.x)}`, p.x >= 31.5 - 0.01);
p = walk([45, -120], [0, 1], 500); ok('back machines block walking in from behind', 'stops y <= -8', `y=${f(p.y)}`, p.y <= -8 + 0.01);
pod.api.rigs.chair.target = 1; for (let i = 0; i < 400; i++) pod.api.update(0.05);
p = walk([38.5, 138], [0, -1], 400); ok('flat bed blocks the pathway', 'stays y >= 143', `y=${f(p.y)}`, p.y >= 135.5 + 8 - 0.5);
pod.api.rigs.chair.target = 0; for (let i = 0; i < 400; i++) pod.api.update(0.05);
pod.api.rigs.glass1.target = 1; for (let i = 0; i < 100; i++) pod.api.update(0.05);
p = walk([38.5, 215], [0, -1], 500); ok('closed glass blocks the entrance', 'stays y >= 150', `y=${f(p.y)}`, p.y >= 150);
for (const r of rows) console.log(r.join(' | '));
const bad = rows.filter((r) => r[0] === 'XX ').length; console.log(bad ? `${bad} CHECK(S) FAILED` : 'ALL CHECKS PASSED');
process.exit(bad ? 1 : 0);
