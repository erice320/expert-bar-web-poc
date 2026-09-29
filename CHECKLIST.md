# v0.3.0 GLB avatars — execution checklist

Tick in order. Section numbers refer to [`PLAN.md`](./PLAN.md). Stop and report at any **STOP**.

## Status (Sonnet implementation run)
- Sections 0 and 1 done. `npm run build` passes (`dist/` has `version.json` `0.3.0`, bundle `index-CQ7eMQyr.js`).
- Section 2 (Higgsfield assets) **not done**: no Higgsfield MCP in this run. Slots and exact filenames are in `public/models/README.md`. No GLBs are shipped; billboards are used everywhere.
- Section 3 partial, verified locally with throwaway GLBs from `scripts/make-test-glbs.mjs` (not committed to `public/`): C `?models=0` (0 requests), `?modelFail=AV-B`, `?modelFail=PROP-CHAIR`, and a no-assets run (all slots `failed`, no console errors). D regression: `scripts-smoke.mjs` (dual-stick move/look/strafe, no spin) and `scripts-panel-close.mjs` (Station A open, Close hit-test, Esc, movement resume) pass. Not done: visual tuning with real assets, real-phone checks, perf at 4x throttle.
- Section 4 (deploy, tag, gh-pages mirror) **not done**. See `DEPLOY.md`.

## 0. Source + baseline (PLAN §0, §7.1)
- [x] Located the Vite source tree that built the live bundle (`grep -r __ebTeleport src/`, `host-badge` present). **STOP if not found.** *(source tarball from the box; `npm run build` emits `index-B8TAytzd.js`, identical hash to live)*
- [x] Located the deploy script, read it, and confirmed it ships the whole `dist/` (or noted which paths to add). *(NOT in the tarball; lives at `infra/do/deploy-web-poc.sh` on the box. See `DEPLOY.md`. Not verified.)*
- [x] `npm ci && npm run build` reproduces the live page (host badge, LIVE pill). *(hash matches live)*
- [x] Source is on a GitHub branch (`main` import commit if it wasn't). Working branch created. *(imported in this PR branch; built gh-pages output removed from the tree, still in `gh-pages` branch)*

## 1. Code, with no assets yet (PLAN §4, §5)
- [x] `package.json` 0.3.0, `__APP_VERSION__` define, badge + fineprint show `v0.3.0`, `public/version.json`, console `[eb] Expert Bar v0.3.0`.
- [x] `src/models/manifest.js` with the 4 character + 2 prop slots (PLAN §2 paths).
- [x] `src/models/loader.js`: meshopt GLTFLoader, cache, 15 s timeout, `?v=` cache-bust, `normalize`, `sanitize`, `SkeletonUtils` clone, root-motion strip, `?models=0`, `?modelFail=`.
- [x] Avatar factory: `shadowProxy` stored; `upgradeAvatar(group, preset, statusKey)` swaps billboard → GLB on success only.
- [x] Animator takes `speed`: mixer path (walk timeScale = speed / `walkClipSpeed`) and static procedural path. `tickMixers(dt)` runs in the main loop every frame.
- [x] Deferred load: player first, then NPCs + props after the player settles or 2.5 s.
- [x] Props: 4 chairs around the bar (scene), 4 planters (station groups). One `placeProps` call per prop.
- [x] `window.__eb` has `version`, `models`, `tris`, `calls`.
- [x] **Fallback proof:** with `public/models/` empty, the app is identical to v0.2, `__eb.models` shows `failed` per slot, and there are no uncaught errors. Commit. *(verified with `scripts-models.mjs`: all slots `failed`, 0 errors; `?models=0` => 0 `/models/` requests)*

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
