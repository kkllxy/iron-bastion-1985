import * as THREE from 'three';

type Action = 'fire' | 'interact' | 'swap' | 'box' | 'pause' | 'confirm';

interface StickState {
  active: boolean;
  id: number | null;
  centerX: number;
  centerY: number;
  radius: number;
}

// Stealth action game input: WASD/arrows + J/X fire, Shift/Ctrl stealth,
// E/Space interact, Q/Tab swap, F/B box, P/Esc pause, Enter confirm.
// Touch: virtual stick + five action buttons.
export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer = new THREE.Vector2();
  private readonly keyVector = new THREE.Vector2();
  private readonly stickState: StickState = { active: false, id: null, centerX: 0, centerY: 0, radius: 1 };
  private readonly edgeQueue = new Set<Action>();
  private stealthHeld = false;
  private fireHeld = false;

  constructor(
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
    buttons: Record<Action, HTMLElement | null>,
    stealthButton: HTMLElement | null,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.stick.addEventListener('pointerdown', this.onStickDown);
    this.stick.addEventListener('pointermove', this.onStickMove);
    this.stick.addEventListener('pointerup', this.onStickUp);
    this.stick.addEventListener('pointercancel', this.onStickUp);
    this.bindButton('fire', buttons.fire, true);
    this.bindButton('interact', buttons.interact);
    this.bindButton('swap', buttons.swap);
    this.bindButton('box', buttons.box);
    this.bindButton('pause', buttons.pause);
    this.bindButton('confirm', buttons.confirm);
    // Mobile stealth toggle (hold-style: press = sneak on, release = off).
    if (stealthButton) {
      const on = (e: Event) => {
        e.preventDefault();
        this.stealthHeld = true;
      };
      const off = (e: Event) => {
        e.preventDefault();
        this.stealthHeld = false;
      };
      stealthButton.addEventListener('pointerdown', on);
      stealthButton.addEventListener('pointerup', off);
      stealthButton.addEventListener('pointercancel', off);
      stealthButton.addEventListener('pointerleave', off);
    }
  }

  private bindButton(action: Action, el: HTMLElement | null, hold = false) {
    if (!el) return;
    if (hold) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (action === 'fire') {
          this.fireHeld = true;
          this.edgeQueue.add('fire');
        }
      });
      const release = (e: PointerEvent) => {
        e.preventDefault();
        if (action === 'fire') this.fireHeld = false;
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    } else {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.edgeQueue.add(action);
      });
    }
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    const c = e.code;
    if (
      c === 'Space' ||
      c === 'Tab' ||
      c === 'ArrowUp' ||
      c === 'ArrowDown' ||
      c === 'ArrowLeft' ||
      c === 'ArrowRight'
    ) {
      e.preventDefault();
    }
    if (e.repeat) {
      // held movement handled via keys set below
    }
    this.keys.add(c);
    if (c === 'ShiftLeft' || c === 'ShiftRight' || c === 'ControlLeft' || c === 'ControlRight') this.stealthHeld = true;
    if (c === 'KeyJ' || c === 'KeyX') {
      this.fireHeld = true;
      this.edgeQueue.add('fire');
    }
    if (c === 'KeyE' || c === 'Space') this.edgeQueue.add('interact');
    if (c === 'KeyQ' || c === 'Tab') this.edgeQueue.add('swap');
    if (c === 'KeyF' || c === 'KeyB') this.edgeQueue.add('box');
    if (c === 'KeyP' || c === 'Escape') this.edgeQueue.add('pause');
    if (c === 'Enter') this.edgeQueue.add('confirm');
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    const c = e.code;
    this.keys.delete(c);
    if (c === 'ShiftLeft' || c === 'ShiftRight' || c === 'ControlLeft' || c === 'ControlRight') this.stealthHeld = false;
    if (c === 'KeyJ' || c === 'KeyX') this.fireHeld = false;
  };

  private readonly onBlur = () => {
    this.keys.clear();
    this.stealthHeld = false;
    this.fireHeld = false;
    this.stickState.active = false;
    this.stickState.id = null;
    this.pointer.set(0, 0);
    this.updateKnob();
  };

  private readonly onStickDown = (e: PointerEvent) => {
    e.preventDefault();
    const rect = this.stick.getBoundingClientRect();
    this.stickState.active = true;
    this.stickState.id = e.pointerId;
    this.stickState.centerX = rect.left + rect.width / 2;
    this.stickState.centerY = rect.top + rect.height / 2;
    this.stickState.radius = rect.width * 0.42;
    try {
      this.stick.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events
    }
    this.updateStick(e.clientX, e.clientY);
  };

  private readonly onStickMove = (e: PointerEvent) => {
    if (!this.stickState.active || e.pointerId !== this.stickState.id) return;
    e.preventDefault();
    this.updateStick(e.clientX, e.clientY);
  };

  private readonly onStickUp = (e: PointerEvent) => {
    if (e.pointerId !== this.stickState.id) return;
    e.preventDefault();
    this.stickState.active = false;
    this.stickState.id = null;
    this.pointer.set(0, 0);
    this.updateKnob();
  };

  private updateStick(clientX: number, clientY: number) {
    const dx = clientX - this.stickState.centerX;
    const dy = clientY - this.stickState.centerY;
    this.pointer.set(dx / this.stickState.radius, dy / this.stickState.radius);
    if (this.pointer.lengthSq() > 1) this.pointer.normalize();
    this.updateKnob();
  }

  private updateKnob() {
    const distance = 36;
    this.knob.style.transform = `translate(calc(-50% + ${this.pointer.x * distance}px), calc(-50% + ${this.pointer.y * distance}px))`;
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

  isStealthHeld(): boolean {
    return this.stealthHeld;
  }

  isFireHeld(): boolean {
    return this.fireHeld;
  }

  // Returns and clears edge-triggered actions for this frame.
  consumeEdges(): Record<Action, boolean> {
    const out = {
      fire: this.edgeQueue.has('fire'),
      interact: this.edgeQueue.has('interact'),
      swap: this.edgeQueue.has('swap'),
      box: this.edgeQueue.has('box'),
      pause: this.edgeQueue.has('pause'),
      confirm: this.edgeQueue.has('confirm'),
    };
    this.edgeQueue.clear();
    return out;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
