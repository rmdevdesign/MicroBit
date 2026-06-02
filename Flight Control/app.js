import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

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
};

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

  craft.position.y = 0.6;
  return craft;
}

const aircraft = createAircraft();
const yawRig = new THREE.Group();
yawRig.add(aircraft);
scene.add(yawRig);

function createAirTrails() {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0x9ff4ff,
    transparent: true,
    opacity: 0.52,
  });

  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 8; i += 1) {
      const z = side * (0.65 + i * 0.22);
      const y = 0.1 + (i % 2) * 0.08;
      const points = [
        new THREE.Vector3(-0.4, y, z),
        new THREE.Vector3(-1.8, y, z + side * 0.08),
        new THREE.Vector3(-3.1, y, z + side * 0.03),
      ];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material.clone());
      line.userData = { baseZ: z, baseY: y, side, offset: i * 0.37 };
      group.add(line);
    }
  }

  return group;
}

const airTrails = createAirTrails();
aircraft.add(airTrails);

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

function updateAirTrails() {
  const ax = THREE.MathUtils.clamp(state.accelVisual.x / 1024, -2, 2);
  const ay = THREE.MathUtils.clamp(state.accelVisual.y / 1024, -2, 2);
  const az = THREE.MathUtils.clamp((state.accelVisual.z - 1024) / 1024, -2, 2);
  const time = performance.now() * 0.001;
  state.smoothAccelMagnitude = THREE.MathUtils.lerp(
    state.smoothAccelMagnitude,
    state.accelMagnitude,
    0.12
  );
  const strength = THREE.MathUtils.clamp(state.smoothAccelMagnitude, 0, 2.8);

  airTrails.children.forEach((line, index) => {
    const { baseZ, baseY, side, offset } = line.userData;
    const speed = time * (4 + strength * 4) + offset;
    const length = 0.45 + strength * 2.4;
    const spread = 0.04 + strength * 0.1;
    const sway = Math.sin(speed) * spread;
    const lift = ay * 0.35;
    const lateral = ax * side * 0.28;
    const positions = line.geometry.attributes.position.array;

    positions[0] = -0.45;
    positions[1] = baseY + lift;
    positions[2] = baseZ + lateral;
    positions[3] = -0.45 - length * 0.48;
    positions[4] = baseY + lift + sway;
    positions[5] = baseZ + side * 0.08 + lateral;
    positions[6] = -0.45 - length;
    positions[7] = baseY + lift - sway;
    positions[8] = baseZ + side * 0.03 + lateral;
    line.geometry.attributes.position.needsUpdate = true;
    line.material.opacity = 0.12 + strength * 0.28 + (index % 2) * 0.04;
  });
}

function updateStickPreview() {
  const rollDeg = THREE.MathUtils.radToDeg(state.currentRoll);
  const pitchDeg = THREE.MathUtils.radToDeg(state.currentPitch);
  const pitchOffset = THREE.MathUtils.clamp(rollDeg * -0.28, -18, 18);
  const pitchTilt = THREE.MathUtils.clamp(rollDeg * -0.85, -42, 42);
  const scaleY = 1 - Math.min(Math.abs(rollDeg), 65) / 850;

  ui.stickVisual.style.transform = `translateY(${pitchOffset}px) rotate(${pitchDeg}deg) rotateX(${pitchTilt}deg) scaleY(${scaleY})`;
}

function animate() {
  resize();
  state.currentPitch = lerpAngle(state.currentPitch, state.targetPitch, 0.08);
  state.currentRoll = lerpAngle(state.currentRoll, state.targetRoll, 0.08);
  state.currentYaw = lerpAngle(state.currentYaw, state.targetYaw, 0.05);

  yawRig.rotation.y = state.currentYaw;
  aircraft.rotation.z = state.currentRoll;
  aircraft.rotation.x = state.currentPitch;
  aircraft.rotation.y = 0;

  aircraft.position.y = 0.6 + Math.sin(performance.now() * 0.0012) * 0.06;
  aircraft.position.x = Math.sin(performance.now() * 0.0007) * 0.18;
  horizon.rotation.z += 0.0008;
  updateAirTrails();
  updateStickPreview();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function setStatus(message, isError = false) {
  ui.status.textContent = message;
  ui.status.style.color = isError ? "var(--danger)" : "var(--text)";
}

function updateTelemetry(data) {
  state.telemetry = { ...state.telemetry, ...data };
  ui.pitchValue.textContent = `${Math.round(state.telemetry.pitch)}°`;
  ui.rollValue.textContent = `${Math.round(state.telemetry.roll)}°`;
  ui.yawValue.textContent = `${Math.round(state.telemetry.heading)}°`;
  ui.accelValue.textContent = `x:${state.telemetry.x} y:${state.telemetry.y} z:${state.telemetry.z}`;
  ui.neutralValue.textContent = state.stickNeutral
    ? `x:${state.stickNeutral.x} y:${state.stickNeutral.y} z:${state.stickNeutral.z}`
    : "En attente";
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
    applyOrientation(payload);
    setStatus("Flux de donnees actif");
  } catch {
    setStatus(`Trame ignoree: ${trimmed}`, true);
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
  setStatus("Deconnecte");
}

async function connectMicrobit() {
  if (!navigator.serial) {
    setStatus("Web Serial non disponible dans ce navigateur", true);
    return;
  }

  try {
    setStatus("Selection du port USB...");
    ui.connectButton.disabled = true;

    state.port = await navigator.serial.requestPort({
      filters: [
        { usbVendorId: 0x0d28 },
        { usbVendorId: 0x1366 },
      ],
    });
    await state.port.open({ baudRate: 115200 });
    ui.disconnectButton.disabled = false;
    setStatus("Connecte en USB. En attente de trames...");

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
    setStatus(error.message || "Connexion impossible", true);
  }
}

ui.connectButton.addEventListener("click", connectMicrobit);
ui.disconnectButton.addEventListener("click", disconnectDevice);
ui.centerStickButton.addEventListener("click", () => {
  state.centerStickRequested = true;
});
ui.resetYawButton.addEventListener("click", () => {
  state.resetYawRequested = true;
});
window.addEventListener("resize", resize);

resize();
animate();
