// Realistic products (bottles, cans, bags, bars, boxes, cartons) drawn with instancing: ~400 items cost ~12 draw calls.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { extrudeXZ } from './geo.js';

const BRAND = [0xc7131a, 0x1747a6, 0xf5b81a, 0x1f8a38, 0xec6b14, 0x7330a0, 0x2a2a30, 0xcfc3a0];
const LABEL2 = [0xf4f1ea, 0xf4f1ea, 0x1b1b1b, 0xf4f1ea, 0xfbe6c0, 0xf0dcf2, 0xd91a1a, 0x7a4520];
const LIQ = [0x241008, 0xd96610, 0xc7d92e, 0x7d0a1c, 0x663a0d, 0x597a22, 0x1a66d9, 0xe6bf1a];

const lathe = (pts) => {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), 20);
  g.rotateX(Math.PI / 2);                    // lathe spins around Y; stand it up on Z
  return g;
};
function blob(sx, sy, sz, pinch) {           // foil bag / wrapper: ellipsoid with flattened sealed ends
  const g = new THREE.SphereGeometry(1, 14, 10);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * sx, y = p.getY(i) * sy, z = p.getZ(i) * sz;
    if (Math.abs(z) > sz * 0.84) y *= pinch;
    p.setXYZ(i, x, y, z + sz);
  }
  g.computeVertexNormals();
  return g;
}

let G = null;                                // geometries are shared by every Products instance
function geos() {
  if (G) return G;
  G = {
    petBody: lathe([[0, 0.3], [0.8, 0.18], [1.2, 0], [1.38, 0.3], [1.42, 0.9], [1.42, 5.3], [1.32, 5.9], [1.05, 6.5], [0.78, 7.0], [0.66, 7.3], [0.62, 7.7], [0.64, 7.9]]),
    petLabel: lathe([[1.465, 1.8], [1.465, 4.7]]),
    petCap: lathe([[0, 7.25], [0.74, 7.25], [0.77, 7.4], [0.77, 8.15], [0.7, 8.25], [0, 8.25]]),
    canBody: lathe([[0, 0.28], [0.82, 0.08], [1.05, 0], [1.24, 0.3], [1.3, 0.7], [1.3, 3.95], [1.14, 4.25], [1.02, 4.42], [1.0, 4.52]]),
    canLid: lathe([[0, 4.5], [1.0, 4.5], [1.04, 4.62], [0.9, 4.64], [0.8, 4.56], [0, 4.56]]),
    bag: blob(1.9, 0.75, 3.1, 0.18),
    bar: blob(0.75, 0.3, 2.3, 0.2),
    box: new RoundedBoxGeometry(3, 1.5, 4.6, 2, 0.15).translate(0, 0, 2.3),
    candy: new RoundedBoxGeometry(2.4, 1.3, 3.2, 2, 0.12).translate(0, 0, 1.6),
    carton: extrudeXZ([[-1.3, 0], [1.3, 0], [1.3, 5], [0, 6.3], [-1.3, 5]], -1, 1, 0.1),
  };
  return G;
}

export class Products {
  constructor() { this.items = []; }
  // kind: pet | water | can | slimcan | bag | bars | cracker | candy | carton.  Front faces -y at rotZ = 0.
  add(kind, x, y, z, rotZ = 0, scale = 1, ci = 0) { this.items.push({ kind, x, y, z, rotZ, scale, ci: ci % BRAND.length }); }
  static random(rnd, group) {
    const kinds = group === 'drink' ? ['pet', 'pet', 'can', 'can', 'slimcan', 'carton', 'water']
      : group === 'snack' ? ['bag', 'bag', 'bars', 'cracker', 'cracker', 'candy']
        : ['pet', 'can', 'slimcan', 'bag', 'bars', 'cracker', 'carton', 'candy'];
    return [kinds[Math.floor(rnd() * kinds.length)], Math.floor(rnd() * BRAND.length)];
  }
  build(parent) {
    const g = geos();
    const by = {};
    for (const it of this.items) (by[it.kind] ||= []).push(it);
    const mats = {
      liquid: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 0.6 }),
      label: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }),
      cap: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
      can: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.7 }),
      alu: new THREE.MeshStandardMaterial({ color: 0xd0d0d4, roughness: 0.25, metalness: 1 }),
      foil: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.5 }),
      paper: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    const make = (list, geo, mat, colorOf, name) => {
      if (!list || !list.length) return;
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      inst.name = name; inst.castShadow = true; inst.receiveShadow = true;
      list.forEach((it, i) => {
        e.set(0, 0, it.rotZ + ((i * 37) % 11 - 5) * 0.012);
        q.setFromEuler(e);
        const sz = it.kind === 'slimcan' ? it.scale * 1.28 : it.scale, sxy = it.kind === 'slimcan' ? it.scale * 0.86 : it.scale;
        s.set(sxy, sxy, sz); p.set(it.x, it.y, it.z);
        m4.compose(p, q, s);
        inst.setMatrixAt(i, m4);
        inst.setColorAt(i, col.set(colorOf ? colorOf(it) : 0xffffff));
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      parent.add(inst);
    };
    const pets = [...(by.pet || []), ...(by.water || [])];
    make(pets, g.petBody, mats.liquid, (it) => (it.kind === 'water' ? 0xcfe6f2 : LIQ[it.ci]), 'pet-body');
    make(pets, g.petLabel, mats.label, (it) => (it.kind === 'water' ? 0x1a73c9 : BRAND[it.ci]), 'pet-label');
    make(pets, g.petCap, mats.cap, (it) => (it.kind === 'water' ? 0x1a73c9 : LABEL2[it.ci]), 'pet-cap');
    const cans = [...(by.can || []), ...(by.slimcan || [])];
    make(cans, g.canBody, mats.can, (it) => BRAND[it.ci], 'can-body');
    make(cans, g.canLid, mats.alu, null, 'can-lid');
    make(by.bag, g.bag, mats.foil, (it) => BRAND[it.ci], 'bags');
    const bars = [];                                   // two wrappers side by side per slot
    for (const it of by.bars || []) {
      const c = Math.cos(it.rotZ), sn = Math.sin(it.rotZ);
      for (const dx of [-0.9, 0.9]) bars.push({ ...it, x: it.x + dx * c * it.scale, y: it.y + dx * sn * it.scale });
    }
    make(bars, g.bar, mats.foil, (it) => BRAND[(it.ci + 3) % BRAND.length], 'bars');
    make(by.cracker, g.box, mats.paper, (it) => BRAND[(it.ci + 1) % BRAND.length], 'boxes');
    make(by.candy, g.candy, mats.paper, (it) => BRAND[(it.ci + 5) % BRAND.length], 'candy');
    make(by.carton, g.carton, mats.paper, (it) => BRAND[(it.ci + 2) % BRAND.length], 'cartons');
  }
}
