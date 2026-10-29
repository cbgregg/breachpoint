# Breachpoint

A fast, close-quarters military shooter that runs in the browser. Play against bots offline, or online with friends using a 6-digit code. Keyboard and mouse, Xbox controller and touch all work.

**Play:** [breach-point.net](https://breach-point.net) · **Status:** pre-alpha

Made by cbgregg. It's a one-person project, so if you enjoy it, [buy me a coffee](https://buymeacoffee.com/breachpoint) to help keep the servers up. Feedback and requests: *Options → About → Send feedback* in the game.

## What's in it

- Team Deathmatch, Search & Destroy, Gunfight, Free-for-All, Gun Game and Infected
- Six maps: Tarsa Market, Pioneer Square and the Seattle Underground under it, Link Loop (three light-rail stations you get between by riding the train), the Freshway supermarket, the Drive-In and Shuran Yard
- Attachments, cookable frags, Semtex, throwing knives and stuns
- Sprint, tac sprint, slide, prone and mantling
- Breakable windows, boarded-up doorways you can kick through, and doors you can kick open
- Bots on three difficulties that use cover, flank and trade
- Online matches with friends through a code or invite link, plus public lobbies

## Controls

| Action | Keyboard & mouse | Xbox controller |
|---|---|---|
| Move / look | `WASD` / mouse | Sticks |
| Fire / aim | Left / right click | RT / LT |
| Jump / mantle | `Space` | A |
| Crouch, slide, prone | `C` or `Ctrl` (hold for prone) | B (hold for prone) |
| Sprint / tactical sprint | `Shift` / double-tap `Shift` | L3 / L3 again |
| Reload, plant, defuse, doors | `R` | X |
| Swap weapon | `Q`, `1` `2`, wheel | Y |
| Lethal / tactical | `G` / `E` | RB / LB |
| Melee | `V` | R3 |
| Scoreboard / pause | `Tab` / `Esc` | View / Menu |

Touch controls are on screen and can be rearranged under Options.

## Run it locally

The game is plain ES modules with no build step, so it needs to be served over HTTP:

```bash
npx serve .            # or: python3 -m http.server 8000
```

Pushes to `main` deploy to GitHub Pages. Server setup and everything else is in [docs/reference.md](docs/reference.md).

## Credits

- Soldier model and animations: the *Soldier* sample from the [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf) (a Mixamo character, under Adobe's Mixamo terms).
- Fonts: [Barlow and Barlow Condensed](https://github.com/jpt/barlow) by The Barlow Project Authors, SIL Open Font License 1.1 (`assets/fonts/OFL.txt`).
- Matchmaking: [Trystero](https://github.com/dmotz/trystero) by Dan Motzenbecker (MIT).
- First-person hands: "Rigged Hand" (2015), converted to glTF.
- Textures: CC0 sets from [ambientCG](https://ambientcg.com) and [Poly Haven](https://polyhaven.com).

Weapon and prop models from Sketchfab under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), resized, re-oriented and trimmed for the game:

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
- [Subway station](https://sketchfab.com/3d-models/subway-station-fa31f1ebe8cb437f9c753b22b3fdfc55) by Pasha

Vehicles, also from Sketchfab under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), scaled and with textures resized for the game:

- [Free Mazda 6 Sedan 2011](https://sketchfab.com/3d-models/free-mazda-6-sedan-2011-arvr-lowpoly-3d-model-5742c2b07f224d53916307cc1e0f9cc5) by 3D Piece (3D_Mill)
- [Jeep Renegade 2016](https://sketchfab.com/3d-models/jeep-renegade-2016-192f7e81dce84c6780434f692a0f96c5) by Jose Bronze
- [Box-truck](https://sketchfab.com/3d-models/box-truck-b0e8788b6b774fe3a18eda1895a2b8fe) by Cristian Rus
- [Food Truck](https://sketchfab.com/3d-models/food-truck-9a179f9803734a3e95630727b9db3477) by sandrafaki
- [SFMTA Muni New Flyer XD40](https://sketchfab.com/3d-models/sfmta-muni-new-flyer-xd40-bb7c7e5b03874961b03d4b36f6c95b1b) by kieranfarr, base model by _TimTheTerrible
- [1910 Cologne streetcar](https://sketchfab.com/3d-models/1910-cologne-streetcar-5c6c2a7babd34845a66572dc604dca8a) by felixoesinghaus
- [Mercedes Benz Sprinter 2006](https://sketchfab.com/3d-models/mercedes-benz-sprinter-2006-f69de1315bb049c8946d57f6006acd73) by Max (Max-7215)
- [Semi Truck](https://sketchfab.com/3d-models/semi-truck-65d325c2fc9443d88c61dc01976b8291) by ne0ns (Ervinas)
- [Forklift Truck](https://sketchfab.com/3d-models/forklift-truck-060f3f8bc7de4e6ca2f348d414702e9d) by louis-muir
- [Low Poly Car - Chrysler Saratoga 1960](https://sketchfab.com/3d-models/low-poly-car-chrysler-saratoga-1960-3fa89e6bf78b49aab111af4195efb6fe) and [Low Poly Car - Cadillac 75 Sedan 1953](https://sketchfab.com/3d-models/low-poly-car-cadillac-75-sedan-1953-2935f8faa5f64ce4a3bd65af0f925c21) by ROH3D (tedpermana)
- [1951 Chevy StepSide Truck](https://sketchfab.com/3d-models/1951-chevy-stepside-truck-4f53676a14ec4d3295d969441655b09c) by Nick Rosenthal
- [700 Follower Special Van](https://sketchfab.com/3d-models/700-follower-special-van-downloadable-6a6c3f1410d34491994c3308959f2f38) by Libau Media
- [Rustic Chevrolet P30 Step-Van Replica](https://sketchfab.com/3d-models/rustic-chevrolet-p30-step-van-replica-45c4e2166c8a4cbc88f04ae404fa9a02) by the.snajp
- [Adelaide Alstom Citadis 302](https://sketchfab.com/3d-models/adelaide-alstom-citadis-302-original-6ee414e9f05347ca9b3f1e0e062b99c0) by MiguelRamos

From the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets), textures resized:

- Commercial Refrigerator (snack bar fridges): CC BY 4.0, Eric Chadwick / Darmstadt Graphics Group, based on [Commercial Fridge](https://sketchfab.com/3d-models/commercial-fridge-2174e1e4f1f24f1a95aa110ee060f473) by Sean Thomas
- Traffic Cone (entrance cones): CC BY 4.0, mesh by [hinndia](https://sketchfab.com/3d-models/traffic-cone-573feef839d7450cb3e12da9986e7a98), textures CC0 (Poly Haven), edits CC0 by Ed Mackey
- Lantern (lot lamp posts): CC0, Microsoft

## License

Code: MIT, see [LICENSE](LICENSE). Third-party assets keep their own licenses, listed above.
