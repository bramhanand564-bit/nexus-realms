import * as THREE from 'three';
import { createMaterialLibrary, createSkyDome, applySkyEnvironment } from './core/materials.js';
import { createCharacterSystem, DEFAULT_CHAR_CONFIG, CHAR_PRESETS } from './core/character.js';
import { createHubWorld } from './worlds/hub.js';
import { createForestWorld } from './worlds/forest.js';

// --- Core Renderer ---
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
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.08, 650);

// Shared Engine Systems
const windUniforms = { uTime: { value: 0 } };
const materials = createMaterialLibrary();
const helpers = {
  materials,
  windUniforms,
  createSky: (top, hor, sunDir) => createSkyDome(top, hor, sunDir, windUniforms),
  applyEnv: (top, hor, gnd) => applySkyEnvironment(renderer, scene, top, hor, gnd)
};

// Load Saved Character Config (Defaults to Video Hero Look!)
let savedChar = { ...DEFAULT_CHAR_CONFIG };
try {
  const raw = localStorage.getItem('nexus_char_v1');
  if (raw) savedChar = { ...DEFAULT_CHAR_CONFIG, ...JSON.parse(raw) };
} catch (_) {}

const character = createCharacterSystem(scene, savedChar);

// --- Player & Studio State ---
const player = {
  pos: new THREE.Vector3(0, 0, 19),
  velY: 0,
  yaw: 0,
  pitch: -0.16,
  facingYaw: 0,
  onGround: true,
  sprint: false,
  thirdPerson: true,
  animTime: 0
};

let studioOpen = false;
let studioFaceZoom = true;
let studioYaw = 0.35; // Slight dramatic 3/4 portrait angle facing the front!

let currentWorld = null;
let worldGroup = null;
let isTransitioning = false;
const shardsCollected = new Set();
let activePortal = null;

// --- UI Elements ---
const worldNameEl = document.getElementById('world-name');
const shardEl = document.getElementById('shard-count');
const toastEl = document.getElementById('toast');
const actionBtn = document.getElementById('action-btn');
const fadeEl = document.getElementById('fade');
const joyZone = document.getElementById('joystick-zone');
const joyKnob = document.getElementById('joystick-knob');
const rightControls = document.getElementById('right-controls');
const studioPanel = document.getElementById('studio-panel');
const studioHint = document.getElementById('studio-hint');
const studioZoomBtn = document.getElementById('studio-zoom-btn');

let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

// --- World Switcher ---
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
    player.pitch = player.thirdPerson ? -0.16 : 0;

    fadeEl.style.opacity = '0';
    showToast(`Entered: ${currentWorld.name}`);
    setTimeout(() => { isTransitioning = false; }, 450);
  }, 450);
}

// --- CHARACTER STUDIO LOGIC & CONTROLS ---
const SKIN_SWATCHES = ['#f5d5be', '#e4bc9e', '#d29e78', '#b87d56', '#8d593a', '#5a3622'];
const EYE_SWATCHES = ['#4c7c92', '#2d5a27', '#5a3822', '#22262e', '#3cecff', '#9c4ce8'];
const HAIR_SWATCHES = ['#1a1614', '#231b16', '#5a3921', '#a67b43', '#c8cdd4', '#7a2222', '#28567a'];
const GLOW_SWATCHES = ['#44f0ff', '#ff4499', '#55ff88', '#ffbb33', '#9d66ff', '#ffffff'];
const OUTFIT_SWATCHES = ['#1d222b', '#2b3a4a', '#3b332b', '#2c3d2e', '#592329', '#cfd6de'];
const BEARD_LABELS = ['Clean', 'Stubble', 'Short Trim', 'Full Beard', 'Long Rugged'];

function saveAndApplyChar(patch) {
  character.rebuild(patch);
  try { localStorage.setItem('nexus_char_v1', JSON.stringify(character.getConfig())); } catch (_) {}
  syncStudioUI();
}

function buildSwatches(containerId, colors, key) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  colors.forEach((col) => {
    const btn = document.createElement('button');
    btn.className = 'st-swatch';
    btn.style.background = col;
    btn.dataset.val = col;
    btn.addEventListener('click', () => {
      if (key === 'glow') saveAndApplyChar({ circuitColor: col, accentColor: col });
      else saveAndApplyChar({ [key]: col });
    });
    el.appendChild(btn);
  });
}

buildSwatches('sw-skin', SKIN_SWATCHES, 'skinTone');
buildSwatches('sw-eye', EYE_SWATCHES, 'eyeColor');
buildSwatches('sw-hair', HAIR_SWATCHES, 'hairColor');
buildSwatches('sw-glow', GLOW_SWATCHES, 'glow');
buildSwatches('sw-outfit', OUTFIT_SWATCHES, 'outfitColor');

function syncStudioUI() {
  const c = character.getConfig();
  document.getElementById('inp-age').value = c.age;
  document.getElementById('val-age').textContent = `${c.age} yrs`;
  document.getElementById('inp-hair-style').value = c.hairStyle;
  document.getElementById('inp-hair-len').value = c.hairLength;
  document.getElementById('val-hair-len').textContent = `${c.hairLength.toFixed(2)}x`;
  document.getElementById('inp-beard').value = c.beardSize;
  document.getElementById('val-beard').textContent = BEARD_LABELS[c.beardSize] || 'Clean';
  document.getElementById('inp-outfit').value = c.outfit;

  document.querySelectorAll('[data-gender]').forEach(b => b.classList.toggle('active', b.dataset.gender === c.gender));
  document.querySelectorAll('[data-circuit]').forEach(b => b.classList.toggle('active', (b.dataset.circuit === 'on') === c.circuits));

  const markSw = (id, val) => {
    document.querySelectorAll(`#${id} .st-swatch`).forEach(s => s.classList.toggle('active', s.dataset.val.toLowerCase() === val.toLowerCase()));
  };
  markSw('sw-skin', c.skinTone);
  markSw('sw-eye', c.eyeColor);
  markSw('sw-hair', c.hairColor);
  markSw('sw-glow', c.circuitColor);
  markSw('sw-outfit', c.outfitColor);
}

// Studio Inputs Event Wiring
document.querySelectorAll('[data-gender]').forEach(btn => {
  btn.addEventListener('click', () => {
    const g = btn.dataset.gender;
    saveAndApplyChar({ gender: g, beardSize: g === 'female' ? 0 : character.getConfig().beardSize });
  });
});

document.querySelectorAll('[data-circuit]').forEach(btn => {
  btn.addEventListener('click', () => saveAndApplyChar({ circuits: btn.dataset.circuit === 'on' }));
});

document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const p = btn.dataset.preset;
    if (p === 'random') {
      const pick = arr => arr[Math.floor(Math.random() * arr.length)];
      const g = Math.random() > 0.5 ? 'male' : 'female';
      const glow = pick(GLOW_SWATCHES);
      saveAndApplyChar({
        gender: g,
        age: 14 + Math.floor(Math.random() * 50),
        skinTone: pick(SKIN_SWATCHES),
        eyeColor: pick(EYE_SWATCHES),
        hairStyle: pick(['video_short', 'buzz', 'medium', 'long', 'ponytail', 'spiky']),
        hairColor: pick(HAIR_SWATCHES),
        hairLength: +(0.7 + Math.random() * 0.7).toFixed(2),
        beardSize: g === 'female' ? 0 : Math.floor(Math.random() * 5),
        circuits: Math.random() > 0.3,
        circuitColor: glow,
        accentColor: glow,
        outfit: pick(['stealth', 'jacket', 'armor', 'hoodie']),
        outfitColor: pick(OUTFIT_SWATCHES)
      });
    } else if (CHAR_PRESETS[p]) {
      saveAndApplyChar(CHAR_PRESETS[p]);
    }
  });
});

document.getElementById('inp-age').addEventListener('input', e => saveAndApplyChar({ age: parseInt(e.target.value, 10) }));
document.getElementById('inp-hair-style').addEventListener('change', e => saveAndApplyChar({ hairStyle: e.target.value }));
document.getElementById('inp-hair-len').addEventListener('input', e => saveAndApplyChar({ hairLength: parseFloat(e.target.value) }));
document.getElementById('inp-beard').addEventListener('input', e => saveAndApplyChar({ beardSize: parseInt(e.target.value, 10) }));
document.getElementById('inp-outfit').addEventListener('change', e => saveAndApplyChar({ outfit: e.target.value }));

function setStudioMode(open) {
  studioOpen = open;
  studioPanel.classList.toggle('open', open);
  studioHint.classList.toggle('open', open);
  joyZone.style.display = open ? 'none' : 'block';
  rightControls.style.display = open ? 'none' : 'flex';
  if (open) {
    character.root.visible = true;
    studioYaw = player.facingYaw + Math.PI + 0.35; // Face camera directly!
    syncStudioUI();
  } else {
    character.root.visible = player.thirdPerson;
    showToast('Character Saved!');
  }
}

document.getElementById('studio-btn').addEventListener('click', (e) => { e.stopPropagation(); setStudioMode(!studioOpen); });
document.getElementById('studio-close').addEventListener('click', (e) => { e.stopPropagation(); setStudioMode(false); });
studioZoomBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  studioFaceZoom = !studioFaceZoom;
  studioZoomBtn.textContent = studioFaceZoom ? 'ZOOM: FACE' : 'ZOOM: BODY';
});

// Prevent touches inside Studio Panel from rotating the 3D camera
studioPanel.addEventListener('touchstart', e => e.stopPropagation());
studioPanel.addEventListener('touchmove', e => e.stopPropagation());

// --- Multi-Touch Gameplay Controls ---
const input = { moveX: 0, moveY: 0 };
let joyTouchId = null;
let lookTouchId = null;
let lastLookX = 0, lastLookY = 0;

joyZone.addEventListener('touchstart', (e) => {
  e.stopPropagation();
  if (joyTouchId !== null || studioOpen) return;
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
      if (studioOpen) {
        studioYaw -= dx * 0.01;
      } else {
        player.yaw -= dx * 0.0052;
        const minP = player.thirdPerson ? -0.85 : -1.1;
        const maxP = player.thirdPerson ? 0.55 : 1.1;
        player.pitch = Math.max(minP, Math.min(maxP, player.pitch - dy * 0.0042));
      }
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
  if (!studioOpen && player.onGround) { player.velY = 8.4; player.onGround = false; }
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

const camBtn = document.getElementById('cam-btn');
camBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (studioOpen) return;
  player.thirdPerson = !player.thirdPerson;
  character.root.visible = player.thirdPerson;
  camBtn.textContent = player.thirdPerson ? 'CAM: 3RD' : 'CAM: 1ST';
  showToast(player.thirdPerson ? 'Third-Person View' : 'First-Person View');
});

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
  if (!studioOpen && e.code === 'Space' && player.onGround) { player.velY = 8.4; player.onGround = false; }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

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
  const elapsed = clock.elapsedTime;
  windUniforms.uTime.value = elapsed;

  if (currentWorld && !isTransitioning) {
    let isMoving = false;

    if (!studioOpen) {
      let mx = input.moveX, my = input.moveY;
      if (keys['KeyW']) my = -1; if (keys['KeyS']) my = 1;
      if (keys['KeyA']) mx = -1; if (keys['KeyD']) mx = 1;
      if (keys['ArrowLeft']) player.yaw += 1.9 * dt;
      if (keys['ArrowRight']) player.yaw -= 1.9 * dt;

      const speed = (player.sprint || keys['ShiftLeft']) ? 11.2 : 6.2;
      const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
      const moveDir = new THREE.Vector3().addScaledVector(forward, -my).addScaledVector(right, mx);
      isMoving = moveDir.lengthSq() > 0.002;

      if (isMoving) {
        moveDir.normalize();
        player.pos.x += moveDir.x * speed * dt;
        player.pos.z += moveDir.z * speed * dt;

        const targetYaw = Math.atan2(-moveDir.x, -moveDir.z);
        let diff = targetYaw - player.facingYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.facingYaw += diff * Math.min(1, dt * 11);
        player.animTime += dt * (player.sprint ? 11.5 : 8.2);
      }

      const bound = currentWorld.boundary || 35;
      if (currentWorld.circularBound) {
        const r = Math.hypot(player.pos.x, player.pos.z);
        if (r > bound) { player.pos.x = (player.pos.x / r) * bound; player.pos.z = (player.pos.z / r) * bound; }
      } else {
        player.pos.x = Math.max(-bound, Math.min(bound, player.pos.x));
        player.pos.z = Math.max(-bound, Math.min(bound, player.pos.z));
      }

      player.velY -= (currentWorld.gravity || 22) * dt;
      player.pos.y += player.velY * dt;
      const groundY = currentWorld.getHeight(player.pos.x, player.pos.z);
      if (player.pos.y <= groundY) {
        player.pos.y = groundY;
        player.velY = 0;
        player.onGround = true;
      }
    }

    // Position & Animate Character
    character.root.position.copy(player.pos);
    character.root.rotation.y = (player.thirdPerson || studioOpen) ? player.facingYaw : player.yaw;
    character.updateAnimation(dt, elapsed, isMoving, player.sprint, player.onGround, player.animTime);

    // Camera System: Studio Live Turntable OR Gameplay 3rd/1st Person
    if (studioOpen) {
      const dist = studioFaceZoom ? 1.15 : 2.95;
      const focusY = studioFaceZoom ? 1.48 : 0.96;
      // Offset look target slightly right so character sits neatly on the LEFT of the Studio drawer!
      const sideX = Math.cos(studioYaw) * (studioFaceZoom ? 0.24 : 0.62);
      const sideZ = -Math.sin(studioYaw) * (studioFaceZoom ? 0.24 : 0.62);

      camTarget.set(player.pos.x + sideX, player.pos.y + focusY, player.pos.z + sideZ);
      desiredCamPos.set(
        player.pos.x + Math.sin(studioYaw) * dist + sideX,
        player.pos.y + focusY + (studioFaceZoom ? 0.04 : 0.22),
        player.pos.z + Math.cos(studioYaw) * dist + sideZ
      );
      camera.position.lerp(desiredCamPos, Math.min(1, dt * 10));
      camera.lookAt(camTarget);
      actionBtn.style.display = 'none';
    } else if (player.thirdPerson) {
      const dist = 4.2;
      const horiz = Math.cos(player.pitch) * dist;
      const vert = -Math.sin(player.pitch) * dist;
      camTarget.set(player.pos.x, player.pos.y + 1.45, player.pos.z);
      desiredCamPos.set(
        camTarget.x + Math.sin(player.yaw) * horiz,
        Math.max(currentWorld.getHeight(camTarget.x, camTarget.z) + 0.5, camTarget.y + vert + 0.35),
        camTarget.z + Math.cos(player.yaw) * horiz
      );
      camera.position.lerp(desiredCamPos, Math.min(1, dt * 14));
      camera.lookAt(camTarget);
    } else {
      const bob = (player.onGround && isMoving) ? Math.sin(player.animTime) * 0.035 : 0;
      camera.position.set(player.pos.x, player.pos.y + 1.60 + bob, player.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = player.yaw;
      camera.rotation.x = player.pitch;
    }

    // Portals & Shards (only when not editing in Studio)
    if (!studioOpen) {
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
    }

    if (currentWorld.update) currentWorld.update(dt, elapsed);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
