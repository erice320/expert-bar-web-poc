// Spring-arm containment for the orbit camera (docs/QA-CLEANUP-PLAN.md §5.8).
// Pure math over a ColliderWorld; no renderer dependency, so it runs in Node tests.
//
// The arm is horizontal: walls are full-height slabs, so a ray in XZ from the look
// target toward the free-orbit camera finds the constraint. Height is kept, so an
// unoccluded camera is exactly the legacy framing.

import { MASKS } from './collision.js';

export const CAMERA_RIG = {
  radius: 0.25,
  minDist: 1.0,
  hallInset: 0.3,
  yMin: 0.4,
  yTopGap: 0.3,
  /** Extra height at full pull-in, so a wall-hugging camera looks down at the player instead of hovering at head level. */
  rise: 1.5,
};

/**
 * Cast the horizontal arm from `target` ({x, y, z}) toward the free-orbit camera
 * `free` against MASKS.camera with a swept sphere. Returns the free arm length
 * `len`, the raw clearance `allowed` (<= len) and the unit direction (ux, uz).
 */
export function armClearance(world, target, free, opts = {}) {
  const radius = opts.radius ?? CAMERA_RIG.radius;
  const dx = free.x - target.x;
  const dz = free.z - target.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { len, allowed: len, ux: 0, uz: 0 };
  const ux = dx / len;
  const uz = dz / len;
  const hit = world.raycastXZ(target.x, target.z, ux, uz, len, opts.mask ?? MASKS.camera, { radius });
  return { len, allowed: hit ? hit.dist : len, ux, uz };
}

/**
 * Snap in when the clearance shrinks; ease out (rate `k` per call, already
 * dt-scaled by the caller) when it grows. Returns the new smoothed arm length.
 */
export function stepArm(prevArm, allowed, k) {
  if (prevArm === undefined || !Number.isFinite(prevArm) || allowed <= prevArm) return allowed;
  return prevArm + (allowed - prevArm) * k;
}

/**
 * Place the camera on the arm, then enforce the hall box and the minimum distance.
 * `arm` is the smoothed horizontal length from `stepArm` (clamped to the free length).
 */
export function placeCamera(target, free, clearance, arm, hall, opts = {}) {
  const inset = opts.hallInset ?? CAMERA_RIG.hallInset;
  const minDist = opts.minDist ?? CAMERA_RIG.minDist;
  const yMin = opts.yMin ?? CAMERA_RIG.yMin;
  const yMax = hall.height - (opts.yTopGap ?? CAMERA_RIG.yTopGap);

  const h = Math.min(arm, clearance.len);
  let x = target.x + clearance.ux * h;
  let z = target.z + clearance.uz * h;
  const pulled = clearance.len > 1e-6 ? 1 - Math.min(1, h / clearance.len) : 0;
  let y = free.y + pulled * (opts.rise ?? CAMERA_RIG.rise);

  x = Math.min(Math.max(x, -hall.halfX + inset), hall.halfX - inset);
  z = Math.min(Math.max(z, hall.zNorth + inset), hall.zSouth - inset);

  const dy = y - target.y;
  const hd = Math.hypot(x - target.x, z - target.z);
  if (Math.hypot(hd, dy) < minDist) {
    // Cannot back off horizontally (wall behind the player), so rise instead.
    y = target.y + Math.sqrt(Math.max(0, minDist * minDist - hd * hd));
  }
  y = Math.min(Math.max(y, yMin), yMax);

  return { x, y, z };
}
