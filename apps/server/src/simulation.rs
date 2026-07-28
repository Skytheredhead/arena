use core::f32::consts::TAU;

pub const TICK_RATE: u16 = 60;
pub const DT: f32 = 1.0 / TICK_RATE as f32;
pub const ROOM_CAPACITY: u8 = 12;
pub const SCORE_LIMIT: u16 = 30;
pub const MATCH_DURATION_TICKS: u64 = 10 * 60 * TICK_RATE as u64;
pub const INTERMISSION_TICKS: u64 = 10 * TICK_RATE as u64;
pub const RESPAWN_DELAY_TICKS: u64 = 3 * TICK_RATE as u64;
pub const RECONNECT_GRACE_TICKS: u64 = 20 * TICK_RATE as u64;
pub const MAX_LAG_COMPENSATION_TICKS: u64 = 12;
pub const HISTORY_SAMPLES: u64 = 32;
pub const MAX_ACTION_ADVANCE: u32 = 8;
pub const MAX_HEALTH: u16 = 100;
pub const PLAYER_RADIUS: f32 = 0.45;
pub const PLAYER_HEIGHT: f32 = 1.8;
pub const PLAYER_EYE_HEIGHT: f32 = 1.55;
pub const WALK_SPEED: f32 = 6.1;
pub const SPRINT_SPEED: f32 = 8.0;
pub const JUMP_SPEED: f32 = 6.2;
pub const GRAVITY: f32 = 18.5;
pub const STEP_HEIGHT: f32 = 0.46;
pub const BOT_PERCEPTION_RANGE: f32 = 48.0;
pub const BOT_PERIPHERAL_RANGE: f32 = 12.0;
pub const BOT_FOV_ALIGNMENT: f32 = 0.15;
pub const BOT_WALL_TOLERANCE: f32 = 0.02;
pub const BOT_JUMP_STUCK_TICKS: u16 = 8;
pub const BOT_REROUTE_STUCK_TICKS: u16 = 20;
pub const BOT_AIM_MAX_ERROR_RADIANS: f32 = 0.14;
pub const BOT_THINK_MIN_TICKS: u64 = 36;
pub const BOT_THINK_JITTER_TICKS: u64 = 36;
pub const BOT_TRIGGER_WINDOW_TICKS: u64 = 1;

pub const WEAPON_RIFLE: u8 = 1;
pub const WEAPON_SNIPER: u8 = 2;
pub const WEAPON_SHOTGUN: u8 = 3;

pub const BUTTON_FORWARD: u16 = 1;
pub const BUTTON_BACK: u16 = 1 << 1;
pub const BUTTON_LEFT: u16 = 1 << 2;
pub const BUTTON_RIGHT: u16 = 1 << 3;
pub const BUTTON_JUMP: u16 = 1 << 4;
pub const BUTTON_SPRINT: u16 = 1 << 5;
pub const BUTTON_FIRE_HELD: u16 = 1 << 6;
pub const BUTTON_SCOPE_HELD: u16 = 1 << 7;
pub const ALLOWED_BUTTONS: u16 = BUTTON_FORWARD
    | BUTTON_BACK
    | BUTTON_LEFT
    | BUTTON_RIGHT
    | BUTTON_JUMP
    | BUTTON_SPRINT
    | BUTTON_FIRE_HELD
    | BUTTON_SCOPE_HELD;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Vec3 {
    pub const ZERO: Self = Self {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    #[must_use]
    pub const fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }

    #[must_use]
    pub fn dot(self, rhs: Self) -> f32 {
        self.x * rhs.x + self.y * rhs.y + self.z * rhs.z
    }

    #[must_use]
    pub fn length_squared(self) -> f32 {
        self.dot(self)
    }

    #[must_use]
    pub fn length(self) -> f32 {
        self.length_squared().sqrt()
    }

    #[must_use]
    pub fn normalized_or(self, fallback: Self) -> Self {
        let length = self.length();
        if length.is_finite() && length > 0.000_001 {
            self * (1.0 / length)
        } else {
            fallback
        }
    }

    #[must_use]
    pub fn distance_squared(self, rhs: Self) -> f32 {
        (self - rhs).length_squared()
    }
}

impl core::ops::Add for Vec3 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self::new(self.x + rhs.x, self.y + rhs.y, self.z + rhs.z)
    }
}

impl core::ops::Sub for Vec3 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        Self::new(self.x - rhs.x, self.y - rhs.y, self.z - rhs.z)
    }
}

impl core::ops::Mul<f32> for Vec3 {
    type Output = Self;

    fn mul(self, rhs: f32) -> Self::Output {
        Self::new(self.x * rhs, self.y * rhs, self.z * rhs)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SolidAabb {
    pub min: Vec3,
    pub max: Vec3,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RampSurface {
    pub min_x: f32,
    pub max_x: f32,
    pub min_z: f32,
    pub max_z: f32,
    pub base_y: f32,
    pub top_y: f32,
    pub axis: u8,
    pub ascending_positive: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WorldBounds {
    pub min_x: f32,
    pub max_x: f32,
    pub min_z: f32,
    pub max_z: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MotionResult {
    pub position: Vec3,
    pub velocity: Vec3,
    pub grounded: bool,
    pub blocked: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AuthBudgetState {
    pub window_started_micros: i64,
    pub attempts: u16,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AuthBudgetDecision {
    pub state: AuthBudgetState,
    pub allowed: bool,
    pub retry_after_micros: i64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FailedLoginState {
    pub window_started_micros: i64,
    pub failures: u16,
    pub blocked_until_micros: i64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct BotStuckUpdate {
    pub stuck_ticks: u16,
    pub reroute: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WeaponSpec {
    pub slot: u8,
    pub magazine: u16,
    pub reserve: u16,
    pub pellets: u8,
    pub damage_per_pellet: u16,
    pub fire_interval_ticks: u64,
    pub reload_ticks: u64,
    pub range: f32,
    pub falloff_start: f32,
    pub falloff_end: f32,
    pub minimum_multiplier: f32,
    pub hip_spread_radians: f32,
    pub scoped_spread_radians: f32,
    pub automatic: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AmmoTransfer {
    pub magazine_ammo: u16,
    pub reserve_ammo: u16,
}

pub const RIFLE_SPEC: WeaponSpec = WeaponSpec {
    slot: WEAPON_RIFLE,
    magazine: 30,
    reserve: 120,
    pellets: 1,
    damage_per_pellet: 24,
    fire_interval_ticks: 6,
    reload_ticks: 105,
    range: 90.0,
    falloff_start: 35.0,
    falloff_end: 75.0,
    minimum_multiplier: 0.55,
    hip_spread_radians: 0.018,
    scoped_spread_radians: 0.004,
    automatic: true,
};

pub const SNIPER_SPEC: WeaponSpec = WeaponSpec {
    slot: WEAPON_SNIPER,
    magazine: 5,
    reserve: 20,
    pellets: 1,
    damage_per_pellet: 95,
    fire_interval_ticks: 72,
    reload_ticks: 150,
    range: 180.0,
    falloff_start: 120.0,
    falloff_end: 170.0,
    minimum_multiplier: 0.8,
    hip_spread_radians: 0.035,
    scoped_spread_radians: 0.000_8,
    automatic: false,
};

pub const SHOTGUN_SPEC: WeaponSpec = WeaponSpec {
    slot: WEAPON_SHOTGUN,
    magazine: 8,
    reserve: 32,
    pellets: 12,
    damage_per_pellet: 12,
    fire_interval_ticks: 54,
    reload_ticks: 132,
    range: 32.0,
    falloff_start: 8.0,
    falloff_end: 25.0,
    minimum_multiplier: 0.25,
    hip_spread_radians: 0.09,
    scoped_spread_radians: 0.065,
    automatic: false,
};

#[must_use]
pub const fn weapon_spec(slot: u8) -> Option<&'static WeaponSpec> {
    match slot {
        WEAPON_RIFLE => Some(&RIFLE_SPEC),
        WEAPON_SNIPER => Some(&SNIPER_SPEC),
        WEAPON_SHOTGUN => Some(&SHOTGUN_SPEC),
        _ => None,
    }
}

#[must_use]
pub fn reload_transfer(spec: &WeaponSpec, magazine_ammo: u16, reserve_ammo: u16) -> AmmoTransfer {
    let needed = spec.magazine.saturating_sub(magazine_ammo);
    let transferred = needed.min(reserve_ammo);
    AmmoTransfer {
        magazine_ammo: magazine_ammo.saturating_add(transferred),
        reserve_ammo: reserve_ammo.saturating_sub(transferred),
    }
}

#[must_use]
pub const fn can_start_reload(
    spec: &WeaponSpec,
    magazine_ammo: u16,
    reserve_ammo: u16,
    reloading: bool,
) -> bool {
    !reloading && magazine_ammo < spec.magazine && reserve_ammo > 0
}

#[must_use]
pub const fn can_fire_weapon(
    magazine_ammo: u16,
    reloading: bool,
    next_fire_tick: u64,
    tick: u64,
) -> bool {
    !reloading && magazine_ammo > 0 && tick >= next_fire_tick
}

#[must_use]
pub const fn apply_health_damage(health: u16, damage: u16) -> (u16, u16, bool) {
    let applied = if damage < health { damage } else { health };
    let remaining = health - applied;
    (remaining, applied, remaining == 0)
}

#[must_use]
pub const fn match_should_end(leader_kills: u16, match_tick: u64) -> bool {
    leader_kills >= SCORE_LIMIT || match_tick >= MATCH_DURATION_TICKS
}

#[must_use]
pub const fn respawn_is_due(alive: bool, respawn_at_tick: u64, tick: u64) -> bool {
    !alive && tick >= respawn_at_tick
}

#[must_use]
pub const fn spawn_protection_until(tick: u64, duration_ticks: u64, protected: bool) -> u64 {
    if protected {
        tick.saturating_add(duration_ticks)
    } else {
        tick
    }
}

#[must_use]
pub const fn bot_slots_for_humans(human_count: u8) -> u8 {
    ROOM_CAPACITY.saturating_sub(human_count)
}

#[must_use]
pub const fn account_feature_enabled(compiled_in: bool, configured: Option<bool>) -> bool {
    compiled_in && matches!(configured, Some(true))
}

#[must_use]
pub const fn bot_should_jump(stuck_ticks: u16) -> bool {
    stuck_ticks > BOT_JUMP_STUCK_TICKS
}

#[must_use]
pub const fn update_bot_stuck(stuck_ticks: u16, blocked: bool) -> BotStuckUpdate {
    if blocked {
        let next = stuck_ticks.saturating_add(1);
        if next > BOT_REROUTE_STUCK_TICKS {
            BotStuckUpdate {
                stuck_ticks: 0,
                reroute: true,
            }
        } else {
            BotStuckUpdate {
                stuck_ticks: next,
                reroute: false,
            }
        }
    } else {
        BotStuckUpdate {
            stuck_ticks: stuck_ticks.saturating_sub(1),
            reroute: false,
        }
    }
}

#[must_use]
pub fn bot_can_perceive(
    distance: f32,
    look_alignment: f32,
    wall_distance: f32,
    require_fov: bool,
) -> bool {
    distance.is_finite()
        && look_alignment.is_finite()
        && wall_distance.is_finite()
        && (0.01..=BOT_PERCEPTION_RANGE).contains(&distance)
        && (!require_fov || distance <= BOT_PERIPHERAL_RANGE || look_alignment >= BOT_FOV_ALIGNMENT)
        && wall_distance + BOT_WALL_TOLERANCE >= distance
}

#[must_use]
pub fn bot_aim_variance(seed: u64, tick: u64) -> f32 {
    (unit_f32(seed ^ tick.rotate_left(9)) * 2.0 - 1.0) * BOT_AIM_MAX_ERROR_RADIANS
}

#[must_use]
pub fn bot_next_think_tick(seed: u64, tick: u64) -> u64 {
    tick.saturating_add(BOT_THINK_MIN_TICKS + (hash64(seed ^ tick) % BOT_THINK_JITTER_TICKS))
}

#[must_use]
pub const fn bot_trigger_window_open(next_think_tick: u64, tick: u64) -> bool {
    tick < next_think_tick && tick.saturating_add(BOT_TRIGGER_WINDOW_TICKS) >= next_think_tick
}

#[must_use]
pub fn bot_should_fire(aim_alignment: f32, scoped: bool) -> bool {
    aim_alignment.is_finite() && aim_alignment > if scoped { 0.994 } else { 0.975 }
}

#[must_use]
pub fn finite_clamped(value: f32, min: f32, max: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value.clamp(min, max)
    } else {
        fallback
    }
}

#[must_use]
pub fn normalize_yaw(value: f32) -> f32 {
    let finite = finite_clamped(value, -1_000_000.0, 1_000_000.0, 0.0);
    (finite + core::f32::consts::PI).rem_euclid(TAU) - core::f32::consts::PI
}

#[must_use]
pub fn sanitize_pitch(value: f32) -> f32 {
    finite_clamped(value, -1.52, 1.52, 0.0)
}

#[must_use]
pub const fn is_newer_u32(candidate: u32, previous: u32) -> bool {
    candidate != previous && candidate.wrapping_sub(previous) < 0x8000_0000
}

#[must_use]
#[cfg(test)]
pub const fn counter_advance(candidate: u32, previous: u32) -> u32 {
    if is_newer_u32(candidate, previous) {
        let delta = candidate.wrapping_sub(previous);
        if delta > MAX_ACTION_ADVANCE {
            MAX_ACTION_ADVANCE
        } else {
            delta
        }
    } else {
        0
    }
}

#[must_use]
pub const fn action_counter_within_window(candidate: u32, acknowledged: u32) -> bool {
    !is_newer_u32(candidate, acknowledged)
        || candidate.wrapping_sub(acknowledged) <= MAX_ACTION_ADVANCE
}

#[must_use]
pub const fn next_life_id(current: u32) -> u32 {
    current.wrapping_add(1)
}

#[must_use]
pub const fn connection_owns_session(owner: u128, caller: u128) -> bool {
    owner == caller
}

#[must_use]
pub const fn connection_may_claim_session(
    owner: u128,
    caller: u128,
    reconnect_expires_tick: u64,
) -> bool {
    reconnect_expires_tick != u64::MAX || connection_owns_session(owner, caller)
}

#[must_use]
pub const fn room_allocation_is_safe(
    existing_connection: Option<u128>,
    caller: u128,
    reconnect_expires_tick: u64,
) -> bool {
    match existing_connection {
        Some(owner) => connection_may_claim_session(owner, caller, reconnect_expires_tick),
        None => true,
    }
}

#[must_use]
pub const fn expired_session_requires_bot_replacement(player_is_bot: bool) -> bool {
    !player_is_bot
}

#[must_use]
pub const fn reconnect_session_expired(reconnect_expires_tick: u64, tick: u64) -> bool {
    reconnect_expires_tick != u64::MAX && reconnect_expires_tick < tick
}

#[must_use]
pub const fn idle_room_should_cleanup(
    last_human_tick: u64,
    tick: u64,
    idle_cleanup_ticks: u64,
    human_count: Option<u8>,
    has_live_reservation: bool,
) -> bool {
    last_human_tick.saturating_add(idle_cleanup_ticks) < tick
        && matches!(human_count, Some(0))
        && !has_live_reservation
}

#[must_use]
pub fn consume_auth_budget(
    mut state: AuthBudgetState,
    now_micros: i64,
    window_micros: i64,
    limit: u16,
) -> AuthBudgetDecision {
    if now_micros.saturating_sub(state.window_started_micros) >= window_micros {
        state.window_started_micros = now_micros;
        state.attempts = 0;
    }
    if state.attempts >= limit {
        return AuthBudgetDecision {
            state,
            allowed: false,
            retry_after_micros: state
                .window_started_micros
                .saturating_add(window_micros)
                .saturating_sub(now_micros)
                .max(0),
        };
    }
    state.attempts = state.attempts.saturating_add(1);
    AuthBudgetDecision {
        state,
        allowed: true,
        retry_after_micros: 0,
    }
}

#[must_use]
pub fn failed_login_retry_after(state: FailedLoginState, now_micros: i64) -> i64 {
    state.blocked_until_micros.saturating_sub(now_micros).max(0)
}

#[must_use]
pub fn record_failed_login(
    mut state: FailedLoginState,
    now_micros: i64,
    window_micros: i64,
    failure_limit: u16,
    lock_micros: i64,
) -> FailedLoginState {
    if now_micros.saturating_sub(state.window_started_micros) >= window_micros {
        state.window_started_micros = now_micros;
        state.failures = 0;
    }
    state.failures = state.failures.saturating_add(1);
    if state.failures >= failure_limit {
        state.blocked_until_micros = now_micros.saturating_add(lock_micros);
    }
    state
}

#[must_use]
pub const fn clamp_claimed_tick(claimed: u64, server_tick: u64) -> u64 {
    let oldest = server_tick.saturating_sub(MAX_LAG_COMPENSATION_TICKS);
    if claimed < oldest {
        oldest
    } else if claimed > server_tick {
        server_tick
    } else {
        claimed
    }
}

#[must_use]
pub fn input_axes(buttons: u16, analog_x: f32, analog_z: f32) -> (f32, f32) {
    let mut x = finite_clamped(analog_x, -1.0, 1.0, 0.0);
    let mut z = finite_clamped(analog_z, -1.0, 1.0, 0.0);
    if buttons & BUTTON_LEFT != 0 {
        x -= 1.0;
    }
    if buttons & BUTTON_RIGHT != 0 {
        x += 1.0;
    }
    if buttons & BUTTON_FORWARD != 0 {
        z += 1.0;
    }
    if buttons & BUTTON_BACK != 0 {
        z -= 1.0;
    }
    let length_squared = x * x + z * z;
    if length_squared > 1.0 {
        let inverse = 1.0 / length_squared.sqrt();
        x *= inverse;
        z *= inverse;
    }
    (x, z)
}

#[must_use]
pub fn view_direction(yaw: f32, pitch: f32) -> Vec3 {
    let yaw = normalize_yaw(yaw);
    let pitch = sanitize_pitch(pitch);
    let cos_pitch = pitch.cos();
    Vec3::new(yaw.sin() * cos_pitch, pitch.sin(), -yaw.cos() * cos_pitch)
        .normalized_or(Vec3::new(0.0, 0.0, -1.0))
}

#[must_use]
pub fn hash64(mut value: u64) -> u64 {
    value ^= value >> 30;
    value = value.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value ^= value >> 27;
    value = value.wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

#[must_use]
pub fn unit_f32(seed: u64) -> f32 {
    let mantissa = (hash64(seed) >> 40) as u32;
    mantissa as f32 / 0x00ff_ffff as f32
}

#[must_use]
pub fn spread_direction(base: Vec3, spread: f32, seed: u64) -> Vec3 {
    if spread <= 0.0 {
        return base.normalized_or(Vec3::new(0.0, 0.0, -1.0));
    }
    let base = base.normalized_or(Vec3::new(0.0, 0.0, -1.0));
    let reference = if base.y.abs() > 0.96 {
        Vec3::new(1.0, 0.0, 0.0)
    } else {
        Vec3::new(0.0, 1.0, 0.0)
    };
    let right = cross(base, reference).normalized_or(Vec3::new(1.0, 0.0, 0.0));
    let up = cross(right, base).normalized_or(Vec3::new(0.0, 1.0, 0.0));
    let radius = unit_f32(seed).sqrt() * spread;
    let angle = unit_f32(seed ^ 0xa5a5_96c3_7f4a_7c15) * TAU;
    (base + right * (angle.cos() * radius) + up * (angle.sin() * radius)).normalized_or(base)
}

#[must_use]
pub fn cross(lhs: Vec3, rhs: Vec3) -> Vec3 {
    Vec3::new(
        lhs.y * rhs.z - lhs.z * rhs.y,
        lhs.z * rhs.x - lhs.x * rhs.z,
        lhs.x * rhs.y - lhs.y * rhs.x,
    )
}

#[must_use]
pub fn falloff_damage(spec: &WeaponSpec, distance: f32) -> u16 {
    let distance = distance.max(0.0);
    let multiplier = if distance <= spec.falloff_start {
        1.0
    } else if distance >= spec.falloff_end {
        spec.minimum_multiplier
    } else {
        let progress = (distance - spec.falloff_start) / (spec.falloff_end - spec.falloff_start);
        1.0 + (spec.minimum_multiplier - 1.0) * progress
    };
    (f32::from(spec.damage_per_pellet) * multiplier)
        .round()
        .max(1.0) as u16
}

#[must_use]
pub fn ray_sphere_distance(
    origin: Vec3,
    direction: Vec3,
    center: Vec3,
    radius: f32,
) -> Option<f32> {
    let direction = direction.normalized_or(Vec3::new(0.0, 0.0, -1.0));
    let offset = origin - center;
    let b = offset.dot(direction);
    let c = offset.dot(offset) - radius * radius;
    let discriminant = b * b - c;
    if discriminant < 0.0 {
        return None;
    }
    let root = discriminant.sqrt();
    let near = -b - root;
    if near >= 0.0 {
        Some(near)
    } else {
        let far = -b + root;
        (far >= 0.0).then_some(far)
    }
}

#[must_use]
pub fn ray_player_distance(origin: Vec3, direction: Vec3, feet: Vec3) -> Option<f32> {
    let chest = feet + Vec3::new(0.0, 1.02, 0.0);
    let head = feet + Vec3::new(0.0, 1.58, 0.0);
    match (
        ray_sphere_distance(origin, direction, chest, 0.56),
        ray_sphere_distance(origin, direction, head, 0.3),
    ) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(distance), None) | (None, Some(distance)) => Some(distance),
        (None, None) => None,
    }
}

#[must_use]
pub fn ray_aabb_distance(origin: Vec3, direction: Vec3, aabb: SolidAabb) -> Option<f32> {
    let direction = direction.normalized_or(Vec3::new(0.0, 0.0, -1.0));
    let mut near = 0.0_f32;
    let mut far = f32::INFINITY;
    for (origin_axis, direction_axis, min_axis, max_axis) in [
        (origin.x, direction.x, aabb.min.x, aabb.max.x),
        (origin.y, direction.y, aabb.min.y, aabb.max.y),
        (origin.z, direction.z, aabb.min.z, aabb.max.z),
    ] {
        if direction_axis.abs() < 0.000_001 {
            if origin_axis < min_axis || origin_axis > max_axis {
                return None;
            }
        } else {
            let inverse = 1.0 / direction_axis;
            let mut axis_near = (min_axis - origin_axis) * inverse;
            let mut axis_far = (max_axis - origin_axis) * inverse;
            if axis_near > axis_far {
                core::mem::swap(&mut axis_near, &mut axis_far);
            }
            near = near.max(axis_near);
            far = far.min(axis_far);
            if near > far {
                return None;
            }
        }
    }
    (far >= 0.0).then_some(near.max(0.0))
}

#[must_use]
pub fn nearest_wall_distance(
    origin: Vec3,
    direction: Vec3,
    range: f32,
    solids: &[SolidAabb],
) -> f32 {
    solids
        .iter()
        .filter_map(|solid| ray_aabb_distance(origin, direction, *solid))
        .filter(|distance| *distance <= range)
        .fold(range, f32::min)
}

#[must_use]
pub fn ramp_height(ramp: RampSurface, x: f32, z: f32) -> Option<f32> {
    if x < ramp.min_x || x > ramp.max_x || z < ramp.min_z || z > ramp.max_z {
        return None;
    }
    let (coordinate, min, max) = if ramp.axis == 0 {
        (x, ramp.min_x, ramp.max_x)
    } else {
        (z, ramp.min_z, ramp.max_z)
    };
    let width = (max - min).max(0.000_1);
    let mut progress = ((coordinate - min) / width).clamp(0.0, 1.0);
    if !ramp.ascending_positive {
        progress = 1.0 - progress;
    }
    Some(ramp.base_y + (ramp.top_y - ramp.base_y) * progress)
}

#[must_use]
pub fn support_height(
    x: f32,
    z: f32,
    current_y: f32,
    solids: &[SolidAabb],
    ramps: &[RampSurface],
) -> f32 {
    let mut support = 0.0_f32;
    for solid in solids {
        let inside_horizontal = x + PLAYER_RADIUS > solid.min.x
            && x - PLAYER_RADIUS < solid.max.x
            && z + PLAYER_RADIUS > solid.min.z
            && z - PLAYER_RADIUS < solid.max.z;
        if inside_horizontal && solid.max.y <= current_y + STEP_HEIGHT && solid.max.y > support {
            support = solid.max.y;
        }
    }
    for ramp in ramps {
        if let Some(height) = ramp_height(*ramp, x, z) {
            if height <= current_y + STEP_HEIGHT && height > support {
                support = height;
            }
        }
    }
    support
}

#[must_use]
pub fn capsule_overlaps_solid(position: Vec3, solid: SolidAabb) -> bool {
    position.x + PLAYER_RADIUS > solid.min.x
        && position.x - PLAYER_RADIUS < solid.max.x
        && position.z + PLAYER_RADIUS > solid.min.z
        && position.z - PLAYER_RADIUS < solid.max.z
        && position.y + PLAYER_HEIGHT > solid.min.y + 0.001
        && position.y < solid.max.y - 0.001
}

#[must_use]
pub fn integrate_motion(
    position: Vec3,
    velocity: Vec3,
    input_x: f32,
    input_z: f32,
    yaw: f32,
    jump: bool,
    sprint: bool,
    bounds: WorldBounds,
    solids: &[SolidAabb],
    ramps: &[RampSurface],
) -> MotionResult {
    let support = support_height(position.x, position.z, position.y, solids, ramps);
    let grounded = position.y <= support + 0.04 && velocity.y <= 0.1;
    let speed = if sprint { SPRINT_SPEED } else { WALK_SPEED };
    let local = Vec3::new(input_x, 0.0, input_z);
    let sin_yaw = yaw.sin();
    let cos_yaw = yaw.cos();
    let desired = Vec3::new(
        local.x * cos_yaw + local.z * sin_yaw,
        0.0,
        local.x * sin_yaw - local.z * cos_yaw,
    )
    .normalized_or(Vec3::ZERO);
    let mut next_velocity = Vec3::new(desired.x * speed, velocity.y, desired.z * speed);
    if jump && grounded {
        next_velocity.y = JUMP_SPEED;
    } else {
        next_velocity.y -= GRAVITY * DT;
    }

    let mut next = position;
    let mut blocked = false;
    let candidate_x = Vec3::new(
        (next.x + next_velocity.x * DT)
            .clamp(bounds.min_x + PLAYER_RADIUS, bounds.max_x - PLAYER_RADIUS),
        next.y,
        next.z,
    );
    if solids
        .iter()
        .any(|solid| capsule_overlaps_solid(candidate_x, *solid))
    {
        next_velocity.x = 0.0;
        blocked = true;
    } else {
        next.x = candidate_x.x;
    }

    let candidate_z = Vec3::new(
        next.x,
        next.y,
        (next.z + next_velocity.z * DT)
            .clamp(bounds.min_z + PLAYER_RADIUS, bounds.max_z - PLAYER_RADIUS),
    );
    if solids
        .iter()
        .any(|solid| capsule_overlaps_solid(candidate_z, *solid))
    {
        next_velocity.z = 0.0;
        blocked = true;
    } else {
        next.z = candidate_z.z;
    }

    let old_y = next.y;
    next.y += next_velocity.y * DT;
    if next_velocity.y > 0.0
        && solids
            .iter()
            .any(|solid| capsule_overlaps_solid(next, *solid))
    {
        next.y = old_y;
        next_velocity.y = 0.0;
        blocked = true;
    }

    let next_support = support_height(next.x, next.z, old_y, solids, ramps);
    let landed = next_velocity.y <= 0.0 && next.y <= next_support;
    if landed {
        next.y = next_support;
        next_velocity.y = 0.0;
    }

    MotionResult {
        position: next,
        velocity: next_velocity,
        grounded: landed || grounded,
        blocked,
    }
}

#[must_use]
pub fn select_safest_spawn(spawns: &[Vec3], enemies: &[Vec3], seed: u64) -> usize {
    if spawns.is_empty() {
        return 0;
    }
    if enemies.is_empty() {
        return hash64(seed) as usize % spawns.len();
    }
    let rotation = hash64(seed) as usize % spawns.len();
    let mut best_index = rotation;
    let mut best_distance = -1.0_f32;
    for offset in 0..spawns.len() {
        let index = (rotation + offset) % spawns.len();
        let nearest = enemies
            .iter()
            .map(|enemy| spawns[index].distance_squared(*enemy))
            .fold(f32::INFINITY, f32::min);
        if nearest > best_distance {
            best_distance = nearest;
            best_index = index;
        }
    }
    best_index
}

#[must_use]
pub fn normalized_move_toward(from: Vec3, to: Vec3) -> (f32, f32) {
    let delta = Vec3::new(to.x - from.x, 0.0, to.z - from.z);
    let length = (delta.x * delta.x + delta.z * delta.z).sqrt();
    if length > 0.000_1 {
        (delta.x / length, delta.z / length)
    } else {
        (0.0, 0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_safe_ordering_accepts_rollover_and_rejects_stale_values() {
        assert!(is_newer_u32(0, u32::MAX));
        assert!(is_newer_u32(3, u32::MAX - 2));
        assert!(!is_newer_u32(9, 9));
        assert!(!is_newer_u32(8, 9));
        assert!(!is_newer_u32(0x8000_0000, 0));
    }

    #[test]
    fn action_advances_are_bounded_and_wrap_safe() {
        assert_eq!(counter_advance(4, 2), 2);
        assert_eq!(counter_advance(1, u32::MAX), 2);
        assert_eq!(counter_advance(100, 2), MAX_ACTION_ADVANCE);
        assert_eq!(counter_advance(2, 2), 0);
        assert_eq!(counter_advance(1, 2), 0);
    }

    #[test]
    fn first_packet_action_debt_is_rejected_against_the_player_ack() {
        assert!(action_counter_within_window(0, 0));
        assert!(action_counter_within_window(MAX_ACTION_ADVANCE, 0));
        assert!(!action_counter_within_window(MAX_ACTION_ADVANCE + 1, 0));
        assert!(!action_counter_within_window(50_000, 0));
    }

    #[test]
    fn reconnect_action_window_is_wrap_safe_and_rejects_replay_debt() {
        let acknowledged = u32::MAX - 2;
        assert!(action_counter_within_window(1, acknowledged));
        assert!(!action_counter_within_window(20, acknowledged));
        assert!(action_counter_within_window(acknowledged, acknowledged));
        assert!(action_counter_within_window(acknowledged - 1, acknowledged));
    }

    #[test]
    fn life_ids_advance_across_u32_rollover() {
        assert_eq!(next_life_id(41), 42);
        assert_eq!(next_life_id(u32::MAX), 0);
        assert!(is_newer_u32(next_life_id(u32::MAX), u32::MAX));
    }

    #[test]
    fn concurrent_connections_cannot_control_or_release_an_active_session() {
        let owner = 0x1111_u128;
        let other = 0x2222_u128;
        assert!(connection_owns_session(owner, owner));
        assert!(!connection_owns_session(owner, other));
        assert!(connection_may_claim_session(owner, owner, u64::MAX));
        assert!(!connection_may_claim_session(owner, other, u64::MAX));
        assert!(connection_may_claim_session(owner, other, 5_000));
    }

    #[test]
    fn concurrent_active_session_cannot_allocate_an_orphan_room() {
        let owner = 0x1111_u128;
        let other = 0x2222_u128;
        assert!(room_allocation_is_safe(None, other, u64::MAX));
        assert!(room_allocation_is_safe(Some(owner), owner, u64::MAX));
        assert!(!room_allocation_is_safe(Some(owner), other, u64::MAX));
        assert!(room_allocation_is_safe(Some(owner), other, 5_000));
    }

    #[test]
    fn account_feature_gate_fails_closed_and_preserves_local_opt_in() {
        assert!(!account_feature_enabled(false, None));
        assert!(!account_feature_enabled(false, Some(false)));
        assert!(!account_feature_enabled(false, Some(true)));
        assert!(!account_feature_enabled(true, None));
        assert!(!account_feature_enabled(true, Some(false)));
        assert!(account_feature_enabled(true, Some(true)));
    }

    #[test]
    fn disabled_account_attempts_consume_the_auth_rate_quota() {
        let mut persisted = AuthBudgetState {
            window_started_micros: 1_000,
            attempts: 0,
        };
        for expected in 1..=3 {
            let decision = consume_auth_budget(persisted, 2_000, 60_000_000, 3);
            assert!(decision.allowed);
            assert!(!account_feature_enabled(false, Some(true)));
            persisted = decision.state;
            assert_eq!(persisted.attempts, expected);
        }
        let denied = consume_auth_budget(persisted, 2_001, 60_000_000, 3);
        assert!(!denied.allowed);
        assert_eq!(denied.state.attempts, 3);
    }

    #[test]
    fn bot_perception_rejects_hidden_out_of_range_and_off_axis_targets() {
        assert!(bot_can_perceive(20.0, 0.9, 20.0, true));
        assert!(!bot_can_perceive(
            BOT_PERCEPTION_RANGE + 0.01,
            1.0,
            100.0,
            true
        ));
        assert!(!bot_can_perceive(20.0, 1.0, 19.0, true));
        assert!(!bot_can_perceive(20.0, 0.1, 20.0, true));
        assert!(bot_can_perceive(10.0, -1.0, 10.0, true));
        assert!(!bot_can_perceive(f32::NAN, 1.0, 100.0, false));
    }

    #[test]
    fn bot_aim_variance_and_combat_cadence_are_deterministic() {
        let seed = 0xCAFE_BABE;
        let tick = 4_200;
        let first_variance = bot_aim_variance(seed, tick);
        assert_eq!(first_variance, bot_aim_variance(seed, tick));
        assert!((-BOT_AIM_MAX_ERROR_RADIANS..=BOT_AIM_MAX_ERROR_RADIANS).contains(&first_variance));
        assert_ne!(first_variance, bot_aim_variance(seed.rotate_left(29), tick));

        let next_think = bot_next_think_tick(seed, tick);
        assert_eq!(next_think, bot_next_think_tick(seed, tick));
        assert!((tick + BOT_THINK_MIN_TICKS
            ..=tick + BOT_THINK_MIN_TICKS + BOT_THINK_JITTER_TICKS - 1)
            .contains(&next_think));
        assert!(!bot_trigger_window_open(next_think, tick));
        assert!(!bot_trigger_window_open(next_think, next_think - 2));
        assert!(bot_trigger_window_open(next_think, next_think - 1));
        assert!(!bot_trigger_window_open(next_think, next_think));

        let mut scheduled_think = bot_next_think_tick(seed, 0);
        let mut trigger_windows = 0_u8;
        for simulated_tick in 0..u64::from(TICK_RATE) * 10 {
            if simulated_tick >= scheduled_think {
                scheduled_think = bot_next_think_tick(seed, simulated_tick);
            }
            if bot_trigger_window_open(scheduled_think, simulated_tick) {
                trigger_windows = trigger_windows.saturating_add(1);
            }
        }
        assert!((8..=17).contains(&trigger_windows));

        assert!(bot_should_fire(0.98, false));
        assert!(!bot_should_fire(0.98, true));
        assert!(bot_should_fire(0.999, true));
        assert!(!bot_should_fire(f32::NAN, false));
    }

    #[test]
    fn room_and_session_cleanup_preserve_live_ownership() {
        assert!(!reconnect_session_expired(u64::MAX, 1_000));
        assert!(!reconnect_session_expired(1_000, 1_000));
        assert!(reconnect_session_expired(999, 1_000));

        let idle_ticks = 3_600;
        assert!(!idle_room_should_cleanup(
            100,
            100 + idle_ticks,
            idle_ticks,
            Some(0),
            false
        ));
        assert!(idle_room_should_cleanup(
            100,
            101 + idle_ticks,
            idle_ticks,
            Some(0),
            false
        ));
        assert!(!idle_room_should_cleanup(
            100,
            101 + idle_ticks,
            idle_ticks,
            Some(1),
            false
        ));
        assert!(!idle_room_should_cleanup(
            100,
            101 + idle_ticks,
            idle_ticks,
            Some(0),
            true
        ));
        assert!(!idle_room_should_cleanup(
            100,
            101 + idle_ticks,
            idle_ticks,
            None,
            false
        ));
    }

    #[test]
    fn reconnect_expiry_replaces_any_stranded_human_with_a_bot() {
        assert!(expired_session_requires_bot_replacement(false));
        assert!(!expired_session_requires_bot_replacement(true));
    }

    #[test]
    fn failed_auth_attempts_consume_a_durable_global_budget() {
        let mut state = AuthBudgetState {
            window_started_micros: 1_000,
            attempts: 0,
        };
        for expected in 1..=3 {
            let decision = consume_auth_budget(state, 2_000, 60_000_000, 3);
            assert!(decision.allowed);
            state = decision.state;
            assert_eq!(state.attempts, expected);
        }
        let denied = consume_auth_budget(state, 2_001, 60_000_000, 3);
        assert!(!denied.allowed);
        assert_eq!(denied.state.attempts, 3);
        assert!(denied.retry_after_micros > 0);
    }

    #[test]
    fn invalid_non_auth_packets_still_exhaust_the_committed_rate_window() {
        let mut persisted = AuthBudgetState {
            window_started_micros: 10_000,
            attempts: 0,
        };
        for _ in 0..4 {
            let invalid_packet = consume_auth_budget(persisted, 10_100, 1_000_000, 4);
            assert!(invalid_packet.allowed);
            // Reducers commit this state together with their caller-only failure row.
            persisted = invalid_packet.state;
        }
        let excessive = consume_auth_budget(persisted, 10_200, 1_000_000, 4);
        assert!(!excessive.allowed);
        assert_eq!(excessive.state.attempts, 4);
    }

    #[test]
    fn account_failures_lock_then_expire_without_revealing_account_state() {
        let mut state = FailedLoginState {
            window_started_micros: 10,
            failures: 0,
            blocked_until_micros: 0,
        };
        for offset in 0..5 {
            state = record_failed_login(state, 100 + offset, 60_000_000, 5, 300_000_000);
        }
        assert_eq!(state.failures, 5);
        assert!(failed_login_retry_after(state, 105) > 0);
        assert_eq!(
            failed_login_retry_after(state, state.blocked_until_micros),
            0
        );
    }

    #[test]
    fn claimed_shot_ticks_are_server_bounded() {
        assert_eq!(clamp_claimed_tick(1, 100), 88);
        assert_eq!(clamp_claimed_tick(99, 100), 99);
        assert_eq!(clamp_claimed_tick(150, 100), 100);
        assert_eq!(clamp_claimed_tick(0, 4), 0);
    }

    #[test]
    fn weapon_profiles_are_distinct_and_gameplay_safe() {
        assert!(RIFLE_SPEC.automatic);
        assert!(!SNIPER_SPEC.automatic);
        assert_eq!(SHOTGUN_SPEC.pellets, 12);
        assert!(SNIPER_SPEC.damage_per_pellet > RIFLE_SPEC.damage_per_pellet);
        assert!(SHOTGUN_SPEC.falloff_end < RIFLE_SPEC.falloff_end);
        for slot in [WEAPON_RIFLE, WEAPON_SNIPER, WEAPON_SHOTGUN] {
            let spec = weapon_spec(slot).expect("known weapon");
            assert!(spec.magazine > 0);
            assert!(spec.reserve > 0);
            assert!(spec.fire_interval_ticks > 0);
            assert!(spec.reload_ticks > spec.fire_interval_ticks);
        }
        assert!(weapon_spec(0).is_none());
    }

    #[test]
    fn firing_reload_and_ammo_state_machine_obeys_cooldowns() {
        assert!(can_fire_weapon(1, false, 100, 100));
        assert!(!can_fire_weapon(1, false, 101, 100));
        assert!(!can_fire_weapon(0, false, 0, 100));
        assert!(!can_fire_weapon(10, true, 0, 100));
        assert!(can_start_reload(&RIFLE_SPEC, 5, 20, false));
        assert!(!can_start_reload(
            &RIFLE_SPEC,
            RIFLE_SPEC.magazine,
            20,
            false
        ));
        assert!(!can_start_reload(&RIFLE_SPEC, 5, 0, false));
        let partial = reload_transfer(&RIFLE_SPEC, 25, 3);
        assert_eq!(
            partial,
            AmmoTransfer {
                magazine_ammo: 28,
                reserve_ammo: 0
            }
        );
        let full = reload_transfer(&RIFLE_SPEC, 5, 120);
        assert_eq!(
            full,
            AmmoTransfer {
                magazine_ammo: 30,
                reserve_ammo: 95
            }
        );
    }

    #[test]
    fn damage_death_respawn_scoring_and_match_reset_thresholds_are_exact() {
        assert_eq!(apply_health_damage(100, 24), (76, 24, false));
        assert_eq!(apply_health_damage(20, 95), (0, 20, true));
        assert!(!respawn_is_due(false, 180, 179));
        assert!(respawn_is_due(false, 180, 180));
        assert!(!respawn_is_due(true, 0, 999));
        assert!(!match_should_end(SCORE_LIMIT - 1, MATCH_DURATION_TICKS - 1));
        assert!(match_should_end(SCORE_LIMIT, 0));
        assert!(match_should_end(0, MATCH_DURATION_TICKS));
    }

    #[test]
    fn room_slots_are_always_filled_to_exact_capacity() {
        assert_eq!(bot_slots_for_humans(0), ROOM_CAPACITY);
        assert_eq!(bot_slots_for_humans(1), ROOM_CAPACITY - 1);
        assert_eq!(bot_slots_for_humans(ROOM_CAPACITY), 0);
        assert_eq!(bot_slots_for_humans(u8::MAX), 0);
        for humans in 0..=ROOM_CAPACITY {
            assert_eq!(humans + bot_slots_for_humans(humans), ROOM_CAPACITY);
        }
    }

    #[test]
    fn weapon_tuning_matches_the_shared_typescript_contract() {
        assert_eq!(
            (
                RIFLE_SPEC.magazine,
                RIFLE_SPEC.reserve,
                RIFLE_SPEC.fire_interval_ticks,
                RIFLE_SPEC.reload_ticks,
                RIFLE_SPEC.damage_per_pellet,
                RIFLE_SPEC.pellets,
            ),
            (30, 120, 6, 105, 24, 1)
        );
        assert_eq!(
            (
                SNIPER_SPEC.magazine,
                SNIPER_SPEC.reserve,
                SNIPER_SPEC.fire_interval_ticks,
                SNIPER_SPEC.reload_ticks,
                SNIPER_SPEC.damage_per_pellet,
                SNIPER_SPEC.pellets,
            ),
            (5, 20, 72, 150, 95, 1)
        );
        assert_eq!(
            (
                SHOTGUN_SPEC.magazine,
                SHOTGUN_SPEC.reserve,
                SHOTGUN_SPEC.fire_interval_ticks,
                SHOTGUN_SPEC.reload_ticks,
                SHOTGUN_SPEC.damage_per_pellet,
                SHOTGUN_SPEC.pellets,
            ),
            (8, 32, 54, 132, 12, 12)
        );
        assert_eq!(
            (
                RIFLE_SPEC.falloff_start,
                RIFLE_SPEC.falloff_end,
                RIFLE_SPEC.minimum_multiplier,
                RIFLE_SPEC.hip_spread_radians,
                RIFLE_SPEC.scoped_spread_radians,
            ),
            (35.0, 75.0, 0.55, 0.018, 0.004)
        );
        assert_eq!(
            (
                SNIPER_SPEC.falloff_start,
                SNIPER_SPEC.falloff_end,
                SNIPER_SPEC.minimum_multiplier,
                SNIPER_SPEC.hip_spread_radians,
                SNIPER_SPEC.scoped_spread_radians,
            ),
            (120.0, 170.0, 0.8, 0.035, 0.000_8)
        );
        assert_eq!(
            (
                SHOTGUN_SPEC.falloff_start,
                SHOTGUN_SPEC.falloff_end,
                SHOTGUN_SPEC.minimum_multiplier,
                SHOTGUN_SPEC.hip_spread_radians,
                SHOTGUN_SPEC.scoped_spread_radians,
            ),
            (8.0, 25.0, 0.25, 0.09, 0.065)
        );
    }

    #[test]
    fn damage_falloff_respects_endpoints() {
        assert_eq!(
            falloff_damage(&RIFLE_SPEC, RIFLE_SPEC.falloff_start),
            RIFLE_SPEC.damage_per_pellet
        );
        let far = falloff_damage(&RIFLE_SPEC, RIFLE_SPEC.falloff_end + 20.0);
        assert_eq!(
            far,
            (f32::from(RIFLE_SPEC.damage_per_pellet) * RIFLE_SPEC.minimum_multiplier).round()
                as u16
        );
        let middle = falloff_damage(
            &RIFLE_SPEC,
            (RIFLE_SPEC.falloff_start + RIFLE_SPEC.falloff_end) * 0.5,
        );
        assert!(middle < RIFLE_SPEC.damage_per_pellet);
        assert!(middle > far);
    }

    #[test]
    fn spread_is_deterministic_bounded_and_seeded() {
        let base = view_direction(0.0, 0.0);
        let first = spread_direction(base, 0.1, 42);
        let repeated = spread_direction(base, 0.1, 42);
        let other = spread_direction(base, 0.1, 43);
        assert_eq!(first, repeated);
        assert_ne!(first, other);
        assert!((first.length() - 1.0).abs() < 0.000_1);
        assert!(first.dot(base) > 0.98);
    }

    #[test]
    fn ray_hits_player_only_when_not_occluded() {
        let origin = Vec3::new(0.0, 1.55, 0.0);
        let direction = Vec3::new(0.0, 0.0, -1.0);
        let target = Vec3::new(0.0, 0.0, -10.0);
        let hit = ray_player_distance(origin, direction, target).expect("target hit");
        assert!(hit < 10.0);
        let wall = SolidAabb {
            min: Vec3::new(-2.0, 0.0, -6.0),
            max: Vec3::new(2.0, 4.0, -5.0),
        };
        let wall_distance = nearest_wall_distance(origin, direction, 100.0, &[wall]);
        assert!(wall_distance < hit);
        assert!(ray_player_distance(origin, Vec3::new(1.0, 0.0, 0.0), target).is_none());
    }

    #[test]
    fn motion_stops_at_authoritative_solid() {
        let wall = SolidAabb {
            min: Vec3::new(0.8, 0.0, -2.0),
            max: Vec3::new(1.2, 3.0, 2.0),
        };
        let bounds = WorldBounds {
            min_x: -10.0,
            max_x: 10.0,
            min_z: -10.0,
            max_z: 10.0,
        };
        let mut position = Vec3::ZERO;
        let mut velocity = Vec3::ZERO;
        let mut blocked = false;
        for _ in 0..30 {
            let motion = integrate_motion(
                position,
                velocity,
                1.0,
                0.0,
                0.0,
                false,
                false,
                bounds,
                &[wall],
                &[],
            );
            position = motion.position;
            velocity = motion.velocity;
            blocked |= motion.blocked;
        }
        assert!(blocked);
        assert!(position.x + PLAYER_RADIUS <= wall.min.x + 0.001);
        assert_eq!(position.y, 0.0);
    }

    #[test]
    fn ramp_surface_interpolates_both_directions() {
        let ramp = RampSurface {
            min_x: 0.0,
            max_x: 10.0,
            min_z: -1.0,
            max_z: 1.0,
            base_y: 0.0,
            top_y: 5.0,
            axis: 0,
            ascending_positive: true,
        };
        assert_eq!(ramp_height(ramp, 0.0, 0.0), Some(0.0));
        assert_eq!(ramp_height(ramp, 5.0, 0.0), Some(2.5));
        assert_eq!(ramp_height(ramp, 10.0, 0.0), Some(5.0));
        assert_eq!(
            ramp_height(
                RampSurface {
                    ascending_positive: false,
                    ..ramp
                },
                0.0,
                0.0
            ),
            Some(5.0)
        );
    }

    #[test]
    fn safest_spawn_maximizes_enemy_distance() {
        let spawns = [
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(10.0, 0.0, 0.0),
            Vec3::new(20.0, 0.0, 0.0),
        ];
        let enemies = [Vec3::new(1.0, 0.0, 0.0)];
        assert_eq!(select_safest_spawn(&spawns, &enemies, 7), 2);
        assert!(select_safest_spawn(&spawns, &[], 7) < spawns.len());
    }

    #[test]
    fn malformed_floats_and_buttons_are_sanitized() {
        assert_eq!(finite_clamped(f32::NAN, -1.0, 1.0, 0.25), 0.25);
        assert_eq!(finite_clamped(f32::INFINITY, -1.0, 1.0, 0.25), 0.25);
        let (x, z) = input_axes(
            BUTTON_FORWARD | BUTTON_RIGHT | 0x8000,
            f32::NAN,
            f32::INFINITY,
        );
        assert!((x * x + z * z - 1.0).abs() < 0.000_1);
        assert_eq!((BUTTON_FORWARD | 0x8000) & ALLOWED_BUTTONS, BUTTON_FORWARD);
    }
}
