import { WORLDS, type LevelDef, type WorldDef } from '../data/worlds';
import { LagosLevel } from '../world/LagosLevel';

/** Anything the game can load as a playable level. */
export type LevelFactory = () => LagosLevel;

/**
 * Knows which worlds/levels exist and how to build them.
 * Adding a world = add data in data/worlds.ts + register a factory here.
 */
export class WorldManager {
  private factories = new Map<string, LevelFactory>();
  currentLevelId = 'lagos-run';

  constructor() {
    this.register('lagos-run', () => new LagosLevel());
  }

  register(levelId: string, factory: LevelFactory) { this.factories.set(levelId, factory); }

  get worlds(): WorldDef[] { return WORLDS; }

  levelDef(id = this.currentLevelId): LevelDef {
    for (const w of WORLDS) for (const l of w.levels) if (l.id === id) return l;
    throw new Error(`Unknown level ${id}`);
  }

  worldOf(levelId = this.currentLevelId): WorldDef {
    return WORLDS.find((w) => w.levels.some((l) => l.id === levelId))!;
  }

  build(levelId = this.currentLevelId) {
    const f = this.factories.get(levelId);
    if (!f) throw new Error(`No factory for level ${levelId}`);
    this.currentLevelId = levelId;
    return f();
  }
}
