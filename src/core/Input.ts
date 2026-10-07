/** Keyboard + mouse input with per-frame "pressed" edges and pointer-lock look. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  private dragging = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());

    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    canvas.addEventListener('mousedown', () => { this.dragging = true; });
    window.addEventListener('mouseup', () => { this.dragging = false; });
  }

  get locked() { return document.pointerLockElement === this.canvas; }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => { /* drag-to-look still works */ });
    } catch { /* ignore */ }
  }

  exitLock() {
    if (this.locked) document.exitPointerLock();
  }

  isDown(code: string) { return this.down.has(code); }
  wasPressed(code: string) { return this.pressed.has(code); }
  wasReleased(code: string) { return this.released.has(code); }

  /** x = right, y = forward. Length ≤ 1. */
  moveAxis(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) y += 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) y -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) x += 1;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  get jumpPressed() { return this.wasPressed('Space'); }
  get jumpHeld() { return this.isDown('Space'); }
  get dashPressed() { return this.wasPressed('ShiftLeft') || this.wasPressed('ShiftRight'); }
  get interactPressed() { return this.wasPressed('KeyE'); }

  /** Call once at the end of every frame. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  clear() {
    this.down.clear();
    this.endFrame();
  }
}
