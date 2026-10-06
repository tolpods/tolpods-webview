import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPod, planToWorld, groundZ } from './pod.js';
import { createStage, addGround, webglOK, makeTimer } from './stage.js';
import { step as walkStep } from './walk.js';
import { buildAirport } from './airport.js';
import { markerVisible } from './occlude.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
if (!webglOK()) { $('#nogl').hidden = false; throw new Error('WebGL not available'); }

const canvas = $('#c');
const { renderer, scene, fit, mobile } = createStage(canvas);
const pod = buildPod();
scene.add(pod.root);
const ground = addGround(scene, pod.M.ground);
const camera = new THREE.PerspectiveCamera(50, 1, 1, 20000);

// ---------------------------------------------------------------- environment: airport terminal (or the plain pavers)
const airport = buildAirport();
scene.add(airport.group);
const plainFog = scene.fog, airportFog = new THREE.Fog(0xd9d5cc, 1100, 5200);
let envOn = true;
function setEnv(on) { envOn = on; airport.group.visible = on; ground.visible = !on; scene.fog = on ? airportFog : plainFog; }
setEnv(true);
let roofOn = true;
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

// ---------------------------------------------------------------- UI helpers
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
const HINTS = {
  orbit: 'Drag to orbit - scroll or pinch to zoom - tap a number for details',
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
  right: { pos: [285, 92, 75], look: [90, 92, 45] },
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
    { pos: [38.5, 330, 80], look: [38.5, 144, 50], move: 3, dwell: 3.4, title: 'The entrance', text: 'A 30″ pathway into the pod. Free storage and the coat station are on the left, the fridge block and premium storage on the right.' },
    { pos: [285, 92, 75], look: [90, 92, 45], move: 5, dwell: 3.4, title: 'Items for sale (17)', text: 'The right wall is a 6.5″ display wall for items for sale, visible from outside.' },
    { pos: [160, -120, 75], look: [76, 0, 55], move: 5, dwell: 3.4, title: 'Snack vending (12)', text: '15″ × 48″ × 92″. Five rows plus a 20″ drop bay for your purchase.' },
    { pos: [45, -150, 80], look: [55, 0, 55], move: 4, dwell: 3.4, title: 'Touch screen (13) and cold storage (11)', text: 'An interactive screen for ads and content, with refrigerated stock behind it.' },
    { pos: [-20, -130, 75], look: [23, 0, 55], move: 4, dwell: 3.4, title: 'Refrigerated vending (14)', text: '39″ × 48″ × 92″. Cold drinks and snacks, with complimentary and paid items. It also opens to the inside of the pod.' },
    { pos: [-195, 72, 75], look: [0, 72, 45], move: 5, dwell: 3.4, title: 'Ad screen and free items', text: 'The left wall carries a regular TV for ads (16) and a free-items shelf (15).' },
    { pos: [-110, 230, 85], look: [30, 144, 50], move: 4, dwell: 2.4, title: 'Back to the entrance', text: 'That is the public side of TOLPOD. Try the inside tour next.' },
  ],
  inside: [
    { pos: [38.5, 190, 66], look: [38.5, 140, 52], move: 2.5, dwell: 2.4, title: 'Stepping in', text: 'The ramp leads to a 30″ wide entrance. Two optional glass layers can close it for privacy.' },
    { pos: [38.5, 130, 62], look: [40, 112, 48], move: 4, dwell: 2.8, title: 'The pathway', text: '28″ long, between the coat station and the fridge block. The TV rail runs overhead.' },
    { pos: [38.5, 127, 62], look: [19, 132, 50], move: 2, dwell: 2.8, title: 'Coat station (4)', text: '8″ × 28″ × 60″ with hangers, hooks and a full-length mirror.' },
    { pos: [38.5, 127, 62], look: [62, 130, 58], move: 2, dwell: 3, title: 'Fridge, microwave, surprise box (5)', text: 'Mini fridge, microwave, a 12.8″ gift compartment for charity donations, and a tall cabinet.' },
    { pos: [38.5, 112, 62], look: [39.5, 78, 36], move: 3.5, dwell: 3, title: 'The massage chair (1)', text: 'Sit at normal height, or use the recline control to flatten it into a 75″ bed.' },
    { pos: [38.5, 112, 62], look: [9.5, 95, 40], move: 2.5, dwell: 3, title: 'Pillows & blankets (8)', text: 'Fifteen packets in three divisions, released one at a time from the app.' },
    { pos: [38.5, 110, 62], look: [9.5, 61, 30], move: 2.5, dwell: 3, title: 'Weight-sensor minibar (9)', text: 'A smart shelf with 36 items, and cleaning supplies below.' },
    { pos: [48, 110, 62], look: [73.5, 84, 28], move: 2.5, dwell: 3, title: 'Smart trash (10)', text: 'Four rotating 10″ cans with compactors and a no-touch opening.' },
    { pos: [50, 110, 62], look: [75, 108, 50], move: 2.5, dwell: 3, title: 'Premium storage', text: 'A full-height locker for a large suitcase. Try opening it from the Pod controls.' },
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

// ---------------------------------------------------------------- pod controls
const STATE_WORDS = { premium: ['Closed', 'Open'], free: ['Closed', 'Open'], desk: ['Stowed', 'Out'], tv: ['Stowed', 'Watching'] };
$$('[data-rig]').forEach((b) => b.addEventListener('click', () => { const msg = pod.api.toggle(b.dataset.rig); if (msg) toast(msg); }));
function refreshButtons() {
  $$('[data-rig]').forEach((b) => {
    const n = b.dataset.rig, on = pod.api.get(n) > 0.5;
    b.classList.toggle('on', on); b.textContent = `${b.dataset.label}: ${STATE_WORDS[n][on ? 1 : 0]}`;
  });
  const c = pod.api.state('chair');
  $$('[data-chair]').forEach((b) => b.classList.toggle('on', (b.dataset.chair === '1') === (c > 0.5)));
  if (!sliding) slider.value = Math.round(c * 100);
}
let gstate = 0;
$('#glassBtn').addEventListener('click', () => {
  gstate = (gstate + 1) % 3;
  pod.api.set('glass1', gstate >= 1 ? 1 : 0); pod.api.set('glass2', gstate >= 2 ? 1 : 0);
  $('#glassBtn').textContent = ['Glass: open', 'Glass: layer 1', 'Glass: layers 1+2'][gstate];
  $('#glassBtn').classList.toggle('on', gstate > 0);
});
$$('[data-chair]').forEach((b) => b.addEventListener('click', () => { const msg = pod.api.set('chair', +b.dataset.chair); if (msg) toast(msg); }));
const slider = $('#recline'); let sliding = false;
slider.addEventListener('pointerdown', () => { sliding = true; });
addEventListener('pointerup', () => { sliding = false; });
slider.addEventListener('input', () => { const msg = pod.api.scrub('chair', slider.value / 100); if (msg) { toast(msg); slider.value = 0; } });

const toggler = (id, fn) => { const b = $(id); b.addEventListener('click', () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); fn(on); }); };
toggler('#roofBtn', (on) => { roofOn = on; pod.api.setRoof(on); });
toggler('#envBtn', setEnv);
toggler('#lightBtn', (on) => pod.api.setInteriorLights(on));
toggler('#personBtn', (on) => pod.api.setPerson(on));
let labels = true;
toggler('#labelBtn', (on) => { labels = on; $('#markers').style.display = on ? '' : 'none'; });

// ---------------------------------------------------------------- hotspots
const markerEls = pod.hotspots.map((h) => {
  const el = document.createElement('button');
  el.className = 'marker'; el.textContent = h.id; el.title = h.title; el.setAttribute('aria-label', h.title);
  el.addEventListener('click', () => showInfo(h));
  $('#markers').appendChild(el);
  return { h, el, p: W(...h.pos), plan: { x: h.pos[0], y: h.pos[1], z: h.pos[2] } };
});
function showInfo(h) {
  $('#infoTitle').textContent = h.title;
  $('#infoDims').innerHTML = h.dims.map((d) => `<li>${d}</li>`).join('');
  $('#infoText').textContent = h.text;
  $('#info').hidden = false;
}
$('#infoX').addEventListener('click', () => { $('#info').hidden = true; });
const tmp = new THREE.Vector3();
function updateMarkers() {
  if (!labels) return;
  const w = canvas.clientWidth, h = canvas.clientHeight, limit = mode === 'walk' ? 230 : 1300;
  const cam = { x: camera.position.x, y: -camera.position.z, z: camera.position.y };     // camera in plan inches
  for (const m of markerEls) {
    tmp.copy(m.p); const dist = tmp.distanceTo(camera.position);
    tmp.project(camera);
    const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 && dist < limit && markerVisible(cam, m.plan, roofOn);   // hidden behind walls / roof
    m.el.style.display = vis ? '' : 'none';
    if (vis) { m.el.style.left = ((tmp.x + 1) / 2) * w + 'px'; m.el.style.top = ((1 - tmp.y) / 2) * h + 'px'; m.el.style.opacity = String(Math.max(0.35, Math.min(1, 1.4 - dist / limit))); }
  }
}

// ---------------------------------------------------------------- loop
new ResizeObserver(() => fit(camera)).observe($('#stage'));
fit(camera);
setMode('orbit', true);
const clock = makeTimer();
(function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  pod.api.update(dt);
  if (flight) flight.update(dt);
  else if (mode === 'orbit') controls.update();
  else if (mode === 'walk') updateWalker(dt);
  if (envOn) airport.update(camera);
  refreshButtons();
  updateMarkers();
  renderer.render(scene, camera);
})();
