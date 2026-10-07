/** Progress for one level. */
export interface LevelSave {
  cores: string[];
  relics: string[];
  secrets: string[];
  missions: string[];
  nodes: number[];
  checkpoint: number;      // -1 = level start
  elapsed: number;         // run timer at last save (for Continue)
  completed: boolean;
  bestTime: number | null;
}

export interface SaveData {
  version: 1;
  abilities: string[];
  levels: Record<string, LevelSave>;
  currentLevel: string;
  updated: number;
}

export interface Settings { music: number; sfx: number }

const SAVE_KEY = 'afrobot.save.v1';
const SETTINGS_KEY = 'afrobot.settings.v1';
export const STARTING_ABILITIES = ['doubleJump'];

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: play on without saving */ }
}

export function emptyLevel(): LevelSave {
  return { cores: [], relics: [], secrets: [], missions: [], nodes: [], checkpoint: -1, elapsed: 0, completed: false, bestTime: null };
}

/** localStorage-backed save game + settings. No backend. */
export class SaveManager {
  data: SaveData;
  settings: Settings;

  constructor() {
    this.data = this.fresh();
    const loaded = read<SaveData>(SAVE_KEY);
    if (loaded && loaded.version === 1) this.data = { ...this.fresh(), ...loaded };
    this.settings = { music: 0.7, sfx: 0.9, ...(read<Settings>(SETTINGS_KEY) ?? {}) };
  }

  private fresh(): SaveData {
    return { version: 1, abilities: [...STARTING_ABILITIES], levels: {}, currentLevel: 'lagos-run', updated: 0 };
  }

  /** True if there is a saved game worth continuing. */
  hasSave() { return read<SaveData>(SAVE_KEY) !== null; }

  newGame() {
    this.data = this.fresh();
    this.save();
  }

  level(id: string): LevelSave {
    return (this.data.levels[id] ??= emptyLevel());
  }

  save() {
    this.data.updated = Date.now();
    write(SAVE_KEY, this.data);
  }

  saveSettings() { write(SETTINGS_KEY, this.settings); }
}
