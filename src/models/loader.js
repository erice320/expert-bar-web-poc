import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const qs = new URLSearchParams(location.search);
/** ?models=0 => billboards only, zero GLB requests */
export const MODELS_ENABLED = qs.get('models') !== '0';
/** ?modelFail=AV-B,PROP-CHAIR => force those slots down the fallback path */
const FORCE_FAIL = new Set((qs.get('modelFail') || '').split(',').map((s) => s.trim()).filter(Boolean));
const FORCE_FAIL_URL = './models/__force_fail__.glb';

/** key -> 'off' | 'loading' | 'glb' | 'failed' | 'timeout' */
export const modelStatus = {};
const mixers = new Set();

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

const slotId = (key) => key.split('#')[0];

function load(url) {
  // /models is not content-hashed; tie the URL to the app version so patch releases refetch.
  const u = `${url}?v=${__APP_VERSION__}`;
  if (!cache.has(u)) cache.set(u, loader.loadAsync(u));
  return cache.get(u);
}

/** Safe to call early (e.g. on avatar pick); errors are swallowed. */
export function preload(key, slot) {
  if (!MODELS_ENABLED || !slot || FORCE_FAIL.has(slotId(key))) return;
  load(slot.url).catch(() => {});
}

export async function instantiate(key, slot, { timeoutMs = 15000 } = {}) {
  if (!MODELS_ENABLED || !slot) {
    modelStatus[key] = 'off';
    return null;
  }
  modelStatus[key] = 'loading';
  try {
    const url = FORCE_FAIL.has(slotId(key)) ? FORCE_FAIL_URL : slot.url;
    const gltf = await withTimeout(load(url), timeoutMs);
    const src = gltf.scene || gltf.scenes?.[0];
    if (!src) throw new Error('no scene');
    if (slot.skinned && !gltf.animations?.length) throw new Error('skinned without clips');
    const root = slot.skinned ? cloneSkinned(src) : src.clone(true);
    const pivot = normalize(root, slot);
    sanitize(pivot);
    const anim = slot.skinned ? setupAnimation(root, gltf.animations, slot) : null;
    modelStatus[key] = 'glb';
    return { object: pivot, ...anim };
  } catch (err) {
    modelStatus[key] = err?.message === 'timeout' ? 'timeout' : 'failed';
    console.warn(`[eb] model ${key} -> fallback`, err?.message || err);
    return null;
  }
}

/** Scale to slot height, stand on y=0, centre x/z, apply yawOffset. Returns a wrapper pivot. */
function normalize(root, { height, yawOffset = 0 }) {
  root.rotation.y = yawOffset;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0.01) throw new Error('degenerate bounds');
  root.scale.multiplyScalar(height / size.y);
  root.updateMatrixWorld(true);
  box.setFromObject(root, true);
  const centre = box.getCenter(new THREE.Vector3());
  root.position.x -= centre.x;
  root.position.z -= centre.z;
  root.position.y -= box.min.y;
  const pivot = new THREE.Group();
  pivot.add(root);
  return pivot;
}

/** No env map in the scene: keep PBR materials from rendering black or mirror-like. */
function sanitize(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.isSkinnedMesh) o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if ('metalness' in m) m.metalness = Math.min(m.metalness ?? 0, 0.1);
      if ('roughness' in m) m.roughness = Math.max(m.roughness ?? 1, 0.55);
    }
  });
}

function setupAnimation(root, clips, slot) {
  if (!clips?.length) return {};
  const pick = (re) => clips.find((c) => re.test(c.name));
  const strip = (clip) => {
    // Remove root motion so the model stays on the group origin.
    const c = clip.clone();
    c.tracks = c.tracks.filter((t) => !t.name.endsWith('.position'));
    return c;
  };
  const walkClip = pick(/walk/i) || clips[0];
  const idleClip = pick(/idle/i);
  const mixer = new THREE.AnimationMixer(root);
  const walkAction = mixer.clipAction(strip(walkClip));
  walkAction.play();
  let idleAction = null;
  if (idleClip && idleClip !== walkClip) {
    idleAction = mixer.clipAction(strip(idleClip));
    idleAction.play();
  }
  mixers.add(mixer);
  return { mixer, walkAction, idleAction, walkClipSpeed: slot.walkClipSpeed || 1.4 };
}

export function tickMixers(dt) {
  for (const m of mixers) m.update(dt);
}
