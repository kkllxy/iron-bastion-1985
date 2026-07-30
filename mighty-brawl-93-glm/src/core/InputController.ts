import * as THREE from 'three';

type PointerState = {
  active: boolean;
  id: number | null;
  centerX: number;
  centerY: number;
  radius: number;
};

// One "Action" binds keyboard codes + an optional touch button. Activating it
// (keydown non-repeat, or pointerdown on the button) latches a pending flag the
// game consumes once per press — so combos and specials never auto-fire while
// a key is held.
class Action {
  pending = false;

  constructor(
    private readonly codes: ReadonlySet<string>,
    button: HTMLElement | null,
  ) {
    if (button) {
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.pending = true;
      });
      button.addEventListener('pointerup', (e) => e.preventDefault());
      button.addEventListener('pointerleave', (e) => e.preventDefault());
      button.addEventListener('pointercancel', (e) => e.preventDefault());
    }
  }

  onKeyDown(code: string, repeat: boolean): void {
    if (!repeat && this.codes.has(code)) this.pending = true;
  }

  consume(): boolean {
    if (this.pending) {
      this.pending = false;
      return true;
    }
    return false;
  }
}

export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer = new THREE.Vector2();
  private readonly keyVector = new THREE.Vector2();
  private readonly pointerState: PointerState = { active: false, id: null, centerX: 0, centerY: 0, radius: 1 };

  private readonly attack: Action;
  private readonly jump: Action;
  private readonly special: Action;
  private readonly grab: Action;
  private pausePending = false;
  private startPending = false;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (!e.repeat) this.pausePending = true;
    }
    if (e.code === 'Enter') {
      if (!e.repeat) this.startPending = true;
    }
    this.attack.onKeyDown(e.code, e.repeat);
    this.jump.onKeyDown(e.code, e.repeat);
    this.special.onKeyDown(e.code, e.repeat);
    this.grab.onKeyDown(e.code, e.repeat);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private readonly onStickDown = (e: PointerEvent) => {
    e.preventDefault();
    const rect = this.stick.getBoundingClientRect();
    this.pointerState.active = true;
    this.pointerState.id = e.pointerId;
    this.pointerState.centerX = rect.left + rect.width / 2;
    this.pointerState.centerY = rect.top + rect.height / 2;
    this.pointerState.radius = rect.width * 0.42;
    try {
      this.stick.setPointerCapture(e.pointerId);
    } catch {
      // synthetic test events have no capturable pointer id
    }
    this.updatePointer(e.clientX, e.clientY);
  };
  private readonly onStickMove = (e: PointerEvent) => {
    if (!this.pointerState.active || e.pointerId !== this.pointerState.id) return;
    e.preventDefault();
    this.updatePointer(e.clientX, e.clientY);
  };
  private readonly onStickUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerState.id) return;
    e.preventDefault();
    this.pointerState.active = false;
    this.pointerState.id = null;
    this.pointer.set(0, 0);
    this.updateKnob();
  };

  constructor(
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
    attackBtn: HTMLElement,
    jumpBtn: HTMLElement,
    specialBtn: HTMLElement,
    grabBtn: HTMLElement,
  ) {
    this.attack = new Action(new Set(['KeyJ', 'KeyX']), attackBtn);
    this.jump = new Action(new Set(['KeyK', 'KeyC']), jumpBtn);
    this.special = new Action(new Set(['KeyL', 'KeyV']), specialBtn);
    this.grab = new Action(new Set(['KeyE', 'Space']), grabBtn);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.stick.addEventListener('pointerdown', this.onStickDown);
    this.stick.addEventListener('pointermove', this.onStickMove);
    this.stick.addEventListener('pointerup', this.onStickUp);
    this.stick.addEventListener('pointercancel', this.onStickUp);
  }

  readMovement(target: THREE.Vector2): THREE.Vector2 {
    this.keyVector.set(0, 0);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.keyVector.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.keyVector.x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.keyVector.y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.keyVector.y += 1;
    target.copy(this.keyVector).add(this.pointer);
    if (target.lengthSq() > 1) target.normalize();
    return target;
  }

  consumeAttack(): boolean {
    return this.attack.consume();
  }
  consumeJump(): boolean {
    return this.jump.consume();
  }
  consumeSpecial(): boolean {
    return this.special.consume();
  }
  consumeGrab(): boolean {
    return this.grab.consume();
  }
  consumePause(): boolean {
    if (this.pausePending) {
      this.pausePending = false;
      return true;
    }
    return false;
  }
  consumeStart(): boolean {
    if (this.startPending) {
      this.startPending = false;
      return true;
    }
    return false;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.stick.removeEventListener('pointerdown', this.onStickDown);
    this.stick.removeEventListener('pointermove', this.onStickMove);
    this.stick.removeEventListener('pointerup', this.onStickUp);
    this.stick.removeEventListener('pointercancel', this.onStickUp);
  }

  private updatePointer(clientX: number, clientY: number): void {
    const dx = clientX - this.pointerState.centerX;
    const dy = clientY - this.pointerState.centerY;
    this.pointer.set(dx / this.pointerState.radius, dy / this.pointerState.radius);
    if (this.pointer.lengthSq() > 1) this.pointer.normalize();
    this.updateKnob();
  }

  private updateKnob(): void {
    const distance = 38;
    this.knob.style.transform = `translate(calc(-50% + ${this.pointer.x * distance}px), calc(-50% + ${this.pointer.y * distance}px))`;
  }
}
