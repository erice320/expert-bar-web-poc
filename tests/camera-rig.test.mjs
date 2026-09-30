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
const { ColliderWorld, LAYERS, PLAYER, penetrate } = await import('../src/collision.js');
const { armClearance, stepArm, placeCamera, CAMERA_RIG } = await import('../src/camera-rig.js');

const CAM_DIST = 4.2;
const CAM_HEIGHT = 2.55;
const LIMIT = PLAYER.radius + 1e-3;

function hallWorld() {
  const scene = new THREE.Scene();
  buildWorld(scene, { load: () => new THREE.Texture() });
  const world = new ColliderWorld();
  for (const c of buildColliders(scene)) world.add(c);
  return world;
}

function orbit(player, yaw, pitch) {
  const dist = CAM_DIST * Math.cos(pitch);
  return {
    x: player.x + Math.sin(yaw) * dist,
    y: player.y + CAM_HEIGHT + Math.sin(pitch) * 1.2,
    z: player.z + Math.cos(yaw) * dist,
  };
}

/** Settled camera for a stationary player: iterate the same per-frame update as main.js. */
function settle(world, player, yaw, pitch, frames = 240) {
  const target = { x: player.x, y: player.y + 1.5, z: player.z };
  const desired = orbit(player, yaw, pitch);
  const ease = 1 - Math.pow(0.001, 1 / 60);
  const free = { ...desired };
  let arm;
  let pos;
  const track = [];
  for (let i = 0; i < frames; i++) {
    const cl = armClearance(world, target, free);
    arm = stepArm(arm, cl.allowed, ease);
    pos = placeCamera(target, free, cl, arm, HALL);
    track.push(pos);
  }
  return { pos, target, track };
}

const edge = LIMIT;
const spots = [
  [HALL.halfX - edge, 0],
  [-HALL.halfX + edge, 0],
  [0, HALL.zSouth - edge],
  [0, HALL.zNorth + edge],
  [HALL.halfX - edge, HALL.zSouth - edge],
  [-HALL.halfX + edge, HALL.zSouth - edge],
  [HALL.halfX - edge, HALL.zNorth + edge],
  [-HALL.halfX + edge, HALL.zNorth + edge],
];

test('E7 unit: camera stays inside the inset hall, outside CAMERA colliders, >= 1.0 m from the look target', () => {
  const world = hallWorld();
  const camColliders = world.list().filter((c) => c.layers & LAYERS.CAMERA);
  assert.ok(camColliders.length >= 4);
  for (const [px, pz] of spots) {
    for (let i = 0; i < 16; i++) {
      const yaw = (i / 16) * Math.PI * 2;
      for (const pitch of [-0.35, 0.18, 0.55]) {
        const { pos, target } = settle(world, { x: px, y: 0, z: pz }, yaw, pitch, 90);
        const tag = `p=(${px.toFixed(2)},${pz.toFixed(2)}) yaw=${yaw.toFixed(2)} pitch=${pitch}`;
        const inset = 0.25;
        assert.ok(Math.abs(pos.x) <= HALL.halfX - inset + 1e-9, `x ${pos.x} ${tag}`);
        assert.ok(pos.z >= HALL.zNorth + inset - 1e-9 && pos.z <= HALL.zSouth - inset + 1e-9, `z ${pos.z} ${tag}`);
        assert.ok(pos.y >= CAMERA_RIG.yMin && pos.y <= HALL.height - CAMERA_RIG.yTopGap + 1e-9, `y ${pos.y} ${tag}`);
        for (const c of camColliders) assert.equal(penetrate({ x: pos.x, z: pos.z, r: 0.01 }, c), null, `${c.id} ${tag}`);
        const d = Math.hypot(pos.x - target.x, pos.y - target.y, pos.z - target.z);
        assert.ok(d >= CAMERA_RIG.minDist - 1e-9, `dist ${d} ${tag}`);
      }
    }
  }
});

test('spawn framing is unchanged when nothing occludes', () => {
  const world = hallWorld();
  for (const player of [{ x: 0, y: 0, z: 10 }, { x: -6, y: 0, z: 2 }, { x: 8, y: 0, z: -8 }]) {
    for (const yaw of [0, 0.7, -1.9]) {
      const free = orbit(player, yaw, 0.18);
      const target = { x: player.x, y: 1.5, z: player.z };
      const cl = armClearance(world, target, free);
      const arm = stepArm(undefined, cl.allowed, 0.1);
      const pos = placeCamera(target, free, cl, arm, HALL);
      assert.ok(Math.abs(pos.x - free.x) < 1e-9 && Math.abs(pos.y - free.y) < 1e-9 && Math.abs(pos.z - free.z) < 1e-9);
    }
  }
});

test('a wall behind the player pulls the arm in to the swept-sphere clearance', () => {
  const world = hallWorld();
  const player = { x: 0, y: 0, z: 14 };
  const { pos } = settle(world, player, 0, 0.18, 60);
  // Camera wants z = 14 + 4.13; the south wall face is at 17.5, inflated by 0.25.
  assert.ok(pos.z <= HALL.zSouth - CAMERA_RIG.radius + 1e-6, `z ${pos.z}`);
  assert.ok(pos.z > 17.0, `arm should use the space available, got ${pos.z}`);
});

test('stepArm snaps in and eases out', () => {
  assert.equal(stepArm(4, 1, 0.1), 1);
  assert.equal(stepArm(undefined, 3, 0.1), 3);
  const out = stepArm(1, 4, 0.1);
  assert.ok(out > 1 && out < 4);
  let a = 1;
  for (let i = 0; i < 200; i++) a = stepArm(a, 4, 0.1);
  assert.ok(Math.abs(a - 4) < 1e-3);
});

test('no pumping: a stationary player at the wall sees < 0.02 m camera change per frame', () => {
  const world = hallWorld();
  for (const [px, pz] of spots) {
    const { track } = settle(world, { x: px, y: 0, z: pz }, 0.4, 0.18, 300);
    for (let i = track.length - 60; i < track.length; i++) {
      const a = track[i - 1];
      const b = track[i];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.02);
    }
  }
});

test('no pumping while walking along a wall', () => {
  const world = hallWorld();
  const dt = 1 / 60;
  const ease = 1 - Math.pow(0.001, dt);
  const yaw = 0;
  let arm;
  let prev;
  const free = orbit({ x: -10, y: 0, z: HALL.zSouth - LIMIT }, yaw, 0.18);
  for (let i = 0; i < 400; i++) {
    const player = { x: -10 + 3.6 * dt * i, y: 0, z: HALL.zSouth - LIMIT };
    const target = { x: player.x, y: 1.5, z: player.z };
    const d = orbit(player, yaw, 0.18);
    free.x += (d.x - free.x) * ease;
    free.y += (d.y - free.y) * ease;
    free.z += (d.z - free.z) * ease;
    const cl = armClearance(world, target, free);
    arm = stepArm(arm, cl.allowed, ease);
    const pos = placeCamera(target, free, cl, arm, HALL);
    if (prev && i > 30) assert.ok(Math.hypot(pos.x - prev.x, pos.y - prev.y, pos.z - prev.z) < 0.1, `frame ${i}`);
    prev = pos;
  }
});
