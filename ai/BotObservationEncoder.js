import {
    BOT_OBSERVATION_SIZE,
    BULLET_TYPES,
    ENEMY_TYPES
} from './BotModelSchema.js';

const MAX_VELOCITY = 24;
const HOMING_LIFETIME_MS = 4000;
const DETONATION_DURATION_MS = 500;

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function normalizedVelocity(value) {
    return clamp((value || 0) / MAX_VELOCITY, -1, 1);
}

function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function addOneHot(target, type, types) {
    const index = types.indexOf(type);
    for (let i = 0; i < types.length; i++) {
        target.push(i === index ? 1 : 0);
    }
}

function bulletType(bullet) {
    return BULLET_TYPES.includes(bullet.ownerType) ? bullet.ownerType : 'other';
}

function timeUntilExplosion(bullet, currentTime) {
    if (!bullet.isHoming && !bullet.isDetonating) return 0;
    if (bullet.isDetonating) {
        return clamp((DETONATION_DURATION_MS - (currentTime - bullet.detonationStartTime)) / DETONATION_DURATION_MS, 0, 1);
    }

    const lifetime = bullet.lifetime || HOMING_LIFETIME_MS;
    return clamp((lifetime - (currentTime - bullet.createdAt)) / lifetime, 0, 1);
}

function encodeRelativeKinematics(values, entity, player, diagonal) {
    values.push(
        clamp((entity.x - player.x) / diagonal, -1, 1),
        clamp((entity.y - player.y) / diagonal, -1, 1),
        normalizedVelocity(entity.vx),
        normalizedVelocity(entity.vy)
    );
}

function addZeros(values, count) {
    for (let i = 0; i < count; i++) values.push(0);
}

export class BotObservationEncoder {
    encode(game) {
        const { player, bullets, enemies, boss, canvas, gameTime } = game;
        const diagonal = Math.max(1, Math.hypot(canvas.width, canvas.height));
        const values = [];

        values.push(
            clamp((player.x / Math.max(1, canvas.width)) * 2 - 1, -1, 1),
            clamp((player.y / Math.max(1, canvas.height)) * 2 - 1, -1, 1),
            normalizedVelocity(player.vx),
            normalizedVelocity(player.vy),
            clamp(player.energy / player.maxEnergy, 0, 1)
        );

        const nearestBullets = bullets
            .filter(bullet => bullet.source !== player && bullet.ownerType !== 'player')
            .sort((a, b) => distanceSquared(a, player) - distanceSquared(b, player))
            .slice(0, 12);

        nearestBullets.forEach(bullet => {
            encodeRelativeKinematics(values, bullet, player, diagonal);
            addOneHot(values, bulletType(bullet), BULLET_TYPES);
            values.push(
                bullet.isHoming ? 1 : 0,
                bullet.isDetonating ? 1 : 0,
                timeUntilExplosion(bullet, gameTime),
                1
            );
        });
        addZeros(values, (12 - nearestBullets.length) * 12);

        const riflemen = enemies
            .filter(enemy => enemy.type === 'rifleman')
            .sort((a, b) => distanceSquared(a, player) - distanceSquared(b, player))
            .slice(0, 2);
        const selectedEnemies = [...riflemen];
        const remainingEnemies = enemies
            .filter(enemy => !selectedEnemies.includes(enemy))
            .sort((a, b) => distanceSquared(a, player) - distanceSquared(b, player));
        selectedEnemies.push(...remainingEnemies.slice(0, 10 - selectedEnemies.length));

        selectedEnemies.forEach(enemy => {
            encodeRelativeKinematics(values, enemy, player, diagonal);
            addOneHot(values, enemy.type, ENEMY_TYPES);
            values.push(gameTime < (enemy.shieldExpiry || 0) ? 1 : 0, 1);
        });
        addZeros(values, (10 - selectedEnemies.length) * 11);

        if (boss) {
            encodeRelativeKinematics(values, boss, player, diagonal);
            values.push(boss.isInvulnerable ? 1 : 0, 1);
        } else {
            addZeros(values, 6);
        }

        if (values.length !== BOT_OBSERVATION_SIZE) {
            throw new Error(`Invalid bot observation size: expected ${BOT_OBSERVATION_SIZE}, received ${values.length}`);
        }
        return new Float32Array(values);
    }
}