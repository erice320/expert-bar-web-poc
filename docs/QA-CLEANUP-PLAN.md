# Expert Bar Web POC — QA Cleanup Plan (v0.3.10 → v0.4.x)

| | |
|---|---|
| **Status** | Plan only. Opus plans, Sonnet builds. No product code in this PR. |
| **Requested by** | Evan, 2026-09-30: "make what we have much cleaner NOW" (weird physics, chopped/distorted wallpapers, T-pose arms) + follow-up steer: **collision / solid mass is the P0 focus** |
| **Verified against** | Live https://stream.revioai.bot/ **v0.3.10** (`assets/index-SWat3Or1.js`, `assets/index-DhE0S5pU.css`). Earlier captures from v0.3.3 / v0.3.4; world geometry, textures and prop GLBs are byte-identical through v0.3.10 (md5 + constant matching in the de-minified bundle). |
| **Readable source used** | PR #1 branch `cursor/glb-avatars-plan-f51d` (v0.3.0). Line numbers below are from that source; the same code is present in the live bundle (e.g. `bounds: 15`, the `±bounds` clamp, the dais `CylinderGeometry(3.2, 3.4, 0.7, 48)`, chair coords `[±4.15, -0.89 / -3.11]`). Re-anchor line numbers after slice S0. |
| **Out of scope** | See [§10](#10-explicitly-out-of-scope). No Unreal, no MI325, no product restart. |

---

## 0. TL;DR — top P0 findings

1. **Nothing in the hall has mass (COL-01..03).** There is no collision system at all. The player and NPCs pass through the Expert Bar dais (you sink waist-deep, since the dais is 0.7 m tall and feet stay at y = 0), the bar stools, both station desks, the planters, the four corner pillars and the four truss legs. The only movement constraint is `clamp(x/z, -15, +15)` in `src/main.js:412-413`.
2. **"Outer walls collide" is an illusion (COL-02).** That ±15 m clamp is an invisible square that sits **~2.5 m short** of the side murals (x = ±17.5), **~1.9 m short** of the backdrop (z = −16.9), and in open void behind spawn, where there is **no back wall at all**.
3. **The camera goes through walls (CAM-01).** It is a free 4.2 m orbit with no containment, so at the clamp edge it ends up outside the hall and the screen goes flat grey.
4. **Wallpapers are photos of other places (WALL-01..04).** The hall is lined with cropped photos stretched 1.5–6.4×: a hallway with doors and a person's head, an upward skylight shot of a *second* Expert Bar, and a backdrop with people and *another* Expert Bar. None of them tile seamlessly, the murals overhang the walls above and below the floor, and there is no ceiling or back wall.
5. **The bar centerpiece is a black slab "X" (BAR-01).** Two crossed planes carry an opaque JPG with a black background. They cut through the dais and poke 1.4 m out toward spawn, and one of them slices through the rear stools.
6. **The NPC "weird physics" (NPC-01..03)** comes from three things: NPCs teleport up to 5.9 m after idling, they snap 180° and moonwalk at path ends, and they walk straight through the Station A and D desks.
7. **Process blocker (PROC-01).** The live v0.3.10 source lives only on the deploy box, not in GitHub, and Sonnet cannot safely build slices until it is imported (slice S0).

The T-pose walk arms (AVA-01) are **resolved in v0.3.10**. What remains is a **P1 residual on AV-D (AVA-02)**: shoulder and shirt volume collapse, with one arm sinking into the torso depending on heading.

---

## 1. Scope and ground rules

- Clean up the **existing** Vite + Three.js web POC as deployed at stream.revioai.bot. Keep the same stack, same hall layout, same avatars, same stations, and the same YouTube station panels.
- Every fix ships as a **small Sonnet PR** (see [§7](#7-sonnet-55-build-slices)) with before/after screenshots from the QA harness views.
- Prefer **zero new runtime dependencies**. The one sanctioned escalation is `three-mesh-bvh` for mesh-accurate collision, but only if the proxy approach in §5 proves insufficient (§5.11).
- Severity:
  - **P0**: visible within the first ~30 s of the default demo path, or badly breaks immersion or basic physicality.
  - **P1**: visible on exploration or close inspection, or a feel issue.
  - **P2**: polish, performance or hygiene.

## 2. How this QA was done

- **Device profile:** Playwright + system Chrome (SwiftShader WebGL) at **390×844** (the phone portrait target), using touch joystick, D-pad and LOOK-pad input, plus mouse drag on `#look-zone` for camera yaw/pitch. `window.__ebTeleport(x, z)` was used to reach edge cases.
- **Code:** PR #1 source (v0.3.0), plus the de-minified live bundles v0.3.3 → v0.3.4 → v0.3.6 → v0.3.7 → v0.3.10, diffed semantically.
- **Assets:**
  - GLBs parsed with glTF-Transform + meshopt decoder (rig rest angles, clip tracks, material factors, prop bounds).
  - Textures measured with `sharp` (dimensions, seam score = mean edge-wrap difference ÷ mean interior neighbour difference; ≈1 is seamless).
- **Motion:** the NPC path functions from `main.js` were simulated in Node for 10 simulated minutes to count teleports, flips, desk intersections and foot-slide.
- **Evidence:** screenshots are attached to the PR description, not committed (this PR is doc-only). Names referenced below:
  - `EV1`: Evan's original request screenshot, AV-D walking with arms out (pre-v0.3.10; in the request thread, not re-attached).
  - `EV2`: Evan's screenshot, AV-B waist-deep in the dais, v0.3.3.
  - `S00`–`S17`: QA captures (v0.3.4; world, textures and prop GLBs unchanged in v0.3.10).
  - `L10`: v0.3.10 four-avatar lineup.
  - `A10`: v0.3.10 AV-D arm strip.

---

## 3. Source-of-truth gap (fix first)

| | GitHub `erice320/expert-bar-web-poc` | Live stream.revioai.bot |
|---|---|---|
| Built output | `gh-pages` = **v0.2** (`assets/index-C6mVm6nT.js`) | **v0.3.10** |
| Source | Draft PR #1 = **v0.3.0** | Built on the deploy box from `/workspace/expert-bar-gameplay/web-poc` via `infra/do/deploy-web-poc.sh` (neither is in GitHub) |

Known v0.3.0 → v0.3.10 deltas that exist only on the box:
- YouTube station panel (HTML/CSS/JS, `STATION_VIDEOS` for stations a/d, `youtube-nocookie` playlist embed)
- `?v=` cache-busted thumbnails
- root-motion strip limited to Hips/root
- the v0.3.6 → v0.3.10 arm overlay iterations
- `version.json` with a `stations` key
- the six GLBs and regenerated thumbnails

**Consequence:** a Sonnet PR written against the GitHub source would regress the live site (it would lose the YouTube panels and the arm fix). Slice **S0** imports the box source before anything else.

---

## 4. Defect inventory

Columns: **ID · Sev · Defect · Repro (390×844, default login, any avatar unless noted) · Root cause (code / asset) · Evidence**. "Spawn" = (0, 0, 10) looking −Z at the bar.

### 4.A Collision and solid mass — headline (Evan steer)

| ID | Sev | Defect | Repro | Root cause | Evidence |
|---|---|---|---|---|---|
| **COL-01** | **P0** | **No interior object has collision.** The player walks through the **Expert Bar dais** (sinks to the waist), **bar stools ×4**, **Station A/D desks**, **planters ×4**, **corner pillars ×4**, **truss legs ×4**, and **NPCs**. | From spawn, hold forward ~2.5 s: the avatar enters the dais at z ≈ 1.4 and stays at y = 0 inside it. Or `__ebTeleport(4.15,-0.89)` puts you inside a stool; `__ebTeleport(14,14)` inside a pillar. | There is no collision code or collider data anywhere. `main.js:406-413` integrates `position += moveDir·3.6·dt` and then clamps x/z to ±15. `buildWorld()` returns only `{ stations, bounds: 15, ringHero }` (`world.js:337`). Props are added by `placeProps()` (`avatars.js:435-445`) with no registration. | EV2, S15 (inside dais), S13 (inside corner pillar) |
| **COL-02** | **P0** | **"Outer walls collide" is an invisible square clamp, not the walls.** The player stops in open space ~2.5 m from the side murals and ~1.9 m from the backdrop mural, and at z = +15 in open void behind spawn (there is no back wall). | Walk toward any wall: you stop well short with nothing in front of you. Walk backward from spawn: you stop on bare floor 6 m from the floor edge. | `main.js:412-413` does `clamp(pos, -bounds, bounds)` with `bounds = 15` (`world.js:337`). The visible inner surfaces are side murals at x = ±17.5 (`world.js:114-118`), the backdrop at z = −17.2 and mountain mural at z = −16.9 (`world.js:98, 291`). There is no south wall; the floor ends at z = +21 (`world.js:58`). | S08 (void behind spawn) |
| **COL-03** | **P0** | **No floor-height model.** Player y is hard-wired to 0. Raised surfaces (the 0.7 m dais) are penetrated rather than blocked or stood on. | Same as COL-01: in EV2/S15 the legs disappear into the dais top. | `player.position.y` is never updated; `__ebTeleport` sets y = 0 (`main.js:327-330`). There is no ground query. | EV2, S15 |
| **COL-04** | **P0** | **NPCs walk through the Station A and D desks.** | Watch Station A (−6.5, 5) for ~30 s: the NPC on the left line path walks through the desk centre, and the right-hand one through Station D. | `linePath(-8,4,-3,7)` passes **0.1 m** from the Station A desk centre (−6.5, 5); `linePath(8,4,3,7)` mirrors this through Station D (`main.js:297-298, 359-367`). Simulated: ~10% of path time is spent inside a desk. | S17 NPC watch frames |
| **COL-05** | P1 | **No player↔NPC or NPC↔NPC separation.** Avatars pass through each other. | Stand on the orbit path at (0, 5.2): the orbit NPC walks through you. | No dynamic colliders (`main.js:484-503`). | S17 |
| **COL-06** | P1 | **Hero plates are walk-through geometry outside the dais.** The x = 0 plate extends 1.4 m toward spawn, and the z = −3.2 plate extends to x = ±6, slicing through both rear stools at (±4.15, −3.11). | Walk forward from spawn: you pass through the plate before reaching the dais. | Plates are `PlaneGeometry(12, 8.3)` at (0, 3.9, −3.2) (`world.js:155-181`). Fixed by removal in S5, not by colliders. | S09, S10 |

### 4.B Camera

| ID | Sev | Defect | Repro | Root cause | Evidence |
|---|---|---|---|---|---|
| **CAM-01** | **P0** | **Camera passes through walls.** The screen becomes a flat grey face of the wall box. | Walk to x = +15 (clamp), drag LOOK so the camera swings to +X (yaw ≈ +90°): camera x ≈ 19.1, outside the 18.2 m wall. | `desiredCam = player + 4.2·(sin camYaw, …, cos camYaw)` with no ray test or bounds (`main.js:420-429`; `CAM_DIST` 4.2 at `:252`). | S11 |
| CAM-02 | P1 | **Camera goes behind the backdrop.** At z ≈ −15 looking back toward spawn, the camera sits at z ≈ −19, behind the FrontSide backdrop plane, so the hall is viewed from outside. | `__ebTeleport(0,-15)`, look toward +Z. | Same as CAM-01. | — |
| CAM-03 | P1 | **Camera clips into pillars, truss legs and desks**, with no occlusion pull-in. | Stand next to a corner pillar and orbit the camera behind it. | Same as CAM-01. | S13 |

### 4.C Hall shell and wallpaper ("chopped up / distorted")

| ID | Sev | Defect | Repro | Root cause (asset + mapping) | Evidence |
|---|---|---|---|---|---|
| **WALL-01** | **P0** | **"Plaster" walls and pillars are a hallway photo.** It shows ceiling lights, doors, a woman's head and handbag, tiled with hard seams. | Look left or right from spawn above the murals, at the far z ends of the side walls, or at any corner pillar. | `textures/wall-plaster.jpg` is a **512×512 cropped photo, not plaster**. Seam score **58** (edge 64 vs interior 1.1). Walls: `BoxGeometry(0.35, 9, 36)` with `repeat [2,1]`, so 18 × 9 m tiles give a **2:1 horizontal stretch** at 28 px/m (`world.js:120-136`). Pillars: 1.1 × 7 m with **no repeat**, a **6.4:1 vertical stretch** (`world.js:324-335`). | S06, S07, S13 |
| **WALL-02** | **P0** | **Side murals are an upward skylight photo containing a second Expert Bar**, identical on both walls. Its ceiling perspective contradicts a vertical wall. The murals overhang the 9 m walls up to y = 11 and extend 1 m below the floor, and they end at z = 12, exposing the hallway photo behind. | Look left or right from spawn (S06 shows a second blue "EXPERT BAR / revio SUMMIT" ring inside the wall). | `textures/hall-establish.jpg` (1280×579, 46 px/m) on `PlaneGeometry(28, 12)` at x = ±17.5, y = 5, z = −2 (`world.js:102-118`). | S06, S07 |
| **WALL-03** | **P0** | **The backdrop is a photo of another hall** with people and another Expert Bar, blurry and stretched. A mountain photo is pasted over it. | Look straight ahead from spawn above the bar; walk to z = −12. | `textures/hall-backdrop.jpg` 1280×720 on `PlaneGeometry(38, 14)` gives a **1.53× horizontal stretch** at **34 px/m**, and its bottom 1.8 m sits below the floor (y = 5.2 ± 7) (`world.js:87-99`). `summit-mountain.jpg` 1024×576 on 10 × 4.2 m is a **1.34× stretch** at z = −16.9 (`world.js:281-292`). | S12 |
| **WALL-04** | **P0** | **No south (back) wall.** Behind spawn is a sky-blue void with a hard floor edge. | From spawn, drag LOOK 180°. | Only side walls, backdrop and cornice exist (`world.js:134-136`); floor is 42 × 42 (`:58`). | S08 |
| WALL-05 | P1 | **No ceiling.** Sky-blue clear colour shows above the walls; the "skylight" is a floating photo strip. | From spawn, look up (max pitch). | No ceiling mesh. `skylight.jpg` (960×302) is on a `PlaneGeometry(18, 6)` at y = 8.6, DoubleSide, opacity 0.85 (`world.js:139-152`). | S05 |
| WALL-06 | P2 | Cornice box floats behind the backdrop at z = −18, and the outer wall faces are visible from outside (only matters while CAM-01 exists). | — | `mkWall(40, 0.4, 0.4, 0, 8.2, -18)` (`world.js:134`). | — |

### 4.D Expert Bar centerpiece

| ID | Sev | Defect | Repro | Root cause | Evidence |
|---|---|---|---|---|---|
| **BAR-01** | **P0** | **Giant black slab "X" through the bar.** The hero art is on two crossed planes with a black background, with transparent sorting flicker while orbiting. | From spawn: the black rectangles dominate the upper half of the view. | `expert-bar-hero-solid.jpg` (768×532, **opaque JPG with black background**) on two `PlaneGeometry(12, 8.3)` planes, MeshBasicMaterial with transparent 0.98/0.9 and depthWrite (`world.js:155-181`). The alpha version `expert-bar-hero.png` exists on the server but is unused. | S09, S10, EV1 |
| BAR-02 | P1 | **Column and truss render near-black** (chrome with nothing to reflect). | From spawn, the truss legs and centre column read as black. | metalness 0.8 (truss, `world.js:206-210`) and 0.6 (column, `:243-244`) with **no `scene.environment`**. | S09, S15 |
| BAR-03 | P1 | **Ring band text is unreadable and cut.** A glyph "EXPERT B" is chopped 4×, and a mysterious arc shadow falls on the floor. | Orbit the bar and look at the torus. | `ring-band.jpg` 2048×256, non-seamless, ends mid-word. It uses `repeat 4` around a **0.12 m tube** (`TorusGeometry(5.5, 0.12)`), so the text wraps around the tube. `ring.castShadow = true` (`world.js:185-202`). | S09 |

### 4.E Floor and materials

| ID | Sev | Defect | Repro | Root cause | Evidence |
|---|---|---|---|---|---|
| MAT-01 | P1 | Carpet shows straight seams every 8.4 m. | Look at the floor between spawn and the stations. | `floor-carpet.jpg` 1024², seam score **17** (edge 31.5 vs interior 1.8), `repeat [5,5]` on 42 m (`world.js:56-66`). | S02, S08 |
| MAT-02 | P2 | Translucent path disc: z-fight risk on mobile depth precision. | Distant low-angle view. | `CircleGeometry(9)` at y = 0.01, opacity 0.22, no polygonOffset (`world.js:71-82`). | — |
| MAT-03 | P2 | All character GLBs author `metallicFactor = 1`, which the runtime clamps to 0.1. | — | Meshy export; `sanitize()` in `src/models/loader.js` masks it. | GLB inspect |
| MAT-04 | P2 | White UV-seam speckles on AV-A and AV-B clothing. | Close-up of either avatar. | Texture islands without edge dilation (asset). | S03 |

### 4.F Avatars and animation

| ID | Sev | Defect | Repro | Root cause | Evidence |
|---|---|---|---|---|---|
| AVA-01 | **Resolved v0.3.10** | AV-D walked with arms stuck out, T-pose-ish. | — | AV-D's **bind pose is a T-pose** (upper arm 97.9° from vertical, forearm 116.8°), while AV-A/B/C are A-pose (19–40°). Its Casual_Walk kept the arms 34–41° out. v0.3.10 strips all Shoulder/Arm/ForeArm/Hand tracks and drives the arms procedurally (`shoulderHang` = rest × rotX(1.05) plus a world-space `setFromUnitVectors` arm aim). | EV1 (before) |
| **AVA-02** | P1 | **v0.3.10 residual (AV-D): shoulder and shirt volume collapse.** One upper arm sinks into the torso and the sleeve reads as a lump. When stopped, facing the camera, one arm vanishes into the shirt and only a hand shows at the hip. Which arm is affected depends on heading. | Pick AV-D, walk toward and away from the camera, then stop (A10 panels 2 and 4). | (a) The skin is bound in a T-pose, so forcing the arm ~95° down collapses the armpit and shoulder volume (no corrective shapes). (b) Arm targets are **world-space** `(±0.04, −1, ∓a)`, so the "outward" offset points into the torso on half the headings, including the default −Z view. (c) `setFromUnitVectors((0,1,0), dir)` with dir ≈ (0,−1,0) is a **near-180° rotation with undefined roll**, which twists the sleeves. (d) The overlay is applied to **all four** avatars, replacing good authored arm swing on AV-A/B/C. | A10, L10 |
| AVA-03 | P1 | **Stopped avatars freeze mid-stride** (no idle). | Release the joystick mid-step. | None of the GLBs has an Idle clip; with no `idleAction` the walk `timeScale` lerps to 0 (`avatars.js:456-459`). | S02 |
| AVA-04 | P1 | **Foot skating.** Feet slide ~1.4 m/s while walking. | Walk in a straight line and watch the planted foot. | `walkClipSpeed: 1.4` for all characters (`src/models/manifest.js`), but Casual_Walk (4.23 s, 6 steps × ~0.65 m) is authored at **≈0.92 m/s**. The player moves at 3.6 m/s (`main.js:410`) while timeScale is capped at 2.4 (`avatars.js:450`), giving ≈2.2 m/s of foot motion. | S03 |
| AVA-05 | P1 | **Spawn faces the camera**, then snaps around on first input. | Enter the hall. | `player.rotation.y = 0` (`main.js:288`; the comment says "face −Z", but model forward is +Z); should be π. | S01 |
| AVA-06 | P2 | Feet float 0–5 cm through the cycle. | Side view, walking. | Hips translation stripped entirely (root-motion strip), including its vertical component. | A10 panel 3 |
| AVA-07 | P2 | AV-D model (white shirt, no glasses) doesn't match its login card ("soft blue shirt · glasses"). | Login screen vs in-hall. | Card copy/thumbnail predates the GLB (`src/avatars.js` AVATARS). | S00 |
| AVA-08 | P2 | Turn speed depends on frame rate. | Compare 30 vs 60 fps. | `approachAngle(…, 0.2)` per frame, not dt-based (`main.js:416, 478-482`). | — |

### 4.G NPC motion ("weird physics")

| ID | Sev | Defect | Repro | Root cause | Evidence |
|---|---|---|---|---|---|
| **NPC-01** | **P0** | **NPCs teleport** up to **5.9 m**, about 2× per minute. | Watch an idle-enabled NPC for 60 s (idle is random per session). | `n.t += dt·speed` keeps advancing **while idle**, so when idle ends the NPC jumps to `path(n.t)` (`main.js:486-491`). | S17, sim |
| **NPC-02** | **P0** | **180° snaps and moonwalking** at line-path ends (~6×/min). | Watch the left or right line NPC reach an end. | `u = (sin t + 1)/2` decelerates to 0 at the ends, while the walk timeScale floors at 0.6, so the legs keep walking at zero ground speed. Rotation is `atan2` of tiny deltas, so it snaps when direction flips (`main.js:359-367, 494-498`; `avatars.js:450`). | S17, sim |
| NPC-03 | **P0** | Walks through desks (see **COL-04**). | — | — | S17 |
| NPC-04 | P1 | The orbit NPC foot-skates at 0.74 m/s. | Watch the orbit NPC. | `circlePath(0,-2,7.2,0.32)` gives 0.74 m/s while timeScale floors at 0.6 × 1.4 m/s. | sim |

### 4.H UI / HUD

| ID | Sev | Defect | Repro | Root cause | Evidence |
|---|---|---|---|---|---|
| UI-01 | P1 | The player's **own nametag sits over the bar centre** in the over-the-shoulder view. | Any spawn view (S09/S15: "QA / AV-D" pill over the column). | The name sprite (1.35 × 0.34 at y = 2.15) has `depthTest: false` and is shown for the local player (`src/avatars.js` `createAvatarMesh`). | S09, S15 |
| UI-02 | P2 | `.host-badge` ("stream.revioai.bot · v0.3.x") overlaps the `.hint` pill at 390 px. | Any in-hall screenshot. | Both are placed at `top: max(12px, safe-area)` (`src/style.css`). | all S-shots |
| UI-03 | P2 | Login "Enter" button is below the fold at 390×844. | Open the site on a phone. | Card stack height (`index.html`, `src/style.css`). | S00 |
| UI-04 | P2 | Station panel: highlighted playlist item didn't match the embed title in headless. | Open Station A, switch videos. | Verify on a real device first; possible `postMessage` index lag. | S16 |

### 4.I Performance and delivery

| ID | Sev | Defect | Root cause | Evidence |
|---|---|---|---|---|
| PERF-01 | P2 | ~620 KB of billboard PNGs download even when the GLBs load. | `createAvatarMesh` always builds the photo billboard (`src/avatars.js`). | requests.json |
| PERF-02 | P2 | GLBs are served as `application/octet-stream` with a 7-day cache (JS is gzip + immutable). | nginx config on the droplet. | requests.json |
| PERF-03 | P2 | Below 20 fps the whole sim runs in slow motion. | `dt = min(delta, 0.05)` (`main.js:507`); should substep instead. | — |
| PERF-04 | info | Baseline at spawn: ~107k tris, 37 draw calls, ~4.2 MB over 48 requests. Record it so cleanup doesn't regress. | — | — |

### 4.J Process

| ID | Sev | Defect | Root cause |
|---|---|---|---|
| **PROC-01** | **P0 (blocker)** | Live v0.3.10 source and the deploy script are not in GitHub. | See §3. |
| PROC-02 | P1 | No automated regression. Every fix so far was eyeballed on the live site. | Add the QA harness in S0 (§8). |

---

## 5. Collision remediation design (the P0 focus)

### 5.1 Root cause in one sentence

The POC has **no collision layer**. The character controller is `position += dir·speed·dt` followed by a ±15 m square clamp, the camera is an unconstrained orbit, and NPCs follow closed-form paths. Nothing knows the dais, chairs, desks, pillars or walls exist.

### 5.2 Approach (primary): 2.5D collider proxies, zero dependencies

Everything in this hall is a floor-standing primitive or a static prop on a flat floor, so a **2.5D** model (XZ shapes with a vertical extent) is exact enough and cheap on phones:

- **Player = vertical capsule:** radius **0.30 m**, height **1.80 m**, step height **0.30 m**.
- **Static colliders:** `circle` (for `CylinderGeometry` and truss legs), `obb` (for `BoxGeometry`, desks, chairs, pillars) and `slab` (walls as thin OBBs). Each has `yMin`, `yMax` and a `layers` bitmask.
- **Blocking rule:** a collider blocks horizontal motion iff `yMax > playerY + stepHeight` **and** `yMin < playerY + capsuleHeight`. Consequences:
  - Banners (bottom 2.85 m), the ring (3.4 m), signs and the skylight never block.
  - The dais (0.7 m > 0.3 m step) **blocks** from the floor.
  - A future 0.2 m stage step would be stepped onto.
- It lives in a new **pure module `src/collision.js`** (math only, no renderer), so it is unit-testable in Node.

### 5.3 Collision layers (capsule vs mesh proxies)

```js
export const LAYERS = {
  WALL:     1 << 0, // hall shell: side walls, backdrop, south wall
  SOLID:    1 << 1, // architecture/fixtures: dais, desks, pillars, truss legs, column
  PROP:     1 << 2, // furniture: chairs, planters
  NPC:      1 << 3, // dynamic circles, one per NPC
  CAMERA:   1 << 4, // things the camera must not enter/see through: walls, pillars
  WALKABLE: 1 << 5, // has a walkable top (used by groundHeightAt)
  TRIGGER:  1 << 6, // non-blocking volumes (station proximity, future)
};
export const MASKS = {
  player: LAYERS.WALL | LAYERS.SOLID | LAYERS.PROP | LAYERS.NPC,
  npc:    LAYERS.WALL | LAYERS.SOLID | LAYERS.PROP,          // + wait-if-player-ahead rule
  camera: LAYERS.WALL | LAYERS.CAMERA,                        // NOT props: avoids camera jitter around chairs
};
```

### 5.4 Collider generation (hall meshes + props)

1. **Tag, don't hand-place.** In `world.js`, each blocking mesh gets `mesh.userData.collider = { layers: LAYERS.SOLID, shape: 'auto' }`. A `buildColliders(root)` pass (`src/colliders.js`) traverses after `buildWorld()` and derives world-space shapes:
   - `CylinderGeometry`: `circle`, radius = max(radiusTop, radiusBottom) × world XZ scale; `yMin`/`yMax` from world `Box3`.
   - `BoxGeometry`: `obb`, half-extents from `geometry.parameters` × world scale, yaw from the world quaternion. Assert tilt < 1°; the tilted truss braces are covered by their leg's circle instead.
   - Station children are handled through `group.matrixWorld`, so desks and planters rotate with the station (±0.15π).
2. **Hall shell constants.** Export `HALL = { halfX: 17.5, zNorth: -16.9, zSouth: 17.5, height: 9 }` from `world.js`. Build **both** the wall meshes and the `WALL|CAMERA` slabs from these constants so visuals and colliders cannot drift. Delete `bounds: 15` and the clamp.
3. **GLB props get their footprint from the manifest, not the async mesh.** Add `footprint` to `PROP_SLOTS` in `src/models/manifest.js`, using sizes measured from the shipped GLBs after height normalisation:
   - `PROP-CHAIR` (`lounge-chair.glb`, h 0.85): **0.78 × 0.86 m** → `obb`
   - `PROP-PLANTER` (`planter.glb`, h 1.3): **0.60 × 0.56 m** → `circle r 0.30`

   `placeProps()` (`avatars.js:435-445`) registers one collider per placed instance (world position from `parent.matrixWorld`, yaw = the placement yaw). If a prop fails to load and nothing renders, **no collider** is registered: no invisible obstacles.
4. **Registry.** A `ColliderWorld` holds static colliders (brute force; there are ~30) plus dynamic NPC circles updated each frame. It is exposed read-only as `window.__eb.collision` (`count`, `byLayer`, `list`, `contacts`, `stepMs`) for tests.

### 5.5 Collider table (v0.3.10 layout, world metres)

| Collider | Source | Shape | Centre (x, z) | Size | y range | Layers |
|---|---|---|---|---|---|---|
| Expert Bar dais / counter | `world.js:228-237` | circle | (0, −2) | r **3.40** (base radius; top is 3.20) | 0–0.70 | SOLID (+WALKABLE top 0.70 only if the stage option in §9 is chosen) |
| Centre column | `world.js:242-247` | circle | (0, −2) | r 0.55 | 0–2.2 | SOLID (only matters if the dais becomes walkable) |
| Truss legs ×4 (+ braces) | `world.js:211-224` | circle | (±3.89, 1.89), (±3.89, −5.89) | r **0.30** (covers the 0.28 box + brace sweep) | 0–3.5 | SOLID |
| Station A / D desks (+ face panel) | `world.js:349-365` | obb | (−6.5, 5) yaw +0.15π / (6.5, 5) yaw −0.15π | 2.50 × 1.10 | 0–1.05 | SOLID |
| Planters ×4 | `main.js:347-349` | circle | station-local (±1.75, −0.35) | r 0.30 | 0–1.3 | PROP |
| Bar stools ×4 | `main.js:334-345` | obb | (±4.15, −0.89), (±4.15, −3.11), facing (0, −2) | **0.78 × 0.86** | 0–0.85 | PROP |
| Corner pillars ×4 | `world.js:324-335` | obb | (±14, ±14) | 1.10 × 1.10 | 0–7 | SOLID \| CAMERA |
| West / east walls (mural faces) | `world.js:102-136` | slab | inner face x = ∓17.5 | full length | 0–9 | WALL \| CAMERA |
| North wall (backdrop / mountain mural) | `world.js:87-99, 281-292` | slab | inner face z = −16.9 | full width | 0–14 | WALL \| CAMERA |
| **South wall (new)** | new in S2, skinned in S6 | slab + mesh | inner face z = +17.5 | full width | 0–9 | WALL \| CAMERA |
| NPCs ×3 | `main.js:296-305` | circle (dynamic) | per frame | r 0.30 | 0–1.8 | NPC |
| *No collider:* banners, poles, ring, signs, skylight, path disc, hero plates (removed in S5) | — | — | — | — | above the 1.8 m capsule or decals | — |

Note on the stools: they sit **0.47 m** from the dais face (centre 4.30 m from the dais axis, depth 0.86 m), which is less than the 0.60 m capsule diameter. The player therefore cannot squeeze between a stool and the bar. That is realistic (stools tucked under a counter) and intended. The **1.4 m lanes between stool pairs** (along ±X) and the open ±Z sides remain the approach paths to the dais.

### 5.6 Resolution algorithm (player)

```text
resolveMove(pos, delta, world, { radius:0.30, height:1.80, step:0.30, mask:MASKS.player })
  n = ceil(|delta| / 0.10)                       // ≤ 0.10 m substeps keep push-out well-conditioned at the 0.05 s dt cap and after frame hitches
  repeat n times:
    pos.xz += delta.xz / n
    repeat 3 iterations:                         // push-out; sliding falls out naturally
      for c in world.candidates(pos, mask):
        if blocks(c, pos.y): (depth, normal) = penetrate(circle(pos.xz, radius), c)
                             if depth > 0: pos.xz += normal * (depth + 1e-4)
  pos.y = groundHeightAt(world, pos.x, pos.z, pos.y, step)   // see 5.7
  return { pos, contacts }
```

- Point-inside-shape fallback: if the capsule centre is exactly on a circle centre (teleport into the dais), push along +Z (toward spawn) deterministically.
- `__ebTeleport(x, z)` runs one zero-delta `resolveMove`, so teleporting into a collider always resolves out.
- Kill switch: `?collision=0` restores the legacy movement (for A/B comparison and emergency rollback only).

### 5.7 Floor height on raised platforms

```text
groundHeightAt(world, x, z, currentY, step)
  h = 0                                          // hall floor
  for c in world.walkable(): if contains(c, x, z) and c.top <= currentY + step: h = max(h, c.top)
  return h
```

- Step **up** is immediate (≤ 0.30 m). Step **down / walk off** falls under gravity (9.8 m/s²), so there is no floating: `y > ground` for at most ~0.15 s.
- The camera follow, name sprite and NPC wait-rule already key off `player.position.y`, so they inherit this for free.
- **Default hall:** the dais top (0.70 m) exceeds the step height, so the dais is a **solid counter** and `groundHeightAt` returns 0 everywhere. The function still ships and is unit-tested with synthetic platforms. If Evan wants to **stand on** the Expert Bar stage (§9, decision D1), slice S2b adds a 3-riser stair (0.233 m each) and tags the dais top `WALKABLE`, with no engine change.

### 5.8 Camera containment

- Cast a ray from the look target `(player + 1.5 m)` toward the desired orbit position against `MASKS.camera`, using a swept camera sphere of r 0.25 m. Pull in to `hit − 0.25`, but never closer than 1.0 m.
- Then clamp to the hall AABB inset by 0.30 m (`HALL`), and keep y in [0.4, HALL.height − 0.3].
- Smoothing: **snap in** when the constrained distance shrinks; **ease out** with the existing `1 − 0.001^dt` when it grows. That prevents both wall peeking and pumping.
- Props are excluded from the camera mask, so the camera never jitters around stools.

### 5.9 NPCs

- NPCs get dynamic `NPC` circles (the player can't walk through them).
- NPCs don't push the player. If the player is inside a 0.8 m cone ahead of an NPC, the NPC switches to idle and waits.
- NPC paths become **waypoint loops validated against the static colliders** (clearance ≥ 0.35 m, checked by a Node test that samples every 0.05 m), which fixes COL-04 at the data level. The motion fixes (NPC-01/02) ship in the same slice.

### 5.10 Debug and observability

- `?debug=colliders`: `LineSegments` outlines of every collider at y = 0.02 and at `yMax`, coloured by layer, plus the player capsule ring. Contacts flash for one frame.
- `window.__eb.collision = { count, byLayer, list: [{id, shape, layers, x, z, …}], contacts: [ids], playerY, stepMs }`.

### 5.11 Escalation option B (only if needed): capsule vs mesh BVH

If proxies prove too coarse (e.g. Evan wants to walk into the gap under a lounge chair's arms), or if a hall GLB replaces the procedural shell, switch the player to **`three-mesh-bvh` capsule shapecast** (the pattern from the official `characterMovement` example):

- Build a `MeshBVH` over merged static geometry of the `SOLID|PROP|WALL` meshes at load.
- Shapecast a capsule segment each substep and push out along the triangle normals.
- Cost: ~45 KB gz dependency, a one-off BVH build at load, and per-frame shapecast.

Layers, `groundHeightAt`, camera containment and every acceptance test in §5.12 stay identical, because they're written against `__eb.collision` and positions, not the implementation. **Not recommended for this cleanup.**

### 5.12 Collision acceptance tests

Unit tests (Node, `node --test tests/*.test.mjs`, no browser):

| Test | Assertion |
|---|---|
| U1 penetration | circle–circle and circle–OBB (including a rotated OBB at the stool yaw) return the correct depth and normal to 1e-6. |
| U2 no tunnelling | At 3.6 m/s and dt 0.05, running straight at a 0.30 m truss-leg circle from 20 angles, the result is never inside it. |
| U3 slide | Moving at 45° into a wall keeps ≥ 0.65× of the input speed tangentially. Moving at 45° into the dais circle keeps ≥ 0.6×. |
| U4 layers | The camera mask ignores PROP; the player mask ignores TRIGGER; `blocks()` respects step height (0.2 m box: step over; 0.7 m dais: block; banner at 2.85 m: pass under). |
| U5 floor height | A synthetic 0.20 m platform is stepped onto; a 0.70 m one blocks. Walking off a platform returns y to 0 within 0.2 s of simulated time, and y is never below 0. |
| U6 generation | Running `buildColliders(buildWorld(stubScene, stubLoader))` in Node yields: dais circle r 3.40 at (0, −2); 4 truss circles; 2 desk OBBs with ±0.15π yaw; 4 pillar OBBs; 3 wall slabs + south; walls within 0.05 m of the `HALL` constants. |
| U7 NPC paths | Every NPC waypoint loop keeps ≥ 0.35 m clearance from all SOLID/PROP colliders (sampled every 0.05 m). |

End-to-end (Playwright `scripts-qa-collision.mjs`, 390×844, `?debug=1&seed=1`; run on `vite preview` and again on live after deploy):

| Test | Procedure | Pass criteria |
|---|---|---|
| **E1 Cannot walk through the Expert Bar dais** | For θ ∈ {0°, 90°, 180°, 270°} (the clear lanes), start at `(0,−2) + 7·(sin θ, cos θ)`, aim the camera at the dais (`__ebLook`), hold forward 3 s, and sample every frame. Repeat from 16 directions (22.5° steps), where some lanes hit a stool or truss leg first. | Every frame: `dist(p, (0,−2)) ≥ 3.70 − 0.02` and `p.y == 0`. At the end, for the 4 clear lanes: `dist ≤ 3.80` (it was the dais that stopped you). Screenshot shows the avatar's feet on the floor against the dais wall (compare EV2/S15). |
| **E2 Cannot walk through the chairs** | For each of the 4 stools, approach from back, left and right (chair-local; the front faces the dais pocket), starting 2 m out and holding forward toward the stool centre for 2 s. | Every frame: signed distance from p to the stool OBB ≥ 0.30 − 0.02. At the end: ≤ 0.40 (stopped by the stool). |
| E3 Every collider is solid | Table-driven from `__eb.collision.list`: each SOLID/PROP collider is approached from 4 sides (sides blocked by a neighbour within 0.6 m are skipped). | Same invariant: never closer than capsule radius − 0.02. |
| E4 Teleport into a collider resolves | `__ebTeleport` to (0, −2), (4.15, −0.89), (14, 14), (−6.5, 5). | Within 2 frames the player is outside all colliders; over the next 30 frames Δposition < 1 mm (no jitter). |
| E5 Walls are the boundary | From clear start points, hold forward toward each wall for up to 20 s: (−10, 0) facing north and south, (0, 8) facing east and west. | The player stops 0.30 ± 0.05 m from the **visible** wall face (not 2–3 m short); no stop happens in open space. |
| E6 No stuck states | In the stool/dais pocket and at the pillar/wall corners, push into the corner for 1 s, then reverse. | The player moves away within 0.2 s. |
| E7 Camera containment | At 8 edge/corner positions (touching each wall and each corner), sweep yaw 0–2π in 16 steps at 3 pitches. | The camera is inside the hall AABB inset 0.25 m and outside every CAMERA collider. The frame is never a flat single colour (luma stddev > threshold; compare S11). Camera distance ≥ 1.0 m. |
| E8 NPCs are solid and stay out of furniture | 120 s seeded run with the player parked on each NPC route in turn. | No NPC is inside any SOLID/PROP collider; player–NPC centre distance ≥ 0.58 m; NPC per-frame displacement < 0.1 m. |
| E9 Fallback parity | `?models=0`. | Dais, desks, pillars, truss and walls still block. Stools and planters don't render and don't block. |
| E10 Cost | Average `__eb.collision.stepMs` over 600 frames. | < 0.5 ms in headless SwiftShader. |

---

## 6. Prioritised remediation backlog

| Pri | Item | Defects | Files / assets to change | Slice |
|---|---|---|---|---|
| **P0** | Import live v0.3.10 source + deploy script; QA harness + debug hooks | PROC-01, PROC-02 | repo: new source branch; `infra/do/deploy-web-poc.sh`, `DEPLOY.md`, `scripts-qa-cleanup.mjs`, `src/main.js` (`?debug=1` hooks) | S0 |
| **P0** | Collision core (capsule, shapes, layers, floor height, raycast) | COL-01, COL-03 | new `src/collision.js`, `tests/collision.test.mjs`, `package.json` (`test` script) | S1 |
| **P0** | Collider generation + player integration; replace clamp with real walls; south wall | COL-01, COL-02, COL-03, WALL-04 (shell only) | `src/world.js` (tags, `HALL`, south wall), new `src/colliders.js`, `src/models/manifest.js` (`footprint`), `src/avatars.js` (`placeProps` registration), `src/main.js` (movement, `__ebTeleport`, `?debug=colliders`, `?collision=0`), `scripts-qa-collision.mjs` | S2 |
| **P0** | Camera containment | CAM-01, CAM-02, CAM-03 | `src/main.js` camera block (or new `src/camera-rig.js`) | S3 |
| **P0** | NPC motion rewrite + NPC collision | NPC-01..04, COL-04, COL-05 | new `src/npcs.js` (from `main.js:296-305, 353-367, 484-503`), `src/avatars.js` (`animateWalk` speed input) | S4 |
| **P0** | Bar centerpiece: remove crossed photo plates; fix metals; readable ring band | BAR-01..03, COL-06 | `src/world.js:155-237`; new `src/textures.js` canvas generators; stop using `expert-bar-hero-solid.jpg`, `ring-band.jpg` | S5 |
| **P0** | Hall shell: replace photo wallpapers; south wall skin; ceiling; murals sized to walls | WALL-01..06 | `src/world.js:87-152, 281-292, 324-335`; `src/textures.js`; retire `wall-plaster.jpg`, `hall-establish.jpg`, `hall-backdrop.jpg`, `skylight.jpg` from world use | S6 |
| P1 | Locomotion feel: spawn yaw, speed/accel, clip speed, dt-based turn, idle stopgap | AVA-03, AVA-04, AVA-05, AVA-08 | `src/main.js:288, 406-417`, `src/models/manifest.js` (`walkClipSpeed: 0.92`), `src/avatars.js:447-467` | S7 |
| P1 | AV-D arm residual (code path) | AVA-02 | `src/avatars.js` / `src/models/loader.js` (arm overlay), `src/models/manifest.js` (`armFix` flag) | S8 |
| P1 | Floor seams, own-nametag, HUD overlap | MAT-01, UI-01, UI-02 | `src/world.js:56-82`, `src/textures.js`, `src/avatars.js` (`createAvatarMesh` label), `src/style.css` | S9 |
| P1/P2 | Assets: AV-D A-pose re-rig; Idle clips; metallic 0; UV dilation; AV-D card match | AVA-02 (root fix), AVA-03 (root fix), AVA-06, AVA-07, MAT-03, MAT-04 | `public/models/characters/av-*.glb`, `public/textures/avatar-av-d*.{png,jpg}`, `src/avatars.js` AVATARS copy | S10 |
| P2 | Perf/delivery + release | PERF-01..03, MAT-02, UI-03, UI-04 | `src/avatars.js` (lazy billboard), nginx mime/cache (droplet), `src/main.js:505-507` (substep), `index.html`/`src/style.css`, `version.json` | S11 |

---

## 7. Sonnet 5.5 build slices

Rules for every slice:
- One PR per slice, based on the S0 source branch.
- Keep the diff small (target < ~400 changed lines excluding tests and generated textures).
- Attach QA harness before/after for the listed views.
- Bump `version.json` patch.
- Deploy with `infra/do/deploy-web-poc.sh`, then re-run the slice's acceptance tests against live.

Suggested version train:
- S0 = v0.3.11 (no behaviour change)
- **S1 + S2 + S3 = v0.4.0 "solid hall"**
- S4 onward = v0.4.x

Dependency order: **S0 → S1 → S2 → S3** (serial, the P0 collision path). **S4** needs S2. **S5, S6, S7, S9** need only S0 and can run in parallel, but S6 must regenerate colliders from `HALL`. **S8** after S7. **S10** is an asset track in parallel. **S11** last.

### S0 — Source-of-truth sync + QA harness (P0 blocker; zero visual change)

- **Needs box access** (Evan, or an agent with SSH to the droplet).
- Import `/workspace/expert-bar-gameplay/web-poc` at v0.3.10 plus `infra/do/deploy-web-poc.sh` onto a long-lived source branch (recommend `main`; supersede draft PR #1). `gh-pages` stays build output.
- Add `?debug=1` hooks:
  - `__ebLook(yawRad, pitchRad)`
  - `__ebHold(key, ms)` / `__ebInput({x, y})`
  - `__eb.player`, `__eb.camera`, `__eb.npcs`
  - `?seed=N` for deterministic NPC `t` and `idle`
- Add `scripts-qa-cleanup.mjs`, capturing the views in §8 into `qa/out/` (gitignored).
- **Acceptance:**
  - `npm ci && npm run build && npm run preview` serves a build that matches live v0.3.10 in all §8 views (reviewer side-by-side). The YouTube panel works for stations A and D, and the arm overlay is present.
  - `DEPLOY.md` documents the box → droplet deploy.
  - With no query params, the hooks are absent from `window`.

### S1 — Collision core (pure logic + unit tests)

- Add `src/collision.js`: `LAYERS`, `MASKS`, `circle()`, `obb()`, `slab()`, `penetrate()`, `blocks()`, `resolveMove()`, `groundHeightAt()`, `raycastXZ()`, `ColliderWorld`.
- Add `tests/collision.test.mjs` with U1–U5 from §5.12. Add an `npm test` script (`node --test`).
- **Acceptance:** U1–U5 green; no runtime wiring yet; the minified bundle grows < 5 KB.

### S2 — Collider generation + player integration (Evan's P0: "cannot walk through Expert Bar dais or chairs")

- `src/world.js`:
  - add `userData.collider` tags on the dais, column, truss legs, desks and pillars
  - export `HALL`
  - add a plain matte south wall at z = +17.5 (colour-matched; skinned in S6)
  - remove `bounds: 15`
- Add `src/colliders.js` (`buildColliders()` from tags + `HALL`).
- `src/models/manifest.js`: add `footprint` for PROP-CHAIR 0.78 × 0.86 and PROP-PLANTER 0.60 × 0.56.
- `src/avatars.js` `placeProps()`: register one collider per placed instance.
- `src/main.js`:
  - replace the clamp with `resolveMove`
  - set `player.position.y = groundHeightAt(…)`
  - `__ebTeleport` resolves out
  - add `?debug=colliders` and `?collision=0`
  - publish `__eb.collision`
- Add tests U6 and `scripts-qa-collision.mjs` (E1–E6, E9, E10).
- **Acceptance:**
  - **E1 "cannot walk through the Expert Bar dais" and E2 "cannot walk through the chairs" pass.** E3–E6, E9 and E10 pass.
  - Before/after screenshots:
    - holding forward from spawn: before, sinking into the dais; after, stopping at its face
    - a stool approached from behind
    - a corner pillar
    - each wall reached, with no invisible stop

### S2b — (optional, only if Evan picks "walkable stage", D1) Dais steps

- Add a 3-riser stair (0.233 m risers, 0.35 m treads) as `WALKABLE` boxes on the chosen side, and tag the dais top `WALKABLE` (top 0.70). The column stays SOLID.
- **Acceptance:**
  - Walking up the stair ends with the player standing on the dais at y = 0.70 ± 0.01.
  - Walking off the edge drops back to y = 0 within 0.2 s.
  - Approaching the dais from the non-stair sides still blocks (E1 on those lanes).

### S3 — Camera containment

- Spring-arm camera per §5.8 (ray vs `MASKS.camera`, hall AABB inset, snap-in / ease-out, minimum 1.0 m).
- **Acceptance:**
  - E7 passes.
  - V11 (camera at the wall edge) shows the hall, not grey.
  - Standing still, the camera distance changes < 0.02 m between frames (no pumping).
  - The default spawn framing is unchanged when nothing occludes (V2 pixel diff within tolerance).

### S4 — NPC motion + NPC collision

- Move the NPC code to `src/npcs.js`, with these behaviours:
  - waypoint loops (explicit points) with constant-speed traversal
  - **path parameter frozen while idle**
  - turn rate ≤ 4 rad/s, with a short idle turn at loop ends instead of a 180° snap
  - walk `timeScale` from true ground speed ÷ `walkClipSpeed`
  - dynamic NPC circles
  - wait-if-player-ahead (0.8 m cone)
- Reroute the station NPCs in front of the desks instead of through them: a rectangle in **station-local** space, x ∈ [−2.2, 2.2], z ∈ [1.6, 3.0] (the desk face is at local z = +0.53), transformed by the station group matrix, so Station D mirrors automatically. That keeps them "browsing" the stations with > 1 m clearance from desk and planters.
- **Acceptance:**
  - U7 and E8 pass.
  - A 120 s seeded sim shows:
    - 0 teleports (per-frame displacement < 0.1 m at 60 fps, < 0.2 m at dt 0.05)
    - no yaw change > 4 rad/s·dt
    - no 180° snaps
    - foot-slide ratio (ground speed ÷ (clip speed × timeScale)) within 0.8–1.25 while walking
  - The player cannot walk through any NPC.

### S5 — Expert Bar centerpiece

- Delete both crossed hero planes. Replace them with a **3D fascia band**: an open `CylinderGeometry` ring just above the dais top (or a sign ring on the truss) carrying a canvas-generated, integer-repeat "EXPERT BAR · revio SUMMIT" texture with real alpha. Nothing may extend beyond the dais footprint toward spawn.
- Set `scene.environment` from `RoomEnvironment` + PMREM (one-off at load), or cap truss/column metalness at ≤ 0.2.
- Replace the torus-tube text with a flat ribbon (open cylinder band) so text faces outward. Set `ring.castShadow = false`.
- **Acceptance:**
  - From spawn, V9 and V10 show no black slab, no photo plates and no geometry in front of the dais.
  - Truss/column mean luma in the V9 crop is ≥ 2× the v0.3.10 baseline (no near-black chrome).
  - Ring text is readable and uncut in V2 and V9.
  - No transparent sort flicker across a 360° orbit (16-frame strip).
  - E1 still passes.

### S6 — Hall shell (Evan's wallpaper complaint)

- Replace photo wallpapers with **generated seamless materials**:
  - canvas plaster / acoustic-panel texture, or flat PBR colour + subtle noise
  - world-space UV scale at ~128–256 px/m, so there is no stretch on any wall or pillar size
- Replace the backdrop with a **clean branded composition**:
  - revio logo SVG, "revio SUMMIT" type, and the mountain graphic at native aspect, on a canvas or a few planes
  - no photos of other halls or people
- Size the side murals to the walls (no overhang above 9 m or below the floor); they may use a stylised version of the branded art.
- South wall skinned.
- Ceiling plane with emissive skylight panels (real geometry) instead of the floating photo.
- Pillars reuse the wall material with correct UVs.
- Colliders regenerate from `HALL` (no manual edits).
- **Acceptance:**
  - A scripted `sharp` seam score ≤ 2 for every tiling texture.
  - No texture/surface pair has an aspect stretch > 1.1 (Node check over `world.js` meshes).
  - No sky-blue pixels at any look pitch in V2, V5–V8 and V12.
  - No wall, mural or backdrop geometry extends above `HALL.height` or below y = 0 (Box3 test).
  - U6 walls within 0.05 m of the visible faces.
  - Reviewer confirms no people or foreign-venue content in any wall texture.

### S7 — Locomotion feel

- `player.rotation.y = Math.PI` at spawn.
- Walk speed 2.0 m/s (D2) with accel/decel at 8 m/s².
- `walkClipSpeed: 0.92` for all four characters; timeScale clamp 0.8–2.2.
- dt-based turn smoothing `1 − exp(−12·dt)`.
- **Idle stopgap** until S10 idle clips land: on stop, blend the walk action to the feet-together frame (**t ≈ 2.71 s**, ~4 cm foot gap) over 0.2 s and pause.
- **Acceptance:**
  - The first in-hall frame shows the avatar's back.
  - Foot-slide ratio 0.8–1.25 at full speed.
  - Stopping leaves feet together in V2.
  - Turn trajectory is identical within 2° at 30 vs 60 fps (throttled rAF).
  - E1/E2 still pass at the new speed.

### S8 — AV-D arm residual (code path; superseded by S10 re-rig when that lands)

- Gate the v0.3.10 overlay to AV-D only (`armFix: 'tpose'` in the manifest). **Restore authored arm tracks for AV-A/B/C.**
- Compute arm targets in avatar-local (chest) space.
- Build rotations from the bone's rest axis with swing-twist, preserving the rest roll (no `setFromUnitVectors((0,1,0), ≈−Y)`).
- Target 10–12° abduction and ≤ 0.6 rad clavicle drop.
- **Acceptance:**
  - L10-style lineup: 4 avatars × 4 headings × walk/stop.
  - No hand or forearm bone inside a torso capsule (bone-distance check through `__eb`).
  - Both arms visible front and back; sleeve silhouettes symmetric (reviewer).
  - AV-A/B/C arm quaternions equal the GLB clip values.

### S9 — Floor, UI polish

- Carpet: generated seamless texture or edge-blended rework, repeat derived from world size.
- Path disc: `polygonOffset` or y = 0.02.
- Hide the local player's own nametag (keep NPC tags; set `depthTest: true` for NPC tags).
- Stack `.host-badge` below `.hint` at ≤ 430 px.
- **Acceptance:** carpet seam score ≤ 2; nothing overlaps the bar centre in V2/V9; no HUD overlap at 390×844 or 430×932.

### S10 — Asset pass (Meshy / Higgsfield track; runs in parallel)

- AV-D: re-rig or regenerate from an **A-pose** (`pose_mode: "a-pose"`), matching the card ("soft blue shirt · glasses") or update the card to match the model.
- Add an **Idle** clip to all four characters.
- Set `metallicFactor 0`.
- Dilate UV islands (fixes the AV-A/B speckles).
- **Acceptance** (glTF-Transform inspection script):
  - upper-arm rest angle 30–50° from vertical for all four
  - an `Idle` clip exists
  - metallic 0
  - GLB size ≤ current + 20%
- Then delete the S8 overlay path and drop the S7 idle stopgap; E-tests and the S8 lineup stay green.

### S11 — Perf, delivery, release

- Lazy-create billboards only on GLB failure (saves ~620 KB).
- nginx: `model/gltf-binary` MIME type; `immutable` cache for `?v=` assets.
- Replace the 0.05 s dt cap with fixed 1/60 substeps (max 4).
- Login fits 390×844 without scrolling.
- Verify UI-04 on device.
- Bump to the next v0.4.x; optionally mirror the build to `gh-pages`.
- **Acceptance:**
  - Request bytes ≤ baseline − 500 KB.
  - Tris/draw calls ≤ the PERF-04 baseline + 10%.
  - Correct `content-type` and `cache-control` on GLBs.
  - At 15 fps (throttled), walk speed stays 2.0 m/s ± 5%.

---

## 8. QA harness views (regression set for every slice)

`scripts-qa-cleanup.mjs` (S0) captures these at 390×844 with `?debug=1&seed=1`:

| View | Setup | Guards |
|---|---|---|
| V1 | Login screen | UI-03 |
| V2 | Spawn, default camera | BAR-01, UI-01, AVA-05, WALL-* |
| V3 | Walk forward 2 s (back view, mid-stride) | AVA-02/04 |
| V4 | Walking toward the camera | AVA-02 |
| V5 | Spawn, max look-up | WALL-05 |
| V6 / V7 | Look left / right from spawn | WALL-01/02 |
| V8 | Look behind spawn | WALL-04 |
| V9 / V10 | Bar front at 6 m / oblique 45° | BAR-01..03 |
| V11 | Player at the east wall, camera yaw +90° | CAM-01 |
| V12 | Backdrop close (z = −12) | WALL-03 |
| V13 | Corner pillar (13.2, 13.2) | WALL-01, COL-01 |
| V14 | Station A approach + panel open | stations regression |
| V15 | Hold forward from spawn 4 s (dais contact) | **COL-01 / E1** |
| V16 | NPC watch strip (8 frames, 1 s apart) | NPC-01..03 |

---

## 9. Decisions needed from Evan

| # | Decision | Recommendation |
|---|---|---|
| D1 | Is the Expert Bar dais a **solid counter** (you stand at the stools) or a **walkable stage** (steps up, stand on it)? | **Solid counter** by default (S2). Floor-height support ships either way; S2b adds steps only if wanted. |
| D2 | Player walk speed: 3.6 m/s today (reads as jogging with skating feet). | **2.0 m/s** walk. A run would need a run clip (asset track). |
| D3 | Source branch for the imported box code, and the fate of draft PR #1. | New `main` source branch; close PR #1 as superseded after S0. |
| D4 | Backdrop direction: clean branded composition vs a better photo. | **Branded composition** (sharp at any distance; no foreign venue). |
| D5 | AV-D long-term: re-rig/regenerate (S10) vs keep the code overlay (S8). | **Re-rig in A-pose** (S10). S8 is the interim fix. |
| D6 | Stools tucked 0.47 m from the bar (you can't squeeze between a stool and the bar). | Keep (realistic). The alternative is to move the stools out to r ≈ 4.6 m. |

---

## 10. Explicitly out of scope

- **Unreal Engine** work of any kind (photo-real pass, Pixel Streaming, MetaHumans), and **MI325** / GPU streaming infrastructure.
- A broad product restart or re-architecture: no new engine, no framework swap, no physics engine (Rapier/Ammo/cannon), no multiplayer/netcode, no new rooms or layout redesign, no new features beyond cleaning up the live web POC.
- Changes to the YouTube station content or PSA/product integration (panels stay as-is apart from the UI-04 verification).
- Photo-real lighting, baked GI, post-processing stacks.
- Implementing any of this in this PR: this PR is **the plan doc only**.

---

## Appendix A — Measurements

**Texture audit** (live `/textures`):

| File | px | Used on | Surface (m) | Stretch | px/m | Seam score |
|---|---|---|---|---|---|---|
| `wall-plaster.jpg` | 512×512 | walls (`repeat [2,1]`), pillars (no repeat) | 18×9 tile; 1.1×7 | 2.0× H; 6.4× V | 28 | 58 |
| `hall-establish.jpg` | 1280×579 | side murals | 28×12 | 1.05× | 46 | n/a (not tiled; wrong content) |
| `hall-backdrop.jpg` | 1280×720 | backdrop | 38×14 | 1.53× H | 34 | n/a |
| `summit-mountain.jpg` | 1024×576 | mountain mural | 10×4.2 | 1.34× H | 102 | n/a |
| `expert-bar-hero-solid.jpg` | 768×532 | crossed hero plates | 12×8.3 | 1.0× | 64 | opaque black bg |
| `ring-band.jpg` | 2048×256 | torus, `repeat 4` | 8.6 m arc × 0.75 m tube circumference | — | — | non-seamless, cut glyph |
| `floor-carpet.jpg` | 1024×1024 | floor, `repeat [5,5]` | 8.4×8.4 tile | 1.0× | 122 | 17 |
| `skylight.jpg` | 960×302 | floating plane | 18×6 | 1.06× | 53 | n/a |

**Rig audit** (Meshy GLBs, 24 joints, clip `Armature|Casual_Walk|baselayer`, 4.23 s):

| | Upper arm at rest (from vertical) | Upper arm in walk clip | Notes |
|---|---|---|---|
| AV-A / AV-B / AV-C | 19–40° (A-pose) | 15–28° | natural |
| AV-D | **97.9° (T-pose)**, forearm 116.8° | 34–41°, forearm 42–50° | cause of AVA-01; v0.3.10 overlay → AVA-02 residual |

**Walk clip speed:** 6 steps × ~0.65 m ÷ 4.23 s ≈ **0.92 m/s**. The feet-together frame is at t ≈ 2.71 s (~4 cm gap), used for the S7 idle stopgap.

**NPC sim** (10 min, v0.3.10 constants): idle NPC teleports ~2/min (max 5.9 m); line-path 180° snaps ~6/min; station NPCs inside a desk ~10% of path time; orbit NPC 0.74 m/s vs a 0.84 m/s minimum clip rate (0.6 × 1.4).
