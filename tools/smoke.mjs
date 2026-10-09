// Smoke test: runs js/explorer.js and js/landing.js in Node against a fake DOM + fake renderer, then drives the UI.
//   node tools/smoke.mjs
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { register } from 'node:module';
const here = path.dirname(new URL(import.meta.url).pathname), J = path.join(here, '../js');

// ---------- fake DOM
const handlers = new Map(), allEls = [];
function el(attrs = {}) {
  const cls = new Set();
  const e = {
    dataset: { ...attrs }, style: {}, hidden: false, textContent: '', innerHTML: '', value: '0', children: [],
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : f; on ? cls.add(c) : cls.delete(c); return on; } },
    handlers: {}, addEventListener(t, fn) { (this.handlers[t] ||= []).push(fn); },
    fire(t, ev = {}) { (this.handlers[t] || []).forEach((fn) => fn({ preventDefault() {}, stopPropagation() {}, pointerId: 1, clientX: 0, clientY: 0, ...ev })); },
    setAttribute() {}, appendChild(c) { this.children.push(c); }, remove() {}, setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false, removeEventListener() {},
    querySelector: () => el(), querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 120, height: 120 }),
    clientWidth: 1280, clientHeight: 720, parentElement: { clientWidth: 1280, clientHeight: 720 }, getContext: () => ctx, width: 0, height: 0,
    getRootNode() { return globalThis.document; }, ownerDocument: { addEventListener() {}, removeEventListener() {} }, observe() {}, contains: () => false,
  };
  allEls.push(e); return e;
}
const ctx = new Proxy({}, { get: (t, k) => (k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
const byId = {};
const page = process.argv[2] || 'explorer';
const ids = page === 'explorer'
  ? ['c', 'stage', 'toast', 'hint', 'caption', 'capTitle', 'capText', 'capPause', 'capNext', 'capStop', 'stick', 'dock', 'dockToggle', 'recline', 'glassBtn', 'roofBtn', 'lightBtn', 'personBtn', 'fxBtn', 'envBtn', 'nogl']
  : ['c', 'viewer', 'roofBtn', 'featureGrid'];
ids.forEach((i) => { byId[i] = el(); });
if (byId.stick) byId.stick.querySelector = () => el();
if (byId.recline) byId.recline.value = '0';
const groups = {
  '[data-mode]': ['orbit', 'walk-in', 'walk-out'].map((m) => el({ mode: m })),
  '[data-go]': ['front', 'back', 'left', 'top'].map((g) => el({ go: g })),
  '[data-tour]': ['inside', 'outside'].map((t) => el({ tour: t })),
  '[data-rig]': [['premium', 'Premium storage'], ['free', 'Free storage'], ['desk', 'Pull-out desks'], ['tv', 'TV']].map(([r, l]) => el({ rig: r, label: l })),
  '[data-chair]': ['0', '1'].map((c) => el({ chair: c })),
};
const select = (s) => (s.startsWith('#') ? byId[s.slice(1)] || el() : s === '.viewer-ui' || s === '.viewer-ui span' ? el() : el());
const win = new Map();
Object.assign(globalThis, {
  document: { body: el(), addEventListener() {}, removeEventListener() {}, createElement: (t) => (t === 'canvas' ? Object.assign(el(), { getContext: () => ctx }) : el()), getElementById: (i) => byId[i] || el(), querySelector: select, querySelectorAll: (s) => groups[s] || [], hidden: false },
  matchMedia: (q) => ({ matches: false }), innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener: (t, fn) => { if (!win.has(t)) win.set(t, []); win.get(t).push(fn); },
  ResizeObserver: class { observe() {} }, IntersectionObserver: class { observe() {} },
});
let fakeNow = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => fakeNow }, configurable: true, writable: true });
const raf = []; globalThis.requestAnimationFrame = (fn) => { raf.push(fn); return raf.length; };
const frames = (n) => { for (let i = 0; i < n; i++) { fakeNow += 1000 / 60; const f = raf.splice(0); f.forEach((fn) => fn(fakeNow)); } };   // 60 fps of fake time
const key = (type, k) => (win.get(type) || []).forEach((fn) => fn({ key: k, preventDefault() {} }));

// ---------- loader: bare imports + a fake stage (no WebGL in Node)
const stageStub = `import * as THREE from 'three';
export const isMobile = () => false; export const webglOK = () => true;
export function makeTimer() { let last = performance.now(); const start = last; return { getDelta() { const n = performance.now(), d = (n - last) / 1000; last = n; return d; }, get elapsedTime() { return (performance.now() - start) / 1000; } }; }
export function createStage() { const scene = new THREE.Scene(); const renderer = { render() { renderer.n = (renderer.n || 0) + 1; } }; const sun = new THREE.DirectionalLight(0xffffff, 1), hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.5); renderer.toneMappingExposure = 1; return { renderer, scene, sun, hemi, fit(c) { c.aspect = 16 / 9; c.updateProjectionMatrix(); }, mobile: false }; }
export function addGround(scene, m) { m.map.repeat.set(31, 31); return { visible: true }; }`;
const loader = `export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: 'file://${J}/vendor/three.module.js', shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: 'file://${J}/vendor/addons/' + spec.slice(13), shortCircuit: true };
  if (spec === './stage.js') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(stageStub)}), shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);

let errors = 0; const check = (name, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) errors++; };
process.on('uncaughtException', (e) => { console.log('FAIL uncaught:', e.stack); process.exit(1); });

if (page === 'landing') {
  await import(pathToFileURL(path.join(J, 'landing.js')).href);
  check('landing built features table', byId.featureGrid.innerHTML.includes('Massage chair'));
    frames(120);
  check('landing viewer marked ready', byId.viewer.classList.contains('ready'));
  byId.roofBtn.fire('click'); frames(3); check('roof button toggles label', byId.roofBtn.textContent === 'Hide roof');
  console.log(errors ? 'LANDING FAILED' : 'LANDING OK'); process.exit(errors ? 1 : 0);
}

await import(pathToFileURL(path.join(J, 'explorer.js')).href);
frames(5);
const btn = (grp, k, v) => groups[grp].find((b) => b.dataset[k] === v);
check('explorer started; hint set', byId.hint.textContent.includes('orbit'));
check('sidebar starts open', !document.body.classList.contains('dock-closed'));
byId.dockToggle.fire('click'); check('Controls button collapses the sidebar', document.body.classList.contains('dock-closed'));
byId.dockToggle.fire('click'); check('Controls button reopens it', !document.body.classList.contains('dock-closed'));
if (byId.envBtn) byId.envBtn.classList.add('on');          // the real page ships it as class="on"
byId.envBtn.fire('click'); check('Airport button toggles the environment off', !byId.envBtn.classList.contains('on')); byId.envBtn.fire('click'); check('...and back on', byId.envBtn.classList.contains('on'));
// rig buttons
for (const r of ['premium', 'free', 'desk', 'tv']) { btn('[data-rig]', 'rig', r).fire('click'); }
frames(200);
check('rig labels update', btn('[data-rig]', 'rig', 'premium').textContent === 'Premium storage: Open' && btn('[data-rig]', 'rig', 'desk').textContent === 'Pull-out desks: Out', btn('[data-rig]', 'rig', 'premium').textContent);
btn('[data-chair]', 'chair', '1').fire('click'); frames(3);
check('recline blocked while desks are out', byId.toast.textContent.includes('Return the chair') || byId.toast.textContent.includes('desks'), JSON.stringify(byId.toast.textContent));
btn('[data-rig]', 'rig', 'desk').fire('click'); frames(300);
btn('[data-chair]', 'chair', '1').fire('click'); frames(500);
check('chair reaches full recline', +byId.recline.value === 100, 'slider=' + byId.recline.value);
btn('[data-chair]', 'chair', '0').fire('click'); frames(500);
check('chair back to normal', +byId.recline.value === 0, 'slider=' + byId.recline.value);
byId.recline.value = '60'; byId.recline.fire('input'); frames(3);
check('slider scrubs the chair', true);
byId.recline.value = '0'; byId.recline.fire('input'); frames(3);
byId.glassBtn.fire('click'); byId.glassBtn.fire('click'); frames(100);
check('glass cycles to layers 1+2', byId.glassBtn.textContent === 'Glass: layers 1+2', byId.glassBtn.textContent);
byId.glassBtn.fire('click'); frames(100);
// walking
btn('[data-mode]', 'mode', 'walk-in').fire('click'); frames(3);
key('keydown', 'w'); frames(60); key('keyup', 'w');
check('walk mode hint', byId.hint.textContent.includes('WASD'));
for (let i = 0; i < 400; i++) { key('keydown', 'w'); frames(1); } key('keyup', 'w');
key('keydown', 'Escape'); frames(3);
check('Esc returns to orbit', byId.hint.textContent.includes('orbit'));
// tours
btn('[data-tour]', 'tour', 'inside').fire('click'); frames(3);
check('tour hint', byId.hint.textContent.includes('tour'));
for (let i = 0; i < 400; i++) frames(2);
check('inside tour showed a caption', byId.capTitle.textContent.length > 0, JSON.stringify(byId.capTitle.textContent));
byId.capStop.fire('click'); frames(3);
btn('[data-go]', 'go', 'back').fire('click'); frames(150);
check('fly-to finished, orbit hint', byId.hint.textContent.includes('orbit'));
frames(2);
check('glow effects fall back cleanly when the renderer cannot do them', !byId.fxBtn.classList.contains('on'));
btn('[data-tour]', 'tour', 'outside').fire('click');
frames(4000);                                   // ~66 s of fake time: the whole outside tour is ~53 s
check('outside tour ran to the end', byId.hint.textContent.includes('orbit'));
console.log(errors ? `${errors} SMOKE CHECK(S) FAILED` : 'EXPLORER OK'); process.exit(errors ? 1 : 0);
