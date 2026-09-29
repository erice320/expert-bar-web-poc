# Deploying the web POC (stream.revioai.bot)

Production is served by nginx on the DigitalOcean signaling droplet from the Vite `dist/` output.

## Where the deploy script lives

`infra/do/deploy-web-poc.sh` in the **expert-bar-gameplay** workspace on the Revay/Higgsfield box
(`/workspace/expert-bar-gameplay/`, with this app at `web-poc/`). That script is **not part of this repository**
and was not included in the source tarball, so it has not been run or verified from here. A v0.3.0 deploy has **not** been performed
from this repo.

## Steps (on the box)

```bash
cd /workspace/expert-bar-gameplay/web-poc      # this repo's contents
npm ci && npm run build                          # produces dist/
cd .. && bash infra/do/deploy-web-poc.sh         # read it first; it must ship the whole dist/
```

Before running, confirm the script copies the **entire `dist/`** (e.g. `rsync -a dist/ host:/path/`). If it copies explicit
paths (`assets/`, `textures/`, `index.html`), add `models/` and `version.json`; that is the only change needed.
Do not hand-copy files to the droplet.

## Post-deploy checks (PLAN.md section 7.3)

```bash
curl -s https://stream.revioai.bot/version.json                              # "version":"0.3.0"
curl -s -r 0-3 https://stream.revioai.bot/models/characters/av-a.glb | xxd   # 676c 5446 (glTF), for each shipped GLB
curl -sI https://stream.revioai.bot/models/characters/av-a.glb               # not text/html; Content-Length == local size
```

nginx has an SPA fallback: a missing GLB returns `200 text/html`, so always check the `glTF` magic bytes, not the status code.

`wrangler.jsonc` in this repo is an alternative static-assets target (Cloudflare Workers, `./dist`, SPA fallback); it is not the production path.

After a successful deploy: tag `v0.3.0`, then mirror `dist/` to `gh-pages` (preserve `PLAN.md`, `CHECKLIST.md`, `.nojekyll`).
