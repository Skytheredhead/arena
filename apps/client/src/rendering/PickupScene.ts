import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
} from 'three';
import type { ArenaMapDefinition } from '@arena/shared';
import type { PickupSnapshot } from '../netcode/contracts';

interface PickupVisual {
  root: Group;
  baseY: number;
  phase: number;
}

export class PickupScene {
  readonly object = new Group();
  readonly #visuals = new Map<string, PickupVisual>();
  readonly #healthMaterial = new MeshStandardMaterial({
    color: new Color('#0a7048'),
    roughness: 0.24,
    metalness: 0.42,
    emissive: new Color('#00ff91'),
    emissiveIntensity: 1.5,
  });
  readonly #ammoMaterial = new MeshStandardMaterial({
    color: new Color('#7b5513'),
    roughness: 0.3,
    metalness: 0.65,
    emissive: new Color('#ffbd37'),
    emissiveIntensity: 1.25,
  });

  constructor(map: ArenaMapDefinition) {
    this.object.name = 'arena-pickups';
    map.pickups.forEach((pickup, index) => {
      const root = new Group();
      root.name = `pickup-${pickup.id}`;
      root.position.fromArray(pickup.position);
      const material =
        pickup.kind === 'health' ? this.#healthMaterial : this.#ammoMaterial;
      if (pickup.kind === 'health') {
        const vertical = new Mesh(new BoxGeometry(0.18, 0.62, 0.18), material);
        const horizontal = new Mesh(new BoxGeometry(0.62, 0.18, 0.18), material);
        root.add(vertical, horizontal);
      } else {
        for (let cartridge = -1; cartridge <= 1; cartridge += 1) {
          const box = new Mesh(new BoxGeometry(0.13, 0.44, 0.13), material);
          box.position.x = cartridge * 0.17;
          box.rotation.z = cartridge * 0.12;
          root.add(box);
        }
      }
      const light = new PointLight(
        pickup.kind === 'health' ? '#00ff91' : '#ffbd37',
        0.8,
        3.2,
        2
      );
      light.position.y = 0.4;
      root.add(light);
      this.object.add(root);
      this.#visuals.set(pickup.id, {
        root,
        baseY: pickup.position[1] + 0.65,
        phase: index * 1.37,
      });
    });
  }

  apply(snapshot: PickupSnapshot): void {
    const visual = this.#visuals.get(snapshot.id);
    if (!visual) return;
    visual.root.visible = snapshot.active;
    visual.root.position.set(
      snapshot.position.x,
      snapshot.position.y + 0.65,
      snapshot.position.z
    );
    visual.baseY = snapshot.position.y + 0.65;
  }

  update(elapsedSeconds: number): void {
    for (const visual of this.#visuals.values()) {
      visual.root.rotation.y =
        elapsedSeconds * 1.25 + Math.sin(elapsedSeconds * 0.8 + visual.phase) * 0.2;
      visual.root.position.y =
        visual.baseY + Math.sin(elapsedSeconds * 2.1 + visual.phase) * 0.12;
    }
  }

  dispose(): void {
    this.object.traverse((child) => {
      if (child instanceof Mesh) {
        const typedChild = child as Mesh<BoxGeometry, MeshStandardMaterial>;
        typedChild.geometry.dispose();
      }
    });
    this.#healthMaterial.dispose();
    this.#ammoMaterial.dispose();
    this.#visuals.clear();
    this.object.clear();
  }
}
