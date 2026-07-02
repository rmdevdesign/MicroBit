import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";

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
scene.fog   = new THREE.FogExp2(0xc9dfee, 0.0026);

const camera  = new THREE.PerspectiveCamera(67, 1, 0.1, 1400);
const decoder = new TextDecoder();

const world = new THREE.Group();
scene.add(world);

// --- Lighting ---
const SUN_DIR = new THREE.Vector3(-100, 220, 80).normalize();
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
    uniforms: { uSunDir: { value: SUN_DIR.clone() } },
    vertexShader: `
      varying vec3 vPos;
      void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      varying vec3 vPos;
      void main() {
        vec3 dir = normalize(vPos);
        float elev = clamp(dir.y * 1.12 + 0.12, 0.0, 1.0);
        vec3 horizon = vec3(0.80, 0.88, 0.94);
        vec3 zenith  = vec3(0.16, 0.40, 0.76);
        vec3 col = mix(horizon, zenith, pow(elev, 0.62));
        float sunD = max(dot(dir, uSunDir), 0.0);
        col += vec3(1.0, 0.97, 0.86) * smoothstep(0.9993, 0.9998, sunD) * 2.4;
        col += vec3(1.0, 0.88, 0.62) * pow(sunD, 32.0) * 0.40;
        col += vec3(1.0, 0.86, 0.62) * pow(sunD, 5.0)  * 0.10;
        col  = mix(col, vec3(0.87, 0.90, 0.92), (1.0 - elev) * 0.25);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  skyDome = new THREE.Mesh(geo, mat);
  skyDome.renderOrder = -1;
  scene.add(skyDome);
}

// --- Clouds (soft billboard sprites) ---
const cloudMeshes = [];
function makeCloudTexture() {
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = 128;
  const ctx  = cnv.getContext("2d");
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0,    "rgba(255,255,255,0.95)");
  grad.addColorStop(0.45, "rgba(252,254,255,0.60)");
  grad.addColorStop(1,    "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cnv);
}

function buildClouds() {
  const tex = makeCloudTexture();
  [
    [-160, 76, -70], [110, 90, -130], [220, 72, 30], [-230, 82, 110],
    [70,  92, 180],  [-90, 78, -210], [170, 86, -88], [-200, 74, -150],
    [140, 80,  90],  [-50, 95,  240],
  ].forEach(([x, y, z]) => {
    const cloud = new THREE.Group();
    cloud.position.set(x, y, z);
    const s = 0.8 + Math.random() * 0.9;
    const puffs = 7 + Math.floor(Math.random() * 4);
    for (let j = 0; j < puffs; j++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        opacity: 0.45 + Math.random() * 0.35,
      });
      const puff = new THREE.Sprite(mat);
      puff.position.set((Math.random()-0.5)*40*s, (Math.random()-0.5)*7, (Math.random()-0.5)*18*s);
      const ps = (16 + Math.random() * 18) * s;
      puff.scale.set(ps * (1.3 + Math.random() * 0.5), ps * 0.62, 1);
      cloud.add(puff);
    }
    cloud.userData.baseX = x;
    cloudMeshes.push(cloud);
    scene.add(cloud);
  });
}

// --- Procedural terrain helpers ---
function hashNoise(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hashNoise(ix, iz),     b = hashNoise(ix + 1, iz);
  const c = hashNoise(ix, iz + 1), d = hashNoise(ix + 1, iz + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, z) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 5; i++) { sum += amp * (valueNoise(x * f, z * f) * 2 - 1); amp *= 0.5; f *= 2.03; }
  return sum;
}
function ridgedNoise(x, z) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { sum += amp * (1 - Math.abs(valueNoise(x * f, z * f) * 2 - 1)); amp *= 0.5; f *= 2.11; }
  return sum;
}
const sstep = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Landmass = union of soft blobs (main island, lake plateau, runway peninsula, links)
const LAND_BLOBS = [
  [-24, -92, 165], [8, -8, 115], [-108, 88, 95], [-64, 34, 100], [85, -55, 105],
];
const RW_ANGLE = -0.28;
const RW_DIR   = { x: Math.cos(RW_ANGLE), z: -Math.sin(RW_ANGLE) };

function heightAt(x, z) {
  let land = 0;
  for (const [bx, bz, br] of LAND_BLOBS) {
    const d = Math.hypot(x - bx, z - bz);
    land = Math.max(land, 1 - sstep(br * 0.5, br, d));
  }
  let h = land * (1.8 + fbm(x * 0.018, z * 0.018) * 4.2 + fbm(x * 0.06, z * 0.06) * 0.9)
        - (1 - land) * 4.5;

  // Southern mountain ridge — kept south of the flight paths (z <= ~-110)
  const ridgeZ = -150 + Math.sin(x * 0.04) * 14;
  const taper  = Math.max(0, 1 - Math.abs(x + 16) / 170);
  const ridge  = Math.exp(-((z - ridgeZ) ** 2) / (2 * 32 * 32)) * taper;
  h += ridge * 55 * (0.45 + 0.65 * ridgedNoise(x * 0.025, z * 0.025)) * Math.min(1, land * 1.5);

  // Lake basin
  const dLake = Math.hypot(x - 8, z + 8);
  h = THREE.MathUtils.lerp(-2.4, h, sstep(50, 70, dLake));

  // Fire clearing
  const dFire = Math.hypot(x + 82, z + 44);
  h = THREE.MathUtils.lerp(0.6, h, sstep(18, 34, dFire));

  // Runway strip + control tower flattening
  const rx = x + 108, rz = z - 88;
  const u  =  rx * RW_DIR.x + rz * RW_DIR.z;
  const v  = -rx * RW_DIR.z + rz * RW_DIR.x;
  const flat = (1 - sstep(48, 62, Math.abs(u))) * (1 - sstep(8, 20, Math.abs(v)));
  h = THREE.MathUtils.lerp(h, 0.5, flat);
  const dTower = Math.hypot(x + 78, z - 80);
  h = THREE.MathUtils.lerp(0.5, h, sstep(10, 22, dTower));
  return h;
}

// --- Animated water ---
const waterMaterials = [];
function createWaterMaterial(deepHex, shallowHex) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime:    { value: 0 },
        uDeep:    { value: new THREE.Color(deepHex) },
        uShallow: { value: new THREE.Color(shallowHex) },
        uSunDir:  { value: SUN_DIR.clone() },
      },
    ]),
    vertexShader: `
      varying vec3 vWorld;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorld = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSunDir;
      varying vec3 vWorld;
      #include <common>
      #include <fog_pars_fragment>
      float waveH(vec2 p, float t) {
        return sin(p.x * 0.14 + t * 1.1) * 0.5
             + sin(p.y * 0.17 - t * 0.9) * 0.4
             + sin((p.x + p.y) * 0.09 + t * 0.65) * 0.6
             + sin(p.x * 0.05 - p.y * 0.062 + t * 0.42) * 0.9;
      }
      void main() {
        vec2  p  = vWorld.xz;
        float t  = uTime;
        float h0 = waveH(p, t);
        vec3  n  = normalize(vec3(h0 - waveH(p + vec2(0.4, 0.0), t), 1.15, h0 - waveH(p + vec2(0.0, 0.4), t)));
        vec3  viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
        vec3  col  = mix(uDeep, uShallow, clamp(0.25 + fres, 0.0, 1.0) * 0.55);
        col = mix(col, vec3(0.74, 0.86, 0.95), fres * 0.6);
        float spec = pow(max(dot(reflect(-uSunDir, n), viewDir), 0.0), 160.0);
        col += vec3(1.0, 0.95, 0.8) * spec * 1.5;
        gl_FragColor = vec4(col, 0.93);
        #include <fog_fragment>
      }
    `,
  });
  waterMaterials.push(mat);
  return mat;
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


// Fire particle colour ramps (declared before the first animate() frame)
const FLAME_A = new THREE.Color(0xfff3b0);
const FLAME_B = new THREE.Color(0xff7a1e);
const FLAME_C = new THREE.Color(0xb01e00);
const SMOKE_A = new THREE.Color(0x26282a);
const SMOKE_B = new THREE.Color(0x6f7276);

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

  // Terrain — heightmap displaced plane, painted per-vertex (sand/grass/rock/snow)
  const terrainGeo = new THREE.PlaneGeometry(1500, 1500, 240, 240);
  terrainGeo.rotateX(-Math.PI / 2);
  const tp = terrainGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, heightAt(tp.getX(i), tp.getZ(i)));
  terrainGeo.computeVertexNormals();
  paintTerrain(terrainGeo);
  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  );
  terrain.receiveShadow = true;
  world.add(terrain);

  // Ocean + lake (animated shader water)
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), createWaterMaterial(0x0d4a6e, 0x2f9dc0));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.75;
  world.add(ocean);

  const lake = new THREE.Mesh(new THREE.CircleGeometry(66, 72), createWaterMaterial(0x156f92, 0x49c2dc));
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(8, 0.12, -8);
  world.add(lake);

  // Distant hazy islands on the horizon
  [
    [-520, 260, 110, 30], [420, -520, 150, 42], [560, 140, 120, 26],
    [-300, -620, 170, 48], [160, 560, 130, 24],
  ].forEach(([x, z, r, h]) => {
    const isle = new THREE.Mesh(
      new THREE.ConeGeometry(r, h, 7),
      new THREE.MeshBasicMaterial({ color: 0x93aec2 })
    );
    isle.position.set(x, h * 0.28 - 2, z);
    world.add(isle);
  });

  // Fire zone
  fireSystem = createFire();
  fireSystem.position.set(-82, 0.7, -44);
  world.add(fireSystem);

  // Burnt trees around fire
  for (let i = 0; i < 9; i++) {
    const a = i * 0.698;
    const r = 13 + i * 2.2;
    const bt = createBurntTree();
    bt.position.set(-82 + Math.cos(a)*r, 0.55, -44 + Math.sin(a)*r);
    world.add(bt);
  }

  // Runway
  const rwMat = new THREE.MeshStandardMaterial({ color: 0x32302a, roughness: 0.84 });
  const runway = new THREE.Mesh(new THREE.BoxGeometry(92, 0.12, 11), rwMat);
  runway.position.set(-108, 0.62, 88);
  runway.rotation.y = RW_ANGLE;
  runway.receiveShadow = true;
  world.add(runway);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, 0.14, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xfefefe, roughness: 0.85 })
    );
    const t = (i - 3.5) * 10;
    s.position.set(-108 + RW_DIR.x * t, 0.68, 88 + RW_DIR.z * t);
    s.rotation.y = RW_ANGLE;
    world.add(s);
  }

  // Control tower
  const towerMat  = new THREE.MeshStandardMaterial({ color: 0xd0c8b2, roughness: 0.74 });
  const towerBase = new THREE.Mesh(new THREE.BoxGeometry(3.2, 20, 3.2), towerMat);
  towerBase.position.set(-78, 10.5, 80);
  towerBase.castShadow = true;
  world.add(towerBase);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(5.4, 4.2, 5.4),
    new THREE.MeshStandardMaterial({ color: 0xc2ba9a, roughness: 0.7 }));
  cab.position.set(-78, 22.5, 80);
  world.add(cab);
  const towerRoof = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x887c5c, roughness: 0.65 }));
  towerRoof.position.set(-78, 25, 80);
  world.add(towerRoof);

  scatterVegetation();
  scatterRocks();
}

function paintTerrain(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const grassA = new THREE.Color(0x4f7d38), grassB = new THREE.Color(0x7da35c);
  const sand   = new THREE.Color(0xd6c391), rock   = new THREE.Color(0x7d7669);
  const snow   = new THREE.Color(0xf2f6f8), scorch = new THREE.Color(0x33291f);
  const seabed = new THREE.Color(0x35635c);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nor.getY(i);
    // meadow patches + fine variation
    c.copy(grassA).lerp(grassB, valueNoise(x * 0.008 + 9, z * 0.008 + 3));
    c.multiplyScalar(0.9 + valueNoise(x * 0.16, z * 0.16) * 0.2);
    // rock on steep slopes and high altitude
    const rockAmt = (1 - sstep(0.62, 0.85, ny)) + sstep(18, 30, y) * 0.7;
    c.lerp(rock, THREE.MathUtils.clamp(rockAmt, 0, 1));
    // snow caps (noisy snowline)
    c.lerp(snow, sstep(30, 38, y + fbm(x * 0.1, z * 0.1) * 5));
    // beaches near the waterline, dark seabed below
    c.lerp(sand, 1 - sstep(0.15, 1.1, y));
    c.lerp(seabed, sstep(-0.6, -2.5, y) * 0.7);
    // scorched ground around the fire
    const dFire = Math.hypot(x + 82, z + 44);
    c.lerp(scorch, (1 - sstep(14, 32, dFire)) * 0.85);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function coloredGeometry(geo, hex) {
  if (geo.index) geo = geo.toNonIndexed(); // mergeGeometries needs uniform indexing
  const col = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i*3] = col.r; arr[i*3+1] = col.g; arr[i*3+2] = col.b; }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

function buildLeafyGeometry(variant) {
  if (variant === 1) {
    // Larger, rounder canopy
    return BufferGeometryUtils.mergeGeometries([
      coloredGeometry(new THREE.CylinderGeometry(0.42, 0.72, 3.6, 8).translate(0, 1.8, 0), 0x6b4a2a),
      coloredGeometry(new THREE.IcosahedronGeometry(3.3, 1).scale(1.1, 0.9, 1.1).translate(0, 6.0, 0), 0x467428),
      coloredGeometry(new THREE.IcosahedronGeometry(2.2, 1).translate(2.0, 7.2, 0.9),   0x5d8a3a),
      coloredGeometry(new THREE.IcosahedronGeometry(2.0, 1).translate(-1.9, 7.0, -0.8), 0x527e2e),
      coloredGeometry(new THREE.IcosahedronGeometry(1.8, 1).translate(0.3, 8.6, -0.4),  0x649347),
    ]);
  }
  return BufferGeometryUtils.mergeGeometries([
    coloredGeometry(new THREE.CylinderGeometry(0.38, 0.62, 3.0, 8).translate(0, 1.5, 0), 0x6b4a2a),
    coloredGeometry(new THREE.IcosahedronGeometry(2.7, 1).scale(1, 0.85, 1).translate(0, 5.0, 0), 0x4c7a30),
    coloredGeometry(new THREE.IcosahedronGeometry(1.9, 1).translate(1.5, 6.0, 0.7),   0x5d8a3a),
    coloredGeometry(new THREE.IcosahedronGeometry(1.7, 1).translate(-1.5, 5.7, -0.6), 0x557f34),
  ]);
}

function scatterVegetation() {
  const waterPts = waterCurve.getPoints(50);
  const firePts  = fireCurve.getPoints(50);
  const nearCurve = (x, z, pts, r) => pts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r);

  const listA = [], listB = [];
  let attempts = 0;
  while (listA.length + listB.length < 620 && attempts++ < 12000) {
    const x = -280 + Math.random() * 480;
    const z = -240 + Math.random() * 420;
    const h = heightAt(x, z);
    if (h < 1.3 || h > 24) continue;
    if (Math.abs(heightAt(x + 2, z) - h) > 1.1 || Math.abs(heightAt(x, z + 2) - h) > 1.1) continue;
    if (valueNoise(x * 0.02 + 40, z * 0.02 + 7) < 0.34) continue; // forest clumps
    if (Math.hypot(x - 8, z + 8) < 70) continue;                  // lake
    if (Math.hypot(x + 82, z + 44) < 38) continue;                // fire zone
    if (Math.hypot(x + 78, z - 80) < 18) continue;                // tower
    const rx = x + 108, rz = z - 88;
    const u = rx * RW_DIR.x + rz * RW_DIR.z, v = -rx * RW_DIR.z + rz * RW_DIR.x;
    if (Math.abs(u) < 62 && Math.abs(v) < 20) continue;           // runway
    if (nearCurve(x, z, waterPts, 15) || nearCurve(x, z, firePts, 15)) continue;
    const entry = { x, z, h, s: 0.6 + Math.random() * 0.65, rot: Math.random() * Math.PI * 2 };
    (Math.random() < 0.45 ? listA : listB).push(entry);
  }

  const dummy = new THREE.Object3D();
  const makeInstances = (geo, list) => {
    if (!list.length) return;
    const mat  = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => {
      dummy.position.set(t.x, t.h - 0.15, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.set(t.s, t.s * (0.9 + Math.random() * 0.25), t.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.add(mesh);
  };
  makeInstances(buildLeafyGeometry(1), listA);
  makeInstances(buildLeafyGeometry(0), listB);
}

function scatterRocks() {
  const list = [];
  let attempts = 0;
  while (list.length < 70 && attempts++ < 800) {
    const x = -220 + Math.random() * 380;
    const z = -215 + Math.random() * 110; // mountain band
    const h = heightAt(x, z);
    if (h < 12) continue;
    list.push({ x, z, h, s: 0.8 + Math.random() * 2.2, sy: 0.7 + Math.random() * 0.6 });
  }
  if (!list.length) return;
  const mesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1.4, 0),
    new THREE.MeshStandardMaterial({ color: 0x7b756a, roughness: 0.98, flatShading: true }),
    list.length
  );
  const dummy = new THREE.Object3D();
  list.forEach((r, i) => {
    dummy.position.set(r.x, r.h - 0.4, r.z);
    dummy.rotation.set(Math.random() * 0.6, Math.random() * Math.PI * 2, Math.random() * 0.6);
    dummy.scale.set(r.s, r.s * r.sy, r.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.add(mesh);
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

// --- Fire: sprite particle system (flames, smoke, embers, glow, light) ---
function makeParticleTexture() {
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = 64;
  const ctx  = cnv.getContext("2d");
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0,    "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.65)");
  grad.addColorStop(1,    "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cnv);
}

function spawnFlame(p) {
  p.position.set((Math.random()-0.5)*24, 0.4 + Math.random()*1.2, (Math.random()-0.5)*17);
  const d = p.userData;
  d.life = 0;
  d.maxLife   = 0.7 + Math.random() * 0.9;
  d.rise      = 3.5 + Math.random() * 3.0;
  d.baseScale = 2.4 + Math.random() * 2.8;
  d.seed      = Math.random() * Math.PI * 2;
}
function spawnSmoke(p) {
  p.position.set((Math.random()-0.5)*22, 2.5 + Math.random()*3, (Math.random()-0.5)*16);
  const d = p.userData;
  d.life = 0;
  d.maxLife   = 5.0 + Math.random() * 4.0;
  d.rise      = 3.0 + Math.random() * 2.5;
  d.drift     = 1.2 + Math.random() * 1.6;
  d.baseScale = 5.5 + Math.random() * 4.5;
  d.seed      = Math.random() * Math.PI * 2;
}
function spawnEmber(p) {
  p.position.set((Math.random()-0.5)*18, 1 + Math.random()*2, (Math.random()-0.5)*12);
  const d = p.userData;
  d.life = 0;
  d.maxLife = 1.1 + Math.random() * 1.4;
  d.rise    = 7 + Math.random() * 6;
  d.seed    = Math.random() * Math.PI * 2;
}

function createFire() {
  const g   = new THREE.Group();
  const tex = makeParticleTexture();

  for (let i = 0; i < 44; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    s.userData.kind = "flame";
    spawnFlame(s);
    s.userData.life = Math.random() * s.userData.maxLife;
    g.add(s);
  }
  for (let i = 0; i < 54; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: 0.3,
    }));
    s.userData.kind = "smoke";
    spawnSmoke(s);
    s.userData.life = Math.random() * s.userData.maxLife;
    g.add(s);
  }
  for (let i = 0; i < 22; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: 0xffc366, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    s.userData.kind = "ember";
    spawnEmber(s);
    s.userData.life = Math.random() * s.userData.maxLife;
    g.add(s);
  }

  // Soft ground glow (radial texture, subtle) + flickering light on the terrain
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 34),
    new THREE.MeshBasicMaterial({ map: tex, color: 0xff7a22, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.3;
  glow.userData.kind = "glow";
  g.add(glow);

  const light = new THREE.PointLight(0xff6a22, 300, 90, 2);
  light.position.set(0, 6, 0);
  light.userData.kind = "light";
  g.add(light);
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
  // Floor follows the terrain so mountains can't be flown through
  const groundY = heightAt(state.position.x, state.position.z);
  state.position.y  = THREE.MathUtils.clamp(state.position.y, Math.max(5, groundY + 3), 86);
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
  if (!fireSystem.visible) return;
  const t = performance.now() * 0.001;
  fireSystem.children.forEach((p) => {
    const d = p.userData;
    if (d.kind === "glow") {
      p.material.opacity = 0.12 + Math.sin(t * 2.3) * 0.015 + Math.sin(t * 5.1) * 0.01;
      return;
    }
    if (d.kind === "light") {
      p.intensity = (250 + Math.sin(t * 13) * 60 + Math.sin(t * 29.3) * 40) * fireSystem.scale.x;
      return;
    }
    d.life += dt;
    if (d.life >= d.maxLife) {
      if (d.kind === "flame")      spawnFlame(p);
      else if (d.kind === "smoke") spawnSmoke(p);
      else                         spawnEmber(p);
    }
    const f = d.life / d.maxLife;
    if (d.kind === "flame") {
      p.position.y += d.rise * dt;
      p.position.x += Math.sin(t * 6 + d.seed) * dt * 1.2;
      const flick = 0.85 + Math.sin(t * 13 + d.seed * 7) * 0.2;
      const sc = d.baseScale * flick * (1 - f * 0.55);
      p.scale.set(sc * 0.75, sc * 1.25, 1);
      p.material.opacity = (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85) * 0.9;
      if (f < 0.5) p.material.color.lerpColors(FLAME_A, FLAME_B, f * 2);
      else         p.material.color.lerpColors(FLAME_B, FLAME_C, (f - 0.5) * 2);
    } else if (d.kind === "smoke") {
      p.position.y += d.rise * dt;
      p.position.x += (Math.sin(t * 0.8 + d.seed) * 0.6 + d.drift) * dt;
      p.position.z += Math.cos(t * 0.7 + d.seed) * dt * 0.5;
      const sc = d.baseScale * (1 + f * 2.6);
      p.scale.set(sc, sc, 1);
      p.material.rotation = d.seed + t * 0.25;
      p.material.opacity = (f < 0.2 ? f / 0.2 : 1 - (f - 0.2) / 0.8) * 0.55;
      p.material.color.lerpColors(SMOKE_A, SMOKE_B, f);
    } else { // ember
      p.position.y += d.rise * dt;
      p.position.x += Math.sin(t * 9 + d.seed) * dt * 2.5;
      const sc = 0.35 * (1 - f * 0.7);
      p.scale.set(sc, sc, 1);
      p.material.opacity = (1 - f) * 0.95;
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

  // Animated water
  waterMaterials.forEach((m) => { m.uniforms.uTime.value = now * 0.001; });

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
