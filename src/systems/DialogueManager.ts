import type { Line } from '../data/dialogue';

/**
 * Shows short dialogue in a speech box with a typewriter effect.
 * E / SPACE / click advances. No branching yet — sequences of lines.
 */
export class DialogueManager {
  private root: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private lines: Line[] = [];
  private index = 0;
  private shown = 0;
  private onDone: (() => void) | null = null;
  private blip: () => void;
  active = false;

  constructor(parent: HTMLElement, blip: () => void) {
    this.blip = blip;
    this.root = document.createElement('div');
    this.root.className = 'dialogue';
    this.root.innerHTML = `<div class="dlg-name"></div><div class="dlg-text"></div><div class="dlg-next">E ▸</div>`;
    parent.appendChild(this.root);
    this.nameEl = this.root.querySelector('.dlg-name')!;
    this.textEl = this.root.querySelector('.dlg-text')!;
    this.root.addEventListener('click', () => this.advance());
  }

  start(lines: Line[], onDone?: () => void) {
    if (!lines.length) return;
    this.lines = lines;
    this.index = 0;
    this.onDone = onDone ?? null;
    this.active = true;
    this.root.classList.add('show');
    this.showLine();
  }

  private showLine() {
    const l = this.lines[this.index];
    this.nameEl.textContent = l.speaker;
    this.root.dataset.speaker = l.speaker === 'AFROBOT' ? 'self' : l.speaker.includes('TRANSMISSION') || l.speaker.includes('ARCHIVE') ? 'signal' : 'npc';
    this.shown = 0;
    this.textEl.textContent = '';
  }

  /** Advance: finish typing, or go to the next line, or close. */
  advance() {
    if (!this.active) return;
    const l = this.lines[this.index];
    if (this.shown < l.text.length) { this.shown = l.text.length; this.textEl.textContent = l.text; return; }
    this.index++;
    if (this.index >= this.lines.length) this.close();
    else this.showLine();
  }

  close() {
    this.active = false;
    this.root.classList.remove('show');
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  update(dt: number) {
    if (!this.active) return;
    const l = this.lines[this.index];
    if (this.shown < l.text.length) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(l.text.length, this.shown + dt * 42);
      if (Math.floor(this.shown) !== before) {
        this.textEl.textContent = l.text.slice(0, Math.floor(this.shown));
        if (Math.floor(this.shown) % 3 === 0 && l.text[Math.floor(this.shown) - 1] !== ' ') this.blip();
      }
    }
  }
}
