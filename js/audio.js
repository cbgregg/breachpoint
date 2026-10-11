// Synthesized positional audio (WebAudio, no sound files)
const SHOTS = {
  rifle: { freq: 2600, decay: 0.13, body: 110, bodyDecay: 0.09, gain: 0.55 },
  smg: { freq: 3400, decay: 0.09, body: 140, bodyDecay: 0.06, gain: 0.45 },
  shotgun: { freq: 1500, decay: 0.32, body: 70, bodyDecay: 0.18, gain: 0.8 },
  sniper: { freq: 2200, decay: 0.5, body: 60, bodyDecay: 0.25, gain: 0.95 },
  pistol: { freq: 3000, decay: 0.11, body: 160, bodyDecay: 0.06, gain: 0.45 },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.voices = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(pos, yaw) {
    this.listener.x = pos.x; this.listener.y = pos.y; this.listener.z = pos.z; this.listener.yaw = yaw;
  }

  // gain + stereo pan from world position
  spatial(pos) {
    if (!pos) return { gain: 1, pan: 0 };
    const L = this.listener;
    const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
    const d = Math.hypot(dx, dy, dz);
    const gain = 1 / (1 + d * 0.09);
    if (d < 0.5) return { gain, pan: 0 };
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
    const pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8;
    return { gain, pan };
  }

  out(gain, pan) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  noiseBurst(dest, t, { type = 'lowpass', freq = 2000, q = 0.7, decay = 0.1, gain = 1, attack = 0.002 }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  tone(dest, t, { freq = 440, end = null, type = 'sine', decay = 0.15, gain = 0.5, attack = 0.004 }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (end) o.frequency.exponentialRampToValueAtTime(end, t + decay);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  play(name, pos, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { gain, pan } = opts.ui ? { gain: 1, pan: 0 } : this.spatial(pos);
    if (gain < 0.05) return;
    if (!opts.ui && pos && this.voices > 28) return;
    this.voices++;
    setTimeout(() => { this.voices--; }, 700);
    const t = this.ctx.currentTime;
    const out = this.out(gain, pan);
    switch (name) {
      case 'shot': {
        const s = SHOTS[opts.weapon] || SHOTS.rifle;
        this.noiseBurst(out, t, { freq: s.freq, decay: s.decay, gain: s.gain });
        this.noiseBurst(out, t, { type: 'bandpass', freq: s.freq * 1.8, q: 1.5, decay: s.decay * 0.4, gain: s.gain * 0.5 });
        this.tone(out, t, { freq: s.body, end: 35, type: 'triangle', decay: s.bodyDecay, gain: s.gain * 0.9 });
        if (opts.weapon === 'sniper') this.noiseBurst(out, t + 0.05, { freq: 600, decay: 0.8, gain: 0.25 });
        break;
      }
      case 'dry': this.tone(out, t, { freq: 1800, type: 'square', decay: 0.03, gain: 0.15 }); break;
      case 'switch':
        this.noiseBurst(out, t, { type: 'highpass', freq: 3000, decay: 0.05, gain: 0.25 });
        break;
      case 'reload': {
        const dur = opts.duration || 2;
        this.noiseBurst(out, t + 0.1, { type: 'bandpass', freq: 2500, q: 3, decay: 0.06, gain: 0.35 });
        this.noiseBurst(out, t + dur * 0.55, { type: 'bandpass', freq: 1800, q: 3, decay: 0.08, gain: 0.4 });
        this.tone(out, t + dur * 0.9, { freq: 900, type: 'square', decay: 0.04, gain: 0.12 });
        break;
      }
      case 'step': this.noiseBurst(out, t, { freq: opts.self ? 500 : 700, decay: 0.07, gain: opts.self ? 0.12 : 0.18 }); break;
      case 'jump': this.noiseBurst(out, t, { freq: 400, decay: 0.08, gain: 0.12 }); break;
      case 'land': this.noiseBurst(out, t, { freq: 300, decay: 0.14, gain: 0.3 }); break;
      case 'hit': this.tone(out, t, { freq: 1400, type: 'square', decay: 0.05, gain: 0.12 }); break;
      case 'headshot':
        this.tone(out, t, { freq: 2100, type: 'triangle', decay: 0.12, gain: 0.25 });
        this.noiseBurst(out, t, { type: 'highpass', freq: 5000, decay: 0.05, gain: 0.2 });
        break;
      case 'kill':
        this.tone(out, t, { freq: 880, type: 'triangle', decay: 0.12, gain: 0.25 });
        this.tone(out, t + 0.08, { freq: 1320, type: 'triangle', decay: 0.18, gain: 0.25 });
        break;
      case 'hurt':
        this.tone(out, t, { freq: 160, end: 60, type: 'sine', decay: 0.2, gain: 0.5 });
        this.noiseBurst(out, t, { freq: 800, decay: 0.1, gain: 0.25 });
        break;
      case 'impact': this.noiseBurst(out, t, { type: 'bandpass', freq: 3000 + Math.random() * 2000, q: 2, decay: 0.04, gain: 0.15 }); break;
      case 'explosion':
        this.noiseBurst(out, t, { freq: 900, decay: 1.4, gain: 1.0, attack: 0.005 });
        this.tone(out, t, { freq: 90, end: 25, type: 'sine', decay: 0.9, gain: 0.9 });
        break;
      case 'bounce': this.tone(out, t, { freq: 1200 + Math.random() * 400, type: 'triangle', decay: 0.05, gain: 0.2 }); break;
      case 'pin': this.noiseBurst(out, t, { type: 'highpass', freq: 4000, decay: 0.08, gain: 0.3 }); break;
      case 'pickup':
        [660, 880, 1320].forEach((f, i) => this.tone(out, t + i * 0.06, { freq: f, type: 'triangle', decay: 0.12, gain: 0.2 }));
        break;
      case 'spawn': this.tone(out, t, { freq: 300, end: 600, type: 'sine', decay: 0.3, gain: 0.2 }); break;
      case 'beep': this.tone(out, t, { freq: opts.freq || 660, type: 'square', decay: 0.12, gain: 0.15 }); break;
      case 'horn':
        this.tone(out, t, { freq: 220, type: 'sawtooth', decay: 0.9, gain: 0.25, attack: 0.05 });
        this.tone(out, t, { freq: 330, type: 'sawtooth', decay: 0.9, gain: 0.18, attack: 0.05 });
        break;
      default: break;
    }
  }
}
