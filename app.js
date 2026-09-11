const canvas = document.querySelector('#galaxy');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const experience = document.querySelector('#experience');
const cover = document.querySelector('#cover');
const lab = document.querySelector('#lab');
const enterButton = document.querySelector('#enterButton');
const video = document.querySelector('#webcam');
const overlay = document.querySelector('#handOverlay');
const overlayCtx = overlay.getContext('2d');
const cameraButton = document.querySelector('#cameraButton');
const trackingState = document.querySelector('#trackingState');
const coordinateOutput = document.querySelector('#coordinateOutput');
const targetReticle = document.querySelector('#targetReticle');
const eventLabel = document.querySelector('#eventLabel');
const languageButton = document.querySelector('#languageButton');
const coverLanguageButton = document.querySelector('#coverLanguageButton');

const TAU = Math.PI * 2;
const isCoarse = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const copy = {
  en: {
    coverSubtitle: 'A hand-controlled field of light.', enter: 'ENTER THE FIELD',
    coverPrivacy: 'Camera processing stays on this device.', inputLabel: 'VISION INPUT',
    loading: 'LOADING', local: 'LOCAL', target: 'INDEX TARGET', retryCamera: 'RETRY CAMERA',
    aimTitle: 'INDEX FINGER', aimHint: 'Aim the target', rippleTitle: 'PUSH FORWARD',
    rippleHint: 'Shake the particles', burstTitle: 'FIST → OPEN', burstHint: 'Trigger a supernova',
    rotateTitle: 'OPEN + MOVE', rotateHint: 'Rotate in 3D',
    fallback: 'Pointer fallback: move to aim, click for ripple, drag to rotate, double-click for supernova.',
    stateLive: 'HAND DETECTED', stateSearching: 'FIND YOUR HAND', stateError: 'CAMERA OFFLINE',
    supernova: 'SUPERNOVA', ripple: 'GRAVITY RIPPLE', event: 'EVENT DETECTED'
  },
  zh: {
    coverSubtitle: '用手势控制一片光的引力场。', enter: '进入星河',
    coverPrivacy: '摄像头数据仅在本机处理。', inputLabel: '视觉输入',
    loading: '正在加载', local: '本地处理', target: '食指目标点', retryCamera: '重试摄像头',
    aimTitle: '伸出食指', aimHint: '移动目标点', rippleTitle: '食指向前',
    rippleHint: '掀起粒子震动', burstTitle: '握拳 → 张开', burstHint: '触发超新星',
    rotateTitle: '五指张开并移动', rotateHint: '三维旋转星团',
    fallback: '鼠标备用：移动瞄准，单击震动，拖动旋转，双击触发超新星。',
    stateLive: '已识别手势', stateSearching: '寻找手部', stateError: '摄像头不可用',
    supernova: '超新星爆发', ripple: '引力震波', event: '已识别事件'
  }
};

let language = 'en';
let entered = false;
let cameraActive = false;
let handLandmarker = null;
let lastVideoTime = -1;
let lastDetectionAt = 0;
let previousGesture = 'none';
let fistLastSeenAt = -Infinity;
let openAnchor = null;
let lastIndexSample = null;
let lastRippleAt = -Infinity;
let lastBurstAt = -Infinity;
let trackingLostFrames = 0;
let pointerDragging = false;
let pointerMoved = false;
let dragAnchor = null;
let particleCount = 0;
let baseX, baseY, baseZ, sizes, alphas, phases;
let projectedX, projectedY;
let bursts = [];
let ripples = [];
let sparks = [];
let previousFrameTime = performance.now();
let slowFrameTotal = 0;
let slowFrameSamples = 0;

const scene = {
  spin: 0,
  yaw: 0,
  targetYaw: 0,
  pitch: .66,
  targetPitch: .66,
  zoom: 1,
  targetZoom: 1,
  targetX: innerWidth * .48,
  targetY: innerHeight * .51
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function distance2D(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function randomGaussian() {
  return Math.sqrt(-2 * Math.log(Math.max(Math.random(), 1e-8))) * Math.cos(TAU * Math.random());
}

function preferredParticleCount() {
  if (innerWidth <= 680) return 2200;
  if (isCoarse || innerWidth <= 1100) return 3600;
  if (navigator.deviceMemory && navigator.deviceMemory <= 4) return 3200;
  return 5200;
}

function seedGalaxy(count = preferredParticleCount()) {
  particleCount = count;
  baseX = new Float32Array(count);
  baseY = new Float32Array(count);
  baseZ = new Float32Array(count);
  sizes = new Float32Array(count);
  alphas = new Float32Array(count);
  phases = new Float32Array(count);
  projectedX = new Float32Array(count);
  projectedY = new Float32Array(count);

  const armLimit = Math.floor(count * .82);
  const coreLimit = Math.floor(count * .95);

  for (let i = 0; i < count; i++) {
    if (i < armLimit) {
      const radius = .07 + Math.pow(Math.random(), .66) * .98;
      const arm = i % 4;
      const armSpread = .07 + radius * .18;
      const angle = arm * TAU / 4 + radius * 6.1 + randomGaussian() * armSpread;
      baseX[i] = Math.cos(angle) * radius + randomGaussian() * .012;
      baseY[i] = Math.sin(angle) * radius + randomGaussian() * .012;
      baseZ[i] = randomGaussian() * (.018 + radius * .038);
      alphas[i] = .17 + Math.random() * .58 + (1 - radius) * .15;
      sizes[i] = .42 + Math.random() * 1.12 + (Math.random() > .985 ? 1.4 : 0);
    } else if (i < coreLimit) {
      const radius = Math.abs(randomGaussian()) * .14;
      const angle = Math.random() * TAU;
      baseX[i] = Math.cos(angle) * radius;
      baseY[i] = Math.sin(angle) * radius * .82;
      baseZ[i] = randomGaussian() * .075 * (1 - clamp(radius, 0, .9));
      alphas[i] = .45 + Math.random() * .5;
      sizes[i] = .65 + Math.random() * 1.9;
    } else {
      const radius = .3 + Math.pow(Math.random(), .4) * .92;
      const angle = Math.random() * TAU;
      baseX[i] = Math.cos(angle) * radius;
      baseY[i] = Math.sin(angle) * radius;
      baseZ[i] = randomGaussian() * .18;
      alphas[i] = .06 + Math.random() * .18;
      sizes[i] = .3 + Math.random() * .72;
    }
    phases[i] = Math.random() * TAU;
  }
}

function resize() {
  const dprCap = innerWidth <= 680 ? 1.25 : 1.55;
  const dpr = Math.min(devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  overlay.width = 448;
  overlay.height = 336;
  if (!particleCount || Math.abs(preferredParticleCount() - particleCount) > 1000) seedGalaxy();
  if (!entered) {
    scene.targetX = innerWidth * .5;
    scene.targetY = innerHeight * .51;
  }
  updateReticle();
}

function galaxyOrigin() {
  return { x: innerWidth * (innerWidth <= 680 ? .5 : .455), y: innerHeight * .51 };
}

function projectParticles(time) {
  const origin = galaxyOrigin();
  const scale = Math.min(innerWidth, innerHeight) * (innerWidth <= 680 ? .44 : .53) * scene.zoom;
  const cosSpin = Math.cos(scene.spin);
  const sinSpin = Math.sin(scene.spin);
  const cosYaw = Math.cos(scene.yaw);
  const sinYaw = Math.sin(scene.yaw);
  const cosPitch = Math.cos(scene.pitch);
  const sinPitch = Math.sin(scene.pitch);
  const liveRipples = ripples.filter((wave) => time - wave.start < 980);
  const liveBursts = bursts.filter((burst) => time - burst.start < 900);

  for (let i = 0; i < particleCount; i++) {
    const x0 = baseX[i];
    const y0 = baseY[i];
    const z0 = baseZ[i];
    const spunX = x0 * cosSpin - y0 * sinSpin;
    const spunY = x0 * sinSpin + y0 * cosSpin;
    const yawX = spunX * cosYaw + z0 * sinYaw;
    const yawZ = -spunX * sinYaw + z0 * cosYaw;
    const pitchY = spunY * cosPitch - yawZ * sinPitch;
    const pitchZ = spunY * sinPitch + yawZ * cosPitch;
    const perspective = 3.15 / (3.15 - pitchZ);
    let sx = origin.x + yawX * scale * perspective;
    let sy = origin.y + pitchY * scale * perspective;

    for (const wave of liveRipples) {
      const age = (time - wave.start) / 980;
      const dx = sx - wave.x;
      const dy = sy - wave.y;
      const dist = Math.hypot(dx, dy);
      const front = age * Math.min(innerWidth, innerHeight) * .55;
      const strength = Math.max(0, 1 - Math.abs(dist - front) / 55) * (1 - age);
      if (strength > 0) {
        const shake = Math.sin(phases[i] * 3 + age * 58) * 10 * strength;
        sx += Math.cos(phases[i]) * shake;
        sy += Math.sin(phases[i]) * shake;
      }
    }

    for (const burst of liveBursts) {
      const age = (time - burst.start) / 900;
      const dx = sx - burst.x;
      const dy = sy - burst.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const front = age * Math.min(innerWidth, innerHeight) * .72;
      const strength = Math.max(0, 1 - Math.abs(dist - front) / 74) * (1 - age) * 28;
      sx += dx / dist * strength;
      sy += dy / dist * strength;
    }
    projectedX[i] = sx;
    projectedY[i] = sy;
  }
}

function drawGalaxy(time) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  projectParticles(time);

  const origin = galaxyOrigin();
  const coreRadius = Math.min(innerWidth, innerHeight) * .11 * scene.zoom;
  const glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, coreRadius * 2.8);
  glow.addColorStop(0, 'rgba(255,255,252,.22)');
  glow.addColorStop(.12, 'rgba(255,255,252,.10)');
  glow.addColorStop(.52, 'rgba(180,180,176,.025)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(origin.x - coreRadius * 3, origin.y - coreRadius * 3, coreRadius * 6, coreRadius * 6);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#fff';
  for (let i = 0; i < particleCount; i++) {
    const x = projectedX[i];
    const y = projectedY[i];
    if (x < -3 || x > innerWidth + 3 || y < -3 || y > innerHeight + 3) continue;
    const twinkle = reducedMotion ? 1 : .82 + Math.sin(time * .0016 + phases[i]) * .18;
    ctx.globalAlpha = clamp(alphas[i] * twinkle, .035, .92);
    const size = sizes[i] * Math.max(.68, scene.zoom);
    if (size < 1.05) ctx.fillRect(x, y, 1, 1);
    else if (size < 2.1) ctx.fillRect(x - size * .5, y - size * .5, size, size);
    else {
      ctx.beginPath();
      ctx.arc(x, y, size * .55, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawEffects(time) {
  ripples = ripples.filter((wave) => time - wave.start < 980);
  bursts = bursts.filter((burst) => time - burst.start < 900);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const wave of ripples) {
    const age = (time - wave.start) / 980;
    const radius = age * Math.min(innerWidth, innerHeight) * .55;
    ctx.globalAlpha = (1 - age) * .48;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, radius, 0, TAU);
    ctx.stroke();
  }

  for (const burst of bursts) {
    const age = (time - burst.start) / 900;
    const flashSize = 26 + Math.pow(age, .55) * Math.min(innerWidth, innerHeight) * .25;
    const flash = ctx.createRadialGradient(burst.x, burst.y, 0, burst.x, burst.y, flashSize);
    flash.addColorStop(0, `rgba(255,255,255,${Math.max(0, 1 - age * 2.2)})`);
    flash.addColorStop(.12, `rgba(255,255,255,${Math.max(0, .72 - age * 1.45)})`);
    flash.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = flash;
    ctx.fillRect(burst.x - flashSize, burst.y - flashSize, flashSize * 2, flashSize * 2);

    const ringRadius = 18 + age * Math.min(innerWidth, innerHeight) * .72;
    ctx.globalAlpha = Math.max(0, 1 - age * 1.25) * .82;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1 + (1 - age) * 2;
    ctx.beginPath();
    ctx.arc(burst.x, burst.y, ringRadius, 0, TAU);
    ctx.stroke();
  }

  for (let i = sparks.length - 1; i >= 0; i--) {
    const spark = sparks[i];
    const age = (time - spark.start) / spark.life;
    if (age >= 1) { sparks.splice(i, 1); continue; }
    const travel = spark.speed * age * Math.min(innerWidth, innerHeight) * .26;
    const x = spark.x + Math.cos(spark.angle) * travel;
    const y = spark.y + Math.sin(spark.angle) * travel;
    ctx.globalAlpha = (1 - age) * spark.alpha;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, spark.size, spark.size);
  }
  ctx.restore();
}

function monitorPerformance(delta) {
  if (!entered || delta > 120) return;
  slowFrameTotal += delta;
  slowFrameSamples++;
  if (slowFrameSamples < 180) return;
  const average = slowFrameTotal / slowFrameSamples;
  if (average > 23 && particleCount > 1600) seedGalaxy(Math.max(1600, Math.floor(particleCount * .8)));
  slowFrameTotal = 0;
  slowFrameSamples = 0;
}

function render(time) {
  const delta = Math.min(40, time - previousFrameTime || 16.7);
  previousFrameTime = time;
  scene.spin += delta * (entered ? .000045 : .000025);
  scene.yaw += (scene.targetYaw - scene.yaw) * .065;
  scene.pitch += (scene.targetPitch - scene.pitch) * .065;
  scene.zoom += (scene.targetZoom - scene.zoom) * .075;
  drawGalaxy(time);
  drawEffects(time);
  monitorPerformance(delta);
  requestAnimationFrame(render);
}

function setLanguage(next) {
  language = next;
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-copy]').forEach((element) => {
    const value = copy[next][element.dataset.copy];
    if (value) element.textContent = value;
  });
  languageButton.textContent = next === 'en' ? '中文' : 'EN';
  coverLanguageButton.textContent = next === 'en' ? '中文' : 'EN';
}

function setTrackingState(kind) {
  const key = kind === 'live' ? 'stateLive' : kind === 'error' ? 'stateError' : kind === 'loading' ? 'loading' : 'stateSearching';
  trackingState.dataset.copy = key;
  trackingState.textContent = copy[language][key];
  trackingState.className = kind === 'live' ? 'live' : kind === 'error' ? 'error' : '';
}

function activateGuide(type) {
  document.querySelectorAll('.gesture-list li').forEach((item) => item.classList.toggle('active', item.dataset.gesture === type));
}

function showEvent(type) {
  eventLabel.querySelector('strong').textContent = copy[language][type];
  eventLabel.querySelector('small').textContent = copy[language].event;
  eventLabel.classList.add('show');
  clearTimeout(showEvent.timer);
  showEvent.timer = setTimeout(() => eventLabel.classList.remove('show'), 920);
}

function updateReticle() {
  const x = clamp(scene.targetX, 16, Math.max(16, innerWidth - 16));
  const y = clamp(scene.targetY, 16, Math.max(16, innerHeight - 16));
  targetReticle.style.transform = `translate3d(${x - innerWidth / 2}px, ${y - innerHeight / 2}px, 0)`;
  const nx = (x / innerWidth - .5) * 2;
  const ny = (.5 - y / innerHeight) * 2;
  coordinateOutput.innerHTML = `X ${nx >= 0 ? '+' : ''}${nx.toFixed(2)}&nbsp;&nbsp;Y ${ny >= 0 ? '+' : ''}${ny.toFixed(2)}`;
}

function setTarget(normalizedX, normalizedY) {
  scene.targetX = clamp(normalizedX, .035, .965) * innerWidth;
  scene.targetY = clamp(normalizedY, .05, .95) * innerHeight;
  updateReticle();
}

function pulseReticle() {
  targetReticle.classList.remove('pulse');
  requestAnimationFrame(() => targetReticle.classList.add('pulse'));
}

function triggerRipple(x = scene.targetX, y = scene.targetY) {
  const now = performance.now();
  if (now - lastRippleAt < 620) return false;
  lastRippleAt = now;
  ripples.push({ x, y, start: now });
  pulseReticle();
  activateGuide('ripple');
  showEvent('ripple');
  return true;
}

function triggerSupernova(x = scene.targetX, y = scene.targetY) {
  const now = performance.now();
  if (now - lastBurstAt < 1250) return false;
  lastBurstAt = now;
  bursts.push({ x, y, start: now });
  for (let i = 0; i < 150; i++) {
    sparks.push({
      x, y, start: now,
      angle: Math.random() * TAU,
      speed: .38 + Math.random() * 1.4,
      life: 520 + Math.random() * 520,
      size: .6 + Math.random() * 2,
      alpha: .32 + Math.random() * .68
    });
  }
  pulseReticle();
  activateGuide('burst');
  showEvent('supernova');
  return true;
}

function landmarkDistance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)); }
function fingerExtended(lm, tip, pip) { return landmarkDistance(lm[tip], lm[0]) > landmarkDistance(lm[pip], lm[0]) * 1.12; }

function classifyHand(lm) {
  const fingers = [fingerExtended(lm, 8, 6), fingerExtended(lm, 12, 10), fingerExtended(lm, 16, 14), fingerExtended(lm, 20, 18)];
  const extendedCount = fingers.filter(Boolean).length;
  const palmWidth = Math.max(landmarkDistance(lm[5], lm[17]), .01);
  const thumbOpen = landmarkDistance(lm[4], lm[9]) > palmWidth * 1.05;
  if (extendedCount === 0) return 'fist';
  if (extendedCount === 4 && thumbOpen) return 'open';
  if (fingers[0] && !fingers[1] && !fingers[2] && !fingers[3]) return 'point';
  return 'aim';
}

function processHand(lm, now) {
  const index = lm[8];
  const mirroredX = 1 - index.x;
  setTarget(mirroredX, index.y);
  const gesture = classifyHand(lm);
  const palm = [0, 5, 9, 13, 17].reduce((result, item) => ({ x: result.x + (1 - lm[item].x) / 5, y: result.y + lm[item].y / 5 }), { x: 0, y: 0 });

  if (gesture === 'fist') {
    fistLastSeenAt = now;
    activateGuide('burst');
  } else if (gesture === 'open') {
    if (now - fistLastSeenAt < 720 && previousGesture !== 'open') {
      triggerSupernova();
      fistLastSeenAt = -Infinity;
    } else {
      if (previousGesture !== 'open' || !openAnchor) openAnchor = { x: palm.x, yaw: scene.targetYaw };
      scene.targetYaw = clamp(openAnchor.yaw + (palm.x - openAnchor.x) * 3.2, -1.28, 1.28);
      activateGuide('rotate');
    }
  } else {
    openAnchor = null;
    activateGuide(gesture === 'point' ? 'ripple' : 'aim');
  }

  if (gesture === 'point') {
    if (lastIndexSample) {
      const elapsed = Math.max(1, now - lastIndexSample.time);
      const depthChange = index.z - lastIndexSample.z;
      const forwardVelocity = depthChange / elapsed;
      if (depthChange < -.018 && forwardVelocity < -.00022) triggerRipple();
    }
    lastIndexSample = { z: index.z, time: now };
  } else {
    lastIndexSample = null;
  }
  previousGesture = gesture;
}

const handConnections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

function drawHand(lm) {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  if (!lm) return;
  overlayCtx.strokeStyle = 'rgba(255,255,255,.68)';
  overlayCtx.lineWidth = 1.4;
  for (const [a, b] of handConnections) {
    overlayCtx.beginPath();
    overlayCtx.moveTo(lm[a].x * overlay.width, lm[a].y * overlay.height);
    overlayCtx.lineTo(lm[b].x * overlay.width, lm[b].y * overlay.height);
    overlayCtx.stroke();
  }
  for (let i = 0; i < lm.length; i++) {
    overlayCtx.fillStyle = i === 8 ? '#fff' : 'rgba(255,255,255,.78)';
    overlayCtx.beginPath();
    overlayCtx.arc(lm[i].x * overlay.width, lm[i].y * overlay.height, i === 8 ? 4.4 : 2.1, 0, TAU);
    overlayCtx.fill();
  }
}

async function createHandLandmarker() {
  const { HandLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs');
  const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');
  const options = {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: .58,
    minHandPresenceConfidence: .52,
    minTrackingConfidence: .52
  };
  try { return await HandLandmarker.createFromOptions(vision, options); }
  catch {
    options.baseOptions.delegate = 'CPU';
    return HandLandmarker.createFromOptions(vision, options);
  }
}

async function startCamera() {
  cameraButton.hidden = true;
  setTrackingState('loading');
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
    const [landmarker, stream] = await Promise.all([
      handLandmarker ? Promise.resolve(handLandmarker) : createHandLandmarker(),
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        audio: false
      })
    ]);
    handLandmarker = landmarker;
    video.srcObject = stream;
    await video.play();
    cameraActive = true;
    setTrackingState('searching');
    detectHands();
  } catch (error) {
    console.warn('Camera or hand tracking unavailable:', error);
    cameraActive = false;
    setTrackingState('error');
    cameraButton.hidden = false;
  }
}

function detectHands() {
  if (!cameraActive) return;
  const now = performance.now();
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastDetectionAt >= 34) {
    lastVideoTime = video.currentTime;
    lastDetectionAt = now;
    try {
      const results = handLandmarker.detectForVideo(video, now);
      const landmarks = results.landmarks?.[0];
      drawHand(landmarks);
      if (landmarks) {
        trackingLostFrames = 0;
        setTrackingState('live');
        processHand(landmarks, now);
      } else {
        trackingLostFrames++;
        if (trackingLostFrames > 5) setTrackingState('searching');
      }
    } catch (error) {
      console.warn('Tracking frame skipped:', error);
    }
  }
  requestAnimationFrame(detectHands);
}

function enterExperience() {
  if (entered) return;
  entered = true;
  experience.classList.add('entered');
  lab.setAttribute('aria-hidden', 'false');
  cover.setAttribute('aria-hidden', 'true');
  enterButton.disabled = true;
  scene.targetX = galaxyOrigin().x;
  scene.targetY = galaxyOrigin().y;
  updateReticle();
  startCamera();
}

enterButton.addEventListener('click', enterExperience);
cameraButton.addEventListener('click', startCamera);
languageButton.addEventListener('click', () => setLanguage(language === 'en' ? 'zh' : 'en'));
coverLanguageButton.addEventListener('click', () => setLanguage(language === 'en' ? 'zh' : 'en'));

window.addEventListener('pointerdown', (event) => {
  if (!entered || event.target.closest('button') || event.target.closest('.control-rail')) return;
  pointerDragging = true;
  pointerMoved = false;
  dragAnchor = { x: event.clientX, y: event.clientY, yaw: scene.targetYaw, pitch: scene.targetPitch };
});

window.addEventListener('pointermove', (event) => {
  if (!entered || cameraActive || event.target.closest('.control-rail')) return;
  setTarget(event.clientX / innerWidth, event.clientY / innerHeight);
  activateGuide('aim');
  if (pointerDragging && dragAnchor) {
    const dx = event.clientX - dragAnchor.x;
    const dy = event.clientY - dragAnchor.y;
    if (Math.hypot(dx, dy) > 5) pointerMoved = true;
    scene.targetYaw = clamp(dragAnchor.yaw + dx / innerWidth * 3.2, -1.28, 1.28);
    scene.targetPitch = clamp(dragAnchor.pitch + dy / innerHeight * 1.5, .18, 1.25);
    activateGuide('rotate');
  }
}, { passive: true });

window.addEventListener('pointerup', () => {
  if (pointerDragging && !pointerMoved && !cameraActive) triggerRipple();
  pointerDragging = false;
  dragAnchor = null;
});

window.addEventListener('dblclick', (event) => {
  if (!entered || event.target.closest('.control-rail')) return;
  setTarget(event.clientX / innerWidth, event.clientY / innerHeight);
  triggerSupernova();
});

window.addEventListener('wheel', (event) => {
  if (!entered) return;
  scene.targetZoom = clamp(scene.targetZoom - event.deltaY * .0007, .72, 1.45);
}, { passive: true });

window.addEventListener('resize', resize, { passive: true });

function registerWebMCP() {
  const modelContext = document.modelContext;
  if (!modelContext?.registerTool) return;
  const register = (tool) => Promise.resolve(modelContext.registerTool(tool)).catch(() => {});
  register({
    name: 'set_galaxy_target', title: 'Set galaxy target',
    description: 'Move the visible index target to normalized screen coordinates.',
    inputSchema: { type:'object', properties:{ x:{type:'number',minimum:0,maximum:1}, y:{type:'number',minimum:0,maximum:1} }, required:['x','y'], additionalProperties:false },
    annotations: { readOnlyHint:false, untrustedContentHint:false },
    execute(input) {
      if (!input || !Number.isFinite(input.x) || !Number.isFinite(input.y) || input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1) throw new Error('x and y must be numbers from 0 to 1.');
      setTarget(input.x, input.y);
      return { x:input.x, y:input.y };
    }
  });
  register({
    name:'trigger_galaxy_event', title:'Trigger galaxy event',
    description:'Trigger a gravity ripple or supernova at the current visible target.',
    inputSchema:{ type:'object', properties:{ event:{type:'string',enum:['ripple','supernova']} }, required:['event'], additionalProperties:false },
    annotations:{ readOnlyHint:false, untrustedContentHint:false },
    execute(input) {
      if (input?.event === 'ripple') triggerRipple();
      else if (input?.event === 'supernova') triggerSupernova();
      else throw new Error('event must be ripple or supernova.');
      return { event:input.event, x:scene.targetX / innerWidth, y:scene.targetY / innerHeight };
    }
  });
  register({
    name:'rotate_galaxy', title:'Rotate galaxy',
    description:'Set the horizontal 3D rotation of the galaxy in degrees.',
    inputSchema:{ type:'object', properties:{ degrees:{type:'number',minimum:-73,maximum:73} }, required:['degrees'], additionalProperties:false },
    annotations:{ readOnlyHint:false, untrustedContentHint:false },
    execute(input) {
      if (!input || !Number.isFinite(input.degrees) || input.degrees < -73 || input.degrees > 73) throw new Error('degrees must be from -73 to 73.');
      scene.targetYaw = input.degrees * Math.PI / 180;
      return { degrees:input.degrees };
    }
  });
}

seedGalaxy();
resize();
setLanguage('en');
requestAnimationFrame(render);
registerWebMCP();
