// Thin debug layer: holds tunable overrides + a hidden flag for test hooks.
// No on-screen GUI by default (release-clean); expose via window flag if needed.
import type { Tuning } from '../game/types';

export class DebugTools {
  hidden = false;
  showCones = true;
  showHitboxes = false;
  constructor(public readonly tuning: Tuning) {}

  setHidden(h: boolean) {
    this.hidden = h;
  }
}
