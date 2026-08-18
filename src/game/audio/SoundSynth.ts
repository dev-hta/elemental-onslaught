// @ts-nocheck
/**
 * SoundSynth.ts — Pure Web Audio API procedural sound effects.
 * Zero external audio assets required. Generates punchy, dynamic sci-fi & fantasy
 * elemental audio effects, impacts, monster growls, and destruction sounds.
 */

class SoundSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.volume = 0.7;
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(1, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.masterGain.connect(this.ctx.destination);
      this._initialized = true;
    } catch (e) {
      console.warn('AudioContext initialization failed', e);
    }
  }

  _resume() {
    if (!this._initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  // --- Utility Synthesizer Helpers ---

  _noiseBuffer(duration = 0.5) {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // --- Spell Casts ---

  playCast(element) {
    this._resume();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    switch (element) {
      case 'ice': {
        // Crisp crystal rush with high sweep
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.28);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1800, now);
        filter.Q.setValueAtTime(3.5, now);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.35);

        // Noise layer (frost wind)
        const noise = this.ctx.createBufferSource();
        const nGain = this.ctx.createGain();
        const nFilter = this.ctx.createBiquadFilter();

        noise.buffer = this._noiseBuffer(0.3);
        nFilter.type = 'highpass';
        nFilter.frequency.setValueAtTime(2400, now);
        nGain.gain.setValueAtTime(0.2, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.sfxGain);
        noise.start(now);
        break;
      }

      case 'thunder': {
        // Sharp electric zap and crack
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.15);

        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.22);

        // Distorted noise burst
        const noise = this.ctx.createBufferSource();
        const nGain = this.ctx.createGain();
        const nFilter = this.ctx.createBiquadFilter();
        noise.buffer = this._noiseBuffer(0.2);
        nFilter.type = 'bandpass';
        nFilter.frequency.setValueAtTime(1200, now);
        nFilter.Q.setValueAtTime(1.5, now);

        nGain.gain.setValueAtTime(0.4, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.sfxGain);
        noise.start(now);
        break;
      }

      case 'meteor': {
        // Deep whoosh and launch rumble
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.45);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.46);

        // Fire hiss
        const noise = this.ctx.createBufferSource();
        const nGain = this.ctx.createGain();
        const nFilter = this.ctx.createBiquadFilter();
        noise.buffer = this._noiseBuffer(0.4);
        nFilter.type = 'lowpass';
        nFilter.frequency.setValueAtTime(800, now);
        nGain.gain.setValueAtTime(0.3, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.sfxGain);
        noise.start(now);
        break;
      }

      case 'beam': {
        // Futuristic charging pitch up + energy hum
        const osc = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(960, now + 0.35);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(640, now);
        osc2.frequency.exponentialRampToValueAtTime(1920, now + 0.35);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc2.start(now);
        osc.stop(now + 0.75);
        osc2.stop(now + 0.75);
        break;
      }

      case 'snare': {
        // Dimensional warp / gravity pulse
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(480, now + 0.2);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.55);
        break;
      }
    }
  }

  // --- Elemental Impact & Explosions ---

  playImpact(element) {
    this._resume();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    switch (element) {
      case 'ice': {
        // Shattering crystal impact
        for (let i = 0; i < 3; i++) {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          const freq = 1200 + i * 450 + Math.random() * 300;
          osc.frequency.setValueAtTime(freq, now + i * 0.03);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + i * 0.03 + 0.2);

          gain.gain.setValueAtTime(0.25, now + i * 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.03 + 0.22);

          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(now + i * 0.03);
          osc.stop(now + i * 0.03 + 0.25);
        }
        break;
      }

      case 'thunder': {
        // Deep thunder boom + crackle
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
      }

      case 'meteor': {
        // Heavy explosive detonation
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.6);

        gain.gain.setValueAtTime(0.65, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.7);

        // Sub bass thump
        const sub = this.ctx.createOscillator();
        const sGain = this.ctx.createGain();
        sub.type = 'triangle';
        sub.frequency.setValueAtTime(50, now);
        sub.frequency.exponentialRampToValueAtTime(20, now + 0.4);
        sGain.gain.setValueAtTime(0.6, now);
        sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        sub.connect(sGain);
        sGain.connect(this.sfxGain);
        sub.start(now);
        sub.stop(now + 0.5);
        break;
      }

      case 'beam': {
        // Continuous discharge blast
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.35);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.45);
        break;
      }

      case 'snare': {
        // Spatial implosion snap
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(360, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.35);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }
    }
  }

  // --- 5 Unique Elemental Monster Destruction Audio ---

  playEnemyDestroy(element) {
    this._resume();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    switch (element) {
      case 'ice': {
        // Ice Shatter: Multiple cascading crystal breaks + glassy tinkles
        for (let i = 0; i < 4; i++) {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1600 + Math.random() * 800, now + i * 0.04);
          osc.frequency.exponentialRampToValueAtTime(400, now + i * 0.04 + 0.18);
          gain.gain.setValueAtTime(0.3, now + i * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.2);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(now + i * 0.04);
          osc.stop(now + i * 0.04 + 0.22);
        }
        break;
      }

      case 'thunder': {
        // Electrocution Overload: rapid multi-pitch electric arcing zaps
        for (let i = 0; i < 5; i++) {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(600 + (i % 2 === 0 ? 800 : -200) + Math.random() * 200, now + i * 0.03);
          osc.frequency.exponentialRampToValueAtTime(120, now + i * 0.03 + 0.12);
          gain.gain.setValueAtTime(0.32, now + i * 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.03 + 0.14);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(now + i * 0.03);
          osc.stop(now + i * 0.03 + 0.16);
        }
        break;
      }

      case 'meteor': {
        // Incineration Blast: Heavy crackling boom + fiery roar
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.5);
        gain.gain.setValueAtTime(0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.52);
        break;
      }

      case 'beam': {
        // Laser Vaporization: Rising energy fizzle and clean dissolve
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.35);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.42);
        break;
      }

      case 'snare': {
        // Vortex Singularity: deep suction whoosh collapsing to silence with a pop
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.3);
        osc.frequency.setValueAtTime(880, now + 0.31);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.45);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.48);
        break;
      }
    }
  }

  // --- Player & Combat Feedback ---

  playDash() {
    this._resume();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.1);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.25);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playPlayerHit() {
    this._resume();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.2);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playEnemyHit() {
    this._resume();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playWaveClear() {
    this._resume();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880]; // A Major chime
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      gain.gain.setValueAtTime(0.25, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.6);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.65);
    });
  }

  playWaveStart() {
    this._resume();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.4);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.65);
  }

  playGameOver() {
    this._resume();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [330, 293.66, 261.63, 196];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.25);
      gain.gain.setValueAtTime(0.3, now + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.25 + 0.8);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.25);
      osc.stop(now + i * 0.25 + 0.85);
    });
  }
}

export const soundSynth = new SoundSynth();
