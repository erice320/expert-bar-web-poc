// Camera containment acceptance (docs/QA-CLEANUP-PLAN.md §5.12 E7 + S3 criteria) against a running build.
//   npm run build && npm run preview &   (http://127.0.0.1:4173/)
//   node scripts-qa-camera.mjs
// Env: EB_URL (default http://127.0.0.1:4173/), EB_SHOTS=0 to skip screenshots,
//      EB_ONLY=E7,V11,PUMP,V2 to run a subset,
//      EB_FULL=1 for the full E7 sweep (16 yaws x 3 pitches, luma on every pose; slow in SwiftShader),
//      EB_CHROME_CHANNEL (default "chrome"; "" = bundled chromium).
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = (process.env.EB_URL || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const SHOTS = process.env.EB_SHOTS !== '0';
const SHOT_DIR = 'shots/s3';
const HALL = { halfX: 17.5, zNorth: -16.9, zSouth: 17.5, height: 9 };
const PLAYER_EDGE = 0.3;
const INSET = 0.25;
const MIN_DIST = 1.0;
const LUMA_STDDEV_MIN = 4;
const PUMP_MAX = 0.02;
const PITCHES = [-0.35, 0.18, 0.55];
const FULL = process.env.EB_FULL === '1';
const YAW_STEPS = FULL ? 16 : 8;
const SETTLE_FRAMES = 14;

const ONLY = process.env.EB_ONLY ? new Set(process.env.EB_ONLY.split(',')) : null;
const want = (id) => !ONLY || ONLY.has(id);

const failures = [];
let total = 0;
function check(name, ok, detail = '') {
  total++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures.push(`${name} ${detail}`);
}

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
  await page.waitForFunction(() => window.__eb && window.__ebTeleport && window.__ebLook, null, { timeout: 15000 });
  await page.evaluate(() => document.activeElement?.blur?.());
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

const state = (page) =>
  page.evaluate(() => ({ p: window.__eb.player, c: window.__eb.camera, d: window.__eb.camDist }));

/** Luma stddev and mean of the current screenshot, decoded in-page. */
async function lumaStats(page) {
  const buf = await page.screenshot({ type: 'png' });
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
    let s = 0;
    let s2 = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      s += y;
      s2 += y * y;
    }
    const mean = s / n;
    return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
  }, buf.toString('base64'));
}

async function pose(page, x, z, yaw, pitch, settleFrames = 90) {
  await page.evaluate(([px, pz]) => window.__ebTeleport(px, pz), [x, z]);
  await page.evaluate(([y, p]) => window.__ebLook(y, p), [yaw, pitch]);
  await frames(page, settleFrames);
  return state(page);
}

const inside = (c) =>
  Math.abs(c[0]) <= HALL.halfX - INSET + 1e-3 &&
  c[2] >= HALL.zNorth + INSET - 1e-3 &&
  c[2] <= HALL.zSouth - INSET + 1e-3 &&
  c[1] > 0 &&
  c[1] < HALL.height;

async function e7(page) {
  const e = PLAYER_EDGE;
  const spots = [
    ['east', HALL.halfX - e, 0],
    ['west', -HALL.halfX + e, 0],
    ['south', 0, HALL.zSouth - e],
    ['north', 0, HALL.zNorth + e],
    ['SE', HALL.halfX - e, HALL.zSouth - e],
    ['SW', -HALL.halfX + e, HALL.zSouth - e],
    ['NE', HALL.halfX - e, HALL.zNorth + e],
    ['NW', -HALL.halfX + e, HALL.zNorth + e],
  ];
  let poses = 0;
  let badPos = 0;
  let badDist = 0;
  let flat = 0;
  let minStd = Infinity;
  let minDist = Infinity;
  for (const [name, x, z] of spots) {
    for (let i = 0; i < YAW_STEPS; i++) {
      const yaw = (i / YAW_STEPS) * Math.PI * 2;
      for (const pitch of PITCHES) {
        const s = await pose(page, x, z, yaw, pitch, SETTLE_FRAMES);
        const luma = FULL || pitch === 0.18 ? await lumaStats(page) : null;
        poses++;
        if (luma) minStd = Math.min(minStd, luma.std);
        const d = Math.hypot(s.c[0] - s.p[0], s.c[1] - (s.p[1] + 1.5), s.c[2] - s.p[2]);
        minDist = Math.min(minDist, d);
        if (!inside(s.c)) {
          badPos++;
          console.log(`  outside: ${name} yaw=${yaw.toFixed(2)} pitch=${pitch} cam=${s.c.map((v) => v.toFixed(2))}`);
        }
        if (d < MIN_DIST - 1e-3) badDist++;
        if (luma && luma.std < LUMA_STDDEV_MIN) {
          flat++;
          console.log(`  flat frame: ${name} yaw=${yaw.toFixed(2)} pitch=${pitch} std=${luma.std.toFixed(2)}`);
        }
      }
    }
  }
  check('E7 camera inside hall AABB inset 0.25 m (walls are CAMERA colliders)', badPos === 0, `${poses} poses, ${badPos} outside`);
  check('E7 camera distance >= 1.0 m from look target', badDist === 0, `min=${minDist.toFixed(3)} m`);
  check('E7 frame never a flat single colour', flat === 0, `min luma stddev=${minStd.toFixed(1)} (threshold ${LUMA_STDDEV_MIN})`);
}

async function v11(page) {
  // Wall-edge views that used to show the grey outside of the hall: camera looking out over the wall.
  const views = [
    ['east-wall', HALL.halfX - PLAYER_EDGE, 2, Math.PI / 2],
    ['south-wall', 0, HALL.zSouth - PLAYER_EDGE, 0],
    ['west-wall', -HALL.halfX + PLAYER_EDGE, 2, -Math.PI / 2],
    ['north-wall', 0, HALL.zNorth + PLAYER_EDGE, Math.PI],
    ['SE-corner', HALL.halfX - PLAYER_EDGE, HALL.zSouth - PLAYER_EDGE, Math.PI / 4],
  ];
  for (const [name, x, z, yaw] of views) {
    const s = await pose(page, x, z, yaw, 0.18, SETTLE_FRAMES);
    const luma = await lumaStats(page);
    check(`V11 ${name}: hall visible, not grey`, inside(s.c) && luma.std >= LUMA_STDDEV_MIN, `cam=${s.c.map((v) => v.toFixed(2))} std=${luma.std.toFixed(1)}`);
    if (SHOTS) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${SHOT_DIR}/V11-${name}.png` });
    }
  }
}

async function pumping(page) {
  const spots = [
    ['south wall', 0, HALL.zSouth - PLAYER_EDGE, 0],
    ['east wall', HALL.halfX - PLAYER_EDGE, 0, Math.PI / 2],
    ['SE corner', HALL.halfX - PLAYER_EDGE, HALL.zSouth - PLAYER_EDGE, Math.PI / 4],
    ['open floor', 0, 10, 0],
  ];
  for (const [name, x, z, yaw] of spots) {
    await pose(page, x, z, yaw, 0.18, SETTLE_FRAMES * 3);
    let maxStep = 0;
    let prev = (await state(page)).c;
    for (let i = 0; i < 30; i++) {
      await frames(page, 1);
      const c = (await state(page)).c;
      maxStep = Math.max(maxStep, Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]));
      prev = c;
    }
    check(`no pumping standing still (${name})`, maxStep < PUMP_MAX, `max frame delta=${maxStep.toFixed(4)} m`);
  }
}

async function spawnFraming(browser) {
  const settle = async (query) => {
    const { page, context } = await openHall(browser, query);
    await frames(page, SETTLE_FRAMES);
    const s = await state(page);
    let buf = null;
    if (SHOTS) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      buf = await page.screenshot({ path: `${SHOT_DIR}/V2-${query.replace(/\W+/g, '_')}.png` });
    }
    await context.close();
    return { s, buf };
  };
  const rig = await settle('debug=1');
  const legacy = await settle('debug=1&collision=0');
  const dc = Math.hypot(rig.s.c[0] - legacy.s.c[0], rig.s.c[1] - legacy.s.c[1], rig.s.c[2] - legacy.s.c[2]);
  check('default spawn framing unchanged (camera position vs ?collision=0 legacy path)', dc < 1e-3, `delta=${dc.toExponential(2)} m`);
}

const browser = await launch();
try {
  const { page, context } = await openHall(browser, 'debug=1');
  if (want('E7')) await e7(page);
  if (want('V11')) await v11(page);
  if (want('PUMP')) await pumping(page);
  await context.close();
  if (want('V2')) await spawnFraming(browser);
} finally {
  await browser.close();
}

console.log(`\n${total - failures.length}/${total} checks passed`);
if (failures.length) {
  console.log('FAILURES:\n' + failures.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
