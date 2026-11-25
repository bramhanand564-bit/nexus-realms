import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const HF_BASE = 'https://huggingface.co/datasets/codepawl/rocketbox-avatars-glb/resolve/main/objects';

export const AVATAR_CATALOG = {
  boy1:    { label: 'Cyber Boy 01',   url: `${HF_BASE}/male-child-01/male-child-01.glb`,     height: 1.48, headScale: 1.00 },
  boy2:    { label: 'Cyber Boy 02',   url: `${HF_BASE}/male-child-02/male-child-02.glb`,     height: 1.50, headScale: 1.00 },
  girl1:   { label: 'Cyber Girl 01',  url: `${HF_BASE}/female-child-01/female-child-01.glb`, height: 1.46, headScale: 0.98 },
  male1:   { label: 'Adult Male',     url: `${HF_BASE}/male-adult-10/male-adult-10.glb`,     height: 1.76, headScale: 1.12 },
  female1: { label: 'Adult Female',   url: `${HF_BASE}/female-adult-01/female-adult-01.glb`, height: 1.66, headScale: 1.06 },
  pilot1:  { label: 'Tactical Pilot', url: `${HF_BASE}/pilot-male-01/pilot-male-01.glb`,     height: 1.78, headScale: 1.12 }
};

export const DEFAULT_CHAR_CONFIG = {
  avatarId: 'boy1',
  heightScale: 1.0,
  skinTint: '#ffffff',        // '#ffffff' = Original natural skin tone
  hairTint: 'natural',        // 'natural' or hex color
  circuits: true,
  circuitIntensity: 1.45,
  circuitColor: '#38f2ff',
  outfit: 'stealth',          // 'stealth' | 'armor' | 'casual'
  outfitColor: '#1b2330'
};

export const CHAR_PRESETS = {
  video: { ...DEFAULT_CHAR_CONFIG },
  girl: {
    avatarId: 'girl1', heightScale: 1.0, skinTint: '#ffffff', hairTint: 'natural',
    circuits: true, circuitIntensity: 1.55, circuitColor: '#56f0ff',
    outfit: 'stealth', outfitColor: '#1d2233'
  },
  adult: {
    avatarId: 'male1', heightScale: 1.0, skinTint: '#ffffff', hairTint: 'natural',
    circuits: true, circuitIntensity: 1.35, circuitColor: '#44f0ff',
    outfit: 'armor', outfitColor: '#232934'
  },
  pilot: {
    avatarId: 'pilot1', heightScale: 1.02, skinTint: '#ffffff', hairTint: 'natural',
    circuits: false, circuitIntensity: 1.0, circuitColor: '#ffbb33',
    outfit: 'casual', outfitColor: '#2b323d'
  }
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// ============================================================================
// 1. 2048x2048 RAZOR-SHARP CYBERNETIC FACE & NECK CIRCUIT TEXTURE (Shared Once)
// ============================================================================
let SHARED_CIRCUIT_TEX = null;

function getCyberCircuitMap() {
  if (SHARED_CIRCUIT_TEX) return SHARED_CIRCUIT_TEX;

  const W = 2048, H = 2048;
  const toPx = (theta, relY) => {
    const u = 0.5 + theta / (2.0 * Math.PI);
    const v = (relY + 0.24) / 0.42;
    return [u * W, (1.0 - v) * H];
  };

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  // Sub-dermal dark mechanical plating seams on neck (Blue channel)
  const neckSeams = [
    [[-1.62, -0.09], [-1.30, -0.13], [-1.05, -0.14], [-0.85, -0.18], [-0.85, -0.23]],
    [[-1.38, -0.10], [-1.02, -0.12], [-0.76, -0.16], [-0.48, -0.18], [-0.38, -0.23]],
    [[-1.18, -0.16], [-0.88, -0.17], [-0.66, -0.22]],
    [[ 1.38, -0.10], [ 1.02, -0.12], [ 0.76, -0.16], [ 0.48, -0.18]]
  ];
  ctx.strokeStyle = 'rgba(0, 0, 230, 0.95)';
  ctx.lineWidth = 5.0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const path of neckSeams) {
    ctx.beginPath();
    path.forEach(([th, y], idx) => {
      const [px, py] = toPx(th, y);
      if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  // Fine 45-degree neural PCB traces across temple, cheekbone, jawline & neck
  const circuitPaths = [
    [[-0.36,  0.085], [-0.46,  0.068], [-0.46,  0.052]],
    [[-0.72,  0.072], [-0.72,  0.036], [-0.60,  0.015], [-0.38,  0.010]],
    [[-1.08,  0.010], [-0.86,  0.010], [-0.72, -0.012], [-0.42, -0.012], [-0.32, -0.002]],
    [[-0.72,  0.028], [-0.72, -0.012]],
    [[-0.56, -0.012], [-0.48, -0.025], [-0.30, -0.025]],
    [[-1.02, -0.015], [-0.82, -0.015], [-0.70, -0.035], [-0.46, -0.035], [-0.34, -0.048]],
    [[-0.82, -0.015], [-0.94, -0.038], [-1.14, -0.038]],
    [[-0.70, -0.035], [-0.70, -0.058], [-0.50, -0.072], [-0.50, -0.094], [-0.36, -0.106]],
    [[-1.06, -0.058], [-0.84, -0.058], [-0.68, -0.076], [-0.50, -0.076]],
    [[-0.68, -0.076], [-0.68, -0.098], [-0.54, -0.114], [-0.38, -0.118]],
    [[-1.36, -0.102], [-1.16, -0.136], [-0.92, -0.136], [-0.76, -0.168], [-0.76, -0.220]],
    [[-1.08, -0.156], [-0.90, -0.184], [-0.60, -0.184], [-0.46, -0.224]],
    [[-0.84, -0.136], [-0.64, -0.158], [-0.44, -0.158], [-0.34, -0.190]],
    [[ 0.78,  0.045], [ 0.78,  0.006], [ 0.56, -0.016], [ 0.38, -0.016]],
    [[ 0.94, -0.026], [ 0.72, -0.046], [ 0.52, -0.046], [ 0.42, -0.072]],
    [[ 1.12, -0.115], [ 0.88, -0.155], [ 0.64, -0.155], [ 0.50, -0.205]]
  ];

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Soft outer halo (Green channel)
  ctx.strokeStyle = 'rgba(0, 185, 0, 0.55)';
  ctx.lineWidth = 9.5;
  ctx.shadowColor = 'rgba(0, 255, 0, 0.8)';
  ctx.shadowBlur = 11;
  for (const path of circuitPaths) {
    ctx.beginPath();
    path.forEach(([th, y], idx) => {
      const [px, py] = toPx(th, y);
      if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  // Razor-sharp core line (Red channel)
  ctx.strokeStyle = 'rgba(255, 45, 0, 0.98)';
  ctx.lineWidth = 3.0;
  ctx.shadowBlur = 3;
  for (const path of circuitPaths) {
    ctx.beginPath();
    path.forEach(([th, y], idx) => {
      const [px, py] = toPx(th, y);
      if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  // Glowing junction nodes
  for (const path of circuitPaths) {
    path.forEach(([th, y], idx) => {
      const [px, py] = toPx(th, y);
      const isEnd = (idx === 0 || idx === path.length - 1);
      const r = isEnd ? 6.0 : 4.0;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
      grad.addColorStop(0, 'rgba(255, 255, 0, 1.0)');
      grad.addColorStop(0.45, 'rgba(220, 185, 0, 0.85)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();

  SHARED_CIRCUIT_TEX = new THREE.CanvasTexture(canvas);
  SHARED_CIRCUIT_TEX.wrapS = THREE.RepeatWrapping;
  SHARED_CIRCUIT_TEX.wrapT = THREE.ClampToEdgeWrapping;
  SHARED_CIRCUIT_TEX.needsUpdate = true;
  return SHARED_CIRCUIT_TEX;
}

// ============================================================================
// 2. BONE ALIGNMENT & SAGITTAL-PLANE RIGGING HELPERS (Fixes T-Pose 100%!)
// ============================================================================
function alignBoneDirection(bone, childBone, targetWorldDir, blend = 1.0) {
  if (!bone || !childBone || !bone.parent) return;
  bone.updateWorldMatrix(true, true);
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  bone.getWorldPosition(p0);
  childBone.getWorldPosition(p1);
  const currDir = p1.sub(p0);
  if (currDir.lengthSq() < 0.0001) return;
  currDir.normalize();

  const desiredDir = targetWorldDir.clone().normalize();
  const worldDelta = new THREE.Quaternion().setFromUnitVectors(currDir, desiredDir);
  if (blend < 1.0) worldDelta.slerp(new THREE.Quaternion(), 1.0 - blend);

  const parentWorldQuat = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentWorldQuat);
  const localDelta = parentWorldQuat.clone().invert().multiply(worldDelta).multiply(parentWorldQuat);
  bone.quaternion.premultiply(localDelta);
  bone.updateWorldMatrix(true, true);
}

// Captures a bone's rest pose & maps Character Right (+X), Up (+Y), Forward (-Z) into its parent space
// This makes walking/running work cleanly on EVERY 3ds Max Biped / Rocketbox skeleton!
function captureBoneRig(bone) {
  if (!bone || !bone.parent) return null;
  bone.updateWorldMatrix(true, true);
  const invParent = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(invParent).invert();

  return {
    bone,
    baseQuat: bone.quaternion.clone(),
    axisX: new THREE.Vector3(1, 0, 0).applyQuaternion(invParent).normalize(), // Pitch (forward/back swing)
    axisY: new THREE.Vector3(0, 1, 0).applyQuaternion(invParent).normalize(), // Yaw (turn)
    axisZ: new THREE.Vector3(0, 0, 1).applyQuaternion(invParent).normalize()  // Roll (lean)
  };
}

// High stand-up tailored Sci-Fi jacket collar fitted seamlessly around lower neck
function createSciFiCollarMesh(headScale, collarColorHex) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(collarColorHex).multiplyScalar(0.85),
    roughness: 0.42,
    metalness: 0.28,
    side: THREE.DoubleSide
  });

  const segU = 42, segV = 10;
  const pos = [], norm = [], idx = [];
  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV;
    const y = (-0.022 + v * 0.064) * headScale;
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const theta = 0.22 + u * (Math.PI * 2.0 - 0.44);
      const radX = (0.059 + (1.0 - v) * 0.013) * headScale;
      const radZ = (0.063 + (1.0 - v) * 0.013) * headScale;
      const frontDrop = Math.max(0.0, Math.cos(theta)) * 0.024 * headScale;
      pos.push(Math.sin(theta) * radX, y - frontDrop, Math.cos(theta) * radZ - 0.008 * headScale);
      norm.push(Math.sin(theta), 0.15, Math.cos(theta));
    }
  }
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * (segU + 1) + iu;
      const b = a + 1;
      const c = a + (segU + 1);
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

// ============================================================================
// 3. MAIN REAL 3D HUMAN CHARACTER SYSTEM (Drop-in for NEXUS: REALMS)
// ============================================================================
export function createCharacterSystem(scene, initialConfig = DEFAULT_CHAR_CONFIG, onLoadState = null) {
  const root = new THREE.Group();
  scene.add(root);

  // Inner container rotated Math.PI so Rocketbox (+Z front) matches Game Forward (-Z)!
  // Shader pLocal uses modelContainer's inverse matrix -> +Z is ALWAYS Front of Face!
  const modelContainer = new THREE.Group();
  modelContainer.rotation.y = Math.PI;
  root.add(modelContainer);

  let config = { ...DEFAULT_CHAR_CONFIG, ...initialConfig };
  let loadedAvatarId = null;
  let loadToken = 0;

  let avatarRoot = null;
  let collarMesh = null;
  let rig = null;
  let blinkMeshes = [];
  let charBaseHeight = 1.48;
  let headHeightY = 1.34;
  let currentLeanZ = 0;

  // Live GPU Shader Uniforms (Zero-Lag Real-Time Customization!)
  const cyberUniforms = {
    uCharInvMatrix:    { value: new THREE.Matrix4() },
    uHeadLocalPos:     { value: new THREE.Vector3(0, 1.32, 0) },
    uHeadScale:        { value: 1.0 },
    uNeckY:            { value: 1.18 },
    uWaistY:           { value: 0.72 },
    uTime:             { value: 0 },
    uCircuitIntensity: { value: 1.45 },
    uCircuitColor:     { value: new THREE.Color('#38f2ff') },
    uOutfitMode:       { value: 1.0 }, // 0=casual, 1=stealth, 2=armor
    uOutfitColor:      { value: new THREE.Color('#1b2330') },
    uSkinTint:         { value: new THREE.Color('#ffffff') },
    uHairTint:         { value: new THREE.Color('#2a201b') },
    uHairTintMix:      { value: 0.0 },
    uCircuitMap:       { value: getCyberCircuitMap() }
  };

  function syncUniformsFromConfig() {
    cyberUniforms.uCircuitIntensity.value = config.circuits ? config.circuitIntensity : 0.0;
    cyberUniforms.uCircuitColor.value.set(config.circuitColor);
    cyberUniforms.uOutfitMode.value = config.outfit === 'stealth' ? 1.0 : (config.outfit === 'armor' ? 2.0 : 0.0);
    cyberUniforms.uOutfitColor.value.set(config.outfitColor);
    cyberUniforms.uSkinTint.value.set(config.skinTint || '#ffffff');

    if (!config.hairTint || config.hairTint === 'natural') {
      cyberUniforms.uHairTintMix.value = 0.0;
    } else {
      cyberUniforms.uHairTint.value.set(config.hairTint);
      cyberUniforms.uHairTintMix.value = 0.72;
    }

    if (collarMesh) {
      collarMesh.visible = config.outfit !== 'casual';
      collarMesh.material.color.set(config.outfitColor).multiplyScalar(0.85);
      collarMesh.material.metalness = config.outfit === 'armor' ? 0.65 : 0.25;
      collarMesh.material.roughness = config.outfit === 'armor' ? 0.28 : 0.42;
    }

    modelContainer.scale.setScalar(config.heightScale || 1.0);
  }

  // Inject Cybernetic Face/Neck Circuits + Customizable Skin/Hair/Jacket PBR Shader
  function enhanceAvatarMaterial(mat) {
    if (!mat || !mat.isMeshStandardMaterial) return;
    mat.envMapIntensity = 0.78;
    mat.customProgramCacheKey = () => 'nexus-rocketbox-cyber-v1';

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uCharInvMatrix:    cyberUniforms.uCharInvMatrix,
        uHeadLocalPos:     cyberUniforms.uHeadLocalPos,
        uHeadScale:        cyberUniforms.uHeadScale,
        uNeckY:            cyberUniforms.uNeckY,
        uWaistY:           cyberUniforms.uWaistY,
        uTime:             cyberUniforms.uTime,
        uCircuitIntensity: cyberUniforms.uCircuitIntensity,
        uCircuitColor:     cyberUniforms.uCircuitColor,
        uOutfitMode:       cyberUniforms.uOutfitMode,
        uOutfitColor:      cyberUniforms.uOutfitColor,
        uSkinTint:         cyberUniforms.uSkinTint,
        uHairTint:         cyberUniforms.uHairTint,
        uHairTintMix:      cyberUniforms.uHairTintMix,
        uCircuitMap:       cyberUniforms.uCircuitMap
      });

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vCharWorldPos;
           varying vec3 vCharWorldNormal;`
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vec4 charWp = modelMatrix * vec4( transformed, 1.0 );
           vCharWorldPos = charWp.xyz;
           vCharWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vCharWorldPos;
           varying vec3 vCharWorldNormal;
           uniform mat4 uCharInvMatrix;
           uniform vec3 uHeadLocalPos;
           uniform float uHeadScale;
           uniform float uNeckY;
           uniform float uWaistY;
           uniform float uTime;
           uniform float uCircuitIntensity;
           uniform vec3 uCircuitColor;
           uniform float uOutfitMode;
           uniform vec3 uOutfitColor;
           uniform vec3 uSkinTint;
           uniform vec3 uHairTint;
           uniform float uHairTintMix;
           uniform sampler2D uCircuitMap;`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           vec3 pLocal = (uCharInvMatrix * vec4(vCharWorldPos, 1.0)).xyz;
           vec3 origCol = diffuseColor.rgb;
           float lum = dot(origCol, vec3(0.299, 0.587, 0.114));

           // Distinguish warm human skin vs eyes/hair/clothing automatically
           float skinWarmth = smoothstep(0.015, 0.105, origCol.r - origCol.b) * smoothstep(0.055, 0.19, origCol.r);
           float isHeadOrNeck = smoothstep(uNeckY - 0.055, uNeckY + 0.015, pLocal.y);
           float isTorsoClothing = smoothstep(uNeckY + 0.025, uNeckY - 0.025, pLocal.y)
                                 * smoothstep(uWaistY - 0.04, uWaistY + 0.06, pLocal.y);
           float isLowerClothing = smoothstep(uWaistY + 0.03, uWaistY - 0.05, pLocal.y);

           // Apply smooth Skin Tone customization on skin pixels
           diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uSkinTint, skinWarmth * 0.88);

           // Sleek Sci-Fi Stealth Leather Jacket / Tactical Armor Transformation
           float outfitActive = step(0.5, uOutfitMode);
           float isArmor = step(1.5, uOutfitMode);
           float jacketMask = isTorsoClothing * (1.0 - skinWarmth * 0.90) * outfitActive;
           float pantsMask  = isLowerClothing * (1.0 - skinWarmth * 0.92) * outfitActive;

           // Suppress noisy shirt logos while keeping realistic cloth folds & ambient creases
           float cleanFold = 0.62 + clamp(lum, 0.12, 0.72) * 0.68;
           vec3 suitCol = uOutfitColor * cleanFold;

           // Tailored metallic center zipper & ergonomic chest panel seams
           float zipSeam = smoothstep(0.007, 0.0016, abs(pLocal.x)) * step(0.0, pLocal.z);
           float panelSeam = smoothstep(0.0065, 0.0016, abs(abs(pLocal.x) - (0.088 * uHeadScale + (uNeckY - pLocal.y) * 0.08))) * step(-0.02, pLocal.z);
           suitCol *= (1.0 - clamp(zipSeam + panelSeam, 0.0, 1.0) * 0.68);

           // Metallic zipper teeth highlight right down the center
           float zipMetal = smoothstep(0.0032, 0.0008, abs(pLocal.x)) * step(0.02, pLocal.z) * smoothstep(uWaistY + 0.04, uWaistY + 0.10, pLocal.y);
           suitCol = mix(suitCol, vec3(0.55, 0.60, 0.66), zipMetal * 0.65);

           diffuseColor.rgb = mix(diffuseColor.rgb, suitCol, jacketMask);
           // Matching dark tactical trousers in Stealth/Armor mode (clean cohesive look!)
           vec3 tacPants = uOutfitColor * 0.74 * (0.65 + lum * 0.65);
           diffuseColor.rgb = mix(diffuseColor.rgb, tacPants, pantsMask * 0.85);

           // Natural / Custom Hair Color Tinting
           float isHairZone = clamp(
             smoothstep(uHeadLocalPos.y + 0.025 * uHeadScale, uHeadLocalPos.y + 0.085 * uHeadScale, pLocal.y)
             + smoothstep(-0.015, -0.065, pLocal.z) * isHeadOrNeck, 0.0, 1.0
           );
           float hairMask = isHairZone * (1.0 - skinWarmth);
           vec3 customHair = uHairTint * (0.45 + lum * 1.45);
           vec3 naturalDeepHair = diffuseColor.rgb * vec3(0.58, 0.52, 0.48);
           diffuseColor.rgb = mix(diffuseColor.rgb, mix(naturalDeepHair, customHair, uHairTintMix), hairMask * 0.72);`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
           float targetRough = mix(0.42, 0.25, isArmor);
           roughnessFactor = mix(roughnessFactor, targetRough, jacketMask);`
        )
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
           float targetMetal = mix(0.18, 0.68, isArmor);
           metalnessFactor = mix(metalnessFactor, targetMetal, jacketMask);`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           // Cylindrical head coordinates normalized by uHeadScale (works on both kids & adults!)
           vec3 relH = (pLocal - uHeadLocalPos) / max(0.5, uHeadScale);
           float theta = atan(relH.x, relH.z);
           float cu = fract(0.5 + theta / 6.2831853);
           float cv = clamp((relH.y + 0.24) / 0.42, 0.0, 1.0);

           vec3 cSample = texture2D(uCircuitMap, vec2(cu, cv)).rgb;
           float traceCore = cSample.r;
           float traceHalo = cSample.g;
           float neckSeam  = cSample.b;

           // Strictly protect eye sockets & lips
           float eyeProtect = 1.0 - smoothstep(0.044, 0.022, length(vec2(abs(relH.x) - 0.032, relH.y - 0.008))) * step(0.03, relH.z);
           float mouthProtect = 1.0 - smoothstep(0.038, 0.016, length(vec2(relH.x * 0.72, relH.y + 0.052))) * step(0.04, relH.z);
           float faceCircuitMask = isHeadOrNeck * skinWarmth * eyeProtect * mouthProtect;

           // Subtle sub-dermal dark seams on neck when circuits are ON
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.04, 0.06), neckSeam * faceCircuitMask * step(0.05, uCircuitIntensity) * 0.55);

           // Smooth travelling neural pulse along cheek & neck traces
           float pulse = 0.86 + 0.28 * sin(uTime * 3.0 - relH.y * 42.0 + relH.z * 24.0);
           float nodeBoost = smoothstep(0.45, 0.90, traceCore * traceHalo);
           vec3 traceCol = mix(uCircuitColor, vec3(0.96, 1.0, 1.0), traceCore * 0.45 + nodeBoost * 0.55);

           vec3 faceGlow = traceCol * (traceCore * 1.45 + nodeBoost * 1.15) * pulse * faceCircuitMask * uCircuitIntensity;
           faceGlow += uCircuitColor * traceHalo * 0.26 * faceCircuitMask * uCircuitIntensity;

           // Refined Sleek Jacket Accent Piping (Subtle, Thin & Classy — Not Overdone!)
           float jY = (uNeckY - pLocal.y) / max(0.5, uHeadScale);
           float ax = abs(pLocal.x) / max(0.5, uHeadScale);
           float frontFace = smoothstep(-0.01, 0.045, pLocal.z);

           float ledCollar = smoothstep(0.0040, 0.0012, abs(ax - (0.068 - jY * 0.20)))
                           * smoothstep(0.020, 0.030, jY) * smoothstep(0.066, 0.056, jY) * frontFace;
           float ledChest  = smoothstep(0.0038, 0.0012, abs(ax - (0.072 + max(0.0, 0.20 - jY) * 0.45)))
                           * smoothstep(0.15, 0.17, jY) * smoothstep(0.30, 0.28, jY) * frontFace;
           float ledSleeve = smoothstep(0.0042, 0.0014, abs(jY - (0.17 + abs(pLocal.z) * 0.65)))
                           * smoothstep(0.155, 0.185, ax) * smoothstep(0.28, 0.24, ax);

           float jacketLED = clamp(ledCollar + ledChest + ledSleeve, 0.0, 1.0) * jacketMask;
           vec3 ledGlow = mix(uCircuitColor, vec3(1.0), 0.35) * jacketLED * (0.45 + 0.55 * clamp(uCircuitIntensity, 0.0, 1.5));

           totalEmissiveRadiance += faceGlow + ledGlow;`
        );
    };
    mat.needsUpdate = true;
  }

  function clearCurrentAvatar() {
    while (modelContainer.children.length > 0) {
      const child = modelContainer.children[0];
      modelContainer.remove(child);
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => m.dispose());
        }
      });
    }
    avatarRoot = null;
    collarMesh = null;
    rig = null;
    blinkMeshes = [];
  }

  async function loadAvatarModel(avatarId) {
    const spec = AVATAR_CATALOG[avatarId] || AVATAR_CATALOG.boy1;
    const myToken = ++loadToken;
    loadedAvatarId = avatarId;

    if (onLoadState) onLoadState(true, `Loading ${spec.label}...`);

    try {
      if (MeshoptDecoder && MeshoptDecoder.ready) await MeshoptDecoder.ready;
      const loader = new GLTFLoader();
      loader.setCrossOrigin('anonymous');
      loader.setMeshoptDecoder(MeshoptDecoder);

      const gltf = await new Promise((resolve, reject) => {
        loader.load(
          spec.url,
          resolve,
          (xhr) => {
            if (myToken === loadToken && xhr.lengthComputable && onLoadState) {
              const pct = Math.min(99, Math.round((xhr.loaded / xhr.total) * 100));
              onLoadState(true, `Loading ${spec.label} (${pct}%)...`);
            }
          },
          reject
        );
      });

      if (myToken !== loadToken) return; // Superseded by a newer avatar selection

      clearCurrentAvatar();
      avatarRoot = gltf.scene;

      // 1. Inspect Skeleton Bones, Morph Targets & Enhance PBR Materials
      const boneMap = {};
      avatarRoot.traverse((obj) => {
        if (obj.isBone) boneMap[obj.name.toLowerCase()] = obj;
        if (obj.isMesh) {
          obj.frustumCulled = false;
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (obj.morphTargetDictionary && obj.morphTargetInfluences) blinkMeshes.push(obj);
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(enhanceAvatarMaterial);
        }
      });

      const findBone = (regex, exclude = /nub|end|top|toe|twist/i) => {
        for (const [k, b] of Object.entries(boneMap)) {
          if (regex.test(k) && !exclude.test(k)) return b;
        }
        return null;
      };

      const headBone   = findBone(/head/);
      const neckBone   = findBone(/neck/);
      const spineBone  = findBone(/spine2|spine1|spine/);
      const pelvisBone = findBone(/pelvis|hips/);

      // Strict regex matching so UpperArm NEVER accidentally matches Forearm (Fixes T-Pose!)
      const lClavicle = findBone(/(?:^|[_\s])(l|left)[_\s]*(clavicle|shoulder)/);
      const rClavicle = findBone(/(?:^|[_\s])(r|right)[_\s]*(clavicle|shoulder)/);
      const lUpperArm = findBone(/(?:^|[_\s])(l|left)[_\s]*upperarm|leftarm/, /forearm|clavicle|hand|nub|end|twist/i);
      const rUpperArm = findBone(/(?:^|[_\s])(r|right)[_\s]*upperarm|rightarm/, /forearm|clavicle|hand|nub|end|twist/i);
      const lForearm  = findBone(/(?:^|[_\s])(l|left)[_\s]*forearm/, /hand|nub|end|twist/i);
      const rForearm  = findBone(/(?:^|[_\s])(r|right)[_\s]*forearm/, /hand|nub|end|twist/i);
      const lHand     = findBone(/(?:^|[_\s])(l|left)[_\s]*hand/, /finger|thumb|index|middle|ring|pinky|nub|end/i);
      const rHand     = findBone(/(?:^|[_\s])(r|right)[_\s]*hand/, /finger|thumb|index|middle|ring|pinky|nub|end/i);

      const lThigh = findBone(/(?:^|[_\s])(l|left)[_\s]*(thigh|upleg)/);
      const rThigh = findBone(/(?:^|[_\s])(r|right)[_\s]*(thigh|upleg)/);
      const lCalf  = findBone(/(?:^|[_\s])(l|left)[_\s]*(calf|shin|leg)/, /upleg|thigh|foot|toe|nub|end/i);
      const rCalf  = findBone(/(?:^|[_\s])(r|right)[_\s]*(calf|shin|leg)/, /upleg|thigh|foot|toe|nub|end/i);

      // 2. Temporarily zero root transform so world-space pose calibration is 100% exact!
      const savedPos = root.position.clone();
      const savedRotY = root.rotation.y;
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      modelContainer.scale.setScalar(1.0);

      // Normalize height so feet sit cleanly on ground Y = 0
      avatarRoot.updateMatrixWorld(true);
      const rawBox = new THREE.Box3().setFromObject(avatarRoot);
      const rawSize = new THREE.Vector3();
      const rawCenter = new THREE.Vector3();
      rawBox.getSize(rawSize);
      rawBox.getCenter(rawCenter);

      charBaseHeight = spec.height;
      const scaleFactor = charBaseHeight / (rawSize.y || charBaseHeight);
      avatarRoot.scale.setScalar(scaleFactor);
      avatarRoot.position.set(
        -rawCenter.x * scaleFactor,
        -rawBox.min.y * scaleFactor,
        -rawCenter.z * scaleFactor
      );
      modelContainer.add(avatarRoot);
      root.updateMatrixWorld(true);

      // 3. Relax Arms Naturally Down by Hips (Character faces -Z -> Left = -X, Right = +X!)
      if (lClavicle && lUpperArm) {
        alignBoneDirection(lClavicle, lUpperArm, new THREE.Vector3(-0.96, -0.26, 0.0), 0.45);
      }
      if (rClavicle && rUpperArm) {
        alignBoneDirection(rClavicle, rUpperArm, new THREE.Vector3( 0.96, -0.26, 0.0), 0.45);
      }
      if (lUpperArm && lForearm) {
        alignBoneDirection(lUpperArm, lForearm, new THREE.Vector3(-0.14, -0.98, -0.02), 1.0);
      }
      if (rUpperArm && rForearm) {
        alignBoneDirection(rUpperArm, rForearm, new THREE.Vector3( 0.14, -0.98, -0.02), 1.0);
      }
      if (lForearm && lHand) {
        alignBoneDirection(lForearm, lHand, new THREE.Vector3(-0.06, -0.95, -0.22), 0.9);
      }
      if (rForearm && rHand) {
        alignBoneDirection(rForearm, rHand, new THREE.Vector3( 0.06, -0.95, -0.22), 0.9);
      }

      // 4. Capture Clean Sagittal-Plane Bone Axes for Smooth Walk/Run/Jump Animation
      root.updateMatrixWorld(true);
      rig = {
        head:      captureBoneRig(headBone),
        spine:     captureBoneRig(spineBone),
        pelvis:    captureBoneRig(pelvisBone),
        lUpperArm: captureBoneRig(lUpperArm),
        rUpperArm: captureBoneRig(rUpperArm),
        lForearm:  captureBoneRig(lForearm),
        rForearm:  captureBoneRig(rForearm),
        lThigh:    captureBoneRig(lThigh),
        rThigh:    captureBoneRig(rThigh),
        lCalf:     captureBoneRig(lCalf),
        rCalf:     captureBoneRig(rCalf)
      };

      // 5. Measure Exact Head, Neck & Waist in modelContainer Local Space (+Z Front)
      const invModel = modelContainer.matrixWorld.clone().invert();
      const headLocal = new THREE.Vector3(0, charBaseHeight * 0.87, 0.01);
      const neckLocal = new THREE.Vector3(0, charBaseHeight * 0.78, -0.01);

      if (headBone) {
        headBone.getWorldPosition(headLocal).applyMatrix4(invModel);
        headLocal.y += 0.055 * spec.headScale;
      }
      if (neckBone) {
        neckBone.getWorldPosition(neckLocal).applyMatrix4(invModel);
      } else {
        neckLocal.set(0, headLocal.y - 0.13 * spec.headScale, headLocal.z - 0.015);
      }

      let waistY = neckLocal.y - charBaseHeight * 0.34;
      if (pelvisBone) {
        const pLoc = new THREE.Vector3();
        pelvisBone.getWorldPosition(pLoc).applyMatrix4(invModel);
        waistY = pLoc.y - 0.04;
      }

      headHeightY = headLocal.y;
      cyberUniforms.uHeadLocalPos.value.copy(headLocal);
      cyberUniforms.uHeadScale.value = spec.headScale;
      cyberUniforms.uNeckY.value = neckLocal.y + 0.012 * spec.headScale;
      cyberUniforms.uWaistY.value = waistY;

      // Attach tailored high stand-up Sci-Fi collar seamlessly on lower neck
      collarMesh = createSciFiCollarMesh(spec.headScale, config.outfitColor);
      collarMesh.position.set(neckLocal.x, neckLocal.y - 0.022 * spec.headScale, neckLocal.z);
      modelContainer.add(collarMesh);

      // Subtle natural relaxed expression if morph targets exist
      blinkMeshes.forEach((m) => {
        const dict = m.morphTargetDictionary;
        for (const key of Object.keys(dict)) {
          if (/mouthsmile/i.test(key)) m.morphTargetInfluences[dict[key]] = 0.10;
        }
      });

      // Restore world position & apply live shader config
      root.position.copy(savedPos);
      root.rotation.y = savedRotY;
      syncUniformsFromConfig();
      modelContainer.updateMatrixWorld(true);
      cyberUniforms.uCharInvMatrix.value.copy(modelContainer.matrixWorld).invert();

      if (onLoadState) onLoadState(false, '');
    } catch (err) {
      console.error('Avatar load failed:', err);
      if (onLoadState) onLoadState(false, 'Model load failed (check internet)');
    }
  }

  function rebuild(patch = {}) {
    const prevAvatar = config.avatarId;
    config = { ...config, ...patch };
    syncUniformsFromConfig();
    if (!loadedAvatarId || config.avatarId !== prevAvatar) {
      loadAvatarModel(config.avatarId);
    }
  }

  // Helper to apply pitch/yaw/roll cleanly onto any Rocketbox bone
  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  function poseBone(entry, pitch = 0, yaw = 0, roll = 0) {
    if (!entry) return;
    entry.bone.quaternion.copy(entry.baseQuat);
    if (pitch !== 0) {
      q1.setFromAxisAngle(entry.axisX, pitch);
      entry.bone.quaternion.premultiply(q1);
    }
    if (yaw !== 0) {
      q2.setFromAxisAngle(entry.axisY, yaw);
      entry.bone.quaternion.premultiply(q2);
    }
    if (roll !== 0) {
      q2.setFromAxisAngle(entry.axisZ, roll);
      entry.bone.quaternion.premultiply(q2);
    }
  }

  function updateAnimation(dt, elapsed, state) {
    cyberUniforms.uTime.value = elapsed;
    if (!avatarRoot) return;

    const {
      isMoving = false,
      isSprinting = false,
      onGround = true,
      animTime = 0,
      turnDelta = 0,
      studioOpen = false
    } = state;

    // 1. Update shader inverse matrix so face circuits & jacket stay locked to character
    modelContainer.updateMatrixWorld(true);
    cyberUniforms.uCharInvMatrix.value.copy(modelContainer.matrixWorld).invert();

    // 2. Real ARKit/FACS Morph-Target Eye Blinking every ~4.1s
    const blinkPhase = elapsed % 4.1;
    const blinkVal = (blinkPhase > 3.94) ? Math.sin(((blinkPhase - 3.94) / 0.16) * Math.PI) : 0.0;
    for (const m of blinkMeshes) {
      const dict = m.morphTargetDictionary;
      for (const key of Object.keys(dict)) {
        if (/blink|eyeclose|eyesclosed/i.test(key)) {
          m.morphTargetInfluences[dict[key]] = Math.max(0, blinkVal);
        }
      }
    }

    if (!rig) return;

    // 3. Smooth Turn-Lean & Breathing
    const targetLean = isMoving ? clamp(turnDelta * 2.5, -0.11, 0.11) : 0;
    currentLeanZ += (targetLean - currentLeanZ) * Math.min(1, dt * 8);
    const breath = Math.sin(elapsed * 2.0);

    // 4. Full Skeletal Locomotion (Jump / Run / Walk / Living Idle)
    if (!onGround) {
      modelContainer.position.y = 0;
      poseBone(rig.lThigh,  0.48, 0, 0);
      poseBone(rig.lCalf,  -0.75, 0, 0);
      poseBone(rig.rThigh, -0.22, 0, 0);
      poseBone(rig.rCalf,  -0.42, 0, 0);
      poseBone(rig.lUpperArm, -0.45, 0, -0.18);
      poseBone(rig.rUpperArm,  0.35, 0,  0.18);
      poseBone(rig.lForearm,   0.45, 0,  0);
      poseBone(rig.rForearm,   0.35, 0,  0);
      poseBone(rig.spine, -0.10, 0, currentLeanZ);
      poseBone(rig.head,   0.08, 0, 0);
    } else if (isMoving) {
      const amp = isSprinting ? 0.68 : 0.42;
      const s = Math.sin(animTime);
      const c = Math.cos(animTime);

      // Vertical stride bounce
      modelContainer.position.y = Math.abs(s) * (isSprinting ? 0.055 : 0.025);

      // Legs swing forward (+X pitch) and knees bend backward (-X pitch)
      poseBone(rig.lThigh,  s * amp, 0, 0);
      poseBone(rig.rThigh, -s * amp, 0, 0);
      poseBone(rig.lCalf,   Math.min(0, -c * amp * 0.95 - 0.14), 0, 0);
      poseBone(rig.rCalf,   Math.min(0,  c * amp * 0.95 - 0.14), 0, 0);

      // Opposite arm swing + natural athletic elbow bend (+X pitch forward)
      poseBone(rig.lUpperArm, -s * amp * 0.78, 0, 0);
      poseBone(rig.rUpperArm,  s * amp * 0.78, 0, 0);
      poseBone(rig.lForearm,   (isSprinting ? 0.65 : 0.25) + Math.max(0, -s * 0.42), 0, 0);
      poseBone(rig.rForearm,   (isSprinting ? 0.65 : 0.25) + Math.max(0,  s * 0.42), 0, 0);

      // Forward sprint lean & subtle torso counter-twist
      poseBone(rig.spine, isSprinting ? -0.14 : -0.04, s * (isSprinting ? 0.09 : 0.045), currentLeanZ);
      poseBone(rig.head,  isSprinting ?  0.10 :  0.02, -s * 0.04, 0);
    } else {
      // Calm Natural Living Idle (Subtle breathing & gentle head glance)
      modelContainer.position.y = breath * 0.004;
      poseBone(rig.lThigh, 0, 0, 0);
      poseBone(rig.rThigh, 0, 0, 0);
      poseBone(rig.lCalf,  0, 0, 0);
      poseBone(rig.rCalf,  0, 0, 0);
      poseBone(rig.lUpperArm, breath * 0.015, 0, -0.02);
      poseBone(rig.rUpperArm, breath * 0.015, 0,  0.02);
      poseBone(rig.lForearm,  0.06, 0, 0);
      poseBone(rig.rForearm,  0.06, 0, 0);
      poseBone(rig.spine, breath * 0.016, Math.sin(elapsed * 0.55) * 0.02, 0);
      poseBone(rig.head,  breath * 0.012, studioOpen ? Math.sin(elapsed * 0.5) * 0.05 : Math.sin(elapsed * 0.6) * 0.08, 0);
    }
  }

  // Trigger initial avatar load
  rebuild(config);

  return {
    root,
    rebuild,
    updateAnimation,
    getHeadY: () => headHeightY * (config.heightScale || 1.0),
    getCharHeight: () => charBaseHeight * (config.heightScale || 1.0),
    getConfig: () => ({ ...config })
  };
}
