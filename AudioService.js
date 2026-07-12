export class AudioService {
    constructor() {
        this.sounds = {
            shoot: [],
            enemyShoot: null,
            enemyPlasma: null,
            newRound: [],
            damaged: null,
            damagedHeavy: null,
            bossDamaged: null,
            gameOver: null,
            spawn: null,
            menuAmbience: null,
            reviAttack: null,
            reviShoot: null
        };
        this.loadSounds();
    }

    loadSounds() {
        // Preload menu ambience
        this.sounds.menuAmbience = new Audio('./assets/menu-ambience.mp3');
        this.sounds.menuAmbience.loop = true;
        this.sounds.menuAmbience.load();

        // Preload shoot-player-laser-1.mp3 and shoot-player-laser-2.mp3
        const laser1 = new Audio('./assets/shoot-player-laser-1.mp3');
        const laser2 = new Audio('./assets/shoot-player-laser-2.mp3');
        laser1.load();
        laser2.load();
        this.sounds.shoot.push(laser1, laser2);

        // Preload strong player laser
        this.sounds.shootStrong = new Audio('./assets/shoot-player-laser-strong.mp3');
        this.sounds.shootStrong.load();

        // Preload enemy laser
        this.sounds.enemyShoot = new Audio('./assets/shoot-enemy-laser.mp3');
        this.sounds.enemyShoot.load();

        // Preload plasma sound
        this.sounds.enemyPlasma = new Audio('./assets/shoot-enemy-plasma.mp3');
        this.sounds.enemyPlasma.load();

        // New Round sounds
        for (let i = 1; i <= 3; i++) {
            const rd = new Audio(`./assets/new-round${i}.mp3`);
            rd.load();
            this.sounds.newRound.push(rd);
        }

        // Damage sounds
        this.sounds.damaged = new Audio('./assets/damaged.mp3');
        this.sounds.damaged.load();
        this.sounds.damagedHeavy = new Audio('./assets/damaged-heavy.mp3');
        this.sounds.damagedHeavy.load();

        this.sounds.bossDamaged = new Audio('./assets/Boss damaged.mp3');
        this.sounds.bossDamaged.load();

        // Game Over sound
        this.sounds.gameOver = new Audio('./assets/game-over.mp3');
        this.sounds.gameOver.load();

        // Spawn sound
        this.sounds.spawn = new Audio('./assets/spawn.mp3');
        this.sounds.spawn.volume = 0.66;
        this.sounds.spawn.load();

        // Revi attack sound
        this.sounds.reviAttack = new Audio('./assets/revi-attack.mp3');
        this.sounds.reviAttack.load();

        // Revi shoot sound
        this.sounds.reviShoot = new Audio('./assets/revi-shoot.mp3');
        this.sounds.reviShoot.load();
    }

    playNewRound() {
        const sound = this.sounds.newRound[Math.floor(Math.random() * this.sounds.newRound.length)];
        this._playSound(sound);
    }

    playReviAttack() {
        this._playSound(this.sounds.reviAttack);
    }

    playReviShoot() {
        this._playSound(this.sounds.reviShoot);
    }

    playDamaged() {
        this._playSound(this.sounds.damaged);
    }

    playDamagedHeavy() {
        this._playSound(this.sounds.damagedHeavy);
    }

    playGameOver() {
        this._playSound(this.sounds.gameOver);
    }

    playBossDamaged() {
        this._playSound(this.sounds.bossDamaged);
    }

    playSpawn() {
        this._playSound(this.sounds.spawn);
    }

    playRandomShoot() {
        // 80% chance for laser 1, 20% for laser 2
        const sound = Math.random() < 0.8 ? this.sounds.shoot[0] : this.sounds.shoot[1];
        this._playSound(sound);
    }

    playStrongShoot() {
        this._playSound(this.sounds.shootStrong);
    }

    playEnemyShoot() {
        this._playSound(this.sounds.enemyShoot);
    }

    playEnemyPlasma() {
        this._playSound(this.sounds.enemyPlasma);
    }

    playMenuAmbience() {
        this.sounds.menuAmbience.volume = 1.0;
        this._playSound(this.sounds.menuAmbience);
    }

    stopMenuAmbience() {
        if (this.sounds.menuAmbience) {
            this.sounds.menuAmbience.pause();
            this.sounds.menuAmbience.currentTime = 0;
        }
    }

    stopAll() {
        Object.values(this.sounds).forEach(sound => {
            if (Array.isArray(sound)) {
                sound.forEach(s => {
                    s.pause();
                    s.currentTime = 0;
                });
            } else if (sound) {
                sound.pause();
                sound.currentTime = 0;
            }
        });
    }

    _playSound(sound) {
        if (!sound) return;
        
        // Restart if already playing to allow rapid fire overlap
        if (!sound.paused) {
            sound.currentTime = 0;
        }
        sound.play().catch(e => {
            // Browser might block auto-play until user interaction
            console.warn("Audio play failed:", e);
        });
    }
}
