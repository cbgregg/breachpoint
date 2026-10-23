// Input: keyboard + mouse (pointer lock), Xbox / standard gamepads, touch.
// Everything funnels into: analog move/look, held fire/ads, and one-shot "actions".

const GAME_KEYS = new Set(['Space', 'Tab', 'KeyH', 'KeyZ', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ControlLeft', 'KeyC', 'KeyQ', 'KeyE', 'KeyG', 'KeyR', 'KeyV', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const KEY_ACTIONS = {
  KeyR: 'reload', KeyI: 'inspect', KeyV: 'melee', KeyQ: 'swap', KeyE: 'tactical', Digit1: 'slot1', Digit2: 'slot2',
  KeyC: 'crouch', KeyZ: 'prone', ControlLeft: 'slide', Space: 'jump', Escape: 'pause', KeyP: 'pause', KeyH: 'loadout',
};
// Standard gamepad mapping (Xbox layout)
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
// Call of Duty "Default" layout. LT/RT (aim/fire), View (scoreboard) and RB (lethal, thrown on release)
// are handled separately below. LB is the tactical.
const PAD_ACTIONS = {
  [PAD.A]: 'jump', [PAD.B]: 'crouch', [PAD.X]: 'reload', [PAD.Y]: 'swap',
  [PAD.MENU]: 'pause', [PAD.L3]: 'sprint', [PAD.R3]: 'melee', [PAD.DOWN]: 'inspect', [PAD.RIGHT]: 'loadout', [PAD.LB]: 'tactical',
};

// Some browsers (Firefox on Linux/macOS, older Safari) report Xbox pads without the "standard"
// mapping: different button numbers and triggers on axes. Rebuild a standard-layout view of them.
const XBOX_ID = /xbox|xinput|x-box|045e|microsoft/i;
function stdButtons(n) { return Array.from({ length: n }, () => ({ pressed: false, value: 0 })); }
// A layout the player calibrated (Options › Controls › Controller): for pads the browser doesn't map, and Macs
// (Firefox and some Bluetooth drivers report PlayStation / third-party pads with their own button numbers).
// buttons[std] = { t: 'b', i } (raw button) | { t: 'a', i, v, b } (raw axis: target value, resting value) | null
// axes[k] = { i, s } (raw axis, sign) for LX, LY, RX, RY
const PADMAP_KEY = 'breachpoint.padmap.v1';
export function loadPadMaps() { try { return JSON.parse(localStorage.getItem(PADMAP_KEY) || '{}') || {}; } catch (_) { return {}; } }
export function savePadMap(id, map) { const all = loadPadMaps(); if (map) all[id] = map; else delete all[id]; try { localStorage.setItem(PADMAP_KEY, JSON.stringify(all)); } catch (_) { /* ignore */ } }
const clamp01 = (x) => Math.max(0, Math.min(1, x));
export function axisButton(e, x) {
  if (Math.abs(e.b) > 1.05) return Math.abs(x - e.v) < 0.12 ? 1 : 0;     // a hat switch (D-pad on one axis): exact positions
  return Math.abs(e.v - e.b) < 0.01 ? 0 : clamp01((x - e.b) / (e.v - e.b));
}
function applyPadMap(p, m) {
  const B = stdButtons(17);
  (m.buttons || []).forEach((e, std) => {
    if (!e) return;
    if (e.t === 'b') { const r = p.buttons[e.i]; if (r) B[std] = { pressed: !!r.pressed || r.value > 0.5, value: r.value ?? (r.pressed ? 1 : 0) }; }
    else { const v = axisButton(e, p.axes[e.i] ?? 0); B[std] = { pressed: v > 0.5, value: v }; }
  });
  const axes = [0, 1, 2, 3].map(k => { const a = m.axes && m.axes[k]; return a ? (p.axes[a.i] || 0) * a.s : 0; });
  return { id: p.id, mapping: 'custom', buttons: B, axes, vibrationActuator: p.vibrationActuator, connected: true, index: p.index };
}
let PADMAPS = loadPadMaps();
export function reloadPadMaps() { PADMAPS = loadPadMaps(); }
// HID devices macOS browsers sometimes list as gamepads (receivers, headsets, keyboards, 3D mice): never use them
const NOT_A_PAD = /keyboard|mouse|trackpad|touchpad|receiver|unifying|headset|audio|webcam|spacemouse|3dconnexion|apple internal/i;
export const isRealPad = (p) => !!p && p.connected && !NOT_A_PAD.test(p.id) && p.buttons.length >= 4;
function normalizePad(p, seen) {
  if (PADMAPS[p.id]) return applyPadMap(p, PADMAPS[p.id]);
  if (p.mapping === 'standard' || !XBOX_ID.test(p.id)) return p;
  const B = stdButtons(17);
  const raw = (i) => p.buttons[i] || { pressed: false, value: 0 };
  const ax = (i) => p.axes[i] || 0;
  // triggers on axes rest at -1, but read 0 until first touched
  const trig = (i) => { const v = ax(i); if (v !== 0) seen[i] = true; return seen[i] ? (v + 1) / 2 : 0; };
  const set = (std, b) => { B[std] = { pressed: !!b.pressed, value: b.value ?? (b.pressed ? 1 : 0) }; };
  const setV = (std, v) => { B[std] = { pressed: v > 0.5, value: v }; };
  let axes;
  if (p.buttons.length >= 15 && p.axes.length <= 6) {
    // macOS driver layout: A B X Y LB RB L3 R3 Start Back Guide Up Down Left Right; axes LX LY LT RX RY RT
    [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 10], [7, 11], [8, 9], [9, 8], [11, 12], [12, 13], [13, 14], [14, 15]]
      .forEach(([r, st]) => set(st, raw(r)));
    setV(PAD.LT, trig(2)); setV(PAD.RT, trig(5));
    axes = [ax(0), ax(1), ax(3), ax(4)];
  } else {
    // Linux xpad layout: A B X Y LB RB Back Start Guide L3 R3; axes LX LY LT RX RY RT DPadX DPadY
    [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 8], [7, 9], [8, 16], [9, 10], [10, 11]].forEach(([r, st]) => set(st, raw(r)));
    setV(PAD.LT, trig(2)); setV(PAD.RT, trig(5));
    setV(PAD.LEFT, ax(6) < -0.5 ? 1 : 0); setV(PAD.RIGHT, ax(6) > 0.5 ? 1 : 0);
    setV(PAD.UP, ax(7) < -0.5 ? 1 : 0); setV(PAD.DOWN, ax(7) > 0.5 ? 1 : 0);
    axes = [ax(0), ax(1), ax(3), ax(4)];
  }
  return { id: p.id, buttons: B, axes, vibrationActuator: p.vibrationActuator, connected: true };
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.actions = new Set();
    this.used = []; // actions consumed this frame (sent to the host in online play)
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.mouseFire = false; this.mouseAds = false;
    this.locked = false;
    this.fallback = false; // free-look without pointer lock (sandboxed iframes)
    this.enabled = false;
    this.lastDevice = 'kbm';
    // touch
    this.touchMoveX = 0; this.touchMoveY = 0; this.touchFire = false; this.touchAds = false; this.touchScore = false;
    // Touch controls follow the primary pointer: a touchscreen laptop (fine pointer, but touch events exist) keeps
    // mouse aiming and only switches to the on-screen controls once the screen is actually touched.
    this.coarse = window.matchMedia('(pointer: coarse)').matches;
    this.isTouch = this.coarse;
    // gamepad
    this.pad = null; this.padConnected = false;
    this.prevBtn = []; this.padMoveX = 0; this.padMoveY = 0; this.lookX = 0; this.lookY = 0;
    this.padFire = false; this.padAds = false; this.padScore = false;
    this.deadzone = 0.12;
    this.adsMode = 'hold'; this.adsToggled = false; this.prevLT = false; this.touchAdsHeld = false; this.adsClass = false;
    this.vibration = true;
    this.navRepeat = 0; this.navDir = null;
    this.onLockChange = null; this.onNav = null; this.onPadChange = null; this.onDeviceChange = null;

    window.addEventListener('keydown', (e) => {
      this.setDevice('kbm');
      // browser zoom (Ctrl +/-/0) would resize the game mid-fight
      if ((e.ctrlKey || e.metaKey) && ['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0', 'Numpad0'].includes(e.code)) e.preventDefault();
      if (!this.enabled || this.chatting) return; // typing in chat never moves or shoots
      // any key in a match (Ctrl included, before W can follow it) takes the game fullscreen with the keyboard
      // locked, so Ctrl+W crouches instead of closing the tab
      if (e.isTrusted && !document.fullscreenElement && e.code !== 'Escape') this.goFullscreen();
      if (GAME_KEYS.has(e.code) || ((e.ctrlKey || e.metaKey) && /^(Key|Digit)/.test(e.code))) e.preventDefault();
      if (!this.keys.has(e.code) && KEY_ACTIONS[e.code]) this.actions.add(KEY_ACTIONS[e.code]);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseFire = false; this.mouseAds = false; });
    canvas.addEventListener('mousedown', (e) => {
      this.setDevice('kbm');
      if (!this.enabled || this.isTouch || this.chatting) return;
      if (e.isTrusted && !document.fullscreenElement) this.goFullscreen();
      if (!this.locked && !this.fallback) return;
      if (e.button === 0) this.mouseFire = true;
      if (e.button === 2) { this.mouseAds = true; this.adsPress(); }
      if (e.button === 1) { this.mouseMid = true; e.preventDefault(); }   // wheel click: lethal (hold to cook)
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
      if (e.button === 2) this.mouseAds = false;
      if (e.button === 1) this.mouseMid = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      const m = Math.abs(e.movementX) + Math.abs(e.movementY);
      if (m > 2 && (this.lastDevice !== 'pad' || (m > 12 && performance.now() - (this.padActiveAt || 0) > 600))) this.setDevice('kbm');
      if (!this.enabled || (!this.locked && !this.fallback)) return;
      this.mouseDX += Math.max(-300, Math.min(300, e.movementX || 0));
      this.mouseDY += Math.max(-300, Math.min(300, e.movementY || 0));
    });
    window.addEventListener('wheel', (e) => {
      if (e.ctrlKey) e.preventDefault();          // Ctrl + wheel (crouched weapon swap) must not zoom the page
      if (this.enabled && (this.locked || this.fallback)) this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.fallback = false;
      if (!this.locked) { this.mouseFire = false; this.mouseAds = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {   // browsers whose requestPointerLock returns nothing
      if (!this.locked && this.onLockRefused && this.enabled) this.onLockRefused();
    });
    window.addEventListener('gamepadconnected', () => this.poll(0));
    if (this.isTouch) this.setupTouch();
    window.addEventListener('touchstart', () => { if (!this.isTouch) this.useTouch(true); }, { capture: true, passive: true });
    // ...and back to mouse aiming when a real mouse moves on a device that was not touch-first
    window.addEventListener('pointermove', (e) => {
      if (this.isTouch && !this.coarse && e.pointerType === 'mouse' && Math.abs(e.movementX) + Math.abs(e.movementY) > 4) this.useTouch(false);
    });
  }

  useTouch(on) {
    this.isTouch = on;
    if (on) { if (document.pointerLockElement) document.exitPointerLock(); this.setupTouch(); return; }
    document.getElementById('touch').classList.remove('on');
    document.body.classList.remove('touch', 'ads-on');
    this.touchMoveX = this.touchMoveY = 0; this.touchFire = this.touchAdsHeld = false;
    this.setDevice('kbm');
  }

  setDevice(d) {
    if (this.lastDevice === d) return;
    this.lastDevice = d;
    document.body.dataset.device = d;
    if (this.onDeviceChange) this.onDeviceChange(d);
  }

  get fire() { return this.mouseFire || this.touchFire || this.padFire; }
  // hold: aim while any aim input is held. toggle: each press flips it; clearAds() drops it.
  get ads() { return this.adsMode === 'toggle' ? this.adsToggled : (this.mouseAds || this.touchAdsHeld || this.padAds); }
  adsPress() { if (this.adsMode === 'toggle' && this.enabled) this.adsToggled = !this.adsToggled; }
  clearAds() { this.adsToggled = false; }
  get moveX() { return Math.max(-1, Math.min(1, this.touchMoveX + this.padMoveX)); }
  get moveY() { return Math.max(-1, Math.min(1, this.touchMoveY + this.padMoveY)); }
  // frag button held (cook while held, throw on release)
  get grenadeHeld() { return this.keys.has('KeyG') || !!this.rbHeld || !!this.mouseMid || !!this.touchGren; }
  // plant / defuse: hold F or R, X on a controller, or the RELOAD touch button
  get useHeld() {
    const b = this.pad && this.pad.buttons[PAD.X];
    return this.keys.has('KeyF') || this.keys.has('KeyR') || !!(b && b.pressed) || !!this.touchUse;
  }
  get scoreboard() { return this.keys.has('Tab') || this.touchScore || this.padScore; }

  // Pointer lock can be refused: browsers only grant it inside a click or key press (Esc doesn't count), and not
  // for about a second after the player left it. A page in an iframe that may never lock aims with the free
  // cursor instead; anywhere else a refusal asks for a click (onLockRefused), which always works.
  lock() {
    if (this.isTouch) return;
    const framed = (() => { try { return window.self !== window.top; } catch (_) { return true; } })();
    const fail = () => {
      if (this.locked) return;
      if (framed || !this.canvas.requestPointerLock) this.fallback = true;
      else if (this.onLockRefused) this.onLockRefused();
    };
    try {
      if (!this.canvas.requestPointerLock) { fail(); return; }
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(fail);
    } catch (_) { fail(); }
    this.goFullscreen();
  }

  // Matches run fullscreen with the keyboard locked: browsers only let a page receive shortcuts like Ctrl+W
  // (crouch + forward = close tab!), Ctrl+T or Ctrl+N while it is fullscreen and has called keyboard.lock().
  // Short Esc still pauses; holding Esc leaves fullscreen.
  goFullscreen() {
    if (this.fullscreen === false || this.isTouch) return;
    const el = document.documentElement;
    const keys = () => { try { const k = navigator.keyboard && navigator.keyboard.lock && navigator.keyboard.lock(); if (k && k.catch) k.catch(() => {}); } catch (_) { /* unsupported */ } };
    if (document.fullscreenElement) { keys(); return; }
    if (!el.requestFullscreen || this.fsPending) return;
    this.fsPending = true; setTimeout(() => { this.fsPending = false; }, 400);
    this.fsT = performance.now();                 // entering fullscreen can drop pointer lock for a moment: don't pause on it
    try {
      const p = el.requestFullscreen({ navigationUI: 'hide' });
      if (p && p.then) p.then(() => {
        this.fsT = performance.now();
        keys();
        if (!document.pointerLockElement && this.enabled) { try { const r = this.canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* ignore */ } }
      }).catch(() => {});
    } catch (_) { /* not allowed right now */ }
  }
  releaseKeys() { try { if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); } catch (_) { /* ignore */ } }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  action(name) { if (this.actions.has(name)) { this.actions.delete(name); this.used.push(name); return true; } return false; }
  padHeld(name) {
    if (!this.pad) return false;
    const idx = { sprint: PAD.L3, scoreboard: PAD.VIEW, crouch: PAD.B }[name];
    const b = this.pad.buttons[idx];
    return !!(b && b.pressed);
  }

  rumble(strong, weak, ms) {
    if (!this.vibration || !this.pad || this.lastDevice !== 'pad') return;
    const a = this.pad.vibrationActuator;
    if (a && a.playEffect) a.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => {});
  }

  poll(dt) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    // which pad: the one whose button was pressed last (Macs can list extra devices, or the same controller twice
    // over USB and Bluetooth), else a standard-mapped one, else the first real one
    this.armed = this.armed || {};
    for (const p of pads) {
      if (!isRealPad(p)) continue;
      const any = p.buttons.some(b => b && (b.pressed || b.value > 0.5));
      if (any && !this.armed[p.index]) { this.armed[p.index] = true; this.padIndex = p.index; }
      else if (any && this.prevAny && !this.prevAny[p.index]) this.padIndex = p.index;
      (this.prevAny || (this.prevAny = {}))[p.index] = any;
    }
    let raw = pads.find(p => isRealPad(p) && p.index === this.padIndex) || pads.find(p => isRealPad(p) && p.mapping === 'standard') || pads.find(isRealPad) || null;
    this.rawPad = raw;
    let pad = raw ? normalizePad(raw, this.trigSeen || (this.trigSeen = {})) : null;
    if (!!pad !== this.padConnected) {
      this.padConnected = !!pad;
      if (this.onPadChange) this.onPadChange(this.padConnected, pad ? pad.id : '');
    }
    this.pad = pad;
    this.padMoveX = this.padMoveY = this.lookX = this.lookY = 0;
    this.padFire = this.padAds = this.padScore = false;
    if (!pad || this.calibrating) return;              // the calibration screen reads the raw pad itself
    const btn = (i) => { const b = pad.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };
    const val = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
    const ax = (i) => pad.axes[i] || 0;
    let activity = false;
    const edges = [];
    for (let i = 0; i < pad.buttons.length; i++) {
      const pr = btn(i);
      if (pr && !this.prevBtn[i]) edges.push(i);
      if (pr) activity = true;
      this.prevBtn[i] = pr;
    }
    const dz = this.deadzone;
    const radial = (x, y, curve) => {
      const m = Math.hypot(x, y);
      if (m < dz) return [0, 0];
      const s = Math.min(1, (m - dz) / (1 - dz));
      const c = Math.pow(s, curve) / m;
      return [x * c, y * c];
    };
    const [lx, ly] = radial(ax(0), ax(1), 1);
    const [rx, ry] = radial(ax(2), ax(3), 1.8);
    const armed = raw && this.armed[raw.index];
    if (armed && (lx || ly || rx || ry)) activity = true;
    if (armed && (val(PAD.LT) > 0.25 || val(PAD.RT) > 0.25)) activity = true;
    if (activity) this.padActiveAt = performance.now();
    if (activity) this.setDevice('pad');

    if (this.enabled) {
      this.padMoveX = lx; this.padMoveY = -ly;
      this.lookX = rx; this.lookY = ry;
      this.padAds = val(PAD.LT) > 0.25;
      if (this.padAds && !this.prevLT) this.adsPress();
      this.prevLT = this.padAds;
      this.padFire = val(PAD.RT) > 0.3;
      this.padScore = btn(PAD.VIEW);
      for (const i of edges) {
        const a = PAD_ACTIONS[i];
        if (a) this.actions.add(a);
      }
      // lethal: hold RB to cook, release to throw (handled by the player controller); LB is the tactical
      this.rbHeld = btn(PAD.RB);
    } else if (this.onNav && !this.suspendNav) {
      // menu navigation with D-pad / left stick (with key-repeat)
      this.rbHeld = false;
      for (const i of edges) {
        // directions come from the D-pad / stick below (with key-repeat); bumpers switch tabs
        const m = { [PAD.A]: 'accept', [PAD.B]: 'back', [PAD.MENU]: 'start', [PAD.Y]: 'alt', [PAD.LB]: 'prevTab', [PAD.RB]: 'nextTab', [PAD.LT]: 'prevSub', [PAD.RT]: 'nextSub', [PAD.X]: 'x' }[i];
        if (m) this.onNav(m);
      }
      const sx = ax(0), sy = ax(1);
      const dir = btn(PAD.UP) ? 'up' : btn(PAD.DOWN) ? 'down' : btn(PAD.LEFT) ? 'left' : btn(PAD.RIGHT) ? 'right'
        : Math.abs(sy) > 0.6 ? (sy < 0 ? 'up' : 'down') : Math.abs(sx) > 0.6 ? (sx < 0 ? 'left' : 'right') : null;
      if (dir !== this.navDir) { this.navDir = dir; this.navRepeat = 0.38; if (dir) this.onNav(dir); }
      else if (dir) { this.navRepeat -= dt; if (this.navRepeat <= 0) { this.navRepeat = 0.12; this.onNav(dir); } }
    }
  }

  // touch: highlight the ADS button and enlarge the fire buttons while aiming
  syncTouchAds() {
    const on = this.isTouch && this.enabled && this.ads;
    if (on === this.adsClass) return;
    this.adsClass = on;
    document.body.classList.toggle('ads-on', on);
    const b = document.getElementById('tb-ads');
    if (b) b.classList.toggle('active', on);
  }

  endFrame() {
    this.syncTouchAds();
    this.actions.clear();
    this.used.length = 0;
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }

  reset() {
    this.keys.clear(); this.actions.clear();
    this.mouseFire = this.mouseAds = this.touchFire = this.touchAdsHeld = false;
    this.adsToggled = false; this.prevLT = false;
    this.touchMoveX = this.touchMoveY = 0;
    this.padMoveX = this.padMoveY = this.lookX = this.lookY = 0;
    this.padAds = this.padFire = this.padScore = false;
    this.rbHeld = false; this.mouseMid = false; this.touchGren = false;
  }

  setupTouch() {
    const ui = document.getElementById('touch');
    ui.classList.add('on');
    document.body.classList.add('touch');
    this.setDevice('touch');
    if (this.touchReady) return;   // listeners are added once
    this.touchReady = true;
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    let stickId = null, sx = 0, sy = 0;
    let lookId = null, lx = 0, ly = 0;
    const R = 55;
    const lookStart = (t) => { lookId = t.identifier; lx = t.clientX; ly = t.clientY; };
    const lookMove = (t) => { this.mouseDX += (t.clientX - lx) * 1.6; this.mouseDY += (t.clientY - ly) * 1.6; lx = t.clientX; ly = t.clientY; };

    ui.addEventListener('touchstart', (e) => {
      this.setDevice('touch');
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const btn = t.target.closest('[data-btn]');
        if (btn) {
          const k = btn.dataset.btn;
          btn.classList.add('down');
          if (k === 'fire') { this.touchFire = true; if (lookId === null) lookStart(t); }
          else if (k === 'ads') { this.touchAdsHeld = true; this.adsPress(); if (lookId === null) lookStart(t); }
          else if (k === 'score') this.touchScore = true;
          else if (k === 'grenade') this.touchGren = true;
          else { if (k === 'reload') this.touchUse = true; if (k === 'crouch') this.touchCrouch = true; this.actions.add(k); }
          continue;
        }
        if (t.clientX < window.innerWidth * 0.4 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          const z = parseFloat(getComputedStyle(ui).zoom) || 1; // the touch layer can be scaled down (Options)
          stick.style.left = `${sx / z - 60}px`; stick.style.top = `${sy / z - 60}px`;
          stick.classList.add('show');
        } else if (lookId === null) {
          lookStart(t);
        }
      }
      e.preventDefault();
    }, { passive: false });

    ui.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - sx, dy = t.clientY - sy;
          const len = Math.hypot(dx, dy);
          // push the stick all the way forward (to the ring and a little past) to sprint, like CoD Mobile
          const sprint = len > R * 1.02 && -dy > Math.abs(dx) * 1.2;
          if (sprint !== this.touchSprint) { this.touchSprint = sprint; stick.classList.toggle('sprint', sprint); }
          if (len > R) { dx *= R / len; dy *= R / len; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.touchMoveX = dx / R; this.touchMoveY = -dy / R;
        } else if (t.identifier === lookId) {
          lookMove(t);
        }
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null; this.touchMoveX = this.touchMoveY = 0;
          this.touchSprint = false; stick.classList.remove('sprint');
          knob.style.transform = ''; stick.classList.remove('show');
        }
        if (t.identifier === lookId) lookId = null;
        const btn = t.target.closest && t.target.closest('[data-btn]');
        if (btn) {
          btn.classList.remove('down');
          if (btn.dataset.btn === 'fire') this.touchFire = false;
          if (btn.dataset.btn === 'ads') this.touchAdsHeld = false;
          if (btn.dataset.btn === 'score') this.touchScore = false;
          if (btn.dataset.btn === 'grenade') this.touchGren = false;
          if (btn.dataset.btn === 'reload') this.touchUse = false;
          if (btn.dataset.btn === 'crouch') this.touchCrouch = false;
        }
      }
    };
    ui.addEventListener('touchend', end);
    ui.addEventListener('touchcancel', end);
  }
}
