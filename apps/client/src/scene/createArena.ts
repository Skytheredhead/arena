import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA_BLOCKS, ARENA_HALF_SIZE } from '@arena/shared';
import {
  createWetAsphaltMaterial,
  createWetConcreteMaterial,
  type PhotorealTextureSet,
} from '../rendering/photorealMaterials';

const buildFallbackArena = (textures: PhotorealTextureSet): THREE.Group => {
  const group = new THREE.Group();
  const concrete = createWetConcreteMaterial(textures.concrete);
  const asphalt = createWetAsphaltMaterial(textures.concrete);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF_SIZE * 2, ARENA_HALF_SIZE * 2, 1, 1),
    asphalt
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  floor.receiveShadow = true;
  group.add(floor);

  for (const block of ARENA_BLOCKS) {
    const width = block.halfX * 2;
    const height = block.maxY - block.minY;
    const depth = block.halfZ * 2;
    const radius = Math.min(0.075, width * 0.08, height * 0.08, depth * 0.08);
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(width, height, depth, 3, Math.max(0.006, radius)),
      concrete
    );
    mesh.position.set(
      block.centerX,
      (block.minY + block.maxY) * 0.5,
      block.centerZ
    );
    mesh.rotation.y = block.yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
};

const createIndustrialDetails = (): THREE.Group => {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: '#252d33',
    roughness: 0.36,
    metalness: 0.82,
  });
  const paintedSteel = new THREE.MeshPhysicalMaterial({
    color: '#687983',
    roughness: 0.3,
    metalness: 0.72,
    clearcoat: 0.45,
    clearcoatRoughness: 0.28,
  });
  const safety = new THREE.MeshStandardMaterial({
    color: '#a9822f',
    roughness: 0.46,
    metalness: 0.58,
  });

  const facadeParts: THREE.BufferGeometry[] = [];
  const addFacadeBox = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    yaw: number
  ): void => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(1, 1, 1)
    );
    geometry.applyMatrix4(matrix);
    facadeParts.push(geometry);
  };

  for (let index = 0; index < ARENA_BLOCKS.length; index += 1) {
    const block = ARENA_BLOCKS[index]!;
    const height = block.maxY - block.minY;
    if (height < 1.4 || index % 2 !== 0) continue;
    const width = block.halfX * 2;
    const depth = block.halfZ * 2;
    const centerY = (block.minY + block.maxY) * 0.5;
    addFacadeBox(
      width + 0.12,
      0.075,
      depth + 0.12,
      block.centerX,
      block.maxY + 0.035,
      block.centerZ,
      block.yaw
    );

    if (height > 3.2 && width > 2.4) {
      addFacadeBox(
        width * 0.72,
        0.028,
        0.028,
        block.centerX,
        centerY + height * 0.28,
        block.centerZ,
        block.yaw
      );
    }
  }
  if (facadeParts.length > 0) {
    const facadeGeometry = mergeGeometries(facadeParts, false);
    if (facadeGeometry) {
      const facades = new THREE.Mesh(facadeGeometry, paintedSteel);
      facades.castShadow = true;
      facades.receiveShadow = true;
      group.add(facades);
    }
    for (const geometry of facadeParts) geometry.dispose();
  }

  const drainageRuns: Array<[number, number, number, number]> = [
    [0, -23, 18, 0],
    [-18, -9, 12, Math.PI / 2],
    [15, 8, 15, Math.PI / 2],
    [-4, 21, 20, 0],
  ];
  for (const [x, z, length, yaw] of drainageRuns) {
    const drain = new THREE.Group();
    drain.position.set(x, 0.025, z);
    drain.rotation.y = yaw;
    const channel = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.025, 0.34),
      steel
    );
    channel.receiveShadow = true;
    drain.add(channel);
    const grateCount = Math.max(4, Math.floor(length / 0.42));
    for (let index = 0; index < grateCount; index += 1) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.018, 0.31),
        paintedSteel
      );
      bar.position.set(-length * 0.5 + (index + 0.5) * (length / grateCount), 0.025, 0);
      drain.add(bar);
    }
    group.add(drain);
  }

  const bollards: Array<[number, number]> = [
    [-7, -24],
    [7, -24],
    [-13, -7],
    [13, -7],
    [-8, 18],
    [8, 18],
  ];
  for (const [x, z] of bollards) {
    const bollard = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 0.86, 16),
      paintedSteel
    );
    post.position.y = 0.43;
    post.castShadow = true;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.084, 0.084, 0.12, 16),
      safety
    );
    band.position.y = 0.58;
    bollard.add(post, band);
    bollard.position.set(x, 0, z);
    group.add(bollard);
  }

  const wallCandidates = ARENA_BLOCKS.filter((block) => {
    const height = block.maxY - block.minY;
    return height > 2.7 && block.halfX > 1.15 && block.halfZ > 0.18;
  });
  const wallStride = Math.max(1, Math.floor(wallCandidates.length / 7));
  for (let index = 0; index < wallCandidates.length; index += wallStride) {
    const block = wallCandidates[index];
    if (!block) continue;
    const module = new THREE.Group();
    module.position.set(block.centerX, block.minY, block.centerZ);
    module.rotation.y = block.yaw;
    const faceZ = block.halfZ + 0.045;

    const door = new THREE.Mesh(
      new RoundedBoxGeometry(1.72, 2.34, 0.09, 3, 0.035),
      paintedSteel
    );
    door.position.set(0, 1.2, faceZ);
    door.castShadow = true;
    door.receiveShadow = true;
    module.add(door);
    const inset = new THREE.Mesh(
      new RoundedBoxGeometry(1.38, 1.98, 0.025, 2, 0.018),
      steel
    );
    inset.position.set(0, 1.2, faceZ + 0.058);
    module.add(inset);
    for (const x of [-0.58, 0.58]) {
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 1.78, 0.035),
        paintedSteel
      );
      brace.position.set(x, 1.2, faceZ + 0.083);
      module.add(brace);
    }
    for (const y of [0.54, 1.2, 1.86]) {
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(1.24, 0.04, 0.035),
        paintedSteel
      );
      brace.position.set(0, y, faceZ + 0.083);
      module.add(brace);
    }
    const controlBox = new THREE.Mesh(
      new RoundedBoxGeometry(0.28, 0.4, 0.13, 3, 0.025),
      steel
    );
    controlBox.position.set(1.06, 1.35, faceZ + 0.04);
    module.add(controlBox);
    const controlLight = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 12),
      new THREE.MeshStandardMaterial({
        color: '#8cebf1',
        emissive: '#4ce4ef',
        emissiveIntensity: 2.8,
      })
    );
    controlLight.position.set(1.06, 1.45, faceZ + 0.112);
    module.add(controlLight);

    const conduit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, Math.min(block.halfX * 1.4, 4.2), 12),
      steel
    );
    conduit.rotation.z = Math.PI / 2;
    conduit.position.set(0, 2.62, faceZ + 0.055);
    module.add(conduit);
    group.add(module);
  }

  const railingCandidates = ARENA_BLOCKS.filter(
    (block) => block.maxY > 2.4 && block.maxY < 5.4 && block.halfX > 1.8
  );
  const railingStride = Math.max(1, Math.floor(railingCandidates.length / 5));
  for (let index = 0; index < railingCandidates.length; index += railingStride) {
    const block = railingCandidates[index];
    if (!block) continue;
    const railing = new THREE.Group();
    railing.position.set(block.centerX, block.maxY, block.centerZ);
    railing.rotation.y = block.yaw;
    const edgeZ = block.halfZ - 0.08;
    const width = block.halfX * 1.7;
    const postCount = Math.max(3, Math.ceil(width / 1.4));
    for (let postIndex = 0; postIndex < postCount; postIndex += 1) {
      const x = -width * 0.5 + (postIndex / (postCount - 1)) * width;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.82, 10),
        steel
      );
      post.position.set(x, 0.41, edgeZ);
      railing.add(post);
    }
    for (const y of [0.35, 0.78]) {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, width, 10),
        steel
      );
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, y, edgeZ);
      railing.add(rail);
    }
    group.add(railing);
  }

  return group;
};

export const createArena = (textures: PhotorealTextureSet): THREE.Group => {
  const root = new THREE.Group();
  root.add(buildFallbackArena(textures));
  root.add(createIndustrialDetails());

  return root;
};
