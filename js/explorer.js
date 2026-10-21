import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPod, planToWorld, groundZ } from './pod.js';
import { createStage, addGround, webglOK, makeTimer } from './stage.js';
import { step as walkStep } from './walk.js';
import { buildAirport } from './airport.js';
import { createFx } from './fx.js';
import { fontsReady } from './ready.js';
import { addLightmaps } from './lightmaps.js';
import { createGovernor } from './perf.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
if (!webglOK()) { $('#nogl').hidden = false; throw new Error('WebGL not available'); }

await fontsReady;                                           // so text drawn on the 3D screens uses the site fonts
const canvas = $('#c');
const { renderer, scene, sun, hemi, fit, mobile } = createStage(canvas);
const pod = buildPod();
scene.add(pod.root);
const ground = addGround(scene, pod.M.ground);
const camera = new THREE.PerspectiveCamera(50, 1, 1, 20000);

// ---------------------------------------------------------------- environment: airport terminal (or the plain pavers)
const airport = buildAirport();
scene.add(airport.group);
// baked soft shadows (hall floor, cabin surfaces, chair) and LED light pools, from Blender; loads in the background, optional
const lightmaps = await addLightmaps({ pod: pod.pod, roof: pod.parts.roof, hall: airport.plan, chair: pod.parts.chair.children.find((c) => c.name === 'chair.slide') });
const plainFog = scene.fog, airportFog = new THREE.Fog(0xcfc9bc, 1300, 6000);
// soft low fill lights stand in for light bouncing off the hall's floor and walls (no shadows), so vertical faces are not left black
const fillA = new THREE.DirectionalLight(0xffe6cc, 1.15), fillB = new THREE.DirectionalLight(0xdfe8f2, 0.55);
fillA.position.set(420, 140, -300); fillB.position.set(-420, 160, 200); scene.add(fillA, fillB);
const plainLight = { p: sun.position.clone(), i: sun.intensity, c: sun.color.clone(), h: hemi.intensity, x: renderer.toneMappingExposure };
let envOn = true, airportEnv = null;
const roomEnv = scene.environment;
function setEnv(on) {
  envOn = on; airport.group.visible = on; ground.visible = !on; scene.fog = on ? airportFog : plainFog;
  scene.environment = on && airportEnv ? airportEnv : roomEnv; scene.environmentIntensity = on && airportEnv ? 0.75 : 0.6;
  fillA.visible = fillB.visible = on;
  if (on) { sun.position.set(70, 430, -90); sun.intensity = 1.7; sun.color.set(0xfff0dc); hemi.intensity = 0.45; renderer.toneMappingExposure = 1.08; }   // overhead hall lighting, not the sun through the ceiling
  else { sun.position.copy(plainLight.p); sun.intensity = plainLight.i; sun.color.copy(plainLight.c); hemi.intensity = plainLight.h; renderer.toneMappingExposure = plainLight.x; }
}
const touch = matchMedia('(pointer: coarse)').matches;
const ease = (t) => t * t * (3 - 2 * t);
const W = (x, y, z) => planToWorld(x, y, z);

// ---------------------------------------------------------------- orbit
const center = W(45, 72, 25);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(center);
controls.enableDamping = true; controls.minDistance = 60; controls.maxDistance = 1100; controls.maxPolarAngle = Math.PI * 0.495;
camera.position.copy(center).add(new THREE.Vector3(250, 210, -330));
controls.update();

// reflections: capture the terminal once from the pod's centre, so glossy surfaces (chair shell, glass, steel) reflect the real hall
try {
  const pm = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(), holder = new THREE.Group();
  holder.position.copy(center).multiplyScalar(-1);
  envScene.add(holder, new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6), new THREE.AmbientLight(0xffffff, 0.8));
  scene.remove(airport.group); holder.add(airport.group); airport.ceilingG.visible = true;
  airportEnv = pm.fromScene(envScene, 0.02, 1, 20000).texture;
  holder.remove(airport.group); scene.add(airport.group);
} catch (e) { console.warn('terminal reflections unavailable', e); try { scene.add(airport.group); } catch (e2) { /* already there */ } }
setEnv(true);

// ---------------------------------------------------------------- UI helpers
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
const HINTS = {
  orbit: 'Drag to orbit - scroll or pinch to zoom',
  walk: touch ? 'Left stick to move - drag the right side to look' : 'WASD / arrows to move - drag to look - Shift to run - Esc to leave',
  tour: 'Guided tour - Pause, Next or Stop below',
};

// ---------------------------------------------------------------- walking
const walker = { x: 38.5, y: 215, yaw: Math.PI, pitch: 0, z: -10, eye: 62 };
const keys = new Set();
const joy = { x: 0, y: 0 };
let mode = 'orbit';
function placeWalker(x, y, yaw) { Object.assign(walker, { x, y, yaw, pitch: 0, z: groundZ(x, y) }); }
function updateWalker(dt) {
  const k = (n) => (keys.has(n) ? 1 : 0);
  let f = k('w') + k('arrowup') - k('s') - k('arrowdown') + joy.y;
  let r = k('d') + k('arrowright') - k('a') - k('arrowleft') + joy.x;
  walker.yaw += (k('q') - k('e')) * 1.6 * dt;
  const len = Math.hypot(f, r); if (len > 1) { f /= len; r /= len; }
  const sp = 62 * (keys.has('shift') ? 1.9 : 1) * dt;
  const dx = (-Math.sin(walker.yaw) * f + Math.cos(walker.yaw) * r) * sp;
  const dy = (Math.cos(walker.yaw) * f + Math.sin(walker.yaw) * r) * sp;
  walkStep(walker, dx, dy, 8, pod.obstacles().concat(envOn ? airport.obstacles : []));
  walker.x = Math.max(-1200, Math.min(1300, walker.x)); walker.y = Math.max(-1200, Math.min(1300, walker.y));
  walker.z += (groundZ(walker.x, walker.y) - walker.z) * Math.min(1, dt * 8);
  camera.position.copy(W(walker.x, walker.y, walker.z + walker.eye));
  camera.rotation.set(walker.pitch, walker.yaw, 0, 'YXZ');
}
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (mode === 'walk') {
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    keys.add(k);
    if (k === 'escape') setMode('orbit');
  } else if (mode === 'tour' && k === 'escape') stopTour();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

let lookId = null, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'walk') return;
  lookId = e.pointerId; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (mode !== 'walk' || e.pointerId !== lookId) return;
  walker.yaw -= (e.clientX - lx) * 0.0042; walker.pitch = Math.max(-1.2, Math.min(1.2, walker.pitch - (e.clientY - ly) * 0.0042));
  lx = e.clientX; ly = e.clientY;
});
const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
canvas.addEventListener('pointerup', endLook); canvas.addEventListener('pointercancel', endLook);

// virtual joystick (touch)
const stick = $('#stick'), knob = stick.querySelector('i');
let stickId = null;
const stickMove = (e) => {
  const b = stick.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy), m = 48;
  if (d > m) { dx *= m / d; dy *= m / d; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`; joy.x = dx / m; joy.y = -dy / m;
};
stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); e.stopPropagation(); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
const stickEnd = (e) => { if (e.pointerId !== stickId) return; stickId = null; joy.x = joy.y = 0; knob.style.transform = ''; };
stick.addEventListener('pointerup', stickEnd); stick.addEventListener('pointercancel', stickEnd);

// ---------------------------------------------------------------- flights (fly-to + guided tours)
class Flight {
  constructor(steps, { onDone } = {}) {
    this.steps = steps.map((s) => ({ ...s, p: W(...s.pos), l: W(...s.look) }));
    this.onDone = onDone; this.i = 0; this.t = 0; this.phase = 'move'; this.paused = false; this.done = false;
    this.pos = camera.position.clone();
    this.look = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(150).add(camera.position);
    if (mode === 'orbit') this.look.copy(controls.target);
    this.fromPos = this.pos.clone(); this.fromLook = this.look.clone();
  }
  skip() { this.i++; this.phase = 'move'; this.t = 0; this.fromPos.copy(this.pos); this.fromLook.copy(this.look); if (this.i >= this.steps.length) this.finish(); else hideCaption(); }
  finish() { this.done = true; this.onDone && this.onDone(this); }
  update(dt) {
    if (this.done) return;
    if (!this.paused) this.t += dt;
    const s = this.steps[this.i];
    if (this.phase === 'move') {
      const k = ease(Math.min(1, this.t / s.move));
      this.pos.lerpVectors(this.fromPos, s.p, k); this.look.lerpVectors(this.fromLook, s.l, k);
      if (this.t >= s.move) { this.phase = 'dwell'; this.t = 0; this.fromPos.copy(s.p); this.fromLook.copy(s.l); if (s.title) showCaption(s.title, s.text); }
    } else if (this.t >= (s.dwell || 0)) { this.skip(); if (this.done) return; }
    camera.position.copy(this.pos); camera.lookAt(this.look);
  }
}
let flight = null;

const GO = {
  front: { pos: [38.5, 300, 95], look: [38.5, 144, 45] },
  back: { pos: [45, -175, 85], look: [45, 0, 50] },
  left: { pos: [-195, 72, 75], look: [0, 72, 45] },
  right: { pos: [285, 72, 75], look: [90, 72, 45] },
  cabin: { pos: [38.5, 215, 78], look: [38.5, 100, 42] },
  top: { pos: [45, 55, 600], look: [45, 72, 0] },
};
function flyTo(key) {
  const g = GO[key]; if (!g) return;
  setMode('orbit', true);
  controls.enabled = false;
  flight = new Flight([{ pos: g.pos, look: g.look, move: 1.8, dwell: 0 }], {
    onDone: () => { controls.target.copy(W(...g.look)); controls.enabled = true; controls.update(); flight = null; },
  });
}

const TOURS = {
  outside: [
    { pos: [38.5, 330, 80], look: [38.5, 144, 50], move: 3, dwell: 3.4, title: 'The entrance', text: 'A 30″ pathway into the pod. Premium storage sits on the right, and the front is closed to the roof by glass and sage panels.' },
    { pos: [100, 190, 100], look: [62, 144, 82], move: 4, dwell: 3.2, title: 'The sign panel', text: 'The TOLPODS sign sits on the outermost layer of the front, over a solid panel above the right-hand glass.' },
    { pos: [160, -120, 75], look: [76, 0, 55], move: 5, dwell: 3.4, title: 'Snack vending (12)', text: '14″ × 48″ × 92″. Five rows of spiral coils, a slot code and price under every shelf, and a lit pickup bay with a hinged flap.' },
    { pos: [45, -150, 80], look: [55, 0, 55], move: 4, dwell: 3.4, title: 'Touch screen (13) and cold storage (11)', text: 'An interactive screen for ads and content, with refrigerated stock behind it.' },
    { pos: [-20, -130, 75], look: [23, 0, 55], move: 4, dwell: 3.4, title: 'Refrigerated vending (14)', text: '24″ × 48″ × 92″. Cold drinks and snacks in tidy rows, with coin, card and bill payment. It also opens to the inside of the pod.' },
    { pos: [45, -120, 30], look: [45, 0, 14], move: 4, dwell: 3, title: 'Pickup bays', text: 'Each machine has a lit pickup bay with a smoked flap that swings open.' },
    { pos: [-120, 30, 50], look: [0, 24, 36], move: 5, dwell: 3.4, title: 'Snack machine (left wall)', text: '40″ × 72″ × 13″ with a smart lock you open from the app, beside the ad screen.' },
    { pos: [-195, 72, 75], look: [0, 72, 45], move: 5, dwell: 3.4, title: 'Ad screen', text: 'The left wall carries a regular TV for ads.' },
    { pos: [210, 30, 50], look: [90, 24, 36], move: 6, dwell: 3.4, title: 'Refrigerated machine (right wall)', text: '40″ × 72″ × 13″ with a lock option. Cold drinks and fresh items.' },
    { pos: [-110, 230, 85], look: [30, 144, 50], move: 4, dwell: 2.4, title: 'Back to the entrance', text: 'That is the public side of TOLPODS. Try the inside tour next.' },
  ],
  inside: [
    { pos: [38.5, 190, 66], look: [38.5, 140, 52], move: 2.5, dwell: 2.4, title: 'Stepping in', text: 'The ramp leads to a 30″ wide entrance. Two optional glass layers can close it for privacy.' },
    { pos: [38.5, 132, 62], look: [40, 112, 48], move: 4, dwell: 2.8, title: 'The pathway', text: 'The entrance end is open floor. The TV rail runs overhead.' },
    { pos: [38.5, 112, 62], look: [39.5, 78, 36], move: 3.5, dwell: 3, title: 'The massage chair (1)', text: 'Sit at normal height, or use the recline control to lay it back from upright, through the 110° pose of the design sheet, to full zero-gravity recline. The leg extension adds 10″ (83″ overall).' },
    { pos: [38.5, 124, 58], look: [9.5, 121, 36], move: 2.5, dwell: 3, title: 'Pillows & blankets (8)', text: 'A floor-standing unit at the entrance end: fifteen packets in three divisions, released one at a time from the app.' },
    { pos: [38.5, 124, 62], look: [9.5, 121, 73], move: 2.2, dwell: 2.6, title: 'Info screen', text: 'A slim wall screen above the pillows shows your pod timer and your boarding gate.' },
    { pos: [38.5, 110, 62], look: [9.5, 86, 34], move: 2.5, dwell: 3, title: 'Weight-sensor minibar (9)', text: 'Next to the pillows: a smart shelf with 36 items, and cleaning supplies below.' },
    { pos: [38.5, 110, 62], look: [9.5, 86, 52], move: 2.2, dwell: 2.8, title: 'Charging panel', text: 'Above the minibar: four USB-C ports, two USB-A, a universal outlet and a wireless pad shelf.' },
    { pos: [38.5, 96, 62], look: [9.5, 60, 56], move: 3, dwell: 3, title: 'Coats & bags', text: 'Three brass hooks and a shelf with a wireless charging puck, in the bay by the back wall.' },
    { pos: [48, 106, 62], look: [80, 84, 62], move: 3, dwell: 3.4, title: 'Snack minibar', text: 'Open weight-sensor shelves behind a sliding glass door with an app lock, with a chilled drinks compartment below. Try the door in the Pod tab.' },
    { pos: [48, 110, 62], look: [73.5, 84, 28], move: 2.5, dwell: 3, title: 'Smart trash (10)', text: 'Four rotating 10″ cans with compactors and a no-touch opening.' },
    { pos: [50, 110, 62], look: [75, 108, 50], move: 2.5, dwell: 3, title: 'Premium storage', text: 'A full-height locker for a large suitcase. Try opening it from the Pod tab.' },
  ],
};
function startTour(name) {
  if (name === 'inside') { pod.api.set('tv', 0); pod.api.set('glass1', 0); pod.api.set('glass2', 0); }
  setMode('tour');
  flight = new Flight(TOURS[name], { onDone: () => { stopTour(); toast('Tour finished'); } });
  $('#capPause').textContent = 'Pause';
}
function stopTour() { flight = null; hideCaption(); setMode('orbit'); }
function showCaption(t, x) { $('#capTitle').textContent = t; $('#capText').textContent = x; $('#caption').hidden = false; }
function hideCaption() { $('#caption').hidden = true; }
$('#capPause').addEventListener('click', () => { if (!flight) return; flight.paused = !flight.paused; $('#capPause').textContent = flight.paused ? 'Resume' : 'Pause'; });
$('#capNext').addEventListener('click', () => { if (flight) flight.skip(); });
$('#capStop').addEventListener('click', stopTour);

// ---------------------------------------------------------------- modes
function setMode(m, quiet) {
  const prev = mode;
  mode = m === 'walk-in' || m === 'walk-out' ? 'walk' : m;
  if (prev === 'tour' && mode !== 'tour') { flight = null; hideCaption(); }
  controls.enabled = mode === 'orbit';
  stick.style.display = mode === 'walk' && touch ? 'block' : 'none';
  $('#hint').textContent = HINTS[mode];
  $$('[data-mode]').forEach((b) => b.classList.toggle('on', (b.dataset.mode === 'orbit' && mode === 'orbit') || (mode === 'walk' && b.dataset.mode === m)));
  if (m === 'walk-in' || m === 'walk-out') {
    pod.api.set('tv', 0);
    if (m === 'walk-in') placeWalker(38.5, 138, Math.PI); else placeWalker(38.5, 215, Math.PI);
    keys.clear(); joy.x = joy.y = 0;
    if (!quiet) toast(m === 'walk-in' ? 'TV flipped up so you can walk in' : 'Walk up the ramp into the pod');
  } else if (mode === 'orbit' && (prev === 'walk' || prev === 'tour')) {
    const d = camera.getWorldDirection(new THREE.Vector3());
    controls.target.copy(camera.position).addScaledVector(d, 120);
    camera.position.addScaledVector(d, -260).y += 90; controls.update();
  }
}
$$('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$$('[data-go]').forEach((b) => b.addEventListener('click', () => flyTo(b.dataset.go)));
$$('[data-tour]').forEach((b) => b.addEventListener('click', () => startTour(b.dataset.tour)));

// ---------------------------------------------------------------- sidebar (open on desktop, drawer on phones)
const narrow = matchMedia('(max-width: 800px)');
const dockToggle = $('#dockToggle');
function setDock(open) {
  document.body.classList.toggle('dock-closed', !open);
  dockToggle.setAttribute('aria-expanded', String(open));
}
setDock(!narrow.matches);
dockToggle.addEventListener('click', () => setDock(document.body.classList.contains('dock-closed')));
if (narrow.addEventListener) narrow.addEventListener('change', (e) => setDock(!e.matches));
// on a phone, close the drawer after picking a view / go-to / tour so the 3D view is visible
$$('[data-mode],[data-go],[data-tour]').forEach((b) => b.addEventListener('click', () => { if (narrow.matches) setDock(false); }));

// ---------------------------------------------------------------- sidebar tabs
function showTab(name) {
  $$('[data-tab]').forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
}
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
const setState = (b, word) => { b.dataset.state = word; const c = b.querySelector('.st'); if (c) c.textContent = word; };

// ---------------------------------------------------------------- pod controls
const STATE_WORDS = { premium: ['Closed', 'Open'], snack: ['Locked', 'Open'], shade: ['Closed', 'Open'], tilt: ['Flat', 'Tilted'], slide: ['Closed', 'Open'], desk: ['Stowed', 'Out'], legext: ['Retracted', 'Out'], tv: ['Stowed', 'Watching'] };
$$('[data-rig]').forEach((b) => b.addEventListener('click', () => { const msg = pod.api.toggle(b.dataset.rig); if (msg) toast(msg); }));
$('#ventBtn').addEventListener('click', () => { pod.api.fireVent(pod.api.ventOpen() ? 0 : 1); });          // fire vent: shade + tilt open together
function refreshButtons() {
  $$('[data-rig]').forEach((b) => {
    const n = b.dataset.rig, on = pod.api.get(n) > 0.5;
    b.classList.toggle('on', on); setState(b, STATE_WORDS[n][on ? 1 : 0]);
  });
  const vent = pod.api.ventOpen();
  $('#ventBtn').classList.toggle('on', vent); setState($('#ventBtn'), vent ? 'Open' : 'Closed');
  const c = pod.api.state('chair');
  const e = pod.api.get('legext');
  $$('[data-chair]').forEach((b) => b.classList.toggle('on', Math.abs(+b.dataset.chair - c) < 0.08 && (b.dataset.ext ? e > 0.5 : e < 0.5)));
  if (!sliding) slider.value = Math.round(c * 100);
}
let gstate = 0; const GLASS_WORDS = ['Open', 'Layer 1', 'Layers 1+2'];
setState($('#glassBtn'), GLASS_WORDS[0]);
$('#glassBtn').addEventListener('click', () => {
  gstate = (gstate + 1) % 3;
  pod.api.set('glass1', gstate >= 1 ? 1 : 0); pod.api.set('glass2', gstate >= 2 ? 1 : 0);
  setState($('#glassBtn'), GLASS_WORDS[gstate]);
  $('#glassBtn').classList.toggle('on', gstate > 0);
});
let extWait = 0;
$$('[data-chair]').forEach((b) => b.addEventListener('click', () => {      // three poses: Upright, Zero gravity, Leg extension (110 deg with the leg extension out)
  clearInterval(extWait);
  if (!b.dataset.ext && pod.api.get('legext') > 0) pod.api.set('legext', 0);
  const msg = pod.api.set('chair', +b.dataset.chair); if (msg) toast(msg);
  if (b.dataset.ext) { let n = 0; extWait = setInterval(() => { if (pod.api.state('chair') <= 0.55 || ++n > 150) { clearInterval(extWait); const m = pod.api.set('legext', 1); if (m) toast(m); } }, 80); }
}));
const slider = $('#recline'); let sliding = false;
slider.addEventListener('pointerdown', () => { sliding = true; });
addEventListener('pointerup', () => { sliding = false; });
slider.addEventListener('input', () => { const msg = pod.api.scrub('chair', slider.value / 100); if (msg) { toast(msg); slider.value = Math.round(pod.api.state('chair') * 100); } });

const toggler = (id, fn) => { const b = $(id); b.addEventListener('click', () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); fn(on); }); };
toggler('#roofBtn', (on) => pod.api.setRoof(on));
toggler('#envBtn', setEnv);
let fx = null, fxOn = false, fxTried = false;           // glow post-processing is opt-in (Scene tab > Glow effects), the same on every device
const fxBtn = $('#fxBtn');
fxBtn.classList.toggle('on', fxOn);
fxBtn.addEventListener('click', () => {
  if (fxTried && !fx) { toast('Glow effects are not supported on this device'); return; }
  fxOn = !fxOn; fxBtn.classList.toggle('on', fxOn);
});
function renderFrame() {
  if (fxOn && !fxTried) { fxTried = true; fx = createFx(renderer, scene, camera); if (!fx) { fxOn = false; fxBtn.classList.remove('on'); } }
  if (fxOn && fx) { try { fx.render(); return; } catch (e) { console.warn('post-processing failed, using plain rendering', e); fxOn = false; fx = null; fxBtn.classList.remove('on'); } }
  renderer.render(scene, camera);
}
toggler('#lightBtn', (on) => { pod.api.setInteriorLights(on); lightmaps.setGlow(on); });
toggler('#personBtn', (on) => pod.api.setPerson(on));

// ---------------------------------------------------------------- performance governor + quality switch
const gov = createGovernor({ renderer, scene, sun, pod, fit, camera, mobile, onLevel: (lv, announce) => {
  if (lv === 1 && fxOn) { fxOn = false; fxBtn.classList.remove('on'); }
  if (announce) toast('Graphics eased down for smoother movement');
} });

// ---------------------------------------------------------------- loop
new ResizeObserver(() => { fit(camera); if (fx) fx.setSize(canvas.clientWidth, canvas.clientHeight); }).observe($('#stage'));
fit(camera);
setMode('orbit', true);
const clock = makeTimer(); let uiAcc = 1;
(function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta(), dt = Math.min(0.05, raw);
  gov.sample(raw);
  pod.api.update(dt);
  if (flight) flight.update(dt);
  else if (mode === 'orbit') controls.update();
  else if (mode === 'walk') updateWalker(dt);
  if (envOn) airport.update(camera);
  if ((uiAcc += raw) > 0.12) { uiAcc = 0; refreshButtons(); }          // the sidebar only needs ~8 updates a second
  renderFrame();
})();
