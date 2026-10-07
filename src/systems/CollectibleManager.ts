import { relicById, type RelicDef } from '../data/relics';
import type { EventBus, GameEvents } from './EventBus';
import type { LevelSave, SaveManager } from './SaveManager';

/**
 * Tracks Afro Cores, Afro Relics and secret areas for the current level.
 * Collection is permanent (saved): already-collected cores reappear as "ghosts" on replays.
 */
export class CollectibleManager {
  private levelId = '';
  private coreIds: string[] = [];
  private relicIds: string[] = [];
  private secretIds: string[] = [];

  constructor(private save: SaveManager, private bus: EventBus<GameEvents>) {}

  begin(levelId: string, coreIds: string[], relicIds: string[], secretIds: string[]) {
    this.levelId = levelId;
    this.coreIds = coreIds;
    this.relicIds = relicIds;
    this.secretIds = secretIds;
  }

  private get lv(): LevelSave { return this.save.level(this.levelId); }

  get totalCores() { return this.coreIds.length; }
  get coresCollected() { return this.lv.cores.filter((c) => this.coreIds.includes(c)).length; }
  get totalRelics() { return this.relicIds.length; }
  get relicsFound() { return this.lv.relics.length; }
  get totalSecrets() { return this.secretIds.length; }
  get secretsFound() { return this.lv.secrets.length; }

  isCoreCollected(id: string) { return this.lv.cores.includes(id); }
  hasRelic(id: string) { return this.lv.relics.includes(id); }
  hasSecret(id: string) { return this.lv.secrets.includes(id); }

  collectCore(id: string) {
    if (this.isCoreCollected(id)) return false;
    this.lv.cores.push(id);
    this.save.save();
    this.bus.emit('coreCollected', { id, collected: this.coresCollected, total: this.coreIds.length });
    return true;
  }

  collectRelic(id: string): RelicDef | undefined {
    if (this.hasRelic(id)) return undefined;
    this.lv.relics.push(id);
    this.save.save();
    this.bus.emit('relicCollected', { id });
    return relicById(id);
  }

  findSecret(id: string) {
    if (this.hasSecret(id)) return false;
    this.lv.secrets.push(id);
    this.save.save();
    this.bus.emit('secretFound', { id, found: this.lv.secrets.length, total: this.secretIds.length });
    return true;
  }
}
