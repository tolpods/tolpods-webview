// An airport terminal built in code around the pod: polished floor, columns, trusses and light strips overhead,
// hanging signs and flight boards, gate seating, planters, and a glass wall onto an apron with a parked jet.
// Plan frame (inches): x right, y toward the pod's entrance, z up. The pod stands at x 0..90, y 0..144.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, boxGeo, planeGeo, extrudeYZ } from './geo.js';

export const HALL = { x0: -1100, x1: 1250, y0: -1050, y1: 1250, H: 480, z0: -10 };
const CEIL = HALL.z0 + HALL.H;                     // 470
const W = HALL.x1 - HALL.x0, L = HALL.y1 - HALL.y0, CX = (HALL.x0 + HALL.x1) / 2, CY = (HALL.y0 + HALL.y1) / 2;

const rng = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function texOf(c, rep = [1, 1], srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function arrow(g, x, y, s, dir) {
  g.save(); g.translate(x, y); g.rotate({ r: 0, l: Math.PI, u: -Math.PI / 2, d: Math.PI / 2 }[dir]);
  g.beginPath(); g.moveTo(-s, -s * 0.18); g.lineTo(s * 0.2, -s * 0.18); g.lineTo(s * 0.2, -s * 0.5); g.lineTo(s, 0); g.lineTo(s * 0.2, s * 0.5); g.lineTo(s * 0.2, s * 0.18); g.lineTo(-s, s * 0.18);
  g.closePath(); g.fill(); g.restore();
}

// ---------------------------------------------------------------- textures
function floorCanvas() {                            // light terrazzo, 2 x 2 tiles of 48"
  const c = cnv(256, 256), g = c.getContext('2d'), r = rng(5);
  g.fillStyle = '#d6d1c7'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const v = 165 + Math.floor(r() * 75); g.fillStyle = `rgba(${v},${v - 4},${v - 12},0.5)`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  g.strokeStyle = 'rgba(122,116,106,0.8)'; g.lineWidth = 2; g.beginPath();
  g.moveTo(0, 0); g.lineTo(256, 0); g.moveTo(0, 0); g.lineTo(0, 256); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  return c;
}
function wallCanvas() {                             // warm plaster panels with a vertical joint
  const c = cnv(256, 256), g = c.getContext('2d'), r = rng(9);
  g.fillStyle = '#dcd8ce'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) { const v = 200 + Math.floor(r() * 40); g.fillStyle = `rgba(${v},${v - 3},${v - 10},0.35)`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  g.fillStyle = 'rgba(96,90,80,0.32)'; g.fillRect(0, 0, 2, 256);
  return c;
}
function asphaltCanvas() {
  const c = cnv(256, 256), g = c.getContext('2d'), r = rng(13);
  g.fillStyle = '#5a5b5d'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) { const v = 70 + Math.floor(r() * 50); g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  return c;
}
function skyCanvas() {
  const c = cnv(4, 512), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#5f8fcf'); gr.addColorStop(0.42, '#a9c6e6'); gr.addColorStop(0.5, '#e8e4d9'); gr.addColorStop(0.52, '#b9b6ac'); gr.addColorStop(1, '#8e8c86');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  return c;
}
function signCanvas(lines, { w = 1024, h = 256, bg = '#16191b', fg = '#ffffff', arrowDir = null, accent = '#f2c230' } = {}) {
  const c = cnv(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = accent; g.fillRect(0, 0, 14, h);
  g.fillStyle = fg; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = `600 ${Math.round(h * (lines.length > 1 ? 0.34 : 0.5))}px "DM Sans", Helvetica, Arial, sans-serif`;
  lines.forEach((t, i) => g.fillText(t, 60, h * (lines.length > 1 ? 0.34 + i * 0.36 : 0.5)));
  if (arrowDir) { g.fillStyle = accent; arrow(g, w - 110, h / 2, h * 0.32, arrowDir); }
  return c;
}
const FLIGHTS = [['09:40', 'LISBON', 'TP 214', 'B12', 'BOARDING'], ['09:55', 'OSLO', 'TP 508', 'A04', 'ON TIME'], ['10:10', 'MADRID', 'TP 331', 'B07', 'ON TIME'], ['10:25', 'DUBAI', 'TP 902', 'C21', 'DELAYED'],
  ['10:40', 'ROME', 'TP 117', 'A11', 'ON TIME'], ['10:55', 'TORONTO', 'TP 640', 'C03', 'ON TIME'], ['11:05', 'ISTANBUL', 'TP 775', 'B15', 'GATE OPEN'], ['11:30', 'SINGAPORE', 'TP 088', 'C18', 'ON TIME'],
  ['11:45', 'NAIROBI', 'TP 462', 'A09', 'ON TIME'], ['12:00', 'SYDNEY', 'TP 013', 'C24', 'ON TIME']];
function boardCanvas(title) {
  const w = 1024, h = 640, c = cnv(w, h), g = c.getContext('2d');
  g.fillStyle = '#0e1113'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f2c230'; g.font = 'bold 54px "DM Sans", Helvetica, Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText(title, 36, 52);
  g.fillStyle = '#7d8587'; g.font = '24px monospace';
  [['TIME', 36], ['DESTINATION', 170], ['FLIGHT', 520], ['GATE', 680], ['STATUS', 790]].forEach(([t, x]) => g.fillText(t, x, 112));
  FLIGHTS.forEach((f, i) => {
    const y = 160 + i * 46; if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(20, y - 22, w - 40, 44); }
    g.font = 'bold 30px monospace';
    g.fillStyle = '#ffffff'; g.fillText(f[0], 36, y); g.fillStyle = '#f2c230'; g.fillText(f[1], 170, y);
    g.fillStyle = '#ffffff'; g.fillText(f[2], 520, y); g.fillText(f[3], 680, y);
    g.fillStyle = f[4] === 'DELAYED' ? '#ff6b57' : f[4] === 'ON TIME' ? '#5fe08a' : '#f2c230'; g.fillText(f[4], 790, y);
  });
  return c;
}
function fuselageCanvas() {                         // white skin, blue cheat line, row of windows (u = 0.75 faces -x, the terminal)
  const w = 256, h = 1024, c = cnv(w, h), g = c.getContext('2d');
  g.fillStyle = '#f3f3f0'; g.fillRect(0, 0, w, h);
  for (const u of [0.25, 0.75]) {
    g.fillStyle = '#1f4f9a'; g.fillRect(w * (u - 0.07), 0, w * 0.14, h);
    g.fillStyle = '#10151b';
    for (let y = 150; y < 900; y += 26) g.fillRect(w * (u - 0.02), y, w * 0.04, 12);
  }
  return c;
}

// ---------------------------------------------------------------- the airplane (nose toward +y, wheels on z = 0)
function buildJet() {
  const jet = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ map: texOf(fuselageCanvas()), roughness: 0.35, metalness: 0.08 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf3f3f0, roughness: 0.4, metalness: 0.05 }), grey = new THREE.MeshStandardMaterial({ color: 0x70757a, roughness: 0.5, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.6 }), fin = new THREE.MeshStandardMaterial({ color: 0x1f4f9a, roughness: 0.4 });
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = false; jet.add(m); return m; };
  const Z = 100;                                                         // axis height
  add(new THREE.CylinderGeometry(76, 76, 760, 28), skin).position.set(0, 0, Z);                                   // fuselage (axis = plan y)
  add(new THREE.SphereGeometry(76, 28, 16).scale(1, 1.7, 1), white).position.set(0, 380, Z);                       // nose
  add(new THREE.CylinderGeometry(76, 16, 300, 28), white).position.set(0, -530, Z);                              // tail cone
  const planform = (pts, depth, z, mirror) => {                      // flat wing / stabiliser outline in (x, y), extruded up in z
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(mirror ? -x : x, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }); g.translate(0, 0, z); return g;
  };
  const wing = [[16, 70], [420, -140], [420, -200], [16, -50]], hs = [[10, -450], [150, -545], [150, -585], [10, -520]];
  for (const m of [false, true]) {
    const mk = (pts, d, z, mat) => add(planform(pts, d, z, m), mat);
    mk(wing, 10, 92, white); mk(hs, 7, 168, white);
    const e = m ? -1 : 1;
    add(new THREE.CylinderGeometry(32, 30, 120, 18), grey).position.set(e * 175, 20, 62);                         // engines
    add(new THREE.CylinderGeometry(24, 24, 6, 14), dark).position.set(e * 175, 82, 62);
    const gear = add(new THREE.CylinderGeometry(4, 4, 60, 8).rotateX(Math.PI / 2), grey); gear.position.set(e * 60, -30, 52);
    add(new THREE.CylinderGeometry(15, 15, 11, 14).rotateZ(Math.PI / 2), dark).position.set(e * 60, -30, 16);
  }
  add(extrudeYZ([[-440, 160], [-565, 160], [-625, 340], [-585, 345]], -6, 6, 0), fin);                           // tail fin
  add(new THREE.CylinderGeometry(4, 4, 60, 8).rotateX(Math.PI / 2), grey).position.set(0, 330, 62);
  add(new THREE.CylinderGeometry(13, 13, 10, 14).rotateZ(Math.PI / 2), dark).position.set(0, 330, 16);
  return jet;
}

// ---------------------------------------------------------------- the terminal
export function buildAirport() {
  const group = new THREE.Group(); group.name = 'airport';
  const plan = new THREE.Group(); plan.rotation.x = -Math.PI / 2; group.add(plan);                // same plan frame as the pod
  const ceilingG = new THREE.Group(); plan.add(ceilingG);
  const batch = new Batch(), ceilBatch = new Batch(), obstacles = [];
  const rand = rng(21);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    floor: std({ map: texOf(floorCanvas(), [W / 96, L / 96]), roughness: 0.26, metalness: 0, envMapIntensity: 0.75 }),
    inlay: std({ color: 0x8a847a, roughness: 0.3 }), tactile: std({ color: 0xe0b52c, roughness: 0.5 }),
    ceil: std({ color: 0xcbc7bd, roughness: 0.95 }), steel: std({ color: 0x6b6e72, roughness: 0.45, metalness: 0.8 }),
    concrete: std({ color: 0xe6e2d9, roughness: 0.8 }), base: std({ color: 0x4c4a46, roughness: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xeaf5ff, roughness: 0.03, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.2 }),
    mullion: std({ color: 0x2b2d30, roughness: 0.5, metalness: 0.6 }), lamp: new THREE.MeshBasicMaterial({ color: 0xfff3dc }),
    asphalt: std({ map: texOf(asphaltCanvas(), [60, 60]), roughness: 0.95 }), paint: std({ color: 0xe9c53c, roughness: 0.7 }),
    frame: std({ color: 0x1d1f21, roughness: 0.5 }), fabric: std({ color: 0x2d4a52, roughness: 0.9 }), seatFrame: std({ color: 0x8c9094, roughness: 0.4, metalness: 0.8 }),
    pot: std({ color: 0x3b3835, roughness: 0.7 }), leaf: std({ color: 0x2f6a30, roughness: 0.6 }), bridge: std({ color: 0xc9ccce, roughness: 0.4, metalness: 0.3 }),
  };
  const wallMat = (w, h) => { const m = std({ map: texOf(wallCanvas(), [w / 96, h / 96]), roughness: 0.85 }); return m; };
  const mesh = (geo, mat, parent = plan, shadow = false) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; };
  const box = (x, y, z, sx, sy, sz, mat, b = batch) => b.add(boxGeo(x, y, z, sx, sy, sz, mat), mat);
  const obst = (x0, x1, y0, y1, tag) => obstacles.push({ x0, x1, y0, y1, tag });

  // ---- floor, walkway inlays, apron outside
  const fl = mesh(new THREE.PlaneGeometry(W, L).translate(CX, CY, HALL.z0), M.floor); fl.name = 'airport-floor';
  for (const x of [-250, 340]) box(x - 12, HALL.y0, HALL.z0 + 0.05, 24, L, 0.1, M.inlay);
  box(HALL.x1 - 120, HALL.y0, HALL.z0 + 0.05, 6, L, 0.1, M.tactile);
  const apron = mesh(new THREE.CircleGeometry(8500, 48).translate(CX, CY, HALL.z0 - 3), M.asphalt); apron.receiveShadow = true;
  for (const x of [1500, 2750]) box(x - 3, -3000, HALL.z0 - 2.9, 6, 6000, 0.1, M.paint);
  box(1250, -3000, HALL.z0 - 2.9, 6000, 6, 0.1, M.paint);

  // ---- walls: three plaster walls, one glass wall onto the apron
  const wallH = HALL.H, wz = HALL.z0 + wallH / 2;
  mesh(planeGeo(W, wallH, '+y', CX, HALL.y0, wz), wallMat(W, wallH)); obst(HALL.x0 - 10, HALL.x1 + 10, HALL.y0 - 10, HALL.y0, 'wall');
  mesh(planeGeo(W, wallH, '-y', CX, HALL.y1, wz), wallMat(W, wallH)); obst(HALL.x0 - 10, HALL.x1 + 10, HALL.y1, HALL.y1 + 10, 'wall');
  mesh(planeGeo(L, wallH, '+x', HALL.x0, CY, wz), wallMat(L, wallH)); obst(HALL.x0 - 10, HALL.x0, HALL.y0 - 10, HALL.y1 + 10, 'wall');
  mesh(planeGeo(L, wallH, '-x', HALL.x1, CY, wz), M.glass); obst(HALL.x1, HALL.x1 + 10, HALL.y0 - 10, HALL.y1 + 10, 'glass');
  for (let y = HALL.y0; y <= HALL.y1 + 1; y += 100) box(HALL.x1 - 4, y - 2, HALL.z0, 3, 4, wallH, M.mullion);       // glazing mullions
  for (const z of [120, 300]) box(HALL.x1 - 4, HALL.y0, z, 3, L, 4, M.mullion);                                     // transoms
  for (let y = HALL.y0 + 50; y < HALL.y1; y += 400) box(HALL.x1 - 20, y - 14, HALL.z0, 24, 28, wallH, M.concrete);   // piers

  // ---- ceiling, light strips, trusses (hidden when the camera is above the roof of the hall)
  mesh(new THREE.PlaneGeometry(W, L).rotateX(Math.PI).translate(CX, CY, CEIL), M.ceil, ceilingG);
  for (let y = HALL.y0 + 50; y < HALL.y1; y += 300) box(HALL.x0, y - 4, CEIL - 30, W, 8, 22, M.steel, ceilBatch);
  for (let x = HALL.x0 + 100; x < HALL.x1; x += 400) box(x - 4, HALL.y0, CEIL - 30, 8, L, 22, M.steel, ceilBatch);
  const lampG = new THREE.BoxGeometry(24, 360, 3), lampMs = [];
  for (let x = HALL.x0 + 100; x < HALL.x1; x += 200) for (let y = HALL.y0 + 150; y < HALL.y1; y += 400) lampMs.push(new THREE.Matrix4().makeTranslation(x, y, CEIL - 2));
  const lamps = new THREE.InstancedMesh(lampG, M.lamp, lampMs.length); lampMs.forEach((m, i) => lamps.setMatrixAt(i, m)); ceilingG.add(lamps);

  // ---- columns (clear zone around the pod), base plinths
  const colMs = [], baseMs = [];
  for (const x of [-900, -500, -100, 300, 700, 1100]) for (const y of [-850, -450, -50, 350, 750, 1150]) {
    if (x > -250 && x < 450 && y > -250 && y < 550) continue;
    colMs.push(new THREE.Matrix4().makeTranslation(x, y, HALL.z0 + wallH / 2)); baseMs.push(new THREE.Matrix4().makeTranslation(x, y, HALL.z0 + 5));
    obst(x - 26, x + 26, y - 26, y + 26, 'column');
  }
  const cols = new THREE.InstancedMesh(new THREE.BoxGeometry(36, 36, wallH), M.concrete, colMs.length); colMs.forEach((m, i) => cols.setMatrixAt(i, m)); plan.add(cols);
  const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(46, 46, 10), M.base, baseMs.length); baseMs.forEach((m, i) => bases.setMatrixAt(i, m)); plan.add(bases);

  // ---- hanging signs and flight boards
  const hang = (cv, w, h, x, y, z, axis) => {
    const mat = new THREE.MeshBasicMaterial({ map: texOf(cv), toneMapped: false });
    const f = axis === 'x' ? ['+x', '-x'] : ['+y', '-y'];
    const off = (s) => (axis === 'x' ? [x + s * 1.3, y] : [x, y + s * 1.3]);
    mesh(planeGeo(w, h, f[0], off(1)[0], off(1)[1], z), mat); mesh(planeGeo(w, h, f[1], off(-1)[0], off(-1)[1], z), mat);
    const fw = axis === 'x' ? 2.4 : w, fd = axis === 'x' ? w : 2.4;
    box(x - fw / 2, y - fd / 2, z - h / 2, fw, fd, h, M.frame, ceilBatch);
    for (const k of [-0.36, 0.36]) box(x + (axis === 'x' ? 0 : k * w) - 0.5, y + (axis === 'x' ? k * w : 0) - 0.5, z + h / 2, 1, 1, CEIL - (z + h / 2), M.steel, ceilBatch);
  };
  hang(signCanvas(['TOLPOD', 'Private rest pods'], { arrowDir: 'd', accent: '#d9a95a' }), 150, 38, 45, 520, 330, 'y');
  hang(signCanvas(['DEPARTURES', 'Gates 1-24'], { arrowDir: 'r' }), 190, 48, 450, -250, 350, 'y');
  hang(signCanvas(['ARRIVALS', 'Baggage claim'], { arrowDir: 'l' }), 190, 48, -450, 900, 350, 'y');
  hang(signCanvas(['GATES 12-24'], { arrowDir: 'u' }), 150, 38, 800, 920, 340, 'x');
  hang(boardCanvas('DEPARTURES'), 140, 87, -100, 880, 300, 'y');
  hang(boardCanvas('DEPARTURES'), 140, 87, 900, 600, 300, 'x');
  const wb = new THREE.MeshBasicMaterial({ map: texOf(boardCanvas('DEPARTURES')), toneMapped: false });
  mesh(planeGeo(220, 137.5, '+x', HALL.x0 + 1, 100, 150), wb);
  const wm = new THREE.MeshBasicMaterial({ map: texOf(signCanvas(['Welcome', 'Make room for rest.'], { w: 1024, h: 256, bg: '#e9e5dd', fg: '#272622', accent: '#987347' })), toneMapped: false });
  mesh(planeGeo(520, 130, '+y', 100, HALL.y0 + 1, 260), wm);

  // ---- gate seating: back-to-back rows, instanced
  const seatGeo = (backX) => {
    const pad = new THREE.BoxGeometry(20, 22, 4).translate(0, 0, 19), back = new THREE.BoxGeometry(4, 22, 20).translate(backX, 0, 31);
    const leg = new THREE.BoxGeometry(4, 18, 17).translate(0, 0, 8.5);
    return { fabric: [pad, back], frame: [leg] };
  };
  const merge = (list) => mergeGeometries(list.map((g) => g.toNonIndexed()), false);
  const seatsA = [], seatsB = [];                                    // A: back on +x (faces -x), B: back on -x (faces +x)
  const cluster = (centers, y0, n) => {
    for (const cx of centers) {
      for (let i = 0; i < n; i++) { const y = y0 + 11 + i * 22; seatsA.push(new THREE.Matrix4().makeTranslation(cx - 12, y, HALL.z0)); seatsB.push(new THREE.Matrix4().makeTranslation(cx + 12, y, HALL.z0)); }
      obst(cx - 24, cx + 24, y0, y0 + n * 22, 'seats');
    }
  };
  cluster([620, 720, 820], -330, 7); cluster([-780, -680, -580], 490, 7);
  const gA = seatGeo(8), gB = seatGeo(-8);
  for (const [g, ms] of [[gA, seatsA], [gB, seatsB]]) {
    const f = new THREE.InstancedMesh(merge(g.fabric), M.fabric, ms.length), s = new THREE.InstancedMesh(merge(g.frame), M.seatFrame, ms.length);
    ms.forEach((m, i) => { f.setMatrixAt(i, m); s.setMatrixAt(i, m); }); plan.add(f, s);
  }

  // ---- planters
  const potMs = [], leafMs = [];
  for (const [x, y] of [[1190, -300], [1190, 300], [1190, 900], [-1050, -900], [-1050, 200], [-1050, 1150], [450, -990], [520, 1190], [-300, 1190]]) {
    potMs.push(new THREE.Matrix4().makeTranslation(x, y, HALL.z0 + 14));
    for (let k = 0; k < 4; k++) leafMs.push(new THREE.Matrix4().makeTranslation(x + (rand() - 0.5) * 22, y + (rand() - 0.5) * 22, HALL.z0 + 48 + k * 14));
    obst(x - 26, x + 26, y - 26, y + 26, 'planter');
  }
  const pots = new THREE.InstancedMesh(new THREE.CylinderGeometry(22, 18, 28, 16).rotateX(Math.PI / 2), M.pot, potMs.length);
  potMs.forEach((m, i) => pots.setMatrixAt(i, m)); plan.add(pots);
  const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(30, 12, 10), M.leaf, leafMs.length); leafMs.forEach((m, i) => leaves.setMatrixAt(i, m)); plan.add(leaves);

  // ---- outside: parked jet, boarding bridge, a second aircraft far away
  const jet = buildJet(); jet.position.set(2050, 150, HALL.z0); plan.add(jet);
  box(HALL.x1 - 2, 340, HALL.z0 + 85, 690, 64, 80, M.bridge); box(HALL.x1 + 2, 341, HALL.z0 + 118, 686, 62, 22, M.frame);   // boarding bridge + window strip
  plan.add(new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 90, 12).rotateX(Math.PI / 2).translate(1700, 372, HALL.z0 + 45), M.steel));      // bridge support
  const jet2 = buildJet(); jet2.scale.setScalar(0.8); jet2.position.set(3900, -1100, HALL.z0); jet2.rotation.z = 0.35; plan.add(jet2);

  batch.flush(plan, false); ceilBatch.flush(ceilingG, false);          // the terminal never casts shadows: the sun reaches the pod as if through skylights

  // ---- sky dome (scene Y-up, not part of the plan frame); fog ignores it
  const dome = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), new THREE.MeshBasicMaterial({ map: texOf(skyCanvas()), side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -1; group.add(dome);

  return {
    group, plan, ceilingG, obstacles, HALL,
    update(camera) { ceilingG.visible = camera.position.y < CEIL - 5; },    // see into the hall from above
  };
}
