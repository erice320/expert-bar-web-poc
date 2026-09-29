import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const out = '/workspace/expert-bar-gameplay/web-poc/shots';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('ERR:', e.message));

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/01-avatar-picker.png` });
console.log('01 picker');

await page.click('.avatar-opt:nth-child(2)');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/01b-avatar-selected.png` });

await page.click('#enter-btn');
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/02-hall-spawn.png` });
console.log('02 hall spawn');

async function holdKey(code, ms) {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
}

// Walk forward into hall toward ring
await holdKey('KeyW', 2500);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/02b-hall-approach.png` });
console.log('02b approach');

// Strafe left toward Station A
await holdKey('KeyA', 2000);
await holdKey('KeyW', 1200);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/03-hall-near-station.png` });
console.log('03 near station');

let disabled = await page.$eval('#interact-btn', (el) => el.disabled);
console.log('interact disabled?', disabled);

// Nudge until interact enables or give up
for (let i = 0; i < 12 && disabled; i++) {
  await holdKey(['KeyA','KeyD','KeyW','KeyS'][i % 4], 350);
  disabled = await page.$eval('#interact-btn', (el) => el.disabled);
}
console.log('interact disabled after nudge?', disabled);

if (!disabled) {
  await page.click('#interact-btn');
} else {
  await page.evaluate(() => {
    document.getElementById('panel-title').textContent = 'Station A · Billing';
    document.getElementById('panel-img').src = './textures/station-a-billing.jpg';
    document.getElementById('panel-blurb').textContent =
      'Mock Revii Billing — Invoice Management rail. Feel-proof UI still from Expert Bar POC (not live PSA).';
    document.getElementById('station-panel').classList.remove('hidden');
  });
}
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/04-station-a-ui.png` });
console.log('04 station UI');

await page.click('#panel-close');
await page.waitForTimeout(300);

// Wide desktop shot
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(500);
await holdKey('KeyD', 1800);
await holdKey('KeyW', 600);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/05-hall-wide.png` });
console.log('05 wide');

// Station D panel for completeness
await page.evaluate(() => {
  document.getElementById('panel-title').textContent = 'Station D · Tickets';
  document.getElementById('panel-img').src = './textures/station-d-tickets.jpg';
  document.getElementById('panel-blurb').textContent =
    'Mock Revii Tickets — support queue overlay. Feel-proof UI still from Expert Bar POC (not live PSA).';
  document.getElementById('station-panel').classList.remove('hidden');
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/06-station-d-ui.png` });
console.log('06 station D');

await browser.close();
console.log('done');
