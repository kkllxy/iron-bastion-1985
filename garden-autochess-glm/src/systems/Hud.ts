import * as THREE from 'three';
import type { ModalKind, ModalOptions, MutationOption, PlantId, RewardKind } from '../game/types';

// 植物 → emoji（商店/备战台/幽灵用）。避开《植物大战僵尸》受保护形象，用通用符号。
export const PLANT_EMOJI: Record<PlantId, string> = {
  sunflower: '🌻',
  peashooter: '🫛',
  firepepper: '🌶️',
  icemoss: '🧊',
  nutwall: '🥜',
  vine: '🌿',
  toadstool: '🍄',
  sporeshroom: '🫧',
  aloezap: '⚡',
  onionpult: '🧅',
  steamdande: '🌼',
  sunpumpkin: '🎃',
};

export const DAMAGE_COLOR: Record<string, string> = {
  phys: '#cfe8a0',
  fire: '#ff7a3a',
  ice: '#6ad0ff',
  poison: '#b6e83a',
  elec: '#ffe24a',
  none: '#cfe8a0',
};

export interface ShopSlotView {
  id: PlantId | null;
  name: string;
  cost: number;
  emoji: string;
  desc: string;
}

export interface BenchSlotView {
  uid: number;
  plantId: PlantId;
  name: string;
  emoji: string;
  star: number;
  mutationId?: string;
  mergeable: boolean;
  graftable: boolean;
}

export interface RewardCardView {
  kind: RewardKind;
  icon: string;
  name: string;
  desc: string;
  payload: unknown;
}

interface FloatNum {
  el: HTMLElement;
  worldX: number;
  worldY: number;
  worldZ: number;
  life: number;
  ttl: number;
  color: string;
}

export class Hud {
  readonly shop: HTMLElement;
  readonly bench: HTMLElement;
  readonly prepPanel: HTMLElement;
  readonly dragGhost: HTMLElement;
  readonly rewardCards: HTMLElement;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly sunValue = this.el('#sun-value');
  private readonly hpFill = this.el('#hp-fill');
  private readonly hpText = this.el('#hp-text');
  private readonly waveText = this.el('#wave-text');
  private readonly waveFill = this.el('#wave-fill');
  private readonly scoreValue = this.el('#score-value');
  private readonly relicRow = this.el('#relic-row');
  private readonly statusLine = this.el('#status-line');
  private readonly statusText = this.el('#status-text');
  private readonly statusIcon = this.el('#status-icon');
  private readonly modal = this.el('#game-modal');
  private readonly modalEyebrow = this.el('#modal-eyebrow');
  private readonly modalTitle = this.el('#modal-title');
  private readonly modalCopy = this.el('#modal-copy');
  private readonly modalAction = this.el('#modal-action');
  private readonly modalHint = this.el('#modal-hint');
  private readonly mutationPicker = this.el('#mutation-picker');
  private readonly mutOptions = this.el('#mut-options');
  private readonly flashOverlay = this.el('#flash-overlay');
  private readonly hitLayer = this.el('#hit-layer');
  private readonly bossBar = this.el('#boss-bar');
  private readonly bossName = this.el('#boss-name');
  private readonly bossFill = this.el('#boss-fill');

  private readonly floats: FloatNum[] = [];
  private readonly projector = new THREE.Vector3();
  private statusTimer = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.shop = this.el('#shop');
    this.bench = this.el('#bench');
    this.prepPanel = this.el('#prep-panel');
    this.dragGhost = this.el('#drag-ghost');
    this.rewardCards = this.el('#reward-cards');
  }

  private el(selector: string): HTMLElement {
    const e = document.querySelector<HTMLElement>(selector);
    if (!e) throw new Error(`Missing HUD element: ${selector}`);
    return e;
  }

  // --- 顶部 HUD ---
  updateSun(value: number): void {
    this.sunValue.textContent = `${Math.floor(value)}`;
  }
  updateHp(hp: number, max: number): void {
    const frac = Math.max(0, Math.min(1, hp / max));
    this.hpFill.style.width = `${frac * 100}%`;
    this.hpText.textContent = `${Math.ceil(hp)} / ${Math.ceil(max)}`;
  }
  updateWave(wave: number, total: number, progress: number): void {
    this.waveText.textContent = `${wave} / ${total}`;
    this.waveFill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  }
  updateScore(score: number): void {
    this.scoreValue.textContent = score.toString().padStart(6, '0');
  }
  pulseScore(): void {
    this.scoreValue.animate([{ transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 130, easing: 'ease-out' });
  }
  updateRelics(icons: string[]): void {
    this.relicRow.innerHTML = '';
    for (const icon of icons) {
      const c = document.createElement('div');
      c.className = 'relic-chip';
      c.textContent = icon;
      this.relicRow.appendChild(c);
    }
  }

  // --- BOSS ---
  showBoss(name: string): void {
    this.bossName.textContent = name;
    this.bossBar.style.display = 'flex';
  }
  hideBoss(): void {
    this.bossBar.style.display = 'none';
  }
  updateBoss(frac: number): void {
    this.bossFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  // --- 状态条 ---
  setStatus(text: string, icon = '◆', seconds = 2.4): void {
    this.statusText.textContent = text;
    this.statusIcon.textContent = icon;
    this.statusLine.classList.add('show');
    this.statusTimer = seconds;
  }
  tickStatus(delta: number): void {
    if (this.statusTimer > 0) {
      this.statusTimer -= delta;
      if (this.statusTimer <= 0) this.statusLine.classList.remove('show');
    }
  }

  // --- 备战面板 ---
  showPrep(show: boolean): void {
    this.prepPanel.classList.toggle('hidden', !show);
  }

  refreshShop(slots: ShopSlotView[], canAfford: (cost: number) => boolean): void {
    this.shop.innerHTML = '';
    for (const slot of slots) {
      const div = document.createElement('div');
      div.className = 'shop-slot';
      if (!slot.id) {
        div.classList.add('empty');
        div.innerHTML = `<div class="shop-emoji">·</div><div class="shop-name">空</div>`;
      } else {
        if (!canAfford(slot.cost)) div.classList.add('cant');
        div.dataset.plant = slot.id;
        div.title = slot.desc;
        div.innerHTML = `
          <div class="shop-emoji">${slot.emoji}</div>
          <div class="shop-name">${slot.name}</div>
          <div class="shop-cost">${slot.cost}</div>`;
      }
      this.shop.appendChild(div);
    }
  }

  refreshBench(slots: (BenchSlotView | null)[]): void {
    this.bench.innerHTML = '';
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      const div = document.createElement('div');
      div.className = 'bench-slot';
      div.dataset.bench = String(i);
      if (slot) {
        div.classList.add('filled');
        if (slot.mergeable) div.classList.add('mergeable');
        if (slot.graftable) div.classList.add('graftable');
        const stars = '★'.repeat(Math.max(1, slot.star));
        div.title = `${slot.name} · ${stars}`;
        div.innerHTML = `<div class="bs-emoji">${slot.emoji}</div><div class="bs-stars">${stars}</div>`;
      } else {
        div.innerHTML = '';
      }
      this.bench.appendChild(div);
    }
  }

  updateTools(shovel: number, fert: number, shovelActive: boolean, fertActive: boolean): void {
    const sc = this.el('#shovel-count');
    const fc = this.el('#fert-count');
    sc.textContent = `${shovel}`;
    fc.textContent = `${fert}`;
    this.el('#shovel-btn').classList.toggle('active', shovelActive);
    this.el('#fertilizer-btn').classList.toggle('active', fertActive);
  }

  // --- 奖励卡 ---
  showRewards(cards: RewardCardView[], onPick: (card: RewardCardView) => void): void {
    this.rewardCards.innerHTML = '';
    for (const card of cards) {
      const div = document.createElement('div');
      div.className = 'reward-card';
      const kindLabel: Record<RewardKind, string> = {
        fertilizer: '肥料',
        weather: '天气',
        relic: '遗物',
        mutation: '变异',
      };
      div.innerHTML = `
        <div class="rc-kind">${kindLabel[card.kind]}</div>
        <div class="rc-icon">${card.icon}</div>
        <div class="rc-name">${card.name}</div>
        <div class="rc-desc">${card.desc}</div>`;
      div.addEventListener('click', () => onPick(card));
      this.rewardCards.appendChild(div);
    }
    this.rewardCards.classList.add('show');
  }
  hideRewards(): void {
    this.rewardCards.classList.remove('show');
    this.rewardCards.innerHTML = '';
  }

  // --- 模态 ---
  showModal(kind: ModalKind, opts: ModalOptions): void {
    void kind;
    this.mutationPicker.classList.remove('show');
    this.modalEyebrow.textContent = opts.eyebrow ?? '';
    this.modalTitle.textContent = opts.title;
    this.modalCopy.textContent = opts.copy;
    this.modalAction.textContent = opts.action;
    this.modalHint.textContent = opts.hint ?? '';
    this.modal.classList.remove('is-hidden');
    this.modalAction.style.display = '';
  }
  hideModal(): void {
    this.modal.classList.add('is-hidden');
  }
  get modalVisible(): boolean {
    return !this.modal.classList.contains('is-hidden');
  }
  get modalActionButton(): HTMLElement {
    return this.modalAction;
  }

  // --- 变异二选一 ---
  showMutation(plantName: string, options: [MutationOption, MutationOption], onPick: (opt: MutationOption) => void): void {
    this.modalEyebrow.textContent = '3★ 变异';
    this.modalTitle.textContent = `${plantName} 觉醒`;
    this.modalCopy.textContent = '选择一个变异方向，永久强化该植物。';
    this.modalAction.style.display = 'none';
    this.modalHint.textContent = '';
    this.mutOptions.innerHTML = '';
    for (const opt of options) {
      const div = document.createElement('div');
      div.className = 'mut-option';
      div.innerHTML = `<div class="m-name">${opt.name}</div><div class="m-desc">${opt.desc}</div>`;
      div.addEventListener('click', () => onPick(opt));
      this.mutOptions.appendChild(div);
    }
    this.mutationPicker.classList.add('show');
    this.modal.classList.remove('is-hidden');
  }

  // --- 拖拽幽灵 ---
  showGhost(emoji: string, x: number, y: number): void {
    this.dragGhost.textContent = emoji;
    this.dragGhost.style.left = `${x}px`;
    this.dragGhost.style.top = `${y}px`;
    this.dragGhost.classList.add('show');
  }
  moveGhost(x: number, y: number): void {
    this.dragGhost.style.left = `${x}px`;
    this.dragGhost.style.top = `${y}px`;
  }
  hideGhost(): void {
    this.dragGhost.classList.remove('show');
  }

  // --- 闪光 ---
  flash(strength: number): void {
    this.flashOverlay.style.opacity = String(strength);
    this.flashOverlay.animate([{ opacity: strength }, { opacity: 0 }], { duration: 120, easing: 'ease-out' });
  }

  // --- 飘字 ---
  spawnHitNumber(world: THREE.Vector3, amount: number, crit: boolean): void {
    const e = document.createElement('div');
    e.className = crit ? 'hit-num crit' : 'hit-num';
    e.textContent = crit ? `${amount}!` : `${amount}`;
    this.hitLayer.appendChild(e);
    this.pushFloat(e, world, 0.7, '#eaf6e2');
  }

  spawnFloatSun(world: THREE.Vector3, value: number): void {
    const e = document.createElement('div');
    e.className = 'float-sun';
    e.textContent = `+${value}`;
    this.hitLayer.appendChild(e);
    this.pushFloat(e, world, 1.0, '#ffd23a');
  }

  private pushFloat(e: HTMLElement, world: THREE.Vector3, ttl: number, color: string): void {
    if (this.floats.length > 30) {
      const old = this.floats.shift();
      old?.el.remove();
    }
    this.floats.push({ el: e, worldX: world.x, worldY: world.y, worldZ: world.z, life: ttl, ttl, color });
  }

  tickFloats(delta: number): void {
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

  private project(f: FloatNum, t: number): void {
    this.projector.set(f.worldX, f.worldY, f.worldZ).project(this.camera);
    const x = (this.projector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.projector.y * 0.5 + 0.5) * window.innerHeight;
    f.el.style.transform = `translate(-50%,-50%) translate(${x}px, ${y - t * 40}px)`;
    f.el.style.opacity = `${1 - t}`;
  }
}
