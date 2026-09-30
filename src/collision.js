// 2.5D collision core: XZ shapes with a vertical extent. Pure math, no renderer
// or DOM dependency, so it runs unchanged in Node for unit tests.
//
// Yaw convention matches three.js `rotation.y`: a shape rotated by `yaw` has its
// local +X axis at world (cos yaw, -sin yaw) and local +Z axis at (sin yaw, cos yaw).

export const LAYERS = {
  WALL: 1 << 0,
  SOLID: 1 << 1,
  PROP: 1 << 2,
  NPC: 1 << 3,
  CAMERA: 1 << 4,
  WALKABLE: 1 << 5,
  TRIGGER: 1 << 6,
};

export const MASKS = {
  player: LAYERS.WALL | LAYERS.SOLID | LAYERS.PROP | LAYERS.NPC,
  npc: LAYERS.WALL | LAYERS.SOLID | LAYERS.PROP,
  camera: LAYERS.WALL | LAYERS.CAMERA,
};

export const PLAYER = { radius: 0.3, height: 1.8, step: 0.3 };

const EPS = 1e-4;
const MAX_SUBSTEP = 0.1;
const PUSH_ITERATIONS = 3;
const GRAVITY = 9.8;

let autoId = 1;

function baseCollider(shape, opts) {
  return {
    id: opts.id ?? `${shape}${autoId++}`,
    shape,
    layers: opts.layers ?? LAYERS.SOLID,
    yMin: opts.yMin ?? 0,
    yMax: opts.yMax ?? 1,
    dynamic: !!opts.dynamic,
    tag: opts.tag,
  };
}

/** Vertical cylinder footprint. opts: { id, layers, yMin, yMax, dynamic, tag } */
export function circle(x, z, r, opts = {}) {
  return { ...baseCollider('circle', opts), x, z, r, br: r };
}

/** Oriented box footprint from half-extents (hx along local X, hz along local Z). */
export function obb(x, z, hx, hz, yaw = 0, opts = {}) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { ...baseCollider('obb', opts), x, z, hx, hz, yaw, cos, sin, br: Math.hypot(hx, hz) };
}

/** Thin wall as an OBB along the segment (x1,z1)-(x2,z2) with the given thickness. */
export function slab(x1, z1, x2, z2, thickness, opts = {}) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  const c = obb((x1 + x2) / 2, (z1 + z2) / 2, len / 2, thickness / 2, yaw, opts);
  c.shape = 'slab';
  return c;
}

function toLocal(c, px, pz) {
  const dx = px - c.x;
  const dz = pz - c.z;
  return { lx: dx * c.cos - dz * c.sin, lz: dx * c.sin + dz * c.cos };
}

function fromLocalVec(c, lx, lz) {
  return { x: lx * c.cos + lz * c.sin, z: -lx * c.sin + lz * c.cos };
}

/**
 * Push-out of a circle `{x, z, r}` from collider `c`.
 * Returns `{ depth, nx, nz }` (unit normal pointing from the collider toward the
 * circle, i.e. the direction to move the circle) or `null` when not overlapping.
 */
export function penetrate(circ, c) {
  if (c.shape === 'circle') {
    const dx = circ.x - c.x;
    const dz = circ.z - c.z;
    const d = Math.hypot(dx, dz);
    const depth = circ.r + c.r - d;
    if (depth <= 0) return null;
    if (d < 1e-9) return { depth, nx: 0, nz: 1 };
    return { depth, nx: dx / d, nz: dz / d };
  }

  const { lx, lz } = toLocal(c, circ.x, circ.z);
  const cx = Math.max(-c.hx, Math.min(c.hx, lx));
  const cz = Math.max(-c.hz, Math.min(c.hz, lz));
  const ox = lx - cx;
  const oz = lz - cz;
  const d2 = ox * ox + oz * oz;

  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    const depth = circ.r - d;
    if (depth <= 0) return null;
    const n = fromLocalVec(c, ox / d, oz / d);
    return { depth, nx: n.x, nz: n.z };
  }

  // Circle centre inside the box: exit through the nearest face.
  const gx = c.hx - Math.abs(lx);
  const gz = c.hz - Math.abs(lz);
  let nlx = 0;
  let nlz = 0;
  let gap;
  if (gx < gz) {
    gap = gx;
    nlx = lx >= 0 ? 1 : -1;
  } else {
    gap = gz;
    nlz = lz >= 0 ? 1 : -1;
  }
  const n = fromLocalVec(c, nlx, nlz);
  return { depth: gap + circ.r, nx: n.x, nz: n.z };
}

/** Whether collider `c` obstructs horizontal motion for a body standing at height `y`. */
export function blocks(c, y, opts = {}) {
  const height = opts.height ?? PLAYER.height;
  const step = opts.step ?? PLAYER.step;
  return c.yMax > y + step && c.yMin < y + height;
}

function contains(c, x, z) {
  if (c.shape === 'circle') {
    const dx = x - c.x;
    const dz = z - c.z;
    return dx * dx + dz * dz <= c.r * c.r;
  }
  const { lx, lz } = toLocal(c, x, z);
  return Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz;
}

export class ColliderWorld {
  constructor() {
    this._all = new Map();
    this.lastStepMs = 0;
    this.lastContacts = [];
  }

  add(collider) {
    if (this._all.has(collider.id)) throw new Error(`duplicate collider id: ${collider.id}`);
    this._all.set(collider.id, collider);
    return collider.id;
  }

  remove(id) {
    return this._all.delete(id);
  }

  get(id) {
    return this._all.get(id);
  }

  clear() {
    this._all.clear();
  }

  /** Move a dynamic circle (NPC) without re-registering it. */
  setPosition(id, x, z) {
    const c = this._all.get(id);
    if (!c) return false;
    c.x = x;
    c.z = z;
    return true;
  }

  get count() {
    return this._all.size;
  }

  byLayer() {
    const out = {};
    for (const name of Object.keys(LAYERS)) out[name] = 0;
    for (const c of this._all.values()) {
      for (const [name, bit] of Object.entries(LAYERS)) if (c.layers & bit) out[name]++;
    }
    return out;
  }

  list() {
    return [...this._all.values()];
  }

  walkable() {
    return this.list().filter((c) => c.layers & LAYERS.WALKABLE);
  }

  /** Colliders in `mask` whose bounding circle reaches within `radius` of (x, z). */
  candidates(x, z, mask, radius = 0, excludeId) {
    const out = [];
    for (const c of this._all.values()) {
      if (!(c.layers & mask) || c.id === excludeId) continue;
      const reach = c.br + radius;
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz <= reach * reach) out.push(c);
    }
    return out;
  }

  resolveMove(pos, delta, opts) {
    return resolveMove(pos, delta, this, opts);
  }

  groundHeightAt(x, z, currentY, step) {
    return groundHeightAt(this, x, z, currentY, step);
  }

  raycastXZ(ox, oz, dx, dz, maxDist, mask, opts) {
    return raycastXZ(this, ox, oz, dx, dz, maxDist, mask, opts);
  }

  snapshot(playerY = 0) {
    return {
      count: this.count,
      byLayer: this.byLayer(),
      list: this.list().map((c) => ({
        id: c.id,
        shape: c.shape,
        layers: c.layers,
        x: c.x,
        z: c.z,
        yMin: c.yMin,
        yMax: c.yMax,
        ...(c.shape === 'circle' ? { r: c.r } : { hx: c.hx, hz: c.hz, yaw: c.yaw }),
      })),
      contacts: this.lastContacts,
      playerY,
      stepMs: this.lastStepMs,
    };
  }
}

/**
 * Highest walkable top under (x, z) that the body can step onto from `currentY`.
 * The hall floor is y = 0.
 */
export function groundHeightAt(world, x, z, currentY = 0, step = PLAYER.step) {
  let h = 0;
  for (const c of world.walkable()) {
    const top = c.top ?? c.yMax;
    if (top <= currentY + step && top > h && contains(c, x, z)) h = top;
  }
  return h;
}

/**
 * Move `pos` ({x, y, z}) by `delta` ({x, z}) through the world.
 * Returns `{ pos, contacts, vy }`; `pos` is a new object.
 *
 * Vertical: stepping up is immediate. Stepping down snaps to the ground unless
 * `opts.dt` is given, in which case the body falls under gravity (`opts.vy` is the
 * carried vertical velocity).
 */
export function resolveMove(pos, delta, world, opts = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const radius = opts.radius ?? PLAYER.radius;
  const height = opts.height ?? PLAYER.height;
  const step = opts.step ?? PLAYER.step;
  const mask = opts.mask ?? MASKS.player;
  const bodyOpts = { height, step };

  let x = pos.x;
  let z = pos.z;
  const y = pos.y ?? 0;
  const contacts = new Set();

  const dist = Math.hypot(delta.x, delta.z);
  const n = Math.max(1, Math.ceil(dist / MAX_SUBSTEP));
  const sx = delta.x / n;
  const sz = delta.z / n;

  for (let i = 0; i < n; i++) {
    x += sx;
    z += sz;
    for (let iter = 0; iter < PUSH_ITERATIONS; iter++) {
      let moved = false;
      for (const c of world.candidates(x, z, mask, radius, opts.excludeId)) {
        if (!blocks(c, y, bodyOpts)) continue;
        const hit = penetrate({ x, z, r: radius }, c);
        if (!hit) continue;
        x += hit.nx * (hit.depth + EPS);
        z += hit.nz * (hit.depth + EPS);
        contacts.add(c.id);
        moved = true;
      }
      if (!moved) break;
    }
  }

  const ground = groundHeightAt(world, x, z, y, step);
  let ny = y;
  let vy = opts.vy ?? 0;
  if (ground >= y) {
    ny = ground;
    vy = 0;
  } else if (opts.dt === undefined) {
    ny = ground;
    vy = 0;
  } else {
    vy -= GRAVITY * opts.dt;
    ny = y + vy * opts.dt;
    if (ny <= ground) {
      ny = ground;
      vy = 0;
    }
  }

  const list = [...contacts];
  if (world instanceof ColliderWorld) {
    world.lastContacts = list;
    if (typeof performance !== 'undefined') world.lastStepMs = performance.now() - t0;
  }
  return { pos: { x, y: ny, z }, contacts: list, vy };
}

/**
 * Cast a ray in XZ against colliders in `mask`. Colliders are inflated by
 * `opts.radius` (swept sphere approximation; box corners are square, which is
 * conservative). `opts.y` restricts hits to colliders whose vertical extent
 * (also inflated by radius) contains that height.
 * Returns `{ dist, id, collider, nx, nz }` for the nearest hit within `maxDist`, else `null`.
 */
export function raycastXZ(world, ox, oz, dx, dz, maxDist, mask, opts = {}) {
  const len = Math.hypot(dx, dz);
  if (len < 1e-12) return null;
  const ux = dx / len;
  const uz = dz / len;
  const r = opts.radius ?? 0;

  let best = null;
  for (const c of world.list()) {
    if (!(c.layers & mask) || c.id === opts.excludeId) continue;
    if (opts.y !== undefined && (opts.y < c.yMin - r || opts.y > c.yMax + r)) continue;

    let hit = null;
    if (c.shape === 'circle') hit = rayCircle(ox, oz, ux, uz, c.x, c.z, c.r + r);
    else hit = rayBox(c, ox, oz, ux, uz, r);

    if (hit && hit.t <= maxDist && (!best || hit.t < best.dist)) {
      best = { dist: hit.t, id: c.id, collider: c, nx: hit.nx, nz: hit.nz };
    }
  }
  return best;
}

function rayCircle(ox, oz, ux, uz, cx, cz, r) {
  const mx = ox - cx;
  const mz = oz - cz;
  const b = mx * ux + mz * uz;
  const cc = mx * mx + mz * mz - r * r;
  if (cc > 0 && b > 0) return null;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = Math.max(0, -b - Math.sqrt(disc));
  const px = ox + ux * t - cx;
  const pz = oz + uz * t - cz;
  const pl = Math.hypot(px, pz) || 1;
  return { t, nx: px / pl, nz: pz / pl };
}

function rayBox(c, ox, oz, ux, uz, r) {
  const { lx: ox2, lz: oz2 } = toLocal(c, ox, oz);
  const ux2 = ux * c.cos - uz * c.sin;
  const uz2 = ux * c.sin + uz * c.cos;
  const hx = c.hx + r;
  const hz = c.hz + r;

  let tmin = 0;
  let tmax = Infinity;
  let nlx = 0;
  let nlz = 0;

  const axes = [
    [ox2, ux2, hx, 1, 0],
    [oz2, uz2, hz, 0, 1],
  ];
  for (const [o, u, h, ax, az] of axes) {
    if (Math.abs(u) < 1e-12) {
      if (o < -h || o > h) return null;
      continue;
    }
    let t1 = (-h - o) / u;
    let t2 = (h - o) / u;
    let sign = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nlx = ax * sign;
      nlz = az * sign;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  const n = fromLocalVec(c, nlx, nlz);
  return { t: tmin, nx: n.x, nz: n.z };
}
