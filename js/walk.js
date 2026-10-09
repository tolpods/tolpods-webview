// Pure walking logic (no THREE / DOM) so it can be tested: circle-vs-box collision in plan inches.
export function resolve(p, r, boxes) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of boxes) {
      const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cy = Math.max(b.y0, Math.min(p.y, b.y1));
      let dx = p.x - cx, dy = p.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.y += dy * k; }
      else {                                          // centre is inside the box: push out through the nearest face
        const l = p.x - b.x0, rr = b.x1 - p.x, t = p.y - b.y0, bt = b.y1 - p.y, m = Math.min(l, rr, t, bt);
        if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === t) p.y = b.y0 - r; else p.y = b.y1 + r;
      }
      moved = true;
    }
    if (!moved) break;
  }
  return p;
}
// move on x then y separately so you slide along walls instead of sticking
export function step(p, dx, dy, r, boxes) {
  p.x += dx; resolve(p, r, boxes);
  p.y += dy; resolve(p, r, boxes);
  return p;
}
