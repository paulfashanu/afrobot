import { el } from './HUD';
import { WORLDS } from '../data/worlds';
import type { Settings } from '../systems/SaveManager';

export interface TitleCallbacks {
  onNewGame: () => void;
  onContinue: () => void;
  onSettings: (s: Settings) => void;
}

/** Title screen: NEW GAME / CONTINUE / HOW TO PLAY / SETTINGS (+ world strip). */
export class TitleScreen {
  readonly root: HTMLDivElement;
  private continueBtn: HTMLButtonElement;
  private summary: HTMLDivElement;
  private panels: Record<string, HTMLDivElement> = {};
  private confirmEl: HTMLDivElement;

  constructor(parent: HTMLElement, cb: TitleCallbacks, settings: Settings) {
    this.root = el('div', 'screen title show');
    const worlds = WORLDS.map((w) => `<div class="world ${w.available ? 'open' : 'locked'}" title="${w.tagline}"><span>${w.available ? '●' : '🔒'}</span>${w.name}</div>`).join('');
    this.root.innerHTML = `
      <div class="title-main">
        <div class="logo">AFROBOT</div>
        <div class="subtitle">LAGOS RUN</div>
        <div class="kente-bar"></div>
        <div class="menu">
          <button class="btn continue">CONTINUE</button>
          <button class="btn new">NEW GAME</button>
          <button class="btn alt how">HOW TO PLAY</button>
          <button class="btn alt settings">SETTINGS</button>
        </div>
        <div class="save-summary"></div>
        <div class="worlds">${worlds}</div>
      </div>
      <div class="panel how-panel">
        <h2>HOW TO PLAY</h2>
        <div class="title-controls">
          <div><span class="key">W A S D</span></div><div>Move (camera-relative)</div>
          <div><span class="key">SPACE</span></div><div>Jump — hold for height, press again for a double jump</div>
          <div><span class="key">SHIFT</span></div><div>Kinetic Dash <i>(find the Kinetic Core)</i></div>
          <div><span class="key">E</span> / <span class="key">Q</span></div><div>Pulse <i>(find the Pulse Core)</i> — E also talks &amp; interacts</div>
          <div><span class="key">MOUSE</span></div><div>Rotate the camera (click the game to lock the pointer)</div>
          <div><span class="key">ESC</span></div><div>Pause</div>
        </div>
        <p class="small">Collect <b>Afro Cores</b>, discover <b>Afro Relics</b> and secret areas, stomp or dash the mischievous <b>Bytes</b>, power the rooftop nodes and step through <b>THE AFRO GATE</b>.<br/>Progress saves automatically.</p>
        <button class="btn back">BACK</button>
      </div>
      <div class="panel settings-panel">
        <h2>SETTINGS</h2>
        <label class="slider">MUSIC VOLUME <input type="range" min="0" max="100" class="music" value="${Math.round(settings.music * 100)}"/><span class="v music-v"></span></label>
        <label class="slider">SOUND VOLUME <input type="range" min="0" max="100" class="sfx" value="${Math.round(settings.sfx * 100)}"/><span class="v sfx-v"></span></label>
        <button class="btn back">BACK</button>
      </div>
      <div class="confirm">
        <div class="panel-box">
          <h2>START A NEW GAME?</h2>
          <p>Your saved progress will be erased.</p>
          <div class="menu row"><button class="btn yes">YES, START FRESH</button><button class="btn alt no">CANCEL</button></div>
        </div>
      </div>`;
    parent.appendChild(this.root);
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.continueBtn = q('.continue');
    this.summary = q('.save-summary');
    this.panels.main = q('.title-main');
    this.panels.how = q('.how-panel');
    this.panels.settings = q('.settings-panel');
    this.confirmEl = q('.confirm');

    this.continueBtn.addEventListener('click', () => cb.onContinue());
    q('.new').addEventListener('click', () => {
      if (!this.continueBtn.disabled) this.confirmEl.classList.add('show');
      else cb.onNewGame();
    });
    q('.yes').addEventListener('click', () => { this.confirmEl.classList.remove('show'); cb.onNewGame(); });
    q('.no').addEventListener('click', () => this.confirmEl.classList.remove('show'));
    q('.how').addEventListener('click', () => this.show('how'));
    q('.settings').addEventListener('click', () => this.show('settings'));
    this.root.querySelectorAll('.back').forEach((b) => b.addEventListener('click', () => this.show('main')));

    const music = q<HTMLInputElement>('input.music'), sfx = q<HTMLInputElement>('input.sfx');
    const sync = () => {
      q('.music-v').textContent = music.value;
      q('.sfx-v').textContent = sfx.value;
      cb.onSettings({ music: +music.value / 100, sfx: +sfx.value / 100 });
    };
    music.addEventListener('input', sync);
    sfx.addEventListener('input', sync);
    q('.music-v').textContent = music.value;
    q('.sfx-v').textContent = sfx.value;
    this.show('main');
  }

  private show(name: string) {
    for (const [k, p] of Object.entries(this.panels)) p.classList.toggle('active', k === name);
  }

  /** Refresh CONTINUE availability + save summary. */
  refresh(hasSave: boolean, summary: string) {
    this.continueBtn.disabled = !hasSave;
    this.continueBtn.style.display = hasSave ? '' : 'none';
    this.summary.textContent = hasSave ? summary : '';
    const newBtn = this.root.querySelector('.new') as HTMLButtonElement;
    newBtn.classList.toggle('alt', hasSave);
    newBtn.classList.toggle('pulse', !hasSave);
    this.continueBtn.classList.toggle('pulse', hasSave);
  }

  show_() { this.root.classList.add('show'); this.show('main'); }
  hide() { this.root.classList.remove('show'); }
  get visible() { return this.root.classList.contains('show'); }
}
