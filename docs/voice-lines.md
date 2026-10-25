# Breachpoint: voice lines and sound effects to record

Everything the game can play from a recording. Nothing here is required: until a file exists the game stays silent for a voice line and uses its own synthesized sound for an effect. Each recording you add is picked up on the next page load.

**Every voice line is already generated**: 1,029 of them, made with Azure's HD text-to-speech voices by `tools/gen_voice.py`, which holds the exact wording of every take. Each clip is transcribed back with speech-to-text and re-made until the transcript matches the script, and every voice is brought to the same loudness. To regenerate: `AZURE_SPEECH_KEY=<key> python3 tools/gen_voice.py --force` (or `--only vo/announcer/sable` for one part). The key is read from the environment only; never commit it. A real recording saved over a generated file replaces it.

---

## 1. Announcers (`vo/announcer/<pack>/...`)

Five announcers, each a different character with their own wording and two or three ways of saying every announcement (`<id>_1`, `<id>_2`, `<id>_3`; the game never plays the same take twice running). Players pick one under Options > Audio > Announcer, or get a different one every match (the default; the next one loads while you play).

| Pack | Voice | Character |
|---|---|---|
| `control` | Brian | A calm, clipped mission controller |
| `sable` | Jane | A cool, dry, slightly sarcastic commander |
| `ghost` | Vance | A gruff old drill sergeant |
| `hype` | Alloy | An esports arena caster |
| `nova` | Nova | Upbeat and playful |

Every pack has these ids:

| id | When |
|---|---|
| `mode_tdm`, `mode_ffa`, `mode_gunfight`, `mode_snd`, `mode_gungame`, `mode_infected` | Match intro |
| `fight` | Countdown ends |
| `one_minute` | Last minute (timed modes) |
| `lead_taken`, `lead_lost` | Team Deathmatch: the lead changes |
| `victory`, `defeat` | Match over |
| `double_kill`, `triple_kill`, `fury_kill`, `frenzy_kill` | Multi-kill medals |
| `killstreak`, `killing_spree`, `rampage`, `unstoppable`, `legendary` | 3, 5, 10, 15, 20 in a row |
| `new_weapon`, `final_weapon`, `humiliated` | Gun Game |
| `you_are_infected`, `infected`, `last_survivor` | Infected |
| `round_1` … `round_15`, `final_round`, `match_point` | Round modes: a round starts (saved as `round_3_1`, `round_3_2`…) |
| `switching_sides`, `overtime` | Halftime; Gunfight overtime |
| `round_won`, `round_lost`, `round_draw` | A round ends ("won" lines avoid the words "round won", which sound like "round one") |
| `bomb_planted`, `bomb_defused`, `target_destroyed`, `team_eliminated`, `flag_captured` | Heard by both teams, so they don't take a side |
| `bomb_dropped`, `you_have_the_bomb`, `bomb_picked_up` | Search and Destroy, attackers only |

## 2. Link light rail announcements (`vo/link/...`)

In the style of Sound Transit's recorded announcements: a warm, neutral, unhurried voice (Ava on board, Andrew on the platform). The on-board lines come from the car (you hear them riding or standing beside it). The platform lines come from the platform.

| id | Line | When |
|---|---|---|
| `this_is_pioneer` | "Pioneer Square Station." | Doors open at Pioneer Square |
| `this_is_symphony` | "Symphony Station." | Doors open at Symphony |
| `this_is_chinatown` | "International District, Chinatown Station." | Doors open at Chinatown |
| `doors_closing` | "Please stand clear. The doors are closing." | Doors start to close (on board and on the platform) |
| `hold_on` | "Please hold on." (a real recording: `tools/gen_voice.py` never generates over it) | As the train pulls out |
| `next_pioneer_left`, `next_pioneer_right` | "Next stop, Pioneer Square. Transfer available to First Hill Streetcar. Doors open on the left / right." | Three and a half seconds after pulling out |
| `next_symphony_left`, `next_symphony_right` | "Next stop, Symphony Station. Doors open on the left / right." | Same |
| `next_chinatown_left`, `next_chinatown_right` | "Next stop, International District, Chinatown. Transfer available to Sounder Commuter Rail and Amtrak at King Street Station. Doors open on the left / right." | Same |
| `pa_arriving_pioneer` | "Now arriving: 1 Line to Pioneer Square. Please step back from the edge of the platform." | Platform PA as a train runs in |
| `pa_arriving_symphony` | "Now arriving: 1 Line to Symphony. Please step back from the edge of the platform." | Same |
| `pa_arriving_chinatown` | "Now arriving: 1 Line to International District, Chinatown. Please step back from the edge of the platform." | Same |

---

## 3. Operators (`vo/chatter/<voice>/...`)

Twelve operator voices, six women and six men: `emma`, `aria`, `jenny`, `tessa`, `mila`, `tiana`, `davis`, `steffan`, `adam`, `tyler`, `colin`, `jimmie`. Every character keeps one voice for the whole match, and no two share one while there are voices to go round (handed out by name, so everyone online hears the same bot with the same voice). Your own operator's voice is under Options > Audio. Each voice has three takes of every callout, drawn from a pool of twelve per callout so different operators say different things, and five banter lines of its own (sixty in all). They're written to carry the moment: "Ugh, empty! Reloading!", "No! We lost one!", "Honestly? I'm terrified. Let's go."

| id | When |
|---|---|
| `reloading` | Reloading a mostly empty mag |
| `frag_out`, `semtex_out`, `knife_out`, `shock_out`, `stun_out` | Throwing a lethal or a tactical |
| `contact` | A bot spots an enemy |
| `enemy_down` | A bot gets a kill |
| `man_down` | A teammate dies nearby |
| `hit` | A bot takes a heavy hit and survives |
| `banter` | Pre-match countdown, a couple of your squad |

### Infected (`vo/infected/...`)

| id | What | When |
|---|---|---|
| `growl` | Ragged breathing, a snarl, a hiss (several takes) | Infected chasing someone |
| `knife_out` | A grunt as they throw | Infected throwing their knife |

---

## 4. Sound effects (optional)

Every effect below is already synthesized. A recording with the same id plays instead. Per-variant ids (`_<weapon>`, `_<surface>`) are tried first, then the plain id.

### Guns

| id | Notes |
|---|---|
| `shot_<weapon>` | One shot, close, dry (the game adds the room or street reverb and the distance). Weapons: `rifle`, `kv47`, `br308`, `hx60`, `smg`, `krv45`, `shotgun`, `sa12`, `mr14`, `sniper`, `pistol`, `d50`, `r357`, `mp18`, `monte`. |
| `reload_<weapon>` | The whole reload, timed to the weapon's reload (shorter is fine) |
| `dry` | Empty click |
| `switch` | Weapon swap |
| `casing` | A shell hitting the floor |
| `whiz` | A round passing close to your head |

### Impacts and hits

| id | Notes |
|---|---|
| `impact_concrete`, `impact_metal`, `impact_wood`, `impact_glass` | Bullet hits on a surface |
| `hit` | Hit marker tick |
| `headshot` | The headshot "ching" |
| `kill` | Kill confirm |
| `hurt` | You getting hit |
| `melee`, `meleehit` | The swing, and connecting |
| `explosion` | A frag going off (mono, close; the game delays it with distance) |
| `bounce`, `pin` | A grenade bouncing; a pin being pulled |

### You

| id | Notes |
|---|---|
| `step_concrete`, `step_metal`, `step_wood`, `step_dirt`, `step_tile` | Single footsteps, several takes each (`step_metal_1`…) |
| `jump`, `land`, `slide` | |
| `heartbeat` | One lub-dub, low |
| `breath` | One ragged breath |
| `tinnitus` | Ear ringing after a close blast, about 2.5 s |
| `pickup`, `spawn` | |

### Doors

| id | Notes |
|---|---|
| `door`, `doorshut`, `doorbash`, `doorslide` | Open, shut, shoulder-barge, automatic sliding glass |

### Light rail (Siemens S70)

These need real recordings to sound like Link, and you can make them yourself at any Link station, as long as you record from the platform and don't get in the way. Sound Transit's own recordings aren't free to use.

| id | Notes |
|---|---|
| `trainhorn` | Horn as it pulls out (tunnel) |
| `trainbell` | The bell as it runs in |
| `trainchime` | Door chime |
| `traindoor` | Door motors opening and closing |
| `trainbrake` | Brakes releasing and hissing at the stop |
| `trainmotor` | A 0.4 s slice of the traction motor whine at speed. It's played every 0.4 s while moving, at the train's position, so keep it steady with no attack. |
| `trainclack` | One rail joint under a bogie (two quick clacks) |

### Menus

| id | Notes |
|---|---|
| `ui` | Menu click |
| `beep` | Countdown beep |
| `horn` | Round-end horn |
