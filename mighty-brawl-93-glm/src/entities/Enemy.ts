import * as THREE from 'three';
import { Character } from './Character';
import type { EnemyType, HitFx } from '../game/types';
import { ARCHETYPES, PALETTES } from '../game/levels';

export interface EnemyContext {
  readonly player: Character;
  readonly fx: HitFx;
  readonly rng: () => number;
  readonly bounds: { halfWidth: number; minZ: number; maxZ: number };
  spawnProjectile(origin: THREE.Vector3, target: THREE.Vector3, damage: number): void;
}

export class Enemy extends Character {
  readonly enemyType: EnemyType;
  private aiTimer = 0;
  private preferDist: number;
  private hasThrown = false;

  constructor(type: EnemyType, position: THREE.Vector3) {
    const big = type === 'bruiser';
    super({ archetype: ARCHETYPES[type], isPlayer: false, palette: PALETTES[type], big });
    this.enemyType = type;
    this.group.position.copy(position);
    this.group.position.y = 0;
    this.preferDist =
      type === 'thrower' ? 6.5 : type === 'bruiser' ? this.archetype.attackRange + 0.3 : this.archetype.attackRange + 0.4;
  }

  update(delta: number, ctx: EnemyContext): void {
    const player = ctx.player;
    const toPlayer = new THREE.Vector3().subVectors(player.group.position, this.group.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const dir = dist > 0.001 ? toPlayer.clone().multiplyScalar(1 / dist) : new THREE.Vector3(0, 0, -1);

    const actionable =
      this.alive &&
      this.state !== 'hurt' &&
      this.state !== 'down' &&
      this.state !== 'attack' &&
      this.state !== 'grabbed';

    // get-up when down timer elapsed
    if (this.state === 'down' && this.stateTimer > 0.85) {
      this.state = 'idle';
      this.stateTimer = 0;
    }
    if (this.state === 'hurt' && this.stateTimer > 0.3) {
      this.state = 'idle';
      this.stateTimer = 0;
    }

    if (actionable && this.state !== 'dead') {
      this.faceDirection(dir);

      if (this.enemyType === 'thrower') {
        // keep preferred distance, throw when in line of sight
        const diff = dist - this.preferDist;
        const moveStrength = Math.min(1, Math.abs(diff) / 2);
        const seek = diff > 0 ? 1 : -1; // too far -> approach, too close -> retreat
        this.velocity.x = dir.x * this.archetype.speed * seek * moveStrength;
        this.velocity.z = dir.z * this.archetype.speed * seek * moveStrength;
        if (dist < 10 && this.cooldownTimer <= 0 && Math.abs(diff) < 2.5) {
          this.startAttack(0);
          this.hasThrown = false;
        }
      } else {
        // approach to melee range then strike
        if (dist > this.archetype.attackRange + 0.15) {
          const jitter = (ctx.rng() - 0.5) * 0.5;
          this.velocity.x = dir.x * this.archetype.speed + dir.z * jitter;
          this.velocity.z = dir.z * this.archetype.speed - dir.x * jitter;
        } else {
          this.velocity.x *= 0.6;
          this.velocity.z *= 0.6;
          if (this.cooldownTimer <= 0) {
            this.startAttack(0);
          }
        }
      }

      // small idle drift damping
      this.aiTimer += delta;
    }

    // melee attack windup -> the active hit is resolved by CombatSystem via
    // getActiveHit(); thrower fires its projectile at the windup peak instead.
    if (this.enemyType === 'thrower' && this.state === 'attack' && !this.hasThrown) {
      if (this.stateTimer >= this.archetype.attackWindup) {
        this.hasThrown = true;
        const origin = this.group.position.clone().setY(0.9);
        const target = player.group.position.clone().setY(0.9);
        ctx.spawnProjectile(origin, target, this.archetype.attackDamage);
        ctx.fx.spawnDust(this.group.position, '#caa84e');
      }
    }

    // integrate position
    this.group.position.x += this.velocity.x * delta;
    this.group.position.z += this.velocity.z * delta;
    // friction when not actively driving
    if (!actionable || this.state === 'attack') {
      this.velocity.x *= 1 - Math.min(1, 8 * delta);
      this.velocity.z *= 1 - Math.min(1, 8 * delta);
    }

    const hw = ctx.bounds.halfWidth - 0.5;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -hw, hw);
    this.group.position.z = THREE.MathUtils.clamp(
      this.group.position.z,
      ctx.bounds.minZ - 1,
      ctx.bounds.maxZ + 1.5,
    );

    if (this.alive && this.state === 'idle' && this.velocity.lengthSq() > 0.5) this.state = 'walk';
    else if (this.state === 'walk' && this.velocity.lengthSq() < 0.4) this.state = 'idle';

    const moveAmount = Math.min(1, this.velocity.length() / Math.max(0.5, this.archetype.speed));
    super.updateCharacter(delta, moveAmount);
  }
}

export function createEnemy(type: EnemyType, position: THREE.Vector3): Enemy {
  return new Enemy(type, position);
}
