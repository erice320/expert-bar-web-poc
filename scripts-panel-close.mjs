import { chromium, devices } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE = process.env.EB_URL || 'http://127.0.0.1:4173/';
const outDir = '/workspace/expert-bar-gameplay/web-poc/shots';
fs.mkdirSync(outDir, { recursive: true });

const iPhone = devices['iPhone 13'];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...iPhone,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
const log = [];
const note = (m) => { console.log(m); log.push(m); };

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('#display-name', { timeout: 20000 });
await page.fill('#display-name', 'CloseSmoke');
await page.fill('#demo-code', 'DEMO');
await page.click('.avatar-opt');
await page.click('#enter-btn');
await page.waitForSelector('#hud:not(.hidden)', { timeout: 15000 });
await page.waitForTimeout(600);

await page.evaluate(() => { if (window.__ebTeleport) window.__ebTeleport(-6.5, 5); });
await page.waitForTimeout(500);

const near = await page.evaluate(() => window.__eb?.near);
note('near station: ' + near);

// Open via Interact (page.click reliable; also proves interact still opens)
await page.click('#interact-btn');
await page.waitForTimeout(500);

const panelOpen1 = await page.evaluate(() => {
  const p = document.getElementById('station-panel');
  const close = document.getElementById('panel-close');
  const look = document.getElementById('look-zone');
  const ps = getComputedStyle(p);
  return {
    hasHidden: p.classList.contains('hidden'),
    display: ps.display,
    pointerEvents: ps.pointerEvents,
    zIndex: ps.zIndex,
    closeZ: getComputedStyle(close).zIndex,
    lookZ: getComputedStyle(look).zIndex,
    title: document.getElementById('panel-title')?.textContent,
  };
});
note('panel after open: ' + JSON.stringify(panelOpen1));

const beforePath = path.join(outDir, 'panel-before-close.png');
await page.screenshot({ path: beforePath, fullPage: false });
note('screenshot before: ' + beforePath);

if (panelOpen1.hasHidden || panelOpen1.display === 'none') {
  note('FAIL: panel did not open');
  fs.writeFileSync(path.join(outDir, 'panel-close-log.txt'), log.join('\n'));
  await browser.close();
  process.exit(1);
}

const zOk = parseInt(panelOpen1.zIndex, 10) > parseInt(panelOpen1.lookZ, 10);
note(`Z_STACK panel=${panelOpen1.zIndex} look=${panelOpen1.lookZ} ok=${zOk}`);

const closeBtn = await page.$('#panel-close');
const cbox = await closeBtn.boundingBox();
note('close box: ' + JSON.stringify(cbox));
if (!cbox) {
  note('FAIL: close button has no bounding box');
  fs.writeFileSync(path.join(outDir, 'panel-close-log.txt'), log.join('\n'));
  await browser.close();
  process.exit(1);
}

const hit = await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  return { tag: el?.tagName, id: el?.id, className: el?.className };
}, { x: cbox.x + cbox.width / 2, y: cbox.y + cbox.height / 2 });
note('elementFromPoint at close: ' + JSON.stringify(hit));
const hitOk = hit.id === 'panel-close';
note(`HIT_TEST ok=${hitOk}`);

// iPhone touch tap on Close
await page.touchscreen.tap(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
await page.waitForTimeout(500);

const panelAfter = await page.evaluate(() => {
  const p = document.getElementById('station-panel');
  const ps = getComputedStyle(p);
  return {
    hasHidden: p.classList.contains('hidden'),
    display: ps.display,
    pointerEvents: ps.pointerEvents,
    visibility: ps.visibility,
    zIndex: ps.zIndex,
  };
});
note('panel after close: ' + JSON.stringify(panelAfter));

const afterPath = path.join(outDir, 'panel-after-close.png');
await page.screenshot({ path: afterPath, fullPage: false });
note('screenshot after: ' + afterPath);

const closedOk =
  panelAfter.hasHidden &&
  panelAfter.display === 'none' &&
  panelAfter.pointerEvents === 'none';

const beforeMove = await page.evaluate(() => window.__eb?.player?.slice());
const joy = await page.$('#joystick-zone');
const jbox = await joy.boundingBox();
const jcx = jbox.x + jbox.width / 2;
const jcy = jbox.y + jbox.height / 2;
await page.evaluate(({ x, y }) => {
  const zone = document.getElementById('joystick-zone');
  zone.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch', clientX: x, clientY: y,
  }));
  zone.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch', clientX: x, clientY: y - 45,
  }));
}, { x: jcx, y: jcy });
await page.waitForTimeout(800);
await page.evaluate(() => {
  document.getElementById('joystick-zone').dispatchEvent(
    new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch' })
  );
});
await page.waitForTimeout(200);
const afterMove = await page.evaluate(() => window.__eb?.player?.slice());
const moved = Math.hypot(
  (afterMove?.[0] ?? 0) - (beforeMove?.[0] ?? 0),
  (afterMove?.[2] ?? 0) - (beforeMove?.[2] ?? 0)
);
const moveOk = moved > 0.25;
note(`MOVE_RESUME moved=${moved.toFixed(3)} ok=${moveOk}`);

await page.evaluate(() => { if (window.__ebTeleport) window.__ebTeleport(-6.5, 5); });
await page.waitForTimeout(400);
await page.click('#interact-btn');
await page.waitForTimeout(400);
const reopen = await page.evaluate(() => !document.getElementById('station-panel').classList.contains('hidden'));
note(`REOPEN ok=${reopen}`);

// Escape close (desktop path still available)
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const escClosed = await page.evaluate(() => document.getElementById('station-panel').classList.contains('hidden'));
note(`ESC_CLOSE ok=${escClosed}`);

const allOk = closedOk && zOk && hitOk && moveOk && reopen && escClosed && !panelOpen1.hasHidden;
note(allOk ? 'PANEL_CLOSE_SMOKE_PASS' : 'PANEL_CLOSE_SMOKE_FAIL');
fs.writeFileSync(path.join(outDir, 'panel-close-log.txt'), log.join('\n'));
await browser.close();
process.exit(allOk ? 0 : 1);
