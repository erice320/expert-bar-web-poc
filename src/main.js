import * as THREE from 'three';
import { AVATARS, createAvatarMesh, animateWalk, upgradeAvatar, placeProps } from './avatars.js';
import { CHARACTER_SLOTS } from './models/manifest.js';
import { modelStatus, preload, tickMixers } from './models/loader.js';
import { Joystick, Keyboard, DPad, LookPad } from './joystick.js';
import { buildWorld, HALL } from './world.js';
import { ColliderWorld, PLAYER } from './collision.js';
import { armClearance, stepArm, placeCamera } from './camera-rig.js';
import { buildColliders } from './colliders.js';
import { createColliderDebug } from './collider-debug.js';
import { getStationPlaylist, embedUrl } from './station-videos.js';

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
const panelYt = document.getElementById('panel-yt');
const panelPlaylist = document.getElementById('panel-playlist');
const panelBlurb = document.getElementById('panel-blurb');
const panelClose = document.getElementById('panel-close');
let activePlaylist = null;
let activeVideoIndex = 0;

const qs = new URLSearchParams(location.search);
/** ?collision=0 restores the pre-collision movement (square clamp) for A/B comparison and rollback only. */
const COLLISION_ON = qs.get('collision') !== '0';
const DEBUG_MODE = qs.get('debug');
const LEGACY_BOUNDS = 15;
const WALK_SPEED = 3.6;

const VERSION = __APP_VERSION__;
console.info(`[eb] Expert Bar v${VERSION}`);
const hostBadge = document.getElementById('host-badge');
if (hostBadge) hostBadge.textContent = `stream.revioai.bot · v${VERSION}`;
const fineprint = document.querySelector('.fineprint');
if (fineprint) fineprint.textContent = `${fineprint.textContent} · v${VERSION}`;

const LS_NAME = 'eb_display_name';
const LS_AVATAR = 'eb_avatar';
const LS_DEMO = 'eb_demo_code';

let selectedId = null;
let player = null;
let playerPreset = null;
let playerDisplayName = '';
let stations = [];
let npcs = [];
const collision = new ColliderWorld();
let colliderDebug = null;
let playerVy = 0;
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
    preload(a.id, CHARACTER_SLOTS[a.id]);
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

function stopStationVideo() {
  if (panelYt) {
    // Clear src so playback/audio stops immediately (iframe unload).
    panelYt.src = 'about:blank';
  }
  if (panelPlaylist) panelPlaylist.innerHTML = '';
  activePlaylist = null;
  activeVideoIndex = 0;
}

function closeStation() {
  stopStationVideo();
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
const camFree = new THREE.Vector3(); // unconstrained (lagged) orbit position; camera.position is this run through the spring arm
let camArm;
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

  collision.clear();
  for (const c of buildColliders(scene)) collision.add(c);
  if (DEBUG_MODE === 'colliders') colliderDebug = createColliderDebug(scene, collision);

  player = createAvatarMesh(playerPreset, { label: true, displayName: playerDisplayName, textureLoader });
  player.position.set(0, 0, 10);
  player.rotation.y = 0; // face -Z toward Expert Bar ring
  scene.add(player);
  const playerUpgrade = upgradeAvatar(player, playerPreset).catch(() => null);

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
    npcs.push({ mesh, path: spec.path, speed: spec.speed, t: Math.random() * 10, idle: Math.random() > 0.5, preset: spec.preset });
  }

  // Player GLB first; NPC GLBs + props start once it settles (or after 2.5 s). Never blocks login.
  const startDeferred = () => {
    for (const n of npcs) upgradeAvatar(n.mesh, n.preset, `${n.preset.id}#npc`).catch(() => null);
    placeHallProps(world);
  };
  Promise.race([playerUpgrade, new Promise((r) => setTimeout(r, 2500))]).then(startDeferred);

  // Independent orbit camera behind player (face -Z → camYaw 0)
  camYaw = 0;
  camPitch = 0.18;
  desiredCam.set(
    player.position.x + Math.sin(camYaw) * CAM_DIST,
    player.position.y + CAM_HEIGHT + Math.sin(camPitch) * 1.2,
    player.position.z + Math.cos(camYaw) * CAM_DIST
  );
  camFree.copy(desiredCam);
  camArm = undefined;
  camLook.set(player.position.x, player.position.y + 1.5, player.position.z);
  updateCameraRig(1);

  playing = true;

  window.__ebTeleport = (x, z) => {
    if (!player) return;
    if (!COLLISION_ON) {
      player.position.set(x, 0, z);
      return;
    }
    const inset = PLAYER.radius;
    const cx = THREE.MathUtils.clamp(x, -HALL.halfX + inset, HALL.halfX - inset);
    const cz = THREE.MathUtils.clamp(z, HALL.zNorth + inset, HALL.zSouth - inset);
    playerVy = 0;
    // A zero-delta resolve without dt snaps y to the ground and pushes out of any collider.
    const out = collision.resolveMove({ x: cx, y: 0, z: cz }, { x: 0, z: 0 });
    player.position.set(out.pos.x, out.pos.y, out.pos.z);
    colliderDebug?.update(out.contacts, player.position);
  };

  if (DEBUG_MODE === '1' || DEBUG_MODE === 'colliders') {
    window.__ebLook = (yaw, pitch) => {
      camYaw = yaw;
      if (pitch !== undefined) camPitch = THREE.MathUtils.clamp(pitch, PITCH_MIN, PITCH_MAX);
    };
  }
}

function placeHallProps(world) {
  const chairFace = { faceX: 0, faceZ: -2 };
  placeProps(
    'PROP-CHAIR',
    [
      [4.15, -0.89],
      [4.15, -3.11],
      [-4.15, -0.89],
      [-4.15, -3.11],
    ].map(([x, z]) => ({ parent: scene, x, z, ...chairFace })),
    collision
  ).catch(() => {});
  const planters = [];
  for (const st of world.stations) {
    if (st.id !== 'A' && st.id !== 'D') continue;
    for (const x of [-1.75, 1.75]) planters.push({ parent: st.group, x, z: -0.35, faceX: x, faceZ: 0.65 });
  }
  placeProps('PROP-PLANTER', planters, collision).catch(() => {});
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

function loadStationVideo(index) {
  if (!activePlaylist || !panelYt) return;
  const vids = activePlaylist.videos;
  if (!vids.length) return;
  const i = Math.max(0, Math.min(index, vids.length - 1));
  activeVideoIndex = i;
  const current = vids[i];
  const rest = vids.filter((_, j) => j !== i).map((v) => v.id);
  panelYt.src = embedUrl(current.id, rest);
  if (panelPlaylist) {
    for (const btn of panelPlaylist.querySelectorAll('[data-vid-index]')) {
      const on = Number(btn.dataset.vidIndex) === i;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-current', on ? 'true' : 'false');
    }
  }
}

function renderPlaylistList(playlist) {
  if (!panelPlaylist) return;
  panelPlaylist.innerHTML = '';
  playlist.videos.forEach((v, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'playlist-item';
    btn.dataset.vidIndex = String(i);
    btn.innerHTML = `<span class="pl-num">${i + 1}</span><span class="pl-title">${v.title}</span><span class="pl-len">${v.length || ''}</span>`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      loadStationVideo(i);
    });
    btn.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();
      loadStationVideo(i);
    }, { passive: false });
    li.appendChild(btn);
    panelPlaylist.appendChild(li);
  });
}

function openStation(st) {
  panelTitle.textContent = `${st.title} · ${st.product}`;
  panelBlurb.textContent = st.blurb;
  const playlist = getStationPlaylist(st.stationKey || st.id);
  activePlaylist = playlist;
  if (playlist && playlist.videos.length) {
    renderPlaylistList(playlist);
    loadStationVideo(0);
  } else {
    stopStationVideo();
  }
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
  let moveX = 0;
  let moveZ = 0;
  if (moving) {
    moveDir.set(0, 0, 0);
    moveDir.addScaledVector(rightFlat, ix);
    moveDir.addScaledVector(forwardFlat, -iy);
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      moveX = moveDir.x * WALK_SPEED * dt;
      moveZ = moveDir.z * WALK_SPEED * dt;
      // Face move direction (visual only — does NOT drive camera)
      const targetYaw = Math.atan2(moveDir.x, moveDir.z);
      player.rotation.y = approachAngle(player.rotation.y, targetYaw, 0.2);
    }
  }
  let contacts = [];
  if (COLLISION_ON) {
    const out = collision.resolveMove(player.position, { x: moveX, z: moveZ }, { dt, vy: playerVy });
    player.position.set(out.pos.x, out.pos.y, out.pos.z);
    playerVy = out.vy;
    contacts = out.contacts;
  } else {
    player.position.x = THREE.MathUtils.clamp(player.position.x + moveX, -LEGACY_BOUNDS, LEGACY_BOUNDS);
    player.position.z = THREE.MathUtils.clamp(player.position.z + moveZ, -LEGACY_BOUNDS, LEGACY_BOUNDS);
  }
  colliderDebug?.update(contacts, player.position);
  animateWalk(player, moving, t, moving ? WALK_SPEED : 0);

  // Independent OTS orbit: behind player by camYaw / camPitch (NOT player.rotation.y)
  const pitchLift = Math.sin(camPitch) * 1.2;
  const dist = CAM_DIST * Math.cos(camPitch);
  desiredCam.set(
    player.position.x + Math.sin(camYaw) * dist,
    player.position.y + CAM_HEIGHT + pitchLift,
    player.position.z + Math.cos(camYaw) * dist
  );
  const ease = 1 - Math.pow(0.001, dt);
  camFree.lerp(desiredCam, ease);
  camLook.set(player.position.x, player.position.y + 1.5, player.position.z);
  updateCameraRig(ease);

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
    camera: camera.position.toArray(),
    camDist: camera.position.distanceTo(camLook),
    joy: { ...joystick.vector, active: joystick.active },
    lookActive: lookPad.active,
    near: nearStation && nearStation.id,
    get collision() {
      return { enabled: COLLISION_ON, ...collision.snapshot(player.position.y) };
    },
    version: VERSION,
    models: { ...modelStatus },
    tris: renderer.info.render.triangles,
    calls: renderer.info.render.calls,
    stations: stations.map((s) => {
      const v = new THREE.Vector3();
      s.group.getWorldPosition(v);
      return { id: s.id, pos: v.toArray(), d: player.position.distanceTo(v) };
    }),
  };
}

/** Spring arm: contain camFree against the hall and wall colliders, then aim at camLook. */
function updateCameraRig(ease) {
  if (!COLLISION_ON) {
    camera.position.copy(camFree);
    camera.lookAt(camLook);
    return;
  }
  const clearance = armClearance(collision, camLook, camFree);
  camArm = stepArm(camArm, clearance.allowed, ease);
  const p = placeCamera(camLook, camFree, clearance, camArm, HALL);
  camera.position.set(p.x, p.y, p.z);
  camera.lookAt(camLook);
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
    const stepSpeed = moving && dt > 0 ? Math.hypot(n.mesh.position.x - prev.x, n.mesh.position.z - prev.z) / dt : 0;
    animateWalk(n.mesh, moving, t + n.t, stepSpeed);
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
  tickMixers(dt);
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
