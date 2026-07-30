import type { AlertLevel, WeaponType } from '../game/types';
import { ALERT_LABEL } from '../game/types';
import type { Enemy } from '../entities/Enemy';
import type { Pickup } from '../entities/Pickups';
import { GridMap } from './GridMap';

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  lives: number;
  weapon: WeaponType;
  cardLevel: number;
  exitCardLevel: number;
  rations: number;
  explosives: number;
  score: number;
  alert: AlertLevel;
  areaName: string;
  areaIndex: number;
  areaCount: number;
  objective: string;
  bossProgress?: string;
  time: number;
}

export type ScreenName = 'menu' | 'briefing' | 'playing' | 'paused' | 'dead' | 'gameover' | 'victory';

const WEAPON_LABEL: Record<WeaponType, string> = {
  pistol: '手枪',
  tranq: '镇静针',
  none: '徒手',
};

const ALERT_COLOR: Record<AlertLevel, string> = {
  hidden: '#33e0a0',
  spotted: '#ffcf33',
  hunted: '#ff3b3b',
  searching: '#ff8a33',
};

export class Hud {
  private readonly el: Record<string, HTMLElement> = {};
  private readonly minimap: HTMLCanvasElement;
  private readonly mctx: CanvasRenderingContext2D;
  private currentScreen: ScreenName = 'menu';

  constructor() {
    const ids = [
      'hp-fill', 'hp-text', 'lives', 'weapon', 'card-level', 'rations', 'explosives',
      'score', 'alert-badge', 'area-name', 'area-progress', 'objective', 'interact-hint',
      'boss-progress',
    ];
    for (const id of ids) {
      const e = document.getElementById(id);
      if (e) this.el[id] = e;
    }
    this.minimap = document.getElementById('minimap') as HTMLCanvasElement;
    this.mctx = this.minimap.getContext('2d')!;
  }

  updateHud(s: HudSnapshot) {
    const hpPct = Math.max(0, Math.min(1, s.hp / s.maxHp));
    if (this.el['hp-fill']) this.el['hp-fill'].style.width = `${hpPct * 100}%`;
    if (this.el['hp-text']) this.el['hp-text'].textContent = `${Math.ceil(s.hp)} / ${s.maxHp}`;
    if (this.el['lives']) this.el['lives'].textContent = `× ${s.lives}`;
    if (this.el['weapon']) this.el['weapon'].textContent = WEAPON_LABEL[s.weapon];
    if (this.el['card-level']) {
      const have = s.cardLevel >= s.exitCardLevel && s.exitCardLevel < 99;
      this.el['card-level'].textContent = `${s.cardLevel} 级${have ? '（已满足）' : ''}`;
    }
    if (this.el['rations']) this.el['rations'].textContent = `× ${s.rations}`;
    if (this.el['explosives']) this.el['explosives'].textContent = `× ${s.explosives}`;
    if (this.el['score']) this.el['score'].textContent = String(s.score).padStart(6, '0');
    if (this.el['alert-badge']) {
      this.el['alert-badge'].textContent = `警戒：${ALERT_LABEL[s.alert]}`;
      this.el['alert-badge'].style.color = ALERT_COLOR[s.alert];
      this.el['alert-badge'].style.borderColor = ALERT_COLOR[s.alert];
    }
    if (this.el['area-name']) this.el['area-name'].textContent = s.areaName;
    if (this.el['area-progress']) this.el['area-progress'].textContent = `${s.areaIndex + 1} / ${s.areaCount}`;
    if (this.el['objective']) this.el['objective'].textContent = s.objective;
    if (this.el['boss-progress']) {
      if (s.bossProgress !== undefined) {
        this.el['boss-progress'].style.display = '';
        this.el['boss-progress'].textContent = `兵器部位：${s.bossProgress}`;
      } else {
        this.el['boss-progress'].style.display = 'none';
      }
    }
  }

  setInteractHint(text: string | null) {
    if (this.el['interact-hint']) {
      if (text) {
        this.el['interact-hint'].textContent = text;
        this.el['interact-hint'].style.opacity = '1';
      } else {
        this.el['interact-hint'].style.opacity = '0';
      }
    }
  }

  drawMinimap(
    map: GridMap,
    player: { x: number; z: number; facing: number },
    enemies: Enemy[],
    pickups: Pickup[],
    exit: { x: number; z: number },
    boss?: { x: number; z: number },
  ) {
    const ctx = this.mctx;
    const W = this.minimap.width;
    const H = this.minimap.height;
    const cols = map.cols;
    const rows = map.rows;
    const sx = W / cols;
    const sy = H / rows;
    ctx.fillStyle = '#0a0c0f';
    ctx.fillRect(0, 0, W, H);
    // walls
    ctx.fillStyle = '#2b3338';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (map.isWallCol(c, r)) ctx.fillRect(c * sx, r * sy, sx + 0.5, sy + 0.5);
      }
    }
    const wp = (x: number, z: number) => ({
      cx: ((x - map.originX) / (cols * map.cell)) * W,
      cy: ((z - map.originZ) / (rows * map.cell)) * H,
    });
    // pickups
    for (const p of pickups) {
      if (p.collected) continue;
      const { cx, cy } = wp(p.pos.x, p.pos.z);
      ctx.fillStyle = p.type === 'ration' ? '#4fd06a' : p.type === 'hostage' ? '#9ad0ff' : p.type === 'explosive' ? '#ff3b3b' : '#f5c542';
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    // exit
    {
      const { cx, cy } = wp(exit.x, exit.z);
      ctx.fillStyle = '#33ff88';
      ctx.fillRect(cx - 3, cy - 3, 6, 6);
    }
    // enemies + vision cones
    for (const e of enemies) {
      const { cx, cy } = wp(e.pos.x, e.pos.z);
      if (!e.alive) {
        ctx.fillStyle = '#553';
        ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
        continue;
      }
      // cone
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const R = (e.range / (rows * map.cell)) * H;
      for (let a = -e.fov / 2; a <= e.fov / 2 + 0.01; a += e.fov / 8) {
        const ang = e.facing + a;
        ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,90,58,0.18)';
      ctx.fill();
      ctx.fillStyle = e.kind === 'camera' ? '#ffcf33' : '#ff5a3a';
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    }
    // boss
    if (boss) {
      const { cx, cy } = wp(boss.x, boss.z);
      ctx.fillStyle = '#b14dff';
      ctx.fillRect(cx - 4, cy - 4, 8, 8);
    }
    // player
    {
      const { cx, cy } = wp(player.x, player.z);
      ctx.strokeStyle = '#39d0ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(player.facing) * 8, cy + Math.sin(player.facing) * 8);
      ctx.stroke();
      ctx.fillStyle = '#39d0ff';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  showScreen(name: ScreenName, data?: { title?: string; subtitle?: string; detail?: string; score?: number; time?: number }) {
    this.currentScreen = name;
    document.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => {
      el.style.display = el.dataset.screen === name ? 'flex' : 'none';
    });
    const root = document.getElementById('screen-root');
    if (root) root.style.display = name === 'playing' ? 'none' : 'flex';
    if (data) {
      const t = document.querySelector<HTMLElement>('[data-field="title"]');
      const st = document.querySelector<HTMLElement>('[data-field="subtitle"]');
      const dt = document.querySelector<HTMLElement>('[data-field="detail"]');
      if (t && data.title) t.textContent = data.title;
      if (st && data.subtitle) st.textContent = data.subtitle;
      if (dt && data.detail) dt.innerHTML = data.detail;
    }
  }

  get screen(): ScreenName {
    return this.currentScreen;
  }
}
