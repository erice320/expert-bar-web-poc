/**
 * GLB slot manifest (data only). A JS module rather than fetched JSON because the
 * production nginx SPA fallback would turn a missing JSON file into HTML.
 *
 * yawOffset (rad): app expects +Z forward; tune per asset (0, Math.PI, ±Math.PI/2).
 * skinned: false for static meshes (procedural bob/sway instead of a rig).
 * walkClipSpeed: ground speed (m/s) the walk clip was authored for.
 * Remove an entry (or leave the file absent) to keep the billboard/no prop for that slot.
 */
export const CHARACTER_SLOTS = {
  'AV-A': { url: './models/characters/av-a.glb', height: 1.7, yawOffset: 0, skinned: true, walkClipSpeed: 1.4 },
  'AV-B': { url: './models/characters/av-b.glb', height: 1.8, yawOffset: 0, skinned: true, walkClipSpeed: 1.4 },
  'AV-C': { url: './models/characters/av-c.glb', height: 1.75, yawOffset: 0, skinned: true, walkClipSpeed: 1.4 },
  'AV-D': { url: './models/characters/av-d.glb', height: 1.8, yawOffset: 0, skinned: true, walkClipSpeed: 1.4 },
};

export const PROP_SLOTS = {
  'PROP-CHAIR': { url: './models/props/lounge-chair.glb', height: 0.85, yawOffset: 0 },
  'PROP-PLANTER': { url: './models/props/planter.glb', height: 1.3, yawOffset: 0 },
};
