import * as THREE from 'three';
import { Character } from './Character';
import type { Archetype, HitFx, Palette } from '../game/types';
import type { InputController } from '../core/InputController';
import { xpForLevel } from '../game/levels';

export interface PlayerBounds {
  readonly halfWidth: number;
  readonly minZ: number; // forward clamp (boss gate / current wave gate)
  readonly maxZ: number; // back clamp (level start)
}

export interface PlayerContext {
  readonly enemies: readonly Character[];
  readonly fx: HitFx;
}

const GRAVITY = 26;
const JUMP_VELOCITY = 8.4;
const SPECIAL_COST = 50;
const WEAPON_DURATION = 9;

export const PLAYER_ARCHETYPE: Archetype = {
  maxHp: 100,
  speed: 5.6,
  attackDamage: 11,
  attackRange: 1.1,
  attackReach: 1.05,
  attackDuration: 0.42,
  attackWindup: 0.12,
  attackActive: 0.12,
  cooldown: 0.34,
  knockback: 6,
  knockbackResist: 0.15,
  radius: 0.42,
  armor: 0.1,
  scoreValue: 0,
  xpValue: 0,
};

export class Player extends Character {
  rage = 0;
  readonly maxRage = 100;
  xp = 0;
  level = 1;
  lives = 3;
  comboCount = 0; // current chain position
  private comboResetTimer = 0;
  private grounded = true;
  private jumpVy = 0;
  private airAttacked = false;
  private weaponTimer = 0;
  private grabbedTarget: Character | null = null;
  private grabHoldTimer = 0;
  private readonly weaponMesh: THREE.Mesh;

  constructor(palette: Palette) {
    super({ archetype: PLAYER_ARCHETYPE, isPlayer: true, palette });
    // ponytail: simple bat mesh toggled by weapon buff, no GLB needed.
    this.weaponMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.06, 0.5, 4, 8),
      new THREE.MeshStandardMaterial({ color: '#c98a3a', roughness: 0.5, metalness: 0.2 }),
    );
    this.weaponMesh.castShadow = true;
    this.weaponMesh.position.set(0.3, 0.5, 0.1);
    this.weaponMesh.rotation.z = -0.5;
    this.weaponMesh.visible = false;
    this.rig.add(this.weaponMesh);
  }

  get hasWeapon(): boolean {
    return this.weaponTimer > 0;
  }

  get maxComboSteps(): number {
    return this.level >= 2 ? 4 : 3;
  }

  addXp(amount: number): void {
    if (!this.alive) return;
    this.xp += amount;
    while (this.xp >= xpForLevel(this.level) && this.level < 6) {
      this.xp -= xpForLevel(this.level);
      this.level += 1;
    }
  }

  addRage(amount: number): void {
    this.rage = Math.min(this.maxRage, this.rage + amount);
  }

  activateWeapon(): void {
    this.weaponTimer = WEAPON_DURATION;
    this.weaponMesh.visible = true;
  }

  canSpecial(): boolean {
    return this.rage >= SPECIAL_COST && this.alive && this.grounded && this.state !== 'down';
  }

  spendSpecial(): boolean {
    if (!this.canSpecial()) return false;
    this.rage -= SPECIAL_COST;
    return true;
  }

  override takeHit(damage: number, dir: THREE.Vector3, knockback: number, knockdown: boolean): boolean {
    if (!super.takeHit(damage, dir, knockback, knockdown)) return false;
    // taking damage feeds the rage meter (frustration gauge)
    this.addRage(damage * 0.6);
    return true;
  }

  // Player combo damage scales with level + weapon buff + step position.
  protected override comboDamage(step: number): number {
    const lvlScale = 1 + (this.level - 1) * 0.12;
    const stepScale = step <= 0 ? 1 : step === 1 ? 1.1 : step === 2 ? 1.3 : 1.6;
    const weapon = this.hasWeapon ? 1.7 : 1;
    return Math.round(this.archetype.attackDamage * lvlScale * stepScale * weapon);
  }

  // Menu/idle pose: keep the rig breathing + handle victory cutscene pose
  // without running input or combat.
  updateIdle(delta: number): void {
    if (this.weaponTimer > 0) {
      this.weaponTimer -= delta;
      if (this.weaponTimer <= 0) this.weaponMesh.visible = false;
    }
    if (this.state === 'victory') this.stateTimer += delta;
    super.updateCharacter(delta, 0);
  }

  update(delta: number, input: InputController, bounds: PlayerBounds, ctx: PlayerContext): void {
    // weapon buff timer
    if (this.weaponTimer > 0) {
      this.weaponTimer -= delta;
      if (this.weaponTimer <= 0) this.weaponMesh.visible = false;
    }
    if (this.comboResetTimer > 0) {
      this.comboResetTimer -= delta;
      if (this.comboResetTimer <= 0) this.comboCount = 0;
    }

    // recover from hit-stun / knockdown so the player is never permastunned
    if (this.state === 'hurt' && this.stateTimer > 0.34) {
      this.state = 'idle';
      this.stateTimer = 0;
    }
    if (this.state === 'down' && this.stateTimer > 0.8) {
      this.state = 'idle';
      this.stateTimer = 0;
      this.invuln = Math.max(this.invuln, 0.3);
    }

    const actionable =
      this.alive &&
      this.state !== 'hurt' &&
      this.state !== 'down' &&
      this.state !== 'special' &&
      this.state !== 'grabbed';

    // --- input intents (edge-triggered) ---
    if (actionable && this.state !== 'grab' && input.consumeGrab()) {
      this.tryGrab(ctx);
    } else if (this.state === 'grab' && (input.consumeGrab() || this.grabHoldTimer <= 0)) {
      this.throwGrabbed(ctx);
    }

    if (actionable && input.consumeSpecial()) {
      if (this.spendSpecial()) {
        this.startSpecial();
        ctx.fx.addTrauma(0.5);
        ctx.fx.whiteFlash(0.5);
        ctx.fx.punchFov(7);
        this.applySpecial(ctx);
      }
    }

    if (actionable && input.consumeJump() && this.grounded) {
      this.jumpVy = JUMP_VELOCITY;
      this.grounded = false;
      this.airAttacked = false;
      this.state = 'jump';
      this.squashImpact(1.18);
      ctx.fx.spawnDust(this.group.position, '#cfcabb');
    }

    if (actionable && input.consumeAttack()) {
      if (!this.grounded && !this.airAttacked) {
        this.airAttacked = true;
        this.comboCount = 2; // air attack hits like a finisher
        this.startAttack(2);
      } else if (this.grounded) {
        this.comboCount = this.comboCount >= this.maxComboSteps ? 0 : this.comboCount;
        this.faceLockTarget(ctx);
        this.startAttack(this.comboCount);
        this.comboCount += 1;
        this.comboResetTimer = 0.7;
      }
    }

    // --- movement ---
    const move = new THREE.Vector2();
    input.readMovement(move);
    if (this.state === 'grab' && this.grabbedTarget) {
      // slow shuffle while holding an enemy
      move.multiplyScalar(0.45);
    }
    const canMove =
      actionable &&
      this.state !== 'attack' &&
      this.state !== 'grab' &&
      (this.state !== 'jump' || true);
    void canMove;

    const targetVel = new THREE.Vector3();
    if (this.alive && this.state !== 'hurt' && this.state !== 'down' && this.state !== 'special') {
      targetVel.set(move.x, 0, move.y).multiplyScalar(this.archetype.speed);
      if (this.state === 'attack' || this.state === 'grab') targetVel.multiplyScalar(0);
    }
    const smoothing = 1 - Math.exp(-14 * delta);
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVel.x, smoothing);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVel.z, smoothing);
    this.group.position.x += this.velocity.x * delta;
    this.group.position.z += this.velocity.z * delta;

    if (move.lengthSq() > 0.05 && this.state !== 'attack' && this.state !== 'special') {
      this.faceDirection(new THREE.Vector3(move.x, 0, move.y));
    } else if (this.grabbedTarget) {
      this.faceTowards(this.grabbedTarget.group.position);
    }

    // vertical (jump) integration
    if (!this.grounded) {
      this.jumpVy -= GRAVITY * delta;
      this.group.position.y += this.jumpVy * delta;
      if (this.group.position.y <= 0) {
        this.group.position.y = 0;
        this.jumpVy = 0;
        this.grounded = true;
        this.squashImpact(0.82);
        ctx.fx.spawnDust(this.group.position, '#cfcabb');
        ctx.fx.addTrauma(0.12);
        if (this.state === 'jump') this.state = 'idle';
      }
    }

    // clamp to level strip
    const hw = bounds.halfWidth - 0.6;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -hw, hw);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, bounds.minZ, bounds.maxZ);

    // grab hold timer
    if (this.state === 'grab') {
      this.grabHoldTimer -= delta;
      if (this.grabbedTarget) {
        // keep enemy in front
        const off = this.facing.clone().multiplyScalar(0.9);
        this.grabbedTarget.group.position.lerp(
          new THREE.Vector3(this.group.position.x + off.x, 0.2, this.group.position.z + off.z),
          0.5,
        );
      }
    }

    const moveAmount = Math.min(1, new THREE.Vector2(this.velocity.x, this.velocity.z).length() / this.archetype.speed);
    if (this.state === 'idle' && moveAmount > 0.15) this.state = 'walk';
    else if (this.state === 'walk' && moveAmount < 0.12 && this.grounded) this.state = 'idle';

    super.updateCharacter(delta, moveAmount);
  }

  // Soft lock-on: snap to face the nearest hittable enemy when attacking, so
  // combos land even when the player is surrounded. Classic beat'em-up feel.
  private faceLockTarget(ctx: PlayerContext, lockRange = 2.8): void {
    let best: Character | null = null;
    let bestD = lockRange * lockRange;
    for (const e of ctx.enemies) {
      if (!e.alive || e.state === 'down' || e.state === 'dead') continue;
      const dx = e.group.position.x - this.group.position.x;
      const dz = e.group.position.z - this.group.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) {
        bestD = d2;
        best = e;
      }
    }
    if (best) this.faceTowards(best.group.position);
  }

  private tryGrab(ctx: PlayerContext): void {
    const reach = 1.3;
    let best: Character | null = null;
    let bestDist = reach * reach;
    for (const e of ctx.enemies) {
      if (!e.alive || e.state === 'down' || e.state === 'dead' || e.state === 'grabbed') continue;
      const dx = e.group.position.x - this.group.position.x;
      const dz = e.group.position.z - this.group.position.z;
      const dist = dx * dx + dz * dz;
      const to = new THREE.Vector3(dx, 0, dz).normalize();
      if (this.facing.dot(to) > 0.2 && dist < bestDist) {
        best = e;
        bestDist = dist;
      }
    }
    if (best) {
      this.state = 'grab';
      this.stateTimer = 0;
      this.grabHoldTimer = 1.4;
      this.grabbedTarget = best;
      best.grab();
    }
  }

  private throwGrabbed(ctx: PlayerContext): void {
    if (!this.grabbedTarget) {
      this.state = 'idle';
      return;
    }
    const dir = this.facing.clone();
    this.grabbedTarget.takeHit(this.comboDamage(2), dir, 9, true);
    ctx.fx.spawnSpark(this.grabbedTarget.group.position, '#ffd24a', 10, 0.5);
    this.grabbedTarget = null;
    this.state = 'idle';
    this.cooldownTimer = 0.2;
  }

  private applySpecial(ctx: PlayerContext): void {
    const radius = 3.2;
    const r2 = radius * radius;
    let hit = false;
    for (const e of ctx.enemies) {
      const dx = e.group.position.x - this.group.position.x;
      const dz = e.group.position.z - this.group.position.z;
      if (dx * dx + dz * dz <= r2) {
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        e.takeHit(this.comboDamage(3) + 6, dir, 11, true);
        ctx.fx.spawnSpark(e.group.position, '#9b6bff', 12, 0.7);
        hit = true;
      }
    }
    if (hit) {
      ctx.fx.hitstop(0.09, 0.04);
      ctx.fx.rumble(0.9, 0.4, 280);
    }
    // shockwave ring VFX handled by Game via state change
  }

  // Called by Game when special state ends, to drop a shockwave ring.
  isSpecialActive(): boolean {
    return this.state === 'special';
  }

  protected override endAttack(): void {
    super.endAttack();
    if (!this.grounded) {
      // air attack slams down
      this.jumpVy = -6;
    }
  }

  dispose(): void {
    super.dispose();
    this.weaponMesh.geometry.dispose();
    (this.weaponMesh.material as THREE.Material).dispose();
  }
}
