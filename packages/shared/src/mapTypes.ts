export type Vec3 = readonly [x: number, y: number, z: number];
export type MapBoxKind =
  | 'floor'
  | 'wall'
  | 'cover'
  | 'platform'
  | 'roof';
export type RampAxis = 'x' | 'z';
export type RampAscent = 'positive' | 'negative';
export type NavRoute =
  | 'spawn'
  | 'interior'
  | 'exterior'
  | 'vertical'
  | 'flank';
export type PickupKind = 'ammo' | 'health';

export interface MapMaterial {
  readonly id: string;
  readonly baseColor: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly rainResponse?: number;
  readonly transmission?: number;
  readonly opacity?: number;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
}

export interface MapBox {
  readonly id: string;
  readonly center: Vec3;
  readonly size: Vec3;
  readonly materialId: string;
  readonly kind: MapBoxKind;
  readonly tags: readonly string[];
  readonly collision: boolean;
  readonly walkable: boolean;
}

export interface MapRamp {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly baseY: number;
  readonly topY: number;
  readonly axis: RampAxis;
  readonly ascending: RampAscent;
  readonly materialId: string;
  readonly tags: readonly string[];
}

export interface MapCylinder {
  readonly id: string;
  readonly center: Vec3;
  readonly radius: number;
  readonly height: number;
  readonly materialId: string;
  readonly tags: readonly string[];
}

export interface MapLight {
  readonly id: string;
  readonly position: Vec3;
  readonly color: string;
  readonly intensity: number;
  readonly range: number;
  readonly kind: 'point' | 'spot';
}

export interface MapSign {
  readonly id: string;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly text: string;
  readonly color: string;
  readonly width: number;
  readonly height: number;
}

export interface MapSpawn {
  readonly id: string;
  readonly position: Vec3;
  readonly yaw: number;
  readonly zone: string;
  readonly navWaypointId: string;
  readonly safeRadius: number;
  readonly coverFacing: number;
}

export interface MapPickup {
  readonly id: string;
  readonly kind: PickupKind;
  readonly position: Vec3;
  readonly respawnTicks: number;
}

export interface NavWaypoint {
  readonly id: string;
  readonly position: Vec3;
  readonly neighbors: readonly string[];
  readonly route: NavRoute;
  readonly tags: readonly string[];
}

export interface RouteGroup {
  readonly id: string;
  readonly kind: Exclude<NavRoute, 'spawn'>;
  readonly description: string;
}

export interface ArenaMapDefinition {
  readonly schemaVersion: number;
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly tickRate: number;
  readonly maxCombatants: number;
  readonly contentHash: string;
  readonly world: {
    readonly floorY: number;
    readonly playableBounds: {
      readonly min: Vec3;
      readonly max: Vec3;
    };
    readonly killY: number;
    readonly playerRadius: number;
    readonly playerHeight: number;
    readonly maxStepHeight: number;
    readonly minSpawnSeparation: number;
    readonly spawnProtectionTicks: number;
  };
  readonly atmosphere: {
    readonly skyColor: string;
    readonly fogColor: string;
    readonly fogNear: number;
    readonly fogFar: number;
    readonly ambientColor: string;
    readonly ambientIntensity: number;
    readonly rain: {
      readonly enabled: boolean;
      readonly boundsMin: Vec3;
      readonly boundsMax: Vec3;
      readonly dropsHigh: number;
      readonly dropsMedium: number;
      readonly dropsLow: number;
      readonly dropLength: number;
      readonly wind: Vec3;
      readonly splashRate: number;
    };
  };
  readonly materials: readonly MapMaterial[];
  readonly routeGroups: readonly RouteGroup[];
  readonly boxes: readonly MapBox[];
  readonly ramps: readonly MapRamp[];
  readonly cylinders: readonly MapCylinder[];
  readonly lights: readonly MapLight[];
  readonly signs: readonly MapSign[];
  readonly spawns: readonly MapSpawn[];
  readonly pickups: readonly MapPickup[];
  readonly navWaypoints: readonly NavWaypoint[];
}

export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface PlayerCollisionShape {
  readonly radius: number;
  readonly height: number;
}

export interface SpawnThreat {
  readonly position: Vec3;
  readonly alive?: boolean;
}
