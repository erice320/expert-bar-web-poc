import * as THREE from 'three';
import { LAYERS, circle, obb, slab } from './collision.js';
import { HALL } from './world.js';

const WALL_THICKNESS = 1;
const MAX_TILT_RAD = (1 * Math.PI) / 180;

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _dir = new THREE.Vector3();

function worldYaw(quat) {
  _dir.set(0, 0, 1).applyQuaternion(quat);
  return Math.atan2(_dir.x, _dir.z);
}

function assertUpright(quat, id) {
  _dir.set(0, 1, 0).applyQuaternion(quat);
  const tilt = Math.acos(Math.min(1, Math.max(-1, _dir.y)));
  if (tilt > MAX_TILT_RAD) throw new Error(`collider "${id}" is tilted ${(tilt * 180) / Math.PI}deg`);
}

function fromMesh(mesh) {
  const tag = mesh.userData.collider;
  const geo = mesh.geometry;
  const id = tag.id ?? mesh.name ?? mesh.uuid;
  mesh.matrixWorld.decompose(_pos, _quat, _scale);
  assertUpright(_quat, id);

  const layers = tag.layers ?? LAYERS.SOLID;
  const type = geo.type;
  const p = geo.parameters ?? {};
  const height = (type === 'CylinderGeometry' || type === 'BoxGeometry' ? p.height : 0) * _scale.y;
  const opts = { id, layers, yMin: _pos.y - height / 2, yMax: _pos.y + height / 2, tag: tag.tag };
  const xzScale = Math.max(Math.abs(_scale.x), Math.abs(_scale.z));

  if (tag.shape === 'circle' || (tag.shape === 'auto' && type === 'CylinderGeometry')) {
    const r = tag.radius ?? Math.max(p.radiusTop, p.radiusBottom) * xzScale;
    return circle(_pos.x, _pos.z, r, opts);
  }
  if (type === 'BoxGeometry') {
    return obb(
      _pos.x,
      _pos.z,
      (p.width * Math.abs(_scale.x)) / 2,
      (p.depth * Math.abs(_scale.z)) / 2,
      worldYaw(_quat),
      opts
    );
  }
  throw new Error(`collider "${id}": unsupported geometry ${type} for shape "${tag.shape}"`);
}

/** Wall slabs whose inner faces sit exactly on the HALL constants. */
function hallWalls(hall) {
  const t = WALL_THICKNESS;
  const layers = LAYERS.WALL | LAYERS.CAMERA;
  const o = (id) => ({ id, layers, yMin: 0, yMax: hall.height });
  const xo = hall.halfX + t;
  const zn = hall.zNorth - t;
  const zs = hall.zSouth + t;
  return [
    slab(-hall.halfX - t / 2, zn, -hall.halfX - t / 2, zs, t, o('wall-west')),
    slab(hall.halfX + t / 2, zn, hall.halfX + t / 2, zs, t, o('wall-east')),
    slab(-xo, hall.zNorth - t / 2, xo, hall.zNorth - t / 2, t, o('wall-north')),
    slab(-xo, hall.zSouth + t / 2, xo, hall.zSouth + t / 2, t, o('wall-south')),
  ];
}

/**
 * Static colliders for the hall: every mesh under `root` carrying `userData.collider`,
 * plus wall slabs derived from `hall`. Returns an array; register with `ColliderWorld.add`.
 */
export function buildColliders(root, hall = HALL) {
  root.updateMatrixWorld(true);
  const out = [];
  root.traverse((obj) => {
    if (obj.isMesh && obj.userData.collider) out.push(fromMesh(obj));
  });
  return [...out, ...hallWalls(hall)];
}
