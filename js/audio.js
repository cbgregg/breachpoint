// Synthesized positional audio (WebAudio, no sound files): layered gunshots with distance filtering,
// a convolution "street" reverb, mechanical foley, hit/kill confirms.
const SHOTS = {
  rifle: { crack: 3800, body: 1400, thump: 95, decay: 0.16, tail: 0.55, gain: 0.6 },
  smg: { crack: 4500, body: 1800, thump: 120, decay: 0.11, tail: 0.4, gain: 0.5 },
  shotgun: { crack: 2600, body: 900, thump: 65, decay: 0.3, tail: 0.9, gain: 0.85 },
  sniper: { crack: 3200, body: 1100, thump: 55, decay: 0.38, tail: 1.3, gain: 1.0 },
  pistol: { crack: 4200, body: 1600, thump: 130, decay: 0.12, tail: 0.45, gain: 0.5 },
  kv47: { crack: 3500, body: 1250, thump: 85, decay: 0.18, tail: 0.6, gain: 0.66 },
  br308: { crack: 3300, body: 1150, thump: 75, decay: 0.22, tail: 0.75, gain: 0.75 },
  hx60: { crack: 3600, body: 1300, thump: 80, decay: 0.18, tail: 0.65, gain: 0.66 },
  krv45: { crack: 4800, body: 2000, thump: 135, decay: 0.09, tail: 0.35, gain: 0.45 },
  mr14: { crack: 3300, body: 1150, thump: 70, decay: 0.26, tail: 0.95, gain: 0.8 },
  sa12: { crack: 2700, body: 950, thump: 70, decay: 0.26, tail: 0.8, gain: 0.8 },
  d50: { crack: 3400, body: 1100, thump: 85, decay: 0.2, tail: 0.75, gain: 0.8 },
  r357: { crack: 3200, body: 1000, thump: 80, decay: 0.24, tail: 0.8, gain: 0.85 },
  mp18: { crack: 4600, body: 1900, thump: 140, decay: 0.09, tail: 0.32, gain: 0.42 },
  monte: { crack: 1600, body: 500, thump: 45, decay: 0.45, tail: 1.4, gain: 0.95 },
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
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.15;
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // reverb: slapback-heavy impulse to suggest buildings around the player
    const irLen = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const x = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        const t = i / ctx.sampleRate;
        let v = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2) * 0.5;
        for (const [at, amp] of [[0.045, 0.6], [0.11, 0.4], [0.19, 0.28], [0.31, 0.16]]) {
          if (Math.abs(t - at - ch * 0.007) < 0.004) v += (Math.random() * 2 - 1) * amp;
        }
        x[i] = v;
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.32;
    this.reverb.connect(this.reverbGain).connect(this.master);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
    if (this.onVolume) this.onVolume();
  }

  setListener(pos, yaw) {
    this.listener.x = pos.x; this.listener.y = pos.y; this.listener.z = pos.z; this.listener.yaw = yaw;
  }

  spatial(pos) {
    if (!pos) return { gain: 1, pan: 0, dist: 0 };
    const L = this.listener;
    const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
    const d = Math.hypot(dx, dy, dz);
    const gain = 1 / (1 + d * 0.08);
    if (d < 0.5) return { gain, pan: 0, dist: d };
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
    const pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.85;
    return { gain, pan, dist: d };
  }

  // output chain: [lowpass by distance] -> gain -> panner -> master (+ reverb send)
  out(gain, pan, dist, wet = 0.5) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    let head = g;
    if (dist > 3) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(900, 16000 / (1 + dist * 0.12));
      lp.connect(g);
      head = lp;
    }
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet * (0.6 + Math.min(1, dist / 40));
      g.connect(send).connect(this.reverb);
    }
    return head;
  }

  noiseBurst(dest, t, { type = 'lowpass', freq = 2000, q = 0.7, decay = 0.1, gain = 1, attack = 0.002, rate = 1 }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate * (0.85 + Math.random() * 0.3);
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

  tone(dest, t, { freq = 440, end = null, type = 'sine', decay = 0.15, gain = 0.5, attack = 0.003 }) {
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

  click(dest, t, freq = 3000, gain = 0.3) {
    this.noiseBurst(dest, t, { type: 'bandpass', freq, q: 4, decay: 0.035, gain });
    this.tone(dest, t, { freq: freq * 0.4, type: 'square', decay: 0.02, gain: gain * 0.25 });
  }

  play(name, pos, opts = {}) {
    if (this.muted) return;
    if (!this.ctx || this.ctx.state !== 'running') return;
    const sp = opts.ui ? { gain: 1, pan: 0, dist: 0 } : this.spatial(pos);
    if (sp.gain < 0.05) return;
    if (!opts.ui && pos && this.voices > 30) return;
    this.voices++;
    setTimeout(() => { this.voices--; }, 800);
    const t = this.ctx.currentTime;
    const dry = (wet = 0.15) => this.out(sp.gain, sp.pan, sp.dist, wet);
    switch (name) {
      case 'shot': {
        const s = SHOTS[opts.weapon] || SHOTS.rifle;
        const q = !!opts.quiet; // suppressed: no supersonic-sounding crack, muffled body, short tail, carries less
        if (q && pos && sp.dist > 35) break;
        const near = sp.dist < 25;
        const o = dry(q ? 0.3 : 0.9);
        if (near && !q) this.noiseBurst(o, t, { type: 'highpass', freq: s.crack, decay: 0.03, gain: s.gain * 0.9, attack: 0.0008 });
        if (q) this.noiseBurst(o, t, { type: 'bandpass', freq: 2200, q: 1.4, decay: 0.035, gain: s.gain * 0.22, attack: 0.001 });
        this.noiseBurst(o, t, { type: 'bandpass', freq: s.body * (q ? 0.55 : 1), q: 0.9, decay: s.decay * (q ? 0.6 : 1), gain: s.gain * (q ? 0.3 : 1) });
        this.tone(o, t, { freq: s.thump, end: 30, type: 'sine', decay: s.decay * (q ? 0.8 : 1.4), gain: s.gain * (q ? 0.35 : 1.1) });
        if (!q) this.noiseBurst(o, t + 0.01, { freq: 700, decay: s.tail, gain: s.gain * 0.35, attack: 0.02 });
        if (!pos) {
          if (opts.weapon === 'sniper') { this.click(o, t + 0.45, 2200, 0.25); this.click(o, t + 0.75, 1800, 0.25); }
          if (opts.weapon === 'shotgun') { this.click(o, t + 0.35, 1500, 0.3); this.click(o, t + 0.55, 1200, 0.3); }
        }
        break;
      }
      case 'dry': this.click(dry(0), t, 3500, 0.2); break;
      case 'switch': { const o = dry(0); this.click(o, t, 2600, 0.15); this.noiseBurst(o, t + 0.05, { freq: 1200, decay: 0.12, gain: 0.1 }); break; }
      case 'reload': {
        const dur = opts.duration || 2;
        const o = dry(0.05);
        if (opts.weapon === 'shotgun') {
          for (let i = 0; i < 4; i++) this.click(o, t + 0.25 + i * dur * 0.2, 1800, 0.22);
          this.click(o, t + dur * 0.92, 1200, 0.35);
        } else {
          this.click(o, t + dur * 0.22, 2400, 0.25);
          this.noiseBurst(o, t + dur * 0.25, { freq: 900, decay: 0.08, gain: 0.12 });
          this.click(o, t + dur * 0.62, 2000, 0.4);
          this.click(o, t + dur * 0.84, 3000, 0.25);
        }
        break;
      }
      case 'step': {
        const o = dry(0.05);
        this.noiseBurst(o, t, { freq: opts.self ? 420 : 650, decay: opts.run ? 0.09 : 0.07, gain: opts.self ? 0.1 : 0.3 });
        this.noiseBurst(o, t + 0.01, { type: 'bandpass', freq: 2500, q: 2, decay: 0.03, gain: opts.self ? 0.025 : 0.08 });
        break;
      }
      case 'jump': this.noiseBurst(dry(0), t, { freq: 500, decay: 0.08, gain: 0.1 }); break;
      case 'land': this.noiseBurst(dry(0.1), t, { freq: 320, decay: 0.16, gain: 0.3 }); break;
      case 'slide': this.noiseBurst(dry(0.05), t, { type: 'bandpass', freq: 1400, q: 0.6, decay: 0.6, gain: 0.25, attack: 0.03 }); break;
      case 'hit': {
        const o = dry(0);
        this.noiseBurst(o, t, { type: 'highpass', freq: 5000, decay: 0.025, gain: 0.32, attack: 0.0006 });
        this.tone(o, t, { freq: 2900, type: 'triangle', decay: 0.04, gain: 0.12 });
        break;
      }
      case 'headshot': {
        // the "ching": a struck steel plate. Inharmonic bell partials ring out over a crisp tick, with a
        // touch of room so it hangs in the air for a moment
        const o = dry(0.22), f = 1780 * (0.97 + Math.random() * 0.06);
        this.noiseBurst(o, t, { type: 'highpass', freq: 7000, decay: 0.025, gain: 0.32, attack: 0.0004 });
        this.tone(o, t, { freq: 950, end: 720, type: 'triangle', decay: 0.05, gain: 0.07, attack: 0.0006 });
        for (const [m, d, gn] of [[1, 0.75, 0.2], [2.76, 0.48, 0.11], [5.4, 0.28, 0.055], [8.93, 0.16, 0.03]]) {
          this.tone(o, t, { freq: f * m, type: 'sine', decay: d, gain: gn, attack: 0.0008 });
          this.tone(o, t, { freq: f * m * 1.004, type: 'sine', decay: d * 0.8, gain: gn * 0.45, attack: 0.0008 }); // slight beat = shimmer
        }
        break;
      }
      case 'kill': {
        const o = dry(0);
        this.tone(o, t, { freq: 180, end: 70, type: 'sine', decay: 0.18, gain: 0.5 });
        this.noiseBurst(o, t, { type: 'highpass', freq: 4500, decay: 0.05, gain: 0.35, attack: 0.0006 });
        break;
      }
      case 'hurt': {
        const o = dry(0);
        this.tone(o, t, { freq: 120, end: 50, type: 'sine', decay: 0.25, gain: 0.55 });
        this.noiseBurst(o, t, { freq: 600, decay: 0.12, gain: 0.25 });
        break;
      }
      case 'impact': this.noiseBurst(dry(0.2), t, { type: 'bandpass', freq: 2500 + Math.random() * 2500, q: 2, decay: 0.05, gain: 0.18 }); break;
      case 'whiz': this.noiseBurst(dry(0), t, { type: 'bandpass', freq: 3000, q: 3, decay: 0.12, gain: 0.25, attack: 0.04, rate: 1.4 }); break;
      case 'casing': this.tone(dry(0), t, { freq: 4200 + Math.random() * 1600, type: 'sine', decay: 0.07, gain: 0.04 }); break;
      case 'explosion': {
        const o = dry(1);
        this.noiseBurst(o, t, { freq: 1100, decay: 1.6, gain: 1.0, attack: 0.004 });
        this.noiseBurst(o, t, { type: 'highpass', freq: 3000, decay: 0.15, gain: 0.5, attack: 0.001 });
        this.tone(o, t, { freq: 75, end: 22, type: 'sine', decay: 1.1, gain: 1.0 });
        break;
      }
      case 'bounce': this.tone(dry(0.1), t, { freq: 1100 + Math.random() * 400, type: 'triangle', decay: 0.05, gain: 0.2 }); break;
      case 'pin': this.click(dry(0), t, 5000, 0.25); break;
      // doors: latch click and a hinge creak; a bang when one is shoulder-barged; the shut thud; sliding glass hiss
      case 'door': { const o = dry(0.15); this.click(o, t, 1800, 0.22); this.noiseBurst(o, t + 0.04, { type: 'bandpass', freq: 700, q: 3, decay: 0.35, gain: 0.08, attack: 0.08 }); break; }
      case 'doorshut': { const o = dry(0.2); this.tone(o, t, { freq: 110, end: 70, decay: 0.12, gain: 0.35 }); this.click(o, t + 0.01, 1500, 0.25); break; }
      case 'doorbash': { const o = dry(0.25); this.tone(o, t, { freq: 150, end: 55, decay: 0.2, gain: 0.7 }); this.noiseBurst(o, t, { freq: 900, decay: 0.16, gain: 0.45 }); this.noiseBurst(o, t + 0.25, { type: 'bandpass', freq: 600, q: 1, decay: 0.15, gain: 0.2 }); break; }
      case 'doorslide': this.noiseBurst(dry(0.1), t, { type: 'bandpass', freq: 2400, q: 0.8, decay: 0.5, gain: 0.07, attack: 0.15 }); break;
      case 'melee': this.noiseBurst(dry(0), t, { type: 'bandpass', freq: 600, q: 1, decay: 0.18, gain: 0.35, attack: 0.03 }); break;
      case 'meleehit': { const o = dry(0.1); this.tone(o, t, { freq: 140, end: 60, decay: 0.15, gain: 0.7 }); this.noiseBurst(o, t, { freq: 1200, decay: 0.08, gain: 0.4 }); break; }
      case 'pickup': { const o = dry(0); this.click(o, t, 2000, 0.3); this.click(o, t + 0.08, 2600, 0.25); break; }
      case 'spawn': this.tone(dry(0), t, { freq: 220, end: 330, type: 'sine', decay: 0.4, gain: 0.15 }); break;
      case 'beep': this.tone(dry(0), t, { freq: opts.freq || 660, type: 'sine', decay: 0.18, gain: 0.2 }); break;
      case 'ui': this.click(dry(0), t, opts.freq || 3200, 0.12); break;
      // Link light rail (King Street Station): the two-tone horn, the bell, wheel and motor rumble, the door chime
      case 'trainhorn': {
        const o = dry(0.5);
        for (const [f, dt0] of [[311, 0], [370, 0], [311, 0.75], [370, 0.75]]) this.tone(o, t + dt0, { freq: f, type: 'sawtooth', decay: 0.6, gain: 0.18, attack: 0.03 });
        break;
      }
      case 'trainbell': {
        const o = dry(0.4);
        for (let i = 0; i < 6; i++) this.tone(o, t + i * 0.32, { freq: 1180, type: 'triangle', decay: 0.28, gain: 0.25 });
        break;
      }
      case 'trainrumble': {
        const o = dry(0.3), k = Math.min(1, (opts.speed || 10) / 20);
        this.noiseBurst(o, t, { freq: 160 + 120 * k, decay: 0.55, gain: 0.35 + 0.35 * k, attack: 0.12 });
        this.noiseBurst(o, t, { type: 'bandpass', freq: 900 + 600 * k, q: 4, decay: 0.3, gain: 0.05 * k, attack: 0.1 });
        break;
      }
      case 'trainchime': {
        const o = dry(0.3);
        this.tone(o, t, { freq: 784, type: 'sine', decay: 0.5, gain: 0.2 });
        this.tone(o, t + 0.45, { freq: 622, type: 'sine', decay: 0.7, gain: 0.2 });
        break;
      }
      case 'horn': {
        const o = dry(0.3);
        this.tone(o, t, { freq: 110, type: 'sawtooth', decay: 1.4, gain: 0.22, attack: 0.08 });
        this.tone(o, t, { freq: 165, type: 'sawtooth', decay: 1.4, gain: 0.16, attack: 0.08 });
        break;
      }
      default: break;
    }
  }
}
