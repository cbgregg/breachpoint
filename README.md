# Breachpoint

A browser first-person shooter in the style of modern military shooters: **Team Deathmatch** against **AI bots** or **online with friends using a 6-digit code** (peer-to-peer, no server), on a dusty market district, with full **Xbox controller** support. Built with [Three.js](https://threejs.org/). No build step — apart from one rigged soldier model, every gun, building and sound is generated at runtime (surface textures are CC0 photo scans), so it deploys to GitHub Pages as plain static files.

**Play:** `https://<your-username>.github.io/breachpoint/` (after enabling Pages — see below)

## Features

| Area | What's included |
|---|---|
| Look | Physical sky at dusk (sun 5° above the horizon, deep orange light, very long shadows, violet shade, street lamps casting real light pools), with Mount Rainier glowing in alpenglow on the eastern horizon with image-based lighting, real-time soft shadows, ground-truth ambient occlusion (GTAO), bloom, filmic tone mapping, color grade, vignette, chromatic aberration, film grain, SMAA. Rounded-edge geometry throughout, 4096 shadow maps on High. Photo-scanned PBR materials (albedo + normal + roughness, CC0) for asphalt, concrete, plaster, brick, corrugated steel, painted metal, wood, weathered planks, dirt, cobblestone, sandbags, cloth, HESCO and rubber, with procedural fallbacks. Height fog that hugs the ground and glows toward the sun, drifting dust motes, dust kicked up by sprinting feet and slides. Quality presets Low → Ultra |
| Maps | Both maps are built for close-quarters fights around corners: lanes are broken by staggered houses, walls, containers and kiosks so nothing gives a straight line from one side to the other (checked automatically for long sightlines), and the divider rows are **enterable houses** with real doorways and window openings you can see and shoot through, tiled floors, shelving, tables and hanging bulbs. Brighter street lamps with pools of light (on High/Ultra each lamp is also a real spotlight that lights walls, players and the street), festoon lights strung across the mid lanes, a few warm point lights (off on Low). Solid blocks and the perimeter have proper windows: recessed glass, painted frames and mullions, stone sills, shutters, curtains and grime streaks. Sandbags are pillowy bags laid in an overlapping bond; cars are modeled sedans with arches, glass, lights and rims. **Tarsa Market**: market streets around a central house with rooftop access. **Shuran Yard**: three lanes (market street, yard, container stacks). Pick a map (or Random) on the Play tab; online, guests load the host's map, and quick matches rotate randomly. |
| Operators | Rigged, textured soldier model with motion-captured idle/walk/run animation, blended by speed; legs turn toward movement while the upper body stays on the aim; IK arms grip each weapon's pistol grip and foregrip. Procedural motion on top of the clips: one shared gait phase so walk/run blend without double-stepping and stride matches ground speed, spring-driven lean into acceleration and turns, landing compression and airborne tuck, hit flinches in the direction of each shot (head snaps on headshots), and **ragdoll deaths** (verlet skeleton seeded with the body's momentum and the killing shot's impulse, colliding with the ground and nearby cover; the gun tumbles free). The same rig provides the first-person arms and gloves (longer than life, as in every shooter, so both hands sit on the grip and foregrip; fingers close around the gun, the gun cants in during reloads so you see the hands work the magazine). Falls back to procedural operators if the model can't load |
| Weapons | Guns built from real side-profile silhouettes with rounded edges, lathed barrels, muzzle devices and scopes. MK-4 Carbine (holographic sight), VX-9 SMG (reflex sight), M12 pump shotgun, LR-50 bolt-action with scope, P-45 sidearm, frag grenades, melee. Detailed models with glowing reticles, animated magazine reloads (faster tactical reloads), pump and bolt cycling, ejected brass, recoil with recovery, ADS breathing sway (hold breath on the sniper), damage falloff, headshots |
| Gunsmith | Five attachment slots with real trade-offs, modeled on the gun in first and third person and previewed in 3D on the Loadout tab. **Optics:** iron sights, reflex, holographic, 4× prism scope (eyecup-framed magnified view with a chevron), 8× sniper scope. **Muzzle:** compensator, suppressor (off the compass and minimap, quieter, no muzzle flash, bots hear it less, −15% range), full choke for the shotgun. **Underbarrel:** vertical grip (recoil) or angled grip (aim speed). **Magazine:** extended (+50%, slower reload) or fast mag. **Tac laser:** tighter hip fire and faster aim, but a visible beam. Stat bars show gains and losses against stock. Bots roll random builds; online, loadouts sync to everyone |
| Movement | Walk, sprint, **tactical sprint** (MW-style: 9.8 m/s with the gun raised for up to 4 s, recharges after a second off it; bots use it on long runs), crouch, **slide**, jump, step-up onto stairs/ledges |
| Grenades & inspect | **Cook frags:** hold G / LB / FRAG to pull the pin (ticking fuse ring by the crosshair, frag in hand), release to throw with the remaining fuse; hold too long and it goes off in your hand. Bots cook too. **Inspect** your weapon with I / D-pad down; it plays automatically during the start countdown |
| Death & respawn | The camera swings round to your killer and zooms in on them (rising over cover if needed), with a 5-second countdown. Respawn early after 1.5 s with X / A, R / Space or a click, or press Start / Esc (or the CHANGE LOADOUT button) to open the pause menu straight onto Change Loadout. Loadout changes made in the first 5 seconds after spawning (before you fire) apply instantly, so you can also pick your class during the countdown |
| Online | Host a match and share a 6-digit code (or invite link); friends type it in and join. Peer-to-peer over WebRTC, so it runs on GitHub Pages with no game server. Host-authoritative with input validation, lag compensation, client-side prediction and wallhack-resistant culling (see below). Up to 8 humans, bots fill the rest, players can drop in mid-match |
| Readability | Black Ops 2-style: friendly names with a blue marker above teammates (visible through walls), enemy names in red when your crosshair is on them, a soft rim light on every soldier, distinct kits (tan vs. cool slate) and a brighter, more saturated grade |
| Bots | Up to 15 bots (8v8). Gradual spotting (a per-enemy meter driven by how much of you is exposed, distance, view angle, movement and gunfire, so a peek over cover isn't an instant death), aim at whatever part of you is actually visible with more error when you're mostly covered, vision cone + line of sight, hearing, team intel, A* pathfinding, strafing, crouching, grenades, melee at close range, health/ammo seeking, weapon swaps by range. Three difficulties |
| Pause menu | Live match panel (score, time, your stats, current build, scoreboard), Change Loadout (applies on next spawn, also online), full Options, host controls online, confirm-to-quit/restart. Compact layout on phones |
| HUD | Compass with enemy gunfire pings, rotating minimap rendered from the actual map, friendly/enemy score widget, ammo cluster with fire mode and equipment, score pop-ups beside the crosshair, medals (multikills, streaks, payback), killfeed, hitmarkers, directional damage, red-out damage effect, death card with killer distance and HP, scoreboard with K/D, device-aware button prompts |
| Controller | Xbox / standard gamepads: radial deadzone, response curve, separate sensitivity, aim assist (slowdown, rotational tracking, ADS snap), rumble, full menu navigation with D-pad/stick, bumpers switch tabs, glyphs swap automatically between keyboard and controller |
| Music | Original score synthesized live (no recordings, so nothing to license): a slow D-minor menu theme and a 112 BPM action track whose layers build with recent fighting, the last minute and close finishes; end-of-match stings; separate music volume. Swap in your own tracks via `MUSIC_FILES` in `js/config.js` |
| Audio | Synthesized: layered gunshots (crack, body, thump, tail) with distance filtering and street reverb, bolt/pump foley, bullet whiz on near misses, casing tinkles, footsteps, explosions, hit/headshot/kill confirms |
| Platforms | Desktop (pointer lock with free-look fallback), controller, touch (virtual stick + buttons; push the stick all the way forward to sprint; tap-to-aim and auto-fire on target by default, both in Options) |
| Settings | Saved to `localStorage`: callsign, loadout, match size, difficulty, limits, friendly fire, quality, ADS zoom (scales every optic's magnification), sight size when aiming (Normal / Large / Huge: how much of the screen the optic fills), FOV (Call of Duty-style: degrees across a 4:3 frame, 80 = MW default), mouse/stick sensitivity, deadzone, aim assist, vibration, invert, volume, FPS counter |

## Controls

| Action | Keyboard & mouse | Xbox controller | Touch |
|---|---|---|---|
| Move | `W` `A` `S` `D` | Left stick | Left-side joystick |
| Look | Mouse | Right stick | Drag right side |
| Fire | Left click | RT | FIRE |
| Aim down sights (Hold by default; Toggle in Options) | Right click | LT | ADS (drag it to aim; a second FIRE button appears on the left while aiming) |
| Jump | `Space` | A | JUMP |
| Crouch / slide while sprinting | `C` / `Ctrl` | B (tap) | CROUCH |
| Sprint (cancels reload) / hold breath (scoped) | `Shift` | L3 (click) | SPRINT |
| Tactical sprint (faster, gun up, ~4 s then recharges) | Double-tap `Shift` | Click L3 again while sprinting | Push the stick to sprint twice quickly |
| Reload | `R` | X | RELOAD |
| Swap weapon | `Q`, `1` `2`, wheel | Y | SWAP |
| Frag grenade (hold to cook, release to throw) | `G` | LB | FRAG |
| Inspect weapon | `I` | D-pad down | — |
| Respawn early (while dead) | `R` / `Space` / click | X / A | RESPAWN |
| Melee | `V` | R3 | MELEE |
| Scoreboard | `Tab` (hold) | View (hold) | TAB |
| Pause | `Esc` / `P` | Menu | ❚❚ |
| Menu tabs | `Q` / `E` | LB / RB | tap |

The controller follows Call of Duty's **Default** button layout. RB (tactical equipment) and the rest of the D-pad (killstreaks) are unused because the game has neither; D-pad down inspects your weapon.

Browsers only expose a controller after you press a button on it, so press any button once the page is open. Xbox controllers that a browser reports without the standard layout (common in Firefox on macOS and Linux) are remapped automatically.

## Online play

**Quick match** puts you in a public game with no code: the game checks for open public lobbies for a few seconds and drops you into the fullest one, mid-match if one is running, taking a bot's slot. If none are open, you host one and others drop in. Public matches use fixed rules (6v6 with bots, 75 kills, 10 minutes, no friendly fire), start the next match automatically, and if the host leaves everyone is moved to another match. Finding a match only reads small public notices on Nostr relays, so nothing connects to you until you join one. The first time, the game explains that other players in a public match can see your IP address.

**Private matches** use a code:

1. **Host:** Play tab → set match size, limits and friendly fire → **HOST ONLINE MATCH**. You get a code like `482 913` and an invite link.
2. **Friends:** **JOIN WITH CODE** → type the code (keyboard, controller or on-screen keypad) → **JOIN**. Opening the invite link fills the code in.
3. With *Approve each player* on (default), the host accepts or denies each request. The host can switch players' squads, kick (which also bans for the session), and accept people mid-match from **Pause → Players & join requests**; each new player takes a bot's slot.
4. **START MATCH**. Empty slots are filled with bots. After the match everyone returns to the lobby for a rematch.

The match keeps running while the pause menu is open in online play. The host should keep their tab in the foreground: browsers slow down background tabs.

### How it's secured

There is no game server. The host's browser runs the match and everyone else connects to it directly.

- **Host-authoritative:** guests only ever send inputs (stick axes, view angles, buttons). The host checks every field, rejects anything malformed, and simulates the movement, shots, damage and scoring itself. A modified client can't teleport, fly, give itself ammo or health, or report hits.
- **Speed-hack guard:** a guest's inputs are spent against a real-time budget, so sending inputs faster than real time doesn't make them move faster.
- **Lag compensation:** the host rewinds other players to where the shooter actually saw them (up to 0.5 s), so hits register fairly on normal connections.
- **Anti-wallhack:** each guest is only sent enemies they could plausibly see (line-of-sight checked from their eye to the enemy's head, chest and legs, plus anyone very close). Enemies behind walls aren't in the data, so there's nothing to reveal.
- **Join control:** optional per-player approval (private matches), kick and ban. Offensive callsigns (including letter swaps like `4`→`a`) are replaced with `Operator-123` on every screen. Guests ignore game messages from anyone except the host, and every peer is rate-limited.
- **Encrypted transport:** the code is used to find the host through public Nostr relays. That signaling is encrypted with a key derived from the code, and game traffic is WebRTC (DTLS), end to end between players.

**Limits to know:**
- The host can cheat, since their browser is the referee. Play with people you'd hand the code to.
- **IP addresses:** quick matches go through a Cloudflare TURN relay (relay-only ICE), so no player sees another's IP; the lobby shows "Connected through Cloudflare relay" when that's active. Private matches connect directly (players can see each other's IPs) and use the relay only if a direct connection fails, unless *Options → Hide my IP in private matches* is on. If the relay is unreachable the game falls back to direct and says so.
- Six digits keep codes easy to type, but someone could guess an active code. Leave *Approve each player* on if that matters to you.
- Some strict networks (certain corporate or mobile carriers) block direct WebRTC connections. Without a TURN relay server, roughly 1 in 10 player pairs may fail to connect; try another network, or have someone else host.
- Online play needs the game served over HTTPS (GitHub Pages is fine) or `localhost`.

**TURN relay setup:** `cloudflare/turn-worker.js` is a Cloudflare Worker that turns a Cloudflare Realtime TURN key into short-lived credentials (the key's token stays in the Worker as a secret). Deploy it, set `TURN_KEY_ID` (text) and `TURN_KEY_API_TOKEN` (secret), and put its URL in `TURN_ENDPOINT` in `js/config.js`. It only answers requests from `ALLOWED_ORIGINS` (default `https://cbgregg.github.io`) and rate-limits per IP.

**Advanced URL options:** `?relay=wss://relay1,wss://relay2` uses your own Nostr relays; `?stun=0` skips public STUN servers (LAN play).

## Deploy to GitHub Pages

The repo ships with `.github/workflows/pages.yml`, which publishes the repository root on every push to `main`.

1. Push this repo to GitHub (see below).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow from the **Actions** tab). The site URL appears in the workflow summary.

Alternative without Actions: **Settings → Pages → Source: Deploy from a branch → `main` / root**. `.nojekyll` is included.

```bash
gh repo create breachpoint --public --source=. --remote=origin --push
# or
git remote add origin https://github.com/<your-username>/breachpoint.git && git push -u origin main
```

## Run locally

ES modules need HTTP (opening `index.html` from disk won't work):

```bash
npx serve .            # or: python3 -m http.server 8000
```

## Project structure

| Path | Purpose |
|---|---|
| `index.html` | Page shell, HUD, menus, import map for Three.js + addons (CDN) |
| `css/style.css` | Menus, HUD, scoreboard, touch controls |
| `js/main.js` | Boot, menu tabs, controller/keyboard menu navigation, settings persistence |
| `js/game.js` | Match loop (local / host / guest modes), hitscan + melee + grenades, kills/assists/medals, spawns, pickups |
| `js/net.js` | Peer-to-peer transport: 6-digit codes, Nostr signaling, WebRTC data channels |
| `js/online.js` | Lobby (approval, kick, teams), host session (input validation, lag compensation, culled snapshots), guest session (prediction, reconciliation, interpolation) |
| `js/quickplay.js` | Quick match: public lobby notices over Nostr, choosing a lobby |
| `js/names.js` | Callsign filter |
| `lib/trystero.js` | Vendored [Trystero](https://github.com/dmotz/trystero) 0.25 (Nostr strategy), MIT |
| `js/render.js` | Sky + IBL, shadows, post-processing chain, quality presets |
| `js/config.js` | **All tuning**: weapons, movement, grenades, scoring, bot difficulty, quality presets, defaults |
| `js/world.js` | Map layout (mirrored), dressing merged per material, minimap render |
| `js/textures.js` | Procedural PBR texture sets (overridden by `assets/textures/` when present) |
| `assets/textures/` | Photo PBR sets: `<name>/color.jpg`, `normal.jpg`, `rough.jpg` |
| `js/assets.js` | Loads the rigged soldier (GLTF) and clones it per character |
| `js/character.js` | Shared player/bot logic, soldier animation blending, IK arms, first-person body, procedural fallback |
| `js/motion.js` | Gait phase, spring body dynamics, hit reactions, ragdoll |
| `js/player.js` | Local player: input → movement/weapons, camera, viewmodel with IK arms, aim assist |
| `js/weapons.js` | Weapon state, detailed gun models and attachment parts, spread cone |
| `js/attachments.js` | Gunsmith slots, attachment stats, loadout strings sent over the network |
| `js/gunsmith.js` | 3D weapon preview on the Loadout tab |
| `js/bot.js` | Bot AI |
| `js/nav.js` | Navigation grid, A*, path smoothing |
| `js/physics.js` | AABB collision, step-up movement, raycasts |
| `js/effects.js` | Soft particles, tracers, casings, debris, decals, explosions |
| `js/audio.js` | Synthesized positional audio with reverb |
| `js/music.js` | Procedural menu and action music, intensity layering, optional file playback |
| `js/hud.js` | Compass, minimap, score events, killfeed, scoreboard, button glyphs |
| `js/input.js` | Keyboard, mouse, gamepad (mapping, curves, rumble, menu nav), touch |

## Tuning

| Want to… | Edit |
|---|---|
| Change weapon damage / fire rate / recoil / mag size | `WEAPONS.<id>` in `js/config.js` |
| Tune or add attachments | `ATTACHMENTS` / `GUNSMITH` in `js/attachments.js` |
| Make bots harder or easier | `DIFFICULTY.<level>` |
| Change movement / slide feel | `PLAYER` |
| Change graphics presets | `QUALITY` |
| Edit the map | `HALF` / `CENTER` arrays in `js/world.js` (entries in `HALF` are mirrored) |
| Change the color grade | `GradeShader` uniforms in `js/render.js` |

## Performance notes

- High uses GTAO + bloom + SMAA at 1.25× pixel ratio; drop to **Medium** on integrated GPUs and **Low** on phones (the default on touch devices; Low keeps a 1024 sun shadow map and bloom, but drops AO, AA and the map point lights).
- Static map geometry is merged per material, so the whole district renders in a few dozen draw calls.

## Credits

- Soldier model and animations (`assets/models/soldier.glb`): the *Soldier* sample from the [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf), a Mixamo character. Mixamo assets are royalty-free for use in projects under Adobe's terms; check those terms before commercial use, or swap in your own rigged `.glb` with a Mixamo skeleton.
- Peer-to-peer matchmaking: [Trystero](https://github.com/dmotz/trystero) by Dan Motzenbecker (MIT), vendored in `lib/`.
- Surface textures (`assets/textures/`): CC0 sets from [ambientCG](https://ambientcg.com) (Asphalt014, Concrete047A, Plaster003, CorrugatedSteel009, Ground037, Fabric049/061/066, Rubber001) and [Poly Haven](https://polyhaven.com) (red_brick_03, green_metal_rust, wood_planks, weathered_brown_planks, cobblestone_floor_08), resized and recolored for the maps.
- Everything else (code, guns, map, audio) is generated in this repo.

## License

Code: MIT — see [LICENSE](LICENSE).
