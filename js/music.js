// The score. Recorded tracks (assets/music/tracks.json, composed by tools/gen_music.py) when they're there:
//   action (two layers, a tense bed and a firefight, mixed by the game's intensity), infected, the countdown
//   build-up (its impact lands on the countdown's last tick), the win and lose stings, and the supermarket's muzak.
// Long tracks stream (an <audio> element each, not decoded into memory) and loop by cross-fading their end into
// their start. The menu theme is composed note by note and synthesized live (MoodTrack, below): the AI-composed
// ones sounded AI-composed. Otherwise, or when a file won't load, the original score synthesized live:
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
    // the recorded score, if there is one ({} if not); a synthesized track playing when it arrives is swapped out
    this.files = null;
    this.ready = fetch('assets/music/tracks.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {})).catch(() => ({})).then(f => {
      this.files = f && typeof f === 'object' ? f : {};
      if (this.ctx) this.preload();
      if (this.track && this.track.synth && this.recorded(this.name)) { const n = this.name; this.name = null; this.play(n); }
      if (this.amb && this.amb.synth && this.files.muzak) { const n = this.ambName; this.ambName = null; this.amb.stop(1); this.amb = null; this.ambient(n); }
    });
  }
  // fetch a long track ahead of when it plays (so it starts at once instead of a couple of seconds late): the menu
  // as the page loads, a match's while it loads and counts down
  warm(name) {
    const f = this.files;
    if (!f) { this.ready.then(() => this.warm(name)); return; }
    for (const id of name === 'action' ? ['action_low', 'action_high'] : [name]) {
      if (!f[id] || (this.warmed = this.warmed || new Set()).has(id)) continue;
      this.warmed.add(id);
      fetch(f[id].file).catch(() => {});   // (into the browser's cache; the player streams it from there)
    }
  }
  // the short ones are decoded up front (they have to land on time); the long ones stream
  preload() {
    for (const id of ['intro', 'win', 'lose']) {
      const f = this.files && this.files[id];
      if (f && !this.buffers[f.file]) this.buffers[f.file] = fetch(f.file).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b)).catch(() => null);
    }
  }
  recorded(name) {
    const f = this.files;
    if (!f || MUSIC_FILES && MUSIC_FILES[name]) return null;
    if (name === 'action' && f.action_low && f.action_high) return new LayerTrack(this, f.action_low, f.action_high);
    return f[name] && f[name].loop ? new StreamLoop(this, f[name]) : null;
  }
  // a short recorded cue (decoded), started at `when` (optionally from `offset` into it); returns its bus, or null
  cue(id, when, offset = 0, level = 0.85) {
    const f = this.files && this.files[id], p = f && this.buffers[f.file];
    if (!p) return null;
    const bus = this.ctx.createGain(); bus.gain.value = level; bus.connect(this.out);
    p.then(buf => {
      if (!buf || bus.dead) return;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(bus);
      const now = this.ctx.currentTime, at = Math.max(now, when), skip = offset + Math.max(0, now - when);
      if (skip < buf.duration) src.start(at, skip);
    });
    return bus;
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
    if (this.files) this.preload();
    return true;
  }

  level() { return this.volume * (this.audio.volume ?? 0.7) * this.duck * (this.ambDuck ?? 1); }
  apply() { if (this.out) this.out.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.15); }
  setVolume(v) { this.volume = v; this.apply(); }
  setDuck(on) { this.duck = on ? 0.45 : 1; this.apply(); }
  setIntensity(v) { this.target = Math.max(0, Math.min(1, v)); }

  play(name) {
    if (name === this.name && this.track) return;
    if (!this.ensure()) return;
    this.name = name;
    if (this.track) this.track.stop(1.6);
    this.track = MUSIC_FILES && MUSIC_FILES[name] ? new FileTrack(this, MUSIC_FILES[name]) : this.recorded(name) || new ({ menu: MoodTrack, finale: FinaleTrack }[name] || ActionTrack)(this);
    this.track.start();
  }

  stop() {
    if (this.track) this.track.stop(1.2);
    this.track = null;
    this.name = null;
  }

  // in-world music (the supermarket's ceiling speakers): plays alongside the score, its level follows
  // where you are (full inside the store, faint outside), and the score drops back while it plays
  ambient(name) {
    if (name === this.ambName) return;
    if (this.amb) { this.amb.stop(1.5); this.amb = null; }
    this.ambName = name;
    this.ambDuck = name ? 0.4 : 1;
    this.apply();
    if (!name || !this.ensure()) return;
    // (the recorded muzak through the same small ceiling speakers)
    this.amb = this.files && this.files.muzak ? new StreamLoop(this, this.files.muzak, { speaker: true }) : new MuzakTrack(this);
    this.amb.start();
  }
  ambientLevel(v) { if (this.amb) this.amb.level(v); }

  // pre-match countdown: a drum build-up that lands its biggest hit when the match starts (in `secs`)
  hype(secs = 10) {
    if (!this.ensure()) return;
    this.stop();
    this.cancelHype();
    const ctx = this.ctx, nb = this.audio.noise;
    const t0 = ctx.currentTime + 0.05, end = t0 + secs;
    // recorded: started so its impact lands on the end of the countdown (a short countdown joins it part-way)
    const rec = this.files && this.files.intro;
    if (rec && this.buffers[rec.file]) { this.hypeBus = this.cue('intro', end - rec.hit, 0, 0.7); if (this.hypeBus) return; }
    const bus = ctx.createGain();
    bus.gain.value = 0.7;
    bus.connect(this.out);
    const send = ctx.createGain(); send.gain.value = 0.45; bus.connect(send).connect(this.hall);
    this.hypeBus = bus;
    const beat = 0.5; // 120 BPM, counted back from the start so the last hit is exactly on 0
    for (let k = Math.floor(secs / beat); k >= 1; k--) {
      const t = end - k * beat, left = end - t;   // seconds to go
      if (t < t0) continue;
      const bar = Math.floor((secs - left) / 2);  // 0..4
      const b = Math.round((secs - left) / beat) % 4;
      if (left > 6) { if (b === 0 || b === 2) drum(ctx, bus, nb, t, 'taiko', 0.75); }
      else if (left > 2) {
        drum(ctx, bus, nb, t, 'taiko', 0.85);
        drum(ctx, bus, nb, t + beat / 2, 'tom', 0.9 + (b % 2) * 0.25);
        if (b === 3) drum(ctx, bus, nb, t + beat * 0.75, 'snare', 0.5);
      } else {
        drum(ctx, bus, nb, t, 'taiko', 1);
        for (let i = 0; i < 4; i++) drum(ctx, bus, nb, t + i * beat / 4, i % 2 ? 'tom' : 'snare', 0.45 + (2 - left) * 0.3 + i * 0.05);
      }
      if (bar >= 1 && b === 0 && left > 2) drum(ctx, bus, nb, t, 'kick', 0.8);
    }
    // a low drone and a rising noise sweep under the last seconds
    const o = ctx.createOscillator(), og = ctx.createGain(), of = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = mtof(26); of.type = 'lowpass'; of.Q.value = 4;
    of.frequency.setValueAtTime(120, t0); of.frequency.exponentialRampToValueAtTime(900, end);
    og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.08, t0 + 2); og.gain.setValueAtTime(0.08, end - 0.6); og.gain.exponentialRampToValueAtTime(0.16, end); og.gain.exponentialRampToValueAtTime(0.0001, end + 0.4);
    o.connect(of).connect(og).connect(bus); o.start(t0); o.stop(end + 0.5);
    const rs = Math.max(t0, end - 3);
    {
      const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(400, rs); f.frequency.exponentialRampToValueAtTime(6500, end);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, rs); g.gain.exponentialRampToValueAtTime(0.16, end); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.15);
      src.connect(f).connect(g).connect(bus); src.start(rs); src.stop(end + 0.2);
    }
    // the hit
    drum(ctx, bus, nb, end, 'taiko', 1.3); drum(ctx, bus, nb, end + 0.012, 'taiko', 1.1);
    drum(ctx, bus, nb, end, 'kick', 1); drum(ctx, bus, nb, end + 0.01, 'crash', 0.9);
    for (const m of [38, 50, 57, 62, 65]) for (const det of [-8, 8]) voice(ctx, bus, end, { freq: mtof(m), det, type: 'sawtooth', attack: 0.02, hold: 0.5, release: 1.4, gain: 0.045, cutoff: 1800, env: 2.5 });
  }
  cancelHype() {
    if (!this.hypeBus) return;
    const g = this.hypeBus.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(0.0001, t, 0.08);
    const b = this.hypeBus; b.dead = true; setTimeout(() => { try { b.disconnect(); } catch (_) { /* gone */ } }, 600);
    this.hypeBus = null;
  }

  // short end-of-match cue, then the menu theme
  sting(win) {
    if (!this.ensure()) return;
    this.stop();
    const ctx = this.ctx, t = ctx.currentTime + 0.05;
    const rec = this.files && this.files[win ? 'win' : 'lose'];
    if (rec && this.cue(win ? 'win' : 'lose', t)) {
      clearTimeout(this.stingT);
      this.stingT = setTimeout(() => { if (!this.name) this.play('menu'); }, (rec.len + 0.6) * 1000);
      return;
    }
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
    this.synth = true;   // (swapped for the recorded track once that's known to exist)
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
    while (this.next < ctx.currentTime + (this.ahead || 0.3)) {
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

// The menu theme: moody electronic in D minor, 100 BPM, composed note by note. A soft kick and a clap, an offbeat
// sub bass, a rolling arpeggio through a dotted-eighth delay, warm pads, one hook that keeps coming back on piano
// (a bell joins it later), all in a big hall. 16-bar progression Dm Bb F C | Dm Bb Gm A; four passes (piano, piano
// and bell, the arpeggio and a high counter-line on their own, piano and bell), about 2.5 minutes, then round again.
const MOOD_CHORDS = ['Dm', 'Dm', 'Bb', 'Bb', 'F', 'F', 'C', 'C', 'Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A'];
const MOOD_HOOK = (() => {   // [bar, 16th, midi note, length in 16ths]
  const a = [[[0, 57, 4], [4, 62, 4], [8, 65, 2], [10, 64, 2], [12, 62, 4]], [[0, 60, 6], [6, 57, 10]],
    [[0, 57, 4], [4, 62, 4], [8, 65, 2], [10, 67, 2], [12, 65, 4]], [[0, 64, 6], [6, 62, 10]],
    [[0, 60, 4], [4, 65, 4], [8, 69, 2], [10, 67, 2], [12, 65, 4]], [[0, 64, 6], [6, 60, 10]]];
  const bars = [...a, [[0, 55, 4], [4, 60, 4], [8, 64, 2], [10, 62, 2], [12, 60, 4]], [[0, 64, 8], [8, 62, 8]],
    ...a, [[0, 55, 4], [4, 58, 4], [8, 62, 2], [10, 60, 2], [12, 58, 4]], [[0, 57, 8], [8, 61, 8]]];
  return bars.flatMap((notes, bar) => notes.map(([s, n, l]) => [bar, s, n, l]));
})();
class MoodTrack extends Track {
  constructor(m, bpm = 100) {
    super(m, bpm);
    this.ahead = 2;   // (notes scheduled 2 s ahead: it plays through the menus while the game loads and builds things)
    const ctx = this.ctx;
    // a dotted-eighth echo, darkened on each repeat
    this.dly = ctx.createDelay(1); this.dly.delayTime.value = this.dt * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 2400;
    const wet = ctx.createGain(); wet.gain.value = 0.32;
    this.dly.connect(dark).connect(fb).connect(this.dly); dark.connect(wet).connect(this.bus);
    // drums a little muted (it sits under the menus)
    this.kit = ctx.createBiquadFilter(); this.kit.type = 'lowpass'; this.kit.frequency.value = 3200; this.kit.connect(this.bus);
    // a big hall: 5 s, a touch of pre-delay, darker as it dies; the piano, pads, arpeggio and clap go into it (the kick
    // and the bass stay dry, or it all turns to mud), and the general score hall is turned down for this one
    this.send.gain.value = 0.08;
    const sr = ctx.sampleRate, n = Math.floor(sr * 5), ir = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const x = ir.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) { const k = i / n, v = i < sr * 0.022 ? 0 : (Math.random() * 2 - 1) * Math.pow(1 - k, 2.4); lp += (0.55 - 0.4 * k) * (v - lp); x[i] = lp * 0.6; }
    }
    this.hall = ctx.createConvolver(); this.hall.buffer = ir;
    const hallOut = ctx.createGain(); hallOut.gain.value = 0.85; this.hall.connect(hallOut).connect(this.bus);
    // a part's channel: dry level, how much goes to the echo and to the hall
    const part = (dry, echo, hall) => {
      const g = ctx.createGain(); g.gain.value = dry; g.connect(this.bus);
      if (echo) { const e = ctx.createGain(); e.gain.value = echo; g.connect(e).connect(this.dly); }
      if (hall) { const h = ctx.createGain(); h.gain.value = hall; g.connect(h).connect(this.hall); }
      return g;
    };
    this.arpBus = part(0.55, 0.9, 0.8); this.pianoBus = part(0.9, 0.35, 1); this.bellBus = part(0.45, 0.5, 1);
    this.padBus = part(1, 0, 1); this.clapBus = part(0.6, 0, 0.7); this.counterBus = part(0.6, 0.9, 1);
  }
  // a soft kick: just the thump (the stock kick's click on every beat was too much here)
  kick(t, v) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.18);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.42);
  }
  play(step, t) {
    const ctx = this.ctx, dt = this.dt, nb = this.m.audio.noise;
    const bar = Math.floor(step / 16), s = step % 16, b16 = bar % 16, pass = Math.floor(bar / 16) % 4;
    const ch = CHORDS[MOOD_CHORDS[b16]];
    // drums: a soft kick on the beat, a clap on 2 and 4 (into the hall), quiet offbeat hats
    if (s % 4 === 0) this.kick(t, 0.36);
    if (s === 4 || s === 12) { noise(ctx, nb, this.clapBus, t, { type: 'bandpass', freq: 1400, q: 0.8, attack: 0.004, decay: 0.12, gain: 0.07 }); noise(ctx, nb, this.clapBus, t + 0.014, { type: 'bandpass', freq: 1600, q: 0.8, attack: 0.004, decay: 0.16, gain: 0.07 }); }
    if (s % 4 === 2) noise(ctx, nb, this.kit, t, { type: 'bandpass', freq: 5500, q: 1.2, attack: 0.012, decay: 0.05, gain: 0.014 });   // (a soft shaker)
    // sub bass on the offbeats (the pump), the root held under the downbeat
    const root = ch[0] - 12;
    if (s % 4 === 2) { voice(ctx, this.bus, t, { freq: mtof(root), type: 'sine', attack: 0.015, hold: dt * 1.2, release: 0.12, gain: 0.16, cutoff: 300 }); voice(ctx, this.bus, t, { freq: mtof(root + 12), type: 'triangle', attack: 0.015, hold: dt, release: 0.1, gain: 0.035, cutoff: 800 }); }
    if (s === 0) voice(ctx, this.bus, t, { freq: mtof(root), type: 'sine', attack: 0.02, hold: dt * 1.5, release: 0.2, gain: 0.1, cutoff: 200 });
    // the arpeggio: chord tones an octave up, rolling in 16ths, its filter breathing over eight bars (a rounded tone
    // that eases in: no tick on every note)
    const arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24, ch[2] + 12, ch[1] + 12][step % 6];
    const cut = 1000 + 500 * Math.sin((step / 128) * Math.PI * 2);
    voice(ctx, this.arpBus, t, { freq: mtof(arp), type: 'triangle', attack: 0.012, hold: dt * 0.4, release: 0.14, gain: 0.04, cutoff: cut });
    // pads on each chord change: detuned saws, slow to open
    if (s === 0 && b16 % 2 === 0) for (const n of ch) for (const det of [-7, 7]) voice(ctx, this.padBus, t, { freq: mtof(n), det, type: 'sawtooth', attack: 0.9, hold: dt * 32 - 0.9, release: 1.8, gain: 0.014, cutoff: 900 });
    // the hook: on piano from the start; from the second pass a soft bell an octave up joins it; on the third it rests
    if (pass !== 2) for (const [hb, hs, n, len] of MOOD_HOOK) {
      if (hb !== b16 || hs !== s) continue;
      voice(ctx, this.pianoBus, t, { freq: mtof(n), type: 'triangle', attack: 0.006, hold: 0.03, release: len * dt * 1.4, gain: 0.07, cutoff: 3000 });
      voice(ctx, this.pianoBus, t, { freq: mtof(n + 12), type: 'sine', attack: 0.005, hold: 0.01, release: len * dt * 0.7, gain: 0.016, cutoff: 6000 });
      if (pass !== 0) voice(ctx, this.bellBus, t, { freq: mtof(n + 12), type: 'sine', attack: 0.01, hold: 0.02, release: len * dt * 1.8, gain: 0.022, cutoff: 6000 });
    }
    // third pass: the hook rests; a high counter-line answers on the off-bars instead
    if (pass === 2 && b16 % 2 === 1 && (s === 0 || s === 6 || s === 10)) {
      const n = ch[[2, 1, 0][s === 0 ? 0 : s === 6 ? 1 : 2]] + 24;
      voice(ctx, this.counterBus, t, { freq: mtof(n), type: 'sine', attack: 0.012, hold: dt * 2, release: 0.8, gain: 0.03, cutoff: 5000 });
    }
  }
}

// The last minute of a match (or a close finish): the menu theme's world, tense. 112 BPM over Dm Bb Gm A, a soft kick
// on every beat and a driving eighth-note sub bass, the arpeggio, dark low pads, and every four bars the start of the
// menu's hook on the bell, as a reminder. Quiet: it sits under the fight.
const FINALE_CHORDS = ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A'];
class FinaleTrack extends MoodTrack {
  constructor(m) { super(m, 112); this.level = 0.5; }   // (the closing moments: felt under the fight, not over it)
  start() { super.start(); this.bus.gain.cancelScheduledValues(this.ctx.currentTime); this.bus.gain.setTargetAtTime(this.level, this.ctx.currentTime, 1.2); }
  play(step, t) {
    const ctx = this.ctx, dt = this.dt, nb = this.m.audio.noise;
    const bar = Math.floor(step / 16), s = step % 16, b8 = bar % 8;
    const ch = CHORDS[FINALE_CHORDS[b8]], root = ch[0] - 12;
    if (s % 4 === 0) this.kick(t, 0.34);
    if (s % 4 === 2) noise(ctx, nb, this.kit, t, { type: 'bandpass', freq: 5500, q: 1.2, attack: 0.012, decay: 0.05, gain: 0.009 });
    if (bar % 2 && (s === 4 || s === 12)) noise(ctx, nb, this.clapBus, t, { type: 'bandpass', freq: 1400, q: 0.8, attack: 0.004, decay: 0.12, gain: 0.07 });
    if (s % 2 === 0) voice(ctx, this.bus, t, { freq: mtof(root), type: 'sine', attack: 0.012, hold: dt * 0.9, release: 0.08, gain: s % 4 === 0 ? 0.12 : 0.08, cutoff: 260 });
    const arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12][step % 4];
    voice(ctx, this.arpBus, t, { freq: mtof(arp), type: 'triangle', attack: 0.01, hold: dt * 0.35, release: 0.1, gain: 0.03, cutoff: 900 + 400 * Math.sin((step / 64) * Math.PI * 2) });
    if (s === 0 && b8 % 2 === 0) for (const n of ch) for (const det of [-9, 9]) voice(ctx, this.padBus, t, { freq: mtof(n - 12), det, type: 'sawtooth', attack: 1.2, hold: dt * 32 - 1.2, release: 1.6, gain: 0.012, cutoff: 600 });
    if (bar % 4 === 0) for (const [hb, hs, n, len] of MOOD_HOOK) if (hb < 2 && hb === bar % 2 && hs === s) voice(ctx, this.bellBus, t, { freq: mtof(n + 12), type: 'sine', attack: 0.01, hold: 0.02, release: len * dt * 1.8, gain: 0.02, cutoff: 6000 });
  }
}

// Supermarket music: easy-listening bossa nova in F, through small ceiling speakers (band-passed, roomy).
// Electric piano comping, walking bass, brushed kit, a vibraphone tune. Original, synthesized live.
const MZ = { Fmaj7: [53, 57, 60, 64], Dm7: [50, 53, 57, 60], Gm7: [55, 58, 62, 65], C7: [48, 52, 55, 58], Am7: [57, 60, 64, 67], Bbmaj7: [58, 62, 65, 69], Em7b5: [52, 55, 58, 62], A7: [57, 61, 64, 67] };
class MuzakTrack extends Track {
  constructor(m) {
    super(m, 116);
    // re-route: speaker EQ instead of the concert hall
    this.bus.disconnect();
    const ctx = this.ctx;
    this.spk = ctx.createBiquadFilter(); this.spk.type = 'bandpass'; this.spk.frequency.value = 1300; this.spk.Q.value = 0.45;
    this.lvl = ctx.createGain(); this.lvl.gain.value = 0.0001;
    this.bus.connect(this.spk).connect(this.lvl).connect(m.out);
    this.lvl.connect(this.send);
    this.prog = ['Fmaj7', 'Fmaj7', 'Dm7', 'Dm7', 'Gm7', 'C7', 'Fmaj7', 'A7', 'Bbmaj7', 'Bbmaj7', 'Em7b5', 'A7', 'Dm7', 'Gm7', 'C7', 'C7'];
    this.tune = [[0, 0, 72, 6], [0, 6, 69, 2], [0, 8, 72, 4], [0, 12, 74, 4], [1, 0, 76, 10], [2, 0, 74, 6], [2, 6, 72, 2], [2, 8, 69, 8], [3, 0, 67, 12],
      [4, 0, 70, 6], [4, 6, 69, 2], [4, 8, 67, 4], [4, 12, 65, 4], [5, 0, 64, 12], [6, 0, 65, 6], [6, 6, 69, 2], [6, 8, 72, 8], [7, 0, 73, 12],
      [8, 0, 74, 6], [8, 6, 72, 2], [8, 8, 70, 8], [9, 0, 69, 12], [10, 0, 67, 6], [10, 8, 70, 8], [11, 0, 69, 12],
      [12, 0, 65, 6], [12, 6, 67, 2], [12, 8, 69, 8], [13, 0, 70, 8], [13, 8, 72, 8], [14, 0, 67, 16], [15, 0, 65, 12]];
  }
  level(v) { this.target = v; if (this.started) this.lvl.gain.setTargetAtTime(Math.max(0.0001, v), this.ctx.currentTime, 0.4); }
  start() { super.start(); this.started = true; this.level(this.target ?? 0.6); }
  stop(fade) {
    const t = this.ctx.currentTime;
    this.lvl.gain.cancelScheduledValues(t);
    this.lvl.gain.setTargetAtTime(0.0001, t, fade / 3);
    super.stop(fade);
  }
  play(step, t) {
    const ctx = this.ctx, dt = this.dt, nb = this.m.audio.noise;
    const bar = Math.floor(step / 16), s = step % 16;
    const ch = MZ[this.prog[bar % 16]];
    // bossa bass: root on 1, fifth on the "and" of 2, root on 3, approach note
    const root = ch[0] - 24;
    const bass = { 0: root, 6: root + 7, 8: root, 14: root + 7 };
    if (bass[s] !== undefined) voice(ctx, this.bus, t, { freq: mtof(bass[s]), type: 'triangle', attack: 0.01, hold: dt * 2.5, release: 0.25, gain: 0.16, cutoff: 700 });
    // electric piano comping: the bossa rhythm (1, a2, &3, 4...)
    if ([0, 3, 6, 10, 12].includes(s) && !(s === 12 && bar % 2)) {
      for (const n of ch) {
        voice(ctx, this.bus, t, { freq: mtof(n), type: 'sine', attack: 0.004, hold: dt * 1.2, release: 0.5, gain: 0.035, cutoff: 3000 });
        voice(ctx, this.bus, t, { freq: mtof(n) * 2.0, type: 'sine', attack: 0.002, hold: 0.01, release: 0.18, gain: 0.008, cutoff: 6000 });
      }
    }
    // brushes + rim click
    if (s % 2 === 0) noise(ctx, nb, this.bus, t, { type: 'bandpass', freq: 5200, q: 0.5, decay: s % 4 === 0 ? 0.09 : 0.05, gain: s % 4 === 0 ? 0.05 : 0.03 });
    if (s === 3 || s === 10) noise(ctx, nb, this.bus, t, { type: 'bandpass', freq: 1800, q: 4, decay: 0.03, gain: 0.08 });
    // vibraphone tune (every other pass, so it breathes)
    if (Math.floor(bar / 16) % 2 === 0) {
      for (const [b, st, n, len] of this.tune) if (b === bar % 16 && st === s) {
        voice(ctx, this.bus, t, { freq: mtof(n), type: 'sine', attack: 0.003, hold: 0.04, release: len * dt * 1.6, gain: 0.07, cutoff: 5000 });
        voice(ctx, this.bus, t, { freq: mtof(n) * 4, type: 'sine', attack: 0.002, hold: 0.01, release: 0.25, gain: 0.006, cutoff: 8000 });
      }
    }
  }
}

// a recorded track (tracks.json entry: { file, len }), streamed, looping by cross-fading its end into its start:
// two <audio> elements take turns. `speaker`: through a shop's small ceiling speakers. level(v): 0..1.
class StreamLoop {
  constructor(m, f, { speaker = false, level = 0.8 } = {}) {
    this.m = m; this.ctx = m.ctx; this.f = f; this.base = level; this.target = 1;
    this.xf = Math.min(4, f.len / 4);
    this.bus = this.ctx.createGain(); this.bus.gain.value = 0.0001;
    if (speaker) {
      const spk = this.ctx.createBiquadFilter(); spk.type = 'bandpass'; spk.frequency.value = 1300; spk.Q.value = 0.45;
      this.bus.connect(spk).connect(m.out);
    } else this.bus.connect(m.out);
    this.els = [this.makeEl(), this.makeEl()]; this.turn = 0;
  }
  makeEl() {
    const el = new Audio(); el.preload = 'auto'; el.src = this.f.file;
    const g = this.ctx.createGain(); g.gain.value = 0;
    this.ctx.createMediaElementSource(el).connect(g).connect(this.bus);
    // (a background tab can hold the cross-fade timer back past the end: carry on from there)
    el.addEventListener('ended', () => { if (!this.stopped && this.els[this.turn].el === el) this.next(); });
    return { el, g };
  }
  start() {
    this.bus.gain.setTargetAtTime(Math.max(0.0001, this.base * this.target), this.ctx.currentTime, 0.5);
    this.next(true);
  }
  // the next pass: it fades in as the last one fades out, and the one after is set up
  next(first = false) {
    if (this.stopped) return;
    const prev = this.els[this.turn]; this.turn ^= 1;
    const cur = this.els[this.turn], t = this.ctx.currentTime, xf = first ? 0.05 : this.xf;
    cur.el.currentTime = 0;
    const p = cur.el.play(); if (p) p.catch(() => {});
    cur.g.gain.cancelScheduledValues(t); cur.g.gain.setValueAtTime(0, t); cur.g.gain.linearRampToValueAtTime(1, t + xf);
    if (!first) {
      prev.g.gain.cancelScheduledValues(t); prev.g.gain.setValueAtTime(prev.g.gain.value, t); prev.g.gain.linearRampToValueAtTime(0, t + xf);
      setTimeout(() => { if (this.els[this.turn] !== prev) prev.el.pause(); }, (xf + 0.3) * 1000);
    }
    // the next cross-fade, timed from when this pass really starts playing (streaming can take a moment)
    clearTimeout(this.timer);
    const arm = () => { if (this.els[this.turn] !== cur || this.stopped) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.next(), Math.max(1, this.f.len - this.xf - cur.el.currentTime) * 1000); };
    cur.el.addEventListener('playing', arm, { once: true });
    this.timer = setTimeout(arm, 8000);   // (and if it never says so)
  }
  level(v) { this.target = v; this.bus.gain.setTargetAtTime(Math.max(0.0001, this.base * v), this.ctx.currentTime, 0.5); }
  stop(fade) {
    this.stopped = true;
    clearTimeout(this.timer);
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t); this.bus.gain.setTargetAtTime(0.0001, t, fade / 3);
    setTimeout(() => { for (const { el } of this.els) { el.pause(); el.removeAttribute('src'); el.load(); } try { this.bus.disconnect(); } catch (_) { /* gone */ } }, (fade + 0.5) * 1000);
  }
}

// in a match: a tense bed and a firefight track running together, the firefight brought up as the game's
// intensity rises (as the synthesized score adds layers)
class LayerTrack {
  constructor(m, low, high) { this.m = m; this.low = new StreamLoop(m, low); this.high = new StreamLoop(m, high); }
  start() { this.low.start(); this.high.start(); this.mix(); this.timer = setInterval(() => this.mix(), 250); }
  mix() {
    const m = this.m;
    m.intensity += (m.target - m.intensity) * 0.06;
    const k = Math.max(0, Math.min(1, (m.intensity - 0.4) / 0.35)), h = k * k * (3 - 2 * k);
    this.high.level(h); this.low.level(1 - 0.55 * h);
  }
  stop(fade) { clearInterval(this.timer); this.low.stop(fade); this.high.stop(fade); }
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
