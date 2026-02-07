// Ambient Audio System - Procedural nature sounds using Web Audio API

export class AmbientAudioManager {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private initialized = false;

    // Sound layers
    private windNode: { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
    private insectNode: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode; lfoGain: GainNode } | null = null;
    private waterNode: { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
    private birdTimeout: ReturnType<typeof setTimeout> | null = null;
    private birdGain: GainNode | null = null;
    private rainNode: { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

    // State
    private _enabled = true;
    private _volume = 0.7;
    private disposed = false;

    get enabled() { return this._enabled; }
    set enabled(v: boolean) {
        this._enabled = v;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(v ? this._volume : 0, this.ctx!.currentTime, 0.3);
        }
    }

    get volume() { return this._volume; }
    set volume(v: number) {
        this._volume = v;
        if (this.masterGain && this._enabled) {
            this.masterGain.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.3);
        }
    }

    init() {
        if (this.initialized || this.disposed) return;
        try {
            this.ctx = new AudioContext();
            // Resume suspended AudioContext (browser policy)
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this._enabled ? this._volume : 0;
            this.masterGain.connect(this.ctx.destination);
            this.setupWind();
            this.setupInsects();
            this.setupWater();
            this.setupBirdGain();
            this.setupRain();
            this.initialized = true;
        } catch (e) {
            console.warn('AmbientAudio: Failed to initialize', e);
        }
    }

    private createNoiseBuffer(duration: number): AudioBuffer {
        const ctx = this.ctx!;
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    private setupWind() {
        const ctx = this.ctx!;
        const buffer = this.createNoiseBuffer(4);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 400;
        filter.Q.value = 0.5;

        // LFO for wind swell
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.15;
        lfoGain.gain.value = 200;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();

        const gain = ctx.createGain();
        gain.gain.value = 0;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);
        source.start();

        this.windNode = { source, gain, filter };
    }

    private setupInsects() {
        const ctx = this.ctx!;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 4800;

        // Amplitude modulation for chirp effect
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 12;
        lfoGain.gain.value = 0.5;
        lfo.connect(lfoGain);

        const gain = ctx.createGain();
        gain.gain.value = 0;
        lfoGain.connect(gain.gain);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start();
        lfo.start();

        this.insectNode = { osc, gain, lfo, lfoGain };
    }

    private setupWater() {
        const ctx = this.ctx!;
        const buffer = this.createNoiseBuffer(3);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1500;
        filter.Q.value = 0.3;

        const gain = ctx.createGain();
        gain.gain.value = 0;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);
        source.start();

        this.waterNode = { source, gain, filter };
    }

    private setupBirdGain() {
        const ctx = this.ctx!;
        this.birdGain = ctx.createGain();
        this.birdGain.gain.value = 1.0;
        this.birdGain.connect(this.masterGain!);
    }

    private playBirdChirp() {
        if (!this.ctx || !this.birdGain || this.disposed) return;
        const ctx = this.ctx;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const startFreq = 2500 + Math.random() * 1500;
        const endFreq = startFreq + (Math.random() - 0.5) * 1000;
        osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + 0.15);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.50, ctx.currentTime + 0.02);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(this.birdGain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
    }

    private scheduleBirds(isDay: boolean) {
        if (this.birdTimeout) clearTimeout(this.birdTimeout);
        if (!isDay || this.disposed) return;

        const chirpCount = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < chirpCount; i++) {
            setTimeout(() => this.playBirdChirp(), i * 120);
        }

        const nextDelay = 3000 + Math.random() * 8000;
        this.birdTimeout = setTimeout(() => this.scheduleBirds(isDay), nextDelay);
    }

    private setupRain() {
        const ctx = this.ctx!;
        const buffer = this.createNoiseBuffer(2);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 800;
        filter.Q.value = 0.2;

        const gain = ctx.createGain();
        gain.gain.value = 0;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);
        source.start();

        this.rainNode = { source, gain, filter };
    }

    private _lastBirdState = false;

    update(time: number, weather: string, isNight: boolean) {
        if (!this.initialized || !this.ctx || this.disposed) return;

        // Ensure AudioContext is running
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const ct = this.ctx.currentTime;
        const isDay = !isNight;
        const isRaining = weather === 'rainy';

        // Wind: disabled (user request - irritating sound)
        if (this.windNode) {
            let windVol = 0; // Disabled
            // if (isNight) windVol = 0.50;
            // if (isRaining) windVol = 0.70;
            this.windNode.gain.gain.setTargetAtTime(windVol, ct, 2.0);
        }

        // Insects: night only
        if (this.insectNode) {
            const insectVol = isNight && !isRaining ? 0.18 : 0;
            this.insectNode.gain.gain.setTargetAtTime(insectVol, ct, 2.0);
            // Vary frequency slightly
            this.insectNode.osc.frequency.setTargetAtTime(4800 + Math.sin(time * 0.1) * 500, ct, 1.0);
        }

        // Water: always low, slight increase in rain
        if (this.waterNode) {
            const waterVol = isRaining ? 0.40 : 0.22;
            this.waterNode.gain.gain.setTargetAtTime(waterVol, ct, 2.0);
        }

        // Birds: day only, scheduled chirps
        if (isDay && !this._lastBirdState) {
            this.scheduleBirds(true);
        } else if (!isDay && this._lastBirdState) {
            if (this.birdTimeout) clearTimeout(this.birdTimeout);
            this.birdTimeout = null;
        }
        this._lastBirdState = isDay;

        // Rain: only during rain weather
        if (this.rainNode) {
            const rainVol = isRaining ? 0.80 : 0;
            this.rainNode.gain.gain.setTargetAtTime(rainVol, ct, 2.0);
        }
    }

    dispose() {
        this.disposed = true;
        if (this.birdTimeout) clearTimeout(this.birdTimeout);
        if (this.ctx) {
            this.ctx.close().catch(() => {});
        }
        this.initialized = false;
    }
}

// Singleton instance
let _instance: AmbientAudioManager | null = null;

export function getAmbientAudio(): AmbientAudioManager {
    if (!_instance) {
        _instance = new AmbientAudioManager();
    }
    return _instance;
}
