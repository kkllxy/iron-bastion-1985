import * as THREE from 'three';
import { Dir } from '../game/config';

// Tank-style input: 4-directional movement (axis-dominant), hold-to-fire,
// pause toggle, and confirm (start/restart). Desktop keyboard + touch stick.
export class InputController {
  private readonly keys = new Set<string>();
  private readonly moveStack: string[] = []; // most-recently-pressed first
  private readonly stickVector = new THREE.Vector2();
  private stickActive = false;
  private fireDown = false;
  private fireTouch = false;
  private pauseQueued = false;
  private confirmQueued = false;

  constructor(
    private readonly stick: HTMLElement | null,
    private readonly knob: HTMLElement | null,
    private readonly fireButton: HTMLElement | null,
    private readonly pauseButton: HTMLElement | null,
    private readonly confirmButton: HTMLElement | null,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    if (stick) {
      stick.addEventListener('pointerdown', this.onStickDown);
      stick.addEventListener('pointermove', this.onStickMove);
      stick.addEventListener('pointerup', this.onStickUp);
      stick.addEventListener('pointercancel', this.onStickUp);
    }
    if (fireButton) {
      fireButton.addEventListener('pointerdown', this.onFireDown);
      fireButton.addEventListener('pointerup', this.onFireUp);
      fireButton.addEventListener('pointercancel', this.onFireUp);
      fireButton.addEventListener('pointerleave', this.onFireUp);
    }
    if (pauseButton) pauseButton.addEventListener('pointerdown', this.onPauseDown);
    if (confirmButton) confirmButton.addEventListener('pointerdown', this.onConfirmDown);
  }

  // Desired movement direction this frame, or null when idle. The last pressed
  // movement key wins; touch stick overrides when active.
  moveDir(): Dir | null {
    if (this.stickActive && this.stickVector.lengthSq() > 0.12) {
      const x = this.stickVector.x;
      const y = this.stickVector.y;
      if (Math.abs(x) > Math.abs(y)) return x > 0 ? Dir.E : Dir.W;
      return y > 0 ? Dir.S : Dir.N;
    }
    const code = this.moveStack[0];
    if (!code) return null;
    return KEY_DIR[code] ?? null;
  }

  fireHeld(): boolean {
    return this.fireDown || this.fireTouch;
  }

  consumePause(): boolean {
    const v = this.pauseQueued;
    this.pauseQueued = false;
    return v;
  }

  consumeConfirm(): boolean {
    const v = this.confirmQueued;
    this.confirmQueued = false;
    return v;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    if (this.stick) {
      this.stick.removeEventListener('pointerdown', this.onStickDown);
      this.stick.removeEventListener('pointermove', this.onStickMove);
      this.stick.removeEventListener('pointerup', this.onStickUp);
      this.stick.removeEventListener('pointercancel', this.onStickUp);
    }
    if (this.fireButton) {
      this.fireButton.removeEventListener('pointerdown', this.onFireDown);
      this.fireButton.removeEventListener('pointerup', this.onFireUp);
      this.fireButton.removeEventListener('pointercancel', this.onFireUp);
      this.fireButton.removeEventListener('pointerleave', this.onFireUp);
    }
    if (this.pauseButton) this.pauseButton.removeEventListener('pointerdown', this.onPauseDown);
    if (this.confirmButton) this.confirmButton.removeEventListener('pointerdown', this.onConfirmDown);
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const code = event.code;
    if (KEY_DIR[code] !== undefined) {
      event.preventDefault();
      this.keys.add(code);
      const i = this.moveStack.indexOf(code);
      if (i >= 0) this.moveStack.splice(i, 1);
      this.moveStack.unshift(code);
    } else if (code === 'Space') {
      event.preventDefault();
      this.fireDown = true;
    } else if (code === 'KeyP' || code === 'Escape') {
      this.pauseQueued = true;
    } else if (code === 'Enter') {
      this.confirmQueued = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    const code = event.code;
    if (KEY_DIR[code] !== undefined) {
      this.keys.delete(code);
      const i = this.moveStack.indexOf(code);
      if (i >= 0) this.moveStack.splice(i, 1);
    } else if (code === 'Space') {
      this.fireDown = false;
    }
  };

  private readonly onBlur = () => {
    this.keys.clear();
    this.moveStack.length = 0;
    this.fireDown = false;
    this.stickActive = false;
    this.stickVector.set(0, 0);
    this.updateKnob();
  };

  private stickCenter = { x: 0, y: 0, r: 1 };
  private readonly onStickDown = (event: PointerEvent) => {
    event.preventDefault();
    const rect = this.stick!.getBoundingClientRect();
    this.stickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      r: rect.width * 0.42,
    };
    this.stickActive = true;
    try {
      this.stick!.setPointerCapture(event.pointerId);
    } catch {
      // synthetic events in tests may not be capturable
    }
    this.updateStick(event.clientX, event.clientY);
  };
  private readonly onStickMove = (event: PointerEvent) => {
    if (!this.stickActive) return;
    event.preventDefault();
    this.updateStick(event.clientX, event.clientY);
  };
  private readonly onStickUp = (event: PointerEvent) => {
    event.preventDefault();
    this.stickActive = false;
    this.stickVector.set(0, 0);
    this.updateKnob();
  };

  private updateStick(clientX: number, clientY: number): void {
    const dx = (clientX - this.stickCenter.x) / this.stickCenter.r;
    const dy = (clientY - this.stickCenter.y) / this.stickCenter.r;
    this.stickVector.set(dx, dy);
    if (this.stickVector.lengthSq() > 1) this.stickVector.normalize();
    this.updateKnob();
  }

  private updateKnob(): void {
    if (!this.knob) return;
    const d = 36;
    this.knob.style.transform = `translate(calc(-50% + ${this.stickVector.x * d}px), calc(-50% + ${this.stickVector.y * d}px))`;
  }

  private readonly onFireDown = (event: PointerEvent) => {
    event.preventDefault();
    this.fireTouch = true;
  };
  private readonly onFireUp = (event: PointerEvent) => {
    event.preventDefault();
    this.fireTouch = false;
  };
  private readonly onPauseDown = (event: PointerEvent) => {
    event.preventDefault();
    this.pauseQueued = true;
  };
  private readonly onConfirmDown = (event: PointerEvent) => {
    event.preventDefault();
    this.confirmQueued = true;
  };
}

const KEY_DIR: Record<string, Dir> = {
  KeyW: Dir.N,
  ArrowUp: Dir.N,
  KeyS: Dir.S,
  ArrowDown: Dir.S,
  KeyA: Dir.W,
  ArrowLeft: Dir.W,
  KeyD: Dir.E,
  ArrowRight: Dir.E,
};
