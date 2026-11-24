import * as THREE from 'three';
import { createHubWorld } from './worlds/hub.js';
import { createForestWorld } from './worlds/forest.js';

// --- Procedural Realistic Textures (Lightweight, No External Files Needed Yet) ---
function makeCanvasTex(size, drawFn, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawFn(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

function createTextures() {
  const stone = makeCanvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#d6d1c7';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(90,82,70,0.08)';
      ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3);
    }
    ctx.strokeStyle = 'rgba(110,104,95,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.beginPath();
    ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
    ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s / 2);
    ctx.stroke();
  }, 18);

  const grass = makeCanvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#627d47';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 3000; i++) {
      const shades = ['#4e6935', '#769153', '#5c7342', '#7d7356'];
      ctx.fillStyle = shades[Math.floor(Math.random() * shades.length)];
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 5);
    }
  }, 24);

  const bark = makeCanvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#4a3728';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#36261a' : '#5e4735';
      ctx.fillRect(Math.random() * s, Math.random() * s, 3, 18);
    }
  }, 2);

  return { stone, grass, bark };
}

// --- Realistic Daylight Sky Dome ---
function createSky(topColor, horizonColor, sunDir) {
  const geo = new THREE.SphereGeometry(420, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(topColor) },
      horizonColor: { value: new THREE.Color(horizonColor) },
      sunDir: { value: sunDir.clone().normalize() }
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDir;
      varying vec3 vPos;
      void main() {
        float h = clamp(vPos.y, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
        float sun = max(dot(normalize(vPos), sunDir), 0.0);
        col += vec3(1.0, 0.94, 0.82) * pow(sun, 180.0) * 1.4;
        col += vec3(1.0, 0.88, 0.72) * pow(sun, 12.0) * 0.25;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  return new THREE.Mesh(geo, mat);
}

// --- Core Setup ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let highGfx = true;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 600);
const textures = createTextures();
const helpers = { createSky, textures };

// --- Player & State ---
const player = {
  pos: new THREE.Vector3(0, 1.75, 16),
  velY: 0,
  yaw: 0,
  pitch: 0,
  eyeHeight: 1.72,
  onGround: true,
  sprint: false,
  bobTimer: 0
};

let currentWorld = null;
let worldGroup = null;
let isTransitioning = false;
let shardsCollected = new Set();
let activePortal = null;

// --- UI References ---
const worldNameEl = document.getElementById('world-name');
const shardEl = document.getElementById('shard-count');
const toastEl = document.getElementById('toast');
const actionBtn = document.getElementById('action-btn');
const fadeEl = document.getElementById('fade');

let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// --- World Switcher ---
const WORLDS = {
  hub: createHubWorld,
  forest: createForestWorld
};

function clearWorld() {
  if (!worldGroup) return;
  scene.remove(worldGroup);
  worldGroup.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  });
  worldGroup = null;
}

function loadWorld(id) {
  if (isTransitioning || !WORLDS[id]) return;
  isTransitioning = true;
  fadeEl.style.opacity = '1';

  setTimeout(() => {
    clearWorld();
    worldGroup = new THREE.Group();
    scene.add(worldGroup);

    currentWorld = WORLDS[id](worldGroup, scene, helpers, shardsCollected);
    worldNameEl.textContent = currentWorld.name;

    player.pos.copy(currentWorld.spawn);
    player.pos.y = currentWorld.getHeight(player.pos.x, player.pos.z) + player.eyeHeight;
    player.velY = 0;
    player.yaw = currentWorld.spawnYaw || 0;
    player.pitch = 0;

    fadeEl.style.opacity = '0';
    showToast(`Entered: ${currentWorld.name}`);
    setTimeout(() => { isTransitioning = false; }, 450);
  }, 450);
}

// --- Mobile Touch Controls (Multi-Touch Safe) ---
const joyZone = document.getElementById('joystick-zone');
const joyKnob = document.getElementById('joystick-knob');
const input = { moveX: 0, moveY: 0 };
let joyTouchId = null;
let lookTouchId = null;
let lastLookX = 0, lastLookY = 0;

joyZone.addEventListener('touchstart', (e) => {
  e.stopPropagation();
  if (joyTouchId !== null) return;
  const t = e.changedTouches[0];
  joyTouchId = t.identifier;
  updateJoy(t);
}, { passive: false });

joyZone.addEventListener('touchmove', (e) => {
  e.preventDefault();
  e.stopPropagation();
  for (const t of e.changedTouches) {
    if (t.identifier === joyTouchId) updateJoy(t);
  }
}, { passive: false });

function endJoy(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joyTouchId) {
      joyTouchId = null;
      input.moveX = 0; input.moveY = 0;
      joyKnob.style.transform = 'translate(0px, 0px)';
    }
  }
}
joyZone.addEventListener('touchend', endJoy);
joyZone.addEventListener('touchcancel', endJoy);

function updateJoy(touch) {
  const rect = joyZone.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const maxR = rect.width * 0.42;
  let dx = touch.clientX - cx;
  let dy = touch.clientY - cy;
  const dist = Math.hypot(dx, dy);
  if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  input.moveX = dx / maxR;
  input.moveY = dy / maxR;
}

// Camera swipe on Canvas
renderer.domElement.addEventListener('touchstart', (e) => {
  if (lookTouchId !== null) return;
  const t = e.changedTouches[0];
  lookTouchId = t.identifier;
  lastLookX = t.clientX;
  lastLookY = t.clientY;
});

renderer.domElement.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === lookTouchId) {
      const dx = t.clientX - lastLookX;
      const dy = t.clientY - lastLookY;
      lastLookX = t.clientX;
      lastLookY = t.clientY;
      player.yaw -= dx * 0.0055;
      player.pitch = Math.max(-1.15, Math.min(1.15, player.pitch - dy * 0.0045));
    }
  }
}, { passive: false });

function endLook(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === lookTouchId) lookTouchId = null;
  }
}
renderer.domElement.addEventListener('touchend', endLook);
renderer.domElement.addEventListener('touchcancel', endLook);

// Buttons
document.getElementById('jump-btn').addEventListener('touchstart', (e) => {
  e.stopPropagation();
  if (player.onGround) { player.velY = 8.2; player.onGround = false; }
});
const sprintBtn = document.getElementById('sprint-btn');
sprintBtn.addEventListener('touchstart', (e) => {
  e.stopPropagation();
  player.sprint = !player.sprint;
  sprintBtn.classList.toggle('active', player.sprint);
});
actionBtn.addEventListener('click', () => {
  if (activePortal && !activePortal.locked) loadWorld(activePortal.target);
});

// Graphics Toggle for Smooth FPS
const gfxBtn = document.getElementById('gfx-btn');
gfxBtn.addEventListener('click', () => {
  highGfx = !highGfx;
  renderer.setPixelRatio(highGfx ? Math.min(window.devicePixelRatio, 1.5) : 0.85);
  renderer.shadowMap.enabled = highGfx;
  gfxBtn.textContent = highGfx ? 'GFX: HIGH' : 'GFX: LOW';
  showToast(highGfx ? 'High Graphics Enabled' : 'Performance Mode Enabled');
});

// Keyboard fallback (if tested on PC)
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space' && player.onGround) { player.velY = 8.2; player.onGround = false; }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// Start Screen
document.getElementById('play-btn').addEventListener('click', () => {
  document.getElementById('start-screen').style.display = 'none';
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
});

// --- Main Game Loop ---
const clock = new THREE.Clock();
loadWorld('hub');

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (currentWorld && !isTransitioning) {
    // Combine Touch + Keyboard
    let mx = input.moveX;
    let my = input.moveY;
    if (keys['KeyW']) my = -1;
    if (keys['KeyS']) my = 1;
    if (keys['KeyA']) mx = -1;
    if (keys['KeyD']) mx = 1;
    if (keys['ArrowLeft']) player.yaw += 1.8 * dt;
    if (keys['ArrowRight']) player.yaw -= 1.8 * dt;

    const speed = (player.sprint || keys['ShiftLeft']) ? 11.5 : 6.4;
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

    const moveDir = new THREE.Vector3()
      .addScaledVector(forward, -my)
      .addScaledVector(right, mx);

    if (moveDir.lengthSq() > 0.001) {
      moveDir.normalize().multiplyScalar(speed * dt);
      player.pos.x += moveDir.x;
      player.pos.z += moveDir.z;
      player.bobTimer += dt * (player.sprint ? 12 : 8);
    }

    // World boundary clamp
    const bound = currentWorld.boundary || 35;
    if (currentWorld.circularBound) {
      const r = Math.hypot(player.pos.x, player.pos.z);
      if (r > bound) {
        player.pos.x = (player.pos.x / r) * bound;
        player.pos.z = (player.pos.z / r) * bound;
      }
    } else {
      player.pos.x = Math.max(-bound, Math.min(bound, player.pos.x));
      player.pos.z = Math.max(-bound, Math.min(bound, player.pos.z));
    }

    // Gravity & Ground
    const gravity = currentWorld.gravity || 22;
    player.velY -= gravity * dt;
    player.pos.y += player.velY * dt;
    const groundY = currentWorld.getHeight(player.pos.x, player.pos.z);
    if (player.pos.y <= groundY + player.eyeHeight) {
      player.pos.y = groundY + player.eyeHeight;
      player.velY = 0;
      player.onGround = true;
    }

    // Camera Transform + Subtle Walk Bob
    const bob = (player.onGround && moveDir.lengthSq() > 0.001) ? Math.sin(player.bobTimer) * 0.045 : 0;
    camera.position.set(player.pos.x, player.pos.y + bob, player.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    // Check Portals
    let foundPortal = null;
    for (const p of currentWorld.portals) {
      const d = Math.hypot(player.pos.x - p.pos.x, player.pos.z - p.pos.z);
      if (d < 4.8) {
        foundPortal = p;
        if (d < 1.7 && !p.locked) loadWorld(p.target);
        break;
      }
    }
    activePortal = foundPortal;
    if (activePortal) {
      actionBtn.style.display = 'block';
      actionBtn.textContent = activePortal.locked
        ? `🔒 ${activePortal.label} (COMING SOON)`
        : `ENTER: ${activePortal.label}`;
    } else {
      actionBtn.style.display = 'none';
    }

    // Check Code Shards
    if (currentWorld.shards) {
      for (const s of currentWorld.shards) {
        if (!s.collected && player.pos.distanceTo(s.mesh.position) < 2.6) {
          s.collected = true;
          s.mesh.visible = false;
          shardsCollected.add(s.id);
          shardEl.textContent = `CODE SHARDS: ${shardsCollected.size} / 1`;
          showToast('✨ CODE SHARD #1 COLLECTED!');
        }
      }
    }

    if (currentWorld.update) currentWorld.update(dt, clock.elapsedTime);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
