import { describe, expect, it } from 'vitest';
import { ARENA_MAP } from '@arena/shared';
import {
  applyArenaWetnessShader,
  materialReadabilityFill,
} from '../rendering/ProceduralMaterials';

const shaderWithoutUv = () => ({
  uniforms: {} as Record<string, { value: unknown }>,
  vertexShader: `
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    void main() {
      float roughnessFactor = 1.0;
      #include <roughnessmap_fragment>
      gl_FragColor = vec4(vec3(roughnessFactor), 1.0);
    }
  `,
});

describe('procedural wetness shader', () => {
  it('uses an explicitly declared world-space varying instead of optional vUv', () => {
    const shader = shaderWithoutUv();

    applyArenaWetnessShader(shader, 0.75);

    expect(shader.uniforms.arenaWetness).toEqual({ value: 0.75 });
    expect(shader.vertexShader).toContain('varying vec2 vArenaPuddleCoord;');
    expect(shader.vertexShader).toContain('modelMatrix * vec4(position, 1.0)');
    expect(shader.fragmentShader).toContain('varying vec2 vArenaPuddleCoord;');
    expect(shader.fragmentShader).toContain('float arenaMicroPuddle');
    expect(shader.fragmentShader).not.toContain('vUv');
  });

  it('avoids partially injecting varyings when a required shader anchor is absent', () => {
    const shader = shaderWithoutUv();
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      ''
    );
    const originalVertex = shader.vertexShader;
    const originalFragment = shader.fragmentShader;

    applyArenaWetnessShader(shader, 2);

    expect(shader.uniforms.arenaWetness).toEqual({ value: 1 });
    expect(shader.vertexShader).toBe(originalVertex);
    expect(shader.fragmentShader).toBe(originalFragment);
  });
});

describe('procedural material readability fill', () => {
  const material = (id: string) => {
    const definition = ARENA_MAP.materials.find(
      (candidate) => candidate.id === id
    );
    if (!definition) throw new Error(`Missing test material ${id}`);
    return definition;
  };

  it('gives highly metallic surfaces more fill than concrete', () => {
    const concreteFill = materialReadabilityFill(material('dark_concrete'));
    const gunmetalFill = materialReadabilityFill(material('wet_gunmetal'));

    expect(concreteFill).toBeGreaterThanOrEqual(0.2);
    expect(gunmetalFill).toBeGreaterThan(concreteFill);
    expect(gunmetalFill).toBeLessThanOrEqual(0.55);
  });

  it('preserves explicitly authored emissive landmark intensity', () => {
    expect(materialReadabilityFill(material('reactor_glass'))).toBe(2.8);
  });
});
