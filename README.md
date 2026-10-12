# Breachpoint

A browser first-person shooter in the style of modern military shooters: **Team Deathmatch** against **AI bots** or **online with friends using a 6-digit code** (peer-to-peer, no server), on a dusty market district, with full **Xbox controller** support. Built with [Three.js](https://threejs.org/). No build step — apart from the rigged soldier and first-person hand models, every gun, building and sound is generated at runtime (surface textures are CC0 photo scans), so it deploys to GitHub Pages as plain static files.

**Play:** [breach-point.net](https://breach-point.net) · **Status:** pre-alpha

Developed by cbgregg. Artificial intelligence was used to assist with development of this project. Keep the servers running: it's a one-man team, so if you enjoy it, [buy me a coffee](https://buymeacoffee.com/breachpoint). Feature requests and feedback: [open an issue](https://github.com/cbgregg/breachpoint/issues/new).

## Features

| Area | What's included |
|---|---|
| Look | Physical sky at dusk (sun 5° above the horizon, deep orange light, very long shadows, violet shade, street lamps casting real light pools), with Mount Rainier glowing in alpenglow on the eastern horizon with image-based lighting, real-time soft shadows, ground-truth ambient occlusion (GTAO), bloom, filmic tone mapping, color grade, vignette, chromatic aberration, film grain, SMAA. Rounded-edge geometry throughout, 4096 shadow maps on High. Photo-scanned PBR materials (albedo + normal + roughness, CC0) for asphalt, concrete, plaster, brick, corrugated steel, painted metal, wood, weathered planks, dirt, cobblestone, sandbags, cloth, HESCO and rubber, with procedural fallbacks. Height fog that hugs the ground and glows toward the sun, drifting dust motes, dust kicked up by sprinting feet and slides. Quality presets Low → Ultra |
| Maps | Both maps are built for close-quarters fights around corners: lanes are broken by staggered houses, walls, containers and kiosks so nothing gives a straight line from one side to the other (checked automatically for long sightlines), and the divider rows are **enterable houses** with real doorways and window openings you can see and shoot through, tiled floors, shelving, tables and hanging bulbs. Brighter street lamps with pools of light (on High/Ultra each lamp is also a real spotlight that lights walls, players and the street), festoon lights strung across the mid lanes, a few warm point lights (off on Low). Solid blocks and the perimeter have proper windows: recessed glass, painted frames and mullions, stone sills, shutters, curtains and grime streaks. Sandbags are pillowy bags laid in an overlapping bond; cars are modeled sedans with arches, glass, lights and rims. **Tarsa Market**: market streets around a central house with rooftop access. **Shuran Yard**: three lanes (market street, yard, container stacks). **Freshway Market** (indoor): a supermarket under one roof with checkout lanes and shop windows, aisles with a cross aisle, produce, wall freezers, a bakery with rack and deck ovens, a deli, the stockroom, staff offices and a break room; the parking lot out front and the delivery yard out back are the spawns, side alleys link them. The store's ceiling speakers play bossa-nova muzak (loud inside, faint outside), and a soldier on his smoke break stands by the staff door; nothing in the match touches him. Pick a map (or Random) on the Play tab; online, guests load the host's map, and quick matches rotate randomly. |
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
| Settings | Saved to `localStorage`: Name Tag (offline), loadout, match size, difficulty, limits, friendly fire, quality, ADS zoom (scales every optic's magnification), sight size when aiming (Normal / Large / Huge: how much of the screen the optic fills), FOV (Call of Duty-style: degrees across a 4:3 frame, 80 = MW default), mouse/stick sensitivity, deadzone, aim assist, vibration, invert, volume, FPS counter |

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

## Game modes

Pick a mode on the Play tab. All three work offline against bots and online.

| Mode | Teams | How you win a round | Match |
|---|---|---|---|
| **Team Deathmatch** | 2v2 to 8v8 | Respawns on; every kill scores | Score or time limit |
| **Gunfight** | 2v2 | One life each. Everyone gets the same random loadout (new every two rounds). After 40 s a flag appears in the middle: hold it for 3 s to win, or the team with more health left after 10 s of overtime takes the round | First to 6 rounds |
| **Search & Destroy** | 2v2 to 8v8 | One life each. Attackers carry a bomb to site A or B and hold **R / F** (controller **X**) for 5 s to plant; it goes off 45 s later. Defenders hold the same button for 7.5 s to defuse. Wipe the other team, run out the clock (defenders), or detonate / defuse | First to 4 rounds, sides switch at halftime |

In round modes there are no pickups, the bomb carrier drops it on death (any attacker can pick it up), and once you're out you spectate a living teammate (**Space / click / A** to switch). Bots play the objective: they plant, defuse, guard sites and rush the overtime flag.

## Online play

The game opens on a title screen (**press Enter / A / tap to start**), then **Offline** (versus bots, no account) or **Online**. With accounts turned on (below), Online asks you to sign in first.

### Accounts (passwordless email sign-in)

There are no passwords. You enter your email and get a **sign-in link** (links only, no codes). Open it on the same device and you're in. Tick **Remember me** to stay signed in on that device for 60 days; the game warns you to use it only on your own device. Without it the session ends when the browser closes (and after a day at most on the server).

- **Name Tag**: what everyone sees in matches. Name Tags aren't unique (anyone can pick any tag that passes the filter), and you can change yours **once a day**. Friends can see your previous Name Tags.
- **Display name**: optional, and only your friends see it.
- **Friend code** (`ABCD-2345`): every account gets one. Give it to friends; they enter it to send you a request.
- **Social sidebar**: press **Y** on a controller, **F** on a keyboard, or tap **FRIENDS** in any menu. Sign in, change your Name Tag and display name, copy your friend code, add friends by code, accept / decline / cancel requests, see who's online and where (menus, lobby or match, mode and map), and **Join** a friend's lobby or match. Friends skip the host's approval step.
- *Options → Account* has Sign out and Delete account (which also removes you from friends' lists).

Why it's safe:
- Sign-in links expire after 15 minutes and work once. Only hashes of links and sessions are stored, so a leaked database can't sign anyone in.
- The link token sits in the URL fragment (`#login=…`), which browsers never send to a server, and the game wipes it from the address bar immediately. The page sends no referrer.
- Sign-in emails and friend requests are rate-limited, and the server gives the same answer whether or not an email has an account.
- **Nobody can see anyone's email.** The server never returns an email to other players or friends; you see your own only masked (`c•••••@example.com`).
- In online matches each player carries a **signed match pass** for that match only. The host checks it before letting anyone in, so nobody can join without an account or under someone else's account, and a kicked or declined account can't rejoin from a new tab.
- Presence (online / where you are / your match code) is only shown to accepted friends, and expires two minutes after you close the game.

The account server is `cloudflare/auth-worker.js` (Cloudflare Worker + Workers KV, email sent through Resend). With `AUTH_ENDPOINT` empty in `js/config.js`, accounts are off and Online works without signing in.

**Setup** (about 15 minutes, free tiers):
1. **Resend** (resend.com): sign up → *Domains → Add domain* `breach-point.net` → add the DNS records it lists in Cloudflare DNS (Resend can do this automatically) → wait for *Verified* → *API Keys → Create* (sending access).
2. **Cloudflare → Storage & Databases → KV → Create** a namespace, e.g. `breachpoint-accounts`.
3. **Workers & Pages → Create → Worker**, name it `breachpoint-auth` → *Edit code* → paste `cloudflare/auth-worker.js` → *Deploy*.
4. Worker → **Settings → Bindings → Add → KV namespace**: variable name `ACCOUNTS`, the namespace from step 2.
5. Worker → **Settings → Variables and Secrets**: `RESEND_API_KEY` (Secret), `MAIL_FROM` = `Breachpoint <login@breach-point.net>` (Text), `APP_URL` = `https://breach-point.net` (Text).
6. Open `https://breachpoint-auth.<you>.workers.dev/pubkey`: it should show a JSON key. Put the Worker URL in `AUTH_ENDPOINT` in `js/config.js` and push.

Free-tier capacity: Workers KV allows 1,000 writes a day (about 200 sign-ins a day; sessions last 60 days so returning players don't count), Resend 100 emails a day. The $5/month Workers plan lifts the KV limit.

### Matches

**Quick match** puts you in a public game with no code: the game checks for open public lobbies for a few seconds and drops you into the fullest one, mid-match if one is running, taking a bot's slot. If none are open, you host one and others drop in. Public matches use fixed rules (6v6 with bots, 75 kills, 10 minutes, no friendly fire), start the next match automatically, and if the host leaves everyone is moved to another match. Finding a match only reads small public notices on Nostr relays, so nothing connects to you until you join one. Public matches go through a Cloudflare relay, so other players can't see your IP address.

**Private matches** use a code:

1. **Host:** Play tab → set match size, limits and friendly fire → **HOST ONLINE MATCH**. You get a code like `482 913` and an invite link.
2. **Friends:** **JOIN WITH CODE** → type the code (keyboard, controller or on-screen keypad) → **JOIN**. Opening the invite link fills the code in.
3. With *Approve each player* on (default), the host accepts or denies each request. The host can switch players' squads, kick (which also bans for the session), and accept people mid-match from **Pause → Players & join requests**; each new player takes a bot's slot.
4. **START MATCH**. Empty slots are filled with bots. After the match everyone returns to the lobby for a rematch.

The match keeps running while the pause menu is open in online play. The host should keep their tab in the foreground: browsers slow down background tabs.

### Security and privacy

There is no game server: the host's browser runs the match and checks everything guests send, so a modified client can't move faster, heal, refill ammo or report its own hits, and players are only sent what they could plausibly see. Signaling is encrypted with a key derived from the match code and game traffic is encrypted WebRTC. Name Tags are filtered, hosts can approve, kick and ban players, and with accounts on, every guest's identity is checked with a signed pass.

- **IP addresses:** quick matches go through a Cloudflare relay, so other players can't see your IP. Private matches connect directly unless *Options → Hide my IP in private matches* is on.
- Online play needs HTTPS (or `localhost`). Some strict networks block WebRTC; if a player can't connect, try another network or let someone else host.

Found a security problem? Please report it privately through GitHub's *Security → Report a vulnerability* on this repository rather than opening a public issue.

**TURN relay setup:** `cloudflare/turn-worker.js` is a Cloudflare Worker that turns a Cloudflare Realtime TURN key into short-lived credentials (the key's token stays in the Worker as a secret). Deploy it, set `TURN_KEY_ID` (text) and `TURN_KEY_API_TOKEN` (secret), and put its URL in `TURN_ENDPOINT` in `js/config.js`. It only answers requests from the game's own site (`ALLOWED_ORIGINS`).

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
| `js/supermarket.js` | Freshway Market: the indoor map, its textures (goods, produce, floor, signs) and the smoking soldier |
| `js/modes.js` | Gunfight and Search & Destroy: rounds, bomb, sites, overtime flag, bot objectives, HUD |
| `js/main.js` | Boot, title screen, Offline/Online, sign-in screens, menu tabs, controller/keyboard menu navigation, settings persistence |
| `js/game.js` | Match loop (local / host / guest modes), hitscan + melee + grenades, kills/assists/medals, spawns, pickups |
| `js/net.js` | Peer-to-peer transport: 6-digit codes, Nostr signaling, WebRTC data channels |
| `js/online.js` | Lobby (approval, kick, teams), host session (input validation, lag compensation, culled snapshots), guest session (prediction, reconciliation, interpolation) |
| `js/quickplay.js` | Quick match: public lobby notices over Nostr, choosing a lobby |
| `js/names.js` | Name Tag filter |
| `js/account.js` | Online accounts: email-link sign-in, remember me, Name Tags, display names, friends, presence, signed match passes |
| `cloudflare/auth-worker.js` | Account server (Cloudflare Worker): sign-in emails via Resend, KV storage, pass signing |
| `cloudflare/turn-worker.js` | TURN relay credentials (Cloudflare Worker) |
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

- Developed by cbgregg. Artificial intelligence was used to assist with development of this project.
- Soldier model and animations (`assets/models/soldier.glb`): the *Soldier* sample from the [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf), a Mixamo character. Mixamo assets are royalty-free for use in projects under Adobe's terms; check those terms before commercial use, or swap in your own rigged `.glb` with a Mixamo skeleton.
- Peer-to-peer matchmaking: [Trystero](https://github.com/dmotz/trystero) by Dan Motzenbecker (MIT), vendored in `lib/`.
- First-person hands (`assets/models/hands.glb`, `assets/textures/hands/`): a rigged, textured hand model ("Rigged Hand", 2015) supplied by the project owner, converted to glTF with only the right hand kept (the left is the same mesh mirrored) and driven by the game's own grip poses and arm IK. Check the original model's license before commercial use.
- Surface textures (`assets/textures/`): CC0 sets from [ambientCG](https://ambientcg.com) (Asphalt014, Concrete047A, Plaster003, CorrugatedSteel009, Ground037, Fabric049/061/066, Rubber001) and [Poly Haven](https://polyhaven.com) (red_brick_03, green_metal_rust, wood_planks, weathered_brown_planks, cobblestone_floor_08), resized and recolored for the maps. Floor and wall tile sets supplied by the project owner (tiles_0002, 0007, 0009, 0013, 0043, 0059, 0061, 0062, 0063, marble_0001, 0013): supermarket floors and walls, house floors.
- Everything else (code, guns, map, audio) is generated in this repo.

## License

Code: MIT — see [LICENSE](LICENSE).
