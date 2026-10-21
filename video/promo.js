// Deterministic promo renderer: window.renderAt(t) draws the frame for time t (seconds); render.py captures every frame.
import * as THREE from 'three';
import { buildPod, planToWorld } from '../js/pod.js';
import { createStage, addGround } from '../js/stage.js';
import { buildAirport } from '../js/airport.js';
import { createFx } from '../js/fx.js';
import { fontsReady } from '../js/ready.js';

await fontsReady;
await Promise.all(['700 40px "DM Sans"', 'italic 400 40px "Instrument Serif"', '500 20px "DM Mono"'].map((f) => document.fonts.load(f)));
const canvas = document.getElementById('c');
const { renderer, scene, sun, hemi } = createStage(canvas);
renderer.setPixelRatio(1);
const pod = buildPod(); scene.add(pod.root);
addGround(scene, pod.M.ground).visible = false;
const camera = new THREE.PerspectiveCamera(44, 16 / 9, 1, 20000);
const W = (x, y, z) => planToWorld(x, y, z);
const center = W(45, 72, 25);

const airport = buildAirport(); scene.add(airport.group);
scene.fog = new THREE.Fog(0xcfc9bc, 1300, 6000);
const fillA = new THREE.DirectionalLight(0xffe6cc, 1.15), fillB = new THREE.DirectionalLight(0xdfe8f2, 0.55);
fillA.position.set(420, 140, -300); fillB.position.set(-420, 160, 200); scene.add(fillA, fillB);
try {
  const pm = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(), holder = new THREE.Group();
  holder.position.copy(center).multiplyScalar(-1);
  envScene.add(holder, new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6), new THREE.AmbientLight(0xffffff, 0.8));
  scene.remove(airport.group); holder.add(airport.group); airport.ceilingG.visible = true;
  const env = pm.fromScene(envScene, 0.02, 1, 20000).texture;
  holder.remove(airport.group); scene.add(airport.group);
  scene.environment = env; scene.environmentIntensity = 0.75;
} catch (e) { console.warn('reflections unavailable', e); try { scene.add(airport.group); } catch (e2) { /* already there */ } }
sun.position.set(70, 430, -90); sun.intensity = 1.7; sun.color.set(0xfff0dc); hemi.intensity = 0.45; renderer.toneMappingExposure = 1.08;
const fx = new URLSearchParams(location.search).has('nofx') ? null : createFx(renderer, scene, camera);

// ---------------------------------------------------------------- timeline
const DUR = 64;
const R = pod.api.rigs;
// rig keyframes: [time, value]; linear between keys (each rig then applies its own easing)
const K = {
  glass1: [[0, 0], [4.6, 0], [5.8, 1], [8.4, 1], [9.4, 0]],
  glass2: [[0, 0], [4.3, 0], [5.5, 1], [8.1, 1], [9.1, 0]],
  chair: [[0, 0.45], [33.6, 0.45], [34.8, 0], [37.0, 0], [38.4, 0.45], [42.3, 0.45], [44.8, 1], [46.4, 1], [47.7, 0]],
  legext: [[0, 0], [38.6, 0], [40.0, 1], [41.5, 1], [42.3, 0]],
  desk: [[0, 0], [48.4, 0], [50.4, 1], [51.2, 1], [52.6, 0]],
  premium: [[0, 0], [52.9, 0], [54.1, 1], [57.5, 1], [57.7, 0]],
  tv: [[0, 0], [55.2, 0], [56.6, 1], [57.5, 1], [57.8, 0]],
  roof: [[0, 0], [58.6, 0], [60.3, 1]],
};
const key = (ks, t) => { if (t <= ks[0][0]) return ks[0][1]; for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) { const [a, va] = ks[i - 1], [b, vb] = ks[i]; return va + (vb - va) * (t - a) / (b - a); } return ks.at(-1)[1]; };
const ease = (x) => x * x * (3 - 2 * x);

// short dips through cream at the scene changes
const CUTS = [9.4, 12.6, 15.6, 18.6, 21.6, 25.4, 28.1, 30.8, 33.4, 47.7, 52.6, 57.6];
const cutaway = () => false;
// camera shots in plan inches: {t0, t1, a: [pos, look], b: [pos, look], f: [fov, fov]}
const SHOTS = [
  { t0: 0, t1: 3.0, a: [[170, 350, 100], [38, 130, 50]], b: [[140, 338, 96], [38, 130, 50]], f: [44, 44] },
  { t0: 3.0, t1: 9.4, a: [[150, 330, 95], [38, 130, 52]], b: [[-30, 300, 88], [40, 125, 52]], f: [44, 44] },
  { t0: 9.4, t1: 12.6, a: [[-120, 260, 90], [0, 110, 55]], b: [[-190, 110, 82], [0, 72, 45]], f: [46, 46] },
  { t0: 12.6, t1: 15.6, a: [[165, -125, 75], [76, 0, 55]], b: [[110, -140, 78], [72, 0, 55]], f: [46, 46] },
  { t0: 15.6, t1: 18.6, a: [[45, -150, 80], [55, 0, 55]], b: [[62, -142, 82], [50, 0, 55]], f: [46, 46] },
  { t0: 18.6, t1: 21.6, a: [[-20, -130, 75], [23, 0, 55]], b: [[8, -122, 75], [28, 0, 55]], f: [46, 46] },
  { t0: 21.6, t1: 25.4, a: [[38.5, 270, 72], [39, 100, 48]], b: [[38.5, 156, 64], [39.5, 82, 44]], f: [44, 44] },
  { t0: 25.4, t1: 28.1, a: [[38.5, 112, 62], [9.5, 95, 40]], b: [[38.5, 112, 62], [9.5, 90, 40]], f: [50, 50] },
  { t0: 28.1, t1: 30.8, a: [[34, 96, 50], [9.5, 62, 27]], b: [[30, 92, 46], [9.5, 60, 26]], f: [50, 50] },
  { t0: 30.8, t1: 33.4, a: [[48, 110, 62], [73.5, 86, 28]], b: [[50, 110, 62], [73.5, 82, 28]], f: [50, 50] },
  { t0: 33.4, t1: 47.7, a: [[32, 160, 56], [40, 94, 30]], b: [[47, 160, 62], [40, 94, 30]], f: [50, 50] },
  { t0: 47.7, t1: 52.6, a: [[48, 156, 58], [40, 92, 36]], b: [[34, 152, 54], [40, 92, 36]], f: [50, 50] },
  { t0: 52.6, t1: 57.6, a: [[-12, 200, 82], [77, 122, 50]], b: [[40, 190, 74], [40, 114, 64]], f: [36, 40] },
  { t0: 57.6, t1: 64.0, a: [[175, 300, 230], [42, 72, 70]], b: [[110, 345, 190], [42, 80, 70]], f: [40, 40] },
];
const CAPS = [
  [4.0, 8.8, 'Smart glass', 'Two glass layers slide closed for privacy.'],
  [9.8, 12.3, 'Side wall', 'A full-height ad screen on the left wall.'],
  [12.9, 15.4, 'Snack vending', 'Five rows and a drop bay for your purchase.'],
  [15.9, 18.4, 'Touch screen', 'An interactive screen for ads and content.'],
  [18.9, 21.4, 'Cold vending', 'Cold drinks and snacks, open to the inside too.'],
  [22.0, 25.2, 'Entrance', 'A 30\u2033 entrance, warm wood and soft light.'],
  [25.7, 27.9, 'Pillows & blankets', 'Fifteen packets, released from the app.'],
  [28.4, 30.6, 'Minibar', 'A weight-sensor shelf with 36 items.'],
  [31.1, 33.2, 'Smart trash', 'Four rotating cans with a no-touch opening.'],
  [33.8, 37.0, 'Massage chair', 'Sit upright to read, work or wait.'],
  [37.8, 41.6, 'Leg extension', 'Legs stretch out, 83\u2033 end to end.'],
  [42.4, 46.4, 'Zero gravity', 'Lay all the way back into zero gravity.'],
  [48.4, 52.3, 'Pull-out desks', 'A desk from each armrest for laptop or lunch.'],
  [52.9, 54.9, 'Premium storage', 'A full-height locker for your suitcase.'],
  [55.2, 57.3, 'Entertainment', 'Drop-down TV, mood lighting.'],
  [58.2, 61.0, 'Safety', 'The roof opens as a built-in fire vent.'],
];
const fade = (t, a, b, f = 0.4) => Math.max(0, Math.min(1, Math.min((t - a) / f, (b - t) / f)));
const $ = (id) => document.getElementById(id);

window.DUR = DUR;
window.renderAt = (t) => {
  for (const n in K) { const r = R[n]; r.t = r.target = key(K[n], t); }
  for (const n in K) R[n].apply(ease(R[n].t));
  pod.api.setRoof(!cutaway(t));
  const s = SHOTS.find((x) => t >= x.t0 && t < x.t1) || SHOTS.at(-1);
  const k = Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0))), e = 0.5 * k + 0.5 * ease(k);
  const lerp3 = (a, b) => a.map((v, i) => v + (b[i] - v) * e);
  camera.position.copy(W(...lerp3(s.a[0], s.b[0])));
  camera.lookAt(W(...lerp3(s.a[1], s.b[1])));
  const fv = s.f[0] + (s.f[1] - s.f[0]) * e; if (Math.abs(fv - camera.fov) > 0.01) { camera.fov = fv; camera.updateProjectionMatrix(); }
  airport.group.visible = !(t >= 25.6 && t < 52.6);      // the hall is out of sight in the interior shots: skip drawing it
  airport.update(camera);
  if (fx) fx.render(); else renderer.render(scene, camera);
  // overlays
  const cap = CAPS.find((c) => t >= c[0] && t <= c[1]);
  $('cap').style.opacity = cap ? fade(t, cap[0], cap[1]) : 0;
  if (cap) { $('capE').textContent = cap[2]; $('capL').textContent = cap[3]; }
  $('dip').style.opacity = Math.max(0, ...CUTS.map((c) => 1 - Math.abs(t - c) / 0.25));
  $('intro').style.opacity = t < 2.6 ? 1 : Math.max(0, 1 - (t - 2.6) / 0.5);
  $('outro').style.opacity = t > 61.2 ? Math.min(1, (t - 61.2) / 0.6) : 0;   // card eases in over the final pull-back
};
function size(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (fx) fx.setSize(w, h); }
size(innerWidth, innerHeight);
addEventListener('resize', () => size(innerWidth, innerHeight));
window.renderAt(0);
document.title = 'ready';
window.__list = () => {
  const out = [];
  pod.root.traverse((o) => { if (!o.isMesh) return; const b = new THREE.Box3().setFromObject(o); if (b.min.y > 60) out.push(`${o.name || o.parent?.name || '?'} | y ${b.min.y.toFixed(0)}..${b.max.y.toFixed(0)} | x ${b.min.x.toFixed(0)}..${b.max.x.toFixed(0)}`); });
  return out.slice(0, 80).join('\n');
};
window.__noshadow = () => { renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) { [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); } }); };
window.__grab = (t) => { window.renderAt(t); return canvas.toDataURL('image/png').length; };
window.__hideAirport = (v) => { airport.group.visible = v; };
