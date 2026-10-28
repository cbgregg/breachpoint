// HUD (modern military shooter style): compass, rotating minimap, score widget, ammo cluster,
// score popups, medals, killfeed, prompts with device-aware button glyphs, scoreboard.
import { WEAPONS, PLAYER, FRIENDLY_CSS, ENEMY_CSS, GRENADE, EQUIPMENT } from './config.js';
import { MAP } from './world.js';

const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const PAD_GLYPH = {
  accept: ['A', 'a'], back: ['B', 'b'], jump: ['A', 'a'], crouch: ['B', 'b'], reload: ['X', 'x'], swap: ['Y', 'y'],
  grenade: ['RB', 'bump'], tactical: ['LB', 'bump'], melee: ['R3', 'stick'], sprint: ['L3', 'stick'], prevTab: ['LB', 'bump'], nextTab: ['RB', 'bump'], prevSub: ['LT', 'bump'], nextSub: ['RT', 'bump'],
  pause: ['☰', 'bump'], scoreboard: ['⧉', 'bump'], alt: ['Y', 'y'], x: ['X', 'x'],
};
const KEY_GLYPH = {
  accept: 'Enter', back: 'Esc', jump: 'Space', crouch: 'C', reload: 'R', swap: 'Q', grenade: 'G', tactical: 'E', melee: 'V', sprint: 'Shift',
  prevTab: 'Q', nextTab: 'E', prevSub: 'Z', nextSub: 'C', x: 'X', pause: 'Esc', scoreboard: 'Tab', alt: 'F',
};
export function glyph(act, device) {
  if (device === 'pad') { const [t, c] = PAD_GLYPH[act] || ['?', '']; return `<i class="pg ${c}">${t}</i>`; }
  if (device === 'touch') return '';
  return `<kbd>${KEY_GLYPH[act] || act}</kbd>`;
}

export class HUD {
  txt(id, v) { v = String(v); if (this.cache[id] !== v) { this.cache[id] = v; $(id).textContent = v; } }
  sty(id, prop, v) { const k = id + '.' + prop; if (this.cache[k] !== v) { this.cache[k] = v; $(id).style[prop] = v; } }
  cls(id, c, on) { const k = id + '#' + c; if (this.cache[k] !== on) { this.cache[k] = on; $(id).classList.toggle(c, on); } }

  constructor(game) {
    this.cache = {};
    this.drawT = 0;
    this.game = game;
    this.el = $('hud');
    this.ch = $('crosshair');
    this.hm = $('hitmarker');
    this.mm = $('minimap');
    this.mmCtx = this.mm.getContext('2d');
    this.cc = $('compass-c');
    this.ccCtx = this.cc.getContext('2d');
    this.hitT = 0;
    this.sbT = 0;
    this.fpsT = 0; this.frames = 0;
    this.popTotal = 0; this.popT = 0;
    this.promptKey = '';
    this.device = 'kbm';
    // warm up the minimap canvas so the first in-game draw doesn't hitch
    if (game.minimap) this.mmCtx.drawImage(game.minimap.canvas, 0, 0, 2, 2);
  }

  show(on) { this.el.classList.toggle('on', on); if (!on) this.clearTags(); }

  // ---------- name tags ----------
  clearTags() { if (this.tags) { for (const t of this.tags.values()) t.el.remove(); this.tags.clear(); } }

  updateTags() {
    const g = this.game, p = g.player, cam = g.camera;
    if (!this.tags) { this.tags = new Map(); this.tagBox = $('tags'); this.tagV = new g.camera.position.constructor(); }
    const W = window.innerWidth, H = window.innerHeight;
    const seen = new Set();
    const scoped = p.alive && p.weapon.def.scope && p.adsT > 0.85;
    for (const c of g.characters) {
      if (c === p || !c.alive || c.hidden) continue;
      const friend = !g.foes(c, p);
      if (!friend && c !== g.aimTarget) continue;
      if (scoped && friend) continue;
      const v = c.headPos(this.tagV); v.y += 0.42;
      const dist = v.distanceTo(cam.position);
      v.project(cam);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
      let t = this.tags.get(c);
      if (!t) {
        const el = document.createElement('div');
        el.className = 'ntag';
        el.innerHTML = '<span class="tc"></span><span class="tn"></span>';
        el.lastChild.textContent = c.name.toUpperCase();
        this.tagBox.appendChild(el);
        t = { el, key: '' };
        this.tags.set(c, t);
      }
      seen.add(c);
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const s = Math.max(0.7, Math.min(1.15, 9 / Math.max(1, dist) + 0.62));
      t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(2)})`;
      const key = (friend ? 'f' : 'e') + (friend && dist > 45 ? ' far' : '');
      if (key !== t.key) { t.key = key; t.el.className = 'ntag ' + key; }
    }
    for (const [c, t] of this.tags) if (!seen.has(c)) { t.el.remove(); this.tags.delete(c); }
  }

  setDevice(d) {
    this.device = d;
    document.querySelectorAll('.glyph[data-act]').forEach(el => { el.innerHTML = glyph(el.dataset.act, d); });
    this.promptKey = '';
  }

  reset() {
    this.cache = {};
    this.lastHd = undefined;   // the compass redraws on the next tick
    ['killfeed', 'center-msg', 'dmg-ind', 'score-pop', 'medal'].forEach(id => { $(id).innerHTML = ''; });
    $('death').classList.remove('on');
    $('scoreboard').classList.remove('on');
    $('countdown').classList.remove('on');
    this.popTotal = 0;
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.updateTags();
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      // FPS, the slowest frame (stutter shows here first), the main thread's time per frame (game code plus
      // handing the frame to the GPU), the GPU's own time where the browser can measure it, and draw calls
      const r = g.renderer, pf = g.perf || { worst: 0, cpu: 0, n: 0 };
      const sc = r.dynamic !== false && r.drs && r.drs.scale < 0.99 ? ` · ${Math.round(r.drs.scale * 100)}% RES` : '';
      const pg = g.mode === 'guest' && g.player && g.player.ping > 0 ? ` · ${g.player.ping} MS` : '';
      const gpu = r.gpuMs > 0 ? ` · GPU ${r.gpuMs.toFixed(1)}` : '';
      $('fps').textContent = `${Math.round(this.frames / this.fpsT)} FPS · MAX ${Math.round(pf.worst)} MS · CPU ${(pf.cpu / Math.max(1, pf.n)).toFixed(1)}${gpu} · ${r.drawCalls || 0} DRAWS${pg}${sc}`;
      pf.worst = 0; pf.cpu = 0; pf.n = 0;
      this.frames = 0; this.fpsT = 0;
    }
    this.sty('fps', 'display', g.settings.showFps ? 'block' : 'none');

    const mine = p.team, theirs = 1 - mine;
    // Free-for-All: your kills (Gun Game: your rung) against the best of everyone else
    let sf = g.scores[mine], se = g.scores[theirs];
    if (g.ffa) { const lv = (c) => (g.gg ? (c.ggLevel || 0) : c.kills); sf = lv(p); se = 0; for (const c of g.characters) if (c !== p) se = Math.max(se, lv(c)); }
    this.txt('score-f', sf);
    this.txt('score-e', se);
    this.sty('bar-f', 'width', `${Math.min(100, sf / g.settings.scoreLimit * 100).toFixed(1)}%`);
    this.sty('bar-e', 'width', `${Math.min(100, se / g.settings.scoreLimit * 100).toFixed(1)}%`);
    this.txt('timer', fmtTime(g.timeLeft));
    this.cls('timer', 'low', g.timeLeft < 30);
    this.txt('limit', g.settings.scoreLimit);
    this.txt('mode-short', g.gm ? g.gm.cfg.short : g.gg ? 'GUN GAME' : g.ffa ? 'FFA' : g.inf ? 'INFECTED' : 'TDM');

    // health: only shown while hurt
    const hurt = p.alive && p.health < PLAYER.maxHealth - 0.5;
    this.cls('health-wrap', 'on', hurt);
    this.sty('health-fill', 'width', `${Math.round(p.health / PLAYER.maxHealth * 100)}%`);
    this.cls('health-fill', 'low', p.health < 35);

    // ammo
    const w = p.weapon;
    this.txt('weapon-name', w.def.name.toUpperCase());
    this.txt('ammo-mag', w.def.melee ? '—' : w.mag);   // the knife: nothing to count
    this.cls('ammo-mag', 'low', w.mag > 0 && w.mag <= Math.ceil(w.def.mag * 0.25));
    this.cls('ammo-mag', 'empty', w.mag === 0);
    this.txt('ammo-res', w.def.melee ? '' : w.reserve);
    this.txt('fire-mode', w.def.mode);
    this.txt('grenades', p.grenades);
    this.txt('tacticals', p.tacticals | 0);
    if (p.lethal !== this.lethalShown) { this.lethalShown = p.lethal; const e = EQUIPMENT[p.lethal]; if (e) { this.txt('lethal-name', e.short); const tb = document.getElementById('tb-frag'); if (tb) tb.textContent = e.short; } }
    if (p.tactical !== this.tacShown) { this.tacShown = p.tactical; const e = EQUIPMENT[p.tactical]; if (e) { this.txt('tactical-name', e.short); const tb = document.getElementById('tb-tac'); if (tb) tb.textContent = e.short; } }
    const st = p.alive && p.stunT > 0 ? Math.min(1, p.stunT / 1.2) : 0;
    if (Math.abs(st - (this.stunShown || 0)) > 0.02) { this.stunShown = st; this.sty('stun-fx', 'opacity', st.toFixed(2)); }

    // prompt
    let key = '', html = '', warn = false;
    if (p.alive && this.objPrompt) { key = 'obj' + this.objPrompt; html = this.objPrompt; }
    else if (p.alive && this.doorPrompt) { key = 'door' + this.doorPrompt; html = this.doorPrompt; }
    else if (p.alive && !w.reloading) {
      if (w.mag === 0 && w.reserve === 0) { key = 'noammo'; html = 'NO AMMO'; warn = true; }
      else if ((w.mag === 0 || (w.def.mag >= 4 && w.mag <= Math.ceil(w.def.mag * 0.25))) && w.reserve > 0) { key = 'reload' + this.device; html = `${glyph('reload', this.device)} RELOAD`; }
      else if (w.def.mag >= 4 && w.mag + w.reserve <= w.def.mag) { key = 'low'; html = 'LOW AMMO'; warn = true; }
    }
    if (key !== this.promptKey) {
      this.promptKey = key;
      $('prompt').innerHTML = html;
      $('prompt').classList.toggle('warn', warn);
    }
    this.cls('protect', 'on', p.alive && p.spawnProtect > 0);

    // crosshair / scope
    const scoped = !!w.def.scope && p.adsT > 0.85;
    this.cls('scope', 'on', scoped && p.alive);
    const showCh = p.alive && p.adsT < 0.4 && !p.sprinting && p.slideT <= 0;
    this.sty('crosshair', 'opacity', showCh ? '1' : '0');
    if (showCh) {
      const gap = Math.tan(p.currentSpread()) / Math.tan(g.camera.fov * Math.PI / 360) * (window.innerHeight / 2) + 3;
      const gp = `${Math.min(70, gap).toFixed(0)}px`;
      if (this.cache.gap !== gp) { this.cache.gap = gp; this.ch.style.setProperty('--gap', gp); }
      this.cls('crosshair', 'enemy', !!g.aimTarget);
    }
    this.hitT -= dt;
    this.sty('hitmarker', 'opacity', this.hitT > 0 ? Math.min(1, this.hitT * 6).toFixed(2) : '0');
    if (this.hitT > 0) this.sty('hitmarker', 'transform', `scale(${(1 + this.hitPop * Math.max(0, 1 - (this.hitT0 - this.hitT) / 0.08)).toFixed(2)})`);

    this.popT -= dt;
    if (this.popT <= 0 && this.popTotal) {
      this.popTotal = 0;
      [...$('score-pop').children].forEach(c => c.classList.add('fade'));
      setTimeout(() => { if (!this.popTotal) $('score-pop').innerHTML = ''; }, 500);
    }

    const tab = g.input.scoreboard;
    this.cls('scoreboard', 'on', tab);
    if (tab) { this.sbT -= dt; if (this.sbT <= 0) { this.renderScoreboard($('scoreboard')); this.sbT = 0.25; } }

    // death card: countdown + respawn / change loadout
    const dead = !p.alive && (g.state === 'playing' || g.state === 'paused');
    document.body.classList.toggle('dead', dead && g.state === 'playing');
    if (dead) {
      const since = g.time - p.deathT;
      this.txt('death-timer', g.gm ? 'NO RESPAWNS THIS ROUND' : `RESPAWNING IN ${Math.max(0, PLAYER.respawnDelay - since).toFixed(1)}`);
      // round modes: the card gives way to spectating after the kill cam
      if (g.gm) this.cls('death', 'on', since < 2.5 || !(g.playerCtl && g.playerCtl.specTarget));
      this.cls('death-respawn', 'wait', since < PLAYER.respawnMin);
    }
    // frag cook timer
    const ctl = g.playerCtl, cooking = p.alive && ctl && ctl.cookT !== null;
    this.cls('cook', 'on', cooking);
    if (cooking) {
      const left = Math.max(0, GRENADE.fuse - ctl.cookT);
      this.txt('cook-t', left.toFixed(1));
      $('cook-arc').style.strokeDashoffset = String(106.8 * (1 - left / GRENADE.fuse));
      this.cls('cook', 'hot', left < 1.2);
    }
    // just spawned and haven't fired: you can still swap loadout on the spot
    this.cls('spawn-hint', 'on', g.state === 'playing' && !!g.inSpawnWindow?.(p) && !g.input.isTouch);

    // canvases at ~30 Hz
    this.drawT -= dt;
    if (this.drawT <= 0) {
      this.drawT = 1 / 30;
      this.drawCompass();
      this.drawMinimap();
    }
  }

  heading(yaw) { let h = (-yaw * 180 / Math.PI) % 360; if (h < 0) h += 360; return h; }

  drawCompass() {
    const g = this.game, p = g.player, ctx = this.ccCtx;
    const W = this.cc.width, H = this.cc.height;
    const yaw = p.alive ? p.yaw : g.camera.rotation.y;
    const hd = this.heading(yaw);
    // text on a canvas is slow to draw: only when the heading has moved, or while an enemy-fire ping fades
    const pinging = g.characters.some(c => c.alive && g.time - c.lastFireT <= 1.6 && g.foes(c, p));
    if (!pinging && !this.pinged && this.lastHd !== undefined && this.ccW === W && Math.abs(hd - this.lastHd) < 0.2) return;
    this.lastHd = hd; this.pinged = pinging; this.ccW = W;
    ctx.clearRect(0, 0, W, H);
    const span = 120, ppd = W / span;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = Math.floor((hd - span / 2) / 5) * 5; d <= hd + span / 2; d += 5) {
      const x = W / 2 + (d - hd) * ppd;
      const dd = ((d % 360) + 360) % 360;
      const fade = 1 - Math.abs(x - W / 2) / (W / 2);
      ctx.globalAlpha = Math.max(0, fade) * 0.95;
      ctx.fillStyle = '#ece9e1';
      if (labels[dd] !== undefined) {
        ctx.font = '700 30px "Barlow Condensed", sans-serif';
        ctx.fillText(labels[dd], x, 30);
        ctx.fillRect(x - 1.5, 38, 3, 14);
      } else if (dd % 15 === 0) {
        ctx.font = '600 22px "Barlow Condensed", sans-serif';
        ctx.fillStyle = '#a7a49b';
        ctx.fillText(String(dd), x, 28);
        ctx.fillRect(x - 1, 40, 2, 10);
      } else {
        ctx.fillStyle = '#a7a49b';
        ctx.fillRect(x - 1, 44, 2, 6);
      }
    }
    // enemy pings (recent gunfire)
    for (const c of g.characters) {
      if (!c.alive || !g.foes(c, p) || g.time - c.lastFireT > 1.5 || c.weapon.def.quiet) continue;
      const b = this.heading(Math.atan2(-(c.pos.x - p.pos.x), -(c.pos.z - p.pos.z)));
      let delta = b - hd; if (delta > 180) delta -= 360; if (delta < -180) delta += 360;
      if (Math.abs(delta) > span / 2) continue;
      const x = W / 2 + delta * ppd;
      ctx.globalAlpha = 1 - (g.time - c.lastFireT) / 1.5;
      ctx.fillStyle = ENEMY_CSS;
      ctx.beginPath(); ctx.moveTo(x - 9, 52); ctx.lineTo(x + 9, 52); ctx.lineTo(x, 64); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ece9e1';
    ctx.beginPath(); ctx.moveTo(W / 2 - 7, 64); ctx.lineTo(W / 2 + 7, 64); ctx.lineTo(W / 2, 55); ctx.closePath(); ctx.fill();
    const txt = String(Math.round(hd) % 360).padStart(3, '0');
    if (txt !== this.lastBearing) { $('bearing').textContent = txt; this.lastBearing = txt; }
  }

  drawMinimap() {
    const g = this.game, ctx = this.mmCtx, mm = g.minimap;
    const W = this.mm.width, H = this.mm.height;
    const p = g.player;
    ctx.fillStyle = '#121515';
    ctx.fillRect(0, 0, W, H);
    if (!mm) return;
    const pxPerM = W / 64; // ~64 m across
    const sc = pxPerM / mm.scale;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(p.yaw);
    ctx.scale(sc, sc);
    ctx.translate(-(p.pos.x - MAP.minX) * mm.scale, -(p.pos.z - MAP.minZ) * mm.scale);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(mm.canvas, 0, 0);
    ctx.globalAlpha = 1;
    const toX = (x) => (x - MAP.minX) * mm.scale, toY = (z) => (z - MAP.minZ) * mm.scale;
    const r = 4.5 / sc * 2;
    for (const c of g.characters) {
      if (!c.alive || c === p) continue;
      const friend = !g.foes(c, p);
      const since = g.time - c.lastFireT;
      if (!friend && (since > 2 || c.weapon.def.quiet)) continue;
      ctx.globalAlpha = friend ? 1 : Math.max(0.2, 1 - since / 2);
      ctx.fillStyle = friend ? FRIENDLY_CSS : ENEMY_CSS;
      ctx.save();
      ctx.translate(toX(c.pos.x), toY(c.pos.z));
      ctx.rotate(-c.yaw);
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.3); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // player chevron + view cone
    ctx.fillStyle = 'rgba(236,233,225,0.12)';
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, W * 0.45, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ece9e1';
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 16); ctx.lineTo(W / 2 + 11, H / 2 + 11); ctx.lineTo(W / 2, H / 2 + 5); ctx.lineTo(W / 2 - 11, H / 2 + 11); ctx.closePath(); ctx.fill();
  }

  renderScoreboard(el) {
    const g = this.game;
    if (g.ffa) {
      // one list, in placing order
      const list = g.ffaStandings ? g.ffaStandings() : [...g.characters];
      const row = (c, i) => `<tr class="${c === g.player ? 'me' : ''} ${c.alive ? '' : 'dead'}"><td>${i + 1}. ${esc(c.name)}${c.isBot ? ' <span class="tag">BOT</span>' : ''}</td><td>${g.gg ? `${Math.min(c.ggLevel || 0, 15)}/15` : c.score}</td><td>${c.kills}</td><td>${c.deaths}</td><td>${c.assists}</td><td>${c.deaths ? (c.kills / c.deaths).toFixed(2) : c.kills.toFixed(2)}</td></tr>`;
      el.innerHTML = `<div class="sb-team sb-ffa" style="--tc:${FRIENDLY_CSS}"><div class="sb-head"><span>${g.gg ? 'GUN GAME' : 'FREE-FOR-ALL'}</span><b>${g.gg ? 'GUN' : 'SCORE'}</b></div>
        <table><thead><tr><th>Name</th><th>${g.gg ? 'Gun' : 'Score'}</th><th>K</th><th>D</th><th>A</th><th>K/D</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`;
      return;
    }
    const mine = g.player.team;
    const order = [mine, 1 - mine];
    const teams = order.map(t => g.characters.filter(c => c.team === t).sort((a, b) => b.score - a.score || b.kills - a.kills));
    const row = (c) => `<tr class="${c === g.player ? 'me' : ''} ${c.alive ? '' : 'dead'}"><td>${esc(c.name)}${c.isBot ? ' <span class="tag">BOT</span>' : ''}</td><td>${c.score}</td><td>${c.kills}</td><td>${c.deaths}</td><td>${c.assists}</td><td>${c.deaths ? (c.kills / c.deaths).toFixed(2) : c.kills.toFixed(2)}</td></tr>`;
    el.innerHTML = order.map((t, i) => `
      <div class="sb-team" style="--tc:${t === mine ? FRIENDLY_CSS : ENEMY_CSS}">
        <div class="sb-head"><span>${t === mine ? 'FRIENDLY' : 'ENEMY'}</span><b>${g.scores[t]}</b></div>
        <table><thead><tr><th>Name</th><th>Score</th><th>K</th><th>D</th><th>A</th><th>K/D</th></tr></thead>
        <tbody>${teams[i].map(row).join('')}</tbody></table>
      </div>`).join('');
  }

  killfeed(killer, victim, weaponId, headshot) {
    const g = this.game;
    const kf = $('killfeed');
    const d = document.createElement('div');
    d.className = 'kf' + ((killer === g.player || victim === g.player) ? ' mine' : '');
    const wname = WEAPONS[weaponId]?.short || ({ grenade: 'FRAG', semtex: 'SEMTEX', knife: 'KNIFE', shock: 'SHOCK', melee: 'MELEE', fall: 'FALL', train: 'TRAIN' }[weaponId] || '✖');
    const col = (c) => (c === g.player || !g.foes(c, g.player) ? FRIENDLY_CSS : ENEMY_CSS);
    const kName = killer && killer !== victim ? `<span style="color:${col(killer)}">${esc(killer.name)}</span>` : '';
    d.innerHTML = `${kName}<span class="kw">${wname}${headshot ? ' ◎' : ''}</span><span style="color:${col(victim)}">${esc(victim.name)}</span>`;
    kf.appendChild(d);
    while (kf.children.length > 6) kf.firstChild.remove();
    setTimeout(() => d.classList.add('fade'), 5000);
    setTimeout(() => d.remove(), 5600);
  }

  hitmarker(kill, headshot) {
    this.hitT = this.hitT0 = kill ? 0.45 : 0.18;
    this.hitPop = kill ? 0.7 : headshot ? 0.45 : 0.28;   // it lands a little big and snaps to size: a hit you feel
    this.hm.className = kill ? 'kill' : headshot ? 'head' : '';
  }

  // MW-style score events next to the crosshair: running total + event lines
  scoreEvent(label, pts) {
    const box = $('score-pop');
    if (this.popT <= 0) { box.innerHTML = ''; this.popTotal = 0; }
    this.popTotal += pts;
    this.popT = 2.2;
    let total = box.querySelector('.total');
    if (!total) { total = document.createElement('div'); total.className = 'sp total'; box.prepend(total); }
    total.textContent = `+${this.popTotal}`;
    const d = document.createElement('div');
    d.className = 'sp';
    d.textContent = pts ? `${label} +${pts}` : label;
    box.appendChild(d);
    while (box.children.length > 5) box.children[1].remove();
  }

  medal(title, sub = '') {
    if (this.onAnnounce) this.onAnnounce(title);   // the announcer says it (when there's a recording of it)
    const box = $('medal');
    box.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'medal';
    d.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    box.appendChild(d);
    setTimeout(() => d.classList.add('fade'), 1800);
    setTimeout(() => d.remove(), 2300);
  }

  message(text, cls = '') {
    const box = $('center-msg');
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.classList.add('fade'), 1400);
    setTimeout(() => d.remove(), 1900);
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }

  damageFrom(pos) {
    const g = this.game, p = g.player;
    const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z;
    const ang = Math.atan2(-dx, -dz) - p.yaw;
    const d = document.createElement('div');
    d.className = 'dmg';
    d.style.transform = `rotate(${-ang}rad)`;
    $('dmg-ind').appendChild(d);
    setTimeout(() => d.classList.add('fade'), 60);
    setTimeout(() => d.remove(), 1200);
  }

  showDeath(killer, weaponId) {
    const g = this.game;
    const wname = WEAPONS[weaponId]?.name || ({ grenade: 'Frag grenade', semtex: 'Semtex', knife: 'Throwing knife', shock: 'Shock stick', melee: 'Melee', fall: 'Fall damage', train: 'Hit by a train' }[weaponId] || '');
    if (killer && killer !== g.player) {
      $('death-killer').textContent = killer.name.toUpperCase();
      $('death-killer').style.color = !g.foes(killer, g.player) ? FRIENDLY_CSS : ENEMY_CSS;
      const dist = Math.round(killer.pos.distanceTo(g.player.pos));
      $('death-detail').textContent = `${wname.toUpperCase()} · ${dist} M · ${Math.ceil(killer.health)} HP LEFT`;
    } else {
      $('death-killer').textContent = 'YOURSELF';
      $('death-killer').style.color = 'var(--ink)';
      $('death-detail').textContent = wname.toUpperCase();
    }
    $('death').classList.add('on');
  }

  hideDeath() { $('death').classList.remove('on'); }

  countdown(n, intro = false) {
    const el = $('countdown');
    this.cls('count-label', 'on', n > 0 && intro);
    if (n <= 0) { el.classList.remove('on'); return; }
    if (el.textContent !== String(n)) {
      el.textContent = n;
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    }
  }
}
