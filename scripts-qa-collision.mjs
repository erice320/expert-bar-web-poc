// Collision acceptance (docs/QA-CLEANUP-PLAN.md §5.12 E1-E6, E9, E10) against a running build.
//   npm run build && npm run preview &   (http://127.0.0.1:4173/)
//   node scripts-qa-collision.mjs
// Env: EB_URL (default http://127.0.0.1:4173/), EB_SHOTS=0 to skip screenshots,
//      EB_ONLY=E1,E6 to run a subset, EB_E10_FRAMES (default 300), EB_CHROME_CHANNEL (default "chrome"; "" = bundled chromium).
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = (process.env.EB_URL || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const SHOTS = process.env.EB_SHOTS !== '0';
const SHOT_DIR = 'shots/s2';
const ONLY = process.env.EB_ONLY ? new Set(process.env.EB_ONLY.split(',')) : null;
const want = (id) => !ONLY || ONLY.has(id);
const E10_FRAMES = Number(process.env.EB_E10_FRAMES || 300);

const R = 0.3;
const TOL = 0.02;
const DAIS = { x: 0, z: -2, r: 3.4 };
const HALL = { halfX: 17.5, zNorth: -16.9, zSouth: 17.5 };

const results = [];
const failures = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures.push(`${name} ${detail}`);
}

// ---------- geometry helpers (Node side; mirror src/collision.js conventions) ----------
function signedDist(c, x, z) {
  if (c.shape === 'circle') return Math.hypot(x - c.x, z - c.z) - c.r;
  const cos = Math.cos(c.yaw);
  const sin = Math.sin(c.yaw);
  const dx = x - c.x;
  const dz = z - c.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const ox = Math.max(Math.abs(lx) - c.hx, 0);
  const oz = Math.max(Math.abs(lz) - c.hz, 0);
  return Math.hypot(ox, oz);
}
const blocking = (list) => list.filter((c) => c.layers & (1 | 2 | 4));
function segmentClear(list, from, to, skipId, min = R + TOL) {
  const n = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.05);
  for (let i = 0; i <= n; i++) {
    const x = from.x + ((to.x - from.x) * i) / n;
    const z = from.z + ((to.z - from.z) * i) / n;
    for (const c of blocking(list)) if (c.id !== skipId && signedDist(c, x, z) < min) return false;
  }
  return true;
}
const headingYaw = (dx, dz) => Math.atan2(-dx, -dz);

// ---------- browser helpers ----------
async function launch() {
  const channel = process.env.EB_CHROME_CHANNEL ?? 'chrome';
  const opts = {
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  };
  try {
    return await chromium.launch(channel ? { ...opts, channel } : opts);
  } catch (e) {
    console.warn(`chromium.launch(channel=${channel}) failed (${e.message.split('\n')[0]}); falling back to bundled`);
    return chromium.launch(opts);
  }
}

async function openHall(browser, query = 'debug=1') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.warn('pageerror:', e.message));
  await page.goto(`${BASE}?${query}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#display-name', { timeout: 15000 });
  await page.fill('#display-name', 'QA');
  await page.fill('#demo-code', 'DEMO');
  await page.click('.avatar-opt >> nth=3');
  await page.click('#enter-btn');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 15000 });
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.__qa = { trace: [], on: false };
    let last = performance.now();
    const loop = (ts) => {
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      if (window.__qa.on) {
        const p = window.__eb?.player;
        if (p) window.__qa.trace.push({ x: p[0], y: p[1], z: p[2], dt });
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.waitForFunction(() => window.__eb && window.__ebTeleport && window.__ebLook, null, { timeout: 15000 });
  return { page, context };
}

const frames = (page, n = 2) =>
  page.evaluate(
    (count) =>
      new Promise((res) => {
        let i = 0;
        const f = () => (++i >= count ? res() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n
  );

const colliders = (page) => page.evaluate(() => window.__eb.collision.list);
const playerPos = (page) => page.evaluate(() => ({ x: window.__eb.player[0], y: window.__eb.player[1], z: window.__eb.player[2] }));

async function waitForProps(page, chairs = 4, timeoutMs = 20000) {
  try {
    await page.waitForFunction(
      (n) => window.__eb.collision.list.filter((c) => c.id.startsWith('PROP-CHAIR')).length >= n,
      chairs,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

async function teleport(page, x, z) {
  await page.evaluate(([px, pz]) => window.__ebTeleport(px, pz), [x, z]);
  await frames(page, 3);
  return playerPos(page);
}

/** Hold forward along the world heading (dx, dz) until the player stops. Returns per-frame trace. */
async function holdHeading(page, dx, dz, { maxMs = 25000, minMove = 0.05, settle = 12 } = {}) {
  await page.evaluate((yaw) => window.__ebLook(yaw, 0.18), headingYaw(dx, dz));
  await frames(page, 1);
  await page.evaluate(() => {
    window.__qa.trace = [];
    window.__qa.on = true;
  });
  await page.keyboard.down('KeyW');
  const trace = await page.evaluate(
    ({ maxMs: max, minMove: mm, settle: st }) =>
      new Promise((res) => {
        const t0 = performance.now();
        const iv = setInterval(() => {
          const tr = window.__qa.trace;
          const done = () => {
            clearInterval(iv);
            window.__qa.on = false;
            res(tr.slice());
          };
          if (performance.now() - t0 > max) return done();
          if (tr.length > st + 3) {
            const a = tr[tr.length - st];
            const b = tr[tr.length - 1];
            const first = tr[0];
            const moved = Math.hypot(b.x - first.x, b.z - first.z) > mm;
            if (moved && Math.hypot(b.x - a.x, b.z - a.z) < 1e-3) done();
          }
        }, 40);
      }),
    { maxMs, minMove, settle }
  );
  await page.keyboard.up('KeyW');
  return trace;
}

/** Hold forward for a fixed number of simulated seconds (sum of capped frame dt). */
async function holdSimSeconds(page, dx, dz, seconds) {
  await page.evaluate((yaw) => window.__ebLook(yaw, 0.18), headingYaw(dx, dz));
  await frames(page, 1);
  await page.evaluate(() => {
    window.__qa.trace = [];
    window.__qa.on = true;
  });
  await page.keyboard.down('KeyW');
  const trace = await page.evaluate(
    (secs) =>
      new Promise((res) => {
        const iv = setInterval(() => {
          const tr = window.__qa.trace;
          const simT = tr.reduce((s, f) => s + f.dt, 0);
          if (simT >= secs) {
            clearInterval(iv);
            window.__qa.on = false;
            res(tr.slice());
          }
        }, 40);
      }),
    seconds
  );
  await page.keyboard.up('KeyW');
  return trace;
}

const minOver = (trace, fn) => trace.reduce((m, p) => Math.min(m, fn(p)), Infinity);
const last = (a) => a[a.length - 1];
const deg = (r) => `${((r * 180) / Math.PI).toFixed(1)}deg`;

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

// ---------- tests ----------
async function e1(page) {
  const clear = new Set([0, 90, 180, 270]);
  for (let k = 0; k < 16; k++) {
    const theta = (k * 22.5 * Math.PI) / 180;
    const label = `θ=${(k * 22.5).toFixed(1)}°`;
    const want = { x: DAIS.x + 7 * Math.sin(theta), z: DAIS.z + 7 * Math.cos(theta) };
    const start = await teleport(page, want.x, want.z);
    const trace = await holdHeading(page, DAIS.x - start.x, DAIS.z - start.z);
    const minDist = minOver(trace, (p) => Math.hypot(p.x - DAIS.x, p.z - DAIS.z));
    const maxY = trace.reduce((m, p) => Math.max(m, Math.abs(p.y)), 0);
    const end = last(trace);
    const endDist = Math.hypot(end.x - DAIS.x, end.z - DAIS.z);
    const isClear = clear.has(k * 22.5);
    const ok = minDist >= DAIS.r + R - TOL && maxY < 1e-6 && (!isClear || endDist <= 3.8);
    check(
      `E1 dais ${label}${isClear ? ' (clear lane)' : ''}`,
      ok,
      `frames=${trace.length} minDist=${minDist.toFixed(3)} endDist=${endDist.toFixed(3)} maxY=${maxY}`
    );
    if (isClear && k === 0) await shot(page, 'after-dais-lane-south');
  }
}

async function e2(page, list) {
  const chairs = list.filter((c) => c.id.startsWith('PROP-CHAIR'));
  check('E2 four chair colliders registered', chairs.length === 4, `found ${chairs.length}`);
  for (const chair of chairs) {
    const fx = Math.sin(chair.yaw);
    const fz = Math.cos(chair.yaw);
    const rx = Math.cos(chair.yaw);
    const rz = -Math.sin(chair.yaw);
    const sides = {
      back: { x: chair.x - 2 * fx, z: chair.z - 2 * fz },
      left: { x: chair.x - 2 * rx, z: chair.z - 2 * rz },
      right: { x: chair.x + 2 * rx, z: chair.z + 2 * rz },
    };
    for (const [side, want] of Object.entries(sides)) {
      const tag = `E2 chair@(${chair.x.toFixed(2)},${chair.z.toFixed(2)}) from ${side}`;
      if (!segmentClear(list, want, { x: chair.x, z: chair.z }, chair.id, R + 0.05)) {
        console.log(`SKIP  ${tag} (path blocked by a neighbour)`);
        continue;
      }
      const start = await teleport(page, want.x, want.z);
      const trace = await holdHeading(page, chair.x - start.x, chair.z - start.z);
      const minD = minOver(trace, (p) => signedDist(chair, p.x, p.z));
      const endD = signedDist(chair, last(trace).x, last(trace).z);
      check(tag, minD >= R - TOL && endD <= 0.4, `min=${minD.toFixed(3)} end=${endD.toFixed(3)}`);
      if (side === 'back' && chair === chairs[0]) await shot(page, 'after-stool-from-behind');
    }
  }
}

async function e3(page, list) {
  const targets = list.filter((c) => c.layers & (2 | 4) && !(c.layers & 1));
  let tested = 0;
  for (const c of targets) {
    const axes = c.shape === 'circle'
      ? [[1, 0, c.r], [-1, 0, c.r], [0, 1, c.r], [0, -1, c.r]]
      : [
          [Math.cos(c.yaw), -Math.sin(c.yaw), c.hx],
          [-Math.cos(c.yaw), Math.sin(c.yaw), c.hx],
          [Math.sin(c.yaw), Math.cos(c.yaw), c.hz],
          [-Math.sin(c.yaw), -Math.cos(c.yaw), c.hz],
        ];
    for (const [ax, az, ext] of axes) {
      const want = { x: c.x + ax * (ext + 1.5), z: c.z + az * (ext + 1.5) };
      if (Math.abs(want.x) > HALL.halfX - 0.5 || want.z < HALL.zNorth + 0.5 || want.z > HALL.zSouth - 0.5) continue;
      if (!segmentClear(list, want, { x: c.x, z: c.z }, c.id, R + 0.05)) continue;
      const start = await teleport(page, want.x, want.z);
      const trace = await holdHeading(page, c.x - start.x, c.z - start.z, { maxMs: 15000 });
      const minD = minOver(trace, (p) => signedDist(c, p.x, p.z));
      const endD = signedDist(c, last(trace).x, last(trace).z);
      tested++;
      check(`E3 ${c.id} from (${ax.toFixed(2)},${az.toFixed(2)})`, minD >= R - TOL && endD <= 0.4, `min=${minD.toFixed(3)} end=${endD.toFixed(3)}`);
    }
  }
  check('E3 exercised every non-wall collider at least once', tested >= targets.length, `${tested} approaches / ${targets.length} colliders`);
}

async function e4(page) {
  for (const [x, z] of [[0, -2], [4.15, -0.89], [14, 14], [-6.5, 5]]) {
    await page.evaluate(([px, pz]) => window.__ebTeleport(px, pz), [x, z]);
    await frames(page, 2);
    const list = await colliders(page);
    const p0 = await playerPos(page);
    const inside = blocking(list).filter((c) => signedDist(c, p0.x, p0.z) < R - 1e-3);
    await page.evaluate(() => {
      window.__qa.trace = [];
      window.__qa.on = true;
    });
    await frames(page, 30);
    const tr = await page.evaluate(() => {
      window.__qa.on = false;
      return window.__qa.trace;
    });
    const drift = Math.max(...tr.map((p) => Math.hypot(p.x - p0.x, p.z - p0.z)));
    check(`E4 teleport into (${x},${z}) resolves out`, inside.length === 0 && drift < 1e-3, `overlapping=[${inside.map((c) => c.id)}] drift=${drift.toExponential(1)}`);
  }
}

async function e5(page) {
  const cases = [
    ['north from (-10,0)', -10, 0, 0, -1, (p) => p.z - HALL.zNorth],
    ['south from (-10,0)', -10, 0, 0, 1, (p) => HALL.zSouth - p.z],
    ['east from (0,8)', 0, 8, 1, 0, (p) => HALL.halfX - p.x],
    ['west from (0,8)', 0, 8, -1, 0, (p) => p.x + HALL.halfX],
  ];
  for (const [name, x, z, dx, dz, gap] of cases) {
    await teleport(page, x, z);
    const trace = await holdHeading(page, dx, dz, { maxMs: 30000 });
    const g = gap(last(trace));
    check(`E5 wall ${name}`, Math.abs(g - R) <= 0.05, `stopped ${g.toFixed(3)} m from the visible face`);
    if (name.startsWith('east')) await shot(page, 'after-east-wall');
  }
}

async function e6(page) {
  const spots = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) spots.push({ name: `wall corner (${sx},${sz})`, x: sx * 16.9, z: sz * (sz < 0 ? 16.6 : 17.2), dx: sx, dz: sz });
  }
  // Notches between a stool pair and the dais rim: straight in, and angled toward each stool.
  for (const sx of [-1, 1]) {
    for (const k of [-1, 0, 1]) {
      const from = { x: sx * 5.4, z: -2 };
      const to = { x: sx * 3.6, z: -2 + k * 0.8 };
      const len = Math.hypot(to.x - from.x, to.z - from.z);
      spots.push({ name: `stool-pair notch x${sx > 0 ? '+' : '-'} aim${k}`, ...from, dx: (to.x - from.x) / len, dz: (to.z - from.z) / len });
    }
  }
  for (const s of spots) {
    await teleport(page, s.x, s.z);
    await holdSimSeconds(page, s.dx, s.dz, 1);
    const stuck = await playerPos(page);
    const away = await holdSimSeconds(page, -s.dx, -s.dz, 0.4);
    let simT = 0;
    let movedAt = null;
    for (const f of away) {
      simT += f.dt;
      if (movedAt === null && Math.hypot(f.x - stuck.x, f.z - stuck.z) >= 0.3) movedAt = simT;
    }
    check(`E6 not stuck at ${s.name}`, movedAt !== null && movedAt <= 0.25, `moved 0.3 m after ${movedAt === null ? 'never' : movedAt.toFixed(3) + ' s sim'}`);
  }
}

async function e9(browser) {
  const { page, context } = await openHall(browser, 'debug=1&models=0');
  await page.waitForTimeout(3500);
  const snap = await page.evaluate(() => window.__eb.collision);
  check('E9 ?models=0 registers no PROP colliders', snap.byLayer.PROP === 0, `PROP=${snap.byLayer.PROP}, total=${snap.count}`);
  check('E9 ?models=0 keeps dais/desks/pillars/truss/walls', snap.count === 16, `count=${snap.count}`);
  const start = await teleport(page, 0, 5);
  const trace = await holdHeading(page, 0, -1);
  const minDist = minOver(trace, (p) => Math.hypot(p.x, p.z + 2));
  check('E9 dais still blocks without models', minDist >= 3.68 && start.z > 0, `minDist=${minDist.toFixed(3)}`);
  await teleport(page, 7, -0.89);
  const t2 = await holdHeading(page, -1, 0);
  const minToStool = minOver(t2, (p) => Math.hypot(p.x - 4.15, p.z + 0.89));
  check('E9 stool position is walkable without models', minToStool < 0.2, `closest approach to stool centre ${minToStool.toFixed(2)} m`);
  await context.close();
}

async function e10(page) {
  await teleport(page, 0, 8);
  await page.evaluate((yaw) => window.__ebLook(yaw, 0.18), headingYaw(0, -1));
  await page.keyboard.down('KeyW');
  const stats = await page.evaluate(
    (n) =>
      new Promise((res) => {
        let i = 0;
        let sum = 0;
        let max = 0;
        const f = () => {
          const ms = window.__eb.collision.stepMs;
          sum += ms;
          max = Math.max(max, ms);
          if (++i >= n) res({ avg: sum / n, max });
          else requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }),
    E10_FRAMES
  );
  await page.keyboard.up('KeyW');
  check('E10 mean collision step < 0.5 ms', stats.avg < 0.5, `avg=${stats.avg.toFixed(4)} ms max=${stats.max.toFixed(3)} ms over ${E10_FRAMES} frames`);
}

async function corner(page) {
  await teleport(page, 14, 14);
  await page.evaluate((yaw) => window.__ebLook(yaw, 0.35), Math.PI / 4);
  await shot(page, 'after-corner-pillar');
}

// ---------- main ----------
const browser = await launch();
try {
  const { page, context } = await openHall(browser, 'debug=1');
  const ready = await waitForProps(page);
  check('setup: chair GLBs loaded and registered colliders', ready);
  const list = await colliders(page);
  console.log(`colliders: ${list.length} ->`, list.map((c) => c.id).join(', '));

  if (want('E1')) await e1(page);
  if (want('E2') && ready) await e2(page, list);
  if (want('E3')) await e3(page, list);
  if (want('E4')) await e4(page);
  if (want('E5')) await e5(page);
  if (want('E6')) await e6(page);
  if (want('E10')) await e10(page);
  if (want('SHOTS')) await corner(page);
  await context.close();

  if (want('E9')) await e9(browser);
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (failures.length) {
  console.log('FAILURES:\n' + failures.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
