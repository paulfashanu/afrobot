/**
 * Modular ability registry. Each power declares its id, key, icon and cooldown;
 * gameplay code asks `tryActivate(id)` and the HUD reads `readiness(id)`.
 * New powers in future worlds = register one more AbilityDef.
 */
export interface AbilityDef {
  id: string;
  name: string;
  key: string;
  cooldown: number;   // seconds; 0 = no cooldown
  icon: string;       // inline SVG
  description: string;
}

const ICONS = {
  doubleJump: `<svg viewBox="0 0 48 48"><path d="M24 6l10 12H27v8h-6v-8h-7z" fill="#fff"/><path d="M24 22l10 12H27v8h-6v-8h-7z" fill="#5ff7ff"/></svg>`,
  dash: `<svg viewBox="0 0 48 48"><path d="M8 14h14M4 24h16M8 34h14" stroke="#5ff7ff" stroke-width="4" stroke-linecap="round"/><path d="M24 10l18 14-18 14z" fill="#fff"/></svg>`,
  pulse: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="6" fill="#fff"/><circle cx="24" cy="24" r="13" fill="none" stroke="#5ff7ff" stroke-width="3.5"/><circle cx="24" cy="24" r="20" fill="none" stroke="#5ff7ff" stroke-width="2.5" opacity=".55"/></svg>`,
};

export const ABILITIES: AbilityDef[] = [
  { id: 'doubleJump', name: 'DOUBLE JUMP', key: 'SPACE ×2', cooldown: 0, icon: ICONS.doubleJump, description: 'Press SPACE again in mid-air.' },
  { id: 'dash', name: 'KINETIC DASH', key: 'SHIFT', cooldown: 0.55, icon: ICONS.dash, description: 'A burst of speed. Breaks cracked barriers, bowls over Bytes, crosses small gaps.' },
  { id: 'pulse', name: 'PULSE', key: 'E / Q', cooldown: 1.4, icon: ICONS.pulse, description: 'A ring of energy. Wakes devices, opens energy doors, stuns Bytes, reveals hidden cores.' },
];

type Listener = (id: string) => void;

export class AbilityManager {
  private defs = new Map<string, AbilityDef>();
  private unlocked = new Set<string>();
  private cooldowns = new Map<string, number>();
  private available = new Map<string, boolean>();
  private listeners: Listener[] = [];

  constructor(defs: AbilityDef[] = ABILITIES) {
    defs.forEach((d) => this.register(d));
  }

  register(def: AbilityDef) { this.defs.set(def.id, def); }
  get all() { return [...this.defs.values()]; }
  def(id: string) { return this.defs.get(id); }

  onUnlock(fn: Listener) { this.listeners.push(fn); }

  setUnlocked(ids: string[]) {
    this.unlocked = new Set(ids);
    this.cooldowns.clear();
  }

  unlock(id: string) {
    if (this.unlocked.has(id)) return false;
    this.unlocked.add(id);
    this.listeners.forEach((l) => l(id));
    return true;
  }

  isUnlocked(id: string) { return this.unlocked.has(id); }
  get unlockedIds() { return [...this.unlocked]; }

  /** Situational availability (e.g. double jump already spent). */
  setAvailable(id: string, v: boolean) { this.available.set(id, v); }

  /** Uses the ability if unlocked and off cooldown. */
  tryActivate(id: string): boolean {
    if (!this.unlocked.has(id)) return false;
    if ((this.cooldowns.get(id) ?? 0) > 0) return false;
    if (this.available.get(id) === false) return false;
    this.cooldowns.set(id, this.defs.get(id)?.cooldown ?? 0);
    return true;
  }

  /** 0 = just used, 1 = ready. */
  readiness(id: string): number {
    const def = this.defs.get(id);
    if (!def || !this.unlocked.has(id)) return 0;
    if (this.available.get(id) === false) return 0;
    if (!def.cooldown) return 1;
    return 1 - (this.cooldowns.get(id) ?? 0) / def.cooldown;
  }

  update(dt: number) {
    for (const [id, cd] of this.cooldowns) if (cd > 0) this.cooldowns.set(id, Math.max(0, cd - dt));
  }
}
