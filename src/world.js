import * as THREE from 'three';
import {
  makeBannerTexture,
  makeHangingBannerTexture,
  makeStationSign,
} from './textures.js';

/**
 * Photoreal-leaning Summit Expert Bar atrium for buy-in POC.
 * Photo plates for backdrop/floor/banners/ring; PBR materials; cool daylight + cyan.
 */
export function buildWorld(scene, textureLoader) {
  const stations = [];
  const sRGB = (tex) => {
    if (tex) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const load = (url, opts = {}) => {
    const t = sRGB(textureLoader.load(url));
    if (opts.repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
    if (opts.anisotropy) t.anisotropy = opts.anisotropy;
    return t;
  };

  // --- Lighting: cool daylight + cyan fill + soft rim (Summit hall) ---
  scene.add(new THREE.HemisphereLight(0xd8e8f5, 0x8a9098, 0.55));
  const sun = new THREE.DirectionalLight(0xfff6ea, 1.15);
  sun.position.set(6, 20, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 50;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  const cyanFill = new THREE.DirectionalLight(0x7fd9ef, 0.35);
  cyanFill.position.set(-8, 10, -6);
  scene.add(cyanFill);
  const rim = new THREE.DirectionalLight(0xb8d4ef, 0.28);
  rim.position.set(0, 6, 12);
  scene.add(rim);

  // Soft skylight glow
  const skyGlow = new THREE.PointLight(0xcfe8f8, 0.55, 40, 2);
  skyGlow.position.set(0, 9, -2);
  scene.add(skyGlow);

  // --- Floor: Summit-inspired carpet ---
  const floorTex = load('./textures/floor-carpet.jpg', { repeat: [5, 5], anisotropy: 4 });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 42),
    new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.95,
      metalness: 0.0,
      color: 0xd8dde4,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Subtle floor sheen strip near ring (polished path)
  const path = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshStandardMaterial({
      color: 0xd8dde6,
      roughness: 0.55,
      metalness: 0.08,
      transparent: true,
      opacity: 0.22,
    })
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, -2);
  path.receiveShadow = true;
  scene.add(path);

  // --- Photo hall backdrop (hero orbit) — kills Roblox graybox read ---
  const backdropTex = load('./textures/hall-backdrop.jpg');
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(38, 14),
    new THREE.MeshStandardMaterial({
      map: backdropTex,
      roughness: 0.95,
      metalness: 0.0,
      emissive: 0x111820,
      emissiveIntensity: 0.12,
    })
  );
  backdrop.position.set(0, 5.2, -17.2);
  scene.add(backdrop);

  // Side mural walls (establish plate, dimmer)
  const sideTex = load('./textures/hall-establish.jpg');
  const mkSide = (x, rotY) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 12),
      new THREE.MeshStandardMaterial({
        map: sideTex,
        roughness: 0.95,
        color: 0xc8d0d8,
        emissive: 0x0a1018,
        emissiveIntensity: 0.08,
      })
    );
    m.position.set(x, 5, -2);
    m.rotation.y = rotY;
    scene.add(m);
  };
  mkSide(-17.5, Math.PI / 2);
  mkSide(17.5, -Math.PI / 2);

  // Soft plaster back-fill walls (occlusion)
  const wallMat = new THREE.MeshStandardMaterial({
    map: load('./textures/wall-plaster.jpg', { repeat: [2, 1] }),
    roughness: 0.9,
    color: 0xe8ecf2,
  });
  const mkWall = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  mkWall(40, 0.4, 0.4, 0, 8.2, -18); // cornice hint
  mkWall(0.35, 9, 36, -18.2, 4.5, 0);
  mkWall(0.35, 9, 36, 18.2, 4.5, 0);

  // Skylight photo strip
  const skyTex = load('./textures/skylight.jpg');
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 6),
    new THREE.MeshBasicMaterial({
      map: skyTex,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  sky.rotation.x = Math.PI / 2;
  sky.position.set(0, 8.6, -2);
  scene.add(sky);

  // --- Expert Bar: photo hero plate (buy-in fidelity centerpiece) ---
  const ringHeroTex = sRGB(textureLoader.load('./textures/expert-bar-hero-solid.jpg'));
  const ringHero = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 8.3),
    new THREE.MeshBasicMaterial({
      map: ringHeroTex,
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide,
      depthWrite: true,
    })
  );
  ringHero.position.set(0, 3.9, -3.2);
  ringHero.renderOrder = 1;
  scene.add(ringHero);
  // Cross plate for orbit readability
  const ringHeroB = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 8.3),
    new THREE.MeshBasicMaterial({
      map: ringHeroTex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: true,
    })
  );
  ringHeroB.position.set(0, 3.9, -3.2);
  ringHeroB.rotation.y = Math.PI / 2;
  ringHeroB.renderOrder = 1;
  scene.add(ringHeroB);

  // Thin metallic accent ring (subtle, under photo plate)
  const ringBandTex = load('./textures/ring-band.jpg');
  ringBandTex.wrapS = THREE.RepeatWrapping;
  ringBandTex.repeat.set(4, 1);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(5.5, 0.12, 10, 64),
    new THREE.MeshStandardMaterial({
      map: ringBandTex,
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.65,
      transparent: true,
      opacity: 0.85,
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 3.4, -2);
  ring.castShadow = true;
  scene.add(ring);

  // Truss legs (metallic)
  const metal = new THREE.MeshStandardMaterial({
    color: 0xd0d6dc,
    roughness: 0.32,
    metalness: 0.8,
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 5.5;
    const z = Math.sin(a) * 5.5 - 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.5, 0.28), metal);
    leg.position.set(x, 1.75, z);
    leg.castShadow = true;
    scene.add(leg);
    // Cross brace hint
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), metal);
    brace.position.set(x, 2.2, z);
    brace.rotation.z = 0.4;
    scene.add(brace);
  }

  // Inner counter (navy, subtle desk texture)
  const deskTex = load('./textures/desk-navy.jpg', { repeat: [2, 2] });
  const counter = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.4, 0.7, 48),
    new THREE.MeshStandardMaterial({
      color: 0xf4f6f8,
      roughness: 0.45,
      metalness: 0.05,
    })
  );
  counter.position.set(0, 0.35, -2);
  counter.castShadow = true;
  counter.receiveShadow = true;
  scene.add(counter);

  // Center column
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.55, 2.2, 16),
    new THREE.MeshStandardMaterial({ color: 0xc8ced6, roughness: 0.4, metalness: 0.6 })
  );
  column.position.set(0, 1.1, -2);
  column.castShadow = true;
  scene.add(column);

  // Hanging Summit banners (photo-composed)
  const hangTex = load('./textures/banner-summit.png');
  const hangMat = new THREE.MeshStandardMaterial({
    map: hangTex,
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const bannerPositions = [
    [-8.5, 4.4, -11],
    [8.5, 4.4, -11],
    [-11, 4.4, 3],
    [11, 4.4, 3],
    [-5, 5.2, -8],
    [5, 5.2, -8],
  ];
  for (const [x, y, z] of bannerPositions) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.1), hangMat);
    b.position.set(x, y, z);
    b.lookAt(0, y, -2);
    b.castShadow = true;
    scene.add(b);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.35 })
    );
    pole.position.set(x, y + 1.9, z);
    scene.add(pole);
  }

  // Mountain mural accent (brand) — smaller, overlaid near back
  const mountainTex = load('./textures/summit-mountain.jpg');
  const mural = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 4.2),
    new THREE.MeshStandardMaterial({
      map: mountainTex,
      roughness: 0.85,
      transparent: true,
      opacity: 0.92,
    })
  );
  mural.position.set(0, 6.2, -16.9);
  scene.add(mural);

  // Stations A + D
  stations.push(
    buildStation(scene, textureLoader, {
      id: 'A',
      stationKey: 'a',
      title: 'Station A',
      product: 'Billing',
      position: new THREE.Vector3(-6.5, 0, 5),
      rotationY: Math.PI * 0.15,
      panelUrl: './textures/station-a-billing.jpg',
      blurb: 'Module videos from Rev.io HQ — billing & payments. Tap a title to switch; Close stops playback.',
    })
  );
  stations.push(
    buildStation(scene, textureLoader, {
      id: 'D',
      stationKey: 'd',
      title: 'Station D',
      product: 'Tickets',
      position: new THREE.Vector3(6.5, 0, 5),
      rotationY: -Math.PI * 0.15,
      panelUrl: './textures/station-d-tickets.jpg',
      blurb: 'Module videos from Rev.io HQ — tickets & support. Tap a title to switch; Close stops playback.',
    })
  );

  // Soft architectural pillars (photo-plaster)
  const pillarMat = new THREE.MeshStandardMaterial({
    map: load('./textures/wall-plaster.jpg'),
    color: 0xe4e8ee,
    roughness: 0.85,
  });
  for (const [x, z] of [
    [-14, -14],
    [14, -14],
    [-14, 14],
    [14, 14],
  ]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 7, 1.1), pillarMat);
    p.position.set(x, 3.5, z);
    p.castShadow = true;
    p.receiveShadow = true;
    scene.add(p);
  }

  return { stations, bounds: 15, ringHero };
}

function buildStation(scene, textureLoader, cfg) {
  const group = new THREE.Group();
  group.position.copy(cfg.position);
  group.rotation.y = cfg.rotationY;

  const deskTex = textureLoader.load('./textures/desk-navy.jpg');
  deskTex.colorSpace = THREE.SRGBColorSpace;

  // White modern desk (Summit station look) with cyan brand face
  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 1.05, 1.05),
    new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.45, metalness: 0.05 })
  );
  desk.position.y = 0.52;
  desk.castShadow = true;
  desk.receiveShadow = true;
  group.add(desk);

  const faceTex = textureLoader.load('./textures/summit-mountain.jpg');
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.95),
    new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.7 })
  );
  face.position.set(0, 0.52, 0.53);
  group.add(face);

  // Monitor bezel
  const monitor = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 1.0, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x0a141f, roughness: 0.5, metalness: 0.4 })
  );
  monitor.position.set(0, 1.6, -0.15);
  monitor.castShadow = true;
  group.add(monitor);

  const screenTex = textureLoader.load(cfg.panelUrl);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.88),
    new THREE.MeshBasicMaterial({ map: screenTex })
  );
  screen.position.set(0, 1.6, -0.1);
  group.add(screen);
  // Screen glow
  const glowLight = new THREE.PointLight(0x4ec8e8, 0.35, 3.5, 2);
  glowLight.position.set(0, 1.6, 0.3);
  group.add(glowLight);

  const signTex = new THREE.CanvasTexture(makeStationSign(cfg.title, cfg.product));
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.85),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.55, metalness: 0.1 })
  );
  sign.position.set(0, 2.45, -0.12);
  group.add(sign);

  // Cyan accent strip
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.05, 1.05),
    new THREE.MeshStandardMaterial({
      color: 0x34bde5,
      emissive: 0x34bde5,
      emissiveIntensity: 0.85,
      roughness: 0.4,
    })
  );
  glow.position.y = 1.07;
  group.add(glow);

  scene.add(group);

  return {
    id: cfg.id,
    stationKey: cfg.stationKey || String(cfg.id).toLowerCase(),
    title: cfg.title,
    product: cfg.product,
    panelUrl: cfg.panelUrl,
    blurb: cfg.blurb,
    position: cfg.position.clone(),
    radius: 4.5,
    group,
  };
}
