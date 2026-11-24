import * as THREE from 'three';

export const DEFAULT_CHAR_CONFIG = {
  gender: 'male',            // 'male' | 'female'
  age: 16,                   // 12 (Young) to 70 (Elder)
  skinTone: '#e4bc9e',
  eyeColor: '#4c7c92',
  hairStyle: 'video_short',  // 'video_short' | 'buzz' | 'medium' | 'long' | 'ponytail' | 'spiky'
  hairColor: '#231b16',
  hairLength: 1.0,           // 0.6 to 1.5
  beardSize: 0,              // 0 (Clean) to 4 (Long Rugged)
  circuits: true,            // Glowing neural face/neck circuits (Video look)
  circuitColor: '#44f0ff',
  outfit: 'stealth',         // 'stealth' | 'jacket' | 'armor' | 'hoodie'
  outfitColor: '#1d222b',
  accentColor: '#44f0ff'
};

export const CHAR_PRESETS = {
  video: { ...DEFAULT_CHAR_CONFIG },
  girl: {
    gender: 'female', age: 21, skinTone: '#e8c2a6', eyeColor: '#3a9b9e',
    hairStyle: 'long', hairColor: '#261815', hairLength: 1.15, beardSize: 0,
    circuits: true, circuitColor: '#56e6ff', outfit: 'stealth',
    outfitColor: '#1f232e', accentColor: '#56e6ff'
  },
  elder: {
    gender: 'male', age: 62, skinTone: '#d4a382', eyeColor: '#5a6b73',
    hairStyle: 'medium', hairColor: '#b8bdc4', hairLength: 0.95, beardSize: 3,
    circuits: false, circuitColor: '#ffaa44', outfit: 'jacket',
    outfitColor: '#3a2e28', accentColor: '#d4a24c'
  }
};

function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) };
}

function shadeHex(hex, factor) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return '#' + c.getHexString();
}

// --- 512x512 DYNAMIC SKIN + FACE DETAILS + GLOWING NEURAL CIRCUIT TEXTURES ---
function createHeadTextures(cfg) {
  const S = 512;

  // 1. Albedo Skin Canvas (u=0.5 is Front Center Face after +90deg Y rotation)
  const skinCanvas = document.createElement('canvas');
  skinCanvas.width = skinCanvas.height = S;
  const ctx = skinCanvas.getContext('2d');

  // Base Skin Tone
  ctx.fillStyle = cfg.skinTone;
  ctx.fillRect(0, 0, S, S);

  // Subtle realistic skin pores & tonal variation
  const baseRgb = hexToRgb(cfg.skinTone);
  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,245,235,0.035)' : 'rgba(65,30,18,0.035)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Soft natural warmth on cheeks & nose (u=0.5 is center, v=0.5 is eye/nose equator)
  const blushGradL = ctx.createRadialGradient(S * 0.42, S * 0.57, 4, S * 0.42, S * 0.57, 46);
  blushGradL.addColorStop(0, cfg.gender === 'female' ? 'rgba(220,95,95,0.22)' : 'rgba(210,100,85,0.13)');
  blushGradL.addColorStop(1, 'rgba(210,100,85,0)');
  ctx.fillStyle = blushGradL;
  ctx.fillRect(0, 0, S, S);

  const blushGradR = ctx.createRadialGradient(S * 0.58, S * 0.57, 4, S * 0.58, S * 0.57, 46);
  blushGradR.addColorStop(0, cfg.gender === 'female' ? 'rgba(220,95,95,0.22)' : 'rgba(210,100,85,0.13)');
  blushGradR.addColorStop(1, 'rgba(210,100,85,0)');
  ctx.fillStyle = blushGradR;
  ctx.fillRect(0, 0, S, S);

  // Eye socket soft ambient occlusion shading
  const drawSocket = (cx) => {
    const g = ctx.createRadialGradient(cx, S * 0.48, 3, cx, S * 0.48, 28);
    g.addColorStop(0, 'rgba(50,30,25,0.22)');
    g.addColorStop(1, 'rgba(50,30,25,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, S * 0.48, 28, 0, Math.PI * 2); ctx.fill();
  };
  drawSocket(S * 0.435);
  drawSocket(S * 0.565);

  // Realistic Lips (Center at u=0.5, y=0.665)
  const lipColor = cfg.gender === 'female'
    ? `rgba(${Math.min(255, baseRgb.r * 0.85 + 35)}, ${baseRgb.g * 0.52}, ${baseRgb.b * 0.52}, 0.85)`
    : `rgba(${Math.min(255, baseRgb.r * 0.82 + 12)}, ${baseRgb.g * 0.6}, ${baseRgb.b * 0.58}, 0.72)`;
  ctx.fillStyle = lipColor;
  ctx.beginPath();
  ctx.ellipse(S * 0.5, S * 0.662, cfg.gender === 'female' ? 19 : 17, cfg.gender === 'female' ? 6.5 : 5.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Mouth parting crease
  ctx.strokeStyle = 'rgba(65, 32, 28, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(S * 0.5 - 16, S * 0.662);
  ctx.quadraticCurveTo(S * 0.5, S * 0.668, S * 0.5 + 16, S * 0.662);
  ctx.stroke();

  // Age Details: Forehead lines, smile folds & under-eye creases
  const ageFactor = Math.max(0, (cfg.age - 32) / 38);
  if (ageFactor > 0.05) {
    ctx.strokeStyle = `rgba(60, 35, 22, ${0.32 * ageFactor})`;
    ctx.lineWidth = 1.6;
    // Forehead creases
    for (let i = 0; i < 3; i++) {
      const y = S * (0.34 + i * 0.024);
      ctx.beginPath();
      ctx.moveTo(S * 0.41, y);
      ctx.quadraticCurveTo(S * 0.5, y - 4, S * 0.59, y);
      ctx.stroke();
    }
    // Smile / Nasolabial lines
    ctx.beginPath();
    ctx.moveTo(S * 0.46, S * 0.58); ctx.quadraticCurveTo(S * 0.435, S * 0.64, S * 0.445, S * 0.69);
    ctx.moveTo(S * 0.54, S * 0.58); ctx.quadraticCurveTo(S * 0.565, S * 0.64, S * 0.555, S * 0.69);
    ctx.stroke();
  }

  // Beard Stubble Shadow on skin when beardSize >= 1
  if (cfg.beardSize >= 1 && cfg.gender === 'male') {
    const hRgb = hexToRgb(cfg.hairColor);
    const alpha = cfg.beardSize === 1 ? 0.34 : 0.52;
    ctx.fillStyle = `rgba(${hRgb.r}, ${hRgb.g}, ${hRgb.b}, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(S * 0.5, S * 0.72, 62, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    // Clear around lips slightly
    ctx.fillStyle = cfg.skinTone;
    ctx.beginPath();
    ctx.ellipse(S * 0.5, S * 0.662, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Re-draw lips over stubble
    ctx.fillStyle = lipColor;
    ctx.beginPath();
    ctx.ellipse(S * 0.5, S * 0.662, 17, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Emissive Neural Circuit Map (Glowing Cheek, Jawline & Temple Circuits like Video!)
  const emCanvas = document.createElement('canvas');
  emCanvas.width = emCanvas.height = S;
  const eCtx = emCanvas.getContext('2d');
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, S, S);

  if (cfg.circuits) {
    const drawSideCircuits = (dir) => {
      // dir = -1 (left cheek/jaw) or +1 (right cheek/jaw)
      const cx = (u) => S * (0.5 + dir * u);
      const cy = (v) => S * v;

      const paths = [
        // Main cheekbone glowing trace (exact video signature!)
        [[0.075, 0.56], [0.11, 0.545], [0.15, 0.565], [0.195, 0.545], [0.22, 0.51]],
        // Upper temple branch
        [[0.11, 0.545], [0.13, 0.50], [0.165, 0.485], [0.20, 0.45]],
        // Jawline circuit down toward neck
        [[0.085, 0.63], [0.125, 0.64], [0.165, 0.69], [0.19, 0.76], [0.16, 0.85]],
        // Vertical interconnect
        [[0.15, 0.565], [0.15, 0.625], [0.125, 0.64]],
        // Chin / Lower jaw trace
        [[0.07, 0.72], [0.11, 0.74], [0.145, 0.79], [0.12, 0.86]],
        // Ear-side branch
        [[0.195, 0.545], [0.23, 0.59], [0.22, 0.67], [0.19, 0.76]]
      ];

      // Draw crisp glowing circuit lines onto both emissive & subtle skin canvas
      const renderLines = (targetCtx, lineW, glowBlur) => {
        targetCtx.save();
        targetCtx.strokeStyle = cfg.circuitColor;
        targetCtx.fillStyle = '#ffffff';
        targetCtx.lineWidth = lineW;
        targetCtx.lineCap = 'round';
        targetCtx.lineJoin = 'round';
        targetCtx.shadowColor = cfg.circuitColor;
        targetCtx.shadowBlur = glowBlur;

        paths.forEach((pts) => {
          targetCtx.beginPath();
          pts.forEach(([u, v], i) => {
            if (i === 0) targetCtx.moveTo(cx(u), cy(v));
            else targetCtx.lineTo(cx(u), cy(v));
          });
          targetCtx.stroke();

          // Glowing circuit nodes at joints & tips
          pts.forEach(([u, v], i) => {
            if (i === 0 || i === pts.length - 1 || i === 2) {
              targetCtx.beginPath();
              targetCtx.arc(cx(u), cy(v), lineW * 1.15, 0, Math.PI * 2);
              targetCtx.fill();
            }
          });
        });
        targetCtx.restore();
      };

      renderLines(eCtx, 2.5, 9);
      ctx.globalAlpha = 0.75;
      renderLines(ctx, 1.8, 4);
      ctx.globalAlpha = 1.0;
    };

    drawSideCircuits(-1);
    drawSideCircuits(1);
  }

  const skinTex = new THREE.CanvasTexture(skinCanvas);
  skinTex.colorSpace = THREE.SRGBColorSpace;
  const emissiveTex = new THREE.CanvasTexture(emCanvas);
  emissiveTex.colorSpace = THREE.SRGBColorSpace;
  return { skinTex, emissiveTex };
}

// --- CARBON-WEAVE SUIT TEXTURE WITH SUBTLE CIRCUIT SEAMS ---
function createSuitTexture(baseColor, accentColor, isStealth) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, S, S);

  // Fine tactical weave micro-texture
  for (let y = 0; y < S; y += 6) {
    for (let x = 0; x < S; x += 6) {
      ctx.fillStyle = ((x + y) % 12 === 0) ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(x, y, 4, 4);
    }
  }

  // Tailored panel seam lines
  ctx.strokeStyle = 'rgba(0,0,0,0.38)';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, S - 36, S - 36);
  ctx.beginPath();
  ctx.moveTo(S * 0.5, 0); ctx.lineTo(S * 0.5, S);
  ctx.stroke();

  if (isStealth) {
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, S - 48, S - 48);
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

// --- SCULPTED ANATOMICAL HEAD GEOMETRY (Front = -Z, u=0.5) ---
function createSculptedHeadGeo(cfg) {
  const geo = new THREE.SphereGeometry(0.145, 28, 22);
  geo.rotateY(Math.PI / 2); // Align UV u=0.5 directly to Front (-Z)
  const pos = geo.attributes.position;
  const isFemale = cfg.gender === 'female';
  const jawNarrow = isFemale ? 0.80 : (cfg.age < 20 ? 0.85 : 0.94);

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // Elongate head vertically slightly
    y *= 1.15;
    x *= isFemale ? 0.88 : 0.92;
    // Taper jawline & chin naturally below equator
    if (y < 0) {
      const t = Math.min(1, -y / 0.16);
      x *= 1.0 - t * (1.0 - jawNarrow) * 0.75;
      // Subtle chin prominence forward (-Z)
      if (z < 0) z *= 1.0 + t * 0.08;
    }
    // Slight brow prominence above eyes
    if (z < -0.08 && y > 0.025 && y < 0.075) z -= 0.008;
    // Slight cheekbones
    if (z < -0.05 && y > -0.04 && y < 0.015 && Math.abs(x) > 0.06) x *= 1.04;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

// --- LAYERED PROCEDURAL HAIR BUILDER ---
function buildHair(headGroup, cfg, hairMat) {
  const hairGroup = new THREE.Group();
  const len = cfg.hairLength;
  const style = cfg.hairStyle;

  // Base sculpted hair cap (eliminates bald gaps)
  const capGeo = new THREE.SphereGeometry(0.151, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
  capGeo.scale(cfg.gender === 'female' ? 0.90 : 0.94, 1.13, 1.02);
  const cap = new THREE.Mesh(capGeo, hairMat);
  cap.position.set(0, 0.015, 0.008);
  cap.rotation.x = -0.18;
  cap.castShadow = true;
  hairGroup.add(cap);

  if (style === 'buzz') {
    headGroup.add(hairGroup);
    return;
  }

  // Deterministic pseudo-random for rich layered hair locks
  let seed = 313;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const lockGeo = new THREE.ConeGeometry(0.026, 0.12, 5);
  lockGeo.translate(0, -0.055, 0);

  // Front Bangs / Messy Layered Fringe (Signature Video Look!)
  const bangCount = style === 'spiky' ? 14 : 11;
  for (let i = 0; i < bangCount; i++) {
    const t = (i / (bangCount - 1)) - 0.5;
    const lock = new THREE.Mesh(lockGeo, hairMat);
    const angle = t * 1.45;
    lock.position.set(
      Math.sin(angle) * 0.125,
      0.105 + (rand() - 0.5) * 0.025,
      -Math.cos(angle) * 0.125
    );
    if (style === 'spiky') {
      lock.rotation.set(-0.85 - rand() * 0.4, -angle, (rand() - 0.5) * 0.4);
      lock.scale.set(0.85, 0.85 * len, 0.85);
    } else {
      lock.rotation.set(0.32 + rand() * 0.25, -angle, t * 0.45 + (rand() - 0.5) * 0.28);
      lock.scale.set(0.9 + rand() * 0.4, (0.72 + rand() * 0.42) * len, 0.7);
    }
    lock.castShadow = true;
    hairGroup.add(lock);
  }

  // Crown & Top Volume Strands
  const crownCount = 26;
  for (let i = 0; i < crownCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.02 + rand() * 0.115;
    const lock = new THREE.Mesh(lockGeo, hairMat);
    lock.position.set(Math.cos(a) * r, 0.155 - r * 0.25, Math.sin(a) * r + 0.01);
    if (style === 'spiky') {
      lock.rotation.set(Math.PI + (rand() - 0.5) * 0.6, a, (rand() - 0.5) * 0.6);
      lock.scale.set(0.85, (0.75 + rand() * 0.45) * len, 0.85);
    } else {
      lock.rotation.set(0.45 + rand() * 0.5, a, (rand() - 0.5) * 0.5);
      lock.scale.set(1.0 + rand() * 0.45, (0.75 + rand() * 0.4) * len, 0.75);
    }
    hairGroup.add(lock);
  }

  // Sides & Back Hair (scales with style: video_short, medium, long, ponytail)
  const dropFactor = style === 'long' ? 2.8 : (style === 'medium' ? 1.65 : 1.0);
  const sideCount = style === 'long' ? 26 : 18;
  for (let i = 0; i < sideCount; i++) {
    const a = (i / sideCount) * Math.PI * 1.45 - Math.PI * 0.725; // Back & Sides (+Z arc)
    const lock = new THREE.Mesh(lockGeo, hairMat);
    lock.position.set(
      Math.sin(a) * 0.132,
      0.06 + (rand() - 0.5) * 0.04,
      Math.cos(a) * 0.138 + 0.006
    );
    lock.rotation.set(-0.18 + rand() * 0.16, a, (rand() - 0.5) * 0.18);
    lock.scale.set(1.15, (0.9 + rand() * 0.35) * dropFactor * len, 0.8);
    lock.castShadow = true;
    hairGroup.add(lock);
  }

  // Ponytail attachment
  if (style === 'ponytail') {
    const tie = new THREE.Mesh(
      new THREE.TorusGeometry(0.032, 0.009, 6, 12),
      new THREE.MeshStandardMaterial({ color: cfg.accentColor, roughness: 0.4 })
    );
    tie.position.set(0, 0.04, 0.155);
    hairGroup.add(tie);

    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.055, 0.28 * len, 9),
      hairMat
    );
    tail.position.set(0, 0.04 - 0.13 * len, 0.185);
    tail.rotation.x = 0.22;
    tail.castShadow = true;
    hairGroup.add(tail);
  }

  headGroup.add(hairGroup);
}

// --- SCULPTED 3D BEARD & MUSTACHE BUILDER ---
function buildBeard(headGroup, cfg, hairMat) {
  if (cfg.beardSize < 2 || cfg.gender === 'female') return;
  const beardGroup = new THREE.Group();
  const s = cfg.beardSize; // 2=Short, 3=Full, 4=Long Rugged

  // Mustache
  const stacheL = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.032, 4, 6), hairMat);
  stacheL.position.set(-0.022, -0.048, -0.128);
  stacheL.rotation.z = 1.32;
  const stacheR = stacheL.clone();
  stacheR.position.x = 0.022; stacheR.rotation.z = -1.32;
  beardGroup.add(stacheL, stacheR);

  // Jawline & Chin Sculpted Beard Volume
  const lengthY = s === 2 ? 0.065 : (s === 3 ? 0.115 : 0.18);
  const thick = s === 2 ? 0.018 : (s === 3 ? 0.032 : 0.042);

  const chinBeard = new THREE.Mesh(
    new THREE.ConeGeometry(0.068 + thick * 0.5, lengthY, 10),
    hairMat
  );
  chinBeard.rotation.x = Math.PI; // Point downward
  chinBeard.position.set(0, -0.105 - lengthY * 0.36, -0.075);
  chinBeard.scale.set(1.15, 1.0, 0.85);
  chinBeard.castShadow = true;
  beardGroup.add(chinBeard);

  // Side jaw beard strips
  for (const side of [-1, 1]) {
    const jaw = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.02 + thick * 0.35, 0.075 + (s - 2) * 0.02, 4, 8),
      hairMat
    );
    jaw.position.set(side * 0.088, -0.075, -0.068);
    jaw.rotation.set(0.35, side * 0.4, side * 0.38);
    beardGroup.add(jaw);
  }

  headGroup.add(beardGroup);
}

// --- MAIN CHARACTER SYSTEM ---
export function createCharacterSystem(scene, initialConfig = DEFAULT_CHAR_CONFIG) {
  const root = new THREE.Group();
  scene.add(root);

  let config = { ...DEFAULT_CHAR_CONFIG, ...initialConfig };
  let parts = null;
  let ownedTextures = [];
  let blinkTimer = 2.5;
  let isBlinking = false;

  function disposeCurrent() {
    while (root.children.length > 0) {
      const child = root.children[0];
      root.remove(child);
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => m.dispose());
        }
      });
    }
    ownedTextures.forEach(t => t.dispose());
    ownedTextures = [];
  }

  function rebuild(newCfg = {}) {
    config = { ...config, ...newCfg };
    disposeCurrent();

    const isFemale = config.gender === 'female';
    const isYoung = config.age < 19;
    const heightScale = isYoung ? 0.88 + (config.age - 12) * 0.015 : (isFemale ? 0.94 : 1.0);
    const shoulderW = isFemale ? 0.19 : (isYoung ? 0.195 : 0.235);
    const hipW = isFemale ? 0.145 : 0.125;

    // Materials
    const { skinTex, emissiveTex } = createHeadTextures(config);
    ownedTextures.push(skinTex, emissiveTex);

    const headMat = new THREE.MeshStandardMaterial({
      map: skinTex,
      emissive: new THREE.Color(config.circuits ? config.circuitColor : '#000000'),
      emissiveMap: emissiveTex,
      emissiveIntensity: config.circuits ? 1.55 : 0.0,
      roughness: 0.56,
      metalness: 0.04
    });

    const skinPlainMat = new THREE.MeshStandardMaterial({
      color: config.skinTone, roughness: 0.58, metalness: 0.03
    });

    // Graying hair blend automatically if age > 50 and user didn't pick bright color
    const finalHairCol = new THREE.Color(config.hairColor);
    if (config.age > 52) {
      finalHairCol.lerp(new THREE.Color('#c8cdd4'), Math.min(0.65, (config.age - 52) / 25));
    }
    const hairMat = new THREE.MeshStandardMaterial({
      color: finalHairCol, roughness: 0.72, metalness: 0.08
    });

    const suitTex = createSuitTexture(config.outfitColor, config.accentColor, config.outfit === 'stealth');
    ownedTextures.push(suitTex);

    const outfitMat = new THREE.MeshStandardMaterial({
      map: suitTex,
      roughness: config.outfit === 'armor' ? 0.28 : 0.55,
      metalness: config.outfit === 'armor' ? 0.68 : 0.18
    });

    const pantsMat = new THREE.MeshStandardMaterial({
      color: shadeHex(config.outfitColor, 0.78),
      roughness: 0.65,
      metalness: config.outfit === 'stealth' ? 0.22 : 0.08
    });

    const bootMat = new THREE.MeshStandardMaterial({
      color: '#14171d', roughness: 0.45, metalness: 0.25
    });

    const glowMat = new THREE.MeshBasicMaterial({ color: config.accentColor });

    // Body Container (scaled by Age/Gender height)
    const body = new THREE.Group();
    body.scale.setScalar(heightScale);
    root.add(body);

    // --- PELVIS / HIPS ---
    const pelvis = new THREE.Group();
    pelvis.position.y = 0.90;
    body.add(pelvis);

    const hipMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(hipW * 0.92, hipW * 1.02, 0.16, 12),
      pantsMat
    );
    hipMesh.castShadow = true;
    pelvis.add(hipMesh);

    // --- TORSO (Upper Body) ---
    const torsoGroup = new THREE.Group();
    torsoGroup.position.y = 0.06;
    pelvis.add(torsoGroup);

    const chestMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(shoulderW * 0.88, isFemale ? 0.115 : 0.145, 0.46, 14),
      outfitMat
    );
    chestMesh.position.y = 0.25;
    chestMesh.scale.set(1.0, 1.0, 0.68);
    chestMesh.castShadow = true;
    torsoGroup.add(chestMesh);

    // High Collar (Signature Stealth Suit Look from Video!)
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.082, 0.075, 14),
      outfitMat
    );
    collar.position.y = 0.49;
    torsoGroup.add(collar);

    // Outfit-Specific High-Detail Layers
    if (config.outfit === 'stealth') {
      // Glowing cyan chest & shoulder seam lines (exact match to video!)
      const seamL = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.28, 0.012), glowMat);
      seamL.position.set(-0.085, 0.29, -0.125); seamL.rotation.z = -0.22;
      const seamR = seamL.clone(); seamR.position.x = 0.085; seamR.rotation.z = 0.22;
      const collarGlow = new THREE.Mesh(new THREE.TorusGeometry(0.076, 0.005, 6, 20), glowMat);
      collarGlow.rotation.x = Math.PI / 2; collarGlow.position.y = 0.51;
      const backSpine = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.32, 0.012), glowMat);
      backSpine.position.set(0, 0.27, 0.122);
      torsoGroup.add(seamL, seamR, collarGlow, backSpine);
    } else if (config.outfit === 'jacket') {
      const shirtMat = new THREE.MeshStandardMaterial({ color: '#d8dee6', roughness: 0.8 });
      const innerShirt = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.42, 0.14), shirtMat);
      innerShirt.position.set(0, 0.25, -0.05);
      const lapelL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.04), outfitMat);
      lapelL.position.set(-0.08, 0.28, -0.11); lapelL.rotation.z = 0.1;
      const lapelR = lapelL.clone(); lapelR.position.x = 0.08; lapelR.rotation.z = -0.1;
      torsoGroup.add(innerShirt, lapelL, lapelR);
    } else if (config.outfit === 'armor') {
      const plateMat = new THREE.MeshStandardMaterial({ color: '#dfe6ee', roughness: 0.22, metalness: 0.78 });
      const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(shoulderW * 1.45, 0.24, 0.26), plateMat);
      chestPlate.position.set(0, 0.32, -0.01); chestPlate.castShadow = true;
      const coreBadge = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), glowMat);
      coreBadge.position.set(0, 0.33, -0.145);
      torsoGroup.add(chestPlate, coreBadge);
    } else if (config.outfit === 'hoodie') {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.036, 8, 16), outfitMat);
      hood.position.set(0, 0.47, 0.06); hood.rotation.x = 0.7;
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.04), outfitMat);
      pocket.position.set(0, 0.11, -0.11);
      torsoGroup.add(hood, pocket);
    }

    // --- NECK (with glowing side circuit streaks if circuits ON) ---
    const neckGroup = new THREE.Group();
    neckGroup.position.y = 0.51;
    torsoGroup.add(neckGroup);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.11, 12), skinPlainMat);
    neck.position.y = 0.04;
    neckGroup.add(neck);

    if (config.circuits) {
      for (const side of [-1, 1]) {
        const nLine = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.085, 0.005), glowMat);
        nLine.position.set(side * 0.052, 0.04, -0.015);
        nLine.rotation.z = side * 0.12;
        neckGroup.add(nLine);
      }
    }

    // --- SCULPTED HEAD + EYES + NOSE + EARS + HAIR + BEARD ---
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.20;
    neckGroup.add(headGroup);

    const headMesh = new THREE.Mesh(createSculptedHeadGeo(config), headMat);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Sculpted 3D Nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.048, 6), skinPlainMat);
    nose.position.set(0, -0.015, -0.142);
    nose.rotation.x = -0.35;
    headGroup.add(nose);

    // Sculpted 3D Ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), skinPlainMat);
      ear.scale.set(0.45, 1.15, 0.75);
      ear.position.set(side * (isFemale ? 0.128 : 0.134), -0.01, 0.0);
      headGroup.add(ear);
    }

    // Realistic Multi-Layer 3D Eyes + Blinking Eyelids
    const eyelids = [];
    const scleraMat = new THREE.MeshStandardMaterial({ color: '#f5f5f2', roughness: 0.18 });
    const irisMat = new THREE.MeshStandardMaterial({ color: config.eyeColor, roughness: 0.15, metalness: 0.15 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: '#090b0f' });
    const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

    for (const side of [-1, 1]) {
      const eyeSocket = new THREE.Group();
      eyeSocket.position.set(side * 0.048, 0.014, -0.125);

      const eyeBall = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), scleraMat);
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.011, 12), irisMat);
      iris.position.set(0, 0, -0.0185); iris.rotation.y = Math.PI;
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 10), pupilMat);
      pupil.position.set(0, 0, -0.0192); pupil.rotation.y = Math.PI;
      const glint = new THREE.Mesh(new THREE.CircleGeometry(0.0028, 6), glintMat);
      glint.position.set(0.004, 0.004, -0.0196); glint.rotation.y = Math.PI;

      // Upper Eyelid (animates smoothly for natural blinking)
      const lid = new THREE.Mesh(
        new THREE.SphereGeometry(0.0215, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
        skinPlainMat
      );
      lid.rotation.x = -0.35;
      eyelids.push(lid);

      eyeSocket.add(eyeBall, iris, pupil, glint, lid);
      headGroup.add(eyeSocket);

      // Expressive 3D Eyebrows
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.042, isFemale ? 0.007 : 0.011, 0.012),
        hairMat
      );
      brow.position.set(side * 0.048, 0.044, -0.132);
      brow.rotation.z = side * (isFemale ? -0.12 : -0.06);
      headGroup.add(brow);
    }

    buildHair(headGroup, config, hairMat);
    buildBeard(headGroup, config, hairMat);

    // --- ARTICULATED ARMS (Shoulder -> Upper Arm -> Elbow -> Forearm -> Hand) ---
    function createArm(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * (shoulderW + 0.015), 0.43, 0);

      const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), outfitMat);
      shoulderCap.castShadow = true;
      shoulder.add(shoulderCap);

      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.28, 10), outfitMat);
      upperArm.position.y = -0.14; upperArm.castShadow = true;
      shoulder.add(upperArm);

      if (config.outfit === 'stealth') {
        const armLine = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.22, 0.01), glowMat);
        armLine.position.set(side * 0.048, -0.14, 0);
        shoulder.add(armLine);
      }

      const elbow = new THREE.Group();
      elbow.position.y = -0.28;
      shoulder.add(elbow);

      const foreArm = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.26, 10), outfitMat);
      foreArm.position.y = -0.13; foreArm.castShadow = true;
      elbow.add(foreArm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), skinPlainMat);
      hand.scale.set(0.85, 1.15, 0.65);
      hand.position.y = -0.28;
      elbow.add(hand);

      torsoGroup.add(shoulder);
      return { shoulder, elbow };
    }

    const leftArm = createArm(-1);
    const rightArm = createArm(1);

    // --- ARTICULATED LEGS (Hip -> Thigh -> Knee -> Shin -> Boot) ---
    function createLeg(side) {
      const hip = new THREE.Group();
      hip.position.set(side * (hipW * 0.72), -0.04, 0);

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.056, 0.42, 10), pantsMat);
      thigh.position.y = -0.21; thigh.castShadow = true;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.042, 0.40, 10), pantsMat);
      shin.position.y = -0.20; shin.castShadow = true;
      knee.add(shin);

      // Sleek Tactical Boot
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.085, 0.19), bootMat);
      boot.position.set(0, -0.40, -0.035); boot.castShadow = true;
      knee.add(boot);

      pelvis.add(hip);
      return { hip, knee };
    }

    const leftLeg = createLeg(-1);
    const rightLeg = createLeg(1);

    parts = { body, pelvis, torsoGroup, headGroup, eyelids, leftArm, rightArm, leftLeg, rightLeg };
  }

  // Smooth Articulated Walk, Sprint, Jump, Idle Breathing & Blinking Animation
  function updateAnimation(dt, elapsed, isMoving, isSprinting, onGround, animTime) {
    if (!parts) return;

    // Natural Eye Blinking
    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      isBlinking = !isBlinking;
      blinkTimer = isBlinking ? 0.13 : (2.2 + Math.random() * 3.2);
    }
    const lidTarget = isBlinking ? 0.45 : -0.35;
    parts.eyelids.forEach(lid => {
      lid.rotation.x += (lidTarget - lid.rotation.x) * Math.min(1, dt * 26);
    });

    if (!onGround) {
      // Mid-air athletic jump pose
      parts.leftLeg.hip.rotation.x = 0.35;
      parts.leftLeg.knee.rotation.x = -0.55;
      parts.rightLeg.hip.rotation.x = -0.25;
      parts.rightLeg.knee.rotation.x = -0.35;
      parts.leftArm.shoulder.rotation.x = -0.45;
      parts.rightArm.shoulder.rotation.x = 0.35;
      return;
    }

    if (isMoving) {
      const amp = isSprinting ? 0.78 : 0.48;
      const s = Math.sin(animTime);
      const c = Math.cos(animTime);

      parts.leftLeg.hip.rotation.x = s * amp;
      parts.rightLeg.hip.rotation.x = -s * amp;
      parts.leftLeg.knee.rotation.x = Math.min(0, -c * amp * 0.85 - 0.12);
      parts.rightLeg.knee.rotation.x = Math.min(0, c * amp * 0.85 - 0.12);

      parts.leftArm.shoulder.rotation.x = -s * amp * 0.82;
      parts.rightArm.shoulder.rotation.x = s * amp * 0.82;
      parts.leftArm.elbow.rotation.x = 0.25 + Math.max(0, -s * 0.45);
      parts.rightArm.elbow.rotation.x = 0.25 + Math.max(0, s * 0.45);

      parts.torsoGroup.rotation.x = isSprinting ? 0.14 : 0.05;
      parts.pelvis.position.y = 0.90 + Math.abs(Math.sin(animTime)) * (isSprinting ? 0.045 : 0.02);
    } else {
      // Relaxed natural breathing idle
      const breath = Math.sin(elapsed * 2.1);
      parts.leftLeg.hip.rotation.x *= 0.85;
      parts.rightLeg.hip.rotation.x *= 0.85;
      parts.leftLeg.knee.rotation.x *= 0.85;
      parts.rightLeg.knee.rotation.x *= 0.85;
      parts.leftArm.shoulder.rotation.x *= 0.85;
      parts.rightArm.shoulder.rotation.x *= 0.85;
      parts.leftArm.elbow.rotation.x = 0.12;
      parts.rightArm.elbow.rotation.x = 0.12;
      parts.torsoGroup.rotation.x = breath * 0.018;
      parts.pelvis.position.y = 0.90 + breath * 0.008;
      parts.headGroup.rotation.y = Math.sin(elapsed * 0.7) * 0.08;
    }
  }

  rebuild(config);

  return {
    root,
    rebuild,
    updateAnimation,
    getConfig: () => ({ ...config })
  };
}
