import { el } from './HUD';

export class PauseMenu {
  readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, onResume: () => void, onRestart: () => void, onMenu: () => void) {
    this.root = el('div', 'screen');
    this.root.innerHTML = `
      <div class="logo">AFROBOT</div>
      <div class="kente-bar"></div>
      <div class="menu">
        <button class="btn resume">RESUME</button>
        <button class="btn alt restart">RESTART LEVEL</button>
        <button class="btn alt quit">MAIN MENU</button>
      </div>
      <div class="small">Progress is saved automatically &nbsp;·&nbsp; <span class="key">M</span> music &nbsp;·&nbsp; <span class="key">N</span> mute</div>`;
    parent.appendChild(this.root);
    this.root.querySelector('.resume')!.addEventListener('click', onResume);
    this.root.querySelector('.restart')!.addEventListener('click', onRestart);
    this.root.querySelector('.quit')!.addEventListener('click', onMenu);
  }

  show(v: boolean) { this.root.classList.toggle('show', v); }
}
