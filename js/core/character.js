import * as THREE from 'three';

export const DEFAULT_CHAR_CONFIG = {
  gender: 'male',            // 'male' | 'female'
  age: 16,                   // 12 (Young) to 70 (Elder)
  skinTone: '#e5bca0',
  eyeColor: '#4c7e96',
  hairStyle: 'video_short',  // 'video_short' | 'buzz' | 'medium' | 'long' | 'ponytail' | 'spiky'
  hairColor: '#231a15',
  hairLength: 1.0,           // 0.6 to 1.5
  beardSize: 0,              // 0 (Clean) to 4 (Long Rugged)
  circuits: true,            // Razor-fine neural face, neck & hand circuits
  circuitColor: '#78f6ff',
  outfit: 'stealth',         // 'stealth' | 'jacket' | 'armor' | 'hoodie'
  outfitColor: '#20242c',
  accentColor: '#a8f8ff'
};

export const CHAR_PRESETS = {
  video: { ...DEFAULT_CHAR_CONFIG },
  girl: {
    gender: 'female', age: 22, skinTone: '#e8c4aa', eyeColor: '#3a9498',
    hairStyle: 'long', hairColor: '#241714', hairLength: 1.12, beardSize: 0,
    circuits: true, circuitColor: '#66f0ff', outfit: 'stealth',
    outfitColor: '#212530', accentColor: '#78f4ff'
  },
  elder: {
    gender: 'male', age: 62, skinTone: '#d3a281', eyeColor: '#566870',
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

// --- MODULE-LEVEL CACHED MICRO-PBR NORMAL & ROUGHNESS MAPS (Zero Slider Lag!) ---
let SHARED_PBR = null;

function heightArrayToNormalTex(heights, S, strength, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const at = (x, y) => heights[((y + S) % S) * S + ((x + S) % S)];

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1.0 / Math.hypot(dx, dy, 1.0);
      const idx = (y * S + x) * 4;
      d[idx]     = ((-dx * inv) * 0.5 + 0.5) * 255;
      d[idx + 1] = ((-dy * inv) * 0.5 + 0.5) * 255;
      d[idx + 2] = (inv * 0.5 + 0.5) * 255;
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.userData.cached = true;
  return tex;
}

function getSharedPBR() {
  if (SHARED_PBR) return SHARED_PBR;
  const S = 256;
  let seed = 1337;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // 1. Human Skin Micro-Pore Normal Map (Organic fine dermal grain)
  const skinH = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) skinH[i] = 0.5 + (rand() - 0.5) * 0.22;
  // Add subtle pore dimples
  for (let p = 0; p < 1600; p++) {
    const px = Math.floor(rand() * S), py = Math.floor(rand() * S);
    skinH[py * S + px] -= 0.35;
  }
  // Smooth 1 pass for natural organic skin
  const skinSmooth = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const idx = y * S + x;
      const xm = (x - 1 + S) % S, xp = (x + 1) % S;
      const ym = (y - 1 + S) % S, yp = (y + 1) % S;
      skinSmooth[idx] = (
        skinH[idx] * 4 + skinH[y * S + xm] + skinH[y * S + xp] +
        skinH[ym * S + x] + skinH[yp * S + x]
      ) / 8;
    }
  }
  const skinNormalMap = heightArrayToNormalTex(skinSmooth, S, 1.35, 6);

  // 2. Anatomical Facial Roughness Map (Oily/glossy T-zone, lips & nose tip; matte cheeks)
  const rCanvas = document.createElement('canvas');
  rCanvas.width = rCanvas.height = 256;
  const rCtx = rCanvas.getContext('2d');
  rCtx.fillStyle = '#9e9e9e'; // ~0.62 base matte skin
  rCtx.fillRect(0, 0, 256, 256);
  const paintGloss = (u, v, rx, ry, val) => {
    const g = rCtx.createRadialGradient(u * 256, v * 256, 2, u * 256, v * 256, Math.max(rx, ry) * 256);
    g.addColorStop(0, `rgb(${val},${val},${val})`);
    g.addColorStop(1, 'rgba(158,158,158,0)');
    rCtx.fillStyle = g;
    rCtx.fillRect((u - rx) * 256, (v - ry) * 256, rx * 512, ry * 512);
  };
  paintGloss(0.50, 0.35, 0.14, 0.08, 108); // Forehead subtle sheen
  paintGloss(0.50, 0.54, 0.05, 0.08, 92);  // Nose bridge & tip
  paintGloss(0.42, 0.53, 0.07, 0.06, 118); // Left cheekbone highlight
  paintGloss(0.58, 0.53, 0.07, 0.06, 118); // Right cheekbone highlight
  paintGloss(0.50, 0.64, 0.07, 0.03, 72);  // Moist natural lips
  const skinRoughnessMap = new THREE.CanvasTexture(rCanvas);
  skinRoughnessMap.userData.cached = true;

  // 3. Tactical Leather / Woven Fabric Normal Map
  const fabH = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const weave = Math.sin(x * 0.85) * Math.cos(y * 0.85) * 0.25;
      const pebble = Math.sin(x * 0.22 + Math.cos(y * 0.25) * 2.0) * 0.35;
      const seamX = (x % 128 < 2) ? -0.55 : 0;
      fabH[y * S + x] = 0.5 + weave + pebble + seamX + (rand() - 0.5) * 0.15;
    }
  }
  const fabricNormalMap = heightArrayToNormalTex(fabH, S, 2.2, 4);

  // 4. Anisotropic-style Hair Strand Normal Map
  const hairH = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const strand = Math.sin(x * 1.15 + Math.sin(y * 0.06) * 2.2) * 0.5 +
                     Math.sin(x * 2.7) * 0.25;
      hairH[y * S + x] = 0.5 + strand * 0.45;
    }
  }
  const hairNormalMap = heightArrayToNormalTex(hairH, S, 2.8, 1);

  SHARED_PBR = { skinNormalMap, skinRoughnessMap, fabricNormalMap, hairNormalMap };
  return SHARED_PBR;
}

// --- PARAMETRIC MUSCULAR LOFTED GEOMETRY (Rings strictly bottom-to-top for outward normals) ---
function createLoftedGeometry(rings, radialSegs = 28) {
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
    const ox = r.ox || 0, oz = r.oz || 0;
    const chest = r.chest || 0;
    const back = r.back || 0;
    const sternum = r.sternum || 0;
    const clav = r.clav || 0;
    const glute = r.glute || 0;
    const pinch = r.pinch || 0;

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      let x = cosT * r.rx + ox;
      let z = sinT * r.rz + oz;

      // Front anatomical sculpting (sinT < 0 is -Z Front)
      if (sinT < 0) {
        const frontW = Math.pow(-sinT, 1.45);
        if (chest !== 0) {
          const pecSplit = 0.45 + 0.55 * Math.sin(Math.abs(cosT) * Math.PI);
          z -= chest * frontW * pecSplit;
        }
        if (sternum !== 0) {
          const centerDip = Math.exp(-Math.pow(cosT / 0.20, 2));
          z += sternum * frontW * centerDip;
        }
        if (clav !== 0) {
          const clavRidge = Math.exp(-Math.pow((Math.abs(cosT) - 0.52) / 0.26, 2));
          z -= clav * frontW * clavRidge;
        }
      }

      // Back anatomical sculpting (sinT > 0 is +Z Back: spine furrow, scapulae, glutes)
      if (sinT > 0) {
        const backW = Math.pow(sinT, 1.4);
        const spineFurrow = Math.exp(-Math.pow(cosT / 0.22, 2));
        if (back !== 0) {
          z += back * backW * (1.0 - 0.42 * spineFurrow);
        }
        if (glute !== 0) {
          const cheekCurve = 0.4 + 0.6 * Math.sin(Math.abs(cosT) * Math.PI);
          z += glute * backW * cheekCurve * (1.0 - 0.55 * spineFurrow);
        }
      }

      if (pinch !== 0) x *= 1.0 - pinch * Math.pow(Math.abs(sinT), 2.0);

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

// --- 1024x1024 REAL 3-ZONE HUMAN FACE ALBEDO + FINE NEURAL CIRCUITS ---
// Exact trigonometric UV mapping aligned to 96x72 sculpted head (Ry = 0.114, Rx = 0.077):
// Eyes: u = 0.5 ± 0.067, v = 0.478 | Brows: v = 0.418 | Nose tip: v = 0.556 | Lips: v = 0.638
function createHeadTextures(cfg) {
  const S = 1024;
  const skinCanvas = document.createElement('canvas');
  skinCanvas.width = skinCanvas.height = S;
  const ctx = skinCanvas.getContext('2d');

  ctx.fillStyle = cfg.skinTone;
  ctx.fillRect(0, 0, S, S);

  const baseRgb = hexToRgb(cfg.skinTone);

  const addZone = (u, v, rx, ry, rgba) => {
    ctx.save();
    ctx.translate(u * S, v * S);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, rx * S);
    g.addColorStop(0, rgba);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx * S, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // REAL HUMAN 3-ZONE FACIAL COLOR THEORY (Makes faces look alive, NOT plastic!)
  // Zone 1: Forehead (warmer subtle golden undertone)
  addZone(0.50, 0.34, 0.14, 0.08, 'rgba(245, 224, 180, 0.11)');
  // Zone 2: Mid-face (blood-rich warm rosy undertones across cheeks, nose bridge & ears)
  const rosy = cfg.gender === 'female' ? 0.21 : (cfg.age < 19 ? 0.16 : 0.13);
  addZone(0.412, 0.535, 0.072, 0.052, `rgba(210, 88, 76, ${rosy})`);
  addZone(0.588, 0.535, 0.072, 0.052, `rgba(210, 88, 76, ${rosy})`);
  addZone(0.500, 0.548, 0.034, 0.032, 'rgba(205, 95, 82, 0.15)');
  // Zone 3: Lower jaw / chin (subtle cooler olive/slate undertone in males)
  if (cfg.gender === 'male' && cfg.age >= 18) {
    addZone(0.50, 0.72, 0.13, 0.075, 'rgba(72, 92, 108, 0.08)');
  }

  // Natural Ambient Occlusion in Eye Sockets, Under-Eye Tear Trough & Nasolabial area
  addZone(0.433, 0.478, 0.042, 0.030, 'rgba(58, 34, 28, 0.28)');
  addZone(0.567, 0.478, 0.042, 0.030, 'rgba(58, 34, 28, 0.28)');
  // Subtle upper eyelid crease shadow
  ctx.strokeStyle = 'rgba(70, 38, 30, 0.35)';
  ctx.lineWidth = 3.2;
  for (const side of [-1, 1]) {
    const ex = S * (0.5 + side * 0.067), ey = S * 0.456;
    ctx.beginPath();
    ctx.moveTo(ex - side * 26, ey + 6);
    ctx.quadraticCurveTo(ex, ey - 7, ex + side * 28, ey + 5);
    ctx.stroke();
  }

  // Nose dorsal specular highlight, alar crease shadows & realistic recessed nostrils
  addZone(0.500, 0.505, 0.012, 0.042, 'rgba(255, 246, 236, 0.16)');
  addZone(0.500, 0.556, 0.014, 0.012, 'rgba(255, 245, 236, 0.18)');
  addZone(0.500, 0.574, 0.022, 0.014, 'rgba(52, 28, 20, 0.24)');
  ctx.fillStyle = 'rgba(34, 16, 12, 0.72)';
  ctx.beginPath(); ctx.ellipse(S * 0.486, S * 0.570, 6.2, 3.2, -0.28, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(S * 0.514, S * 0.570, 6.2, 3.2,  0.28, 0, Math.PI * 2); ctx.fill();

  // Philtrum dip (subtle vertical groove between nose and upper lip)
  addZone(0.500, 0.602, 0.010, 0.018, 'rgba(65, 36, 28, 0.15)');

  // Subtle Natural Skin Pores & Youthful Freckles across nose bridge & cheeks
  let seed = 733;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 6500; i++) {
    const x = rand() * S, y = rand() * S;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,248,240,0.032)' : 'rgba(62,32,20,0.036)';
    ctx.fillRect(x, y, 2, 2);
  }
  if (cfg.age < 26) {
    for (let i = 0; i < 75; i++) {
      const fx = S * (0.40 + rand() * 0.20);
      const fy = S * (0.50 + rand() * 0.08);
      ctx.fillStyle = `rgba(112, 62, 42, ${0.11 + rand() * 0.15})`;
      ctx.beginPath(); ctx.arc(fx, fy, 1.2 + rand() * 1.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Soft Scalp Hairline Blend & Sideburns (Eliminates sharp cartoon hair edge!)
  const hCol = new THREE.Color(cfg.hairColor);
  if (cfg.age > 52) hCol.lerp(new THREE.Color('#cfd4dc'), Math.min(0.68, (cfg.age - 52) / 25));
  const hRgb = { r: Math.round(hCol.r * 255), g: Math.round(hCol.g * 255), b: Math.round(hCol.b * 255) };

  const scalpGrad = ctx.createLinearGradient(0, S * 0.16, 0, S * 0.305);
  scalpGrad.addColorStop(0, `rgba(${hRgb.r},${hRgb.g},${hRgb.b},0.92)`);
  scalpGrad.addColorStop(0.75, `rgba(${hRgb.r},${hRgb.g},${hRgb.b},0.45)`);
  scalpGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = scalpGrad;
  ctx.fillRect(0, 0, S, S * 0.31);

  // Tapered natural sideburns in front of ears
  for (const side of [-1, 1]) {
    const sx = S * (0.5 + side * 0.215);
    const sbGrad = ctx.createLinearGradient(sx, S * 0.36, sx, S * 0.56);
    sbGrad.addColorStop(0, `rgba(${hRgb.r},${hRgb.g},${hRgb.b},0.65)`);
    sbGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sbGrad;
    ctx.beginPath(); ctx.ellipse(sx, S * 0.45, 18, 72, side * 0.12, 0, Math.PI * 2); ctx.fill();
  }

  // Hyper-Detailed Micro-Stroke Eyebrows (Individual hairs, aligned at u = 0.5 ± 0.067, v = 0.418)
  const drawBrow = (side) => {
    const cx = S * (0.5 + side * 0.066);
    const cy = S * 0.418;
    const isFem = cfg.gender === 'female';
    ctx.save();
    ctx.lineCap = 'round';
    // Soft brow shadow base
    ctx.strokeStyle = `rgba(${hRgb.r},${hRgb.g},${hRgb.b},0.28)`;
    ctx.lineWidth = isFem ? 9 : 14;
    ctx.beginPath();
    ctx.moveTo(cx - side * 26, cy + 2);
    ctx.quadraticCurveTo(cx + side * 4, cy - (isFem ? 10 : 6), cx + side * 32, cy + 5);
    ctx.stroke();

    // 48 fine individual directional eyebrow hairs
    for (let k = 0; k < 48; k++) {
      const t = k / 47;
      const bx = cx - side * 26 + side * t * 58;
      const arch = Math.sin(t * Math.PI) * (isFem ? -9.5 : -5.5);
      const by = cy + arch + t * 3.5 + (rand() - 0.5) * 4;
      ctx.strokeStyle = `rgba(${hRgb.r},${hRgb.g},${hRgb.b},${0.65 + rand() * 0.30})`;
      ctx.lineWidth = (isFem ? 1.4 : 2.0) * (0.5 + 0.5 * Math.sin(t * Math.PI));
      ctx.beginPath();
      ctx.moveTo(bx - side * 3, by + 4);
      ctx.lineTo(bx + side * 7, by - 4.5 + t * 3);
      ctx.stroke();
    }
    ctx.restore();
  };
  drawBrow(-1);
  drawBrow(1);

  // Realistic Sculpted Human Lips (Vertical micro-creases + soft natural vermilion fade at u=0.5, v=0.638)
  const drawLips = () => {
    const mx = S * 0.5, my = S * 0.638;
    const mw = cfg.gender === 'female' ? 46 : 44;
    const uR = Math.min(255, baseRgb.r * 0.80 + (cfg.gender === 'female' ? 50 : 24));
    const uG = baseRgb.g * (cfg.gender === 'female' ? 0.45 : 0.52);
    const uB = baseRgb.b * (cfg.gender === 'female' ? 0.48 : 0.52);
    const lR = Math.min(255, baseRgb.r * 0.88 + (cfg.gender === 'female' ? 55 : 28));
    const lG = baseRgb.g * (cfg.gender === 'female' ? 0.50 : 0.58);
    const lB = baseRgb.b * (cfg.gender === 'female' ? 0.52 : 0.56);

    // Soft outer lip edge feathering
    addZone(0.50, 0.640, 0.052, 0.022, `rgba(${uR},${uG},${uB},0.22)`);

    // Upper lip (Cupid's bow)
    ctx.fillStyle = `rgba(${uR},${uG},${uB},0.88)`;
    ctx.beginPath();
    ctx.moveTo(mx - mw, my);
    ctx.bezierCurveTo(mx - mw * 0.55, my - 12, mx - 12, my - 11, mx - 6, my - 8);
    ctx.quadraticCurveTo(mx, my - 4.5, mx + 6, my - 8);
    ctx.bezierCurveTo(mx + 12, my - 11, mx + mw * 0.55, my - 12, mx + mw, my);
    ctx.quadraticCurveTo(mx, my + 2.5, mx - mw, my);
    ctx.fill();

    // Lower lip fullness
    ctx.fillStyle = `rgba(${lR},${lG},${lB},0.85)`;
    ctx.beginPath();
    ctx.moveTo(mx - mw * 0.90, my);
    ctx.bezierCurveTo(mx - mw * 0.45, my + 21, mx + mw * 0.45, my + 21, mx + mw * 0.90, my);
    ctx.quadraticCurveTo(mx, my + 2.0, mx - mw * 0.90, my);
    ctx.fill();

    // Subtle vertical lip texture lines & moist sheen
    ctx.strokeStyle = 'rgba(70, 30, 26, 0.22)';
    ctx.lineWidth = 1.2;
    for (let l = -7; l <= 7; l++) {
      ctx.beginPath();
      ctx.moveTo(mx + l * 4.5, my + 2);
      ctx.lineTo(mx + l * 4.2, my + 13);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 242, 238, 0.28)';
    ctx.beginPath(); ctx.ellipse(mx, my + 8.5, mw * 0.40, 3.8, 0, 0, Math.PI * 2); ctx.fill();

    // Mouth parting occlusion line & corner dimples
    ctx.strokeStyle = 'rgba(48, 20, 16, 0.78)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(mx - mw, my + 0.5);
    ctx.quadraticCurveTo(mx, my + 3.2, mx + mw, my + 0.5);
    ctx.stroke();

    // Subtle shadow right below lower lip (labiomental sulcus)
    addZone(0.50, 0.678, 0.035, 0.012, 'rgba(55, 28, 20, 0.24)');
  };
  drawLips();

  // Realistic Aging Lines (Forehead, Glabella, Crow's feet, Nasolabial folds)
  const ageFactor = clamp((cfg.age - 30) / 40, 0, 1);
  if (ageFactor > 0.04) {
    ctx.strokeStyle = `rgba(65, 36, 24, ${0.36 * ageFactor})`;
    ctx.lineWidth = 2.0;
    for (let i = 0; i < 3; i++) {
      const wy = S * (0.315 + i * 0.022);
      ctx.beginPath();
      ctx.moveTo(S * 0.405, wy);
      ctx.quadraticCurveTo(S * 0.50, wy - 7, S * 0.595, wy);
      ctx.stroke();
    }
    // Nasolabial smile folds
    ctx.beginPath();
    ctx.moveTo(S * 0.464, S * 0.562); ctx.quadraticCurveTo(S * 0.435, S * 0.618, S * 0.445, S * 0.672);
    ctx.moveTo(S * 0.536, S * 0.562); ctx.quadraticCurveTo(S * 0.565, S * 0.618, S * 0.555, S * 0.672);
    ctx.stroke();
    // Crow's feet at outer eye corners
    for (const side of [-1, 1]) {
      const ox = S * (0.5 + side * 0.105), oy = S * 0.480;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(ox, oy + k * 4);
        ctx.lineTo(ox + side * 16, oy + k * 10);
        ctx.stroke();
      }
    }
  }

  // Beard Stubble & Follicle Grain (beardSize >= 1 & male)
  if (cfg.beardSize >= 1 && cfg.gender === 'male') {
    const density = cfg.beardSize === 1 ? 0.36 : 0.62;
    const grad = ctx.createRadialGradient(S * 0.5, S * 0.70, 26, S * 0.5, S * 0.71, 152);
    grad.addColorStop(0, `rgba(${hRgb.r},${hRgb.g},${hRgb.b},${density})`);
    grad.addColorStop(0.72, `rgba(${hRgb.r},${hRgb.g},${hRgb.b},${density * 0.68})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(S * 0.5, S * 0.71, 154, 96, 0, 0, Math.PI * 2); ctx.fill();

    // Fine beard hair speckles for realistic stubble texture
    for (let i = 0; i < 1800; i++) {
      const bx = S * (0.37 + rand() * 0.26);
      const by = S * (0.61 + rand() * 0.20);
      const d = Math.hypot((bx - S * 0.5) / 140, (by - S * 0.71) / 92);
      if (d < 1.0) {
        ctx.fillStyle = `rgba(${hRgb.r},${hRgb.g},${hRgb.b},${0.45 * (1 - d * 0.4)})`;
        ctx.fillRect(bx, by, 1.8, 3.2);
      }
    }
    ctx.fillStyle = `rgba(${hRgb.r},${hRgb.g},${hRgb.b},${density * 0.85})`;
    ctx.beginPath(); ctx.ellipse(S * 0.5, S * 0.608, 44, 10, 0, 0, Math.PI * 2); ctx.fill();
    drawLips();
  }

  // ULTRA-FINE GLOWING NEURAL CIRCUITS (Matching Reference Photos Precisely!)
  const emCanvas = document.createElement('canvas');
  emCanvas.width = emCanvas.height = S;
  const eCtx = emCanvas.getContext('2d');
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, S, S);

  if (cfg.circuits) {
    const drawSideCircuits = (dir) => {
      const cx = (u) => S * (0.5 + dir * u);
      const cy = (v) => S * v;

      const traces = [
        // Main cheekbone geometric trace beneath eye
        [[0.072, 0.520], [0.102, 0.506], [0.132, 0.534], [0.172, 0.534], [0.200, 0.500]],
        // Secondary parallel delicate cheek trace
        [[0.094, 0.542], [0.124, 0.556], [0.160, 0.556], [0.190, 0.588], [0.176, 0.646]],
        // Outer temple & brow circuit fork
        [[0.092, 0.436], [0.122, 0.436], [0.148, 0.464], [0.180, 0.464]],
        // Subtle upper forehead circuit near hairline
        [[0.048, 0.362], [0.078, 0.362], [0.098, 0.386]],
        // Jawline drop leading cleanly into neck circuits
        [[0.132, 0.534], [0.132, 0.598], [0.154, 0.628], [0.154, 0.700], [0.122, 0.768]],
        // Lower cheek delicate fork
        [[0.088, 0.608], [0.118, 0.632], [0.118, 0.686], [0.092, 0.724]],
        // Pre-auricular circuit near ear
        [[0.172, 0.534], [0.204, 0.568], [0.204, 0.638], [0.172, 0.684]]
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

      paintTraces(eCtx, 1.9, 9, 2.8);
      ctx.globalAlpha = 0.58;
      paintTraces(ctx, 1.3, 3.5, 1.8);
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

// --- PHOTOREALISTIC 512x512 ASPECT-CORRECTED HUMAN EYEBALL TEXTURE ---
function createEyeTexture(eyeColorHex) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');

  // Natural living off-white sclera with delicate outer corner warmth
  ctx.fillStyle = '#f2efe9';
  ctx.fillRect(0, 0, S, S);

  const cx = S * 0.5, cy = S * 0.5;
  const irisR = S * 0.135; // Realistic human iris diameter ratio (~11.8mm on 24mm globe)
  const irisCol = new THREE.Color(eyeColorHex);
  const darkLimbal = irisCol.clone().multiplyScalar(0.28);
  const innerAmber = irisCol.clone().lerp(new THREE.Color('#d8b88a'), 0.28);
  const brightEdge = irisCol.clone().lerp(new THREE.Color('#ffffff'), 0.35);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.5, 1.0); // Exact equirectangular aspect fix => 100% circular iris!

  // Soft sclera ambient gradient + tiny subtle capillaries near edges
  const scGrad = ctx.createRadialGradient(0, 0, irisR * 0.95, 0, 0, irisR * 2.5);
  scGrad.addColorStop(0, 'rgba(255,255,255,0)');
  scGrad.addColorStop(0.7, 'rgba(205,160,150,0.14)');
  scGrad.addColorStop(1, 'rgba(185,120,112,0.34)');
  ctx.fillStyle = scGrad;
  ctx.beginPath(); ctx.arc(0, 0, irisR * 2.5, 0, Math.PI * 2); ctx.fill();

  // Dark limbal ring (crisp contrast)
  ctx.fillStyle = '#' + darkLimbal.getHexString();
  ctx.beginPath(); ctx.arc(0, 0, irisR, 0, Math.PI * 2); ctx.fill();

  // Multi-zone realistic iris stroma
  const iGrad = ctx.createRadialGradient(0, irisR * 0.14, irisR * 0.22, 0, 0, irisR * 0.92);
  iGrad.addColorStop(0, '#' + innerAmber.getHexString());
  iGrad.addColorStop(0.32, '#' + brightEdge.getHexString());
  iGrad.addColorStop(0.68, '#' + irisCol.getHexString());
  iGrad.addColorStop(1, '#' + darkLimbal.getHexString());
  ctx.fillStyle = iGrad;
  ctx.beginPath(); ctx.arc(0, 0, irisR * 0.91, 0, Math.PI * 2); ctx.fill();

  // Detailed radial crypts & iris collagen fibers
  for (let a = 0; a < 72; a++) {
    ctx.save();
    ctx.rotate((a / 72) * Math.PI * 2);
    ctx.strokeStyle = a % 3 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(10,16,22,0.24)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(irisR * 0.34, 0);
    ctx.lineTo(irisR * (0.76 + (a % 4) * 0.03), 0);
    ctx.stroke();
    ctx.restore();
  }

  // Collarette ring around pupil
  ctx.strokeStyle = 'rgba(255,240,210,0.25)';
  ctx.lineWidth = 2.0;
  ctx.beginPath(); ctx.arc(0, 0, irisR * 0.48, 0, Math.PI * 2); ctx.stroke();

  // Deep velvety black pupil
  ctx.fillStyle = '#05070a';
  ctx.beginPath(); ctx.arc(0, 0, irisR * 0.38, 0, Math.PI * 2); ctx.fill();

  // Upper eyelid natural cast shadow across top of eye
  const lidSh = ctx.createLinearGradient(0, -irisR * 1.15, 0, -irisR * 0.05);
  lidSh.addColorStop(0, 'rgba(12,18,28,0.48)');
  lidSh.addColorStop(1, 'rgba(12,18,28,0)');
  ctx.fillStyle = lidSh;
  ctx.beginPath(); ctx.arc(0, 0, irisR * 1.15, 0, Math.PI * 2); ctx.fill();

  // Crisp natural sky catchlight
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.ellipse(-irisR * 0.28, -irisR * 0.28, irisR * 0.17, irisR * 0.13, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath(); ctx.arc(irisR * 0.26, irisR * 0.25, irisR * 0.075, 0, Math.PI * 2); ctx.fill();

  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// --- HIGH-RES SILKY ANISOTROPIC HAIR SHEET TEXTURE ---
function createHairStrandTexture(hairColorHex, age) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);

  const col = new THREE.Color(hairColorHex);
  if (age > 52) col.lerp(new THREE.Color('#cfd4dc'), Math.min(0.68, (age - 52) / 25));
  const dark = col.clone().multiplyScalar(0.48);
  const sheen = col.clone().lerp(new THREE.Color('#ffffff'), 0.34);

  // Full silky base with softly feathered organic bottom edge
  const baseGrad = ctx.createLinearGradient(0, 0, 0, S);
  baseGrad.addColorStop(0.00, '#' + dark.getHexString());
  baseGrad.addColorStop(0.30, '#' + sheen.getHexString());
  baseGrad.addColorStop(0.58, '#' + col.getHexString());
  baseGrad.addColorStop(0.84, '#' + dark.getHexString());
  baseGrad.addColorStop(1.00, 'rgba(0,0,0,0)');

  ctx.fillStyle = baseGrad;
  ctx.beginPath();
  ctx.moveTo(S * 0.05, 0);
  ctx.lineTo(S * 0.95, 0);
  ctx.quadraticCurveTo(S * 0.96, S * 0.65, S * 0.84, S * 0.88);
  ctx.quadraticCurveTo(S * 0.50, S * 0.96, S * 0.16, S * 0.88);
  ctx.quadraticCurveTo(S * 0.04, S * 0.65, S * 0.05, 0);
  ctx.fill();

  // 110 fine brushed hair strands with specular highlight band
  for (let i = 0; i < 110; i++) {
    const t = i / 109;
    const x = (0.06 + t * 0.88) * S;
    const tipY = S * (0.82 + Math.sin(t * Math.PI) * 0.17 - (i % 5) * 0.022);
    const g = ctx.createLinearGradient(x, 0, x, tipY);
    g.addColorStop(0, '#' + dark.getHexString());
    g.addColorStop(0.32, '#' + (i % 3 === 0 ? sheen : col).getHexString());
    g.addColorStop(0.82, '#' + col.getHexString());
    g.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.strokeStyle = g;
    ctx.lineWidth = 2.0 + (i % 3) * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + (i % 2 ? 2.5 : -2.5), tipY * 0.5, x + (0.5 - t) * 14, tipY);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- 512x512 TAILORED TACTICAL LEATHER / FABRIC TEXTURE (With Realistic Creases & Seams) ---
function createSuitTexture(baseColor, outfit) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, S, S);

  let seed = 404;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // Subtle organic leather/matte fabric tonal mottling (matches real tactical jacket!)
  for (let i = 0; i < 480; i++) {
    const x = rand() * S, y = rand() * S, r = 10 + rand() * 38;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, rand() > 0.5 ? 'rgba(255,255,255,0.042)' : 'rgba(0,0,0,0.095)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Subtle realistic garment tension creases near waist & shoulders
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 9; i++) {
    const cy = S * (0.12 + i * 0.095);
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.bezierCurveTo(S * 0.3, cy + 8, S * 0.7, cy - 8, S, cy + 3);
    ctx.stroke();
  }

  // Tailored ergonomic paneling & double-stitch seams
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.58)';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(S * 0.25, 0); ctx.lineTo(S * 0.25, S);
  ctx.moveTo(S * 0.75, 0); ctx.lineTo(S * 0.75, S);
  if (outfit === 'stealth' || outfit === 'armor') {
    ctx.moveTo(S * 0.56, S * 0.05); ctx.lineTo(S * 0.67, S * 0.90);
    ctx.moveTo(S * 0.94, S * 0.05); ctx.lineTo(S * 0.83, S * 0.90);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(S * 0.25 + 5, 0); ctx.lineTo(S * 0.25 + 5, S);
  ctx.moveTo(S * 0.75 - 5, 0); ctx.lineTo(S * 0.75 - 5, S);
  ctx.stroke();
  ctx.setLineDash([]);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// --- 96x72 TRUE REAL-HUMAN ANATOMICAL SKULL & FACE SCULPT (Exact 22.5cm Tall Human Head!) ---
function createSculptedHeadGeo(cfg) {
  const Rx = cfg.gender === 'female' ? 0.075 : 0.078;
  const Ry = 0.114; // Full height = 22.8 cm (True 7.8-head real human proportion!)
  const Rz = 0.096;

  const geo = new THREE.SphereGeometry(1.0, 96, 72);
  geo.rotateY(Math.PI / 2); // Aligns UV u = 0.5 directly to Front (-Z)
  const pos = geo.attributes.position;

  const isFemale = cfg.gender === 'female';
  const isYoung = cfg.age < 19;
  const jawTaper = isFemale ? 0.64 : (isYoung ? 0.68 : 0.77);

  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i), uy = pos.getY(i), uz = pos.getZ(i);
    let x = ux * Rx;
    let y = uy * Ry;
    let z = uz * Rz;

    // 1. REAL CRANIUM & FACE PLANES (Humans are NOT round eggs!)
    // Slightly narrower forehead temples, fuller parietal/occiput back of skull
    if (uz > 0.05 && uy > -0.25) {
      z *= 1.08;
      x *= 1.03;
    }
    if (uy > 0.25 && uz < 0.0) {
      // Subtle temple flat planes on sides of forehead
      const temple = gauss2(Math.abs(x), y, 0.068, 0.048, 0.022, 0.028);
      x -= Math.sign(x) * temple * 0.005;
    }

    // Anatomical Jawline & Gonial Angle (distinct mandible taper)
    if (y < 0) {
      const t = clamp(-y / Ry, 0, 1);
      // Taper smoothly toward chin while preserving slight jaw corner at y ~ -0.055
      let widthFactor = 1.0 - Math.pow(t, 1.32) * (1.0 - jawTaper);
      const jawCorner = gauss2(Math.abs(x), y, 0.054, -0.055, 0.022, 0.022);
      widthFactor += jawCorner * (isFemale ? 0.015 : (isYoung ? 0.025 : 0.075));
      x *= widthFactor;

      // Tuck underside of jaw cleanly back toward neck (removes round balloon chin!)
      if (z > -0.02 && y < -0.062) {
        y += smoothstep(-0.02, 0.06, z) * smoothstep(-0.062, -0.11, y) * 0.024;
      }
    }

    // 2. HIGH-PRECISION FACIAL ANATOMY SCULPTING (Front hemisphere z < -0.01)
    if (z < -0.01) {
      const fm = smoothstep(-0.01, -0.055, z);

      // Slightly flatten anterior face plane so features read like real human bone structure
      const facePlane = gauss2(x, y, 0, -0.015, 0.058, 0.075);
      z += facePlane * 0.006 * fm;

      // Deep Orbital Eye Sockets (centered at x = ±0.032, y = 0.008)
      const sockL = gauss2(x, y, -0.032, 0.008, 0.019, 0.013);
      const sockR = gauss2(x, y,  0.032, 0.008, 0.019, 0.013);
      z += (sockL + sockR) * 0.0145 * fm;

      // Supraorbital Brow Ridge + Glabella dip between brows
      const browL = gauss2(x, y, -0.031, 0.030, 0.022, 0.009);
      const browR = gauss2(x, y,  0.031, 0.030, 0.022, 0.009);
      const glabella = gauss2(x, y, 0, 0.024, 0.009, 0.010);
      z -= (browL + browR) * (isFemale ? 0.0045 : 0.0085) * fm;
      z += glabella * 0.0035 * fm;

      // Sculpted Anatomical Nose (Nasion dip -> Bony Bridge -> Tip -> Alar Wings -> Nostrils)
      const nasion = gauss2(x, y, 0, 0.012, 0.008, 0.008) * 0.0045;
      const bridge = gauss2(x, y, 0, -0.003, 0.0072, 0.018) * 0.0145;
      const tip = gauss2(x, y, 0, -0.020, 0.0092, 0.0092) * 0.0235;
      const wingL = gauss2(x, y, -0.012, -0.023, 0.0068, 0.0058) * 0.0105;
      const wingR = gauss2(x, y,  0.012, -0.023, 0.0068, 0.0058) * 0.0105;
      const nostrilL = gauss2(x, y, -0.007, -0.027, 0.004, 0.0035) * 0.0045;
      const nostrilR = gauss2(x, y,  0.007, -0.027, 0.004, 0.0035) * 0.0045;
      z += (nasion - bridge - tip - wingL - wingR + nostrilL + nostrilR) * fm;

      // Zygomatic Arch (Real Sculpted Cheekbones + Slight Hollow Below in Adults)
      const zygL = gauss2(x, y, -0.049, -0.010, 0.022, 0.016);
      const zygR = gauss2(x, y,  0.049, -0.010, 0.022, 0.016);
      z -= (zygL + zygR) * (isYoung ? 0.0075 : 0.0085) * fm;
      if (!isYoung) {
        const buccalL = gauss2(x, y, -0.044, -0.042, 0.018, 0.018);
        const buccalR = gauss2(x, y,  0.044, -0.042, 0.018, 0.018);
        z += (buccalL + buccalR) * 0.0045 * fm;
      }

      // Philtrum + Sculpted 3D Lips (Cupid's bow, lip seam, tucked corners) + Chin
      const philtrum = gauss2(x, y, 0, -0.036, 0.0055, 0.009) * 0.0035;
      const upLipL = gauss2(x, y, -0.007, -0.044, 0.014, 0.0055) * (isFemale ? 0.0095 : 0.0082);
      const upLipR = gauss2(x, y,  0.007, -0.044, 0.014, 0.0055) * (isFemale ? 0.0095 : 0.0082);
      const lowLip = gauss2(x, y, 0, -0.055, 0.018, 0.0068) * (isFemale ? 0.0115 : 0.0095);
      const lipSeam = gauss2(x, y, 0, -0.049, 0.022, 0.0024) * 0.0052;
      const cornerL = gauss2(x, y, -0.023, -0.049, 0.006, 0.006) * 0.004;
      const cornerR = gauss2(x, y,  0.023, -0.049, 0.006, 0.006) * 0.004;
      const labioDip = gauss2(x, y, 0, -0.069, 0.018, 0.0075) * 0.0065;
      const chinBoss = gauss2(x, y, 0, -0.090, 0.019, 0.016) * (isFemale ? 0.0085 : 0.0115);

      z += (philtrum - upLipL - upLipR - lowLip + lipSeam + cornerL + cornerR + labioDip - chinBoss) * fm;
    }

    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

// --- SCULPTED MULTI-PART REAL HUMAN EAR (Helix + Antihelix + Lobe + Dark Concha) ---
function createSculptedEar(side, skinMat) {
  const ear = new THREE.Group();
  const cavityMat = new THREE.MeshStandardMaterial({
    color: shadeHex(skinMat.color.getHexString(), 0.72), roughness: 0.75
  });

  // Outer curved helix rim
  const helix = new THREE.Mesh(
    new THREE.TorusGeometry(0.016, 0.0042, 8, 18, Math.PI * 1.45),
    skinMat
  );
  helix.scale.set(0.68, 1.32, 0.75);
  helix.rotation.set(0, side * 0.45, side * -0.45);
  ear.add(helix);

  // Inner ear concha backing
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), cavityMat);
  shell.scale.set(0.32, 1.25, 0.72);
  shell.position.set(side * -0.002, 0, 0.002);
  ear.add(shell);

  // Soft earlobe
  const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.0068, 8, 8), skinMat);
  lobe.scale.set(0.65, 1.15, 0.85);
  lobe.position.set(side * -0.001, -0.018, -0.002);
  ear.add(lobe);

  // Tragus nub
  const tragus = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 6, 6), skinMat);
  tragus.position.set(side * 0.002, -0.005, -0.009);
  ear.add(tragus);

  return ear;
}

// --- REALISTIC MULTI-LAYER HUMAN EYE ASSEMBLY (Iris + Wet Glossy Cornea + Almond Eyelids + Caruncle) ---
function createHumanEyeAssembly(side, eyeMat, corneaMat, skinMat, lashMat) {
  const socket = new THREE.Group();
  const R = 0.0132;

  // 1. Inner Textured Eyeball (rotates naturally for living gaze)
  const eyeGeo = new THREE.SphereGeometry(R, 24, 18);
  eyeGeo.rotateY(Math.PI / 2); // Aligns u = 0.5 directly toward -Z
  const eyeBall = new THREE.Mesh(eyeGeo, eyeMat);
  socket.add(eyeBall);

  // 2. Outer Wet Glossy Cornea Dome (Catches real specular reflections like wet human eyes!)
  const cornea = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 20, 16), corneaMat);
  socket.add(cornea);

  // 3. Inner Tear Duct (Pink Caruncle — key micro-detail of realistic human eyes!)
  const caruncle = new THREE.Mesh(
    new THREE.SphereGeometry(0.0026, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#c47272', roughness: 0.25 })
  );
  caruncle.position.set(-side * 0.0112, -0.0012, -0.0068);
  socket.add(caruncle);

  // 4. Sculpted Almond Lower Eyelid Margin
  const lowerLid = new THREE.Mesh(
    new THREE.TorusGeometry(R * 1.06, 0.0022, 8, 18, Math.PI * 0.80),
    skinMat
  );
  lowerLid.position.set(0, -0.0016, -0.0038);
  lowerLid.rotation.set(-0.26, side * 0.08, Math.PI * 1.10);
  socket.add(lowerLid);

  // 5. Crisp Curved Upper Eyelid Margin + Tapered Eyelash Line
  const upperRim = new THREE.Mesh(
    new THREE.TorusGeometry(R * 1.08, 0.0024, 8, 18, Math.PI * 0.84),
    skinMat
  );
  upperRim.position.set(0, 0.0026, -0.0036);
  upperRim.rotation.set(0.32, side * 0.08, Math.PI * 0.08);
  socket.add(upperRim);

  const lashLine = new THREE.Mesh(
    new THREE.TorusGeometry(R * 1.09, 0.0015, 6, 18, Math.PI * 0.80),
    lashMat
  );
  lashLine.position.set(0, 0.0022, -0.0046);
  lashLine.rotation.set(0.36, side * 0.08, Math.PI * 0.10);
  socket.add(lashLine);

  // 6. Blinking Upper Eyelid Shell (POSITIVE +0.52 = WIDE OPEN, NEGATIVE -0.45 = CLOSED BLINK!)
  const lid = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.07, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.48),
    skinMat
  );
  lid.rotation.x = 0.52;
  socket.add(lid);

  return { socket, eyeBall, lid };
}

// --- SMOOTH CONFORMED HAIR SHEET GEOMETRY ---
function createHairSheetGeo(w, len, outwardCurve = 0.015) {
  const geo = new THREE.PlaneGeometry(w, len, 4, 6);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = (len * 0.5 - y) / len;
    const taper = 1.0 - t * 0.22;
    const arch = Math.sin(t * Math.PI) * outwardCurve;
    const cup = -(x * x) * 1.6;
    pos.setXYZ(i, x * taper, y - len * 0.5, arch + cup);
  }
  geo.computeVertexNormals();
  return geo;
}

// --- SCULPTED REALISTIC LAYERED HAIR BUILDER (Strictly conformed to 22.8cm real human skull!) ---
function buildHair(headGroup, cfg, hairCapMat, hairStrandMat) {
  const hairPivot = new THREE.Group();
  headGroup.add(hairPivot);

  const len = cfg.hairLength;
  const style = cfg.hairStyle;
  const Rx = cfg.gender === 'female' ? 0.079 : 0.082;
  const Ry = 0.118;
  const Rz = 0.102;

  // 1. Sculpted Organic Hair Volume Shell (Deformed with subtle hair flow ridges, NOT a plain sphere!)
  const volGeo = new THREE.SphereGeometry(1.0, 36, 26, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const vPos = volGeo.attributes.position;
  for (let i = 0; i < vPos.count; i++) {
    let x = vPos.getX(i), y = vPos.getY(i), z = vPos.getZ(i);
    const ang = Math.atan2(x, z);
    const wave = 1.0 + (style === 'buzz' ? 0.01 : 0.038 * Math.sin(ang * 9 + y * 5) + 0.022 * Math.cos(ang * 15));
    const topBoost = style === 'buzz' ? 1.01 : (style === 'spiky' ? 1.09 : 1.055);
    vPos.setXYZ(i, x * Rx * wave, y * Ry * topBoost, z * Rz * wave);
  }
  volGeo.computeVertexNormals();
  const volCap = new THREE.Mesh(volGeo, hairCapMat);
  volCap.position.set(0, 0.014, 0.008);
  volCap.rotation.x = 0.36; // POSITIVE tilts hairline UP & BACK — forehead & eyes 100% open!
  volCap.castShadow = true;
  hairPivot.add(volCap);

  if (style === 'buzz') return hairPivot;

  // Back-of-head smooth under-layer so no gaps show from behind
  const backShell = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 24, 18, -Math.PI * 0.28, Math.PI * 1.56, Math.PI * 0.12, Math.PI * 0.62),
    hairCapMat
  );
  backShell.scale.set(Rx * 1.01, Ry * 1.01, Rz * 1.04);
  backShell.position.set(0, 0.010, 0.010);
  backShell.rotation.y = Math.PI * 0.5;
  backShell.rotation.x = 0.30;
  hairPivot.add(backShell);

  let seed = 521;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const fringeGeo = createHairSheetGeo(0.048, 0.052, 0.009);
  const crownGeo  = createHairSheetGeo(0.056, 0.068, 0.012);
  const sideGeo   = createHairSheetGeo(0.068, 0.128, 0.014);

  // 2. Natural Side-Parted Forehead Fringe (Matches Reference Photo #5/#6 — stops cleanly ABOVE brows!)
  const frontCount = style === 'spiky' ? 12 : 10;
  for (let i = 0; i < frontCount; i++) {
    const t = (i / (frontCount - 1)) - 0.5;
    const ang = t * 1.32;
    const m = new THREE.Mesh(fringeGeo, hairStrandMat);
    m.position.set(
      Math.sin(ang) * (Rx * 0.90),
      0.095 - Math.abs(t) * 0.018 + (rand() - 0.5) * 0.005,
      -Math.cos(ang) * (Rz * 0.92)
    );

    if (style === 'spiky') {
      m.rotation.set(0.95 + rand() * 0.3, Math.PI - ang, (rand() - 0.5) * 0.3);
      m.scale.set(0.85, 0.95 * len, 1.0);
    } else {
      // Swept cleanly to the right side above eyebrows (y stays > 0.045, brows at 0.029!)
      m.rotation.set(-0.18, Math.PI - ang, 0.48 - t * 0.32);
      const safeLen = clamp(0.75 + (len - 0.85) * 0.25, 0.62, 0.96);
      m.scale.set(0.95 + rand() * 0.22, safeLen, 1.0);
    }
    hairPivot.add(m);
  }

  // 3. Textured Layered Crown Locks (Creates rich realistic hair mass & silhouette)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + rand() * 0.18;
    const r = 0.015 + rand() * 0.055;
    const m = new THREE.Mesh(crownGeo, hairStrandMat);
    m.position.set(Math.cos(a) * r, 0.122 - r * 0.22, Math.sin(a) * r + 0.008);
    if (style === 'spiky') {
      m.rotation.set(-1.15 - rand() * 0.35, Math.atan2(Math.cos(a), Math.sin(a)), 0);
      m.scale.set(0.78, (0.75 + rand() * 0.32) * len, 1.0);
    } else {
      m.rotation.set(-0.88 - rand() * 0.22, Math.atan2(Math.cos(a), Math.sin(a)), (rand() - 0.5) * 0.28);
      m.scale.set(1.0, (0.72 + rand() * 0.24) * Math.min(1.15, len), 1.0);
    }
    hairPivot.add(m);
  }

  // 4. Layered Side & Back Hair Curtains (Smooth overlapping volume — hugs head naturally!)
  const dropMult = style === 'long' ? 2.15 : (style === 'medium' ? 1.25 : 0.66);
  const sheetCount = style === 'long' ? 20 : 16;
  for (let i = 0; i < sheetCount; i++) {
    const u = i / (sheetCount - 1);
    const a = (u - 0.5) * Math.PI * 1.46; // Left temple -> Back -> Right temple
    const m = new THREE.Mesh(sideGeo, hairStrandMat);
    const sideW = Math.abs(Math.sin(a));
    m.position.set(
      Math.sin(a) * (Rx * (style === 'long' ? 1.06 : 1.01)),
      0.072 - sideW * 0.018,
      Math.cos(a) * (Rz * 1.02) + 0.008
    );
    m.rotation.set(0.05, a, 0);
    m.scale.set(1.12, dropMult * len * (0.94 + rand() * 0.12), 1.0);
    m.castShadow = true;
    hairPivot.add(m);
  }

  // 5. Ponytail Style
  if (style === 'ponytail') {
    const tie = new THREE.Mesh(
      new THREE.TorusGeometry(0.020, 0.006, 8, 16),
      new THREE.MeshStandardMaterial({ color: cfg.accentColor, roughness: 0.35 })
    );
    tie.position.set(0, 0.045, Rz * 1.08);
    hairPivot.add(tie);

    for (let k = 0; k < 7; k++) {
      const ang = (k / 7) * Math.PI * 2;
      const tail = new THREE.Mesh(sideGeo, hairStrandMat);
      tail.position.set(Math.cos(ang) * 0.012, 0.045, Rz * 1.14 + Math.sin(ang) * 0.010);
      tail.rotation.set(0.22, ang, 0);
      tail.scale.set(0.68, 1.48 * len, 1.0);
      hairPivot.add(tail);
    }
  }

  return hairPivot;
}

// --- SCULPTED ANATOMICAL 3D BEARD BUILDER ---
function buildBeard(headGroup, cfg, hairMat) {
  if (cfg.beardSize < 2 || cfg.gender === 'female') return;
  const beardGroup = new THREE.Group();
  const s = cfg.beardSize; // 2=Short, 3=Full, 4=Long Rugged

  // Sculpted natural mustache following upper lip arch
  for (const side of [-1, 1]) {
    const st = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.020, 4, 8), hairMat);
    st.position.set(side * 0.014, -0.036, -0.088);
    st.rotation.z = side * -1.30;
    st.rotation.y = side * -0.26;
    beardGroup.add(st);
  }

  // Contoured chin & lower jaw beard
  const bLen = s === 2 ? 0.034 : (s === 3 ? 0.074 : 0.128);
  const chinBeard = new THREE.Mesh(
    createLoftedGeometry([
      { y: -bLen, rx: 0.012, rz: 0.010 },
      { y: -bLen * 0.45, rx: 0.032, rz: 0.024 },
      { y: 0.0, rx: 0.044, rz: 0.035 }
    ], 16),
    hairMat
  );
  chinBeard.position.set(0, -0.072, -0.062);
  chinBeard.castShadow = true;
  beardGroup.add(chinBeard);

  for (const side of [-1, 1]) {
    const jaw = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.010 + (s - 2) * 0.0038, 0.054, 4, 8),
      hairMat
    );
    jaw.position.set(side * 0.054, -0.060, -0.046);
    jaw.rotation.set(0.32, side * 0.44, side * 0.45);
    beardGroup.add(jaw);
  }
  headGroup.add(beardGroup);
}

// --- ANATOMICAL 2-SEGMENT 5-FINGER HUMAN HAND (Lofted Palm + Knuckles + Nails + Circuits) ---
function createAnatomicalHand(side, skinMat, glowMat, showCircuits) {
  const hand = new THREE.Group();

  // Contoured anatomical palm (tapers naturally from wrist to knuckles)
  const palmGeo = createLoftedGeometry([
    { y: -0.082, rx: 0.035, rz: 0.0125 }, // Knuckle ridge
    { y: -0.042, rx: 0.037, rz: 0.0155 }, // Mid palm + thumb pad
    { y:  0.000, rx: 0.025, rz: 0.0165 }  // Wrist base
  ], 16);
  const palm = new THREE.Mesh(palmGeo, skinMat);
  palm.castShadow = true;
  hand.add(palm);

  const nailMat = new THREE.MeshStandardMaterial({ color: '#efd6cb', roughness: 0.22, metalness: 0.05 });

  // 4 Tapered 2-Segment Relaxed Fingers (Index, Middle, Ring, Pinky)
  const specs = [
    { x: -0.024 * side, l1: 0.036, l2: 0.028, r: 0.0068 },
    { x: -0.008 * side, l1: 0.041, l2: 0.032, r: 0.0070 },
    { x:  0.008 * side, l1: 0.038, l2: 0.030, r: 0.0066 },
    { x:  0.023 * side, l1: 0.030, l2: 0.023, r: 0.0058 }
  ];
  specs.forEach((sp) => {
    const fRoot = new THREE.Group();
    fRoot.position.set(sp.x, -0.080, 0);
    fRoot.rotation.x = 0.16; // Natural slight curl

    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(sp.r * 0.86, sp.r, sp.l1, 8), skinMat);
    seg1.position.y = -sp.l1 * 0.5;
    fRoot.add(seg1);

    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(sp.r * 0.88, 7, 6), skinMat);
    knuckle.position.y = -sp.l1;
    fRoot.add(knuckle);

    const tipGroup = new THREE.Group();
    tipGroup.position.y = -sp.l1;
    tipGroup.rotation.x = 0.22; // Relaxed human finger curl
    const seg2 = new THREE.Mesh(new THREE.CapsuleGeometry(sp.r * 0.72, sp.l2, 4, 7), skinMat);
    seg2.position.y = -sp.l2 * 0.52;
    tipGroup.add(seg2);

    const nail = new THREE.Mesh(new THREE.BoxGeometry(sp.r * 1.05, sp.r * 1.4, 0.002), nailMat);
    nail.position.set(0, -sp.l2 * 0.85, sp.r * 0.65);
    tipGroup.add(nail);

    fRoot.add(tipGroup);
    hand.add(fRoot);
  });

  // Articulated Opposable Thumb
  const thumbRoot = new THREE.Group();
  thumbRoot.position.set(-side * 0.034, -0.044, -0.008);
  thumbRoot.rotation.set(0.28, side * 0.35, -side * 0.52);
  const tSeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0074, 0.038, 4, 8), skinMat);
  tSeg.position.y = -0.022;
  thumbRoot.add(tSeg);
  hand.add(thumbRoot);

  // Fine Glowing Neural Hand Circuits on Back of Hand (Reference Photo #4!)
  if (showCircuits) {
    for (let k = -1; k <= 1; k++) {
      const trace = new THREE.Mesh(new THREE.BoxGeometry(0.0020, 0.056, 0.0020), glowMat);
      trace.position.set(k * 0.011, -0.044, 0.0145);
      hand.add(trace);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.0020, 0.0020), glowMat);
    cross.position.set(0, -0.032, 0.0148);
    hand.add(cross);
  }

  return hand;
}

// --- DETAILED MULTI-PART TACTICAL BOOT (Contoured Toe, Padded Cuff, Laces & Tread Sole) ---
function createTacticalBoot(bootMat, soleMat, laceMat) {
  const boot = new THREE.Group();

  // Padded ankle collar
  const cuff = new THREE.Mesh(
    createLoftedGeometry([
      { y: -0.045, rx: 0.046, rz: 0.054 },
      { y:  0.000, rx: 0.044, rz: 0.048 },
      { y:  0.035, rx: 0.046, rz: 0.048 }
    ], 16),
    bootMat
  );
  cuff.castShadow = true;
  boot.add(cuff);

  // Sculpted foot vamp & rounded toe box
  const footBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.041, 0.125, 8, 14), bootMat);
  footBody.rotation.x = Math.PI * 0.5;
  footBody.scale.set(1.06, 1.0, 0.78);
  footBody.position.set(0, -0.056, -0.044);
  footBody.castShadow = true;
  boot.add(footBody);

  // Reinforced heel counter
  const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.055, 14), bootMat);
  heel.position.set(0, -0.052, 0.015);
  boot.add(heel);

  // Criss-cross lace bars on tongue
  for (let i = 0; i < 4; i++) {
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.0045, 0.006), laceMat);
    lace.position.set(0, -0.008 - i * 0.011, -0.044 - i * 0.009);
    lace.rotation.x = 0.45;
    boot.add(lace);
  }

  // Thick Sculpted Rubber Outsole + Heel Tread (bottom sits cleanly at y = -0.090!)
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.020, 0.215), soleMat);
  sole.position.set(0, -0.080, -0.044);
  sole.castShadow = true;
  const toeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.047, 0.022, 14), soleMat);
  toeCap.position.set(0, -0.079, -0.118);
  boot.add(sole, toeCap);

  return boot;
}

// --- MAIN 10x REAL-HUMAN PRO CHARACTER SYSTEM ---
export function createCharacterSystem(scene, initialConfig = DEFAULT_CHAR_CONFIG) {
  const root = new THREE.Group();
  scene.add(root);

  let config = { ...DEFAULT_CHAR_CONFIG, ...initialConfig };
  let parts = null;
  let ownedTextures = [];
  let blinkTimer = 2.6;
  let isBlinking = false;

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
    ownedTextures.forEach(t => { if (!t.userData?.cached) t.dispose(); });
    ownedTextures = [];
  }

  function rebuild(newCfg = {}) {
    config = { ...config, ...newCfg };
    disposeCurrent();

    const pbr = getSharedPBR();
    const isFemale = config.gender === 'female';
    const isYoung = config.age < 19;
    const heightScale = isYoung ? 0.90 + (config.age - 12) * 0.014 : (isFemale ? 0.95 : 1.02);

    // True Human Anatomical Widths
    const shoulderHalf = isFemale ? 0.178 : (isYoung ? 0.190 : 0.222);
    const waistHalf    = isFemale ? 0.120 : (isYoung ? 0.132 : 0.150);
    const hipHalf      = isFemale ? 0.164 : (isYoung ? 0.142 : 0.156);

    const { skinTex, emissiveTex } = createHeadTextures(config);
    const eyeTex = createEyeTexture(config.eyeColor);
    const hairStrandTex = createHairStrandTexture(config.hairColor, config.age);
    const suitTex = createSuitTexture(config.outfitColor, config.outfit);
    ownedTextures.push(skinTex, emissiveTex, eyeTex, hairStrandTex, suitTex);

    // REAL HUMAN PBR SKIN (MeshPhysicalMaterial: Micro-pore normal + T-zone roughness + soft SSS sheen!)
    const headMat = new THREE.MeshPhysicalMaterial({
      map: skinTex,
      normalMap: pbr.skinNormalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughnessMap: pbr.skinRoughnessMap,
      roughness: 1.0,
      metalness: 0.0,
      sheen: 0.28,
      sheenRoughness: 0.65,
      sheenColor: new THREE.Color('#ffd6c2'),
      emissive: new THREE.Color(config.circuits ? config.circuitColor : '#000000'),
      emissiveMap: emissiveTex,
      emissiveIntensity: config.circuits ? 1.85 : 0.0
    });

    const skinBodyMat = new THREE.MeshPhysicalMaterial({
      color: config.skinTone,
      normalMap: pbr.skinNormalMap,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughness: 0.56,
      metalness: 0.0,
      sheen: 0.25,
      sheenRoughness: 0.68,
      sheenColor: new THREE.Color('#ffd8c4')
    });

    // Eye Sclera/Iris + Wet Glossy Cornea Clearcoat Material
    const eyeMat = new THREE.MeshStandardMaterial({
      map: eyeTex, roughness: 0.12, metalness: 0.02
    });
    const corneaMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      roughness: 0.02,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 1.0,
      depthWrite: false
    });

    // Anisotropic-Sheen Hair Materials
    const finalHairCol = new THREE.Color(config.hairColor);
    if (config.age > 52) {
      finalHairCol.lerp(new THREE.Color('#cfd4dc'), Math.min(0.68, (config.age - 52) / 25));
    }
    const hairCapMat = new THREE.MeshPhysicalMaterial({
      color: finalHairCol,
      normalMap: pbr.hairNormalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.48,
      metalness: 0.08,
      sheen: 0.45,
      sheenRoughness: 0.35,
      sheenColor: finalHairCol.clone().lerp(new THREE.Color('#ffffff'), 0.45)
    });
    const hairStrandMat = new THREE.MeshPhysicalMaterial({
      map: hairStrandTex,
      normalMap: pbr.hairNormalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      alphaTest: 0.22,
      side: THREE.DoubleSide,
      roughness: 0.44,
      metalness: 0.08,
      sheen: 0.42,
      sheenRoughness: 0.36
    });

    // Normal-Mapped Realistic Garment Materials
    const outfitMat = new THREE.MeshPhysicalMaterial({
      map: suitTex,
      normalMap: pbr.fabricNormalMap,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: config.outfit === 'armor' ? 0.28 : (config.outfit === 'stealth' ? 0.46 : 0.68),
      metalness: config.outfit === 'armor' ? 0.72 : (config.outfit === 'stealth' ? 0.16 : 0.04),
      sheen: config.outfit === 'hoodie' || config.outfit === 'jacket' ? 0.35 : 0.12,
      sheenRoughness: 0.7
    });

    const pantsMat = new THREE.MeshStandardMaterial({
      color: shadeHex(config.outfitColor, 0.80),
      normalMap: pbr.fabricNormalMap,
      normalScale: new THREE.Vector2(0.36, 0.36),
      roughness: 0.72,
      metalness: config.outfit === 'stealth' ? 0.12 : 0.04
    });

    const bootMat = new THREE.MeshStandardMaterial({
      color: '#171a20',
      normalMap: pbr.fabricNormalMap,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.42,
      metalness: 0.18
    });
    const soleMat = new THREE.MeshStandardMaterial({ color: '#272b34', roughness: 0.82 });
    const laceMat = new THREE.MeshStandardMaterial({ color: '#383e4a', roughness: 0.75 });
    const metalZipMat = new THREE.MeshStandardMaterial({ color: '#d4dce6', roughness: 0.20, metalness: 0.92 });
    const glowMat = new THREE.MeshBasicMaterial({ color: config.accentColor });
    const lashMat = new THREE.MeshBasicMaterial({ color: '#14100e' });

    const body = new THREE.Group();
    body.scale.setScalar(heightScale);
    root.add(body);

    // --- 1. ANATOMICAL PELVIS, HIPS & GLUTES (y = 0.91) ---
    const pelvis = new THREE.Group();
    pelvis.position.y = 0.91;
    body.add(pelvis);

    const pelvisGeo = createLoftedGeometry([
      { y: -0.09, rx: hipHalf * 0.88, rz: 0.092, glute: 0.012 },
      { y: -0.02, rx: hipHalf * 1.03, rz: 0.112, glute: isFemale ? 0.032 : 0.022 },
      { y:  0.04, rx: hipHalf * 0.96, rz: 0.106, glute: 0.014 },
      { y:  0.09, rx: waistHalf * 1.02, rz: 0.098 }
    ], 28);
    const pelvisMesh = new THREE.Mesh(pelvisGeo, pantsMat);
    pelvisMesh.castShadow = true;
    pelvis.add(pelvisMesh);

    // Tactical Belt + Metallic Buckle
    const belt = new THREE.Mesh(
      createLoftedGeometry([
        { y: 0.062, rx: waistHalf * 1.04, rz: 0.102 },
        { y: 0.096, rx: waistHalf * 1.04, rz: 0.102 }
      ], 26),
      bootMat
    );
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.036, 0.014), metalZipMat);
    buckle.position.set(0, 0.079, -0.105);
    pelvis.add(belt, buckle);

    // --- 2. CONTINUOUS MUSCULAR TORSO (Ribcage + Pectorals + Clavicle + Trapezius Slope!) ---
    const torsoGroup = new THREE.Group();
    torsoGroup.position.y = 0.07;
    pelvis.add(torsoGroup);

    const chestDepth = isFemale ? 0.038 : (isYoung ? 0.016 : 0.028);
    const torsoGeo = createLoftedGeometry([
      { y: 0.000, rx: waistHalf * 1.02, rz: 0.098 },
      { y: 0.085, rx: waistHalf * 0.95, rz: 0.096, back: 0.010 }, // Natural waist taper
      { y: 0.175, rx: waistHalf * 1.12, rz: 0.108, chest: chestDepth * 0.35, sternum: 0.005, back: 0.016 },
      { y: 0.275, rx: shoulderHalf * 0.88, rz: 0.116, chest: chestDepth, sternum: 0.009, back: 0.026 }, // Pecs / Lats
      { y: 0.365, rx: shoulderHalf * 1.03, rz: 0.105, chest: chestDepth * 0.50, clav: 0.009, back: 0.022 }, // Acromion width
      { y: 0.425, rx: shoulderHalf * 0.78, rz: 0.088, clav: 0.007, back: 0.014 }, // Trapezius slope
      { y: 0.468, rx: 0.084, rz: 0.076 }, // Collar base
      { y: 0.504, rx: 0.068, rz: 0.067 }, // Tailored Mandarin stand collar
      { y: 0.514, rx: 0.060, rz: 0.060 }
    ], 32);
    const torsoMesh = new THREE.Mesh(torsoGeo, outfitMat);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    torsoGroup.add(torsoMesh);

    // Outfit-Specific Fine Craftsmanship
    if (config.outfit === 'stealth') {
      // Detailed Metallic Zipper Track + Slider + Pull Tab (exact Reference Photo #5!)
      const zFront = -0.114 - chestDepth * 0.38;
      const zipRailL = new THREE.Mesh(new THREE.BoxGeometry(0.0032, 0.43, 0.006), metalZipMat);
      zipRailL.position.set(-0.0028, 0.275, zFront); zipRailL.rotation.x = 0.035;
      const zipRailR = zipRailL.clone(); zipRailR.position.x = 0.0028;
      const zipSlider = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.014, 0.010), metalZipMat);
      zipSlider.position.set(0, 0.452, zFront + 0.006);
      const zipPull = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.024, 0.004), metalZipMat);
      zipPull.position.set(0, 0.434, zFront + 0.003); zipPull.rotation.x = -0.12;
      torsoGroup.add(zipRailL, zipRailR, zipSlider, zipPull);

      // Subtle Hair-Thin Tactical Glow Piping (matches Photos #5 & #6!)
      for (const side of [-1, 1]) {
        const collarDash = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.030, 0.004), glowMat);
        collarDash.position.set(side * 0.104, 0.422, -0.074);
        collarDash.rotation.set(0.35, 0, side * 0.65);
        torsoGroup.add(collarDash);

        const ribTrim = new THREE.Mesh(new THREE.BoxGeometry(0.0034, 0.140, 0.0034), glowMat);
        ribTrim.position.set(side * (waistHalf * 0.80), 0.185, -0.104);
        ribTrim.rotation.z = side * -0.24;
        torsoGroup.add(ribTrim);
      }
    } else if (config.outfit === 'jacket') {
      const teeMat = new THREE.MeshStandardMaterial({ color: '#dde2e8', roughness: 0.85 });
      const tee = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.40, 0.04), teeMat);
      tee.position.set(0, 0.26, -0.095 - chestDepth * 0.42);
      const zipL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.40, 0.012), metalZipMat);
      zipL.position.set(-0.052, 0.26, -0.112 - chestDepth * 0.42);
      const zipR = zipL.clone(); zipR.position.x = 0.052;
      torsoGroup.add(tee, zipL, zipR);
    } else if (config.outfit === 'armor') {
      const plateMat = new THREE.MeshStandardMaterial({ color: '#dce3ec', roughness: 0.22, metalness: 0.82 });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(shoulderHalf * 1.38, 0.20, 0.044), plateMat);
      plate.position.set(0, 0.31, -0.108 - chestDepth * 0.38);
      plate.castShadow = true;
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.020, 0), glowMat);
      core.position.set(0, 0.32, -0.134 - chestDepth * 0.38);
      torsoGroup.add(plate, core);
    } else if (config.outfit === 'hoodie') {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.032, 12, 22), outfitMat);
      hood.position.set(0, 0.46, 0.048); hood.rotation.x = 0.72;
      const drawL = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.15, 6), metalZipMat);
      drawL.position.set(-0.032, 0.38, -0.112 - chestDepth * 0.42);
      const drawR = drawL.clone(); drawR.position.x = 0.032;
      torsoGroup.add(hood, drawL, drawR);
    }

    // --- 3. ANATOMICAL NECK (With Sternocleidomastoid V-Tendons & Glowing Neck Circuits) ---
    const neckGroup = new THREE.Group();
    neckGroup.position.y = 0.490;
    torsoGroup.add(neckGroup);

    const neckR = isFemale ? 0.047 : 0.054;
    const neckGeo = createLoftedGeometry([
      { y: 0.000, rx: neckR * 1.12, rz: neckR * 1.12 },
      { y: 0.045, rx: neckR * 0.96, rz: neckR * 1.02, clav: 0.003 },
      { y: 0.095, rx: neckR * 0.98, rz: neckR * 1.04 }
    ], 20);
    const neckMesh = new THREE.Mesh(neckGeo, skinBodyMat);
    neckGroup.add(neckMesh);

    if (config.circuits) {
      for (const side of [-1, 1]) {
        const nLine1 = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.068, 0.0022), glowMat);
        nLine1.position.set(side * (neckR * 0.94), 0.042, -0.016);
        nLine1.rotation.z = side * 0.12;
        const nLine2 = new THREE.Mesh(new THREE.BoxGeometry(0.0018, 0.052, 0.0018), glowMat);
        nLine2.position.set(side * (neckR * 0.72), 0.038, -0.034);
        nLine2.rotation.z = side * -0.14;
        neckGroup.add(nLine1, nLine2);
      }
    }

    // --- 4. 96x72 REAL HUMAN HEAD + WET-CORNEA ALMOND EYES + SCULPTED EARS + LAYERED HAIR ---
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.182; // Head center at ~1.65m (Exact 8-head proportion!)
    neckGroup.add(headGroup);

    const headMesh = new THREE.Mesh(createSculptedHeadGeo(config), headMat);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    headGroup.add(headMesh);

    // Sculpted Multi-Part 3D Ears (aligned cleanly at temple sides)
    const earX = isFemale ? 0.075 : 0.078;
    for (const side of [-1, 1]) {
      const ear = createSculptedEar(side, skinBodyMat);
      ear.position.set(side * earX, -0.006, 0.004);
      headGroup.add(ear);
    }

    // Multi-Layer Photorealistic Eyes (Nestled neatly in sculpted orbital sockets!)
    const eyeballs = [];
    const eyelids = [];
    for (const side of [-1, 1]) {
      const eye = createHumanEyeAssembly(side, eyeMat, corneaMat, skinBodyMat, lashMat);
      eye.socket.position.set(side * 0.032, 0.008, -0.0755);
      eyeballs.push(eye.eyeBall);
      eyelids.push(eye.lid);
      headGroup.add(eye.socket);
    }

    const hairPivot = buildHair(headGroup, config, hairCapMat, hairStrandMat);
    buildBeard(headGroup, config, hairCapMat);

    // --- 5. ANATOMICAL ARMS (Blended Deltoid -> Bicep/Tricep -> Tapered Forearm -> 5-Finger Hand) ---
    function createArm(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * (shoulderHalf - 0.008), 0.368, 0);

      // Teardrop anatomical deltoid blended cleanly into torso shoulder cap
      const deltoid = new THREE.Mesh(
        createLoftedGeometry([
          { y: -0.090, rx: 0.044, rz: 0.045 },
          { y: -0.035, rx: 0.050, rz: 0.050 },
          { y:  0.015, rx: 0.046, rz: 0.045 },
          { y:  0.046, rx: 0.022, rz: 0.022 }
        ], 16),
        outfitMat
      );
      deltoid.castShadow = true;
      shoulder.add(deltoid);

      const upperArmGeo = createLoftedGeometry([
        { y: -0.275, rx: 0.036, rz: 0.038 }, // Above elbow
        { y: -0.175, rx: 0.044, rz: 0.048, chest: 0.005, back: 0.005 }, // Bicep / Tricep curve
        { y: -0.070, rx: 0.048, rz: 0.048 },
        { y:  0.000, rx: 0.046, rz: 0.045 }
      ], 18);
      const upperArm = new THREE.Mesh(upperArmGeo, outfitMat);
      upperArm.castShadow = true;
      shoulder.add(upperArm);

      if (config.outfit === 'stealth') {
        const sleeveAccent = new THREE.Mesh(new THREE.BoxGeometry(0.0032, 0.105, 0.0032), glowMat);
        sleeveAccent.position.set(side * 0.046, -0.145, 0.004);
        shoulder.add(sleeveAccent);
      }

      const elbow = new THREE.Group();
      elbow.position.y = -0.275;
      shoulder.add(elbow);

      const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), outfitMat);
      elbow.add(elbowCap);

      // Sculpted Forearm (Brachioradialis fullness tapering cleanly to oval wrist!)
      const foreArmGeo = createLoftedGeometry([
        { y: -0.255, rx: 0.025, rz: 0.021 }, // Oval human wrist
        { y: -0.165, rx: 0.032, rz: 0.030 },
        { y: -0.065, rx: 0.040, rz: 0.038 }, // Upper forearm muscle
        { y:  0.000, rx: 0.036, rz: 0.036 }
      ], 18);
      const foreArm = new THREE.Mesh(foreArmGeo, outfitMat);
      foreArm.castShadow = true;
      elbow.add(foreArm);

      // Sleeve cuff trim at wrist
      const cuff = new THREE.Mesh(
        new THREE.TorusGeometry(0.027, 0.004, 6, 16),
        bootMat
      );
      cuff.rotation.x = Math.PI * 0.5;
      cuff.position.y = -0.252;
      elbow.add(cuff);

      const hand = createAnatomicalHand(side, skinBodyMat, glowMat, config.circuits);
      hand.position.y = -0.255;
      elbow.add(hand);

      torsoGroup.add(shoulder);
      return { shoulder, elbow };
    }

    const leftArm = createArm(-1);
    const rightArm = createArm(1);

    // --- 6. MUSCULAR LEGS (Quad/Hamstring -> Knee -> Calf/Achilles -> Multi-Part Tactical Boot) ---
    function createLeg(side) {
      const hip = new THREE.Group();
      hip.position.set(side * (hipHalf * 0.56), -0.03, 0);

      const thighGeo = createLoftedGeometry([
        { y: -0.41, rx: 0.050, rz: 0.054 }, // Above knee
        { y: -0.28, rx: 0.065, rz: 0.072, chest: 0.007 }, // Quadriceps sweep
        { y: -0.13, rx: 0.076, rz: 0.082, back: 0.008 }, // Upper thigh / hamstring
        { y:  0.00, rx: 0.074, rz: 0.078 }
      ], 20);
      const thigh = new THREE.Mesh(thighGeo, pantsMat);
      thigh.castShadow = true;
      hip.add(thigh);

      // Tactical Cargo Pocket on Outer Thigh (Jacket / Stealth detail like Free Fire!)
      if (config.outfit === 'jacket' || config.outfit === 'stealth') {
        const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.11, 0.088), pantsMat);
        pocket.position.set(side * 0.066, -0.21, 0.005);
        pocket.castShadow = true;
        hip.add(pocket);
      }

      const knee = new THREE.Group();
      knee.position.y = -0.41;
      hip.add(knee);

      // Subtle kneecap / tactical knee pad contour
      const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.049, 12, 10), pantsMat);
      knee.add(kneeCap);
      if (config.outfit === 'stealth' || config.outfit === 'armor') {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.075, 0.024), bootMat);
        pad.position.set(0, 0, -0.046);
        knee.add(pad);
      }

      // Sculpted Lower Leg (Gastrocnemius calf muscle tapering down to Achilles ankle!)
      const shinGeo = createLoftedGeometry([
        { y: -0.38, rx: 0.036, rz: 0.040 }, // Ankle joint (y = 0.09 above ground)
        { y: -0.24, rx: 0.045, rz: 0.052, back: 0.008 },
        { y: -0.12, rx: 0.054, rz: 0.062, back: 0.018 }, // Calf muscle peak
        { y:  0.00, rx: 0.050, rz: 0.052 }
      ], 20);
      const shin = new THREE.Mesh(shinGeo, pantsMat);
      shin.castShadow = true;
      knee.add(shin);

      const ankle = new THREE.Group();
      ankle.position.y = -0.38; // Bottom of boot sits at -0.09 => total height to ground = 0.91 - 0.03 - 0.41 - 0.38 - 0.09 = 0.00!
      const boot = createTacticalBoot(bootMat, soleMat, laceMat);
      ankle.add(boot);
      knee.add(ankle);

      pelvis.add(hip);
      return { hip, knee, ankle };
    }

    const leftLeg = createLeg(-1);
    const rightLeg = createLeg(1);

    parts = {
      body, pelvis, torsoGroup, headGroup, hairPivot,
      eyeballs, eyelids, leftArm, rightArm, leftLeg, rightLeg, heightScale
    };
  }

  // --- REALISTIC HUMAN LOCOMOTION + MICRO-LIFE + SECONDARY PHYSICS ---
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

    // 1. Natural Eye Blinking (+0.52 = Wide Open, -0.45 = Closed!)
    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      isBlinking = !isBlinking;
      blinkTimer = isBlinking ? 0.11 : (2.6 + Math.random() * 3.2);
    }
    const lidTarget = isBlinking ? -0.45 : 0.52;
    parts.eyelids.forEach(lid => {
      lid.rotation.x += (lidTarget - lid.rotation.x) * Math.min(1, dt * 32);
    });

    // Subtle organic eye glances (saccades)
    const lookX = studioOpen ? Math.sin(elapsed * 0.5) * 0.055 : Math.sin(elapsed * 0.38) * 0.085;
    const lookY = studioOpen ? Math.sin(elapsed * 0.32) * 0.03 : 0;
    parts.eyeballs.forEach(eb => {
      eb.rotation.y = lookX;
      eb.rotation.x = lookY;
    });

    // 2. Hair Secondary Spring-Damper Physics
    const targetHairPitch = clamp(-velY * 0.014 + (isMoving ? (isSprinting ? 0.065 : 0.028) : 0), -0.09, 0.11);
    const targetHairRoll = clamp(turnDelta * 1.8, -0.09, 0.09);
    const kStiff = 54, kDamp = 8.2;
    hairSpring.pitchVel += ((targetHairPitch - hairSpring.pitch) * kStiff - hairSpring.pitchVel * kDamp) * dt;
    hairSpring.pitch += hairSpring.pitchVel * dt;
    hairSpring.rollVel += ((targetHairRoll - hairSpring.roll) * kStiff - hairSpring.rollVel * kDamp) * dt;
    hairSpring.roll += hairSpring.rollVel * dt;
    parts.hairPivot.rotation.x = hairSpring.pitch + Math.sin(elapsed * 2.3) * 0.005;
    parts.hairPivot.rotation.z = hairSpring.roll;

    // 3. Turn-Lean Physics & Natural Thoracic Breathing
    const desiredLean = isMoving ? clamp(turnDelta * 2.8, -0.13, 0.13) : 0;
    currentLeanZ += (desiredLean - currentLeanZ) * Math.min(1, dt * 8);
    parts.torsoGroup.rotation.z = currentLeanZ;

    const breath = Math.sin(elapsed * 2.0);
    parts.torsoGroup.scale.set(1.0 + breath * 0.007, 1.0, 1.0 + breath * 0.013);

    // 4. Full Articulated Gait, Foot-Roll & Heroic Idle Stance
    if (!onGround) {
      parts.leftLeg.hip.rotation.x = 0.42;
      parts.leftLeg.knee.rotation.x = -0.68;
      parts.leftLeg.ankle.rotation.x = 0.25;
      parts.rightLeg.hip.rotation.x = -0.22;
      parts.rightLeg.knee.rotation.x = -0.35;
      parts.rightLeg.ankle.rotation.x = 0.15;
      parts.leftArm.shoulder.rotation.x = -0.50;
      parts.leftArm.shoulder.rotation.z = -0.15;
      parts.rightArm.shoulder.rotation.x = 0.34;
      parts.rightArm.shoulder.rotation.z = 0.15;
      return;
    }

    if (isMoving) {
      const amp = isSprinting ? 0.78 : 0.46;
      const s = Math.sin(animTime);
      const c = Math.cos(animTime);

      parts.leftLeg.hip.rotation.x = s * amp;
      parts.rightLeg.hip.rotation.x = -s * amp;
      parts.leftLeg.hip.rotation.z = 0;
      parts.rightLeg.hip.rotation.z = 0;
      parts.leftLeg.knee.rotation.x = Math.min(0, -c * amp * 0.88 - 0.10);
      parts.rightLeg.knee.rotation.x = Math.min(0, c * amp * 0.88 - 0.10);
      parts.leftLeg.ankle.rotation.x = c * 0.22;
      parts.rightLeg.ankle.rotation.x = -c * 0.22;

      parts.leftArm.shoulder.rotation.x = -s * amp * 0.80;
      parts.rightArm.shoulder.rotation.x = s * amp * 0.80;
      parts.leftArm.shoulder.rotation.z = -0.05;
      parts.rightArm.shoulder.rotation.z = 0.05;
      parts.leftArm.elbow.rotation.x = 0.30 + Math.max(0, -s * 0.54);
      parts.rightArm.elbow.rotation.x = 0.30 + Math.max(0, s * 0.54);

      parts.torsoGroup.rotation.x = isSprinting ? 0.14 : 0.045;
      parts.torsoGroup.rotation.y = s * (isSprinting ? 0.11 : 0.055);
      parts.pelvis.rotation.y = -s * 0.06;
      parts.pelvis.position.y = 0.91 + Math.abs(Math.sin(animTime)) * (isSprinting ? 0.046 : 0.020);
      parts.headGroup.rotation.y = -s * 0.05;
    } else {
      // Natural Asymmetric Contraposto Idle Stance (Real Human Weight Balance!)
      const sway = Math.sin(elapsed * 0.9) * 0.012;
      parts.leftLeg.hip.rotation.x *= 0.84;
      parts.rightLeg.hip.rotation.x *= 0.84;
      parts.leftLeg.hip.rotation.z = -0.042;
      parts.rightLeg.hip.rotation.z = 0.042;
      parts.leftLeg.knee.rotation.x *= 0.84;
      parts.rightLeg.knee.rotation.x *= 0.84;
      parts.leftLeg.ankle.rotation.x *= 0.84;
      parts.rightLeg.ankle.rotation.x *= 0.84;

      parts.leftArm.shoulder.rotation.x *= 0.84;
      parts.rightArm.shoulder.rotation.x *= 0.84;
      parts.leftArm.shoulder.rotation.z = -0.075 - breath * 0.01;
      parts.rightArm.shoulder.rotation.z = 0.075 + breath * 0.01;
      parts.leftArm.elbow.rotation.x = 0.18;
      parts.rightArm.elbow.rotation.x = 0.18;

      parts.torsoGroup.rotation.x = breath * 0.012;
      parts.torsoGroup.rotation.y = sway;
      parts.pelvis.rotation.y *= 0.86;
      parts.pelvis.position.y = 0.91 + breath * 0.006;
      parts.headGroup.rotation.y = studioOpen
        ? Math.sin(elapsed * 0.6) * 0.055
        : Math.sin(elapsed * 0.65) * 0.085;
      parts.headGroup.rotation.x = breath * 0.012;
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
