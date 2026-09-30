import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const noop = new Proxy(function () {}, {
  get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : noop),
  apply: () => noop,
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => noop }),
};

const { buildWorld, HALL } = await import('../src/world.js');
const { buildColliders } = await import('../src/colliders.js');
const { PROP_SLOTS } = await import('../src/models/manifest.js');
const { ColliderWorld, LAYERS, MASKS, obb, circle, resolveMove, penetrate } = await import('../src/collision.js');

const stubLoader = { load: () => new THREE.Texture() };

function generate() {
  const scene = new THREE.Scene();
  const world = buildWorld(scene, stubLoader);
  const colliders = buildColliders(scene);
  return { scene, world, colliders, byId: Object.fromEntries(colliders.map((c) => [c.id, c])) };
}

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, msg ?? `${a} !~ ${b} (tol ${tol})`);

test('U6 generation: dais circle r 3.40 at (0, -2)', () => {
  const { byId } = generate();
  const d = byId.dais;
  assert.equal(d.shape, 'circle');
  near(d.x, 0, 1e-9);
  near(d.z, -2, 1e-9);
  near(d.r, 3.4, 1e-9);
  near(d.yMin, 0, 1e-9);
  near(d.yMax, 0.7, 1e-9);
  assert.ok(d.layers & LAYERS.SOLID);
});

test('U6 generation: four truss circles at the ring corners', () => {
  const { colliders } = generate();
  const truss = colliders.filter((c) => c.id.startsWith('truss-'));
  assert.equal(truss.length, 4);
  for (const c of truss) {
    assert.equal(c.shape, 'circle');
    near(c.r, 0.3, 1e-9);
    near(Math.hypot(c.x, c.z + 2), 5.5, 1e-6);
    near(Math.abs(c.x), 3.889, 1e-3);
  }
});

test('U6 generation: two desk OBBs with +/-0.15pi yaw', () => {
  const { byId, colliders } = generate();
  assert.equal(colliders.filter((c) => c.id.startsWith('desk-')).length, 2);
  const a = byId['desk-A'];
  const d = byId['desk-D'];
  assert.equal(a.shape, 'obb');
  near(a.x, -6.5, 1e-9);
  near(a.z, 5, 1e-9);
  near(a.yaw, 0.15 * Math.PI, 1e-6);
  near(d.x, 6.5, 1e-9);
  near(d.yaw, -0.15 * Math.PI, 1e-6);
  for (const c of [a, d]) {
    near(c.hx, 1.25, 1e-9);
    near(c.hz, 0.525, 1e-9);
    near(c.yMax, 1.045, 1e-3);
  }
});

test('U6 generation: four pillar OBBs (SOLID | CAMERA)', () => {
  const { colliders } = generate();
  const pillars = colliders.filter((c) => c.id.startsWith('pillar-'));
  assert.equal(pillars.length, 4);
  const spots = pillars.map((c) => `${Math.sign(c.x)},${Math.sign(c.z)}`).sort();
  assert.deepEqual(spots, ['-1,-1', '-1,1', '1,-1', '1,1']);
  for (const c of pillars) {
    assert.equal(c.shape, 'obb');
    near(Math.abs(c.x), 14, 1e-9);
    near(Math.abs(c.z), 14, 1e-9);
    near(c.hx, 0.55, 1e-9);
    near(c.yMax, 7, 1e-9);
    assert.ok(c.layers & LAYERS.CAMERA && c.layers & LAYERS.SOLID);
  }
});

test('U6 generation: wall slabs have inner faces on HALL constants (within 0.05 m)', () => {
  const { byId } = generate();
  // Slab local Z is the thickness axis; with these yaws it maps onto world X (west/east) or Z (north/south).
  const inner = {
    'wall-west': byId['wall-west'].x + byId['wall-west'].hz,
    'wall-east': byId['wall-east'].x - byId['wall-east'].hz,
    'wall-north': byId['wall-north'].z + byId['wall-north'].hz,
    'wall-south': byId['wall-south'].z - byId['wall-south'].hz,
  };
  near(inner['wall-west'], -HALL.halfX, 0.05);
  near(inner['wall-east'], HALL.halfX, 0.05);
  near(inner['wall-north'], HALL.zNorth, 0.05);
  near(inner['wall-south'], HALL.zSouth, 0.05);
  for (const id of Object.keys(inner)) {
    assert.equal(byId[id].shape, 'slab');
    assert.ok(byId[id].layers & LAYERS.WALL && byId[id].layers & LAYERS.CAMERA);
  }
});

test('U6 generation: ids are unique, no bounds clamp source, no stray colliders', () => {
  const { colliders, world } = generate();
  const ids = colliders.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal('bounds' in world, false);
  // dais, column, 4 truss, 2 desks, 4 pillars, 4 walls
  assert.equal(colliders.length, 16);
  const cw = new ColliderWorld();
  for (const c of colliders) cw.add(c);
  assert.equal(cw.count, 16);
});

test('U6 prop footprints are declared in the manifest', () => {
  assert.deepEqual(
    { w: PROP_SLOTS['PROP-CHAIR'].footprint.w, d: PROP_SLOTS['PROP-CHAIR'].footprint.d },
    { w: 0.78, d: 0.86 }
  );
  assert.equal(PROP_SLOTS['PROP-CHAIR'].footprint.shape, 'obb');
  assert.deepEqual(
    { w: PROP_SLOTS['PROP-PLANTER'].footprint.w, d: PROP_SLOTS['PROP-PLANTER'].footprint.d },
    { w: 0.6, d: 0.56 }
  );
  assert.equal(PROP_SLOTS['PROP-PLANTER'].footprint.shape, 'circle');
});

function hallWorld() {
  const { colliders } = generate();
  const cw = new ColliderWorld();
  for (const c of colliders) cw.add(c);
  const yaw = (x, z) => Math.atan2(0 - x, -2 - z);
  for (const [i, [x, z]] of [[4.15, -0.89], [4.15, -3.11], [-4.15, -0.89], [-4.15, -3.11]].entries()) {
    cw.add(obb(x, z, 0.39, 0.43, yaw(x, z), { id: `chair-${i}`, layers: LAYERS.PROP, yMax: 0.85 }));
  }
  return cw;
}

function hold(cw, start, dir, frames = 120) {
  let pos = { x: start.x, y: 0, z: start.z };
  const len = Math.hypot(dir.x, dir.z);
  const d = { x: (dir.x / len) * 0.18, z: (dir.z / len) * 0.18 };
  for (let i = 0; i < frames; i++) pos = resolveMove(pos, d, cw, { dt: 0.05 }).pos;
  return pos;
}

test('integration: dais is a solid counter from the four clear lanes', () => {
  const cw = hallWorld();
  for (const [sx, sz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const start = { x: 7 * sx, z: -2 + 7 * sz };
    const end = hold(cw, start, { x: -sx, z: -sz });
    const dist = Math.hypot(end.x, end.z + 2);
    assert.ok(dist >= 3.68 && dist <= 3.8, `lane ${sx},${sz}: stopped at ${dist}`);
  }
});

test('hypothesis: player cannot squeeze between a stool and the dais', () => {
  const cw = hallWorld();
  const stool = cw.get('chair-0');
  // Gap between stool front face and dais rim along the axis toward the dais centre.
  const axis = Math.hypot(stool.x, stool.z + 2);
  const gap = axis - stool.hz - 3.4;
  assert.ok(gap < 0.6, `gap ${gap} should be narrower than the 0.6 m capsule`);
  // Probe: capsule centred in that gap must overlap something.
  const ux = -stool.x / axis;
  const uz = (-2 - stool.z) / axis;
  const mid = axis - stool.hz - gap / 2;
  const px = stool.x + ux * (axis - mid);
  const pz = stool.z + uz * (axis - mid);
  const hits = cw.candidates(px, pz, MASKS.player, 0.3).filter((c) => penetrate({ x: px, z: pz, r: 0.3 }, c));
  assert.ok(hits.length >= 2, 'capsule in the gap intersects both stool and dais');
});
