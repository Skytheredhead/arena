use spacetimedb::{reducer, table, Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

mod generated_collision;

use generated_collision::ARENA_BLOCKS;

const SERVER_TICK_RATE: u32 = 60;
const REMOTE_INTERPOLATION_DELAY_MS: u32 = 60;
const SERVER_TICK_INTERVAL_US: i64 = 1_000_000 / SERVER_TICK_RATE as i64;
// Give input a short network-jitter grace period to avoid stop/start rubberbanding.
const INPUT_STALE_TICKS: u32 = 18;
const SIM_TICK_SCHEDULE_ID: u64 = 1;
const MAX_OPEN_ROOMS: usize = 5;
const MAX_TOTAL_PLAYERS: usize = 50;
const MAX_PLAYERS_PER_ROOM: u16 = 5;
const ROOM_ACTION_RATE_LIMIT_TICKS: u32 = 8;
const ROOM_PRUNE_GRACE_TICKS: u32 = SERVER_TICK_RATE * 15;
const DISCONNECT_GRACE_TICKS: u32 = SERVER_TICK_RATE * 15;
const NICKNAME_RATE_LIMIT_TICKS: u32 = 24;
const CHAT_RATE_LIMIT_TICKS: u32 = 4;
const MAX_IMPACT_MARKS_PER_ROOM: usize = 120;
const CHAT_EVENT_TTL_TICKS: u32 = SERVER_TICK_RATE * 10;
const CHAT_MESSAGE_MAX_CHARS: usize = 160;
const AUTH_SESSION_TTL_TICKS: u32 = SERVER_TICK_RATE * 60 * 60 * 24 * 30;
const PASSWORD_MIN_LEN: usize = 8;
const PASSWORD_MAX_LEN: usize = 64;
const AUTH_TOKEN_PEPPER: &str = "arena-basic-auth-v1";

const PLAYER_HEIGHT: f32 = 1.8;
const PLAYER_RADIUS: f32 = 0.4;
const PLAYER_HITBOX_HALF: f32 = 0.45;
const PLAYER_STEP_HEIGHT: f32 = 0.65;
const PLAYER_EYE_HEIGHT: f32 = 1.58;
const CROUCH_HEIGHT: f32 = 1.35;
const CROUCH_HITBOX_HALF: f32 = 0.36;
const CROUCH_EYE_HEIGHT: f32 = 1.2;

const WALK_SPEED: f32 = 6.4;
const SPRINT_SPEED: f32 = 8.4;
const CROUCH_SPEED: f32 = 3.4;
const GROUND_ACCELERATION: f32 = 30.0;
const AIR_ACCELERATION: f32 = 5.0;
const GROUND_FRICTION: f32 = 22.0;
const GRAVITY: f32 = 24.0;
const JUMP_SPEED: f32 = 8.4;
const MAX_PITCH: f32 = std::f32::consts::PI * 0.49;

const MAX_HEALTH: u16 = 100;
const KILL_HEAL_AMOUNT: u16 = 50;
const KILL_AMMO_REWARD: u16 = 10;
const RIFLE_DAMAGE: u16 = 10;
const RIFLE_FIRE_INTERVAL_TICKS: u32 = 7;
const RIFLE_RANGE: f32 = 80.0;
const RIFLE_CLIP_SIZE: u16 = 10;
const RIFLE_CARRY_CAPACITY: u16 = 40;
const RIFLE_RESERVE_CAPACITY: u16 = RIFLE_CARRY_CAPACITY - RIFLE_CLIP_SIZE;
const RELOAD_DURATION_TICKS: u32 = 59;
const HEADSHOT_MULTIPLIER: u16 = 2;
const WEAPON_SLOT_RIFLE: u8 = 1;
const WEAPON_SLOT_SNIPER: u8 = 2;
const WEAPON_SLOT_SHOTGUN: u8 = 3;
const SNIPER_DAMAGE: u16 = 75;
const SNIPER_FIRE_INTERVAL_TICKS: u32 = SERVER_TICK_RATE * 2;
const SNIPER_RANGE: f32 = 140.0;
const SHOTGUN_PELLETS: u32 = 10;
const SHOTGUN_DAMAGE: u16 = 5;
const SHOTGUN_FIRE_INTERVAL_TICKS: u32 = SNIPER_FIRE_INTERVAL_TICKS / 2;
const SHOTGUN_RANGE: f32 = 36.0;
const HEALTH_REGEN_DELAY_TICKS: u32 = SERVER_TICK_RATE * 5;
const HEALTH_REGEN_PER_TICK: f32 = 3.0 / SERVER_TICK_RATE as f32;
const AMMO_PACK_AMOUNT: u16 = 6;
const AMMO_PACK_RESPAWN_TICKS: u32 = SERVER_TICK_RATE * 3;
const AMMO_PACK_RADIUS: f32 = 1.35;
const AMMO_PICKUP_HORIZONTAL_GRACE: f32 = 1.4;
const AMMO_PICKUP_VERTICAL_GRACE: f32 = 2.0;
const AMMO_PACK_ACTIVE_COUNT: usize = 18;
const HEALTH_PACK_AMOUNT: u16 = 50;
const HEALTH_PACK_RESPAWN_TICKS: u32 = SERVER_TICK_RATE * 10;
const HEALTH_PACK_RADIUS: f32 = 0.5;
const HEALTH_PACK_ACTIVE_COUNT: usize = 4;
const PICKUP_HORIZONTAL_GRACE: f32 = 1.0;
const PICKUP_VERTICAL_GRACE: f32 = 0.95;
const PICKUP_SWEEP_EXTRA: f32 = 0.35;
const PICKUP_HEIGHT_MAX: f32 = 1.4;
const COLLISION_EPSILON: f32 = 0.0001;
const MOVEMENT_SUBSTEP_MAX_DISTANCE: f32 = 0.12;
const RAY_DIRECTION_EPSILON: f32 = 0.0001;
const BULLET_RAY_INSET: f32 = 0.005;
const TWO_PI: f32 = std::f32::consts::PI * 2.0;
const MAX_HIT_REWIND_TICKS: u32 = 14;
const HIT_REWIND_FUDGE_TICKS: u32 = 1;
const MAX_HIT_REWIND_SECONDS: f32 = 0.4;
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

#[table(accessor = account)]
pub struct Account {
    #[primary_key]
    #[auto_inc]
    id: u32,
    email: String,
    username: String,
    username_norm: String,
    password_hash: u64,
    created_tick: u32,
    last_login_tick: u32,
    login_count: u32,
}

#[table(accessor = account_session)]
pub struct AccountSession {
    #[primary_key]
    token: String,
    account_id: u32,
    identity: Identity,
    created_tick: u32,
    expires_tick: u32,
}

#[table(accessor = player_auth, public)]
pub struct PlayerAuth {
    #[primary_key]
    identity: Identity,
    logged_in: bool,
    account_id: Option<u32>,
    username: Option<String>,
    session_token: Option<String>,
    updated_tick: u32,
}

#[table(accessor = account_stats, public)]
pub struct AccountStats {
    #[primary_key]
    account_id: u32,
    username: String,
    times_played: u32,
    total_play_time_ticks: u64,
    total_lobby_time_ticks: u64,
    kills: u32,
    deaths: u32,
    kdr: f32,
    shots_fired: u32,
    shots_hit: u32,
    damage_dealt: u32,
    damage_taken: u32,
    ammo_collected: u32,
    health_collected: u32,
    chat_messages: u32,
    rooms_created: u32,
    rooms_joined: u32,
    matches_started: u32,
    respawns: u32,
    last_seen_tick: u32,
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
    #[default(false)]
    crouching: bool,
    #[default(false)]
    scoped: bool,
    #[default(false)]
    fire_held: bool,
    #[default(false)]
    reload_pressed: bool,
    #[default(1)]
    weapon_slot: u8,
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
    #[default(0)]
    input_pipeline_ms: u32,
    #[default(false)]
    sprinting: bool,
    #[default(false)]
    crouching: bool,
}

#[table(accessor = weapon_state, public)]
pub struct WeaponState {
    #[primary_key]
    identity: Identity,
    room_code: Option<String>,
    ammo_in_mag: u16,
    next_ready_tick: u32,
    #[default(0)]
    reserve_ammo: u16,
    #[default(0)]
    reload_started_tick: u32,
    #[default(0)]
    reload_complete_tick: u32,
    #[default(false)]
    reloading: bool,
    #[default(1)]
    selected_weapon_slot: u8,
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
            // Fixed authoritative server cadence (60Hz).
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
        clear_disconnect_marker(ctx, ctx.sender());
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
            input_pipeline_ms: 0,
            yaw: 0.0,
            pitch: 0.0,
            health: MAX_HEALTH,
            alive: true,
            on_ground: true,
            sprinting: false,
            crouching: false,
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
            ammo_in_mag: RIFLE_CLIP_SIZE,
            reserve_ammo: RIFLE_RESERVE_CAPACITY,
            reload_started_tick: 0,
            reload_complete_tick: 0,
            reloading: false,
            selected_weapon_slot: WEAPON_SLOT_RIFLE,
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

    if ctx.db.player_auth().identity().find(ctx.sender()).is_none() {
        ctx.db.player_auth().insert(PlayerAuth {
            identity: ctx.sender(),
            logged_in: false,
            account_id: None,
            username: None,
            session_token: None,
            updated_tick: current_tick,
        });
    }

    reset_player_input(ctx, ctx.sender(), current_tick);
}

#[reducer(client_disconnected)]
pub fn client_disconnected(ctx: &ReducerContext) {
    if let Some(player) = ctx.db.player().identity().find(ctx.sender()) {
        if player.room_code.is_some() {
            let tick = current_tick(ctx);
            mark_disconnected_at(ctx, ctx.sender(), tick);
            reset_player_input(ctx, ctx.sender(), tick);
        }

        ctx.db.player().identity().update(Player {
            connected: false,
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
pub fn register_account(
    ctx: &ReducerContext,
    email: String,
    username: String,
    password: String,
) -> Result<(), String> {
    let email = validate_email(email)?;
    let username = validate_account_username(username)?;
    validate_password(password.as_str())?;
    let username_norm = username.to_ascii_lowercase();

    if ctx
        .db
        .account()
        .iter()
        .any(|account| account.email.eq_ignore_ascii_case(email.as_str()))
    {
        return Err("Email already registered".to_string());
    }
    if ctx
        .db
        .account()
        .iter()
        .any(|account| account.username_norm == username_norm)
    {
        return Err("Username already taken".to_string());
    }

    let tick = current_tick(ctx);
    let password_hash = hash_password(email.as_str(), password.as_str());
    ctx.db.account().insert(Account {
        id: 0,
        email: email.clone(),
        username: username.clone(),
        username_norm,
        password_hash,
        created_tick: tick,
        last_login_tick: tick,
        login_count: 1,
    });

    let Some(account) = ctx
        .db
        .account()
        .iter()
        .filter(|candidate| candidate.email == email)
        .max_by_key(|candidate| candidate.id)
    else {
        return Err("Unable to create account".to_string());
    };

    ensure_account_stats(ctx, account.id, account.username.as_str(), tick);
    let session_token = issue_session_token(ctx, account.id, ctx.sender(), tick);
    set_logged_in_auth(
        ctx,
        ctx.sender(),
        account.id,
        account.username.clone(),
        Some(session_token),
        tick,
    );
    Ok(())
}

#[reducer]
pub fn login_account(
    ctx: &ReducerContext,
    identifier: String,
    password: String,
) -> Result<(), String> {
    validate_password(password.as_str())?;
    let lookup = normalize_identifier(identifier)?;

    let Some(mut account) = find_account_by_identifier(ctx, lookup.as_str()) else {
        return Err("Invalid credentials".to_string());
    };

    let expected_hash = hash_password(account.email.as_str(), password.as_str());
    if account.password_hash != expected_hash {
        return Err("Invalid credentials".to_string());
    }

    let tick = current_tick(ctx);
    account.last_login_tick = tick;
    account.login_count = account.login_count.saturating_add(1);
    let account_id = account.id;
    let username = account.username.clone();
    ctx.db.account().id().update(account);
    ensure_account_stats(ctx, account_id, username.as_str(), tick);

    let session_token = issue_session_token(ctx, account_id, ctx.sender(), tick);
    set_logged_in_auth(
        ctx,
        ctx.sender(),
        account_id,
        username,
        Some(session_token),
        tick,
    );
    Ok(())
}

#[reducer]
pub fn login_with_session(ctx: &ReducerContext, session_token: String) -> Result<(), String> {
    let token = session_token.trim();
    if token.is_empty() {
        return Err("Session token is required".to_string());
    }

    let tick = current_tick(ctx);
    let Some(session) = ctx.db.account_session().token().find(token.to_string()) else {
        return Err("Session not found".to_string());
    };
    if session.expires_tick <= tick {
        ctx.db.account_session().token().delete(token.to_string());
        return Err("Session expired".to_string());
    }

    let account = ctx
        .db
        .account()
        .id()
        .find(session.account_id)
        .ok_or_else(|| "Account missing".to_string())?;
    ctx.db.account_session().token().update(AccountSession {
        identity: ctx.sender(),
        expires_tick: tick.saturating_add(AUTH_SESSION_TTL_TICKS),
        ..session
    });
    ensure_account_stats(ctx, account.id, account.username.as_str(), tick);
    set_logged_in_auth(
        ctx,
        ctx.sender(),
        account.id,
        account.username.clone(),
        Some(token.to_string()),
        tick,
    );
    Ok(())
}

#[reducer]
pub fn logout_account(ctx: &ReducerContext) -> Result<(), String> {
    let tick = current_tick(ctx);
    set_logged_out_auth(ctx, ctx.sender(), tick);
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
    bump_stat_for_identity(ctx, ctx.sender(), |stats| {
        stats.chat_messages = stats.chat_messages.saturating_add(1);
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
        end_tick: tick,
        remaining_ms: 0,
        round: 0,
    });
    initialize_room_ammo_packs(ctx, &room_code, tick);
    initialize_room_health_packs(ctx, &room_code, tick);
    bump_stat_for_identity(ctx, ctx.sender(), |stats| {
        stats.rooms_created = stats.rooms_created.saturating_add(1);
    });
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

    leave_room_internal(ctx, ctx.sender(), LeaveReason::LeftRoom);

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
    let join_nickname = player.nickname.clone();
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
    state.sprinting = false;
    state.crouching = false;
    state.last_damage_tick = current_tick(ctx);
    state.regen_progress = 0.0;
    state.last_processed_input = 0;
    state.respawn_tick = current_tick(ctx);

    weapon.room_code = Some(room_code.clone());
    weapon.ammo_in_mag = RIFLE_CLIP_SIZE;
    weapon.reserve_ammo = RIFLE_RESERVE_CAPACITY;
    weapon.reload_started_tick = 0;
    weapon.reload_complete_tick = 0;
    weapon.reloading = false;
    weapon.selected_weapon_slot = WEAPON_SLOT_RIFLE;
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
    insert_system_chat_event(
        ctx,
        room_code.as_str(),
        format!("{} joined the room", join_nickname),
        current_tick(ctx),
    );
    bump_stat_for_identity(ctx, ctx.sender(), |stats| {
        stats.rooms_joined = stats.rooms_joined.saturating_add(1);
        stats.times_played = stats.times_played.saturating_add(1);
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
    leave_room_internal(ctx, ctx.sender(), LeaveReason::LeftRoom);
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
        end_tick: tick,
        remaining_ms: 0,
        round: match_state.round.saturating_add(1),
        ..match_state
    });
    bump_stat_for_identity(ctx, ctx.sender(), |stats| {
        stats.matches_started = stats.matches_started.saturating_add(1);
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
    crouching: bool,
    scoped: bool,
    fire_held: bool,
    reload_pressed: bool,
    weapon_slot: u8,
) -> Result<(), String> {
    require_room_membership(ctx, ctx.sender())?;
    if !inputs_are_finite([move_x, move_z, yaw, pitch]) {
        return Err("Invalid input payload".to_string());
    }
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
    input.crouching = crouching;
    input.scoped = scoped;
    input.fire_held = fire_held;
    input.reload_pressed = reload_pressed;
    input.weapon_slot = normalize_weapon_slot(weapon_slot);
    input.last_received_tick = current_tick(ctx);

    ctx.db.player_input().identity().update(input);
    Ok(())
}

#[reducer]
pub fn fire_weapon(
    ctx: &ReducerContext,
    yaw: f32,
    pitch: f32,
    _scoped: bool,
    weapon_slot: u8,
) -> Result<(), String> {
    require_room_membership(ctx, ctx.sender())?;
    if !inputs_are_finite([yaw, pitch]) {
        return Err("Invalid weapon payload".to_string());
    }
    let tick = current_tick(ctx);
    let mut input = require_input_state(ctx, ctx.sender())?;
    input.sequence = input.sequence.saturating_add(1);
    input.yaw = yaw;
    input.pitch = pitch.clamp(-MAX_PITCH, MAX_PITCH);
    input.fire_held = true;
    input.weapon_slot = normalize_weapon_slot(weapon_slot);
    input.last_received_tick = tick;
    ctx.db.player_input().identity().update(input);
    Ok(())
}

fn process_weapon_action(
    ctx: &ReducerContext,
    state: &PlayerState,
    input: &PlayerInput,
    tick: u32,
) -> Result<(), String> {
    if !state.alive {
        return Ok(());
    }

    let player = require_player(ctx, state.identity)?;
    let mut weapon = require_weapon_state(ctx, state.identity)?;
    let Some(room_code) = state.room_code.clone() else {
        return Ok(());
    };
    if !room_membership_is_consistent(
        player.room_code.as_deref(),
        state.room_code.as_deref(),
        weapon.room_code.as_deref(),
    ) {
        return Ok(());
    }

    let match_state = match ctx.db.match_state().room_code().find(room_code.clone()) {
        Some(match_state) => match_state,
        None => return Ok(()),
    };
    if !match_state.active {
        return Ok(());
    }

    weapon.selected_weapon_slot = normalize_weapon_slot(input.weapon_slot);
    complete_reload_if_ready(&mut weapon, tick);

    if input.reload_pressed {
        start_reload_if_possible(&mut weapon, tick);
    }

    if !input.fire_held || weapon.reloading {
        ctx.db.weapon_state().identity().update(weapon);
        return Ok(());
    }

    let weapon_kind = weapon_kind_from_slot(weapon.selected_weapon_slot);
    let spec = weapon_spec(weapon_kind);
    if !can_fire_weapon_at_tick(weapon.next_ready_tick, tick) {
        ctx.db.weapon_state().identity().update(weapon);
        return Ok(());
    }
    if weapon.ammo_in_mag == 0 {
        ctx.db.weapon_state().identity().update(weapon);
        return Ok(());
    }

    bump_stat_for_identity(ctx, state.identity, |stats| {
        stats.shots_fired = stats.shots_fired.saturating_add(1);
    });

    weapon.reloading = false;
    weapon.reload_started_tick = 0;
    weapon.reload_complete_tick = 0;
    weapon.ammo_in_mag = weapon.ammo_in_mag.saturating_sub(1);
    weapon.next_ready_tick = tick + spec.fire_interval_ticks;
    ctx.db.weapon_state().identity().update(weapon);

    let spread = 0.0;
    let eye_height = if state.crouching {
        CROUCH_EYE_HEIGHT
    } else {
        PLAYER_EYE_HEIGHT
    };
    let origin = Vec3 {
        x: state.x,
        y: state.y + eye_height,
        z: state.z,
    };
    let rewind_ticks = estimate_hit_rewind_ticks(input, tick);
    let mut impact_marks: Vec<(f32, Vec3, Vec3)> = Vec::with_capacity(spec.pellet_count as usize);

    for pellet_index in 0..spec.pellet_count {
        let base_seed = tick as f32 * 0.197
            + state.x * 1.31
            + state.z * 2.17
            + state.yaw * 0.97
            + pellet_index as f32 * 9.83
            + weapon_slot_seed(input.weapon_slot);
        let yaw_offset = (hash01(base_seed) - 0.5) * 2.0 * spread;
        let pitch_offset = (hash01(base_seed + 17.13) - 0.5) * 2.0 * spread;

        let aim_yaw = input.yaw + yaw_offset;
        let aim_pitch = (input.pitch + pitch_offset).clamp(-MAX_PITCH, MAX_PITCH);
        let direction = direction_from_yaw_pitch(aim_yaw, aim_pitch);
        let block_hit = ray_hits_environment(origin, direction);

        let mut best_hit: Option<(Identity, PlayerHit)> = None;
        for target in ctx.db.player_state().iter() {
            if target.identity == state.identity || !target.alive {
                continue;
            }
            let Some(target_player) = ctx.db.player().identity().find(target.identity) else {
                continue;
            };
            if !target_player.connected {
                continue;
            }
            if target.room_code.as_deref() != Some(room_code.as_str()) {
                continue;
            }

            let position = rewind_player_for_hit(&target, rewind_ticks);
            if let Some(hit) = ray_hits_player(origin, direction, position, target.crouching) {
                if hit.distance <= spec.max_range {
                    match best_hit {
                        Some((_, best)) if best.distance <= hit.distance => {}
                        _ => best_hit = Some((target.identity, hit)),
                    }
                }
            }
        }

        if let Some((victim_identity, victim_hit)) = best_hit {
            if let Some(block) = block_hit {
                if block.distance < victim_hit.distance {
                    impact_marks.push((
                        block.distance,
                        point_along_ray(origin, direction, block.distance),
                        block.normal,
                    ));
                    continue;
                }
            }

            let headshot_bonus = if victim_hit.headshot {
                HEADSHOT_MULTIPLIER
            } else {
                1
            };
            let damage = spec
                .pellet_damage
                .saturating_mul(headshot_bonus)
                .min(MAX_HEALTH.saturating_mul(2));
            apply_damage(
                ctx,
                room_code.clone(),
                state.identity,
                victim_identity,
                damage,
            )?;
            continue;
        }

        if let Some(block) = block_hit {
            impact_marks.push((
                block.distance,
                point_along_ray(origin, direction, block.distance),
                block.normal,
            ));
        }
    }

    impact_marks.sort_by(|left, right| left.0.total_cmp(&right.0));
    let max_marks_to_insert = if matches!(weapon_kind, WeaponKind::Shotgun) {
        spec.pellet_count as usize
    } else {
        1
    };
    for (_, impact_position, impact_normal) in impact_marks.into_iter().take(max_marks_to_insert) {
        insert_impact_mark(ctx, &room_code, impact_position, impact_normal, tick);
    }

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
    bump_stat_for_identity(ctx, ctx.sender(), |stats| {
        stats.respawns = stats.respawns.saturating_add(1);
    });
    Ok(())
}

#[reducer]
pub fn ping(_ctx: &ReducerContext) -> Result<(), String> {
    Ok(())
}

#[reducer]
pub fn sim_tick(ctx: &ReducerContext, _schedule: SimTickSchedule) -> Result<(), String> {
    if ctx.sender() != ctx.identity() {
        return Err("sim_tick is scheduler-driven and cannot be called by clients".to_string());
    }

    let tick = increment_tick(ctx);
    prune_expired_sessions(ctx, tick);
    prune_stale_disconnected_players(ctx, tick);
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
            updated.end_tick = tick;
            updated.remaining_ms = 0;
        } else {
            updated.end_tick = tick;
            updated.remaining_ms = 0;
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
        if state.room_code.is_none() {
            continue;
        }
        let player = match ctx.db.player().identity().find(state.identity) {
            Some(player) => player,
            None => continue,
        };
        if !player.connected {
            continue;
        }

        if !state.alive {
            continue;
        }

        let input = match ctx.db.player_input().identity().find(state.identity) {
            Some(input) => input,
            None => continue,
        };
        let input_sequence = input.sequence;
        let input_pipeline_ms = input_pipeline_ms_for_tick(tick, input.last_received_tick);
        let input_is_stale = tick.saturating_sub(input.last_received_tick) > INPUT_STALE_TICKS;
        let effective_input = if input_is_stale {
            make_stale_input(input)
        } else {
            input
        };

        let mut updated = simulate_player_tick(&state, &effective_input);
        updated.server_tick = tick;
        updated.input_pipeline_ms = input_pipeline_ms;
        if !input_is_stale && input_sequence > updated.last_processed_input {
            updated.last_processed_input = input_sequence;
        }
        apply_passive_regen(&mut updated, tick);
        ctx.db.player_state().identity().update(updated);
    }

    let weapon_states: Vec<PlayerState> = ctx.db.player_state().iter().collect();
    for state in weapon_states {
        if !state.alive {
            continue;
        }
        let input = match ctx.db.player_input().identity().find(state.identity) {
            Some(input) => input,
            None => continue,
        };
        let effective_input = if tick.saturating_sub(input.last_received_tick) > INPUT_STALE_TICKS {
            make_stale_input(input)
        } else {
            input
        };
        process_weapon_action(ctx, &state, &effective_input, tick)?;
    }

    process_ammo_packs(ctx, tick);
    process_health_packs(ctx, tick);
    prune_chat_events(ctx, tick);
    accrue_time_stats(ctx, tick);

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

fn input_pipeline_ms_for_tick(tick: u32, last_received_tick: u32) -> u32 {
    let age_ticks = tick.saturating_sub(last_received_tick) as u64;
    ((age_ticks * 1000) / SERVER_TICK_RATE as u64) as u32
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
    let sanitized = sanitize_chat_payload(value.trim());
    if sanitized.is_empty() {
        return Err("Chat message cannot be empty".to_string());
    }
    if sanitized.chars().count() > CHAT_MESSAGE_MAX_CHARS {
        return Err(format!(
            "Chat message must be {CHAT_MESSAGE_MAX_CHARS} characters or fewer"
        ));
    }

    Ok(censor_blocked_language(sanitized.as_str()))
}

fn sanitize_chat_payload(value: &str) -> String {
    let mut sanitized = String::with_capacity(value.len());
    let mut previous_was_space = false;
    for ch in value.chars() {
        let mapped = match ch {
            '<' => '[',
            '>' => ']',
            '&' => '+',
            '`' => '\'',
            '\n' | '\r' | '\t' => ' ',
            _ if ch.is_control() => continue,
            _ => ch,
        };
        if mapped.is_whitespace() {
            if previous_was_space {
                continue;
            }
            sanitized.push(' ');
            previous_was_space = true;
            continue;
        }

        previous_was_space = false;
        sanitized.push(mapped);
    }
    sanitized.trim().to_string()
}

fn validate_email(value: String) -> Result<String, String> {
    let email = value.trim().to_ascii_lowercase();
    if email.len() < 5 || email.len() > 120 {
        return Err("Email must be between 5 and 120 characters".to_string());
    }
    if !email.contains('@') || email.starts_with('@') || email.ends_with('@') {
        return Err("Email must be valid".to_string());
    }
    if !email
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '@' | '.' | '_' | '+' | '-'))
    {
        return Err("Email contains unsupported characters".to_string());
    }
    Ok(email)
}

fn validate_account_username(value: String) -> Result<String, String> {
    let username = value.trim();
    if username.len() < 3 || username.len() > 16 {
        return Err("Username must be 3-16 characters".to_string());
    }
    if !username
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-'))
    {
        return Err("Username can only use letters, numbers, _ and -".to_string());
    }
    if contains_blocked_language(username) {
        return Err("Username contains blocked language".to_string());
    }
    Ok(username.to_string())
}

fn validate_password(value: &str) -> Result<(), String> {
    let password = value.trim();
    if password.len() < PASSWORD_MIN_LEN || password.len() > PASSWORD_MAX_LEN {
        return Err(format!(
            "Password must be {PASSWORD_MIN_LEN}-{PASSWORD_MAX_LEN} characters"
        ));
    }
    if password.chars().any(|ch| ch.is_control()) {
        return Err("Password contains unsupported characters".to_string());
    }
    Ok(())
}

fn normalize_identifier(value: String) -> Result<String, String> {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err("Email or username is required".to_string());
    }
    Ok(normalized)
}

fn hash64(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn hash_password(email: &str, password: &str) -> u64 {
    let payload = format!("{AUTH_TOKEN_PEPPER}:{email}:{password}");
    hash64(payload.as_bytes())
}

fn find_account_by_identifier(ctx: &ReducerContext, identifier: &str) -> Option<Account> {
    if identifier.contains('@') {
        return ctx
            .db
            .account()
            .iter()
            .find(|account| account.email.eq_ignore_ascii_case(identifier));
    }

    ctx.db
        .account()
        .iter()
        .find(|account| account.username_norm == identifier)
}

fn compute_kdr(kills: u32, deaths: u32) -> f32 {
    if deaths == 0 {
        kills as f32
    } else {
        kills as f32 / deaths as f32
    }
}

fn ensure_account_stats(ctx: &ReducerContext, account_id: u32, username: &str, tick: u32) {
    if let Some(mut stats) = ctx.db.account_stats().account_id().find(account_id) {
        if stats.username != username {
            stats.username = username.to_string();
            stats.last_seen_tick = tick;
            ctx.db.account_stats().account_id().update(stats);
        }
        return;
    }

    ctx.db.account_stats().insert(AccountStats {
        account_id,
        username: username.to_string(),
        times_played: 0,
        total_play_time_ticks: 0,
        total_lobby_time_ticks: 0,
        kills: 0,
        deaths: 0,
        kdr: 0.0,
        shots_fired: 0,
        shots_hit: 0,
        damage_dealt: 0,
        damage_taken: 0,
        ammo_collected: 0,
        health_collected: 0,
        chat_messages: 0,
        rooms_created: 0,
        rooms_joined: 0,
        matches_started: 0,
        respawns: 0,
        last_seen_tick: tick,
    });
}

fn issue_session_token(
    ctx: &ReducerContext,
    account_id: u32,
    identity: Identity,
    tick: u32,
) -> String {
    let entropy = format!(
        "{AUTH_TOKEN_PEPPER}:{identity}:{account_id}:{tick}:{}",
        tick.wrapping_mul(971)
    );
    let token = format!(
        "{:016x}{:016x}",
        hash64(entropy.as_bytes()),
        hash64(format!("{entropy}:session").as_bytes())
    );
    let expires_tick = tick.saturating_add(AUTH_SESSION_TTL_TICKS);

    ctx.db.account_session().insert(AccountSession {
        token: token.clone(),
        account_id,
        identity,
        created_tick: tick,
        expires_tick,
    });

    let stale_tokens: Vec<String> = ctx
        .db
        .account_session()
        .iter()
        .filter(|session| {
            session.account_id == account_id
                && session.identity == identity
                && session.token != token
        })
        .map(|session| session.token)
        .collect();
    for stale in stale_tokens {
        ctx.db.account_session().token().delete(stale);
    }

    token
}

fn set_logged_in_auth(
    ctx: &ReducerContext,
    identity: Identity,
    account_id: u32,
    username: String,
    session_token: Option<String>,
    tick: u32,
) {
    let row = PlayerAuth {
        identity,
        logged_in: true,
        account_id: Some(account_id),
        username: Some(username),
        session_token,
        updated_tick: tick,
    };
    if ctx.db.player_auth().identity().find(identity).is_some() {
        ctx.db.player_auth().identity().update(row);
    } else {
        ctx.db.player_auth().insert(row);
    }
}

fn set_logged_out_auth(ctx: &ReducerContext, identity: Identity, tick: u32) {
    let row = PlayerAuth {
        identity,
        logged_in: false,
        account_id: None,
        username: None,
        session_token: None,
        updated_tick: tick,
    };
    if ctx.db.player_auth().identity().find(identity).is_some() {
        ctx.db.player_auth().identity().update(row);
    } else {
        ctx.db.player_auth().insert(row);
    }
}

fn bump_stat_for_identity<F>(ctx: &ReducerContext, identity: Identity, mutator: F)
where
    F: FnOnce(&mut AccountStats),
{
    let Some(auth) = ctx.db.player_auth().identity().find(identity) else {
        return;
    };
    if !auth.logged_in {
        return;
    }
    let Some(account_id) = auth.account_id else {
        return;
    };
    let Some(mut stats) = ctx.db.account_stats().account_id().find(account_id) else {
        return;
    };
    mutator(&mut stats);
    stats.kdr = compute_kdr(stats.kills, stats.deaths);
    stats.last_seen_tick = current_tick(ctx);
    ctx.db.account_stats().account_id().update(stats);
}

fn prune_expired_sessions(ctx: &ReducerContext, tick: u32) {
    let expired: Vec<String> = ctx
        .db
        .account_session()
        .iter()
        .filter(|session| session.expires_tick <= tick)
        .map(|session| session.token)
        .collect();
    for token in expired {
        ctx.db.account_session().token().delete(token);
    }
}

fn accrue_time_stats(ctx: &ReducerContext, tick: u32) {
    let players: Vec<Player> = ctx
        .db
        .player()
        .iter()
        .filter(|player| player.connected)
        .collect();
    for player in players {
        bump_stat_for_identity(ctx, player.identity, |stats| {
            if player.room_code.is_some() {
                stats.total_play_time_ticks = stats.total_play_time_ticks.saturating_add(1);
            } else {
                stats.total_lobby_time_ticks = stats.total_lobby_time_ticks.saturating_add(1);
            }
            stats.last_seen_tick = tick;
        });
    }
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

fn mark_disconnected_at(ctx: &ReducerContext, identity: Identity, tick: u32) {
    // Reuse this private tick field as the transient disconnect marker so the
    // public schema and generated client bindings do not need to change.
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
    limiter.last_leave_room_tick = tick.max(1);

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
}

fn clear_disconnect_marker(ctx: &ReducerContext, identity: Identity) {
    let Some(mut limiter) = ctx.db.player_rate_limit().identity().find(identity) else {
        return;
    };
    limiter.last_leave_room_tick = 0;
    ctx.db.player_rate_limit().identity().update(limiter);
}

fn prune_stale_disconnected_players(ctx: &ReducerContext, tick: u32) {
    let players: Vec<Player> = ctx
        .db
        .player()
        .iter()
        .filter(|player| !player.connected && player.room_code.is_some())
        .collect();

    for player in players {
        let disconnect_tick = ctx
            .db
            .player_rate_limit()
            .identity()
            .find(player.identity)
            .map(|limiter| limiter.last_leave_room_tick)
            .filter(|value| *value > 0)
            .or_else(|| {
                ctx.db
                    .player_input()
                    .identity()
                    .find(player.identity)
                    .map(|input| input.last_received_tick)
            });

        let Some(disconnect_tick) = disconnect_tick else {
            continue;
        };
        if tick.saturating_sub(disconnect_tick) >= DISCONNECT_GRACE_TICKS {
            leave_room_internal(ctx, player.identity, LeaveReason::Disconnected);
            clear_disconnect_marker(ctx, player.identity);
        }
    }
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

fn inputs_are_finite<const N: usize>(values: [f32; N]) -> bool {
    values.into_iter().all(|value| value.is_finite())
}

fn can_fire_weapon_at_tick(next_ready_tick: u32, current_tick: u32) -> bool {
    current_tick >= next_ready_tick
}

#[derive(Clone, Copy)]
enum WeaponKind {
    Rifle,
    Sniper,
    Shotgun,
}

#[derive(Clone, Copy)]
enum LeaveReason {
    LeftRoom,
    Disconnected,
}

#[derive(Clone, Copy)]
struct WeaponSpec {
    fire_interval_ticks: u32,
    pellet_count: u32,
    max_range: f32,
    pellet_damage: u16,
}

fn weapon_kind_from_slot(slot: u8) -> WeaponKind {
    match normalize_weapon_slot(slot) {
        WEAPON_SLOT_RIFLE => WeaponKind::Rifle,
        WEAPON_SLOT_SNIPER => WeaponKind::Sniper,
        WEAPON_SLOT_SHOTGUN => WeaponKind::Shotgun,
        _ => WeaponKind::Rifle,
    }
}

fn normalize_weapon_slot(slot: u8) -> u8 {
    match slot {
        WEAPON_SLOT_SNIPER => WEAPON_SLOT_SNIPER,
        WEAPON_SLOT_SHOTGUN => WEAPON_SLOT_SHOTGUN,
        _ => WEAPON_SLOT_RIFLE,
    }
}

fn weapon_slot_seed(slot: u8) -> f32 {
    normalize_weapon_slot(slot) as f32 * 4.71
}

fn complete_reload_if_ready(weapon: &mut WeaponState, tick: u32) {
    if !weapon.reloading || tick < weapon.reload_complete_tick {
        return;
    }
    let moved = reload_transfer_amount(weapon.ammo_in_mag, weapon.reserve_ammo);
    weapon.ammo_in_mag = weapon
        .ammo_in_mag
        .saturating_add(moved)
        .min(RIFLE_CLIP_SIZE);
    weapon.reserve_ammo = weapon.reserve_ammo.saturating_sub(moved);
    weapon.reloading = false;
    weapon.reload_started_tick = 0;
    weapon.reload_complete_tick = 0;
}

fn reload_transfer_amount(ammo_in_mag: u16, reserve_ammo: u16) -> u16 {
    RIFLE_CLIP_SIZE
        .saturating_sub(ammo_in_mag)
        .min(reserve_ammo)
}

fn ammo_after_pickup(ammo_in_mag: u16, reserve_ammo: u16) -> (u16, u16) {
    let magazine_room = RIFLE_CLIP_SIZE.saturating_sub(ammo_in_mag);
    let magazine_gain = AMMO_PACK_AMOUNT.min(magazine_room);
    let remaining_pickup = AMMO_PACK_AMOUNT.saturating_sub(magazine_gain);
    let reserve_gain = remaining_pickup.min(RIFLE_RESERVE_CAPACITY.saturating_sub(reserve_ammo));
    (
        ammo_in_mag
            .saturating_add(magazine_gain)
            .min(RIFLE_CLIP_SIZE),
        reserve_ammo
            .saturating_add(reserve_gain)
            .min(RIFLE_RESERVE_CAPACITY),
    )
}

fn start_reload_if_possible(weapon: &mut WeaponState, tick: u32) {
    if weapon.reloading || weapon.ammo_in_mag >= RIFLE_CLIP_SIZE || weapon.reserve_ammo == 0 {
        return;
    }
    weapon.reloading = true;
    weapon.reload_started_tick = tick;
    weapon.reload_complete_tick = tick.saturating_add(RELOAD_DURATION_TICKS);
}

fn weapon_spec(kind: WeaponKind) -> WeaponSpec {
    match kind {
        WeaponKind::Rifle => WeaponSpec {
            fire_interval_ticks: RIFLE_FIRE_INTERVAL_TICKS,
            pellet_count: 1,
            max_range: RIFLE_RANGE,
            pellet_damage: RIFLE_DAMAGE,
        },
        WeaponKind::Sniper => WeaponSpec {
            fire_interval_ticks: SNIPER_FIRE_INTERVAL_TICKS,
            pellet_count: 1,
            max_range: SNIPER_RANGE,
            pellet_damage: SNIPER_DAMAGE,
        },
        WeaponKind::Shotgun => WeaponSpec {
            fire_interval_ticks: SHOTGUN_FIRE_INTERVAL_TICKS,
            pellet_count: SHOTGUN_PELLETS,
            max_range: SHOTGUN_RANGE,
            pellet_damage: SHOTGUN_DAMAGE,
        },
    }
}

fn leave_room_internal(ctx: &ReducerContext, identity: Identity, reason: LeaveReason) {
    let Some(player) = ctx.db.player().identity().find(identity) else {
        return;
    };
    let Some(room_code) = player.room_code.clone() else {
        return;
    };

    if let Some(room) = ctx.db.room().code().find(room_code.clone()) {
        if room.player_count > 1 {
            let message = match reason {
                LeaveReason::LeftRoom => format!("{} left the room", player.nickname),
                LeaveReason::Disconnected => format!("{} disconnected", player.nickname),
            };
            insert_system_chat_event(ctx, room_code.as_str(), message, current_tick(ctx));
        }
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
            sprinting: false,
            crouching: false,
            server_tick: current_tick(ctx),
            ..state
        });
    }

    if let Some(weapon) = ctx.db.weapon_state().identity().find(identity) {
        ctx.db.weapon_state().identity().update(WeaponState {
            room_code: None,
            ammo_in_mag: RIFLE_CLIP_SIZE,
            reserve_ammo: RIFLE_RESERVE_CAPACITY,
            reload_started_tick: 0,
            reload_complete_tick: 0,
            reloading: false,
            selected_weapon_slot: WEAPON_SLOT_RIFLE,
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
    let spawn_count = SPAWN_POINTS.len();
    for offset in 0..spawn_count {
        let index = (seed + offset) % spawn_count;
        let candidate = resolve_player_spawn_point(SPAWN_POINTS[index]);
        if !collides_at_with_height(candidate.x, candidate.y, candidate.z, PLAYER_HEIGHT) {
            return candidate;
        }
    }
    resolve_player_spawn_point(SPAWN_POINTS[seed % spawn_count])
}

fn yaw_towards_arena_center(position: Vec3) -> f32 {
    let to_center_x = -position.x;
    let to_center_z = -position.z;
    (-to_center_x).atan2(-to_center_z)
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

fn length_2d(x: f32, z: f32) -> f32 {
    (x * x + z * z).sqrt()
}

fn normalize_2d(x: f32, z: f32) -> (f32, f32) {
    let length = length_2d(x, z);
    if length <= COLLISION_EPSILON {
        (0.0, 0.0)
    } else {
        (x / length, z / length)
    }
}

fn move_horizontal_towards(velocity: Vec3, target_x: f32, target_z: f32, max_delta: f32) -> Vec3 {
    let delta_x = target_x - velocity.x;
    let delta_z = target_z - velocity.z;
    let delta_length = length_2d(delta_x, delta_z);

    if delta_length <= COLLISION_EPSILON || delta_length <= max_delta {
        return Vec3 {
            x: target_x,
            z: target_z,
            ..velocity
        };
    }

    let scale = max_delta / delta_length;
    Vec3 {
        x: velocity.x + delta_x * scale,
        z: velocity.z + delta_z * scale,
        ..velocity
    }
}

fn resolve_horizontal_motion(
    position: Vec3,
    velocity: Vec3,
    feet_y: f32,
    player_height: f32,
    dt_seconds: f32,
) -> (Vec3, Vec3) {
    let delta_x = velocity.x * dt_seconds;
    let delta_z = velocity.z * dt_seconds;
    let max_delta = delta_x.abs().max(delta_z.abs());
    let steps = (max_delta / MOVEMENT_SUBSTEP_MAX_DISTANCE).ceil().max(1.0) as u32;
    let step_x = delta_x / steps as f32;
    let step_z = delta_z / steps as f32;

    let mut next_position = position;
    let mut next_velocity = velocity;
    let mut move_x_open = true;
    let mut move_z_open = true;

    for _ in 0..steps {
        if move_x_open {
            let target_x = next_position.x + step_x;
            if collides_at_with_height(target_x, feet_y, next_position.z, player_height) {
                next_velocity.x = 0.0;
                move_x_open = false;
            } else {
                next_position.x = target_x;
            }
        }

        if move_z_open {
            let target_z = next_position.z + step_z;
            if collides_at_with_height(next_position.x, feet_y, target_z, player_height) {
                next_velocity.z = 0.0;
                move_z_open = false;
            } else {
                next_position.z = target_z;
            }
        }

        if !move_x_open && !move_z_open {
            break;
        }
    }

    (next_position, next_velocity)
}

fn simulate_player_tick(state: &PlayerState, input: &PlayerInput) -> PlayerState {
    let dt_seconds = 1.0 / SERVER_TICK_RATE as f32;
    let mut next = PlayerState {
        yaw: input.yaw,
        pitch: input.pitch.clamp(-MAX_PITCH, MAX_PITCH),
        ..copy_player_state(state)
    };

    let move_x = input.move_x.clamp(-1.0, 1.0);
    let move_z = input.move_z.clamp(-1.0, 1.0);
    let move_magnitude = length_2d(move_x, move_z).min(1.0);
    let (move_dir_x, move_dir_z) = normalize_2d(move_x, move_z);

    let forward_x = -next.yaw.sin();
    let forward_z = -next.yaw.cos();
    let right_x = next.yaw.cos();
    let right_z = -next.yaw.sin();
    let wish_x = right_x * move_dir_x + forward_x * move_dir_z;
    let wish_z = right_z * move_dir_x + forward_z * move_dir_z;
    let (wish_dir_x, wish_dir_z) = normalize_2d(wish_x, wish_z);

    let wants_crouch = input.crouching;
    let wants_sprint = input.sprinting && !wants_crouch && move_z > 0.35 && next.on_ground;
    let wish_speed = if wants_crouch {
        CROUCH_SPEED
    } else if wants_sprint {
        SPRINT_SPEED
    } else {
        WALK_SPEED
    } * move_magnitude;
    let desired_x = wish_dir_x * wish_speed;
    let desired_z = wish_dir_z * wish_speed;

    let mut velocity = Vec3 {
        x: next.vel_x,
        y: next.vel_y,
        z: next.vel_z,
    };
    let mut position = Vec3 {
        x: next.x,
        y: next.y,
        z: next.z,
    };

    if next.on_ground {
        let ground_control = if move_magnitude > 0.0 {
            GROUND_ACCELERATION
        } else {
            GROUND_FRICTION
        };
        velocity =
            move_horizontal_towards(velocity, desired_x, desired_z, ground_control * dt_seconds);
        if input.jumping && !wants_crouch {
            velocity.y = JUMP_SPEED;
            next.on_ground = false;
        } else {
            velocity.y = 0.0;
        }
    } else {
        velocity = move_horizontal_towards(
            velocity,
            desired_x,
            desired_z,
            AIR_ACCELERATION * dt_seconds,
        );
        velocity.y -= GRAVITY * dt_seconds;
    }

    let mut collision_height = if wants_crouch {
        CROUCH_HEIGHT
    } else {
        PLAYER_HEIGHT
    };
    if !wants_crouch && collides_at_with_height(position.x, position.y, position.z, PLAYER_HEIGHT) {
        collision_height = CROUCH_HEIGHT;
    }
    next.sprinting = wants_sprint;
    next.crouching = collision_height == CROUCH_HEIGHT;

    let (resolved_position, resolved_velocity) =
        resolve_horizontal_motion(position, velocity, position.y, collision_height, dt_seconds);
    position.x = resolved_position.x;
    position.z = resolved_position.z;
    velocity.x = resolved_velocity.x;
    velocity.z = resolved_velocity.z;

    let mut proposed_y = position.y + velocity.y * dt_seconds;
    if velocity.y > 0.0
        && collides_at_with_height(position.x, proposed_y, position.z, collision_height)
    {
        let mut low = position.y;
        let mut high = proposed_y;
        for _ in 0..8 {
            let midpoint = (low + high) * 0.5;
            if collides_at_with_height(position.x, midpoint, position.z, collision_height) {
                high = midpoint;
            } else {
                low = midpoint;
            }
        }
        proposed_y = low;
        velocity.y = 0.0;
    }

    let ground_height = ground_height_at(position.x, position.z, position.y);
    if proposed_y <= ground_height {
        position.y = ground_height;
        velocity.y = 0.0;
        next.on_ground = true;
    } else {
        position.y = proposed_y;
        next.on_ground = false;
    }

    next.x = position.x;
    next.y = position.y;
    next.z = position.z;
    next.vel_x = velocity.x;
    next.vel_y = velocity.y;
    next.vel_z = velocity.z;
    next
}

fn make_stale_input(input: PlayerInput) -> PlayerInput {
    PlayerInput {
        move_x: 0.0,
        move_z: 0.0,
        jumping: false,
        sprinting: false,
        fire_held: false,
        reload_pressed: false,
        ..input
    }
}

fn copy_player_state(state: &PlayerState) -> PlayerState {
    PlayerState {
        identity: state.identity,
        room_code: state.room_code.clone(),
        x: state.x,
        y: state.y,
        z: state.z,
        vel_x: state.vel_x,
        vel_y: state.vel_y,
        vel_z: state.vel_z,
        server_tick: state.server_tick,
        yaw: state.yaw,
        pitch: state.pitch,
        health: state.health,
        alive: state.alive,
        on_ground: state.on_ground,
        last_damage_tick: state.last_damage_tick,
        regen_progress: state.regen_progress,
        last_processed_input: state.last_processed_input,
        respawn_tick: state.respawn_tick,
        input_pipeline_ms: state.input_pipeline_ms,
        sprinting: state.sprinting,
        crouching: state.crouching,
    }
}

#[derive(Clone, Copy)]
struct BlockHit {
    distance: f32,
    normal: Vec3,
}

#[derive(Clone, Copy)]
struct PlayerHit {
    distance: f32,
    headshot: bool,
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

fn resolve_player_spawn_point(base: Vec3) -> Vec3 {
    const OFFSETS: [(f32, f32); 13] = [
        (0.0, 0.0),
        (0.75, 0.0),
        (-0.75, 0.0),
        (0.0, 0.75),
        (0.0, -0.75),
        (1.05, 0.0),
        (-1.05, 0.0),
        (0.0, 1.05),
        (0.0, -1.05),
        (0.62, 0.62),
        (-0.62, 0.62),
        (0.62, -0.62),
        (-0.62, -0.62),
    ];

    for (offset_x, offset_z) in OFFSETS {
        let candidate_x = base.x + offset_x;
        let candidate_z = base.z + offset_z;
        let floor_y = ground_height_at(candidate_x, candidate_z, base.y + PLAYER_HEIGHT);

        if !collides_at_with_height(candidate_x, floor_y, candidate_z, PLAYER_HEIGHT) {
            return Vec3 {
                x: candidate_x,
                y: floor_y,
                z: candidate_z,
            };
        }
    }

    Vec3 {
        x: base.x,
        y: ground_height_at(base.x, base.z, base.y + PLAYER_HEIGHT),
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

fn ray_hits_player(
    origin: Vec3,
    direction: Vec3,
    position: Vec3,
    crouching: bool,
) -> Option<PlayerHit> {
    let hitbox_half = if crouching {
        CROUCH_HITBOX_HALF
    } else {
        PLAYER_HITBOX_HALF
    };
    let hitbox_height = if crouching {
        CROUCH_HEIGHT + 0.14
    } else {
        PLAYER_HEIGHT + 0.24
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
        let distance = t_min.max(0.0);
        let hit_y = origin.y + direction.y * distance;
        let head_threshold = position.y + hitbox_height * 0.74;
        Some(PlayerHit {
            distance,
            headshot: hit_y >= head_threshold,
        })
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

fn ray_hits_floor(origin: Vec3, direction: Vec3) -> Option<BlockHit> {
    if direction.y >= -RAY_DIRECTION_EPSILON {
        return None;
    }

    let distance = (0.0 - origin.y) / direction.y;
    if distance < 0.0 {
        return None;
    }

    let impact = point_along_ray(origin, direction, distance);
    if impact.x < ARENA_MIN_X - COLLISION_EPSILON
        || impact.x > ARENA_MAX_X + COLLISION_EPSILON
        || impact.z < ARENA_MIN_Z - COLLISION_EPSILON
        || impact.z > ARENA_MAX_Z + COLLISION_EPSILON
    {
        return None;
    }

    Some(BlockHit {
        distance,
        normal: Vec3 {
            x: 0.0,
            y: 1.0,
            z: 0.0,
        },
    })
}

fn ray_hits_environment(origin: Vec3, direction: Vec3) -> Option<BlockHit> {
    let block_hit = ray_hits_any_block(origin, direction);
    let floor_hit = ray_hits_floor(origin, direction);
    match (block_hit, floor_hit) {
        (Some(block), Some(floor)) => {
            if block.distance <= floor.distance {
                Some(block)
            } else {
                Some(floor)
            }
        }
        (Some(block), None) => Some(block),
        (None, Some(floor)) => Some(floor),
        (None, None) => None,
    }
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

fn insert_system_chat_event(ctx: &ReducerContext, room_code: &str, message: String, tick: u32) {
    let sanitized = sanitize_chat_payload(message.as_str());
    if sanitized.is_empty() {
        return;
    }
    ctx.db.chat_event().insert(ChatEvent {
        id: 0,
        room_code: room_code.to_string(),
        sender_identity: ctx.identity(),
        sender_nickname: "SYSTEM".to_string(),
        message: sanitized,
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
    let mut attacker_state = require_player_state(ctx, attacker_identity)?;
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
    bump_stat_for_identity(ctx, attacker_identity, |stats| {
        stats.shots_hit = stats.shots_hit.saturating_add(1);
        stats.damage_dealt = stats.damage_dealt.saturating_add(damage as u32);
    });
    bump_stat_for_identity(ctx, victim_identity, |stats| {
        stats.damage_taken = stats.damage_taken.saturating_add(damage as u32);
    });

    if lethal {
        let healed_health = attacker_state
            .health
            .saturating_add(KILL_HEAL_AMOUNT)
            .min(MAX_HEALTH);
        if healed_health != attacker_state.health {
            attacker_state.health = healed_health;
            attacker_state.server_tick = tick;
            attacker_state.regen_progress = 0.0;
            ctx.db.player_state().identity().update(attacker_state);
        }

        if let Some(mut attacker_weapon) = ctx.db.weapon_state().identity().find(attacker_identity)
        {
            let rewarded_ammo = attacker_weapon
                .reserve_ammo
                .saturating_add(KILL_AMMO_REWARD)
                .min(RIFLE_RESERVE_CAPACITY);
            if rewarded_ammo != attacker_weapon.reserve_ammo {
                attacker_weapon.reserve_ammo = rewarded_ammo;
                ctx.db.weapon_state().identity().update(attacker_weapon);
            }
        }

        victim_state.alive = false;
        victim_state.respawn_tick = tick;
        victim_state.vel_x = 0.0;
        victim_state.vel_y = 0.0;
        victim_state.vel_z = 0.0;
        victim_state.sprinting = false;
        victim_state.crouching = false;
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
        bump_stat_for_identity(ctx, attacker_identity, |stats| {
            stats.kills = stats.kills.saturating_add(1);
            stats.kdr = compute_kdr(stats.kills, stats.deaths);
        });
        bump_stat_for_identity(ctx, victim_identity, |stats| {
            stats.deaths = stats.deaths.saturating_add(1);
            stats.kdr = compute_kdr(stats.kills, stats.deaths);
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
    state.sprinting = false;
    state.crouching = false;
    state.last_damage_tick = current_tick(ctx);
    state.regen_progress = 0.0;
    state.yaw = spawn_yaw;
    state.pitch = 0.0;
    state.server_tick = current_tick(ctx);
    state.input_pipeline_ms = 0;
    state.last_processed_input = 0;
    state.respawn_tick = current_tick(ctx);

    weapon.ammo_in_mag = RIFLE_CLIP_SIZE;
    weapon.reserve_ammo = RIFLE_RESERVE_CAPACITY;
    weapon.reload_started_tick = 0;
    weapon.reload_complete_tick = 0;
    weapon.reloading = false;
    weapon.selected_weapon_slot = WEAPON_SLOT_RIFLE;
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

fn estimate_hit_rewind_ticks(shooter_input: &PlayerInput, tick: u32) -> u32 {
    let tick_interval_us = (SERVER_TICK_INTERVAL_US as u32).max(1);
    let interpolation_delay_us = REMOTE_INTERPOLATION_DELAY_MS.saturating_mul(1000);
    let interpolation_ticks = interpolation_delay_us
        .saturating_add(tick_interval_us.saturating_sub(1))
        / tick_interval_us;
    let interpolation_ticks = interpolation_ticks.max(1);
    let network_ticks = tick.saturating_sub(shooter_input.last_received_tick);
    interpolation_ticks
        .saturating_add(network_ticks)
        .saturating_add(HIT_REWIND_FUDGE_TICKS)
        .min(MAX_HIT_REWIND_TICKS)
}

fn rewind_player_for_hit(state: &PlayerState, rewind_ticks: u32) -> Vec3 {
    if rewind_ticks == 0 {
        return Vec3 {
            x: state.x,
            y: state.y,
            z: state.z,
        };
    }

    let rewind_seconds =
        (rewind_ticks as f32 / SERVER_TICK_RATE as f32).min(MAX_HIT_REWIND_SECONDS);
    let rewound_x = (state.x - state.vel_x * rewind_seconds)
        .clamp(ARENA_MIN_X + PLAYER_RADIUS, ARENA_MAX_X - PLAYER_RADIUS);
    let rewound_z = (state.z - state.vel_z * rewind_seconds)
        .clamp(ARENA_MIN_Z + PLAYER_RADIUS, ARENA_MAX_Z - PLAYER_RADIUS);
    let rewound_y = state.y - state.vel_y * rewind_seconds;
    let floor_y = ground_height_at(rewound_x, rewound_z, rewound_y + PLAYER_HEIGHT);
    let resolved_y = rewound_y.max(floor_y);

    Vec3 {
        x: rewound_x,
        y: resolved_y,
        z: rewound_z,
    }
}

fn player_touches_pickup(
    state: &PlayerState,
    pickup: Vec3,
    pickup_radius: f32,
    horizontal_grace: f32,
    vertical_grace: f32,
) -> bool {
    swept_player_touches_pickup(
        Vec3 {
            x: state.x,
            y: state.y,
            z: state.z,
        },
        Vec3 {
            x: state.vel_x,
            y: state.vel_y,
            z: state.vel_z,
        },
        pickup,
        pickup_radius,
        horizontal_grace,
        vertical_grace,
    )
}

fn swept_player_touches_pickup(
    current: Vec3,
    velocity: Vec3,
    pickup: Vec3,
    pickup_radius: f32,
    horizontal_grace: f32,
    vertical_grace: f32,
) -> bool {
    let max_delta = 1.8;
    let previous_x =
        current.x - (velocity.x / SERVER_TICK_RATE as f32).clamp(-max_delta, max_delta);
    let previous_z =
        current.z - (velocity.z / SERVER_TICK_RATE as f32).clamp(-max_delta, max_delta);
    let max_horizontal = PLAYER_RADIUS + pickup_radius + horizontal_grace + PICKUP_SWEEP_EXTRA;
    let swept_distance_sq = segment_point_distance_sq_2d(
        previous_x, previous_z, current.x, current.z, pickup.x, pickup.z,
    );
    let direct_distance_sq = point_distance_sq_2d(current.x, current.z, pickup.x, pickup.z);
    let distance_sq = swept_distance_sq.min(direct_distance_sq);
    if distance_sq > max_horizontal * max_horizontal {
        return false;
    }

    let previous_y =
        current.y - (velocity.y / SERVER_TICK_RATE as f32).clamp(-max_delta, max_delta);
    let feet_min = previous_y.min(current.y) - vertical_grace;
    let feet_max = previous_y.max(current.y) + PLAYER_HEIGHT + vertical_grace;
    let pickup_min_y = pickup.y - pickup_radius - vertical_grace;
    let pickup_max_y = pickup.y + pickup_radius + vertical_grace;

    pickup_max_y >= feet_min && pickup_min_y <= feet_max
}

fn process_ammo_packs(ctx: &ReducerContext, tick: u32) {
    let packs: Vec<AmmoPack> = ctx.db.ammo_pack().iter().collect();
    let states: Vec<PlayerState> = ctx.db.player_state().iter().collect();
    let mut picked_identities: Vec<Identity> = Vec::new();

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

        if collides_at(pack.x, pack.y, pack.z) {
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
            ctx.db.ammo_pack().id().update(pack);
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
            if picked_identities.contains(&state.identity) {
                continue;
            }
            if !player_touches_pickup(
                state,
                pickup_position,
                AMMO_PACK_RADIUS,
                AMMO_PICKUP_HORIZONTAL_GRACE,
                AMMO_PICKUP_VERTICAL_GRACE,
            ) {
                continue;
            }
            let distance_sq =
                point_distance_sq_2d(state.x, state.z, pickup_position.x, pickup_position.z);
            candidates.push((state.identity, distance_sq));
        }

        candidates.sort_by(|left, right| left.1.total_cmp(&right.1));
        let mut collected = false;
        let mut collected_by: Option<Identity> = None;
        for (identity, _) in candidates {
            let mut weapon = match ctx.db.weapon_state().identity().find(identity) {
                Some(weapon) => weapon,
                None => {
                    ctx.db.weapon_state().insert(WeaponState {
                        identity,
                        room_code: Some(pack.room_code.clone()),
                        ammo_in_mag: 0,
                        reserve_ammo: 0,
                        reload_started_tick: 0,
                        reload_complete_tick: 0,
                        reloading: false,
                        selected_weapon_slot: WEAPON_SLOT_RIFLE,
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
            if weapon.ammo_in_mag >= RIFLE_CLIP_SIZE
                && weapon.reserve_ammo >= RIFLE_RESERVE_CAPACITY
            {
                if dirty {
                    ctx.db.weapon_state().identity().update(weapon);
                }
                continue;
            }

            let (next_mag, next_reserve) =
                ammo_after_pickup(weapon.ammo_in_mag, weapon.reserve_ammo);
            weapon.ammo_in_mag = next_mag;
            weapon.reserve_ammo = next_reserve;
            ctx.db.weapon_state().identity().update(weapon);
            collected = true;
            collected_by = Some(identity);
            break;
        }

        if collected {
            if let Some(identity) = collected_by {
                picked_identities.push(identity);
                bump_stat_for_identity(ctx, identity, |stats| {
                    stats.ammo_collected = stats.ammo_collected.saturating_add(1);
                });
            }
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
        let mut collected_by: Option<Identity> = None;
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
            if !player_touches_pickup(
                state,
                pickup_position,
                HEALTH_PACK_RADIUS,
                PICKUP_HORIZONTAL_GRACE,
                PICKUP_VERTICAL_GRACE,
            ) {
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
            collected_by = Some(state.identity);
            break;
        }

        if collected {
            if let Some(identity) = collected_by {
                bump_stat_for_identity(ctx, identity, |stats| {
                    stats.health_collected = stats.health_collected.saturating_add(1);
                });
            }
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
        crouching: false,
        scoped: false,
        fire_held: false,
        reload_pressed: false,
        weapon_slot: WEAPON_SLOT_RIFLE,
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
        ammo_after_pickup, can_fire_weapon_at_tick, inputs_are_finite, normalize_weapon_slot,
        reload_transfer_amount, room_membership_is_consistent, should_accept_input_sequence,
        simulate_player_tick, swept_player_touches_pickup, validate_room_code, PlayerInput,
        PlayerState, Vec3, AMMO_PACK_RADIUS, AMMO_PICKUP_HORIZONTAL_GRACE,
        AMMO_PICKUP_VERTICAL_GRACE, MAX_HEALTH, RIFLE_CLIP_SIZE, RIFLE_RESERVE_CAPACITY,
        WEAPON_SLOT_RIFLE, WEAPON_SLOT_SHOTGUN, WEAPON_SLOT_SNIPER,
    };
    use spacetimedb::Identity;

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

    #[test]
    fn input_payloads_require_finite_values() {
        assert!(inputs_are_finite([0.0, 1.0, -1.2, 0.3]));
        assert!(!inputs_are_finite([f32::NAN, 0.0, 0.0, 0.0]));
        assert!(!inputs_are_finite([0.0, f32::INFINITY, 0.0, 0.0]));
    }

    fn test_player_state() -> PlayerState {
        PlayerState {
            identity: Identity::ZERO,
            room_code: Some("ARENA".to_string()),
            x: 8.0,
            y: 0.0,
            z: 0.0,
            vel_x: 0.0,
            vel_y: 0.0,
            vel_z: 0.0,
            server_tick: 10,
            yaw: 0.0,
            pitch: 0.0,
            health: MAX_HEALTH,
            alive: true,
            on_ground: true,
            last_damage_tick: 0,
            regen_progress: 0.0,
            last_processed_input: 10,
            respawn_tick: 0,
            input_pipeline_ms: 0,
            sprinting: false,
            crouching: false,
        }
    }

    fn test_player_input(sequence: u32) -> PlayerInput {
        PlayerInput {
            identity: Identity::ZERO,
            sequence,
            move_x: 0.0,
            move_z: 0.0,
            yaw: 0.0,
            pitch: 0.0,
            jumping: false,
            sprinting: false,
            last_received_tick: 10,
            crouching: false,
            scoped: false,
            fire_held: false,
            reload_pressed: false,
            weapon_slot: WEAPON_SLOT_RIFLE,
        }
    }

    #[test]
    fn authoritative_simulation_moves_from_input_intent() {
        let previous = test_player_state();
        let input = PlayerInput {
            move_z: 1.0,
            sequence: 11,
            ..test_player_input(11)
        };

        let next = simulate_player_tick(&previous, &input);

        assert!(next.z < previous.z);
        assert!(next.vel_z < 0.0);
        assert_eq!(next.yaw, 0.0);
    }

    #[test]
    fn authoritative_simulation_jumps_from_ground() {
        let previous = test_player_state();
        let input = PlayerInput {
            jumping: true,
            sequence: 11,
            ..test_player_input(11)
        };

        let next = simulate_player_tick(&previous, &input);

        assert!(next.vel_y > 0.0);
        assert!(!next.on_ground);
    }

    #[test]
    fn reload_transfer_never_overfills_magazine_or_overdraws_reserve() {
        assert_eq!(
            reload_transfer_amount(0, RIFLE_RESERVE_CAPACITY),
            RIFLE_CLIP_SIZE
        );
        assert_eq!(reload_transfer_amount(7, RIFLE_RESERVE_CAPACITY), 3);
        assert_eq!(reload_transfer_amount(0, 4), 4);
        assert_eq!(
            reload_transfer_amount(RIFLE_CLIP_SIZE, RIFLE_RESERVE_CAPACITY),
            0
        );
    }

    #[test]
    fn ammo_pickups_fill_magazine_then_reserve_and_respect_cap() {
        assert_eq!(ammo_after_pickup(0, 0), (6, 0));
        assert_eq!(ammo_after_pickup(8, 0), (RIFLE_CLIP_SIZE, 4));
        assert_eq!(
            ammo_after_pickup(RIFLE_CLIP_SIZE, RIFLE_RESERVE_CAPACITY - 1),
            (RIFLE_CLIP_SIZE, RIFLE_RESERVE_CAPACITY)
        );
        assert_eq!(
            ammo_after_pickup(RIFLE_CLIP_SIZE, RIFLE_RESERVE_CAPACITY),
            (RIFLE_CLIP_SIZE, RIFLE_RESERVE_CAPACITY)
        );
    }

    #[test]
    fn walking_across_ammo_pickup_counts_as_touching_it() {
        assert!(swept_player_touches_pickup(
            Vec3 {
                x: 0.08,
                y: 0.0,
                z: 0.05,
            },
            Vec3 {
                x: 6.4,
                y: 0.0,
                z: 0.0,
            },
            Vec3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            AMMO_PACK_RADIUS,
            AMMO_PICKUP_HORIZONTAL_GRACE,
            AMMO_PICKUP_VERTICAL_GRACE,
        ));

        assert!(swept_player_touches_pickup(
            Vec3 {
                x: 0.08,
                y: 4.0,
                z: 0.05,
            },
            Vec3 {
                x: 6.4,
                y: 0.0,
                z: 0.0,
            },
            Vec3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            AMMO_PACK_RADIUS,
            AMMO_PICKUP_HORIZONTAL_GRACE,
            AMMO_PICKUP_VERTICAL_GRACE,
        ));
    }

    #[test]
    fn weapon_slot_inputs_are_normalized() {
        assert_eq!(normalize_weapon_slot(WEAPON_SLOT_RIFLE), WEAPON_SLOT_RIFLE);
        assert_eq!(
            normalize_weapon_slot(WEAPON_SLOT_SNIPER),
            WEAPON_SLOT_SNIPER
        );
        assert_eq!(
            normalize_weapon_slot(WEAPON_SLOT_SHOTGUN),
            WEAPON_SLOT_SHOTGUN
        );
        assert_eq!(normalize_weapon_slot(99), WEAPON_SLOT_RIFLE);
    }
}
