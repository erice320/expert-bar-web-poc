/** Canvas-generated Summit brand textures — cyan/navy/white, NO corporate green */
export function makeBannerTexture({ title = 'EXPERT BAR', subtitle = '', w = 1024, h = 256 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#076D8E');
  sky.addColorStop(0.45, '#1B8BB3');
  sky.addColorStop(0.75, '#36ADDE');
  sky.addColorStop(1, '#76D9D7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  drawPeak(ctx, w * 0.5, h * 0.95, w * 0.55, h * 0.55, '#012A83', '#62C0B6');
  drawPeak(ctx, w * 0.22, h * 0.98, w * 0.35, h * 0.7, '#001455', '#294B72');
  drawPeak(ctx, w * 0.78, h * 0.98, w * 0.38, h * 0.68, '#01153A', '#1D3756');

  ctx.fillStyle = 'rgba(79,209,197,0.35)';
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.arc(w * 0.7 + Math.random() * 200, 20 + Math.random() * 60, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#F5F9FF';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.floor(h * 0.28)}px system-ui,sans-serif`;
  ctx.fillText(title, w / 2, h * 0.38);
  if (subtitle) {
    ctx.font = `bold ${Math.floor(h * 0.16)}px system-ui,sans-serif`;
    ctx.fillStyle = '#C7EEF8';
    ctx.fillText(subtitle, w / 2, h * 0.58);
  }
  return c;
}

/**
 * Fascia band for the Expert Bar. One tile holds the full legend and is seamless at both edges,
 * so it can be tiled with an integer `repeat` around an open cylinder. Margins above/below the
 * panel are fully transparent (alpha), the panel itself is opaque so the band can use alphaTest
 * instead of blended transparency (no sort flicker while orbiting).
 */
export function makeFasciaTexture({ w = 2560, h = 256, text = 'EXPERT BAR \u00B7 revio SUMMIT' } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const margin = Math.round(h * 0.08);
  const panelTop = margin;
  const panelH = h - margin * 2;

  const g = ctx.createLinearGradient(0, panelTop, 0, panelTop + panelH);
  g.addColorStop(0, '#0B2A4A');
  g.addColorStop(1, '#15283F');
  ctx.fillStyle = g;
  ctx.fillRect(0, panelTop, w, panelH);

  ctx.fillStyle = '#34BDE5';
  const rule = Math.round(h * 0.035);
  ctx.fillRect(0, panelTop, w, rule);
  ctx.fillRect(0, panelTop + panelH - rule, w, rule);

  let size = Math.floor(panelH * 0.52);
  const font = (px) => `700 ${px}px system-ui,"Segoe UI",Arial,sans-serif`;
  ctx.font = font(size);
  const maxW = w * 0.86;
  const measured = ctx.measureText(text).width;
  if (measured > maxW) {
    size = Math.floor(size * (maxW / measured));
    ctx.font = font(size);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#F5F9FF';
  ctx.fillText(text, w / 2, panelTop + panelH / 2 + size * 0.04);
  return c;
}

function drawPeak(ctx, cx, baseY, width, height, shadow, lit) {
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, baseY);
  ctx.lineTo(cx, baseY - height);
  ctx.lineTo(cx + width / 2, baseY);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx - width / 2, 0, cx + width / 2, 0);
  g.addColorStop(0, shadow);
  g.addColorStop(0.55, lit);
  g.addColorStop(1, shadow);
  ctx.fillStyle = g;
  ctx.fill();
}

export function makeHangingBannerTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 768;
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 768);
  sky.addColorStop(0, '#0A141F');
  sky.addColorStop(0.35, '#076D8E');
  sky.addColorStop(0.7, '#1B8BB3');
  sky.addColorStop(1, '#36ADDE');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 768);

  drawPeak(ctx, 256, 780, 420, 380, '#012A83', '#62C0B6');
  drawPeak(ctx, 100, 800, 220, 260, '#001455', '#294B72');
  drawPeak(ctx, 400, 800, 240, 280, '#01153A', '#1D3756');

  ctx.fillStyle = '#F5F9FF';
  ctx.textAlign = 'center';
  ctx.font = 'bold 36px system-ui,sans-serif';
  ctx.fillText('rev.io', 256, 80);
  ctx.font = 'bold 72px system-ui,sans-serif';
  ctx.fillText('SUMMIT', 256, 170);
  ctx.font = 'bold 48px system-ui,sans-serif';
  ctx.fillStyle = '#34BDE5';
  ctx.fillText('2026', 256, 235);
  ctx.fillStyle = '#F5F9FF';
  ctx.font = 'bold 28px system-ui,sans-serif';
  ctx.fillText('EXPERT BAR', 256, 290);
  return c;
}

export function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c8c2b4';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 64, 0);
    ctx.lineTo(i * 64, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * 64);
    ctx.lineTo(512, i * 64);
    ctx.stroke();
  }
  return c;
}

export function makeStationSign(label, sub) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#15283F';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#34BDE5';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 240);
  ctx.fillStyle = '#34BDE5';
  ctx.font = 'bold 28px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 256, 90);
  ctx.fillStyle = '#F5F9FF';
  ctx.font = 'bold 48px system-ui,sans-serif';
  ctx.fillText(sub, 256, 160);
  ctx.fillStyle = '#8EA3B9';
  ctx.font = '20px system-ui,sans-serif';
  ctx.fillText('powered by Revii', 256, 210);
  return c;
}
