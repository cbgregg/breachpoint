# Breachpoint: voice lines and sound effects to record

Everything the game can play from a recording. Nothing here is required: until a file exists the game stays silent for a voice line and uses its own synthesized sound for an effect. Each recording you add is picked up on the next page load.

## How to add a recording

1. Record or export it as **MP3**, 44.1 or 48 kHz. Voice: mono, close mic, no music, about -16 LUFS (all lines at the same loudness), a few milliseconds of silence trimmed at each end. Effects: mono unless noted, peaks around -3 dB.
2. Save it at `assets/audio/<id>.mp3`, where `<id>` is the name in the tables below. Folders in the id are real folders: `vo/announcer/victory` is `assets/audio/vo/announcer/victory.mp3`.
3. Add the id to `assets/audio/manifest.json`, e.g. `{ "files": ["vo/announcer/victory", "trainhorn"] }`. The game only fetches the files listed there.
4. **Several takes:** name them `<id>_1`, `<id>_2`, `<id>_3`… and list each one. The game picks one at random every time, so three or four takes of a line people hear often (reloading, contact, enemy down) keep it from getting old.

Announcer lines queue up behind each other instead of talking over each other. Character lines come from where the character is, through walls and distance like any other sound.

---

## 1. Announcer (`vo/announcer/...`)

One voice: a calm, clipped mission controller. Not shouty, apart from the medals.

### Match flow

| id | Line | When |
|---|---|---|
| `mode_tdm` | "Team Deathmatch. Eliminate the enemy team." | Match intro |
| `mode_ffa` | "Free-for-all. Trust no one." | Match intro |
| `mode_gunfight` | "Gunfight. One life. Same loadout. Win the round." | Match intro |
| `mode_snd` | "Search and Destroy. Plant the bomb, or stop them." | Match intro |
| `mode_gungame` | "Gun Game. Every kill, a new weapon." | Match intro |
| `mode_infected` | "Infected. Survive… or join them." | Match intro |
| `fight` | "Fight!" (alt take: "Go, go, go!") | Countdown ends |
| `one_minute` | "One minute remaining." | Last minute (timed modes) |
| `lead_taken` | "We've taken the lead." | Team Deathmatch: your team goes ahead |
| `lead_lost` | "We've lost the lead." | Team Deathmatch: the enemy goes ahead |
| `victory` | "Victory." | You win |
| `defeat` | "Defeat." | You lose |

### Medals (said with energy)

| id | Line |
|---|---|
| `double_kill` | "Double kill!" |
| `triple_kill` | "Triple kill!" |
| `fury_kill` | "Fury kill!" |
| `frenzy_kill` | "Frenzy kill!" |
| `killstreak` | "Killstreak!" (three in a row) |
| `killing_spree` | "Killing spree!" (five) |
| `rampage` | "Rampage!" (ten) |
| `unstoppable` | "Unstoppable!" (fifteen) |
| `legendary` | "Legendary!" (twenty) |

### Gun Game

| id | Line | When |
|---|---|---|
| `new_weapon` | "New weapon." | Every kill moves you up |
| `final_weapon` | "Final weapon." | You reach the Knife Slingshot |
| `humiliated` | "Humiliated." | You were knifed and dropped a gun |

### Infected

| id | Line | When |
|---|---|---|
| `you_are_infected` | "You are infected. Kill the survivors." | You start infected, or turn when patient zero leaves |
| `infected` | "You've been infected." / to the killer: "Infected." (record one neutral take) | A survivor is killed and turns |
| `last_survivor` | "You're the last survivor. Hold on." | Only you are left |

### Round modes (Gunfight, Search & Destroy)

| id | Line |
|---|---|
| `round_1` … `round_15` | "Round one." … "Round fifteen." |
| `final_round` | "Final round." |
| `switching_sides` | "Switching sides." |
| `overtime` | "Overtime. Capture the flag." |
| `round_won` | "Round won." |
| `round_lost` | "Round lost." |
| `round_draw` | "Round drawn." |
| `bomb_planted` | "Bomb planted." |
| `bomb_defused` | "Bomb defused." |
| `target_destroyed` | "Target destroyed." |
| `team_eliminated` | "Team eliminated." |
| `flag_captured` | "Flag captured." |
| `bomb_dropped` | "The bomb's been dropped." |
| `you_have_the_bomb` | "You have the bomb." |
| `bomb_picked_up` | "Bomb picked up." |

---

## 2. Link light rail announcements (`vo/link/...`)

In the style of Sound Transit's recorded announcements: a warm, neutral, unhurried voice. The on-board lines come from the car (you hear them riding or standing beside it). The platform line comes from the platform.

| id | Line | When |
|---|---|---|
| `this_is_pioneer` | "Pioneer Square Station." | Doors open at Pioneer Square |
| `this_is_symphony` | "Symphony Station." | Doors open at Symphony |
| `this_is_chinatown` | "International District, Chinatown Station." | Doors open at Chinatown |
| `doors_left` | "Doors to my left." | Two seconds after the station name |
| `doors_right` | "Doors to my right." | Two seconds after the station name |
| `doors_closing` | "Please stand clear. The doors are closing." | Doors start to close (on board and on the platform) |
| `next_pioneer` | "Next stop: Pioneer Square." | Four seconds after pulling out |
| `next_symphony` | "Next stop: Symphony." | Four seconds after pulling out |
| `next_chinatown` | "Next stop: International District, Chinatown." | Four seconds after pulling out |
| `pa_arriving_pioneer` | "Now arriving: a train to Pioneer Square." | Platform PA as a train runs in |
| `pa_arriving_symphony` | "Now arriving: a train to Symphony." | Platform PA as a train runs in |
| `pa_arriving_chinatown` | "Now arriving: a train to International District, Chinatown." | Platform PA as a train runs in |

---

## 3. Character chatter (`vo/chatter/...`)

All operators share one voice set for now, so record three or four takes of each. Short, under breath, the way a squad talks in a firefight. Teammates and enemies both say these, from where they stand.

| id | Example lines (one per take) | When |
|---|---|---|
| `reloading` | "Reloading!" · "Changing mags!" · "Cover me, reloading!" · "I'm dry!" | Reloading a mostly empty mag |
| `frag_out` | "Frag out!" · "Grenade!" · "Frag, frag!" | Throwing a frag |
| `semtex_out` | "Semtex out!" · "Sticky out!" | Throwing semtex |
| `knife_out` | "Knife!" · "Throwing!" | Throwing a throwing knife |
| `shock_out` | "Shock stick out!" · "Zapper out!" | Throwing a shock stick |
| `stun_out` | "Stun out!" · "Flash!" · "Stunning!" | Throwing a stun grenade |
| `contact` | "Contact!" · "Enemy spotted!" · "Got eyes on one!" · "Tango!" | A bot spots an enemy |
| `enemy_down` | "Enemy down." · "Got him." · "Tango down." · "Scratch one." | A bot gets a kill |
| `man_down` | "Man down!" · "We lost one!" · "They got him!" | A teammate dies nearby |
| `banter` | Record 10 or more: "Same as last time. Nobody dies." · "Check your corners." · "Anyone else hungry?" · "I've got a good feeling about this." · "Stay tight, stay quiet." · "Light 'em up." · "Who brought the snacks?" · "Eyes up, people." · "Let's make it quick." · "Last one back buys." | Pre-match countdown, a couple of your squad |

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
