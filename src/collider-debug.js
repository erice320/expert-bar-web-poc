import * as THREE from 'three';
import { LAYERS, PLAYER } from './collision.js';

const COLORS = {
  wall: 0x3fa9ff,
  solid: 0xff4d4d,
  prop: 0xffa726,
  npc: 0x4cd964,
  other: 0xffffff,
  contact: 0xffff00,
};

function layerColor(layers) {
  if (layers & LAYERS.WALL) return COLORS.wall;
  if (layers & LAYERS.SOLID) return COLORS.solid;
  if (layers & LAYERS.PROP) return COLORS.prop;
  if (layers & LAYERS.NPC) return COLORS.npc;
  return COLORS.other;
}

function ringPoints(cx, cz, r, y, segments = 48) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    pts.push(cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r, cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r);
  }
  return pts;
}

function footprintPoints(c, y) {
  if (c.shape === 'circle') return ringPoints(c.x, c.z, c.r, y);
  const corners = [
    [-c.hx, -c.hz],
    [c.hx, -c.hz],
    [c.hx, c.hz],
    [-c.hx, c.hz],
  ].map(([lx, lz]) => [c.x + lx * c.cos + lz * c.sin, c.z - lx * c.sin + lz * c.cos]);
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    pts.push(ax, y, az, bx, y, bz);
  }
  return pts;
}

/** `?debug=colliders`: outlines every collider at the floor and at its top, plus the player ring. */
export function createColliderDebug(scene, world) {
  const group = new THREE.Group();
  group.name = 'collider-debug';
  const lines = new Map();

  for (const c of world.list()) {
    const pts = [...footprintPoints(c, 0.02), ...footprintPoints(c, Math.max(c.yMax, 0.05))];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: layerColor(c.layers), depthTest: false, transparent: true });
    const seg = new THREE.LineSegments(geo, mat);
    seg.renderOrder = 999;
    seg.userData.baseColor = layerColor(c.layers);
    lines.set(c.id, seg);
    group.add(seg);
  }

  const capsule = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ringPoints(0, 0, PLAYER.radius, 0.03, 24), 3)),
    new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false })
  );
  capsule.renderOrder = 999;
  group.add(capsule);
  scene.add(group);

  return {
    group,
    update(contacts, pos) {
      const hit = new Set(contacts);
      for (const [id, seg] of lines) seg.material.color.setHex(hit.has(id) ? COLORS.contact : seg.userData.baseColor);
      capsule.position.set(pos.x, pos.y, pos.z);
    },
  };
}
