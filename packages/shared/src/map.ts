import { ARENA_MAP_GENERATED } from './generated/arenaMap.generated.js';
import type {
  Aabb,
  ArenaMapDefinition,
  MapBox,
  MapRamp,
  MapSpawn,
  NavWaypoint,
  PlayerCollisionShape,
  SpawnThreat,
  Vec3,
} from './mapTypes.js';

const EPSILON = 1e-5;

export const ARENA_MAP: ArenaMapDefinition = ARENA_MAP_GENERATED;

export const DEFAULT_PLAYER_COLLISION: PlayerCollisionShape = {
  radius: ARENA_MAP.world.playerRadius,
  height: ARENA_MAP.world.playerHeight,
};

export const boxToAabb = (box: MapBox): Aabb => {
  const halfX = box.size[0] / 2;
  const halfY = box.size[1] / 2;
  const halfZ = box.size[2] / 2;
  return {
    min: [
      box.center[0] - halfX,
      box.center[1] - halfY,
      box.center[2] - halfZ,
    ],
    max: [
      box.center[0] + halfX,
      box.center[1] + halfY,
      box.center[2] + halfZ,
    ],
  };
};

export const rampHeightAt = (
  ramp: MapRamp,
  x: number,
  z: number
): number | null => {
  if (
    x < ramp.minX - EPSILON ||
    x > ramp.maxX + EPSILON ||
    z < ramp.minZ - EPSILON ||
    z > ramp.maxZ + EPSILON
  ) {
    return null;
  }
  const extent =
    ramp.axis === 'x' ? ramp.maxX - ramp.minX : ramp.maxZ - ramp.minZ;
  if (extent <= EPSILON) return null;
  const raw =
    ramp.axis === 'x'
      ? (x - ramp.minX) / extent
      : (z - ramp.minZ) / extent;
  const progress =
    ramp.ascending === 'positive' ? raw : Math.max(0, Math.min(1, 1 - raw));
  return ramp.baseY + (ramp.topY - ramp.baseY) * progress;
};

const insideBoxFootprint = (box: MapBox, x: number, z: number): boolean => {
  const aabb = boxToAabb(box);
  return (
    x >= aabb.min[0] - EPSILON &&
    x <= aabb.max[0] + EPSILON &&
    z >= aabb.min[2] - EPSILON &&
    z <= aabb.max[2] + EPSILON
  );
};

export const surfaceHeightAt = (
  map: ArenaMapDefinition,
  x: number,
  z: number,
  ceilingY = Number.POSITIVE_INFINITY
): number => {
  let result = map.world.floorY;
  for (const box of map.boxes) {
    if (!box.collision || !box.walkable || !insideBoxFootprint(box, x, z)) {
      continue;
    }
    const top = box.center[1] + box.size[1] / 2;
    if (top <= ceilingY + EPSILON && top > result) result = top;
  }
  for (const ramp of map.ramps) {
    const height = rampHeightAt(ramp, x, z);
    if (height != null && height <= ceilingY + EPSILON && height > result) {
      result = height;
    }
  }
  return result;
};

export const playerIntersectsBox = (
  position: Vec3,
  shape: PlayerCollisionShape,
  box: MapBox
): boolean => {
  if (!box.collision) return false;
  const aabb = boxToAabb(box);
  const feetY = position[1];
  const headY = feetY + shape.height;
  if (headY <= aabb.min[1] + EPSILON || feetY >= aabb.max[1] - EPSILON) {
    return false;
  }
  const closestX = Math.max(aabb.min[0], Math.min(position[0], aabb.max[0]));
  const closestZ = Math.max(aabb.min[2], Math.min(position[2], aabb.max[2]));
  const dx = position[0] - closestX;
  const dz = position[2] - closestZ;
  return dx * dx + dz * dz < shape.radius * shape.radius - EPSILON;
};

export const isPlayerPositionBlocked = (
  map: ArenaMapDefinition,
  position: Vec3,
  shape: PlayerCollisionShape = DEFAULT_PLAYER_COLLISION
): boolean =>
  map.boxes.some((box) => playerIntersectsBox(position, shape, box));

export const clampToPlayableBounds = (
  map: ArenaMapDefinition,
  position: Vec3,
  radius = map.world.playerRadius
): Vec3 => {
  const { min, max } = map.world.playableBounds;
  return [
    Math.max(min[0] + radius, Math.min(max[0] - radius, position[0])),
    Math.max(min[1], Math.min(max[1], position[1])),
    Math.max(min[2] + radius, Math.min(max[2] - radius, position[2])),
  ];
};

export const resolveHorizontalMovement = (
  map: ArenaMapDefinition,
  from: Vec3,
  desired: Vec3,
  shape: PlayerCollisionShape = DEFAULT_PLAYER_COLLISION
): Vec3 => {
  const bounded = clampToPlayableBounds(map, desired, shape.radius);
  const verticalOverlap = (box: MapBox): boolean => {
    const aabb = boxToAabb(box);
    const feet = desired[1];
    const head = feet + shape.height;
    if (head <= aabb.min[1] + EPSILON || feet >= aabb.max[1] - EPSILON) {
      return false;
    }
    const canStepOnto =
      box.walkable &&
      aabb.max[1] <= feet + map.world.maxStepHeight + EPSILON;
    return !canStepOnto;
  };

  const sweepAxis = (
    axis: 'x' | 'z',
    start: number,
    target: number,
    fixed: number
  ): number => {
    let result = target;
    const axisIndex = axis === 'x' ? 0 : 2;
    const fixedIndex = axis === 'x' ? 2 : 0;
    const delta = target - start;
    for (const box of map.boxes) {
      if (!box.collision || !verticalOverlap(box)) continue;
      const aabb = boxToAabb(box);
      const fixedMin = aabb.min[fixedIndex] - shape.radius;
      const fixedMax = aabb.max[fixedIndex] + shape.radius;
      if (fixed < fixedMin || fixed > fixedMax) continue;
      const minimum = aabb.min[axisIndex] - shape.radius;
      const maximum = aabb.max[axisIndex] + shape.radius;
      if (delta > 0 && start <= minimum && result > minimum) {
        result = Math.min(result, minimum - EPSILON);
      } else if (delta < 0 && start >= maximum && result < maximum) {
        result = Math.max(result, maximum + EPSILON);
      }
    }
    return result;
  };

  let x = sweepAxis('x', from[0], bounded[0], from[2]);
  let z = sweepAxis('z', from[2], bounded[2], x);
  const xCandidate: Vec3 = [x, desired[1], from[2]];
  if (
    map.boxes.some(
      (box) =>
        verticalOverlap(box) && playerIntersectsBox(xCandidate, shape, box)
    )
  ) {
    x = from[0];
  }
  const zCandidate: Vec3 = [x, desired[1], z];
  if (
    map.boxes.some(
      (box) =>
        verticalOverlap(box) && playerIntersectsBox(zCandidate, shape, box)
    )
  ) {
    z = from[2];
  }

  return [x, desired[1], z];
};

export const distanceSquared3 = (left: Vec3, right: Vec3): number => {
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  const dz = left[2] - right[2];
  return dx * dx + dy * dy + dz * dz;
};

export const horizontalDistance = (left: Vec3, right: Vec3): number =>
  Math.hypot(left[0] - right[0], left[2] - right[2]);

export const nearestNavWaypoint = (
  map: ArenaMapDefinition,
  position: Vec3,
  allowedRoutes?: ReadonlySet<NavWaypoint['route']>
): NavWaypoint | null => {
  let nearest: NavWaypoint | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const waypoint of map.navWaypoints) {
    if (allowedRoutes && !allowedRoutes.has(waypoint.route)) continue;
    const distance = distanceSquared3(waypoint.position, position);
    if (distance < nearestDistance) {
      nearest = waypoint;
      nearestDistance = distance;
    }
  }
  return nearest;
};

export interface SafeSpawnOptions {
  readonly lastUsedTickBySpawnId?: Readonly<Record<string, number>>;
  readonly serverTick?: number;
  readonly lineOfSightBlocked?: (spawn: MapSpawn, threat: SpawnThreat) => boolean;
}

export const selectSafestSpawn = (
  map: ArenaMapDefinition,
  threats: readonly SpawnThreat[],
  options: SafeSpawnOptions = {}
): MapSpawn => {
  if (map.spawns.length === 0) {
    throw new Error('Arena map has no spawn points');
  }
  const livingThreats = threats.filter((threat) => threat.alive !== false);
  const serverTick = options.serverTick == null ? 0 : options.serverTick >>> 0;

  let best = map.spawns[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const spawn of map.spawns) {
    const nearestThreat =
      livingThreats.length === 0
        ? 100
        : Math.min(
            ...livingThreats.map((threat) =>
              horizontalDistance(spawn.position, threat.position)
            )
          );
    const occludedThreats = options.lineOfSightBlocked
      ? livingThreats.filter((threat) =>
          options.lineOfSightBlocked?.(spawn, threat)
        ).length
      : 0;
    const lastUsed = options.lastUsedTickBySpawnId?.[spawn.id];
    const age =
      lastUsed == null ? 600 : Math.min(600, (serverTick - lastUsed) >>> 0);
    const score = nearestThreat + occludedThreats * 6 + age / 60;
    if (score > bestScore || (score === bestScore && spawn.id < best.id)) {
      best = spawn;
      bestScore = score;
    }
  }
  return best;
};

const checkFiniteVec3 = (value: Vec3): boolean =>
  value.every((component) => Number.isFinite(component));

export const validateArenaMap = (map: ArenaMapDefinition): string[] => {
  const errors: string[] = [];
  const ids = new Set<string>();
  const addId = (category: string, id: string): void => {
    if (!id) errors.push(`${category} has an empty id`);
    if (ids.has(id)) errors.push(`Duplicate map id: ${id}`);
    ids.add(id);
  };

  if (map.maxCombatants !== 12) {
    errors.push(`Expected 12 combatants, received ${map.maxCombatants}`);
  }
  if (map.spawns.length !== map.maxCombatants) {
    errors.push(
      `Expected ${map.maxCombatants} spawns, received ${map.spawns.length}`
    );
  }
  if (!/^[a-f0-9]{64}$/u.test(map.contentHash)) {
    errors.push('Map contentHash must be a SHA-256 hex digest');
  }
  if (map.tickRate !== 60) errors.push('Map tick rate must be 60 Hz');

  const materialIds = new Set(map.materials.map((item) => item.id));
  for (const item of map.materials) addId('material', item.id);
  for (const item of map.boxes) {
    addId('box', item.id);
    if (!checkFiniteVec3(item.center) || !checkFiniteVec3(item.size)) {
      errors.push(`Box ${item.id} has non-finite geometry`);
    }
    if (item.size.some((component) => component <= 0)) {
      errors.push(`Box ${item.id} must have positive dimensions`);
    }
    if (!materialIds.has(item.materialId)) {
      errors.push(`Box ${item.id} references missing material ${item.materialId}`);
    }
  }
  for (const item of map.ramps) {
    addId('ramp', item.id);
    if (
      item.maxX <= item.minX ||
      item.maxZ <= item.minZ ||
      item.topY <= item.baseY
    ) {
      errors.push(`Ramp ${item.id} has invalid extents`);
    }
    if (!materialIds.has(item.materialId)) {
      errors.push(`Ramp ${item.id} references missing material ${item.materialId}`);
    }
  }
  for (const item of map.cylinders) {
    addId('cylinder', item.id);
    if (item.radius <= 0 || item.height <= 0) {
      errors.push(`Cylinder ${item.id} has invalid dimensions`);
    }
    if (!materialIds.has(item.materialId)) {
      errors.push(
        `Cylinder ${item.id} references missing material ${item.materialId}`
      );
    }
  }
  for (const item of map.lights) addId('light', item.id);
  for (const item of map.signs) addId('sign', item.id);
  for (const item of map.pickups) addId('pickup', item.id);
  for (const item of map.routeGroups) addId('route group', item.id);

  const waypointById = new Map(
    map.navWaypoints.map((item) => [item.id, item] as const)
  );
  for (const item of map.navWaypoints) {
    addId('waypoint', item.id);
    if (!checkFiniteVec3(item.position)) {
      errors.push(`Waypoint ${item.id} has a non-finite position`);
    }
    for (const neighborId of item.neighbors) {
      const neighbor = waypointById.get(neighborId);
      if (!neighbor) {
        errors.push(`Waypoint ${item.id} has missing neighbor ${neighborId}`);
      } else if (!neighbor.neighbors.includes(item.id)) {
        errors.push(`Waypoint edge ${item.id}<->${neighborId} is not reciprocal`);
      }
    }
  }

  if (map.navWaypoints.length > 0) {
    const visited = new Set<string>();
    const queue = [map.navWaypoints[0]!.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const waypoint = waypointById.get(current);
      if (waypoint) queue.push(...waypoint.neighbors);
    }
    if (visited.size !== map.navWaypoints.length) {
      errors.push(
        `Navigation graph is disconnected: reached ${visited.size}/${map.navWaypoints.length}`
      );
    }
  }

  const requiredRoutes = new Set(['interior', 'exterior', 'vertical', 'flank']);
  for (const waypoint of map.navWaypoints) requiredRoutes.delete(waypoint.route);
  for (const missing of requiredRoutes) {
    errors.push(`Navigation graph is missing ${missing} routes`);
  }

  const spawnIds = new Set<string>();
  for (const item of map.spawns) {
    addId('spawn', item.id);
    spawnIds.add(item.id);
    if (!waypointById.has(item.navWaypointId)) {
      errors.push(
        `Spawn ${item.id} references missing waypoint ${item.navWaypointId}`
      );
    }
    if (isPlayerPositionBlocked(map, item.position)) {
      errors.push(`Spawn ${item.id} is blocked by collision geometry`);
    }
    const floor = surfaceHeightAt(
      map,
      item.position[0],
      item.position[2],
      item.position[1] + map.world.maxStepHeight
    );
    if (Math.abs(floor - item.position[1]) > 0.05) {
      errors.push(`Spawn ${item.id} is not on a walkable surface`);
    }
  }
  if (spawnIds.size !== map.spawns.length) {
    errors.push('Spawn ids are not unique');
  }
  for (let left = 0; left < map.spawns.length; left += 1) {
    for (let right = left + 1; right < map.spawns.length; right += 1) {
      const distance = horizontalDistance(
        map.spawns[left]!.position,
        map.spawns[right]!.position
      );
      if (distance + EPSILON < map.world.minSpawnSeparation) {
        errors.push(
          `Spawns ${map.spawns[left]!.id} and ${map.spawns[right]!.id} are only ${distance.toFixed(2)}m apart`
        );
      }
    }
  }

  return errors;
};
