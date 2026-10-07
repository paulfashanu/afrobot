# AFROBOT: Lagos Run (v0.1)

A colourful browser 3D platformer — Lagos + Afrofuturism + playful sci-fi.
Built with TypeScript, Three.js and Vite. Everything (models, textures, sounds, music) is generated procedurally — no external assets.

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
| SPACE | Jump — press again in the air to double-jump (hold for higher jumps) |
| SHIFT | Dash (one air-dash per jump) — dashing into a Byte defeats it |
| E | Interact (power nodes) |
| Mouse | Rotate camera (click the game to lock the pointer; drag also works) |
| ESC | Pause |
| M / N | Toggle music / mute all sound |

## The level

1. **Lagos street** — tutorial signs, market stalls, a danfo bus, the first Byte.
2. **Lagoon hop** — stepping stones, a moving platform, and an optional *secret route* with a falling platform.
3. **Eko Market** — checkpoint 1, two Bytes, hidden cores, and a timed zap fence.
4. **Elevated causeway** — stairs, a rotating disc, falling platforms, an optional ledge path, a spinner arena and an elevator.
5. **Rooftops** — checkpoint 2, three **power nodes** (press E) that unlock **THE AFRO GATE**, spinners, zap fences and more Bytes.

20 Afro Cores in total — some on the main path, some up high, some hidden behind objects, some on optional routes.

## Code map

```
src/
  core/        Game (loop, states, rules), Input, Camera (third-person rig), Physics (solids),
               Textures (canvas-drawn), Batcher (merges static decor into few draw calls)
  player/      Afrobot (procedural model + animation), PlayerController (movement & collision)
  world/       LagosLevel (layout), Platform (static/moving/rotating/falling), Obstacles
               (spinner, electric barrier), Checkpoint, PowerNode, AfroGate, Props, Environment
  enemies/     Byte
  collectibles/AfroCore
  ui/          HUD, PauseMenu, LevelComplete, TitleScreen, style.css
  audio/       AudioManager (WebAudio SFX + procedural Afrobeats loop)
  fx/          Particles
```

Debug: in the browser console, `__afrobot.debugTeleport(x, y, z)` moves Afrobot anywhere (the route runs from z = 11 toward z = -232).
