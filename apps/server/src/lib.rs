#![allow(clippy::module_name_repetitions)]
#![allow(
    clippy::assertions_on_constants,
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::float_cmp,
    clippy::missing_errors_doc,
    clippy::needless_pass_by_value,
    clippy::struct_field_names,
    clippy::struct_excessive_bools,
    clippy::too_many_arguments,
    clippy::too_many_lines
)]

mod simulation;

#[allow(
    dead_code,
    clippy::approx_constant,
    clippy::excessive_precision,
    clippy::unreadable_literal
)]
mod arena_map {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/shared/generated/arena_map.rs"
    ));
}

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use simulation::{
    Vec3, ALLOWED_BUTTONS, BUTTON_FIRE_HELD, BUTTON_JUMP, BUTTON_SCOPE_HELD, BUTTON_SPRINT,
    HISTORY_SAMPLES, INTERMISSION_TICKS, MATCH_DURATION_TICKS, MAX_HEALTH,
    MAX_LAG_COMPENSATION_TICKS, PLAYER_EYE_HEIGHT, RECONNECT_GRACE_TICKS, RESPAWN_DELAY_TICKS,
    ROOM_CAPACITY, SCORE_LIMIT, TICK_RATE, WEAPON_RIFLE, WEAPON_SHOTGUN, WEAPON_SNIPER,
};
use spacetimedb::{
    reducer, table, view, AnonymousViewContext, ConnectionId, Identity, ReducerContext, ScheduleAt,
    Table, TimeDuration, ViewContext,
};

const ROOM_PHASE_ACTIVE: u8 = 1;
const ROOM_PHASE_INTERMISSION: u8 = 2;
const ROOM_IDLE_CLEANUP_TICKS: u64 = 60 * TICK_RATE as u64;
const INPUTS_PER_SECOND: u16 = 240;
const CHAT_PER_TEN_SECONDS: u16 = 8;
const ROOM_ACTIONS_PER_TEN_SECONDS: u16 = 12;
const AUTH_ACTIONS_PER_MINUTE: u16 = 8;
const GLOBAL_AUTH_ATTEMPTS_PER_MINUTE: u16 = 30;
const ACCOUNT_AUTH_FAILURE_LIMIT: u16 = 5;
const AUTH_WINDOW_MICROS: i64 = 60_000_000;
const ACCOUNT_LOCK_MICROS: i64 = 5 * 60_000_000;
const AUTH_SESSION_TICKS: u64 = 30 * 60 * TICK_RATE as u64;
const GLOBAL_ROOM_CREATIONS_PER_MINUTE: u16 = 12;
const RATE_LIMIT_RETENTION_MICROS: i64 = 10 * 60_000_000;
const EVENT_RETENTION_TICKS: u64 = 30 * TICK_RATE as u64;
const MAX_ROOMS: usize = 16;
const MAX_NICKNAME_CHARS: usize = 16;
const MAX_CHAT_CHARS: usize = 180;

const EVENT_JOIN: u8 = 1;
const EVENT_LEAVE: u8 = 2;
const EVENT_FIRE: u8 = 3;
const EVENT_HIT: u8 = 4;
const EVENT_KILL: u8 = 5;
const EVENT_RESPAWN: u8 = 6;
const EVENT_RELOAD: u8 = 7;
const EVENT_MATCH_END: u8 = 8;
const EVENT_MATCH_START: u8 = 9;
const EVENT_PICKUP: u8 = 10;
const ACTION_ROOM: u8 = 1;
const ACTION_INPUT: u8 = 2;
const ACTION_CHAT: u8 = 3;
const AUTH_ERROR_NONE: u8 = 0;
const AUTH_ERROR_INVALID: u8 = 1;
const AUTH_ERROR_THROTTLED: u8 = 2;
const AUTH_ERROR_SESSION_EXPIRED: u8 = 4;
const AUTH_ERROR_DISABLED: u8 = 5;
const PASSWORD_ACCOUNTS_ENABLED: bool = cfg!(feature = "password-accounts");
const INITIAL_BOTS_SPAWN_PROTECTED: bool = true;

#[table(accessor = server_config, public)]
pub struct ServerConfig {
    #[primary_key]
    pub id: u8,
    pub tick_rate: u16,
    pub room_capacity: u8,
    pub score_limit: u16,
    pub match_duration_ticks: u64,
    pub intermission_ticks: u64,
    pub reconnect_grace_ticks: u64,
    pub lag_compensation_ticks: u64,
    pub map_version: String,
    pub accounts_enabled: bool,
}

#[table(accessor = room)]
pub struct Room {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[unique]
    pub code: String,
    #[index(btree)]
    pub phase: u8,
    pub round: u32,
    pub created_tick: u64,
    pub server_tick: u64,
    pub match_tick: u64,
    pub intermission_ends_tick: u64,
    pub winner_player_id: u64,
    pub human_count: u8,
    pub bot_count: u8,
}

#[derive(spacetimedb::SpacetimeType)]
pub struct RoomBrowserView {
    pub id: u64,
    pub code: String,
    pub phase: u8,
    pub round: u32,
    pub human_count: u8,
    pub bot_count: u8,
}

#[table(accessor = player)]
pub struct Player {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub room_id: u64,
    pub owner_identity: Identity,
    pub nickname: String,
    pub is_bot: bool,
    pub connected: bool,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub vx: f32,
    pub vy: f32,
    pub vz: f32,
    pub yaw: f32,
    pub pitch: f32,
    pub health: u16,
    pub max_health: u16,
    pub alive: bool,
    pub life_id: u32,
    pub spawn_protected_until_tick: u64,
    pub respawn_at_tick: u64,
    pub kills: u16,
    pub deaths: u16,
    pub selected_weapon: u8,
    pub last_processed_input_seq: u32,
    pub last_processed_fire_counter: u32,
    pub last_processed_reload_counter: u32,
    pub last_processed_respawn_counter: u32,
}

#[derive(spacetimedb::SpacetimeType)]
pub struct PlayerView {
    pub id: u64,
    pub room_id: u64,
    pub nickname: String,
    pub is_self: bool,
    pub is_bot: bool,
    pub connected: bool,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub vx: f32,
    pub vy: f32,
    pub vz: f32,
    pub yaw: f32,
    pub pitch: f32,
    pub health: u16,
    pub max_health: u16,
    pub alive: bool,
    pub life_id: u32,
    pub spawn_protected_until_tick: u64,
    pub respawn_at_tick: u64,
    pub kills: u16,
    pub deaths: u16,
    pub selected_weapon: u8,
    pub last_processed_input_seq: u32,
    pub last_processed_fire_counter: u32,
    pub last_processed_reload_counter: u32,
    pub last_processed_respawn_counter: u32,
}

#[table(accessor = weapon_state)]
pub struct WeaponState {
    #[primary_key]
    pub key: u64,
    #[index(btree)]
    pub player_id: u64,
    pub slot: u8,
    pub magazine_ammo: u16,
    pub reserve_ammo: u16,
    pub next_fire_tick: u64,
    pub reload_complete_tick: u64,
    pub reloading: bool,
    pub shot_counter: u32,
}

#[table(accessor = pickup_state)]
pub struct PickupState {
    #[primary_key]
    pub key: u64,
    #[index(btree)]
    pub room_id: u64,
    pub pickup_index: u16,
    pub kind: u8,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub available: bool,
    pub respawn_at_tick: u64,
}

#[table(accessor = match_event)]
pub struct MatchEvent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub room_id: u64,
    pub tick: u64,
    pub kind: u8,
    pub actor_player_id: u64,
    pub target_player_id: u64,
    pub weapon_slot: u8,
    pub value: u16,
    pub text: String,
}

#[table(accessor = chat_event)]
pub struct ChatEvent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub room_id: u64,
    pub tick: u64,
    pub player_id: u64,
    pub nickname: String,
    pub message: String,
}

#[table(accessor = account_session)]
pub struct AccountSession {
    #[primary_key]
    pub identity: Identity,
    pub connection_id: ConnectionId,
    pub account_id: u64,
    pub username: String,
    pub logged_in: bool,
    pub auth_request_id: u32,
    pub auth_error_code: u8,
    pub retry_after_micros: i64,
    pub auth_expires_tick: u64,
}

#[table(accessor = account_stats)]
pub struct AccountStats {
    #[primary_key]
    pub account_id: u64,
    pub username: String,
    pub times_played: u64,
    pub total_play_time_ticks: u64,
    pub total_lobby_time_ticks: u64,
    pub eliminations: u64,
    pub kills: u64,
    pub deaths: u64,
    pub matches_played: u64,
    pub wins: u64,
    pub shots_fired: u64,
    pub shots_hit: u64,
    pub damage_dealt: u64,
    pub damage_taken: u64,
    pub ammo_collected: u64,
    pub health_collected: u64,
    pub chat_messages: u64,
    pub rooms_created: u64,
    pub rooms_joined: u64,
    pub matches_started: u64,
    pub respawns: u64,
    pub best_streak: u16,
    pub last_seen_tick: u64,
}

fn account_feature_enabled_for_view(ctx: &ViewContext) -> bool {
    simulation::account_feature_enabled(
        PASSWORD_ACCOUNTS_ENABLED,
        ctx.db
            .server_config()
            .id()
            .find(0)
            .map(|config| config.accounts_enabled),
    )
}

#[view(accessor = my_account_session, public)]
#[must_use]
pub fn my_account_session(ctx: &ViewContext) -> Option<AccountSession> {
    let accounts_enabled = account_feature_enabled_for_view(ctx);
    let tick = ctx
        .db
        .simulation_clock()
        .id()
        .find(0)
        .map_or(0, |clock| clock.tick);
    ctx.db
        .account_session()
        .identity()
        .find(ctx.sender())
        .filter(|session| {
            if accounts_enabled {
                !session.logged_in || session.auth_expires_tick >= tick
            } else {
                !session.logged_in && session.auth_error_code == AUTH_ERROR_DISABLED
            }
        })
}

#[view(accessor = my_account_stats, public)]
#[must_use]
pub fn my_account_stats(ctx: &ViewContext) -> Option<AccountStats> {
    if !account_feature_enabled_for_view(ctx) {
        return None;
    }
    let tick = ctx
        .db
        .simulation_clock()
        .id()
        .find(0)
        .map_or(0, |clock| clock.tick);
    let session = ctx
        .db
        .account_session()
        .identity()
        .find(ctx.sender())
        .filter(|session| session.logged_in && session.auth_expires_tick >= tick)?;
    ctx.db.account_stats().account_id().find(session.account_id)
}

#[table(accessor = simulation_clock)]
struct SimulationClock {
    #[primary_key]
    id: u8,
    tick: u64,
}

#[table(accessor = room_runtime)]
struct RoomRuntime {
    #[primary_key]
    room_id: u64,
    last_human_tick: u64,
}

#[table(accessor = player_session)]
struct PlayerSession {
    #[primary_key]
    identity: Identity,
    connection_id: ConnectionId,
    #[unique]
    player_id: u64,
    room_id: u64,
    reconnect_expires_tick: u64,
    account_id: u64,
}

fn caller_player_session(ctx: &ViewContext) -> Option<PlayerSession> {
    let tick = ctx
        .db
        .simulation_clock()
        .id()
        .find(0)
        .map_or(0, |clock| clock.tick);
    ctx.db
        .player_session()
        .identity()
        .find(ctx.sender())
        .filter(|session| session.reconnect_expires_tick >= tick)
}

fn room_browser_projection(room: Room) -> RoomBrowserView {
    RoomBrowserView {
        id: room.id,
        code: room.code,
        phase: room.phase,
        round: room.round,
        human_count: room.human_count,
        bot_count: room.bot_count,
    }
}

#[view(accessor = open_rooms, public)]
#[must_use]
pub fn open_rooms(ctx: &AnonymousViewContext) -> Vec<RoomBrowserView> {
    ctx.db
        .room()
        .phase()
        .filter(ROOM_PHASE_ACTIVE)
        .chain(ctx.db.room().phase().filter(ROOM_PHASE_INTERMISSION))
        .map(room_browser_projection)
        .collect()
}

#[view(accessor = my_room_state, public)]
#[must_use]
pub fn my_room_state(ctx: &ViewContext) -> Option<Room> {
    let session = caller_player_session(ctx)?;
    ctx.db.room().id().find(session.room_id)
}

#[view(accessor = my_room_players, public)]
#[must_use]
pub fn my_room_players(ctx: &ViewContext) -> Vec<PlayerView> {
    let Some(session) = caller_player_session(ctx) else {
        return Vec::new();
    };
    ctx.db
        .player()
        .room_id()
        .filter(session.room_id)
        .map(|player| {
            let is_self = player.id == session.player_id;
            PlayerView {
                id: player.id,
                room_id: player.room_id,
                nickname: player.nickname,
                is_self,
                is_bot: player.is_bot,
                connected: player.connected,
                x: player.x,
                y: player.y,
                z: player.z,
                vx: player.vx,
                vy: player.vy,
                vz: player.vz,
                yaw: player.yaw,
                pitch: player.pitch,
                health: player.health,
                max_health: player.max_health,
                alive: player.alive,
                life_id: player.life_id,
                spawn_protected_until_tick: player.spawn_protected_until_tick,
                respawn_at_tick: player.respawn_at_tick,
                kills: player.kills,
                deaths: player.deaths,
                selected_weapon: player.selected_weapon,
                last_processed_input_seq: if is_self {
                    player.last_processed_input_seq
                } else {
                    0
                },
                last_processed_fire_counter: if is_self {
                    player.last_processed_fire_counter
                } else {
                    0
                },
                last_processed_reload_counter: if is_self {
                    player.last_processed_reload_counter
                } else {
                    0
                },
                last_processed_respawn_counter: if is_self {
                    player.last_processed_respawn_counter
                } else {
                    0
                },
            }
        })
        .collect()
}

#[view(accessor = my_weapon_states, public)]
#[must_use]
pub fn my_weapon_states(ctx: &ViewContext) -> Vec<WeaponState> {
    let Some(session) = caller_player_session(ctx) else {
        return Vec::new();
    };
    ctx.db
        .weapon_state()
        .player_id()
        .filter(session.player_id)
        .collect()
}

#[view(accessor = my_room_pickups, public)]
#[must_use]
pub fn my_room_pickups(ctx: &ViewContext) -> Vec<PickupState> {
    let Some(session) = caller_player_session(ctx) else {
        return Vec::new();
    };
    ctx.db
        .pickup_state()
        .room_id()
        .filter(session.room_id)
        .collect()
}

#[view(accessor = my_room_match_events, public)]
#[must_use]
pub fn my_room_match_events(ctx: &ViewContext) -> Vec<MatchEvent> {
    let Some(session) = caller_player_session(ctx) else {
        return Vec::new();
    };
    ctx.db
        .match_event()
        .room_id()
        .filter(session.room_id)
        .collect()
}

#[view(accessor = my_room_chat_events, public)]
#[must_use]
pub fn my_room_chat_events(ctx: &ViewContext) -> Vec<ChatEvent> {
    let Some(session) = caller_player_session(ctx) else {
        return Vec::new();
    };
    ctx.db
        .chat_event()
        .room_id()
        .filter(session.room_id)
        .collect()
}

#[table(accessor = player_input)]
struct PlayerInput {
    #[primary_key]
    player_id: u64,
    seq: u32,
    client_tick: u64,
    move_x: f32,
    move_z: f32,
    yaw: f32,
    pitch: f32,
    buttons: u16,
    desired_weapon: u8,
    fire_counter: u32,
    reload_counter: u32,
    respawn_counter: u32,
    received_tick: u64,
}

#[table(accessor = rate_limit)]
struct RateLimit {
    #[primary_key]
    identity: Identity,
    input_window_micros: i64,
    input_count: u16,
    chat_window_micros: i64,
    chat_count: u16,
    room_window_micros: i64,
    room_count: u16,
    auth_window_micros: i64,
    auth_count: u16,
    last_seen_micros: i64,
}

#[table(accessor = client_action_result)]
pub struct ClientActionResult {
    #[primary_key]
    pub identity: Identity,
    pub connection_id: ConnectionId,
    pub request_id: u32,
    pub action_kind: u8,
    pub success: bool,
    pub error_code: u8,
    pub message: String,
    pub updated_tick: u64,
}

#[view(accessor = my_action_result, public)]
#[must_use]
pub fn my_action_result(ctx: &ViewContext) -> Option<ClientActionResult> {
    ctx.db.client_action_result().identity().find(ctx.sender())
}

#[table(accessor = account)]
struct Account {
    #[primary_key]
    #[auto_inc]
    account_id: u64,
    #[unique]
    username_key: String,
    #[unique]
    email_key: String,
    username: String,
    password_hash: String,
}

#[table(accessor = global_auth_budget)]
struct GlobalAuthBudget {
    #[primary_key]
    id: u8,
    window_started_micros: i64,
    attempts: u16,
}

#[table(accessor = global_room_budget)]
struct GlobalRoomBudget {
    #[primary_key]
    id: u8,
    window_started_micros: i64,
    attempts: u16,
}

#[table(accessor = account_auth_guard)]
struct AccountAuthGuard {
    #[primary_key]
    account_id: u64,
    window_started_micros: i64,
    failures: u16,
    blocked_until_micros: i64,
}

#[table(accessor = lag_sample)]
struct LagSample {
    #[primary_key]
    key: u64,
    #[index(btree)]
    player_id: u64,
    server_tick: u64,
    x: f32,
    y: f32,
    z: f32,
}

#[table(accessor = bot_brain)]
struct BotBrain {
    #[primary_key]
    player_id: u64,
    waypoint_index: u16,
    target_player_id: u64,
    think_at_tick: u64,
    aim_yaw: f32,
    aim_pitch: f32,
    stuck_ticks: u16,
    seed: u64,
}

#[table(accessor = sim_tick_schedule, scheduled(sim_tick))]
pub struct SimTickSchedule {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    scheduled_at: ScheduleAt,
}

#[derive(Clone, Copy)]
enum RateKind {
    Input,
    Chat,
    Room,
    Auth,
}

fn current_tick(ctx: &ReducerContext) -> u64 {
    ctx.db
        .simulation_clock()
        .id()
        .find(0)
        .map_or(0, |clock| clock.tick)
}

fn account_feature_enabled(ctx: &ReducerContext) -> bool {
    simulation::account_feature_enabled(
        PASSWORD_ACCOUNTS_ENABLED,
        ctx.db
            .server_config()
            .id()
            .find(0)
            .map(|config| config.accounts_enabled),
    )
}

fn current_player_for_sender(ctx: &ReducerContext) -> Result<(PlayerSession, Player), String> {
    let connection_id = ctx
        .connection_id()
        .ok_or_else(|| "This action requires an active client connection.".to_string())?;
    let session = ctx
        .db
        .player_session()
        .identity()
        .find(ctx.sender())
        .ok_or_else(|| "Join a room before performing this action.".to_string())?;
    if !simulation::connection_owns_session(
        session.connection_id.to_u128(),
        connection_id.to_u128(),
    ) {
        return Err("This connection does not own the active player session.".to_string());
    }
    let player = ctx
        .db
        .player()
        .id()
        .find(session.player_id)
        .ok_or_else(|| "Your room session no longer exists. Join again.".to_string())?;
    if player.is_bot || !player.connected || player.owner_identity != ctx.sender() {
        return Err("Your room session is not currently active.".to_string());
    }
    Ok((session, player))
}

fn preflight_room_claim(ctx: &ReducerContext) -> Result<(), String> {
    let connection_id = ctx
        .connection_id()
        .ok_or_else(|| "Joining a room requires an active client connection.".to_string())?;
    let existing = ctx.db.player_session().identity().find(ctx.sender());
    let reconnect_expires_tick = existing
        .as_ref()
        .map_or(u64::MAX, |session| session.reconnect_expires_tick);
    if !simulation::room_allocation_is_safe(
        existing
            .as_ref()
            .map(|session| session.connection_id.to_u128()),
        connection_id.to_u128(),
        reconnect_expires_tick,
    ) {
        return Err("This identity is already playing from another active connection.".to_string());
    }
    Ok(())
}

fn write_client_action_result(
    ctx: &ReducerContext,
    action_kind: u8,
    success: bool,
    error_code: u8,
    message: String,
) {
    let Some(connection_id) = ctx.connection_id() else {
        return;
    };
    let existing = ctx.db.client_action_result().identity().find(ctx.sender());
    let row = ClientActionResult {
        identity: ctx.sender(),
        connection_id,
        request_id: existing
            .as_ref()
            .map_or(1, |result| result.request_id.wrapping_add(1)),
        action_kind,
        success,
        error_code,
        message,
        updated_tick: current_tick(ctx),
    };
    if existing.is_some() {
        ctx.db.client_action_result().identity().update(row);
    } else {
        ctx.db.client_action_result().insert(row);
    }
}

#[allow(clippy::unnecessary_wraps)]
fn commit_action_failure(
    ctx: &ReducerContext,
    action_kind: u8,
    error_code: u8,
    message: String,
) -> Result<(), String> {
    write_client_action_result(ctx, action_kind, false, error_code, message);
    Ok(())
}

fn commit_action_success(ctx: &ReducerContext, action_kind: u8) {
    write_client_action_result(ctx, action_kind, true, 0, String::new());
}

fn update_rate_limit(ctx: &ReducerContext, kind: RateKind) -> Result<(), String> {
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let mut row = ctx
        .db
        .rate_limit()
        .identity()
        .find(ctx.sender())
        .unwrap_or(RateLimit {
            identity: ctx.sender(),
            input_window_micros: now,
            input_count: 0,
            chat_window_micros: now,
            chat_count: 0,
            room_window_micros: now,
            room_count: 0,
            auth_window_micros: now,
            auth_count: 0,
            last_seen_micros: now,
        });
    let (window, count, duration, limit, label) = match kind {
        RateKind::Input => (
            row.input_window_micros,
            row.input_count,
            1_000_000,
            INPUTS_PER_SECOND,
            "input",
        ),
        RateKind::Chat => (
            row.chat_window_micros,
            row.chat_count,
            10_000_000,
            CHAT_PER_TEN_SECONDS,
            "chat",
        ),
        RateKind::Room => (
            row.room_window_micros,
            row.room_count,
            10_000_000,
            ROOM_ACTIONS_PER_TEN_SECONDS,
            "room",
        ),
        RateKind::Auth => (
            row.auth_window_micros,
            row.auth_count,
            60_000_000,
            AUTH_ACTIONS_PER_MINUTE,
            "authentication",
        ),
    };
    let decision = simulation::consume_auth_budget(
        simulation::AuthBudgetState {
            window_started_micros: window,
            attempts: count,
        },
        now,
        duration,
        limit,
    );
    if !decision.allowed {
        return Err(format!("Too many {label} requests. Try again shortly."));
    }
    match kind {
        RateKind::Input => {
            row.input_window_micros = decision.state.window_started_micros;
            row.input_count = decision.state.attempts;
        }
        RateKind::Chat => {
            row.chat_window_micros = decision.state.window_started_micros;
            row.chat_count = decision.state.attempts;
        }
        RateKind::Room => {
            row.room_window_micros = decision.state.window_started_micros;
            row.room_count = decision.state.attempts;
        }
        RateKind::Auth => {
            row.auth_window_micros = decision.state.window_started_micros;
            row.auth_count = decision.state.attempts;
        }
    }
    row.last_seen_micros = now;
    if ctx.db.rate_limit().identity().find(ctx.sender()).is_some() {
        ctx.db.rate_limit().identity().update(row);
    } else {
        ctx.db.rate_limit().insert(row);
    }
    Ok(())
}

fn consume_global_room_budget(ctx: &ReducerContext) -> Result<(), String> {
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let existing = ctx
        .db
        .global_room_budget()
        .id()
        .find(0)
        .unwrap_or(GlobalRoomBudget {
            id: 0,
            window_started_micros: now,
            attempts: 0,
        });
    let decision = simulation::consume_auth_budget(
        simulation::AuthBudgetState {
            window_started_micros: existing.window_started_micros,
            attempts: existing.attempts,
        },
        now,
        AUTH_WINDOW_MICROS,
        GLOBAL_ROOM_CREATIONS_PER_MINUTE,
    );
    let updated = GlobalRoomBudget {
        id: 0,
        window_started_micros: decision.state.window_started_micros,
        attempts: decision.state.attempts,
    };
    if ctx.db.global_room_budget().id().find(0).is_some() {
        ctx.db.global_room_budget().id().update(updated);
    } else {
        ctx.db.global_room_budget().insert(updated);
    }
    if decision.allowed {
        Ok(())
    } else {
        Err(
            "Room creation is temporarily busy. Join an open room or try again shortly."
                .to_string(),
        )
    }
}

fn consume_global_auth_budget(ctx: &ReducerContext) -> simulation::AuthBudgetDecision {
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let existing = ctx
        .db
        .global_auth_budget()
        .id()
        .find(0)
        .unwrap_or(GlobalAuthBudget {
            id: 0,
            window_started_micros: now,
            attempts: 0,
        });
    let decision = simulation::consume_auth_budget(
        simulation::AuthBudgetState {
            window_started_micros: existing.window_started_micros,
            attempts: existing.attempts,
        },
        now,
        AUTH_WINDOW_MICROS,
        GLOBAL_AUTH_ATTEMPTS_PER_MINUTE,
    );
    let updated = GlobalAuthBudget {
        id: 0,
        window_started_micros: decision.state.window_started_micros,
        attempts: decision.state.attempts,
    };
    if ctx.db.global_auth_budget().id().find(0).is_some() {
        ctx.db.global_auth_budget().id().update(updated);
    } else {
        ctx.db.global_auth_budget().insert(updated);
    }
    decision
}

fn account_auth_retry_after(ctx: &ReducerContext, account_id: u64) -> i64 {
    ctx.db
        .account_auth_guard()
        .account_id()
        .find(account_id)
        .map_or(0, |guard| {
            simulation::failed_login_retry_after(
                simulation::FailedLoginState {
                    window_started_micros: guard.window_started_micros,
                    failures: guard.failures,
                    blocked_until_micros: guard.blocked_until_micros,
                },
                ctx.timestamp.to_micros_since_unix_epoch(),
            )
        })
}

fn record_account_auth_failure(ctx: &ReducerContext, account_id: u64) -> i64 {
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let existing = ctx
        .db
        .account_auth_guard()
        .account_id()
        .find(account_id)
        .unwrap_or(AccountAuthGuard {
            account_id,
            window_started_micros: now,
            failures: 0,
            blocked_until_micros: 0,
        });
    let next = simulation::record_failed_login(
        simulation::FailedLoginState {
            window_started_micros: existing.window_started_micros,
            failures: existing.failures,
            blocked_until_micros: existing.blocked_until_micros,
        },
        now,
        AUTH_WINDOW_MICROS,
        ACCOUNT_AUTH_FAILURE_LIMIT,
        ACCOUNT_LOCK_MICROS,
    );
    let updated = AccountAuthGuard {
        account_id,
        window_started_micros: next.window_started_micros,
        failures: next.failures,
        blocked_until_micros: next.blocked_until_micros,
    };
    if ctx
        .db
        .account_auth_guard()
        .account_id()
        .find(account_id)
        .is_some()
    {
        ctx.db.account_auth_guard().account_id().update(updated);
    } else {
        ctx.db.account_auth_guard().insert(updated);
    }
    simulation::failed_login_retry_after(next, now)
}

fn clear_account_auth_failure(ctx: &ReducerContext, account_id: u64) {
    ctx.db.account_auth_guard().account_id().delete(account_id);
}

fn sanitize_nickname(raw: &str) -> Result<String, String> {
    if raw.len() > 64 {
        return Err("Nickname is too long.".to_string());
    }
    let cleaned: String = raw
        .trim()
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | ' ')
        })
        .take(MAX_NICKNAME_CHARS)
        .collect();
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if !(3..=MAX_NICKNAME_CHARS).contains(&collapsed.len()) {
        return Err("Nickname must contain 3 to 16 letters, numbers, spaces, _ or -.".to_string());
    }
    Ok(collapsed)
}

fn sanitize_room_code(raw: &str) -> Result<String, String> {
    if raw.len() > 64 {
        return Err("Room code is too long.".to_string());
    }
    let code: String = raw
        .trim()
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .map(|character| character.to_ascii_uppercase())
        .take(12)
        .collect();
    if !(3..=12).contains(&code.len()) {
        return Err("Room code must contain 3 to 12 letters, numbers, or -.".to_string());
    }
    Ok(code)
}

fn sanitize_chat(raw: &str) -> Result<String, String> {
    if raw.len() > 1024 {
        return Err("Message is too long.".to_string());
    }
    let without_markup: String = raw
        .chars()
        .filter(|character| {
            !character.is_control()
                && !matches!(
                    character,
                    '<'
                        | '>'
                        | '{'
                        | '}'
                        | '\u{00ad}'
                        | '\u{061c}'
                        | '\u{200b}'..='\u{200f}'
                        | '\u{202a}'..='\u{202e}'
                        | '\u{2060}'..='\u{2069}'
                        | '\u{feff}'
                )
        })
        .take(MAX_CHAT_CHARS)
        .collect();
    let cleaned = without_markup
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if cleaned.is_empty() {
        return Err("Message cannot be empty.".to_string());
    }
    Ok(cleaned)
}

fn normalize_account_key(raw: &str) -> String {
    raw.trim().to_ascii_lowercase()
}

fn validate_username(raw: &str) -> Result<(String, String), String> {
    if raw.len() > 64 {
        return Err("Username is too long.".to_string());
    }
    let username = raw.trim();
    if !(3..=20).contains(&username.len())
        || !username
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        return Err("Username must contain 3 to 20 letters, numbers, or _.".to_string());
    }
    Ok((username.to_string(), normalize_account_key(username)))
}

fn validate_email(raw: &str) -> Result<String, String> {
    if raw.len() > 256 {
        return Err("Enter a valid email address.".to_string());
    }
    let key = normalize_account_key(raw);
    let plausible = key.len() <= 120
        && key.split_once('@').is_some_and(|(left, right)| {
            !left.is_empty() && right.contains('.') && !right.ends_with('.')
        });
    if !plausible {
        return Err("Enter a valid email address.".to_string());
    }
    Ok(key)
}

fn validate_password(raw: &str) -> Result<(), String> {
    if !(10..=128).contains(&raw.len())
        || !raw.chars().any(|character| character.is_ascii_alphabetic())
        || !raw.chars().any(|character| character.is_ascii_digit())
    {
        return Err(
            "Password must be 10 to 128 characters and include a letter and a number.".to_string(),
        );
    }
    Ok(())
}

fn password_hash(salt_bytes: &[u8; 16], password: &str) -> Result<String, String> {
    let salt = SaltString::encode_b64(salt_bytes)
        .map_err(|_| "Unable to create a password salt.".to_string())?;
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| "Unable to securely hash the password.".to_string())
}

fn verify_password(encoded_hash: &str, password: &str) -> bool {
    PasswordHash::new(encoded_hash).is_ok_and(|hash| {
        Argon2::default()
            .verify_password(password.as_bytes(), &hash)
            .is_ok()
    })
}

fn weapon_key(player_id: u64, slot: u8) -> u64 {
    (player_id << 3) | u64::from(slot)
}

fn pickup_key(room_id: u64, pickup_index: u16) -> u64 {
    (room_id << 16) | u64::from(pickup_index)
}

fn lag_sample_key(player_id: u64, tick: u64) -> u64 {
    (player_id << 6) | (tick % HISTORY_SAMPLES)
}

fn player_position(player: &Player) -> Vec3 {
    Vec3::new(player.x, player.y, player.z)
}

fn set_player_position(player: &mut Player, position: Vec3) {
    player.x = position.x;
    player.y = position.y;
    player.z = position.z;
}

fn set_player_velocity(player: &mut Player, velocity: Vec3) {
    player.vx = velocity.x;
    player.vy = velocity.y;
    player.vz = velocity.z;
}

fn emit_match_event(
    ctx: &ReducerContext,
    room_id: u64,
    tick: u64,
    kind: u8,
    actor_player_id: u64,
    target_player_id: u64,
    weapon_slot: u8,
    value: u16,
    text: String,
) {
    ctx.db.match_event().insert(MatchEvent {
        id: 0,
        room_id,
        tick,
        kind,
        actor_player_id,
        target_player_id,
        weapon_slot,
        value,
        text,
    });
}

fn spawn_points() -> Vec<Vec3> {
    arena_map::ARENA_SPAWNS
        .iter()
        .map(|spawn| Vec3::new(spawn.position.x, spawn.position.y, spawn.position.z))
        .collect()
}

fn spawn_player(ctx: &ReducerContext, player: &mut Player, tick: u64, seed: u64, protected: bool) {
    let enemies: Vec<Vec3> = ctx
        .db
        .player()
        .room_id()
        .filter(player.room_id)
        .filter(|other| other.id != player.id && other.alive)
        .map(|other| player_position(&other))
        .collect();
    let spawns = spawn_points();
    let index = simulation::select_safest_spawn(&spawns, &enemies, seed);
    let spawn = arena_map::ARENA_SPAWNS[index];
    set_player_position(player, spawns[index]);
    set_player_velocity(player, Vec3::ZERO);
    player.yaw = spawn.yaw;
    player.pitch = 0.0;
    player.health = MAX_HEALTH;
    player.alive = true;
    player.life_id = simulation::next_life_id(player.life_id);
    player.respawn_at_tick = 0;
    player.spawn_protected_until_tick = simulation::spawn_protection_until(
        tick,
        u64::from(arena_map::ARENA_SPAWN_PROTECTION_TICKS),
        protected,
    );
}

fn reset_weapon_loadout(ctx: &ReducerContext, player_id: u64) {
    for slot in [WEAPON_RIFLE, WEAPON_SNIPER, WEAPON_SHOTGUN] {
        let spec = simulation::weapon_spec(slot).expect("known weapon slot");
        let state = WeaponState {
            key: weapon_key(player_id, slot),
            player_id,
            slot,
            magazine_ammo: spec.magazine,
            reserve_ammo: spec.reserve,
            next_fire_tick: 0,
            reload_complete_tick: 0,
            reloading: false,
            shot_counter: 0,
        };
        if ctx.db.weapon_state().key().find(state.key).is_some() {
            ctx.db.weapon_state().key().update(state);
        } else {
            ctx.db.weapon_state().insert(state);
        }
    }
}

fn bot_name(player_id: u64) -> String {
    format!("SYN-{:02}", (player_id % 99) + 1)
}

fn install_bot_brain(ctx: &ReducerContext, player_id: u64, room_id: u64, tick: u64) {
    let brain = BotBrain {
        player_id,
        waypoint_index: (simulation::hash64(player_id ^ room_id) as usize
            % arena_map::ARENA_NAV_WAYPOINTS.len()) as u16,
        target_player_id: 0,
        think_at_tick: tick,
        aim_yaw: 0.0,
        aim_pitch: 0.0,
        stuck_ticks: 0,
        seed: simulation::hash64(player_id ^ room_id.rotate_left(17)),
    };
    if ctx.db.bot_brain().player_id().find(player_id).is_some() {
        ctx.db.bot_brain().player_id().update(brain);
    } else {
        ctx.db.bot_brain().insert(brain);
    }
}

fn new_player_row(
    owner_identity: Identity,
    room_id: u64,
    nickname: String,
    is_bot: bool,
) -> Player {
    Player {
        id: 0,
        room_id,
        owner_identity,
        nickname,
        is_bot,
        connected: true,
        x: 0.0,
        y: 0.0,
        z: 0.0,
        vx: 0.0,
        vy: 0.0,
        vz: 0.0,
        yaw: 0.0,
        pitch: 0.0,
        health: MAX_HEALTH,
        max_health: MAX_HEALTH,
        alive: true,
        life_id: 0,
        spawn_protected_until_tick: 0,
        respawn_at_tick: 0,
        kills: 0,
        deaths: 0,
        selected_weapon: WEAPON_RIFLE,
        last_processed_input_seq: 0,
        last_processed_fire_counter: 0,
        last_processed_reload_counter: 0,
        last_processed_respawn_counter: 0,
    }
}

fn fill_room_with_bots(ctx: &ReducerContext, room_id: u64, tick: u64) {
    let existing = ctx.db.player().room_id().filter(room_id).count();
    for index in existing..usize::from(ROOM_CAPACITY) {
        let mut bot = new_player_row(
            ctx.identity(),
            room_id,
            format!("SYN-{:02}", index + 1),
            true,
        );
        let provisional_seed = room_id ^ index as u64;
        spawn_player(
            ctx,
            &mut bot,
            tick,
            provisional_seed,
            INITIAL_BOTS_SPAWN_PROTECTED,
        );
        let inserted = ctx.db.player().insert(bot);
        reset_weapon_loadout(ctx, inserted.id);
        install_bot_brain(ctx, inserted.id, room_id, tick);
    }
}

fn sync_room_counts(ctx: &ReducerContext, room_id: u64, tick: u64) {
    let Some(mut room) = ctx.db.room().id().find(room_id) else {
        return;
    };
    let mut humans = 0_u8;
    let mut bots = 0_u8;
    for player in ctx.db.player().room_id().filter(room_id) {
        if player.is_bot {
            bots = bots.saturating_add(1);
        } else {
            humans = humans.saturating_add(1);
        }
    }
    room.human_count = humans;
    room.bot_count = bots;
    ctx.db.room().id().update(room);
    if humans > 0 {
        if let Some(mut runtime) = ctx.db.room_runtime().room_id().find(room_id) {
            runtime.last_human_tick = tick;
            ctx.db.room_runtime().room_id().update(runtime);
        }
    }
}

fn generated_room_code(ctx: &ReducerContext, seed: u64) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut value = simulation::hash64(
        seed ^ ctx.timestamp.to_micros_since_unix_epoch() as u64 ^ current_tick(ctx),
    );
    let mut code = String::with_capacity(6);
    for _ in 0..6 {
        code.push(char::from(ALPHABET[value as usize % ALPHABET.len()]));
        value = simulation::hash64(value);
    }
    code
}

fn create_room_internal(
    ctx: &ReducerContext,
    requested_code: Option<String>,
    tick: u64,
) -> Result<Room, String> {
    if ctx.db.room().iter().count() >= MAX_ROOMS {
        return Err("All room capacity is currently in use. Try again shortly.".to_string());
    }
    let code = if let Some(requested) = requested_code {
        let code = sanitize_room_code(&requested)?;
        if ctx.db.room().code().find(code.clone()).is_some() {
            return Err("That room code is already in use.".to_string());
        }
        code
    } else {
        let mut code = generated_room_code(ctx, ctx.timestamp.to_micros_since_unix_epoch() as u64);
        for attempt in 0_u64..16 {
            if ctx.db.room().code().find(code.clone()).is_none() {
                break;
            }
            code = generated_room_code(ctx, attempt + 1);
        }
        if ctx.db.room().code().find(code.clone()).is_some() {
            return Err("Unable to allocate a room code. Try again.".to_string());
        }
        code
    };
    consume_global_room_budget(ctx)?;
    let room = ctx.db.room().insert(Room {
        id: 0,
        code,
        phase: ROOM_PHASE_ACTIVE,
        round: 1,
        created_tick: tick,
        server_tick: tick,
        match_tick: 0,
        intermission_ends_tick: 0,
        winner_player_id: 0,
        human_count: 0,
        bot_count: simulation::bot_slots_for_humans(0),
    });
    ctx.db.room_runtime().insert(RoomRuntime {
        room_id: room.id,
        last_human_tick: tick,
    });
    for (pickup_index, pickup) in arena_map::ARENA_PICKUPS.iter().enumerate() {
        ctx.db.pickup_state().insert(PickupState {
            key: pickup_key(room.id, pickup_index as u16),
            room_id: room.id,
            pickup_index: pickup_index as u16,
            kind: if pickup.kind == "health" { 2 } else { 1 },
            x: pickup.position.x,
            y: pickup.position.y,
            z: pickup.position.z,
            available: true,
            respawn_at_tick: 0,
        });
    }
    fill_room_with_bots(ctx, room.id, tick);
    Ok(ctx.db.room().id().find(room.id).expect("inserted room"))
}

fn reserved_player(ctx: &ReducerContext, player_id: u64, tick: u64) -> bool {
    ctx.db
        .player_session()
        .player_id()
        .find(player_id)
        .is_some_and(|session| session.reconnect_expires_tick >= tick)
}

fn account_for_sender(ctx: &ReducerContext) -> u64 {
    if !account_feature_enabled(ctx) {
        return 0;
    }
    let Some(connection_id) = ctx.connection_id() else {
        return 0;
    };
    let tick = current_tick(ctx);
    ctx.db
        .account_session()
        .identity()
        .find(ctx.sender())
        .filter(|session| {
            session.logged_in
                && session.connection_id == connection_id
                && session.auth_expires_tick >= tick
        })
        .map_or(0, |session| session.account_id)
}

fn claim_room_slot(
    ctx: &ReducerContext,
    room_id: u64,
    nickname: String,
    tick: u64,
) -> Result<(), String> {
    let connection_id = ctx
        .connection_id()
        .ok_or_else(|| "Joining a room requires an active client connection.".to_string())?;
    let room = ctx
        .db
        .room()
        .id()
        .find(room_id)
        .ok_or_else(|| "Room no longer exists.".to_string())?;
    if room.phase != ROOM_PHASE_ACTIVE && room.phase != ROOM_PHASE_INTERMISSION {
        return Err("Room is unavailable.".to_string());
    }

    if let Some(mut old_session) = ctx.db.player_session().identity().find(ctx.sender()) {
        if !simulation::connection_may_claim_session(
            old_session.connection_id.to_u128(),
            connection_id.to_u128(),
            old_session.reconnect_expires_tick,
        ) {
            return Err(
                "This identity is already playing from another active connection.".to_string(),
            );
        }
        if old_session.reconnect_expires_tick == u64::MAX
            && simulation::connection_owns_session(
                old_session.connection_id.to_u128(),
                connection_id.to_u128(),
            )
            && old_session.room_id == room_id
        {
            if let Some(mut player) = ctx.db.player().id().find(old_session.player_id) {
                if !player.is_bot && player.connected {
                    player.nickname = nickname;
                    ctx.db.player().id().update(player);
                    return Ok(());
                }
            }
        }
        if old_session.room_id == room_id && old_session.reconnect_expires_tick >= tick {
            if let Some(mut player) = ctx.db.player().id().find(old_session.player_id) {
                if player.is_bot {
                    player.owner_identity = ctx.sender();
                    player.nickname = nickname;
                    player.is_bot = false;
                    player.connected = true;
                    ctx.db.player().id().update(player);
                    ctx.db.bot_brain().player_id().delete(old_session.player_id);
                    old_session.reconnect_expires_tick = u64::MAX;
                    old_session.connection_id = connection_id;
                    old_session.account_id = account_for_sender(ctx);
                    let player_id = old_session.player_id;
                    ctx.db.player_session().identity().update(old_session);
                    sync_room_counts(ctx, room_id, tick);
                    emit_match_event(
                        ctx,
                        room_id,
                        tick,
                        EVENT_JOIN,
                        player_id,
                        0,
                        0,
                        0,
                        "reconnected".to_string(),
                    );
                    return Ok(());
                }
            }
        }
        if !ctx
            .db
            .player()
            .room_id()
            .filter(room_id)
            .any(|candidate| candidate.is_bot && !reserved_player(ctx, candidate.id, tick))
        {
            return Err("Room is full.".to_string());
        }
        release_session(ctx, &old_session, tick, false);
    }

    let slot = ctx
        .db
        .player()
        .room_id()
        .filter(room_id)
        .find(|candidate| candidate.is_bot && !reserved_player(ctx, candidate.id, tick))
        .ok_or_else(|| "Room is full.".to_string())?;
    let slot_id = slot.id;
    let mut player = slot;
    player.owner_identity = ctx.sender();
    player.nickname = nickname;
    player.is_bot = false;
    player.connected = true;
    player.kills = 0;
    player.deaths = 0;
    player.selected_weapon = WEAPON_RIFLE;
    player.last_processed_input_seq = 0;
    player.last_processed_fire_counter = 0;
    player.last_processed_reload_counter = 0;
    player.last_processed_respawn_counter = 0;
    spawn_player(ctx, &mut player, tick, slot_id ^ tick, true);
    ctx.db.player().id().update(player);
    ctx.db.bot_brain().player_id().delete(slot_id);
    reset_weapon_loadout(ctx, slot_id);
    if ctx.db.player_input().player_id().find(slot_id).is_some() {
        ctx.db.player_input().player_id().delete(slot_id);
    }
    ctx.db.player_session().insert(PlayerSession {
        identity: ctx.sender(),
        connection_id,
        player_id: slot_id,
        room_id,
        reconnect_expires_tick: u64::MAX,
        account_id: account_for_sender(ctx),
    });
    sync_room_counts(ctx, room_id, tick);
    emit_match_event(
        ctx,
        room_id,
        tick,
        EVENT_JOIN,
        slot_id,
        0,
        0,
        0,
        "joined".to_string(),
    );
    Ok(())
}

fn release_session(
    ctx: &ReducerContext,
    session: &PlayerSession,
    tick: u64,
    reserve_for_reconnect: bool,
) {
    let Some(mut player) = ctx.db.player().id().find(session.player_id) else {
        ctx.db.player_session().identity().delete(session.identity);
        return;
    };
    if !player.is_bot {
        player.owner_identity = ctx.identity();
        player.nickname = bot_name(player.id);
        player.is_bot = true;
        player.connected = true;
        ctx.db.player().id().update(player);
        install_bot_brain(ctx, session.player_id, session.room_id, tick);
        emit_match_event(
            ctx,
            session.room_id,
            tick,
            EVENT_LEAVE,
            session.player_id,
            0,
            0,
            0,
            if reserve_for_reconnect {
                "connection lost".to_string()
            } else {
                "left".to_string()
            },
        );
    }
    if ctx
        .db
        .player_input()
        .player_id()
        .find(session.player_id)
        .is_some()
    {
        ctx.db.player_input().player_id().delete(session.player_id);
    }
    if reserve_for_reconnect {
        let mut retained = PlayerSession {
            identity: session.identity,
            connection_id: session.connection_id,
            player_id: session.player_id,
            room_id: session.room_id,
            reconnect_expires_tick: tick + RECONNECT_GRACE_TICKS,
            account_id: session.account_id,
        };
        if retained.reconnect_expires_tick < tick {
            retained.reconnect_expires_tick = u64::MAX;
        }
        ctx.db.player_session().identity().update(retained);
    } else {
        ctx.db.player_session().identity().delete(session.identity);
    }
    sync_room_counts(ctx, session.room_id, tick);
}

#[reducer(init)]
pub fn init(ctx: &ReducerContext) {
    ctx.db.server_config().insert(ServerConfig {
        id: 0,
        tick_rate: TICK_RATE,
        room_capacity: ROOM_CAPACITY,
        score_limit: SCORE_LIMIT,
        match_duration_ticks: MATCH_DURATION_TICKS,
        intermission_ticks: INTERMISSION_TICKS,
        reconnect_grace_ticks: RECONNECT_GRACE_TICKS,
        lag_compensation_ticks: MAX_LAG_COMPENSATION_TICKS,
        map_version: arena_map::ARENA_MAP_CONTENT_HASH.to_string(),
        accounts_enabled: PASSWORD_ACCOUNTS_ENABLED,
    });
    ctx.db
        .simulation_clock()
        .insert(SimulationClock { id: 0, tick: 0 });
    ctx.db.global_auth_budget().insert(GlobalAuthBudget {
        id: 0,
        window_started_micros: ctx.timestamp.to_micros_since_unix_epoch(),
        attempts: 0,
    });
    ctx.db.global_room_budget().insert(GlobalRoomBudget {
        id: 0,
        window_started_micros: ctx.timestamp.to_micros_since_unix_epoch(),
        attempts: 0,
    });
    ctx.db.sim_tick_schedule().insert(SimTickSchedule {
        scheduled_id: 0,
        scheduled_at: TimeDuration::from_micros(16_667).into(),
    });
}

#[reducer(client_connected)]
pub fn client_connected(_ctx: &ReducerContext) {}

#[reducer(client_disconnected)]
pub fn client_disconnected(ctx: &ReducerContext) {
    if let Some(session) = ctx.db.player_session().identity().find(ctx.sender()) {
        if ctx.connection_id().is_some_and(|connection_id| {
            simulation::connection_owns_session(
                session.connection_id.to_u128(),
                connection_id.to_u128(),
            )
        }) {
            release_session(ctx, &session, current_tick(ctx), true);
        }
    }
    if ctx
        .db
        .account_session()
        .identity()
        .find(ctx.sender())
        .is_some_and(|session| {
            ctx.connection_id()
                .is_some_and(|connection_id| connection_id == session.connection_id)
        })
    {
        ctx.db.account_session().identity().delete(ctx.sender());
    }
    if ctx
        .db
        .client_action_result()
        .identity()
        .find(ctx.sender())
        .is_some_and(|result| {
            ctx.connection_id()
                .is_some_and(|connection_id| connection_id == result.connection_id)
        })
    {
        ctx.db
            .client_action_result()
            .identity()
            .delete(ctx.sender());
    }
}

#[reducer]
pub fn quick_play(ctx: &ReducerContext, nickname: String) -> Result<(), String> {
    update_rate_limit(ctx, RateKind::Room)?;
    let nickname = match sanitize_nickname(&nickname) {
        Ok(nickname) => nickname,
        Err(error) => return commit_action_failure(ctx, ACTION_ROOM, 1, error),
    };
    if let Err(error) = preflight_room_claim(ctx) {
        return commit_action_failure(ctx, ACTION_ROOM, 2, error);
    }
    let tick = current_tick(ctx);
    let selected = ctx
        .db
        .room()
        .iter()
        .filter(|candidate| {
            candidate.phase == ROOM_PHASE_ACTIVE && candidate.human_count < ROOM_CAPACITY
        })
        .max_by_key(|candidate| (candidate.human_count, candidate.created_tick))
        .map(|candidate| candidate.id);
    let room_id = match selected {
        Some(id) => id,
        None => match create_room_internal(ctx, None, tick) {
            Ok(room) => room.id,
            Err(error) => return commit_action_failure(ctx, ACTION_ROOM, 2, error),
        },
    };
    if let Err(error) = claim_room_slot(ctx, room_id, nickname, tick) {
        return commit_action_failure(ctx, ACTION_ROOM, 2, error);
    }
    mutate_sender_stats(ctx, |stats| {
        stats.times_played = stats.times_played.saturating_add(1);
        stats.rooms_joined = stats.rooms_joined.saturating_add(1);
        stats.matches_started = stats.matches_started.saturating_add(1);
        stats.last_seen_tick = tick;
    });
    commit_action_success(ctx, ACTION_ROOM);
    Ok(())
}

#[reducer]
pub fn create_room(
    ctx: &ReducerContext,
    nickname: String,
    requested_code: String,
) -> Result<(), String> {
    update_rate_limit(ctx, RateKind::Room)?;
    let nickname = match sanitize_nickname(&nickname) {
        Ok(nickname) => nickname,
        Err(error) => return commit_action_failure(ctx, ACTION_ROOM, 1, error),
    };
    if requested_code.len() > 64 {
        return commit_action_failure(ctx, ACTION_ROOM, 1, "Room code is too long.".to_string());
    }
    if let Err(error) = preflight_room_claim(ctx) {
        return commit_action_failure(ctx, ACTION_ROOM, 2, error);
    }
    let tick = current_tick(ctx);
    let request = if requested_code.trim().is_empty() {
        None
    } else {
        Some(requested_code)
    };
    let room_id = match create_room_internal(ctx, request, tick) {
        Ok(room) => room.id,
        Err(error) => return commit_action_failure(ctx, ACTION_ROOM, 2, error),
    };
    if let Err(error) = claim_room_slot(ctx, room_id, nickname, tick) {
        return commit_action_failure(ctx, ACTION_ROOM, 2, error);
    }
    mutate_sender_stats(ctx, |stats| {
        stats.times_played = stats.times_played.saturating_add(1);
        stats.rooms_created = stats.rooms_created.saturating_add(1);
        stats.rooms_joined = stats.rooms_joined.saturating_add(1);
        stats.matches_started = stats.matches_started.saturating_add(1);
        stats.last_seen_tick = tick;
    });
    commit_action_success(ctx, ACTION_ROOM);
    Ok(())
}

#[reducer]
pub fn join_room(ctx: &ReducerContext, nickname: String, room_code: String) -> Result<(), String> {
    update_rate_limit(ctx, RateKind::Room)?;
    let nickname = match sanitize_nickname(&nickname) {
        Ok(nickname) => nickname,
        Err(error) => return commit_action_failure(ctx, ACTION_ROOM, 1, error),
    };
    let room_code = match sanitize_room_code(&room_code) {
        Ok(room_code) => room_code,
        Err(error) => return commit_action_failure(ctx, ACTION_ROOM, 1, error),
    };
    let Some(room) = ctx.db.room().code().find(room_code) else {
        return commit_action_failure(ctx, ACTION_ROOM, 2, "Room not found.".to_string());
    };
    let tick = current_tick(ctx);
    if let Err(error) = claim_room_slot(ctx, room.id, nickname, tick) {
        return commit_action_failure(ctx, ACTION_ROOM, 2, error);
    }
    mutate_sender_stats(ctx, |stats| {
        stats.times_played = stats.times_played.saturating_add(1);
        stats.rooms_joined = stats.rooms_joined.saturating_add(1);
        stats.matches_started = stats.matches_started.saturating_add(1);
        stats.last_seen_tick = tick;
    });
    commit_action_success(ctx, ACTION_ROOM);
    Ok(())
}

#[reducer]
pub fn leave_room(ctx: &ReducerContext) -> Result<(), String> {
    update_rate_limit(ctx, RateKind::Room)?;
    let session = match current_player_for_sender(ctx) {
        Ok((session, _)) => session,
        Err(error) => return commit_action_failure(ctx, ACTION_ROOM, 3, error),
    };
    release_session(ctx, &session, current_tick(ctx), false);
    commit_action_success(ctx, ACTION_ROOM);
    Ok(())
}

#[reducer]
#[allow(clippy::too_many_arguments)]
pub fn submit_input(
    ctx: &ReducerContext,
    seq: u32,
    client_tick: u64,
    move_x: f32,
    move_z: f32,
    yaw: f32,
    pitch: f32,
    buttons: u16,
    desired_weapon: u8,
    fire_counter: u32,
    reload_counter: u32,
    respawn_counter: u32,
) -> Result<(), String> {
    update_rate_limit(ctx, RateKind::Input)?;
    let player = match current_player_for_sender(ctx) {
        Ok((_, player)) => player,
        Err(error) => return commit_action_failure(ctx, ACTION_INPUT, 3, error),
    };
    if !move_x.is_finite()
        || !move_z.is_finite()
        || !yaw.is_finite()
        || !pitch.is_finite()
        || buttons & !ALLOWED_BUTTONS != 0
        || simulation::weapon_spec(desired_weapon).is_none()
    {
        return commit_action_failure(ctx, ACTION_INPUT, 1, "Malformed player input.".to_string());
    }
    let existing = ctx.db.player_input().player_id().find(player.id);
    if let Some(previous) = &existing {
        if !simulation::is_newer_u32(seq, previous.seq) {
            return Ok(());
        }
    }
    for (candidate, acknowledged) in [
        (fire_counter, player.last_processed_fire_counter),
        (reload_counter, player.last_processed_reload_counter),
        (respawn_counter, player.last_processed_respawn_counter),
    ] {
        if !simulation::action_counter_within_window(candidate, acknowledged) {
            return commit_action_failure(
                ctx,
                ACTION_INPUT,
                2,
                "Action counter advanced beyond the accepted resend window.".to_string(),
            );
        }
    }
    let input = PlayerInput {
        player_id: player.id,
        seq,
        client_tick,
        move_x: move_x.clamp(-1.0, 1.0),
        move_z: move_z.clamp(-1.0, 1.0),
        yaw: simulation::normalize_yaw(yaw),
        pitch: simulation::sanitize_pitch(pitch),
        buttons,
        desired_weapon,
        fire_counter,
        reload_counter,
        respawn_counter,
        received_tick: current_tick(ctx),
    };
    if existing.is_some() {
        ctx.db.player_input().player_id().update(input);
    } else {
        ctx.db.player_input().insert(input);
    }
    Ok(())
}

#[reducer]
pub fn send_chat_message(ctx: &ReducerContext, message: String) -> Result<(), String> {
    update_rate_limit(ctx, RateKind::Chat)?;
    let (session, player) = match current_player_for_sender(ctx) {
        Ok(current) => current,
        Err(error) => return commit_action_failure(ctx, ACTION_CHAT, 3, error),
    };
    let message = match sanitize_chat(&message) {
        Ok(message) => message,
        Err(error) => return commit_action_failure(ctx, ACTION_CHAT, 1, error),
    };
    let player_id = player.id;
    let player_is_bot = player.is_bot;
    ctx.db.chat_event().insert(ChatEvent {
        id: 0,
        room_id: session.room_id,
        tick: current_tick(ctx),
        player_id,
        nickname: player.nickname,
        message,
    });
    let tick = current_tick(ctx);
    mutate_account_stats(ctx, player_id, player_is_bot, |stats| {
        stats.chat_messages = stats.chat_messages.saturating_add(1);
        stats.last_seen_tick = tick;
    });
    commit_action_success(ctx, ACTION_CHAT);
    Ok(())
}

fn write_auth_result(
    ctx: &ReducerContext,
    account_id: u64,
    username: String,
    logged_in: bool,
    auth_error_code: u8,
    retry_after_micros: i64,
) -> Result<(), String> {
    let connection_id = ctx
        .connection_id()
        .ok_or_else(|| "Authentication requires an active client connection.".to_string())?;
    let existing = ctx.db.account_session().identity().find(ctx.sender());
    let globally_disabled = !logged_in && auth_error_code == AUTH_ERROR_DISABLED;
    if existing.as_ref().is_some_and(|session| {
        session.logged_in
            && session.connection_id != connection_id
            && session.auth_expires_tick >= current_tick(ctx)
    }) && !globally_disabled
    {
        // A second connection using the same Spacetime identity cannot displace the owner.
        return Ok(());
    }
    let auth_request_id = existing
        .as_ref()
        .map_or(1, |session| session.auth_request_id.wrapping_add(1));
    let session = AccountSession {
        identity: ctx.sender(),
        connection_id,
        account_id: if logged_in { account_id } else { 0 },
        username: if logged_in { username } else { String::new() },
        logged_in,
        auth_request_id,
        auth_error_code,
        retry_after_micros,
        auth_expires_tick: if logged_in {
            current_tick(ctx).saturating_add(AUTH_SESSION_TICKS)
        } else {
            0
        },
    };
    if existing.is_some() {
        ctx.db.account_session().identity().update(session);
    } else {
        ctx.db.account_session().insert(session);
    }
    if let Some(mut player_session) = ctx.db.player_session().identity().find(ctx.sender()) {
        if globally_disabled || player_session.connection_id == connection_id {
            player_session.account_id = if logged_in { account_id } else { 0 };
            ctx.db.player_session().identity().update(player_session);
        }
    }
    if logged_in {
        if let Some(mut stats) = ctx.db.account_stats().account_id().find(account_id) {
            stats.last_seen_tick = current_tick(ctx);
            ctx.db.account_stats().account_id().update(stats);
        }
    }
    Ok(())
}

fn write_auth_failure(
    ctx: &ReducerContext,
    auth_error_code: u8,
    retry_after_micros: i64,
) -> Result<(), String> {
    write_auth_result(
        ctx,
        0,
        String::new(),
        false,
        auth_error_code,
        retry_after_micros,
    )
}

fn commit_auth_disabled_if_needed(ctx: &ReducerContext) -> Result<bool, String> {
    if account_feature_enabled(ctx) {
        return Ok(false);
    }
    write_auth_failure(ctx, AUTH_ERROR_DISABLED, 0)?;
    Ok(true)
}

fn clear_auth_session(ctx: &ReducerContext) -> Result<(), String> {
    let connection_id = ctx
        .connection_id()
        .ok_or_else(|| "Logout requires an active client connection.".to_string())?;
    if ctx
        .db
        .account_session()
        .identity()
        .find(ctx.sender())
        .is_some_and(|session| session.connection_id == connection_id)
    {
        ctx.db.account_session().identity().delete(ctx.sender());
    }
    if let Some(mut player_session) = ctx.db.player_session().identity().find(ctx.sender()) {
        if player_session.connection_id == connection_id {
            player_session.account_id = 0;
            ctx.db.player_session().identity().update(player_session);
        }
    }
    Ok(())
}

#[reducer]
pub fn register_account(
    ctx: &ReducerContext,
    username: String,
    email: String,
    password: String,
) -> Result<(), String> {
    update_rate_limit(ctx, RateKind::Auth)?;
    if commit_auth_disabled_if_needed(ctx)? {
        return Ok(());
    }
    let global = consume_global_auth_budget(ctx);
    if !global.allowed {
        write_auth_failure(ctx, AUTH_ERROR_THROTTLED, global.retry_after_micros)?;
        return Ok(());
    }
    let Ok((username, username_key)) = validate_username(&username) else {
        write_auth_failure(ctx, AUTH_ERROR_INVALID, 0)?;
        return Ok(());
    };
    let Ok(email_key) = validate_email(&email) else {
        write_auth_failure(ctx, AUTH_ERROR_INVALID, 0)?;
        return Ok(());
    };
    if validate_password(&password).is_err() {
        write_auth_failure(ctx, AUTH_ERROR_INVALID, 0)?;
        return Ok(());
    }
    let mut salt_bytes = [0_u8; 16];
    salt_bytes[..8].copy_from_slice(&ctx.random::<u64>().to_le_bytes());
    salt_bytes[8..].copy_from_slice(&ctx.random::<u64>().to_le_bytes());
    let password_hash = password_hash(&salt_bytes, &password)?;
    if ctx
        .db
        .account()
        .username_key()
        .find(username_key.clone())
        .is_some()
        || ctx
            .db
            .account()
            .email_key()
            .find(email_key.clone())
            .is_some()
    {
        write_auth_failure(ctx, AUTH_ERROR_INVALID, 0)?;
        return Ok(());
    }
    let account = ctx.db.account().insert(Account {
        account_id: 0,
        username_key,
        email_key,
        username: username.clone(),
        password_hash,
    });
    ctx.db.account_stats().insert(AccountStats {
        account_id: account.account_id,
        username: username.clone(),
        times_played: 0,
        total_play_time_ticks: 0,
        total_lobby_time_ticks: 0,
        eliminations: 0,
        kills: 0,
        deaths: 0,
        matches_played: 0,
        wins: 0,
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
        best_streak: 0,
        last_seen_tick: current_tick(ctx),
    });
    write_auth_result(ctx, account.account_id, username, true, AUTH_ERROR_NONE, 0)?;
    Ok(())
}

#[reducer]
pub fn login_account(
    ctx: &ReducerContext,
    username_or_email: String,
    password: String,
) -> Result<(), String> {
    update_rate_limit(ctx, RateKind::Auth)?;
    if commit_auth_disabled_if_needed(ctx)? {
        return Ok(());
    }
    let global = consume_global_auth_budget(ctx);
    if !global.allowed {
        write_auth_failure(ctx, AUTH_ERROR_THROTTLED, global.retry_after_micros)?;
        return Ok(());
    }
    if username_or_email.len() > 256 || password.len() > 128 {
        write_auth_failure(ctx, AUTH_ERROR_INVALID, 0)?;
        return Ok(());
    }
    let key = normalize_account_key(&username_or_email);
    let found = if key.contains('@') {
        ctx.db.account().email_key().find(key)
    } else {
        ctx.db.account().username_key().find(key)
    };
    let Some(account) = found else {
        let _ = password_hash(&[0x42; 16], &password);
        write_auth_failure(ctx, AUTH_ERROR_INVALID, 0)?;
        return Ok(());
    };
    if account_auth_retry_after(ctx, account.account_id) > 0 {
        write_auth_failure(ctx, AUTH_ERROR_INVALID, 0)?;
        return Ok(());
    }
    if !verify_password(&account.password_hash, &password) {
        let _ = record_account_auth_failure(ctx, account.account_id);
        write_auth_failure(ctx, AUTH_ERROR_INVALID, 0)?;
        return Ok(());
    }
    clear_account_auth_failure(ctx, account.account_id);
    write_auth_result(
        ctx,
        account.account_id,
        account.username,
        true,
        AUTH_ERROR_NONE,
        0,
    )?;
    Ok(())
}

#[reducer]
pub fn logout_account(ctx: &ReducerContext) -> Result<(), String> {
    update_rate_limit(ctx, RateKind::Auth)?;
    if commit_auth_disabled_if_needed(ctx)? {
        return Ok(());
    }
    clear_auth_session(ctx)
}

#[reducer]
pub fn request_stats_refresh(ctx: &ReducerContext) -> Result<(), String> {
    update_rate_limit(ctx, RateKind::Auth)?;
    if commit_auth_disabled_if_needed(ctx)? {
        return Ok(());
    }
    let session = ctx
        .db
        .account_session()
        .identity()
        .find(ctx.sender())
        .filter(|session| {
            session.logged_in
                && ctx
                    .connection_id()
                    .is_some_and(|connection_id| connection_id == session.connection_id)
                && session.auth_expires_tick >= current_tick(ctx)
        })
        .ok_or_else(|| "Sign in to view persistent statistics.".to_string())?;
    if ctx
        .db
        .account_stats()
        .account_id()
        .find(session.account_id)
        .is_none()
    {
        return Err("Account statistics are unavailable.".to_string());
    }
    Ok(())
}

fn world_solids() -> Vec<simulation::SolidAabb> {
    arena_map::ARENA_AABBS
        .iter()
        .map(|solid| {
            let center = Vec3::new(solid.center.x, solid.center.y, solid.center.z);
            let half = Vec3::new(
                solid.half_extents.x,
                solid.half_extents.y,
                solid.half_extents.z,
            );
            simulation::SolidAabb {
                min: center - half,
                max: center + half,
            }
        })
        .collect()
}

fn world_ramps() -> Vec<simulation::RampSurface> {
    arena_map::ARENA_RAMPS
        .iter()
        .map(|ramp| simulation::RampSurface {
            min_x: ramp.min_x,
            max_x: ramp.max_x,
            min_z: ramp.min_z,
            max_z: ramp.max_z,
            base_y: ramp.base_y,
            top_y: ramp.top_y,
            axis: u8::from(ramp.axis != "x"),
            ascending_positive: ramp.ascending_positive,
        })
        .collect()
}

fn world_bounds() -> simulation::WorldBounds {
    simulation::WorldBounds {
        min_x: arena_map::ARENA_PLAYABLE_MIN.x,
        max_x: arena_map::ARENA_PLAYABLE_MAX.x,
        min_z: arena_map::ARENA_PLAYABLE_MIN.z,
        max_z: arena_map::ARENA_PLAYABLE_MAX.z,
    }
}

fn mutate_account_stats(
    ctx: &ReducerContext,
    player_id: u64,
    is_bot: bool,
    mutate: impl FnOnce(&mut AccountStats),
) {
    if is_bot || !account_feature_enabled(ctx) {
        return;
    }
    let Some(session) = ctx
        .db
        .player_session()
        .player_id()
        .find(player_id)
        .filter(|session| session.account_id != 0)
    else {
        return;
    };
    let authenticated = ctx
        .db
        .account_session()
        .identity()
        .find(session.identity)
        .is_some_and(|account_session| {
            account_session.logged_in
                && account_session.account_id == session.account_id
                && account_session.connection_id == session.connection_id
                && account_session.auth_expires_tick >= current_tick(ctx)
        });
    if !authenticated {
        return;
    }
    let Some(mut stats) = ctx.db.account_stats().account_id().find(session.account_id) else {
        return;
    };
    mutate(&mut stats);
    ctx.db.account_stats().account_id().update(stats);
}

fn mutate_sender_stats(ctx: &ReducerContext, mutate: impl FnOnce(&mut AccountStats)) {
    let Some(session) = ctx.db.player_session().identity().find(ctx.sender()) else {
        return;
    };
    mutate_account_stats(ctx, session.player_id, false, mutate);
}

fn record_lag_sample(ctx: &ReducerContext, player: &Player, tick: u64) {
    let sample = LagSample {
        key: lag_sample_key(player.id, tick),
        player_id: player.id,
        server_tick: tick,
        x: player.x,
        y: player.y,
        z: player.z,
    };
    if ctx.db.lag_sample().key().find(sample.key).is_some() {
        ctx.db.lag_sample().key().update(sample);
    } else {
        ctx.db.lag_sample().insert(sample);
    }
}

fn historical_position(
    ctx: &ReducerContext,
    player: &Player,
    claimed_tick: u64,
    server_tick: u64,
) -> Vec3 {
    let bounded_tick = simulation::clamp_claimed_tick(claimed_tick, server_tick);
    ctx.db
        .lag_sample()
        .player_id()
        .filter(player.id)
        .filter(|sample| sample.server_tick <= bounded_tick)
        .max_by_key(|sample| sample.server_tick)
        .map_or_else(
            || player_position(player),
            |sample| Vec3::new(sample.x, sample.y, sample.z),
        )
}

fn finish_reloads(ctx: &ReducerContext, player_id: u64, tick: u64) {
    let states: Vec<WeaponState> = ctx
        .db
        .weapon_state()
        .player_id()
        .filter(player_id)
        .collect();
    for mut state in states {
        if !state.reloading || tick < state.reload_complete_tick {
            continue;
        }
        let spec = simulation::weapon_spec(state.slot).expect("stored weapon slot");
        let transfer = simulation::reload_transfer(spec, state.magazine_ammo, state.reserve_ammo);
        state.magazine_ammo = transfer.magazine_ammo;
        state.reserve_ammo = transfer.reserve_ammo;
        state.reloading = false;
        state.reload_complete_tick = 0;
        ctx.db.weapon_state().key().update(state);
    }
}

fn start_reload(ctx: &ReducerContext, player: &Player, tick: u64) -> bool {
    let key = weapon_key(player.id, player.selected_weapon);
    let Some(mut weapon) = ctx.db.weapon_state().key().find(key) else {
        return false;
    };
    let spec = simulation::weapon_spec(weapon.slot).expect("stored weapon slot");
    if !simulation::can_start_reload(
        spec,
        weapon.magazine_ammo,
        weapon.reserve_ammo,
        weapon.reloading,
    ) || !player.alive
    {
        return false;
    }
    weapon.reloading = true;
    weapon.reload_complete_tick = tick + spec.reload_ticks;
    ctx.db.weapon_state().key().update(weapon);
    emit_match_event(
        ctx,
        player.room_id,
        tick,
        EVENT_RELOAD,
        player.id,
        0,
        player.selected_weapon,
        0,
        "reload".to_string(),
    );
    true
}

fn apply_damage(
    ctx: &ReducerContext,
    shooter: &mut Player,
    target_id: u64,
    damage: u16,
    weapon_slot: u8,
    tick: u64,
) -> u16 {
    let Some(mut target) = ctx.db.player().id().find(target_id) else {
        return 0;
    };
    if !target.alive
        || tick < target.spawn_protected_until_tick
        || target.room_id != shooter.room_id
    {
        return 0;
    }
    let (remaining_health, applied, killed) =
        simulation::apply_health_damage(target.health, damage);
    target.health = remaining_health;
    if killed {
        target.alive = false;
        target.deaths = target.deaths.saturating_add(1);
        target.respawn_at_tick = tick + RESPAWN_DELAY_TICKS;
        target.spawn_protected_until_tick = 0;
        set_player_velocity(&mut target, Vec3::ZERO);
        shooter.kills = shooter.kills.saturating_add(1);
        mutate_account_stats(ctx, target.id, target.is_bot, |stats| {
            stats.deaths = stats.deaths.saturating_add(1);
            stats.damage_taken = stats.damage_taken.saturating_add(u64::from(applied));
            stats.last_seen_tick = tick;
        });
        let shooter_kills = shooter.kills;
        mutate_account_stats(ctx, shooter.id, shooter.is_bot, |stats| {
            stats.eliminations = stats.eliminations.saturating_add(1);
            stats.kills = stats.kills.saturating_add(1);
            stats.best_streak = stats.best_streak.max(shooter_kills);
            stats.last_seen_tick = tick;
        });
        emit_match_event(
            ctx,
            shooter.room_id,
            tick,
            EVENT_KILL,
            shooter.id,
            target.id,
            weapon_slot,
            applied,
            format!("{} eliminated {}", shooter.nickname, target.nickname),
        );
    } else {
        mutate_account_stats(ctx, target.id, target.is_bot, |stats| {
            stats.damage_taken = stats.damage_taken.saturating_add(u64::from(applied));
            stats.last_seen_tick = tick;
        });
        emit_match_event(
            ctx,
            shooter.room_id,
            tick,
            EVENT_HIT,
            shooter.id,
            target.id,
            weapon_slot,
            applied,
            "hit".to_string(),
        );
    }
    ctx.db.player().id().update(target);
    applied
}

fn try_fire_weapon(
    ctx: &ReducerContext,
    shooter: &mut Player,
    tick: u64,
    claimed_tick: u64,
    scoped: bool,
    solids: &[simulation::SolidAabb],
) -> bool {
    if !shooter.alive {
        return false;
    }
    let key = weapon_key(shooter.id, shooter.selected_weapon);
    let Some(mut weapon) = ctx.db.weapon_state().key().find(key) else {
        return false;
    };
    if !simulation::can_fire_weapon(
        weapon.magazine_ammo,
        weapon.reloading,
        weapon.next_fire_tick,
        tick,
    ) {
        if weapon.magazine_ammo == 0 && !weapon.reloading {
            let _ = start_reload(ctx, shooter, tick);
        }
        return false;
    }
    let spec = simulation::weapon_spec(weapon.slot).expect("stored weapon slot");
    weapon.magazine_ammo = weapon.magazine_ammo.saturating_sub(1);
    weapon.next_fire_tick = tick + spec.fire_interval_ticks;
    weapon.shot_counter = weapon.shot_counter.wrapping_add(1);
    let shot_counter = weapon.shot_counter;
    ctx.db.weapon_state().key().update(weapon);
    shooter.spawn_protected_until_tick = tick;
    mutate_account_stats(ctx, shooter.id, shooter.is_bot, |stats| {
        stats.shots_fired = stats.shots_fired.saturating_add(1);
        stats.last_seen_tick = tick;
    });
    emit_match_event(
        ctx,
        shooter.room_id,
        tick,
        EVENT_FIRE,
        shooter.id,
        0,
        shooter.selected_weapon,
        0,
        "fire".to_string(),
    );

    let origin = player_position(shooter) + Vec3::new(0.0, PLAYER_EYE_HEIGHT, 0.0);
    let base_direction = simulation::view_direction(shooter.yaw, shooter.pitch);
    let spread = if scoped {
        spec.scoped_spread_radians
    } else {
        spec.hip_spread_radians
    };
    let targets: Vec<Player> = ctx
        .db
        .player()
        .room_id()
        .filter(shooter.room_id)
        .filter(|target| {
            target.id != shooter.id && target.alive && tick >= target.spawn_protected_until_tick
        })
        .collect();
    let mut accumulated: Vec<(u64, u16)> = Vec::new();
    for pellet in 0..spec.pellets {
        let seed = simulation::hash64(
            shooter.id
                ^ tick.rotate_left(11)
                ^ u64::from(shot_counter).rotate_left(27)
                ^ u64::from(pellet).rotate_left(43),
        );
        let direction = simulation::spread_direction(base_direction, spread, seed);
        let wall_distance =
            simulation::nearest_wall_distance(origin, direction, spec.range, solids);
        let mut closest: Option<(u64, f32)> = None;
        for target in &targets {
            let position = historical_position(ctx, target, claimed_tick, tick);
            let Some(distance) = simulation::ray_player_distance(origin, direction, position)
            else {
                continue;
            };
            if distance > spec.range || distance >= wall_distance {
                continue;
            }
            if closest.is_none_or(|(_, best)| distance < best) {
                closest = Some((target.id, distance));
            }
        }
        if let Some((target_id, distance)) = closest {
            let damage = simulation::falloff_damage(spec, distance);
            if let Some((_, accumulated_damage)) = accumulated
                .iter_mut()
                .find(|(existing_id, _)| *existing_id == target_id)
            {
                *accumulated_damage = accumulated_damage.saturating_add(damage);
            } else {
                accumulated.push((target_id, damage));
            }
        }
    }

    let mut total_damage = 0_u64;
    let mut hit = false;
    for (target_id, damage) in accumulated {
        let applied = apply_damage(
            ctx,
            shooter,
            target_id,
            damage,
            shooter.selected_weapon,
            tick,
        );
        if applied > 0 {
            hit = true;
            total_damage = total_damage.saturating_add(u64::from(applied));
        }
    }
    if hit {
        mutate_account_stats(ctx, shooter.id, shooter.is_bot, |stats| {
            stats.shots_hit = stats.shots_hit.saturating_add(1);
            stats.damage_dealt = stats.damage_dealt.saturating_add(total_damage);
        });
    }
    true
}

fn respawn(ctx: &ReducerContext, player: &mut Player, tick: u64) {
    spawn_player(ctx, player, tick, player.id ^ tick.rotate_left(13), true);
    reset_weapon_loadout(ctx, player.id);
    mutate_account_stats(ctx, player.id, player.is_bot, |stats| {
        stats.respawns = stats.respawns.saturating_add(1);
        stats.last_seen_tick = tick;
    });
    emit_match_event(
        ctx,
        player.room_id,
        tick,
        EVENT_RESPAWN,
        player.id,
        0,
        player.selected_weapon,
        0,
        "respawn".to_string(),
    );
}

fn eliminate_from_world(ctx: &ReducerContext, player: &mut Player, tick: u64) {
    if !player.alive {
        return;
    }
    player.health = 0;
    player.alive = false;
    player.deaths = player.deaths.saturating_add(1);
    player.respawn_at_tick = tick + RESPAWN_DELAY_TICKS;
    set_player_velocity(player, Vec3::ZERO);
    mutate_account_stats(ctx, player.id, player.is_bot, |stats| {
        stats.deaths = stats.deaths.saturating_add(1);
    });
    emit_match_event(
        ctx,
        player.room_id,
        tick,
        EVENT_KILL,
        0,
        player.id,
        0,
        0,
        format!("{} fell out of the arena", player.nickname),
    );
}

fn simulate_human_player(
    ctx: &ReducerContext,
    mut player: Player,
    room_active: bool,
    tick: u64,
    solids: &[simulation::SolidAabb],
    ramps: &[simulation::RampSurface],
    bounds: simulation::WorldBounds,
) {
    finish_reloads(ctx, player.id, tick);
    if !player.alive {
        if simulation::respawn_is_due(player.alive, player.respawn_at_tick, tick) && room_active {
            respawn(ctx, &mut player, tick);
        }
        ctx.db.player().id().update(player);
        return;
    }
    if !room_active {
        set_player_velocity(&mut player, Vec3::ZERO);
        ctx.db.player().id().update(player);
        return;
    }

    let input = ctx.db.player_input().player_id().find(player.id);
    let mut move_x = 0.0;
    let mut move_z = 0.0;
    let mut jump = false;
    let mut sprint = false;
    if let Some(input) = &input {
        player.last_processed_input_seq = input.seq;
        player.yaw = input.yaw;
        player.pitch = input.pitch;
        player.selected_weapon = input.desired_weapon;
        let fresh = tick.saturating_sub(input.received_tick) <= u64::from(TICK_RATE) / 2;
        if fresh {
            (move_x, move_z) = simulation::input_axes(input.buttons, input.move_x, input.move_z);
            jump = input.buttons & BUTTON_JUMP != 0;
            sprint = input.buttons & BUTTON_SPRINT != 0;
        }
    }
    let motion = simulation::integrate_motion(
        player_position(&player),
        Vec3::new(player.vx, player.vy, player.vz),
        move_x,
        move_z,
        player.yaw,
        jump,
        sprint,
        bounds,
        solids,
        ramps,
    );
    set_player_position(&mut player, motion.position);
    set_player_velocity(&mut player, motion.velocity);
    if player.y < arena_map::ARENA_KILL_Y {
        eliminate_from_world(ctx, &mut player, tick);
        ctx.db.player().id().update(player);
        return;
    }

    if let Some(input) = input {
        if simulation::is_newer_u32(input.reload_counter, player.last_processed_reload_counter) {
            player.last_processed_reload_counter =
                player.last_processed_reload_counter.wrapping_add(1);
            let _ = start_reload(ctx, &player, tick);
        }
        if simulation::is_newer_u32(input.respawn_counter, player.last_processed_respawn_counter) {
            player.last_processed_respawn_counter =
                player.last_processed_respawn_counter.wrapping_add(1);
        }
        let edge_pending =
            simulation::is_newer_u32(input.fire_counter, player.last_processed_fire_counter);
        let held = input.buttons & BUTTON_FIRE_HELD != 0
            && player.selected_weapon == WEAPON_RIFLE
            && tick.saturating_sub(input.received_tick) <= u64::from(TICK_RATE) / 2;
        if edge_pending || held {
            let fired = try_fire_weapon(
                ctx,
                &mut player,
                tick,
                input.client_tick,
                input.buttons & BUTTON_SCOPE_HELD != 0,
                solids,
            );
            if fired && edge_pending {
                player.last_processed_fire_counter =
                    player.last_processed_fire_counter.wrapping_add(1);
            }
        }
    }
    record_lag_sample(ctx, &player, tick);
    ctx.db.player().id().update(player);
}

fn target_is_visible(
    observer: &Player,
    target: &Player,
    solids: &[simulation::SolidAabb],
    require_fov: bool,
) -> Option<(f32, Vec3)> {
    let origin = player_position(observer) + Vec3::new(0.0, PLAYER_EYE_HEIGHT, 0.0);
    let target_point = player_position(target) + Vec3::new(0.0, 1.15, 0.0);
    let delta = target_point - origin;
    let distance = delta.length();
    if !(0.01..=simulation::BOT_PERCEPTION_RANGE).contains(&distance) {
        return None;
    }
    let direction = delta * (1.0 / distance);
    let look_alignment = if require_fov {
        let look = simulation::view_direction(observer.yaw, 0.0);
        look.dot(direction)
    } else {
        1.0
    };
    let wall = simulation::nearest_wall_distance(origin, direction, distance, solids);
    simulation::bot_can_perceive(distance, look_alignment, wall, require_fov)
        .then_some((distance, direction))
}

fn choose_bot_target(
    ctx: &ReducerContext,
    bot: &Player,
    solids: &[simulation::SolidAabb],
) -> Option<(Player, f32, Vec3)> {
    ctx.db
        .player()
        .room_id()
        .filter(bot.room_id)
        .filter(|target| {
            target.id != bot.id
                && target.alive
                && target.spawn_protected_until_tick <= current_tick(ctx)
        })
        .filter_map(|target| {
            target_is_visible(bot, &target, solids, true)
                .map(|(distance, direction)| (target, distance, direction))
        })
        .min_by(|left, right| left.1.total_cmp(&right.1))
}

fn world_to_local_move(world_x: f32, world_z: f32, yaw: f32) -> (f32, f32) {
    let sin_yaw = yaw.sin();
    let cos_yaw = yaw.cos();
    (
        world_x * cos_yaw + world_z * sin_yaw,
        world_x * sin_yaw - world_z * cos_yaw,
    )
}

fn advance_bot_waypoint(brain: &mut BotBrain, tick: u64) {
    let current_index = usize::from(brain.waypoint_index) % arena_map::ARENA_NAV_WAYPOINTS.len();
    let waypoint = arena_map::ARENA_NAV_WAYPOINTS[current_index];
    if waypoint.neighbors.is_empty() {
        brain.waypoint_index =
            (current_index.saturating_add(1) % arena_map::ARENA_NAV_WAYPOINTS.len()) as u16;
        return;
    }
    let choice = simulation::hash64(brain.seed ^ tick) as usize % waypoint.neighbors.len();
    let next_id = waypoint.neighbors[choice];
    if let Some(index) = arena_map::ARENA_NAV_WAYPOINTS
        .iter()
        .position(|candidate| candidate.id == next_id)
    {
        brain.waypoint_index = index as u16;
    }
}

fn simulate_bot_player(
    ctx: &ReducerContext,
    mut bot: Player,
    room_active: bool,
    tick: u64,
    solids: &[simulation::SolidAabb],
    ramps: &[simulation::RampSurface],
    bounds: simulation::WorldBounds,
) {
    finish_reloads(ctx, bot.id, tick);
    if !bot.alive {
        if simulation::respawn_is_due(bot.alive, bot.respawn_at_tick, tick) && room_active {
            respawn(ctx, &mut bot, tick);
        }
        ctx.db.player().id().update(bot);
        return;
    }
    if !room_active {
        set_player_velocity(&mut bot, Vec3::ZERO);
        ctx.db.player().id().update(bot);
        return;
    }
    let Some(mut brain) = ctx.db.bot_brain().player_id().find(bot.id) else {
        install_bot_brain(ctx, bot.id, bot.room_id, tick);
        ctx.db.player().id().update(bot);
        return;
    };

    let mut perceived = ctx
        .db
        .player()
        .id()
        .find(brain.target_player_id)
        .and_then(|target| {
            if target.id == bot.id || !target.alive || target.room_id != bot.room_id {
                None
            } else {
                target_is_visible(&bot, &target, solids, false)
                    .map(|(distance, direction)| (target, distance, direction))
            }
        });
    if tick >= brain.think_at_tick {
        perceived = choose_bot_target(ctx, &bot, solids);
        brain.target_player_id = perceived.as_ref().map_or(0, |target| target.0.id);
        brain.think_at_tick = simulation::bot_next_think_tick(brain.seed, tick);
        let yaw_variance = simulation::bot_aim_variance(brain.seed, tick);
        let pitch_variance = simulation::bot_aim_variance(brain.seed.rotate_left(29), tick) * 0.55;
        if let Some((target, _, _)) = &perceived {
            let origin = player_position(&bot) + Vec3::new(0.0, PLAYER_EYE_HEIGHT, 0.0);
            let target_point = player_position(target) + Vec3::new(0.0, 1.15, 0.0);
            let delta = target_point - origin;
            brain.aim_yaw = simulation::normalize_yaw(delta.x.atan2(-delta.z) + yaw_variance);
            brain.aim_pitch = simulation::sanitize_pitch(
                delta
                    .y
                    .atan2((delta.x * delta.x + delta.z * delta.z).sqrt())
                    + pitch_variance,
            );
        }
    }

    let mut desired_world = (0.0_f32, 0.0_f32);
    let mut should_fire = false;
    let mut scoped = false;
    if let Some((target, distance, direction)) = perceived {
        bot.selected_weapon = if distance < 9.0 {
            WEAPON_SHOTGUN
        } else if distance > 30.0 {
            WEAPON_SNIPER
        } else {
            WEAPON_RIFLE
        };
        bot.yaw = brain.aim_yaw;
        bot.pitch = brain.aim_pitch;
        scoped = bot.selected_weapon == WEAPON_SNIPER;
        let aim = simulation::view_direction(bot.yaw, bot.pitch);
        should_fire = simulation::bot_trigger_window_open(brain.think_at_tick, tick)
            && simulation::bot_should_fire(aim.dot(direction), scoped);
        let target_position = player_position(&target);
        if distance
            > if bot.selected_weapon == WEAPON_SHOTGUN {
                5.5
            } else {
                13.0
            }
        {
            desired_world =
                simulation::normalized_move_toward(player_position(&bot), target_position);
        } else if distance < 4.5 {
            desired_world =
                simulation::normalized_move_toward(target_position, player_position(&bot));
        }
    } else {
        let index = usize::from(brain.waypoint_index) % arena_map::ARENA_NAV_WAYPOINTS.len();
        let waypoint = arena_map::ARENA_NAV_WAYPOINTS[index];
        let waypoint_position = Vec3::new(
            waypoint.position.x,
            waypoint.position.y,
            waypoint.position.z,
        );
        if player_position(&bot).distance_squared(waypoint_position) < 3.0 {
            advance_bot_waypoint(&mut brain, tick);
        }
        let updated = arena_map::ARENA_NAV_WAYPOINTS
            [usize::from(brain.waypoint_index) % arena_map::ARENA_NAV_WAYPOINTS.len()];
        desired_world = simulation::normalized_move_toward(
            player_position(&bot),
            Vec3::new(updated.position.x, updated.position.y, updated.position.z),
        );
        bot.yaw = simulation::normalize_yaw(desired_world.0.atan2(-desired_world.1));
        bot.pitch = 0.0;
    }
    let (local_x, local_z) = world_to_local_move(desired_world.0, desired_world.1, bot.yaw);
    let motion = simulation::integrate_motion(
        player_position(&bot),
        Vec3::new(bot.vx, bot.vy, bot.vz),
        local_x,
        local_z,
        bot.yaw,
        simulation::bot_should_jump(brain.stuck_ticks),
        true,
        bounds,
        solids,
        ramps,
    );
    set_player_position(&mut bot, motion.position);
    set_player_velocity(&mut bot, motion.velocity);
    let stuck = simulation::update_bot_stuck(brain.stuck_ticks, motion.blocked);
    brain.stuck_ticks = stuck.stuck_ticks;
    if stuck.reroute {
        advance_bot_waypoint(&mut brain, tick);
    }
    if bot.y < arena_map::ARENA_KILL_Y {
        eliminate_from_world(ctx, &mut bot, tick);
    } else if should_fire {
        let _ = try_fire_weapon(ctx, &mut bot, tick, tick, scoped, solids);
    } else {
        let selected = ctx
            .db
            .weapon_state()
            .key()
            .find(weapon_key(bot.id, bot.selected_weapon));
        if selected.is_some_and(|weapon| {
            weapon.magazine_ammo == 0 && weapon.reserve_ammo > 0 && !weapon.reloading
        }) {
            let _ = start_reload(ctx, &bot, tick);
        }
    }
    record_lag_sample(ctx, &bot, tick);
    ctx.db.bot_brain().player_id().update(brain);
    ctx.db.player().id().update(bot);
}

fn simulate_pickups(ctx: &ReducerContext, room_id: u64, tick: u64) {
    let pickups: Vec<PickupState> = ctx.db.pickup_state().room_id().filter(room_id).collect();
    for mut pickup in pickups {
        if !pickup.available {
            if tick >= pickup.respawn_at_tick {
                pickup.available = true;
                pickup.respawn_at_tick = 0;
                ctx.db.pickup_state().key().update(pickup);
            }
            continue;
        }
        let pickup_position = Vec3::new(pickup.x, pickup.y, pickup.z);
        let collector = ctx.db.player().room_id().filter(room_id).find(|player| {
            player.alive
                && player_position(player).distance_squared(pickup_position) <= 2.25
                && (pickup.kind != 2 || player.health < player.max_health)
        });
        let Some(mut player) = collector else {
            continue;
        };
        let collector_id = player.id;
        let collected = if pickup.kind == 2 {
            let before = player.health;
            player.health = player.health.saturating_add(35).min(player.max_health);
            player.health > before
        } else {
            let key = weapon_key(player.id, player.selected_weapon);
            if let Some(mut weapon) = ctx.db.weapon_state().key().find(key) {
                let spec = simulation::weapon_spec(weapon.slot).expect("stored weapon slot");
                let before = weapon.reserve_ammo;
                weapon.reserve_ammo = weapon
                    .reserve_ammo
                    .saturating_add((spec.magazine / 2).max(1))
                    .min(spec.reserve);
                let changed = weapon.reserve_ammo > before;
                ctx.db.weapon_state().key().update(weapon);
                changed
            } else {
                false
            }
        };
        if !collected {
            continue;
        }
        let collected_kind = pickup.kind;
        mutate_account_stats(ctx, player.id, player.is_bot, |stats| {
            if collected_kind == 2 {
                stats.health_collected = stats.health_collected.saturating_add(1);
            } else {
                stats.ammo_collected = stats.ammo_collected.saturating_add(1);
            }
            stats.last_seen_tick = tick;
        });
        ctx.db.player().id().update(player);
        pickup.available = false;
        let respawn_ticks =
            u64::from(arena_map::ARENA_PICKUPS[usize::from(pickup.pickup_index)].respawn_ticks);
        pickup.respawn_at_tick = tick + respawn_ticks;
        emit_match_event(
            ctx,
            room_id,
            tick,
            EVENT_PICKUP,
            collector_id,
            0,
            0,
            pickup.kind.into(),
            "pickup".to_string(),
        );
        ctx.db.pickup_state().key().update(pickup);
    }
}

fn begin_intermission(ctx: &ReducerContext, room: &mut Room, winner: u64, tick: u64) {
    room.phase = ROOM_PHASE_INTERMISSION;
    room.winner_player_id = winner;
    room.intermission_ends_tick = tick + INTERMISSION_TICKS;
    for player in ctx.db.player().room_id().filter(room.id) {
        mutate_account_stats(ctx, player.id, player.is_bot, |stats| {
            stats.matches_played = stats.matches_played.saturating_add(1);
            if player.id == winner {
                stats.wins = stats.wins.saturating_add(1);
            }
            stats.last_seen_tick = tick;
        });
    }
    emit_match_event(
        ctx,
        room.id,
        tick,
        EVENT_MATCH_END,
        winner,
        0,
        0,
        0,
        "match complete".to_string(),
    );
}

fn reset_match(ctx: &ReducerContext, room: &mut Room, tick: u64) {
    room.phase = ROOM_PHASE_ACTIVE;
    room.round = room.round.wrapping_add(1);
    room.match_tick = 0;
    room.intermission_ends_tick = 0;
    room.winner_player_id = 0;
    let players: Vec<Player> = ctx.db.player().room_id().filter(room.id).collect();
    for mut player in players {
        player.kills = 0;
        player.deaths = 0;
        player.selected_weapon = WEAPON_RIFLE;
        let spawn_seed = player.id ^ u64::from(room.round);
        spawn_player(ctx, &mut player, tick, spawn_seed, true);
        reset_weapon_loadout(ctx, player.id);
        mutate_account_stats(ctx, player.id, player.is_bot, |stats| {
            stats.matches_started = stats.matches_started.saturating_add(1);
            stats.last_seen_tick = tick;
        });
        ctx.db.player().id().update(player);
    }
    let pickups: Vec<PickupState> = ctx.db.pickup_state().room_id().filter(room.id).collect();
    for mut pickup in pickups {
        pickup.available = true;
        pickup.respawn_at_tick = 0;
        ctx.db.pickup_state().key().update(pickup);
    }
    emit_match_event(
        ctx,
        room.id,
        tick,
        EVENT_MATCH_START,
        0,
        0,
        0,
        0,
        format!("round {}", room.round),
    );
}

fn for_each_latest_entity<T>(
    mut entity_ids: Vec<u64>,
    mut read_latest: impl FnMut(u64) -> Option<T>,
    mut simulate: impl FnMut(T),
) {
    entity_ids.sort_unstable();
    entity_ids.dedup();
    for entity_id in entity_ids {
        if let Some(entity) = read_latest(entity_id) {
            simulate(entity);
        }
    }
}

fn simulate_room(
    ctx: &ReducerContext,
    mut room: Room,
    tick: u64,
    solids: &[simulation::SolidAabb],
    ramps: &[simulation::RampSurface],
    bounds: simulation::WorldBounds,
) {
    room.server_tick = tick;
    if room.human_count > 0 {
        if let Some(mut runtime) = ctx.db.room_runtime().room_id().find(room.id) {
            runtime.last_human_tick = tick;
            ctx.db.room_runtime().room_id().update(runtime);
        }
    }
    if tick.is_multiple_of(u64::from(TICK_RATE)) {
        for player in ctx
            .db
            .player()
            .room_id()
            .filter(room.id)
            .filter(|player| !player.is_bot && player.connected)
        {
            let active = room.phase == ROOM_PHASE_ACTIVE;
            mutate_account_stats(ctx, player.id, false, |stats| {
                if active {
                    stats.total_play_time_ticks = stats
                        .total_play_time_ticks
                        .saturating_add(u64::from(TICK_RATE));
                } else {
                    stats.total_lobby_time_ticks = stats
                        .total_lobby_time_ticks
                        .saturating_add(u64::from(TICK_RATE));
                }
                stats.last_seen_tick = tick;
            });
        }
    }
    if room.phase == ROOM_PHASE_INTERMISSION {
        if tick >= room.intermission_ends_tick {
            reset_match(ctx, &mut room, tick);
        }
        ctx.db.room().id().update(room);
        return;
    }
    room.match_tick = room.match_tick.saturating_add(1);
    let player_ids: Vec<u64> = ctx
        .db
        .player()
        .room_id()
        .filter(room.id)
        .map(|player| player.id)
        .collect();
    for_each_latest_entity(
        player_ids,
        |player_id| {
            ctx.db
                .player()
                .id()
                .find(player_id)
                .filter(|player| player.room_id == room.id)
        },
        |player| {
            if player.is_bot {
                simulate_bot_player(ctx, player, true, tick, solids, ramps, bounds);
            } else {
                simulate_human_player(ctx, player, true, tick, solids, ramps, bounds);
            }
        },
    );
    simulate_pickups(ctx, room.id, tick);
    let leader = ctx
        .db
        .player()
        .room_id()
        .filter(room.id)
        .max_by_key(|player| (player.kills, u64::MAX - player.id));
    if let Some(leader) = leader {
        if simulation::match_should_end(leader.kills, room.match_tick) {
            begin_intermission(ctx, &mut room, leader.id, tick);
        }
    }
    ctx.db.room().id().update(room);
}

fn remove_room(ctx: &ReducerContext, room_id: u64) {
    let players: Vec<Player> = ctx.db.player().room_id().filter(room_id).collect();
    for player in players {
        let weapons: Vec<WeaponState> = ctx
            .db
            .weapon_state()
            .player_id()
            .filter(player.id)
            .collect();
        for weapon in weapons {
            ctx.db.weapon_state().key().delete(weapon.key);
        }
        let samples: Vec<LagSample> = ctx.db.lag_sample().player_id().filter(player.id).collect();
        for sample in samples {
            ctx.db.lag_sample().key().delete(sample.key);
        }
        ctx.db.bot_brain().player_id().delete(player.id);
        ctx.db.player_input().player_id().delete(player.id);
        if let Some(session) = ctx.db.player_session().player_id().find(player.id) {
            ctx.db.player_session().identity().delete(session.identity);
        }
        ctx.db.player().id().delete(player.id);
    }
    let pickups: Vec<PickupState> = ctx.db.pickup_state().room_id().filter(room_id).collect();
    for pickup in pickups {
        ctx.db.pickup_state().key().delete(pickup.key);
    }
    let match_events: Vec<MatchEvent> = ctx.db.match_event().room_id().filter(room_id).collect();
    for event in match_events {
        ctx.db.match_event().id().delete(event.id);
    }
    let chat_events: Vec<ChatEvent> = ctx.db.chat_event().room_id().filter(room_id).collect();
    for event in chat_events {
        ctx.db.chat_event().id().delete(event.id);
    }
    ctx.db.room_runtime().room_id().delete(room_id);
    ctx.db.room().id().delete(room_id);
}

fn cleanup_transient_state(ctx: &ReducerContext, tick: u64) {
    let expired_sessions: Vec<PlayerSession> = ctx
        .db
        .player_session()
        .iter()
        .filter(|session| {
            simulation::reconnect_session_expired(session.reconnect_expires_tick, tick)
        })
        .collect();
    for session in expired_sessions {
        if let Some(mut player) = ctx.db.player().id().find(session.player_id) {
            if simulation::expired_session_requires_bot_replacement(player.is_bot) {
                player.owner_identity = ctx.identity();
                player.nickname = bot_name(player.id);
                player.is_bot = true;
                player.connected = true;
                reset_weapon_loadout(ctx, player.id);
                ctx.db.player().id().update(player);
                install_bot_brain(ctx, session.player_id, session.room_id, tick);
            }
            ctx.db.player_input().player_id().delete(session.player_id);
        }
        ctx.db.player_session().identity().delete(session.identity);
        sync_room_counts(ctx, session.room_id, tick);
    }
    let expired_auth_sessions: Vec<AccountSession> = ctx
        .db
        .account_session()
        .iter()
        .filter(|session| session.logged_in && session.auth_expires_tick < tick)
        .collect();
    for mut session in expired_auth_sessions {
        if let Some(mut player_session) = ctx.db.player_session().identity().find(session.identity)
        {
            if player_session.connection_id == session.connection_id {
                player_session.account_id = 0;
                ctx.db.player_session().identity().update(player_session);
            }
        }
        session.account_id = 0;
        session.username = String::new();
        session.logged_in = false;
        session.auth_request_id = session.auth_request_id.wrapping_add(1);
        session.auth_error_code = AUTH_ERROR_SESSION_EXPIRED;
        session.retry_after_micros = 0;
        session.auth_expires_tick = 0;
        ctx.db.account_session().identity().update(session);
    }
    if tick.is_multiple_of(u64::from(TICK_RATE) * 60) {
        let now = ctx.timestamp.to_micros_since_unix_epoch();
        let stale_rate_limits: Vec<Identity> = ctx
            .db
            .rate_limit()
            .iter()
            .filter(|limit| {
                now.saturating_sub(limit.last_seen_micros) >= RATE_LIMIT_RETENTION_MICROS
            })
            .map(|limit| limit.identity)
            .collect();
        for identity in stale_rate_limits {
            ctx.db.rate_limit().identity().delete(identity);
        }
        let stale_action_results: Vec<Identity> = ctx
            .db
            .client_action_result()
            .iter()
            .filter(|result| {
                result
                    .updated_tick
                    .saturating_add(10 * 60 * u64::from(TICK_RATE))
                    < tick
            })
            .map(|result| result.identity)
            .collect();
        for identity in stale_action_results {
            ctx.db.client_action_result().identity().delete(identity);
        }
    }
    let stale_match_events: Vec<MatchEvent> = ctx
        .db
        .match_event()
        .iter()
        .filter(|event| event.tick.saturating_add(EVENT_RETENTION_TICKS) < tick)
        .collect();
    for event in stale_match_events {
        ctx.db.match_event().id().delete(event.id);
    }
    let stale_chat_events: Vec<ChatEvent> = ctx
        .db
        .chat_event()
        .iter()
        .filter(|event| event.tick.saturating_add(EVENT_RETENTION_TICKS * 4) < tick)
        .collect();
    for event in stale_chat_events {
        ctx.db.chat_event().id().delete(event.id);
    }
    let empty_rooms: Vec<u64> = ctx
        .db
        .room_runtime()
        .iter()
        .filter(|runtime| {
            let human_count = ctx
                .db
                .room()
                .id()
                .find(runtime.room_id)
                .map(|room| room.human_count);
            let has_live_reservation = ctx.db.player_session().iter().any(|session| {
                session.room_id == runtime.room_id && session.reconnect_expires_tick >= tick
            });
            simulation::idle_room_should_cleanup(
                runtime.last_human_tick,
                tick,
                ROOM_IDLE_CLEANUP_TICKS,
                human_count,
                has_live_reservation,
            )
        })
        .map(|runtime| runtime.room_id)
        .collect();
    for room_id in empty_rooms {
        remove_room(ctx, room_id);
    }
}

#[reducer]
pub fn sim_tick(ctx: &ReducerContext, _schedule: SimTickSchedule) -> Result<(), String> {
    if ctx.sender() != ctx.identity() {
        return Err("Only the module scheduler may advance the simulation.".to_string());
    }
    let mut clock = ctx
        .db
        .simulation_clock()
        .id()
        .find(0)
        .ok_or_else(|| "Simulation clock is not initialized.".to_string())?;
    clock.tick = clock.tick.wrapping_add(1);
    let tick = clock.tick;
    ctx.db.simulation_clock().id().update(clock);
    let solids = world_solids();
    let ramps = world_ramps();
    let bounds = world_bounds();
    let rooms: Vec<Room> = ctx.db.room().iter().collect();
    for room in rooms {
        simulate_room(ctx, room, tick, &solids, &ramps, bounds);
    }
    if tick.is_multiple_of(u64::from(TICK_RATE)) {
        cleanup_transient_state(ctx, tick);
    }
    Ok(())
}

#[cfg(test)]
mod module_tests {
    use super::*;
    use std::{
        cell::{Cell, RefCell},
        collections::BTreeMap,
    };

    #[test]
    fn initial_bots_receive_the_full_spawn_protection_window() {
        let spawn_tick = 700;
        let protection_ticks = u64::from(arena_map::ARENA_SPAWN_PROTECTION_TICKS);
        assert!(INITIAL_BOTS_SPAWN_PROTECTED);
        assert_eq!(protection_ticks, u64::from(TICK_RATE) * 3);
        assert_eq!(
            simulation::spawn_protection_until(
                spawn_tick,
                protection_ticks,
                INITIAL_BOTS_SPAWN_PROTECTED
            ),
            spawn_tick + 180
        );
        assert_eq!(
            simulation::spawn_protection_until(spawn_tick, protection_ticks, false),
            spawn_tick
        );
    }

    #[test]
    fn latest_row_player_iteration_cannot_resurrect_a_cross_player_death() {
        #[derive(Clone, Copy)]
        struct LifeRow {
            id: u64,
            health: u16,
            alive: bool,
            respawn_at_tick: u64,
        }

        let death_tick = 10_000;
        let rows = RefCell::new(BTreeMap::from([
            (
                1,
                LifeRow {
                    id: 1,
                    health: MAX_HEALTH,
                    alive: true,
                    respawn_at_tick: 0,
                },
            ),
            (
                2,
                LifeRow {
                    id: 2,
                    health: MAX_HEALTH,
                    alive: true,
                    respawn_at_tick: 0,
                },
            ),
        ]));
        let kill_events = Cell::new(0_u8);

        // The reversed input proves the production iterator establishes a stable ID order.
        for_each_latest_entity(
            vec![2, 1],
            |player_id| rows.borrow().get(&player_id).copied(),
            |mut player| {
                if player.id == 1 {
                    let mut authoritative = rows.borrow_mut();
                    let target = authoritative.get_mut(&2).expect("target row");
                    if target.alive {
                        target.health = 0;
                        target.alive = false;
                        target.respawn_at_tick = death_tick + RESPAWN_DELAY_TICKS;
                        kill_events.set(kill_events.get().saturating_add(1));
                    }
                    return;
                }

                // This is the target's later turn. It must receive the just-mutated row,
                // rather than the alive snapshot that existed before the shooter acted.
                assert!(!player.alive);
                if simulation::respawn_is_due(player.alive, player.respawn_at_tick, death_tick) {
                    player.alive = true;
                    player.health = MAX_HEALTH;
                }
                rows.borrow_mut().insert(player.id, player);
            },
        );

        let target = rows.borrow()[&2];
        assert!(!target.alive);
        assert_eq!(target.health, 0);
        assert_eq!(kill_events.get(), 1);
        assert_eq!(
            target.respawn_at_tick,
            death_tick + u64::from(TICK_RATE) * 3
        );
        assert!(!simulation::respawn_is_due(
            target.alive,
            target.respawn_at_tick,
            target.respawn_at_tick - 1
        ));
        assert!(simulation::respawn_is_due(
            target.alive,
            target.respawn_at_tick,
            target.respawn_at_tick
        ));
    }

    #[cfg(not(feature = "password-accounts"))]
    #[test]
    fn password_accounts_are_disabled_in_the_default_production_build() {
        assert!(!PASSWORD_ACCOUNTS_ENABLED);
        assert!(!simulation::account_feature_enabled(
            PASSWORD_ACCOUNTS_ENABLED,
            Some(true)
        ));
    }

    #[cfg(feature = "password-accounts")]
    #[test]
    fn password_accounts_can_be_enabled_for_local_testing() {
        assert!(PASSWORD_ACCOUNTS_ENABLED);
        assert!(simulation::account_feature_enabled(
            PASSWORD_ACCOUNTS_ENABLED,
            Some(true)
        ));
    }

    #[test]
    fn bot_waypoint_movement_and_obstacle_recovery_are_deterministic() {
        let current_index = arena_map::ARENA_NAV_WAYPOINTS
            .iter()
            .position(|waypoint| !waypoint.neighbors.is_empty())
            .expect("authored map has a connected waypoint");
        let current = arena_map::ARENA_NAV_WAYPOINTS[current_index];
        let mut brain = BotBrain {
            player_id: 1,
            waypoint_index: current_index as u16,
            target_player_id: 0,
            think_at_tick: 0,
            aim_yaw: 0.0,
            aim_pitch: 0.0,
            stuck_ticks: 0,
            seed: 0xB07,
        };
        advance_bot_waypoint(&mut brain, 900);
        let next = arena_map::ARENA_NAV_WAYPOINTS[usize::from(brain.waypoint_index)];
        assert!(current.neighbors.contains(&next.id));
        let movement = simulation::normalized_move_toward(
            Vec3::new(current.position.x, current.position.y, current.position.z),
            Vec3::new(next.position.x, next.position.y, next.position.z),
        );
        assert!((movement.0 * movement.0 + movement.1 * movement.1 - 1.0).abs() < 0.000_1);

        let jump = simulation::update_bot_stuck(simulation::BOT_JUMP_STUCK_TICKS, true);
        assert!(simulation::bot_should_jump(jump.stuck_ticks));
        assert!(!jump.reroute);
        let reroute = simulation::update_bot_stuck(simulation::BOT_REROUTE_STUCK_TICKS, true);
        assert_eq!(reroute.stuck_ticks, 0);
        assert!(reroute.reroute);
    }

    #[test]
    fn argon2id_password_hashes_are_salted_and_verifiable() {
        let first = password_hash(&[1; 16], "correct horse 42").expect("argon2 hash");
        let second = password_hash(&[2; 16], "correct horse 42").expect("argon2 hash");
        assert!(first.starts_with("$argon2id$"));
        assert!(second.starts_with("$argon2id$"));
        assert_ne!(first, second);
        assert!(verify_password(&first, "correct horse 42"));
        assert!(!verify_password(&first, "wrong password 42"));
    }

    #[test]
    fn text_validation_bounds_allocations_markup_and_bidi_controls() {
        assert!(sanitize_nickname(&"A".repeat(65)).is_err());
        assert!(sanitize_room_code(&"A".repeat(65)).is_err());
        assert!(validate_email(&"a".repeat(257)).is_err());
        assert!(sanitize_chat(&"x".repeat(1025)).is_err());
        let cleaned =
            sanitize_chat("hello <script>\u{202e}world\u{2066}").expect("sanitized message");
        assert_eq!(cleaned, "hello scriptworld");
    }
}
