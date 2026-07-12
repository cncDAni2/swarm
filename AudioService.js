export class AudioService {
    constructor() {
        this.sounds = {
            shoot: [],
            enemyShoot: null,
            enemyPlasma: null,
            newRound: [],
            damaged: null,
            damagedHeavy: null,
            gameOver: null
        };
        this.loadSounds();
    }

    loadSounds() {
        // Preload shoot-player-laser-1.mp3 and shoot-player-laser-2.mp3
        const laser1 = new Audio('./assets/shoot-player-laser-1.mp3');
        const laser2 = new Audio('./assets/shoot-player-laser-2.mp3');
        laser1.load();
        laser2.load();
        this.sounds.shoot.push(laser1, laser2);

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

        // Game Over sound
        this.sounds.gameOver = new Audio('./assets/game-over.mp3');
        this.sounds.gameOver.load();
    }

    playNewRound() {
        const sound = this.sounds.newRound[Math.floor(Math.random() * this.sounds.newRound.length)];
        this._playSound(sound);
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

    playRandomShoot() {
        // 80% chance for laser 1, 20% for laser 2
        const sound = Math.random() < 0.8 ? this.sounds.shoot[0] : this.sounds.shoot[1];
        this._playSound(sound);
    }

    playEnemyShoot() {
        this._playSound(this.sounds.enemyShoot);
    }

    playEnemyPlasma() {
        this._playSound(this.sounds.enemyPlasma);
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
