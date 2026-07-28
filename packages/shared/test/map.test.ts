import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ARENA_MAP,
  boxToAabb,
  horizontalDistance,
  isPlayerPositionBlocked,
  nearestNavWaypoint,
  rampHeightAt,
  resolveHorizontalMovement,
  selectSafestSpawn,
  surfaceHeightAt,
  validateArenaMap,
} from '../src/index.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.resolve(testDirectory, '..');
const repositoryRoot = path.resolve(packageDirectory, '..', '..');

describe('generated Neon Foundry map', () => {
  it('passes all structural and gameplay validation', () => {
    expect(validateArenaMap(ARENA_MAP)).toEqual([]);
  });

  it('is synchronized across the source, JSON, TypeScript, and Rust artifacts', () => {
    const result = spawnSync(
      process.execPath,
      [path.join(repositoryRoot, 'scripts/generate-map.mjs'), '--check'],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);

    const json = JSON.parse(
      readFileSync(
        path.join(packageDirectory, 'generated/arena-map.json'),
        'utf8'
      )
    ) as unknown;
    expect(json).toEqual(ARENA_MAP);

    const rust = readFileSync(
      path.join(packageDirectory, 'generated/arena_map.rs'),
      'utf8'
    );
    expect(rust).toContain(ARENA_MAP.contentHash);
    expect(rust).toContain('pub const ARENA_MAX_COMBATANTS: usize = 12_usize;');
    expect(rust).toContain('pub const ARENA_SPAWNS: &[MapSpawn]');
    expect(rust).toContain('pub const ARENA_NAV_WAYPOINTS: &[MapNavWaypoint]');
  });

  it('contains exactly twelve separated and unblocked spawn points', () => {
    expect(ARENA_MAP.maxCombatants).toBe(12);
    expect(ARENA_MAP.spawns).toHaveLength(12);
    expect(new Set(ARENA_MAP.spawns.map((spawn) => spawn.zone)).size).toBe(12);

    for (const spawn of ARENA_MAP.spawns) {
      expect(isPlayerPositionBlocked(ARENA_MAP, spawn.position)).toBe(false);
      expect(
        surfaceHeightAt(
          ARENA_MAP,
          spawn.position[0],
          spawn.position[2],
          spawn.position[1] + ARENA_MAP.world.maxStepHeight
        )
      ).toBeCloseTo(spawn.position[1], 4);
    }

    for (let left = 0; left < ARENA_MAP.spawns.length; left += 1) {
      for (let right = left + 1; right < ARENA_MAP.spawns.length; right += 1) {
        expect(
          horizontalDistance(
            ARENA_MAP.spawns[left]!.position,
            ARENA_MAP.spawns[right]!.position
          )
        ).toBeGreaterThanOrEqual(ARENA_MAP.world.minSpawnSeparation);
      }
    }
  });

  it('provides a reciprocal, fully connected bot navigation graph', () => {
    const byId = new Map(
      ARENA_MAP.navWaypoints.map((waypoint) => [waypoint.id, waypoint] as const)
    );
    for (const waypoint of ARENA_MAP.navWaypoints) {
      expect(waypoint.neighbors.length).toBeGreaterThan(0);
      for (const neighborId of waypoint.neighbors) {
        const neighbor = byId.get(neighborId);
        expect(neighbor, `${waypoint.id} -> ${neighborId}`).toBeDefined();
        expect(neighbor?.neighbors).toContain(waypoint.id);
      }
    }

    const visited = new Set<string>();
    const queue = [ARENA_MAP.navWaypoints[0]!.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      queue.push(...(byId.get(current)?.neighbors ?? []));
    }
    expect(visited.size).toBe(ARENA_MAP.navWaypoints.length);
    expect(new Set(ARENA_MAP.navWaypoints.map((waypoint) => waypoint.route))).toEqual(
      new Set(['spawn', 'interior', 'exterior', 'vertical', 'flank'])
    );
  });

  it('contains interior, exterior, vertical, and flank combat routes', () => {
    expect(ARENA_MAP.routeGroups.map((group) => group.kind).sort()).toEqual([
      'exterior',
      'flank',
      'interior',
      'vertical',
    ]);
    expect(
      ARENA_MAP.boxes.some((item) => item.tags.includes('rain-shelter'))
    ).toBe(true);
    expect(
      ARENA_MAP.boxes.some((item) => item.tags.includes('roof-route'))
    ).toBe(true);
    expect(
      ARENA_MAP.navWaypoints.some((item) => item.route === 'flank')
    ).toBe(true);
    expect(
      ARENA_MAP.navWaypoints.some((item) => item.tags.includes('overlook'))
    ).toBe(true);
  });

  it('samples ramp and platform heights consistently', () => {
    const westRoofRamp = ARENA_MAP.ramps.find(
      (item) => item.id === 'west_roof_ramp'
    )!;
    expect(rampHeightAt(westRoofRamp, -29, 0)).toBeCloseTo(0);
    expect(rampHeightAt(westRoofRamp, -23.5, 0)).toBeCloseTo(4.5);
    expect(rampHeightAt(westRoofRamp, -18, 0)).toBeCloseTo(9);
    expect(rampHeightAt(westRoofRamp, -30, 0)).toBeNull();

    expect(surfaceHeightAt(ARENA_MAP, 0, 0, 10)).toBeCloseTo(9);
    expect(surfaceHeightAt(ARENA_MAP, 0, 0, 5)).toBeCloseTo(4.25);
    expect(surfaceHeightAt(ARENA_MAP, 0, 0, 1)).toBeCloseTo(0);
  });

  it('uses AABBs to stop wall penetration while preserving door openings', () => {
    const wall = ARENA_MAP.boxes.find((item) => item.id === 'foundry_nw')!;
    const wallAabb = boxToAabb(wall);
    expect(wallAabb.min[2]).toBeCloseTo(-14.5);
    expect(wallAabb.max[2]).toBeCloseTo(-13.5);

    const blocked = resolveHorizontalMovement(
      ARENA_MAP,
      [-10, 0, -16],
      [-10, 0, -13]
    );
    expect(blocked[2]).toBeLessThanOrEqual(-14.95);
    expect(blocked[2]).toBeGreaterThan(-16);

    const throughDoor = resolveHorizontalMovement(
      ARENA_MAP,
      [0, 0, -16],
      [0, 0, -13]
    );
    expect(throughDoor[2]).toBe(-13);
  });

  it('selects the spawn farthest from current threats deterministically', () => {
    const threatened = ARENA_MAP.spawns[0]!;
    const selected = selectSafestSpawn(ARENA_MAP, [
      { position: threatened.position, alive: true },
    ]);
    const selectedDistance = horizontalDistance(
      selected.position,
      threatened.position
    );
    for (const candidate of ARENA_MAP.spawns) {
      expect(selectedDistance).toBeGreaterThanOrEqual(
        horizontalDistance(candidate.position, threatened.position)
      );
    }
    expect(
      selectSafestSpawn(ARENA_MAP, [
        { position: threatened.position, alive: true },
      ]).id
    ).toBe(selected.id);
  });

  it('finds nearby waypoints and carries physically based rainy materials', () => {
    expect(nearestNavWaypoint(ARENA_MAP, [-45, 0, 36])?.id).toBe(
      'sw_spawn_nav'
    );
    expect(ARENA_MAP.atmosphere.rain.enabled).toBe(true);
    expect(ARENA_MAP.atmosphere.rain.dropsHigh).toBeGreaterThan(
      ARENA_MAP.atmosphere.rain.dropsMedium
    );
    expect(ARENA_MAP.atmosphere.rain.dropsMedium).toBeGreaterThan(
      ARENA_MAP.atmosphere.rain.dropsLow
    );
    expect(
      ARENA_MAP.materials.some(
        (item) =>
          (item.rainResponse ?? 0) > 0.8 &&
          (item.clearcoat ?? 0) > 0.5 &&
          item.roughness < 0.4
      )
    ).toBe(true);
    expect(JSON.stringify(ARENA_MAP)).not.toMatch(/https?:\/\//u);
  });
});
