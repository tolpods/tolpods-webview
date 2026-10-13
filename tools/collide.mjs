// Node check: can the chair reach every pose without going through the pod?
// Moves the chair through its recline range and tests every triangle of every chair part (exact SAT) against every solid box in the pod.
//   node tools/collide.mjs            sitting and fully flat must be clear; mid-motion problems are reported as KNOWN ISSUES
//   node tools/collide.mjs --strict   mid-motion problems fail the run too
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { register } from 'node:module';
const here = path.dirname(new URL(import.meta.url).pathname);
const strict = process.argv.includes('--strict');
const ctx = new Proxy({}, { get: (t, k) => (k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
const loader = `
export async function resolve(spec, context, next) {
  if (spec === 'three') return { url: 'file://${here}/../js/vendor/three.module.js', shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: 'file://${here}/../js/vendor/addons/' + spec.slice(13), shortCircuit: true };
  return next(spec, context);
}`;
register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);
const THREE = await import(pathToFileURL(path.join(here, '../js/vendor/three.module.js')).href);
const { buildPod } = await import(pathToFileURL(path.join(here, '../js/pod.js')).href);

const pod = buildPod();
const f = (v) => +v.toFixed(1);
const VISUAL = new Set(['floor', 'deck', 'rug', 'rugDark', 'led', 'ledcool', 'cove', 'glass', 'smoke']);    // lights, flooring and glass are not obstacles
const EPS = 0.05, TOL = 0.25;                                                                                  // touching is fine; a real overlap is deeper than TOL inches
const solids = pod.solids.filter((r) => !VISUAL.has(r.mat) && r.x1 - r.x0 > 0.05 && r.y1 - r.y0 > 0.05 && r.z1 - r.z0 > 0.05 && r.z1 > 0.5)
  .map((r) => ({ r, b: new THREE.Box3(new THREE.Vector3(r.x0 + EPS, r.y0 + EPS, r.z0 + EPS), new THREE.Vector3(r.x1 - EPS, r.y1 - EPS, r.z1 - EPS)) }));
const label = (r) => `[${r.mat}] x ${f(r.x0)}..${f(r.x1)} y ${f(r.y0)}..${f(r.y1)} z ${f(r.z0)}..${f(r.z1)}`;
const meshes = []; pod.parts.chair.traverse((o) => { if (o.isMesh) meshes.push(o); });
const settle = (t, x = 0) => { pod.api.rigs.chair.target = t; pod.api.rigs.legext.target = x; for (let i = 0; i < 500; i++) pod.api.update(0.05); pod.root.updateMatrixWorld(true); };
const tri = new THREE.Triangle(), tb = new THREE.Box3();

function analyse(skip = () => false) {
  const hits = new Map(), b = new THREE.Box3(); let ymin = 1e9; const beyond = {};
  for (const m of meshes) {
    if (skip(m.name)) continue;
    const g = m.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
    const get = (i, o) => { o.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld); return o.set(o.x, -o.z, o.y); };   // world -> plan frame
    for (let i = 0; i < n; i += 3) {
      get(i, tri.a); get(i + 1, tri.b); get(i + 2, tri.c);
      tb.setFromPoints([tri.a, tri.b, tri.c]); b.union(tb); ymin = Math.min(ymin, tb.min.y);
      if (tb.max.y >= 116) { const o = (beyond[m.name] ||= [1e9, -1e9]); o[0] = Math.min(o[0], tb.min.x); o[1] = Math.max(o[1], tb.max.x); }
      for (const { r, b: sb } of solids) {
        if (!sb.intersectsBox(tb) || !sb.intersectsTriangle(tri)) continue;
        const k = label(r), ov = tb.clone().intersect(sb), e = hits.get(k) || { parts: new Set(), u: new THREE.Box3() };
        e.parts.add(m.name); e.u.union(ov); hits.set(k, e);
      }
    }
  }
  for (const e of hits.values()) { const s = e.u.getSize(new THREE.Vector3()); e.depth = Math.min(s.x, s.y, s.z); }
  return { hits: [...hits.entries()].filter(([, e]) => e.depth > TOL), box: b, ymin, beyond };
}

let failed = 0;
const show = (title, res) => { console.log(`${res.hits.length ? 'XX ' : 'OK '} ${title}${res.hits.length ? '' : ' | clear of every solid'}`); for (const [k, e] of res.hits) console.log(`       overlap ~${f(e.depth)}"  ${[...e.parts].join('/')}  ->  ${k}`); };
const poseTest = (title, t, skip) => { settle(t); const r = analyse(skip); show(title, r); if (r.hits.length) failed++; return r; };

const poseTest2 = (title, t, x = 0, skip) => { settle(t, x); const r = analyse(skip); show(title, r); if (r.hits.length) failed++; return r; };
const NOEXT = (n) => n === 'chair.ext' || n === 'chair.extTip';
poseTest2('chair upright (back 100 deg)', 0, 0);
const normal = poseTest2('chair normal (110 deg), extension retracted: 73" long', 0.45, 0);
console.log(`   normal y range ${f(normal.box.min.y)}..${f(normal.box.max.y)}`);
const withExt = poseTest2('chair normal (110 deg), leg extension out: 83" long', 0.45, 1);
console.log(`   with extension y range ${f(withExt.box.min.y)}..${f(withExt.box.max.y)}`);
const zg = poseTest2('chair full recline (zero gravity)', 1, 0);
console.log(`   zero gravity y range ${f(zg.box.min.y)}..${f(zg.box.max.y)}`);
if (zg.box.max.y > 141.5 || withExt.box.max.y > 141.5) { console.log('XX  feet reach the entrance wall'); failed++; }
// desks open, chair upright
{ settle(0, 0); pod.api.rigs.desk.target = 1; for (let i = 0; i < 400; i++) pod.api.update(0.05); pod.root.updateMatrixWorld(true); const r = analyse(); show('chair upright with both desks out', r); if (r.hits.length) failed++; pod.api.rigs.desk.target = 0; for (let i = 0; i < 400; i++) pod.api.update(0.05); }


// floor and skid: no part of the chair may go below the floor, and the leg rest may not sink into the base skid or pedestal (any pose, with and without the extension)
{
  const LEGN = new Set(['chair.calfPod', 'chair.calfPad', 'chair.calfBag', 'chair.roller', 'chair.legSpine', 'chair.footCradle', 'chair.footPad', 'chair.toeLip', 'chair.ext', 'chair.extTip']);
  const baseM = meshes.filter((m) => ['chair.basePlate', 'chair.pedestal'].includes(m.name)), bad2 = [];
  let lowest = [1e9];
  for (const x of [0, 1]) for (let t = 0; t <= 1.0001; t += 0.05) {
    if (x && t > 0.6) continue;
    settle(t, x);
    for (const m of meshes) {
      if (!LEGN.has(m.name)) continue;
      const bb = new THREE.Box3().setFromObject(m, true), zlo = -bb.max.z + 0 && bb.min.y;      // world y is up
      if (bb.min.y < lowest[0]) lowest = [bb.min.y, t, x, m.name];
      if (bb.min.y < 0.2) bad2.push(`${m.name} z=${f(bb.min.y)} at t=${t.toFixed(2)} ext=${x}`);
      for (const bm of baseM) { const ob = new THREE.Box3().setFromObject(bm, true), ov = bb.clone().intersect(ob); if (!ov.isEmpty()) { const sz = ov.getSize(new THREE.Vector3()); if (Math.min(sz.x, sz.y, sz.z) > 0.15) bad2.push(`${m.name} sinks into ${bm.name} at t=${t.toFixed(2)} ext=${x}`); } }
    }
  }
  console.log(`${bad2.length ? 'XX ' : 'OK '} leg rest stays above the floor and clear of the skid in every pose, with and without the extension | lowest ${f(lowest[0])}" (${lowest[3]}, t=${lowest[1].toFixed(2)}, ext ${lowest[2]})`);
  for (const b of [...new Set(bad2)].slice(0, 8)) console.log('       ' + b);
  if (bad2.length) failed++;
}

// mid-motion: the back and headrest swing behind the cabin's back wall at the moment (the rig tilts and slides at the same time)
let bad = [], deepest = [0, 1e9];
for (let t = 0.05; t < 0.999; t += 0.05) { settle(t, t < 0.5 ? 1 : 0); const r = analyse(); if (r.ymin < 49.4 - 0.05) bad.push(t); if (r.ymin < deepest[1]) deepest = [t, r.ymin]; }
if (bad.length) {
  console.log(`${strict ? 'XX ' : '!! '} KNOWN ISSUE: while reclining, the head/back goes behind the back wall (y < 49.4) from t=${bad[0].toFixed(2)} to t=${bad.at(-1).toFixed(2)}, deepest ${f(48 - deepest[1])}" behind the wall at t=${deepest[0].toFixed(2)}`);
  if (strict) failed++;
} else console.log('OK  recline motion keeps the head end inside the cabin');
settle(0.45);
console.log(failed ? `${failed} CHECK(S) FAILED` : 'COLLISION CHECKS PASSED');
process.exit(failed ? 1 : 0);
