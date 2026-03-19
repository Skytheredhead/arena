use spacetimedb::{
    reducer, table, Identity, ReducerContext, ScheduleAt, Table, TimeDuration,
};

const SERVER_TICK_RATE: u32 = 40;
const SERVER_TICK_MS: u32 = 1000 / SERVER_TICK_RATE;
const SERVER_TICK_INTERVAL_US: i64 = (SERVER_TICK_MS as i64) * 1000;
const MATCH_DURATION_TICKS: u32 = SERVER_TICK_RATE * 180;
const RESPAWN_DELAY_TICKS: u32 = 30;
const INPUT_STALE_TICKS: u32 = 4;
const SIM_TICK_SCHEDULE_ID: u64 = 1;
const MAX_OPEN_ROOMS: usize = 5;
const MAX_TOTAL_PLAYERS: usize = 50;
const MAX_PLAYERS_PER_ROOM: u16 = 5;
const ROOM_ACTION_RATE_LIMIT_TICKS: u32 = 8;
const NICKNAME_RATE_LIMIT_TICKS: u32 = 24;

const PLAYER_HEIGHT: f32 = 1.8;
const PLAYER_RADIUS: f32 = 0.4;
const PLAYER_STEP_HEIGHT: f32 = 0.65;
const PLAYER_EYE_HEIGHT: f32 = 1.58;

const WALK_SPEED: f32 = 6.4;
const SPRINT_SPEED: f32 = 8.4;
const GROUND_ACCELERATION: f32 = 30.0;
const AIR_ACCELERATION: f32 = 5.0;
const GROUND_FRICTION: f32 = 22.0;
const GRAVITY: f32 = 24.0;
const JUMP_SPEED: f32 = 8.4;
const MAX_PITCH: f32 = std::f32::consts::PI * 0.49;

const MAX_HEALTH: u16 = 100;
const RIFLE_DAMAGE: u16 = 10;
const RIFLE_FIRE_INTERVAL_TICKS: u32 = 7;
const RIFLE_RANGE: f32 = 80.0;
const RIFLE_MAGAZINE: u16 = 40;
const BASE_WEAPON_SPREAD: f32 = 0.004;
const MOVEMENT_SPREAD: f32 = 0.1;
const HEALTH_REGEN_DELAY_TICKS: u32 = SERVER_TICK_RATE * 5;
const HEALTH_REGEN_PER_TICK: f32 = 3.0 / SERVER_TICK_RATE as f32;
const AMMO_PACK_AMOUNT: u16 = 6;
const AMMO_PACK_RESPAWN_TICKS: u32 = SERVER_TICK_RATE * 3;
const AMMO_PACK_RADIUS: f32 = 0.6;
const AMMO_PACK_ACTIVE_COUNT: usize = 6;
const HEALTH_PACK_AMOUNT: u16 = 50;
const HEALTH_PACK_RESPAWN_TICKS: u32 = SERVER_TICK_RATE * 10;
const HEALTH_PACK_RADIUS: f32 = 0.5;
const HEALTH_PACK_ACTIVE_COUNT: usize = 2;
const ARENA_HALF_SIZE: f32 = 30.0;

#[derive(Clone, Copy)]
struct Vec3 {
    x: f32,
    y: f32,
    z: f32,
}

#[derive(Clone, Copy)]
struct Block {
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
}

const ARENA_BLOCKS: [Block; 5] = [
    Block { min_x: -2.0, min_y: 0.0, min_z: -2.0, max_x: 2.0, max_y: 2.0, max_z: 2.0 },
    Block { min_x: -14.0, min_y: 0.0, min_z: -2.0, max_x: -10.0, max_y: 2.4, max_z: 2.0 },
    Block { min_x: 10.0, min_y: 0.0, min_z: -2.0, max_x: 14.0, max_y: 2.4, max_z: 2.0 },
    Block { min_x: -2.0, min_y: 0.0, min_z: -14.0, max_x: 2.0, max_y: 2.4, max_z: -10.0 },
    Block { min_x: -2.0, min_y: 0.0, min_z: 10.0, max_x: 2.0, max_y: 2.4, max_z: 14.0 },
];

const SPAWN_POINTS: [Vec3; 8] = [
    Vec3 { x: -22.0, y: 0.0, z: -22.0 },
    Vec3 { x: 22.0, y: 0.0, z: -22.0 },
    Vec3 { x: -22.0, y: 0.0, z: 22.0 },
    Vec3 { x: 22.0, y: 0.0, z: 22.0 },
    Vec3 { x: 0.0, y: 0.0, z: -24.0 },
    Vec3 { x: 0.0, y: 0.0, z: 24.0 },
    Vec3 { x: -24.0, y: 0.0, z: 0.0 },
    Vec3 { x: 24.0, y: 0.0, z: 0.0 },
];

const AMMO_PACK_LOCATIONS: [Vec3; 10] = [
    Vec3 { x: -20.0, y: 0.0, z: 0.0 },
    Vec3 { x: 20.0, y: 0.0, z: 0.0 },
    Vec3 { x: 0.0, y: 0.0, z: -20.0 },
    Vec3 { x: 0.0, y: 0.0, z: 20.0 },
    Vec3 { x: -8.0, y: 0.0, z: -8.0 },
    Vec3 { x: 8.0, y: 0.0, z: -8.0 },
    Vec3 { x: -8.0, y: 0.0, z: 8.0 },
    Vec3 { x: 8.0, y: 0.0, z: 8.0 },
    Vec3 { x: -16.0, y: 0.0, z: 16.0 },
    Vec3 { x: 16.0, y: 0.0, z: -16.0 },
];

const HEALTH_PACK_LOCATIONS: [Vec3; 4] = [
    Vec3 { x: -12.0, y: 0.0, z: 12.0 },
    Vec3 { x: 12.0, y: 0.0, z: 12.0 },
    Vec3 { x: -12.0, y: 0.0, z: -12.0 },
    Vec3 { x: 12.0, y: 0.0, z: -12.0 },
];

#[table(accessor = world_state)]
pub struct WorldState {
    #[primary_key]
    singleton: u8,
    current_tick: u32,
}

#[table(accessor = sim_tick_schedule, scheduled(sim_tick))]
pub struct SimTickSchedule {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    scheduled_at: ScheduleAt,
}

#[table(accessor = room, public)]
pub struct Room {
    #[primary_key]
    code: String,
    player_count: u16,
    active: bool,
    created_tick: u32,
}

#[table(accessor = match_state, public)]
pub struct MatchState {
    #[primary_key]
    room_code: String,
    active: bool,
    tick: u32,
    end_tick: u32,
    remaining_ms: u32,
    round: u16,
}

#[table(accessor = player, public)]
pub struct Player {
    #[primary_key]
    identity: Identity,
    nickname: String,
    room_code: Option<String>,
    kills: u16,
    deaths: u16,
    connected: bool,
}

#[table(accessor = player_input)]
pub struct PlayerInput {
    #[primary_key]
    identity: Identity,
    sequence: u32,
    move_x: f32,
    move_z: f32,
    yaw: f32,
    pitch: f32,
    jumping: bool,
    sprinting: bool,
    last_received_tick: u32,
}

#[table(accessor = player_rate_limit)]
pub struct PlayerRateLimit {
    #[primary_key]
    identity: Identity,
    last_nickname_tick: u32,
    last_create_room_tick: u32,
    last_join_room_tick: u32,
    last_leave_room_tick: u32,
    last_start_match_tick: u32,
}

#[table(accessor = player_state, public)]
pub struct PlayerState {
    #[primary_key]
    identity: Identity,
    room_code: Option<String>,
    x: f32,
    y: f32,
    z: f32,
    vel_x: f32,
    vel_y: f32,
    vel_z: f32,
    server_tick: u32,
    yaw: f32,
    pitch: f32,
    health: u16,
    alive: bool,
    on_ground: bool,
    last_damage_tick: u32,
    regen_progress: f32,
    last_processed_input: u32,
    respawn_tick: u32,
}

#[table(accessor = weapon_state, public)]
pub struct WeaponState {
    #[primary_key]
    identity: Identity,
    room_code: Option<String>,
    ammo_in_mag: u16,
    next_ready_tick: u32,
}

#[table(accessor = spawn_point, public)]
pub struct SpawnPoint {
    #[primary_key]
    id: u16,
    x: f32,
    y: f32,
    z: f32,
}

#[table(accessor = ammo_pack, public)]
pub struct AmmoPack {
    #[primary_key]
    #[auto_inc]
    id: u32,
    room_code: String,
    x: f32,
    y: f32,
    z: f32,
    location_index: u16,
    active: bool,
    respawn_tick: u32,
}

#[table(accessor = health_pack, public)]
pub struct HealthPack {
    #[primary_key]
    #[auto_inc]
    id: u32,
    room_code: String,
    x: f32,
    y: f32,
    z: f32,
    location_index: u16,
    active: bool,
    respawn_tick: u32,
}

#[table(accessor = kill_feed_event, public)]
pub struct KillFeedEvent {
    #[primary_key]
    #[auto_inc]
    id: u32,
    room_code: String,
    attacker_identity: Identity,
    victim_identity: Identity,
    attacker_nickname: String,
    victim_nickname: String,
    tick: u32,
}

#[table(accessor = damage_event, public)]
pub struct DamageEvent {
    #[primary_key]
    #[auto_inc]
    id: u32,
    room_code: String,
    attacker_identity: Identity,
    victim_identity: Identity,
    amount: u16,
    tick: u32,
    caused_death: bool,
}

#[reducer(init)]
pub fn init(ctx: &ReducerContext) {
    if ctx.db.world_state().singleton().find(0).is_none() {
        ctx.db.world_state().insert(WorldState {
            singleton: 0,
            current_tick: 0,
        });
    }

    if ctx.db.sim_tick_schedule().count() == 0 {
        ctx.db.sim_tick_schedule().insert(SimTickSchedule {
            scheduled_id: SIM_TICK_SCHEDULE_ID,
            // Fixed authoritative server cadence: one recurring reducer every 25ms (40Hz).
            scheduled_at: ScheduleAt::Interval(TimeDuration::from_micros(SERVER_TICK_INTERVAL_US)),
        });
    }

    if ctx.db.spawn_point().count() == 0 {
        for (index, spawn) in SPAWN_POINTS.iter().enumerate() {
            ctx.db.spawn_point().insert(SpawnPoint {
                id: index as u16,
                x: spawn.x,
                y: spawn.y,
                z: spawn.z,
            });
        }
    }
}

#[reducer(client_connected)]
pub fn client_connected(ctx: &ReducerContext) {
    let current_tick = current_tick(ctx);
    let fallback_nickname = default_nickname_for_identity(ctx.sender());

    if let Some(player) = ctx.db.player().identity().find(ctx.sender()) {
        ctx.db.player().identity().update(Player {
            connected: true,
            ..player
        });
    } else {
        ctx.db.player().insert(Player {
            identity: ctx.sender(),
            nickname: fallback_nickname,
            room_code: None,
            kills: 0,
            deaths: 0,
            connected: true,
        });
    }

    if ctx.db.player_state().identity().find(ctx.sender()).is_none() {
        ctx.db.player_state().insert(PlayerState {
            identity: ctx.sender(),
            room_code: None,
            x: 0.0,
            y: 0.0,
            z: 0.0,
            vel_x: 0.0,
            vel_y: 0.0,
            vel_z: 0.0,
            server_tick: current_tick,
            yaw: 0.0,
            pitch: 0.0,
            health: MAX_HEALTH,
            alive: true,
            on_ground: true,
            last_damage_tick: current_tick,
            regen_progress: 0.0,
            last_processed_input: 0,
            respawn_tick: current_tick,
        });
    }

    if ctx.db.weapon_state().identity().find(ctx.sender()).is_none() {
        ctx.db.weapon_state().insert(WeaponState {
            identity: ctx.sender(),
            room_code: None,
            ammo_in_mag: RIFLE_MAGAZINE,
            next_ready_tick: current_tick,
        });
    }

    if ctx
        .db
        .player_rate_limit()
        .identity()
        .find(ctx.sender())
        .is_none()
    {
        ctx.db.player_rate_limit().insert(PlayerRateLimit {
            identity: ctx.sender(),
            last_nickname_tick: 0,
            last_create_room_tick: 0,
            last_join_room_tick: 0,
            last_leave_room_tick: 0,
            last_start_match_tick: 0,
        });
    }

    reset_player_input(ctx, ctx.sender(), current_tick);
}

#[reducer(client_disconnected)]
pub fn client_disconnected(ctx: &ReducerContext) {
    if let Some(player) = ctx.db.player().identity().find(ctx.sender()) {
        if player.room_code.is_some() {
            leave_room_internal(ctx, ctx.sender());
        }

        ctx.db.player().identity().update(Player {
            connected: false,
            room_code: None,
            ..player
        });
    }
}

#[reducer]
pub fn set_nickname(ctx: &ReducerContext, nickname: String) -> Result<(), String> {
    enforce_rate_limit(
        ctx,
        ctx.sender(),
        RateLimitKind::Nickname,
        NICKNAME_RATE_LIMIT_TICKS,
        "Changing nickname too fast",
    )?;
    let player = require_player(ctx, ctx.sender())?;
    let nickname = validate_nickname(nickname)?;
    let unique_nickname = coerce_unique_nickname(ctx, &nickname, ctx.sender());
    ctx.db.player().identity().update(Player {
        nickname: unique_nickname,
        ..player
    });
    Ok(())
}

#[reducer]
pub fn create_room(ctx: &ReducerContext, room_code: String) -> Result<(), String> {
    enforce_rate_limit(
        ctx,
        ctx.sender(),
        RateLimitKind::CreateRoom,
        ROOM_ACTION_RATE_LIMIT_TICKS,
        "Create room rate limit hit",
    )?;
    prune_empty_rooms(ctx);
    let room_code = validate_room_code(room_code)?;
    if ctx.db.room().code().find(room_code.clone()).is_some() {
        return Err("Room already exists".to_string());
    }
    if ctx.db.room().count() >= MAX_OPEN_ROOMS as u64 {
        return Err("Room capacity reached (5 open rooms max)".to_string());
    }

    let tick = current_tick(ctx);
    ctx.db.room().insert(Room {
        code: room_code.clone(),
        player_count: 0,
        active: false,
        created_tick: tick,
    });
    ctx.db.match_state().insert(MatchState {
        room_code: room_code.clone(),
        active: false,
        tick,
        end_tick: tick + MATCH_DURATION_TICKS,
        remaining_ms: MATCH_DURATION_TICKS * SERVER_TICK_MS,
        round: 0,
    });
    initialize_room_ammo_packs(ctx, &room_code, tick);
    initialize_room_health_packs(ctx, &room_code, tick);
    Ok(())
}

#[reducer]
pub fn join_room(ctx: &ReducerContext, room_code: String) -> Result<(), String> {
    enforce_rate_limit(
        ctx,
        ctx.sender(),
        RateLimitKind::JoinRoom,
        ROOM_ACTION_RATE_LIMIT_TICKS,
        "Join room rate limit hit",
    )?;
    let room_code = validate_room_code(room_code)?;
    let room = ctx
        .db
        .room()
        .code()
        .find(room_code.clone())
        .ok_or_else(|| "Room not found".to_string())?;
    let joined_total = current_joined_players(ctx);
    let player = require_player(ctx, ctx.sender())?;
    if player.room_code.as_deref() != Some(room_code.as_str()) && room.player_count >= MAX_PLAYERS_PER_ROOM
    {
        return Err("Room is full (5 players max)".to_string());
    }
    if player.room_code.is_none() && joined_total >= MAX_TOTAL_PLAYERS {
        return Err("Server is full (50 players max)".to_string());
    }

    if player.room_code.as_deref() == Some(room_code.as_str()) {
        return Ok(());
    }

    leave_room_internal(ctx, ctx.sender());

    let room = ctx
        .db
        .room()
        .code()
        .find(room_code.clone())
        .ok_or_else(|| "Room no longer exists".to_string())?;
    if room.player_count >= MAX_PLAYERS_PER_ROOM {
        return Err("Room is full (5 players max)".to_string());
    }

    let player = require_player(ctx, ctx.sender())?;
    let mut state = require_player_state(ctx, ctx.sender())?;
    let mut weapon = require_weapon_state(ctx, ctx.sender())?;

    let spawn = choose_spawn(room.player_count as usize + current_tick(ctx) as usize);
    let spawn_yaw = yaw_towards_arena_center(spawn);
    state.room_code = Some(room_code.clone());
    state.x = spawn.x;
    state.y = spawn.y;
    state.z = spawn.z;
    state.vel_x = 0.0;
    state.vel_y = 0.0;
    state.vel_z = 0.0;
    state.server_tick = current_tick(ctx);
    state.yaw = spawn_yaw;
    state.pitch = 0.0;
    state.alive = true;
    state.health = MAX_HEALTH;
    state.on_ground = true;
    state.last_damage_tick = current_tick(ctx);
    state.regen_progress = 0.0;
    state.last_processed_input = 0;
    state.respawn_tick = current_tick(ctx);

    weapon.room_code = Some(room_code.clone());
    weapon.ammo_in_mag = RIFLE_MAGAZINE;
    weapon.next_ready_tick = current_tick(ctx);

    reset_player_input(ctx, ctx.sender(), current_tick(ctx));

    ctx.db.player().identity().update(Player {
        room_code: Some(room_code.clone()),
        connected: true,
        ..player
    });
    ctx.db.player_state().identity().update(state);
    ctx.db.weapon_state().identity().update(weapon);
    ctx.db.room().code().update(Room {
        player_count: room.player_count.saturating_add(1),
        ..room
    });
    Ok(())
}

#[reducer]
pub fn leave_room(ctx: &ReducerContext) -> Result<(), String> {
    enforce_rate_limit(
        ctx,
        ctx.sender(),
        RateLimitKind::LeaveRoom,
        ROOM_ACTION_RATE_LIMIT_TICKS,
        "Leave room rate limit hit",
    )?;
    leave_room_internal(ctx, ctx.sender());
    Ok(())
}

#[reducer]
pub fn start_match(ctx: &ReducerContext, room_code: String) -> Result<(), String> {
    enforce_rate_limit(
        ctx,
        ctx.sender(),
        RateLimitKind::StartMatch,
        ROOM_ACTION_RATE_LIMIT_TICKS,
        "Start match rate limit hit",
    )?;
    let room_code = validate_room_code(room_code)?;
    let player = require_player(ctx, ctx.sender())?;
    if player.room_code.as_deref() != Some(room_code.as_str()) {
        return Err("Join the room before starting the match".to_string());
    }

    let tick = current_tick(ctx);
    let room = ctx
        .db
        .room()
        .code()
        .find(room_code.clone())
        .ok_or_else(|| "Room not found".to_string())?;
    let match_state = ctx
        .db
        .match_state()
        .room_code()
        .find(room_code.clone())
        .ok_or_else(|| "Match state missing".to_string())?;

    ctx.db.room().code().update(Room {
        active: true,
        ..room
    });
    ctx.db.match_state().room_code().update(MatchState {
        active: true,
        tick,
        end_tick: tick + MATCH_DURATION_TICKS,
        remaining_ms: MATCH_DURATION_TICKS * SERVER_TICK_MS,
        round: match_state.round.saturating_add(1),
        ..match_state
    });
    Ok(())
}

#[reducer]
pub fn submit_input(
    ctx: &ReducerContext,
    sequence: u32,
    move_x: f32,
    move_z: f32,
    yaw: f32,
    pitch: f32,
    jumping: bool,
    sprinting: bool,
) -> Result<(), String> {
    require_room_membership(ctx, ctx.sender())?;
    let mut input = require_input_state(ctx, ctx.sender())?;
    if !should_accept_input_sequence(sequence, input.sequence) {
        return Ok(());
    }

    input.sequence = sequence;
    input.move_x = move_x.clamp(-1.0, 1.0);
    input.move_z = move_z.clamp(-1.0, 1.0);
    input.yaw = yaw;
    input.pitch = pitch.clamp(-MAX_PITCH, MAX_PITCH);
    input.jumping = jumping;
    input.sprinting = sprinting;
    input.last_received_tick = current_tick(ctx);

    ctx.db.player_input().identity().update(input);
    Ok(())
}

#[reducer]
pub fn fire_weapon(ctx: &ReducerContext, yaw: f32, pitch: f32, scoped: bool) -> Result<(), String> {
    let tick = current_tick(ctx);
    let player = require_player(ctx, ctx.sender())?;
    let state = require_player_state(ctx, ctx.sender())?;
    let weapon = require_weapon_state(ctx, ctx.sender())?;
    let room_code = require_room_membership(ctx, ctx.sender())?;

    let match_state = ctx
        .db
        .match_state()
        .room_code()
        .find(room_code.clone())
        .ok_or_else(|| "Room match state missing".to_string())?;

    if !match_state.active || !state.alive {
        return Ok(());
    }

    if !room_membership_is_consistent(
        player.room_code.as_deref(),
        state.room_code.as_deref(),
        weapon.room_code.as_deref(),
    ) {
        return Err("Weapon state is not in the active room".to_string());
    }

    if !can_fire_weapon_at_tick(weapon.next_ready_tick, tick) {
        return Err("Weapon still on cooldown".to_string());
    }

    if weapon.ammo_in_mag == 0 {
        return Ok(());
    }

    let movement_speed = (state.vel_x * state.vel_x + state.vel_z * state.vel_z).sqrt();
    let movement_ratio = (movement_speed / SPRINT_SPEED).clamp(0.0, 1.0);
    let scoped_factor = if scoped { 0.45 } else { 1.0 };
    let spread = (BASE_WEAPON_SPREAD + movement_ratio * MOVEMENT_SPREAD) * scoped_factor;
    let base_seed = tick as f32 * 0.197 + state.x * 1.31 + state.z * 2.17 + state.yaw * 0.97;
    let yaw_offset = (hash01(base_seed) - 0.5) * 2.0 * spread;
    let pitch_offset = (hash01(base_seed + 17.13) - 0.5) * 2.0 * spread;

    let aim_yaw = yaw + yaw_offset;
    let aim_pitch = (pitch + pitch_offset).clamp(-MAX_PITCH, MAX_PITCH);
    let direction = direction_from_yaw_pitch(aim_yaw, aim_pitch);
    let origin = Vec3 {
        x: state.x,
        y: state.y + PLAYER_EYE_HEIGHT,
        z: state.z,
    };

    let mut best_hit: Option<(Identity, f32)> = None;
    for target in ctx.db.player_state().iter() {
        if target.identity == ctx.sender() || !target.alive {
            continue;
        }
        if target.room_code.as_deref() != Some(room_code.as_str()) {
            continue;
        }

        let center = Vec3 {
            x: target.x,
            y: target.y + PLAYER_HEIGHT * 0.5,
            z: target.z,
        };
        if let Some(distance) = ray_hits_player(origin, direction, center) {
            if distance <= RIFLE_RANGE {
                match best_hit {
                    Some((_, best_distance)) if best_distance <= distance => {}
                    _ => best_hit = Some((target.identity, distance)),
                }
            }
        }
    }

    if let Some((victim_identity, victim_distance)) = best_hit {
        if let Some(block_distance) = ray_hits_any_block(origin, direction) {
            if block_distance < victim_distance {
                apply_weapon_cooldown(ctx, weapon, tick);
                return Ok(());
            }
        }

        apply_damage(ctx, room_code.clone(), ctx.sender(), victim_identity, RIFLE_DAMAGE)?;
    }

    apply_weapon_cooldown(ctx, weapon, tick);
    Ok(())
}

#[reducer]
pub fn request_respawn(ctx: &ReducerContext) -> Result<(), String> {
    let state = require_player_state(ctx, ctx.sender())?;
    let room_code = require_room_membership(ctx, ctx.sender())?;
    if state.alive {
        return Ok(());
    }

    let tick = current_tick(ctx);
    if !can_respawn_at_tick(state.respawn_tick, tick) {
        return Ok(());
    }

    respawn_player(ctx, ctx.sender(), room_code);
    Ok(())
}

#[reducer]
pub fn sim_tick(ctx: &ReducerContext, _schedule: SimTickSchedule) -> Result<(), String> {
    if ctx.sender() != ctx.identity() {
        return Err("sim_tick is scheduler-driven and cannot be called by clients".to_string());
    }

    let tick = increment_tick(ctx);
    prune_empty_rooms(ctx);

    for match_state in ctx.db.match_state().iter() {
        let room = match ctx.db.room().code().find(match_state.room_code.clone()) {
            Some(room) => room,
            None => continue,
        };

        let mut updated = MatchState { tick, ..match_state };
        if updated.active {
            if tick >= updated.end_tick {
                updated.end_tick = tick + MATCH_DURATION_TICKS;
                updated.round = updated.round.saturating_add(1);
            }
            updated.remaining_ms = updated.end_tick.saturating_sub(tick) * SERVER_TICK_MS;
        } else {
            updated.remaining_ms = MATCH_DURATION_TICKS * SERVER_TICK_MS;
        }
        ctx.db.match_state().room_code().update(updated);

        if room.player_count == 0 && room.active {
            ctx.db.room().code().update(Room {
                active: false,
                ..room
            });
        }
    }

    let states: Vec<PlayerState> = ctx.db.player_state().iter().collect();
    for state in states {
        let room_code = match state.room_code.clone() {
            Some(room_code) => room_code,
            None => continue,
        };

        if !state.alive {
            continue;
        }

        let input = match ctx.db.player_input().identity().find(state.identity) {
            Some(input) => input,
            None => continue,
        };

        let effective_input = if tick.saturating_sub(input.last_received_tick) > INPUT_STALE_TICKS {
            PlayerInput {
                move_x: 0.0,
                move_z: 0.0,
                jumping: false,
                sprinting: false,
                ..input
            }
        } else {
            input
        };

        let updated = simulate_movement_tick(state, effective_input);
        let mut updated = updated;
        apply_passive_regen(&mut updated, tick);
        ctx.db.player_state().identity().update(PlayerState {
            room_code: Some(room_code),
            server_tick: tick,
            ..updated
        });
    }

    process_ammo_packs(ctx, tick);
    process_health_packs(ctx, tick);

    Ok(())
}

fn current_tick(ctx: &ReducerContext) -> u32 {
    ctx.db
        .world_state()
        .singleton()
        .find(0)
        .map(|row| row.current_tick)
        .unwrap_or(0)
}

fn increment_tick(ctx: &ReducerContext) -> u32 {
    let row = ctx
        .db
        .world_state()
        .singleton()
        .find(0)
        .unwrap_or(WorldState {
            singleton: 0,
            current_tick: 0,
        });
    let next = row.current_tick.saturating_add(1);
    ctx.db.world_state().singleton().update(WorldState {
        singleton: 0,
        current_tick: next,
    });
    next
}

fn validate_nickname(value: String) -> Result<String, String> {
    let nickname = value.trim();
    if nickname.is_empty() {
        return Err("Nickname cannot be empty".to_string());
    }
    if nickname.len() > 16 {
        return Err("Nickname must be 16 characters or fewer".to_string());
    }
    Ok(nickname.to_string())
}

fn validate_room_code(value: String) -> Result<String, String> {
    let room_code = value.trim().to_uppercase();
    if room_code.len() < 3 || room_code.len() > 8 {
        return Err("Room codes must be 3-8 characters".to_string());
    }
    if !room_code.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        return Err("Room codes can only contain letters and numbers".to_string());
    }
    Ok(room_code)
}

#[derive(Clone, Copy)]
enum RateLimitKind {
    Nickname,
    CreateRoom,
    JoinRoom,
    LeaveRoom,
    StartMatch,
}

fn current_joined_players(ctx: &ReducerContext) -> usize {
    ctx.db
        .player()
        .iter()
        .filter(|player| player.connected && player.room_code.is_some())
        .count()
}

fn enforce_rate_limit(
    ctx: &ReducerContext,
    identity: Identity,
    kind: RateLimitKind,
    min_ticks: u32,
    message: &str,
) -> Result<(), String> {
    let tick = current_tick(ctx);
    let mut limiter = ctx
        .db
        .player_rate_limit()
        .identity()
        .find(identity)
        .unwrap_or(PlayerRateLimit {
            identity,
            last_nickname_tick: 0,
            last_create_room_tick: 0,
            last_join_room_tick: 0,
            last_leave_room_tick: 0,
            last_start_match_tick: 0,
        });

    let last_tick = match kind {
        RateLimitKind::Nickname => limiter.last_nickname_tick,
        RateLimitKind::CreateRoom => limiter.last_create_room_tick,
        RateLimitKind::JoinRoom => limiter.last_join_room_tick,
        RateLimitKind::LeaveRoom => limiter.last_leave_room_tick,
        RateLimitKind::StartMatch => limiter.last_start_match_tick,
    };

    if last_tick != 0 && tick.saturating_sub(last_tick) < min_ticks {
        return Err(message.to_string());
    }

    match kind {
        RateLimitKind::Nickname => limiter.last_nickname_tick = tick,
        RateLimitKind::CreateRoom => limiter.last_create_room_tick = tick,
        RateLimitKind::JoinRoom => limiter.last_join_room_tick = tick,
        RateLimitKind::LeaveRoom => limiter.last_leave_room_tick = tick,
        RateLimitKind::StartMatch => limiter.last_start_match_tick = tick,
    }

    if ctx.db.player_rate_limit().identity().find(identity).is_some() {
        ctx.db.player_rate_limit().identity().update(limiter);
    } else {
        ctx.db.player_rate_limit().insert(limiter);
    }
    Ok(())
}

fn coerce_unique_nickname(ctx: &ReducerContext, base: &str, self_identity: Identity) -> String {
    let mut candidate = base.to_string();
    let taken = |name: &str| {
        ctx.db
            .player()
            .iter()
            .any(|player| player.identity != self_identity && player.nickname.eq_ignore_ascii_case(name))
    };
    if !taken(&candidate) {
        return candidate;
    }

    for suffix in 2..=999u16 {
        let suffix_text = suffix.to_string();
        let max_base_len = 16usize.saturating_sub(suffix_text.len());
        let trimmed_base = base.chars().take(max_base_len).collect::<String>();
        candidate = format!("{trimmed_base}{suffix_text}");
        if !taken(&candidate) {
            return candidate;
        }
    }

    "Pilot999".to_string()
}

fn default_nickname_for_identity(identity: Identity) -> String {
    let prefixes = [
        "Ghost", "Nova", "Rogue", "Echo", "Vector", "Shadow", "Blitz", "Cipher", "Volt",
        "Reaper", "Viper", "Mako",
    ];
    let suffixes = [
        "Wolf", "Hawk", "Raven", "Strike", "Pulse", "Frost", "Drift", "Scope", "Forge",
        "Rift", "Storm", "Flare",
    ];

    let id_text = format!("{identity}");
    let tail = id_text.chars().rev().take(4).collect::<String>();
    let parsed = u32::from_str_radix(&tail, 16).unwrap_or(0);
    let prefix = prefixes[(parsed as usize) % prefixes.len()];
    let suffix = suffixes[((parsed as usize) / prefixes.len()) % suffixes.len()];
    let num = (parsed % 900) + 100;
    format!("{prefix}{suffix}{num}").chars().take(16).collect()
}

fn require_player(ctx: &ReducerContext, identity: Identity) -> Result<Player, String> {
    ctx.db
        .player()
        .identity()
        .find(identity)
        .ok_or_else(|| "Player missing".to_string())
}

fn require_player_state(ctx: &ReducerContext, identity: Identity) -> Result<PlayerState, String> {
    ctx.db
        .player_state()
        .identity()
        .find(identity)
        .ok_or_else(|| "Player state missing".to_string())
}

fn require_weapon_state(ctx: &ReducerContext, identity: Identity) -> Result<WeaponState, String> {
    ctx.db
        .weapon_state()
        .identity()
        .find(identity)
        .ok_or_else(|| "Weapon state missing".to_string())
}

fn require_input_state(ctx: &ReducerContext, identity: Identity) -> Result<PlayerInput, String> {
    ctx.db
        .player_input()
        .identity()
        .find(identity)
        .ok_or_else(|| "Input state missing".to_string())
}

fn require_room_membership(ctx: &ReducerContext, identity: Identity) -> Result<String, String> {
    let player = require_player(ctx, identity)?;
    let state = require_player_state(ctx, identity)?;
    let room_code = player
        .room_code
        .clone()
        .ok_or_else(|| "Join a room before using gameplay reducers".to_string())?;

    if !room_membership_is_consistent(
        player.room_code.as_deref(),
        state.room_code.as_deref(),
        None,
    ) {
        return Err("Player state room membership is out of sync".to_string());
    }

    Ok(room_code)
}

fn room_membership_is_consistent(
    player_room: Option<&str>,
    state_room: Option<&str>,
    weapon_room: Option<&str>,
) -> bool {
    match player_room {
        Some(room_code) => {
            state_room == Some(room_code)
                && weapon_room.map(|weapon_code| weapon_code == room_code).unwrap_or(true)
        }
        None => state_room.is_none() && weapon_room.is_none(),
    }
}

fn should_accept_input_sequence(sequence: u32, previous_sequence: u32) -> bool {
    sequence > previous_sequence
}

fn can_fire_weapon_at_tick(next_ready_tick: u32, current_tick: u32) -> bool {
    current_tick >= next_ready_tick
}

fn can_respawn_at_tick(respawn_tick: u32, current_tick: u32) -> bool {
    current_tick >= respawn_tick
}

fn leave_room_internal(ctx: &ReducerContext, identity: Identity) {
    let Some(player) = ctx.db.player().identity().find(identity) else {
        return;
    };
    let Some(room_code) = player.room_code.clone() else {
        return;
    };

    if let Some(room) = ctx.db.room().code().find(room_code.clone()) {
        let next_player_count = room.player_count.saturating_sub(1);
        if next_player_count == 0 {
            remove_room_artifacts(ctx, &room_code);
        } else {
            ctx.db.room().code().update(Room {
                player_count: next_player_count,
                active: room.active,
                ..room
            });
        }
    }

    if let Some(state) = ctx.db.player_state().identity().find(identity) {
        ctx.db.player_state().identity().update(PlayerState {
            room_code: None,
            alive: false,
            vel_x: 0.0,
            vel_y: 0.0,
            vel_z: 0.0,
            server_tick: current_tick(ctx),
            ..state
        });
    }

    if let Some(weapon) = ctx.db.weapon_state().identity().find(identity) {
        ctx.db.weapon_state().identity().update(WeaponState {
            room_code: None,
            ammo_in_mag: RIFLE_MAGAZINE,
            ..weapon
        });
    }

    ctx.db.player().identity().update(Player {
        room_code: None,
        ..player
    });
}

fn remove_room_artifacts(ctx: &ReducerContext, room_code: &str) {
    if let Some(room) = ctx.db.room().code().find(room_code.to_string()) {
        ctx.db.room().code().update(Room {
            player_count: 0,
            active: false,
            ..room
        });
        ctx.db.room().code().delete(room_code.to_string());
    }
    if ctx
        .db
        .match_state()
        .room_code()
        .find(room_code.to_string())
        .is_some()
    {
        ctx.db.match_state().room_code().delete(room_code.to_string());
    }

    let packs: Vec<AmmoPack> = ctx
        .db
        .ammo_pack()
        .iter()
        .filter(|pack| pack.room_code == room_code)
        .collect();
    for pack in packs {
        ctx.db.ammo_pack().id().delete(pack.id);
    }

    let health_packs: Vec<HealthPack> = ctx
        .db
        .health_pack()
        .iter()
        .filter(|pack| pack.room_code == room_code)
        .collect();
    for pack in health_packs {
        ctx.db.health_pack().id().delete(pack.id);
    }
}

fn prune_empty_rooms(ctx: &ReducerContext) {
    let empty_rooms: Vec<Room> = ctx
        .db
        .room()
        .iter()
        .filter(|room| room.player_count == 0 && !room.active)
        .collect();
    for room in empty_rooms {
        remove_room_artifacts(ctx, &room.code);
    }
}

fn choose_spawn(seed: usize) -> Vec3 {
    SPAWN_POINTS[seed % SPAWN_POINTS.len()]
}

fn yaw_towards_arena_center(position: Vec3) -> f32 {
    let to_center_x = -position.x;
    let to_center_z = -position.z;
    (-to_center_x).atan2(-to_center_z)
}

fn simulate_movement_tick(state: PlayerState, input: PlayerInput) -> PlayerState {
    let dt = 1.0 / SERVER_TICK_RATE as f32;
    let mut updated = state;
    updated.yaw = input.yaw;
    updated.pitch = input.pitch.clamp(-MAX_PITCH, MAX_PITCH);

    let move_len = (input.move_x * input.move_x + input.move_z * input.move_z)
        .sqrt()
        .min(1.0);
    let (move_x, move_z) = if move_len > 0.0 {
        let raw_len = (input.move_x * input.move_x + input.move_z * input.move_z).sqrt();
        (input.move_x / raw_len, input.move_z / raw_len)
    } else {
        (0.0, 0.0)
    };

    let forward = Vec3 {
        x: -updated.yaw.sin(),
        y: 0.0,
        z: -updated.yaw.cos(),
    };
    let right = Vec3 {
        x: updated.yaw.cos(),
        y: 0.0,
        z: -updated.yaw.sin(),
    };
    let mut wish = Vec3 {
        x: right.x * move_x + forward.x * move_z,
        y: 0.0,
        z: right.z * move_x + forward.z * move_z,
    };
    let wish_len = (wish.x * wish.x + wish.z * wish.z).sqrt();
    if wish_len > 0.0 {
        wish.x /= wish_len;
        wish.z /= wish_len;
    }

    let desired_speed = if input.sprinting { SPRINT_SPEED } else { WALK_SPEED } * move_len;
    let desired_vel_x = wish.x * desired_speed;
    let desired_vel_z = wish.z * desired_speed;

    if updated.on_ground {
        let ground_control = if move_len > 0.0 {
            GROUND_ACCELERATION
        } else {
            GROUND_FRICTION
        };
        move_horizontal_towards(&mut updated, desired_vel_x, desired_vel_z, ground_control * dt);
        if input.jumping {
            updated.vel_y = JUMP_SPEED;
            updated.on_ground = false;
        } else {
            updated.vel_y = 0.0;
        }
    } else {
        move_horizontal_towards(&mut updated, desired_vel_x, desired_vel_z, AIR_ACCELERATION * dt);
        updated.vel_y -= GRAVITY * dt;
    }

    let target_x = updated.x + updated.vel_x * dt;
    let target_z = updated.z + updated.vel_z * dt;

    if collides_at(target_x, updated.y, updated.z) {
        updated.vel_x = 0.0;
    } else {
        updated.x = target_x;
    }

    if collides_at(updated.x, updated.y, target_z) {
        updated.vel_z = 0.0;
    } else {
        updated.z = target_z;
    }

    let ground = ground_height_at(updated.x, updated.z, updated.y);
    let proposed_y = updated.y + updated.vel_y * dt;
    if proposed_y <= ground {
        updated.y = ground;
        updated.vel_y = 0.0;
        updated.on_ground = true;
    } else {
        updated.y = proposed_y;
        updated.on_ground = false;
    }

    updated.last_processed_input = input.sequence;
    updated
}

fn apply_passive_regen(state: &mut PlayerState, tick: u32) {
    if !state.alive || state.health >= MAX_HEALTH {
        state.regen_progress = 0.0;
        return;
    }

    if tick < state.last_damage_tick.saturating_add(HEALTH_REGEN_DELAY_TICKS) {
        return;
    }

    state.regen_progress += HEALTH_REGEN_PER_TICK;
    while state.regen_progress >= 1.0 && state.health < MAX_HEALTH {
        state.health = state.health.saturating_add(1).min(MAX_HEALTH);
        state.regen_progress -= 1.0;
    }

    if state.health >= MAX_HEALTH {
        state.health = MAX_HEALTH;
        state.regen_progress = 0.0;
    }
}

fn move_horizontal_towards(
    state: &mut PlayerState,
    target_x: f32,
    target_z: f32,
    max_delta: f32,
) {
    let delta_x = target_x - state.vel_x;
    let delta_z = target_z - state.vel_z;
    let delta_len = (delta_x * delta_x + delta_z * delta_z).sqrt();

    if delta_len == 0.0 || delta_len <= max_delta {
        state.vel_x = target_x;
        state.vel_z = target_z;
        return;
    }

    let scale = max_delta / delta_len;
    state.vel_x += delta_x * scale;
    state.vel_z += delta_z * scale;
}

fn overlaps_block(x: f32, z: f32, block: Block) -> bool {
    x + PLAYER_RADIUS > block.min_x
        && x - PLAYER_RADIUS < block.max_x
        && z + PLAYER_RADIUS > block.min_z
        && z - PLAYER_RADIUS < block.max_z
}

fn ground_height_at(x: f32, z: f32, current_feet_y: f32) -> f32 {
    let mut ground = 0.0;
    for block in ARENA_BLOCKS {
        if !overlaps_block(x, z, block) {
            continue;
        }
        if block.max_y <= current_feet_y + PLAYER_STEP_HEIGHT && block.max_y > ground {
            ground = block.max_y;
        }
    }
    ground
}

fn collides_at(x: f32, y: f32, z: f32) -> bool {
    if x - PLAYER_RADIUS < -ARENA_HALF_SIZE
        || x + PLAYER_RADIUS > ARENA_HALF_SIZE
        || z - PLAYER_RADIUS < -ARENA_HALF_SIZE
        || z + PLAYER_RADIUS > ARENA_HALF_SIZE
    {
        return true;
    }

    let head_y = y + PLAYER_HEIGHT;
    for block in ARENA_BLOCKS {
        if x + PLAYER_RADIUS > block.min_x
            && x - PLAYER_RADIUS < block.max_x
            && z + PLAYER_RADIUS > block.min_z
            && z - PLAYER_RADIUS < block.max_z
            && y < block.max_y
            && head_y > block.min_y
        {
            return true;
        }
    }
    false
}

fn direction_from_yaw_pitch(yaw: f32, pitch: f32) -> Vec3 {
    let cos_pitch = pitch.cos();
    Vec3 {
        x: -yaw.sin() * cos_pitch,
        y: pitch.sin(),
        z: -yaw.cos() * cos_pitch,
    }
}

fn ray_hits_player(origin: Vec3, direction: Vec3, center: Vec3) -> Option<f32> {
    let radius = 0.65;
    let offset = Vec3 {
        x: origin.x - center.x,
        y: origin.y - center.y,
        z: origin.z - center.z,
    };
    let a = dot(direction, direction);
    let b = 2.0 * dot(direction, offset);
    let c = dot(offset, offset) - radius * radius;
    let discriminant = b * b - 4.0 * a * c;
    if discriminant < 0.0 {
        return None;
    }

    let sqrt = discriminant.sqrt();
    let near = (-b - sqrt) / (2.0 * a);
    if near >= 0.0 {
        return Some(near);
    }

    let far = (-b + sqrt) / (2.0 * a);
    if far >= 0.0 {
        return Some(far);
    }
    None
}

fn ray_hits_any_block(origin: Vec3, direction: Vec3) -> Option<f32> {
    let mut best: Option<f32> = None;
    for block in ARENA_BLOCKS {
        if let Some(distance) = ray_hits_block(origin, direction, block) {
            match best {
                Some(best_distance) if best_distance <= distance => {}
                _ => best = Some(distance),
            }
        }
    }
    best
}

fn ray_hits_block(origin: Vec3, direction: Vec3, block: Block) -> Option<f32> {
    let inv_x = if direction.x.abs() < 0.0001 { f32::INFINITY } else { 1.0 / direction.x };
    let inv_y = if direction.y.abs() < 0.0001 { f32::INFINITY } else { 1.0 / direction.y };
    let inv_z = if direction.z.abs() < 0.0001 { f32::INFINITY } else { 1.0 / direction.z };

    let mut t1 = (block.min_x - origin.x) * inv_x;
    let mut t2 = (block.max_x - origin.x) * inv_x;
    let mut t_min = t1.min(t2);
    let mut t_max = t1.max(t2);

    t1 = (block.min_y - origin.y) * inv_y;
    t2 = (block.max_y - origin.y) * inv_y;
    t_min = t_min.max(t1.min(t2));
    t_max = t_max.min(t1.max(t2));

    t1 = (block.min_z - origin.z) * inv_z;
    t2 = (block.max_z - origin.z) * inv_z;
    t_min = t_min.max(t1.min(t2));
    t_max = t_max.min(t1.max(t2));

    if t_max >= t_min.max(0.0) {
        Some(t_min.max(0.0))
    } else {
        None
    }
}

fn dot(left: Vec3, right: Vec3) -> f32 {
    left.x * right.x + left.y * right.y + left.z * right.z
}

fn hash01(seed: f32) -> f32 {
    let value = (seed.sin() * 43_758.547).abs();
    value - value.floor()
}

fn apply_weapon_cooldown(ctx: &ReducerContext, mut weapon: WeaponState, tick: u32) {
    weapon.ammo_in_mag = weapon.ammo_in_mag.saturating_sub(1);
    weapon.next_ready_tick = tick + RIFLE_FIRE_INTERVAL_TICKS;
    ctx.db.weapon_state().identity().update(weapon);
}

fn apply_damage(
    ctx: &ReducerContext,
    room_code: String,
    attacker_identity: Identity,
    victim_identity: Identity,
    damage: u16,
) -> Result<(), String> {
    let attacker = require_player(ctx, attacker_identity)?;
    let victim = require_player(ctx, victim_identity)?;
    let mut victim_state = require_player_state(ctx, victim_identity)?;
    let attacker_nickname = attacker.nickname.clone();
    let victim_nickname = victim.nickname.clone();
    let tick = current_tick(ctx);

    let lethal = victim_state.health <= damage;
    victim_state.health = victim_state.health.saturating_sub(damage);
    victim_state.last_damage_tick = tick;
    victim_state.regen_progress = 0.0;

    ctx.db.damage_event().insert(DamageEvent {
        id: 0,
        room_code: room_code.clone(),
        attacker_identity,
        victim_identity,
        amount: damage,
        tick,
        caused_death: lethal,
    });

    if lethal {
        victim_state.alive = false;
        victim_state.respawn_tick = tick + RESPAWN_DELAY_TICKS;
        victim_state.vel_x = 0.0;
        victim_state.vel_y = 0.0;
        victim_state.vel_z = 0.0;
        victim_state.server_tick = tick;
        ctx.db.player_state().identity().update(victim_state);
        ctx.db.player().identity().update(Player {
            deaths: victim.deaths.saturating_add(1),
            ..victim
        });
        ctx.db.player().identity().update(Player {
            kills: attacker.kills.saturating_add(1),
            ..attacker
        });
        ctx.db.kill_feed_event().insert(KillFeedEvent {
            id: 0,
            room_code,
            attacker_identity,
            victim_identity,
            attacker_nickname,
            victim_nickname,
            tick,
        });
    } else {
        victim_state.server_tick = tick;
        ctx.db.player_state().identity().update(victim_state);
    }

    Ok(())
}

fn respawn_player(ctx: &ReducerContext, identity: Identity, room_code: String) {
    let Some(mut state) = ctx.db.player_state().identity().find(identity) else {
        return;
    };
    let Some(mut weapon) = ctx.db.weapon_state().identity().find(identity) else {
        return;
    };

    let spawn = choose_spawn(current_tick(ctx) as usize + room_code.len());
    let spawn_yaw = yaw_towards_arena_center(spawn);
    state.x = spawn.x;
    state.y = spawn.y;
    state.z = spawn.z;
    state.vel_x = 0.0;
    state.vel_y = 0.0;
    state.vel_z = 0.0;
    state.health = MAX_HEALTH;
    state.alive = true;
    state.on_ground = true;
    state.last_damage_tick = current_tick(ctx);
    state.regen_progress = 0.0;
    state.yaw = spawn_yaw;
    state.pitch = 0.0;
    state.server_tick = current_tick(ctx);
    state.last_processed_input = 0;
    state.respawn_tick = current_tick(ctx);

    weapon.ammo_in_mag = RIFLE_MAGAZINE;
    weapon.next_ready_tick = current_tick(ctx);

    reset_player_input(ctx, identity, current_tick(ctx));

    ctx.db.player_state().identity().update(state);
    ctx.db.weapon_state().identity().update(weapon);
}

fn initialize_room_ammo_packs(ctx: &ReducerContext, room_code: &str, tick: u32) {
    if ctx
        .db
        .ammo_pack()
        .iter()
        .any(|pack| pack.room_code == room_code)
    {
        return;
    }

    let room_seed = room_code
        .bytes()
        .fold(0u32, |acc, byte| acc.wrapping_mul(31).wrapping_add(byte as u32))
        as usize;
    for slot in 0..AMMO_PACK_ACTIVE_COUNT {
        let location_index = ((room_seed + slot * 3) % AMMO_PACK_LOCATIONS.len()) as u16;
        let point = AMMO_PACK_LOCATIONS[location_index as usize];
        ctx.db.ammo_pack().insert(AmmoPack {
            id: 0,
            room_code: room_code.to_string(),
            x: point.x,
            y: point.y,
            z: point.z,
            location_index,
            active: true,
            respawn_tick: tick,
        });
    }
}

fn initialize_room_health_packs(ctx: &ReducerContext, room_code: &str, tick: u32) {
    if ctx
        .db
        .health_pack()
        .iter()
        .any(|pack| pack.room_code == room_code)
    {
        return;
    }

    let room_seed = room_code
        .bytes()
        .fold(0u32, |acc, byte| acc.wrapping_mul(41).wrapping_add(byte as u32))
        as usize;
    for slot in 0..HEALTH_PACK_ACTIVE_COUNT {
        let location_index = ((room_seed + slot * 5) % HEALTH_PACK_LOCATIONS.len()) as u16;
        let point = HEALTH_PACK_LOCATIONS[location_index as usize];
        ctx.db.health_pack().insert(HealthPack {
            id: 0,
            room_code: room_code.to_string(),
            x: point.x,
            y: point.y,
            z: point.z,
            location_index,
            active: true,
            respawn_tick: tick,
        });
    }
}

fn player_touches_pickup(state: &PlayerState, pickup: Vec3, pickup_radius: f32) -> bool {
    let dx = state.x - pickup.x;
    let dz = state.z - pickup.z;
    let max_horizontal = PLAYER_RADIUS + pickup_radius;
    if dx * dx + dz * dz > max_horizontal * max_horizontal {
        return false;
    }

    let player_min_y = state.y;
    let player_max_y = state.y + PLAYER_HEIGHT;
    let pickup_min_y = pickup.y - pickup_radius;
    let pickup_max_y = pickup.y + pickup_radius;

    pickup_max_y >= player_min_y && pickup_min_y <= player_max_y
}

fn process_ammo_packs(ctx: &ReducerContext, tick: u32) {
    let packs: Vec<AmmoPack> = ctx.db.ammo_pack().iter().collect();
    let states: Vec<PlayerState> = ctx.db.player_state().iter().collect();

    for mut pack in packs {
        if !pack.active {
            if tick >= pack.respawn_tick {
                let occupied_locations: Vec<u16> = ctx
                    .db
                    .ammo_pack()
                    .iter()
                    .filter(|other| {
                        other.room_code == pack.room_code && other.active && other.id != pack.id
                    })
                    .map(|other| other.location_index)
                    .collect();
                let next_location = choose_next_ammo_location(
                    pack.location_index,
                    &occupied_locations,
                    tick,
                    pack.id,
                    &pack.room_code,
                );
                let next_point = AMMO_PACK_LOCATIONS[next_location as usize];
                pack.location_index = next_location;
                pack.x = next_point.x;
                pack.y = next_point.y;
                pack.z = next_point.z;
                pack.active = true;
                ctx.db.ammo_pack().id().update(pack);
            }
            continue;
        }

        let mut collected = false;
        let pickup_position = Vec3 {
            x: pack.x,
            y: pack.y,
            z: pack.z,
        };
        for state in &states {
            if !state.alive {
                continue;
            }
            if state.room_code.as_deref() != Some(pack.room_code.as_str()) {
                continue;
            }
            if !player_touches_pickup(state, pickup_position, AMMO_PACK_RADIUS) {
                continue;
            }

            let Some(mut weapon) = ctx.db.weapon_state().identity().find(state.identity) else {
                continue;
            };
            if weapon.room_code.as_deref() != Some(pack.room_code.as_str()) {
                continue;
            }
            if weapon.ammo_in_mag >= RIFLE_MAGAZINE {
                continue;
            }

            weapon.ammo_in_mag = weapon
                .ammo_in_mag
                .saturating_add(AMMO_PACK_AMOUNT)
                .min(RIFLE_MAGAZINE);
            ctx.db.weapon_state().identity().update(weapon);
            collected = true;
            break;
        }

        if collected {
            pack.active = false;
            pack.respawn_tick = tick + AMMO_PACK_RESPAWN_TICKS;
            ctx.db.ammo_pack().id().update(pack);
        }
    }
}

fn process_health_packs(ctx: &ReducerContext, tick: u32) {
    let packs: Vec<HealthPack> = ctx.db.health_pack().iter().collect();
    let states: Vec<PlayerState> = ctx.db.player_state().iter().collect();

    for mut pack in packs {
        if !pack.active {
            if tick >= pack.respawn_tick {
                let occupied_locations: Vec<u16> = ctx
                    .db
                    .health_pack()
                    .iter()
                    .filter(|other| {
                        other.room_code == pack.room_code && other.active && other.id != pack.id
                    })
                    .map(|other| other.location_index)
                    .collect();
                let next_location = choose_next_health_location(
                    pack.location_index,
                    &occupied_locations,
                    tick,
                    pack.id,
                    &pack.room_code,
                );
                let next_point = HEALTH_PACK_LOCATIONS[next_location as usize];
                pack.location_index = next_location;
                pack.x = next_point.x;
                pack.y = next_point.y;
                pack.z = next_point.z;
                pack.active = true;
                ctx.db.health_pack().id().update(pack);
            }
            continue;
        }

        let mut collected = false;
        let pickup_position = Vec3 {
            x: pack.x,
            y: pack.y,
            z: pack.z,
        };
        for state in &states {
            if !state.alive {
                continue;
            }
            if state.room_code.as_deref() != Some(pack.room_code.as_str()) {
                continue;
            }
            if state.health >= MAX_HEALTH {
                continue;
            }
            if !player_touches_pickup(state, pickup_position, HEALTH_PACK_RADIUS) {
                continue;
            }

            let Some(mut player_state) = ctx.db.player_state().identity().find(state.identity) else {
                continue;
            };
            if player_state.health >= MAX_HEALTH {
                continue;
            }
            player_state.health = player_state
                .health
                .saturating_add(HEALTH_PACK_AMOUNT)
                .min(MAX_HEALTH);
            player_state.regen_progress = 0.0;
            player_state.server_tick = tick;
            ctx.db.player_state().identity().update(player_state);
            collected = true;
            break;
        }

        if collected {
            pack.active = false;
            pack.respawn_tick = tick + HEALTH_PACK_RESPAWN_TICKS;
            ctx.db.health_pack().id().update(pack);
        }
    }
}

fn choose_next_ammo_location(
    previous_location: u16,
    occupied_locations: &[u16],
    tick: u32,
    pack_id: u32,
    room_code: &str,
) -> u16 {
    let seed = room_code
        .bytes()
        .fold(tick.wrapping_add(pack_id.wrapping_mul(97)), |acc, byte| {
            acc.wrapping_mul(37).wrapping_add(byte as u32)
        });
    let location_count = AMMO_PACK_LOCATIONS.len() as u32;

    for step in 0..location_count {
        let index = ((seed.wrapping_add(step)) % location_count) as u16;
        if index == previous_location {
            continue;
        }
        if occupied_locations.contains(&index) {
            continue;
        }
        return index;
    }

    previous_location
}

fn choose_next_health_location(
    previous_location: u16,
    occupied_locations: &[u16],
    tick: u32,
    pack_id: u32,
    room_code: &str,
) -> u16 {
    let seed = room_code
        .bytes()
        .fold(tick.wrapping_add(pack_id.wrapping_mul(149)), |acc, byte| {
            acc.wrapping_mul(43).wrapping_add(byte as u32)
        });
    let location_count = HEALTH_PACK_LOCATIONS.len() as u32;

    for step in 0..location_count {
        let index = ((seed.wrapping_add(step)) % location_count) as u16;
        if index == previous_location {
            continue;
        }
        if occupied_locations.contains(&index) {
            continue;
        }
        return index;
    }

    previous_location
}

fn reset_player_input(ctx: &ReducerContext, identity: Identity, tick: u32) {
    let next = PlayerInput {
        identity,
        sequence: 0,
        move_x: 0.0,
        move_z: 0.0,
        yaw: 0.0,
        pitch: 0.0,
        jumping: false,
        sprinting: false,
        last_received_tick: tick,
    };

    if ctx.db.player_input().identity().find(identity).is_some() {
        ctx.db.player_input().identity().update(next);
    } else {
        ctx.db.player_input().insert(next);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        can_fire_weapon_at_tick, can_respawn_at_tick, should_accept_input_sequence,
        room_membership_is_consistent, validate_room_code,
    };

    #[test]
    fn weapon_cooldown_enforcement_is_authoritative() {
        assert!(can_fire_weapon_at_tick(8, 8));
        assert!(!can_fire_weapon_at_tick(9, 8));
    }

    #[test]
    fn respawn_timing_requires_authoritative_tick() {
        assert!(!can_respawn_at_tick(40, 39));
        assert!(can_respawn_at_tick(40, 40));
    }

    #[test]
    fn room_membership_constraints_require_consistent_state() {
        assert!(validate_room_code("arena1".to_string()).is_ok());
        assert!(room_membership_is_consistent(
            Some("ARENA"),
            Some("ARENA"),
            Some("ARENA")
        ));
        assert!(!room_membership_is_consistent(
            Some("ARENA"),
            Some("DUEL"),
            Some("ARENA")
        ));
        assert!(!room_membership_is_consistent(
            Some("ARENA"),
            Some("ARENA"),
            Some("DUEL")
        ));
    }

    #[test]
    fn input_sequence_handling_only_accepts_monotonic_inputs() {
        assert!(should_accept_input_sequence(11, 10));
        assert!(!should_accept_input_sequence(10, 10));
        assert!(!should_accept_input_sequence(9, 10));
    }
}
