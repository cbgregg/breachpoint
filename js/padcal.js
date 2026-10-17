// Controller test & calibration (Options › Controls › Controller). Shows every button and both sticks live,
// and walks through the layout one button at a time when a controller's buttons come out wrong (browsers on
// macOS often report PlayStation, Switch Pro and third-party pads without the standard layout). The result
// is saved per controller and used from then on (see applyPadMap in input.js).
import { PAD, savePadMap, reloadPadMaps, loadPadMaps, isRealPad } from './input.js';

const $ = (id) => document.getElementById(id);
const CHIPS = [['A', PAD.A], ['B', PAD.B], ['X', PAD.X], ['Y', PAD.Y], ['LB', PAD.LB], ['RB', PAD.RB], ['LT', PAD.LT], ['RT', PAD.RT],
  ['VIEW', PAD.VIEW], ['MENU', PAD.MENU], ['L3', PAD.L3], ['R3', PAD.R3], ['↑', PAD.UP], ['↓', PAD.DOWN], ['←', PAD.LEFT], ['→', PAD.RIGHT]];
const STEPS = [
  ['b', PAD.A, 'Press <b>A</b> (Xbox) / <b>Cross ✕</b> (PlayStation): the bottom face button'],
  ['b', PAD.B, 'Press <b>B</b> / <b>Circle ○</b>: the right face button'],
  ['b', PAD.X, 'Press <b>X</b> / <b>Square □</b>: the left face button'],
  ['b', PAD.Y, 'Press <b>Y</b> / <b>Triangle △</b>: the top face button'],
  ['b', PAD.LB, 'Press the <b>left bumper</b> (LB / L1)'],
  ['b', PAD.RB, 'Press the <b>right bumper</b> (RB / R1)'],
  ['b', PAD.LT, 'Pull the <b>left trigger</b> (LT / L2) all the way'],
  ['b', PAD.RT, 'Pull the <b>right trigger</b> (RT / R2) all the way'],
  ['b', PAD.VIEW, 'Press <b>View / Share / Create</b>: the small button on the left'],
  ['b', PAD.MENU, 'Press <b>Menu / Options</b>: the small button on the right'],
  ['b', PAD.L3, '<b>Click the left stick</b> in (L3)'],
  ['b', PAD.R3, '<b>Click the right stick</b> in (R3)'],
  ['b', PAD.UP, 'Press <b>D-pad up</b>'], ['b', PAD.DOWN, 'Press <b>D-pad down</b>'],
  ['b', PAD.LEFT, 'Press <b>D-pad left</b>'], ['b', PAD.RIGHT, 'Press <b>D-pad right</b>'],
  ['a', 0, 'Push the <b>left stick</b> all the way <b>right</b>'], ['a', 1, 'Push the <b>left stick</b> all the way <b>down</b>'],
  ['a', 2, 'Push the <b>right stick</b> all the way <b>right</b>'], ['a', 3, 'Push the <b>right stick</b> all the way <b>down</b>'],
];

export function setupPadCal({ input, toast, sound, onClose }) {
  const box = $('padcal');
  $('pcal-btns').innerHTML = CHIPS.map(([t, i]) => `<span data-b="${i}">${t}</span>`).join('');
  let open = false, cal = null, raf = 0, prevA = true, prevB = true, holdA = 0, holdB = 0;
  const rawPad = () => input.rawPad && isRealPad(input.rawPad) ? input.rawPad : null;
  const prompt = (h) => { $('pcal-prompt').innerHTML = h; };
  const idle = () => {
    const p = rawPad();
    const custom = p && loadPadMaps()[p.id];
    prompt(!p ? 'Connect a controller and press any button on it.'
      : `Press buttons and move the sticks: the matching labels should light up. ${custom ? 'This controller uses <b>your calibrated layout</b>.' : p.mapping === 'standard' ? 'Your browser maps this controller with the standard layout.' : '<b>Your browser doesn\'t report a standard layout for this controller</b>, so buttons may be wrong until you calibrate.'} If anything is wrong, press <b>CALIBRATE</b> (or hold <b>A</b>). Hold <b>B</b> to close.`);
  };
  function snapshot(p) { return { b: p.buttons.map(b => !!b && (b.pressed || b.value > 0.5)), a: [...p.axes] }; }
  function startCal() {
    const p = rawPad(); if (!p) { prompt('No controller found. Press a button on it first.'); return; }
    input.calibrating = true;
    const base = snapshot(p);
    cal = { id: p.id, step: 0, map: { buttons: Array(17).fill(null), axes: [null, null, null, null] }, base, rest: [...base.a], wait: true, used: new Set() };
    $('pcal-skip').hidden = false; $('pcal-go').hidden = true;
    showStep();
  }
  function showStep() {
    if (cal.step >= STEPS.length) return finish();
    prompt(`<span class="pcal-n">${cal.step + 1} / ${STEPS.length}</span> ${STEPS[cal.step][2]}`);
    box.querySelectorAll('.pcal-btns span').forEach(el => el.classList.toggle('want', STEPS[cal.step][0] === 'b' && +el.dataset.b === STEPS[cal.step][1]));
  }
  function next(entry) {
    const [kind, std] = STEPS[cal.step];
    if (kind === 'b') cal.map.buttons[std] = entry; else cal.map.axes[std] = entry;
    if (entry) { sound && sound(); cal.used.add(entry.t === 'b' ? 'b' + entry.i : 'a' + entry.i); }
    cal.last = entry && kind === 'b' && entry.t === 'a' ? entry : null;
    cal.step++; cal.wait = true;
    showStep();
  }
  function finish() {
    savePadMap(cal.id, cal.map); reloadPadMaps();
    input.calibrating = false; cal = null;
    $('pcal-skip').hidden = true; $('pcal-go').hidden = false;
    box.querySelectorAll('.pcal-btns span').forEach(el => el.classList.remove('want'));
    toast && toast('CONTROLLER LAYOUT SAVED');
    prevA = prevB = true;
    prompt('Saved. Test the buttons and sticks: they should match now. Hold <b>B</b> or press <b>DONE</b> to go back, <b>RESET LAYOUT</b> to use the browser\'s own layout again.');
  }
  function calTick(p) {
    const now = snapshot(p);
    if (cal.wait) {
      // released and settled: no buttons down and every axis back at its resting value. The axis just used may
      // come to rest somewhere new (Firefox reports an untouched trigger as 0, and -1 once it has moved).
      const prev = cal.prev || now; cal.prev = now;
      const still = now.a.every((v, i) => Math.abs(v - (prev.a[i] ?? v)) < 0.02);
      const last = cal.last;
      const rest = !now.b.some(Boolean) && still && now.a.every((v, i) => Math.abs(v - cal.rest[i]) < 0.3
        || (last && last.t === 'a' && last.i === i && Math.abs(v - last.v) > 0.5 && Math.abs(v) >= 0.9));
      cal.stable = rest ? (cal.stable || 0) + 1 : 0;
      if (cal.stable > 8) {
        if (last && last.t === 'a' && Math.abs(now.a[last.i] - cal.rest[last.i]) >= 0.3) { cal.rest[last.i] = now.a[last.i]; last.b = now.a[last.i]; }
        cal.wait = false; cal.base = now; cal.peek = null; cal.stable = 0; cal.last = null;
      }
      return;
    }
    const [kind] = STEPS[cal.step];
    if (kind === 'b') {
      const bi = now.b.findIndex((v, i) => v && !cal.base.b[i]);
      if (bi >= 0) return next({ t: 'b', i: bi });
      // triggers and D-pads that come through as an axis (or a hat switch)
      let best = -1, bd = 0.6;
      now.a.forEach((v, i) => { const d = Math.abs(v - cal.base.a[i]); if (d > bd) { bd = d; best = i; } });
      if (best >= 0) {
        // wait until the axis settles at its extreme before recording it
        const v = now.a[best];
        if (cal.peek && cal.peek.i === best && Math.abs(cal.peek.v - v) < 0.02) return next({ t: 'a', i: best, v, b: cal.base.a[best] });
        cal.peek = { i: best, v };
      }
    } else {
      let best = -1, bd = 0.6;
      now.a.forEach((v, i) => { const d = Math.abs(v - cal.base.a[i]); if (d > bd && !cal.used.has('a' + i)) { bd = d; best = i; } });
      if (best >= 0) return next({ i: best, s: Math.sign(now.a[best] - cal.base.a[best]) || 1 });
    }
  }
  function frame() {
    if (!open) return;
    raf = requestAnimationFrame(frame);
    const p = rawPad();
    $('pcal-id').textContent = p ? `${p.id}${p.mapping ? ` · ${p.mapping} layout` : ' · non-standard layout'}${loadPadMaps()[p.id] ? ' · calibrated' : ''}` : 'No controller detected';
    if (cal) { if (p && p.id === cal.id) calTick(p); return; }
    const pad = input.pad;
    // the controller drives this screen too (when its layout is usable): A calibrates, B closes
    const down = (i) => !!(pad && pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
    // (held for a second, so a quick press is just a test)
    const now = performance.now(), a = down(PAD.A), bk = down(PAD.B);
    holdA = a && !prevA ? now : a ? holdA : 0; holdB = bk && !prevB ? now : bk ? holdB : 0;
    if (!a) prevA = false; if (!bk) prevB = false;
    if (holdA && now - holdA > 900) { holdA = 0; prevA = true; startCal(); return; }
    if (holdB && now - holdB > 900) { holdB = 0; prevB = true; hide(); return; }
    box.querySelectorAll('.pcal-btns span').forEach(el => { const b = pad && pad.buttons[+el.dataset.b]; el.classList.toggle('on', !!b && (b.pressed || b.value > 0.5)); });
    const put = (id, x, y) => { $(id).style.transform = `translate(${(x || 0) * 26}px, ${(y || 0) * 26}px)`; };
    put('pcal-ls', pad && pad.axes[0], pad && pad.axes[1]); put('pcal-rs', pad && pad.axes[2], pad && pad.axes[3]);
  }
  function show() {
    open = true; box.hidden = false; input.suspendNav = true; prevA = prevB = true; holdA = holdB = 0; idle(); frame();
    $('pcal-close').focus();
  }
  function hide() {
    if (cal) { input.calibrating = false; cal = null; $('pcal-skip').hidden = true; $('pcal-go').hidden = false; }
    open = false; box.hidden = true; cancelAnimationFrame(raf);
    setTimeout(() => { input.suspendNav = false; }, 250);        // don't let the button that closed it act on the menu
    onClose && onClose();
  }
  $('pcal-go').addEventListener('click', startCal);
  $('pcal-skip').addEventListener('click', () => { if (cal) next(null); });
  $('pcal-reset').addEventListener('click', () => { const p = rawPad(); if (p) { savePadMap(p.id, null); reloadPadMaps(); toast && toast('CONTROLLER LAYOUT RESET'); idle(); } });
  $('pcal-close').addEventListener('click', hide);
  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hide(); }
    else if ((e.key === 's' || e.key === 'S') && cal) { e.preventDefault(); e.stopImmediatePropagation(); next(null); }
    else if (!box.contains(e.target)) e.stopImmediatePropagation();   // the menu behind doesn't react
  }, true);
  return { show, hide, isOpen: () => open };
}
