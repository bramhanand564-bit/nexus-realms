import * as THREE from 'three';
import { buildRealisticTrees } from '../core/foliage.js';

export function createHubWorld(group, scene, helpers) {
  scene.fog = new THREE.FogExp2(0xd2e3f0, 0.0028);

  // Realistic Daylight Sky + 360° Reflection Environment Map
  const sunDir = new THREE.Vector3(55, 48, 38);
  group.add(helpers.createSky(0x3a76b8, 0xd8e8f5, sunDir));
  helpers.applyEnv(0x4b87c9, 0xdcebf7, 0x706c64);

  group.add(new THREE.HemisphereLight(0xe4f2ff, 0x7c766b, 0.72));

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.7);
  sun.position.copy(sunDir);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -46; sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 46; sun.shadow.camera.bottom = -46;
  sun.shadow.bias = -0.0005;
  group.add(sun);

  const mats = helpers.materials;

  // Animated Reflecting Ocean Horizon
  const oceanMat = mats.createWaterMaterial(0x1f5f7d, 1.0, 26);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(760, 760), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -3.0;
  group.add(ocean);

  // Main Sunlit 3D Normal-Mapped Stone Plaza
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(38, 40, 4, 56), mats.stoneMat);
  plaza.position.y = -2;
  plaza.receiveShadow = true;
  group.add(plaza);

  // Architectural Rim + Inner Accent Ring
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(37.5, 0.45, 12, 64),
    new THREE.MeshStandardMaterial({ color: 0xc8c2b7, roughness: 0.62, metalness: 0.1 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.45;
  rim.receiveShadow = true;
  group.add(rim);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(11.6, 12.2, 64),
    mats.metalMat
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.02;
  group.add(innerRing);

  // Multi-Tiered Architectural Fountain + Animated Water
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(5.6, 6.4, 0.85, 40),
    new THREE.MeshStandardMaterial({ color: 0xd6d0c6, roughness: 0.55, metalness: 0.08 })
  );
  basin.position.y = 0.42;
  basin.castShadow = true; basin.receiveShadow = true;
  group.add(basin);

  const fountainWaterMat = mats.createWaterMaterial(0x28879e, 0.9, 4);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(5.1, 5.1, 0.12, 36), fountainWaterMat);
  water.position.y = 0.8;
  group.add(water);

  // Reflective Metallic Floating Core Monument
  const spire = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.45, 0),
    new THREE.MeshStandardMaterial({ color: 0xeaf0f6, roughness: 0.12, metalness: 0.95 })
  );
  spire.position.y = 4.3;
  spire.castShadow = true;
  group.add(spire);

  const haloRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.3, 0.06, 8, 48),
    mats.metalMat
  );
  haloRing.position.y = 4.3;
  group.add(haloRing);

  // Realistic Branching Plaza Trees with Wind-Swaying Veined Leaves
  const treeList = [
    { x: -15, y: 0.5, z: 12, scale: 0.95, lush: 1.1 },
    { x: -15, y: 0.5, z: -13, scale: 1.05, lush: 1.1 },
    { x: 15, y: 0.5, z: -13, scale: 1.0, lush: 1.1 },
    { x: 13, y: 0.5, z: 24, scale: 0.9, lush: 1.0 },
    { x: -13, y: 0.5, z: 24, scale: 0.92, lush: 1.0 }
  ];
  treeList.forEach(({ x, z }) => {
    const planter = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.35, 0.6, 20),
      new THREE.MeshStandardMaterial({ color: 0x999287, roughness: 0.78 })
    );
    planter.position.set(x, 0.3, z);
    planter.castShadow = true; planter.receiveShadow = true;
    group.add(planter);

    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(1.85, 1.85, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0x453729, roughness: 0.95 })
    );
    soil.position.set(x, 0.58, z);
    group.add(soil);
  });
  buildRealisticTrees(group, treeList, mats, helpers.windUniforms);

  // --- THE CLUB LOUNGE (Localized 5-10% Neon Accent Inside Only) ---
  const clubGroup = new THREE.Group();
  clubGroup.position.set(22, 0, 14);
  clubGroup.rotation.y = -0.6;

  const darkWallMat = new THREE.MeshStandardMaterial({ color: 0x222730, roughness: 0.42, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xaad0f0, roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.34
  });

  const clubFloor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.25, 11), darkWallMat);
  clubFloor.position.y = 0.12; clubFloor.receiveShadow = true;
  clubGroup.add(clubFloor);

  const clubRoof = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.45, 11.8), mats.metalMat);
  clubRoof.position.y = 5.2; clubRoof.castShadow = true;
  clubGroup.add(clubRoof);

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 0.4), darkWallMat);
  backWall.position.set(0, 2.6, 5.3); clubGroup.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5, 10.6), glassMat);
  leftWall.position.set(-5.3, 2.6, 0); clubGroup.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5, 10.6), glassMat);
  rightWall.position.set(5.3, 2.6, 0); clubGroup.add(rightWall);

  // Subtle Neon Strips ONLY inside the Lounge
  const neonCyan = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x22e6ff }));
  neonCyan.position.set(0, 4.7, 4.95); clubGroup.add(neonCyan);
  const neonWarm = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xff4499 }));
  neonWarm.position.set(0, 1.3, 4.95); clubGroup.add(neonWarm);

  const clubLight = new THREE.PointLight(0xff4499, 2.2, 14);
  clubLight.position.set(0, 3.6, 1.5); clubGroup.add(clubLight);

  const bar = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.1, 1.1), darkWallMat);
  bar.position.set(0, 0.6, 3.2); clubGroup.add(bar);
  group.add(clubGroup);

  // --- 4 REFLECTIVE BRUSHED-STEEL PORTAL GATEWAYS ---
  const portals = [];
  const portalCores = [];

  function addPortal(x, z, rotY, colorHex, label, target, locked) {
    const pGroup = new THREE.Group();
    pGroup.position.set(x, 0, z);
    pGroup.rotation.y = rotY;

    // Stepped stone pedestal
    const base = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.36, 2.6), mats.stoneMat);
    base.position.y = 0.18; base.receiveShadow = true;
    pGroup.add(base);

    const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 6.2, 1.1), mats.metalMat);
    leftPillar.position.set(-2.55, 3.25, 0); leftPillar.castShadow = true;
    const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 6.2, 1.1), mats.metalMat);
    rightPillar.position.set(2.55, 3.25, 0); rightPillar.castShadow = true;
    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.95, 1.35), mats.metalMat);
    topBeam.position.set(0, 6.55, 0); topBeam.castShadow = true;
    pGroup.add(leftPillar, rightPillar, topBeam);

    // Subtle energy shimmer
    const core = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 5.7),
      new THREE.MeshBasicMaterial({
        color: locked ? 0x626b76 : colorHex,
        transparent: true,
        opacity: locked ? 0.25 : 0.58,
        side: THREE.DoubleSide
      })
    );
    core.position.set(0, 3.15, 0);
    pGroup.add(core);
    portalCores.push({ mesh: core, locked });

    group.add(pGroup);
    portals.push({ pos: new THREE.Vector3(x, 0, z), label, target, locked });
  }

  addPortal(0, -27, 0, 0x3ec982, 'WILD VALLEY', 'forest', false);
  addPortal(27, -4, -Math.PI / 2, 0xd4a24c, 'METRO SECTOR', 'city', true);
  addPortal(-27, -4, Math.PI / 2, 0x56a8e8, 'AETHER CITY', 'scifi', true);
  addPortal(-20, 19, Math.PI * 0.75, 0xc75b39, 'EXO-PLANET', 'alien', true);

  return {
    name: 'THE GRAND NEXUS',
    spawn: new THREE.Vector3(0, 0, 19),
    spawnYaw: 0,
    boundary: 35.8,
    circularBound: true,
    gravity: 22,
    portals,
    shards: [],
    getHeight: () => 0,
    update: (dt, t) => {
      spire.rotation.y += dt * 0.55;
      spire.position.y = 4.3 + Math.sin(t * 1.6) * 0.22;
      haloRing.rotation.x = Math.sin(t * 0.8) * 0.6;
      haloRing.rotation.y += dt * 0.4;

      // Animate water ripples
      oceanMat.userData.waterNormal.offset.x += dt * 0.025;
      oceanMat.userData.waterNormal.offset.y += dt * 0.015;
      fountainWaterMat.userData.waterNormal.offset.x -= dt * 0.06;
      fountainWaterMat.userData.waterNormal.offset.y += dt * 0.04;

      portalCores.forEach((c, idx) => {
        if (!c.locked) c.mesh.material.opacity = 0.5 + Math.sin(t * 2.4 + idx) * 0.14;
      });
    }
  };
}
