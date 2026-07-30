import { POWER_DEFS, type PowerKind } from '../game/config';

export interface ActivePower {
  kind: PowerKind;
  remaining: number;
  duration: number;
}

export interface HudState {
  level: number;
  levelName: string;
  score: number;
  lives: number;
  enemiesLeft: number;
  enemiesTotal: number;
  firepower: number;
  baseExposed: boolean;
  powers: ActivePower[];
}

export type Screen = 'title' | 'playing' | 'paused' | 'levelclear' | 'gameover' | 'victory';

export class Hud {
  private readonly levelEl = this.q('#hud-level');
  private readonly nameEl = this.q('#hud-name');
  private readonly scoreEl = this.q('#hud-score');
  private readonly livesEl = this.q('#hud-lives');
  private readonly enemiesEl = this.q('#hud-enemies');
  private readonly fireEl = this.q('#hud-fire');
  private readonly powersEl = this.q('#hud-powers');
  private readonly overlay = this.q('#overlay');
  private readonly screens: Record<string, HTMLElement> = {
    title: this.q('#screen-title'),
    paused: this.q('#screen-pause'),
    levelclear: this.q('#screen-levelclear'),
    gameover: this.q('#screen-gameover'),
    victory: this.q('#screen-victory'),
  };
  private readonly flashEl = this.q('#flash');
  private readonly banner = this.q('#banner-text');
  private readonly bannerSub = this.q('#banner-sub');

  update(s: HudState): void {
    this.levelEl.textContent = String(s.level);
    this.nameEl.textContent = s.levelName;
    this.scoreEl.textContent = String(s.score).padStart(6, '0');
    this.livesEl.innerHTML = '';
    const shown = Math.min(s.lives, 6);
    for (let i = 0; i < shown; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'life-icon';
      this.livesEl.appendChild(dot);
    }
    if (s.lives > 6) {
      const more = document.createElement('span');
      more.className = 'life-more';
      more.textContent = `+${s.lives - 6}`;
      this.livesEl.appendChild(more);
    }
    this.enemiesEl.innerHTML = '';
    for (let i = 0; i < s.enemiesTotal; i += 1) {
      const dot = document.createElement('span');
      dot.className = i < s.enemiesLeft ? 'enemy-dot on' : 'enemy-dot';
      this.enemiesEl.appendChild(dot);
    }
    this.fireEl.innerHTML = '';
    for (let i = 0; i < 3; i += 1) {
      const star = document.createElement('span');
      star.className = i < s.firepower ? 'fire-star on' : 'fire-star';
      star.textContent = '★';
      this.fireEl.appendChild(star);
    }
    this.powersEl.innerHTML = '';
    for (const p of s.powers) {
      const def = POWER_DEFS[p.kind];
      const badge = document.createElement('div');
      badge.className = 'power-badge';
      badge.style.setProperty('--pc', def.color);
      const frac = Math.max(0, p.remaining / p.duration);
      badge.innerHTML = `<span class="power-glyph">${def.glyph}</span>
        <span class="power-name">${def.label}</span>
        <span class="power-bar"><i style="width:${(frac * 100).toFixed(0)}%"></i></span>`;
      this.powersEl.appendChild(badge);
    }
  }

  setScreen(screen: Screen, opts?: { banner?: string; sub?: string }): void {
    const isPlaying = screen === 'playing';
    this.overlay.dataset.show = isPlaying ? 'false' : 'true';
    for (const [key, el] of Object.entries(this.screens)) {
      el.dataset.show = key === screen ? 'true' : 'false';
    }
    if (screen === 'levelclear' && opts) {
      this.banner.textContent = opts.banner ?? '';
      this.bannerSub.textContent = opts.sub ?? '';
    }
  }

  flash(intensity: number, reducedMotion: boolean): void {
    if (reducedMotion) return;
    this.flashEl.animate(
      [{ opacity: intensity }, { opacity: 0 }],
      { duration: 120, easing: 'ease-out' },
    );
  }

  pulseScore(): void {
    this.scoreEl.animate(
      [{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
      { duration: 130, easing: 'ease-out' },
    );
  }

  private q(selector: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Missing HUD element: ${selector}`);
    return el;
  }
}
