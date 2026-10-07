import type { AbilityDef } from '../systems/AbilityManager';

export interface MissionView { id: string; title: string; main: boolean; done: boolean; progress?: () => string }

/** In-game heads-up display (DOM overlay). Minimal, animated, icon-first. */
export class HUD {
  readonly root: HTMLDivElement;
  private coresEl: HTMLSpanElement;
  private coresPill: HTMLDivElement;
  private relicEl: HTMLSpanElement;
  private relicPill: HTMLDivElement;
  private timeEl: HTMLSpanElement;
  private hearts: HTMLDivElement[] = [];
  private cpWrap: HTMLDivElement;
  private missionsEl: HTMLDivElement;
  private abilityBar: HTMLDivElement;
  private abilitySlots = new Map<string, { el: HTMLDivElement; ring: HTMLDivElement }>();
  private toastWrap: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private flashEl: HTMLDivElement;
  private vignette: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private relicCardEl: HTMLDivElement;
  private letterbox: HTMLDivElement;
  private hintsEl: HTMLDivElement;
  private lastTime = '';
  private missionPulse = 0;

  constructor(parent: HTMLElement, maxHealth: number) {
    this.root = el('div', 'ui-layer');
    this.root.innerHTML = `
      <div class="letterbox"><div></div><div></div><span class="skip">SPACE / CLICK — SKIP</span></div>
      <div class="hud-tl">
        <div class="pill cores"><div class="core-icon"></div><span class="n">0 / 0</span></div>
        <div class="row">
          <div class="pill mini relics"><div class="relic-icon"></div><span class="r">0 / 3</span></div>
          <div class="hearts"></div>
        </div>
      </div>
      <div class="hud-tr">
        <div class="pill time"><svg viewBox="0 0 24 24" class="clock"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg><span class="t">00:00</span></div>
        <div class="cps"></div>
        <div class="missions"></div>
      </div>
      <div class="ability-bar"></div>
      <div class="hud-bl">
        <span><span class="key">WASD</span>Move</span>
        <span><span class="key">SPACE</span>Jump ×2</span>
        <span class="h-dash"><span class="key">SHIFT</span>Dash</span>
        <span class="h-pulse"><span class="key">E</span><span class="key">Q</span>Pulse</span>
        <span><span class="key">E</span>Interact</span>
        <span><span class="key">MOUSE</span>Camera</span>
        <span><span class="key">ESC</span>Pause</span>
      </div>
      <div class="toast-wrap"></div>
      <div class="banner"></div>
      <div class="relic-card"></div>
      <div class="prompt"></div>
      <div class="vignette"></div>
      <div class="flash"></div>
      <div class="fade"></div>`;
    parent.appendChild(this.root);
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.coresPill = q('.cores');
    this.coresEl = q('.cores .n');
    this.relicPill = q('.relics');
    this.relicEl = q('.relics .r');
    this.timeEl = q('.t');
    this.cpWrap = q('.cps');
    this.missionsEl = q('.missions');
    this.abilityBar = q('.ability-bar');
    this.toastWrap = q('.toast-wrap');
    this.promptEl = q('.prompt');
    this.fadeEl = q('.fade');
    this.flashEl = q('.flash');
    this.vignette = q('.vignette');
    this.bannerEl = q('.banner');
    this.relicCardEl = q('.relic-card');
    this.letterbox = q('.letterbox');
    this.hintsEl = q('.hud-bl');
    const heartsEl = q('.hearts');
    for (let i = 0; i < maxHealth; i++) { const h = el('div', 'heart'); heartsEl.appendChild(h); this.hearts.push(h); }
  }

  setVisible(v: boolean) { this.root.classList.toggle('hidden', !v); }

  // ---------- counters ----------
  setCores(n: number, total: number, bump = true) {
    this.coresEl.textContent = `${n} / ${total}`;
    if (bump) restart(this.coresPill, 'bump');
  }

  /** "+1" core flies from a screen position into the counter. */
  flyCore(x: number, y: number) {
    const f = el('div', 'fly-core');
    f.style.left = `${x}px`; f.style.top = `${y}px`;
    this.root.appendChild(f);
    const target = this.coresPill.querySelector('.core-icon')!.getBoundingClientRect();
    requestAnimationFrame(() => {
      f.style.transform = `translate(${target.left + 13 - x}px, ${target.top + 13 - y}px) scale(0.6) rotate(45deg)`;
      f.style.opacity = '0.2';
    });
    setTimeout(() => f.remove(), 600);
    const plus = el('div', 'plus-one');
    plus.textContent = '+1';
    plus.style.left = `${x}px`; plus.style.top = `${y - 20}px`;
    this.root.appendChild(plus);
    setTimeout(() => plus.remove(), 900);
  }

  setRelics(n: number, total: number, bump = false) {
    this.relicEl.textContent = `${n} / ${total}`;
    if (bump) restart(this.relicPill, 'bump');
  }

  setTime(seconds: number) {
    const s = formatTime(seconds);
    if (s !== this.lastTime) { this.timeEl.textContent = s; this.lastTime = s; }
  }

  setHealth(h: number) { this.hearts.forEach((e, i) => e.classList.toggle('off', i >= h)); }

  /** Checkpoint pips: little flags that light up when activated. */
  setCheckpoints(active: number, total: number, animate = false) {
    if (this.cpWrap.children.length !== total) {
      this.cpWrap.innerHTML = '';
      for (let i = 0; i < total; i++) {
        const f = el('div', 'cp');
        f.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 21V4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M7 4h11l-3 4 3 4H7z" fill="currentColor"/></svg>`;
        this.cpWrap.appendChild(f);
      }
    }
    [...this.cpWrap.children].forEach((c, i) => {
      const on = i < active;
      if (on && animate && i === active - 1 && !c.classList.contains('on')) restart(c as HTMLElement, 'pop');
      c.classList.toggle('on', on);
    });
  }

  // ---------- missions ----------
  setMissions(list: MissionView[], mainHint: string, highlight = false) {
    const main = list.find((m) => m.main);
    const opt = list.filter((m) => !m.main);
    this.missionsEl.innerHTML = `
      ${main ? `<div class="m main ${main.done ? 'done' : ''}"><span class="mk">◆</span>${main.title}${mainHint ? `<div class="sub">${mainHint}</div>` : ''}</div>` : ''}
      ${opt.map((m) => `<div class="m ${m.done ? 'done' : ''}"><span class="mk">${m.done ? '✓' : '○'}</span>${m.title}${!m.done && m.progress ? ` <b>${m.progress()}</b>` : ''}</div>`).join('')}`;
    if (highlight) { this.missionPulse = 4; this.missionsEl.classList.add('active'); }
  }

  // ---------- abilities ----------
  setAbilities(defs: AbilityDef[], unlocked: (id: string) => boolean) {
    for (const d of defs) {
      const has = unlocked(d.id);
      let slot = this.abilitySlots.get(d.id);
      if (has && !slot) {
        const e = el('div', 'ab');
        e.innerHTML = `<div class="ring"></div><div class="ic">${d.icon}</div><div class="k">${d.key}</div>`;
        this.abilityBar.appendChild(e);
        slot = { el: e, ring: e.querySelector('.ring') as HTMLDivElement };
        this.abilitySlots.set(d.id, slot);
        restart(e, 'pop');
      } else if (!has && slot) {
        slot.el.remove();
        this.abilitySlots.delete(d.id);
      }
    }
    this.hintsEl.querySelector('.h-dash')!.classList.toggle('hidden', !unlocked('dash'));
    this.hintsEl.querySelector('.h-pulse')!.classList.toggle('hidden', !unlocked('pulse'));
  }

  /** Per-frame readiness 0..1 → radial recharge ring. */
  updateAbilities(readiness: (id: string) => number) {
    for (const [id, s] of this.abilitySlots) {
      const r = readiness(id);
      s.ring.style.setProperty('--p', `${Math.round(r * 360)}deg`);
      const ready = r >= 0.999;
      if (ready && s.el.classList.contains('cooling')) restart(s.el, 'ready-flash');
      s.el.classList.toggle('cooling', !ready);
    }
  }

  update(dt: number) {
    if (this.missionPulse > 0) {
      this.missionPulse -= dt;
      if (this.missionPulse <= 0) this.missionsEl.classList.remove('active');
    }
  }

  // ---------- feedback ----------
  toast(text: string, life = 2.2, cls = '') {
    const t = el('div', `toast ${cls}`);
    t.textContent = text;
    t.style.setProperty('--life', `${life}s`);
    this.toastWrap.appendChild(t);
    while (this.toastWrap.children.length > 3) this.toastWrap.firstChild?.remove();
    setTimeout(() => t.remove(), (life + 0.5) * 1000);
  }

  prompt(text: string | null) {
    if (text) this.promptEl.innerHTML = text;
    this.promptEl.classList.toggle('show', !!text);
  }

  fade(on: boolean) { this.fadeEl.classList.toggle('on', on); }

  flash(color = '#ffffff', strength = 0.5) {
    this.flashEl.style.background = color;
    this.flashEl.style.setProperty('--s', String(strength));
    restart(this.flashEl, 'go');
  }

  hurtFlash() {
    this.vignette.classList.add('hurt');
    setTimeout(() => this.vignette.classList.remove('hurt'), 260);
  }

  /** Big centred banner for discoveries / checkpoints / level complete. */
  banner(title: string, subtitle: string, opts: { icon?: string; life?: number; kind?: 'power' | 'checkpoint' | 'secret' | 'complete' } = {}) {
    const life = opts.life ?? 2.6;
    this.bannerEl.className = `banner ${opts.kind ?? ''}`;
    this.bannerEl.innerHTML = `
      <div class="kente-sweep"></div>
      ${opts.icon ? `<div class="b-icon">${opts.icon}</div>` : ''}
      <div class="b-title">${title}</div>
      <div class="b-sub">${subtitle}</div>`;
    this.bannerEl.style.setProperty('--life', `${life}s`);
    restart(this.bannerEl, 'show');
  }

  /** Relic card; resolves when dismissed. */
  relicCard(name: string, description: string, icon: string): Promise<void> {
    this.relicCardEl.innerHTML = `
      <div class="rc-inner">
        <div class="rc-tag">AFRO RELIC DISCOVERED</div>
        <div class="rc-icon">${icon}</div>
        <div class="rc-name">${name}</div>
        <div class="rc-desc">“${description}”</div>
        <div class="rc-next">E / CLICK — CONTINUE</div>
      </div>`;
    this.relicCardEl.classList.add('show');
    return new Promise((resolve) => {
      const done = () => {
        this.relicCardEl.classList.remove('show');
        window.removeEventListener('keydown', onKey);
        this.relicCardEl.removeEventListener('click', done);
        resolve();
      };
      const onKey = (e: KeyboardEvent) => { if (['KeyE', 'Space', 'Enter'].includes(e.code)) done(); };
      setTimeout(() => {
        window.addEventListener('keydown', onKey);
        this.relicCardEl.addEventListener('click', done);
      }, 600);
    });
  }

  setLetterbox(on: boolean, skippable = true) {
    this.root.classList.toggle('cine', on);
    this.letterbox.classList.toggle('on', on);
    this.letterbox.classList.toggle('skippable', on && skippable);
  }

  showHints(v: boolean) { this.hintsEl.classList.toggle('faded', !v); }

  reset() {
    this.toastWrap.innerHTML = '';
    this.prompt(null);
    this.bannerEl.className = 'banner';
  }
}

function restart(e: HTMLElement, cls: string) {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
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
