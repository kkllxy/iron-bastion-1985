import * as THREE from 'three';

export type ModalKind = 'title' | 'paused' | 'level-clear' | 'game-over' | 'win';

export interface HudState {
  hp: number;
  maxHp: number;
  lives: number;
  score: number;
  rage: number;
  maxRage: number;
  xp: number;
  xpNext: number;
  level: number;
  levelIndex: number;
  levelCount: number;
  levelName: string;
  zoneProgress: number; // 0..1 through current level
  combo: number;
  hasWeapon: boolean;
}

interface FloatNum {
  el: HTMLElement;
  worldX: number;
  worldY: number;
  worldZ: number;
  life: number;
  ttl: number;
}

export class Hud {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly hpFill = this.el('#hp-fill');
  private readonly hpText = this.el('#hp-text');
  private readonly lifePips = this.el('#life-pips');
  private readonly scoreValue = this.el('#score-value');
  private readonly rageFill = this.el('#rage-fill');
  private readonly rageText = this.el('#rage-text');
  private readonly xpFill = this.el('#xp-fill');
  private readonly levelValue = this.el('#level-value');
  private readonly zoneFill = this.el('#zone-fill');
  private readonly zoneText = this.el('#zone-text');
  private readonly levelName = this.el('#level-name');
  private readonly combo = this.el('#combo');
  private readonly bossBar = this.el('#boss-bar');
  private readonly bossName = this.el('#boss-name');
  private readonly bossFill = this.el('#boss-fill');
  private readonly statusLine = this.el('#status-line');
  private readonly statusIcon = this.el('#status-icon');
  private readonly modal = this.el('#game-modal');
  private readonly modalEyebrow = this.el('#modal-eyebrow');
  private readonly modalTitle = this.el('#modal-title');
  private readonly modalCopy = this.el('#modal-copy');
  private readonly modalAction = this.el('#modal-action');
  private readonly modalHint = this.el('#modal-hint');
  private readonly flashOverlay = this.el('#flash-overlay');
  private readonly hitLayer = this.el('#hit-layer');
  private readonly weaponChip = this.el('#weapon-chip');

  private readonly floats: FloatNum[] = [];
  private readonly projector = new THREE.Vector3();
  private onAction: (kind: ModalKind) => void = () => {};

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.modalAction.addEventListener('click', () => {
      this.onAction(this.currentKind);
    });
  }

  setActionHandler(handler: (kind: ModalKind) => void): void {
    this.onAction = handler;
  }

  private currentKind: ModalKind = 'title';

  private el(selector: string): HTMLElement {
    const e = document.querySelector<HTMLElement>(selector);
    if (!e) throw new Error(`Missing HUD element: ${selector}`);
    return e;
  }

  update(s: HudState, delta: number): void {
    const hpFrac = Math.max(0, Math.min(1, s.hp / s.maxHp));
    this.hpFill.style.width = `${hpFrac * 100}%`;
    this.hpText.textContent = `${Math.ceil(s.hp)}`;
    this.scoreValue.textContent = s.score.toString().padStart(6, '0');
    this.rageFill.style.width = `${(s.rage / s.maxRage) * 100}%`;
    this.rageText.textContent = s.rage >= s.maxRage * 0.5 ? 'READY' : `${Math.floor((s.rage / s.maxRage) * 100)}%`;
    this.xpFill.style.width = `${(s.xp / Math.max(1, s.xpNext)) * 100}%`;
    this.levelValue.textContent = `LV.${s.level}`;
    this.zoneFill.style.width = `${Math.max(0, Math.min(1, s.zoneProgress)) * 100}%`;
    this.zoneText.textContent = `ZONE ${s.levelIndex}/${s.levelCount}`;
    this.levelName.textContent = s.levelName;
    this.weaponChip.classList.toggle('active', s.hasWeapon);

    // lives pips
    const pips = this.lifePips.children;
    for (let i = 0; i < pips.length; i += 1) {
      pips[i].classList.toggle('off', i >= s.lives);
    }

    if (s.combo >= 2) {
      this.combo.textContent = `${s.combo} HIT`;
      this.combo.classList.add('show');
    } else {
      this.combo.classList.remove('show');
    }

    // floating numbers
    for (let i = this.floats.length - 1; i >= 0; i -= 1) {
      const f = this.floats[i];
      f.life -= delta;
      this.project(f, 1 - f.life / f.ttl);
      if (f.life <= 0) {
        f.el.remove();
        this.floats.splice(i, 1);
      }
    }
  }

  setLivesPipCount(count: number): void {
    this.lifePips.innerHTML = '';
    for (let i = 0; i < count; i += 1) {
      const pip = document.createElement('i');
      this.lifePips.appendChild(pip);
    }
  }

  pulseScore(): void {
    this.scoreValue.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 130, easing: 'ease-out' });
  }

  showCombo(): void {
    this.combo.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 110, easing: 'ease-out' });
  }

  setStatus(text: string, icon = '◆'): void {
    this.statusLine.textContent = text;
    this.statusIcon.textContent = icon;
  }

  showBoss(name: string): void {
    this.bossName.textContent = name;
    this.bossBar.classList.add('show');
  }

  hideBoss(): void {
    this.bossBar.classList.remove('show');
  }

  updateBoss(hpFrac: number): void {
    this.bossFill.style.width = `${Math.max(0, Math.min(1, hpFrac)) * 100}%`;
  }

  spawnHitNumber(world: THREE.Vector3, amount: number, crit: boolean): void {
    const el = document.createElement('div');
    el.className = crit ? 'hit-num crit' : 'hit-num';
    el.textContent = crit ? `${amount}!` : `${amount}`;
    this.hitLayer.appendChild(el);
    if (this.floats.length > 28) {
      const old = this.floats.shift();
      old?.el.remove();
    }
    this.floats.push({ el, worldX: world.x, worldY: world.y, worldZ: world.z, life: 0.7, ttl: 0.7 });
  }

  private project(f: FloatNum, t: number): void {
    this.projector.set(f.worldX, f.worldY, f.worldZ).project(this.camera);
    const x = (this.projector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.projector.y * 0.5 + 0.5) * window.innerHeight;
    f.el.style.transform = `translate(-50%,-50%) translate(${x}px, ${y - t * 46}px)`;
    f.el.style.opacity = `${1 - t}`;
  }

  flash(strength: number): void {
    this.flashOverlay.style.opacity = String(strength);
    this.flashOverlay.animate([{ opacity: strength }, { opacity: 0 }], { duration: 120, easing: 'ease-out' });
  }

  showModal(kind: ModalKind, opts: { eyebrow?: string; title: string; copy: string; action: string; hint?: string } ): void {
    this.currentKind = kind;
    this.modalEyebrow.textContent = opts.eyebrow ?? '';
    this.modalTitle.textContent = opts.title;
    this.modalCopy.textContent = opts.copy;
    this.modalAction.textContent = opts.action;
    this.modalHint.textContent = opts.hint ?? '';
    this.modal.classList.remove('is-hidden');
    this.modalAction.focus();
  }

  hideModal(): void {
    this.modal.classList.add('is-hidden');
  }

  get modalVisible(): boolean {
    return !this.modal.classList.contains('is-hidden');
  }
}
