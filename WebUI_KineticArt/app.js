'use strict';

// ══════════════════════════════════════════════════════
//  BLE 設定
// ══════════════════════════════════════════════════════
const SERVICE_UUID        = '0000180a-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '00002a57-0000-1000-8000-00805f9b34fb';

// ══════════════════════════════════════════════════════
//  グローバル状態
// ══════════════════════════════════════════════════════
let bleDevice = null, bleServer = null, bleChar = null;
let isConnected = false, isReceiving = false, isDemoMode = false;
let packetCount = 0;
let dataBuffer = '';

const raw = { ax:0, ay:0, az:0, gx:0, gy:0, gz:0, mx:0, my:0, mz:0, lux:0, proximity:0 };
const smooth = { ax:0, ay:0, az:0, gx:0, gy:0, gz:0, mx:0, my:0, mz:0, lux:0 };
const ALPHA = 0.08;

const u = { accelMag:0, gyroMag:0, magMag:0, lightNorm:0, tiltX:0, tiltY:0, impactDecay:0 };
let prevAccelMag = 0;
let impactCount = 0;
let artMode = 0;
const modeNames = ['FLOW FIELD', 'REACTION DIFFUSION', 'LISSAJOUS WEB', 'MAGNETIC FIELD'];

// ══════════════════════════════════════════════════════
//  WebGL 初期化
// ══════════════════════════════════════════════════════
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
if (!gl) { alert('WebGL not supported'); }

let W = 0, H = 0;
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  gl.viewport(0, 0, W, H);
  if (rdFBOs.length > 0) initRDTextures();
}
window.addEventListener('resize', resize);

function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader error:', gl.getShaderInfoLog(s));
  }
  return s;
}
function createProgram(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    console.error('Link error:', gl.getProgramInfoLog(p));
  return p;
}

const quadVS = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

function bindQuad(prog) {
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

// ══════════════════════════════════════════════════════
//  共通ノイズ関数（全シェーダーで使用）
// ══════════════════════════════════════════════════════
const NOISE_GLSL = `
precision mediump float;
float hash(vec2 p){
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash(i);
  float b = hash(i+vec2(1,0));
  float c = hash(i+vec2(0,1));
  float d = hash(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){
    v += a * noise(p);
    p = p * 2.0 + vec2(5.2, 1.3);
    a *= 0.5;
  }
  return v;
}
`;

// ══════════════════════════════════════════════════════
//  MODE 0: Flow Field
// ══════════════════════════════════════════════════════
const flowFS = NOISE_GLSL + `
varying vec2 v_uv;
uniform float u_time;
uniform float u_accel;
uniform float u_gyro;
uniform float u_mag;
uniform float u_light;
uniform float u_tiltX;
uniform float u_tiltY;
uniform float u_impact;
uniform vec2  u_res;

#define PI 3.14159265358979

vec3 hsv(float h, float s, float v){
  vec3 c = abs(fract(h+vec3(0,2,1)/3.0)*6.0-3.0);
  return v * mix(vec3(1.0), clamp(c-1.0,0.0,1.0), s);
}

void main(){
  vec2 uv = v_uv;
  vec2 p  = (uv - 0.5) * vec2(u_res.x/u_res.y, 1.0);
  p += vec2(u_tiltX, u_tiltY) * 0.12;

  float t = u_time * 0.3;
  float scale = 2.5 + u_accel * 2.0;

  // フローフィールドの角度
  float angle = fbm(p * scale + vec2(t, t*0.7)) * PI * 4.0
              + u_tiltX * 1.2 + u_gyro * 2.0;

  // 流線の密度
  vec2 dir = vec2(cos(angle), sin(angle));
  float lines = sin(dot(p, dir) * 40.0 + t * 2.0) * 0.5 + 0.5;
  lines = pow(lines, 3.0 + u_accel * 4.0);

  // 渦巻き
  float curl = fbm(p * (scale*0.7) + vec2(-t*0.5, t*0.3));
  float swirl = sin(atan(p.y, p.x) * 6.0 + curl * 8.0 - t * 1.5) * 0.5 + 0.5;

  // カラー
  float hue = fbm(p * 1.5 + t * 0.1) + u_gyro * 0.3 + u_mag * 0.2;
  vec3 col = hsv(hue, 0.9, 1.0) * lines * (0.7 + u_light * 0.3);
  col += hsv(hue + 0.3, 0.7, 0.6) * swirl * 0.4 * (0.5 + u_accel);

  // インパクトリング
  float dist = length(p);
  float ring = exp(-abs(dist - u_impact * 1.2) * 15.0) * u_impact * 2.0;
  col += vec3(1.0, 0.5, 0.1) * ring;

  // 背景グロー
  col += vec3(0.0, 0.03, 0.06) * fbm(p * 2.0 + t * 0.05);

  // ビネット
  float vign = 1.0 - smoothstep(0.4, 1.2, length(uv-0.5)*2.0);
  col *= vign;
  col = col / (col + 0.5);
  col = pow(col, vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}`;

// ══════════════════════════════════════════════════════
//  MODE 1: Reaction Diffusion (Gray-Scott) シミュレーション
// ══════════════════════════════════════════════════════
const rdSimFS = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_prev;
uniform vec2 u_res;
uniform float u_feed;
uniform float u_kill;
uniform float u_impact;

void main(){
  vec2 px = 1.0 / u_res;
  vec4 c  = texture2D(u_prev, v_uv);
  float A = c.r, B = c.g;
  float lapA = (texture2D(u_prev,v_uv+vec2(0,px.y)).r
              + texture2D(u_prev,v_uv-vec2(0,px.y)).r
              + texture2D(u_prev,v_uv+vec2(px.x,0)).r
              + texture2D(u_prev,v_uv-vec2(px.x,0)).r - 4.0*A);
  float lapB = (texture2D(u_prev,v_uv+vec2(0,px.y)).g
              + texture2D(u_prev,v_uv-vec2(0,px.y)).g
              + texture2D(u_prev,v_uv+vec2(px.x,0)).g
              + texture2D(u_prev,v_uv-vec2(px.x,0)).g - 4.0*B);
  float rxn = A*B*B;
  float dA = 1.0*lapA - rxn + u_feed*(1.0-A);
  float dB = 0.5*lapB + rxn - (u_kill+u_feed)*B;
  float inject = smoothstep(0.07,0.0,length(v_uv-0.5)) * u_impact * 0.8;
  gl_FragColor = vec4(clamp(A+dA,0.,1.), clamp(B+dB+inject,0.,1.), 0., 1.);
}`;

const rdRenderFS = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_light;
void main(){
  vec4 c = texture2D(u_tex, v_uv);
  float p = clamp(c.r - c.g, 0., 1.);
  vec3 col1 = vec3(0.0, 1.0, 0.8);
  vec3 col2 = vec3(1.0, 0.15, 0.4);
  vec3 col3 = vec3(0.04, 0.0, 0.12);
  vec3 col = mix(col2, col3, smoothstep(0.3,0.6,p));
  col = mix(col, col1, smoothstep(0.6,0.9,p));
  col *= (0.5 + u_light*0.5);
  col *= 1.0 - smoothstep(0.4,1.2,length(v_uv-0.5)*2.0);
  gl_FragColor = vec4(col, 1.0);
}`;

// ══════════════════════════════════════════════════════
//  MODE 2: Lissajous Web
// ══════════════════════════════════════════════════════
const lissFS = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_accel;
uniform float u_gyro;
uniform float u_mag;
uniform float u_light;
uniform float u_tiltX;
uniform float u_tiltY;
uniform float u_impact;
uniform vec2  u_res;

#define PI 3.14159265358979

vec3 hsv(float h, float s, float v){
  vec3 c = abs(fract(h+vec3(0,2,1)/3.0)*6.0-3.0);
  return v * mix(vec3(1.0), clamp(c-1.0,0.0,1.0), s);
}

float lissLine(vec2 p, float fx, float fy, float ph, float t, float w){
  float md = 1e6;
  vec2 prev = vec2(cos(ph), sin(ph));
  for(int i=1; i<=80; i++){
    float theta = float(i)/80.0*PI*2.0;
    vec2 pt = vec2(cos(theta*fx + t*0.4), sin(theta*fy + ph + t*0.3));
    vec2 pa = p-prev, ba = pt-prev;
    float h2 = clamp(dot(pa,ba)/dot(ba,ba),0.,1.);
    md = min(md, length(pa-ba*h2));
    prev = pt;
  }
  return smoothstep(w, 0., md);
}

void main(){
  vec2 uv = v_uv;
  vec2 p  = (uv-0.5)*vec2(u_res.x/u_res.y,1.0)*0.9;
  p -= vec2(u_tiltX,u_tiltY)*0.08;
  float t = u_time;
  vec3 col = vec3(0.0);

  for(int i=0; i<8; i++){
    float fi = float(i)/8.0;
    float fx = 1.0 + floor(fi*4.0+1.0) + u_gyro*1.5;
    float fy = 1.0 + floor(fi*3.0+2.0) + u_mag*1.5;
    float ph = fi*PI*2.0 + u_tiltX*0.5;
    float w  = 0.005 + u_accel*0.01;
    float line = lissLine(p, fx, fy, ph, t+fi*0.5, w);
    col += hsv(fi + t*0.02 + u_gyro*0.3, 0.9, 1.0) * line * (0.5+u_light*0.5);
  }

  col += vec3(1.0,0.5,0.1)*exp(-length(p)*8.0)*u_impact*2.0;
  col *= 1.0-smoothstep(0.5,1.3,length(uv-0.5)*2.0);
  col = col/(col+0.3);
  gl_FragColor = vec4(col, 1.0);
}`;

// ══════════════════════════════════════════════════════
//  MODE 3: Magnetic Field
// ══════════════════════════════════════════════════════
const magFS = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_accel;
uniform float u_gyro;
uniform float u_mag;
uniform float u_light;
uniform float u_tiltX;
uniform float u_tiltY;
uniform float u_impact;
uniform vec2  u_res;
uniform float u_mx;
uniform float u_my;

#define PI 3.14159265358979

vec3 hsv(float h, float s, float v){
  vec3 c = abs(fract(h+vec3(0,2,1)/3.0)*6.0-3.0);
  return v * mix(vec3(1.0), clamp(c-1.0,0.0,1.0), s);
}

vec2 dipole(vec2 p, vec2 pos, float str){
  vec2 r = p-pos;
  float r2 = dot(r,r)+0.01;
  float r3 = r2*sqrt(r2);
  vec2 m = vec2(u_mx,u_my)*str;
  return (3.0*dot(m,normalize(r))*normalize(r)-m)/r3;
}

void main(){
  vec2 uv = v_uv;
  vec2 p  = (uv-0.5)*vec2(u_res.x/u_res.y,1.0)*1.5;
  float t = u_time;

  vec2 b = vec2(0.0);
  b += dipole(p, vec2(0.3,0.2)+vec2(u_tiltX,u_tiltY)*0.2,  1.0);
  b += dipole(p, vec2(-0.3,-0.2)-vec2(u_tiltX,u_tiltY)*0.2,-1.0);
  b += dipole(p, vec2(0.0,0.4)*(1.0+u_gyro), 0.5+u_mag);
  float bMag = length(b);

  float angle = atan(b.y, b.x);
  float lines = sin(angle*8.0 + bMag*3.0 - t*0.5)*0.5+0.5;
  float field = lines * smoothstep(2.0,0.1,bMag);

  float hue = atan(b.y,b.x)/(PI*2.0)+0.5;
  hue = fract(hue + t*0.03 + u_accel*0.1);
  vec3 col = hsv(hue, 0.85+u_mag*0.15, 1.0) * field * (0.4+u_light*0.6) * smoothstep(3.0,0.3,bMag);

  col += vec3(1.0,0.3,0.1)*exp(-length(p-vec2(0.3,0.2))*12.0)*2.0;
  col += vec3(0.1,0.5,1.0)*exp(-length(p-vec2(-0.3,-0.2))*12.0)*2.0;
  col += vec3(1.0,0.8,0.2)*exp(-length(p/1.5)*6.0)*u_impact*1.5;

  col *= 1.0-smoothstep(0.5,1.3,length(uv-0.5)*2.0);
  col = col/(col+0.4);
  col = pow(col, vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}`;

// ══════════════════════════════════════════════════════
//  シェーダー初期化
// ══════════════════════════════════════════════════════
let flowProg, rdSimProg, rdRenderProg, lissProg, magProg;

function initShaders() {
  flowProg     = createProgram(quadVS, flowFS);
  rdSimProg    = createProgram(quadVS, rdSimFS);
  rdRenderProg = createProgram(quadVS, rdRenderFS);
  lissProg     = createProgram(quadVS, lissFS);
  magProg      = createProgram(quadVS, magFS);
}

// ══════════════════════════════════════════════════════
//  Reaction Diffusion テクスチャ（UNSIGNED_BYTE / WebGL1互換）
// ══════════════════════════════════════════════════════
let rdFBOs = [], rdTexs = [];
const RD_SCALE = 0.35;

function initRDTextures() {
  rdFBOs.forEach(f => gl.deleteFramebuffer(f));
  rdTexs.forEach(t => gl.deleteTexture(t));
  rdFBOs = []; rdTexs = [];

  const rw = Math.max(1, Math.floor(W * RD_SCALE));
  const rh = Math.max(1, Math.floor(H * RD_SCALE));

  for (let i = 0; i < 2; i++) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const data = new Uint8Array(rw * rh * 4);
    for (let j = 0; j < rw * rh; j++) {
      data[j*4+0] = 255;
      data[j*4+1] = 0;
      const px = j % rw, py = Math.floor(j / rw);
      const d = Math.sqrt((px-rw/2)**2 + (py-rh/2)**2);
      if (d < rw * 0.07) data[j*4+1] = 255;
      if (Math.random() < 0.004) data[j*4+1] = 255;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rw, rh, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    rdTexs.push(tex);
    rdFBOs.push(fbo);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

let rdCurrent = 0;

function stepRD() {
  if (rdFBOs.length < 2) return;
  const rw = Math.max(1, Math.floor(W * RD_SCALE));
  const rh = Math.max(1, Math.floor(H * RD_SCALE));
  const next = 1 - rdCurrent;

  gl.bindFramebuffer(gl.FRAMEBUFFER, rdFBOs[next]);
  gl.viewport(0, 0, rw, rh);
  gl.useProgram(rdSimProg);
  bindQuad(rdSimProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, rdTexs[rdCurrent]);
  const loc = n => gl.getUniformLocation(rdSimProg, n);
  gl.uniform1i(loc('u_prev'), 0);
  gl.uniform2f(loc('u_res'), rw, rh);
  gl.uniform1f(loc('u_feed'),   0.037 + u.gyroMag*0.015 + u.accelMag*0.01);
  gl.uniform1f(loc('u_kill'),   0.060 + u.magMag*0.005);
  gl.uniform1f(loc('u_impact'), u.impactDecay);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  rdCurrent = next;
}

// ══════════════════════════════════════════════════════
//  ユニフォームセット
// ══════════════════════════════════════════════════════
function setUniforms(prog, time) {
  const loc = n => gl.getUniformLocation(prog, n);
  gl.uniform1f(loc('u_time'),   time);
  gl.uniform1f(loc('u_accel'),  u.accelMag);
  gl.uniform1f(loc('u_gyro'),   u.gyroMag);
  gl.uniform1f(loc('u_mag'),    u.magMag);
  gl.uniform1f(loc('u_light'),  u.lightNorm);
  gl.uniform1f(loc('u_tiltX'),  u.tiltX);
  gl.uniform1f(loc('u_tiltY'),  u.tiltY);
  gl.uniform1f(loc('u_impact'), u.impactDecay);
  gl.uniform2f(loc('u_res'),    W, H);
}

// ══════════════════════════════════════════════════════
//  アニメーションループ
// ══════════════════════════════════════════════════════
const startTime = performance.now();
let frameCount = 0, lastFPSTime = 0;

function render(now) {
  requestAnimationFrame(render);
  const time = (now - startTime) * 0.001;
  frameCount++;
  if (now - lastFPSTime > 1000) {
    document.getElementById('st-fps').textContent = frameCount;
    frameCount = 0; lastFPSTime = now;
  }
  u.impactDecay *= 0.93;

  if (isDemoMode && !isReceiving) {
    const t = time;
    raw.ax = Math.sin(t*0.7)*3.0 + Math.sin(t*1.3)*1.5;
    raw.ay = Math.cos(t*0.5)*2.5 + Math.cos(t*0.9)*1.0;
    raw.az = Math.sin(t*1.1)*2.0 + 9.8;
    raw.gx = Math.sin(t*1.2)*1.5;
    raw.gy = Math.cos(t*0.8)*1.2;
    raw.gz = Math.sin(t*0.6)*0.8;
    raw.mx = Math.sin(t*0.3)*30 + 20;
    raw.my = Math.cos(t*0.4)*25 + 15;
    raw.mz = Math.sin(t*0.5)*20 + 40;
    raw.lux = 200 + Math.sin(t*0.2)*150;
    if (Math.random() < 0.004) triggerImpact(8.0);
    processRawData();
  }

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (artMode === 0) {
    gl.useProgram(flowProg);
    bindQuad(flowProg);
    setUniforms(flowProg, time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  } else if (artMode === 1) {
    for (let i = 0; i < 3; i++) stepRD();
    gl.useProgram(rdRenderProg);
    bindQuad(rdRenderProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rdTexs[rdCurrent]);
    gl.uniform1i(gl.getUniformLocation(rdRenderProg, 'u_tex'), 0);
    gl.uniform1f(gl.getUniformLocation(rdRenderProg, 'u_light'), u.lightNorm);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  } else if (artMode === 2) {
    gl.useProgram(lissProg);
    bindQuad(lissProg);
    setUniforms(lissProg, time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  } else if (artMode === 3) {
    gl.useProgram(magProg);
    bindQuad(magProg);
    setUniforms(magProg, time);
    gl.uniform1f(gl.getUniformLocation(magProg, 'u_mx'), smooth.mx / 60.0);
    gl.uniform1f(gl.getUniformLocation(magProg, 'u_my'), smooth.my / 60.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  updateHUD();
}

// ══════════════════════════════════════════════════════
//  センサーデータ処理
// ══════════════════════════════════════════════════════
function processRawData() {
  for (const k of ['ax','ay','az','gx','gy','gz','mx','my','mz','lux'])
    smooth[k] = smooth[k]*(1-ALPHA) + raw[k]*ALPHA;

  const aM = Math.sqrt(smooth.ax**2+smooth.ay**2+smooth.az**2);
  const gM = Math.sqrt(smooth.gx**2+smooth.gy**2+smooth.gz**2);
  const mM = Math.sqrt(smooth.mx**2+smooth.my**2+smooth.mz**2);

  u.accelMag  = Math.min(aM/15.0, 1.0);
  u.gyroMag   = Math.min(gM/5.0,  1.0);
  u.magMag    = Math.min(mM/80.0, 1.0);
  u.lightNorm = Math.min(raw.lux/500.0, 1.0);
  u.tiltX     = Math.max(-1, Math.min(1, smooth.ax/9.8));
  u.tiltY     = Math.max(-1, Math.min(1, smooth.ay/9.8));

  const delta = Math.abs(aM - prevAccelMag);
  if (delta > 3.0) triggerImpact(delta);
  prevAccelMag = aM;
}

function triggerImpact(strength) {
  u.impactDecay = Math.min(1.0, strength/15.0);
  impactCount++;
  const words = ['IMPACT','SHAKE','FORCE','SURGE','PULSE','WAVE','BURST'];
  const el = document.getElementById('event-flash');
  el.textContent = words[Math.floor(Math.random()*words.length)];
  el.style.opacity = '1';
  el.style.color = `hsl(${Math.random()*360},100%,60%)`;
  setTimeout(() => { el.style.opacity = '0'; }, 400);
}

function updateHUD() {
  const aM = Math.sqrt(smooth.ax**2+smooth.ay**2+smooth.az**2);
  const gM = Math.sqrt(smooth.gx**2+smooth.gy**2+smooth.gz**2);
  const mM = Math.sqrt(smooth.mx**2+smooth.my**2+smooth.mz**2);
  document.getElementById('val-accel').textContent  = aM.toFixed(2);
  document.getElementById('val-gyro').textContent   = gM.toFixed(2);
  document.getElementById('val-mag').textContent    = mM.toFixed(1);
  document.getElementById('val-light').textContent  = Math.round(raw.lux);
  document.getElementById('val-impact').textContent = impactCount;
  document.getElementById('bar-accel').style.width  = Math.min(100,u.accelMag*100)+'%';
  document.getElementById('bar-gyro').style.width   = Math.min(100,u.gyroMag*100)+'%';
  document.getElementById('bar-mag').style.width    = Math.min(100,u.magMag*100)+'%';
  document.getElementById('bar-light').style.width  = Math.min(100,u.lightNorm*100)+'%';
  document.getElementById('st-pkts').textContent    = packetCount;
}

function updateUI() {
  document.getElementById('connectBtn').disabled    = isConnected;
  document.getElementById('startBtn').disabled      = !isConnected || isReceiving;
  document.getElementById('disconnectBtn').disabled = !isConnected;
  document.getElementById('st-conn').textContent    =
    isReceiving ? 'RECEIVING' : isConnected ? 'CONNECTED' : 'IDLE';
}

// ══════════════════════════════════════════════════════
//  BLE 接続
// ══════════════════════════════════════════════════════
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
    bleDevice.addEventListener('gattserverdisconnected', () => {
      isConnected = false; isReceiving = false;
      console.log('BLE disconnected');
      updateUI();
    });
    bleServer = await bleDevice.gatt.connect();
    const svc = await bleServer.getPrimaryService(SERVICE_UUID);
    bleChar   = await svc.getCharacteristic(CHARACTERISTIC_UUID);
    isConnected = true;
    console.log('BLE connected. Characteristic:', bleChar);
    console.log('Properties:', bleChar.properties);
    document.getElementById('idle-overlay').style.display = 'none';
    updateUI();
  } catch(e) {
    console.error('connectBLE:', e);
    if (e.name !== 'NotFoundError') alert('BLE接続エラー: ' + e.message);
  }
}

async function disconnectBLE() {
  if (isReceiving) {
    try { bleChar.removeEventListener('characteristicvaluechanged', onBLEData); } catch{}
    try { await bleChar.stopNotifications(); } catch{}
    isReceiving = false;
  }
  if (bleServer?.connected) bleServer.disconnect();
  isConnected = false; bleDevice = bleServer = bleChar = null;
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
    isReceiving = true; isDemoMode = false;
    console.log('Notifications started successfully');
    updateUI();
  } catch(e) {
    console.error('startReceiving:', e);
    alert('データ受信の開始に失敗しました: ' + e.message);
  }
}

function onBLEData(event) {
  try {
    const chunk = new TextDecoder('utf-8').decode(event.target.value);
    dataBuffer += chunk;

    // Find complete JSON object using first '{' and last '}'
    const start = dataBuffer.indexOf('{');
    const end   = dataBuffer.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const jsonStr = dataBuffer.slice(start, end + 1);
      try {
        const data = JSON.parse(jsonStr);
        dataBuffer = dataBuffer.slice(end + 1); // keep remainder
        ingestData(data);
      } catch(e) {
        // Incomplete JSON — keep buffering
        if (dataBuffer.length > 4096) {
          console.warn('BLE buffer overflow, resetting');
          dataBuffer = '';
        }
      }
    } else if (dataBuffer.length > 4096) {
      console.warn('BLE buffer overflow (no JSON found), resetting');
      dataBuffer = '';
    }
  } catch(e) {
    console.warn('onBLEData:', e);
    dataBuffer = '';
  }
}

function ingestData(d) {
  packetCount++;
  if (d.accelerometer) { raw.ax=d.accelerometer.x||0; raw.ay=d.accelerometer.y||0; raw.az=d.accelerometer.z||0; }
  if (d.gyroscope)     { raw.gx=d.gyroscope.x||0;     raw.gy=d.gyroscope.y||0;     raw.gz=d.gyroscope.z||0; }
  if (d.magnetometer)  { raw.mx=d.magnetometer.x||0;  raw.my=d.magnetometer.y||0;  raw.mz=d.magnetometer.z||0; }
  if (d.light)         { raw.lux=d.light.lux||0; }
  if (d.proximity)     { raw.proximity=d.proximity.distance||0; }
  processRawData();
}

// ══════════════════════════════════════════════════════
//  イベントリスナー
// ══════════════════════════════════════════════════════
document.getElementById('connectBtn').addEventListener('click', connectBLE);
document.getElementById('overlayConnectBtn').addEventListener('click', async () => {
  document.getElementById('idle-overlay').style.display = 'none';
  await connectBLE();
});
document.getElementById('overlayDemoBtn').addEventListener('click', () => {
  isDemoMode = true;
  document.getElementById('idle-overlay').style.display = 'none';
  document.getElementById('st-conn').textContent = 'DEMO';
});
document.getElementById('startBtn').addEventListener('click', startReceiving);
document.getElementById('disconnectBtn').addEventListener('click', disconnectBLE);

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    artMode = parseInt(btn.dataset.mode);
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('st-mode').textContent = modeNames[artMode];
    if (artMode === 1) initRDTextures();
  });
});

// ══════════════════════════════════════════════════════
//  起動
// ══════════════════════════════════════════════════════
initShaders();
resize();
initRDTextures();
requestAnimationFrame(render);
console.log('KineticArt ready. WebGL:', gl.getParameter(gl.VERSION));
