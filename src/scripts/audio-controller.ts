/**
 * Ambient audio for the experience (Q6). The player is fully wired but
 * silent until a track exists at TRACK_URL -- drop the file in and it
 * lights up. Autoplay strategy: browsers block un-gestured audio, so we
 * attempt play() immediately and, if blocked, retry on the first
 * pointer/key gesture. Preference persists in localStorage; OFF wins
 * over autoplay on return visits.
 */

const TRACK_URL = "/audio/ambient.mp3";
const PREF_KEY = "oscen-sound";
const FADE_SECONDS = 2.5;
const TARGET_VOLUME = 0.35;

export class AudioController {
    private audio: HTMLAudioElement | null = null;
    private available = false;
    private enabled: boolean;
    private fadeRaf = 0;
    private listeners: Array<(on: boolean, available: boolean) => void> = [];

    constructor() {
        this.enabled = localStorage.getItem(PREF_KEY) !== "off";
        this._probe();
    }

    /** fn fires immediately with current state, then on every change. */
    onChange(fn: (on: boolean, available: boolean) => void) {
        this.listeners.push(fn);
        fn(this.enabled && this.playing, this.available);
    }

    get playing(): boolean {
        return !!this.audio && !this.audio.paused;
    }

    toggle() {
        if (!this.available) return;
        this.enabled = !this.enabled;
        localStorage.setItem(PREF_KEY, this.enabled ? "on" : "off");
        if (this.enabled) this._play();
        else this._fadeOut();
        this._notify();
    }

    private async _probe() {
        try {
            const res = await fetch(TRACK_URL, { method: "HEAD" });
            const type = res.headers.get("content-type") || "";
            // Astro dev/preview return index.html for missing assets; require audio/*
            this.available = res.ok && type.startsWith("audio");
        } catch {
            this.available = false;
        }
        if (!this.available) {
            this._notify();
            return;
        }

        this.audio = new Audio(TRACK_URL);
        this.audio.loop = true;
        this.audio.volume = 0;
        this._notify();

        if (this.enabled) {
            // Attempt autoplay; on NotAllowedError arm a one-shot gesture unlock.
            this._play().catch(() => this._armGestureUnlock());
        }
    }

    private _armGestureUnlock() {
        const unlock = () => {
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
            if (this.enabled) this._play();
        };
        window.addEventListener("pointerdown", unlock, { once: true });
        window.addEventListener("keydown", unlock, { once: true });
    }

    private async _play() {
        if (!this.audio) return;
        await this.audio.play(); // throws if blocked; caller handles
        this._fadeTo(TARGET_VOLUME);
        this._notify();
    }

    private _fadeOut() {
        this._fadeTo(0, () => this.audio?.pause());
    }

    private _fadeTo(target: number, done?: () => void) {
        if (!this.audio) return;
        cancelAnimationFrame(this.fadeRaf);
        const start = this.audio.volume;
        const t0 = performance.now();
        const step = (t: number) => {
            if (!this.audio) return;
            const k = Math.min(1, (t - t0) / (FADE_SECONDS * 1000));
            this.audio.volume = start + (target - start) * k;
            if (k < 1) this.fadeRaf = requestAnimationFrame(step);
            else done?.();
        };
        this.fadeRaf = requestAnimationFrame(step);
    }

    private _notify() {
        for (const fn of this.listeners) fn(this.enabled && this.playing, this.available);
    }
}
