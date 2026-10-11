// Original score, synthesized live with WebAudio (no recordings, so nothing to license).
//   menu   — slow D-minor theme: low drone, string pad, a sparse motif with a flattened 2nd, taiko hits
//   action — 112 BPM: driving 16th bass, syncopated kit, string ostinato, brass stabs, risers.
//            An intensity value (0..1) set by the game adds and removes layers as fights heat up.
// To use your own tracks instead, set MUSIC_FILES in config.js to audio files in the repo.
import { MUSIC_FILES } from './config.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.volume = 0.5;
    this.intensity = 0.4;
    this.target = 0.4;
    this.track = null;
    this.name = null;
    this.duck = 1;
    this.buffers = {};
  }

  get ctx() { return this.audio.ctx; }

  ensure() {
    const ctx = this.ctx;
    if (!ctx) return false;
    if (this.out) return true;
    this.out = ctx.createGain();
    this.out.gain.value = this.level();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
    this.out.connect(comp).connect(ctx.destination);
    // soft hall for the score (separate from the street reverb used by effects)
    const len = Math.floor(ctx.sampleRate * 3.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const x = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * 0.35;
    }
    this.hall = ctx.createConvolver();
    this.hall.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.hall.connect(wet).connect(this.out);
    return true;
  }

  level() { return this.volume * (this.audio.volume ?? 0.7) * this.duck; }
  apply() { if (this.out) this.out.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.15); }
  setVolume(v) { this.volume = v; this.apply(); }
  setDuck(on) { this.duck = on ? 0.45 : 1; this.apply(); }
  setIntensity(v) { this.target = Math.max(0, Math.min(1, v)); }

  play(name) {
    if (name === this.name && this.track) return;
    if (!this.ensure()) return;
    this.name = name;
    if (this.track) this.track.stop(1.6);
    this.track = MUSIC_FILES && MUSIC_FILES[name] ? new FileTrack(this, MUSIC_FILES[name]) : new (name === 'menu' ? MenuTrack : ActionTrack)(this);
    this.track.start();
  }

  stop() {
    if (this.track) this.track.stop(1.2);
    this.track = null;
    this.name = null;
  }

  // short end-of-match cue, then the menu theme
  sting(win) {
    if (!this.ensure()) return;
    this.stop();
    const ctx = this.ctx, t = ctx.currentTime + 0.05;
    const bus = ctx.createGain();
    bus.gain.value = 0.9;
    bus.connect(this.out); bus.connect(this.hall);
    const chord = win ? [50, 57, 62, 66, 69] : [38, 50, 53, 57, 58];
    for (const m of chord) for (const det of [-6, 6]) voice(ctx, bus, t, { freq: mtof(m), det, type: 'sawtooth', attack: 0.04, hold: 2.2, release: 2.5, gain: 0.05, cutoff: win ? 2400 : 1200 });
    drum(ctx, bus, this.audio.noise, t, 'taiko', 1);
    drum(ctx, bus, this.audio.noise, t + 0.02, 'crash', 0.6);
    clearTimeout(this.stingT);
    this.stingT = setTimeout(() => { if (!this.name) this.play('menu'); }, 4500);
  }
}

// ---------------------------------------------------------------------------------------------
// instruments
function voice(ctx, dest, t, { freq, det = 0, type = 'sawtooth', attack = 0.01, hold = 0.1, release = 0.2, gain = 0.1, cutoff = 2000, q = 0.7, env = 0 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = det;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = q;
  if (env) {
    f.frequency.setValueAtTime(cutoff * env, t);
    f.frequency.exponentialRampToValueAtTime(cutoff, t + Math.max(0.02, attack + hold * 0.6));
  } else f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.setValueAtTime(gain, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  o.connect(f).connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + hold + release + 0.05);
}

function noise(ctx, buf, dest, t, { type = 'highpass', freq = 6000, q = 0.7, decay = 0.05, gain = 0.2, attack = 0.001, sweep = 0 }) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + attack + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + attack + decay + 0.05);
}

function drum(ctx, dest, buf, t, kind, v = 1) {
  const pitched = (f0, f1, decay, gain) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + decay + 0.05);
  };
  switch (kind) {
    case 'kick': pitched(150, 42, 0.32, 0.9); noise(ctx, buf, dest, t, { type: 'lowpass', freq: 900, decay: 0.03, gain: 0.25 * v }); break;
    case 'snare':
      pitched(220, 160, 0.12, 0.3);
      noise(ctx, buf, dest, t, { type: 'bandpass', freq: 2200, q: 0.6, decay: 0.18, gain: 0.45 * v });
      break;
    case 'hat': noise(ctx, buf, dest, t, { type: 'highpass', freq: 8000, decay: 0.035, gain: 0.12 * v }); break;
    case 'ohat': noise(ctx, buf, dest, t, { type: 'highpass', freq: 7000, decay: 0.22, gain: 0.1 * v }); break;
    case 'tom': pitched(130 * v, 70 * v, 0.3, 0.6); break;
    case 'taiko': pitched(90, 38, 0.9, 1.0); noise(ctx, buf, dest, t, { type: 'lowpass', freq: 600, decay: 0.12, gain: 0.35 * v }); break;
    case 'crash': noise(ctx, buf, dest, t, { type: 'highpass', freq: 4500, decay: 1.8, gain: 0.18 * v }); break;
    default: break;
  }
}

// ---------------------------------------------------------------------------------------------
// tracks: a lookahead scheduler stepping in 16th notes
class Track {
  constructor(music, bpm) {
    this.m = music;
    this.ctx = music.ctx;
    this.bpm = bpm;
    this.dt = 60 / bpm / 4;
    this.step = 0;
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 0.0001;
    this.bus.connect(music.out);
    this.send = this.ctx.createGain();
    this.send.gain.value = 0.35;
    this.bus.connect(this.send).connect(music.hall);
    this.held = [];
  }

  start() {
    const t = this.ctx.currentTime;
    this.bus.gain.setValueAtTime(0.0001, t);
    this.bus.gain.exponentialRampToValueAtTime(1, t + 1.5);
    this.next = t + 0.1;
    this.timer = setInterval(() => this.pump(), 40);
    this.pump();
  }

  pump() {
    const ctx = this.ctx;
    // background tabs throttle timers; skip ahead instead of bursting a backlog of notes
    if (this.next < ctx.currentTime - 0.5) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.3) {
      this.play(this.step, this.next);
      this.next += this.dt;
      this.step++;
    }
  }

  stop(fade) {
    clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(Math.max(0.0001, this.bus.gain.value), t);
    this.bus.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    for (const o of this.held) { try { o.stop(t + fade + 0.1); } catch (_) { /* already stopped */ } }
    setTimeout(() => this.bus.disconnect(), (fade + 0.5) * 1000);
  }

  // continuous oscillator (drones)
  drone(freq, type, gain, cutoff, lfoRate) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = lfoRate; lg.gain.value = cutoff * 0.5;
    lfo.connect(lg).connect(f.frequency);
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(f).connect(g).connect(this.bus);
    o.start(); lfo.start();
    this.held.push(o, lfo);
  }
}

const CHORDS = { Dm: [50, 53, 57], Bb: [46, 50, 53], F: [53, 57, 60], C: [48, 52, 55], Gm: [43, 46, 50], A: [45, 49, 52] };

class MenuTrack extends Track {
  constructor(m) {
    super(m, 68);
    this.prog = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'];
    // [bar within 8, 16th step, midi, length in steps] — D minor with a flattened 2nd (E♭) for colour
    this.motif = [
      [0, 0, 69, 6], [0, 6, 74, 4], [0, 10, 72, 6], [1, 0, 69, 12],
      [2, 0, 65, 6], [2, 6, 70, 4], [2, 10, 69, 6], [3, 0, 65, 4], [3, 4, 64, 4], [3, 8, 63, 8],
      [4, 0, 62, 6], [4, 6, 69, 4], [4, 10, 67, 6], [5, 0, 65, 12],
      [6, 0, 67, 4], [6, 4, 65, 4], [6, 8, 63, 8], [7, 0, 61, 6], [7, 6, 62, 10],
    ];
  }

  start() {
    super.start();
    this.drone(mtof(26), 'sawtooth', 0.05, 260, 0.05);
    this.drone(mtof(26) * 1.004, 'sawtooth', 0.04, 220, 0.07);
    this.drone(mtof(33), 'triangle', 0.035, 500, 0.03);
  }

  play(step, t) {
    const ctx = this.ctx, dt = this.dt;
    const bar = Math.floor(step / 16), s = step % 16, phrase = Math.floor(bar / 8);
    // string pad, one chord per bar
    if (s === 0) {
      const ch = CHORDS[this.prog[bar % 8]];
      for (const n of ch) for (const det of [-7, 7]) voice(ctx, this.bus, t, { freq: mtof(n), det, attack: 1.4, hold: dt * 16 - 1.2, release: 1.8, gain: 0.022, cutoff: 1100 });
      voice(ctx, this.bus, t, { freq: mtof(ch[0] - 12), type: 'triangle', attack: 0.8, hold: dt * 16 - 0.6, release: 1.4, gain: 0.05, cutoff: 600 });
    }
    // motif: comes in after the first phrase, rests every third phrase
    if (phrase > 0 && phrase % 3 !== 2) {
      for (const [b, st, n, len] of this.motif) {
        if (b === bar % 8 && st === s) {
          voice(ctx, this.bus, t, { freq: mtof(n), type: 'triangle', attack: 0.01, hold: 0.05, release: len * dt * 1.4, gain: 0.07, cutoff: 3000 });
          voice(ctx, this.bus, t, { freq: mtof(n + 12), type: 'sine', attack: 0.005, hold: 0.02, release: len * dt * 0.6, gain: 0.025, cutoff: 6000 });
        }
      }
    }
    // percussion
    if (s === 0 && bar % 2 === 0) drum(ctx, this.bus, this.m.audio.noise, t, 'taiko', 0.7);
    if (phrase > 0 && s === 10 && bar % 2 === 1) drum(ctx, this.bus, this.m.audio.noise, t, 'taiko', 0.35);
    if (phrase > 1 && s % 4 === 2) drum(ctx, this.bus, this.m.audio.noise, t, 'hat', 0.35);
  }
}

class ActionTrack extends Track {
  constructor(m) {
    super(m, 112);
    this.prog = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A'];
    this.bassPat = [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 3, 5, 7];
    this.arp = [12, 19, 24, 19, 15, 19, 24, 27];
  }

  start() {
    super.start();
    this.drone(mtof(26), 'sawtooth', 0.03, 180, 0.11);
  }

  play(step, t) {
    const m = this.m, ctx = this.ctx, dt = this.dt, nb = m.audio.noise;
    m.intensity += (m.target - m.intensity) * 0.02;
    const I = m.intensity;
    const bar = Math.floor(step / 16), s = step % 16;
    const name = this.prog[bar % 8], ch = CHORDS[name];
    const root = ch[0] - 24;
    const intro = bar < 2;
    // bass ostinato
    if (!intro || s % 4 === 0) {
      const acc = s % 4 === 0 ? 1 : 0.7;
      voice(ctx, this.bus, t, { freq: mtof(root + this.bassPat[s]), type: 'sawtooth', attack: 0.004, hold: dt * 0.5, release: 0.09, gain: 0.11 * acc, cutoff: 380 + 900 * I, env: 3, q: 4 });
    }
    // kit
    if (!intro) {
      if (s === 0 || s === 8 || (I > 0.45 && (s === 6 || s === 11))) drum(ctx, this.bus, nb, t, 'kick', 1);
      if (s === 4 || s === 12) drum(ctx, this.bus, nb, t, 'snare', 0.6 + 0.4 * I);
      if (I > 0.3 && s % 2 === 0) drum(ctx, this.bus, nb, t, 'hat', s % 4 === 0 ? 0.6 : 1);
      if (I > 0.6 && s === 14) drum(ctx, this.bus, nb, t, 'ohat', 1);
      // tom fill into each 8-bar phrase
      if (I > 0.5 && bar % 8 === 7 && s >= 12) drum(ctx, this.bus, nb, t, 'tom', 1.4 - (s - 12) * 0.15);
      if (s === 0 && bar % 8 === 0) drum(ctx, this.bus, nb, t, 'crash', 0.5 + 0.5 * I);
    }
    // string ostinato (8ths)
    if (I > 0.45 && s % 2 === 0) {
      const n = ch[0] - 12 + this.arp[(s / 2) % 8];
      voice(ctx, this.bus, t, { freq: mtof(n), type: 'sawtooth', attack: 0.006, hold: dt * 0.6, release: 0.08, gain: 0.04 * (0.6 + 0.6 * I), cutoff: 2200, env: 1.6 });
    }
    // sustained low strings
    if (s === 0) for (const n of ch) voice(ctx, this.bus, t, { freq: mtof(n - 12), det: 5, attack: 0.3, hold: dt * 14, release: 0.4, gain: 0.018 + 0.012 * I, cutoff: 900 });
    // brass stabs at the top of each 4 bars when the fight is on
    if (I > 0.7 && (s === 0 || s === 3) && bar % 4 === 0) {
      for (const n of ch) for (const det of [-9, 9]) voice(ctx, this.bus, t, { freq: mtof(n), det, type: 'sawtooth', attack: 0.02, hold: s === 0 ? 0.25 : 0.1, release: 0.3, gain: 0.03, cutoff: 1600, env: 2.2, q: 1.5 });
    }
    // riser into the next phrase
    if (I > 0.55 && bar % 8 === 7 && s === 0) noise(ctx, nb, this.bus, t, { type: 'bandpass', freq: 400, q: 2, attack: dt * 15, decay: 0.05, gain: 0.12, sweep: 6000 });
  }
}

// a user-supplied audio file, looped
class FileTrack {
  constructor(m, url) { this.m = m; this.url = url; this.ctx = m.ctx; }
  async start() {
    const ctx = this.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.0001;
    this.bus.connect(this.m.out);
    try {
      let buf = this.m.buffers[this.url];
      if (!buf) {
        const res = await fetch(this.url);
        buf = this.m.buffers[this.url] = await ctx.decodeAudioData(await res.arrayBuffer());
      }
      if (this.stopped) return;
      this.src = ctx.createBufferSource();
      this.src.buffer = buf;
      this.src.loop = true;
      this.src.connect(this.bus);
      this.src.start();
      this.bus.gain.exponentialRampToValueAtTime(0.8, ctx.currentTime + 1.5);
    } catch (e) { console.warn('Music file failed to load', this.url, e); }
  }
  stop(fade) {
    this.stopped = true;
    if (!this.bus) return;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(Math.max(0.0001, this.bus.gain.value), t);
    this.bus.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    if (this.src) this.src.stop(t + fade + 0.1);
  }
}
