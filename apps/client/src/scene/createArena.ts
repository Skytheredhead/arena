import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARENA_BLOCKS, ARENA_HALF_SIZE } from '@arena/shared';

const MAP_MODEL_URL = '/Map1.glb';

const buildFallbackArena = (): THREE.Group => {
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF_SIZE * 2, ARENA_HALF_SIZE * 2, 1, 1),
    new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.9,
      metalness: 0.08
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  floor.receiveShadow = true;
  group.add(floor);

  for (const block of ARENA_BLOCKS) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(block.halfX * 2, block.maxY - block.minY, block.halfZ * 2),
      new THREE.MeshStandardMaterial({
        color: block.color,
        roughness: 0.74,
        metalness: 0.16
      })
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

const configureMapMaterials = (root: THREE.Object3D): void => {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }

    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
        material.roughness = Math.min(1, material.roughness + 0.08);
        material.metalness = Math.max(0, material.metalness * 0.9);
      }
    }
  });
};

export const createArena = (): THREE.Group => {
  const root = new THREE.Group();
  const fallback = buildFallbackArena();
  root.add(fallback);

  const loader = new GLTFLoader();
  loader.load(
    MAP_MODEL_URL,
    gltf => {
      while (root.children.length > 0) {
        const child = root.children.at(0);
        if (!child) {
          break;
        }
        root.remove(child);
      }
      configureMapMaterials(gltf.scene);
      root.add(gltf.scene);
    },
    undefined,
    error => {
      console.error(`Failed to load ${MAP_MODEL_URL}; using fallback arena.`, error);
    }
  );

  return root;
};
