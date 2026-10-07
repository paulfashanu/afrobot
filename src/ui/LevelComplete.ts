import { el, formatTime } from './HUD';

export class LevelComplete {
  readonly root: HTMLDivElement;
  private coresEl: HTMLSpanElement;
  private timeEl: HTMLSpanElement;
  private rankEl: HTMLDivElement;

  constructor(parent: HTMLElement, onPlayAgain: () => void) {
    this.root = el('div', 'screen');
    this.root.innerHTML = `
      <div class="logo">AFROBOT</div>
      <div class="subtitle">LAGOS RUN COMPLETE</div>
      <div class="kente-bar"></div>
      <div class="rank"></div>
      <div class="stats">
        <div><span class="label">AFRO CORES:</span> <span class="c"></span></div>
        <div><span class="label">TIME:</span> <span class="t"></span></div>
      </div>
      <div class="menu"><button class="btn again pulse">PLAY AGAIN</button></div>`;
    parent.appendChild(this.root);
    this.coresEl = this.root.querySelector('.c')!;
    this.timeEl = this.root.querySelector('.t')!;
    this.rankEl = this.root.querySelector('.rank')!;
    this.root.querySelector('.again')!.addEventListener('click', onPlayAgain);
  }

  show(cores: number, total: number, seconds: number) {
    this.coresEl.textContent = `${cores} / ${total}`;
    this.timeEl.textContent = formatTime(seconds);
    this.rankEl.textContent = cores === total ? '★ ALL CORES — LEGEND OF LAGOS ★' : cores >= total * 0.75 ? '★ EKO CHAMPION ★' : '★ NICE RUN ★';
    this.root.classList.add('show');
  }

  hide() { this.root.classList.remove('show'); }
}
