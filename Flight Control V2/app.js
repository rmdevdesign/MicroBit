import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

// ── Cockpit mode ─────────────────────────────────────────────────────────────
// true  → overlay PNG winshield.png (2D, mix-blend-mode multiply)
// false → cockpit 3D géométrique (revert)
const USE_IMAGE_COCKPIT = true;

const RING_RADIUS    = 3.8;
const RING_HIT_RADIUS = 5.5;
const MAX_PITCH      = 26;
const MAX_ROLL       = 36;
const MAX_RUDDER     = 1.15;
const TURN_RATE      = 1.18;
const CLIMB_RATE     = 9;
const BASE_SPEED     = 8;
const DIVE_SPEED_GAIN = 3;
const SPEED_DISPLAY_SCALE = 18;
const MICROBIT_TURN_MIX   = 1.05;

const state = {
  port: null, reader: null, reading: false, connected: false, buffer: "",
  keyboard: new Set(),
  targetPitch: 0, targetRoll: 0, targetRudder: 0,
  pitch: 0, roll: 0, rudder: 0,
  yaw: Math.PI * 0.08,
  speed: BASE_SPEED,
  position: new THREE.Vector3(-115, 24, 100),
  mission: "water", activeRing: 0, score: 0,
  tankFull: false, dropArmed: false,
  stickNeutral: null, centerStickRequested: true,
};

const ui = {
  connectButton:    document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  resetButton:      document.querySelector("#resetButton"),
  status:           document.querySelector("#status"),
  missionLabel:     document.querySelector("#missionLabel"),
  ringLabel:        document.querySelector("#ringLabel"),
  tankLabel:        document.querySelector("#tankLabel"),
  scoreLabel:       document.querySelector("#scoreLabel"),
  altitudeLabel:    document.querySelector("#altitudeLabel"),
  speedLabel:       document.querySelector("#speedLabel"),
  headingLabel:     document.querySelector("#headingLabel"),
  rudderLabel:      document.querySelector("#rudderLabel"),
  pitchLabel:       document.querySelector("#pitchLabel"),
  rollLabel:        document.querySelector("#rollLabel"),
  attitudeBar:      document.querySelector("#attitudeBar"),
  compassNeedle:    document.querySelector("#compassNeedle"),
  ringDist:         document.querySelector("#ringDist"),
  ringDots:         document.querySelector("#ringDots"),
  ringsChip:        document.querySelector("#ringsChip"),
  missionOverlay:   document.querySelector("#missionOverlay"),
  finalScore:       document.querySelector("#finalScore"),
  overlayReset:     document.querySelector("#overlayReset"),
};

const canvas   = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.fog   = new THREE.FogExp2(0xb6d8ef, 0.0032);

const camera  = new THREE.PerspectiveCamera(67, 1, 0.1, 1400);
const decoder = new TextDecoder();

const world = new THREE.Group();
scene.add(world);

// --- Lighting ---
const hemi = new THREE.HemisphereLight(0xddeeff, 0x3a5c22, 2.1);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffeedd, 3.4);
sun.position.set(-100, 220, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near   = 1;
sun.shadow.camera.far    = 700;
sun.shadow.camera.left   = -250;
sun.shadow.camera.right  =  250;
sun.shadow.camera.top    =  250;
sun.shadow.camera.bottom = -250;
sun.shadow.bias = -0.0003;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x9ec8e0, 0.55);
fill.position.set(80, 40, -100);
scene.add(fill);

// --- Sky dome ---
let skyDome;
function buildSky() {
  const geo = new THREE.SphereGeometry(1100, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vPos;
      void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      varying vec3 vPos;
      void main() {
        float t = clamp((vPos.y + 130.0) / 960.0, 0.0, 1.0);
        vec3 horizon = vec3(0.71, 0.87, 0.98);
        vec3 zenith  = vec3(0.12, 0.34, 0.72);
        gl_FragColor  = vec4(mix(horizon, zenith, pow(t, 0.52)), 1.0);
      }
    `,
  });
  skyDome = new THREE.Mesh(geo, mat);
  skyDome.renderOrder = -1;
  scene.add(skyDome);

  // Sun disc
  const sunSphere = new THREE.Mesh(
    new THREE.SphereGeometry(22, 16, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff8cc })
  );
  sunSphere.position.copy(new THREE.Vector3(-100, 220, 80).normalize().multiplyScalar(900));
  scene.add(sunSphere);
}

// --- Clouds ---
const cloudMeshes = [];
function buildClouds() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf8fbff, roughness: 1, transparent: true, opacity: 0.88,
  });
  [
    [-160, 76, -70], [110, 90, -130], [220, 72, 30], [-230, 82, 110],
    [70,  92, 180],  [-90, 78, -210], [170, 86, -88], [-200, 74, -150],
    [140, 80,  90],  [-50, 95,  240],
  ].forEach(([x, y, z]) => {
    const cloud = new THREE.Group();
    cloud.position.set(x, y, z);
    const s = 0.75 + Math.random() * 0.75;
    for (let j = 0; j < 6; j++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(7 + Math.random() * 5, 9, 7),
        mat.clone()
      );
      puff.position.set((Math.random()-0.5)*22*s, (Math.random()-0.5)*5, (Math.random()-0.5)*14*s);
      puff.scale.setScalar(s);
      cloud.add(puff);
    }
    cloud.userData.baseX = x;
    cloudMeshes.push(cloud);
    scene.add(cloud);
  });
}

// --- Paths ---
const waterCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-92, 20,  76),
  new THREE.Vector3(-72, 17,  56),
  new THREE.Vector3(-52, 12,  34),
  new THREE.Vector3(-28,  7,  12),
  new THREE.Vector3( -4,  5,  -4),
  new THREE.Vector3( 24,  5, -14),
  new THREE.Vector3( 52,  9, -24),
  new THREE.Vector3( 82, 17, -46),
]);

// Sortie eau : (82,17,-46), direction (+30,+8,-22).
// Ring 0 feu = 25u dans ce même vecteur → point 1 confirme la tangente
// → CatmullRom démarre avec exactement le même cap que la fin du bleu.
// Arc progressif SO puis O, z ≥ -82 (hors montagnes z≈-122), y ≥ 21 (au-dessus des arbres y≤15)
const fireCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3( 97, 21, -57),   // +0.5×(30,8,-22) depuis sortie eau → ring 0
  new THREE.Vector3(112, 25, -68),   // +1×(30,8,-22) → fixe la tangente initiale
  new THREE.Vector3( 86, 24, -80),   // virage SO
  new THREE.Vector3( 44, 23, -82),   // cap O, z max -82
  new THREE.Vector3(-10, 21, -72),   // cap ONO
  new THREE.Vector3(-82, 19, -44),   // au-dessus du feu
]);

const paths = {
  water: createPath("water", waterCurve, 0x33ccff),
  fire:  createPath("fire",  fireCurve,  0xff5533),
};


let aircraft, cockpit, propeller, waterRibbon, fireSystem;
let lastFrame = performance.now();
const forwardDirection = new THREE.Vector3();

buildSky();
buildWorld();
buildAircraft();
buildCockpit();
updateMissionVisuals();
resetMission();
animate();

// --- World ---
function buildWorld() {
  buildClouds();

  // Ocean
  world.add(new THREE.Mesh(
    new THREE.PlaneGeometry(1800, 1800),
    new THREE.MeshStandardMaterial({ color: 0x0a5c80, roughness: 0.1, metalness: 0.4 })
  ));
  world.children[world.children.length-1].rotation.x = -Math.PI/2;
  world.children[world.children.length-1].position.y = -1;
  world.children[world.children.length-1].receiveShadow = true;

  // Lake
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(60, 80),
    new THREE.MeshStandardMaterial({ color: 0x29b5d5, roughness: 0.05, metalness: 0.5 })
  );
  lake.rotation.x = -Math.PI/2;
  lake.position.set(8, 0.14, -8);
  world.add(lake);

  // Lake shore
  const shore = new THREE.Mesh(
    new THREE.RingGeometry(58, 72, 80),
    new THREE.MeshStandardMaterial({ color: 0xc6b588, roughness: 0.95 })
  );
  shore.rotation.x = -Math.PI/2;
  shore.position.set(8, 0.05, -8);
  world.add(shore);

  // Main island
  const island = new THREE.Mesh(
    new THREE.CircleGeometry(124, 80),
    new THREE.MeshStandardMaterial({ color: 0x4a7638, roughness: 0.93 })
  );
  island.rotation.x = -Math.PI/2;
  island.position.set(-24, 0, -92);
  island.receiveShadow = true;
  world.add(island);

  // Island trees
  for (let i = 0; i < 52; i++) {
    const angle  = i * 1.36;
    const radius = 28 + (i % 9) * 8.5;
    const tree = createTree();
    tree.position.set(-24 + Math.cos(angle)*radius, 0, -92 + Math.sin(angle)*radius);
    tree.scale.setScalar(0.62 + (i % 5) * 0.14);
    world.add(tree);
  }

  // Mountain ridge (south)
  for (let i = 0; i < 13; i++) {
    const h  = 24 + (i % 4) * 16;
    const r  = 17 + i * 1.6;
    const col = [0x547038, 0x48612e, 0x637a48][i % 3];
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(r, h, 7 + (i%3)),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.95 })
    );
    hill.position.set(-96 + i*18, h*0.36, -148 + Math.sin(i*0.9)*26);
    hill.rotation.y = i * 0.72;
    hill.castShadow = true;
    hill.receiveShadow = true;
    world.add(hill);
    if (h > 40) {
      const snow = new THREE.Mesh(
        new THREE.ConeGeometry(r*0.27, h*0.24, 7),
        new THREE.MeshStandardMaterial({ color: 0xeef4f8, roughness: 0.88 })
      );
      snow.position.set(hill.position.x, hill.position.y + h*0.4, hill.position.z);
      snow.rotation.y = hill.rotation.y;
      world.add(snow);
    }
  }

  // Fire zone
  fireSystem = createFire();
  fireSystem.position.set(-82, 1, -44);
  world.add(fireSystem);

  // Burnt trees around fire
  for (let i = 0; i < 9; i++) {
    const a = i * 0.698;
    const r = 13 + i * 2.2;
    const bt = createBurntTree();
    bt.position.set(-82 + Math.cos(a)*r, 0, -44 + Math.sin(a)*r);
    world.add(bt);
  }

  // Runway
  const rwMat = new THREE.MeshStandardMaterial({ color: 0x32302a, roughness: 0.84 });
  const runway = new THREE.Mesh(new THREE.BoxGeometry(92, 0.12, 11), rwMat);
  runway.position.set(-108, 0.08, 88);
  runway.rotation.y = -0.28;
  runway.receiveShadow = true;
  world.add(runway);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, 0.14, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xfefefe, roughness: 0.85 })
    );
    const t = (i - 3.5) * 10;
    s.position.set(-108 + Math.cos(-0.28)*t, 0.1, 88 + Math.sin(-0.28)*t);
    s.rotation.y = -0.28;
    world.add(s);
  }

  // Control tower
  const towerMat  = new THREE.MeshStandardMaterial({ color: 0xd0c8b2, roughness: 0.74 });
  const towerBase = new THREE.Mesh(new THREE.BoxGeometry(3.2, 20, 3.2), towerMat);
  towerBase.position.set(-78, 10, 80);
  towerBase.castShadow = true;
  world.add(towerBase);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(5.4, 4.2, 5.4),
    new THREE.MeshStandardMaterial({ color: 0xc2ba9a, roughness: 0.7 }));
  cab.position.set(-78, 22, 80);
  world.add(cab);
  const towerRoof = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x887c5c, roughness: 0.65 }));
  towerRoof.position.set(-78, 24.5, 80);
  world.add(towerRoof);

  // A few trees near runway
  [-136, -130, -124].forEach((x, i) => {
    const t = createTree();
    t.position.set(x, 0, 90 + (i%2)*12);
    t.scale.setScalar(0.7 + i*0.06);
    world.add(t);
  });
}

function createTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.72, 4.5, 7),
    new THREE.MeshStandardMaterial({ color: 0x5a3c24, roughness: 0.93 })
  );
  trunk.position.y = 2.25;
  trunk.castShadow = true;

  const bot = new THREE.Mesh(
    new THREE.ConeGeometry(3.9, 5.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c5230, roughness: 0.86 })
  );
  bot.position.y = 6.8;
  bot.castShadow = true;

  const top = new THREE.Mesh(
    new THREE.ConeGeometry(2.5, 4.6, 7),
    new THREE.MeshStandardMaterial({ color: 0x246640, roughness: 0.83 })
  );
  top.position.y = 10.4;
  top.castShadow = true;

  g.add(trunk, bot, top);
  return g;
}

function createBurntTree() {
  const g    = new THREE.Group();
  const mat  = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.97 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.48, 3.5, 5), mat);
  trunk.position.y = 1.75;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.14, 1.5+i*0.4, 4), mat);
    b.position.set(Math.cos(i*2.1)*0.55, 2.5+i*0.55, Math.sin(i*2.1)*0.55);
    b.rotation.z = (Math.random()-0.5)*0.9;
    g.add(b);
  }
  return g;
}

function createFire() {
  const g   = new THREE.Group();
  const f1  = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9 });
  const f2  = new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.82 });
  const f3  = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.75 });
  const sm  = new THREE.MeshBasicMaterial({ color: 0x26292c, transparent: true, opacity: 0.42, depthWrite: false });
  const fms = [f1, f2, f3];
  for (let i = 0; i < 24; i++) {
    const fl = new THREE.Mesh(
      new THREE.ConeGeometry(0.7+Math.random()*0.9, 4+Math.random()*4.5, 8),
      fms[i%3]
    );
    fl.position.set((Math.random()-0.5)*24, 2.2, (Math.random()-0.5)*17);
    fl.userData = { phase: Math.random()*Math.PI*2, baseY: fl.position.y };
    g.add(fl);
  }
  for (let i = 0; i < 20; i++) {
    const sk = new THREE.Mesh(
      new THREE.SphereGeometry(2.4+Math.random()*3.2, 10, 7),
      sm.clone()
    );
    sk.position.set((Math.random()-0.5)*28, 8+Math.random()*30, (Math.random()-0.5)*22);
    sk.userData = { phase: Math.random()*Math.PI*2, drift: Math.random()*0.8+0.2 };
    g.add(sk);
  }
  return g;
}

function buildAircraft() {
  aircraft = new THREE.Group();
  aircraft.visible = false;
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf6c345, roughness: 0.45, metalness: 0.12 });
  const red    = new THREE.MeshStandardMaterial({ color: 0xd43f2f, roughness: 0.44, metalness: 0.08 });
  const dark   = new THREE.MeshStandardMaterial({ color: 0x16242c, roughness: 0.5 });
  const fuse   = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.9, 13, 20), yellow);
  fuse.rotation.z = Math.PI/2;
  const nose   = new THREE.Mesh(new THREE.ConeGeometry(1.42, 3, 20), red);
  nose.rotation.z = -Math.PI/2; nose.position.x = 8;
  const wing   = new THREE.Mesh(new THREE.BoxGeometry(3, 0.35, 22), yellow);
  wing.position.set(0.2, 0.2, 0);
  const tail   = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.28, 8), red);
  tail.position.set(-5.4, 1.15, 0);
  const fin    = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4.2, 0.3), red);
  fin.position.set(-5.6, 2.8, 0);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.45, 18, 12), dark);
  canopy.scale.set(1.7, 0.62, 0.82); canopy.position.set(3.1, 1.25, 0);
  aircraft.add(fuse, nose, wing, tail, fin, canopy);
  world.add(aircraft);
}

function buildCockpit() {
  cockpit = new THREE.Group();
  camera.add(cockpit);
  scene.add(camera);

  if (USE_IMAGE_COCKPIT) {
    // Mode image : overlay PNG + hélice basse visible sous le cadre
    const overlay = document.getElementById('cockpitOverlay');
    if (overlay) overlay.hidden = false;

    // Hélice image — rotation CSS, aucune géométrie 3D
    const propWrap = document.getElementById('propellerWrap');
    if (propWrap) propWrap.hidden = false;
    propeller = null;
  } else {
    // Mode 3D (revert) : cadre géométrique complet
    const glass  = new THREE.MeshBasicMaterial({ color: 0xc9f4ff, transparent: true, opacity: 0.12, depthWrite: false });
    const frame  = new THREE.MeshStandardMaterial({ color: 0x162228, roughness: 0.58, metalness: 0.18 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf4c247, roughness: 0.5 });
    const red    = new THREE.MeshStandardMaterial({ color: 0xd34535, roughness: 0.45 });

    const nose = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 10), yellow);
    nose.position.set(0, -1.8, -10.4);
    cockpit.add(nose);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.54, 10.2), red);
    stripe.position.set(0, -1.49, -10.4);
    cockpit.add(stripe);

    const dash = new THREE.Mesh(new THREE.BoxGeometry(8.8, 1.15, 1.2), frame);
    dash.position.set(0, -2.25, -5.2);
    cockpit.add(dash);

    const windscreen = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 4.4), glass);
    windscreen.position.set(0, 0.55, -4.65);
    cockpit.add(windscreen);

    for (const x of [-3.8, 0, 3.8]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.7, 0.18), frame);
      pillar.position.set(x, 0.48, -4.55);
      cockpit.add(pillar);
    }

    for (let i = 0; i < 5; i++) {
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 20), frame);
      dial.rotation.x = Math.PI / 2;
      dial.position.set(-2.4 + i * 1.2, -2.18, -4.55);
      cockpit.add(dial);
    }

    propeller = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 4.6, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x1d2529, transparent: true, opacity: 0.36 })
    );
    propeller.position.set(0, -1.1, -15.7);
    cockpit.add(propeller);
  }

  // Ruban d'eau — dans les deux modes
  waterRibbon = new THREE.Group();
  waterRibbon.visible = false;
  for (let i = 0; i < 18; i++) {
    const drop = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 2.6),
      new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.44 })
    );
    drop.position.set((Math.random() - 0.5) * 18, -3 - Math.random() * 7, -14 - Math.random() * 8);
    drop.userData = { speed: 10 + Math.random() * 14 };
    waterRibbon.add(drop);
  }
  camera.add(waterRibbon);
}

function createPath(name, curve, color) {
  const group = new THREE.Group();
  const rings  = [];
  const points = curve.getPoints(120);

  // Path line
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 })
  );
  group.add(line);

  // Ring materials — MeshBasicMaterial avoids emissive/tonemapping artefacts
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 });
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22 });

  for (let i = 0; i < 6; i++) {
    const t       = i / 5;
    const pos     = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const quat    = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), tangent);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, 0.22, 14, 64), ringMat.clone());
    ring.position.copy(pos);
    ring.quaternion.copy(quat);
    ring.userData = { name, index: i, hit: false, baseScale: 1 };
    group.add(ring);
    rings.push(ring);

    // Outer glow torus
    const glow = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS+0.55, 0.12, 8, 64), glowMat.clone());
    glow.position.copy(pos);
    glow.quaternion.copy(quat);
    glow.userData = { isGlow: true, ringIdx: i };
    group.add(glow);
  }

  world.add(group);
  return { curve, group, rings, line };
}

function resetMission() {
  state.position.set(-115, 24, 100);
  state.pitch = 0; state.roll = 0;
  // Aim toward the first water ring
  const r0 = paths.water.rings[0].position;
  const dx = r0.x - state.position.x;
  const dz = r0.z - state.position.z;
  state.yaw = Math.atan2(-dx, -dz);
  state.targetPitch = 0; state.targetRoll = 0; state.targetRudder = 0;
  state.rudder = 0;
  state.speed  = BASE_SPEED;
  state.mission = "water"; state.activeRing = 0; state.score = 0;
  state.tankFull = false; state.dropArmed = false;
  state.stickNeutral = null; state.centerStickRequested = true;
  for (const path of Object.values(paths)) {
    path.rings.forEach((ring) => {
      ring.userData.hit = false;
      ring.visible = true;
      ring.scale.setScalar(1);
    });
    path.group.children.forEach((obj) => {
      if (obj.userData.isGlow) obj.visible = true;
    });
  }
  fireSystem.visible = true;
  fireSystem.scale.setScalar(1);
  if (ui.missionOverlay) ui.missionOverlay.hidden = true;
  updateMissionVisuals();
  setStatus("Simulation clavier prete");
}

// Wire the overlay replay button after DOM is ready
if (ui.overlayReset) ui.overlayReset.addEventListener("click", resetMission);

function setStatus(msg, isError = false) {
  ui.status.textContent = msg;
  ui.status.style.color = isError ? "var(--red)" : "var(--text)";
}

function updateMissionVisuals() {
  paths.water.group.visible = state.mission === "water";
  paths.fire.group.visible  = state.mission === "fire" || state.mission === "done";

  const isFire = state.mission === "fire";
  const label  = state.mission === "water" ? "Ecoper sur le lac"
    : state.mission === "fire" ? "Larguer sur le feu" : "Feu maitrise !";
  ui.missionLabel.textContent = label;
  ui.tankLabel.textContent    = state.tankFull ? "Plein" : "Vide";
  ui.ringLabel.textContent    = `${Math.min(state.activeRing, 6)} / 6`;
  ui.scoreLabel.textContent   = String(state.score);

  // Ring-dot progress
  if (ui.ringDots) {
    const dots = ui.ringDots.querySelectorAll("i");
    dots.forEach((dot, i) => {
      dot.className = i < state.activeRing ? "done" : i === state.activeRing ? "active" : "";
    });
  }
  // Chip color matches mission
  if (ui.ringsChip) {
    ui.ringsChip.dataset.mission = isFire ? "fire" : "water";
  }
}

function nextMission() {
  if (state.mission === "water") {
    state.mission = "fire"; state.activeRing = 0; state.tankFull = true;
    setStatus("Reservoir plein ! Cap sur le feu — anneaux rouges au nord-est.");
  } else if (state.mission === "fire") {
    state.mission = "done"; state.activeRing = 6;
    fireSystem.visible = false;
    setStatus("Mission terminee !");
    if (ui.missionOverlay) {
      ui.finalScore.textContent = `Score final : ${state.score}`;
      ui.missionOverlay.hidden = false;
    }
  }
  updateMissionVisuals();
}

function updateFlight(dt) {
  updateKeyboardTargets();
  state.pitch  = THREE.MathUtils.lerp(state.pitch,  state.targetPitch,  0.07);
  state.roll   = THREE.MathUtils.lerp(state.roll,   state.targetRoll,   0.08);
  state.rudder = THREE.MathUtils.lerp(state.rudder, state.targetRudder, 0.12);

  state.yaw -= state.rudder * TURN_RATE * dt;
  const speedTarget = BASE_SPEED + Math.max(0, -state.pitch) * DIVE_SPEED_GAIN;
  state.speed = THREE.MathUtils.lerp(state.speed, speedTarget, 0.025);

  camera.rotation.order = "YXZ";
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch * 0.74;
  camera.rotation.z =  state.roll  * 0.76;
  camera.getWorldDirection(forwardDirection);
  forwardDirection.y = 0;
  forwardDirection.normalize();

  state.position.addScaledVector(forwardDirection, state.speed * dt);
  state.position.y += Math.sin(state.pitch) * CLIMB_RATE * dt;
  state.position.y  = THREE.MathUtils.clamp(state.position.y, 5, 86);
  camera.position.copy(state.position);

  aircraft.position.copy(state.position);
  aircraft.rotation.set(state.pitch, state.yaw + Math.PI/2, state.roll, "YXZ");
}

function updateKeyboardTargets() {
  if (state.connected) return;
  const pitchInput = (state.keyboard.has("ArrowUp")    || state.keyboard.has("KeyW") || state.keyboard.has("KeyZ") ? 1 : 0)
                   - (state.keyboard.has("ArrowDown")   || state.keyboard.has("KeyS") ? 1 : 0);
  const turnInput  = (state.keyboard.has("ArrowRight")  || state.keyboard.has("KeyD") || state.keyboard.has("KeyE") ? 1 : 0)
                   - (state.keyboard.has("ArrowLeft")   || state.keyboard.has("KeyQ") || state.keyboard.has("KeyA") ? 1 : 0);
  state.targetPitch  = THREE.MathUtils.degToRad(pitchInput * MAX_PITCH);
  state.targetRoll   = THREE.MathUtils.degToRad(-turnInput * MAX_ROLL);
  state.targetRudder = turnInput * MAX_RUDDER;
}

function updateRings(dt) {
  const activePath = paths[state.mission];
  if (!activePath) return;
  const ring = activePath.rings[state.activeRing];
  if (!ring) return;

  ring.rotateZ(dt * 1.4);
  const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.055;
  ring.scale.setScalar(pulse);

  // Sync glow torus
  activePath.group.children.forEach((obj) => {
    if (obj.userData.isGlow && obj.userData.ringIdx === state.activeRing) {
      obj.scale.setScalar(pulse);
      obj.quaternion.copy(ring.quaternion);
    }
  });

  if (ring.position.distanceTo(state.position) < RING_HIT_RADIUS) {
    ring.userData.hit = true;
    ring.visible = false;
    activePath.group.children.forEach((obj) => {
      if (obj.userData.isGlow && obj.userData.ringIdx === state.activeRing) obj.visible = false;
    });
    state.score    += state.mission === "water" ? 120 : 180;
    state.activeRing += 1;
    setStatus(state.mission === "water" ? "Anneau d'ecopage valide !" : "Trajectoire de largage validee !");
    if (state.activeRing >= activePath.rings.length) nextMission();
    else updateMissionVisuals();
  }
}

function updateWaterDrop(dt) {
  const dropping = state.mission === "fire" && (state.keyboard.has("Space") || state.dropArmed);
  waterRibbon.visible = dropping && state.tankFull;

  if (waterRibbon.visible) {
    waterRibbon.children.forEach((drop) => {
      drop.position.y -= drop.userData.speed * dt;
      drop.position.z += 10 * dt;
      if (drop.position.y < -12) {
        drop.position.y = -3;
        drop.position.z = -14 - Math.random() * 8;
        drop.position.x = (Math.random() - 0.5) * 18;
      }
    });
  }

  const fireDistance = state.position.distanceTo(new THREE.Vector3(-82, 18, -44));
  if (waterRibbon.visible && fireDistance < 30) {
    state.score += Math.round(30 * dt);
    fireSystem.scale.multiplyScalar(1 - dt * 0.08);
    if (fireSystem.scale.x < 0.06) fireSystem.visible = false;
  }
}

function updateFire(dt) {
  const t = performance.now() * 0.001;
  fireSystem.children.forEach((item, index) => {
    if (index < 24) {
      item.scale.set(1 + Math.sin(t*8 + item.userData.phase)*0.24, 1 + Math.cos(t*7 + item.userData.phase)*0.2, 1);
      item.rotation.y += dt * 1.8;
    } else {
      item.position.x += Math.sin(t + item.userData.phase) * dt * item.userData.drift;
      item.position.y += dt * 0.65;
      if (item.position.y > 36) item.position.y = 8;
    }
  });
}

function updateHud() {
  const pitchDeg = Math.round(THREE.MathUtils.radToDeg(state.pitch));
  const rollDeg  = Math.round(THREE.MathUtils.radToDeg(state.roll));
  const heading  = Math.round(THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(-state.yaw), 360));
  ui.altitudeLabel.textContent = `${Math.round(state.position.y * 4)} m`;
  ui.speedLabel.textContent    = `${Math.round(state.speed * SPEED_DISPLAY_SCALE)} km/h`;
  ui.headingLabel.textContent  = `${heading}°`;
  ui.rudderLabel.textContent   = `${Math.round(state.rudder / MAX_RUDDER * 100)}%`;
  ui.pitchLabel.textContent    = `${pitchDeg}°`;
  ui.rollLabel.textContent     = `${rollDeg}°`;
  ui.attitudeBar.style.transform = `translateY(${pitchDeg * 0.7}px) rotate(${-rollDeg}deg)`;
  ui.scoreLabel.textContent    = String(state.score);

  // Bearing to next ring
  const activePath = paths[state.mission];
  const ring       = activePath?.rings[state.activeRing];
  if (ring && ui.compassNeedle && ui.ringDist) {
    const dx = ring.position.x - state.position.x;
    const dz = ring.position.z - state.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    const len  = dist || 1;
    const tx   = dx / len, tz = dz / len;
    // forward and right vectors in XZ
    const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
    const rx =  Math.cos(state.yaw), rz = -Math.sin(state.yaw);
    const fwdDot = tx*fx + tz*fz;
    const rgtDot = tx*rx + tz*rz;
    const bearingDeg = THREE.MathUtils.radToDeg(Math.atan2(rgtDot, fwdDot));
    ui.compassNeedle.style.transform = `translateX(-50%) rotate(${bearingDeg}deg)`;
    ui.ringDist.textContent = dist > 999 ? `${(dist*4/1000).toFixed(1)} km` : `${Math.round(dist*4)} m`;
  }
}

function resize() {
  const w = canvas.clientWidth  || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}

function animate() {
  const now = performance.now();
  const dt  = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;

  resize();
  updateFlight(dt);
  updateRings(dt);
  updateWaterDrop(dt);
  updateFire(dt);
  updateHud();
  if (propeller) propeller.rotation.z += dt * 12;

  // Sky follows camera
  if (skyDome) skyDome.position.copy(camera.position);

  // Gentle cloud drift
  const t = now * 0.0001;
  cloudMeshes.forEach((c, i) => {
    c.position.x = c.userData.baseX + Math.sin(t * (0.5 + i*0.07)) * 6;
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// --- Microbit telemetry ---
function getStickAngles(data) {
  const nativePitch = Number(data.pitch);
  const nativeRoll  = Number(data.roll);
  if (Number.isFinite(nativePitch) && Number.isFinite(nativeRoll)) {
    if (!state.stickNeutral || state.centerStickRequested) {
      state.stickNeutral = { pitch: nativePitch, roll: nativeRoll };
      state.centerStickRequested = false;
    }
    return {
      pitch: THREE.MathUtils.clamp(nativePitch - state.stickNeutral.pitch, -MAX_PITCH, MAX_PITCH),
      roll:  THREE.MathUtils.clamp(nativeRoll  - state.stickNeutral.roll,  -MAX_ROLL,  MAX_ROLL),
    };
  }
  const x = Number(data.x)||0, y = Number(data.y)||0, z = Number(data.z)||0;
  const inPlane  = Math.max(Math.hypot(x, y), 1);
  const rawPitch = THREE.MathUtils.radToDeg(Math.atan2(z, inPlane));
  const rawRoll  = THREE.MathUtils.radToDeg(Math.atan2(x, y));
  if (!state.stickNeutral || state.centerStickRequested) {
    state.stickNeutral = { pitch: rawPitch, roll: rawRoll };
    state.centerStickRequested = false;
  }
  return {
    pitch: THREE.MathUtils.clamp(rawPitch - state.stickNeutral.pitch, -MAX_PITCH, MAX_PITCH),
    roll:  THREE.MathUtils.clamp(rawRoll  - state.stickNeutral.roll,  -MAX_ROLL,  MAX_ROLL),
  };
}

function applyTelemetry(data) {
  const angles = getStickAngles(data);
  state.targetPitch  = THREE.MathUtils.degToRad(angles.pitch);
  state.targetRoll   = THREE.MathUtils.degToRad(-angles.roll);
  state.targetRudder = THREE.MathUtils.clamp(
    angles.roll / MAX_ROLL * MICROBIT_TURN_MIX,
    -MAX_RUDDER, MAX_RUDDER
  );
  state.dropArmed = Math.abs((Number(data.z)||0) - 1024) > 520;
}

function parseIncomingLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    applyTelemetry(JSON.parse(trimmed));
    setStatus("Flux micro:bit actif");
  } catch {
    setStatus(`Trame ignoree: ${trimmed}`, true);
  }
}

function handleSerialChunk(value) {
  state.buffer += decoder.decode(value, { stream: true });
  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() || "";
  lines.forEach(parseIncomingLine);
}

async function connectMicrobit() {
  if (!navigator.serial) {
    setStatus("Web Serial non disponible. Utilise Chrome ou Edge.", true);
    return;
  }
  try {
    setStatus("Selection du port USB...");
    ui.connectButton.disabled = true;
    state.port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x0d28 }, { usbVendorId: 0x1366 }],
    });
    await state.port.open({ baudRate: 115200 });
    state.connected = true; state.reading = true;
    state.buffer = ""; state.stickNeutral = null; state.centerStickRequested = true;
    ui.disconnectButton.disabled = false;
    setStatus("Connecte en USB. En attente de trames...");
    state.reader = state.port.readable.getReader();
    while (state.reading) {
      const { value, done } = await state.reader.read();
      if (done) break;
      if (value) handleSerialChunk(value);
    }
  } catch (error) {
    state.connected = false;
    ui.connectButton.disabled = false;
    ui.disconnectButton.disabled = true;
    setStatus(error?.name === "NotFoundError" ? "Selection USB annulee" : error?.message || "Connexion impossible", true);
  }
}

async function disconnectMicrobit() {
  state.reading = false;
  try { await state.reader?.cancel(); }    catch {}
  try { state.reader?.releaseLock(); }     catch {}
  try { await state.port?.close(); }       catch {}
  state.port = null; state.reader = null; state.connected = false; state.buffer = "";
  ui.connectButton.disabled = false;
  ui.disconnectButton.disabled = true;
  setStatus("Deconnecte. Simulation clavier active.");
}

window.addEventListener("keydown", (e) => {
  state.keyboard.add(e.code);
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","KeyQ","KeyD","KeyA","KeyE"].includes(e.code))
    e.preventDefault();
});
window.addEventListener("keyup",    (e) => state.keyboard.delete(e.code));
ui.connectButton.addEventListener("click",    connectMicrobit);
ui.disconnectButton.addEventListener("click", disconnectMicrobit);
ui.resetButton.addEventListener("click",      resetMission);
window.addEventListener("resize", resize);
