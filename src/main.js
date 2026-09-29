import * as THREE from 'three';
import { AVATARS, createAvatarMesh, animateWalk } from './avatars.js';
import { Joystick, Keyboard, DPad, LookPad } from './joystick.js';
import { buildWorld } from './world.js';

const canvas = document.getElementById('c');
const picker = document.getElementById('picker');
const avatarGrid = document.getElementById('avatar-grid');
const enterBtn = document.getElementById('enter-btn');
const displayNameInput = document.getElementById('display-name');
const demoCodeInput = document.getElementById('demo-code');
const loginError = document.getElementById('login-error');
const hud = document.getElementById('hud');
const interactBtn = document.getElementById('interact-btn');
const stationLabel = document.getElementById('station-label');
const stationPanel = document.getElementById('station-panel');
const panelTitle = document.getElementById('panel-title');
const panelImg = document.getElementById('panel-img');
const panelBlurb = document.getElementById('panel-blurb');
const panelClose = document.getElementById('panel-close');

const LS_NAME = 'eb_display_name';
const LS_AVATAR = 'eb_avatar';
const LS_DEMO = 'eb_demo_code';

let selectedId = null;
let player = null;
let playerPreset = null;
let playerDisplayName = '';
let stations = [];
let npcs = [];
let bounds = 15;
let nearStation = null;
let playing = false;

function showLoginError(msg) {
  if (!msg) {
    loginError.classList.add('hidden');
    loginError.textContent = '';
    return;
  }
  loginError.textContent = msg;
  loginError.classList.remove('hidden');
}

function refreshEnterEnabled() {
  const nameOk = displayNameInput.value.trim().length > 0;
  const codeOk = demoCodeInput.value.trim().length > 0;
  const avatarOk = !!selectedId;
  enterBtn.disabled = !(nameOk && codeOk && avatarOk);
}

// --- Login UI ---
for (const a of AVATARS) {
  const btn = document.createElement('button');
  btn.className = 'avatar-opt';
  btn.type = 'button';
  btn.dataset.avatarId = a.id;
  const thumb = a.thumb
    ? `<div class="avatar-swatch photo"><img src="${a.thumb}" alt="${a.id}" /></div>`
    : `<div class="avatar-swatch" style="background:linear-gradient(180deg,#15283F,#0A141F)">
      <div class="hair" style="background:#${a.hair.toString(16).padStart(6,'0')};${a.hairStyle==='shaved'?'opacity:0.4;height:8px':''}"></div>
      <div class="head" style="background:#${a.skin.toString(16).padStart(6,'0')}"></div>
      <div class="body" style="background:#${a.blazer.toString(16).padStart(6,'0')}"></div>
    </div>`;
  btn.innerHTML = `
    ${thumb}
    <div class="name">${a.id} · ${a.name}</div>
    <div class="desc">${a.desc}</div>
  `;
  btn.addEventListener('click', () => {
    selectedId = a.id;
    document.querySelectorAll('.avatar-opt').forEach((el) => el.classList.remove('selected'));
    btn.classList.add('selected');
    showLoginError('');
    refreshEnterEnabled();
  });
  avatarGrid.appendChild(btn);
}

try {
  const savedName = localStorage.getItem(LS_NAME);
  if (savedName) displayNameInput.value = savedName;
  const savedCode = localStorage.getItem(LS_DEMO);
  if (savedCode) demoCodeInput.value = savedCode;
  else if (!demoCodeInput.value) demoCodeInput.value = 'DEMO';
  const savedAvatar = localStorage.getItem(LS_AVATAR);
  if (savedAvatar) {
    const el = [...avatarGrid.children].find((b) => b.dataset.avatarId === savedAvatar);
    if (el) el.click();
  }
} catch (_) {
  if (!demoCodeInput.value) demoCodeInput.value = 'DEMO';
}

displayNameInput.addEventListener('input', () => {
  showLoginError('');
  refreshEnterEnabled();
});
demoCodeInput.addEventListener('input', () => {
  showLoginError('');
  refreshEnterEnabled();
});

function tryEnter() {
  const name = displayNameInput.value.trim();
  const code = demoCodeInput.value.trim();
  if (!name) {
    showLoginError('Display name is required.');
    displayNameInput.focus();
    refreshEnterEnabled();
    return;
  }
  if (!code) {
    showLoginError('Enter a demo code (any non-empty value works for this POC).');
    demoCodeInput.focus();
    refreshEnterEnabled();
    return;
  }
  if (!selectedId) {
    showLoginError('Pick an avatar (AV-A–D).');
    refreshEnterEnabled();
    return;
  }
  playerPreset = AVATARS.find((a) => a.id === selectedId);
  playerDisplayName = name.slice(0, 24);
  try {
    localStorage.setItem(LS_NAME, playerDisplayName);
    localStorage.setItem(LS_AVATAR, selectedId);
    localStorage.setItem(LS_DEMO, code);
  } catch (_) {}
  showLoginError('');
  startGame();
}

enterBtn.addEventListener('click', tryEnter);
for (const el of [displayNameInput, demoCodeInput]) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryEnter();
    }
  });
}
refreshEnterEnabled();

function isPanelOpen() {
  return !stationPanel.classList.contains('hidden');
}

function closeStation() {
  stationPanel.classList.add('hidden');
  stationPanel.style.display = 'none';
  stationPanel.style.pointerEvents = 'none';
  stationPanel.style.visibility = 'hidden';
  stationPanel.setAttribute('aria-hidden', 'true');
  try { stationPanel.inert = true; } catch (_) {}
}

function bindCloseControl(el, handler) {
  if (!el) return;
  const fire = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handler(e);
  };
  // pointerup covers mouse + touch + pen; click as fallback for a11y / keyboard activation
  el.addEventListener('pointerup', fire, { passive: false });
  el.addEventListener('click', fire);
}

bindCloseControl(panelClose, closeStation);

// Tap dimmed overlay (outside panel-card) to close
stationPanel.addEventListener('pointerup', (e) => {
  if (!isPanelOpen()) return;
  if (e.target === stationPanel) {
    e.preventDefault();
    e.stopPropagation();
    closeStation();
  }
}, { passive: false });
stationPanel.addEventListener('click', (e) => {
  if (!isPanelOpen()) return;
  if (e.target === stationPanel) {
    e.preventDefault();
    closeStation();
  }
});

interactBtn.addEventListener('click', () => {
  if (nearStation) openStation(nearStation);
});
// Touch-friendly interact (pointerup) so iOS doesn't wait for 300ms click
interactBtn.addEventListener('pointerup', (e) => {
  if (interactBtn.disabled || !nearStation) return;
  if (e.pointerType === 'mouse') return; // click handles mouse
  e.preventDefault();
  e.stopPropagation();
  openStation(nearStation);
}, { passive: false });

// --- Three setup ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8c9d8);
scene.fog = new THREE.Fog(0xb8c9d8, 18, 38);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(0, 3, 8);

const textureLoader = new THREE.TextureLoader();

const joystick = new Joystick(
  document.getElementById('joystick-zone'),
  document.getElementById('joystick-base'),
  document.getElementById('joystick-knob')
);
const dpad = new DPad(document.getElementById('dpad'), (x, y) => {
  joystick.setExternal(x, y);
});
const lookPad = new LookPad(document.getElementById('look-zone'), { sensitivity: 0.005 });
const keyboard = new Keyboard();

const clock = new THREE.Clock();
const camLook = new THREE.Vector3();
const desiredCam = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const forwardFlat = new THREE.Vector3();
const rightFlat = new THREE.Vector3();
/** Independent orbit yaw/pitch — NOT coupled to player.rotation.y */
let camYaw = 0;      // rad; 0 = looking toward -Z
let camPitch = 0.18; // slight downward look
const CAM_DIST = 4.2;
const CAM_HEIGHT = 2.55;
const PITCH_MIN = -0.35;
const PITCH_MAX = 0.55;
const LOOK_KEY_SPEED = 1.8; // rad/s for Q/E / arrows

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function hideOverlay(el) {
  el.classList.add('hidden');
  el.style.display = 'none';
  el.style.pointerEvents = 'none';
  el.style.visibility = 'hidden';
  el.setAttribute('aria-hidden', 'true');
  // Remove from tab order / inert if supported
  try { el.inert = true; } catch (_) {}
}

function startGame() {
  hideOverlay(picker);
  hud.classList.remove('hidden');
  hud.style.display = '';
  hud.style.pointerEvents = '';
  hud.style.visibility = '';
  hud.removeAttribute('aria-hidden');

  const world = buildWorld(scene, textureLoader);
  stations = world.stations;
  bounds = world.bounds;

  player = createAvatarMesh(playerPreset, { label: true, displayName: playerDisplayName, textureLoader });
  player.position.set(0, 0, 10);
  player.rotation.y = 0; // face -Z toward Expert Bar ring
  scene.add(player);

  // Other "users" — distinct presets excluding player's
  const others = AVATARS.filter((a) => a.id !== playerPreset.id);
  // Ensure at least 3 NPCs — if only 3 others, use all; also duplicate path variants
  const npcSpecs = [
    { preset: others[0], path: circlePath(0, -2, 7.2, 0.32), speed: 0.32 },
    { preset: others[1], path: linePath(-8, 4, -3, 7), speed: 0.35 },
    { preset: others[2] || others[0], path: linePath(8, 4, 3, 7), speed: 0.3 },
  ];
  for (const spec of npcSpecs) {
    const mesh = createAvatarMesh(spec.preset, { label: true, textureLoader });
    mesh.position.copy(spec.path(0));
    scene.add(mesh);
    npcs.push({ mesh, path: spec.path, speed: spec.speed, t: Math.random() * 10, idle: Math.random() > 0.5 });
  }

  // Independent orbit camera behind player (face -Z → camYaw 0)
  camYaw = 0;
  camPitch = 0.18;
  desiredCam.set(
    player.position.x + Math.sin(camYaw) * CAM_DIST,
    player.position.y + CAM_HEIGHT + Math.sin(camPitch) * 1.2,
    player.position.z + Math.cos(camYaw) * CAM_DIST
  );
  camera.position.copy(desiredCam);
  camLook.set(player.position.x, player.position.y + 1.5, player.position.z);
  camera.lookAt(camLook);

  playing = true;

  window.__ebTeleport = (x, z) => {
    if (!player) return;
    player.position.set(x, 0, z);
  };
}

function circlePath(cx, cz, r, dir) {
  return (t) => {
    const a = t * dir;
    return new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
  };
}
function linePath(x0, z0, x1, z1) {
  return (t) => {
    const u = (Math.sin(t) + 1) / 2;
    return new THREE.Vector3(
      x0 + (x1 - x0) * u,
      0,
      z0 + (z1 - z0) * u
    );
  };
}

function openStation(st) {
  panelTitle.textContent = `${st.title} · ${st.product}`;
  panelImg.src = st.panelUrl;
  panelBlurb.textContent = st.blurb;
  stationPanel.classList.remove('hidden');
  stationPanel.style.display = '';
  stationPanel.style.pointerEvents = 'auto';
  stationPanel.style.visibility = 'visible';
  stationPanel.setAttribute('aria-hidden', 'false');
  try { stationPanel.inert = false; } catch (_) {}
}

function updatePlayer(dt, t) {
  // --- Look: right pad + desktop keys (Q/, left · ./ right). E stays interact. ---
  const look = lookPad.consume();
  camYaw += look.yaw;
  camPitch = THREE.MathUtils.clamp(camPitch + look.pitch, PITCH_MIN, PITCH_MAX);
  // Arrows stay for move (WASD/arrows). Desktop look: Q/, left · ./ right (or drag look-zone).
  if (keyboard.pressed('KeyQ', 'q', 'Comma', ',')) camYaw += LOOK_KEY_SPEED * dt;
  if (keyboard.pressed('Period', '.')) camYaw -= LOOK_KEY_SPEED * dt;

  const j = joystick.vector;
  const k = keyboard.vector;
  const jMag = Math.hypot(j.x, j.y);
  const kMag = Math.hypot(k.x, k.y);
  let ix = 0, iy = 0;
  if (jMag >= kMag && jMag > 0.05) { ix = j.x; iy = j.y; }
  else if (kMag > 0.05) { ix = k.x; iy = k.y; }

  // Movement relative to camYaw only (not live camera matrix / not player yaw)
  forwardFlat.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  rightFlat.set(Math.cos(camYaw), 0, -Math.sin(camYaw));

  const moving = Math.hypot(ix, iy) > 0.08;
  if (moving) {
    moveDir.set(0, 0, 0);
    moveDir.addScaledVector(rightFlat, ix);
    moveDir.addScaledVector(forwardFlat, -iy);
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      const speed = 3.6;
      player.position.addScaledVector(moveDir, speed * dt);
      player.position.x = THREE.MathUtils.clamp(player.position.x, -bounds, bounds);
      player.position.z = THREE.MathUtils.clamp(player.position.z, -bounds, bounds);
      // Face move direction (visual only — does NOT drive camera)
      const targetYaw = Math.atan2(moveDir.x, moveDir.z);
      player.rotation.y = approachAngle(player.rotation.y, targetYaw, 0.2);
    }
  }
  animateWalk(player, moving, t);

  // Independent OTS orbit: behind player by camYaw / camPitch (NOT player.rotation.y)
  const pitchLift = Math.sin(camPitch) * 1.2;
  const dist = CAM_DIST * Math.cos(camPitch);
  desiredCam.set(
    player.position.x + Math.sin(camYaw) * dist,
    player.position.y + CAM_HEIGHT + pitchLift,
    player.position.z + Math.cos(camYaw) * dist
  );
  camera.position.lerp(desiredCam, 1 - Math.pow(0.001, dt));
  camLook.set(player.position.x, player.position.y + 1.5, player.position.z);
  camera.lookAt(camLook);

  // Station proximity (live world positions)
  nearStation = null;
  let best = Infinity;
  const _wp = new THREE.Vector3();
  for (const st of stations) {
    if (st.group) st.group.getWorldPosition(_wp);
    else _wp.copy(st.position);
    _wp.y = 0;
    const d = player.position.distanceTo(_wp);
    if (d < st.radius && d < best) {
      best = d;
      nearStation = st;
    }
  }
  if (nearStation) {
    interactBtn.disabled = false;
    interactBtn.removeAttribute('disabled');
    stationLabel.classList.remove('hidden');
    stationLabel.textContent = `${nearStation.title} · ${nearStation.product} — Interact`;
  } else {
    interactBtn.disabled = true;
    interactBtn.setAttribute('disabled', '');
    stationLabel.classList.add('hidden');
  }

  // Debug hook for demos / tests
  window.__eb = {
    player: player.position.toArray(),
    camYaw,
    camPitch,
    joy: { ...joystick.vector, active: joystick.active },
    lookActive: lookPad.active,
    near: nearStation && nearStation.id,
    stations: stations.map((s) => {
      const v = new THREE.Vector3();
      s.group.getWorldPosition(v);
      return { id: s.id, pos: v.toArray(), d: player.position.distanceTo(v) };
    }),
  };
}

function approachAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function updateNpcs(dt, t) {
  for (const n of npcs) {
    n.t += dt * n.speed;
    const prev = n.mesh.position.clone();
    let moving = true;
    if (n.idle && Math.sin(n.t * 0.7) > 0.6) {
      moving = false;
    } else {
      const next = n.path(n.t);
      n.mesh.position.copy(next);
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      if (Math.hypot(dx, dz) > 0.001) {
        n.mesh.rotation.y = Math.atan2(dx, dz);
      }
    }
    animateWalk(n.mesh, moving, t + n.t);
  }
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (playing && !stationPanel.classList.contains('hidden') === false) {
    // always update when playing; freeze move if panel open
  }
  if (playing) {
    const panelOpen = isPanelOpen();
    if (!panelOpen) updatePlayer(dt, t);
    else animateWalk(player, false, t);
    updateNpcs(dt, t);
  }
  renderer.render(scene, camera);
}
tick();

// E / Space / Escape — open near station or close panel (desktop)
window.addEventListener('keydown', (e) => {
  if (!playing) return;
  if (e.code === 'Escape' && isPanelOpen()) {
    e.preventDefault();
    closeStation();
    return;
  }
  if (e.code === 'KeyE' || e.code === 'Space') {
    if (isPanelOpen()) {
      e.preventDefault();
      closeStation();
      return;
    }
    if (nearStation) {
      e.preventDefault();
      openStation(nearStation);
    }
  }
});
