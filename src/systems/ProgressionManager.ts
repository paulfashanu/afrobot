import type { AbilityManager } from './AbilityManager';
import type { EventBus, GameEvents } from './EventBus';
import type { SaveManager } from './SaveManager';

/** Power discovery: unlocks abilities found in the world and persists them. */
export class ProgressionManager {
  constructor(private abilities: AbilityManager, private save: SaveManager, private bus: EventBus<GameEvents>) {}

  /** Apply saved unlocks at the start of a session. */
  restore() { this.abilities.setUnlocked(this.save.data.abilities); }

  has(id: string) { return this.abilities.isUnlocked(id); }

  /** Called when a power core is picked up. Returns false if already owned. */
  discover(id: string): boolean {
    if (!this.abilities.unlock(id)) return false;
    if (!this.save.data.abilities.includes(id)) this.save.data.abilities.push(id);
    this.save.save();
    this.bus.emit('abilityUnlocked', { id });
    return true;
  }
}
