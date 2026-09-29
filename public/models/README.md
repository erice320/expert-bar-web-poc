# GLB asset slots (v0.3.0)

Drop optimized GLBs here using **exactly** these filenames. Slots without a valid GLB fall back automatically
(characters keep the v0.2 photo billboard, props are simply absent). No code change is needed to activate a slot;
bump the patch version in `package.json` (and `public/version.json`) so clients refetch (`?v=<version>`).

| Slot | File | Target height | Tris | Size | Required |
|---|---|---|---|---|---|
| AV-A (Alex Rivera) | `characters/av-a.glb` | 1.70 m | <= 25k | <= 2.5 MB | target |
| AV-B (Morgan Hale) | `characters/av-b.glb` | 1.80 m | <= 25k | <= 2.5 MB | target |
| AV-C (Jordan Quinn) | `characters/av-c.glb` | 1.75 m | <= 25k | <= 2.5 MB | target |
| AV-D (Casey Brooks) | `characters/av-d.glb` | 1.80 m | <= 25k | <= 2.5 MB | target |
| PROP-CHAIR (x4 around the bar) | `props/lounge-chair.glb` | 0.85 m | <= 8k | <= 1.0 MB | yes (1 prop min) |
| PROP-PLANTER (x4, flanking Stations A/D) | `props/planter.glb` | 1.30 m | <= 10k | <= 1.2 MB | optional |

Minimum shippable: 2 characters + `PROP-CHAIR`. Total `dist/models/` <= 12 MB.

## Asset requirements

- Binary `.glb` (first four bytes `glTF`). Meshopt compression is supported; Draco/KTX2 are **not**.
- Characters: `skinned: true` in `src/models/manifest.js` requires a skin **and at least one animation clip**
  (clip named `*walk*` is preferred, else the first clip; an `*idle*` clip is used when present). Root-motion
  `.position` tracks are stripped at load. Rigged, A-pose or natural pose, baseColor texture.
  Static (no rig) meshes: set `skinned: false` for that slot; the runtime adds a procedural bob/sway.
- Models must face **+Z** (or set `yawOffset` in the manifest). Scale/ground/centring are normalized at load from the slot `height`.
- Metalness is clamped to <= 0.1 and roughness to >= 0.55 (the scene has no environment map).
- Textures <= 1024 px.

Optimize with (see `PLAN.md` section 3.3):

```bash
npx -y @gltf-transform/cli@4 optimize raw/av-a.glb public/models/characters/av-a.glb \
  --compress meshopt --texture-compress webp --texture-size 1024 --simplify false
```

## Verifying

- Local: `npm run build && npm run preview`, then `node scripts-models.mjs` (prints `__eb.models` per scenario and `/models/` requests).
- `?models=0` disables all GLB loading; `?modelFail=AV-B,PROP-CHAIR` forces those slots down the fallback path.
- Pipeline smoke test with throwaway assets: `node scripts/make-test-glbs.mjs` writes fake GLBs to `./test-models/`
  (gitignored, never ship them); copy into `dist/models/` to exercise the loader.
- Production nginx serves `index.html` (HTTP 200) for missing paths, so verify real files with
  `curl -s -r 0-3 https://stream.revioai.bot/models/characters/av-a.glb | xxd` -> `676c 5446`.

`public/version.json` `models` array should list only slots actually shipped.
