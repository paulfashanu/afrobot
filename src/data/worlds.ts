/**
 * Data-driven world structure. Future worlds/levels are added here; a level only needs
 * an id, a name and a factory registered with the WorldManager.
 */
export interface LevelDef {
  id: string;
  name: string;
  world: string;
  /** Abilities this level can grant (discovered via pickups). */
  powers: string[];
  relics: string[];
  npcs: string[];
  story: string[];
}

export interface WorldDef {
  id: string;
  name: string;
  tagline: string;
  available: boolean;
  levels: LevelDef[];
  bosses: string[];
}

export const WORLDS: WorldDef[] = [
  {
    id: 'lagos',
    name: 'LAGOS',
    tagline: 'Where the journey wakes up.',
    available: true,
    bosses: [],
    levels: [
      {
        id: 'lagos-run',
        name: 'LAGOS RUN',
        world: 'lagos',
        powers: ['dash', 'pulse'],
        relics: ['relic-gear', 'relic-transmitter', 'relic-glyph'],
        npcs: ['lagos-bot', 'market-bot'],
        story: ['kinetic-pedestal', 'broken-robot', 'shrine-mural', 'transmissions'],
      },
    ],
  },
  { id: 'sahel', name: 'SAHEL', tagline: 'Wind, sand and singing towers.', available: false, bosses: [], levels: [] },
  { id: 'rainforest', name: 'RAINFOREST', tagline: 'Green giants and hidden rivers.', available: false, bosses: [], levels: [] },
  { id: 'savannah', name: 'SAVANNAH', tagline: 'Endless horizons.', available: false, bosses: [], levels: [] },
  { id: 'great-zimbabwe', name: 'GREAT ZIMBABWE', tagline: 'Stone that remembers.', available: false, bosses: [], levels: [] },
  { id: 'afrofuture', name: 'AFROFUTURE', tagline: '???', available: false, bosses: [], levels: [] },
];
