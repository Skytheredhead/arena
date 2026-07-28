import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Object3D,
} from 'three';
import type { ArenaMapDefinition } from '@arena/shared';
import type { QualityPreset } from '../netcode/contracts';
import {
  rainDropCount,
  visualQualityProfile,
} from './VisualQuality';

const randomFactory = (initial: number): (() => number) => {
  let seed = initial >>> 0 || 1;
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x1_0000_0000;
  };
};

export class RainSystem {
  readonly object = new Object3D();
  readonly #map: ArenaMapDefinition;
  readonly #random = randomFactory(0x7a11_f011);
  #quality: QualityPreset;
  #geometry: BufferGeometry | null = null;
  #material: LineBasicMaterial | null = null;
  #positions = new Float32Array();
  #speeds = new Float32Array();

  constructor(map: ArenaMapDefinition, quality: QualityPreset) {
    this.#map = map;
    this.#quality = quality;
    this.object.name = 'procedural-rain';
    if (map.atmosphere.rain.enabled) this.#rebuild();
  }

  setQuality(quality: QualityPreset): void {
    if (quality === this.#quality) return;
    this.#quality = quality;
    this.#rebuild();
  }

  update(deltaSeconds: number): void {
    if (!this.#geometry || this.#positions.length === 0) return;
    const rain = this.#map.atmosphere.rain;
    const min = rain.boundsMin;
    const max = rain.boundsMax;
    const windX = rain.wind[0];
    const windY = rain.wind[1];
    const windZ = rain.wind[2];
    const count = this.#speeds.length;
    const dt = Math.min(0.05, Math.max(0, deltaSeconds));
    for (let index = 0; index < count; index += 1) {
      const offset = index * 6;
      const speed = this.#speeds[index] ?? 1;
      let x = (this.#positions[offset] ?? 0) + windX * dt * speed;
      let y = (this.#positions[offset + 1] ?? 0) + windY * dt * speed;
      let z = (this.#positions[offset + 2] ?? 0) + windZ * dt * speed;
      if (y < min[1] || x < min[0] || x > max[0] || z < min[2] || z > max[2]) {
        x = min[0] + this.#random() * (max[0] - min[0]);
        y = max[1] - this.#random() * 2;
        z = min[2] + this.#random() * (max[2] - min[2]);
      }
      this.#positions[offset] = x;
      this.#positions[offset + 1] = y;
      this.#positions[offset + 2] = z;
      this.#positions[offset + 3] =
        x - windX * (rain.dropLength / Math.abs(windY));
      this.#positions[offset + 4] = y + rain.dropLength;
      this.#positions[offset + 5] =
        z - windZ * (rain.dropLength / Math.abs(windY));
    }
    const attribute = this.#geometry.getAttribute('position');
    attribute.needsUpdate = true;
  }

  dispose(): void {
    this.#geometry?.dispose();
    this.#material?.dispose();
    this.#geometry = null;
    this.#material = null;
    this.#positions = new Float32Array();
    this.#speeds = new Float32Array();
    this.object.clear();
  }

  #rebuild(): void {
    this.#geometry?.dispose();
    this.#material?.dispose();
    this.object.clear();

    const count = rainDropCount(this.#map, this.#quality);
    const profile = visualQualityProfile(this.#quality);
    const rain = this.#map.atmosphere.rain;
    const min = rain.boundsMin;
    const max = rain.boundsMax;
    this.#positions = new Float32Array(count * 6);
    this.#speeds = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 6;
      const x = min[0] + this.#random() * (max[0] - min[0]);
      const y = min[1] + this.#random() * (max[1] - min[1]);
      const z = min[2] + this.#random() * (max[2] - min[2]);
      const speed = 0.72 + this.#random() * 0.58;
      this.#speeds[index] = speed;
      this.#positions[offset] = x;
      this.#positions[offset + 1] = y;
      this.#positions[offset + 2] = z;
      this.#positions[offset + 3] =
        x - rain.wind[0] * (rain.dropLength / Math.abs(rain.wind[1]));
      this.#positions[offset + 4] = y + rain.dropLength;
      this.#positions[offset + 5] =
        z - rain.wind[2] * (rain.dropLength / Math.abs(rain.wind[1]));
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.#positions, 3));
    const material = new LineBasicMaterial({
      color: new Color('#8fc9df'),
      transparent: true,
      opacity: profile.rainOpacity,
      depthWrite: false,
    });
    const lines = new LineSegments(geometry, material);
    lines.frustumCulled = false;
    lines.renderOrder = 4;
    this.#geometry = geometry;
    this.#material = material;
    this.object.add(lines);
  }
}
