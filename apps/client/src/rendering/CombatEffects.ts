import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Object3D,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';
import type { Vector3Like, WeaponSlot } from '../netcode/contracts';

interface Particle {
  position: Vector3;
  velocity: Vector3;
  color: Color;
  life: number;
  maxLife: number;
}

interface Tracer {
  from: Vector3;
  to: Vector3;
  life: number;
  maxLife: number;
  color: Color;
}

const randomDirection = (): Vector3 => {
  const vector = new Vector3(
    Math.random() * 2 - 1,
    Math.random() * 1.3,
    Math.random() * 2 - 1
  );
  return vector.lengthSq() < 0.001 ? new Vector3(0, 1, 0) : vector.normalize();
};

export class CombatEffects {
  readonly object = new Object3D();
  readonly #particleGeometry = new BufferGeometry();
  readonly #particleMaterial = new PointsMaterial({
    size: 0.075,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    vertexColors: true,
    blending: AdditiveBlending,
  });
  readonly #tracerGeometry = new BufferGeometry();
  readonly #tracerMaterial = new LineBasicMaterial({
    transparent: true,
    opacity: 0.78,
    vertexColors: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  readonly #particles: Particle[] = [];
  readonly #tracers: Tracer[] = [];
  readonly #points: Points;
  readonly #lines: LineSegments;

  constructor() {
    this.object.name = 'combat-effects';
    this.#points = new Points(this.#particleGeometry, this.#particleMaterial);
    this.#lines = new LineSegments(this.#tracerGeometry, this.#tracerMaterial);
    this.#points.frustumCulled = false;
    this.#lines.frustumCulled = false;
    this.object.add(this.#points, this.#lines);
    this.#syncGeometry();
  }

  spawnImpact(
    position: Readonly<Vector3Like>,
    normal: Readonly<Vector3Like> = { x: 0, y: 1, z: 0 },
    kind: 'metal' | 'concrete' | 'body' = 'concrete'
  ): void {
    const color =
      kind === 'metal'
        ? new Color('#8feeff')
        : kind === 'body'
          ? new Color('#ff315d')
          : new Color('#ffcc79');
    const origin = new Vector3(position.x, position.y, position.z);
    const normalVector = new Vector3(normal.x, normal.y, normal.z).normalize();
    const count = kind === 'metal' ? 12 : 8;
    for (let index = 0; index < count; index += 1) {
      const direction = randomDirection()
        .addScaledVector(normalVector, 1.45)
        .normalize();
      const speed = 1.5 + Math.random() * 5;
      this.#particles.push({
        position: origin.clone(),
        velocity: direction.multiplyScalar(speed),
        color: color.clone(),
        life: 0.2 + Math.random() * 0.28,
        maxLife: 0.48,
      });
    }
    if (this.#particles.length > 180) {
      this.#particles.splice(0, this.#particles.length - 180);
    }
  }

  spawnTracer(
    from: Readonly<Vector3Like>,
    to: Readonly<Vector3Like>,
    weapon: WeaponSlot
  ): void {
    const color =
      weapon === 2
        ? new Color('#e6fbff')
        : weapon === 3
          ? new Color('#ffb35a')
          : new Color('#00efff');
    this.#tracers.push({
      from: new Vector3(from.x, from.y, from.z),
      to: new Vector3(to.x, to.y, to.z),
      life: weapon === 2 ? 0.12 : 0.075,
      maxLife: weapon === 2 ? 0.12 : 0.075,
      color,
    });
    if (this.#tracers.length > 36) this.#tracers.shift();
  }

  update(deltaSeconds: number): void {
    const dt = Math.max(0, Math.min(0.05, deltaSeconds));
    for (let index = this.#particles.length - 1; index >= 0; index -= 1) {
      const particle = this.#particles[index];
      if (!particle) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        this.#particles.splice(index, 1);
        continue;
      }
      particle.velocity.y -= 8.5 * dt;
      particle.position.addScaledVector(particle.velocity, dt);
    }
    for (let index = this.#tracers.length - 1; index >= 0; index -= 1) {
      const tracer = this.#tracers[index];
      if (!tracer) continue;
      tracer.life -= dt;
      if (tracer.life <= 0) this.#tracers.splice(index, 1);
    }
    this.#syncGeometry();
  }

  dispose(): void {
    this.#particleGeometry.dispose();
    this.#particleMaterial.dispose();
    this.#tracerGeometry.dispose();
    this.#tracerMaterial.dispose();
    this.#particles.length = 0;
    this.#tracers.length = 0;
    this.object.clear();
  }

  #syncGeometry(): void {
    const particlePositions = new Float32Array(this.#particles.length * 3);
    const particleColors = new Float32Array(this.#particles.length * 3);
    this.#particles.forEach((particle, index) => {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      particle.position.toArray(particlePositions, index * 3);
      particleColors[index * 3] = particle.color.r * alpha;
      particleColors[index * 3 + 1] = particle.color.g * alpha;
      particleColors[index * 3 + 2] = particle.color.b * alpha;
    });
    this.#particleGeometry.setAttribute(
      'position',
      new BufferAttribute(particlePositions, 3)
    );
    this.#particleGeometry.setAttribute(
      'color',
      new BufferAttribute(particleColors, 3)
    );

    const tracerPositions = new Float32Array(this.#tracers.length * 6);
    const tracerColors = new Float32Array(this.#tracers.length * 6);
    this.#tracers.forEach((tracer, index) => {
      const offset = index * 6;
      tracer.from.toArray(tracerPositions, offset);
      tracer.to.toArray(tracerPositions, offset + 3);
      const alpha = Math.max(0, tracer.life / tracer.maxLife);
      for (let vertex = 0; vertex < 2; vertex += 1) {
        const colorOffset = offset + vertex * 3;
        tracerColors[colorOffset] = tracer.color.r * alpha;
        tracerColors[colorOffset + 1] = tracer.color.g * alpha;
        tracerColors[colorOffset + 2] = tracer.color.b * alpha;
      }
    });
    this.#tracerGeometry.setAttribute(
      'position',
      new BufferAttribute(tracerPositions, 3)
    );
    this.#tracerGeometry.setAttribute(
      'color',
      new BufferAttribute(tracerColors, 3)
    );
  }
}
