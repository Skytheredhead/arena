import * as THREE from 'three';
import { ARENA_BLOCKS, ARENA_HALF_SIZE, ARENA_WALLS } from '@arena/shared';

const addStaticBox = (
  group: THREE.Group,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material
): void => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
};

export const createArena = (): THREE.Group => {
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF_SIZE * 2, ARENA_HALF_SIZE * 2, 2, 2),
    new THREE.MeshStandardMaterial({
      color: '#131a23',
      roughness: 0.9,
      metalness: 0.08
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const coolZone = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF_SIZE * 2, ARENA_HALF_SIZE),
    new THREE.MeshBasicMaterial({
      color: '#27d8ff',
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending
    })
  );
  coolZone.rotation.x = -Math.PI / 2;
  coolZone.position.set(0, 0.03, ARENA_HALF_SIZE * 0.25);
  group.add(coolZone);

  const warmZone = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF_SIZE * 2, ARENA_HALF_SIZE),
    new THREE.MeshBasicMaterial({
      color: '#ff8a2a',
      transparent: true,
      opacity: 0.07,
      blending: THREE.AdditiveBlending
    })
  );
  warmZone.rotation.x = -Math.PI / 2;
  warmZone.position.set(0, 0.03, -ARENA_HALF_SIZE * 0.25);
  group.add(warmZone);

  const grid = new THREE.GridHelper(ARENA_HALF_SIZE * 2, 36, '#3a4858', '#242f3d');
  grid.position.y = 0.02;
  group.add(grid);

  const staticSolids = [...ARENA_WALLS, ...ARENA_BLOCKS];
  for (const block of staticSolids) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        block.maxX - block.minX,
        block.maxY - block.minY,
        block.maxZ - block.minZ
      ),
      new THREE.MeshStandardMaterial({
        color: block.color,
        roughness: 0.76,
        metalness: 0.14
      })
    );
    mesh.position.set(
      (block.minX + block.maxX) * 0.5,
      (block.minY + block.maxY) * 0.5,
      (block.minZ + block.maxZ) * 0.5
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const reactorBody = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.8, 6.3, 10),
    new THREE.MeshStandardMaterial({
      color: '#2a3340',
      roughness: 0.58,
      metalness: 0.42
    })
  );
  reactorBody.position.set(0, 3.15, 0);
  reactorBody.castShadow = true;
  reactorBody.receiveShadow = true;
  group.add(reactorBody);

  const reactorCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 7.1, 12),
    new THREE.MeshStandardMaterial({
      color: '#5defff',
      roughness: 0.2,
      metalness: 0.7,
      emissive: '#27d8ff',
      emissiveIntensity: 1.1
    })
  );
  reactorCore.position.set(0, 3.55, 0);
  group.add(reactorCore);

  const reactorHalo = new THREE.Mesh(
    new THREE.TorusGeometry(3.35, 0.12, 12, 40),
    new THREE.MeshBasicMaterial({
      color: '#7ff5ff',
      transparent: true,
      opacity: 0.6
    })
  );
  reactorHalo.rotation.x = Math.PI / 2;
  reactorHalo.position.set(0, 2.7, 0);
  group.add(reactorHalo);

  const catwalkRing = new THREE.Mesh(
    new THREE.TorusGeometry(8.2, 0.5, 12, 56),
    new THREE.MeshStandardMaterial({
      color: '#2d3745',
      roughness: 0.62,
      metalness: 0.3
    })
  );
  catwalkRing.rotation.x = Math.PI / 2;
  catwalkRing.position.set(0, 3.2, 0);
  catwalkRing.castShadow = true;
  catwalkRing.receiveShadow = true;
  group.add(catwalkRing);

  const catwalkRailMat = new THREE.MeshStandardMaterial({
    color: '#5defff',
    roughness: 0.28,
    metalness: 0.65,
    emissive: '#1dc9ea',
    emissiveIntensity: 0.42
  });
  const catwalkRails = [
    { x: 0, z: 8.2, rot: 0 },
    { x: 0, z: -8.2, rot: 0 },
    { x: 8.2, z: 0, rot: Math.PI * 0.5 },
    { x: -8.2, z: 0, rot: Math.PI * 0.5 }
  ];
  for (const rail of catwalkRails) {
    addStaticBox(group, 3.6, 0.08, 0.08, rail.x, 3.6, rail.z, catwalkRailMat);
    addStaticBox(group, 3.6, 0.08, 0.08, rail.x, 3.05, rail.z, catwalkRailMat);
  }

  const corridorMat = new THREE.MeshStandardMaterial({
    color: '#202a36',
    roughness: 0.78,
    metalness: 0.18
  });
  const corridorTrimMat = new THREE.MeshStandardMaterial({
    color: '#3f4d5c',
    roughness: 0.58,
    metalness: 0.28
  });
  for (const side of [-1, 1]) {
    const x = side * 18;
    addStaticBox(group, 0.36, 3.8, 17, x - side * 1.2, 1.9, 0, corridorMat);
    addStaticBox(group, 0.36, 3.8, 17, x + side * 1.2, 1.9, 0, corridorMat);
    addStaticBox(group, 2.8, 0.3, 17, x, 3.8, 0, corridorTrimMat);
    addStaticBox(group, 2.8, 0.18, 17, x, 0.09, 0, corridorTrimMat);
  }

  const underpassMat = new THREE.MeshStandardMaterial({
    color: '#252f3d',
    roughness: 0.74,
    metalness: 0.2
  });
  addStaticBox(group, 8.6, 0.22, 5.4, 0, 1.6, -11.2, underpassMat);
  addStaticBox(group, 0.3, 2.2, 5.4, -4.2, 1.1, -11.2, underpassMat);
  addStaticBox(group, 0.3, 2.2, 5.4, 4.2, 1.1, -11.2, underpassMat);

  const liftPad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 0.14, 20),
    new THREE.MeshStandardMaterial({
      color: '#45deff',
      roughness: 0.2,
      metalness: 0.72,
      emissive: '#22b7ff',
      emissiveIntensity: 0.7
    })
  );
  liftPad.position.set(0, 0.07, -11.1);
  group.add(liftPad);

  const liftBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.95, 3.0, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#66ecff',
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    })
  );
  liftBeam.position.set(0, 1.5, -11.1);
  group.add(liftBeam);

  const topControlMarker = new THREE.Mesh(
    new THREE.RingGeometry(1.05, 1.45, 24),
    new THREE.MeshBasicMaterial({
      color: '#66ecff',
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    })
  );
  topControlMarker.rotation.x = -Math.PI / 2;
  topControlMarker.position.set(0, 3.05, -9.2);
  group.add(topControlMarker);

  const warmLight = new THREE.PointLight('#ff9440', 11, 58, 2.2);
  warmLight.position.set(16, 3.6, -12);
  group.add(warmLight);

  const coolLight = new THREE.PointLight('#2ce0ff', 11, 58, 2.2);
  coolLight.position.set(-16, 3.6, 12);
  group.add(coolLight);

  const reactorLight = new THREE.PointLight('#50e8ff', 8, 26, 2.1);
  reactorLight.position.set(0, 4.4, 0);
  group.add(reactorLight);

  return group;
};
