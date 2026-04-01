/* ============================================================
   Sensor Sonification & Visualization
   Web Bluetooth API + Canvas 2D + Web Audio API
   ============================================================ */

'use strict';

// ── BLE UUIDs ──────────────────────────────────────────────
const SERVICE_UUID        = '0000180a-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '00002a57-0000-1000-8000-00805f9b34fb';

// ── BLE state ──────────────────────────────────────────────
let bleDevice = null;
let bleServer = null;
let bleChar   = null;
let isConnected  = false;
let isReceiving  = false;
let isDemoMode   = false;
let demoTimer    = null;

// ── Stats ──────────────────────────────────────────────────
let pktCount  = 0;
let lastPktMs = 0;
let rateBuffer = [];

// ── Sensor state (latest values) ──────────────────────────
const sensor = {
  accel:  { x:0, y:0, z:0 },
  gyro:   { x:0, y:0, z:0 },
  mag:    { x:0, y:0, z:0 },
  grav:   { x:0, y:0, z:0 },
  light:  0,
  prox:   0,
  gpsSpeed: 0,
  gpsAlt:   0,
};

// ── Low-pass filter state ──────────────────────────────────
const lp = {
  accel:  { x:0, y:0, z:0 },
  gyro:   { x:0, y:0, z:0 },
  mag:    { x:0, y:0, z:0 },
  grav:   { x:0, y:0, z:0 },
  light:  0,
};
const LP_ALPHA = 0.18;   // smoothing coefficient (0=no update, 1=no filter)

function lpFilter(prev, next) {
  return prev + LP_ALPHA * (next - prev);
}

// ── Waveform ring buffers ──────────────────────────────────
const WAVE_LEN = 300;

function makeRingBuffer(channels) {
  const bufs = {};
  for (const ch of channels) bufs[ch] = new Float32Array(WAVE_LEN);
  let head = 0;
  return {
    push(vals) {
      for (const ch of channels) bufs[ch][head] = vals[ch] ?? 0;
      head = (head + 1) % WAVE_LEN;
    },
    get(ch) {
      // return ordered array starting from oldest
      const out = new Float32Array(WAVE_LEN);
      for (let i = 0; i < WAVE_LEN; i++) out[i] = bufs[ch][(head + i) % WAVE_LEN];
      return out;
    },
    channels,
  };
}

const ringAccel = makeRingBuffer(['x','y','z']);
const ringGyro  = makeRingBuffer(['x','y','z']);
const ringMag   = makeRingBuffer(['x','y','z']);
const ringGrav  = makeRingBuffer(['x','y','z']);

// ── Canvas references ──────────────────────────────────────
const canvases = {
  accel: document.getElementById('waveAccel'),
  gyro:  document.getElementById('waveGyro'),
  mag:   document.getElementById('waveMag'),
  grav:  document.getElementById('waveGrav'),
};

const ctxMap = {};
for (const [k, c] of Object.entries(canvases)) {
  ctxMap[k] = c.getContext('2d');
}

const radialCanvas = document.getElementById('radialCanvas');
const radialCtx    = radialCanvas.getContext('2d');

const specCanvas = document.getElementById('specCanvas');
const specCtx    = specCanvas.getContext('2d');

// ── Wave color palettes ────────────────────────────────────
const PALETTE = {
  x: '#7c6af7',
  y: '#4fc3f7',
  z: '#f06292',
};

// ── Web Audio ──────────────────────────────────────────────
let audioCtx   = null;
let masterGain = null;
let oscNodes   = {};   // { accel, gyro, light }
let filterNode = null;
let reverbNode = null;
let isSoundOn  = false;

function initAudio() {
  if (audioCtx) return;
  audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(audioCtx.destination);

  // Reverb (convolver approximation via delay + feedback)
  reverbNode = audioCtx.createDelay(0.5);
  reverbNode.delayTime.value = 0.25;
  const fbGain = audioCtx.createGain();
  fbGain.gain.value = 0.35;
  reverbNode.connect(fbGain);
  fbGain.connect(reverbNode);
  reverbNode.connect(masterGain);

  // Filter (gyro controls cutoff)
  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = 800;
  filterNode.Q.value = 1.5;
  filterNode.connect(reverbNode);
  filterNode.connect(masterGain);

  // Oscillator: accel magnitude → low drone
  const oAccel = audioCtx.createOscillator();
  oAccel.type = 'sine';
  oAccel.frequency.value = 60;
  const gAccel = audioCtx.createGain();
  gAccel.gain.value = 0.3;
  oAccel.connect(gAccel);
  gAccel.connect(filterNode);
  oAccel.start();
  oscNodes.accel = { osc: oAccel, gain: gAccel };

  // Oscillator: gyro magnitude → mid shimmer
  const oGyro = audioCtx.createOscillator();
  oGyro.type = 'triangle';
  oGyro.frequency.value = 220;
  const gGyro = audioCtx.createGain();
  gGyro.gain.value = 0.15;
  oGyro.connect(gGyro);
  gGyro.connect(filterNode);
  oGyro.start();
  oscNodes.gyro = { osc: oGyro, gain: gGyro };

  // Oscillator: light lux → high tone
  const oLight = audioCtx.createOscillator();
  oLight.type = 'sine';
  oLight.frequency.value = 440;
  const gLight = audioCtx.createGain();
  gLight.gain.value = 0.08;
  oLight.connect(gLight);
  gLight.connect(filterNode);
  oLight.start();
  oscNodes.light = { osc: oLight, gain: gLight };
}

function updateAudio() {
  if (!audioCtx || !isSoundOn) return;

  const now = audioCtx.currentTime;
  const T   = 0.08; // ramp time

  // Accel magnitude → volume + pitch
  const aMag = Math.sqrt(lp.accel.x**2 + lp.accel.y**2 + lp.accel.z**2);
  const aNorm = Math.min(aMag / 20, 1);
  oscNodes.accel.osc.frequency.setTargetAtTime(40 + aNorm * 120, now, T);
  oscNodes.accel.gain.gain.setTargetAtTime(0.25 + aNorm * 0.35, now, T);

  // Gyro magnitude → shimmer pitch
  const gMag = Math.sqrt(lp.gyro.x**2 + lp.gyro.y**2 + lp.gyro.z**2);
  const gNorm = Math.min(gMag / 5, 1);
  oscNodes.gyro.osc.frequency.setTargetAtTime(180 + gNorm * 300, now, T);
  oscNodes.gyro.gain.gain.setTargetAtTime(0.05 + gNorm * 0.2, now, T);

  // Light → high tone pitch
  const luxNorm = Math.min(lp.light / 1000, 1);
  oscNodes.light.osc.frequency.setTargetAtTime(300 + luxNorm * 800, now, T);

  // Gyro Z → filter cutoff (panning feel)
  const cutoff = 300 + Math.abs(lp.gyro.z) * 500;
  filterNode.frequency.setTargetAtTime(Math.min(cutoff, 4000), now, T);

  // Master volume
  masterGain.gain.setTargetAtTime(isSoundOn ? 0.55 : 0, now, 0.05);
}

// ── Drawing helpers ────────────────────────────────────────

function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
  }
}

function drawWaveform(ctx, canvas, ring, range) {
  resizeCanvas(canvas);
  const W = canvas.getBoundingClientRect().width;
  const H = canvas.getBoundingClientRect().height;

  ctx.clearRect(0, 0, W, H);

  // Background grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let y = 0; y <= 4; y++) {
    const yy = (y / 4) * H;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(W, yy);
    ctx.stroke();
  }
  // Zero line
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();

  const step = W / (WAVE_LEN - 1);

  for (const ch of ring.channels) {
    const data = ring.get(ch);
    const color = PALETTE[ch];

    // Glow pass
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = 8;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    for (let i = 0; i < WAVE_LEN; i++) {
      const x = i * step;
      const norm = Math.max(-1, Math.min(1, data[i] / range));
      const y = H / 2 - norm * (H / 2 - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Main line
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (let i = 0; i < WAVE_LEN; i++) {
      const x = i * step;
      const norm = Math.max(-1, Math.min(1, data[i] / range));
      const y = H / 2 - norm * (H / 2 - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Fade-out gradient on left edge (history fades)
  const fadeGrad = ctx.createLinearGradient(0, 0, W * 0.12, 0);
  fadeGrad.addColorStop(0, 'rgba(19,19,26,1)');
  fadeGrad.addColorStop(1, 'rgba(19,19,26,0)');
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(0, 0, W * 0.12, H);
}

// ── Radial IMU meter ───────────────────────────────────────
function drawRadial() {
  const canvas = radialCanvas;
  resizeCanvas(canvas);
  const W = canvas.getBoundingClientRect().width;
  const H = canvas.getBoundingClientRect().height;
  const cx = W / 2;
  const cy = H / 2;
  const R  = Math.min(cx, cy) - 16;

  radialCtx.clearRect(0, 0, W, H);

  // Background rings
  for (let i = 1; i <= 4; i++) {
    radialCtx.beginPath();
    radialCtx.arc(cx, cy, R * i / 4, 0, Math.PI * 2);
    radialCtx.strokeStyle = 'rgba(255,255,255,0.05)';
    radialCtx.lineWidth = 1;
    radialCtx.stroke();
  }

  // Axes
  const axes = [0, Math.PI/3, 2*Math.PI/3, Math.PI, 4*Math.PI/3, 5*Math.PI/3];
  for (const a of axes) {
    radialCtx.beginPath();
    radialCtx.moveTo(cx, cy);
    radialCtx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    radialCtx.strokeStyle = 'rgba(255,255,255,0.06)';
    radialCtx.lineWidth = 1;
    radialCtx.stroke();
  }

  // Vectors: accel (purple), gyro (cyan), mag (pink)
  const vectors = [
    { label:'Acc', x: lp.accel.x, y: lp.accel.y, z: lp.accel.z, scale: 20, color: '#7c6af7' },
    { label:'Gyr', x: lp.gyro.x,  y: lp.gyro.y,  z: lp.gyro.z,  scale: 5,  color: '#4fc3f7' },
    { label:'Mag', x: lp.mag.x,   y: lp.mag.y,   z: lp.mag.z,   scale: 80, color: '#f06292' },
  ];

  for (const v of vectors) {
    const mag = Math.sqrt(v.x**2 + v.y**2 + v.z**2);
    const norm = Math.min(mag / v.scale, 1);
    const angle = Math.atan2(v.y, v.x);
    const ex = cx + norm * R * Math.cos(angle);
    const ey = cy + norm * R * Math.sin(angle);

    // Glow
    radialCtx.save();
    radialCtx.shadowColor = v.color;
    radialCtx.shadowBlur  = 12;
    radialCtx.strokeStyle = v.color;
    radialCtx.lineWidth   = 2;
    radialCtx.globalAlpha = 0.5;
    radialCtx.beginPath();
    radialCtx.moveTo(cx, cy);
    radialCtx.lineTo(ex, ey);
    radialCtx.stroke();
    radialCtx.restore();

    // Line
    radialCtx.strokeStyle = v.color;
    radialCtx.lineWidth   = 1.5;
    radialCtx.globalAlpha = 0.9;
    radialCtx.beginPath();
    radialCtx.moveTo(cx, cy);
    radialCtx.lineTo(ex, ey);
    radialCtx.stroke();
    radialCtx.globalAlpha = 1;

    // Dot
    radialCtx.fillStyle = v.color;
    radialCtx.beginPath();
    radialCtx.arc(ex, ey, 3.5, 0, Math.PI * 2);
    radialCtx.fill();

    // Label
    radialCtx.fillStyle = v.color;
    radialCtx.font = '10px monospace';
    radialCtx.fillText(v.label, ex + 5, ey - 5);
  }

  // Center dot
  radialCtx.fillStyle = 'rgba(255,255,255,0.3)';
  radialCtx.beginPath();
  radialCtx.arc(cx, cy, 3, 0, Math.PI * 2);
  radialCtx.fill();
}

// ── Spectrum visualizer ────────────────────────────────────
// Simulated spectrum bars driven by sensor values (no FFT needed)
function drawSpectrum() {
  resizeCanvas(specCanvas);
  const W = specCanvas.getBoundingClientRect().width;
  const H = specCanvas.getBoundingClientRect().height;
  specCtx.clearRect(0, 0, W, H);

  const BARS = 32;
  const barW = W / BARS - 1;

  // Build bar heights from sensor data
  const aMag = Math.sqrt(lp.accel.x**2 + lp.accel.y**2 + lp.accel.z**2) / 20;
  const gMag = Math.sqrt(lp.gyro.x**2  + lp.gyro.y**2  + lp.gyro.z**2)  / 5;
  const mMag = Math.sqrt(lp.mag.x**2   + lp.mag.y**2   + lp.mag.z**2)   / 80;
  const luxN = Math.min(lp.light / 1000, 1);

  for (let i = 0; i < BARS; i++) {
    const t = i / (BARS - 1);
    // Blend accel (low) → gyro (mid) → light (high)
    let h;
    if (t < 0.4)      h = aMag * (1 - t/0.4) + gMag * (t/0.4);
    else if (t < 0.7) h = gMag * (1 - (t-0.4)/0.3) + mMag * ((t-0.4)/0.3);
    else              h = mMag * (1 - (t-0.7)/0.3) + luxN * ((t-0.7)/0.3);

    h = Math.min(h, 1);

    // Add jitter for liveliness
    h = h * (0.85 + 0.3 * Math.random());

    const barH = Math.max(2, h * (H - 4));
    const x = i * (barW + 1);
    const y = H - barH;

    // Color gradient low→high
    const r = Math.round(124 + t * (240-124));
    const g = Math.round(106 + t * (98-106));
    const b = Math.round(247 + t * (146-247));
    const color = `rgb(${r},${g},${b})`;

    specCtx.save();
    specCtx.shadowColor = color;
    specCtx.shadowBlur  = 6;
    specCtx.fillStyle   = color;
    specCtx.globalAlpha = 0.85;
    specCtx.beginPath();
    specCtx.roundRect(x, y, barW, barH, [2, 2, 0, 0]);
    specCtx.fill();
    specCtx.restore();
  }
}

// ── Gauge helpers ──────────────────────────────────────────
function setGauge(barId, valId, value, max, unit, decimals = 1) {
  const pct = Math.min(value / max * 100, 100);
  document.getElementById(barId).style.width = pct + '%';
  document.getElementById(valId).textContent = value.toFixed(decimals) + ' ' + unit;
}

// ── DOM value updates ──────────────────────────────────────
function updateDOM() {
  // Waveform numeric labels
  document.getElementById('aX').textContent = lp.accel.x.toFixed(2);
  document.getElementById('aY').textContent = lp.accel.y.toFixed(2);
  document.getElementById('aZ').textContent = lp.accel.z.toFixed(2);
  document.getElementById('gX').textContent = lp.gyro.x.toFixed(3);
  document.getElementById('gY').textContent = lp.gyro.y.toFixed(3);
  document.getElementById('gZ').textContent = lp.gyro.z.toFixed(3);
  document.getElementById('mX').textContent = lp.mag.x.toFixed(1);
  document.getElementById('mY').textContent = lp.mag.y.toFixed(1);
  document.getElementById('mZ').textContent = lp.mag.z.toFixed(1);
  document.getElementById('grX').textContent = lp.grav.x.toFixed(2);
  document.getElementById('grY').textContent = lp.grav.y.toFixed(2);
  document.getElementById('grZ').textContent = lp.grav.z.toFixed(2);

  // Gauges
  setGauge('luxBar',   'luxVal',   lp.light,         1000, 'lux', 0);
  setGauge('proxBar',  'proxVal',  sensor.prox,       30,   'cm',  1);
  setGauge('speedBar', 'speedVal', sensor.gpsSpeed,   30,   'm/s', 2);
  setGauge('altBar',   'altVal',   Math.max(0, sensor.gpsAlt), 500, 'm', 0);
}

// ── Main animation loop ────────────────────────────────────
function animLoop() {
  requestAnimationFrame(animLoop);

  // Push current LP values to ring buffers
  ringAccel.push(lp.accel);
  ringGyro.push(lp.gyro);
  ringMag.push(lp.mag);
  ringGrav.push(lp.grav);

  // Draw
  drawWaveform(ctxMap.accel, canvases.accel, ringAccel, 20);
  drawWaveform(ctxMap.gyro,  canvases.gyro,  ringGyro,  5);
  drawWaveform(ctxMap.mag,   canvases.mag,   ringMag,   80);
  drawWaveform(ctxMap.grav,  canvases.grav,  ringGrav,  12);

  drawRadial();
  drawSpectrum();
  updateDOM();
  updateAudio();
}

// ── Ingest sensor data ─────────────────────────────────────
function ingestData(data) {
  if (data.accelerometer) {
    sensor.accel = data.accelerometer;
    lp.accel.x = lpFilter(lp.accel.x, data.accelerometer.x);
    lp.accel.y = lpFilter(lp.accel.y, data.accelerometer.y);
    lp.accel.z = lpFilter(lp.accel.z, data.accelerometer.z);
  }
  if (data.gyroscope) {
    sensor.gyro = data.gyroscope;
    lp.gyro.x = lpFilter(lp.gyro.x, data.gyroscope.x);
    lp.gyro.y = lpFilter(lp.gyro.y, data.gyroscope.y);
    lp.gyro.z = lpFilter(lp.gyro.z, data.gyroscope.z);
  }
  if (data.magnetometer) {
    sensor.mag = data.magnetometer;
    lp.mag.x = lpFilter(lp.mag.x, data.magnetometer.x);
    lp.mag.y = lpFilter(lp.mag.y, data.magnetometer.y);
    lp.mag.z = lpFilter(lp.mag.z, data.magnetometer.z);
  }
  if (data.gravity) {
    sensor.grav = data.gravity;
    lp.grav.x = lpFilter(lp.grav.x, data.gravity.x);
    lp.grav.y = lpFilter(lp.grav.y, data.gravity.y);
    lp.grav.z = lpFilter(lp.grav.z, data.gravity.z);
  }
  if (data.light)     { sensor.light = data.light.lux;   lp.light = lpFilter(lp.light, data.light.lux); }
  if (data.proximity) { sensor.prox  = data.proximity.distance; }
  if (data.gps)       { sensor.gpsSpeed = data.gps.speed || 0; sensor.gpsAlt = data.gps.altitude || 0; }

  // Stats
  const now = Date.now();
  pktCount++;
  document.getElementById('pktCount').textContent = pktCount;
  document.getElementById('lastTime').textContent = new Date(now).toLocaleTimeString('ja-JP');

  if (lastPktMs > 0) {
    rateBuffer.push(1000 / (now - lastPktMs));
    if (rateBuffer.length > 20) rateBuffer.shift();
    const avg = rateBuffer.reduce((a,b)=>a+b,0) / rateBuffer.length;
    document.getElementById('sampleRate').textContent = avg.toFixed(1) + ' Hz';
  }
  lastPktMs = now;
}

// ── BLE ────────────────────────────────────────────────────
async function connectBLE() {
  if (!navigator.bluetooth) {
    alert('このブラウザはWeb Bluetooth APIをサポートしていません。\nChrome / Edge をお使いください。');
    return;
  }
  try {
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID],
    });
    bleDevice.addEventListener('gattserverdisconnected', onBLEDisconnect);
    bleServer = await bleDevice.gatt.connect();
    const svc = await bleServer.getPrimaryService(SERVICE_UUID);
    bleChar   = await svc.getCharacteristic(CHARACTERISTIC_UUID);

    isConnected = true;
    document.getElementById('deviceName').textContent = bleDevice.name || 'Unknown';
    updateUI();
    hideOverlay();
    console.log('BLE connected. Characteristic:', bleChar);
    console.log('Properties:', bleChar.properties);
  } catch (e) {
    console.error('connectBLE error:', e);
    if (e.name !== 'NotFoundError') alert('接続エラー: ' + e.message);
  }
}

async function disconnectBLE() {
  if (isReceiving) await stopReceiving();
  if (bleServer?.connected) bleServer.disconnect();
  isConnected = false;
  bleDevice = bleServer = bleChar = null;
  document.getElementById('deviceName').textContent = '—';
  updateUI();
}

function onBLEDisconnect() {
  isConnected = isReceiving = false;
  updateUI();
}

async function startReceiving() {
  if (!bleChar) {
    alert('デバイスが接続されていません');
    return;
  }
  try {
    console.log('startReceiving: bleChar =', bleChar);
    console.log('startReceiving: properties =', bleChar.properties);
    bleChar.addEventListener('characteristicvaluechanged', onBLEData);
    await bleChar.startNotifications();
    isReceiving = true;
    updateUI();
    console.log('Notifications started successfully');
  } catch (e) {
    console.error('startReceiving error:', e);
    alert('データ受信の開始に失敗しました: ' + e.message);
  }
}

async function stopReceiving() {
  if (!bleChar) return;
  try {
    await bleChar.stopNotifications();
    bleChar.removeEventListener('characteristicvaluechanged', onBLEData);
  } catch(e) {
    console.warn('stopReceiving error:', e);
  }
  isReceiving = false;
  updateUI();
}

// BLE packet buffer for fragmented JSON
let bleBuffer = '';

function onBLEData(event) {
  try {
    const chunk = new TextDecoder('utf-8').decode(event.target.value);
    bleBuffer += chunk;

    // Try to parse accumulated buffer
    // Look for complete JSON object
    const start = bleBuffer.indexOf('{');
    const end   = bleBuffer.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const jsonStr = bleBuffer.slice(start, end + 1);
      try {
        const data = JSON.parse(jsonStr);
        bleBuffer = bleBuffer.slice(end + 1); // keep remainder
        ingestData(data);
      } catch(e) {
        // Incomplete JSON — keep buffering
        // But if buffer gets too large, reset it
        if (bleBuffer.length > 4096) {
          console.warn('BLE buffer overflow, resetting');
          bleBuffer = '';
        }
      }
    } else if (bleBuffer.length > 4096) {
      console.warn('BLE buffer overflow (no JSON found), resetting');
      bleBuffer = '';
    }
  } catch(e) {
    console.warn('onBLEData error:', e);
    bleBuffer = '';
  }
}

// ── Demo mode ──────────────────────────────────────────────
let demoT = 0;

function startDemo() {
  isDemoMode = true;
  document.getElementById('demoBanner').style.display = 'block';
  document.getElementById('deviceName').textContent = 'Demo';
  document.getElementById('statusText').textContent = 'デモ受信中';
  const pill = document.getElementById('statusPill');
  pill.className = 'pill receiving';
  hideOverlay();

  demoTimer = setInterval(() => {
    demoT += 0.05;
    const t = demoT;
    const fake = {
      timestamp: Date.now(),
      accelerometer: {
        x: Math.sin(t * 1.3) * 3 + Math.sin(t * 5.1) * 0.5,
        y: Math.cos(t * 0.9) * 4 + Math.sin(t * 3.7) * 0.8,
        z: 9.8 + Math.sin(t * 2.1) * 1.2,
      },
      gyroscope: {
        x: Math.sin(t * 2.5) * 0.8,
        y: Math.cos(t * 1.8) * 0.6,
        z: Math.sin(t * 3.3) * 0.4,
      },
      magnetometer: {
        x: Math.sin(t * 0.4) * 30 + 15,
        y: Math.cos(t * 0.6) * 25 - 10,
        z: Math.sin(t * 0.3) * 40 + 20,
      },
      gravity: {
        x: Math.sin(t * 0.7) * 2,
        y: Math.cos(t * 0.5) * 3,
        z: 9.5 + Math.sin(t * 1.1) * 0.5,
      },
      light:     { lux: 200 + Math.sin(t * 0.2) * 150 + Math.random() * 20 },
      proximity: { distance: 5 + Math.sin(t * 1.5) * 4 },
      gps:       { latitude: 35.6895, longitude: 139.6917, altitude: 50 + Math.sin(t * 0.1) * 10, speed: Math.abs(Math.sin(t * 0.3)) * 2, accuracy: 10 },
    };
    ingestData(fake);
  }, 30);
}

function stopDemo() {
  clearInterval(demoTimer);
  isDemoMode = false;
  document.getElementById('demoBanner').style.display = 'none';
}

// ── UI helpers ─────────────────────────────────────────────
function updateUI() {
  const pill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');

  if (isReceiving) {
    pill.className = 'pill receiving';
    statusText.textContent = '受信中';
  } else if (isConnected) {
    pill.className = 'pill connected';
    statusText.textContent = '接続済み';
  } else {
    pill.className = 'pill disconnected';
    statusText.textContent = '未接続';
  }

  document.getElementById('connectBtn').disabled    = isConnected;
  document.getElementById('disconnectBtn').disabled = !isConnected;
  document.getElementById('startBtn').disabled      = !isConnected || isReceiving;
  document.getElementById('stopBtn').disabled       = !isReceiving;
}

function hideOverlay() {
  const ov = document.getElementById('idleOverlay');
  ov.classList.add('hidden');
  setTimeout(() => { ov.style.display = 'none'; }, 500);
}

// ── Sound toggle ───────────────────────────────────────────
function toggleSound() {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  isSoundOn = !isSoundOn;
  const btn = document.getElementById('soundBtn');
  if (isSoundOn) {
    btn.textContent = '🔊 サウンドOFF';
    btn.style.background = 'rgba(171,71,188,0.3)';
    masterGain.gain.setTargetAtTime(0.55, audioCtx.currentTime, 0.05);
  } else {
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg> サウンドON`;
    btn.style.background = '';
    masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
  }
}

// ── Event listeners ────────────────────────────────────────
document.getElementById('connectBtn').addEventListener('click', connectBLE);
document.getElementById('overlayConnectBtn').addEventListener('click', connectBLE);
document.getElementById('disconnectBtn').addEventListener('click', disconnectBLE);
document.getElementById('startBtn').addEventListener('click', startReceiving);
document.getElementById('stopBtn').addEventListener('click', stopReceiving);
document.getElementById('soundBtn').addEventListener('click', toggleSound);
document.getElementById('overlayDemoBtn').addEventListener('click', startDemo);

// ── Boot ───────────────────────────────────────────────────
updateUI();
animLoop();
