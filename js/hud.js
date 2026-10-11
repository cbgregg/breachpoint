// HUD: DOM overlay for health, ammo, scores, killfeed, minimap, scoreboard, etc.
import { TEAMS, WEAPONS, PLAYER } from './config.js';
import { MAP } from './world.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('hud');
    this.ch = $('crosshair');
    this.hm = $('hitmarker');
    this.mm = $('minimap');
    this.mmCtx = this.mm.getContext('2d');
    this.hitT = 0;
    this.sbT = 0;
    this.fpsT = 0; this.frames = 0;
    this.msgQueue = [];
    this.lastHealth = 100;
  }

  show(on) { this.el.classList.toggle('on', on); }

  reset() {
    $('killfeed').innerHTML = '';
    $('center-msg').innerHTML = '';
    $('dmg-ind').innerHTML = '';
    $('death').classList.remove('on');
    $('scoreboard').classList.remove('on');
    $('countdown').classList.remove('on');
    $('hurt-flash').style.opacity = 0;
  }

  update(dt) {
    const g = this.game, p = g.player, ctl = g.playerCtl;
    // fps
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) { $('fps').textContent = `${Math.round(this.frames / this.fpsT)} FPS`; this.frames = 0; this.fpsT = 0; }
    $('fps').style.display = g.settings.showFps ? 'block' : 'none';

    // scores & timer
    $('score-blue').textContent = g.scores[0];
    $('score-red').textContent = g.scores[1];
    $('timer').textContent = fmtTime(g.timeLeft);
    $('timer').classList.toggle('low', g.timeLeft < 30);
    $('bar-blue').style.width = `${Math.min(100, g.scores[0] / g.settings.scoreLimit * 100)}%`;
    $('bar-red').style.width = `${Math.min(100, g.scores[1] / g.settings.scoreLimit * 100)}%`;

    // health
    const hp = Math.ceil(p.health);
    $('health-num').textContent = hp;
    $('health-fill').style.width = `${p.health / PLAYER.maxHealth * 100}%`;
    $('health-fill').classList.toggle('low', p.health < 35);
    const low = p.alive ? Math.max(0, 1 - p.health / 45) : 0;
    $('vignette').style.opacity = low.toFixed(2);

    // ammo
    const w = p.weapon;
    $('weapon-name').textContent = w.def.name;
    $('ammo-mag').textContent = w.mag;
    $('ammo-mag').classList.toggle('low', w.mag <= Math.ceil(w.def.mag * 0.25));
    $('ammo-res').textContent = w.reserve;
    $('grenades').textContent = '●'.repeat(p.grenades) + '○'.repeat(Math.max(0, 3 - p.grenades));
    const rl = $('reload-wrap');
    rl.classList.toggle('on', w.reloading);
    if (w.reloading) $('reload-fill').style.width = `${w.reloadProgress * 100}%`;
    $('protect').classList.toggle('on', p.alive && p.spawnProtect > 0);

    // crosshair
    const scoped = w.def.scope && p.adsT > 0.85;
    $('scope').classList.toggle('on', scoped && p.alive);
    const showCh = p.alive && p.adsT < 0.5 && !p.sprinting;
    this.ch.style.opacity = showCh ? 1 : 0;
    if (showCh) {
      const cam = g.camera;
      const gap = Math.tan(p.currentSpread()) / Math.tan(cam.fov * Math.PI / 360) * (window.innerHeight / 2) + 4;
      this.ch.style.setProperty('--gap', `${Math.min(80, gap).toFixed(1)}px`);
      this.ch.classList.toggle('enemy', !!g.aimTarget);
    }
    this.hitT -= dt;
    this.hm.style.opacity = this.hitT > 0 ? Math.min(1, this.hitT * 5) : 0;

    // scoreboard
    const tab = g.input.down('Tab') || g.state === 'ended';
    $('scoreboard').classList.toggle('on', tab && g.state !== 'ended');
    if (tab) { this.sbT -= dt; if (this.sbT <= 0) { this.renderScoreboard($('scoreboard')); this.sbT = 0.25; } }

    // death overlay
    if (!p.alive && g.state === 'playing') $('death-timer').textContent = `Respawning in ${Math.max(0, p.respawnT).toFixed(1)}s`;

    this.drawMinimap();
  }

  drawMinimap() {
    const g = this.game, ctx = this.mmCtx, mm = g.world.minimap;
    const W = this.mm.width, H = this.mm.height;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(mm.canvas, 0, 0, W, H);
    const sx = W / (MAP.maxX - MAP.minX), sz = H / (MAP.maxZ - MAP.minZ);
    const toX = (x) => (x - MAP.minX) * sx, toY = (z) => (z - MAP.minZ) * sz;
    for (const c of g.characters) {
      if (!c.alive || c === g.player) continue;
      const friend = c.team === g.player.team;
      if (!friend && g.time - c.lastFireT > 1.5) continue;
      ctx.fillStyle = TEAMS[c.team].css;
      ctx.beginPath();
      ctx.arc(toX(c.pos.x), toY(c.pos.z), friend ? 3 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = g.player;
    if (p.alive) {
      ctx.save();
      ctx.translate(toX(p.pos.x), toY(p.pos.z));
      ctx.rotate(-p.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  renderScoreboard(el) {
    const g = this.game;
    const teams = [0, 1].map(t => g.characters.filter(c => c.team === t).sort((a, b) => b.score - a.score || b.kills - a.kills));
    const row = (c) => `<tr class="${c === g.player ? 'me' : ''} ${c.alive ? '' : 'dead'}"><td>${esc(c.name)}${c.isBot ? ' <span class="tag">BOT</span>' : ''}</td><td>${c.score}</td><td>${c.kills}</td><td>${c.deaths}</td><td>${c.assists}</td></tr>`;
    el.innerHTML = [0, 1].map(t => `
      <div class="sb-team" style="--tc:${TEAMS[t].css}">
        <div class="sb-head"><span>${TEAMS[t].label}</span><b>${g.scores[t]}</b></div>
        <table><thead><tr><th>Name</th><th>Score</th><th>K</th><th>D</th><th>A</th></tr></thead>
        <tbody>${teams[t].map(row).join('')}</tbody></table>
      </div>`).join('');
  }

  killfeed(killer, victim, weaponId, headshot) {
    const kf = $('killfeed');
    const d = document.createElement('div');
    d.className = 'kf' + ((killer === this.game.player || victim === this.game.player) ? ' mine' : '');
    const wname = WEAPONS[weaponId]?.short || (weaponId === 'grenade' ? 'FRAG' : weaponId === 'fall' ? 'FALL' : '✖');
    const kName = killer && killer !== victim ? `<span style="color:${TEAMS[killer.team].css}">${esc(killer.name)}</span>` : '';
    d.innerHTML = `${kName}<span class="kw">[${wname}${headshot ? ' ⌖' : ''}]</span><span style="color:${TEAMS[victim.team].css}">${esc(victim.name)}</span>`;
    kf.prepend(d);
    while (kf.children.length > 6) kf.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), 5000);
    setTimeout(() => d.remove(), 5600);
  }

  hitmarker(kill, headshot) {
    this.hitT = kill ? 0.45 : 0.22;
    this.hm.className = kill ? 'kill' : headshot ? 'head' : '';
  }

  message(text, cls = '') {
    const box = $('center-msg');
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => d.classList.add('fade'), 1400);
    setTimeout(() => d.remove(), 1900);
  }

  damageFrom(pos) {
    const g = this.game, p = g.player;
    const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z;
    const ang = Math.atan2(-dx, -dz) - p.yaw; // relative bearing (0 = in front)
    const d = document.createElement('div');
    d.className = 'dmg';
    d.style.transform = `rotate(${-ang}rad)`;
    $('dmg-ind').appendChild(d);
    setTimeout(() => d.classList.add('fade'), 50);
    setTimeout(() => d.remove(), 1200);
    const hf = $('hurt-flash');
    hf.style.transition = 'none';
    hf.style.opacity = 0.35;
    requestAnimationFrame(() => { hf.style.transition = 'opacity .5s'; hf.style.opacity = 0; });
  }

  showDeath(killer, weaponId) {
    const el = $('death');
    const wname = WEAPONS[weaponId]?.name || (weaponId === 'grenade' ? 'Frag Grenade' : 'the environment');
    $('death-killer').innerHTML = killer && killer !== this.game.player
      ? `Killed by <b style="color:${TEAMS[killer.team].css}">${esc(killer.name)}</b> <span>(${Math.ceil(killer.health)} HP left)</span>`
      : 'You died';
    $('death-weapon').textContent = wname;
    el.classList.add('on');
  }

  hideDeath() { $('death').classList.remove('on'); }

  countdown(n) {
    const el = $('countdown');
    if (n <= 0) { el.classList.remove('on'); return; }
    el.classList.add('on');
    el.textContent = n;
  }
}

export { esc, fmtTime };
