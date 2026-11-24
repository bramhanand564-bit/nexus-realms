import * as THREE from 'three';
import { createMaterialLibrary, createSkyDome, applySkyEnvironment } from './core/materials.js';
import { createHubWorld } from './worlds/hub.js';
import { createForestWorld } from './worlds/forest.js';

// --- Core Renderer (ACES Filmic Tone Mapping + Shadows) ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let highGfx = true;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 650);

// Shared Universal Engine Systems
const windUniforms = { uTime: { value: 0 } };
const materials = createMaterialLibrary();
const helpers = {
  materials,
  windUniforms,
  createSky: (top, hor, sunDir) => createSkyDome(top, hor, sunDir, windUniforms),
  applyEnv: (top, hor, gnd) => applySkyEnvironment(renderer, scene, top, hor, gnd)
};

// --- Sleek Realistic Explorer Avatar (Third-Person Character) ---
function createAvatar() {
  const root = new THREE.Group();

  const suitMat = new THREE.MeshStandardMaterial({ color: 0x262c36, roughness: 0.52, metalness: 0.25 });
  const armorMat = new THREE.MeshStandardMaterial({ color: 0xdce2e8, roughness: 0.28, metalness: 0.65 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x101c28, roughness: 0.08, metalness: 0.92 });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x3ad8ff }); // Minimal subtle accent

  // Legs
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.52, 4, 8);
  const leftLeg = new THREE.Mesh(legGeo, suitMat);
  leftLeg.position.set(-0.15, 0.42, 0); leftLeg.castShadow = true;
  const rightLeg = new THREE.Mesh(legGeo, suitMat);
  rightLeg.position.set(0.15, 0.42, 0); rightLeg.castShadow = true;

  // Torso + Jacket Shell
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 6, 10), suitMat);
  torso.position.y = 1.12; torso.castShadow = true;

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.32), armorMat);
  chestPlate.position.set(0, 1.2, 0.02); chestPlate.castShadow = true;

  const backPack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.16), armorMat);
  backPack.position.set(0, 1.18, 0.22); backPack.castShadow = true;

  const backLight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), trimMat);
  backLight.position.set(0, 1.25, 0.31);

  // Arms
  const armGeo = new THREE.CapsuleGeometry(0.085, 0.44, 4, 8);
  const leftArm = new THREE.Mesh(armGeo, suitMat);
  leftArm.position.set(-0.34, 1.08, 0); leftArm.castShadow = true;
  const rightArm = new THREE.Mesh(armGeo, suitMat);
  rightArm.position.set(0.34, 1.08, 0); rightArm.castShadow = true;

  // Helmet / Head + Reflective Visor
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), armorMat);
  head.position.y = 1.62; head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.16), visorMat);
  visor.position.set(0, 1.63, -0.11);

  root.add(leftLeg, rightLeg, torso, chestPlate, backPack, backLight, leftArm, rightArm, head, visor);
  scene.add(root);

  return { root, leftLeg, rightLeg, leftArm, rightArm };
}

const avatar = createAvatar();

// --- Player State ---
const player = {
  pos: new THREE.Vector3(0, 0, 18), // Ground feet position
  velY: 0,
  yaw: 0,
  pitch: -0.16,
  facingYaw: 0,
  onGround: true,
  sprint: false,
  thirdPerson: true,
  animTime: 0
};

let currentWorld = null;
let worldGroup = null;
let isTransitioning = false;
const shardsCollected = new Set();
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
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// --- World Management ---
const WORLDS = { hub: createHubWorld, forest: createForestWorld };

function clearWorld() {
  if (!worldGroup) return;
  scene.remove(worldGroup);
  worldGroup.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => { if (!m.userData?.shared) m.dispose(); });
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
    player.pos.y = currentWorld.getHeight(player.pos.x, player.pos.z);
    player.velY = 0;
    player.yaw = currentWorld.spawnYaw || 0;
    player.facingYaw = player.yaw;
    player.pitch = player.thirdPerson ? -0.18 : 0;

    fadeEl.style.opacity = '0';
    showToast(`Entered: ${currentWorld.name}`);
    setTimeout(() => { isTransitioning = false; }, 450);
  }, 450);
}

// --- Multi-Touch Controls ---
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
  e.preventDefault(); e.stopPropagation();
  for (const t of e.changedTouches) if (t.identifier === joyTouchId) updateJoy(t);
}, { passive: false });

function endJoy(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joyTouchId) {
      joyTouchId = null; input.moveX = 0; input.moveY = 0;
      joyKnob.style.transform = 'translate(0px, 0px)';
    }
  }
}
joyZone.addEventListener('touchend', endJoy);
joyZone.addEventListener('touchcancel', endJoy);

function updateJoy(touch) {
  const rect = joyZone.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const maxR = rect.width * 0.42;
  let dx = touch.clientX - cx, dy = touch.clientY - cy;
  const dist = Math.hypot(dx, dy);
  if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  input.moveX = dx / maxR;
  input.moveY = dy / maxR;
}

renderer.domElement.addEventListener('touchstart', (e) => {
  if (lookTouchId !== null) return;
  const t = e.changedTouches[0];
  lookTouchId = t.identifier;
  lastLookX = t.clientX; lastLookY = t.clientY;
});

renderer.domElement.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === lookTouchId) {
      const dx = t.clientX - lastLookX, dy = t.clientY - lastLookY;
      lastLookX = t.clientX; lastLookY = t.clientY;
      player.yaw -= dx * 0.0052;
      const minP = player.thirdPerson ? -0.85 : -1.1;
      const maxP = player.thirdPerson ? 0.55 : 1.1;
      player.pitch = Math.max(minP, Math.min(maxP, player.pitch - dy * 0.0042));
    }
  }
}, { passive: false });

function endLook(e) {
  for (const t of e.changedTouches) if (t.identifier === lookTouchId) lookTouchId = null;
}
renderer.domElement.addEventListener('touchend', endLook);
renderer.domElement.addEventListener('touchcancel', endLook);

// Buttons
document.getElementById('jump-btn').addEventListener('touchstart', (e) => {
  e.stopPropagation();
  if (player.onGround) { player.velY = 8.4; player.onGround = false; }
});
const sprintBtn = document.getElementById('sprint-btn');
sprintBtn.addEventListener('touchstart', (e) => {
  e.stopPropagation();
  player.sprint = !player.sprint;
  sprintBtn.classList.toggle('active', player.sprint);
});
actionBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (activePortal && !activePortal.locked) loadWorld(activePortal.target);
});

// Camera Mode Toggle (3rd Person / 1st Person)
const camBtn = document.getElementById('cam-btn');
camBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  player.thirdPerson = !player.thirdPerson;
  avatar.root.visible = player.thirdPerson;
  camBtn.textContent = player.thirdPerson ? 'CAM: 3RD' : 'CAM: 1ST';
  showToast(player.thirdPerson ? 'Third-Person View' : 'First-Person View');
});

// Graphics Toggle
const gfxBtn = document.getElementById('gfx-btn');
gfxBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  highGfx = !highGfx;
  renderer.setPixelRatio(highGfx ? Math.min(window.devicePixelRatio, 1.5) : 0.85);
  renderer.shadowMap.enabled = highGfx;
  gfxBtn.textContent = highGfx ? 'GFX: HIGH' : 'GFX: LOW';
  showToast(highGfx ? 'High Graphics Enabled' : 'Performance Mode Enabled');
});

// Keyboard fallback
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space' && player.onGround) { player.velY = 8.4; player.onGround = false; }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// Start Screen + Auto Landscape Lock
document.getElementById('play-btn').addEventListener('click', async () => {
  document.getElementById('start-screen').style.display = 'none';
  try {
    if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) {}
});

// --- Main Loop ---
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
const desiredCamPos = new THREE.Vector3();
loadWorld('hub');

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  windUniforms.uTime.value = clock.elapsedTime;

  if (currentWorld && !isTransitioning) {
    let mx = input.moveX, my = input.moveY;
    if (keys['KeyW']) my = -1; if (keys['KeyS']) my = 1;
    if (keys['KeyA']) mx = -1; if (keys['KeyD']) mx = 1;
    if (keys['ArrowLeft']) player.yaw += 1.9 * dt;
    if (keys['ArrowRight']) player.yaw -= 1.9 * dt;

    const speed = (player.sprint || keys['ShiftLeft']) ? 11.2 : 6.2;
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const moveDir = new THREE.Vector3().addScaledVector(forward, -my).addScaledVector(right, mx);
    const isMoving = moveDir.lengthSq() > 0.002;

    if (isMoving) {
      moveDir.normalize();
      player.pos.x += moveDir.x * speed * dt;
      player.pos.z += moveDir.z * speed * dt;

      // Smoothly turn character toward walking direction
      const targetYaw = Math.atan2(-moveDir.x, -moveDir.z);
      let diff = targetYaw - player.facingYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.facingYaw += diff * Math.min(1, dt * 11);
      player.animTime += dt * (player.sprint ? 12 : 8.5);
    }

    // Boundary clamp
    const bound = currentWorld.boundary || 35;
    if (currentWorld.circularBound) {
      const r = Math.hypot(player.pos.x, player.pos.z);
      if (r > bound) { player.pos.x = (player.pos.x / r) * bound; player.pos.z = (player.pos.z / r) * bound; }
    } else {
      player.pos.x = Math.max(-bound, Math.min(bound, player.pos.x));
      player.pos.z = Math.max(-bound, Math.min(bound, player.pos.z));
    }

    // Gravity & Ground Height
    player.velY -= (currentWorld.gravity || 22) * dt;
    player.pos.y += player.velY * dt;
    const groundY = currentWorld.getHeight(player.pos.x, player.pos.z);
    if (player.pos.y <= groundY) {
      player.pos.y = groundY;
      player.velY = 0;
      player.onGround = true;
    }

    // Update Avatar Position & Limb Animation
    avatar.root.position.copy(player.pos);
    avatar.root.rotation.y = player.thirdPerson ? player.facingYaw : player.yaw;
    const swing = isMoving && player.onGround ? Math.sin(player.animTime) * (player.sprint ? 0.72 : 0.45) : 0;
    avatar.leftLeg.rotation.x = swing;
    avatar.rightLeg.rotation.x = -swing;
    avatar.leftArm.rotation.x = -swing * 0.75;
    avatar.rightArm.rotation.x = swing * 0.75;

    // Camera System (Smooth 3rd-Person Orbit OR 1st-Person)
    if (player.thirdPerson) {
      const dist = 4.6;
      const horiz = Math.cos(player.pitch) * dist;
      const vert = -Math.sin(player.pitch) * dist;
      camTarget.set(player.pos.x, player.pos.y + 1.55, player.pos.z);
      desiredCamPos.set(
        camTarget.x + Math.sin(player.yaw) * horiz,
        Math.max(currentWorld.getHeight(camTarget.x, camTarget.z) + 0.55, camTarget.y + vert + 0.4),
        camTarget.z + Math.cos(player.yaw) * horiz
      );
      camera.position.lerp(desiredCamPos, Math.min(1, dt * 14));
      camera.lookAt(camTarget);
    } else {
      const bob = (player.onGround && isMoving) ? Math.sin(player.animTime) * 0.04 : 0;
      camera.position.set(player.pos.x, player.pos.y + 1.66 + bob, player.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = player.yaw;
      camera.rotation.x = player.pitch;
    }

    // Check Portals
    let foundPortal = null;
    for (const p of currentWorld.portals) {
      const d = Math.hypot(player.pos.x - p.pos.x, player.pos.z - p.pos.z);
      if (d < 5.0) {
        foundPortal = p;
        if (d < 1.8 && !p.locked) loadWorld(p.target);
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
        if (!s.collected && player.pos.distanceTo(s.mesh.position) < 2.8) {
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
