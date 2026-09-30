import * as THREE from 'three';
import { CHARACTER_SLOTS, PROP_SLOTS } from './models/manifest.js';
import { instantiate } from './models/loader.js';

/** Avatar presets matching GAMEPLAY_OTS_v02 AV-A–D spirit */
export const AVATARS = [
  {
    id: 'AV-A',
    name: 'Alex Rivera',
    desc: 'Short black bob · charcoal blazer · teal lanyard',
    skin: 0xc68642,
    hair: 0x1a1a1a,
    hairStyle: 'bob',
    blazer: 0x2c2c2c,
    shirt: 0xe8eef5,
    pants: 0x1a1a1a,
    shoes: 0xf5f5f5,
    lanyard: 0x34bde5,
    accent: 0x2c2c2c,
    fabric: './textures/fabric-charcoal.jpg',
    skinMap: './textures/skin-warm.jpg',
    photo: './textures/avatar-av-a.png',
    thumb: './textures/avatar-av-a-thumb.jpg?v=0.3.3',
  },
  {
    id: 'AV-B',
    name: 'Morgan Hale',
    desc: 'Salt-and-pepper · navy blazer · open collar',
    skin: 0xdbb48a,
    hair: 0x9a9a9a,
    hairStyle: 'short',
    blazer: 0x1a3756,
    shirt: 0xffffff,
    pants: 0x1a1a2e,
    shoes: 0x222222,
    lanyard: 0x34bde5,
    accent: 0x1a3756,
    fabric: './textures/fabric-navy.jpg',
    skinMap: './textures/skin-light.jpg',
    photo: './textures/avatar-av-b.png',
    thumb: './textures/avatar-av-b-thumb.jpg?v=0.3.3',
  },
  {
    id: 'AV-C',
    name: 'Jordan Quinn',
    desc: 'Curly auburn · olive jacket · dark jeans',
    skin: 0xe0ac69,
    hair: 0x8b3a2a,
    hairStyle: 'curly',
    blazer: 0x556b2f,
    shirt: 0x111111,
    pants: 0x1c2430,
    shoes: 0x2a2a2a,
    lanyard: 0x34bde5,
    accent: 0x556b2f,
    fabric: './textures/fabric-olive.jpg',
    skinMap: './textures/skin-medium.jpg',
    photo: './textures/avatar-av-c.png',
    thumb: './textures/avatar-av-c-thumb.jpg?v=0.3.3',
  },
  {
    id: 'AV-D',
    name: 'Casey Brooks',
    desc: 'Close fade · soft blue shirt · glasses',
    skin: 0xc4a484,
    hair: 0x2a2a2a,
    hairStyle: 'shaved',
    blazer: 0x7ba3c9,
    shirt: 0x7ba3c9,
    pants: 0x6b6e73,
    shoes: 0x333333,
    lanyard: 0x34bde5,
    accent: 0x7ba3c9,
    glasses: true,
    fabric: './textures/fabric-softblue.jpg',
    skinMap: './textures/skin-tan.jpg',
    photo: './textures/avatar-av-d.png',
    thumb: './textures/avatar-av-d-thumb.jpg?v=0.3.3',
  },
];

const texCache = new Map();
function getTex(loader, url) {
  if (!url) return null;
  if (texCache.has(url)) return texCache.get(url);
  const t = loader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(url, t);
  return t;
}

/**
 * Photoreal-leaning avatar: photo billboard (preferred) + low-poly shadow caster body.
 * Billboard yaw-follows movement so OTS reads as a real person, not a capsule.
 */
export function createAvatarMesh(preset, { label = true, displayName = null, textureLoader = null } = {}) {
  const root = new THREE.Group();
  root.userData.preset = preset;

  const loader = textureLoader || new THREE.TextureLoader();

  // Invisible capsule collider / walk-anim skeleton (cast soft shadow)
  const body = buildBodyMesh(preset, loader);
  body.name = 'body';
  // Hide solid mesh when photo plate is available — keep for shadows via body.userData
  root.add(body);
  root.userData.body = body;

  // Photo plate (alpha cutout) — primary visual
  const photoTex = getTex(loader, preset.photo);
  let plate = null;
  if (photoTex) {
    const aspect = 0.55; // will be corrected on load if possible
    const h = 1.78;
    const w = h * aspect;
    plate = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: photoTex,
        transparent: true,
        alphaTest: 0.12,
        side: THREE.DoubleSide,
        depthWrite: true,
      })
    );
    plate.position.y = h / 2;
    plate.name = 'photoPlate';
    // Soften body under plate
    body.visible = false;
    // Still cast shadow from a thin proxy
    const shadowProxy = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 1.0, 4, 8),
      new THREE.MeshStandardMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      })
    );
    shadowProxy.position.y = 0.9;
    shadowProxy.castShadow = true;
    shadowProxy.frustumCulled = false;
    root.add(shadowProxy);
    root.userData.shadowProxy = shadowProxy;
    root.add(plate);
    root.userData.photoPlate = plate;

    // Fix aspect when image loads
    const img = photoTex.image;
    const applyAspect = () => {
      if (!photoTex.image) return;
      const iw = photoTex.image.width || 1;
      const ih = photoTex.image.height || 1;
      const a = iw / ih;
      plate.geometry.dispose();
      plate.geometry = new THREE.PlaneGeometry(h * Math.min(a, 0.72), h);
    };
    if (img && img.width) applyAspect();
    else photoTex.addEventListener?.('dispose', () => {});
    // TextureLoader sets image async — poll once
    const check = setInterval(() => {
      if (photoTex.image && photoTex.image.width) {
        applyAspect();
        clearInterval(check);
      }
    }, 100);
    setTimeout(() => clearInterval(check), 5000);
  }

  if (label) {
    const plateName =
      displayName && String(displayName).trim()
        ? String(displayName).trim().slice(0, 18)
        : preset.name.split(' ')[0];
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(10,20,31,0.78)';
    roundRect(ctx, 8, 8, 240, 48, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(52,189,229,0.55)';
    ctx.lineWidth = 2;
    roundRect(ctx, 8, 8, 240, 48, 10);
    ctx.stroke();
    ctx.fillStyle = '#34BDE5';
    ctx.font = 'bold 20px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(plateName, 128, 30);
    ctx.fillStyle = '#B9C7D6';
    ctx.font = '14px system-ui,sans-serif';
    ctx.fillText(preset.id, 128, 48);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const spr = new THREE.Sprite(sprMat);
    spr.scale.set(1.35, 0.34, 1);
    spr.position.y = 2.15;
    root.add(spr);
  }

  root.userData.leftLeg = body.userData.leftLeg;
  root.userData.rightLeg = body.userData.rightLeg;
  root.userData.leftArm = body.userData.leftArm;
  root.userData.rightArm = body.userData.rightArm;

  return root;
}

/** Improved proportions + fabric maps — used when photo plate missing or as fallback under plate */
function buildBodyMesh(preset, loader) {
  const root = new THREE.Group();
  const fabricTex = getTex(loader, preset.fabric);
  const skinTex = getTex(loader, preset.skinMap);
  const pantsTex = getTex(loader, './textures/fabric-pants.jpg');
  const shirtTex = getTex(loader, './textures/fabric-shirt.jpg');

  const legMat = new THREE.MeshStandardMaterial({
    color: preset.pants,
    map: pantsTex || null,
    roughness: 0.82,
    metalness: 0.05,
  });
  // Better leg proportions (longer, thinner)
  const legGeo = new THREE.CapsuleGeometry(0.09, 0.55, 4, 8);
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.11, 0.42, 0);
  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.set(0.11, 0.42, 0);
  root.add(leftLeg, rightLeg);

  const shoeMat = new THREE.MeshStandardMaterial({ color: preset.shoes, roughness: 0.65, metalness: 0.1 });
  const shoeGeo = new THREE.BoxGeometry(0.16, 0.07, 0.28);
  const ls = new THREE.Mesh(shoeGeo, shoeMat);
  ls.position.set(-0.11, 0.04, 0.04);
  const rs = new THREE.Mesh(shoeGeo, shoeMat);
  rs.position.set(0.11, 0.04, 0.04);
  root.add(ls, rs);

  const torsoMat = new THREE.MeshStandardMaterial({
    color: preset.blazer,
    map: fabricTex || null,
    roughness: 0.72,
    metalness: 0.08,
  });
  // Shoulders broader, waist taper via scaled capsule
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.48, 6, 12), torsoMat);
  torso.position.y = 1.08;
  torso.scale.set(1.15, 1, 0.85);
  root.add(torso);

  const shirt = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.32, 0.06),
    new THREE.MeshStandardMaterial({
      color: preset.shirt,
      map: shirtTex || null,
      roughness: 0.7,
    })
  );
  shirt.position.set(0, 1.18, 0.2);
  root.add(shirt);

  const armGeo = new THREE.CapsuleGeometry(0.065, 0.45, 4, 8);
  const la = new THREE.Mesh(armGeo, torsoMat);
  la.position.set(-0.36, 1.08, 0);
  la.rotation.z = 0.12;
  const ra = new THREE.Mesh(armGeo, torsoMat);
  ra.position.set(0.36, 1.08, 0);
  ra.rotation.z = -0.12;
  root.add(la, ra);

  // Hands
  const skinMat = new THREE.MeshStandardMaterial({
    color: preset.skin,
    map: skinTex || null,
    roughness: 0.55,
    metalness: 0.02,
  });
  const handGeo = new THREE.SphereGeometry(0.055, 8, 6);
  const lh = new THREE.Mesh(handGeo, skinMat);
  lh.position.set(-0.38, 0.72, 0.02);
  const rh = new THREE.Mesh(handGeo, skinMat);
  rh.position.set(0.38, 0.72, 0.02);
  root.add(lh, rh);

  const lan = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.38, 0.015),
    new THREE.MeshStandardMaterial({
      color: preset.lanyard,
      emissive: preset.lanyard,
      emissiveIntensity: 0.35,
      roughness: 0.5,
    })
  );
  lan.position.set(0, 1.22, 0.26);
  root.add(lan);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.1, 10), skinMat);
  neck.position.y = 1.5;
  root.add(neck);

  // Head — slightly oval, more human
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 20, 16), skinMat);
  head.position.y = 1.72;
  head.scale.set(0.95, 1.08, 0.92);
  root.add(head);

  // Simple face (eyes + mouth) so OTS/side views don't look blank
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
  const eyeGeo = new THREE.SphereGeometry(0.022, 8, 6);
  const le = new THREE.Mesh(eyeGeo, eyeMat);
  le.position.set(-0.055, 1.74, 0.14);
  const re = new THREE.Mesh(eyeGeo, eyeMat);
  re.position.set(0.055, 1.74, 0.14);
  root.add(le, re);
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.012, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x6a3a3a, roughness: 0.7 })
  );
  mouth.position.set(0, 1.64, 0.15);
  root.add(mouth);

  addHair(root, preset);

  if (preset.glasses) {
    const gMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.35 });
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.01, 6, 12), gMat);
    frame.position.set(-0.06, 1.74, 0.15);
    frame.rotation.y = Math.PI / 2;
    const frame2 = frame.clone();
    frame2.position.x = 0.06;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.012), gMat);
    bridge.position.set(0, 1.74, 0.16);
    root.add(frame, frame2, bridge);
  }

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  root.userData.leftLeg = leftLeg;
  root.userData.rightLeg = rightLeg;
  root.userData.leftArm = la;
  root.userData.rightArm = ra;
  return root;
}

function addHair(root, preset) {
  const hairMat = new THREE.MeshStandardMaterial({ color: preset.hair, roughness: 0.88 });
  if (preset.hairStyle === 'bob') {
    const bob = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    bob.position.y = 1.78;
    bob.scale.set(1.08, 0.9, 1.12);
    root.add(bob);
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.1), hairMat);
    fringe.position.set(0, 1.82, 0.14);
    root.add(fringe);
  } else if (preset.hairStyle === 'short') {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      hairMat
    );
    cap.position.y = 1.8;
    root.add(cap);
  } else if (preset.hairStyle === 'curly') {
    for (let i = 0; i < 12; i++) {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), hairMat);
      const a = (i / 12) * Math.PI * 2;
      curl.position.set(Math.cos(a) * 0.15, 1.78 + (i % 3) * 0.05, Math.sin(a) * 0.15);
      root.add(curl);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), hairMat);
    top.position.y = 1.88;
    root.add(top);
  } else if (preset.hairStyle === 'shaved') {
    const stubble = new THREE.Mesh(
      new THREE.SphereGeometry(0.185, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
      new THREE.MeshStandardMaterial({
        color: preset.hair,
        roughness: 1,
        transparent: true,
        opacity: 0.5,
      })
    );
    stubble.position.y = 1.8;
    root.add(stubble);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Swap the billboard for a GLB when one loads. Billboard stays on any failure.
 * statusKey: preset.id for the player, `${preset.id}#npc` for NPCs.
 */
export function upgradeAvatar(group, preset, statusKey = preset.id) {
  const slot = CHARACTER_SLOTS[preset.id];
  if (!slot) return Promise.resolve(null);
  return instantiate(statusKey, slot).then((res) => {
    if (!res) return null;
    const u = group.userData;
    if (u.photoPlate) u.photoPlate.visible = false;
    if (u.body) u.body.visible = false;
    if (u.shadowProxy) u.shadowProxy.visible = false;
    res.object.name = 'model3d';
    group.add(res.object);
    u.model3d = res;
    if (res.idleAction) {
      res.idleAction.setEffectiveWeight(1);
      res.walkAction.setEffectiveWeight(0);
    }
    return res;
  });
}

/**
 * placements: [{ parent, x, z, faceX, faceZ }] in the parent's local space.
 * Missing/failed asset => props simply absent.
 */
export function placeProps(key, placements) {
  return instantiate(key, PROP_SLOTS[key]).then((res) => {
    if (!res) return;
    placements.forEach((p, i) => {
      const o = i === 0 ? res.object : res.object.clone(true);
      o.position.set(p.x, 0, p.z);
      o.rotation.y = Math.atan2(p.faceX - p.x, p.faceZ - p.z);
      p.parent.add(o);
    });
  });
}

function animateModel(m, moving, t, speed) {
  const pivot = m.object;
  if (m.mixer && m.walkAction) {
    const stepScale = THREE.MathUtils.clamp((speed || 1.4) / m.walkClipSpeed, 0.6, 2.4);
    if (m.idleAction) {
      const w = THREE.MathUtils.lerp(m.walkAction.getEffectiveWeight(), moving ? 1 : 0, 0.2);
      m.walkAction.setEffectiveWeight(w);
      m.idleAction.setEffectiveWeight(1 - w);
      m.walkAction.timeScale = stepScale;
    } else {
      m.walkAction.setEffectiveWeight(1);
      m.walkAction.timeScale = moving ? stepScale : THREE.MathUtils.lerp(m.walkAction.timeScale, 0, 0.25);
    }
    pivot.position.y = 0;
    pivot.scale.y = 1 + (moving ? 0 : Math.sin(t * 1.6) * 0.004);
  } else {
    pivot.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.035 : 0;
    pivot.rotation.z = moving ? Math.sin(t * 9) * 0.035 : Math.sin(t * 1.2) * 0.008;
    pivot.rotation.x = moving ? 0.05 : 0;
  }
}

/** speed: ground speed in m/s (optional; drives GLB walk playback rate). */
export function animateWalk(avatar, moving, t, speed) {
  const model = avatar.userData.model3d;
  if (model) {
    animateModel(model, moving, t, speed);
    return;
  }
  const amp = moving ? 0.45 : 0.04;
  const freq = moving ? 10 : 2;
  const swing = Math.sin(t * freq) * amp;
  if (avatar.userData.leftLeg) {
    avatar.userData.leftLeg.rotation.x = swing;
    avatar.userData.rightLeg.rotation.x = -swing;
    avatar.userData.leftArm.rotation.x = -swing * 0.55;
    avatar.userData.rightArm.rotation.x = swing * 0.55;
  }
  // Photo plate bob when walking
  if (avatar.userData.photoPlate && moving) {
    avatar.userData.photoPlate.position.y = 1.78 / 2 + Math.sin(t * 10) * 0.02;
  }
}
