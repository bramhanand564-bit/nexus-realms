import * as THREE from 'three';

// Heightmap array se real 3D Normal Map generate karta hai (Sobel/Finite Difference)
function heightToNormalTex(heights, size, strength = 2.5, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  const at = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const dz = 1.0;
      const invLen = 1.0 / Math.hypot(dx, dy, dz);

      const idx = (y * size + x) * 4;
      d[idx] = ((-dx * invLen) * 0.5 + 0.5) * 255;
      d[idx + 1] = ((-dy * invLen) * 0.5 + 0.5) * 255;
      d[idx + 2] = ((dz * invLen) * 0.5 + 0.5) * 255;
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.userData.shared = true;
  return tex;
}

function makeTex(size, drawFn, repeat = 1, isColor = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawFn(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (isColor) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.userData.shared = true;
  return t;
}

// Fast deterministic value noise for seamless organic materials
function createNoiseGrid(gridSize, seed = 1) {
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const g = new Float32Array(gridSize * gridSize);
  for (let i = 0; i < g.length; i++) g[i] = rand();

  return (u, v) => {
    const x = ((u % 1) + 1) % 1 * gridSize;
    const y = ((v % 1) + 1) % 1 * gridSize;
    const x0 = Math.floor(x) % gridSize, y0 = Math.floor(y) % gridSize;
    const x1 = (x0 + 1) % gridSize, y1 = (y0 + 1) % gridSize;
    const fx = x - Math.floor(x), fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = g[y0 * gridSize + x0], b = g[y0 * gridSize + x1];
    const c = g[y1 * gridSize + x0], d = g[y1 * gridSize + x1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

export function createMaterialLibrary() {
  const S = 256;
  const nLow = createNoiseGrid(16, 11);
  const nMid = createNoiseGrid(32, 37);
  const nHigh = createNoiseGrid(64, 91);

  // 1. ARCHITECTURAL STONE TILES (Albedo + 3D Normal + Roughness)
  const stoneH = new Float32Array(S * S);
  const stoneMap = makeTex(S, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / s, v = y / s;
        const grain = nLow(u, v) * 0.5 + nMid(u, v) * 0.3 + nHigh(u, v) * 0.2;
        const tileX = (x % 128), tileY = (y % 128);
        const offsetX = (y >= 128 ? (x + 64) % 128 : tileX);
        const isGrout = offsetX < 4 || tileY < 4;
        const bevel = (!isGrout && (offsetX < 8 || offsetX > 124 || tileY < 8 || tileY > 124)) ? 0.85 : 1.0;

        const h = isGrout ? 0.15 : (0.55 + grain * 0.45) * bevel;
        stoneH[y * s + x] = h;

        const shade = isGrout ? 135 : 204 + (grain - 0.5) * 34;
        const idx = (y * s + x) * 4;
        img.data[idx] = shade * 1.01;
        img.data[idx + 1] = shade * 0.99;
        img.data[idx + 2] = shade * 0.94;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, 16, true);
  const stoneNormal = heightToNormalTex(stoneH, S, 3.2, 16);

  const stoneMat = new THREE.MeshStandardMaterial({
    map: stoneMap,
    normalMap: stoneNormal,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.72,
    metalness: 0.05
  });
  stoneMat.userData.shared = true;

  // 2. BRUSHED ARCHITECTURAL METAL (Portal Frames & Sci-Fi Trim)
  const metalH = new Float32Array(S * S);
  const metalMap = makeTex(S, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const streak = nMid(x / s * 0.2, y / s * 4.0) * 0.6 + nHigh(x / s * 0.5, y / s * 8.0) * 0.4;
        const seam = (y % 64 < 2) ? 0.25 : 1.0;
        metalH[y * s + x] = streak * seam;
        const base = (118 + streak * 32) * (seam < 1 ? 0.65 : 1.0);
        const idx = (y * s + x) * 4;
        img.data[idx] = base * 0.95;
        img.data[idx + 1] = base * 0.99;
        img.data[idx + 2] = base * 1.06;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, 2, true);
  const metalNormal = heightToNormalTex(metalH, S, 1.8, 2);

  const metalMat = new THREE.MeshStandardMaterial({
    map: metalMap,
    normalMap: metalNormal,
    roughness: 0.28,
    metalness: 0.82
  });
  metalMat.userData.shared = true;

  // 3. FOREST GROUND (Rich Grass + Soil Micro-Detail + 3D Normal)
  const grassH = new Float32Array(S * S);
  const grassMap = makeTex(S, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / s, v = y / s;
        const n = nLow(u, v) * 0.45 + nMid(u, v) * 0.35 + nHigh(u, v) * 0.2;
        grassH[y * s + x] = n;
        const idx = (y * s + x) * 4;
        img.data[idx] = 155 + n * 65;
        img.data[idx + 1] = 175 + n * 60;
        img.data[idx + 2] = 135 + n * 45;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, 28, true);
  const grassNormal = heightToNormalTex(grassH, S, 3.0, 28);

  const forestGroundMat = new THREE.MeshStandardMaterial({
    map: grassMap,
    normalMap: grassNormal,
    normalScale: new THREE.Vector2(1.2, 1.2),
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.0
  });
  forestGroundMat.userData.shared = true;

  // 4. DEEP GROOVED TREE BARK
  const barkH = new Float32Array(S * S);
  const barkMap = makeTex(S, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / s, v = y / s;
        const ridge = Math.sin(u * Math.PI * 16 + nLow(u, v) * 4.5) * 0.5 + 0.5;
        const h = ridge * 0.65 + nHigh(u * 2, v * 0.5) * 0.35;
        barkH[y * s + x] = h;
        const idx = (y * s + x) * 4;
        img.data[idx] = 62 + h * 46;
        img.data[idx + 1] = 47 + h * 34;
        img.data[idx + 2] = 35 + h * 24;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, 2, true);
  const barkNormal = heightToNormalTex(barkH, S, 4.0, 2);

  const barkMat = new THREE.MeshStandardMaterial({
    map: barkMap,
    normalMap: barkNormal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.94
  });
  barkMat.userData.shared = true;

  // 5. ANIMATED REALISTIC WATER NORMAL MAP
  const waterH = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const w1 = Math.sin((u * 4 + v * 2) * Math.PI * 2) * 0.25;
      const w2 = Math.cos((u * 3 - v * 5) * Math.PI * 2) * 0.2;
      waterH[y * S + x] = 0.5 + w1 + w2 + nMid(u, v) * 0.45;
    }
  }
  const waterNormal = heightToNormalTex(waterH, S, 2.2, 14);

  function createWaterMaterial(colorHex = 0x1e5c70, opacity = 0.88, repeat = 14) {
    const nMap = waterNormal.clone();
    nMap.needsUpdate = true;
    nMap.repeat.set(repeat, repeat);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      normalMap: nMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.08,
      metalness: 0.35,
      transparent: opacity < 1,
      opacity
    });
    mat.userData.waterNormal = nMap;
    return mat;
  }

  // 6. HIGH-RES VEINED LEAF BRANCH ALPHA TEXTURE (For GPU Instanced Foliage)
  const leafTex = makeTex(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    // Central twig
    ctx.strokeStyle = '#3f3222';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.95);
    ctx.quadraticCurveTo(s * 0.48, s * 0.5, s * 0.5, s * 0.08);
    ctx.stroke();

    // Draw detailed overlapping veined leaves along twig
    const drawLeaf = (cx, cy, ang, len, wid, hueShift) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);

      const grad = ctx.createLinearGradient(0, 0, 0, -len);
      grad.addColorStop(0, `rgb(${48 + hueShift}, ${88 + hueShift}, 36)`);
      grad.addColorStop(0.65, `rgb(${68 + hueShift}, ${118 + hueShift}, 46)`);
      grad.addColorStop(1, `rgb(${102 + hueShift}, ${148 + hueShift}, 58)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-wid, -len * 0.32, -wid * 0.78, -len * 0.78, 0, -len);
      ctx.bezierCurveTo(wid * 0.78, -len * 0.78, wid, -len * 0.32, 0, 0);
      ctx.fill();

      // Fine leaf center vein & side veins
      ctx.strokeStyle = 'rgba(165, 205, 95, 0.55)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(0, -len * 0.88);
      for (let v = 0.25; v <= 0.75; v += 0.25) {
        ctx.moveTo(0, -len * v);
        ctx.lineTo(-wid * 0.55, -len * (v + 0.14));
        ctx.moveTo(0, -len * v);
        ctx.lineTo(wid * 0.55, -len * (v + 0.14));
      }
      ctx.stroke();
      ctx.restore();
    };

    const placements = [
      [0.50, 0.82, -0.85, 62, 24, -6], [0.50, 0.80, 0.82, 62, 24, 4],
      [0.49, 0.64, -0.72, 70, 26, 2],  [0.51, 0.62, 0.75, 68, 25, -4],
      [0.49, 0.45, -0.60, 66, 25, 8],  [0.51, 0.43, 0.58, 64, 24, 0],
      [0.50, 0.28, -0.45, 56, 21, 10], [0.50, 0.26, 0.46, 55, 21, 5],
      [0.50, 0.18, 0.0, 52, 20, 14]
    ];
    placements.forEach(p => drawLeaf(p[0] * s, p[1] * s, p[2], p[3], p[4], p[5]));
  }, 1, true);
  leafTex.wrapS = leafTex.wrapT = THREE.ClampToEdgeWrapping;

  return {
    stoneMat,
    metalMat,
    forestGroundMat,
    barkMat,
    leafTex,
    createWaterMaterial
  };
}

// --- REALISTIC SKY DOME WITH ANIMATED CLOUDS & CRISP SUN ---
export function createSkyDome(topColor, horizonColor, sunDir, windUniforms) {
  const geo = new THREE.SphereGeometry(460, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(topColor) },
      horizonColor: { value: new THREE.Color(horizonColor) },
      sunDir: { value: sunDir.clone().normalize() },
      uTime: windUniforms.uTime
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
      uniform float uTime;
      varying vec3 vPos;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.05; a *= 0.5; }
        return v;
      }

      void main() {
        vec3 dir = normalize(vPos);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.52));

        // Soft drifting clouds above horizon
        if (dir.y > 0.04) {
          vec2 uv = dir.xz / (dir.y + 0.18) * 1.45 + vec2(uTime * 0.012, uTime * 0.005);
          float c = fbm(uv);
          float cloudMask = smoothstep(0.48, 0.78, c) * smoothstep(0.04, 0.24, dir.y);
          vec3 cloudCol = mix(vec3(0.95, 0.96, 0.98), vec3(1.0, 0.94, 0.85), max(dot(dir, sunDir), 0.0));
          col = mix(col, cloudCol, cloudMask * 0.72);
        }

        // Realistic compact solar disc + warm atmospheric halo
        float sunDot = max(dot(dir, sunDir), 0.0);
        col += vec3(1.0, 0.93, 0.80) * pow(sunDot, 16.0) * 0.26;
        col += vec3(1.0, 0.97, 0.90) * smoothstep(0.9985, 0.9994, sunDot) * 2.2;

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  return new THREE.Mesh(geo, mat);
}

// --- 360° PROCEDURAL ENVIRONMENT REFLECTION MAP (Fixes Black Metals!) ---
export function applySkyEnvironment(renderer, scene, topColor, horizonColor, groundColor) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(40, 16, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topCol: { value: new THREE.Color(topColor) },
      horCol: { value: new THREE.Color(horizonColor) },
      gndCol: { value: new THREE.Color(groundColor) }
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 topCol; uniform vec3 horCol; uniform vec3 gndCol;
      varying vec3 vP;
      void main() {
        vec3 c = vP.y >= 0.0
          ? mix(horCol, topCol, pow(vP.y, 0.6))
          : mix(horCol, gndCol, pow(-vP.y, 0.45));
        gl_FragColor = vec4(c, 1.0);
      }
    `
  });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));
  const envRT = pmrem.fromScene(envScene, 0.04);
  if (scene.environment) scene.environment.dispose();
  scene.environment = envRT.texture;
  skyGeo.dispose();
  skyMat.dispose();
  pmrem.dispose();
}
