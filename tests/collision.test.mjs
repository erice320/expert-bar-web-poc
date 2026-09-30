import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYERS,
  MASKS,
  ColliderWorld,
  circle,
  obb,
  slab,
  penetrate,
  blocks,
  resolveMove,
  groundHeightAt,
  raycastXZ,
} from '../src/collision.js';

const TOL = 1e-6;
const near = (a, b, tol = TOL, msg) =>
  assert.ok(Math.abs(a - b) <= tol, msg ?? `${a} !~ ${b} (tol ${tol})`);

const SPEED = 3.6;
const DT = 0.05;
const FRAME = SPEED * DT;
const DAIS = { x: 0, z: -2, r: 3.4 };

function daisWorld() {
  const w = new ColliderWorld();
  w.add(circle(DAIS.x, DAIS.z, DAIS.r, { id: 'dais', layers: LAYERS.SOLID, yMin: 0, yMax: 0.7 }));
  return w;
}

function walk(world, start, dir, frames, opts = {}) {
  let pos = { x: start.x, y: start.y ?? 0, z: start.z };
  const len = Math.hypot(dir.x, dir.z);
  const d = { x: (dir.x / len) * (opts.speed ?? SPEED) * DT, z: (dir.z / len) * (opts.speed ?? SPEED) * DT };
  const trace = [];
  let vy = 0;
  for (let i = 0; i < frames; i++) {
    const out = resolveMove(pos, d, world, { ...opts.move, dt: opts.gravity ? DT : undefined, vy });
    pos = out.pos;
    vy = out.vy;
    trace.push({ pos, contacts: out.contacts });
  }
  return trace;
}

test('U1 penetration: circle-circle', () => {
  const c = circle(0, 0, 0.5);
  const hit = penetrate({ x: 0.6, z: 0, r: 0.3 }, c);
  near(hit.depth, 0.2);
  near(hit.nx, 1);
  near(hit.nz, 0);

  const diag = penetrate({ x: 3, z: 4, r: 1 }, circle(0, 0, 4.5));
  near(diag.depth, 0.5);
  near(diag.nx, 0.6);
  near(diag.nz, 0.8);

  assert.equal(penetrate({ x: 2, z: 0, r: 0.3 }, c), null);
  assert.equal(penetrate({ x: 0.8, z: 0, r: 0.3 }, c), null, 'touching is not penetrating');
});

test('U1 penetration: coincident circle centres push along +Z', () => {
  const hit = penetrate({ x: 1, z: 1, r: 0.3 }, circle(1, 1, 0.3));
  near(hit.depth, 0.6);
  near(hit.nx, 0);
  near(hit.nz, 1);
});

test('U1 penetration: circle-OBB axis aligned', () => {
  const box = obb(0, 0, 1, 0.5, 0);
  const face = penetrate({ x: 1.2, z: 0, r: 0.3 }, box);
  near(face.depth, 0.1);
  near(face.nx, 1);
  near(face.nz, 0);

  const corner = penetrate({ x: 1.1, z: 0.6, r: 0.3 }, box);
  near(corner.depth, 0.3 - Math.hypot(0.1, 0.1));
  near(corner.nx, Math.SQRT1_2);
  near(corner.nz, Math.SQRT1_2);

  assert.equal(penetrate({ x: 1.4, z: 0, r: 0.3 }, box), null);
});

test('U1 penetration: circle-OBB at stool yaw', () => {
  const sx = 4.15;
  const sz = -0.89;
  const yaw = Math.atan2(0 - sx, -2 - sz);
  const stool = obb(sx, sz, 0.39, 0.43, yaw, { layers: LAYERS.PROP });
  const ax = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const az = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const probe = (lx, lz) => ({
    x: sx + ax.x * lx + az.x * lz,
    z: sz + ax.z * lx + az.z * lz,
    r: 0.3,
  });

  const side = penetrate(probe(0.39 + 0.2, 0.1), stool);
  near(side.depth, 0.1);
  near(side.nx, ax.x);
  near(side.nz, ax.z);

  const front = penetrate(probe(-0.05, 0.43 + 0.25), stool);
  near(front.depth, 0.05);
  near(front.nx, az.x);
  near(front.nz, az.z);

  const back = penetrate(probe(0, -(0.43 + 0.25)), stool);
  near(back.depth, 0.05);
  near(back.nx, -az.x);
  near(back.nz, -az.z);

  assert.equal(penetrate(probe(0.39 + 0.35, 0), stool), null);

  const inside = penetrate(probe(0.3, 0), stool);
  near(inside.depth, 0.09 + 0.3);
  near(inside.nx, ax.x);
  near(inside.nz, ax.z);
});

test('U1 penetration: slab is a thin OBB along its segment', () => {
  const west = slab(-17.5, -10, -17.5, 10, 0.2);
  const hit = penetrate({ x: -17.35, z: 0, r: 0.3 }, west);
  near(hit.depth, 0.25);
  near(hit.nx, 1);
  near(hit.nz, 0);

  const diagonal = slab(0, 0, 4, 4, 0.2);
  const d = penetrate({ x: 2 + 0.2 * Math.SQRT1_2, z: 2 - 0.2 * Math.SQRT1_2, r: 0.3 }, diagonal);
  near(d.depth, 0.2);
  near(d.nx, Math.SQRT1_2);
  near(d.nz, -Math.SQRT1_2);
});

test('U2 no tunnelling: running at a truss-leg circle from 20 angles', () => {
  const leg = { x: 3.89, z: 1.89 };
  const world = new ColliderWorld();
  world.add(circle(leg.x, leg.z, 0.3, { id: 'leg', layers: LAYERS.SOLID, yMin: 0, yMax: 3.5 }));

  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    for (const aim of [0, 0.05, -0.05]) {
      const start = { x: leg.x + 6 * Math.sin(a), z: leg.z + 6 * Math.cos(a) };
      const heading = { x: -Math.sin(a + aim), z: -Math.cos(a + aim) };
      for (const f of walk(world, start, heading, 70)) {
        const d = Math.hypot(f.pos.x - leg.x, f.pos.z - leg.z);
        assert.ok(d >= 0.6 - 1e-9, `angle ${i} aim ${aim}: inside leg (d=${d})`);
      }
    }
  }
});

test('U2 no tunnelling: hitch frames (large delta) still resolve outside', () => {
  const world = daisWorld();
  const out = resolveMove({ x: 0, y: 0, z: 5 }, { x: 0, z: -9 }, world);
  const d = Math.hypot(out.pos.x - DAIS.x, out.pos.z - DAIS.z);
  assert.ok(d >= DAIS.r + 0.3 - 1e-9, `d=${d}`);
  assert.deepEqual(out.contacts, ['dais']);
});

test('U3 slide: 45 degrees into a wall keeps >= 0.65 of input speed tangentially', () => {
  const world = new ColliderWorld();
  world.add(slab(-17.5, -16.9, -17.5, 17.5, 0.2, { id: 'west', layers: LAYERS.WALL, yMax: 9 }));

  const trace = walk(world, { x: -16.5, z: -5 }, { x: -1, z: 1 }, 40);
  const contact = trace.findIndex((f) => f.contacts.includes('west'));
  assert.ok(contact >= 0, 'wall was reached');
  const before = trace[contact - 1].pos;
  const after = trace[trace.length - 1].pos;
  const frames = trace.length - contact;
  const tangential = (after.z - before.z) / (frames * FRAME);
  assert.ok(tangential >= 0.65, `tangential ratio ${tangential}`);
  assert.ok(after.x >= -17.4 + 0.3 - 0.01, `stopped at the wall face, x=${after.x}`);
});

test('U3 slide: 45 degrees into the dais circle keeps >= 0.6 of input speed', () => {
  const world = daisWorld();
  const dir = { x: 1, z: -1 };
  const trace = walk(world, { x: 0, z: 2.5 }, dir, 30);
  const first = trace.findIndex((f) => f.contacts.length > 0);
  assert.ok(first > 0, 'dais was reached');

  let path = 0;
  let sliding = 0;
  let prev = trace[first - 1].pos;
  for (let i = first; i < trace.length; i++) {
    if (trace[i].contacts.length === 0) break;
    path += Math.hypot(trace[i].pos.x - prev.x, trace[i].pos.z - prev.z);
    prev = trace[i].pos;
    sliding++;
  }
  assert.ok(sliding >= 5, `slid for ${sliding} frames`);
  assert.ok(path / (sliding * FRAME) >= 0.6, `slide ratio ${path / (sliding * FRAME)}`);
});

test('U4 layers: masks', () => {
  assert.equal(MASKS.camera & LAYERS.PROP, 0, 'camera ignores props');
  assert.equal(MASKS.camera & LAYERS.SOLID, 0, 'camera ignores plain SOLID');
  assert.notEqual(MASKS.camera & LAYERS.WALL, 0);
  assert.notEqual(MASKS.camera & LAYERS.CAMERA, 0);
  assert.equal(MASKS.player & LAYERS.TRIGGER, 0, 'player ignores triggers');
  assert.equal(MASKS.player & LAYERS.CAMERA, 0);
  for (const l of [LAYERS.WALL, LAYERS.SOLID, LAYERS.PROP, LAYERS.NPC]) {
    assert.notEqual(MASKS.player & l, 0);
  }
  assert.equal(MASKS.npc & LAYERS.NPC, 0);
  const bits = Object.values(LAYERS);
  assert.equal(new Set(bits).size, bits.length, 'layer bits are unique');
});

test('U4 layers: camera mask passes through props, player mask passes through triggers', () => {
  const world = new ColliderWorld();
  world.add(obb(0, -2, 0.39, 0.43, 0, { id: 'stool', layers: LAYERS.PROP, yMax: 0.85 }));
  world.add(circle(0, -6, 1, { id: 'zone', layers: LAYERS.TRIGGER, yMax: 3 }));

  const cam = { radius: 0.25, height: 0.5, step: 0, mask: MASKS.camera };
  const camOut = resolveMove({ x: 0, y: 0, z: 0 }, { x: 0, z: -2.5 }, world, cam);
  near(camOut.pos.z, -2.5);
  assert.deepEqual(camOut.contacts, []);

  const walkOut = resolveMove({ x: 0, y: 0, z: -4 }, { x: 0, z: -3 }, world);
  near(walkOut.pos.z, -7);
  assert.deepEqual(walkOut.contacts, []);

  const blocked = resolveMove({ x: 0, y: 0, z: 0 }, { x: 0, z: -1.5 }, world);
  assert.deepEqual(blocked.contacts, ['stool']);
  assert.ok(blocked.pos.z > -2 + 0.43 + 0.3 - 1e-3);
});

test('U4 layers: blocks() respects step height and capsule height', () => {
  const box = obb(0, 0, 1, 1, 0, { yMin: 0, yMax: 0.2 });
  const dais = circle(0, 0, 3.4, { yMin: 0, yMax: 0.7 });
  const banner = obb(0, 0, 1, 0.05, 0, { yMin: 2.85, yMax: 5 });
  const ring = circle(0, 0, 3.4, { yMin: 3.4, yMax: 3.5 });

  assert.equal(blocks(box, 0), false, '0.2 m box is stepped over');
  assert.equal(blocks(dais, 0), true, '0.7 m dais blocks from the floor');
  assert.equal(blocks(banner, 0), false, 'banner at 2.85 m passes overhead');
  assert.equal(blocks(ring, 0), false);
  assert.equal(blocks(dais, 0.5), false, 'a body already on top is not blocked by it');
  assert.equal(blocks(banner, 1.5), true, 'a raised body would hit the banner');
  assert.equal(blocks(circle(0, 0, 1, { yMax: 0.3 }), 0), false, 'exactly step height is climbable');
  assert.equal(blocks(circle(0, 0, 1, { yMax: 0.31 }), 0), true);

  const world = new ColliderWorld();
  world.add({ ...box, id: 'box' });
  world.add({ ...banner, id: 'banner', x: 0, z: -1 });
  const over = resolveMove({ x: 0, y: 0, z: 3 }, { x: 0, z: -6 }, world);
  near(over.pos.z, -3);
});

function platformWorld(top) {
  const w = new ColliderWorld();
  w.add(
    obb(0, 0, 2, 2, 0, {
      id: 'platform',
      layers: LAYERS.SOLID | LAYERS.WALKABLE,
      yMin: 0,
      yMax: top,
    }),
  );
  return w;
}

test('U5 floor height: groundHeightAt', () => {
  const low = platformWorld(0.2);
  assert.equal(groundHeightAt(low, 5, 5, 0, 0.3), 0);
  assert.equal(groundHeightAt(low, 0, 0, 0, 0.3), 0.2);
  const high = platformWorld(0.7);
  assert.equal(groundHeightAt(high, 0, 0, 0, 0.3), 0, 'cannot step onto 0.7 m');
  assert.equal(groundHeightAt(high, 0, 0, 0.5, 0.3), 0.7, 'already high enough to step on');
  assert.equal(groundHeightAt(new ColliderWorld(), 0, 0, 0, 0.3), 0);
});

test('U5 floor height: 0.20 m platform is stepped onto, 0.70 m one blocks', () => {
  const low = walk(platformWorld(0.2), { x: -6, z: 0 }, { x: 1, z: 0 }, 60);
  const lowPeak = Math.max(...low.map((f) => f.pos.y));
  near(lowPeak, 0.2);
  assert.ok(low.some((f) => f.pos.x > 0 && f.pos.y === 0.2), 'stood on the platform');

  const high = walk(platformWorld(0.7), { x: -6, z: 0 }, { x: 1, z: 0 }, 60);
  for (const f of high) {
    assert.equal(f.pos.y, 0);
    assert.ok(f.pos.x <= -2 - 0.3 + 1e-3, `blocked at platform edge, x=${f.pos.x}`);
  }
});

test('U5 floor height: walking off a platform returns to y = 0 within 0.2 s, never below', () => {
  for (const dt of [0.05, 1 / 60, 1 / 30]) {
    const world = platformWorld(0.2);
    let pos = { x: 0, y: 0.2, z: 0 };
    let vy = 0;
    let offTime = null;
    let landedAt = null;
    for (let i = 0; i < 200 && landedAt === null; i++) {
      const out = resolveMove(pos, { x: 3.6 * dt, z: 0 }, world, { dt, vy });
      pos = out.pos;
      vy = out.vy;
      assert.ok(pos.y >= 0, `y=${pos.y} below floor`);
      if (offTime === null && pos.x > 2) offTime = i * dt;
      if (offTime !== null && pos.y === 0) landedAt = i * dt;
    }
    assert.notEqual(landedAt, null, `dt=${dt} landed`);
    const elapsed = landedAt - offTime;
    assert.ok(elapsed <= 0.2 + dt, `dt=${dt}: took ${elapsed}s`);
  }

  const snap = resolveMove({ x: 3, y: 0.2, z: 0 }, { x: 0, z: 0 }, platformWorld(0.2));
  assert.equal(snap.pos.y, 0, 'without dt the body snaps to ground');
});

test('raycastXZ: circle, rotated slab, mask, radius and vertical filter', () => {
  const world = new ColliderWorld();
  world.add(circle(0, -5, 1, { id: 'pillar', layers: LAYERS.SOLID | LAYERS.CAMERA, yMax: 7 }));
  world.add(slab(-10, -10, 10, -10, 0.2, { id: 'north', layers: LAYERS.WALL | LAYERS.CAMERA, yMax: 14 }));
  world.add(obb(3, 0, 0.5, 0.5, 0.7, { id: 'stool', layers: LAYERS.PROP, yMax: 0.85 }));

  const toPillar = raycastXZ(world, 0, 0, 0, -1, 20, MASKS.camera);
  assert.equal(toPillar.id, 'pillar');
  near(toPillar.dist, 4);
  near(toPillar.nz, 1);

  const past = raycastXZ(world, 2, 0, 0, -1, 20, MASKS.camera);
  assert.equal(past.id, 'north');
  near(past.dist, 9.9);

  const swept = raycastXZ(world, 0, 0, 0, -1, 20, MASKS.camera, { radius: 0.25 });
  near(swept.dist, 3.75);

  assert.equal(raycastXZ(world, 0, 0, 0, -1, 3, MASKS.camera), null, 'beyond maxDist');
  assert.equal(raycastXZ(world, 0, 0, 1, 0, 20, MASKS.camera), null, 'camera mask ignores stool');
  assert.equal(raycastXZ(world, 0, 0, 1, 0, 20, MASKS.player).id, 'stool');
  assert.equal(raycastXZ(world, 0, 0, 0, -1, 20, MASKS.camera, { y: 20 }), null, 'above every collider');
  assert.equal(raycastXZ(world, 0, 0, 0, 0, 20, MASKS.camera), null, 'zero direction');
});

test('ColliderWorld: registry, dynamic circles and candidates', () => {
  const world = new ColliderWorld();
  world.add(circle(0, 0, 1, { id: 'a', layers: LAYERS.SOLID }));
  world.add(circle(10, 0, 1, { id: 'npc', layers: LAYERS.NPC, dynamic: true }));
  assert.throws(() => world.add(circle(0, 0, 1, { id: 'a' })), /duplicate/);
  assert.equal(world.count, 2);
  assert.equal(world.byLayer().SOLID, 1);
  assert.equal(world.byLayer().NPC, 1);

  assert.deepEqual(world.candidates(0, 0, MASKS.player, 0.3).map((c) => c.id), ['a']);
  world.setPosition('npc', 0.5, 0);
  assert.deepEqual(
    world.candidates(0, 0, MASKS.player, 0.3).map((c) => c.id).sort(),
    ['a', 'npc'],
  );
  assert.deepEqual(world.candidates(0, 0, MASKS.npc, 0.3).map((c) => c.id), ['a']);

  const snap = world.snapshot(0);
  assert.equal(snap.count, 2);
  assert.equal(snap.list.length, 2);

  assert.equal(world.remove('a'), true);
  assert.equal(world.count, 1);
});

test('resolveMove: teleport into a collider (zero delta) resolves out deterministically', () => {
  const world = daisWorld();
  const out = resolveMove({ x: 0, y: 0, z: -2 }, { x: 0, z: 0 }, world);
  const d = Math.hypot(out.pos.x, out.pos.z + 2);
  assert.ok(d >= 3.7 - 1e-9);
  near(out.pos.x, 0, 1e-9);
  assert.ok(out.pos.z > -2, 'pushed toward +Z');

  const again = resolveMove(out.pos, { x: 0, z: 0 }, world);
  near(again.pos.x, out.pos.x, 1e-3);
  near(again.pos.z, out.pos.z, 1e-3);
});
