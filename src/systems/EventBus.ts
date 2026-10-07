/** Tiny typed event emitter so systems can talk without knowing about each other. */
export class EventBus<E extends Record<string, unknown>> {
  private handlers: { [K in keyof E]?: ((payload: E[K]) => void)[] } = {};

  on<K extends keyof E>(type: K, fn: (payload: E[K]) => void): () => void {
    (this.handlers[type] ??= []).push(fn);
    return () => { this.handlers[type] = this.handlers[type]!.filter((h) => h !== fn); };
  }

  emit<K extends keyof E>(type: K, payload: E[K]) {
    this.handlers[type]?.forEach((h) => h(payload));
  }
}

/** All gameplay events in AFROBOT. */
export type GameEvents = {
  coreCollected: { id: string; collected: number; total: number };
  relicCollected: { id: string };
  abilityUnlocked: { id: string };
  secretFound: { id: string; found: number; total: number };
  checkpoint: { index: number };
  nodeActivated: { active: number; total: number };
  levelComplete: { time: number };
  missionComplete: { id: string; title: string; main: boolean };
  pulse: { x: number; y: number; z: number };
};
