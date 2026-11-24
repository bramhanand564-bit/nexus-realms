import * as THREE from 'three';

// Inject GPU Wind Sway into any InstancedMesh StandardMaterial
function addWindShader(mat, windUniforms, strength = 0.22, speed = 2.0) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = `uniform float uTime;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 instWorld = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 instWorld = vec3(0.0);
      #endif
      float windMask = clamp(uv.y, 0.0, 1.0);
      float gust = sin(uTime * ${speed.toFixed(2)} + instWorld.x * 0.35 + instWorld.z * 0.35);
      float flutter = cos(uTime * ${(speed * 2.1).toFixed(2)} + instWorld.x * 1.1 + position.x * 3.0) * 0.35;
      transformed.x += (gust + flutter) * ${strength.toFixed(3)} * windMask;
      transformed.z += (gust * 0.6) * ${strength.toFixed(3)} * windMask;
      `
    );
  };
  return mat;
}

// Builds curved crossed leaf-cards geometry so foliage looks dense from every angle
function createLeafClusterGeometry() {
  const g1 = new THREE.PlaneGeometry(1.55, 1.55, 2, 2);
  const pos1 = g1.attributes.position;
  for (let i = 0; i < pos1.count; i++) {
    const x = pos1.getX(i), y = pos1.getY(i);
    pos1.setZ(i, -0.22 * (x * x + y * y)); // Natural curved leaf arch
  }
  g1.computeVertexNormals();

  // Merge 2 crossed planes into 1 crisp cluster
  const g2 = g1.clone();
  g2.rotateY(Math.PI * 0.5);
  g2.rotateX(0.28);

  const merged = new THREE.BufferGeometry();
  const p1 = g1.attributes.position.array, p2 = g2.attributes.position.array;
  const n1 = g1.attributes.normal.array, n2 = g2.attributes.normal.array;
  const u1 = g1.attributes.uv.array, u2 = g2.attributes.uv.array;
  const i1 = g1.index.array, i2 = g2.index.array;

  const pos = new Float32Array(p1.length + p2.length);
  pos.set(p1, 0); pos.set(p2, p1.length);
  const norm = new Float32Array(n1.length + n2.length);
  norm.set(n1, 0); norm.set(n2, n1.length);
  const uv = new Float32Array(u1.length + u2.length);
  uv.set(u1, 0); uv.set(u2, u1.length);

  const vertOffset = p1.length / 3;
  const idx = new Uint16Array(i1.length + i2.length);
  idx.set(i1, 0);
  for (let k = 0; k < i2.length; k++) idx[i1.length + k] = i2[k] + vertOffset;

  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setIndex(new THREE.BufferAttribute(idx, 1));
  g1.dispose(); g2.dispose();
  return merged;
}

/**
 * Generates realistic branching trees + single-draw-call GPU instanced swaying leaves
 */
export function buildRealisticTrees(group, treeList, materials, windUniforms) {
  const trunkMat = materials.barkMat;
  const leafGeo = createLeafClusterGeometry();
  const leafMat = addWindShader(
    new THREE.MeshStandardMaterial({
      map: materials.leafTex,
      alphaTest: 0.36,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.02
    }),
    windUniforms,
    0.24,
    2.1
  );

  // Store all leaf transforms so we render EVERY leaf in the entire world in 1 InstancedMesh!
  const leafMatrices = [];
  const leafColors = [];
  const dummy = new THREE.Object3D();
  const baseCol = new THREE.Color();

  let seed = 109;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  treeList.forEach(({ x, y, z, scale = 1.0, lush = 1.0 }) => {
    const tGroup = new THREE.Group();
    tGroup.position.set(x, y - 0.15, z);

    // Organic tapered trunk
    const trunkH = (3.4 + rand() * 1.4) * scale;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18 * scale, 0.38 * scale, trunkH, 7),
      trunkMat
    );
    trunk.position.y = trunkH * 0.5;
    trunk.rotation.set((rand() - 0.5) * 0.08, rand() * 3, (rand() - 0.5) * 0.08);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tGroup.add(trunk);

    // 4-5 Natural Spreading Branches
    const branchCount = 4 + Math.floor(rand() * 2);
    for (let b = 0; b < branchCount; b++) {
      const ang = (b / branchCount) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      const bLen = (1.6 + rand() * 1.1) * scale;
      const startY = trunkH * (0.58 + rand() * 0.35);
      const tilt = 0.55 + rand() * 0.38;

      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * scale, 0.14 * scale, bLen, 5),
        trunkMat
      );
      const bx = Math.cos(ang) * (bLen * 0.42) * Math.sin(tilt);
      const bz = Math.sin(ang) * (bLen * 0.42) * Math.sin(tilt);
      const by = startY + (bLen * 0.45) * Math.cos(tilt);

      branch.position.set(bx, by, bz);
      branch.rotation.order = 'YXZ';
      branch.rotation.y = -ang + Math.PI / 2;
      branch.rotation.x = tilt;
      branch.castShadow = true;
      tGroup.add(branch);

      // Tip of branch = dense cluster of swaying leaf cards
      const tipX = x + Math.cos(ang) * bLen * Math.sin(tilt);
      const tipY = y + startY + bLen * Math.cos(tilt);
      const tipZ = z + Math.sin(ang) * bLen * Math.sin(tilt);

      const clusterPerBranch = Math.round((6 + rand() * 4) * lush);
      for (let c = 0; c < clusterPerBranch; c++) {
        dummy.position.set(
          tipX + (rand() - 0.5) * 2.1 * scale,
          tipY + (rand() - 0.35) * 1.5 * scale,
          tipZ + (rand() - 0.5) * 2.1 * scale
        );
        dummy.rotation.set(
          (rand() - 0.5) * 0.9,
          rand() * Math.PI * 2,
          (rand() - 0.5) * 0.9
        );
        const ls = (0.75 + rand() * 0.65) * scale;
        dummy.scale.set(ls, ls, ls);
        dummy.updateMatrix();
        leafMatrices.push(dummy.matrix.clone());

        // Sunlit canopy color variation (darker inside, golden-green top)
        baseCol.setHSL(0.24 + (rand() - 0.5) * 0.05, 0.46 + rand() * 0.15, 0.42 + rand() * 0.2);
        leafColors.push(baseCol.clone());
      }
    }

    // Crown top foliage clusters
    for (let c = 0; c < Math.round(9 * lush); c++) {
      dummy.position.set(
        x + (rand() - 0.5) * 2.3 * scale,
        y + trunkH + (rand() * 1.4) * scale,
        z + (rand() - 0.5) * 2.3 * scale
      );
      dummy.rotation.set((rand() - 0.5) * 0.7, rand() * Math.PI * 2, (rand() - 0.5) * 0.7);
      const ls = (0.85 + rand() * 0.65) * scale;
      dummy.scale.set(ls, ls, ls);
      dummy.updateMatrix();
      leafMatrices.push(dummy.matrix.clone());

      baseCol.setHSL(0.23 + (rand() - 0.5) * 0.04, 0.5, 0.48 + rand() * 0.18);
      leafColors.push(baseCol.clone());
    }

    group.add(tGroup);
  });

  if (leafMatrices.length > 0) {
    const instLeaves = new THREE.InstancedMesh(leafGeo, leafMat, leafMatrices.length);
    instLeaves.castShadow = true;
    instLeaves.receiveShadow = true;
    instLeaves.frustumCulled = false;
    for (let i = 0; i < leafMatrices.length; i++) {
      instLeaves.setMatrixAt(i, leafMatrices[i]);
      instLeaves.setColorAt(i, leafColors[i]);
    }
    instLeaves.instanceMatrix.needsUpdate = true;
    if (instLeaves.instanceColor) instLeaves.instanceColor.needsUpdate = true;
    group.add(instLeaves);
  }
}

/**
 * Generates thousands of 3D swaying grass blades in 1 single GPU draw call
 */
export function buildWavingGrass(group, getHeight, count, radius, windUniforms) {
  // Tapered grass blade tuft (2 crossed curved blades)
  const bladeGeo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    // Blade 1
    -0.09, 0.0, 0.0,   0.09, 0.0, 0.0,   0.0, 0.68, 0.08,
    // Blade 2 (crossed)
    0.0, 0.0, -0.09,   0.0, 0.0, 0.09,   0.08, 0.62, 0.0
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 0.5, 1,
    0, 0, 1, 0, 0.5, 1
  ]);
  bladeGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  bladeGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  bladeGeo.computeVertexNormals();

  const grassMat = addWindShader(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      side: THREE.DoubleSide
    }),
    windUniforms,
    0.22,
    2.6
  );

  const matrices = [];
  const colors = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  let seed = 777;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * radius * 2;
    const z = (rand() - 0.5) * radius * 2;
    const y = getHeight(x, z);
    if (y < -0.5 || y > 3.6) continue; // No grass underwater or on rocky peaks

    dummy.position.set(x, y - 0.04, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    const s = 0.75 + rand() * 0.95;
    dummy.scale.set(s, s * (0.8 + rand() * 0.6), s);
    dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());

    col.setHSL(0.24 + (rand() - 0.5) * 0.06, 0.44, 0.32 + rand() * 0.16);
    colors.push(col.clone());
  }

  const instGrass = new THREE.InstancedMesh(bladeGeo, grassMat, matrices.length);
  instGrass.frustumCulled = false;
  instGrass.receiveShadow = true;
  for (let i = 0; i < matrices.length; i++) {
    instGrass.setMatrixAt(i, matrices[i]);
    instGrass.setColorAt(i, colors[i]);
  }
  instGrass.instanceMatrix.needsUpdate = true;
  if (instGrass.instanceColor) instGrass.instanceColor.needsUpdate = true;
  group.add(instGrass);
}
