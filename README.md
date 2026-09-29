# Expert Bar — Web 3D Interactive POC

**Purpose:** Phone-playable buy-in demo while Unreal / Pixel Streaming waits on IT.  
**Fidelity target:** photo-real hall + stations + avatars (hero/OTS plates + HF cutouts) — not Unreal/MetaHuman, but must not read as Roblox. Sells *feel*: personalized avatar, shared hall with other users, walk-up Station A/D.

## Run locally

```bash
cd /workspace/expert-bar-gameplay/web-poc
npm install
npm run dev          # http://0.0.0.0:5173
# or production build:
npm run build
npm run preview      # http://0.0.0.0:4173
```

Open the printed URL on a phone (same LAN) or tunnel if remote.

### Login (mobile-first)

Before the hall, a **Login** screen collects:

| Field | Rules |
|-------|--------|
| **Display name** | Required. Shown on the in-world nameplate above your avatar. |
| **Demo code** | Defaults to `DEMO`. POC accepts **any non-empty** string. |
| **Avatar** | Presets AV-A–D (same looks as before). |

Primary button: **Enter Expert Bar**. Display name + avatar id are stored in `localStorage` (`eb_display_name`, `eb_avatar`; demo code also saved as `eb_demo_code` for convenience).

### Phone access (Evan)

1. **Same machine / box browser:** open `http://127.0.0.1:4173/` (preview) or `:5173` (dev).
2. **Phone on same network as the host running preview:** `http://<host-lan-ip>:4173/`
3. **Public HTTPS for phone (remote):** requires a tunnel or hosted deploy (e.g. Cloudflare Tunnel, localtunnel, static host). **Revay handles public HTTPS / tunnel setup** — this workspace does not create public tunnels.

Box preview (this workspace) binds `0.0.0.0:4173` but the box LAN IP is typically not reachable from Evan's phone — use a tunnel from Evan's laptop after `npm run preview`, or open on the box desktop browser for proof.

**Controls**
- Touch: **Left** virtual joystick (≥140px) + D-pad = move (F/B/strafe); **Right** half-screen drag = look (yaw/pitch); **Interact** (bottom-right)
- Desktop: **WASD** / arrows move; drag right half (or **Q**, / **.**) to look; **E** / Space near a station
- Camera orbit is independent of avatar facing — no spin feedback loop
- Start: Login → name + demo code + AV-A–D → Enter Expert Bar
- After login, `#picker` is fully removed from hit-testing (`display:none` + `pointer-events:none`)

## What you get

1. Mobile-first login (display name, demo code, avatar picker; name+avatar remembered in `localStorage`)
2. In-world nameplate above the player (display name + AV id)
3. Third-person over-the-shoulder camera follow
4. Summit Expert Bar–like hall: floor, ring band (`EXPERT BAR` / Summit cyan-navy), hanging `rev.io SUMMIT 2026` banners, mountain mural
5. Station **A Billing** + Station **D Tickets** — approach → Interact → mock Revii UI stills
6. 3 other distinct avatar NPCs walking/idling (demo bots, not real multiplayer)

## Fidelity note

This is a **web POC for stakeholder buy-in**, not the production Unreal / MetaHuman / Pixel Streaming bar. **Direction (2026-09-28):** photo-real target — hall backdrop + Expert Bar hero plate from cinematic stills, photo billboard AV-A–D, Revii station monitors, ACESFilmic lighting. Brand cues: cyan `#34BDE5` / navy / white — **no corporate green**. Remaining gaps for Unreal Phase 2: true 3D MetaHumans, detailed truss geo, HDRI reflections, dense crowd, Pixel Streaming.

## Paths

| Item | Path |
|------|------|
| Source | `web-poc/src/` |
| Static textures | `web-poc/public/textures/` |
| Screenshots | `web-poc/shots/` (incl. `00-login.png`) |
| Build output | `web-poc/dist/` |

## Stack

Vite 6 + Three.js r170 + custom touch joystick. Static-hostable (`dist/`).

## Live mobile URL (2026-09-29)

**Open on phone (primary):** https://stream.revioai.bot/

Also: https://revioai.bot/ (same build). Login with display name + demo code `DEMO` + avatar, then Enter Expert Bar.

Prior GH Pages cut (superseded for demos): https://erice320.github.io/expert-bar-web-poc/  
Repo: https://github.com/erice320/expert-bar-web-poc (gh-pages). Deploy to droplet: `infra/do/deploy-web-poc.sh`.

**Controls fix deploy:** commit `9298b07` — independent `camYaw`/`camPitch` look pad (right half) + left-stick move; spin feedback loop removed.

**Panel close fix deploy:** commit `d9bbc62` — `#station-panel` z-index above look-zone so Close receives touches; pointer/touch close, overlay tap, Escape/E/Space; movement resumes.

**Photo-real fidelity deploy:** hall + avatar billboards + Expert Bar hero plate (see CHANGELOG 2026-09-28 ~11:10 CT).

## v0.3.0 — GLB avatars/props (loader + fallback)

- Characters `AV-A..D` and props (`PROP-CHAIR` x4, `PROP-PLANTER` x4) load from `public/models/` (slots and filenames: `public/models/README.md`).
- Billboards remain the instant fallback; any missing/invalid/slow GLB leaves the v0.2 look (props absent). No GLBs are shipped yet (Higgsfield generation is a follow-up), so v0.3.0 currently renders identically to v0.2 apart from the version badge.
- URL switches: `?models=0` (no GLB requests), `?modelFail=AV-B,PROP-CHAIR` (force fallback).
- Debug: `window.__eb` has `version`, `models`, `tris`, `calls`.
- Version comes from `package.json` (`__APP_VERSION__`); also update `public/version.json`.
- Plan: `PLAN.md` / `CHECKLIST.md`. Deploy: `DEPLOY.md`.
