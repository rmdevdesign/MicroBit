import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { onLanguageChange, t } from "./i18n.js";

const AIRCRAFT_MODEL = {
  // Deposer un fichier .glb a cote de index.html et indiquer son nom ici.
  url: "./aircraft.glb",
  // Cible la taille (plus grande dimension) du modele une fois mis a l'echelle
  // automatiquement, en unites de scene (l'avion procedural fait environ 4.3).
  targetSize: 4.3,
  scale: 1,
  rotation: { x: 0, y: Math.PI / 2, z: 0 },
  position: { x: 0, y: 0, z: 0 },
};

const state = {
  port: null,
  reader: null,
  reading: false,
  buffer: "",
  targetPitch: 0,
  targetRoll: 0,
  targetYaw: 0,
  currentPitch: 0,
  currentRoll: 0,
  currentYaw: 0,
  yawInitialized: false,
  yawZero: 0,
  lastHeading: 0,
  continuousHeading: 0,
  resetYawRequested: false,
  phoneActive: false,
  phoneSamples: 0,
  wakeLock: null,
  pitchInvertBeforePhone: null,
  phoneSnap: 0,
  stickNeutral: null,
  centerStickRequested: true,
  accelVisual: { x: 0, y: 0, z: 0 },
  accelMagnitude: 0,
  smoothAccelMagnitude: 0,
  telemetry: {
    pitch: 0,
    roll: 0,
    heading: 0,
    x: 0,
    y: 0,
    z: 0,
  },
};

const ui = {
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  phoneSensorButton: document.querySelector("#phoneSensorButton"),
  status: document.querySelector("#status"),
  pitchValue: document.querySelector("#pitchValue"),
  rollValue: document.querySelector("#rollValue"),
  yawValue: document.querySelector("#yawValue"),
  accelValue: document.querySelector("#accelValue"),
  neutralValue: document.querySelector("#neutralValue"),
  hudPitch: document.querySelector("#hudPitch"),
  hudRoll: document.querySelector("#hudRoll"),
  hudYaw: document.querySelector("#hudYaw"),
  stickVisual: document.querySelector("#stickVisual"),
  invertPitch: document.querySelector("#invertPitch"),
  invertRoll: document.querySelector("#invertRoll"),
  enableYaw: document.querySelector("#enableYaw"),
  rollSensitivity: document.querySelector("#rollSensitivity"),
  pitchSensitivity: document.querySelector("#pitchSensitivity"),
  aircraftOrientation: document.querySelector("#aircraftOrientation"),
  centerStickButton: document.querySelector("#centerStickButton"),
  resetYawButton: document.querySelector("#resetYawButton"),
  debugEnabled: document.querySelector("#debugEnabled"),
  debugPitch: document.querySelector("#debugPitch"),
  debugRoll: document.querySelector("#debugRoll"),
  debugYaw: document.querySelector("#debugYaw"),
  debugPitchLabel: document.querySelector("#debugPitchLabel"),
  debugRollLabel: document.querySelector("#debugRollLabel"),
  debugYawLabel: document.querySelector("#debugYawLabel"),
  debugResetButton: document.querySelector("#debugResetButton"),
};

function applyDebugOrientation() {
  const pitch = Number(ui.debugPitch.value) || 0;
  const roll = Number(ui.debugRoll.value) || 0;
  const yaw = Number(ui.debugYaw.value) || 0;
  ui.debugPitchLabel.textContent = `${pitch}°`;
  ui.debugRollLabel.textContent = `${roll}°`;
  ui.debugYawLabel.textContent = `${yaw}°`;

  state.targetPitch = THREE.MathUtils.degToRad(pitch);
  state.targetRoll = THREE.MathUtils.degToRad(roll);
  state.targetYaw = THREE.MathUtils.degToRad(yaw);

  updateTelemetry({
    pitch,
    roll,
    heading: yaw,
    x: state.telemetry.x,
    y: state.telemetry.y,
    z: state.telemetry.z,
  });
}

[ui.debugPitch, ui.debugRoll, ui.debugYaw].forEach((input) => {
  input.addEventListener("input", applyDebugOrientation);
});

ui.debugResetButton.addEventListener("click", () => {
  ui.debugPitch.value = 0;
  ui.debugRoll.value = 0;
  ui.debugYaw.value = 0;
  applyDebugOrientation();
});

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x07111a, 16, 36);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(4.5, 2.8, 6.5);
camera.lookAt(0, 0.25, 0);

const ambient = new THREE.HemisphereLight(0xdaf6ff, 0x0d1a24, 1.3);
scene.add(ambient);

const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(6, 8, 10);
scene.add(key);

const fill = new THREE.PointLight(0x67d6ff, 20, 24, 2);
fill.position.set(-5, -2, 6);
scene.add(fill);

const grid = new THREE.GridHelper(30, 30, 0x2e596f, 0x173344);
grid.position.y = -2.6;
scene.add(grid);

const horizonGeometry = new THREE.RingGeometry(8.5, 8.8, 64);
const horizonMaterial = new THREE.MeshBasicMaterial({
  color: 0x123146,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.42,
});
const horizon = new THREE.Mesh(horizonGeometry, horizonMaterial);
horizon.rotation.x = Math.PI / 2;
horizon.position.y = -2.58;
scene.add(horizon);

function createAircraft() {
  const craft = new THREE.Group();

  const red = new THREE.MeshStandardMaterial({
    color: 0xeb5e55,
    metalness: 0.15,
    roughness: 0.5,
  });
  const blue = new THREE.MeshStandardMaterial({
    color: 0x67d6ff,
    metalness: 0.1,
    roughness: 0.35,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x09141c,
    metalness: 0.3,
    roughness: 0.7,
  });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.6, 18), red);
  fuselage.rotation.z = Math.PI / 2;
  craft.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 18), blue);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 2.1;
  craft.add(nose);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 4.8), blue);
  wing.position.set(-0.15, 0.02, 0);
  craft.add(wing);

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 1.8), blue);
  tailWing.position.set(-1.45, 0.16, 0);
  craft.add(tailWing);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.08), dark);
  fin.position.set(-1.45, 0.42, 0);
  craft.add(fin);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 18), dark);
  cockpit.scale.set(1.4, 0.8, 0.95);
  cockpit.position.set(0.6, 0.22, 0);
  craft.add(cockpit);

  const engineLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.75, 16), dark);
  engineLeft.rotation.z = Math.PI / 2;
  engineLeft.position.set(0.4, -0.18, -1.4);
  craft.add(engineLeft);

  const engineRight = engineLeft.clone();
  engineRight.position.z = 1.4;
  craft.add(engineRight);

  return craft;
}

const aircraft = new THREE.Group();
let craftVisual = createAircraft();
aircraft.add(craftVisual);

const yawRig = new THREE.Group();
yawRig.add(aircraft);
scene.add(yawRig);

function loadAircraftModel(url) {
  new GLTFLoader().load(
    url,
    (gltf) => {
      const model = gltf.scene;
      model.rotation.set(AIRCRAFT_MODEL.rotation.x, AIRCRAFT_MODEL.rotation.y, AIRCRAFT_MODEL.rotation.z);

      const rotatedBox = new THREE.Box3().setFromObject(model);
      const size = rotatedBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const autoScale = (AIRCRAFT_MODEL.targetSize / maxDim) * AIRCRAFT_MODEL.scale;
      model.scale.setScalar(autoScale);

      const center = rotatedBox.getCenter(new THREE.Vector3()).multiplyScalar(autoScale);
      model.position.set(
        AIRCRAFT_MODEL.position.x - center.x,
        AIRCRAFT_MODEL.position.y - center.y,
        AIRCRAFT_MODEL.position.z - center.z
      );

      aircraft.remove(craftVisual);
      craftVisual = model;
      aircraft.add(craftVisual);
    },
    undefined,
    () => {
      // Pas de .glb fourni ou chargement impossible: l'avion procedural reste affiche.
    }
  );
}

loadAircraftModel(AIRCRAFT_MODEL.url);

const attitudeCanvas = document.querySelector("#attitudeHud");
const attitudeCtx = attitudeCanvas.getContext("2d");
const ATTITUDE_SIZE = attitudeCanvas.width;
const ATTITUDE_RADIUS = ATTITUDE_SIZE / 2;
const PITCH_PIXELS_PER_DEGREE = ATTITUDE_SIZE / 70;

function drawAttitudeIndicator(pitchDeg, rollRad) {
  const ctx = attitudeCtx;
  const r = ATTITUDE_RADIUS;
  ctx.clearRect(0, 0, ATTITUDE_SIZE, ATTITUDE_SIZE);

  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 4, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(r, r);
  ctx.rotate(rollRad);
  ctx.translate(0, pitchDeg * PITCH_PIXELS_PER_DEGREE);

  const span = ATTITUDE_SIZE * 1.6;
  const sky = ctx.createLinearGradient(0, -span, 0, 0);
  sky.addColorStop(0, "#8fd7ff");
  sky.addColorStop(1, "#2f7dc4");
  ctx.fillStyle = sky;
  ctx.fillRect(-span, -span, span * 2, span);

  const ground = ctx.createLinearGradient(0, 0, 0, span);
  ground.addColorStop(0, "#8a5a2f");
  ground.addColorStop(1, "#3c2513");
  ctx.fillStyle = ground;
  ctx.fillRect(-span, 0, span * 2, span);

  ctx.strokeStyle = "#f4f9ff";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-span, 0);
  ctx.lineTo(span, 0);
  ctx.stroke();

  ctx.fillStyle = "rgba(244, 249, 255, 0.85)";
  ctx.font = "10px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let deg = -60; deg <= 60; deg += 10) {
    if (deg === 0) {
      continue;
    }
    const y = -deg * PITCH_PIXELS_PER_DEGREE;
    const isMajor = deg % 30 === 0;
    const half = isMajor ? 34 : deg % 20 === 0 ? 22 : 14;
    ctx.strokeStyle = "rgba(244, 249, 255, 0.85)";
    ctx.lineWidth = isMajor ? 2 : 1.4;
    ctx.beginPath();
    ctx.moveTo(-half, y);
    ctx.lineTo(half, y);
    ctx.stroke();
    if (isMajor) {
      ctx.fillText(String(Math.abs(deg)), -half - 12, y);
      ctx.fillText(String(Math.abs(deg)), half + 12, y);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.translate(r, r);
  ctx.rotate(rollRad);
  ctx.strokeStyle = "rgba(244, 249, 255, 0.9)";
  ctx.lineWidth = 2;
  [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].forEach((deg) => {
    const angle = THREE.MathUtils.degToRad(deg) - Math.PI / 2;
    const outer = r - 6;
    const inner = deg % 30 === 0 ? r - 16 : r - 11;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.lineTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.stroke();
  });
  ctx.restore();

  ctx.save();
  ctx.translate(r, r);
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.moveTo(0, -(r - 4));
  ctx.lineTo(-6, -(r - 16));
  ctx.lineTo(6, -(r - 16));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(r, r);
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.lineTo(-10, 0);
  ctx.lineTo(-4, 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.lineTo(10, 0);
  ctx.lineTo(4, 7);
  ctx.stroke();
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 2, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(233, 242, 248, 0.35)";
  ctx.stroke();
  ctx.restore();
}

function resize() {
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function lerpAngle(current, target, factor) {
  return current + (target - current) * factor;
}

function radToSignedDeg(radians) {
  return THREE.MathUtils.radToDeg(Math.atan2(Math.sin(radians), Math.cos(radians)));
}

function getStickAngles(accel) {
  const x = Number(accel.x) || 0;
  const y = Number(accel.y) || 0;
  const z = Number(accel.z) || 0;
  const inPlane = Math.max(Math.hypot(x, y), 1);
  const rawRoll = Math.atan2(x, y);
  const rawPitch = Math.atan2(z, inPlane);

  if (!state.stickNeutral || state.centerStickRequested) {
    state.stickNeutral = { rawRoll, rawPitch, x, y, z };
    state.centerStickRequested = false;
  }

  const rollSensitivity = Number(ui.rollSensitivity.value) || 1;
  const pitchSensitivity = Number(ui.pitchSensitivity.value) || 1;
  let pitch = radToSignedDeg(rawRoll - state.stickNeutral.rawRoll) * pitchSensitivity;
  let roll = radToSignedDeg(rawPitch - state.stickNeutral.rawPitch) * rollSensitivity;

  if (ui.invertRoll.checked) {
    roll *= -1;
  }

  if (ui.invertPitch.checked) {
    pitch *= -1;
  }

  return {
    pitch: THREE.MathUtils.clamp(pitch, -65, 65),
    roll: THREE.MathUtils.clamp(roll, -80, 80),
  };
}

function updateStickPreview() {
  const rollDeg = THREE.MathUtils.radToDeg(state.currentRoll);
  const pitchDeg = THREE.MathUtils.radToDeg(state.currentPitch);
  const pitchOffset = THREE.MathUtils.clamp(pitchDeg * -0.28, -18, 18);
  const pitchTilt = THREE.MathUtils.clamp(pitchDeg * -0.85, -42, 42);
  const scaleY = 1 - Math.min(Math.abs(pitchDeg), 65) / 850;

  ui.stickVisual.style.transform = `translateY(${pitchOffset}px) rotate(${rollDeg}deg) rotateX(${pitchTilt}deg) scaleY(${scaleY})`;
}

function animate() {
  resize();
  state.currentPitch = lerpAngle(state.currentPitch, state.targetPitch, 0.08);
  state.currentRoll = lerpAngle(state.currentRoll, state.targetRoll, 0.08);
  state.currentYaw = lerpAngle(state.currentYaw, state.targetYaw, 0.05);

  yawRig.rotation.y = state.currentYaw;
  aircraft.rotation.z = state.currentPitch;
  aircraft.rotation.x = state.currentRoll;
  aircraft.rotation.y = 0;

  aircraft.position.y = 0.6 + Math.sin(performance.now() * 0.0012) * 0.06;
  aircraft.position.x = Math.sin(performance.now() * 0.0007) * 0.18;
  horizon.rotation.z += 0.0008;
  updateStickPreview();
  drawAttitudeIndicator(THREE.MathUtils.radToDeg(state.currentPitch), -state.currentRoll);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// Le statut garde sa cle de traduction pour pouvoir se retraduire au changement de langue.
let currentStatus = { key: "st.waiting", vars: {}, raw: null, isError: false };

function renderStatus() {
  ui.status.textContent = currentStatus.raw ?? t(currentStatus.key, currentStatus.vars);
  ui.status.style.color = currentStatus.isError ? "var(--danger)" : "var(--text)";
}

function setStatus(key, isError = false, vars = {}) {
  currentStatus = { key, vars, raw: null, isError };
  renderStatus();
}

// Message deja formate (ex. erreur du navigateur), affiche tel quel.
function setStatusRaw(text, isError = false) {
  currentStatus = { key: null, vars: {}, raw: text, isError };
  renderStatus();
}

function announceStart() {
  document.dispatchEvent(new CustomEvent("flight:started"));
}

function updateTelemetry(data) {
  state.telemetry = { ...state.telemetry, ...data };
  ui.pitchValue.textContent = `${Math.round(state.telemetry.pitch)}°`;
  ui.rollValue.textContent = `${Math.round(state.telemetry.roll)}°`;
  ui.yawValue.textContent = `${Math.round(state.telemetry.heading)}°`;
  ui.accelValue.textContent = `x:${state.telemetry.x} y:${state.telemetry.y} z:${state.telemetry.z}`;
  ui.neutralValue.textContent = state.stickNeutral
    ? `x:${state.stickNeutral.x} y:${state.stickNeutral.y} z:${state.stickNeutral.z}`
    : t("st.waiting");
  ui.hudPitch.textContent = `${Math.round(state.telemetry.pitch)}°`;
  ui.hudRoll.textContent = `${Math.round(state.telemetry.roll)}°`;
  ui.hudYaw.textContent = `${Math.round(state.telemetry.heading)}°`;
}

function updateYaw(rawHeading) {
  const heading = THREE.MathUtils.euclideanModulo(rawHeading, 360);

  if (!state.yawInitialized) {
    state.yawInitialized = true;
    state.lastHeading = heading;
    state.continuousHeading = heading;
    state.yawZero = heading;
  }

  const delta = THREE.MathUtils.euclideanModulo(heading - state.lastHeading + 180, 360) - 180;
  state.continuousHeading += delta;
  state.lastHeading = heading;

  if (state.resetYawRequested) {
    state.yawZero = state.continuousHeading;
    state.resetYawRequested = false;
  }

  return state.continuousHeading - state.yawZero;
}

function applyOrientation(data) {
  const { pitch, roll } = getStickAngles(data);
  const heading = updateYaw(Number(data.heading) || 0);

  state.targetPitch = THREE.MathUtils.degToRad(pitch);
  state.targetRoll = THREE.MathUtils.degToRad(roll);
  state.targetYaw = THREE.MathUtils.degToRad(
    (ui.enableYaw.checked ? heading : 0) + (Number(ui.aircraftOrientation.value) || 0)
  );

  state.accelVisual = {
    x: Number(data.x) || 0,
    y: Number(data.y) || 0,
    z: Number(data.z) || 0,
  };
  state.accelMagnitude = Math.abs(
    Math.sqrt(
      state.accelVisual.x ** 2 +
      state.accelVisual.y ** 2 +
      state.accelVisual.z ** 2
    ) - 1024
  ) / 512;

  updateTelemetry({
    pitch,
    roll,
    heading,
    x: Number(data.x) || 0,
    y: Number(data.y) || 0,
    z: Number(data.z) || 0,
  });
}

function parseIncomingLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  try {
    const payload = JSON.parse(trimmed);
    if (!ui.debugEnabled.checked) {
      applyOrientation(payload);
      setStatus("st.streamActive");
    }
  } catch {
    setStatus("st.frameIgnored", true, { line: trimmed });
  }
}

const decoder = new TextDecoder();

function handleSerialChunk(value) {
  const chunk = decoder.decode(value, { stream: true });
  state.buffer += chunk;
  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() || "";
  for (const line of lines) {
    parseIncomingLine(line);
  }
}

async function disconnectDevice() {
  state.reading = false;

  if (state.reader) {
    try {
      await state.reader.cancel();
    } catch {
      // Ignore cleanup failures.
    }
    try {
      state.reader.releaseLock();
    } catch {
      // Ignore cleanup failures.
    }
  }

  if (state.port) {
    try {
      await state.port.close();
    } catch {
      // Ignore cleanup failures.
    }
  }

  state.port = null;
  state.reader = null;
  state.buffer = "";
  ui.connectButton.disabled = false;
  ui.disconnectButton.disabled = true;
  setStatus("st.disconnected");
}

async function connectMicrobit() {
  if (!navigator.serial) {
    setStatus("st.noSerial", true);
    return;
  }

  try {
    setStatus("st.selecting");
    ui.connectButton.disabled = true;

    state.port = await navigator.serial.requestPort({
      filters: [
        { usbVendorId: 0x0d28 },
        { usbVendorId: 0x1366 },
      ],
    });
    await state.port.open({ baudRate: 115200 });
    ui.disconnectButton.disabled = false;
    setStatus("st.connected");
    announceStart();

    state.reading = true;
    state.reader = state.port.readable.getReader();
    while (state.reading) {
      const { value, done } = await state.reader.read();
      if (done) {
        break;
      }
      if (value) {
        handleSerialChunk(value);
      }
    }
  } catch (error) {
    ui.connectButton.disabled = false;
    ui.disconnectButton.disabled = true;
    if (error.message) {
      setStatusRaw(error.message, true);
    } else {
      setStatus("st.connectFailed", true);
    }
  }
}

// Capteurs du telephone : deviceorientation (beta/gamma) donne une inclinaison
// coherente entre iOS et Android, contrairement a devicemotion dont le signe
// differe. On la convertit en vecteur gravite (milli-g) pour reutiliser
// applyOrientation() tel quel, comme si c'etait une trame micro:bit.
// Telephone tenu droit face a soi, comme un volant : tourner = roulis,
// pencher le haut vers soi = cabrer. Les axes sont permutes pour que
// getStickAngles() donne ce resultat (x = pousser/tirer, z = volant).
// Les angles beta/gamma sont toujours donnes par rapport au telephone en portrait,
// meme quand l'ecran pivote. On reconstruit donc le vecteur "haut" (oppose a la
// gravite) dans le repere du telephone, puis on le tourne par quarts de tour pour
// que le haut de la position neutre corresponde au haut de la manette. Ce quart
// de tour est mesure au (re)centrage, donc independant du verrouillage de rotation.
function updatePhoneSnap(upX, upY) {
  if (Math.hypot(upX, upY) < 0.5) {
    return;
  }
  state.phoneSnap = Math.round(Math.atan2(upX, upY) / (Math.PI / 2)) * (Math.PI / 2);
}

function handleDeviceOrientation(event) {
  if (event.beta === null || event.gamma === null || ui.debugEnabled.checked) {
    return;
  }

  const beta = THREE.MathUtils.degToRad(event.beta);
  const gamma = THREE.MathUtils.degToRad(event.gamma);
  const heading = event.webkitCompassHeading ?? (360 - (event.alpha || 0));

  const upX = -Math.cos(beta) * Math.sin(gamma);
  const upY = Math.sin(beta);
  const upZ = Math.cos(beta) * Math.cos(gamma);

  if (state.centerStickRequested) {
    updatePhoneSnap(upX, upY);
  }

  const cos = Math.cos(state.phoneSnap);
  const sin = Math.sin(state.phoneSnap);
  const screenX = upX * cos - upY * sin;
  const screenY = upX * sin + upY * cos;

  state.phoneSamples += 1;
  applyOrientation({
    x: Math.round(upZ * 1024),
    y: Math.round(screenY * 1024),
    z: Math.round(-screenX * 1024),
    heading,
  });
  setStatus("st.phoneActive");
}

async function requestWakeLock() {
  try {
    state.wakeLock = await navigator.wakeLock?.request("screen");
  } catch {
    // Ecran veille possible : pas bloquant.
  }
}

function setPhoneButtonLabel() {
  ui.phoneSensorButton.textContent = t(state.phoneActive ? "phone.off" : "phone.on");
}

async function disablePhoneSensors(messageKey = "st.phoneOff", isError = false) {
  window.removeEventListener("deviceorientation", handleDeviceOrientation);
  state.phoneActive = false;
  // Rend le reglage d'inversion du tangage tel qu'il etait avant le mode telephone.
  if (state.pitchInvertBeforePhone !== null) {
    ui.invertPitch.checked = state.pitchInvertBeforePhone;
    state.pitchInvertBeforePhone = null;
  }
  setPhoneButtonLabel();
  setStatus(messageKey, isError);
  await state.wakeLock?.release().catch(() => {});
  state.wakeLock = null;
}

async function enablePhoneSensors() {
  if (!window.DeviceOrientationEvent) {
    setStatus("st.noOrientation", true);
    return;
  }

  if (!window.isSecureContext) {
    setStatus("st.insecure", true);
    return;
  }

  // iOS 13+ : la permission doit etre demandee depuis un geste utilisateur.
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      if ((await DeviceOrientationEvent.requestPermission()) !== "granted") {
        setStatus("st.denied", true);
        return;
      }
    } catch (error) {
      if (error.message) {
        setStatusRaw(error.message, true);
      } else {
        setStatus("st.sensorFailed", true);
      }
      return;
    }
  }

  state.phoneActive = true;
  // Tenu comme un volant, le telephone donne un tangage a l'envers par defaut :
  // on coche l'inversion (modifiable ensuite dans l'onglet Manette).
  state.pitchInvertBeforePhone = ui.invertPitch.checked;
  ui.invertPitch.checked = true;
  state.phoneSamples = 0;
  state.phoneSnap = 0;
  state.centerStickRequested = true;
  state.yawInitialized = false;
  window.addEventListener("deviceorientation", handleDeviceOrientation);
  setPhoneButtonLabel();
  setStatus("st.phoneWaiting");
  requestWakeLock();
  announceStart();

  // Un navigateur de bureau declenche l'evenement une fois avec des valeurs nulles.
  setTimeout(() => {
    if (state.phoneActive && state.phoneSamples === 0) {
      disablePhoneSensors("st.phoneNone", true);
    }
  }, 2000);
}

ui.phoneSensorButton.addEventListener("click", () => {
  if (state.phoneActive) {
    disablePhoneSensors();
  } else {
    enablePhoneSensors();
  }
});

// Le wake lock est libere par le navigateur quand l'onglet passe en arriere-plan.
document.addEventListener("visibilitychange", () => {
  if (state.phoneActive && document.visibilityState === "visible") {
    requestWakeLock();
  }
});

ui.connectButton.addEventListener("click", connectMicrobit);
ui.disconnectButton.addEventListener("click", disconnectDevice);
ui.centerStickButton.addEventListener("click", () => {
  state.centerStickRequested = true;
});
ui.resetYawButton.addEventListener("click", () => {
  state.resetYawRequested = true;
});
window.addEventListener("resize", resize);

onLanguageChange(() => {
  renderStatus();
  updateTelemetry({});
  setPhoneButtonLabel();
});
renderStatus();
updateTelemetry({});

resize();
animate();
