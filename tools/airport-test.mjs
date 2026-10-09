import { pathToFileURL } from 'node:url'; import path from 'node:path'; import { register } from 'node:module';
const here = path.dirname(new URL(import.meta.url).pathname);
const ctx = new Proxy({}, { get: (t, k) => (k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(spec, c, next) {
  if (spec === 'three') return { url: 'file://${here}/../js/vendor/three.module.js', shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: 'file://${here}/../js/vendor/addons/' + spec.slice(13), shortCircuit: true };
  return next(spec, c); }`), import.meta.url);
const THREE = await import(pathToFileURL(path.join(here, '../js/vendor/three.module.js')).href);
const { buildAirport, HALL } = await import(pathToFileURL(path.join(here, '../js/airport.js')).href);
const a = buildAirport();
let meshes = 0, inst = 0, tris = 0; a.group.traverse((o) => { if (o.isMesh) { meshes++; const g = o.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); if (o.isInstancedMesh) inst++; } });
console.log('airport meshes (draw calls):', meshes, ' instanced:', inst, ' triangles ~', Math.round(tris));
console.log('obstacles:', a.obstacles.length, JSON.stringify(a.obstacles.reduce((m, o) => (m[o.tag] = (m[o.tag] || 0) + 1, m), {})));
// nothing may overlap the pod (x 0..90, y 0..144) or the 30" walking approach in front of it
const pod = { x0: -10, x1: 100, y0: -10, y1: 160 }; const hit = a.obstacles.filter((o) => !['wall', 'glass'].includes(o.tag) && o.x0 < pod.x1 && o.x1 > pod.x0 && o.y0 < pod.y1 && o.y1 > pod.y0);
console.log('obstacles overlapping the pod:', hit.length);
const near = a.obstacles.filter((o) => !['wall', 'glass'].includes(o.tag) && o.x0 < 300 && o.x1 > -150 && o.y0 < 400 && o.y1 > -150); console.log('obstacles within 150-300" of the pod:', near.map((o) => o.tag + '@' + o.x0 + ',' + o.y0));
const bad = a.obstacles.filter((o) => !['wall','glass'].includes(o.tag) && (o.x0 < HALL.x0 || o.x1 > HALL.x1 || o.y0 < HALL.y0 || o.y1 > HALL.y1)); console.log('obstacles outside the hall:', bad.length);
const cam = { position: { y: 100 } }; a.update(cam); const lo = a.ceilingG.visible; cam.position.y = 700; a.update(cam); console.log('ceiling visible at eye height:', lo, ' hidden when camera is above the hall:', !a.ceilingG.visible);
process.exit(hit.length || bad.length || !lo || a.ceilingG.visible ? 1 : 0);
