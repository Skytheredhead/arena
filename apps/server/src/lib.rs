use spacetimedb::{reducer, table, Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

mod generated_collision;

use generated_collision::ARENA_BLOCKS;

const SERVER_TICK_RATE: u32 = 40;
const SERVER_TICK_MS: u32 = 1000 / SERVER_TICK_RATE;
const SERVER_TICK_INTERVAL_US: i64 = (SERVER_TICK_MS as i64) * 1000;
const MATCH_DURATION_TICKS: u32 = SERVER_TICK_RATE * 180;
const INPUT_STALE_TICKS: u32 = 4;
const SIM_TICK_SCHEDULE_ID: u64 = 1;
const MAX_OPEN_ROOMS: usize = 5;
const MAX_TOTAL_PLAYERS: usize = 50;
const MAX_PLAYERS_PER_ROOM: u16 = 5;
const ROOM_ACTION_RATE_LIMIT_TICKS: u32 = 8;
const ROOM_PRUNE_GRACE_TICKS: u32 = SERVER_TICK_RATE * 15;
const NICKNAME_RATE_LIMIT_TICKS: u32 = 24;
const CHAT_RATE_LIMIT_TICKS: u32 = 4;
const MAX_IMPACT_MARKS_PER_ROOM: usize = 120;
const CHAT_EVENT_TTL_TICKS: u32 = SERVER_TICK_RATE * 10;
const CHAT_MESSAGE_MAX_CHARS: usize = 160;

const PLAYER_HEIGHT: f32 = 1.8;
const PLAYER_RADIUS: f32 = 0.4;
const PLAYER_HITBOX_HALF: f32 = 0.45;
const PLAYER_STEP_HEIGHT: f32 = 0.65;
const PLAYER_EYE_HEIGHT: f32 = 1.58;
const CROUCH_HEIGHT: f32 = 1.35;
const CROUCH_HITBOX_HALF: f32 = 0.36;
const CROUCH_EYE_HEIGHT: f32 = 1.2;

const WALK_SPEED: f32 = 6.4;
const CROUCH_SPEED: f32 = 3.4;
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
const AMMO_PACK_RADIUS: f32 = 0.95;
const AMMO_PACK_ACTIVE_COUNT: usize = 12;
const HEALTH_PACK_AMOUNT: u16 = 50;
const HEALTH_PACK_RESPAWN_TICKS: u32 = SERVER_TICK_RATE * 10;
const HEALTH_PACK_RADIUS: f32 = 0.5;
const HEALTH_PACK_ACTIVE_COUNT: usize = 2;
const PICKUP_HORIZONTAL_GRACE: f32 = 0.7;
const PICKUP_VERTICAL_GRACE: f32 = 0.6;
const PICKUP_SWEEP_EXTRA: f32 = 0.35;
const PICKUP_HEIGHT_MAX: f32 = 1.4;
const COLLISION_EPSILON: f32 = 0.0001;
const MOVEMENT_SUBSTEP_MAX_DISTANCE: f32 = 0.12;
const RAY_DIRECTION_EPSILON: f32 = 0.0001;
const BULLET_RAY_INSET: f32 = 0.005;
const TWO_PI: f32 = std::f32::consts::PI * 2.0;
const ARENA_MIN_X: f32 = -30.0;
const ARENA_MAX_X: f32 = 30.0;
const ARENA_MIN_Z: f32 = -31.0;
const ARENA_MAX_Z: f32 = 29.0;

const BLOCKED_TERMS: [&str; 34] = [
    "fuck",
    "fucking",
    "motherfucker",
    "shit",
    "bullshit",
    "bitch",
    "cunt",
    "whore",
    "slut",
    "dick",
    "cock",
    "pussy",
    "asshole",
    "bastard",
    "nigger",
    "nigga",
    "faggot",
    "fag",
    "kike",
    "spic",
    "chink",
    "wetback",
    "tranny",
    "retard",
    "rape",
    "rapist",
    "pedophile",
    "molester",
    "terrorist",
    "nazis",
    "hitler",
    "lynch",
    "genocide",
    "kkk",
];

#[derive(Clone, Copy)]
struct Vec3 {
    x: f32,
    y: f32,
    z: f32,
}

#[derive(Clone, Copy)]
struct Block {
    min_y: f32,
    center_x: f32,
    center_z: f32,
    max_y: f32,
    half_x: f32,
    half_z: f32,
    yaw: f32,
}

const SPAWN_POINTS: [Vec3; 8] = [
    Vec3 {
        x: -26.0,
        y: 0.0,
        z: -28.0,
    },
    Vec3 {
        x: 26.0,
        y: 0.0,
        z: -28.0,
    },
    Vec3 {
        x: -26.0,
        y: 0.0,
        z: 24.0,
    },
    Vec3 {
        x: 26.0,
        y: 0.0,
        z: 24.0,
    },
    Vec3 {
        x: 0.0,
        y: 0.0,
        z: -29.0,
    },
    Vec3 {
        x: 0.0,
        y: 0.0,
        z: 27.0,
    },
    Vec3 {
        x: -24.0,
        y: 0.0,
        z: -10.0,
    },
    Vec3 {
        x: 24.0,
        y: 0.0,
        z: -10.0,
    },
];

const AMMO_PACK_LOCATIONS: [Vec3; 20] = [
    Vec3 {
        x: -20.0,
        y: 0.0,
        z: 20.0,
    },
    Vec3 {
        x: 20.0,
        y: 0.0,
        z: 20.0,
    },
    Vec3 {
        x: -22.0,
        y: 0.0,
        z: 2.0,
    },
    Vec3 {
        x: -25.0,
        y: 0.0,
        z: 8.0,
    },
    Vec3 {
        x: -6.0,
        y: 0.0,
        z: 24.0,
    },
    Vec3 {
        x: 6.0,
        y: 0.0,
        z: 12.0,
    },
    Vec3 {
        x: -1.0,
        y: 0.0,
        z: -16.0,
    },
    Vec3 {
        x: -15.0,
        y: 0.0,
        z: -6.0,
    },
    Vec3 {
        x: 15.0,
        y: 0.0,
        z: 4.0,
    },
    Vec3 {
        x: 15.0,
        y: 0.0,
        z: -10.0,
    },
    Vec3 {
        x: -24.0,
        y: 0.0,
        z: -20.0,
    },
    Vec3 {
        x: 24.0,
        y: 0.0,
        z: -20.0,
    },
    Vec3 {
        x: -20.0,
        y: 0.0,
        z: -24.0,
    },
    Vec3 {
        x: 20.0,
        y: 0.0,
        z: -24.0,
    },
    Vec3 {
        x: -8.0,
        y: 0.0,
        z: 18.0,
    },
    Vec3 {
        x: 8.0,
        y: 0.0,
        z: 18.0,
    },
    Vec3 {
        x: -8.0,
        y: 0.0,
        z: -22.0,
    },
    Vec3 {
        x: 8.0,
        y: 0.0,
        z: -22.0,
    },
    Vec3 {
        x: 0.0,
        y: 0.0,
        z: 6.0,
    },
    Vec3 {
        x: 0.0,
        y: 0.0,
        z: -6.0,
    },
];

const HEALTH_PACK_LOCATIONS: [Vec3; 4] = [
    Vec3 {
        x: -12.0,
        y: 0.0,
        z: 8.0,
    },
    Vec3 {
        x: 12.0,
        y: 0.0,
        z: 8.0,
    },
    Vec3 {
        x: -9.0,
        y: 0.0,
        z: -8.0,
    },
    Vec3 {
        x: 9.0,
        y: 0.0,
        z: -8.0,
    },
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
    #[default(0)]
    last_chat_tick: u32,
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

#[table(accessor = impact_mark, public)]
pub struct ImpactMark {
    #[primary_key]
    #[auto_inc]
    id: u32,
    room_code: String,
    x: f32,
    y: f32,
    z: f32,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
    tick: u32,
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

#[table(accessor = chat_event, public)]
pub struct ChatEvent {
    #[primary_key]
    #[auto_inc]
    id: u32,
    room_code: String,
    sender_identity: Identity,
    sender_nickname: String,
    message: String,
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

    if ctx
        .db
        .player_state()
        .identity()
        .find(ctx.sender())
        .is_none()
    {
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

    if ctx
        .db
        .weapon_state()
        .identity()
        .find(ctx.sender())
        .is_none()
    {
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
            last_chat_tick: 0,
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
pub fn send_chat_message(ctx: &ReducerContext, message: String) -> Result<(), String> {
    enforce_rate_limit(
        ctx,
        ctx.sender(),
        RateLimitKind::Chat,
        CHAT_RATE_LIMIT_TICKS,
        "Sending chat too fast",
    )?;
    let room_code = require_room_membership(ctx, ctx.sender())?;
    let sender = require_player(ctx, ctx.sender())?;
    let sanitized = validate_chat_message(message)?;
    let tick = current_tick(ctx);
    ctx.db.chat_event().insert(ChatEvent {
        id: 0,
        room_code,
        sender_identity: ctx.sender(),
        sender_nickname: sender.nickname,
        message: sanitized,
        tick,
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
    if player.room_code.as_deref() != Some(room_code.as_str())
        && room.player_count >= MAX_PLAYERS_PER_ROOM
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
    let movement_ratio = (movement_speed / WALK_SPEED).clamp(0.0, 1.0);
    let scoped_factor = if scoped { 0.45 } else { 1.0 };
    let spread = (BASE_WEAPON_SPREAD + movement_ratio * MOVEMENT_SPREAD) * scoped_factor;
    let base_seed = tick as f32 * 0.197 + state.x * 1.31 + state.z * 2.17 + state.yaw * 0.97;
    let yaw_offset = (hash01(base_seed) - 0.5) * 2.0 * spread;
    let pitch_offset = (hash01(base_seed + 17.13) - 0.5) * 2.0 * spread;

    let aim_yaw = yaw + yaw_offset;
    let aim_pitch = (pitch + pitch_offset).clamp(-MAX_PITCH, MAX_PITCH);
    let direction = direction_from_yaw_pitch(aim_yaw, aim_pitch);
    let shooter_crouching = ctx
        .db
        .player_input()
        .identity()
        .find(ctx.sender())
        .map(|input| input.sprinting)
        .unwrap_or(false);
    let eye_height = if shooter_crouching {
        CROUCH_EYE_HEIGHT
    } else {
        PLAYER_EYE_HEIGHT
    };
    let origin = Vec3 {
        x: state.x,
        y: state.y + eye_height,
        z: state.z,
    };
    let block_hit = ray_hits_any_block(origin, direction);

    let mut best_hit: Option<(Identity, f32)> = None;
    for target in ctx.db.player_state().iter() {
        if target.identity == ctx.sender() || !target.alive {
            continue;
        }
        if target.room_code.as_deref() != Some(room_code.as_str()) {
            continue;
        }

        let position = Vec3 {
            x: target.x,
            y: target.y,
            z: target.z,
        };
        let crouching = ctx
            .db
            .player_input()
            .identity()
            .find(target.identity)
            .map(|input| input.sprinting)
            .unwrap_or(false);
        if let Some(distance) = ray_hits_player(origin, direction, position, crouching) {
            if distance <= RIFLE_RANGE {
                match best_hit {
                    Some((_, best_distance)) if best_distance <= distance => {}
                    _ => best_hit = Some((target.identity, distance)),
                }
            }
        }
    }

    if let Some((victim_identity, victim_distance)) = best_hit {
        if let Some(block_hit) = block_hit {
            if block_hit.distance < victim_distance {
                insert_impact_mark(
                    ctx,
                    &room_code,
                    point_along_ray(origin, direction, block_hit.distance),
                    block_hit.normal,
                    tick,
                );
                apply_weapon_cooldown(ctx, weapon, tick);
                return Ok(());
            }
        }

        apply_damage(
            ctx,
            room_code.clone(),
            ctx.sender(),
            victim_identity,
            RIFLE_DAMAGE,
        )?;
    } else if let Some(block_hit) = block_hit {
        insert_impact_mark(
            ctx,
            &room_code,
            point_along_ray(origin, direction, block_hit.distance),
            block_hit.normal,
            tick,
        );
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

        let mut updated = MatchState {
            tick,
            ..match_state
        };
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
    prune_chat_events(ctx, tick);

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
    if contains_blocked_language(nickname) {
        return Err("Nickname contains blocked language".to_string());
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

fn validate_chat_message(value: String) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Chat message cannot be empty".to_string());
    }
    if trimmed.chars().count() > CHAT_MESSAGE_MAX_CHARS {
        return Err(format!(
            "Chat message must be {CHAT_MESSAGE_MAX_CHARS} characters or fewer"
        ));
    }

    Ok(censor_blocked_language(trimmed))
}

fn contains_blocked_language(value: &str) -> bool {
    let normalized = normalize_filter_text(value);
    if normalized.is_empty() {
        return false;
    }
    if contains_any_blocked_term(&normalized) {
        return true;
    }

    let collapsed = collapse_repeated_letters(&normalized);
    contains_any_blocked_term(&collapsed)
}

fn contains_any_blocked_term(normalized: &str) -> bool {
    BLOCKED_TERMS.iter().any(|term| normalized.contains(term))
}

fn collapse_repeated_letters(value: &str) -> String {
    let mut collapsed = String::with_capacity(value.len());
    let mut previous = '\0';
    for ch in value.chars() {
        if ch == previous {
            continue;
        }
        collapsed.push(ch);
        previous = ch;
    }
    collapsed
}

fn normalize_filter_char(ch: char) -> Option<char> {
    let mapped = match ch.to_ascii_lowercase() {
        'a'..='z' => ch.to_ascii_lowercase(),
        '0' => 'o',
        '1' | '!' | '|' => 'i',
        '2' => 'z',
        '3' => 'e',
        '4' | '@' => 'a',
        '5' | '$' => 's',
        '6' => 'g',
        '7' => 't',
        '8' => 'b',
        '9' => 'g',
        _ => return None,
    };
    Some(mapped)
}

fn normalize_filter_text(value: &str) -> String {
    let mut normalized = String::new();
    for ch in value.chars() {
        if let Some(mapped) = normalize_filter_char(ch) {
            normalized.push(mapped);
        }
    }
    normalized
}

fn censor_blocked_language(value: &str) -> String {
    let mut out_tokens: Vec<String> = Vec::new();
    for token in value.split_whitespace() {
        if token.is_empty() {
            continue;
        }
        out_tokens.push(censor_token(token));
    }
    out_tokens.join(" ")
}

fn censor_token(token: &str) -> String {
    let mut start = None;
    let mut end = None;
    for (index, ch) in token.char_indices() {
        if normalize_filter_char(ch).is_some() {
            if start.is_none() {
                start = Some(index);
            }
            end = Some(index + ch.len_utf8());
        }
    }
    let (Some(core_start), Some(core_end)) = (start, end) else {
        return token.to_string();
    };
    let core = &token[core_start..core_end];
    if !contains_blocked_language(core) {
        return token.to_string();
    }

    let mut masked = String::new();
    masked.push_str(&token[..core_start]);
    masked.push_str("*****");
    masked.push_str(&token[core_end..]);
    masked
}

#[derive(Clone, Copy)]
enum RateLimitKind {
    Nickname,
    CreateRoom,
    JoinRoom,
    LeaveRoom,
    StartMatch,
    Chat,
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
            last_chat_tick: 0,
        });

    let last_tick = match kind {
        RateLimitKind::Nickname => limiter.last_nickname_tick,
        RateLimitKind::CreateRoom => limiter.last_create_room_tick,
        RateLimitKind::JoinRoom => limiter.last_join_room_tick,
        RateLimitKind::LeaveRoom => limiter.last_leave_room_tick,
        RateLimitKind::StartMatch => limiter.last_start_match_tick,
        RateLimitKind::Chat => limiter.last_chat_tick,
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
        RateLimitKind::Chat => limiter.last_chat_tick = tick,
    }

    if ctx
        .db
        .player_rate_limit()
        .identity()
        .find(identity)
        .is_some()
    {
        ctx.db.player_rate_limit().identity().update(limiter);
    } else {
        ctx.db.player_rate_limit().insert(limiter);
    }
    Ok(())
}

fn coerce_unique_nickname(ctx: &ReducerContext, base: &str, self_identity: Identity) -> String {
    let mut candidate = base.to_string();
    let taken = |name: &str| {
        ctx.db.player().iter().any(|player| {
            player.identity != self_identity && player.nickname.eq_ignore_ascii_case(name)
        })
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
        "Ghost", "Nova", "Rogue", "Echo", "Vector", "Shadow", "Blitz", "Cipher", "Volt", "Reaper",
        "Viper", "Mako",
    ];
    let suffixes = [
        "Wolf", "Hawk", "Raven", "Strike", "Pulse", "Frost", "Drift", "Scope", "Forge", "Rift",
        "Storm", "Flare",
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
                && weapon_room
                    .map(|weapon_code| weapon_code == room_code)
                    .unwrap_or(true)
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
        ctx.db
            .match_state()
            .room_code()
            .delete(room_code.to_string());
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

    let impact_marks: Vec<ImpactMark> = ctx
        .db
        .impact_mark()
        .iter()
        .filter(|mark| mark.room_code == room_code)
        .collect();
    for mark in impact_marks {
        ctx.db.impact_mark().id().delete(mark.id);
    }

    let chat_events: Vec<ChatEvent> = ctx
        .db
        .chat_event()
        .iter()
        .filter(|event| event.room_code == room_code)
        .collect();
    for event in chat_events {
        ctx.db.chat_event().id().delete(event.id);
    }
}

fn prune_empty_rooms(ctx: &ReducerContext) {
    let tick = current_tick(ctx);
    let empty_rooms: Vec<Room> = ctx
        .db
        .room()
        .iter()
        .filter(|room| {
            room.player_count == 0
                && !room.active
                && tick.saturating_sub(room.created_tick) >= ROOM_PRUNE_GRACE_TICKS
        })
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

    let desired_speed = if input.sprinting {
        CROUCH_SPEED
    } else {
        WALK_SPEED
    } * move_len;
    let desired_vel_x = wish.x * desired_speed;
    let desired_vel_z = wish.z * desired_speed;

    if updated.on_ground {
        let ground_control = if move_len > 0.0 {
            GROUND_ACCELERATION
        } else {
            GROUND_FRICTION
        };
        move_horizontal_towards(
            &mut updated,
            desired_vel_x,
            desired_vel_z,
            ground_control * dt,
        );
        if input.jumping {
            updated.vel_y = JUMP_SPEED;
            updated.on_ground = false;
        } else {
            updated.vel_y = 0.0;
        }
    } else {
        move_horizontal_towards(
            &mut updated,
            desired_vel_x,
            desired_vel_z,
            AIR_ACCELERATION * dt,
        );
        updated.vel_y -= GRAVITY * dt;
    }

    let mut collision_height = if input.sprinting {
        CROUCH_HEIGHT
    } else {
        PLAYER_HEIGHT
    };
    if !input.sprinting && collides_at_with_height(updated.x, updated.y, updated.z, PLAYER_HEIGHT) {
        collision_height = CROUCH_HEIGHT;
    }

    let horizontal_delta_x = updated.vel_x * dt;
    let horizontal_delta_z = updated.vel_z * dt;
    resolve_horizontal_motion(
        &mut updated,
        horizontal_delta_x,
        horizontal_delta_z,
        collision_height,
    );

    let ground = ground_height_at(updated.x, updated.z, updated.y);
    let mut proposed_y = updated.y + updated.vel_y * dt;
    if updated.vel_y > 0.0
        && collides_at_with_height(updated.x, proposed_y, updated.z, collision_height)
    {
        let mut low = updated.y;
        let mut high = proposed_y;
        for _ in 0..8 {
            let midpoint = (low + high) * 0.5;
            if collides_at_with_height(updated.x, midpoint, updated.z, collision_height) {
                high = midpoint;
            } else {
                low = midpoint;
            }
        }
        proposed_y = low;
        updated.vel_y = 0.0;
    }
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

    if tick
        < state
            .last_damage_tick
            .saturating_add(HEALTH_REGEN_DELAY_TICKS)
    {
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

fn move_horizontal_towards(state: &mut PlayerState, target_x: f32, target_z: f32, max_delta: f32) {
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

fn resolve_horizontal_motion(
    state: &mut PlayerState,
    delta_x: f32,
    delta_z: f32,
    player_height: f32,
) {
    let max_delta = delta_x.abs().max(delta_z.abs());
    let step_count = ((max_delta / MOVEMENT_SUBSTEP_MAX_DISTANCE).ceil() as u32).max(1);
    let step_x = delta_x / step_count as f32;
    let step_z = delta_z / step_count as f32;
    let mut move_x_open = true;
    let mut move_z_open = true;

    for _ in 0..step_count {
        if move_x_open {
            let target_x = state.x + step_x;
            if collides_at_with_height(target_x, state.y, state.z, player_height) {
                state.vel_x = 0.0;
                move_x_open = false;
            } else {
                state.x = target_x;
            }
        }

        if move_z_open {
            let target_z = state.z + step_z;
            if collides_at_with_height(state.x, state.y, target_z, player_height) {
                state.vel_z = 0.0;
                move_z_open = false;
            } else {
                state.z = target_z;
            }
        }

        if !move_x_open && !move_z_open {
            break;
        }
    }
}

#[derive(Clone, Copy)]
struct BlockHit {
    distance: f32,
    normal: Vec3,
}

fn normalize_angle(mut angle: f32) -> f32 {
    while angle <= -std::f32::consts::PI {
        angle += TWO_PI;
    }
    while angle > std::f32::consts::PI {
        angle -= TWO_PI;
    }
    angle
}

fn normalized_block(block: Block) -> Block {
    let mut normalized = block;
    normalized.yaw = normalize_angle(normalized.yaw);
    normalized
}

fn rotate_into_block_space(x: f32, z: f32, block: Block) -> (f32, f32) {
    let dx = x - block.center_x;
    let dz = z - block.center_z;
    let cos = block.yaw.cos();
    let sin = block.yaw.sin();
    (dx * cos + dz * sin, -dx * sin + dz * cos)
}

fn rotate_out_of_block_space(x: f32, z: f32, block: Block) -> (f32, f32) {
    let cos = block.yaw.cos();
    let sin = block.yaw.sin();
    (x * cos - z * sin, x * sin + z * cos)
}

fn overlaps_block(x: f32, z: f32, block: Block) -> bool {
    let block = normalized_block(block);
    let (local_x, local_z) = rotate_into_block_space(x, z, block);
    let closest_x = local_x.clamp(-block.half_x, block.half_x);
    let closest_z = local_z.clamp(-block.half_z, block.half_z);
    let dx = local_x - closest_x;
    let dz = local_z - closest_z;
    dx * dx + dz * dz <= (PLAYER_RADIUS + COLLISION_EPSILON) * (PLAYER_RADIUS + COLLISION_EPSILON)
}

fn point_within_block_footprint(x: f32, z: f32, block: Block) -> bool {
    let block = normalized_block(block);
    let (local_x, local_z) = rotate_into_block_space(x, z, block);
    local_x.abs() <= block.half_x + COLLISION_EPSILON
        && local_z.abs() <= block.half_z + COLLISION_EPSILON
}

fn pickup_floor_height_at(x: f32, z: f32) -> f32 {
    let mut ground = 0.0;
    for block in ARENA_BLOCKS {
        if !point_within_block_footprint(x, z, block) {
            continue;
        }
        if block.max_y <= PICKUP_HEIGHT_MAX && block.max_y > ground {
            ground = block.max_y;
        }
    }
    ground
}

fn resolve_pickup_spawn_point(base: Vec3) -> Vec3 {
    const OFFSETS: [(f32, f32); 9] = [
        (0.0, 0.0),
        (0.6, 0.0),
        (-0.6, 0.0),
        (0.0, 0.6),
        (0.0, -0.6),
        (0.42, 0.42),
        (-0.42, 0.42),
        (0.42, -0.42),
        (-0.42, -0.42),
    ];

    for (offset_x, offset_z) in OFFSETS {
        let candidate_x = base.x + offset_x;
        let candidate_z = base.z + offset_z;
        let candidate_y = pickup_floor_height_at(candidate_x, candidate_z);
        if !collides_at(candidate_x, candidate_y, candidate_z) {
            return Vec3 {
                x: candidate_x,
                y: candidate_y,
                z: candidate_z,
            };
        }
    }

    Vec3 {
        x: base.x,
        y: pickup_floor_height_at(base.x, base.z),
        z: base.z,
    }
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
    collides_at_with_height(x, y, z, PLAYER_HEIGHT)
}

fn collides_at_with_height(x: f32, y: f32, z: f32, player_height: f32) -> bool {
    if x - PLAYER_RADIUS < ARENA_MIN_X
        || x + PLAYER_RADIUS > ARENA_MAX_X
        || z - PLAYER_RADIUS < ARENA_MIN_Z
        || z + PLAYER_RADIUS > ARENA_MAX_Z
    {
        return true;
    }

    let head_y = y + player_height;
    for block in ARENA_BLOCKS {
        if overlaps_block(x, z, block) && y < block.max_y && head_y > block.min_y {
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

fn ray_hits_player(origin: Vec3, direction: Vec3, position: Vec3, crouching: bool) -> Option<f32> {
    let hitbox_half = if crouching {
        CROUCH_HITBOX_HALF
    } else {
        PLAYER_HITBOX_HALF
    };
    let hitbox_height = if crouching {
        CROUCH_HEIGHT
    } else {
        PLAYER_HEIGHT
    };
    let min_x = position.x - hitbox_half;
    let max_x = position.x + hitbox_half;
    let min_y = position.y;
    let max_y = position.y + hitbox_height;
    let min_z = position.z - hitbox_half;
    let max_z = position.z + hitbox_half;

    let inv_x = if direction.x.abs() < 0.0001 {
        if origin.x < min_x || origin.x > max_x {
            return None;
        }
        f32::INFINITY
    } else {
        1.0 / direction.x
    };
    let inv_y = if direction.y.abs() < 0.0001 {
        if origin.y < min_y || origin.y > max_y {
            return None;
        }
        f32::INFINITY
    } else {
        1.0 / direction.y
    };
    let inv_z = if direction.z.abs() < 0.0001 {
        if origin.z < min_z || origin.z > max_z {
            return None;
        }
        f32::INFINITY
    } else {
        1.0 / direction.z
    };

    let mut t1 = (min_x - origin.x) * inv_x;
    let mut t2 = (max_x - origin.x) * inv_x;
    let mut t_min = t1.min(t2);
    let mut t_max = t1.max(t2);

    t1 = (min_y - origin.y) * inv_y;
    t2 = (max_y - origin.y) * inv_y;
    t_min = t_min.max(t1.min(t2));
    t_max = t_max.min(t1.max(t2));

    t1 = (min_z - origin.z) * inv_z;
    t2 = (max_z - origin.z) * inv_z;
    t_min = t_min.max(t1.min(t2));
    t_max = t_max.min(t1.max(t2));

    if t_max >= t_min.max(0.0) {
        Some(t_min.max(0.0))
    } else {
        None
    }
}

fn ray_hits_any_block(origin: Vec3, direction: Vec3) -> Option<BlockHit> {
    let mut best: Option<BlockHit> = None;
    for block in ARENA_BLOCKS {
        if let Some(hit) = ray_hits_block(origin, direction, block) {
            match best {
                Some(ref best_hit) if best_hit.distance <= hit.distance => {}
                _ => best = Some(hit),
            }
        }
    }
    best
}

fn update_ray_interval(
    min_bound: f32,
    max_bound: f32,
    origin: f32,
    direction: f32,
    near_normal: Vec3,
    far_normal: Vec3,
    t_min: &mut f32,
    t_max: &mut f32,
    enter_normal: &mut Vec3,
) -> bool {
    if direction.abs() < RAY_DIRECTION_EPSILON {
        return origin >= min_bound - COLLISION_EPSILON && origin <= max_bound + COLLISION_EPSILON;
    }

    let inv_direction = 1.0 / direction;
    let mut t1 = (min_bound - origin) * inv_direction;
    let mut t2 = (max_bound - origin) * inv_direction;
    let mut candidate_enter = near_normal;

    if t1 > t2 {
        std::mem::swap(&mut t1, &mut t2);
        candidate_enter = far_normal;
    }

    if t1 > *t_min {
        *t_min = t1;
        *enter_normal = candidate_enter;
    }
    if t2 < *t_max {
        *t_max = t2;
    }

    *t_max >= *t_min
}

fn ray_hits_block(origin: Vec3, direction: Vec3, block: Block) -> Option<BlockHit> {
    let block = normalized_block(block);
    let (origin_x, origin_z) = rotate_into_block_space(origin.x, origin.z, block);
    let cos = block.yaw.cos();
    let sin = block.yaw.sin();
    let direction_x = direction.x * cos + direction.z * sin;
    let direction_z = -direction.x * sin + direction.z * cos;
    let half_x = (block.half_x - BULLET_RAY_INSET).max(COLLISION_EPSILON);
    let half_z = (block.half_z - BULLET_RAY_INSET).max(COLLISION_EPSILON);
    let mut min_y = block.min_y + BULLET_RAY_INSET;
    let mut max_y = block.max_y - BULLET_RAY_INSET;
    if max_y <= min_y {
        min_y = block.min_y;
        max_y = block.max_y;
    }

    let mut t_min = f32::NEG_INFINITY;
    let mut t_max = f32::INFINITY;
    let mut enter_normal = Vec3 {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    if !update_ray_interval(
        -half_x,
        half_x,
        origin_x,
        direction_x,
        Vec3 {
            x: -1.0,
            y: 0.0,
            z: 0.0,
        },
        Vec3 {
            x: 1.0,
            y: 0.0,
            z: 0.0,
        },
        &mut t_min,
        &mut t_max,
        &mut enter_normal,
    ) {
        return None;
    }
    if !update_ray_interval(
        min_y,
        max_y,
        origin.y,
        direction.y,
        Vec3 {
            x: 0.0,
            y: -1.0,
            z: 0.0,
        },
        Vec3 {
            x: 0.0,
            y: 1.0,
            z: 0.0,
        },
        &mut t_min,
        &mut t_max,
        &mut enter_normal,
    ) {
        return None;
    }
    if !update_ray_interval(
        -half_z,
        half_z,
        origin_z,
        direction_z,
        Vec3 {
            x: 0.0,
            y: 0.0,
            z: -1.0,
        },
        Vec3 {
            x: 0.0,
            y: 0.0,
            z: 1.0,
        },
        &mut t_min,
        &mut t_max,
        &mut enter_normal,
    ) {
        return None;
    }

    if t_max < t_min.max(0.0) {
        return None;
    }

    let distance = t_min.max(0.0);
    let (normal_x, normal_z) = rotate_out_of_block_space(enter_normal.x, enter_normal.z, block);
    Some(BlockHit {
        distance,
        normal: Vec3 {
            x: normal_x,
            y: enter_normal.y,
            z: normal_z,
        },
    })
}

fn hash01(seed: f32) -> f32 {
    let value = (seed.sin() * 43_758.547).abs();
    value - value.floor()
}

fn point_along_ray(origin: Vec3, direction: Vec3, distance: f32) -> Vec3 {
    Vec3 {
        x: origin.x + direction.x * distance,
        y: origin.y + direction.y * distance,
        z: origin.z + direction.z * distance,
    }
}

fn apply_weapon_cooldown(ctx: &ReducerContext, mut weapon: WeaponState, tick: u32) {
    weapon.ammo_in_mag = weapon.ammo_in_mag.saturating_sub(1);
    weapon.next_ready_tick = tick + RIFLE_FIRE_INTERVAL_TICKS;
    ctx.db.weapon_state().identity().update(weapon);
}

fn insert_impact_mark(
    ctx: &ReducerContext,
    room_code: &str,
    position: Vec3,
    normal: Vec3,
    tick: u32,
) {
    let existing: Vec<ImpactMark> = ctx
        .db
        .impact_mark()
        .iter()
        .filter(|mark| mark.room_code == room_code)
        .collect();
    if existing.len() >= MAX_IMPACT_MARKS_PER_ROOM {
        if let Some(oldest) = existing.into_iter().min_by_key(|mark| mark.tick) {
            ctx.db.impact_mark().id().delete(oldest.id);
        }
    }

    ctx.db.impact_mark().insert(ImpactMark {
        id: 0,
        room_code: room_code.to_string(),
        x: position.x,
        y: position.y,
        z: position.z,
        normal_x: normal.x,
        normal_y: normal.y,
        normal_z: normal.z,
        tick,
    });
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
        victim_state.respawn_tick = tick;
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

    let room_seed = room_code.bytes().fold(0u32, |acc, byte| {
        acc.wrapping_mul(31).wrapping_add(byte as u32)
    }) as usize;
    let location_count = AMMO_PACK_LOCATIONS.len();
    let start_index = room_seed % location_count;
    let location_step = co_prime_step(room_seed.wrapping_add(location_count), location_count);

    for slot in 0..AMMO_PACK_ACTIVE_COUNT {
        let location_index = ((start_index + slot * location_step) % location_count) as u16;
        let point = resolve_pickup_spawn_point(AMMO_PACK_LOCATIONS[location_index as usize]);
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

    let room_seed = room_code.bytes().fold(0u32, |acc, byte| {
        acc.wrapping_mul(41).wrapping_add(byte as u32)
    }) as usize;
    for slot in 0..HEALTH_PACK_ACTIVE_COUNT {
        let location_index = ((room_seed + slot * 5) % HEALTH_PACK_LOCATIONS.len()) as u16;
        let point = resolve_pickup_spawn_point(HEALTH_PACK_LOCATIONS[location_index as usize]);
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

fn segment_point_distance_sq_2d(ax: f32, az: f32, bx: f32, bz: f32, px: f32, pz: f32) -> f32 {
    let ab_x = bx - ax;
    let ab_z = bz - az;
    let ap_x = px - ax;
    let ap_z = pz - az;
    let ab_len_sq = ab_x * ab_x + ab_z * ab_z;
    if ab_len_sq <= COLLISION_EPSILON {
        let dx = px - ax;
        let dz = pz - az;
        return dx * dx + dz * dz;
    }
    let t = (ap_x * ab_x + ap_z * ab_z) / ab_len_sq;
    let clamped_t = t.clamp(0.0, 1.0);
    let closest_x = ax + ab_x * clamped_t;
    let closest_z = az + ab_z * clamped_t;
    let dx = px - closest_x;
    let dz = pz - closest_z;
    dx * dx + dz * dz
}

fn point_distance_sq_2d(ax: f32, az: f32, bx: f32, bz: f32) -> f32 {
    let dx = ax - bx;
    let dz = az - bz;
    dx * dx + dz * dz
}

fn player_touches_pickup(state: &PlayerState, pickup: Vec3, pickup_radius: f32) -> bool {
    let previous_x = state.x - state.vel_x / SERVER_TICK_RATE as f32;
    let previous_z = state.z - state.vel_z / SERVER_TICK_RATE as f32;
    let max_horizontal =
        PLAYER_RADIUS + pickup_radius + PICKUP_HORIZONTAL_GRACE + PICKUP_SWEEP_EXTRA;
    let distance_sq =
        segment_point_distance_sq_2d(previous_x, previous_z, state.x, state.z, pickup.x, pickup.z);
    if distance_sq > max_horizontal * max_horizontal {
        return false;
    }

    let previous_y = state.y - state.vel_y / SERVER_TICK_RATE as f32;
    let feet_min = previous_y.min(state.y) - PICKUP_VERTICAL_GRACE;
    let feet_max = previous_y.max(state.y) + PLAYER_HEIGHT + PICKUP_VERTICAL_GRACE;
    let pickup_min_y = pickup.y - pickup_radius - PICKUP_VERTICAL_GRACE;
    let pickup_max_y = pickup.y + pickup_radius + PICKUP_VERTICAL_GRACE;

    pickup_max_y >= feet_min && pickup_min_y <= feet_max
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
                let next_point =
                    resolve_pickup_spawn_point(AMMO_PACK_LOCATIONS[next_location as usize]);
                pack.location_index = next_location;
                pack.x = next_point.x;
                pack.y = next_point.y;
                pack.z = next_point.z;
                pack.active = true;
                ctx.db.ammo_pack().id().update(pack);
            }
            continue;
        }

        let pickup_position = Vec3 {
            x: pack.x,
            y: pack.y,
            z: pack.z,
        };
        let mut candidates: Vec<(Identity, f32)> = Vec::new();
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
            let distance_sq =
                point_distance_sq_2d(state.x, state.z, pickup_position.x, pickup_position.z);
            candidates.push((state.identity, distance_sq));
        }

        candidates.sort_by(|left, right| left.1.total_cmp(&right.1));
        let mut collected = false;
        for (identity, _) in candidates {
            let mut weapon = match ctx.db.weapon_state().identity().find(identity) {
                Some(weapon) => weapon,
                None => {
                    ctx.db.weapon_state().insert(WeaponState {
                        identity,
                        room_code: Some(pack.room_code.clone()),
                        ammo_in_mag: RIFLE_MAGAZINE,
                        next_ready_tick: tick,
                    });
                    match ctx.db.weapon_state().identity().find(identity) {
                        Some(created) => created,
                        None => continue,
                    }
                }
            };

            let mut dirty = false;
            if weapon.room_code.as_deref() != Some(pack.room_code.as_str()) {
                weapon.room_code = Some(pack.room_code.clone());
                dirty = true;
            }
            if weapon.ammo_in_mag >= RIFLE_MAGAZINE {
                if dirty {
                    ctx.db.weapon_state().identity().update(weapon);
                }
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
                let next_point =
                    resolve_pickup_spawn_point(HEALTH_PACK_LOCATIONS[next_location as usize]);
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

            let Some(mut player_state) = ctx.db.player_state().identity().find(state.identity)
            else {
                continue;
            };
            if player_state.room_code.as_deref() != Some(pack.room_code.as_str()) {
                continue;
            }
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

fn prune_chat_events(ctx: &ReducerContext, tick: u32) {
    let expiry_tick = tick.saturating_sub(CHAT_EVENT_TTL_TICKS);
    let expired: Vec<ChatEvent> = ctx
        .db
        .chat_event()
        .iter()
        .filter(|event| event.tick <= expiry_tick)
        .collect();
    for event in expired {
        ctx.db.chat_event().id().delete(event.id);
    }
}

fn gcd_usize(mut left: usize, mut right: usize) -> usize {
    while right != 0 {
        let remainder = left % right;
        left = right;
        right = remainder;
    }
    left.max(1)
}

fn co_prime_step(seed: usize, modulo: usize) -> usize {
    if modulo <= 1 {
        return 1;
    }

    let mut step = (seed % (modulo - 1)).saturating_add(1);
    while gcd_usize(step, modulo) != 1 {
        step = (step % (modulo - 1)).saturating_add(1);
    }
    step
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
        can_fire_weapon_at_tick, room_membership_is_consistent, should_accept_input_sequence,
        validate_room_code,
    };

    #[test]
    fn weapon_cooldown_enforcement_is_authoritative() {
        assert!(can_fire_weapon_at_tick(8, 8));
        assert!(!can_fire_weapon_at_tick(9, 8));
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
