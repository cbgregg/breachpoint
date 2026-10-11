// Keyboard, mouse (pointer lock) and touch input
const GAME_KEYS = new Set(['Space', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ControlLeft', 'KeyC', 'KeyQ', 'KeyG', 'KeyR', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.mouseFire = false; this.mouseAds = false;
    this.locked = false;
    this.fallback = false; // free-look without pointer lock (sandboxed iframes)
    this.enabled = false;
    this.moveX = 0; this.moveY = 0;
    this.touchFire = false; this.touchAds = false; this.crouchToggle = false; this.touchSprint = false;
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseFire = false; this.mouseAds = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.isTouch) return;
      if (!this.locked && !this.fallback) return;
      if (e.button === 0) this.mouseFire = true;
      if (e.button === 2) this.mouseAds = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
      if (e.button === 2) this.mouseAds = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || (!this.locked && !this.fallback)) return;
      // clamp spikes some browsers emit on lock
      this.mouseDX += Math.max(-300, Math.min(300, e.movementX || 0));
      this.mouseDY += Math.max(-300, Math.min(300, e.movementY || 0));
    });
    window.addEventListener('wheel', (e) => { if (this.enabled && (this.locked || this.fallback)) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.fallback = false;
      if (!this.locked) { this.mouseFire = false; this.mouseAds = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    if (this.isTouch) this.setupTouch();
  }

  get fire() { return this.mouseFire || this.touchFire; }
  get ads() { return this.mouseAds || this.touchAds; }

  lock() {
    if (this.isTouch) return;
    const fail = () => { this.fallback = true; };
    try {
      if (!this.canvas.requestPointerLock) { fail(); return; }
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(fail);
    } catch (_) { fail(); }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  consume(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }

  reset() {
    this.keys.clear(); this.pressed.clear();
    this.mouseFire = this.mouseAds = this.touchFire = this.touchAds = false;
    this.moveX = this.moveY = 0;
  }

  setupTouch() {
    const ui = document.getElementById('touch');
    ui.classList.add('on');
    document.body.classList.add('touch');
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    let stickId = null, sx = 0, sy = 0;
    let lookId = null, lx = 0, ly = 0;
    const R = 55;

    const lookStart = (t) => { lookId = t.identifier; lx = t.clientX; ly = t.clientY; };
    const lookMove = (t) => { this.mouseDX += (t.clientX - lx) * 1.6; this.mouseDY += (t.clientY - ly) * 1.6; lx = t.clientX; ly = t.clientY; };

    ui.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const btn = t.target.closest('[data-btn]');
        if (btn) {
          const k = btn.dataset.btn;
          btn.classList.add('down');
          if (k === 'fire') { this.touchFire = true; if (lookId === null) lookStart(t); btn.dataset.tid = t.identifier; }
          else if (k === 'ads') { this.touchAds = !this.touchAds; btn.classList.toggle('active', this.touchAds); }
          else if (k === 'crouch') { this.crouchToggle = !this.crouchToggle; btn.classList.toggle('active', this.crouchToggle); }
          else if (k === 'sprint') { this.touchSprint = !this.touchSprint; btn.classList.toggle('active', this.touchSprint); }
          else if (k === 'pause') this.pressed.add('Escape');
          else if (k === 'score') this.keys.add('Tab');
          else this.pressed.add(k);
          continue;
        }
        if (t.clientX < window.innerWidth * 0.4 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          stick.style.left = `${sx - 60}px`; stick.style.top = `${sy - 60}px`;
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
          if (len > R) { dx *= R / len; dy *= R / len; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.moveX = dx / R; this.moveY = -dy / R;
        } else if (t.identifier === lookId) {
          lookMove(t);
        }
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null; this.moveX = this.moveY = 0;
          knob.style.transform = ''; stick.classList.remove('show');
        }
        if (t.identifier === lookId) lookId = null;
        const btn = t.target.closest && t.target.closest('[data-btn]');
        if (btn) {
          btn.classList.remove('down');
          if (btn.dataset.btn === 'fire') this.touchFire = false;
          if (btn.dataset.btn === 'score') this.keys.delete('Tab');
        }
      }
    };
    ui.addEventListener('touchend', end);
    ui.addEventListener('touchcancel', end);
  }
}
