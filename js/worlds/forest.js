import * as THREE from 'three';

function getHeight(x, z) {
  // Natural rolling hills + carved valley river channel
  const hills =
    Math.sin(x * 0.045) * Math.cos(z * 0.045) * 4.5 +
    Math.sin(x * 0.11 + 1.2) * Math.sin(z * 0.09) * 1.4;

  // River runs smoothly through the valley
  const riverCenter = Math.sin(z * 0.04) * 14 - 12;
  const distToRiver = Math.abs(x - riverCenter);
  const riverCarve = distToRiver < 10 ? -Math.cos((distToRiver / 10) * Math.PI * 0.5) * 3.8 : 0;

  // Keep spawn area relatively flat
  const distSpawn = Math.hypot(x, z - 12);
  const flatFactor = Math.min(1, distSpawn / 14);

  return (hills + riverCarve) * flatFactor;
}

export function createForestWorld(group, scene, helpers, shardsCollected) {
  // Warm Afternoon Golden Light & Valley Mist
  scene.fog = new THREE.FogExp2(0xd8e0d5, 0.0085);
  const sunDir = new THREE.Vector3(-60, 42, -50);
  group.add(helpers.createSky(0x5282b8, 0xe8dfd1, sunDir));

  group.add(new THREE.HemisphereLight(0xfff4e0, 0x45523b, 0.8));

  const sun = new THREE.DirectionalLight(0xffe8c2, 1.65);
  sun.position.copy(sunDir);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
  sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
  sun.shadow.bias = -0.0006;
  group.add(sun);

  // Sculpted Realistic Terrain with Height-Based Vertex Blending
  const terrainGeo = new THREE.PlaneGeometry(220, 220, 84, 84);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  const colors = [];

  const cSand = new THREE.Color(0x9e9278);
  const cGrass = new THREE.Color(0x5a7842);
  const cRock = new THREE.Color(0x6e6a63);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = getHeight(x, z);
    pos.setY(i, y);

    let col = cGrass.clone();
    if (y < -0.5) col.lerp(cSand, Math.min(1, (-0.5 - y) / 1.5));
    else if (y > 3.2) col.lerp(cRock, Math.min(1, (y - 3.2) / 3.0));
    colors.push(col.r, col.g, col.b);
  }
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({
      map: helpers.textures.grass,
      vertexColors: true,
      roughness: 0.92
    })
  );
  terrain.receiveShadow = true;
  group.add(terrain);

  // Flowing Valley River
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({
      color: 0x2c6e78, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.85
    })
  );
  river.rotation.x = -Math.PI / 2;
  river.position.y = -1.35;
  group.add(river);

  // Multi-Tiered Realistic Pine & Forest Trees (Deterministic Placement)
  const trunkMat = new THREE.MeshStandardMaterial({ map: helpers.textures.bark, roughness: 0.95 });
  const leafDark = new THREE.MeshStandardMaterial({ color: 0x2f4d27, roughness: 0.85 });
  const leafLight = new THREE.MeshStandardMaterial({ color: 0x416333, roughness: 0.85 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x73706a, roughness: 0.9 });

  let seed = 42;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  for (let i = 0; i < 85; i++) {
    const x = (rand() - 0.5) * 160;
    const z = (rand() - 0.5) * 160;
    const y = getHeight(x, z);

    // Skip water, spawn pad, and ancient ruin clearing
    if (y < -0.6) continue;
    if (Math.hypot(x, z - 12) < 13) continue;
    if (Math.hypot(x - 36, z + 38) < 12) continue;

    const scale = 0.85 + rand() * 0.75;
    const tree = new THREE.Group();
    tree.position.set(x, y - 0.2, z);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.38 * scale, 4.2 * scale, 7), trunkMat);
    trunk.position.y = 2.1 * scale;
    trunk.castShadow = true;
    tree.add(trunk);

    for (let layer = 0; layer < 3; layer++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry((2.4 - layer * 0.55) * scale, (3.2 - layer * 0.3) * scale, 8),
        layer % 2 === 0 ? leafDark : leafLight
      );
      cone.position.y = (3.4 + layer * 1.7) * scale;
      cone.castShadow = true;
      tree.add(cone);
    }
    group.add(tree);
  }

  // Scattered Natural Boulders
  for (let i = 0; i < 32; i++) {
    const x = (rand() - 0.5) * 150;
    const z = (rand() - 0.5) * 150;
    const y = getHeight(x, z);
    if (y < -1.1 || Math.hypot(x, z - 12) < 9) continue;

    const r = 0.6 + rand() * 1.3;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(x, y + r * 0.35, z);
    rock.scale.set(1.2, 0.75, 1.0);
    rock.rotation.set(rand() * 3, rand() * 3, 0);
    rock.castShadow = true; rock.receiveShadow = true;
    group.add(rock);
  }

  // --- ANCIENT RUIN & CODE SHARD #1 (Explore at X: 36, Z: -38) ---
  const rx = 36, rz = -38;
  const ry = getHeight(rx, rz);
  const ruinStone = new THREE.MeshStandardMaterial({ color: 0x999286, roughness: 0.85 });

  const altar = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.2, 1.2, 8), ruinStone);
  altar.position.set(rx, ry + 0.4, rz);
  altar.receiveShadow = true;
  group.add(altar);

  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const h = 3.2 + (i % 2) * 1.6;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.9), ruinStone);
    pillar.position.set(rx + Math.cos(ang) * 3.8, ry + h / 2, rz + Math.sin(ang) * 3.8);
    pillar.castShadow = true;
    group.add(pillar);
  }

  const alreadyFound = shardsCollected.has('forest_shard_1');
  const shardMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.75, 0),
    new THREE.MeshStandardMaterial({
      color: 0xffd257, emissive: 0xff9d00, emissiveIntensity: 0.85, roughness: 0.15, metalness: 0.8
    })
  );
  shardMesh.position.set(rx, ry + 2.5, rz);
  shardMesh.visible = !alreadyFound;
  group.add(shardMesh);

  const shardLight = new THREE.PointLight(0xffb833, alreadyFound ? 0 : 2.2, 18);
  shardLight.position.copy(shardMesh.position);
  group.add(shardLight);

  // --- RETURN PORTAL TO GRAND NEXUS ---
  const px = 0, pz = 18;
  const py = getHeight(px, pz);
  const pGroup = new THREE.Group();
  pGroup.position.set(px, py, pz);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x454d57, roughness: 0.5, metalness: 0.6 });
  const pLeft = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.5, 1), frameMat);
  pLeft.position.set(-2.2, 2.75, 0);
  const pRight = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.5, 1), frameMat);
  pRight.position.set(2.2, 2.75, 0);
  const pTop = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.8, 1.1), frameMat);
  pTop.position.set(0, 5.6, 0);
  const pCore = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 5.1),
    new THREE.MeshBasicMaterial({ color: 0x6cb8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
  );
  pCore.position.set(0, 2.6, 0);
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
      if (shardMesh.visible) {
        shardMesh.rotation.y += dt * 1.4;
        shardMesh.position.y = ry + 2.5 + Math.sin(t * 2.2) * 0.3;
      } else {
        shardLight.intensity = 0;
      }
      pCore.material.opacity = 0.52 + Math.sin(t * 2.5) * 0.14;
    }
  };
}
