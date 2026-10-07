/** In-game heads-up display: cores, time, health, gate power, hints, toasts, prompts. */
export class HUD {
  readonly root: HTMLDivElement;
  private coresEl: HTMLSpanElement;
  private coresPill: HTMLDivElement;
  private timeEl: HTMLSpanElement;
  private hearts: HTMLDivElement[] = [];
  private nodeDots: HTMLDivElement[] = [];
  private toastWrap: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private vignette: HTMLDivElement;
  private lastTime = '';

  constructor(parent: HTMLElement, private totalCores: number, maxHealth: number, nodeCount: number) {
    this.root = el('div', 'ui-layer');
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="pill cores"><div class="core-icon"></div><span><span class="label">AFRO CORES:</span> <span class="n">0 / ${totalCores}</span></span></div>
        <div class="hearts"></div>
        <div class="pill nodes"><span class="label">GATE POWER</span><span class="dots" style="display:flex;gap:6px"></span></div>
      </div>
      <div class="hud-tr"><div class="pill time"><span class="label">TIME:</span>&nbsp;<span class="t">00:00</span></div></div>
      <div class="hud-bl">
        <span><span class="key">WASD</span>Move</span>
        <span><span class="key">SPACE</span>Jump ×2</span>
        <span><span class="key">SHIFT</span>Dash</span>
        <span><span class="key">E</span>Interact</span>
        <span><span class="key">MOUSE</span>Camera</span>
        <span><span class="key">ESC</span>Pause</span>
        <span><span class="key">M</span>Music</span>
      </div>
      <div class="toast-wrap"></div>
      <div class="prompt"></div>
      <div class="vignette"></div>
      <div class="fade"></div>`;
    parent.appendChild(this.root);
    this.coresPill = this.root.querySelector('.cores')!;
    this.coresEl = this.root.querySelector('.cores .n')!;
    this.timeEl = this.root.querySelector('.t')!;
    this.toastWrap = this.root.querySelector('.toast-wrap')!;
    this.promptEl = this.root.querySelector('.prompt')!;
    this.fadeEl = this.root.querySelector('.fade')!;
    this.vignette = this.root.querySelector('.vignette')!;
    const heartsEl = this.root.querySelector('.hearts')!;
    for (let i = 0; i < maxHealth; i++) { const h = el('div', 'heart'); heartsEl.appendChild(h); this.hearts.push(h); }
    const dots = this.root.querySelector('.dots')!;
    for (let i = 0; i < nodeCount; i++) { const d = el('div', 'node-dot'); dots.appendChild(d); this.nodeDots.push(d); }
  }

  setVisible(v: boolean) { this.root.style.display = v ? '' : 'none'; }

  setCores(n: number) {
    this.coresEl.textContent = `${n} / ${this.totalCores}`;
    this.coresPill.classList.remove('bump');
    void this.coresPill.offsetWidth;
    this.coresPill.classList.add('bump');
  }

  setTime(seconds: number) {
    const s = formatTime(seconds);
    if (s !== this.lastTime) { this.timeEl.textContent = s; this.lastTime = s; }
  }

  setHealth(h: number) { this.hearts.forEach((el, i) => el.classList.toggle('off', i >= h)); }
  setNodes(n: number) { this.nodeDots.forEach((d, i) => d.classList.toggle('on', i < n)); }

  toast(text: string, life = 2.2) {
    const t = el('div', 'toast');
    t.textContent = text;
    t.style.setProperty('--life', `${life}s`);
    this.toastWrap.appendChild(t);
    setTimeout(() => t.remove(), (life + 0.5) * 1000);
  }

  prompt(text: string | null) {
    if (text) this.promptEl.innerHTML = text;
    this.promptEl.classList.toggle('show', !!text);
  }

  fade(on: boolean) { this.fadeEl.classList.toggle('on', on); }

  hurtFlash() {
    this.vignette.classList.add('hurt');
    setTimeout(() => this.vignette.classList.remove('hurt'), 260);
  }

  reset() {
    this.toastWrap.innerHTML = '';
    this.prompt(null);
    this.setCores(0);
    this.setTime(0);
    this.setNodes(0);
  }
}

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
