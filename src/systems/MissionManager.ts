import type { EventBus, GameEvents } from './EventBus';
import type { SaveManager } from './SaveManager';

export interface MissionDef {
  id: string;
  title: string;
  main: boolean;
  /** Current progress text, e.g. "7 / 10" (optional). */
  progress?: () => string;
  /** Returns true once the mission is complete. */
  check: () => boolean;
}

/** Lightweight missions: one main objective + optional side goals, persisted per level. */
export class MissionManager {
  private missions: MissionDef[] = [];
  private done = new Set<string>();
  private levelId = '';
  /** Extra hint line under the main mission (e.g. "Power the gate nodes 1/3"). */
  mainHint = '';

  constructor(private save: SaveManager, private bus: EventBus<GameEvents>) {}

  begin(levelId: string, missions: MissionDef[]) {
    this.levelId = levelId;
    this.missions = missions;
    this.done = new Set(this.save.level(levelId).missions);
    this.mainHint = '';
  }

  get list() { return this.missions.map((m) => ({ ...m, done: this.done.has(m.id) })); }

  /** Re-evaluate all missions (call after relevant events). */
  evaluate() {
    for (const m of this.missions) {
      if (this.done.has(m.id) || !m.check()) continue;
      this.done.add(m.id);
      const lv = this.save.level(this.levelId);
      if (!lv.missions.includes(m.id)) lv.missions.push(m.id);
      this.save.save();
      this.bus.emit('missionComplete', { id: m.id, title: m.title, main: m.main });
    }
  }

  isDone(id: string) { return this.done.has(id); }
}
