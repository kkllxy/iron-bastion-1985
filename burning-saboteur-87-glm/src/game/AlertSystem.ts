// Alert state machine shared across all enemies in a level.
import * as THREE from 'three';
import { ALERT_LABEL, type AlertLevel, type AlertConfig } from './types';

export class AlertSystem {
  level: AlertLevel = 'hidden';
  meter = 0; // 0..1 detection meter (drives transitions)
  lastKnown = new THREE.Vector3();
  hasLastKnown = false;
  private searchTimer = 0;
  private alarmFlash = 0; // 0..1 for screen flash when entering hunted
  totalDetections = 0;

  constructor(private cfg: AlertConfig) {}

  reset(): void {
    this.level = 'hidden';
    this.meter = 0;
    this.hasLastKnown = false;
    this.searchTimer = 0;
    this.alarmFlash = 0;
  }

  // Accumulate visibility contributions this frame; dt in seconds.
  observe(maxVisibility: number, playerX: number, playerZ: number, dt: number): void {
    if (maxVisibility > 0) {
      this.meter += maxVisibility * this.cfg.spotRate * dt;
      this.lastKnown.set(playerX, 0, playerZ);
      this.hasLastKnown = true;
      if (maxVisibility > 0.35 && this.level === 'hidden') this.totalDetections++;
    } else {
      this.meter -= this.cfg.loseRate * dt;
    }
    this.meter = Math.max(0, Math.min(1, this.meter));

    if (this.level === 'hidden') {
      if (this.meter >= this.cfg.spottedThreshold) {
        this.level = 'spotted';
        this.alarmFlash = Math.max(this.alarmFlash, 0.6);
      }
    } else if (this.level === 'spotted') {
      if (this.meter >= this.cfg.huntedThreshold) {
        this.level = 'hunted';
        this.alarmFlash = 1;
      } else if (this.meter <= 0.02) {
        this.level = 'hidden';
      }
    } else if (this.level === 'hunted') {
      if (maxVisibility <= 0) {
        this.level = 'searching';
        this.searchTimer = this.cfg.searchTime;
      }
    } else if (this.level === 'searching') {
      this.searchTimer -= dt;
      if (this.meter >= this.cfg.huntedThreshold) {
        this.level = 'hunted';
        this.alarmFlash = 1;
      } else if (this.searchTimer <= 0 && this.meter <= 0.02) {
        this.level = 'hidden';
        this.hasLastKnown = false;
      }
    }
  }

  // Call hearing-based instant detection (gunfire/nearby noise) -> bumps to spotted/hunted.
  reactToNoise(playerX: number, playerZ: number): void {
    this.lastKnown.set(playerX, 0, playerZ);
    this.hasLastKnown = true;
    if (this.level === 'hidden') {
      this.level = 'spotted';
      this.meter = Math.max(this.meter, this.cfg.spottedThreshold + 0.05);
      this.alarmFlash = Math.max(this.alarmFlash, 0.6);
    } else if (this.level === 'searching') {
      this.level = 'hunted';
      this.alarmFlash = 1;
    }
  }

  update(dt: number): void {
    if (this.alarmFlash > 0) this.alarmFlash = Math.max(0, this.alarmFlash - dt * 1.6);
  }

  get flash(): number {
    return this.alarmFlash;
  }

  get label(): string {
    return ALERT_LABEL[this.level];
  }
}
