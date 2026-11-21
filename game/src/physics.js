// Collision and ray tests against the city's solid boxes and the moving things in it.
// Everything is axis-aligned boxes standing on the ground (buildings), vertical capsules
// (people) and boxes turned about y (cars).

/**
 * Pushes a circle at `pos` (x, z, radius r) out of every solid near it. Returns the summed push
 * normal ({x, z}, zero when nothing touched) so a car can bounce off what it hit.
 */
export function pushOutOfSolids(pos, r, city, normal) {
  normal.x = 0;
  normal.z = 0;
  const solids = city.solidsNear(pos.x, pos.z);
  for (let n = 0; n < solids.length; n += 1) {
    const b = solids[n];
    if (pos.y !== undefined && pos.y > b.h) continue;
    const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
    const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
    let dx = pos.x - cx;
    let dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      dx /= d;
      dz /= d;
      pos.x = cx + dx * r;
      pos.z = cz + dz * r;
    } else {
      // The centre is inside the box: leave by the nearest face.
      const faces = [pos.x - b.x0, b.x1 - pos.x, pos.z - b.z0, b.z1 - pos.z];
      const m = faces.indexOf(Math.min(...faces));
      dx = m === 0 ? -1 : m === 1 ? 1 : 0;
      dz = m === 2 ? -1 : m === 3 ? 1 : 0;
      if (m === 0) pos.x = b.x0 - r;
      else if (m === 1) pos.x = b.x1 + r;
      else if (m === 2) pos.z = b.z0 - r;
      else pos.z = b.z1 + r;
    }
    normal.x += dx;
    normal.z += dz;
  }
  const len = Math.hypot(normal.x, normal.z);
  if (len > 0) {
    normal.x /= len;
    normal.z /= len;
  }
  return len > 0;
}

/** Keeps a point on land (the city's bounds or the pier). Returns true when it had to move it. */
export function clampToLand(pos, city, world) {
  if (city.isLand(pos.x, pos.z)) return false;
  const p = world.pier;
  if (pos.x < world.minX && pos.z > p.z0 - 4 && pos.z < p.z1 + 4) {
    pos.x = Math.max(p.x0, pos.x);
    pos.z = Math.min(p.z1 - 0.6, Math.max(p.z0 + 0.6, pos.z));
    return true;
  }
  pos.x = Math.min(world.maxX, Math.max(world.minX, pos.x));
  pos.z = Math.min(world.maxZ, Math.max(world.minZ, pos.z));
  return true;
}

/** Distance along a ray (origin o, unit direction d, both {x, y, z}) to a ground box, or Infinity. */
export function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]];
  for (let n = 0; n < 3; n += 1) {
    const [p, v, lo, hi] = axes[n];
    if (Math.abs(v) < 1e-9) {
      if (p < lo || p > hi) return Infinity;
      continue;
    }
    let t0 = (lo - p) / v;
    let t1 = (hi - p) / v;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

/** The nearest solid a ray meets within maxDist, as its distance (Infinity when none), walking the ray in steps. */
export function raySolids(o, d, maxDist, city) {
  let best = Infinity;
  const seen = new Set();
  for (let s = 0; s <= maxDist + 32; s += 30) {
    const x = o.x + d.x * Math.min(s, maxDist);
    const z = o.z + d.z * Math.min(s, maxDist);
    const list = city.solidsNear(x, z);
    for (let n = 0; n < list.length; n += 1) {
      const b = list[n];
      if (seen.has(b)) continue;
      seen.add(b);
      const t = rayBox(o, d, b.x0, 0, b.z0, b.x1, b.h, b.z1);
      if (t < best) best = t;
    }
    if (best < s) break;
  }
  if (d.y < -1e-6) {
    const ground = -o.y / d.y;
    if (ground < best) best = ground;
  }
  return best <= maxDist ? best : Infinity;
}

/** Distance along a ray to a standing person (a vertical capsule at x, z from y0 to y1 of radius r), or Infinity. */
export function rayCapsule(o, d, x, z, y0, y1, r) {
  const hx = d.x;
  const hz = d.z;
  const h2 = hx * hx + hz * hz;
  if (h2 < 1e-9) return Infinity;
  const t = ((x - o.x) * hx + (z - o.z) * hz) / h2;
  if (t < 0) return Infinity;
  const px = o.x + hx * t - x;
  const pz = o.z + hz * t - z;
  const miss2 = px * px + pz * pz;
  if (miss2 > r * r) return Infinity;
  const back = Math.sqrt((r * r - miss2) / h2);
  const tHit = Math.max(0, t - back);
  const y = o.y + d.y * tHit;
  return y >= y0 && y <= y1 ? tHit : Infinity;
}

/** Distance along a ray to a car (a box of half extents hw, h, hl turned by yaw about its centre x, z), or Infinity. */
export function rayCar(o, d, x, z, yaw, hw, h, hl) {
  const c = Math.cos(-yaw);
  const s = Math.sin(-yaw);
  const ox = o.x - x;
  const oz = o.z - z;
  const lo = { x: ox * c + oz * s, y: o.y, z: -ox * s + oz * c };
  const ld = { x: d.x * c + d.z * s, y: d.y, z: -d.x * s + d.z * c };
  return rayBox(lo, ld, -hw, 0, -hl, hw, h, hl);
}

/** Whether nothing solid stands between two points (each {x, y, z}). */
export function lineOfSight(a, b, city) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.01) return true;
  const d = { x: dx / len, y: dy / len, z: dz / len };
  return raySolids(a, d, len, city) === Infinity;
}

/**
 * The signed turn from angle a to angle b, in -PI..PI. Arithmetic, not a loop: a runaway angle
 * (huge or infinite) can never hang the page, it just gives 0.
 */
export function angleDiff(a, b) {
  const d = b - a;
  if (!Number.isFinite(d)) return 0;
  const TAU = Math.PI * 2;
  return ((((d + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}
