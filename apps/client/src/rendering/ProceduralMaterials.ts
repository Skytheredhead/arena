import {
  Color,
  DataTexture,
  LinearFilter,
  MeshPhysicalMaterial,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
  Vector2,
} from 'three';
import type { MapMaterial } from '@arena/shared';

interface ArenaWetnessShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

const SHADER_MAIN = 'void main() {';
const ROUGHNESS_CHUNK = '#include <roughnessmap_fragment>';

export const applyArenaWetnessShader = (
  shader: ArenaWetnessShader,
  wetness: number
): void => {
  shader.uniforms.arenaWetness = {
    value: Math.max(0, Math.min(1, wetness)),
  };

  if (
    !shader.vertexShader.includes(SHADER_MAIN) ||
    !shader.fragmentShader.includes(SHADER_MAIN) ||
    !shader.fragmentShader.includes(ROUGHNESS_CHUNK)
  ) {
    return;
  }

  shader.vertexShader = shader.vertexShader.replace(
    SHADER_MAIN,
    `
      varying vec2 vArenaPuddleCoord;
      void main() {
        vArenaPuddleCoord = (modelMatrix * vec4(position, 1.0)).xz;
    `
  );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      SHADER_MAIN,
      `
        uniform float arenaWetness;
        varying vec2 vArenaPuddleCoord;
        void main() {
      `
    )
    .replace(
      ROUGHNESS_CHUNK,
      `
        #include <roughnessmap_fragment>
        float arenaMicroPuddle =
          0.5 +
          0.5 * sin(
            vArenaPuddleCoord.x * 4.3 +
            sin(vArenaPuddleCoord.y * 3.1)
          );
        roughnessFactor = mix(
          roughnessFactor,
          max(0.055, roughnessFactor * 0.58),
          arenaWetness * arenaMicroPuddle * 0.28
        );
      `
    );
};

const seededNoise = (seedValue: number): (() => number) => {
  let seed = seedValue >>> 0 || 1;
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    return ((seed ^ (seed >>> 14)) >>> 0) / 0x1_0000_0000;
  };
};

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const materialReadabilityFill = (
  definition: Readonly<MapMaterial>
): number => {
  if (definition.emissive != null) {
    return Math.max(0, definition.emissiveIntensity ?? 1);
  }
  return Math.min(
    0.55,
    Math.max(0.2, 0.22 + Math.max(0, Math.min(1, definition.metalness)) * 0.32)
  );
};

const makeProceduralSurfaceTexture = (seed: number): DataTexture => {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  const random = seededNoise(seed);
  const coarse = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const wave =
        Math.sin(x * 0.37 + seed * 0.0001) * 0.14 +
        Math.cos(y * 0.29 - seed * 0.0002) * 0.1;
      coarse[y * size + x] = random() * 0.72 + wave;
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const left = coarse[y * size + ((x - 1 + size) % size)] ?? 0;
      const right = coarse[y * size + ((x + 1) % size)] ?? 0;
      const up = coarse[((y - 1 + size) % size) * size + x] ?? 0;
      const down = coarse[((y + 1) % size) * size + x] ?? 0;
      const dx = (right - left) * 0.55;
      const dy = (down - up) * 0.55;
      const length = Math.hypot(dx, dy, 1);
      const offset = index * 4;
      pixels[offset] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      pixels[offset + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      pixels[offset + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      pixels[offset + 3] = Math.round(
        Math.max(0, Math.min(1, coarse[index] ?? 0)) * 255
      );
    }
  }

  const texture = new DataTexture(
    pixels,
    size,
    size,
    RGBAFormat,
    UnsignedByteType
  );
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  texture.name = `arena-procedural-surface-${seed.toString(16)}`;
  return texture;
};

export class ProceduralMaterialLibrary {
  readonly #materials = new Map<string, MeshPhysicalMaterial>();
  readonly #textures: DataTexture[] = [];

  constructor(definitions: readonly MapMaterial[]) {
    for (const definition of definitions) {
      const normalMap = makeProceduralSurfaceTexture(hashString(definition.id));
      this.#textures.push(normalMap);

      const transparent =
        (definition.opacity ?? 1) < 1 || (definition.transmission ?? 0) > 0;
      const emissiveColor = definition.emissive ?? definition.baseColor;
      const material = new MeshPhysicalMaterial({
        name: `arena-${definition.id}`,
        color: new Color(definition.baseColor),
        roughness: Math.max(0.04, Math.min(1, definition.roughness)),
        metalness: Math.max(0, Math.min(1, definition.metalness)),
        clearcoat: Math.max(0, Math.min(1, definition.clearcoat ?? 0)),
        clearcoatRoughness: Math.max(
          0.02,
          Math.min(1, definition.clearcoatRoughness ?? 0.25)
        ),
        transmission: Math.max(0, Math.min(1, definition.transmission ?? 0)),
        opacity: Math.max(0.05, Math.min(1, definition.opacity ?? 1)),
        transparent,
        emissive: new Color(emissiveColor),
        emissiveIntensity: materialReadabilityFill(definition),
        normalMap,
        normalScale: new Vector2(0.22, 0.22),
        depthWrite: !transparent,
      });
      material.envMapIntensity = 1.1 + (definition.rainResponse ?? 0) * 0.75;
      material.onBeforeCompile = (shader) => {
        applyArenaWetnessShader(shader, definition.rainResponse ?? 0);
      };
      material.customProgramCacheKey = () =>
        `arena-wet-${definition.id}-${definition.rainResponse ?? 0}`;
      this.#materials.set(definition.id, material);
    }
  }

  get(id: string): MeshPhysicalMaterial {
    const material = this.#materials.get(id);
    if (material) return material;
    const fallback = this.#materials.values().next().value;
    if (!fallback) throw new Error(`No procedural map material for ${id}`);
    return fallback;
  }

  dispose(): void {
    for (const material of this.#materials.values()) material.dispose();
    for (const texture of this.#textures) texture.dispose();
    this.#materials.clear();
    this.#textures.length = 0;
  }
}
