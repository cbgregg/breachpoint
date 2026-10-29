// Touch controls you can lay out yourself (Options > Controls > Touch: button layout), like CoD Mobile's
// custom HUD: drag any button where your thumb wants it, pinch (or use the +/- strip) to make one bigger or
// smaller, Reset puts everything back. The layout is saved as fractions of the screen (and a size factor per
// button), so it holds across phones and when the phone is turned round.
//
// Saved shape: settings.touchLayout = { 'tb-fire': { x: 0.91, y: 0.72, s: 1.2 }, ... } (x, y: the button's
// centre as a fraction of the touch layer; s: size relative to the default). null = the default layout.
const IDS = ['tb-pause', 'tb-score', 'tb-fire', 'tb-fire2', 'tb-ads', 'tb-jump', 'tb-crouch', 'tb-reload', 'tb-swap', 'tb-frag', 'tb-tac', 'tb-melee', 'tb-sprint'];
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// apply a saved layout to the live buttons (or clear it: the stylesheet's positions come back)
export function applyTouchLayout(layout) {
  const ui = $('touch'), r = ui.getBoundingClientRect();
  for (const id of IDS) {
    const el = $(id);
    if (!el) continue;
    const L = layout && layout[id];
    if (!L) { el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.width = el.style.height = el.style.fontSize = el.style.transition = ''; continue; }
    // size: the stylesheet's size times the factor (read with the override cleared, so it tracks the Options size,
    // and with its size transition off, or a reading mid-transition would be the wrong base)
    el.style.transition = 'none';
    el.style.width = el.style.height = el.style.fontSize = '';
    void el.offsetWidth;
    const base = el.getBoundingClientRect(), s = clamp(L.s || 1, 0.6, 1.8);
    const w = base.width * s, h = base.height * s;
    el.style.width = `${w}px`; el.style.height = `${h}px`;
    el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * s}px`;
    el.style.right = el.style.bottom = 'auto';
    el.style.left = `${clamp(L.x, 0, 1) * r.width - w / 2}px`;
    el.style.top = `${clamp(L.y, 0, 1) * r.height - h / 2}px`;
  }
}

// the editor: returns a promise of the new layout (or null for the default), resolved on Done
export function editTouchLayout(current, onLive) {
  return new Promise((resolve) => {
    const ui = $('touch'), ov = $('tl-edit');
    const layout = JSON.parse(JSON.stringify(current || {}));
    const r = () => ui.getBoundingClientRect();
    // every button is shown, where it is now (the buttons that only appear while aiming included)
    document.body.classList.add('ingame', 'tl-editing');
    ui.classList.add('on');
    ov.hidden = false;
    const live = () => { applyTouchLayout(Object.keys(layout).length ? layout : null); if (onLive) onLive(layout); };
    live();
    // where a button is right now, as fractions (so an untouched button keeps its stylesheet place when moved)
    const frac = (el) => { const b = el.getBoundingClientRect(), R = r(); return { x: (b.left + b.width / 2 - R.left) / R.width, y: (b.top + b.height / 2 - R.top) / R.height }; };
    let sel = null;
    const select = (el) => { for (const id of IDS) $(id) && $(id).classList.toggle('tl-sel', $(id) === el); sel = el; $('tl-size').hidden = !el; };
    const entry = (el) => (layout[el.id] = layout[el.id] || { ...frac(el), s: 1 });
    const drags = new Map();   // touch id -> { el, dx, dy } ; pinch: two touches on one button
    let pinch = null;
    const start = (e) => {
      for (const t of e.changedTouches) {
        const el = t.target.closest && t.target.closest('[data-btn]');
        if (!el) continue;
        const b = el.getBoundingClientRect();
        drags.set(t.identifier, { el, dx: t.clientX - (b.left + b.width / 2), dy: t.clientY - (b.top + b.height / 2) });
        select(el);
        const same = [...drags.values()].filter(d => d.el === el);
        if (same.length === 2) { const [a, c] = [...e.touches].filter(x => drags.has(x.identifier) && drags.get(x.identifier).el === el); pinch = { el, d0: Math.hypot(a.clientX - c.clientX, a.clientY - c.clientY), s0: entry(el).s || 1 }; }
      }
      e.preventDefault();
    };
    const move = (e) => {
      const R = r();
      if (pinch) {
        const [a, c] = [...e.touches].filter(x => drags.has(x.identifier) && drags.get(x.identifier).el === pinch.el);
        if (a && c) { entry(pinch.el).s = clamp(pinch.s0 * Math.hypot(a.clientX - c.clientX, a.clientY - c.clientY) / pinch.d0, 0.6, 1.8); live(); }
        e.preventDefault(); return;
      }
      for (const t of e.changedTouches) {
        const d = drags.get(t.identifier);
        if (!d) continue;
        const L = entry(d.el), b = d.el.getBoundingClientRect();
        L.x = clamp((t.clientX - d.dx - R.left) / R.width, b.width / 2 / R.width, 1 - b.width / 2 / R.width);
        L.y = clamp((t.clientY - d.dy - R.top) / R.height, b.height / 2 / R.height, 1 - b.height / 2 / R.height);
        live();
      }
      e.preventDefault();
    };
    const end = (e) => { for (const t of e.changedTouches) drags.delete(t.identifier); if (pinch && [...drags.values()].filter(d => d.el === pinch.el).length < 2) pinch = null; };
    // a mouse works too (testing on a desktop, or a touch laptop)
    let mdrag = null;
    const mdown = (e) => { const el = e.target.closest && e.target.closest('[data-btn]'); if (!el) return; const b = el.getBoundingClientRect(); mdrag = { el, dx: e.clientX - (b.left + b.width / 2), dy: e.clientY - (b.top + b.height / 2) }; select(el); e.preventDefault(); };
    const mmove = (e) => { if (!mdrag) return; const R = r(), L = entry(mdrag.el), b = mdrag.el.getBoundingClientRect(); L.x = clamp((e.clientX - mdrag.dx - R.left) / R.width, b.width / 2 / R.width, 1 - b.width / 2 / R.width); L.y = clamp((e.clientY - mdrag.dy - R.top) / R.height, b.height / 2 / R.height, 1 - b.height / 2 / R.height); live(); };
    const mup = () => { mdrag = null; };
    ui.addEventListener('touchstart', start, { passive: false, capture: true });
    ui.addEventListener('touchmove', move, { passive: false, capture: true });
    ui.addEventListener('touchend', end, { capture: true }); ui.addEventListener('touchcancel', end, { capture: true });
    ui.addEventListener('mousedown', mdown, { capture: true }); window.addEventListener('mousemove', mmove); window.addEventListener('mouseup', mup);
    const size = (k) => { if (!sel) return; const L = entry(sel); L.s = clamp((L.s || 1) * k, 0.6, 1.8); live(); };
    const onSmaller = () => size(1 / 1.12), onBigger = () => size(1.12);
    const onReset = () => { for (const k of Object.keys(layout)) delete layout[k]; select(null); live(); };
    const finish = () => {
      ui.removeEventListener('touchstart', start, { capture: true }); ui.removeEventListener('touchmove', move, { capture: true });
      ui.removeEventListener('touchend', end, { capture: true }); ui.removeEventListener('touchcancel', end, { capture: true });
      ui.removeEventListener('mousedown', mdown, { capture: true }); window.removeEventListener('mousemove', mmove); window.removeEventListener('mouseup', mup);
      $('tl-smaller').removeEventListener('click', onSmaller); $('tl-bigger').removeEventListener('click', onBigger);
      $('tl-reset').removeEventListener('click', onReset); $('tl-done').removeEventListener('click', finish);
      select(null);
      ov.hidden = true;
      document.body.classList.remove('tl-editing');
      resolve(Object.keys(layout).length ? layout : null);
    };
    $('tl-smaller').addEventListener('click', onSmaller); $('tl-bigger').addEventListener('click', onBigger);
    $('tl-reset').addEventListener('click', onReset); $('tl-done').addEventListener('click', finish);
  });
}
