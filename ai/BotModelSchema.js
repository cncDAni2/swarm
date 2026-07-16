export const BOT_SCHEMA_VERSION = 1;
export const BOT_DECISION_INTERVAL_MS = 250;

export const BULLET_TYPES = ['enemy', 'sky-pulse', 'boss-spiral', 'other'];
export const ENEMY_TYPES = ['melee', 'rifleman', 'flanker', 'sky-pulse', 'revi'];

export const BOT_OBSERVATION_SIZE = 265;

export const BOT_METADATA = {
    schemaVersion: BOT_SCHEMA_VERSION,
    decisionIntervalMs: BOT_DECISION_INTERVAL_MS,
    observationSize: BOT_OBSERVATION_SIZE,
    observation: {
        player: ['x', 'y', 'vx', 'vy', 'energyPercent'],
        bullets: {
            slots: 12,
            features: ['dx', 'dy', 'vx', 'vy', 'ownerType', 'isHoming', 'isDetonating', 'timeUntilExplosion', 'present']
        },
        enemies: {
            slots: 10,
            riflemanSlots: 2,
            features: ['dx', 'dy', 'vx', 'vy', 'type', 'shielded', 'present']
        },
        boss: ['dx', 'dy', 'vx', 'vy', 'isInvulnerable', 'present']
    },
    action: {
        movementDirections: 9,
        aimDirections: 16,
        fire: 'boolean',
        electricBeam: false
    }
};

export function createBotMetadata(extra = {}) {
    return {
        ...BOT_METADATA,
        ...extra,
        createdAt: new Date().toISOString()
    };
}