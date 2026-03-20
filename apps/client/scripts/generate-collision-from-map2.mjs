import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const mapPath = path.resolve(__dirname, '../public/Map2.glb');
const sharedOutputPath = path.resolve(repoRoot, 'packages/shared/src/generatedCollision.ts');
const serverOutputPath = path.resolve(repoRoot, 'apps/server/src/generated_collision.rs');

const FLOOR_MAX_Y = 0.25;
const FLOOR_MIN_HALF_EXTENT = 5;

const toFixed = (value, digits) => Number(value).toFixed(digits);

const normalizeYaw = yaw => {
  let next = yaw;
  while (next > Math.PI) {
    next -= Math.PI * 2;
  }
  while (next < -Math.PI) {
    next += Math.PI * 2;
  }
  return next;
};

const mapFile = fs.readFileSync(mapPath);
const loader = new GLTFLoader();

loader.parse(
  mapFile.buffer.slice(mapFile.byteOffset, mapFile.byteOffset + mapFile.byteLength),
  '',
  gltf => {
    gltf.scene.updateMatrixWorld(true);

    const blocks = [];
    gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }

      const geometry = object.geometry;
      geometry.computeBoundingBox();
      const bounding = geometry.boundingBox;
      if (!bounding) {
        return;
      }

      const localSize = new THREE.Vector3();
      const localCenter = new THREE.Vector3();
      bounding.getSize(localSize);
      bounding.getCenter(localCenter);

      const worldPosition = new THREE.Vector3();
      const worldQuaternion = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      object.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);

      const worldCenter = localCenter.clone().applyMatrix4(object.matrixWorld);
      const halfX = Math.abs(localSize.x * worldScale.x) * 0.5;
      const halfY = Math.abs(localSize.y * worldScale.y) * 0.5;
      const halfZ = Math.abs(localSize.z * worldScale.z) * 0.5;

      const minY = worldCenter.y - halfY;
      const maxY = worldCenter.y + halfY;

      const isLargeFloorSlab =
        maxY <= FLOOR_MAX_Y &&
        halfX >= FLOOR_MIN_HALF_EXTENT &&
        halfZ >= FLOOR_MIN_HALF_EXTENT;
      if (isLargeFloorSlab) {
        return;
      }

      const euler = new THREE.Euler().setFromQuaternion(worldQuaternion, 'YXZ');
      blocks.push({
        centerX: worldCenter.x,
        centerZ: worldCenter.z,
        minY,
        maxY,
        halfX,
        halfZ,
        yaw: normalizeYaw(euler.y)
      });
    });

    const sharedLines = [];
    sharedLines.push("import type { ArenaBlock } from './map';");
    sharedLines.push('');
    sharedLines.push('export const GENERATED_ARENA_BLOCKS: ArenaBlock[] = [');
    for (const block of blocks) {
      sharedLines.push('  {');
      sharedLines.push(`    centerX: ${toFixed(block.centerX, 5)},`);
      sharedLines.push(`    centerZ: ${toFixed(block.centerZ, 5)},`);
      sharedLines.push(`    minY: ${toFixed(block.minY, 5)},`);
      sharedLines.push(`    maxY: ${toFixed(block.maxY, 5)},`);
      sharedLines.push(`    halfX: ${toFixed(block.halfX, 5)},`);
      sharedLines.push(`    halfZ: ${toFixed(block.halfZ, 5)},`);
      sharedLines.push(`    yaw: ${toFixed(block.yaw, 6)},`);
      sharedLines.push("    color: '#64748b'");
      sharedLines.push('  },');
    }
    sharedLines.push('];');
    sharedLines.push('');

    const serverLines = [];
    serverLines.push('use super::Block;');
    serverLines.push('');
    serverLines.push(`pub const ARENA_BLOCKS: [Block; ${blocks.length}] = [`);
    for (const block of blocks) {
      serverLines.push('    Block {');
      serverLines.push(`        center_x: ${toFixed(block.centerX, 5)},`);
      serverLines.push(`        center_z: ${toFixed(block.centerZ, 5)},`);
      serverLines.push(`        min_y: ${toFixed(block.minY, 5)},`);
      serverLines.push(`        max_y: ${toFixed(block.maxY, 5)},`);
      serverLines.push(`        half_x: ${toFixed(block.halfX, 5)},`);
      serverLines.push(`        half_z: ${toFixed(block.halfZ, 5)},`);
      serverLines.push(`        yaw: ${toFixed(block.yaw, 6)},`);
      serverLines.push('    },');
    }
    serverLines.push('];');
    serverLines.push('');

    fs.writeFileSync(sharedOutputPath, `${sharedLines.join('\n')}`, 'utf8');
    fs.writeFileSync(serverOutputPath, `${serverLines.join('\n')}`, 'utf8');
    console.log(`Generated ${blocks.length} collision blocks from ${path.basename(mapPath)}.`);
    console.log(`Updated:\n- ${sharedOutputPath}\n- ${serverOutputPath}`);
  },
  error => {
    console.error('Failed to parse map file.', error);
    process.exit(1);
  }
);
