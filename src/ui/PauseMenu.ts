import { el } from './HUD';

export class PauseMenu {
  readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, onResume: () => void, onRestart: () => void) {
    this.root = el('div', 'screen');
    this.root.innerHTML = `
      <div class="logo">AFROBOT</div>
      <div class="kente-bar"></div>
      <div class="menu">
        <button class="btn resume">RESUME</button>
        <button class="btn alt restart">RESTART LEVEL</button>
      </div>
      <div class="small"><span class="key">M</span> toggle music &nbsp;·&nbsp; <span class="key">N</span> mute all sound</div>`;
    parent.appendChild(this.root);
    this.root.querySelector('.resume')!.addEventListener('click', onResume);
    this.root.querySelector('.restart')!.addEventListener('click', onRestart);
  }

  show(v: boolean) { this.root.classList.toggle('show', v); }
}
