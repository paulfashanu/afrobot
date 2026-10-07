# AFROBOT: Lagos Run (v0.3)

A colourful browser 3D platformer — Lagos + Afrofuturism + playful sci-fi.
Built with TypeScript, Three.js and Vite. Everything (models, textures, sounds, music) is generated procedurally — no external assets, no backend.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
```

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move (camera-relative) |
| SPACE | Jump — hold for height; press again in mid-air to double-jump |
| SHIFT | Kinetic Dash *(unlocked by the Kinetic Core)* |
| E | Interact (talk / read / activate). With nothing nearby, E fires **Pulse** |
| Q | Pulse *(unlocked by the Pulse Core)* |
| Mouse | Rotate camera (click to lock the pointer; drag also works) |
| ESC | Pause |
| M / N | Toggle music / mute all |

## What's in the game

- **Powers** — Double Jump from the start; **Kinetic Dash** and **Pulse** are discovered mid-level, each with a short discovery cinematic.
- **Ability-reactive world** — cracked crates (Dash), energy doors and an ancient glyph mechanism (Pulse), high platforms (Double Jump), hidden Afro Cores revealed by Pulse, Bytes stunned by Pulse.
- **3 secret areas** — Sky Garden (double jump), Dash Den (dash), Forgotten Shrine (pulse).
- **Collectibles** — 30 Afro Cores (collected cores reappear as "ghosts" on replays) and 3 **Afro Relics**.
- **Friendly robots** — Lagos Bot and Market Bot with short dialogue; terminals, murals and a dormant robot hint at Afrobot's mystery.
- **Missions** — main: *Reach the Afro Gate*; optional: collect 10 cores, find a relic, discover a hidden area.
- **Saving** — automatic, in `localStorage` (abilities, cores, relics, secrets, missions, checkpoint, best time, completion). Title screen offers **CONTINUE** / **NEW GAME**, plus **HOW TO PLAY** and **SETTINGS** (music & sound volume).
- **Feel** — intro cinematic, squash & stretch, coyote time, jump buffering, apex hang, hit-stop, camera shake, look-ahead camera, victory sequence, LEVEL COMPLETE with best time.

## Code map

```
src/
  core/        Game (state machine + orchestration), Input, Camera (third-person rig w/ cinematic mode),
               Physics (solids), Textures (canvas-drawn), Batcher (merged static decor + foliage sway)
  systems/     EventBus, SaveManager, AbilityManager, ProgressionManager, CollectibleManager,
               MissionManager, DialogueManager, WorldManager
  data/        worlds.ts (Lagos → Sahel → Rainforest → Savannah → Great Zimbabwe → AfroFuture),
               relics.ts, dialogue.ts
  player/      Afrobot (procedural model + animation), PlayerController (movement & collision)
  world/       LagosLevel (layout), Platform, Obstacles, Interactive (doors, breakables, glyph pillar,
               pedestals, relics, terminals, murals, secret zones), Checkpoint, PowerNode, AfroGate,
               Props (buildings, NPC silhouettes, signs…), Environment (sky, light, water, traffic),
               Ambient (birds, drones, monorail, boats, motes), Landmark (the Suncrown Spire)
  npc/         RobotNpc (Lagos Bot, Market Bot)
  enemies/     Byte
  collectibles/AfroCore
  fx/          Particles, PulseWave, Grade (colour grade pass)
  ui/          HUD, TitleScreen, PauseMenu, LevelComplete, style.css
  audio/       AudioManager (WebAudio SFX + procedural Afrobeats loop)
```

**Adding a power:** register an `AbilityDef` in `AbilityManager.ts`, gate it with `abilities.tryActivate(id)`, and place an `AbilityPickup` for discovery.
**Adding a relic:** add a `RelicDef` to `data/relics.ts` and a `RelicPickup` in the level.
**Adding a world/level:** add data in `data/worlds.ts` and register a level factory in `WorldManager`.

Debug: `__afrobot.debugTeleport(x, y, z)` in the console (the route runs from z = 11 toward z = -232).
