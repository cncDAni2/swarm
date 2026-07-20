export class AudioService {
    constructor({ muted = false } = {}) {
        this.muted = muted;
        this.sounds = {
            shoot: [
                new Audio('./assets/shoot-player-laser-1.mp3'),
                new Audio('./assets/shoot-player-laser-2.mp3')
            ],
            shootStrong: new Audio('./assets/shoot-player-laser-strong.mp3')
        };
        this.sounds.shoot.forEach(sound => sound.load());
        this.sounds.shootStrong.load();
    }

    playRandomShoot() {
        const sound = Math.random() < 0.8 ? this.sounds.shoot[0] : this.sounds.shoot[1];
        this.play(sound, true);
    }

    playStrongShoot() {
        this.play(this.sounds.shootStrong, true);
    }

    stopAll() {
        Object.values(this.sounds).flat().forEach(sound => {
            sound.pause();
            sound.currentTime = 0;
        });
    }

    play(sound, overlap = false) {
        if (this.muted || !sound) return;
        const source = overlap ? sound.cloneNode() : sound;
        if (!overlap && !source.paused) source.currentTime = 0;
        source.play().catch(() => {});
    }
}
