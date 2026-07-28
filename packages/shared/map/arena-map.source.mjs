const v3 = (x, y, z) => [x, y, z];

const material = (
  id,
  baseColor,
  roughness,
  metalness,
  extras = {}
) => ({
  id,
  baseColor,
  roughness,
  metalness,
  ...extras,
});

const box = (
  id,
  center,
  size,
  materialId,
  kind,
  tags,
  collision = true,
  walkable = false
) => ({
  id,
  center,
  size,
  materialId,
  kind,
  tags,
  collision,
  walkable,
});

const ramp = (
  id,
  minX,
  maxX,
  minZ,
  maxZ,
  baseY,
  topY,
  axis,
  ascending,
  materialId,
  tags
) => ({
  id,
  minX,
  maxX,
  minZ,
  maxZ,
  baseY,
  topY,
  axis,
  ascending,
  materialId,
  tags,
});

const cylinder = (
  id,
  center,
  radius,
  height,
  materialId,
  tags
) => ({
  id,
  center,
  radius,
  height,
  materialId,
  tags,
});

const waypoint = (id, position, neighbors, route, tags = []) => ({
  id,
  position,
  neighbors,
  route,
  tags,
});

const spawn = (id, position, yaw, zone, navWaypointId, coverFacing) => ({
  id,
  position,
  yaw,
  zone,
  navWaypointId,
  safeRadius: 8,
  coverFacing,
});

const pickup = (id, kind, position, respawnTicks) => ({
  id,
  kind,
  position,
  respawnTicks,
});

const light = (id, position, color, intensity, range, kind = "point") => ({
  id,
  position,
  color,
  intensity,
  range,
  kind,
});

const sign = (id, position, rotationY, text, color, width, height) => ({
  id,
  position,
  rotationY,
  text,
  color,
  width,
  height,
});

const pushCrateCluster = (boxes, prefix, originX, originZ, rotation = 0) => {
  const offsets =
    rotation === 0
      ? [
          [0, 0, 2.4, 2.4],
          [2.7, 0.4, 2, 3.2],
          [-2.5, -0.3, 1.8, 1.8],
        ]
      : [
          [0, 0, 2.4, 2.4],
          [0.4, 2.7, 3.2, 2],
          [-0.3, -2.5, 1.8, 1.8],
        ];

  offsets.forEach(([dx, dz, sx, sz], index) => {
    const height = index === 1 ? 2.8 : 2.1;
    boxes.push(
      box(
        `${prefix}_${index + 1}`,
        v3(originX + dx, height / 2, originZ + dz),
        v3(sx, height, sz),
        index === 1 ? "hazard_yellow" : "painted_steel",
        "cover",
        ["cover", "industrial", "spawn-occluder"]
      )
    );
  });
};

export function buildArenaMap() {
  const boxes = [];
  const ramps = [];
  const cylinders = [];
  const lights = [];
  const signs = [];

  boxes.push(
    box(
      "world_floor",
      v3(0, -0.5, 0),
      v3(104, 1, 88),
      "wet_asphalt",
      "floor",
      ["exterior", "rain-wet", "walkable"],
      true,
      true
    ),
    box(
      "boundary_west",
      v3(-52.5, 5, 0),
      v3(1, 10, 89),
      "dark_concrete",
      "wall",
      ["boundary", "exterior"]
    ),
    box(
      "boundary_east",
      v3(52.5, 5, 0),
      v3(1, 10, 89),
      "dark_concrete",
      "wall",
      ["boundary", "exterior"]
    ),
    box(
      "boundary_north",
      v3(0, 5, -44.5),
      v3(106, 10, 1),
      "dark_concrete",
      "wall",
      ["boundary", "exterior"]
    ),
    box(
      "boundary_south",
      v3(0, 5, 44.5),
      v3(106, 10, 1),
      "dark_concrete",
      "wall",
      ["boundary", "exterior"]
    )
  );

  const shellWalls = [
    ["foundry_nw", v3(-11.5, 4, -14), v3(13, 8, 1)],
    ["foundry_ne", v3(11.5, 4, -14), v3(13, 8, 1)],
    ["foundry_sw", v3(-11.5, 4, 14), v3(13, 8, 1)],
    ["foundry_se", v3(11.5, 4, 14), v3(13, 8, 1)],
    ["foundry_wn", v3(-18, 4, -9), v3(1, 8, 10)],
    ["foundry_ws", v3(-18, 4, 9), v3(1, 8, 10)],
    ["foundry_en", v3(18, 4, -9), v3(1, 8, 10)],
    ["foundry_es", v3(18, 4, 9), v3(1, 8, 10)],
  ];
  shellWalls.forEach(([id, center, size]) => {
    boxes.push(
      box(
        id,
        center,
        size,
        "corrugated_steel",
        "wall",
        ["interior", "foundry-shell", "rain-shelter"]
      )
    );
  });

  boxes.push(
    box(
      "foundry_roof",
      v3(0, 8.5, 0),
      v3(36, 1, 28),
      "wet_gunmetal",
      "roof",
      ["vertical", "roof-route", "rain-wet", "walkable"],
      true,
      true
    ),
    box(
      "interior_catwalk",
      v3(0, 4, 0),
      v3(16, 0.5, 4),
      "grated_steel",
      "platform",
      ["interior", "vertical", "catwalk", "walkable"],
      true,
      true
    ),
    box(
      "west_loading_platform",
      v3(-35, 1, -25),
      v3(12, 2, 10),
      "wet_concrete",
      "platform",
      ["exterior", "vertical", "west-lane", "walkable"],
      true,
      true
    ),
    box(
      "east_transformer_platform",
      v3(35, 1, 24),
      v3(12, 2, 10),
      "wet_concrete",
      "platform",
      ["exterior", "vertical", "east-lane", "walkable"],
      true,
      true
    ),
    box(
      "north_service_bridge",
      v3(0, 2.8, -30),
      v3(18, 0.45, 3),
      "grated_steel",
      "platform",
      ["exterior", "vertical", "north-lane", "walkable"],
      true,
      true
    )
  );

  ramps.push(
    ramp(
      "west_roof_ramp",
      -29,
      -18,
      -2,
      2,
      0,
      9,
      "x",
      "positive",
      "grated_steel",
      ["vertical", "roof-route", "west-flank"]
    ),
    ramp(
      "east_roof_ramp",
      18,
      29,
      -2,
      2,
      0,
      9,
      "x",
      "negative",
      "grated_steel",
      ["vertical", "roof-route", "east-flank"]
    ),
    ramp(
      "interior_north_catwalk_ramp",
      -2,
      2,
      -12,
      -4,
      0,
      4.25,
      "z",
      "positive",
      "grated_steel",
      ["interior", "vertical", "catwalk"]
    ),
    ramp(
      "interior_south_catwalk_ramp",
      -2,
      2,
      4,
      12,
      0,
      4.25,
      "z",
      "negative",
      "grated_steel",
      ["interior", "vertical", "catwalk"]
    ),
    ramp(
      "west_loading_ramp",
      -44,
      -41,
      -27,
      -23,
      0,
      2,
      "x",
      "positive",
      "hazard_yellow",
      ["exterior", "vertical", "west-lane"]
    ),
    ramp(
      "east_transformer_ramp",
      41,
      44,
      22,
      26,
      0,
      2,
      "x",
      "negative",
      "hazard_yellow",
      ["exterior", "vertical", "east-lane"]
    ),
    ramp(
      "north_bridge_west_ramp",
      -12,
      -9,
      -31.5,
      -28.5,
      0,
      3.025,
      "x",
      "positive",
      "grated_steel",
      ["exterior", "vertical", "north-lane"]
    ),
    ramp(
      "north_bridge_east_ramp",
      9,
      12,
      -31.5,
      -28.5,
      0,
      3.025,
      "x",
      "negative",
      "grated_steel",
      ["exterior", "vertical", "north-lane"]
    )
  );

  [
    [-12, -9],
    [12, -9],
    [-12, 9],
    [12, 9],
  ].forEach(([x, z], index) => {
    boxes.push(
      box(
        `foundry_column_${index + 1}`,
        v3(x, 4, z),
        v3(1.4, 8, 1.4),
        "painted_steel",
        "wall",
        ["interior", "cover", "structural"]
      )
    );
  });

  boxes.push(
    box(
      "reactor_core_base",
      v3(0, 1, 0),
      v3(5.5, 2, 5.5),
      "dark_concrete",
      "cover",
      ["interior", "landmark", "cover"]
    ),
    box(
      "west_pipe_barrier",
      v3(-38, 1.2, 8),
      v3(2.2, 2.4, 14),
      "wet_gunmetal",
      "cover",
      ["exterior", "west-lane", "flank", "cover"]
    ),
    box(
      "east_pipe_barrier",
      v3(38, 1.2, -8),
      v3(2.2, 2.4, 14),
      "wet_gunmetal",
      "cover",
      ["exterior", "east-lane", "flank", "cover"]
    ),
    box(
      "south_checkpoint_left",
      v3(-8, 1.4, 31),
      v3(8, 2.8, 2),
      "painted_steel",
      "cover",
      ["exterior", "south-lane", "cover"]
    ),
    box(
      "south_checkpoint_right",
      v3(8, 1.4, 31),
      v3(8, 2.8, 2),
      "painted_steel",
      "cover",
      ["exterior", "south-lane", "cover"]
    )
  );

  pushCrateCluster(boxes, "southwest_crates", -30, 27, 0);
  pushCrateCluster(boxes, "southeast_crates", 30, 29, 1);
  pushCrateCluster(boxes, "northwest_crates", -31, -28, 1);
  pushCrateCluster(boxes, "northeast_crates", 31, -29, 0);
  pushCrateCluster(boxes, "interior_west_crates", -10, 3, 1);
  pushCrateCluster(boxes, "interior_east_crates", 10, -3, 1);

  cylinders.push(
    cylinder(
      "reactor_core",
      v3(0, 4, 0),
      2.2,
      6,
      "reactor_glass",
      ["interior", "landmark", "emissive"]
    ),
    cylinder(
      "northwest_coolant_tank",
      v3(-39, 3.5, -17),
      3.2,
      7,
      "wet_gunmetal",
      ["exterior", "landmark", "west-lane"]
    ),
    cylinder(
      "southeast_coolant_tank",
      v3(39, 3.5, 17),
      3.2,
      7,
      "wet_gunmetal",
      ["exterior", "landmark", "east-lane"]
    )
  );

  lights.push(
    light("reactor_light", v3(0, 5.5, 0), "#00f5ff", 36, 22),
    light("south_gate_light", v3(0, 6, 39), "#ff2fd1", 24, 20),
    light("north_bridge_light", v3(0, 6, -30), "#00f5ff", 22, 18),
    light("west_lane_light", v3(-42, 5, 0), "#ffb000", 18, 16),
    light("east_lane_light", v3(42, 5, 0), "#ff2fd1", 20, 16),
    light("roof_beacon_cyan", v3(-10, 11, 0), "#00f5ff", 18, 14),
    light("roof_beacon_magenta", v3(10, 11, 0), "#ff2fd1", 18, 14)
  );

  signs.push(
    sign("foundry_north_sign", v3(0, 5.5, -14.6), 0, "FOUNDRY 12", "#00f5ff", 8, 1.2),
    sign("south_gate_sign", v3(0, 4, 43.8), Math.PI, "SOUTH GATE", "#ff2fd1", 7, 1),
    sign("west_lane_sign", v3(-51.8, 4, 0), Math.PI / 2, "COOLANT", "#ffb000", 6, 1),
    sign("east_lane_sign", v3(51.8, 4, 0), -Math.PI / 2, "POWER", "#ff2fd1", 6, 1)
  );

  const navWaypoints = [
    waypoint("sw_spawn_nav", v3(-45, 0, 36), ["west_south", "south_west"], "spawn", ["exterior"]),
    waypoint("south_left_spawn_nav", v3(-20, 0, 38), ["south_west", "south_mid"], "spawn", ["exterior"]),
    waypoint("south_right_spawn_nav", v3(20, 0, 38), ["south_mid", "south_east"], "spawn", ["exterior"]),
    waypoint("se_spawn_nav", v3(45, 0, 36), ["east_south", "south_east"], "spawn", ["exterior"]),
    waypoint("east_south_spawn_nav", v3(46, 0, 18), ["se_spawn_nav", "east_south", "east_mid"], "spawn", ["exterior"]),
    waypoint("east_north_spawn_nav", v3(46, 0, -18), ["ne_spawn_nav", "east_north", "east_mid"], "spawn", ["exterior"]),
    waypoint("ne_spawn_nav", v3(42, 0, -36), ["east_north_spawn_nav", "north_east"], "spawn", ["exterior"]),
    waypoint("north_right_spawn_nav", v3(16, 0, -38), ["north_east", "north_mid"], "spawn", ["exterior"]),
    waypoint("north_left_spawn_nav", v3(-16, 0, -38), ["north_mid", "north_west"], "spawn", ["exterior"]),
    waypoint("nw_spawn_nav", v3(-42, 0, -36), ["west_north_spawn_nav", "north_west"], "spawn", ["exterior"]),
    waypoint("west_north_spawn_nav", v3(-46, 0, -18), ["nw_spawn_nav", "west_north", "west_mid"], "spawn", ["exterior"]),
    waypoint("west_south_spawn_nav", v3(-46, 0, 18), ["sw_spawn_nav", "west_south", "west_mid"], "spawn", ["exterior"]),

    waypoint("south_west", v3(-31, 0, 35), ["sw_spawn_nav", "south_left_spawn_nav", "south_mid", "west_south"], "exterior", ["south-lane"]),
    waypoint("south_mid", v3(0, 0, 36), ["south_left_spawn_nav", "south_right_spawn_nav", "south_west", "south_east", "south_gate"], "exterior", ["south-lane"]),
    waypoint("south_east", v3(31, 0, 35), ["se_spawn_nav", "south_right_spawn_nav", "south_mid", "east_south"], "exterior", ["south-lane"]),
    waypoint("north_west", v3(-31, 0, -35), ["nw_spawn_nav", "north_left_spawn_nav", "north_mid", "west_north"], "exterior", ["north-lane"]),
    waypoint("north_mid", v3(0, 0, -36), ["north_left_spawn_nav", "north_right_spawn_nav", "north_west", "north_east", "north_bridge_west", "north_bridge_east", "north_gate"], "exterior", ["north-lane"]),
    waypoint("north_east", v3(31, 0, -35), ["ne_spawn_nav", "north_right_spawn_nav", "north_mid", "east_north"], "exterior", ["north-lane"]),

    waypoint("west_south", v3(-45, 0, 26), ["sw_spawn_nav", "west_south_spawn_nav", "south_west", "west_mid", "west_platform_base"], "flank", ["west-lane", "exterior"]),
    waypoint("west_mid", v3(-45, 0, 0), ["west_south_spawn_nav", "west_north_spawn_nav", "west_south", "west_north", "west_roof_base"], "flank", ["west-lane", "exterior"]),
    waypoint("west_north", v3(-45, 0, -26), ["west_north_spawn_nav", "north_west", "west_mid"], "flank", ["west-lane", "exterior"]),
    waypoint("east_south", v3(45, 0, 26), ["se_spawn_nav", "east_south_spawn_nav", "south_east", "east_mid", "east_platform_base"], "flank", ["east-lane", "exterior"]),
    waypoint("east_mid", v3(45, 0, 0), ["east_south_spawn_nav", "east_north_spawn_nav", "east_south", "east_north", "east_roof_base"], "flank", ["east-lane", "exterior"]),
    waypoint("east_north", v3(45, 0, -26), ["east_north_spawn_nav", "north_east", "east_mid"], "flank", ["east-lane", "exterior"]),

    waypoint("south_gate", v3(0, 0, 18), ["south_mid", "interior_south", "south_flank_west", "south_flank_east"], "interior", ["entrance"]),
    waypoint("north_gate", v3(0, 0, -18), ["north_mid", "interior_north", "north_flank_west", "north_flank_east"], "interior", ["entrance"]),
    waypoint("west_gate", v3(-22, 0, 0), ["west_roof_base", "interior_west"], "interior", ["entrance", "flank"]),
    waypoint("east_gate", v3(22, 0, 0), ["east_roof_base", "interior_east"], "interior", ["entrance", "flank"]),
    waypoint("interior_south", v3(0, 0, 10), ["south_gate", "interior_center", "catwalk_south_base"], "interior", ["foundry"]),
    waypoint("interior_north", v3(0, 0, -10), ["north_gate", "interior_center", "catwalk_north_base"], "interior", ["foundry"]),
    waypoint("interior_west", v3(-12, 0, 0), ["west_gate", "interior_center", "interior_nw", "interior_sw"], "interior", ["foundry"]),
    waypoint("interior_east", v3(12, 0, 0), ["east_gate", "interior_center", "interior_ne", "interior_se"], "interior", ["foundry"]),
    waypoint("interior_center", v3(0, 0, 7), ["interior_south", "interior_north", "interior_west", "interior_east"], "interior", ["reactor"]),
    waypoint("interior_nw", v3(-10, 0, -10), ["interior_west", "interior_north"], "interior", ["cover"]),
    waypoint("interior_ne", v3(10, 0, -10), ["interior_east", "interior_north"], "interior", ["cover"]),
    waypoint("interior_sw", v3(-10, 0, 10), ["interior_west", "interior_south"], "interior", ["cover"]),
    waypoint("interior_se", v3(10, 0, 10), ["interior_east", "interior_south"], "interior", ["cover"]),

    waypoint("south_flank_west", v3(-15, 0, 20), ["south_gate", "south_west", "west_gate"], "flank", ["exterior", "cover"]),
    waypoint("south_flank_east", v3(15, 0, 20), ["south_gate", "south_east", "east_gate"], "flank", ["exterior", "cover"]),
    waypoint("north_flank_west", v3(-15, 0, -20), ["north_gate", "north_west", "west_gate"], "flank", ["exterior", "cover"]),
    waypoint("north_flank_east", v3(15, 0, -20), ["north_gate", "north_east", "east_gate"], "flank", ["exterior", "cover"]),

    waypoint("west_roof_base", v3(-29, 0, 0), ["west_mid", "west_gate", "west_roof_mid"], "vertical", ["roof-route"]),
    waypoint("west_roof_mid", v3(-23.5, 4.5, 0), ["west_roof_base", "west_roof_top"], "vertical", ["ramp"]),
    waypoint("west_roof_top", v3(-18, 9, 0), ["west_roof_mid", "roof_west"], "vertical", ["roof-route"]),
    waypoint("roof_west", v3(-10, 9, 0), ["west_roof_top", "roof_center", "roof_north_west", "roof_south_west"], "vertical", ["roof-route"]),
    waypoint("roof_center", v3(0, 9, 0), ["roof_west", "roof_east", "roof_north_west", "roof_north_east", "roof_south_west", "roof_south_east"], "vertical", ["roof-route"]),
    waypoint("roof_east", v3(10, 9, 0), ["roof_center", "east_roof_top", "roof_north_east", "roof_south_east"], "vertical", ["roof-route"]),
    waypoint("east_roof_top", v3(18, 9, 0), ["roof_east", "east_roof_mid"], "vertical", ["roof-route"]),
    waypoint("east_roof_mid", v3(23.5, 4.5, 0), ["east_roof_top", "east_roof_base"], "vertical", ["ramp"]),
    waypoint("east_roof_base", v3(29, 0, 0), ["east_roof_mid", "east_mid", "east_gate"], "vertical", ["roof-route"]),
    waypoint("roof_north_west", v3(-10, 9, -9), ["roof_west", "roof_center", "roof_north_east"], "vertical", ["roof-route", "overlook"]),
    waypoint("roof_north_east", v3(10, 9, -9), ["roof_east", "roof_center", "roof_north_west"], "vertical", ["roof-route", "overlook"]),
    waypoint("roof_south_west", v3(-10, 9, 9), ["roof_west", "roof_center", "roof_south_east"], "vertical", ["roof-route", "overlook"]),
    waypoint("roof_south_east", v3(10, 9, 9), ["roof_east", "roof_center", "roof_south_west"], "vertical", ["roof-route", "overlook"]),

    waypoint("catwalk_north_base", v3(0, 0, -12), ["interior_north", "catwalk_north_mid"], "vertical", ["interior", "catwalk"]),
    waypoint("catwalk_north_mid", v3(0, 2.125, -8), ["catwalk_north_base", "catwalk_north_top"], "vertical", ["interior", "ramp"]),
    waypoint("catwalk_north_top", v3(0, 4.25, -4), ["catwalk_north_mid", "catwalk_center"], "vertical", ["interior", "catwalk"]),
    waypoint("catwalk_center", v3(0, 4.25, 0), ["catwalk_north_top", "catwalk_south_top"], "vertical", ["interior", "catwalk", "overlook"]),
    waypoint("catwalk_south_top", v3(0, 4.25, 4), ["catwalk_center", "catwalk_south_mid"], "vertical", ["interior", "catwalk"]),
    waypoint("catwalk_south_mid", v3(0, 2.125, 8), ["catwalk_south_top", "catwalk_south_base"], "vertical", ["interior", "ramp"]),
    waypoint("catwalk_south_base", v3(0, 0, 12), ["catwalk_south_mid", "interior_south"], "vertical", ["interior", "catwalk"]),

    waypoint("west_platform_base", v3(-44, 0, -25), ["west_south", "west_platform_top"], "vertical", ["west-lane"]),
    waypoint("west_platform_top", v3(-41, 2, -25), ["west_platform_base", "west_platform_center"], "vertical", ["west-lane", "overlook"]),
    waypoint("west_platform_center", v3(-35, 2, -25), ["west_platform_top", "northwest_crate_nav"], "vertical", ["west-lane", "overlook"]),
    waypoint("northwest_crate_nav", v3(-30, 0, -24), ["west_platform_center", "north_flank_west", "north_west"], "flank", ["cover"]),
    waypoint("east_platform_base", v3(44, 0, 24), ["east_south", "east_platform_top"], "vertical", ["east-lane"]),
    waypoint("east_platform_top", v3(41, 2, 24), ["east_platform_base", "east_platform_center"], "vertical", ["east-lane", "overlook"]),
    waypoint("east_platform_center", v3(35, 2, 24), ["east_platform_top", "southeast_crate_nav"], "vertical", ["east-lane", "overlook"]),
    waypoint("southeast_crate_nav", v3(30, 0, 24), ["east_platform_center", "south_flank_east", "south_east"], "flank", ["cover"]),

    waypoint("north_bridge_west", v3(-12, 0, -30), ["north_mid", "north_bridge_west_top"], "vertical", ["north-lane"]),
    waypoint("north_bridge_west_top", v3(-9, 3.025, -30), ["north_bridge_west", "north_bridge_center"], "vertical", ["north-lane", "overlook"]),
    waypoint("north_bridge_center", v3(0, 3.025, -30), ["north_bridge_west_top", "north_bridge_east_top"], "vertical", ["north-lane", "overlook"]),
    waypoint("north_bridge_east_top", v3(9, 3.025, -30), ["north_bridge_center", "north_bridge_east"], "vertical", ["north-lane", "overlook"]),
    waypoint("north_bridge_east", v3(12, 0, -30), ["north_bridge_east_top", "north_mid"], "vertical", ["north-lane"]),
  ];

  const waypointById = new Map(navWaypoints.map((node) => [node.id, node]));
  for (const node of navWaypoints) {
    for (const neighborId of node.neighbors) {
      const neighbor = waypointById.get(neighborId);
      if (!neighbor) {
        throw new Error(`Waypoint ${node.id} references missing neighbor ${neighborId}`);
      }
      if (!neighbor.neighbors.includes(node.id)) {
        neighbor.neighbors.push(node.id);
      }
    }
  }
  for (const node of navWaypoints) {
    node.neighbors.sort();
  }

  const spawns = [
    spawn("spawn_01", v3(-45, 0, 36), -0.75, "southwest-yard", "sw_spawn_nav", 0.75),
    spawn("spawn_02", v3(-20, 0, 38), -0.2, "south-loading", "south_left_spawn_nav", 0),
    spawn("spawn_03", v3(20, 0, 38), 0.2, "south-checkpoint", "south_right_spawn_nav", 0),
    spawn("spawn_04", v3(45, 0, 36), 0.75, "southeast-yard", "se_spawn_nav", -0.75),
    spawn("spawn_05", v3(46, 0, 18), 1.45, "east-transformers", "east_south_spawn_nav", -1.55),
    spawn("spawn_06", v3(46, 0, -18), 1.7, "east-power-alley", "east_north_spawn_nav", -1.55),
    spawn("spawn_07", v3(42, 0, -36), 2.35, "northeast-yard", "ne_spawn_nav", -2.35),
    spawn("spawn_08", v3(16, 0, -38), 2.9, "north-bridge-east", "north_right_spawn_nav", Math.PI),
    spawn("spawn_09", v3(-16, 0, -38), -2.9, "north-bridge-west", "north_left_spawn_nav", Math.PI),
    spawn("spawn_10", v3(-42, 0, -36), -2.35, "northwest-yard", "nw_spawn_nav", 2.35),
    spawn("spawn_11", v3(-46, 0, -18), -1.7, "west-coolant-alley", "west_north_spawn_nav", 1.55),
    spawn("spawn_12", v3(-46, 0, 18), -1.45, "west-loading", "west_south_spawn_nav", 1.55),
  ];

  const pickups = [
    pickup("ammo_interior", "ammo", v3(7, 0.15, 7), 720),
    pickup("health_interior", "health", v3(-7, 0.15, -7), 900),
    pickup("ammo_roof", "ammo", v3(0, 9.15, 7), 720),
    pickup("health_roof", "health", v3(0, 9.15, -7), 900),
    pickup("ammo_west_lane", "ammo", v3(-42, 0.15, 10), 720),
    pickup("health_east_lane", "health", v3(42, 0.15, -10), 900),
    pickup("ammo_south", "ammo", v3(0, 0.15, 28), 720),
    pickup("health_north", "health", v3(0, 0.15, -24), 900),
  ];

  return {
    schemaVersion: 1,
    id: "neon-foundry-01",
    displayName: "Neon Foundry",
    description:
      "A rain-soaked industrial foundry with four exterior lanes, a sheltered reactor hall, roof routes, catwalks, loading platforms, and connected flanks.",
    tickRate: 60,
    maxCombatants: 12,
    world: {
      floorY: 0,
      playableBounds: {
        min: v3(-52, 0, -44),
        max: v3(52, 14, 44),
      },
      killY: -12,
      playerRadius: 0.45,
      playerHeight: 1.8,
      maxStepHeight: 0.48,
      minSpawnSeparation: 15,
      spawnProtectionTicks: 180,
    },
    atmosphere: {
      skyColor: "#07111c",
      fogColor: "#071521",
      fogNear: 20,
      fogFar: 105,
      ambientColor: "#3a6684",
      ambientIntensity: 0.42,
      rain: {
        enabled: true,
        boundsMin: v3(-52, 0, -44),
        boundsMax: v3(52, 22, 44),
        dropsHigh: 9000,
        dropsMedium: 4500,
        dropsLow: 1800,
        dropLength: 0.85,
        wind: v3(1.4, -16, 0.8),
        splashRate: 0.28,
      },
    },
    materials: [
      material("wet_asphalt", "#17212a", 0.22, 0.08, {
        clearcoat: 0.9,
        clearcoatRoughness: 0.12,
        rainResponse: 1,
      }),
      material("wet_concrete", "#4a5560", 0.36, 0.02, {
        clearcoat: 0.55,
        clearcoatRoughness: 0.2,
        rainResponse: 0.9,
      }),
      material("dark_concrete", "#202a33", 0.72, 0.02, {
        rainResponse: 0.55,
      }),
      material("wet_gunmetal", "#27343e", 0.2, 0.88, {
        clearcoat: 0.72,
        clearcoatRoughness: 0.16,
        rainResponse: 1,
      }),
      material("corrugated_steel", "#334550", 0.34, 0.75, {
        clearcoat: 0.45,
        rainResponse: 0.8,
      }),
      material("painted_steel", "#1e6576", 0.3, 0.62, {
        clearcoat: 0.68,
        rainResponse: 0.9,
      }),
      material("hazard_yellow", "#c89c18", 0.4, 0.5, {
        clearcoat: 0.5,
        rainResponse: 0.8,
      }),
      material("grated_steel", "#56636a", 0.46, 0.84, {
        rainResponse: 0.85,
      }),
      material("reactor_glass", "#79efff", 0.08, 0.08, {
        transmission: 0.7,
        opacity: 0.58,
        emissive: "#00d9ff",
        emissiveIntensity: 2.8,
      }),
    ],
    routeGroups: [
      {
        id: "interior-reactor-loop",
        kind: "interior",
        description: "Sheltered close-range reactor hall with four entrances.",
      },
      {
        id: "outer-perimeter-loop",
        kind: "exterior",
        description: "Rain-exposed north, south, east, and west lanes.",
      },
      {
        id: "roof-and-catwalk-loop",
        kind: "vertical",
        description: "Two roof ramps, an interior catwalk, and raised lane platforms.",
      },
      {
        id: "cross-yard-flanks",
        kind: "flank",
        description: "Crate-screened diagonals bypassing the main gates.",
      },
    ],
    boxes,
    ramps,
    cylinders,
    lights,
    signs,
    spawns,
    pickups,
    navWaypoints,
  };
}
