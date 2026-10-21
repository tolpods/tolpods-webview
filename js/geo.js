// Geometry helpers. The model is built in "plan frame": x right, y toward the entrance, z up, units = inches.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// keep texture density constant on boxes: BoxGeometry faces are +x, -x, +y, -y, +z, -z
export function uvScale(g, sx, sy, sz, tile) {
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
  }
  uv.needsUpdate = true;
}

// box from its minimum corner
export function boxGeo(x0, y0, z0, sx, sy, sz, mat) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (mat && mat.userData && mat.userData.tile) uvScale(g, sx, sy, sz, mat.userData.tile);
  g.translate(x0 + sx / 2, y0 + sy / 2, z0 + sz / 2);
  return g;
}

export function rboxGeo(x0, y0, z0, sx, sy, sz, r, seg = 3) {
  const rr = Math.max(0.01, Math.min(r, sx / 2 - 0.01, sy / 2 - 0.01, sz / 2 - 0.01));
  const g = new RoundedBoxGeometry(sx, sy, sz, seg, rr);
  g.translate(x0 + sx / 2, y0 + sy / 2, z0 + sz / 2);
  return g;
}

// vertical cylinder (axis z), z0 = bottom
export function cylGeo(cx, cy, z0, r, h, seg = 24, rTop = r) {
  const g = new THREE.CylinderGeometry(rTop, r, h, seg);
  g.rotateX(Math.PI / 2);
  g.translate(cx, cy, z0 + h / 2);
  return g;
}
// cylinder along plan-x or plan-y
export function cylXGeo(x0, cy, cz, r, len, seg = 20) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  g.translate(x0 + len / 2, cy, cz);
  return g;
}
export function cylYGeo(cx, y0, cz, r, len, seg = 20) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.translate(cx, y0 + len / 2, cz);
  return g;
}

// outline in (x, z), extruded along +y from y0 to y1 (overall depth stays exact). pv = pivot subtracted
export function extrudeXZ(pts, y0, y1, bevel = 0.6, pv = [0, 0, 0]) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x - pv[0], z - pv[2])));
  const depth = Math.max(0.01, y1 - y0 - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
    bevelSegments: 3, curveSegments: 1, steps: 1,
  });
  g.translate(0, 0, bevel);          // depth now spans 0 .. depth + 2*bevel
  g.rotateX(Math.PI / 2);            // (x, y, z) -> (x, -z, y): shape y becomes up
  g.translate(0, y1 - pv[1], 0);
  return g;
}

// outline in (y, z), extruded along +x from x0 to x1
export function extrudeYZ(pts, x0, x1, bevel = 0.5, pv = [0, 0, 0]) {
  const shape = new THREE.Shape(pts.map(([y, z]) => new THREE.Vector2(y - pv[1], z - pv[2])));
  const depth = Math.max(0.01, x1 - x0 - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
    bevelSegments: 3, curveSegments: 1, steps: 1,
  });
  g.translate(0, 0, bevel);
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));   // (sx, sy, dz) -> (dz, sx, sy)
  g.translate(x0 - pv[0], 0, 0);
  return g;
}

// flat panel facing '-y', '+y', '+x' or '-x'; (cx, cy, cz) is its centre
export function planeGeo(w, h, facing, cx, cy, cz) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateX(Math.PI / 2);                                  // faces -y, upright
  if (facing === '+y') g.rotateZ(Math.PI);
  else if (facing === '+x') g.rotateZ(Math.PI / 2);
  else if (facing === '-x') g.rotateZ(-Math.PI / 2);
  g.translate(cx, cy, cz);
  return g;
}

// collects static geometry per material and merges it, so the whole pod is only a few dozen draw calls
export class Batch {
  constructor() { this.map = new Map(); }
  add(geo, mat) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g);
  }
  flush(parent, cast = true) {
    for (const [mat, list] of this.map) {
      const merged = mergeGeometries(list, false);
      if (!merged) { console.warn('merge failed for a material'); continue; }
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = cast && !mat.transparent;
      m.receiveShadow = true;
      parent.add(m);
    }
    this.map.clear();
  }
}

// A thin triangular panel (a prism) with three material groups: 0 = top face, 1 = underside, 2 = edges. Points in the panel's own frame, t = thickness.
export function triPanel(a, b, c, t, tile = 48) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), C = new THREE.Vector3(...c);
  const u = B.clone().sub(A).normalize(), n = B.clone().sub(A).cross(C.clone().sub(A)).normalize(), v = n.clone().cross(u);
  const o = n.clone().multiplyScalar(t / 2);
  const T = [A, B, C].map((p) => p.clone().add(o)), U = [A, B, C].map((p) => p.clone().sub(o));
  const pos = [], uv = [], push = (p) => { pos.push(p.x, p.y, p.z); uv.push(p.clone().sub(A).dot(u) / tile, p.clone().sub(A).dot(v) / tile); };
  const quad = (p, q, r, s) => { [p, q, r, p, r, s].forEach(push); };
  [T[0], T[1], T[2]].forEach(push);                       // top (counter-clockwise seen from +n)
  [U[0], U[2], U[1]].forEach(push);                       // underside
  quad(T[0], U[0], U[1], T[1]); quad(T[1], U[1], U[2], T[2]); quad(T[2], U[2], U[0], T[0]);   // edges
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.addGroup(0, 3, 0); g.addGroup(3, 3, 1); g.addGroup(6, 18, 2); g.computeVertexNormals();
  return g;
}
