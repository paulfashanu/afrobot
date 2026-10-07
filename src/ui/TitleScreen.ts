import { el } from './HUD';

export class TitleScreen {
  readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, onStart: () => void) {
    this.root = el('div', 'screen show');
    this.root.innerHTML = `
      <div class="logo">AFROBOT</div>
      <div class="subtitle">LAGOS RUN</div>
      <div class="kente-bar"></div>
      <div class="title-controls">
        <div><span class="key">W A S D</span></div><div>Move</div>
        <div><span class="key">SPACE</span></div><div>Jump (press again to double-jump)</div>
        <div><span class="key">SHIFT</span></div><div>Dash</div>
        <div><span class="key">E</span></div><div>Interact</div>
        <div><span class="key">MOUSE</span></div><div>Rotate camera</div>
        <div><span class="key">ESC</span></div><div>Pause</div>
      </div>
      <div class="menu"><button class="btn start pulse">PLAY</button></div>
      <div class="small">Collect 20 Afro Cores, dodge the Bytes, power the rooftop nodes and reach THE AFRO GATE.</div>`;
    parent.appendChild(this.root);
    this.root.querySelector('.start')!.addEventListener('click', onStart);
  }

  hide() { this.root.classList.remove('show'); }
}
