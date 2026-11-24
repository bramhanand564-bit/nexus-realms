import * as THREE from 'three';
import { buildRealisticTrees, buildWavingGrass } from '../core/foliage.js';

function getHeight(x, z) {
  const hills =
    Math.sin(x * 0.045) * Math.cos(z * 0.045) * 4.6 +
    Math.sin(x * 0.11 + 1.2) * Math.sin(z * 0.09) * 1.35;

  const riverCenter = Math.sin(z * 0.04) * 14 - 12;
  const distToRiver = Math.abs(x - riverCenter);
  const riverCarve = distToRiver < 10 ? -Math.cos((distToRiver / 10) * Math.PI * 0.5) * 3.8 : 0;

  const distSpawn = Math.hypot(x, z - 12);
  const flatFactor = Math.min(1, distSpawn / 14);
  return (hills + riverCarve) * flatFactor;
}

export function createForestWorld(group, scene, helpers, shardsCollected) {
  scene.fog = new THREE.FogExp2(0xd6e1d6, 0.0068);

  const sunDir = new THREE.Vector3(-68, 36, -55);
  group.add(helpers.createSky(0x4679b3, 0xe8ded0, sunDir));
  helpers.applyEnv(0x5282b8, 0xe8dfd1, 0x45543a);

  group.add(new THREE.HemisphereLight(0xfff4e0, 0x435238, 0.78));

  const sun = new THREE.DirectionalLight(0xffe6bd, 1.8);
  sun.position.copy(sunDir);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
  sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
  sun.shadow.bias = -0.0006;
  group.add(sun);

  const mats = helpers.materials;

  // Normal-Mapped Sculpted Valley Terrain
  const terrainGeo = new THREE.PlaneGeometry(220, 220, 92, 92);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  const colors = [];

  const cSand = new THREE.Color(0x9e9176);
  const cGrass = new THREE.Color(0x54733d);
  const cRock = new THREE.Color(0x6d6a63);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = getHeight(x, z);
    pos.setY(i, y);

    const col = cGrass.clone();
    if (y < -0.5) col.lerp(cSand, Math.min(1, (-0.5 - y) / 1.5));
    else if (y > 3.2) col.lerp(cRock, Math.min(1, (y - 3.2) / 3.0));
    colors.push(col.r, col.g, col.b);
  }
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrain = new THREE.Mesh(terrainGeo, mats.forestGroundMat);
  terrain.receiveShadow = true;
  group.add(terrain);

  // Animated Sparkling Valley River
  const riverMat = mats.createWaterMaterial(0x1f6270, 0.86, 18);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), riverMat);
  river.rotation.x = -Math.PI / 2;
  river.position.y = -1.35;
  group.add(river);

  // Procedural Realistic Branching Trees + GPU Instanced Wind-Swaying Veined Leaves
  let seed = 42;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const treeList = [];
  for (let i = 0; i < 68; i++) {
    const x = (rand() - 0.5) * 156;
    const z = (rand() - 0.5) * 156;
    const y = getHeight(x, z);
    if (y < -0.5) continue;
    if (Math.hypot(x, z - 12) < 13) continue;
    if (Math.hypot(x - 36, z + 38) < 13) continue;
    treeList.push({ x, y, z, scale: 0.9 + rand() * 0.7, lush: 1.0 });
  }
  buildRealisticTrees(group, treeList, mats, helpers.windUniforms);

  // Thousands of 3D Waving Grass Blades (Single GPU Draw Call!)
  buildWavingGrass(group, getHeight, 4800, 74, helpers.windUniforms);

  // Natural Mossy Boulders
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x76746e, roughness: 0.88, metalness: 0.05 });
  for (let i = 0; i < 34; i++) {
    const x = (rand() - 0.5) * 150;
    const z = (rand() - 0.5) * 150;
    const y = getHeight(x, z);
    if (y < -1.1 || Math.hypot(x, z - 12) < 9) continue;

    const r = 0.65 + rand() * 1.35;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), rockMat);
    rock.position.set(x, y + r * 0.3, z);
    rock.scale.set(1.25, 0.72, 1.0);
    rock.rotation.set(rand() * 3, rand() * 3, 0);
    rock.castShadow = true; rock.receiveShadow = true;
    group.add(rock);
  }

  // Floating Sunlight Pollen / Atmospheric Motes
  const pCount = 180;
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3] = (rand() - 0.5) * 120;
    pPos[i * 3 + 1] = 1.5 + rand() * 14;
    pPos[i * 3 + 2] = (rand() - 0.5) * 120;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const motes = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({ color: 0xfff5d1, size: 0.18, transparent: true, opacity: 0.65 })
  );
  group.add(motes);

  // --- ANCIENT RUIN & CODE SHARD #1 (X: 36, Z: -38) ---
  const rx = 36, rz = -38;
  const ry = getHeight(rx, rz);
  const altar = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.2, 1.2, 8), mats.stoneMat);
  altar.position.set(rx, ry + 0.4, rz);
  altar.receiveShadow = true;
  group.add(altar);

  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const h = 3.2 + (i % 2) * 1.6;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.9), mats.stoneMat);
    pillar.position.set(rx + Math.cos(ang) * 3.8, ry + h / 2, rz + Math.sin(ang) * 3.8);
    pillar.castShadow = true;
    group.add(pillar);
  }

  const alreadyFound = shardsCollected.has('forest_shard_1');
  const shardMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.75, 0),
    new THREE.MeshStandardMaterial({
      color: 0xffd257, emissive: 0xff9d00, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.85
    })
  );
  shardMesh.position.set(rx, ry + 2.5, rz);
  shardMesh.visible = !alreadyFound;
  group.add(shardMesh);

  const shardLight = new THREE.PointLight(0xffb833, alreadyFound ? 0 : 2.5, 20);
  shardLight.position.copy(shardMesh.position);
  group.add(shardLight);

  // --- RETURN PORTAL TO GRAND NEXUS ---
  const px = 0, pz = 18;
  const py = getHeight(px, pz);
  const pGroup = new THREE.Group();
  pGroup.position.set(px, py, pz);

  const pLeft = new THREE.Mesh(new THREE.BoxGeometry(0.75, 5.6, 1.0), mats.metalMat);
  pLeft.position.set(-2.2, 2.8, 0); pLeft.castShadow = true;
  const pRight = new THREE.Mesh(new THREE.BoxGeometry(0.75, 5.6, 1.0), mats.metalMat);
  pRight.position.set(2.2, 2.8, 0); pRight.castShadow = true;
  const pTop = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.85, 1.15), mats.metalMat);
  pTop.position.set(0, 5.7, 0); pTop.castShadow = true;
  const pCore = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 5.1),
    new THREE.MeshBasicMaterial({ color: 0x6cb8ff, transparent: true, opacity: 0.56, side: THREE.DoubleSide })
  );
  pCore.position.set(0, 2.65, 0);
  pGroup.add(pLeft, pRight, pTop, pCore);
  group.add(pGroup);

  return {
    name: 'WILD VALLEY',
    spawn: new THREE.Vector3(0, 0, 10),
    spawnYaw: 0,
    boundary: 92,
    circularBound: false,
    gravity: 22,
    portals: [{ pos: new THREE.Vector3(px, py, pz), label: 'THE GRAND NEXUS', target: 'hub', locked: false }],
    shards: [{ id: 'forest_shard_1', mesh: shardMesh, collected: alreadyFound }],
    getHeight,
    update: (dt, t) => {
      riverMat.userData.waterNormal.offset.y += dt * 0.08;
      riverMat.userData.waterNormal.offset.x += dt * 0.015;
      motes.rotation.y += dt * 0.015;

      if (shardMesh.visible) {
        shardMesh.rotation.y += dt * 1.4;
        shardMesh.position.y = ry + 2.5 + Math.sin(t * 2.2) * 0.28;
      } else {
        shardLight.intensity = 0;
      }
      pCore.material.opacity = 0.5 + Math.sin(t * 2.5) * 0.14;
    }
  };
}
