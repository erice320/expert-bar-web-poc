// v0.3 GLB loader checks against a running preview (EB_URL, default http://127.0.0.1:4173/).
// Reports __eb.models per scenario, /models/ requests, console errors. Screenshots -> EB_SHOTS (default ./shots).
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.EB_URL || 'http://127.0.0.1:4173/';
const SHOTS = process.env.EB_SHOTS || './shots';
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function scenario(name, query, { avatar = 0, shot } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const modelReqs = [];
  const errors = [];
  page.on('request', (r) => { if (r.url().includes('/models/')) modelReqs.push(new URL(r.url()).pathname.split('/models/')[1]); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(BASE + query, { waitUntil: 'networkidle' });
  await page.fill('#display-name', 'QA');
  await page.fill('#demo-code', 'DEMO');
  await page.click(`.avatar-opt >> nth=${avatar}`);
  await page.click('#enter-btn');
  await page.waitForSelector('#hud:not(.hidden)');
  await page.waitForTimeout(6000);
  const eb = await page.evaluate(() => ({ ...window.__eb, stations: undefined }));
  const badge = await page.textContent('#host-badge');
  const fine = await page.textContent('.fineprint');
  console.log(`\n== ${name} (${query || 'no query'}) ==`);
  console.log(' version:', eb.version, '| badge:', badge, '| fineprint tail:', fine.slice(-12));
  console.log(' models:', JSON.stringify(eb.models), '| tris', eb.tris, 'calls', eb.calls);
  console.log(' /models requests:', modelReqs.length, [...new Set(modelReqs)].join(', '));
  console.log(' errors:', errors.length ? errors : 'none');
  if (shot) await page.screenshot({ path: `${SHOTS}/${shot}.png` });
  await ctx.close();
  return { eb, modelReqs, errors };
}

await scenario('default', '', { shot: 'v03-default' });
await scenario('models off', '?models=0');
await scenario('AV-B forced fail', '?modelFail=AV-B', { shot: 'v03-modelfail-avb' });
await scenario('chair forced fail', '?modelFail=PROP-CHAIR');
await browser.close();
