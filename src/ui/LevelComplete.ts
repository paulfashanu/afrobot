import { el, formatTime } from './HUD';

export interface CompleteStats {
  cores: number; totalCores: number;
  relics: number; totalRelics: number;
  secrets: number; totalSecrets: number;
  time: number; best: number | null; newRecord: boolean;
}

/** LEVEL COMPLETE screen with staggered stat reveal. */
export class LevelComplete {
  readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, onPlayAgain: () => void, onMenu: () => void) {
    this.root = el('div', 'screen complete');
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.again')) onPlayAgain();
      if (t.closest('.menu-btn')) onMenu();
    });
  }

  show(s: CompleteStats) {
    const rank = s.cores === s.totalCores && s.relics === s.totalRelics ? '★ LEGEND OF LAGOS ★'
      : s.cores >= s.totalCores * 0.7 ? '★ EKO CHAMPION ★' : '★ NICE RUN ★';
    this.root.innerHTML = `
      <div class="logo small-logo">AFROBOT</div>
      <div class="subtitle">LEVEL COMPLETE</div>
      <div class="kente-bar"></div>
      <div class="rank">${rank}</div>
      <div class="stats">
        <div style="--d:0.2s"><span class="label">AFRO CORES</span><span>${s.cores} / ${s.totalCores}</span></div>
        <div style="--d:0.35s"><span class="label">AFRO RELICS</span><span>${s.relics} / ${s.totalRelics}</span></div>
        <div style="--d:0.5s"><span class="label">SECRETS</span><span>${s.secrets} / ${s.totalSecrets}</span></div>
        <div style="--d:0.65s"><span class="label">TIME</span><span>${formatTime(s.time)}</span></div>
        <div style="--d:0.8s"><span class="label">BEST TIME</span><span>${s.best !== null ? formatTime(s.best) : '--:--'}${s.newRecord ? ' <em class="record">NEW RECORD!</em>' : ''}</span></div>
      </div>
      <div class="menu row"><button class="btn again pulse">PLAY AGAIN</button><button class="btn alt menu-btn">MAIN MENU</button></div>`;
    this.root.classList.add('show');
  }

  hide() { this.root.classList.remove('show'); }
}
