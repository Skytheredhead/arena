import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type {
  ArenaMapDefinition,
  MapBox,
  MapCylinder,
  MapRamp,
  MapSign,
} from '@arena/shared';
import { ProceduralMaterialLibrary } from './ProceduralMaterials';
import type { QualityPreset } from '../netcode/contracts';

const unitBox = new BoxGeometry(1, 1, 1);
const unitCylinder = new CylinderGeometry(1, 1, 1, 16, 1, false);
const identityQuaternion = new Quaternion();

const makeRampGeometry = (ramp: MapRamp): BufferGeometry => {
  const low = ramp.baseY - 0.18;
  const x0 = ramp.minX;
  const x1 = ramp.maxX;
  const z0 = ramp.minZ;
  const z1 = ramp.maxZ;
  const positive = ramp.ascending === 'positive';
  const lowY = positive ? ramp.baseY : ramp.topY;
  const highY = positive ? ramp.topY : ramp.baseY;
  const y00 = lowY;
  const y10 = ramp.axis === 'x' ? highY : lowY;
  const y01 = ramp.axis === 'x' ? lowY : highY;
  const y11 = highY;
  const positions = [
    x0, y00, z0, x1, y10, z0, x1, y11, z1, x0, y01, z1,
    x0, low, z0, x1, low, z0, x1, low, z1, x0, low, z1,
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

interface CreatedSign {
  mesh: Mesh<BoxGeometry, MeshBasicMaterial>;
  texture: CanvasTexture;
}

const makeSign = (definition: MapSign): CreatedSign => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#02070d';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = definition.color;
    context.lineWidth = 8;
    context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    context.font = '700 54px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = definition.color;
    context.shadowBlur = 20;
    context.fillStyle = definition.color;
    context.fillText(
      definition.text.slice(0, 22),
      canvas.width / 2,
      canvas.height / 2
    );
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: DoubleSide,
    toneMapped: false,
  });
  const geometry = new BoxGeometry(definition.width, definition.height, 0.06);
  const mesh = new Mesh(geometry, material);
  mesh.position.fromArray(definition.position);
  mesh.rotation.y = definition.rotationY;
  return { mesh, texture };
};

export class MapScene {
  readonly object = new Group();
  readonly #map: ArenaMapDefinition;
  readonly #materials: ProceduralMaterialLibrary;
  readonly #ownedGeometries: BufferGeometry[] = [];
  readonly #signMaterials: MeshBasicMaterial[] = [];
  readonly #signTextures: CanvasTexture[] = [];
  readonly #lights: PointLight[] = [];
  #quality: QualityPreset;

  constructor(map: ArenaMapDefinition, quality: QualityPreset) {
    this.#map = map;
    this.#quality = quality;
    this.#materials = new ProceduralMaterialLibrary(map.materials);
    this.object.name = `arena-map-${map.id}`;
    this.#buildBoxes();
    this.#buildCylinders();
    this.#buildRamps();
    this.#buildSigns();
    this.#buildLights();
  }

  setQuality(quality: QualityPreset): void {
    this.#quality = quality;
    const visibleLightCount =
      quality === 'low'
        ? Math.min(5, this.#lights.length)
        : quality === 'medium'
          ? Math.min(10, this.#lights.length)
          : this.#lights.length;
    for (let index = 0; index < this.#lights.length; index += 1) {
      const light = this.#lights[index];
      if (light) light.visible = index < visibleLightCount;
    }
  }

  isIndoors(position: Readonly<{ x: number; y: number; z: number }>): boolean {
    return (
      position.x > -17.5 &&
      position.x < 17.5 &&
      position.z > -13.5 &&
      position.z < 13.5 &&
      position.y < 8.5
    );
  }

  dispose(): void {
    this.#materials.dispose();
    for (const geometry of this.#ownedGeometries) geometry.dispose();
    for (const material of this.#signMaterials) material.dispose();
    for (const texture of this.#signTextures) texture.dispose();
    this.#ownedGeometries.length = 0;
    this.#signMaterials.length = 0;
    this.#signTextures.length = 0;
    this.#lights.length = 0;
    this.object.clear();
  }

  #buildBoxes(): void {
    const groups = new Map<string, MapBox[]>();
    for (const box of this.#map.boxes) {
      const existing = groups.get(box.materialId) ?? [];
      groups.set(box.materialId, [...existing, box]);
    }
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    for (const [materialId, boxes] of groups) {
      const mesh = new InstancedMesh(
        unitBox,
        this.#materials.get(materialId),
        boxes.length
      );
      mesh.name = `boxes-${materialId}`;
      mesh.castShadow = materialId !== 'reactor_glass';
      mesh.receiveShadow = true;
      boxes.forEach((box, index) => {
        position.fromArray(box.center);
        scale.fromArray(box.size);
        matrix.compose(position, identityQuaternion, scale);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.object.add(mesh);
    }
  }

  #buildCylinders(): void {
    const groups = new Map<string, MapCylinder[]>();
    for (const cylinder of this.#map.cylinders) {
      const existing = groups.get(cylinder.materialId) ?? [];
      groups.set(cylinder.materialId, [...existing, cylinder]);
    }
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    for (const [materialId, cylinders] of groups) {
      const mesh = new InstancedMesh(
        unitCylinder,
        this.#materials.get(materialId),
        cylinders.length
      );
      mesh.name = `cylinders-${materialId}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      cylinders.forEach((cylinder, index) => {
        position.fromArray(cylinder.center);
        scale.set(cylinder.radius, cylinder.height, cylinder.radius);
        matrix.compose(position, identityQuaternion, scale);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.object.add(mesh);
    }
  }

  #buildRamps(): void {
    for (const ramp of this.#map.ramps) {
      const geometry = makeRampGeometry(ramp);
      const mesh = new Mesh(geometry, this.#materials.get(ramp.materialId));
      mesh.name = ramp.id;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.object.add(mesh);
      this.#ownedGeometries.push(geometry);
    }
  }

  #buildSigns(): void {
    for (const sign of this.#map.signs) {
      const { mesh, texture } = makeSign(sign);
      mesh.name = sign.id;
      this.object.add(mesh);
      this.#ownedGeometries.push(mesh.geometry);
      this.#signMaterials.push(mesh.material);
      this.#signTextures.push(texture);
    }
  }

  #buildLights(): void {
    for (const definition of this.#map.lights) {
      const light = new PointLight(
        new Color(definition.color),
        definition.intensity,
        definition.range,
        1.7
      );
      light.name = definition.id;
      light.position.fromArray(definition.position);
      light.castShadow = false;
      this.object.add(light);
      this.#lights.push(light);
    }
    this.setQuality(this.#quality);
  }
}
