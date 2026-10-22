# Breachpoint

A browser first-person shooter in the style of modern military shooters: **Team Deathmatch** against **AI bots** or **online with friends using a 6-digit code** (peer-to-peer, no server), on city streets, a supermarket and a drive-in, with full **Xbox controller** support. Built with [Three.js](https://threejs.org/). No build step — apart from the rigged soldier and first-person hand models, every gun, building and sound is generated at runtime (surface textures are CC0 photo scans), so it deploys to GitHub Pages as plain static files.

**Play:** [breach-point.net](https://breach-point.net) · **Status:** pre-alpha

Developed by cbgregg. Artificial intelligence was used to assist with development of this project. Keep the servers running: it's a one-man team, so if you enjoy it, [buy me a coffee](https://buymeacoffee.com/breachpoint). Feature requests and feedback: *Options → About → Send feedback* in the game.

## Features

| Area | What's included |
|---|---|
| Look | Physical sky at dusk (sun 5° above the horizon, deep orange light, very long shadows, violet shade, street lamps casting real light pools), with Mount Rainier glowing in alpenglow on the eastern horizon with image-based lighting, real-time soft shadows, ground-truth ambient occlusion (GTAO), bloom, filmic tone mapping, color grade, vignette, chromatic aberration, film grain, SMAA. Rounded-edge geometry throughout, 4096 shadow maps on High. Photo-scanned PBR materials (albedo + normal + roughness, CC0) for asphalt, concrete, plaster, brick, corrugated steel, painted metal, wood, weathered planks, dirt, cobblestone, sandbags, cloth, HESCO and rubber, with procedural fallbacks. Height fog that hugs the ground and glows toward the sun, drifting dust motes, dust kicked up by sprinting feet and slides. Quality presets Mobile, Low → Ultra (see Performance below) |
| Maps | Both maps are built for close-quarters fights around corners: lanes are broken by staggered houses, walls, containers and kiosks so nothing gives a straight line from one side to the other (checked automatically for long sightlines), and the divider rows are **enterable houses** with real doorways and window openings you can see and shoot through, tiled floors, shelving, tables and hanging bulbs. Brighter street lamps with pools of light (on High/Ultra each lamp is also a real spotlight that lights walls, players and the street), festoon lights strung across the mid lanes, a few warm point lights (off on Low). Solid blocks and the perimeter have proper windows: recessed glass, painted frames and mullions, stone sills, shutters, curtains and grime streaks. The dressing is a Western town: painted render in greys, off-whites, slate and sage, plenty of brick, steel newsstand kiosks with flat canopies, farmers-market pop-up tents, concrete jersey barriers, stacked interlocking concrete yard blocks round the spawns, street trees; cars are modeled sedans with arches, glass, lights and rims. **Tarsa Market** (116 × 80 m): a classic three-lane map. Spawns at the short ends; a market street (market tents, kiosks, parked cars, the market hall = bomb site B) and the yard (containers, pallets, the warehouse = bomb site A) on the outside, and a mid street into the central plaza, where the centre house with its rooftop and parapets is the power position. The map is point-mirrored, so each team gets the same routes. Two rows of buildings split the lanes, with connectors through a walk-through house, alleys and a gap at the plaza, plus a back street behind each spawn for rotating. Tall cover every 10–14 m means no standing sightline runs a lane end to end (checked automatically: the longest is under 60 m, and fewer than 0.2 % of sightlines are over 45 m). **Pioneer Square** (108 × 80 m): 1st & Yesler on the real street plan. 1st Avenue runs north–south and Yesler Way east–west; Pioneer Place is the triangle east of 1st Ave and north of Yesler, with the iron-and-glass pergola at its south end (over one of the stairs down to King Street Station), the totem pole, plane trees and five-globe lamps. The Pioneer Building stands at the downtown grid's 32° angle on the plaza's east side: grey sandstone arcade, red-orange brick in a grid of piers and belt courses, two banded stone piers, cast-iron bays (the rounded corner bay, one over the entrance, one on James St) and the pyramid-roofed tower. James St climbs away at the same angle between it and the "Sinking Ship" garage on the old Seattle Hotel's wedge, and Smith Tower rises up Yesler. The streets are busy enough to fight through: a Metro bus at its stop, box trucks and a streetcar in the lanes, a utility dig with site containers and barriers on Yesler, newsstands on the sidewalks, a food truck and First Thursday art-walk tents on the plaza, and cover at both spawn exits, so no sightline crosses the map (the longest outside the spawn yards is under 45 m). Under the plaza is **King Street Station**, a Link light rail stop on three levels: a stairwell at each end of the plaza (Link signs at the top) leads down a tiled passage to the concourse, a pillared ticket hall 4 m under the street (a model, see Credits) with open fare gates and ORCA readers; the hall's two long stairs go down another 7 m to the platforms, one each side of two tracks that run north–south and on through tunnels past both ends of the map. **1 Line trains** (two-car Siemens S70s in Sound Transit livery, *Northgate* northbound, *Angle Lake* southbound) run on a timetable: one each way every 90 s, a horn as it runs in from the dark tunnel with its headlight on, a bell, a stop at the platform with the doors open and a chime, then out the other end. Countdown boards over the platforms show when the next train is due. A moving train kills anyone on its track (or leaning past the yellow line), so the tracks are a shortcut between the platforms only between trains; the strip between the two tracks by the columns is clear of both. A stopped train is solid cover. Online, every player sees the trains in the same place (they run on the host's clock) and the host decides who was hit. Bomb site A is on the northbound platform; site B is the tavern on Yesler. Bots use all three levels (street, concourse, platforms), taking the stairs between them. Four of the brick blocks have **enterable ground floors** (stone walls with doorways and shoot-through windows on every street side, exposed-brick interiors, wood floors, pendant lamps): a café in the Mutual Life Building on the corner of 1st & Yesler, a saloon and a corner shop across Yesler, and a bookshop with rows of shelves up 1st Ave. **Drive-In** (104 × 72 m, night): a 1950s drive-in theatre at dusk, laid out by a generator (see [Drive-In](#drive-in-and-the-map-generator)). A screen tower at each end shows the feature, *Terror from Planet Z!* (painted by the project owner; `assets/textures/drivein/feature.jpg`); each team spawns in the small lawn yard behind its screen and comes out through the doorway under the screen or the gates in the wing fences. Between the screens, rows of parked 50s cars (fins, two-tone paint, whitewalls) face their screen with speaker posts between them; panel vans, pickups with camper shells and ice-cream and delivery trucks are the tall cover, cars are crouch cover. The snack bar in the middle is the hub: walk-in counter, fridges and menu board inside, stairs up both long sides to the roof and the projection booth, which throws a beam onto both screens. The perimeter road runs past the restrooms, the projection-supply shed, the box office and the marquee with chaser lights; the playground, the popcorn wagon and the "coming attractions" boards are on the lawns under the screens. **Shuran Yard**: three lanes (market street, yard, container stacks). **Freshway** (indoor): a supermarket laid out like a real one: automatic sliding doors at both entrances, checkout lanes and customer service across the front, an action alley of promo pallets, then nine tall gondola runs (six shelves under a row of overstock cases, 4 ft sections, endcaps) front to back with a cross aisle through the middle, a frozen-food aisle between glass-door freezer runs, the dairy wall, and a produce department of angled display tables, a banana stand, melon and pineapple bins and a misted wet rack, all piled with real 3D fruit and veg (apples, pears, oranges, lemons, limes, tomatoes, peppers, avocados, onions, potatoes, bananas, lettuce, broccoli, carrots...); laid out from the project's concept art: checkouts and customer service along the front; upstairs offices and a break room on a mezzanine over the front corner (a galvanised stair up the outside of the service-alley wall); along the service-alley side, a long bakery & deli glass counter with rack and deck ovens and slicers behind it, then a row of employees-only rooms (kitchen & prep with its own alley door, walk-in cold storage, dry storage) whose roof is a railed catwalk from the offices to a stair down at the far end, overlooking the counter and the aisles; grocery aisles 1–7 with the frozen runs through the middle and produce on the street side; a stock room in the back corner and a strip of receiving, storage and racking rooms along the back wall, with roll-up doors onto the loading yard; beer & wine and seasonal pallets on the open floor between. The street side is all brick with the store's name lit up over the windows. **Doors open and close**: the stockroom and kitchen have stainless traffic doors you push straight through (they swing shut behind you), the staff, fire-exit and office doors are ordinary doors: press Reload / X at one to open or close it, or sprint into it to barge it open; bots open them on their way. Closed doors block movement, sight and bullets (online, the host decides and everyone sees the same doors); each team spawns in a tight two-by-four block: A at the street end of the parking lot, B in the loading yard by the stockroom roll-up. Outside, laid out from concept art: the lot has rows of detailed cars (door shut lines, handles, plates, seats and a steering wheel behind the glass, spoked rims), a delivery van and head-high shipped pallets (slatted pallets, cases in layers, stretch wrap, corner boards, labels); the right lane is a parking strip with a kerb, a street of parallel-parked cars and vans, and raised beds of clipped hedges and flowers; the left lane is the service alley with transformers, HVAC units and green dumpsters; the loading yard has the semi at the dock, two forklifts, blue drums, crate stacks and a fenced pallet compound. The building has a brick base and piers, a dark fascia band with a green stripe, steel canopies over the entrances, wall lights and downspouts. The shop windows are frosted armoured glass: you can't see or shoot through them. Clipped hedges and two rings of trees close the map in, and a heavy haze hides everything beyond. The store's ceiling speakers play bossa-nova muzak (loud inside, faint outside), and a soldier on his smoke break stands by the staff door; nothing in the match touches him. Pick a map (or Random) on the Play tab; online, guests load the host's map, and quick matches rotate randomly. |
| Operators | Rigged, textured soldier model with motion-captured idle/walk/run animation, blended by speed; legs turn toward movement while the upper body stays on the aim; IK arms grip each weapon's pistol grip and foregrip. Procedural motion on top of the clips: one shared gait phase so walk/run blend without double-stepping and stride matches ground speed, spring-driven lean into acceleration and turns, landing compression and airborne tuck, hit flinches in the direction of each shot (head snaps on headshots), and **ragdoll deaths** (verlet skeleton seeded with the body's momentum and the killing shot's impulse, colliding with the ground and nearby cover; the gun tumbles free). The same rig provides the first-person arms and gloves (longer than life, as in every shooter, so both hands sit on the grip and foregrip; fingers close around the gun, the gun cants in during reloads so you see the hands work the magazine). Falls back to procedural operators if the model can't load |
| Weapons | Guns built from real side-profile silhouettes with rounded edges, lathed barrels, muzzle devices and scopes. Primaries: MK-4 Carbine, KV-47, BR-308, HX-60 LMG, VX-9 SMG, KRV-45, M12 pump shotgun, SA-12 drum auto-shotgun, MR-14 marksman rifle, LR-50 bolt-action. Secondaries: P-45, D-50, R-357 revolver, MP-18 machine pistol and **The Monte** rocket launcher (splash damage, smoke trail). Each of the newer guns has its own dedicated model (`js/gunbuilds.js`): the KV-47 is a stamped AK with wood furniture and a bakelite banana mag, the BR-308 a tan monolithic-upper battle rifle with a folding stock, the HX-60 a belt-fed LMG with an ammo pouch, belt, heat shield and folded bipod, the KRV-45 a Vector-style SMG, the MR-14 a wood-stocked DMR, the SA-12 a boxy drum-fed auto shotgun, the D-50 a hand cannon, the R-357 a fluted-cylinder revolver and the MP-18 a machine pistol with a folding front grip. The Monte aims through a holographic sight on a bracket left of the tube, so the tube sits beside your view instead of blocking it; firing kicks hard and throws a backblast out of the venturi, the warhead leaves the tube with the shot, and reloading swings the launcher down to the left while your hand brings a new rocket up and slides it into the muzzle. Lethal and tactical equipment (below), melee. Detailed models with glowing reticles, animated magazine reloads (faster tactical reloads), pump and bolt cycling, ejected brass, recoil with recovery, ADS breathing sway (hold breath on the sniper), damage falloff, headshots |
| Create a Class | Laid out like Black Ops II / MW2019: your five custom classes on top, the seven default classes below. The selected class shows a live 3D gun over Primary, Secondary, Lethal and Melee cards (gun renders, attachment pips). Editing opens a Pick-10 style overview: a Primary and a Secondary box with a row of attachment tiles each. A weapon box opens the weapon picker (weapon cards grouped by category); an attachment tile opens that slot's grid of icon tiles (LT/RT or Z/C switch slot). The detail panel previews whatever is highlighted, with segmented stat bars showing the change and an Equipped row. Default classes can be copied into a custom slot; the equipped class is what you spawn with, and changes in a match apply on the next spawn |
| Gunsmith | Five attachment slots with real trade-offs, modeled on the gun in first and third person and previewed in 3D in Create a Class. **Optics:** iron sights, reflex, holographic, 4× prism scope (eyecup-framed magnified view with a chevron), 8× sniper scope. **Muzzle:** compensator, suppressor (off the compass and minimap, quieter, no muzzle flash, bots hear it less, −15% range), full choke for the shotgun. **Underbarrel:** vertical grip (recoil) or angled grip (aim speed). **Magazine:** extended (+50%, slower reload) or fast mag. **Tac laser:** tighter hip fire and faster aim, but a visible beam. Stat bars show gains and losses against stock. Bots roll random builds; online, loadouts sync to everyone |
| Reticles | Every sight has a customizable reticle: a Reticle tile on each weapon in Create a Class opens a picker with the five sights as tabs (LT/RT or Z/C). Reflex, holographic and 4× prism: 12 shapes (dot, ring & dot, chevron, crosshair, circle cross, delta, horseshoe, brackets, diamond, T-post, micro dot, wide ring). 8× sniper scope: duplex, fine crosshair, mil-dot, German post, dot & thin lines, chevron. Iron sights: plain post, tritium dot or tritium ring on the front post. Eight colours. A reticle applies to that sight on every weapon, live, and is saved with your settings |
| Movement | Walk, sprint, **tactical sprint** (MW-style: 9.8 m/s with the gun raised for up to 4 s, recharges after a second off it; bots use it on long runs), crouch, **prone** (crawl, steadier aim, you can shoot and crawl under tables and trailers), **slide**, jump, step-up onto stairs/ledges |
| Mantling | Run into anything waist-to-chest high (about 0.55–1.3 m) and you vault onto it; press jump in front of anything up to about 2 m and you pull yourself up, quickly, crouched if there's only crouch room on top. Works mid-air too. The gun dips while you climb. Online, the host and your own machine play the same mantle from the same inputs |
| Equipment | Each class has a **lethal** (RB / `G` / mouse-wheel click) and a **tactical** (LB / `E`). Lethals: **Frag** (cook while held, bounces, 7 m blast), **Semtex** (sticks to walls, floors and players, 2 s fuse), **Throwing Knife** (×2, fast and nearly flat, kills on a body or head hit, silent), **Shock Stick** (sticks, then three electric pulses that damage and stun anyone within 3.6 m). Tactical: **Stun Grenade** (×2, no damage: everyone caught in it moves and aims slowly for up to 3.5 s, with a washed-out screen). Picked in Create a Class; bots carry random lethals and use stuns |
| Grenades & inspect | **Cook frags:** hold G / LB / FRAG to pull the pin (ticking fuse ring by the crosshair, frag in hand), release to throw with the remaining fuse; hold too long and it goes off in your hand. Bots cook too. **Inspect** your weapon with I / D-pad down; it plays automatically during the start countdown |
| Death & respawn | The camera swings round to your killer and zooms in on them (rising over cover if needed), with a 5-second countdown. Respawn early after 1.5 s with X / A, R / Space or a click, or press Start / Esc (or the CHANGE LOADOUT button) to open the pause menu straight onto Change Loadout. Loadout changes made in the first 5 seconds after spawning (before you fire) apply instantly, so you can also pick your class during the countdown |
| Online | Host a match and share a 6-digit code (or invite link); friends type it in and join. Peer-to-peer over WebRTC, so it runs on GitHub Pages with no game server. Host-authoritative with input validation, lag compensation, client-side prediction and wallhack-resistant culling (see below). Up to 8 humans, bots fill the rest, players can drop in mid-match |
| Readability | Black Ops 2-style: friendly names with a blue marker above teammates (visible through walls), enemy names in red when your crosshair is on them, a soft rim light on every soldier, distinct kits (tan vs. cool slate) and a brighter, more saturated grade |
| Bots | Up to 15 bots (8v8). Gradual spotting (a per-enemy meter driven by how much of you is exposed, distance, view angle, movement and gunfire, so a peek over cover isn't an instant death), aim at whatever part of you is actually visible with more error when you're mostly covered, vision cone + line of sight, hearing, team intel, A* pathfinding, strafing, crouching, going prone at range with long guns, settling into a stance (stand, crouch or prone) and sweeping the angles when they hold a spot, pausing to check corners on the way, a different preferred route per goal, grenades, melee at close range, health/ammo seeking, weapon swaps by range. Three difficulties |
| Pause menu | Live match panel (score, time, your stats, current build, scoreboard), Change Loadout (applies on next spawn, also online), full Options, host controls online, confirm-to-quit/restart. Compact layout on phones |
| HUD | Compass with enemy gunfire pings, rotating minimap rendered from the actual map, friendly/enemy score widget, ammo cluster with fire mode and equipment, score pop-ups beside the crosshair, medals (multikills, streaks, payback), killfeed, hitmarkers, directional damage, red-out damage effect, death card with killer distance and HP, scoreboard with K/D, device-aware button prompts |
| Controller | Xbox / standard gamepads: radial deadzone, response curve, separate sensitivity, aim assist (slowdown, rotational tracking, ADS snap), rumble, full menu navigation with D-pad/stick (left / right always move between controls; A opens a dropdown, toggles a checkbox or starts adjusting a slider), bumpers switch tabs, glyphs swap automatically between keyboard and controller |
| Music | Original score synthesized live (no recordings, so nothing to license): a slow D-minor menu theme and a 112 BPM action track whose layers build with recent fighting, the last minute and close finishes; end-of-match stings; separate music volume. Swap in your own tracks via `MUSIC_FILES` in `js/config.js` |
| Audio | Synthesized: layered gunshots (crack, body, thump, tail) with distance filtering and street reverb, bolt/pump foley, bullet whiz on near misses, casing tinkles, footsteps, explosions, hit/headshot/kill confirms |
| Platforms | Desktop (pointer lock with free-look fallback), controller, touch (virtual stick + buttons; push the stick all the way forward to sprint; tap-to-aim and auto-fire on target by default, both in Options) |
| Settings | Saved to `localStorage`: Name Tag (offline, set in Options), classes and the equipped class, match size, difficulty, limits, friendly fire, graphics (Low / Medium / High / Ultra presets, or Custom: render resolution 50–200% of native, shadow quality, soft shadows, shadow update rate, ambient occlusion, bloom, anti-aliasing, dynamic lights, texture filtering, ambient dust; picking a preset fills these in, changing any one switches to Custom), frame rate limit, ADS zoom (scales every optic's magnification), sight size when aiming (Normal / Large / Huge: how much of the screen the optic fills), FOV (Call of Duty-style: degrees across a 4:3 frame, 80 = MW default), mouse/stick sensitivity, aim sensitivity (how fast the view turns while aiming, relative to the hip, for mouse and stick), auto sprint (push fully forward to sprint), deadzone, aim assist, vibration, invert, volume, FPS counter (shows your ping too when you've joined an online match). Values from an older save that aren't valid choices any more fall back to the default |

## Drive-In and the map generator

The Drive-In layout comes from `tools/drivein_gen.py`, a parametric generator plus an evolution strategy, scored against targets taken from Black Ops 2's multiplayer maps (Standoff, Raid, Hijacked, Slums, Express and Nuketown 2025 were the reference set). It is not a trained neural network; there is no dataset of maps to train one on. It is a hand-weighted scoring model that searches the free parts of the design.

**Fixed design (from the research):**
- Three lanes, each with its own character: the screen-side lawns, the parked lot and the perimeter road.
- A two-storey hub in the middle that most routes meet, with a power position on top (Raid's courtyard, Hijacked's centre deck).
- Spawns kept in one small pocket per team with three exits, so a team spawns together rather than along a whole side.

**Genes** (19 numbers plus a list of tall vehicles):
- map size
- screen width
- distance from the screen to the first ramp, number of ramps and their spacing
- zig-zag of the centre and side aisles, so aisles jog from ramp to ramp and never line up
- gate width
- where the restrooms, shed, ice-cream truck and popcorn wagon sit
- how full the lot is
- snack-bar size
- playground side
- which parking spaces hold a van, pickup or ice-cream truck

**Score:** each candidate is built as boxes and measured on a 0.5 m grid with analytic ray–box tests. `score = Σ wᵢ · hinge(fᵢ, targetᵢ)`, where the hinge is the distance outside the target band:

| Measure | Target |
|---|---|
| sightlines over 45 m at standing eye height | ≤ 0.3 % |
| longest sightline | ≤ 60 m |
| open aisles (≥ 4 m) across the map at ⅓ and ⅔ | 3–4 |
| shortest spawn-to-spawn walk | 95–125 m (16–21 s sprinting) |
| walkable ground within 3 m of chest-high cover | 55–75 % |
| walkable share of the map | 60–80 % |
| every walkable cell reachable from both spawns | hard constraint |

**Search:** (μ + λ) evolution, 12 parents and 24 children a generation with Gaussian mutation, then a greedy repair pass. The repair puts a tall vehicle on the middle of any remaining long sightline and keeps it only if reachability holds and the score improves.

**Result:** score 0, reachable everywhere, a 124 m spawn-to-spawn walk, 4 lanes, 72 % of ground near cover, and a 55 m longest line. In game it measures under 56 m, with 0.5 % of sightlines over 45 m (car roofs are below standing eye height, and car cabins are glass, so both count as open).

Run `python3 tools/drivein_gen.py 90` to search again, or `--rebuild js/drivein_layout.js` to re-emit the saved genome after changing the fixed design. `js/drivein.js` builds the theatre from that layout.

## Collision

What you see is what stops you. Props have collision shaped like what's drawn (cars are a body plus a cabin, jersey barriers a wide foot and narrow top, tables only their top, stair flights only their treads). Railings, benches, shop windows, wire racks and car glass stop players but not bullets or sight. The map edges are always a visible building, wall or fence.

### Map audit

`js/audit.js` checks a built map the way a player would run into it. From every place a player can reach (each nav level, flooded from the spawns and across the stairs, standing and crouched) and every 75 cm up and down each staircase, it casts 72 rays (240 on the stairs) against the drawn geometry (with three-mesh-bvh, loaded only for the audit) and compares them with the collision:

| Check | What it finds |
|---|---|
| see-through | the first thing a ray meets is the undrawn back of a one-sided surface: a hole you can see through |
| sky leak | below street level, a ray that hits nothing at all |
| z-fight | two surfaces closer together than the depth buffer can tell apart at that distance (they flicker), or a depth-offset overlay close enough under a surface to be pulled through it |
| invisible wall | a collision face with nothing drawn near it, where a player can get to it |
| walk-through | a broad, solid-looking surface at body height with no collision behind it |
| floor | the floor drawn above or below your feet (sinking in, floating), or not drawn at all |
| clipping | a prop's collision pushed into another object's |
| floating | a prop with nothing under it |
| bad spot | a spawn, pickup or bomb site inside something or with no floor |

In the game, add `?audit` to the URL: markers appear on the map, and the report goes to the console (`__game.audit()` re-runs it). For every map headless, serve the repo and run `node tools/map_audit.mjs --url http://localhost:3000`. That needs Playwright. It writes `audit/report.md` and `audit/report.json`; `--shots N` adds screenshots of each kind of issue, taken from where it was seen, and `--maps tarsa,pioneer` limits the maps. `--selftest` plants one defect of each kind in a map and checks the audit finds every one, so run it after changing a rule. All five maps currently audit clean.

## Controllers

Xbox, PlayStation and most other controllers work over USB or Bluetooth. The browser decides each controller's button layout. Chrome, Edge and Safari give the standard layout for Xbox and PlayStation pads. Firefox and some Mac drivers report their own button numbers, so buttons, triggers or the D-pad can land in the wrong place.

**Fixing a wrong layout:** go to Options › Controls › Controller › **Test & Calibrate**.
- The screen shows every button and both sticks live.
- **Calibrate** asks for each button in turn. Triggers and D-pads that come through as axes or a hat switch are handled.
- The layout is saved for that controller in this browser. **Reset Layout** undoes it.

**Other devices:** the game uses the controller you last pressed a button on. Devices a Mac lists as gamepads (keyboards, receivers, headsets) are ignored. A device that only reports moving sticks can't take over the menus until one of its buttons is pressed.

## Public matches, the match browser and the message of the day

| Feature | How it works |
|---|---|
| Public Match | Opens the lobby and searches for an open lobby in your game modes (press **X** / X button in the lobby to choose them). If none turns up within 10 seconds, the lobby opens itself in one of those modes at random, advertises itself and starts a 30-second countdown with a map vote. Players searching meanwhile drop in, and bots fill the rest when it starts. |
| Match Browser | Multiplayer › Match Browser lists every public match right now: host, mode, map (or "Voting"), players and whether it's in the lobby or already playing. Filter by mode, and pick one to join. If it's gone or full, matchmaking carries on in your modes. |
| Message of the day | Shown on the Multiplayer menu and in lobbies. It comes from `motd.json` in the site root; edit it and push to change it. |
| First load | The loading screen shows a screenshot from the game the moment the page opens, before any script runs. |

The Multiplayer menus use the pre-match lobby's look: plain list items, a ▸ description and the live 3D background behind. The painted globe is gone.

## Performance and the Mobile preset

| Optimization | Where it applies |
|---|---|
| **Mobile preset** (default on phones and tablets) | Draws straight to the screen with hardware 4× MSAA instead of the post-processing chain (no float render targets or full-screen passes, where mobile GPUs spend their bandwidth); damage and flash effects become a CSS overlay. Pixel budget of 1.25 MP, so 3× screens don't render 9× the pixels; dynamic resolution still drops further when frames run long. Hard 1K shadows refreshed every third frame. Low geometry detail. Distant players animate at 30 Hz from 14 m and 15 Hz from 32 m. The menu background runs at 30 fps |
| Render path (Custom) | *Full post-processing* or *Fast (MSAA)*. Switching restarts the game from the menu, because MSAA belongs to the WebGL context |
| Geometry detail (Custom) | *Low*: square-edged world boxes (12 triangles instead of ~108), 36-triangle sandbags instead of 300, a lighter distant mountain, small props stop casting sun shadows, other players' guns use flat boxes and fewer curve segments. The map rebuilds when it changes from the menu |
| Every preset | Other players' guns are merged into one mesh per material (from 20-40 draw calls each to a handful) and no longer cast sun shadows; bloom is computed at half resolution; distant players animate at 15 Hz beyond 60 m |
| Shadow updates | Every frame, every other frame, or every third frame |
| Options are staged | Changing an option doesn't apply it: an UNSAVED CHANGES bar appears and **X** (keyboard or controller) or APPLY applies everything at once. Leaving Options with unsaved changes asks whether to apply or discard them. **Reset tab to defaults** (under the description on the right) puts the open tab back to its defaults, staged the same way; on Graphics it picks the preset recommended for your GPU |
| Anti-aliasing | SMAA plus **MSAA** on the post-processing path (Medium 2×, High and Ultra 4×, Custom up to 8×), hardware 4× MSAA on the fast path |
| Hardware check | Options → Graphics shows the GPU and the preset recommended for it; presets above that are marked *not recommended*. If the browser is drawing on the CPU (hardware acceleration off) a banner says so, with the setting to turn on for Chrome, Edge or Firefox. In a match, a frame rate under 40 fps for 20 s suggests a lighter preset or FSR (once) |
| Dynamic resolution | Only reacts to a sustained slowdown (2 s) and changes at most once every 4 s, since each change reallocates render targets |
| **Upscaling: AMD FSR 1.0** (`js/fsr.js`) | Options → Graphics → Upscaling: Ultra Quality (77% render scale), Quality (67%), Balanced (59%), Performance (50%), plus an FSR sharpness slider. The scene renders smaller and FSR's EASU pass upscales it to the screen with edge-aware filtering, then RCAS sharpens it. Works with any preset and both render paths (on the fast path it renders into a 4× multisampled target first). With FSR on, dynamic resolution moves the render scale and the canvas stays at full resolution. FSR 1 is spatial and open source, so it runs on any GPU in any browser |
| DLSS, FSR 2/3, MetalFX | Not available to web pages: they need motion vectors plus NVIDIA, AMD or Apple driver APIs that browsers don't expose (DLSS also needs NVIDIA tensor cores). On Macs, iPhones and iPads the game already runs on Metal: Safari and Chrome translate WebGL to Metal through ANGLE |

## Free-for-All, Gun Game and private match setup

| Mode | Rules |
|---|---|
| Free-for-All | Everyone for themselves, respawns on. First to 30 kills wins. Spawns are spread over the whole map, away from other players. The scoreboard is one list in placing order, and the top three count as a win. |
| Gun Game | Free-for-all. Every kill moves you to the next of 15 guns; a knife kill sends the victim back one. First kill with the last gun wins. |

The private match lobby has GAME MODE, MAP and GAME SETUP for the host (match size, time, score, bots, friendly fire). Guests see the changes straight away. On a controller, ← → steps through modes and maps. **Start Match** counts down from 5 in the lobby for everyone (the host can press it again to cancel).

**Menu colour** (Options › General): Amber, Arctic blue, Crimson, Toxic green, Royal purple, Gold, Teal or Ghost white. It recolours the menus, highlights and HUD accents.

## Menus

The menus are a tree, laid out like Modern Warfare (2019):

| Level | Keyboard | Controller | What it does |
|---|---|---|---|
| Top tabs: Play · Weapons · Options | Q / E | LB / RB | Switch section |
| Play tiles | ↑ ↓, Enter | D-pad, A | Offline: one tile per mode, opening its match setup. Online: Quick Play (playlist + Find a match), Private Match (host / join + rules), Friends, Combat Training |
| Options categories: General · Graphics · Controls · Audio · Account · About | Z / C | LT / RT | One list per category; the panel on the right explains the highlighted setting |
| Back | Esc | B | Always climbs one level (page → tiles → game type → title) |

A breadcrumb over each page shows where you are (PLAY › SEARCH & DESTROY, OPTIONS › GRAPHICS). The pause menu uses the same Options categories.

## Controls

| Action | Keyboard & mouse | Xbox controller | Touch |
|---|---|---|---|
| Move | `W` `A` `S` `D` | Left stick | Left-side joystick |
| Look | Mouse | Right stick | Drag right side |
| Fire | Left click | RT | FIRE |
| Aim down sights (Hold by default; Toggle in Options) | Right click | LT | ADS (drag it to aim; a second FIRE button appears on the left while aiming) |
| Jump | `Space` | A | JUMP |
| Crouch / slide while sprinting | `C` / `Ctrl` | B (tap) | CROUCH |
| Prone | hold `C`, or `Z` (jump or sprint gets you up) | hold B | hold CROUCH |
| Sprint (cancels reload) / hold breath (scoped) | `Shift` | L3 (click) | SPRINT |
| Tactical sprint (faster, gun up, ~4 s then recharges) | Double-tap `Shift` | Click L3 again while sprinting | Push the stick to sprint twice quickly |
| Reload | `R` | X | RELOAD |
| Swap weapon | `Q`, `1` `2`, wheel | Y | SWAP |
| Lethal (frag: hold to cook, release to throw) | `G` or click the mouse wheel | RB | FRAG / SEMTEX / KNIFE / SHOCK |
| Tactical (stun grenade) | `E` | LB | STUN |
| Mantle onto a ledge | run into it, or `Space` in front of it | A | JUMP |
| Inspect weapon | `I` | D-pad down | — |
| Change class (applies on next spawn) | `H` (or `Esc`) | D-pad right | — |
| Respawn early (while dead) | `R` / `Space` / click | X / A | RESPAWN |
| Melee | `V` | R3 | MELEE |
| Scoreboard | `Tab` (hold) | View (hold) | TAB |
| Pause | `Esc` / `P` | Menu | ❚❚ |
| Menu tabs | `Q` / `E` | LB / RB | tap |

Desktop matches run **fullscreen with the keyboard locked** (Options → Fullscreen in matches, on by default): browsers only let a page receive Ctrl+W, Ctrl+T and Ctrl+N while it's fullscreen, so Ctrl-crouch while moving forward no longer closes the tab. A short Esc pauses; hold Esc to leave fullscreen. If the tab is about to close mid-match anyway, the browser asks first.

The controller follows Call of Duty's **Default** button layout. RB (tactical equipment) and D-pad up / left (killstreaks) are unused because the game has neither; D-pad down inspects your weapon and D-pad right opens Change Class.

Browsers only expose a controller after you press a button on it, so press any button once the page is open. Xbox controllers that a browser reports without the standard layout (common in Firefox on macOS and Linux) are remapped automatically.

## Game modes

Pick a mode on the Play tab. All three work offline against bots and online.

| Mode | Teams | How you win a round | Match |
|---|---|---|---|
| **Team Deathmatch** | 2v2 to 8v8 | Respawns on; every kill scores | Score or time limit |
| **Gunfight** | 2v2 | One life each. Everyone gets the same random loadout (new every two rounds). After 40 s a flag appears in the middle: hold it for 3 s to win, or the team with more health left after 10 s of overtime takes the round | First to 6 rounds |
| **Search & Destroy** | 2v2 to 8v8 | One life each. Attackers carry a bomb to site A or B and hold **R / F** (controller **X**) for 5 s to plant; it goes off 45 s later. Defenders hold the same button for 7.5 s to defuse. Wipe the other team, run out the clock (defenders), or detonate / defuse | First to 4 rounds, sides switch at halftime |
| **Gun Game** | 2v2 to 8v8 | Respawns on, no class choice, no grenades. Everyone starts on the MK-4; every kill moves you up a gun right away, through all 15 guns (The Monte included) down to the P-45. A knife kill sends the victim back one gun. The team score is its best player's rung | First kill with the P-45 wins |

In round modes there are no pickups, the bomb carrier drops it on death (any attacker can pick it up), and once you're out you spectate a living teammate (**Space / click / A** to switch). Bots play the objective: they plant, defuse and rush the overtime flag; defenders hold their site but keep moving between angles every few seconds, one in three plays a forward roaming role, and anyone may rotate to the other site. Attackers that reach a site without the bomb sweep it and the approaches.

## Online play

The game opens on a title screen (**press Enter / A / tap to start**), then **Offline** (versus bots, no account) or **Online**. With accounts turned on (below), Online asks you to sign in first.

### Accounts (passwordless email sign-in)

There are no passwords. You enter your email and get a **6-digit code** and a **sign-in link**. Type the code into the game (handy when the email is on your phone), or open the link on the same device. Either works once, and using one cancels the other. Tick **Remember me** to stay signed in on that device for 60 days; the game warns you to use it only on your own device. Without it the session ends when the browser closes (and after a day at most on the server).

- **Name Tag**: what everyone sees in matches. Name Tags aren't unique (anyone can pick any tag that passes the filter), and you can change yours **once a day**. Friends can see your previous Name Tags.
- **Display name**: optional, and only your friends see it.
- **Friend code** (`ABCD-2345`): every account gets one. Give it to friends; they enter it to send you a request.
- **Social sidebar**: press **Y** on a controller, **F** on a keyboard, or tap **FRIENDS** in any menu. Sign in, change your Name Tag and display name, copy your friend code, add friends by code, accept / decline / cancel requests, see who's online and where (menus, lobby or match, mode and map), and **Join** a friend's lobby or match. Friends skip the host's approval step.
- **Recent players**: everyone you shared an online lobby or match with (signed-in players) is listed in the sidebar with an **Add** button, so you can friend them without swapping codes.
- *Options → Account* has Sign out and Delete account (which also removes you from friends' lists).

Why it's safe:
- Sign-in codes and links expire after 15 minutes and work once. A code only works in the browser that asked for it, and five wrong tries cancel it. The code is never in the email's subject line, so it doesn't show on a locked phone. Only hashes of codes, links and sessions are stored, so a leaked database can't sign anyone in.
- The link token sits in the URL fragment (`#login=…`), which browsers never send to a server, and the game wipes it from the address bar immediately. The page sends no referrer.
- Sign-in emails and friend requests are rate-limited, and the server gives the same answer whether or not an email has an account.
- **Nobody can see anyone's email.** The server never returns an email to other players or friends; you see your own only masked (`c•••••@example.com`).
- In online matches each player carries a **signed match pass** for that match only. The host checks it before letting anyone in, so nobody can join without an account or under someone else's account, and a kicked or declined account can't rejoin from a new tab.
- Presence (online / where you are / your match code) is only shown to accepted friends, and expires two minutes after you close the game.

**Auto-deploy:** both Workers deploy from this repo with Cloudflare Workers Builds. `cloudflare/wrangler-auth.toml` and `cloudflare/wrangler-turn.toml` hold the non-secret settings (`keep_vars` keeps anything set in the dashboard, and secrets are never in the repo). Each Worker → *Settings → Build*: repository `cbgregg/breachpoint`, branch `main`, root directory `cloudflare`, deploy command `npx wrangler deploy -c wrangler-auth.toml` (or `-c wrangler-turn.toml`), watch paths limited to that Worker's two files.

The account server is `cloudflare/auth-worker.js` (Cloudflare Worker + Workers KV, email sent through Resend). With `AUTH_ENDPOINT` empty in `js/config.js`, accounts are off and Online works without signing in.

**Setup** (about 15 minutes, free tiers):
1. **Resend** (resend.com): sign up → *Domains → Add domain* `breach-point.net` → add the DNS records it lists in Cloudflare DNS (Resend can do this automatically) → wait for *Verified* → *API Keys → Create* (sending access).
2. **Cloudflare → Storage & Databases → KV → Create** a namespace, e.g. `breachpoint-accounts`.
3. **Workers & Pages → Create → Worker**, name it `breachpoint-auth` → *Edit code* → paste `cloudflare/auth-worker.js` → *Deploy*.
4. Worker → **Settings → Bindings → Add → KV namespace**: variable name `ACCOUNTS`, the namespace from step 2.
5. Worker → **Settings → Variables and Secrets**: `RESEND_API_KEY` (Secret), `MAIL_FROM` = `Breachpoint <login@breach-point.net>` (Text), `APP_URL` = `https://breach-point.net` (Text), and optionally `FEEDBACK_TO` (Secret): the address that receives the in-game feedback form. Every message is also stored in the KV namespace under `fb:` for a year, so you can read them there even without it.
6. Open `https://breachpoint-auth.<you>.workers.dev/pubkey`: it should show a JSON key. Put the Worker URL in `AUTH_ENDPOINT` in `js/config.js` and push.

Free-tier capacity: Workers KV allows 1,000 writes a day (about 200 sign-ins a day; sessions last 60 days so returning players don't count), Resend 100 emails a day. The $5/month Workers plan lifts the KV limit.

### Lobby

Lobbies are laid out like a classic console shooter's: the match type and mode as a big title, a menu (Start Match, Create a Class, invite link, join approval, bots, Leave) with a one-line description of the highlighted item, and the map card (or the next-map vote cards in public lobbies) under "The match is about to begin...". On the right is the player list grouped by team: level, rank insignia, Name Tag (you in gold, your team in blue), career score, a star on the host, connection bars, and "Waiting for player..." slots. Create a Class opens the class editor right in the lobby; the class you equip is the one you spawn with. Career score (XP) is kept on the account server, not in the browser, and sets your level (1–55): the same on every device. Only online matches with at least two signed-in players count; the host reports everyone's result, each guest backed by the signed match pass they joined with.

**Checkpoints and reviews.** Every result is sanity-checked on the server. A result that can't be real (impossible score or kill rate, too many matches an hour) puts the account's XP back to its last checkpoint (the XP it had after a clean day), puts it under review and emails the developer. Results that are possible but extreme twice in a week put the account under review: they keep playing, new XP is held, and the developer gets an email with one-click links to clear (held XP is added), reset to the checkpoint, or ban. Opening Multiplayer checks the account and shows "Account under review", "Progress restored to checkpoint" or "Review complete" when it applies. The links are signed with the `ADMIN_KEY` secret (falls back to the mail key if that isn't set).

### Matches

- **Terms of use**: signing in shows the terms (rules, what's stored, every safety measure). Players must scroll to the end and agree before playing online; the account server refuses match passes until they have. Offline play needs no account. When the terms change, bump `TERMS_VERSION` in both `js/account.js` and the Worker and everyone accepts again.
- **Mute, block, report, vote to kick**: pause → Scoreboard → Players. Mute hides a player's chat this session; block also mutes them for good and refuses them from lobbies you host; reports go to the Worker (stored in KV under `rep:` and emailed to `FEEDBACK_TO`); a vote to kick removes a player when 60% of the other players agree (the host kicks directly). To ban an account, add `"banned": true` to its `user:` record in KV.
- **Map vote** in public lobbies: after a match everyone votes on the next map; a 15-second countdown starts once most players are back in the lobby (or after a minute).
- **Text chat** in lobbies, the pause menu and during matches: press **T** or **Enter** to type (touch: the CHAT button). The host relays every line and filters it: offensive words become `***`, links are removed, and each player is limited to 5 lines per 8 seconds. Turn it off in *Options → Online*.
- **Private match settings**: the host picks mode, map, size and friendly fire on the Play tab, and can switch **Fill empty slots with bots** off for a players-only match (each team needs at least one player). Guests see the settings while they wait. Friends skip the host's approval.

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
| `js/drivein.js` | Drive-In: the theatre built from the generated layout (screens and the projected feature, 50s cars, vans, pickups, step vans, speaker posts, snack bar and booth, playground, marquee), dusk sky and stars |
| `js/drivein_layout.js`, `tools/drivein_gen.py` | The generated Drive-In layout and the generator that makes it |
| `js/supermarket.js` | Freshway: the indoor map, its textures (goods, floor, signs), the instanced produce and the smoking soldier |
| `js/audit.js`, `tools/map_audit.mjs` | Map audit: see-through surfaces, flicker, invisible walls, walk-through scenery, floors, clipping and floating props; in game with `?audit`, or every map headless |
| `js/doors.js` | Doors that open and close (swing, traffic and sliding doors), their collision and network sync |
| `js/modes.js` | Gun Game ladder; Gunfight and Search & Destroy: rounds, bomb, sites, overtime flag, bot objectives, HUD |
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
| `js/reticles.js` | Reticle shapes and colours: canvas textures for the optics, the SVG sniper-scope overlay, menu previews |
| `js/gunbuilds.js` | Dedicated models for the added guns (KV-47 through The Monte) |
| `js/gunsmith.js` | 3D weapon preview and cached weapon-card renders for Create a Class |
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


## Credits

Weapon and prop models from Sketchfab, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (textures resized and recompressed with `tools/glb_shrink.py`, geometry re-oriented and scaled for the game; the G19 was cut out of its display scene, and only the signs and office pieces the maps use were kept from those packs):

- [AR-15 (game ready)](https://sketchfab.com/3d-models/ar-15-game-ready-4620d29f61ab4723844d6162d29c9f4c) by IVA
- [TPM SMG](https://sketchfab.com/3d-models/tpm-smg-b9e68645f0e048419f3fe84ebd58dd92) by TORI106
- [Sniper rifle GameReady Free](https://sketchfab.com/3d-models/sniper-rifle-gameready-free-e520b234140049e7890db0b6c29d3925) by pashtetuser
- [G19 Pistol, Game Ready, Free version](https://sketchfab.com/3d-models/g19-pistol-game-ready-free-version-e3412d9803f04bdaa97ad9b68ed665d7) by Rotuma
- [FPS Red Dot Sight (Game Model)](https://sketchfab.com/3d-models/fps-red-dot-sight-game-model-0cf999d9363940c2b149dcd80c448554) by Michael Makivic
- [Remington 870 Shotgun](https://sketchfab.com/3d-models/remington-870-shotgun-05a6a02909ee4fcfa5cde3d76cb067f0) by Urpo
- [Low-Poly AR-15 magazines](https://sketchfab.com/3d-models/low-poly-ar-15-magazines-72b06590aa4b4b6ab324dc7e0c11b884) by notcplkerry (ammo pickups)
- [Truck Container Pack Low-poly ASIA](https://sketchfab.com/3d-models/truck-container-pack-low-poly-asia-000b6d08ad7b4f4198dcab2790008553) by knitro_builds (shipping containers)
- [Wooden Stairs_5_MB](https://sketchfab.com/3d-models/wooden-stairs-5-mb-56271a83e8ff487b84289e39a159d3c5) by Mehdi Shahsavan (rooftop stairs)
- [Corkboard](https://sketchfab.com/3d-models/corkboard-3ceda8ed02af45d1a8b36570076193e1) by XIN (market halls)
- [Simple Bin - steel](https://sketchfab.com/3d-models/simple-bin-steel-7fce89ddbf1c49a4b7612993447571a2) by Sousinho (street bins)
- [Downtown Buildings Set - Low Poly model](https://sketchfab.com/3d-models/downtown-buildings-set-low-poly-model-7378e7fb9c914c39880d9913a6f4e1d6) by Daniel Zhabotinsky (city skyline)
- [dumpster](https://sketchfab.com/3d-models/dumpster-989ea7f01b924859b3484ee27103e8d9) by YJ_ (dumpsters)
- [Locker](https://sketchfab.com/3d-models/locker-27ca4c4364a74d079fc3761ee1d2b114) by Samuel F. Johanns (Oneironauticus) (Freshway staff lockers)
- [Low Poly Office Cubicle Assets](https://sketchfab.com/3d-models/low-poly-office-cubicle-assets-f430770d9ba5480a89b3e355d05f9385) by NobleCrow (Freshway office and break room)
- [Kitchen tools Pack](https://sketchfab.com/3d-models/kitchen-tools-pack-f2d3743f366c4a21a5680457823f0f78) by Homie (Freshway kitchen)
- [Sign package](https://sketchfab.com/3d-models/sign-package-2d153f387f264bca819357601eff3574) by Pedram Ashoori (Freshway lot and yard signs)
- [Road Signs](https://sketchfab.com/3d-models/road-signs-c39bf97110494b5db3de84165211f592) by FrodoUndead (Pioneer Square street signs)
- [Subway station](https://sketchfab.com/3d-models/subway-station-fa31f1ebe8cb437f9c753b22b3fdfc55) by Pasha (King Street Station's concourse; its collision is worked out from the mesh by `tools/station_collision.py`)

From the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) (textures resized to 256 px, unused nodes removed):

- Commercial Refrigerator (snack bar fridges): CC BY 4.0, Eric Chadwick / Darmstadt Graphics Group, based on [Commercial Fridge](https://sketchfab.com/3d-models/commercial-fridge-2174e1e4f1f24f1a95aa110ee060f473) by Sean Thomas
- Traffic Cone (entrance cones): CC BY 4.0, mesh by [hinndia](https://sketchfab.com/3d-models/traffic-cone-573feef839d7450cb3e12da9986e7a98), textures CC0 (Poly Haven), edits CC0 by Ed Mackey
- Lantern (lot lamp posts): CC0, Microsoft

## Server logs

Both Cloudflare Workers have **Workers Logs** turned on (`[observability]` in `cloudflare/wrangler-*.toml`). In the Cloudflare dashboard open **Workers & Pages → breachpoint-auth (or breachpoint-turn) → Logs** to see every request, crash traces, and the account server's own events as JSON lines (`error`, `account`, `match`, `report`, `feedback`, `review`, `admin`). The free plan keeps them for 3 days.
