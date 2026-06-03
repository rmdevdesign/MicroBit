import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

const TRACK_SPEED = 1;
const DIRECTION_SMOOTHING = 0.22;
const HEADING_OFFSET_DEGREES = 0;
const PITCH_SIGN = -1;
const MOTION_SCORE_SMOOTHING = 0.35;
const MOTION_START_THRESHOLD = 110;
const MOTION_STOP_THRESHOLD = 55;
const MOTION_START_SAMPLES = 2;
const MOTION_STOP_SAMPLES = 6;

const state = {
  port: null,
  reader: null,
  reading: false,
  connected: false,
  buffer: "",
  recording: false,
  simulating: false,
  samples: [],
  live: null,
  startedAt: 0,
  lastSampleAt: 0,
  lastReceivedAt: 0,
  recordingStartedAt: 0,
  recordingWatchdog: 0,
  direction: null,
  previousAcceleration: null,
  motionScore: 0,
  moving: false,
  movingSamples: 0,
  stationarySamples: 0,
  velocity: { x: 0, y: 0, z: 0 },
  position: { x: 0, y: 0, z: 0 },
  gMax: 0,
  renderVersion: 0,
  renderedVersion: -1,
};

const ui = {
  status: document.querySelector("#status"),
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  recordButton: document.querySelector("#recordButton"),
  simulateButton: document.querySelector("#simulateButton"),
  importButton: document.querySelector("#importButton"),
  importFileInput: document.querySelector("#importFileInput"),
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
emptyLabel.textContent = "Connecter USB, Simulation ou Importer pour tracer la trajectoire 3D";
document.querySelector(".visualizer").appendChild(emptyLabel);

const liveMarker = createMarker();
trackGroup.add(liveMarker);

let tubeMesh = null;
let lineMesh = null;
let pointCloud = null;
let trackEndpoint = null;

function createMarker() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.22, 0.45),
    new THREE.MeshStandardMaterial({ color: 0xd44f35, metalness: 0.18, roughness: 0.42 })
  );
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.36, 18),
    new THREE.MeshStandardMaterial({ color: 0x0f8b8d, metalness: 0.12, roughness: 0.35 })
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.4;
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
  }

  const dt = Math.min((sample.t - state.lastSampleAt) / 1000, 0.12);
  state.lastSampleAt = sample.t;

  const direction = smoothDirection(state.direction, directionFromOrientation(sample));
  state.direction = direction;
  const moving = detectMotion(state, sample);
  const speed = moving ? TRACK_SPEED : 0;
  state.velocity = {
    x: direction.x * speed,
    y: direction.y * speed,
    z: direction.z * speed,
  };
  state.position.x += state.velocity.x * dt;
  state.position.y += state.velocity.y * dt;
  state.position.z += state.velocity.z * dt;

  return {
    ...sample,
    relTime: (sample.t - state.startedAt) / 1000,
    px: state.position.x,
    py: state.position.y,
    pz: state.position.z,
    moving,
    motionScore: state.motionScore,
    speed: Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z),
  };
}

function directionFromOrientation(sample) {
  const heading = ((sample.heading + HEADING_OFFSET_DEGREES) * Math.PI) / 180;
  const pitch = (sample.pitch * PITCH_SIGN * Math.PI) / 180;
  const horizontal = Math.cos(pitch);

  return {
    x: Math.sin(heading) * horizontal,
    y: Math.sin(pitch),
    z: Math.cos(heading) * horizontal,
  };
}

function smoothDirection(previous, next) {
  if (!previous) return next;

  const x = previous.x + (next.x - previous.x) * DIRECTION_SMOOTHING;
  const y = previous.y + (next.y - previous.y) * DIRECTION_SMOOTHING;
  const z = previous.z + (next.z - previous.z) * DIRECTION_SMOOTHING;
  const length = Math.hypot(x, y, z) || 1;

  return { x: x / length, y: y / length, z: z / length };
}

function detectMotion(motionState, sample) {
  const previous = motionState.previousAcceleration;
  motionState.previousAcceleration = { x: sample.x, y: sample.y, z: sample.z };
  if (!previous) return false;

  const accelerationDelta = Math.hypot(
    sample.x - previous.x,
    sample.y - previous.y,
    sample.z - previous.z
  );
  motionState.motionScore += (accelerationDelta - motionState.motionScore) * MOTION_SCORE_SMOOTHING;

  if (motionState.moving) {
    motionState.stationarySamples = motionState.motionScore < MOTION_STOP_THRESHOLD
      ? motionState.stationarySamples + 1
      : 0;
    if (motionState.stationarySamples >= MOTION_STOP_SAMPLES) {
      motionState.moving = false;
      motionState.movingSamples = 0;
    }
  } else {
    motionState.movingSamples = motionState.motionScore > MOTION_START_THRESHOLD
      ? motionState.movingSamples + 1
      : 0;
    if (motionState.movingSamples >= MOTION_START_SAMPLES) {
      motionState.moving = true;
      motionState.stationarySamples = 0;
    }
  }

  return motionState.moving;
}

function handleSample(payload) {
  const sample = integrate(normalizePayload(payload));
  state.live = sample;
  state.lastReceivedAt = performance.now();
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
    handleSample(parseTelemetryLine(trimmed));
    setStatus(state.recording ? "Recording en cours" : "Flux USB actif");
  } catch {
    setStatus(`Trame ignoree: ${trimmed}`, true);
  }
}

function parseTelemetryLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    const fallback = parseLooseTelemetryLine(line);
    if (fallback) return fallback;
    throw new Error("Invalid telemetry line");
  }
}

function parseLooseTelemetryLine(line) {
  const aliases = {
    x: ["x"],
    y: ["y"],
    z: ["z"],
    pitch: ["pitch", "pich"],
    roll: ["roll", "rol"],
    heading: ["heading", "hedin"],
  };
  const result = {};

  for (const [key, names] of Object.entries(aliases)) {
    const value = findLooseNumber(line, names);
    if (value === null) return null;
    result[key] = value;
  }

  return result;
}

function findLooseNumber(line, names) {
  for (const name of names) {
    const pattern = new RegExp(`["']?${name}["']?\\s*:?\\s*(-?\\d+(?:\\.\\d+)?)`, "i");
    const match = line.match(pattern);
    if (match) return Number(match[1]);
  }

  return null;
}

function handleSerialChunk(value) {
  state.buffer += decoder.decode(value, { stream: true });
  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() || "";
  lines.forEach(parseLine);
}

async function connectMicrobitUsb() {
  if (!navigator.serial) {
    setStatus("Web Serial non disponible. Utilise Chrome ou Edge.", true);
    return;
  }

  try {
    setStatus("Selection du port USB micro:bit...");
    ui.connectButton.disabled = true;

    state.port = await navigator.serial.requestPort({
      filters: [
        { usbVendorId: 0x0d28 },
        { usbVendorId: 0x1366 },
      ],
    });
    await state.port.open({ baudRate: 115200 });

    state.connected = true;
    state.reading = true;
    state.buffer = "";
    ui.disconnectButton.disabled = false;
    ui.recordButton.disabled = false;
    setStatus("Connecte en USB. En attente de trames...");

    state.reader = state.port.readable.getReader();
    while (state.reading) {
      const { value, done } = await state.reader.read();
      if (done) break;
      if (value) handleSerialChunk(value);
    }
  } catch (error) {
    if (state.reading) {
      setStatus(error?.message || "Connexion USB impossible", true);
    } else {
      setStatus(error?.name === "NotFoundError" ? "Selection USB annulee" : error?.message || "Connexion USB impossible", true);
    }
  } finally {
    if (!state.connected) {
      ui.connectButton.disabled = false;
      ui.disconnectButton.disabled = true;
      ui.recordButton.disabled = !state.simulating;
    }
  }
}

async function disconnectMicrobitUsb() {
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
  state.connected = false;
  state.buffer = "";
  ui.connectButton.disabled = false;
  ui.disconnectButton.disabled = true;
  ui.recordButton.disabled = !state.simulating;
  setStatus("Deconnecte");
}

function toggleRecording() {
  if (!state.connected && !state.simulating) {
    setStatus("Connecte le micro:bit en USB, lance Simulation, ou importe un fichier JSON/CSV.", true);
    return;
  }

  state.recording = !state.recording;
  state.recordingStartedAt = state.recording ? performance.now() : 0;
  window.clearTimeout(state.recordingWatchdog);
  state.recordingWatchdog = 0;
  ui.recordButton.textContent = state.recording ? "Stop recording" : "Start recording";
  ui.recordButton.classList.toggle("is-recording", state.recording);

  if (state.recording && state.samples.length === 0) {
    resetMotionOnly();
  }

  if (state.recording) {
    setStatus(state.simulating && !state.connected ? "Recording simulation en cours" : "Recording USB en cours");
  } else {
    setStatus("Recording stoppe");
  }
  updateUi();
}

function resetMotionOnly() {
  state.startedAt = 0;
  state.lastSampleAt = 0;
  state.direction = null;
  state.previousAcceleration = null;
  state.motionScore = 0;
  state.moving = false;
  state.movingSamples = 0;
  state.stationarySamples = 0;
  state.velocity = { x: 0, y: 0, z: 0 };
  state.position = { x: 0, y: 0, z: 0 };
}

function resetRecording() {
  state.samples = [];
  if (!state.simulating) state.live = null;
  resetMotionOnly();
  trackEndpoint = null;
  state.gMax = 0;
  state.recording = false;
  state.recordingStartedAt = 0;
  window.clearTimeout(state.recordingWatchdog);
  state.recordingWatchdog = 0;
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
    state.recording = false;
    ui.recordButton.textContent = "Start recording";
    ui.recordButton.classList.remove("is-recording");
    ui.recordButton.disabled = !state.connected;
    setStatus(state.connected ? "Connecte en USB" : "Pret");
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
  trackEndpoint = null;

  if (state.samples.length < 2) return;

  const points = normalizeTrackPoints(state.samples);
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.42);
  trackEndpoint = curve.getPoint(1);
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
  if (state.samples.length > 1 && trackEndpoint) {
    liveMarker.position.copy(trackEndpoint);
  } else {
    const points = normalizeTrackPoints(state.samples.length ? state.samples : [source]);
    liveMarker.position.copy(points[points.length - 1] || new THREE.Vector3());
  }
  liveMarker.rotation.set(
    THREE.MathUtils.degToRad(-source.pitch * PITCH_SIGN),
    THREE.MathUtils.degToRad(source.heading + HEADING_OFFSET_DEGREES),
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
  const header = "relTime,x,y,z,pitch,roll,heading,g,px,py,pz,moving,motionScore,speed";
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
    sample.moving ? 1 : 0,
    sample.motionScore.toFixed(2),
    sample.speed.toFixed(4),
  ].join(","));
  download("bezier-follow-recording.csv", [header, ...rows].join("\n"), "text/csv");
}

function importRecording() {
  ui.importFileInput.click();
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const imported = file.name.toLowerCase().endsWith(".csv")
      ? parseCsvRecording(text)
      : parseJsonRecording(text);

    loadImportedSamples(imported);
    setStatus(`${imported.length} samples importes`);
  } catch (error) {
    setStatus(error?.message || "Import impossible", true);
  }
}

function parseJsonRecording(text) {
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : parsed.samples;
  if (!Array.isArray(rows)) throw new Error("JSON invalide: tableau de samples attendu.");
  return rows.map((row) => normalizeImportedRow(row));
}

function parseCsvRecording(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV invalide: en-tete et lignes attendus.");

  const headers = lines[0].split(",").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    return normalizeImportedRow(row);
  });
}

function normalizeImportedRow(row) {
  const relTime = Number(row.relTime ?? row.t ?? 0);
  const px = Number(row.px);
  const py = Number(row.py);
  const pz = Number(row.pz);
  const motionScore = Number(row.motionScore);

  return {
    relTime: Number.isFinite(relTime) ? relTime : 0,
    x: Number(row.x) || 0,
    y: Number(row.y) || 0,
    z: Number(row.z) || 0,
    pitch: Number(row.pitch) || 0,
    roll: Number(row.roll) || 0,
    heading: Number(row.heading) || 0,
    g: Number(row.g) || Math.hypot(Number(row.x) || 0, Number(row.y) || 0, Number(row.z) || 0) / 1024,
    px: Number.isFinite(px) ? px : null,
    py: Number.isFinite(py) ? py : null,
    pz: Number.isFinite(pz) ? pz : null,
    moving: row.moving === true || row.moving === "true" || Number(row.moving) === 1,
    motionScore: Number.isFinite(motionScore) ? motionScore : null,
    speed: Number(row.speed) || 0,
  };
}

function loadImportedSamples(samples) {
  if (!samples.length) throw new Error("Aucun sample a importer.");
  state.samples = completeImportedMotion(samples);
  state.live = state.samples[state.samples.length - 1];
  state.gMax = Math.max(...state.samples.map((sample) => sample.g || 0));
  state.recording = false;
  state.simulating = false;
  window.clearInterval(simulationTimer);
  state.connected = Boolean(state.port);
  ui.simulateButton.textContent = "Simulation";
  ui.recordButton.textContent = "Start recording";
  ui.recordButton.classList.remove("is-recording");
  ui.recordButton.disabled = !state.connected;
  state.renderVersion += 1;
  updateUi();
}

function completeImportedMotion(samples) {
  const hasPositions = samples.some((sample) => sample.px || sample.py || sample.pz)
    && samples.every((sample) => Number.isFinite(sample.motionScore));
  if (hasPositions) {
    return samples.map((sample) => ({
      ...sample,
      px: sample.px || 0,
      py: sample.py || 0,
      pz: sample.pz || 0,
    }));
  }

  let direction = null;
  const motionState = {
    previousAcceleration: null,
    motionScore: 0,
    moving: false,
    movingSamples: 0,
    stationarySamples: 0,
  };
  let velocity = { x: 0, y: 0, z: 0 };
  let position = { x: 0, y: 0, z: 0 };
  let previousTime = samples[0].relTime || 0;

  return samples.map((sample, index) => {
    const relTime = sample.relTime || index * 0.05;
    const dt = Math.min(Math.max(relTime - previousTime, 0.05), 0.12);
    previousTime = relTime;

    direction = smoothDirection(direction, directionFromOrientation(sample));
    const moving = detectMotion(motionState, sample);
    const speed = moving ? TRACK_SPEED : 0;
    velocity = {
      x: direction.x * speed,
      y: direction.y * speed,
      z: direction.z * speed,
    };
    position = {
      x: position.x + velocity.x * dt,
      y: position.y + velocity.y * dt,
      z: position.z + velocity.z * dt,
    };

    return {
      ...sample,
      relTime,
      px: position.x,
      py: position.y,
      pz: position.z,
      moving,
      motionScore: motionState.motionScore,
      speed: Math.hypot(velocity.x, velocity.y, velocity.z),
    };
  });
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

ui.connectButton.addEventListener("click", connectMicrobitUsb);
ui.disconnectButton.addEventListener("click", disconnectMicrobitUsb);
ui.recordButton.addEventListener("click", toggleRecording);
ui.simulateButton.addEventListener("click", toggleSimulation);
ui.importButton.addEventListener("click", importRecording);
ui.importFileInput.addEventListener("change", handleImportFile);
ui.resetButton.addEventListener("click", resetRecording);
ui.downloadJsonButton.addEventListener("click", exportJson);
ui.downloadCsvButton.addEventListener("click", exportCsv);
window.addEventListener("resize", () => {
  resizeScene();
  drawAcceleration();
});

updateUi();
loop();
