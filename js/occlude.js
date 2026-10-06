// Is a hotspot marker visible, or hidden behind the pod's walls / roof?  Pure maths (no THREE), all in plan inches.
// The pod is treated as one box. A marker inside the box is only visible from outside through an OPEN roof;
// a marker outside the box (on a wall face) is hidden when the line of sight passes through the box.
export const POD_BOX = { x0: 0, x1: 90, y0: 0, y1: 144, z0: -10, z1: 94 };

export function markerVisible(c, p, roofOn, b = POD_BOX) {
  const inside = (q) => q.x > b.x0 && q.x < b.x1 && q.y > b.y0 && q.y < b.y1 && q.z > b.z0 && q.z < b.z1;
  const cIn = inside(c), pIn = inside(p);
  if (cIn && pIn) return true;          // walking inside: everything inside is visible
  if (cIn && !pIn) return false;        // inside the pod looking at a marker on the outside of a wall
  // camera outside: where does the line of sight enter the box?
  const d = { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z };
  let tNear = -Infinity, tFar = Infinity, axis = null;
  for (const [k, lo, hi] of [['x', b.x0, b.x1], ['y', b.y0, b.y1], ['z', b.z0, b.z1]]) {
    if (Math.abs(d[k]) < 1e-9) { if (c[k] < lo || c[k] > hi) return true; continue; }
    let t1 = (lo - c[k]) / d[k], t2 = (hi - c[k]) / d[k];
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tNear) { tNear = t1; axis = k; }
    if (t2 < tFar) tFar = t2;
  }
  const hits = tNear < tFar && tFar > 0 && tNear < 1;          // the segment passes through the box before reaching p
  if (!hits) return true;
  if (pIn) return axis === 'z' && !roofOn && c.z > b.z1;       // enters through the top: fine only if the roof is off
  return false;                                                  // marker outside, box in the way
}
