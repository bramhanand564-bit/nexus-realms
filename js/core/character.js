import * as THREE from 'three';

export const DEFAULT_CHAR_CONFIG = {
  gender: 'male',            // 'male' | 'female'
  age: 15,                   // 12 (Young) to 70 (Elder)
  skinTone: '#e6bfa3',
  eyeColor: '#4c7c94',
  hairStyle: 'video_short',  // 'video_short' | 'buzz' | 'medium' | 'long' | 'ponytail' | 'spiky'
  hairColor: '#251c17',
  hairLength: 1.0,           // 0.6 to 1.5
  beardSize: 0,              // 0 (Clean) to 4 (Long Rugged)
  circuits: true,            // Fine glowing neural face, neck & hand circuits
  circuitColor: '#7cf7ff',
  outfit: 'stealth',         // 'stealth' | 'jacket' | 'armor' | 'hoodie'
  outfitColor: '#22262e',
  accentColor: '#aef9ff'
};

export const CHAR_PRESETS = {
  video: { ...DEFAULT_CHAR_CONFIG },
  girl: {
    gender: 'female', age: 21, skinTone: '#e8c4aa', eyeColor: '#3a9b9e',
    hairStyle: 'long', hairColor: '#241714', hairLength: 1.15, beardSize: 0,
    circuits: true, circuitColor: '#66f0ff', outfit: 'stealth',
    outfitColor: '#212530', accentColor: '#78f4ff'
  },
  elder: {
    gender: 'male', age: 60, skinTone: '#d4a382', eyeColor: '#566870',
    hairStyle: 'medium', hairColor: '#b8bdc4', hairLength: 0.95, beardSize: 3,
    circuits: false, circuitColor: '#ffaa44', outfit: 'jacket',
    outfitColor: '#382d27', accentColor: '#d4a24c'
  }
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function gauss2(x, y, cx, cy, sx, sy) {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;
  return Math.exp(-(dx * dx + dy * dy));
}
function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) };
}
function shadeHex(hex, factor) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return '#' + c.getHexString();
}

// --- PARAMETRIC ORGANIC LOFTED MESH GENERATOR (Replaces primitive cylinders!) ---
// Rings MUST be ordered strictly bottom-to-top (increasing y) for clean outward normals
function createLoftedGeometry(rings, radialSegs = 24) {
  const numRings = rings.length;
  const stride = radialSegs + 1;
  const positions = new Float32Array(numRings * stride * 3);
  const uvs = new Float32Array(numRings * stride * 2);

  const minY = rings[0].y;
  const maxY = rings[numRings - 1].y;
  const spanY = Math.max(0.0001, maxY - minY);

  let pIdx = 0, uIdx = 0;
  for (let i = 0; i < numRings; i++) {
    const r = rings[i];
    const v = (r.y - minY) / spanY;
    const ox = r.ox || 0;
    const oz = r.oz || 0;
    const chest = r.chest || 0;
    const back = r.back || 0;
    const pinch = r.pinch || 0;

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      let x = cosT * r.rx + ox;
      let z = sinT * r.rz + oz;

      // Subtle anatomical chest/pectoral & spine contour (Front is -Z => sinT < 0)
      if (chest !== 0 && sinT < 0) {
        const pecSplit = 0.65 + 0.35 * Math.sin(Math.abs(cosT) * Math.PI);
        z -= chest * Math.pow(-sinT, 1.45) * pecSplit;
      }
      if (back !== 0 && sinT > 0) {
        const spineDip = 1.0 - 0.32 * Math.exp(-Math.pow(cosT / 0.25, 2));
        z += back * Math.pow(sinT, 1.4) * spineDip;
      }
      if (pinch !== 0) {
        x *= 1.0 - pinch * Math.pow(Math.abs(sinT), 2.0);
      }

      positions[pIdx++] = x;
      positions[pIdx++] = r.y;
      positions[pIdx++] = z;
      uvs[uIdx++] = u;
      uvs[uIdx++] = v;
    }
  }

  const indices = [];
  for (let i = 0; i < numRings - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = i * stride + (j + 1);
      const d = (i + 1) * stride + (j + 1);
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// --- HIGH-RES 1024x1024 FACE SKIN + NORMAL + ULTRA-FINE NEURAL CIRCUITS ---
function createHeadTextures(cfg) {
  const S = 1024;
  const skinCanvas = document.createElement('canvas');
  skinCanvas.width = skinCanvas.height = S;
  const ctx = skinCanvas.getContext('2d');

  // 1. Rich Multi-Tone Human Skin Base
  ctx.fillStyle = cfg.skinTone;
  ctx.fillRect(0, 0, S, S);

  const baseRgb = hexToRgb(cfg.skinTone);

  // Subtle subsurface warmth (ears, nose, cheeks, forehead micro-tones)
  const addToneGlow = (u, v, rad, rgba) => {
    const g = ctx.createRadialGradient(u * S, v * S, 2, u * S, v * S, rad * S);
    g.addColorStop(0, rgba);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect((u - rad) * S, (v - rad) * S, rad * 2 * S, rad * 2 * S);
  };

  // Warm rosy cheeks & nose tip (matches reference photo realism)
  const cheekAlpha = cfg.gender === 'female' ? 0.22 : (cfg.age < 19 ? 0.17 : 0.12);
  addToneGlow(0.415, 0.545, 0.085, `rgba(218, 96, 86, ${cheekAlpha})`);
  addToneGlow(0.585, 0.545, 0.085, `rgba(218, 96, 86, ${cheekAlpha})`);
  addToneGlow(0.500, 0.548, 0.042, 'rgba(215, 108, 94, 0.13)');
  addToneGlow(0.500, 0.360, 0.120, 'rgba(255, 240, 224, 0.08)'); // Forehead natural light

  // Natural Eye Socket Depth Shading (Eyes live at u = 0.443 & 0.557, v = 0.467)
  addToneGlow(0.443, 0.467, 0.044, 'rgba(72, 42, 34, 0.24)');
  addToneGlow(0.557, 0.467, 0.044, 'rgba(72, 42, 34, 0.24)');
  // Under-nose shadow & nostrils
  addToneGlow(0.500, 0.570, 0.024, 'rgba(55, 30, 22, 0.20)');
  ctx.fillStyle = 'rgba(42, 22, 16, 0.52)';
  ctx.beginPath(); ctx.ellipse(S * 0.487, S * 0.566, 6, 3.2, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(S * 0.513, S * 0.566, 6, 3.2,  0.2, 0, Math.PI * 2); ctx.fill();

  // Realistic Skin Micro-Pores + Youth Freckles across nose/cheeks (like reference photo!)
  let seed = 911;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 9000; i++) {
    const x = rand() * S, y = rand() * S;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,246,238,0.032)' : 'rgba(65,34,20,0.035)';
    ctx.fillRect(x, y, 2, 2);
  }
  if (cfg.age < 26) {
    for (let i = 0; i < 65; i++) {
      const fx = S * (0.41 + rand() * 0.18);
      const fy = S * (0.50 + rand() * 0.08);
      ctx.fillStyle = `rgba(110, 62, 42, ${0.12 + rand() * 0.14})`;
      ctx.beginPath(); ctx.arc(fx, fy, 1.3 + rand() * 1.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Expressive Painted + Feathered Eyebrows (Aligned to brow ridge u=0.443/0.557, v=0.415)
  const drawBrow = (side) => {
    const cx = S * (0.5 + side * 0.058);
    const cy = S * 0.416;
    const hCol = new THREE.Color(cfg.hairColor);
    if (cfg.age > 52) hCol.lerp(new THREE.Color('#c8cdd4'), Math.min(0.6, (cfg.age - 52) / 25));
    const rgb = { r: Math.round(hCol.r * 255), g: Math.round(hCol.g * 255), b: Math.round(hCol.b * 255) };

    ctx.save();
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.85)`;
    ctx.lineCap = 'round';
    const thick = cfg.gender === 'female' ? 5.5 : 8.5;
    for (let k = 0; k < 22; k++) {
      const t = k / 21;
      const bx = cx - side * 26 + side * t * 56;
      const arch = Math.sin(t * Math.PI) * (cfg.gender === 'female' ? -7.5 : -4.5);
      const by = cy + arch + t * 2.5;
      ctx.lineWidth = thick * (0.55 + 0.45 * Math.sin(t * Math.PI)) * 0.35;
      ctx.beginPath();
      ctx.moveTo(bx - side * 4, by + 3);
      ctx.lineTo(bx + side * 6, by - 3.5);
      ctx.stroke();
    }
    ctx.restore();
  };
  drawBrow(-1);
  drawBrow(1);

  // Realistic Sculpted Lips (Aligned exactly to 3D lips at u=0.5, v=0.633)
  const drawLips = () => {
    const mx = S * 0.5, my = S * 0.633;
    const mw = cfg.gender === 'female' ? 34 : 31;
    const upperCol = cfg.gender === 'female'
      ? `rgba(${Math.min(255, baseRgb.r * 0.84 + 42)}, ${baseRgb.g * 0.46}, ${baseRgb.b * 0.48}, 0.90)`
      : `rgba(${Math.min(255, baseRgb.r * 0.84 + 16)}, ${baseRgb.g * 0.56}, ${baseRgb.b * 0.54}, 0.82)`;
    const lowerCol = cfg.gender === 'female'
      ? `rgba(${Math.min(255, baseRgb.r * 0.90 + 48)}, ${baseRgb.g * 0.52}, ${baseRgb.b * 0.54}, 0.88)`
      : `rgba(${Math.min(255, baseRgb.r * 0.88 + 20)}, ${baseRgb.g * 0.60}, ${baseRgb.b * 0.58}, 0.78)`;

    // Upper lip with Cupid's bow
    ctx.fillStyle = upperCol;
    ctx.beginPath();
    ctx.moveTo(mx - mw, my);
    ctx.quadraticCurveTo(mx - mw * 0.45, my - 10, mx - 5, my - 7);
    ctx.quadraticCurveTo(mx, my - 4, mx + 5, my - 7);
    ctx.quadraticCurveTo(mx + mw * 0.45, my - 10, mx + mw, my);
    ctx.quadraticCurveTo(mx, my + 2.5, mx - mw, my);
    ctx.fill();

    // Lower lip fullness + subtle sheen highlight
    ctx.fillStyle = lowerCol;
    ctx.beginPath();
    ctx.moveTo(mx - mw * 0.92, my);
    ctx.quadraticCurveTo(mx, my + 16, mx + mw * 0.92, my);
    ctx.quadraticCurveTo(mx, my + 2, mx - mw * 0.92, my);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 240, 235, 0.22)';
    ctx.beginPath(); ctx.ellipse(mx, my + 6.5, mw * 0.42, 3.2, 0, 0, Math.PI * 2); ctx.fill();

    // Crisp mouth parting line + corner shadows
    ctx.strokeStyle = 'rgba(58, 26, 22, 0.72)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(mx - mw, my + 0.5);
    ctx.quadraticCurveTo(mx, my + 3.2, mx + mw, my + 0.5);
    ctx.stroke();
  };
  drawLips();

  // Age Wrinkles (Forehead, Crow's Feet, Nasolabial Folds when age > 30)
  const ageFactor = clamp((cfg.age - 30) / 40, 0, 1);
  if (ageFactor > 0.04) {
    ctx.strokeStyle = `rgba(65, 36, 24, ${0.34 * ageFactor})`;
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) {
      const wy = S * (0.32 + i * 0.022);
      ctx.beginPath();
      ctx.moveTo(S * 0.41, wy);
      ctx.quadraticCurveTo(S * 0.50, wy - 7, S * 0.59, wy);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(S * 0.465, S * 0.56); ctx.quadraticCurveTo(S * 0.44, S * 0.61, S * 0.45, S * 0.66);
    ctx.moveTo(S * 0.535, S * 0.56); ctx.quadraticCurveTo(S * 0.56, S * 0.61, S * 0.55, S * 0.66);
    ctx.stroke();
  }

  // Beard Stubble Shadow + Hair Follicles on Jaw (when beardSize >= 1 & male)
  if (cfg.beardSize >= 1 && cfg.gender === 'male') {
    const hCol = new THREE.Color(cfg.hairColor);
    if (cfg.age > 52) hCol.lerp(new THREE.Color('#c8cdd4'), Math.min(0.65, (cfg.age - 52) / 25));
    const hRgb = { r: Math.round(hCol.r * 255), g: Math.round(hCol.g * 255), b: Math.round(hCol.b * 255) };
    const density = cfg.beardSize === 1 ? 0.34 : 0.58;

    const grad = ctx.createRadialGradient(S * 0.5, S * 0.69, 30, S * 0.5, S * 0.70, 145);
    grad.addColorStop(0, `rgba(${hRgb.r}, ${hRgb.g}, ${hRgb.b}, ${density})`);
    grad.addColorStop(0.75, `rgba(${hRgb.r}, ${hRgb.g}, ${hRgb.b}, ${density * 0.65})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(S * 0.5, S * 0.70, 145, 95, 0, 0, Math.PI * 2); ctx.fill();

    // Mustache texture band above upper lip
    ctx.fillStyle = `rgba(${hRgb.r}, ${hRgb.g}, ${hRgb.b}, ${density * 0.85})`;
    ctx.beginPath(); ctx.ellipse(S * 0.5, S * 0.606, 36, 9, 0, 0, Math.PI * 2); ctx.fill();
    drawLips(); // Keep lips clean over beard shadow
  }

  // 2. ULTRA-FINE RAZOR-SHARP GLOWING NEURAL CIRCUITS (Matches Reference Photos!)
  const emCanvas = document.createElement('canvas');
  emCanvas.width = emCanvas.height = S;
  const eCtx = emCanvas.getContext('2d');
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, S, S);

  if (cfg.circuits) {
    const drawSideCircuits = (dir) => {
      const cx = (u) => S * (0.5 + dir * u);
      const cy = (v) => S * v;

      // Delicate angular 45-degree tech traces (cheekbone, temple, jawline, neck)
      const traces = [
        // Main upper cheekbone circuit below eye
        [[0.068, 0.515], [0.095, 0.502], [0.125, 0.528], [0.165, 0.528], [0.192, 0.495]],
        // Parallel fine sub-trace
        [[0.088, 0.534], [0.118, 0.548], [0.155, 0.548], [0.185, 0.578], [0.172, 0.635]],
        // Temple / outer brow fine branch
        [[0.085, 0.432], [0.115, 0.432], [0.140, 0.458], [0.172, 0.458]],
        // Forehead subtle circuit near hairline
        [[0.042, 0.375], [0.072, 0.375], [0.092, 0.398]],
        // Jawline drop toward neck
        [[0.125, 0.528], [0.125, 0.592], [0.148, 0.620], [0.148, 0.688], [0.118, 0.755]],
        // Lower cheek delicate geometric fork
        [[0.082, 0.602], [0.112, 0.625], [0.112, 0.678], [0.086, 0.715]],
        // Side-ear interconnect
        [[0.165, 0.528], [0.198, 0.562], [0.198, 0.630], [0.165, 0.675]]
      ];

      const paintTraces = (tCtx, lw, blur, dotR) => {
        tCtx.save();
        tCtx.strokeStyle = cfg.circuitColor;
        tCtx.lineWidth = lw;
        tCtx.lineCap = 'round';
        tCtx.lineJoin = 'round';
        tCtx.shadowColor = cfg.circuitColor;
        tCtx.shadowBlur = blur;

        traces.forEach((pts) => {
          tCtx.beginPath();
          pts.forEach(([u, v], idx) => {
            if (idx === 0) tCtx.moveTo(cx(u), cy(v));
            else tCtx.lineTo(cx(u), cy(v));
          });
          tCtx.stroke();

          // Tiny bright white-core nodes at circuit tips & corners
          tCtx.fillStyle = '#ffffff';
          pts.forEach(([u, v], idx) => {
            if (idx === 0 || idx === pts.length - 1 || idx === 2) {
              tCtx.beginPath();
              tCtx.arc(cx(u), cy(v), dotR, 0, Math.PI * 2);
              tCtx.fill();
            }
          });
        });
        tCtx.restore();
      };

      paintTraces(eCtx, 2.2, 10, 3.2);
      ctx.globalAlpha = 0.65;
      paintTraces(ctx, 1.5, 4, 2.2);
      ctx.globalAlpha = 1.0;
    };

    drawSideCircuits(-1);
    drawSideCircuits(1);
  }

  const skinTex = new THREE.CanvasTexture(skinCanvas);
  skinTex.colorSpace = THREE.SRGBColorSpace;
  skinTex.anisotropy = 4;

  const emissiveTex = new THREE.CanvasTexture(emCanvas);
  emissiveTex.colorSpace = THREE.SRGBColorSpace;
  emissiveTex.anisotropy = 4;

  return { skinTex, emissiveTex };
}

// --- CRISP 256x256 REALISTIC EYEBALL TEXTURE (Sclera + Detailed Iris + Catchlight) ---
function createEyeTexture(eyeColorHex) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');

  // Realistic soft-white sclera with gentle edge shading
  ctx.fillStyle = '#f2f1ed';
  ctx.fillRect(0, 0, S, S);
  const edgeShade = ctx.createRadialGradient(S * 0.5, S * 0.5, S * 0.16, S * 0.5, S * 0.5, S * 0.45);
  edgeShade.addColorStop(0, 'rgba(255,255,255,0)');
  edgeShade.addColorStop(1, 'rgba(185,165,160,0.35)');
  ctx.fillStyle = edgeShade;
  ctx.fillRect(0, 0, S, S);

  // Center at u=0.5, v=0.5 (faces straight out -Z after rotateY(+PI/2))
  const cx = S * 0.5, cy = S * 0.5;
  const irisR = S * 0.155;
  const irisCol = new THREE.Color(eyeColorHex);
  const darkLimbal = irisCol.clone().multiplyScalar(0.32);
  const brightInner = irisCol.clone().lerp(new THREE.Color('#ffffff'), 0.35);

  // Dark outer limbal ring (gives sharp expressive anime/game eye definition!)
  ctx.fillStyle = '#' + darkLimbal.getHexString();
  ctx.beginPath(); ctx.arc(cx, cy, irisR, 0, Math.PI * 2); ctx.fill();

  // Main Iris body gradient
  const iGrad = ctx.createRadialGradient(cx, cy, irisR * 0.25, cx, cy, irisR * 0.92);
  iGrad.addColorStop(0, '#' + brightInner.getHexString());
  iGrad.addColorStop(0.65, '#' + irisCol.getHexString());
  iGrad.addColorStop(1, '#' + darkLimbal.getHexString());
  ctx.fillStyle = iGrad;
  ctx.beginPath(); ctx.arc(cx, cy, irisR * 0.91, 0, Math.PI * 2); ctx.fill();

  // Fine radial iris fibers
  ctx.save();
  ctx.translate(cx, cy);
  for (let a = 0; a < 48; a++) {
    ctx.rotate((Math.PI * 2) / 48);
    ctx.strokeStyle = a % 2 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(irisR * 0.36, 0);
    ctx.lineTo(irisR * 0.86, 0);
    ctx.stroke();
  }
  ctx.restore();

  // Deep black pupil
  ctx.fillStyle = '#07090d';
  ctx.beginPath(); ctx.arc(cx, cy, irisR * 0.42, 0, Math.PI * 2); ctx.fill();

  // Upper shadow from eyelid for natural depth
  const lidShadow = ctx.createLinearGradient(0, cy - irisR, 0, cy);
  lidShadow.addColorStop(0, 'rgba(15,20,30,0.45)');
  lidShadow.addColorStop(1, 'rgba(15,20,30,0)');
  ctx.fillStyle = lidShadow;
  ctx.beginPath(); ctx.arc(cx, cy, irisR, 0, Math.PI * 2); ctx.fill();

  // Crisp glossy specular catchlights (brings character eyes ALIVE!)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx - irisR * 0.32, cy - irisR * 0.30, irisR * 0.17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.arc(cx + irisR * 0.28, cy + irisR * 0.25, irisR * 0.08, 0, Math.PI * 2); ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- HIGH-RES BRUSHED HAIR STRAND ALPHA TEXTURE ---
function createHairStrandTexture(hairColorHex, age) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);

  const col = new THREE.Color(hairColorHex);
  if (age > 52) col.lerp(new THREE.Color('#cfd4dc'), Math.min(0.68, (age - 52) / 25));
  const dark = col.clone().multiplyScalar(0.52);
  const hi = col.clone().lerp(new THREE.Color('#ffffff'), 0.26);

  // Soft strand body gradient tapering cleanly to feathered tips at bottom
  for (let i = 0; i < 65; i++) {
    const x = (0.12 + (i / 64) * 0.76) * S;
    const tipY = S * (0.76 + Math.sin((i / 64) * Math.PI) * 0.22 - (i % 5) * 0.03);
    const g = ctx.createLinearGradient(x, 0, x, tipY);
    g.addColorStop(0, '#' + dark.getHexString());
    g.addColorStop(0.38, '#' + (i % 4 === 0 ? hi : col).getHexString());
    g.addColorStop(0.85, '#' + col.getHexString());
    g.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.strokeStyle = g;
    ctx.lineWidth = 3.2 + (i % 3) * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + ((i % 2 ? 1 : -1) * 5), tipY * 0.55, S * 0.5 + (x - S * 0.5) * 0.45, tipY);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- 512x512 MATTE-LEATHER / CARBON TACTICAL SUIT TEXTURE + NORMAL ---
function createSuitTextures(baseColor, outfit) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, S, S);

  // Realistic leather/tactical mottled fabric variation (matches reference matte jacket!)
  let seed = 404;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 420; i++) {
    const x = rand() * S, y = rand() * S, r = 10 + rand() * 34;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    const bright = rand() > 0.5;
    g.addColorStop(0, bright ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.09)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Fine woven micro-grain
  for (let y = 0; y < S; y += 4) {
    for (let x = 0; x < S; x += 4) {
      ctx.fillStyle = ((x + y) % 8 === 0) ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Tailored ergonomic seams & stitching
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.52)';
  ctx.lineWidth = 3;
  // Side panel seams
  ctx.beginPath();
  ctx.moveTo(S * 0.25, 0); ctx.lineTo(S * 0.25, S);
  ctx.moveTo(S * 0.75, 0); ctx.lineTo(S * 0.75, S);
  // Diagonal chest paneling (stealth suit signature)
  if (outfit === 'stealth' || outfit === 'armor') {
    ctx.moveTo(S * 0.58, S * 0.1); ctx.lineTo(S * 0.68, S * 0.85);
    ctx.moveTo(S * 0.92, S * 0.1); ctx.lineTo(S * 0.82, S * 0.85);
  }
  ctx.stroke();

  // Subtle stitched highlight next to seam
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(S * 0.25 + 4, 0); ctx.lineTo(S * 0.25 + 4, S);
  ctx.moveTo(S * 0.75 - 4, 0); ctx.lineTo(S * 0.75 - 4, S);
  ctx.stroke();
  ctx.setLineDash([]);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// --- SCULPTED HIGH-POLY ANATOMICAL HEAD GEOMETRY (56x44, Front = -Z) ---
function createSculptedHeadGeo(cfg) {
  const geo = new THREE.SphereGeometry(0.132, 56, 44);
  geo.rotateY(Math.PI / 2); // Align UV u=0.5 directly to Front (-Z)
  const pos = geo.attributes.position;

  const isFemale = cfg.gender === 'female';
  const isYoung = cfg.age < 19;
  const jawScale = isFemale ? 0.62 : (isYoung ? 0.66 : 0.75);

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);

    // 1. Cranium & Jaw Proportions
    y *= 1.18;
    x *= isFemale ? 0.86 : 0.90;
    z *= 1.04;

    // Fuller occiput (back of skull)
    if (z > 0 && y > -0.02) z *= 1.05;

    // Taper lower jaw & chin naturally
    if (y < 0) {
      const t = clamp(-y / 0.155, 0, 1);
      x *= 1.0 - Math.pow(t, 1.35) * (1.0 - jawScale);
      // Slight jaw corner definition for adult male
      if (!isFemale && !isYoung && y < -0.045 && y > -0.105 && Math.abs(x) > 0.055) {
        x *= 1.06;
      }
    }

    // 2. Front Face Fine Sculpting (strictly on front hemisphere z < -0.02)
    if (z < -0.02) {
      const fm = smoothstep(-0.02, -0.075, z);

      // Recessed Eye Sockets (so glossy 3D eyeballs sit cleanly inside!)
      const sockL = gauss2(x, y, -0.042, 0.016, 0.024, 0.017);
      const sockR = gauss2(x, y,  0.042, 0.016, 0.024, 0.017);
      z += (sockL + sockR) * 0.017 * fm;

      // Sculpted Brow Ridge above sockets
      const browL = gauss2(x, y, -0.042, 0.046, 0.028, 0.012);
      const browR = gauss2(x, y,  0.042, 0.046, 0.028, 0.012);
      z -= (browL + browR) * (isFemale ? 0.005 : 0.009) * fm;

      // Sculpted Nose (Bridge + Tip + Nostril Wings)
      const noseBridge = gauss2(x, y, 0, 0.006, 0.011, 0.026) * 0.017;
      const noseTip = gauss2(x, y, 0, -0.021, 0.013, 0.013) * 0.027;
      const wingL = gauss2(x, y, -0.015, -0.026, 0.009, 0.008) * 0.012;
      const wingR = gauss2(x, y,  0.015, -0.026, 0.009, 0.008) * 0.012;
      z -= (noseBridge + noseTip + wingL + wingR) * fm;

      // Defined Cheekbones
      const cheekL = gauss2(x, y, -0.062, -0.012, 0.026, 0.022);
      const cheekR = gauss2(x, y,  0.062, -0.012, 0.026, 0.022);
      z -= (cheekL + cheekR) * (isYoung ? 0.009 : 0.0075) * fm;

      // Sculpted 3D Lips + Mouth Groove + Chin Contour
      const upperLip = gauss2(x, y, 0, -0.056, 0.024, 0.007) * (isFemale ? 0.011 : 0.009);
      const lowerLip = gauss2(x, y, 0, -0.070, 0.021, 0.008) * (isFemale ? 0.012 : 0.0095);
      const mouthGroove = gauss2(x, y, 0, -0.063, 0.024, 0.0032) * 0.0055;
      const chinDip = gauss2(x, y, 0, -0.085, 0.022, 0.009) * 0.0065;
      const chinProm = gauss2(x, y, 0, -0.112, 0.026, 0.022) * 0.011;
      z += (-upperLip - lowerLip + mouthGroove + chinDip - chinProm) * fm;
    }

    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

// --- CURVED HAIR-STRAND RIBBON GEOMETRY ---
function createHairRibbonGeo(w, len, bend = 0.028) {
  const geo = new THREE.PlaneGeometry(w, len, 2, 5);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i); // +len/2 (root) to -len/2 (tip)
    const t = (len * 0.5 - y) / len; // 0 at root, 1 at tip
    // Taper width softly toward tip & arch smoothly away from scalp then inward
    const taper = 1.0 - t * 0.55;
    const zCurve = Math.sin(t * Math.PI) * bend - (x * x) * 1.4;
    pos.setXYZ(i, x * taper, y - len * 0.5, zCurve);
  }
  geo.computeVertexNormals();
  return geo;
}

// --- LAYERED REALISTIC HAIR BUILDER (Swept Cleanly ABOVE Eyebrows!) ---
function buildHair(headGroup, cfg, hairCapMat, hairStrandMat) {
  const hairPivot = new THREE.Group();
  headGroup.add(hairPivot);

  const len = cfg.hairLength;
  const style = cfg.hairStyle;

  // 1. Sleek fitted scalp base (Hairline sits cleanly ABOVE forehead/brows!)
  const capGeo = new THREE.SphereGeometry(0.138, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.58);
  capGeo.scale(cfg.gender === 'female' ? 0.89 : 0.93, 1.16, 1.05);
  const cap = new THREE.Mesh(capGeo, hairCapMat);
  cap.position.set(0, 0.012, 0.012);
  cap.rotation.x = -0.26; // Tilts hairline back so forehead & eyes stay 100% clear!
  cap.castShadow = true;
  hairPivot.add(cap);

  if (style === 'buzz') return hairPivot;

  let seed = 521;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const shortStrandGeo = createHairRibbonGeo(0.052, 0.095, 0.022);
  const longStrandGeo = createHairRibbonGeo(0.056, 0.165, 0.028);

  // 2. Front Layered Fringe (Swept neatly sideways ABOVE eyebrows — Matches Reference Photos!)
  const frontCount = style === 'spiky' ? 14 : 12;
  for (let i = 0; i < frontCount; i++) {
    const t = (i / (frontCount - 1)) - 0.5; // -0.5 to +0.5
    const ang = t * 1.38;
    const m = new THREE.Mesh(shortStrandGeo, hairStrandMat);

    // Anchored high along the forehead hairline (y ~ 0.118)
    m.position.set(
      Math.sin(ang) * 0.115,
      0.116 - Math.abs(t) * 0.022 + (rand() - 0.5) * 0.01,
      -Math.cos(ang) * 0.122
    );

    if (style === 'spiky') {
      m.rotation.set(-0.95 - rand() * 0.35, -ang, (rand() - 0.5) * 0.35);
      m.scale.set(0.95, 0.9 * len, 1.0);
    } else {
      // Side-swept feathery fringe stopping strictly above y=0.055 (NEVER blocking eyes!)
      const sweepZ = -0.55 - t * 0.35 + (rand() - 0.5) * 0.18;
      m.rotation.set(0.18 + rand() * 0.12, -ang, sweepZ);
      const safeLen = Math.min(1.05, 0.65 + (len - 0.6) * 0.45);
      m.scale.set(0.95 + rand() * 0.3, safeLen * (0.78 + rand() * 0.25), 1.0);
    }
    hairPivot.add(m);
  }

  // 3. Crown & Top Layered Volume Tufts
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.02 + rand() * 0.105;
    const m = new THREE.Mesh(shortStrandGeo, hairStrandMat);
    m.position.set(Math.cos(a) * r, 0.158 - r * 0.28, Math.sin(a) * r + 0.015);
    if (style === 'spiky') {
      m.rotation.set(Math.PI + (rand() - 0.5) * 0.5, a, (rand() - 0.5) * 0.5);
      m.scale.set(0.9, (0.75 + rand() * 0.4) * len, 1.0);
    } else {
      m.rotation.set(0.62 + rand() * 0.45, Math.atan2(Math.cos(a), Math.sin(a)), (rand() - 0.5) * 0.4);
      m.scale.set(1.0 + rand() * 0.4, (0.72 + rand() * 0.35) * len, 1.0);
    }
    hairPivot.add(m);
  }

  // 4. Sides & Back Layered Hair (Natural taper around ears & nape, or long flowing!)
  const dropMult = style === 'long' ? 2.15 : (style === 'medium' ? 1.35 : 0.78);
  const backCount = style === 'long' ? 32 : 24;
  for (let i = 0; i < backCount; i++) {
    const a = (i / (backCount - 1)) * Math.PI * 1.48 - Math.PI * 0.74; // Sides & Back (+Z)
    const m = new THREE.Mesh(longStrandGeo, hairStrandMat);
    m.position.set(
      Math.sin(a) * 0.122,
      0.088 - Math.abs(Math.sin(a)) * 0.02 + (rand() - 0.5) * 0.015,
      Math.cos(a) * 0.132 + 0.01
    );
    m.rotation.set(-0.08 + rand() * 0.1, a, (rand() - 0.5) * 0.15);
    m.scale.set(1.05 + rand() * 0.3, (0.85 + rand() * 0.28) * dropMult * len, 1.0);
    m.castShadow = true;
    hairPivot.add(m);
  }

  // 5. Ponytail (Optional style)
  if (style === 'ponytail') {
    const tie = new THREE.Mesh(
      new THREE.TorusGeometry(0.028, 0.008, 8, 16),
      new THREE.MeshStandardMaterial({ color: cfg.accentColor, roughness: 0.35 })
    );
    tie.position.set(0, 0.055, 0.148);
    hairPivot.add(tie);

    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const tailStrand = new THREE.Mesh(longStrandGeo, hairStrandMat);
      tailStrand.position.set(Math.cos(ang) * 0.014, 0.055, 0.158 + Math.sin(ang) * 0.012);
      tailStrand.rotation.set(-0.22, ang, 0);
      tailStrand.scale.set(1.1, 1.55 * len, 1.0);
      hairPivot.add(tailStrand);
    }
  }

  return hairPivot;
}

// --- SCULPTED 3D BEARD BUILDER (Matches Jaw Contour) ---
function buildBeard(headGroup, cfg, hairMat) {
  if (cfg.beardSize < 2 || cfg.gender === 'female') return;
  const beardGroup = new THREE.Group();
  const s = cfg.beardSize; // 2=Short Trim, 3=Full, 4=Long Rugged

  // Sculpted Mustache
  for (const side of [-1, 1]) {
    const st = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.026, 4, 8), hairMat);
    st.position.set(side * 0.018, -0.044, -0.128);
    st.rotation.z = side * -1.32;
    st.rotation.y = side * -0.22;
    beardGroup.add(st);
  }

  // Sculpted Chin & Jawline Beard
  const bLen = s === 2 ? 0.045 : (s === 3 ? 0.092 : 0.155);
  const chinBeard = new THREE.Mesh(
    createLoftedGeometry([
      { y: -bLen, rx: 0.016, rz: 0.014 },
      { y: -bLen * 0.45, rx: 0.042, rz: 0.032 },
      { y: 0.0, rx: 0.056, rz: 0.044 }
    ], 14),
    hairMat
  );
  chinBeard.position.set(0, -0.092, -0.088);
  chinBeard.castShadow = true;
  beardGroup.add(chinBeard);

  for (const side of [-1, 1]) {
    const jaw = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.014 + (s - 2) * 0.005, 0.068, 4, 8),
      hairMat
    );
    jaw.position.set(side * 0.075, -0.078, -0.072);
    jaw.rotation.set(0.32, side * 0.42, side * 0.44);
    beardGroup.add(jaw);
  }
  headGroup.add(beardGroup);
}

// --- SCULPTED 5-FINGER HAND + OPTIONAL GLOWING HAND CIRCUITS (Reference Photo #4!) ---
function createSculptedHand(side, skinMat, glowMat, showCircuits) {
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.076, 0.022), skinMat);
  palm.position.y = -0.038;
  palm.castShadow = true;
  hand.add(palm);

  // 4 Slightly Curved Fingers
  const fLens = [0.054, 0.062, 0.058, 0.046];
  fLens.forEach((fl, i) => {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0058, fl, 3, 6), skinMat);
    f.position.set((i - 1.5) * 0.014, -0.076 - fl * 0.45, -0.003);
    f.rotation.x = 0.14;
    hand.add(f);
  });

  // Thumb
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0068, 0.036, 3, 6), skinMat);
  thumb.position.set(-side * 0.032, -0.045, -0.014);
  thumb.rotation.set(0.25, 0, -side * 0.55);
  hand.add(thumb);

  // Fine glowing circuit traces on back of hand (like the flower-reaching scene!)
  if (showCircuits) {
    for (let k = -1; k <= 1; k++) {
      const trace = new THREE.Mesh(new THREE.BoxGeometry(0.0024, 0.055, 0.0024), glowMat);
      trace.position.set(k * 0.012, -0.036, 0.012);
      hand.add(trace);
    }
  }
  return hand;
}

// --- MAIN PRO CHARACTER SYSTEM ---
export function createCharacterSystem(scene, initialConfig = DEFAULT_CHAR_CONFIG) {
  const root = new THREE.Group();
  scene.add(root);

  let config = { ...DEFAULT_CHAR_CONFIG, ...initialConfig };
  let parts = null;
  let ownedTextures = [];
  let blinkTimer = 2.4;
  let isBlinking = false;

  // Real-Time Secondary Spring Physics State (Hair Bounce + Dynamic Body Lean)
  const hairSpring = { pitch: 0, pitchVel: 0, roll: 0, rollVel: 0 };
  let currentLeanZ = 0;

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
    const heightScale = isYoung ? 0.89 + (config.age - 12) * 0.015 : (isFemale ? 0.95 : 1.02);
    const shoulderHalf = isFemale ? 0.175 : (isYoung ? 0.185 : 0.22);
    const waistHalf = isFemale ? 0.118 : (isYoung ? 0.132 : 0.152);
    const hipHalf = isFemale ? 0.156 : (isYoung ? 0.138 : 0.152);

    // High-Res Procedural PBR Textures
    const { skinTex, emissiveTex } = createHeadTextures(config);
    const eyeTex = createEyeTexture(config.eyeColor);
    const hairStrandTex = createHairStrandTexture(config.hairColor, config.age);
    const suitTex = createSuitTextures(config.outfitColor, config.outfit);
    ownedTextures.push(skinTex, emissiveTex, eyeTex, hairStrandTex, suitTex);

    const headMat = new THREE.MeshStandardMaterial({
      map: skinTex,
      emissive: new THREE.Color(config.circuits ? config.circuitColor : '#000000'),
      emissiveMap: emissiveTex,
      emissiveIntensity: config.circuits ? 1.85 : 0.0,
      roughness: 0.54,
      metalness: 0.03
    });

    const skinPlainMat = new THREE.MeshStandardMaterial({
      color: config.skinTone, roughness: 0.55, metalness: 0.03
    });

    const eyeMat = new THREE.MeshStandardMaterial({
      map: eyeTex, roughness: 0.06, metalness: 0.05
    });

    const finalHairCol = new THREE.Color(config.hairColor);
    if (config.age > 52) {
      finalHairCol.lerp(new THREE.Color('#cfd4dc'), Math.min(0.68, (config.age - 52) / 25));
    }
    const hairCapMat = new THREE.MeshStandardMaterial({
      color: finalHairCol, roughness: 0.66, metalness: 0.1
    });
    const hairStrandMat = new THREE.MeshStandardMaterial({
      map: hairStrandTex,
      alphaTest: 0.24,
      side: THREE.DoubleSide,
      roughness: 0.56,
      metalness: 0.12
    });

    const outfitMat = new THREE.MeshStandardMaterial({
      map: suitTex,
      roughness: config.outfit === 'armor' ? 0.26 : (config.outfit === 'stealth' ? 0.44 : 0.62),
      metalness: config.outfit === 'armor' ? 0.72 : (config.outfit === 'stealth' ? 0.22 : 0.08)
    });

    const pantsMat = new THREE.MeshStandardMaterial({
      color: shadeHex(config.outfitColor, 0.80),
      roughness: 0.66,
      metalness: config.outfit === 'stealth' ? 0.16 : 0.06
    });

    const bootMat = new THREE.MeshStandardMaterial({
      color: '#15181e', roughness: 0.42, metalness: 0.22
    });
    const soleMat = new THREE.MeshStandardMaterial({
      color: '#2b303a', roughness: 0.75
    });
    const metalZipMat = new THREE.MeshStandardMaterial({
      color: '#cfd6df', roughness: 0.22, metalness: 0.9
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: config.accentColor });
    const lashMat = new THREE.MeshBasicMaterial({ color: '#141110' });

    const body = new THREE.Group();
    body.scale.setScalar(heightScale);
    root.add(body);

    // --- 1. ORGANIC LOFTED PELVIS / HIPS ---
    const pelvis = new THREE.Group();
    pelvis.position.y = 0.92;
    body.add(pelvis);

    const pelvisGeo = createLoftedGeometry([
      { y: -0.09, rx: hipHalf * 0.88, rz: 0.095 },
      { y: -0.03, rx: hipHalf * 1.04, rz: 0.112, back: 0.018 },
      { y:  0.04, rx: hipHalf * 0.98, rz: 0.106, back: 0.012 },
      { y:  0.09, rx: waistHalf * 1.02, rz: 0.098 }
    ], 22);
    const pelvisMesh = new THREE.Mesh(pelvisGeo, pantsMat);
    pelvisMesh.castShadow = true;
    pelvis.add(pelvisMesh);

    // Sleek Tactical Belt
    const belt = new THREE.Mesh(
      createLoftedGeometry([
        { y: 0.062, rx: waistHalf * 1.05, rz: 0.103 },
        { y: 0.096, rx: waistHalf * 1.05, rz: 0.103 }
      ], 22),
      bootMat
    );
    pelvis.add(belt);

    // --- 2. ORGANIC LOFTED ANATOMICAL TORSO + SLEEK HIGH COLLAR ---
    const torsoGroup = new THREE.Group();
    torsoGroup.position.y = 0.08;
    pelvis.add(torsoGroup);

    const chestDepth = isFemale ? 0.034 : (isYoung ? 0.014 : 0.024);
    const torsoGeo = createLoftedGeometry([
      { y: 0.00, rx: waistHalf * 1.01, rz: 0.098 },
      { y: 0.08, rx: waistHalf * 0.96, rz: 0.096 },
      { y: 0.17, rx: waistHalf * 1.06, rz: 0.106, chest: chestDepth * 0.35, back: 0.012 },
      { y: 0.27, rx: shoulderHalf * 0.88, rz: 0.114, chest: chestDepth, back: 0.022 },
      { y: 0.36, rx: shoulderHalf * 0.98, rz: 0.106, chest: chestDepth * 0.55, back: 0.018 },
      { y: 0.43, rx: shoulderHalf * 0.84, rz: 0.088 },
      { y: 0.47, rx: 0.082, rz: 0.074 },
      { y: 0.505, rx: 0.068, rz: 0.066 }, // High fitted collar (exact video silhouette!)
      { y: 0.515, rx: 0.056, rz: 0.056 }
    ], 26);
    const torsoMesh = new THREE.Mesh(torsoGeo, outfitMat);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    torsoGroup.add(torsoMesh);

    // Outfit-Specific High-Craft Details
    if (config.outfit === 'stealth') {
      // Real 3D Metallic Front Center Zipper + Pull Tab (matches Photo #5!)
      const zipTrack = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.43, 0.008), metalZipMat);
      zipTrack.position.set(0, 0.27, -0.115 - chestDepth * 0.38);
      zipTrack.rotation.x = 0.04;
      const zipPull = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.026, 0.008), metalZipMat);
      zipPull.position.set(0, 0.435, -0.108 - chestDepth * 0.25);
      torsoGroup.add(zipTrack, zipPull);

      // Subtle, Hair-Thin Glowing Accents (NO giant sticks! Matches Photo #5 & #6!)
      for (const side of [-1, 1]) {
        // Tiny sleek white-cyan collarbone dash
        const collarDash = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.032, 0.0045), glowMat);
        collarDash.position.set(side * 0.105, 0.425, -0.072);
        collarDash.rotation.set(0.35, 0, side * 0.65);
        torsoGroup.add(collarDash);

        // Thin angled chest-to-rib subtle trim line
        const ribTrim = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.145, 0.004), glowMat);
        ribTrim.position.set(side * (waistHalf * 0.78), 0.18, -0.102);
        ribTrim.rotation.z = side * -0.26;
        torsoGroup.add(ribTrim);
      }
    } else if (config.outfit === 'jacket') {
      const teeMat = new THREE.MeshStandardMaterial({ color: '#d8dee6', roughness: 0.85 });
      const tee = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.40, 0.04), teeMat);
      tee.position.set(0, 0.26, -0.095 - chestDepth * 0.4);
      const zipL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.40, 0.012), metalZipMat);
      zipL.position.set(-0.048, 0.26, -0.112 - chestDepth * 0.4);
      const zipR = zipL.clone(); zipR.position.x = 0.048;
      torsoGroup.add(tee, zipL, zipR);
    } else if (config.outfit === 'armor') {
      const plateMat = new THREE.MeshStandardMaterial({ color: '#dce3ec', roughness: 0.22, metalness: 0.8 });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(shoulderHalf * 1.45, 0.20, 0.045), plateMat);
      plate.position.set(0, 0.31, -0.108 - chestDepth * 0.35);
      plate.castShadow = true;
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), glowMat);
      core.position.set(0, 0.32, -0.135 - chestDepth * 0.35);
      torsoGroup.add(plate, core);
    } else if (config.outfit === 'hoodie') {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.032, 10, 20), outfitMat);
      hood.position.set(0, 0.46, 0.048); hood.rotation.x = 0.72;
      const drawL = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.15, 6), metalZipMat);
      drawL.position.set(-0.032, 0.38, -0.112 - chestDepth * 0.4);
      const drawR = drawL.clone(); drawR.position.x = 0.032;
      torsoGroup.add(hood, drawL, drawR);
    }

    // --- 3. NECK WITH SUBTLE GLOWING CIRCUIT LINES ---
    const neckGroup = new THREE.Group();
    neckGroup.position.y = 0.495;
    torsoGroup.add(neckGroup);

    const neckGeo = createLoftedGeometry([
      { y: 0.00, rx: 0.056, rz: 0.058 },
      { y: 0.05, rx: 0.047, rz: 0.050 },
      { y: 0.11, rx: 0.049, rz: 0.052 }
    ], 16);
    const neckMesh = new THREE.Mesh(neckGeo, skinPlainMat);
    neckGroup.add(neckMesh);

    if (config.circuits) {
      for (const side of [-1, 1]) {
        const nLine1 = new THREE.Mesh(new THREE.BoxGeometry(0.0028, 0.075, 0.0028), glowMat);
        nLine1.position.set(side * 0.046, 0.045, -0.018);
        nLine1.rotation.z = side * 0.1;
        const nLine2 = new THREE.Mesh(new THREE.BoxGeometry(0.0024, 0.055, 0.0024), glowMat);
        nLine2.position.set(side * 0.036, 0.04, -0.034);
        nLine2.rotation.z = side * -0.14;
        neckGroup.add(nLine1, nLine2);
      }
    }

    // --- 4. SCULPTED 3D HEAD + CLEAR GLOSSY EYES + LASHES + HAIR + BEARD ---
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.212;
    neckGroup.add(headGroup);

    const headMesh = new THREE.Mesh(createSculptedHeadGeo(config), headMat);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    headGroup.add(headMesh);

    // Sculpted 3D Ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), skinPlainMat);
      ear.scale.set(0.42, 1.18, 0.72);
      ear.position.set(side * (isFemale ? 0.114 : 0.120), -0.006, 0.004);
      ear.rotation.y = side * -0.25;
      headGroup.add(ear);
    }

    // Expressive Glossy 3D Eyeballs + Upper Lash Line + Blinking Eyelids
    const eyeballs = [];
    const eyelids = [];
    const eyeGeo = new THREE.SphereGeometry(0.0175, 18, 14);
    eyeGeo.rotateY(Math.PI / 2); // Align textured iris (u=0.5) directly forward (-Z)

    for (const side of [-1, 1]) {
      const eyeSocket = new THREE.Group();
      eyeSocket.position.set(side * 0.042, 0.016, -0.109);

      const eyeBall = new THREE.Mesh(eyeGeo, eyeMat);
      eyeballs.push(eyeBall);
      eyeSocket.add(eyeBall);

      // Crisp Curved Upper Eyelash Arc (Free Fire / AAA clarity!)
      const lash = new THREE.Mesh(
        new THREE.TorusGeometry(0.0185, 0.0022, 6, 14, Math.PI * 0.85),
        lashMat
      );
      lash.position.set(0, 0.004, -0.006);
      lash.rotation.set(0.32, 0, Math.PI * 0.075);
      eyeSocket.add(lash);

      // Blinking Upper Eyelid Shell (Open by default at -0.72 so eyes are 100% CLEAR!)
      const lid = new THREE.Mesh(
        new THREE.SphereGeometry(0.0192, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
        skinPlainMat
      );
      lid.rotation.x = -0.72;
      eyelids.push(lid);
      eyeSocket.add(lid);

      headGroup.add(eyeSocket);
    }

    const hairPivot = buildHair(headGroup, config, hairCapMat, hairStrandMat);
    buildBeard(headGroup, config, hairCapMat);

    // --- 5. ORGANIC LOFTED ARMS + 5-FINGER HANDS ---
    function createArm(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * (shoulderHalf + 0.004), 0.395, 0);

      // Smooth blended deltoid cap (same material, contoured — no floating ball!)
      const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.056, 14, 12), outfitMat);
      deltoid.scale.set(0.95, 1.08, 0.92);
      deltoid.castShadow = true;
      shoulder.add(deltoid);

      const upperArmGeo = createLoftedGeometry([
        { y: -0.27, rx: 0.040, rz: 0.040 },
        { y: -0.18, rx: 0.047, rz: 0.048 }, // Bicep fullness
        { y: -0.08, rx: 0.052, rz: 0.051 },
        { y:  0.00, rx: 0.053, rz: 0.050 }
      ], 16);
      const upperArm = new THREE.Mesh(upperArmGeo, outfitMat);
      upperArm.castShadow = true;
      shoulder.add(upperArm);

      // Subtle thin glowing V-accent on outer sleeve (Matches Photo #6!)
      if (config.outfit === 'stealth') {
        const sleeveAccent = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.11, 0.004), glowMat);
        sleeveAccent.position.set(side * 0.048, -0.15, 0.005);
        shoulder.add(sleeveAccent);
      }

      const elbow = new THREE.Group();
      elbow.position.y = -0.27;
      shoulder.add(elbow);

      const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.039, 10, 8), outfitMat);
      elbow.add(elbowCap);

      const foreArmGeo = createLoftedGeometry([
        { y: -0.25, rx: 0.028, rz: 0.026 }, // Tapered wrist
        { y: -0.16, rx: 0.035, rz: 0.034 },
        { y: -0.06, rx: 0.041, rz: 0.040 }, // Forearm muscle
        { y:  0.00, rx: 0.039, rz: 0.038 }
      ], 16);
      const foreArm = new THREE.Mesh(foreArmGeo, outfitMat);
      foreArm.castShadow = true;
      elbow.add(foreArm);

      const hand = createSculptedHand(side, skinPlainMat, glowMat, config.circuits);
      hand.position.y = -0.25;
      elbow.add(hand);

      torsoGroup.add(shoulder);
      return { shoulder, elbow };
    }

    const leftArm = createArm(-1);
    const rightArm = createArm(1);

    // --- 6. ORGANIC LOFTED LEGS + DETAILED TACTICAL BOOTS ---
    function createLeg(side) {
      const hip = new THREE.Group();
      hip.position.set(side * (hipHalf * 0.58), -0.04, 0);

      const thighGeo = createLoftedGeometry([
        { y: -0.42, rx: 0.052, rz: 0.054 }, // Above knee
        { y: -0.28, rx: 0.066, rz: 0.072 }, // Quad fullness
        { y: -0.12, rx: 0.076, rz: 0.082 },
        { y:  0.00, rx: 0.074, rz: 0.078 }
      ], 18);
      const thigh = new THREE.Mesh(thighGeo, pantsMat);
      thigh.castShadow = true;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);

      const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.051, 10, 8), pantsMat);
      knee.add(kneeCap);

      const shinGeo = createLoftedGeometry([
        { y: -0.39, rx: 0.038, rz: 0.040 }, // Ankle
        { y: -0.25, rx: 0.046, rz: 0.052 },
        { y: -0.12, rx: 0.054, rz: 0.060, back: 0.014 }, // Sculpted calf muscle
        { y:  0.00, rx: 0.051, rz: 0.053 }
      ], 18);
      const shin = new THREE.Mesh(shinGeo, pantsMat);
      shin.castShadow = true;
      knee.add(shin);

      // Multi-part Tactical Boot + Thick Sole
      const bootUpper = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.072, 0.185), bootMat);
      bootUpper.position.set(0, -0.415, -0.032);
      bootUpper.castShadow = true;
      const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.024, 0.198), soleMat);
      bootSole.position.set(0, -0.456, -0.032);
      knee.add(bootUpper, bootSole);

      pelvis.add(hip);
      return { hip, knee };
    }

    const leftLeg = createLeg(-1);
    const rightLeg = createLeg(1);

    parts = {
      body, pelvis, torsoGroup, headGroup, hairPivot,
      eyeballs, eyelids, leftArm, rightArm, leftLeg, rightLeg, heightScale
    };
  }

  // --- SMOOTH ANIMATION + REAL-TIME SECONDARY SPRING PHYSICS ---
  function updateAnimation(dt, elapsed, state) {
    if (!parts) return;
    const {
      isMoving = false,
      isSprinting = false,
      onGround = true,
      animTime = 0,
      velY = 0,
      turnDelta = 0,
      studioOpen = false
    } = state;

    // 1. Natural Eye Blinking (Eyes stay 100% open except for crisp 0.12s blink!)
    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      isBlinking = !isBlinking;
      blinkTimer = isBlinking ? 0.12 : (2.4 + Math.random() * 3.0);
    }
    const lidTarget = isBlinking ? 0.35 : -0.72;
    parts.eyelids.forEach(lid => {
      lid.rotation.x += (lidTarget - lid.rotation.x) * Math.min(1, dt * 30);
    });

    // Subtle natural eye saccades (alive gaze!)
    const lookX = studioOpen ? Math.sin(elapsed * 0.55) * 0.06 : Math.sin(elapsed * 0.4) * 0.09;
    const lookY = studioOpen ? Math.sin(elapsed * 0.35) * 0.04 : 0;
    parts.eyeballs.forEach(eb => {
      eb.rotation.y = lookX;
      eb.rotation.x = lookY;
    });

    // 2. Hair Secondary Spring-Damper Physics (Reacts to jump, running & turning!)
    const targetHairPitch = clamp(-velY * 0.018 + (isMoving ? (isSprinting ? 0.09 : 0.04) : 0), -0.14, 0.16);
    const targetHairRoll = clamp(turnDelta * 2.2, -0.12, 0.12);
    const kStiff = 48, kDamp = 7.5;
    hairSpring.pitchVel += ((targetHairPitch - hairSpring.pitch) * kStiff - hairSpring.pitchVel * kDamp) * dt;
    hairSpring.pitch += hairSpring.pitchVel * dt;
    hairSpring.rollVel += ((targetHairRoll - hairSpring.roll) * kStiff - hairSpring.rollVel * kDamp) * dt;
    hairSpring.roll += hairSpring.rollVel * dt;
    parts.hairPivot.rotation.x = hairSpring.pitch + Math.sin(elapsed * 2.6) * 0.008;
    parts.hairPivot.rotation.z = hairSpring.roll;

    // 3. Dynamic Turn-Lean Physics
    const desiredLean = isMoving ? clamp(turnDelta * 3.2, -0.14, 0.14) : 0;
    currentLeanZ += (desiredLean - currentLeanZ) * Math.min(1, dt * 8);
    parts.torsoGroup.rotation.z = currentLeanZ;

    // 4. Breathing Chest Expansion
    const breath = Math.sin(elapsed * 2.2);
    parts.torsoGroup.scale.set(1.0 + breath * 0.008, 1.0, 1.0 + breath * 0.014);

    // 5. Full Articulated Locomotion & Athletic Jump Pose
    if (!onGround) {
      parts.leftLeg.hip.rotation.x = 0.42;
      parts.leftLeg.knee.rotation.x = -0.68;
      parts.rightLeg.hip.rotation.x = -0.22;
      parts.rightLeg.knee.rotation.x = -0.35;
      parts.leftArm.shoulder.rotation.x = -0.52;
      parts.leftArm.shoulder.rotation.z = -0.18;
      parts.rightArm.shoulder.rotation.x = 0.35;
      parts.rightArm.shoulder.rotation.z = 0.18;
      return;
    }

    if (isMoving) {
      const amp = isSprinting ? 0.78 : 0.48;
      const s = Math.sin(animTime);
      const c = Math.cos(animTime);

      parts.leftLeg.hip.rotation.x = s * amp;
      parts.rightLeg.hip.rotation.x = -s * amp;
      parts.leftLeg.knee.rotation.x = Math.min(0, -c * amp * 0.88 - 0.10);
      parts.rightLeg.knee.rotation.x = Math.min(0, c * amp * 0.88 - 0.10);

      parts.leftArm.shoulder.rotation.x = -s * amp * 0.82;
      parts.rightArm.shoulder.rotation.x = s * amp * 0.82;
      parts.leftArm.shoulder.rotation.z = -0.06;
      parts.rightArm.shoulder.rotation.z = 0.06;
      parts.leftArm.elbow.rotation.x = 0.28 + Math.max(0, -s * 0.52);
      parts.rightArm.elbow.rotation.x = 0.28 + Math.max(0, s * 0.52);

      parts.torsoGroup.rotation.x = isSprinting ? 0.15 : 0.05;
      parts.torsoGroup.rotation.y = s * (isSprinting ? 0.10 : 0.05);
      parts.pelvis.position.y = 0.92 + Math.abs(Math.sin(animTime)) * (isSprinting ? 0.048 : 0.022);
      parts.headGroup.rotation.y = -s * 0.04;
    } else {
      // Natural Heroic Idle Stance (relaxed arms slightly away from hips, like Free Fire lobby!)
      parts.leftLeg.hip.rotation.x *= 0.84;
      parts.rightLeg.hip.rotation.x *= 0.84;
      parts.leftLeg.hip.rotation.z = -0.045;
      parts.rightLeg.hip.rotation.z = 0.045;
      parts.leftLeg.knee.rotation.x *= 0.84;
      parts.rightLeg.knee.rotation.x *= 0.84;

      parts.leftArm.shoulder.rotation.x *= 0.84;
      parts.rightArm.shoulder.rotation.x *= 0.84;
      parts.leftArm.shoulder.rotation.z = -0.10 - breath * 0.012;
      parts.rightArm.shoulder.rotation.z = 0.10 + breath * 0.012;
      parts.leftArm.elbow.rotation.x = 0.16;
      parts.rightArm.elbow.rotation.x = 0.16;

      parts.torsoGroup.rotation.x = breath * 0.014;
      parts.torsoGroup.rotation.y *= 0.88;
      parts.pelvis.position.y = 0.92 + breath * 0.007;
      parts.headGroup.rotation.y = studioOpen
        ? Math.sin(elapsed * 0.65) * 0.07
        : Math.sin(elapsed * 0.7) * 0.09;
      parts.headGroup.rotation.x = breath * 0.015;
    }
  }

  rebuild(config);

  return {
    root,
    rebuild,
    updateAnimation,
    getHeightScale: () => parts ? parts.heightScale : 1.0,
    getConfig: () => ({ ...config })
  };
}
