import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

const UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const G = 9.80665;

const state = {
  device: null,
  characteristic: null,
  connected: false,
  recording: false,
  simulating: false,
  buffer: "",
  samples: [],
  live: null,
  startedAt: 0,
  lastSampleAt: 0,
  baseline: null,
  velocity: { x: 0, y: 0, z: 0 },
  position: { x: 0, y: 0, z: 0 },
  gMax: 0,
  renderVersion: 0,
  renderedVersion: -1,
};

const ui = {
  status: document.querySelector("#status"),
  connectButton: document.querySelector("#connectButton"),
  scanAllButton: document.querySelector("#scanAllButton"),
  recordButton: document.querySelector("#recordButton"),
  simulateButton: document.querySelector("#simulateButton"),
  resetButton: document.querySelector("#resetButton"),
  sampleCount: document.querySelector("#sampleCount"),
  duration: document.querySelector("#duration"),
  gMax: document.querySelector("#gMax"),
  accelReadout: document.querySelector("#accelReadout"),
  rotationReadout: document.querySelector("#rotationReadout"),
  speedReadout: document.querySelector("#speedReadout"),
  positionReadout: document.querySelector("#positionReadout"),
  downloadJsonButton: document.querySelector("#downloadJsonButton"),
  downloadCsvButton: document.querySelector("#downloadCsvButton"),
};

const sceneCanvas = document.querySelector("#trackCanvas");
const accelCanvas = document.querySelector("#accelCanvas");
const accelCtx = accelCanvas.getContext("2d");
const decoder = new TextDecoder();

const renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xfffdf7);
scene.fog = new THREE.Fog(0xfffdf7, 22, 58);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
camera.position.set(9, 7, 12);
camera.lookAt(0, 0, 0);

const ambient = new THREE.HemisphereLight(0xffffff, 0x243f36, 1.9);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 2);
keyLight.position.set(8, 12, 9);
scene.add(keyLight);

const grid = new THREE.GridHelper(28, 28, 0xd44f35, 0xd8d0bf);
grid.position.y = -0.02;
scene.add(grid);

const axes = new THREE.AxesHelper(4);
scene.add(axes);

const trackGroup = new THREE.Group();
scene.add(trackGroup);

const emptyLabel = document.createElement("div");
emptyLabel.className = "empty-label";
emptyLabel.textContent = "Start recording ou Simulation pour tracer la trajectoire 3D";
document.querySelector(".visualizer").appendChild(emptyLabel);

const liveMarker = createMarker();
scene.add(liveMarker);

let tubeMesh = null;
let lineMesh = null;
let pointCloud = null;

function createMarker() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.22, 0.32),
    new THREE.MeshStandardMaterial({ color: 0xd44f35, metalness: 0.18, roughness: 0.42 })
  );
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.36, 18),
    new THREE.MeshStandardMaterial({ color: 0x0f8b8d, metalness: 0.12, roughness: 0.35 })
  );
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 0.4;
  group.add(body, nose);
  return group;
}

function setStatus(message, isError = false) {
  ui.status.textContent = message;
  ui.status.classList.toggle("error", isError);
}

function resizeScene() {
  const rect = sceneCanvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / Math.max(rect.height, 1);
  camera.updateProjectionMatrix();
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * scale));
  const height = Math.max(1, Math.floor(rect.height * scale));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  return { width, height };
}

function normalizePayload(payload) {
  const now = performance.now();
  const x = Number(payload.x) || 0;
  const y = Number(payload.y) || 0;
  const z = Number(payload.z) || 0;

  return {
    t: now,
    x,
    y,
    z,
    pitch: Number(payload.pitch) || 0,
    roll: Number(payload.roll) || 0,
    heading: Number(payload.heading) || 0,
    g: Math.hypot(x, y, z) / 1024,
  };
}

function integrate(sample) {
  if (!state.startedAt) {
    state.startedAt = sample.t;
    state.lastSampleAt = sample.t;
    state.baseline = { x: sample.x, y: sample.y, z: sample.z };
  }

  const dt = Math.min((sample.t - state.lastSampleAt) / 1000, 0.12);
  state.lastSampleAt = sample.t;

  const heading = (sample.heading * Math.PI) / 180;
  const ax = ((sample.x - state.baseline.x) / 1024) * G;
  const ay = ((sample.y - state.baseline.y) / 1024) * G;
  const az = ((sample.z - state.baseline.z) / 1024) * G;
  const horizontal = rotate2d(ax, ay, heading);

  state.velocity.x = state.velocity.x * 0.982 + horizontal.x * dt;
  state.velocity.y = state.velocity.y * 0.982 + az * dt;
  state.velocity.z = state.velocity.z * 0.982 + horizontal.y * dt;
  state.position.x += state.velocity.x * dt;
  state.position.y += state.velocity.y * dt;
  state.position.z += state.velocity.z * dt;

  return {
    ...sample,
    relTime: (sample.t - state.startedAt) / 1000,
    px: state.position.x,
    py: state.position.y,
    pz: state.position.z,
    speed: Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z),
  };
}

function rotate2d(x, y, radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return {
    x: x * c - y * s,
    y: x * s + y * c,
  };
}

function handleSample(payload) {
  const sample = integrate(normalizePayload(payload));
  state.live = sample;
  state.gMax = Math.max(state.gMax, sample.g);

  if (state.recording) {
    state.samples.push(sample);
    state.renderVersion += 1;
  }

  updateUi();
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    handleSample(JSON.parse(trimmed));
    setStatus(state.recording ? "Recording en cours" : "Flux Bluetooth actif");
  } catch {
    setStatus(`Trame ignoree: ${trimmed}`, true);
  }
}

function handleBluetoothValue(event) {
  state.buffer += decoder.decode(event.target.value, { stream: true });
  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() || "";
  lines.forEach(parseLine);
}

async function connectMicrobit(scanAllDevices = false) {
  if (!navigator.bluetooth) {
    setStatus("Web Bluetooth non disponible. Utiliser Chrome ou Edge.", true);
    return;
  }

  try {
    setStatus("Selection BLE: choisis le micro:bit dans la liste.");
    const requestOptions = scanAllDevices
      ? {
          acceptAllDevices: true,
          optionalServices: [UART_SERVICE],
        }
      : {
          filters: [
            { namePrefix: "BBC micro:bit" },
            { namePrefix: "micro:bit" },
            { namePrefix: "Micro:bit" },
          ],
          optionalServices: [UART_SERVICE],
        };
    const device = await navigator.bluetooth.requestDevice(requestOptions);

    device.addEventListener("gattserverdisconnected", onDisconnected);
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(UART_SERVICE);
    const tx = await service.getCharacteristic(UART_TX);
    await tx.startNotifications();
    tx.addEventListener("characteristicvaluechanged", handleBluetoothValue);

    state.device = device;
    state.characteristic = tx;
    state.connected = true;
    state.buffer = "";
    ui.connectButton.textContent = "Deconnecter";
    ui.recordButton.disabled = false;
    setStatus(`Connecte a ${device.name || "micro:bit"}. Pret a enregistrer.`);
  } catch (error) {
    const message = error?.message || "Connexion Bluetooth impossible";
    if (message.includes("No Services matching UUID")) {
      setStatus("Micro:bit visible, mais service UART absent. Quitte le mode appairage et redemarre le programme MakeCode flashe avec bluetooth.startUartService().", true);
      return;
    }
    if (message.includes("GATT Error: Not supported")) {
      setStatus("GATT non supporte: oublie le micro:bit dans Windows Bluetooth, active No Pairing Required dans MakeCode, reflashe, puis redemarre normalement.", true);
      return;
    }
    setStatus(`${message}. Utilise le micro:bit en mode programme, pas le mode A+B+reset.`, true);
  }
}

function disconnectMicrobit() {
  if (state.characteristic) {
    state.characteristic.removeEventListener("characteristicvaluechanged", handleBluetoothValue);
  }

  if (state.device?.gatt?.connected) {
    state.device.gatt.disconnect();
  }

  onDisconnected();
}

function onDisconnected() {
  state.connected = false;
  state.device = null;
  state.characteristic = null;
  ui.connectButton.textContent = "Connecter micro:bit";
  ui.recordButton.disabled = !state.simulating;
  if (!state.simulating) setStatus("Deconnecte");
}

function toggleRecording() {
  state.recording = !state.recording;
  ui.recordButton.textContent = state.recording ? "Stop recording" : "Start recording";
  ui.recordButton.classList.toggle("is-recording", state.recording);

  if (state.recording && state.samples.length === 0) {
    resetMotionOnly();
  }

  setStatus(state.recording ? "Recording en cours" : "Recording stoppe");
  updateUi();
}

function resetMotionOnly() {
  state.startedAt = 0;
  state.lastSampleAt = 0;
  state.baseline = null;
  state.velocity = { x: 0, y: 0, z: 0 };
  state.position = { x: 0, y: 0, z: 0 };
}

function resetRecording() {
  state.samples = [];
  resetMotionOnly();
  state.gMax = 0;
  state.recording = false;
  state.renderVersion += 1;
  ui.recordButton.textContent = "Start recording";
  ui.recordButton.classList.remove("is-recording");
  setStatus(state.connected || state.simulating ? "Pret a enregistrer" : "Pret");
  updateUi();
}

let simulationTimer = 0;

function toggleSimulation() {
  state.simulating = !state.simulating;
  ui.simulateButton.textContent = state.simulating ? "Stop simulation" : "Simulation";
  ui.recordButton.disabled = !(state.connected || state.simulating);

  if (state.simulating) {
    resetMotionOnly();
    const started = performance.now();
    simulationTimer = window.setInterval(() => {
      const t = (performance.now() - started) / 1000;
      handleSample({
        x: Math.sin(t * 1.7) * 420 + Math.sin(t * 5.1) * 90,
        y: Math.cos(t * 1.15) * 340,
        z: 1024 + Math.sin(t * 2.4) * 280 + Math.cos(t * 0.7) * 120,
        pitch: Math.sin(t * 1.6) * 42,
        roll: Math.cos(t * 1.3) * 58,
        heading: (t * 46) % 360,
      });
    }, 50);
    setStatus("Simulation active");
  } else {
    window.clearInterval(simulationTimer);
    if (!state.connected) ui.recordButton.disabled = true;
    setStatus(state.connected ? "Connecte" : "Pret");
  }
}

function updateUi() {
  const current = state.live;
  const duration = state.samples.length > 1
    ? state.samples[state.samples.length - 1].relTime - state.samples[0].relTime
    : 0;

  ui.sampleCount.textContent = String(state.samples.length);
  ui.duration.textContent = `${duration.toFixed(1)} s`;
  ui.gMax.textContent = state.gMax.toFixed(2);
  ui.downloadJsonButton.disabled = state.samples.length === 0;
  ui.downloadCsvButton.disabled = state.samples.length === 0;
  emptyLabel.hidden = state.samples.length > 1 || Boolean(state.live);

  if (current) {
    ui.accelReadout.textContent = `x:${Math.round(current.x)} y:${Math.round(current.y)} z:${Math.round(current.z)} g:${current.g.toFixed(2)}`;
    ui.rotationReadout.textContent = `pitch:${Math.round(current.pitch)} roll:${Math.round(current.roll)} heading:${Math.round(current.heading)}`;
    ui.speedReadout.textContent = current.speed.toFixed(2);
    ui.positionReadout.textContent = `x:${current.px.toFixed(2)} y:${current.py.toFixed(2)} z:${current.pz.toFixed(2)}`;
  }
}

function rebuildTrack() {
  if (state.renderedVersion === state.renderVersion) return;
  state.renderedVersion = state.renderVersion;

  disposeObject(tubeMesh);
  disposeObject(lineMesh);
  disposeObject(pointCloud);
  tubeMesh = null;
  lineMesh = null;
  pointCloud = null;

  if (state.samples.length < 2) return;

  const points = normalizeTrackPoints(state.samples);
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.42);
  const tubeGeometry = new THREE.TubeGeometry(curve, Math.max(32, points.length * 2), 0.075, 10, false);
  const tubeMaterial = new THREE.MeshStandardMaterial({
    color: 0xd44f35,
    metalness: 0.15,
    roughness: 0.38,
  });
  tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
  trackGroup.add(tubeMesh);

  const lineGeometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(Math.max(48, points.length * 3)));
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0f8b8d, transparent: true, opacity: 0.5 });
  lineMesh = new THREE.Line(lineGeometry, lineMaterial);
  trackGroup.add(lineMesh);

  const pointGeometry = new THREE.BufferGeometry().setFromPoints(points);
  const pointMaterial = new THREE.PointsMaterial({ color: 0x243f36, size: 0.085 });
  pointCloud = new THREE.Points(pointGeometry, pointMaterial);
  trackGroup.add(pointCloud);
}

function normalizeTrackPoints(samples) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const raw = samples.map((sample) => new THREE.Vector3(sample.px, sample.py, sample.pz));

  raw.forEach((point) => {
    min.min(point);
    max.max(point);
  });

  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  const size = new THREE.Vector3().subVectors(max, min);
  const scale = 9 / Math.max(size.x, size.y, size.z, 0.01);

  return raw.map((point) => point.sub(center).multiplyScalar(scale));
}

function updateLiveMarker() {
  const source = state.samples.length ? state.samples[state.samples.length - 1] : state.live;
  if (!source) {
    liveMarker.visible = false;
    return;
  }

  liveMarker.visible = true;
  const points = normalizeTrackPoints(state.samples.length ? state.samples : [source]);
  const point = points[points.length - 1] || new THREE.Vector3();
  liveMarker.position.copy(point);
  liveMarker.rotation.set(
    THREE.MathUtils.degToRad(source.pitch),
    THREE.MathUtils.degToRad(source.heading),
    THREE.MathUtils.degToRad(-source.roll)
  );
}

function disposeObject(object) {
  if (!object) return;
  object.parent?.remove(object);
  object.geometry?.dispose();
  if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
  else object.material?.dispose();
}

function drawAcceleration() {
  const { width, height } = resizeCanvas(accelCanvas);
  accelCtx.clearRect(0, 0, width, height);
  accelCtx.fillStyle = "#17211d";
  accelCtx.fillRect(0, 0, width, height);

  const points = state.samples.slice(-260);
  if (points.length < 2) return;

  drawAccelLine(points, "x", "#ec7357", width, height);
  drawAccelLine(points, "y", "#4ecdc4", width, height);
  drawAccelLine(points, "z", "#f5c542", width, height);
}

function drawAccelLine(points, key, color, width, height) {
  const maxAbs = Math.max(1200, ...points.map((point) => Math.abs(point[key])));
  accelCtx.beginPath();
  points.forEach((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height / 2 - (point[key] / maxAbs) * (height * 0.42);
    if (index === 0) accelCtx.moveTo(x, y);
    else accelCtx.lineTo(x, y);
  });
  accelCtx.strokeStyle = color;
  accelCtx.lineWidth = 3;
  accelCtx.stroke();
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  download("bezier-follow-recording.json", JSON.stringify(state.samples, null, 2), "application/json");
}

function exportCsv() {
  const header = "relTime,x,y,z,pitch,roll,heading,g,px,py,pz,speed";
  const rows = state.samples.map((sample) => [
    sample.relTime.toFixed(3),
    sample.x,
    sample.y,
    sample.z,
    sample.pitch,
    sample.roll,
    sample.heading,
    sample.g.toFixed(4),
    sample.px.toFixed(4),
    sample.py.toFixed(4),
    sample.pz.toFixed(4),
    sample.speed.toFixed(4),
  ].join(","));
  download("bezier-follow-recording.csv", [header, ...rows].join("\n"), "text/csv");
}

function loop() {
  resizeScene();
  rebuildTrack();
  updateLiveMarker();
  drawAcceleration();
  trackGroup.rotation.y += 0.0012;
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

ui.connectButton.addEventListener("click", () => {
  if (state.connected) disconnectMicrobit();
  else connectMicrobit(false);
});
ui.scanAllButton.addEventListener("click", () => {
  if (!state.connected) connectMicrobit(true);
});
ui.recordButton.addEventListener("click", toggleRecording);
ui.simulateButton.addEventListener("click", toggleSimulation);
ui.resetButton.addEventListener("click", resetRecording);
ui.downloadJsonButton.addEventListener("click", exportJson);
ui.downloadCsvButton.addEventListener("click", exportCsv);
window.addEventListener("resize", () => {
  resizeScene();
  drawAcceleration();
});

updateUi();
loop();
