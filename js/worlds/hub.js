import * as THREE from 'three';

export function createHubWorld(group, scene, helpers) {
  scene.fog = new THREE.FogExp2(0xdce8f2, 0.0038);

  // Realistic Daylight Sky & Sun
  const sunDir = new THREE.Vector3(45, 55, 35);
  group.add(helpers.createSky(0x4c88c4, 0xdce9f5, sunDir));

  const hemi = new THREE.HemisphereLight(0xdff0ff, 0x8a8275, 0.85);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff5e4, 1.5);
  sun.position.copy(sunDir);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.bias = -0.0005;
  group.add(sun);

  // Surrounding Ocean Horizon
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshStandardMaterial({ color: 0x2c6485, roughness: 0.22, metalness: 0.35 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -3.2;
  group.add(ocean);

  // Main Sunlit Stone Plaza
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(38, 40, 4, 48),
    new THREE.MeshStandardMaterial({ map: helpers.textures.stone, roughness: 0.78 })
  );
  plaza.position.y = -2;
  plaza.receiveShadow = true;
  group.add(plaza);

  // Low Stone Perimeter Wall (Clean Architectural Border)
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(37.4, 0.45, 10, 64),
    new THREE.MeshStandardMaterial({ color: 0xbfb8ac, roughness: 0.7 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.45;
  rim.receiveShadow = true;
  group.add(rim);

  // Central Water Fountain & Monument
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(5.5, 6.2, 0.8, 32),
    new THREE.MeshStandardMaterial({ color: 0xd0cac0, roughness: 0.65 })
  );
  basin.position.y = 0.4;
  basin.castShadow = true; basin.receiveShadow = true;
  group.add(basin);

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(5.0, 5.0, 0.1, 32),
    new THREE.MeshStandardMaterial({ color: 0x3b8ea5, roughness: 0.12, metalness: 0.25 })
  );
  water.position.y = 0.78;
  group.add(water);

  const spire = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.5, 0),
    new THREE.MeshStandardMaterial({ color: 0xe6edf2, roughness: 0.15, metalness: 0.85 })
  );
  spire.position.y = 4.2;
  spire.castShadow = true;
  group.add(spire);

  // Natural Plaza Trees (Realistic Park Planters)
  const treeCoords = [[-14, 12], [-14, -12], [14, -12], [12, 24], [-12, 24]];
  const trunkMat = new THREE.MeshStandardMaterial({ map: helpers.textures.bark, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x456b38, roughness: 0.8 });

  treeCoords.forEach(([x, z]) => {
    const planter = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.3, 0.6, 16),
      new THREE.MeshStandardMaterial({ color: 0x8f887d, roughness: 0.85 })
    );
    planter.position.set(x, 0.3, z);
    planter.receiveShadow = true;
    group.add(planter);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 3.8, 8), trunkMat);
    trunk.position.set(x, 2.2, z);
    trunk.castShadow = true;
    group.add(trunk);

    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.1, 1), leafMat);
    crown.position.set(x, 4.6, z);
    crown.castShadow = true;
    group.add(crown);
  });

  // --- THE CLUB LOUNGE (Localized 5-10% Neon Accent Inside Only) ---
  const clubGroup = new THREE.Group();
  clubGroup.position.set(22, 0, 14);
  clubGroup.rotation.y = -0.6;

  const darkWallMat = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.5, metalness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x88aacc, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35
  });

  // Floor & Roof
  const clubFloor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.25, 11), darkWallMat);
  clubFloor.position.y = 0.12;
  clubGroup.add(clubFloor);

  const clubRoof = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.5, 11.6), darkWallMat);
  clubRoof.position.y = 5.2;
  clubRoof.castShadow = true;
  clubGroup.add(clubRoof);

  // Back & Side Walls (Front left open to walk inside!)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 0.4), darkWallMat);
  backWall.position.set(0, 2.6, 5.3);
  clubGroup.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 10.6), glassMat);
  leftWall.position.set(-5.3, 2.6, 0);
  clubGroup.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 10.6), glassMat);
  rightWall.position.set(5.3, 2.6, 0);
  clubGroup.add(rightWall);

  // Subtle Neon Strips ONLY inside the Lounge
  const neonCyan = new THREE.Mesh(
    new THREE.BoxGeometry(8.5, 0.12, 0.12),
    new THREE.MeshBasicMaterial({ color: 0x22e6ff })
  );
  neonCyan.position.set(0, 4.7, 4.9);
  clubGroup.add(neonCyan);

  const neonWarm = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.12, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xff4499 })
  );
  neonWarm.position.set(0, 1.3, 4.9);
  clubGroup.add(neonWarm);

  const clubLight = new THREE.PointLight(0xff4499, 2.4, 14);
  clubLight.position.set(0, 3.6, 1.5);
  clubGroup.add(clubLight);

  // Bar Counter
  const bar = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.1, 1.1), darkWallMat);
  bar.position.set(0, 0.6, 3.2);
  clubGroup.add(bar);

  group.add(clubGroup);

  // --- 4 PORTAL GATEWAYS ---
  const portals = [];
  const portalCores = [];

  function addPortal(x, z, rotY, colorHex, label, target, locked) {
    const pGroup = new THREE.Group();
    pGroup.position.set(x, 0, z);
    pGroup.rotation.y = rotY;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3b424c, roughness: 0.4, metalness: 0.65 });
    const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6.2, 1.1), frameMat);
    leftPillar.position.set(-2.5, 3.1, 0); leftPillar.castShadow = true;
    pGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6.2, 1.1), frameMat);
    rightPillar.position.set(2.5, 3.1, 0); rightPillar.castShadow = true;
    pGroup.add(rightPillar);

    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.9, 1.3), frameMat);
    topBeam.position.set(0, 6.4, 0); topBeam.castShadow = true;
    pGroup.add(topBeam);

    // Subtle Energy Core
    const core = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 5.8),
      new THREE.MeshBasicMaterial({
        color: locked ? 0x555e69 : colorHex,
        transparent: true,
        opacity: locked ? 0.28 : 0.65,
        side: THREE.DoubleSide
      })
    );
    core.position.set(0, 3.0, 0);
    pGroup.add(core);
    portalCores.push({ mesh: core, locked });

    group.add(pGroup);
    portals.push({ pos: new THREE.Vector3(x, 0, z), label, target, locked });
  }

  // North: Active Forest Portal
  addPortal(0, -27, 0, 0x45c47a, 'WILD VALLEY', 'forest', false);
  // East: Metro Sector (Step 2)
  addPortal(27, -4, -Math.PI / 2, 0xd4a24c, 'METRO SECTOR', 'city', true);
  // West: Clean Sci-Fi City (Step 3)
  addPortal(-27, -4, Math.PI / 2, 0x56a8e8, 'AETHER CITY', 'scifi', true);
  // South-West: Alien Planet (Step 4)
  addPortal(-20, 19, Math.PI * 0.75, 0xc75b39, 'EXO-PLANET', 'alien', true);

  return {
    name: 'THE GRAND NEXUS',
    spawn: new THREE.Vector3(0, 0, 18),
    spawnYaw: 0,
    boundary: 35.8,
    circularBound: true,
    gravity: 22,
    portals,
    shards: [],
    getHeight: () => 0,
    update: (dt, t) => {
      spire.rotation.y += dt * 0.5;
      spire.position.y = 4.2 + Math.sin(t * 1.6) * 0.25;
      portalCores.forEach((c, idx) => {
        if (!c.locked) c.mesh.material.opacity = 0.55 + Math.sin(t * 2.5 + idx) * 0.14;
      });
    }
  };
}
