import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const out = '/workspace/expert-bar-gameplay/web-poc/shots';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('ERR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE:', m.text());
});

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/00-login.png` });
console.log('00 login');

await page.fill('#display-name', 'Evan');
await page.fill('#demo-code', 'DEMO');
await page.click('.avatar-opt:nth-child(1)'); // AV-A
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/01b-avatar-selected.png` });
await page.click('#enter-btn');
// Wait for textures
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/02-hall-spawn.png` });
console.log('02 hall spawn (photoreal)');

async function holdKey(code, ms) {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
}

await holdKey('KeyW', 2800);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/02b-hall-approach.png` });
console.log('02b approach');

// Look around with right pad simulation via keys
await page.keyboard.down('Period');
await page.waitForTimeout(700);
await page.keyboard.up('Period');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/05-hall-wide.png` });
console.log('05 look');

// Station A
await holdKey('KeyA', 2200);
await holdKey('KeyW', 1000);
await page.waitForTimeout(500);
let disabled = await page.$eval('#interact-btn', (el) => el.disabled);
for (let i = 0; i < 10 && disabled; i++) {
  await holdKey(['KeyA', 'KeyD', 'KeyW', 'KeyS'][i % 4], 300);
  disabled = await page.$eval('#interact-btn', (el) => el.disabled);
}
console.log('interact disabled?', disabled);
if (!disabled) {
  await page.click('#interact-btn');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/04-station-a-ui.png` });
  // Close panel
  await page.click('#panel-close');
  await page.waitForTimeout(400);
  const closed = await page.$eval('#station-panel', (el) => el.classList.contains('hidden') || el.style.display === 'none');
  console.log('panel closed?', closed);
} else {
  console.log('station not reached — teleport');
  await page.evaluate(() => window.__ebTeleport && window.__ebTeleport(-6.5, 5));
  await page.waitForTimeout(400);
  disabled = await page.$eval('#interact-btn', (el) => el.disabled);
  console.log('after teleport disabled?', disabled);
}

// Wide desktop fidelity shot
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(500);
await page.evaluate(() => {
  if (window.__ebTeleport) window.__ebTeleport(0, 8);
});
await page.waitForTimeout(800);
await holdKey('KeyW', 1500);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/07-photoreal-hall.png` });
console.log('07 photoreal hall wide');

// Avatar close-up
await page.evaluate(() => {
  if (window.__ebTeleport) window.__ebTeleport(2, 2);
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/08-photoreal-avatar.png` });
console.log('08 avatar');

const eb = await page.evaluate(() => window.__eb);
console.log('debug', JSON.stringify(eb));

await browser.close();
console.log('done');
