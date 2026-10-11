# Breachpoint

A browser-based first-person shooter with **Team Deathmatch** and **AI bots**, built with [Three.js](https://threejs.org/). No build step, no assets to download — every texture and sound is generated at runtime, so it deploys to GitHub Pages as plain static files.

**Play:** `https://<your-username>.github.io/breachpoint/` (after enabling Pages — see below)

## Features

| Area | What's included |
|---|---|
| Game mode | Team Deathmatch, Blue vs Red, configurable score limit (25–150) and time limit (5–20 min), 3-second pre-match countdown, victory/defeat/draw screen with MVP |
| Bots | Up to 15 bots (8v8). Vision cone + line-of-sight perception, hearing gunfire, team intel sharing, A* pathfinding on a nav grid, strafing, crouching, jumping, stuck recovery, health/ammo seeking, grenade throws, weapon swapping by range. Three difficulties (reaction time, aim error, tracking lag, turn rate, headshot chance) |
| Weapons | AR-7 Rifle, VX-9 SMG, M12 Shotgun (9 pellets), LR-50 Sniper (scope overlay), P-45 Pistol sidearm, frag grenades. Per-weapon fire rate, damage falloff, headshot multipliers, spread, bloom, recoil, ADS zoom, reload times |
| Movement | Walk, sprint, crouch, jump, step-up onto stairs/ledges, air control, collision with wall sliding |
| Combat | Hitscan with head/body hitboxes, falloff, friendly-fire toggle, spawn protection, health regen, assists, kill streaks and multikills |
| Map | Symmetric arena: central raised platform with stairs, lane walls, containers, a hut on each flank, sandbag cover, team bases with colored zones. Spawn selection avoids enemies and line of sight |
| Pickups | Health packs (incl. contested one on the platform), ammo crates, ammo drops from eliminated players |
| HUD | Health, ammo, grenades, team score bars, timer, dynamic crosshair (red on enemy), hitmarkers (headshot/kill variants), damage direction indicators, low-health vignette, killfeed, minimap (enemies show when firing), scoreboard (Tab), death screen with killer HP, FPS counter |
| Effects | Tracers, muzzle flashes with dynamic lights, bullet decals, sparks, blood, explosions with smoke and camera shake, real-time shadows, fog, sky dome |
| Audio | Fully synthesized WebAudio: per-weapon gunshots, stereo-panned and distance-attenuated; reloads, footsteps, hit/headshot/kill confirms, explosions, pickups |
| Platforms | Desktop (pointer lock, with free-look fallback) and touch devices (virtual joystick, look-drag, on-screen buttons) |
| Settings | Callsign, primary weapon, team size, difficulty, limits, sensitivity, FOV, volume, invert Y, friendly fire, FPS — saved to `localStorage` |

## Controls

| Action | Keyboard / Mouse | Touch |
|---|---|---|
| Move | `W` `A` `S` `D` / arrows | Left-side joystick |
| Look | Mouse | Drag right side |
| Fire | Left click | FIRE (drag to aim while firing) |
| Aim down sights | Right click (hold) | ADS (toggle) |
| Sprint | `Shift` | SPRINT (toggle) |
| Jump | `Space` | JUMP |
| Crouch | `C` / `Ctrl` | CROUCH (toggle) |
| Reload | `R` | RELOAD |
| Switch weapon | `1` `2` / `Q` / wheel | SWAP |
| Frag grenade | `G` | FRAG |
| Scoreboard | `Tab` (hold) | TAB (hold) |
| Pause | `Esc` / `P` | ❚❚ |

## Deploy to GitHub Pages

The repo ships with `.github/workflows/pages.yml`, which publishes the repository root on every push to `main`.

1. Push this repo to GitHub (see below).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually from the **Actions** tab). The site URL appears in the workflow summary.

Alternative without Actions: **Settings → Pages → Source: Deploy from a branch → `main` / root**. The `.nojekyll` file is already included.

### Create the repo from this folder

```bash
# with the GitHub CLI
gh repo create breachpoint --public --source=. --remote=origin --push

# or manually
git remote add origin https://github.com/<your-username>/breachpoint.git
git push -u origin main
```

## Run locally

ES modules need to be served over HTTP (opening `index.html` from disk won't work):

```bash
npx serve .            # or: python3 -m http.server 8000
```

Then open the printed URL.

## Project structure

| Path | Purpose |
|---|---|
| `index.html` | Page shell, HUD markup, menus, import map for Three.js (CDN) |
| `css/style.css` | Menus, HUD, scoreboard, touch controls |
| `js/main.js` | Boot, menu wiring, settings persistence |
| `js/game.js` | Match loop, rendering, hitscan resolution, grenades, kills/assists/scoring, spawns, pickups |
| `js/config.js` | **All tuning**: weapons, movement, grenades, scoring, bot difficulty, defaults |
| `js/character.js` | Shared player/bot logic: movement, health, weapon handling, humanoid model + animation |
| `js/player.js` | Local player input, first-person camera, viewmodel animation (bob, sway, recoil, reload, ADS) |
| `js/bot.js` | Bot AI: perception, goal selection, pathing, aiming, firing, grenades |
| `js/nav.js` | Navigation grid, A* with octile heuristic, path smoothing |
| `js/physics.js` | AABB collision, character movement with step-up, raycasts |
| `js/world.js` | Map layout (mirrored for symmetry), lighting, sky, spawns, minimap render |
| `js/weapons.js` | Weapon state (ammo/reload), gun meshes, spread cone |
| `js/effects.js` | Instanced particles, tracers, decals, lights, explosions |
| `js/audio.js` | Synthesized positional sound |
| `js/hud.js` | HUD updates, minimap, scoreboard, killfeed |
| `js/input.js` | Keyboard, mouse/pointer lock, touch controls |
| `js/textures.js` | Procedural canvas textures |

## Tuning

Everything gameplay-related lives in `js/config.js`:

| Want to… | Edit |
|---|---|
| Change weapon damage / fire rate / spread / mag size | `WEAPONS.<id>` |
| Make bots harder or easier | `DIFFICULTY.<level>` — `reaction`, `aimError`, `aimFloor`, `lag`, `turnRate`, `headChance` |
| Change movement feel | `PLAYER` — `walk`, `sprint`, `jump`, `gravity`, `accel*` |
| Change grenade behavior | `GRENADE` |
| Change default match settings | `DEFAULT_SETTINGS` |
| Edit the map | `HALF` / `CENTER` arrays in `js/world.js` (entries in `HALF` are mirrored automatically) |

## Tech notes

- Three.js r160 loaded from jsDelivr via an import map; no bundler.
- The viewmodel renders in a second pass with a cleared depth buffer so the gun never clips into walls.
- Collision uses axis-aligned boxes; the nav grid is baked from the same colliders at load.
- `window.__game` exposes the running game in the console for debugging.

## License

MIT — see [LICENSE](LICENSE).
