# Expert Bar Web POC — v0.3.0 "GLB avatars" plan

Owner of execution: Sonnet 5.5 (step-by-step). Author: Opus 5.5 (planning only).
Scope: replace photo-billboard avatars with Higgsfield-generated 3D GLB characters and add 1–2 GLB props
in the existing Three.js walkable hall, shipped to **https://stream.revioai.bot/** as **v0.3.0**.
Out of scope: Unreal / Pixel Streaming, multiplayer, physics/collision, control or login rewrites.

Companion checklist: [`CHECKLIST.md`](./CHECKLIST.md).

---

## 0. Facts established while planning (read first)

| Fact | Evidence | Consequence |
|---|---|---|
| This GitHub repo (`erice320/expert-bar-web-poc`) contains **only built output** on `gh-pages` (`index.html`, `assets/index-*.js`, `textures/`). No `package.json`, `src/`, `public/`, or deploy script. | `git ls-remote` → only `gh-pages`. | The Vite **source tree lives elsewhere** (the Revay/Higgsfield box). Step 0 must locate it. Do **not** patch the minified bundle. |
| The live site is **newer than `gh-pages`** (host badge `#host-badge`, `LIVE` pill, `theme-color` meta, new fineprint; bundle `index-B8TAytzd.js` vs repo `index-C6mVm6nT.js`). | `curl https://stream.revioai.bot/` diffed against repo `index.html`. | Build from the source tree that produced the live bundle, not from `gh-pages`. |
| Live server is `nginx/1.24.0 (Ubuntu)` with an **SPA fallback**: *any* missing path returns `200 text/html` (`index.html`). | `curl -I https://stream.revioai.bot/models/` → `200 text/html`. | A missing GLB will **not** 404. The fallback must treat "parse failed" as failure, and acceptance checks must verify `glTF` magic bytes, not HTTP status. |
| Three.js **r170** (`REVISION "170"`), no GLTFLoader in the bundle yet. Vite `base` is relative (`./assets/...`, `./textures/...`). | Bundle grep. | Use `three/examples/jsm/...` imports that match r170. All new URLs must be **relative** (`./models/...`) so both the droplet root and GitHub Pages subpath work. |
| No version string exists anywhere in the app today. | Bundle grep for `v0.` → none. | v0.3.0 plumbing is net-new (section 5). |
| Current avatar source images `textures/avatar-av-{a..d}.png` are 165–234×700 px, **back/over-shoulder views, hands in pockets, alpha holes**. | Inspected PNGs. | They are poor image-to-3D inputs. Generate clean **front-facing full-body reference images first** (section 3.1), using the old PNGs only as identity/outfit references. |

### Where things live in the current app (use these string anchors to find code in the real source)

Minified names below are from the live bundle and will differ in source; grep for the **anchor strings**.

| Behaviour | Anchor strings to grep in source | Notes |
|---|---|---|
| Avatar presets array (AV-A..AV-D) | `"AV-A"`, `avatar-av-a.png`, `hairStyle` | Fields: `id, name, desc, skin, hair, hairStyle, blazer, shirt, pants, shoes, lanyard, accent, fabric, skinMap, photo, thumb, glasses?` |
| Avatar factory (player + NPCs) | `"photoPlate"`, `"body"`, `userData.leftLeg` | Builds a `Group`: hidden procedural capsule body, a `PlaneGeometry` photo billboard (`photoPlate`, 1.78 m tall), an **invisible capsule shadow proxy** (`colorWrite:false`, `castShadow`), and a name-tag `Sprite` at y=2.15. Returns group with `userData.{preset, body, photoPlate, leftLeg, rightLeg, leftArm, rightArm}`. |
| Per-frame limb/bob animator | `photoPlate.position.y` + `Math.sin(... * 10) * 0.02` | Signature ≈ `animate(group, moving, t)`. Called for the player and for each NPC each frame. |
| Hall builder | `hall-backdrop.jpg`, `ringHero`, `bounds: 15` | Returns `{ stations, bounds: 15, ringHero }`. Central round bar: `CylinderGeometry(3.2, 3.4, 0.7)` at `(0, 0.35, -2)`. Pillars at radius 5.5 around `(0,-2)`, angles `π/4 + k·π/2`. |
| Station builder | `desk-navy.jpg`, `radius: 4.5` | Station A at `(-6.5, 0, 5)`, rotY `0.15π`; Station D at `(6.5, 0, 5)`, rotY `-0.15π`. Returns `{ id, title, product, panelUrl, blurb, position, radius: 4.5, group }`. |
| "Enter hall" (after login) | `__ebTeleport` | Builds hall, spawns player at `(0,0,10)`, spawns 3 NPCs from the non-selected presets (one orbit path r=7.2 around bar, two ping-pong paths). |
| Player update (dual-stick OTS) | `window.__eb =` | Moves player at 3.6 m/s, `rotation.y = atan2(dir.x, dir.z)` ⇒ **models must face +Z**. Writes debug state to `window.__eb`. |
| NPC update | iterates NPC list, `e.idle && Math.sin(e.t * 0.7) > 0.6` | Sets `rotation.y = atan2(dx, dz)` from path delta. |
| Main loop | `requestAnimationFrame`, `Math.min(clock.getDelta(), 0.05)` | Render loop; the place to tick `AnimationMixer`s. |
| Login | `eb_display_name`, `eb_avatar`, `eb_demo_code`, `#enter-btn` | **Do not change behaviour.** |

---

## 1. Goals, non-goals, and definition of done

**Goal:** On stream.revioai.bot, the player and NPCs are volumetric, textured 3D people (visible from any
camera angle, casting real shadows), and the hall has 1–2 GLB props. It should look obviously different from
v0.2's flat photo cards.

**Must keep (regression-guarded):** login flow + localStorage restore, dual-stick OTS (left stick move, right-drag look,
independent yaw/pitch, no spin), D-pad, WASD/QE keyboard, Stations A/D proximity + Interact + panel open/close
(close button reachable above the look-zone on mobile), Escape/E/Space shortcuts, name tags.

**Non-goals (do not do):** Unreal/Pixel Streaming; multiplayer; collisions; refactoring controls/camera; new
post-processing, environment maps, or lighting overhaul; Draco/KTX2 (these need hosted wasm/transcoders); a
framework or bundler migration; changing nginx unless section 7.3 proves it is necessary.

**Done =** every box in `CHECKLIST.md` ticked, v0.3.0 live on the droplet, `gh-pages` mirrored, PR(s) up.

---

## 2. Asset slots (lean set: 4 characters target / 2 minimum, 2 props)

All shipped files live under **`public/models/`**, which Vite copies to `dist/models/` and the site serves as `./models/...`.

| Slot key | Purpose | Shipped file (source tree) | Served URL | Target height | Tris budget | File budget | Required? |
|---|---|---|---|---|---|---|---|
| `AV-A` | Alex Rivera | `public/models/characters/av-a.glb` | `./models/characters/av-a.glb` | 1.70 m | ≤ 25k | ≤ 2.5 MB | target |
| `AV-B` | Morgan Hale | `public/models/characters/av-b.glb` | `./models/characters/av-b.glb` | 1.80 m | ≤ 25k | ≤ 2.5 MB | target |
| `AV-C` | Jordan Quinn | `public/models/characters/av-c.glb` | `./models/characters/av-c.glb` | 1.75 m | ≤ 25k | ≤ 2.5 MB | target |
| `AV-D` | Casey Brooks | `public/models/characters/av-d.glb` | `./models/characters/av-d.glb` | 1.80 m | ≤ 25k | ≤ 2.5 MB | target |
| `PROP-CHAIR` | Lounge chair ×4 around central bar | `public/models/props/lounge-chair.glb` | `./models/props/lounge-chair.glb` | 0.85 m | ≤ 8k | ≤ 1.0 MB | yes (1 prop minimum) |
| `PROP-PLANTER` | Tall planter ×4 flanking Stations A/D | `public/models/props/planter.glb` | `./models/props/planter.glb` | 1.30 m | ≤ 10k | ≤ 1.2 MB | optional (2nd prop) |

- **Minimum shippable:** 2 characters + `PROP-CHAIR`. Any slot without a valid GLB silently keeps the v0.2 billboard (characters) or is simply absent (props). Priority if credits/time are short: `AV-A`, `AV-D`, `AV-B`, `AV-C`.
- **Total `dist/models/` ≤ 12 MB.** Scene triangles as reported by `renderer.info.render.triangles` ≤ 400k. That figure
  **includes the shadow pass**, which roughly doubles caster triangles: 4×20k characters + 4×6k chairs + 4×8k planters
  ≈ 136k, ×2 ≈ 272k, plus the hall.
- Raw (unoptimized) Higgsfield outputs are **not** deployed and **not** committed. They go in `assets-src/higgsfield/raw/` (gitignored). Only the small reference PNGs and `jobs.json` are committed.

```
assets-src/higgsfield/
  jobs.json                 # committed: every job id, model, params, seed, input media id, output URL
  refs/av-a-front.png ...   # committed: the generated front-view reference images (≤ 1.5 MB each)
  refs/lounge-chair.png, refs/planter.png
  raw/*.glb                 # gitignored: raw downloads from Higgsfield
public/models/characters/av-{a,b,c,d}.glb   # optimized, shipped
public/models/props/{lounge-chair,planter}.glb
public/version.json                          # shipped, see section 5
```

Add to `.gitignore`: `assets-src/higgsfield/raw/`.

---

## 3. Higgsfield generation spec (runs on the box that has the Higgsfield MCP)

Rules: create one Higgsfield project/folder `expert-bar-v0.3` and reuse its `folder_id` on every call. **Preflight every
call with `get_cost: true`**, log the cost in `jobs.json`, then submit. Do not auto-resubmit after a transport
timeout; poll the returned job id (`job_status` / `jobs_wait`). Download outputs to `assets-src/higgsfield/raw/`.

### 3.1 Step A: front-view reference images (`generate_image`)

One image per slot. Upload the old cutout (`textures/avatar-av-x.png`) with `media_upload`/`media_confirm` and pass it
as the identity/outfit reference if the chosen image model accepts references; otherwise use text only.
Use `models_explore(action:'recommend', type:'image', query:'full-body character reference sheet, front view, for image-to-3D')` to pick the model.

Hard requirements for **every** character image (put these in each prompt):
`full body head to toe including shoes, front-facing, camera at chest height, orthographic-looking, neutral A-pose with arms
held ~30° away from the torso, hands open and visible (not in pockets), feet shoulder-width apart, plain light-grey
seamless background, soft even studio lighting, no harsh shadows, no props held, sharp focus, photoreal, portrait 2:3, ≥ 1024×1536`.

| Slot | Character prompt prefix (then append the hard requirements) |
|---|---|
| AV-A | Adult woman, short sleek black bob haircut, warm light-brown skin, fitted charcoal blazer over white blouse, black tailored trousers, white leather sneakers, teal conference lanyard with badge |
| AV-B | Adult man in his 50s, salt-and-pepper short hair, light skin, navy blazer, crisp white open-collar shirt, dark navy trousers, dark brown dress shoes, teal conference lanyard with badge |
| AV-C | Adult non-binary person, curly shoulder-length auburn hair, medium skin, olive utility jacket over black crew-neck tee, dark indigo jeans, dark brown boots, teal conference lanyard with badge |
| AV-D | Adult man, close skin-fade haircut with short dark hair, tan skin, thin metal-frame glasses, soft light-blue button-down shirt tucked in, grey chinos, black loafers, teal conference lanyard with badge |

Props (same hard rules minus the pose ones; product-shot, 3/4 front view, plain light-grey background, 1:1 ≥ 1024²):

| Slot | Prompt |
|---|---|
| PROP-CHAIR | Modern conference-lounge accent chair, low back, light-grey upholstered seat, brushed steel legs, clean minimal design, single object centred |
| PROP-PLANTER | Tall matte white cylindrical floor planter with a lush fiddle-leaf fig plant, about 1.3 m tall, single object centred |

Reject and regenerate an image if any of these is true: body cropped, hands hidden, arms fused to torso, extra limbs,
text or logos baked large on clothing, or a busy background. Save accepted images to `assets-src/higgsfield/refs/`.

### 3.2 Step B: image to GLB (`generate_3d`)

**Characters: rigged with a walk clip, one job each.** Model `image_to_3d` (Meshy):

```json
{
  "model": "image_to_3d",
  "folder_id": "<expert-bar-v0.3 folder>",
  "medias": [{ "value": "<Step A image job_id or media_id>", "role": "image" }],
  "should_texture": true,
  "enable_pbr": false,
  "should_remesh": true,
  "topology": "triangle",
  "target_polycount": 20000,
  "symmetry_mode": "auto",
  "pose_mode": "a-pose",
  "enable_rigging": true,
  "rigging_height_meters": 1.75,
  "enable_animation": true,
  "animation_action_id": 30,
  "seed": 3100
}
```

(`30` = Casual_Walk. Use the slot's height from section 2 for `rigging_height_meters`.) If the job returns several
files (e.g. base mesh, rigged mesh, animated mesh), keep the one that has **mesh + skin + ≥1 animation + baseColor
texture** as `raw/av-x.glb`, and also keep the static base mesh as `raw/av-x-static.glb` for the decision tree below.

**Props: static, no rig.** Model `image_to_3d`, `should_texture: true`, `enable_pbr: false`, `should_remesh: true`,
`target_polycount: 6000` (chair) / `8000` (planter), `enable_rigging: false`, `seed: 3200`.
If the result is poor, retry once with `tripo_h3_1_image_to_3d` (`texture: true`, `pbr: false`, `face_limit: 8000`,
`orientation: "align_image"`).

**Per-character decision tree (after Step C inspection):**
1. Rigged + walk looks right (no broken arms/armpits, feet on ground) ⇒ ship rigged file. **Preferred.**
2. Rig is broken but mesh is good ⇒ re-run Step A **without** the A-pose wording (natural standing pose, arms
   relaxed at sides, hands visible), then `image_to_3d` with `enable_rigging:false`, `pose_mode` omitted ⇒ ship static
   mesh (runtime uses procedural bob/sway). Never ship a static A-pose statue.
3. Mesh itself is bad after 2 attempts ⇒ ship nothing for that slot (billboard fallback). Record the reason in `jobs.json`.

`jobs.json` entry shape:

```json
{ "slot": "AV-A", "step": "image_to_3d", "model": "image_to_3d", "job_id": "...", "input": "...",
  "params": { "...": "..." }, "cost_credits": 0, "output_url": "...", "raw_file": "raw/av-a.glb",
  "decision": "rigged|static|rejected", "notes": "" }
```

### 3.3 Step C: optimize and inspect (`@gltf-transform/cli`, pinned)

```bash
npx -y @gltf-transform/cli@4 inspect assets-src/higgsfield/raw/av-a.glb   # record tris, textures, skins, animations
npx -y @gltf-transform/cli@4 optimize assets-src/higgsfield/raw/av-a.glb public/models/characters/av-a.glb \
  --compress meshopt --texture-compress webp --texture-size 1024 --simplify false
# props: allow simplify, smaller textures
npx -y @gltf-transform/cli@4 optimize assets-src/higgsfield/raw/lounge-chair.glb public/models/props/lounge-chair.glb \
  --compress meshopt --texture-compress webp --texture-size 1024
npx -y @gltf-transform/cli@4 inspect public/models/characters/av-a.glb
```

- `--simplify false` on characters because simplification can corrupt skin weights; the triangle budget is set at generation time with `target_polycount`.
- If a file is still over budget: re-run with `--texture-size 512`. If it's still over, regenerate with a lower `target_polycount`.
- If `optimize` errors on a skinned file, fall back to `--compress false` (the runtime meshopt decoder is harmless when unused).
- Verify each shipped file: first 4 bytes are `glTF` (`head -c 4 file | xxd`), size is within budget, `inspect` shows the expected skins and animations.

---

## 4. Runtime integration (Three.js r170)

New code is two small modules plus surgical hooks in existing functions. No rewrites.

### 4.1 `src/models/manifest.js` (new, data only)

A JS module, **not** a fetched JSON file, because the SPA fallback would turn a missing JSON into HTML.

```js
export const CHARACTER_SLOTS = {
  'AV-A': { url: './models/characters/av-a.glb', height: 1.70, yawOffset: 0, skinned: true, walkClipSpeed: 1.4 },
  'AV-B': { url: './models/characters/av-b.glb', height: 1.80, yawOffset: 0, skinned: true, walkClipSpeed: 1.4 },
  'AV-C': { url: './models/characters/av-c.glb', height: 1.75, yawOffset: 0, skinned: true, walkClipSpeed: 1.4 },
  'AV-D': { url: './models/characters/av-d.glb', height: 1.80, yawOffset: 0, skinned: true, walkClipSpeed: 1.4 },
};
export const PROP_SLOTS = {
  'PROP-CHAIR':   { url: './models/props/lounge-chair.glb', height: 0.85, yawOffset: 0 },
  'PROP-PLANTER': { url: './models/props/planter.glb',      height: 1.30, yawOffset: 0 },
};
```

- `yawOffset` (radians) fixes GLBs that face −Z/±X; the app expects **+Z forward**. Tune it visually (0, `Math.PI`, `±Math.PI/2`).
- `skinned: false` for any slot shipped via decision-tree branch 2.
- `walkClipSpeed` is the ground speed (m/s) the walk clip was authored for; it's used to scale playback so feet don't slide.
- Remove a slot's entry (or leave the file absent) to force the billboard for that slot.

### 4.2 `src/models/loader.js` (new, ~120 lines)

Responsibilities: one shared `GLTFLoader` with the meshopt decoder, a per-URL promise cache, a timeout,
validation, normalization (scale/ground/centre/yaw), cloning (with `SkeletonUtils` for skinned meshes), material
sanitizing, mixer setup, status reporting, and URL-param switches.

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const qs = new URLSearchParams(location.search);
export const MODELS_ENABLED = qs.get('models') !== '0';                       // ?models=0 => billboards only, zero GLB requests
const FORCE_FAIL = new Set((qs.get('modelFail') || '').split(',').filter(Boolean)); // ?modelFail=AV-B,PROP-CHAIR
export const modelStatus = {};   // key -> 'off' | 'loading' | 'glb' | 'failed' | 'timeout'
const mixers = new Set();

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();         // url -> Promise<GLTF>

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export function preload(slot) {  // safe to call early (e.g. on avatar pick); errors are swallowed here
  if (!MODELS_ENABLED || !slot) return;
  load(slot.url).catch(() => {});
}
function load(url) {
  const u = `${url}?v=${__APP_VERSION__}`;       // cache-bust: /models is not content-hashed
  if (!cache.has(u)) cache.set(u, loader.loadAsync(u));
  return cache.get(u);
}

export async function instantiate(key, slot, { timeoutMs = 15000 } = {}) {
  if (!MODELS_ENABLED || !slot) { modelStatus[key] = 'off'; return null; }
  modelStatus[key] = 'loading';
  try {
    const url = FORCE_FAIL.has(key.split('#')[0]) ? './models/__force_fail__.glb' : slot.url;
    const gltf = await withTimeout(load(url), timeoutMs);
    const src = gltf.scene || gltf.scenes?.[0];
    if (!src) throw new Error('no scene');
    const root = slot.skinned ? cloneSkinned(src) : src.clone(true);
    const pivot = normalize(root, slot);
    sanitize(pivot);
    if (slot.skinned && !gltf.animations?.length) throw new Error('skinned without clips');
    const anim = slot.skinned ? setupAnimation(root, gltf.animations, slot) : null;
    modelStatus[key] = 'glb';
    return { object: pivot, ...anim };
  } catch (err) {
    modelStatus[key] = err?.message === 'timeout' ? 'timeout' : 'failed';
    console.warn(`[eb] model ${key} -> fallback`, err);
    return null;
  }
}
```

`normalize(root, { height, yawOffset })`:
1. `root.rotation.y = yawOffset; root.updateMatrixWorld(true);`
2. `box = new THREE.Box3().setFromObject(root, true)` (precise, so it handles skinned meshes). Throw if `size.y` is not finite or `<= 0.01`. That catches empty or garbage meshes.
3. `root.scale.multiplyScalar(height / size.y)`, recompute the box, then shift `root.position` so `box.min.y = 0` and the x/z centre is 0.
4. Wrap in `const pivot = new THREE.Group()` and return the pivot. The avatar code only ever touches the pivot.

`sanitize(obj)`: for every mesh, set `castShadow = receiveShadow = true`. For each material, `metalness = Math.min(metalness ?? 0, 0.1)` and `roughness = Math.max(roughness ?? 1, 0.55)`, because the scene has no env map and metallic surfaces would render black. Leave `map.colorSpace` as GLTFLoader set it (sRGB). For `SkinnedMesh`, set `frustumCulled = false` (only 4 of them; this avoids pop-out from stale bounds).

`setupAnimation(root, clips, slot)`:
- Return `{}` if there are no clips.
- Pick `walk = clips.find(c => /walk/i.test(c.name)) || clips[0]` and `idle = clips.find(c => /idle/i.test(c.name))` (may be undefined).
- **Strip root motion** so the model doesn't drift away from the group origin: `clip.tracks = clip.tracks.filter(t => !t.name.endsWith('.position'))` on a `clip.clone()`.
- `mixer = new THREE.AnimationMixer(root)`. Play `walkAction` (and `idleAction` if present), add the mixer to `mixers`, and return `{ mixer, walkAction, idleAction, walkClipSpeed: slot.walkClipSpeed }`.

Also export:

```js
export function tickMixers(dt) { for (const m of mixers) m.update(dt); }
export function disposeMixer(m) { mixers.delete(m); }   // not currently needed; avatars live for the session
```

Vite: add `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` (section 5). No new runtime npm deps, since `three` already ships these files.

### 4.3 Hooks in existing code (surgical)

**a) Avatar factory (anchor `"photoPlate"`).** Keep it building the billboard exactly as today, so the billboard *is* the
fallback and appears instantly. One tiny addition: store the invisible shadow-proxy capsule as
`group.userData.shadowProxy`. The factory does **not** load GLBs itself. "Enter hall" calls `upgradeAvatar` (below)
on the returned group, so load order stays controlled in one place (4.3e). Never `await` it on the login path.

```js
import { CHARACTER_SLOTS } from './models/manifest.js';
import { instantiate } from './models/loader.js';

// statusKey: preset.id for the player ('AV-A'), `${preset.id}#npc` for NPCs ('AV-B#npc').
export function upgradeAvatar(group, preset, statusKey = preset.id) {
  const slot = CHARACTER_SLOTS[preset.id];
  if (!slot) return Promise.resolve(null);
  return instantiate(statusKey, slot).then((res) => {
    if (!res) return null;                                         // fallback: billboard stays
    const u = group.userData;
    if (u.photoPlate) u.photoPlate.visible = false;
    if (u.body) u.body.visible = false;
    if (u.shadowProxy) u.shadowProxy.visible = false;
    res.object.name = 'model3d';
    group.add(res.object);
    u.model3d = res;
    if (res.idleAction) { res.idleAction.setEffectiveWeight(1); res.walkAction.setEffectiveWeight(0); }
    return res;
  });
}
```

"Enter hall" calls `upgradeAvatar(player, preset)` for the player and `upgradeAvatar(npc, preset, preset.id + '#npc')`
for each NPC. In the loader,
`FORCE_FAIL` must match on the slot id before `#`: `FORCE_FAIL.has(key.split('#')[0])`. That way `?modelFail=AV-B` fails
every AV-B instance. The same preset can appear on two NPCs (`t[2] || t[0]`); both share one download through the
cache and get independent clones.

**b) Per-frame animator (anchor `photoPlate.position.y`).** Add an optional 4th arg `speed` (m/s). Keep the existing
limb/billboard code path as it is. Add at the top:

```js
const m = group.userData.model3d;
if (m) {
  const pivot = m.object;
  if (m.mixer && m.walkAction) {
    const target = moving ? 1 : 0;
    const w = THREE.MathUtils.lerp(m.walkAction.getEffectiveWeight(), target, 0.2);
    if (m.idleAction) { m.walkAction.setEffectiveWeight(w); m.idleAction.setEffectiveWeight(1 - w); m.walkAction.timeScale = THREE.MathUtils.clamp((speed || 1.4) / m.walkClipSpeed, 0.6, 2.4); }
    else { m.walkAction.setEffectiveWeight(1); m.walkAction.timeScale = moving ? THREE.MathUtils.clamp((speed || 1.4) / m.walkClipSpeed, 0.6, 2.4) : THREE.MathUtils.lerp(m.walkAction.timeScale, 0, 0.25); }
    pivot.position.y = 0;
    pivot.scale.y = 1 + (moving ? 0 : Math.sin(t * 1.6) * 0.004);   // breathing when idle
  } else {
    // static mesh: procedural motion
    pivot.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.035 : 0;
    pivot.rotation.z = moving ? Math.sin(t * 9) * 0.035 : Math.sin(t * 1.2) * 0.008;
    pivot.rotation.x = moving ? 0.05 : 0;
  }
  return;   // limbs/billboard are hidden; skip their animation
}
```

(With no idle clip, the walk freezes near its current pose when the character stops, plus breathing. That's acceptable for v0.3.0. A dedicated idle clip is a v0.3.x follow-up; see section 9.)

**c) Callers pass speed.** Player: `3.6` when moving, else `0`. NPCs: `distance(prev, next) / dt`, which the updater
already has (`dx, dz`). Only the call signature changes.

**d) Main loop.** Call `tickMixers(dt)` once per frame before `renderer.render`, **unconditionally** (also while the
station panel is open).

**e) Load order (avoid stalling mobile).** In "enter hall" (anchor `__ebTeleport`), the player's `upgradeAvatar` fires
first. Kick off NPC upgrades and props only after the player's promise settles (success *or* fallback), or after
2.5 s, whichever is first: `Promise.race([playerUpgrade, sleep(2500)]).then(startDeferred)`. NPC billboards
are created immediately as today; only their GLB upgrade is deferred. Optional nicety: in the avatar picker click handler, call
`preload(CHARACTER_SLOTS[preset.id])` so the player's GLB is often cached by the time "Enter" is pressed. Login
must never wait on a GLB.

**f) Props, placed from "enter hall" after the hall builder (anchor `hall-backdrop.jpg`) returns.** New helper:

```js
import { PROP_SLOTS } from './models/manifest.js';
import { instantiate } from './models/loader.js';

// placements: [{ parent, x, z, faceX, faceZ }], coordinates in the parent's local space.
export function placeProps(key, placements) {
  return instantiate(key, PROP_SLOTS[key]).then((res) => {
    if (!res) return;                                  // fallback: prop simply absent
    placements.forEach((p, i) => {
      const o = i === 0 ? res.object : res.object.clone(true);   // shares geometry/materials
      o.position.set(p.x, 0, p.z);
      o.rotation.y = Math.atan2(p.faceX - p.x, p.faceZ - p.z);
      p.parent.add(o);
    });
  });
}
```

- **PROP-CHAIR ×4**, `parent: scene`, facing the bar centre (`faceX: 0, faceZ: -2`), radius 4.3, flanking east/west:
  `(4.15, -0.89)`, `(4.15, -3.11)`, `(-4.15, -0.89)`, `(-4.15, -3.11)`. This keeps the spawn → bar → hero-plate
  sightline (the z axis) clear, and stays clear of the NPC orbit (r=7.2) and pillars (r=5.5 on diagonals).
- **PROP-PLANTER ×4**, flanking each station desk (desk is 2.5 m wide). `parent: station.group` for A and D, local
  `(±1.75, -0.35)`, facing local forward (`faceX: x, faceZ: z + 1`). All four go in **one** `placeProps` call so there's
  one status key. This must not change the station `position`/`radius: 4.5` used for Interact proximity.
- Call `placeProps` in the same deferred batch as the NPCs (4.3e). The hall builder already returns `stations`, each with
  `.group`, so do this in "enter hall" right after the hall is built. No change to the hall builder's signature is needed.

**g) Debug surface.** In the per-frame `window.__eb = {...}` write, add
`version: __APP_VERSION__`, `models: { ...modelStatus }`, and
`tris: renderer.info.render.triangles`, `calls: renderer.info.render.calls`. Also log once at start:
`console.info('[eb] Expert Bar v' + __APP_VERSION__)`.

---

## 5. Version bump → v0.3.0 (v0.3.x for follow-ups)

1. `package.json` → `"version": "0.3.0"`.
2. `vite.config.*` → `const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))`
   (from `node:fs`) and `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`. Keep `base: './'`.
   If there's no Vite config yet, create a minimal one containing only `base: './'` + `define`.
3. UI: `#host-badge` text → `stream.revioai.bot · v0.3.0`; login `.fineprint` → append ` · v0.3.0`. Set both from
   `__APP_VERSION__` in JS (don't hard-code in HTML).
4. `public/version.json` → `{ "version": "0.3.0", "models": ["AV-A","AV-B","AV-C","AV-D","PROP-CHAIR","PROP-PLANTER"] }`.
   List only the slots actually shipped. It gives a real JSON file to curl, where today every unknown path returns HTML.
5. Patch releases: bump to `0.3.1`, `0.3.2`, … for tuning (`yawOffset`, placements, re-generated assets). The `?v=`
   model query changes with the version, so clients refetch.
6. Git tag `v0.3.0` on the source repo commit that was deployed.

---

## 6. Fallback matrix (all must hold; no uncaught errors in console)

| Situation | Behaviour |
|---|---|
| `?models=0` | No requests to `/models/*`. v0.2 billboards and no props. `__eb.models` all `off`. |
| GLB missing on nginx (served as `index.html` 200) | GLTFLoader JSON-parse error ⇒ `failed` ⇒ billboard stays / prop absent. |
| GLB slow (> 15 s) | `timeout` ⇒ billboard stays. A late load is ignored (no mid-demo pop-in). |
| GLB loads but has an empty/degenerate bbox | `normalize` throws ⇒ `failed` ⇒ billboard. |
| GLB has no animations but `skinned:true` | Would render as an A-pose statue in bind pose. **Prevent at the asset stage** (decision tree). At runtime, `instantiate` throws `skinned without clips` ⇒ `failed` ⇒ billboard. |
| Meshopt decoder unavailable | It's bundled from `three/examples`, so this shouldn't happen. If it throws, `failed` ⇒ billboard. |
| `?modelFail=AV-B` (test hook) | Only the AV-B instances fall back. Everything else loads. Works on production too. |
| WebGL context has low memory on old phones | Textures ≤ 1024², total ≤ 12 MB. Not handled beyond budget. |

---

## 7. Build, deploy, mirror

### 7.1 Step 0 — locate and baseline the source (blocking)
1. On the box, find the Vite project that produced the live bundle: look for `package.json` with `three` and
   `vite`, and grep `src/` for `__ebTeleport` and `host-badge`. Likely `~/expert-bar-web-poc` or similar.
2. Find the deploy script: `ls scripts/ deploy* 2>/dev/null; grep -rl "rsync\|scp\|stream.revioai.bot" --include=*.sh .`
3. `npm ci && npm run build`, then confirm `dist/index.html` contains `host-badge` and the `LIVE` pill (i.e. it matches
   production). Record the current bundle hash for reference.
4. If the source is **not** under git with a GitHub remote: create branch `main` in `erice320/expert-bar-web-poc`
   containing the unmodified source (commit: `chore: import web POC source as deployed (pre-v0.3)`), then do all
   v0.3 work on `cursor/v0-3-glb-avatars-<suffix>` off `main`.
5. **If the source cannot be found, STOP and report.** Do not reverse-engineer or hand-edit the minified bundle.

### 7.2 Deploy (primary target: DigitalOcean signaling droplet)
1. Read the deploy script before running it. Confirm it ships the **entire `dist/`** (e.g. `rsync -a dist/ host:/path/`).
   If it copies explicit paths (`assets/`, `textures/`, `index.html`), add `models/` and `version.json`. That's the only change allowed to the script.
2. Run it. Don't hand-copy files to the droplet.

### 7.3 Server checks (only change nginx if one of these fails)
- `curl -s https://stream.revioai.bot/version.json` → JSON with `"version":"0.3.0"`.
- For every shipped GLB: `curl -s -r 0-3 https://stream.revioai.bot/models/characters/av-a.glb | xxd` → `676c 5446` (`glTF`),
  and `curl -sI` shows `Content-Type` **not** `text/html` and a `Content-Length` equal to the local file size.
- If GLBs come back as `text/html`, the rsync missed them (fix 7.2). Don't add nginx rules to paper over it.
- Optional, only if load time is poor: add `model/gltf-binary glb;` to nginx `types` and to `gzip_types`. Reload.

### 7.4 Mirror to `gh-pages`
After a production deploy succeeds, copy `dist/` over the `gh-pages` branch contents in a PR, **preserving
`PLAN.md`, `CHECKLIST.md`, and `.nojekyll`**. Don't use `rsync --delete` without excludes. Relative URLs mean it also works at
`https://erice320.github.io/expert-bar-web-poc/`.

---

## 8. Acceptance checks

Run locally (`npm run build && npm run preview`) first, then on production. Test at a mobile viewport (390×844, touch
emulation) **and** on one real phone if available. Log in via the UI: name `QA`, code `DEMO`, avatar as noted.

**A. Build and assets**
- [ ] `npm run build` succeeds with no new warnings about missing modules.
- [ ] `dist/models/` contains exactly the shipped slots. Each file starts with `glTF` and is within budget. Total ≤ 12 MB.
- [ ] `dist/version.json` = `0.3.0`. Bundle contains the string `0.3.0`.

**B. Visual fidelity (the point of the release)**
- [ ] After login as AV-A, within 5 s on Wi-Fi: `__eb.models` shows `glb` for every shipped character, and the player is a 3D figure.
- [ ] Right-drag the camera ~90° around the player: the character has volume from the side (v0.2 shows a thin card edge). Take screenshots front/side/back.
- [ ] Characters stand on the carpet (no floating or sinking > 3 cm), face their walking direction (`yawOffset` correct), and are ~1.7–1.8 m next to the 1.05 m station desks.
- [ ] Walking: the rigged walk plays, feet slide minimally at 3.6 m/s (tune `walkClipSpeed`), no drift from the name tag, and stopping settles within ~0.3 s.
- [ ] NPCs: 3 visible, walking their paths with 3D models, name tags above heads.
- [ ] Props: 4 chairs around the bar and (if shipped) 4 planters at the stations, grounded, casting shadows, and not blocking the spawn → hero view.
- [ ] Screenshots saved: spawn view, side view of player, Station A, Station D (v0.2 vs v0.3 side-by-side for the PR).

**C. Fallback**
- [ ] `?models=0`: identical to v0.2 behaviour, and the Network tab shows zero `/models/` requests.
- [ ] `?modelFail=AV-B` (log in as AV-A so AV-B is an NPC): AV-B is a billboard, the others are 3D, and there's no uncaught error.
- [ ] Temporarily delete one GLB from `dist/` and run preview: that slot falls back; the rest load.
- [ ] On production, `?modelFail=PROP-CHAIR`: chairs absent, everything else normal.

**D. Regression (must be unchanged)**
- [ ] Login: Enter is disabled until name + code + avatar are set. Error messages still show. Reload restores name/code/avatar from localStorage.
- [ ] Left stick moves relative to camera. Right drag looks with independent yaw/pitch and **no spin**. Both work simultaneously (two-finger).
- [ ] D-pad works. Keyboard WASD + Q/E/,/. works on desktop.
- [ ] `__ebTeleport(-6.5, 3.5)`: Station A label + Interact enabled. Open panel, then Close ✕ works on mobile (tap is not eaten by the look-zone). Same for D at `(6.5, 3.5)`.
- [ ] Escape / E / Space open and close the panel as before.

**E. Performance (mobile)**
- [ ] Chrome DevTools mobile emulation with 4× CPU throttle: ≥ 30 fps while walking near the bar after models load. On a real mid-range phone: no visible stutter while walking.
- [ ] `__eb.tris` ≤ 400k (includes shadow pass) and `__eb.calls` ≤ 300 at spawn view.
- [ ] Login screen is interactive as fast as v0.2 (no GLB request before the avatar is picked, or before Enter if preload isn't implemented).
- [ ] No console errors. At most one `[eb] model … -> fallback` warning per intentionally failed slot.

**F. Production**
- [ ] Section 7.3 curl checks pass for all shipped files.
- [ ] Hard-reload on a phone: `#host-badge` reads `stream.revioai.bot · v0.3.0`.
- [ ] `gh-pages` mirror PR opened (7.4).

---

## 9. Suggested commit sequence (source repo, one logical change each)

1. `chore: import web POC source as deployed (pre-v0.3)`. Only if needed (7.1.4).
2. `feat: v0.3.0 version plumbing (__APP_VERSION__, badge, version.json)`.
3. `feat: GLB model loader + manifest with billboard fallback`. With **no GLBs present**, the app must behave exactly like v0.2 and `__eb.models` shows `failed` per slot. This is the fallback proof. Deploying this alone is safe.
4. `feat: animate GLB avatars (mixer + procedural) and tick mixers`.
5. `feat: place GLB props (chairs, planters) with deferred load`.
6. `assets: Higgsfield GLB characters + props (optimized) and jobs.json`.
7. `chore: tune yawOffset/placements/walkClipSpeed` (repeat as v0.3.1+ if after release).
8. Deploy → tag `v0.3.0` → gh-pages mirror PR.

Follow-ups for v0.3.x (only if time allows, not required): dedicated idle clip via `3d_rigging`
(`model_url` = the character's base mesh, `enable_animation:true`, `animation_action_id: 0`) loaded as an extra clip;
regenerate the login thumbnails from the new front-view refs; nginx gzip for `.glb`.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Image-to-3D faces look uncanny at close OTS range | Camera sits ~4.2 m behind the player, so faces are mostly seen at a distance. Front-view refs with even lighting. Decision tree allows falling back per slot. |
| Rigging breaks arms/armpits | A-pose refs, `pose_mode:"a-pose"`. If it's still broken, use decision-tree branch 2 (static natural pose + procedural motion). |
| Model faces the wrong way / wrong scale / pivot off-centre | `normalize()` + per-slot `yawOffset`/`height`. Visual check B3. |
| Walk clip has root motion (character drifts) | Strip `.position` tracks at load. |
| 404s masked by SPA fallback | Treat parse failure as failure. Magic-byte curl checks. `?modelFail=` test hook. |
| Stale cached GLBs after re-generation | `?v=<version>` on every model URL. Bump the patch version on asset changes. |
| Mobile memory / download size | Meshopt + WebP 1024², budgets in section 2. Deferred NPC/prop loading. |
| Mixed billboard + 3D if only 2 characters ship | Acceptable per the lean scope. Prioritise AV-A and AV-D (most-picked defaults). Note it in the PR. |
