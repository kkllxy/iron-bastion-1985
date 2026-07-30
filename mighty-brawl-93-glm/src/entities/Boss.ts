import * as THREE from 'three';
import { Character, type AttackHit } from './Character';
import type { BossType, EnemyType, HitFx, Palette } from '../game/types';

export interface BossContext {
  readonly player: Character;
  readonly fx: HitFx;
  readonly rng: () => number;
  readonly bounds: { halfWidth: number; minZ: number; maxZ: number };
  spawnProjectile(origin: THREE.Vector3, target: THREE.Vector3, damage: number): void;
  spawnAdd(type: EnemyType): void;
}

export interface BossProfile {
  readonly name: string;
  readonly type: BossType;
  readonly palette: Palette;
  readonly scale: number;
  readonly archetype: {
    maxHp: number;
    speed: number;
    attackDamage: number;
    attackRange: number;
    attackReach: number;
    attackDuration: number;
    attackWindup: number;
    attackActive: number;
    cooldown: number;
    knockback: number;
    knockbackResist: number;
    radius: number;
    armor: number;
    scoreValue: number;
    xpValue: number;
  };
}

const BOSS_PALETTES: Record<BossType, Palette> = {
  'street-king': { primary: '#c0271f', secondary: '#ffce4a', skin: '#d9a06a', hair: '#2a2a30' },
  'subway-brute': { primary: '#3c4654', secondary: '#c9a24a', skin: '#cda27a', hair: '#262b33' },
  'factory-overlord': { primary: '#3a5a2a', secondary: '#b6ff5a', skin: '#9aa66a', hair: '#1a2014' },
};

export function bossProfile(type: BossType, hp: number, name: string): BossProfile {
  const base = {
    speed: 2.0,
    attackDamage: 16,
    attackRange: 1.7,
    attackReach: 1.6,
    attackDuration: 0.6,
    attackWindup: 0.5,
    attackActive: 0.14,
    cooldown: 2.0,
    knockback: 9,
    knockbackResist: 0.6,
    radius: 0.8,
    scoreValue: 2000,
    xpValue: 80,
    maxHp: hp,
    armor: 0,
  };
  if (type === 'subway-brute') {
    return { name, type, palette: BOSS_PALETTES[type], scale: 1.7, archetype: { ...base, maxHp: hp, armor: 0.3, attackDamage: 18, speed: 1.7 } };
  }
  if (type === 'factory-overlord') {
    return { name, type, palette: BOSS_PALETTES[type], scale: 2.0, archetype: { ...base, maxHp: hp, attackDamage: 15, speed: 2.1, knockbackResist: 0.7 } };
  }
  return { name, type, palette: BOSS_PALETTES[type], scale: 1.6, archetype: { ...base, maxHp: hp, speed: 2.4 } };
}

type AttackKind = 'none' | 'charge' | 'slam' | 'projectile' | 'spin' | 'summon';
type AttackPhase = 'windup' | 'exec' | 'recover';

export class Boss extends Character {
  readonly bossType: BossType;
  readonly bossName: string;
  phase = 1;
  private attackKind: AttackKind = 'none';
  private attackPhase: AttackPhase = 'none' as AttackPhase;
  private phaseTimer = 0;
  private chargeDir = new THREE.Vector3(0, 0, -1);
  private spinHits = new Set<Character>();
  private projectilesLeft = 0;
  private telegraphRing: THREE.Mesh;

  constructor(profile: BossProfile, position: THREE.Vector3) {
    super({
      archetype: profile.archetype,
      isPlayer: false,
      palette: profile.palette,
      big: true,
      scale: profile.scale,
    });
    this.bossType = profile.type;
    this.bossName = profile.name;
    this.group.position.copy(position);
    this.group.position.y = 0;
    this.telegraphRing = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.1, 32),
      new THREE.MeshBasicMaterial({ color: '#ff5a3c', transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
    );
    this.telegraphRing.rotation.x = -Math.PI / 2;
    this.telegraphRing.position.y = 0.05;
    this.telegraphRing.visible = false;
    this.group.add(this.telegraphRing);
  }

  override getActiveHit(): AttackHit | null {
    // spin is a continuous AoE handled in update; normal melee via base.
    if (this.attackKind === 'spin' && this.attackPhase === 'exec') {
      return {
        owner: this,
        origin: this.group.position,
        forward: this.facing,
        reach: 2.6,
        range: 2.6,
        damage: this.archetype.attackDamage,
        knockback: 8,
        knockdown: false,
      };
    }
    return super.getActiveHit();
  }

  update(delta: number, ctx: BossContext): void {
    const player = ctx.player;
    const toPlayer = new THREE.Vector3().subVectors(player.group.position, this.group.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const dir = dist > 0.001 ? toPlayer.clone().multiplyScalar(1 / dist) : new THREE.Vector3(0, 0, -1);

    // phase transitions (enrage)
    const frac = this.hp / this.maxHp;
    const wantPhase =
      this.bossType === 'factory-overlord' ? (frac < 0.3 ? 3 : frac < 0.6 ? 2 : 1) : frac < 0.45 ? 2 : 1;
    if (wantPhase > this.phase) {
      this.phase = wantPhase;
      ctx.fx.whiteFlash(0.4);
      ctx.fx.addTrauma(0.5);
      this.flashHit(2.4);
    }

    const busy = this.attackKind !== 'none';
    if (this.state === 'down' && this.stateTimer > 0.7) {
      this.state = 'idle';
      this.stateTimer = 0;
    }
    if (this.state === 'hurt' && this.stateTimer > 0.25) {
      this.state = 'idle';
      this.stateTimer = 0;
    }

    if (!busy && this.alive && this.state !== 'down' && this.state !== 'hurt' && this.cooldownTimer <= 0) {
      this.chooseAttack(ctx, dist, dir);
    }

    if (busy) this.runAttack(delta, ctx, dist, dir);

    if (!busy && this.alive && this.state !== 'down' && this.state !== 'hurt') {
      // slowly reposition toward player when far
      if (dist > 3.2) {
        const speed = this.archetype.speed * (this.phase >= 2 ? 1.25 : 1);
        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, dir.x * speed, 0.1);
        this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, dir.z * speed, 0.1);
        this.faceDirection(dir);
        if (this.state === 'idle') this.state = 'walk';
      } else {
        this.velocity.x *= 0.8;
        this.velocity.z *= 0.8;
        if (this.state === 'walk') this.state = 'idle';
        this.faceDirection(dir);
      }
    }

    this.group.position.x += this.velocity.x * delta;
    this.group.position.z += this.velocity.z * delta;
    if (!busy) {
      this.velocity.x *= 1 - Math.min(1, 6 * delta);
      this.velocity.z *= 1 - Math.min(1, 6 * delta);
    }
    const hw = ctx.bounds.halfWidth - 1;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -hw, hw);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, ctx.bounds.minZ + 1, ctx.bounds.maxZ);

    const moveAmount = Math.min(1, this.velocity.length() / Math.max(0.5, this.archetype.speed));
    super.updateCharacter(delta, moveAmount);
  }

  private chooseAttack(ctx: BossContext, dist: number, dir: THREE.Vector3): void {
    const r = ctx.rng();
    let kind: AttackKind = 'charge';
    if (this.bossType === 'street-king') {
      kind = dist > 5 && r < 0.55 ? 'charge' : 'slam';
    } else if (this.bossType === 'subway-brute') {
      kind = r < 0.45 ? 'charge' : 'slam';
    } else {
      // overlord: projectile / spin / summon / slam
      if (this.phase >= 2 && r < 0.25) kind = 'summon';
      else if (this.phase >= 2 && r < 0.5) kind = 'spin';
      else if (r < 0.75) kind = 'projectile';
      else kind = 'slam';
    }
    this.startAttackPattern(kind, dir);
    this.projectilesLeft = kind === 'projectile' ? (this.phase >= 2 ? 3 : 1) : 0;
  }

  private startAttackPattern(kind: AttackKind, dir: THREE.Vector3): void {
    this.attackKind = kind;
    this.attackPhase = 'windup';
    this.phaseTimer = 0;
    this.state = 'attack';
    this.flashHit(1.6);
    this.chargeDir.copy(dir);
    this.spinHits.clear();
    if (kind === 'charge') {
      this.telegraphRing.visible = true;
      (this.telegraphRing.material as THREE.MeshBasicMaterial).color.set('#ff5a3c');
      this.telegraphRing.scale.setScalar(1);
    } else if (kind === 'slam' || kind === 'spin') {
      this.telegraphRing.visible = true;
      (this.telegraphRing.material as THREE.MeshBasicMaterial).color.set(kind === 'spin' ? '#b6ff5a' : '#ffb24a');
      this.telegraphRing.scale.setScalar(kind === 'spin' ? 2.4 : 1.8);
    }
  }

  private runAttack(delta: number, ctx: BossContext, dist: number, dir: THREE.Vector3): void {
    this.phaseTimer += delta;
    const windup = this.bossType === 'factory-overlord' ? 0.55 : 0.6;

    if (this.attackPhase === 'windup') {
      // grow telegraph ring toward full radius
      this.faceDirection(this.chargeDir);
      if (this.phaseTimer >= windup) {
        this.attackPhase = 'exec';
        this.phaseTimer = 0;
        this.telegraphRing.visible = false;
        this.executeAttack(ctx, dir);
      }
      return;
    }

    if (this.attackPhase === 'exec') {
      switch (this.attackKind) {
        case 'charge': {
          this.velocity.x = this.chargeDir.x * 11;
          this.velocity.z = this.chargeDir.z * 11;
          this.faceDirection(this.chargeDir);
          ctx.fx.spawnDust(this.group.position, '#8a8a8a');
          if (this.phaseTimer > 0.5) this.endBossAttack();
          break;
        }
        case 'slam': {
          if (this.phaseTimer > 0.18) {
            this.slamAoE(ctx, 3.2, true);
            this.endBossAttack();
          }
          break;
        }
        case 'projectile': {
          if (this.phaseTimer > 0.12 && this.projectilesLeft > 0) {
            this.projectilesLeft -= 1;
            const origin = this.group.position.clone().setY(1.2);
            const lead = ctx.player.velocity;
            const target = ctx.player.group.position.clone().setY(0.9).addScaledVector(lead, 0.18);
            ctx.spawnProjectile(origin, target, this.archetype.attackDamage);
            ctx.fx.spawnSpark(origin, '#b6ff5a', 8, 0.4);
            this.phaseTimer = 0;
          } else if (this.projectilesLeft <= 0) {
            this.endBossAttack();
          }
          break;
        }
        case 'spin': {
          // continuous AoE via getActiveHit; resolve hits manually here
          this.resolveSpin(ctx);
          this.faceDirection(dir);
          if (this.phaseTimer > 1.1) this.endBossAttack();
          break;
        }
        case 'summon': {
          ctx.spawnAdd(ctx.rng() < 0.5 ? 'rusher' : 'punk');
          if (this.phase >= 3) ctx.spawnAdd('rusher');
          this.endBossAttack();
          break;
        }
        default:
          this.endBossAttack();
      }
      return;
    }
    void dist;
  }

  private executeAttack(ctx: BossContext, dir: THREE.Vector3): void {
    if (this.attackKind === 'charge') {
      ctx.fx.addTrauma(0.2);
    } else if (this.attackKind === 'slam') {
      // initial slam handled in exec timer; small windup SFX via dust
      ctx.fx.spawnDust(this.group.position, '#9a9a9a');
    } else if (this.attackKind === 'projectile') {
      ctx.fx.addTrauma(0.15);
    } else if (this.attackKind === 'spin') {
      ctx.fx.addTrauma(0.35);
      ctx.fx.spawnSpark(this.group.position, '#b6ff5a', 16, 0.6);
    }
    void dir;
  }

  private slamAoE(ctx: BossContext, radius: number, knockdown: boolean): void {
    const r2 = radius * radius;
    const p = ctx.player;
    const dx = p.group.position.x - this.group.position.x;
    const dz = p.group.position.z - this.group.position.z;
    if (dx * dx + dz * dz <= r2) {
      const d = new THREE.Vector3(dx, 0, dz).normalize();
      p.takeHit(this.archetype.attackDamage + 4, d, 10, knockdown);
    }
    ctx.fx.addTrauma(0.55);
    ctx.fx.hitstop(0.08, 0.05);
    ctx.fx.spawnSpark(this.group.position, '#ffb24a', 24, 0.9);
    ctx.fx.spawnDust(this.group.position, '#b0b0b0');
    ctx.fx.rumble(0.9, 0.5, 260);
  }

  private resolveSpin(ctx: BossContext): void {
    const r2 = 2.6 * 2.6;
    const p = ctx.player;
    if (!this.spinHits.has(p)) {
      const dx = p.group.position.x - this.group.position.x;
      const dz = p.group.position.z - this.group.position.z;
      if (dx * dx + dz * dz <= r2) {
        const d = new THREE.Vector3(dx, 0, dz).normalize();
        if (p.takeHit(this.archetype.attackDamage, d, 8, false)) {
          this.spinHits.add(p);
          ctx.fx.spawnSpark(p.group.position, '#b6ff5a', 8, 0.4);
        }
      }
    }
  }

  private endBossAttack(): void {
    this.attackKind = 'none';
    this.attackPhase = 'none' as AttackPhase;
    this.telegraphRing.visible = false;
    this.state = 'idle';
    this.cooldownTimer = Math.max(1.0, this.archetype.cooldown - (this.phase - 1) * 0.4);
    this.velocity.multiplyScalar(0.3);
  }

  dispose(): void {
    super.dispose();
    this.telegraphRing.geometry.dispose();
    (this.telegraphRing.material as THREE.Material).dispose();
  }
}
