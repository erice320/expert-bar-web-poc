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

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#display-name', { timeout: 15000 });

await page.fill('#display-name', 'SmokeTest');
await page.fill('#demo-code', 'DEMO');
// pick first avatar
await page.click('.avatar-opt');
await page.click('#enter-btn');
await page.waitForSelector('#hud:not(.hidden)', { timeout: 10000 });
await page.waitForTimeout(800);

// Baseline state
const baseline = await page.evaluate(() => {
  const eb = window.__eb;
  return {
    player: eb?.player?.slice(),
    camYaw: eb?.camYaw,
    camPitch: eb?.camPitch,
  };
});
note('baseline ' + JSON.stringify(baseline));

// --- Left stick straight up (forward): simulate pointer on joystick-zone ---
const joy = await page.$('#joystick-zone');
const jbox = await joy.boundingBox();
const jcx = jbox.x + jbox.width / 2;
const jcy = jbox.y + jbox.height / 2;
// drag up 40px
await page.touchscreen.tap(jcx, jcy); // ensure focus
await page.evaluate(({ x, y }) => {
  const zone = document.getElementById('joystick-zone');
  const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y });
  zone.dispatchEvent(down);
  const move = new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y - 45 });
  zone.dispatchEvent(move);
}, { x: jcx, y: jcy });

await page.waitForTimeout(900);
const afterWalk = await page.evaluate(() => {
  const eb = window.__eb;
  return { player: eb?.player?.slice(), camYaw: eb?.camYaw, camPitch: eb?.camPitch, joy: eb?.joy };
});
note('after forward stick ' + JSON.stringify(afterWalk));

// release stick
await page.evaluate(() => {
  const zone = document.getElementById('joystick-zone');
  zone.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch' }));
});
await page.waitForTimeout(200);

const yawDeltaWalk = Math.abs((afterWalk.camYaw ?? 0) - (baseline.camYaw ?? 0));
const movedZ = Math.abs((afterWalk.player?.[2] ?? 0) - (baseline.player?.[2] ?? 0));
const movedX = Math.abs((afterWalk.player?.[0] ?? 0) - (baseline.player?.[0] ?? 0));
const walkOk = movedZ > 0.3 && yawDeltaWalk < 0.05;
note(`WALK_TEST movedXZ=(${movedX.toFixed(3)},${movedZ.toFixed(3)}) yawDelta=${yawDeltaWalk.toFixed(4)} ok=${walkOk}`);

// --- Right look drag ---
const beforeLook = await page.evaluate(() => ({
  player: window.__eb?.player?.slice(),
  camYaw: window.__eb?.camYaw,
  camPitch: window.__eb?.camPitch,
}));
const look = await page.$('#look-zone');
const lbox = await look.boundingBox();
const lx = lbox.x + lbox.width * 0.6;
const ly = lbox.y + lbox.height * 0.45;
await page.evaluate(({ x, y }) => {
  const zone = document.getElementById('look-zone');
  zone.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 2, pointerType: 'touch', clientX: x, clientY: y }));
  zone.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 2, pointerType: 'touch', clientX: x - 80, clientY: y + 20 }));
}, { x: lx, y: ly });
await page.waitForTimeout(100);
await page.evaluate(() => {
  document.getElementById('look-zone').dispatchEvent(
    new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 2, pointerType: 'touch' })
  );
});
await page.waitForTimeout(400);
const afterLook = await page.evaluate(() => ({
  player: window.__eb?.player?.slice(),
  camYaw: window.__eb?.camYaw,
  camPitch: window.__eb?.camPitch,
}));
note('after look ' + JSON.stringify({ beforeLook, afterLook }));
const lookYawDelta = Math.abs((afterLook.camYaw ?? 0) - (beforeLook.camYaw ?? 0));
const lookPlayerDelta = Math.hypot(
  (afterLook.player?.[0] ?? 0) - (beforeLook.player?.[0] ?? 0),
  (afterLook.player?.[2] ?? 0) - (beforeLook.player?.[2] ?? 0)
);
const lookOk = lookYawDelta > 0.15 && lookPlayerDelta < 0.05;
note(`LOOK_TEST yawDelta=${lookYawDelta.toFixed(4)} playerDelta=${lookPlayerDelta.toFixed(4)} ok=${lookOk}`);

// --- Strafe right via D-pad ---
const beforeStrafe = await page.evaluate(() => ({
  player: window.__eb?.player?.slice(),
  camYaw: window.__eb?.camYaw,
}));
await page.evaluate(() => {
  const btn = document.querySelector('#dpad [data-dir="right"]');
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'touch', clientX: 50, clientY: 50 }));
});
await page.waitForTimeout(700);
await page.evaluate(() => {
  const btn = document.querySelector('#dpad [data-dir="right"]');
  btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'touch' }));
});
await page.waitForTimeout(200);
const afterStrafe = await page.evaluate(() => ({
  player: window.__eb?.player?.slice(),
  camYaw: window.__eb?.camYaw,
}));
const strafeDx = (afterStrafe.player?.[0] ?? 0) - (beforeStrafe.player?.[0] ?? 0);
const strafeYaw = Math.abs((afterStrafe.camYaw ?? 0) - (beforeStrafe.camYaw ?? 0));
// After look yaw changed, strafe is along rightFlat of current camYaw — just require horizontal movement and stable yaw
const strafeOk = Math.abs(strafeDx) > 0.15 && strafeYaw < 0.05;
note(`STRAFE_TEST dx=${strafeDx.toFixed(3)} yawDelta=${strafeYaw.toFixed(4)} ok=${strafeOk}`);

const shotPath = path.join(outDir, '01-dual-stick-hud.png');
await page.screenshot({ path: shotPath, fullPage: false });
note('screenshot ' + shotPath);

const allOk = walkOk && lookOk && strafeOk;
note(allOk ? 'SMOKE_PASS' : 'SMOKE_FAIL');
fs.writeFileSync(path.join(outDir, 'smoke-log.txt'), log.join('\n'));

await browser.close();
process.exit(allOk ? 0 : 1);
