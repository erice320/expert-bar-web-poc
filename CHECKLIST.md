# v0.3.0 GLB avatars — execution checklist

Tick in order. Section numbers refer to [`PLAN.md`](./PLAN.md). Stop and report at any **STOP**.

## 0. Source + baseline (PLAN §0, §7.1)
- [ ] Located the Vite source tree that built the live bundle (`grep -r __ebTeleport src/`, `host-badge` present). **STOP if not found.**
- [ ] Located the deploy script, read it, and confirmed it ships the whole `dist/` (or noted which paths to add).
- [ ] `npm ci && npm run build` reproduces the live page (host badge, LIVE pill).
- [ ] Source is on a GitHub branch (`main` import commit if it wasn't). Working branch created.

## 1. Code, with no assets yet (PLAN §4, §5)
- [ ] `package.json` 0.3.0, `__APP_VERSION__` define, badge + fineprint show `v0.3.0`, `public/version.json`, console `[eb] Expert Bar v0.3.0`.
- [ ] `src/models/manifest.js` with the 4 character + 2 prop slots (PLAN §2 paths).
- [ ] `src/models/loader.js`: meshopt GLTFLoader, cache, 15 s timeout, `?v=` cache-bust, `normalize`, `sanitize`, `SkeletonUtils` clone, root-motion strip, `?models=0`, `?modelFail=`.
- [ ] Avatar factory: `shadowProxy` stored; `upgradeAvatar(group, preset, statusKey)` swaps billboard → GLB on success only.
- [ ] Animator takes `speed`: mixer path (walk timeScale = speed / `walkClipSpeed`) and static procedural path. `tickMixers(dt)` runs in the main loop every frame.
- [ ] Deferred load: player first, then NPCs + props after the player settles or 2.5 s.
- [ ] Props: 4 chairs around the bar (scene), 4 planters (station groups). One `placeProps` call per prop.
- [ ] `window.__eb` has `version`, `models`, `tris`, `calls`.
- [ ] **Fallback proof:** with `public/models/` empty, the app is identical to v0.2, `__eb.models` shows `failed` per slot, and there are no uncaught errors. Commit.

## 2. Assets (PLAN §3) — on the Higgsfield box
- [ ] Higgsfield folder `expert-bar-v0.3`. Every call preflighted with `get_cost:true` and logged in `assets-src/higgsfield/jobs.json`.
- [ ] Step A front-view refs for AV-A..D + chair + planter, saved to `assets-src/higgsfield/refs/`.
- [ ] Step B `image_to_3d` rigged+walk (id 30) per character; static for props. Raw files in `assets-src/higgsfield/raw/` (gitignored).
- [ ] Decision tree applied per character (rigged / static natural pose / rejected).
- [ ] Step C `gltf-transform optimize` → `public/models/...`. Each file: `glTF` magic, within budget, `inspect` shows expected skins/clips. Total ≤ 12 MB.
- [ ] Minimum met: ≥ 2 characters + chair. Commit assets.

## 3. Tune + verify locally (PLAN §8 A–E)
- [ ] `yawOffset`, heights, `walkClipSpeed`, prop placements tuned. Characters grounded and facing travel direction.
- [ ] B visual checks + front/side/back screenshots + v0.2 vs v0.3 comparison.
- [ ] C fallback checks (`?models=0`, `?modelFail=AV-B`, deleted-file test).
- [ ] D regression: login, dual-stick (no spin), D-pad, keyboard, Stations A/D interact + close on mobile, Esc/E/Space.
- [ ] E performance: ≥ 30 fps at 4× CPU throttle, `tris` ≤ 400k, login not delayed.

## 4. Ship (PLAN §7.2–7.4, §8 F)
- [ ] Deploy with the existing script (add `models/` + `version.json` to it only if needed).
- [ ] `curl version.json` → 0.3.0. Each GLB: `glTF` magic via `curl -r 0-3`, not `text/html`, correct length.
- [ ] Phone hard-reload shows `v0.3.0` and 3D avatars. `?modelFail=PROP-CHAIR` works in production.
- [ ] Tag `v0.3.0`. Open the `gh-pages` mirror PR (preserve `PLAN.md`, `CHECKLIST.md`, `.nojekyll`).
- [ ] PR description: screenshots, shipped slots, any billboard fallbacks and why, Higgsfield credits used.
