import * as THREE from 'three';
import type { Archetype, FighterState, Palette } from '../game/types';

export interface FighterRig {
  readonly torso: THREE.Mesh;
  readonly head: THREE.Group;
  readonly leftArm: THREE.Group;
  readonly rightArm: THREE.Group;
  readonly leftLeg: THREE.Group;
  readonly rightLeg: THREE.Group;
  readonly hair: THREE.Mesh;
  readonly materials: THREE.MeshStandardMaterial[];
}

export interface AttackHit {
  readonly owner: Character;
  readonly origin: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly reach: number;
  readonly range: number;
  readonly damage: number;
  readonly knockback: number;
  readonly knockdown: boolean;
}

// Build a Q版 chibi rig from primitives. Big head, short limbs, cute eyes.
// All meshes parented under `rig` (pivoted at hips) so squash/lean read as one.
export function buildChibiRig(palette: Palette, scale = 1, big = false): FighterRig {
  const s = scale;
  const headSize = (big ? 0.42 : 0.34) * s;

  const suit = new THREE.MeshStandardMaterial({ color: palette.primary, roughness: 0.62, metalness: 0.06 });
  const accent = new THREE.MeshStandardMaterial({
    color: palette.secondary,
    roughness: 0.5,
    metalness: 0.1,
    emissive: palette.secondary,
    emissiveIntensity: 0.05,
  });
  const skin = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.7, metalness: 0.02 });
  const hairMat = new THREE.MeshStandardMaterial({ color: palette.hair, roughness: 0.55, metalness: 0.08 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#15110c', roughness: 0.3, emissive: '#000000' });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26 * s, 0.28 * s, 6, 12), suit);
  torso.castShadow = true;
  torso.position.y = 0.42 * s;

  // accent chest strap for readability
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.12 * s, 0.46 * s), accent);
  strap.position.y = 0.46 * s;
  torso.add(strap);

  const head = new THREE.Group();
  head.position.y = 0.8 * s;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(headSize, 18, 14), skin);
  skull.castShadow = true;
  skull.scale.set(1, 1.05, 0.96);
  head.add(skull);
  const eyeGeo = new THREE.SphereGeometry(0.06 * s, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.12 * s, 0.02 * s, -headSize * 0.92);
  eyeR.position.set(0.12 * s, 0.02 * s, -headSize * 0.92);
  eyeL.scale.setScalar(1.4);
  eyeR.scale.setScalar(1.4);
  head.add(eyeL, eyeR);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(headSize * 1.08, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
  hair.castShadow = true;
  hair.position.y = headSize * 0.16;
  head.add(hair);

  const buildLimb = (len: number, rad: number, mat: THREE.Material) => {
    const pivot = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 5, 8), mat);
    limb.castShadow = true;
    limb.position.y = -len * 0.5 - rad;
    pivot.add(limb);
    return pivot;
  };

  const leftArm = buildLimb(0.26 * s, 0.085 * s, skin);
  leftArm.position.set(-0.26 * s, 0.56 * s, 0);
  const rightArm = buildLimb(0.26 * s, 0.085 * s, skin);
  rightArm.position.set(0.26 * s, 0.56 * s, 0);
  const leftLeg = buildLimb(0.2 * s, 0.1 * s, accent);
  leftLeg.position.set(-0.13 * s, 0.26 * s, 0);
  const rightLeg = buildLimb(0.2 * s, 0.1 * s, accent);
  rightLeg.position.set(0.13 * s, 0.26 * s, 0);

  return {
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    hair,
    materials: [suit, accent, skin, hairMat, eyeMat],
  };
}

export interface CharacterOptions {
  readonly archetype: Archetype;
  readonly isPlayer: boolean;
  readonly palette: Palette;
  readonly scale?: number;
  readonly big?: boolean;
}

export abstract class Character {
  readonly group = new THREE.Group();
  readonly rig = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  readonly facing = new THREE.Vector3(0, 0, -1);
  readonly archetype: Archetype;
  readonly isPlayer: boolean;
  readonly radius: number;

  hp: number;
  readonly maxHp: number;
  state: FighterState = 'idle';
  alive = true;
  markedForRemoval = false;

  // combat timers (seconds)
  stateTimer = 0;
  cooldownTimer = 0;
  invuln = 0;
  flashTimer = 0;
  flashPeak = 0;
  comboStep = 0;
  // walk-cycle phase accumulator (drives limb swing deterministically)
  protected animPhase = 0;
  protected squashY = 1;
  private squashVel = 0;
  // active hit window
  private hitActive = false;
  readonly hitThisSwing = new Set<Character>();

  protected readonly parts: FighterRig;
  private readonly tmpDir = new THREE.Vector3();

  constructor(opts: CharacterOptions) {
    this.archetype = opts.archetype;
    this.isPlayer = opts.isPlayer;
    this.maxHp = opts.archetype.maxHp;
    this.hp = opts.archetype.maxHp;
    this.radius = opts.archetype.radius;
    this.parts = buildChibiRig(opts.palette, opts.scale ?? 1, opts.big ?? false);
    this.rig.add(
      this.parts.torso,
      this.parts.head,
      this.parts.leftArm,
      this.parts.rightArm,
      this.parts.leftLeg,
      this.parts.rightLeg,
    );
    this.group.add(this.rig);
    if (opts.big) this.group.scale.setScalar(1.35);
  }

  faceDirection(dir: THREE.Vector3): void {
    if (dir.lengthSq() < 0.0001) return;
    this.facing.copy(dir).setY(0).normalize();
    // orient so the rig's eyes (local -Z) point along facing.
    this.group.rotation.y = Math.atan2(-this.facing.x, -this.facing.z);
  }

  faceTowards(target: THREE.Vector3): void {
    this.tmpDir.copy(target).sub(this.group.position);
    this.faceDirection(this.tmpDir);
  }

  // Begin a melee swing. comboIndex selects damage/scaling for the player's
  // combo chain; enemies pass 0.
  startAttack(comboIndex = 0): void {
    if (this.state === 'hurt' || this.state === 'down' || this.state === 'dead' || this.state === 'grabbed') return;
    if (this.cooldownTimer > 0) return;
    this.state = 'attack';
    this.stateTimer = 0;
    this.comboStep = comboIndex;
    this.hitActive = false;
    this.hitThisSwing.clear();
  }

  startSpecial(): void {
    this.state = 'special';
    this.stateTimer = 0;
    this.invuln = Math.max(this.invuln, 0.4);
  }

  // Open/close the hit window based on attack progress; CombatSystem reads this.
  getActiveHit(): AttackHit | null {
    if (this.state !== 'attack' || !this.hitActive) return null;
    const a = this.archetype;
    const dmg = this.isPlayer ? this.comboDamage(this.comboStep) : a.attackDamage;
    return {
      owner: this,
      origin: this.group.position,
      forward: this.facing,
      reach: a.attackReach,
      range: a.attackRange,
      damage: dmg,
      knockback: a.knockback,
      knockdown: this.comboStep >= 2 && this.isPlayer,
    };
  }

  // Player overrides to scale combo damage by level; default = flat.
  protected comboDamage(comboIndex: number): number {
    void comboIndex;
    return this.archetype.attackDamage;
  }

  applyKnockback(dir: THREE.Vector3, force: number): void {
    const resist = 1 - this.archetype.knockbackResist;
    this.velocity.x += dir.x * force * resist;
    this.velocity.z += dir.z * force * resist;
  }

  // Returns true if the hit actually connected (i.e. target was hittable).
  takeHit(damage: number, dir: THREE.Vector3, knockback: number, knockdown: boolean): boolean {
    if (!this.alive || this.invuln > 0 || this.state === 'down' || this.state === 'dead') return false;
    const reduced = damage * (1 - this.archetype.armor);
    this.hp = Math.max(0, this.hp - reduced);
    this.flashHit(1.8);
    if (knockdown || this.hp <= 0) {
      this.knockdown(dir, knockback * 1.4);
    } else {
      this.state = 'hurt';
      this.stateTimer = 0;
      this.invuln = 0.32;
      this.applyKnockback(dir, knockback);
      this.squashImpact(0.82);
    }
    if (this.hp <= 0) this.die();
    return true;
  }

  grab(): boolean {
    if (!this.alive || this.state === 'down' || this.state === 'dead') return false;
    this.state = 'grabbed';
    this.stateTimer = 0;
    this.invuln = 0;
    return true;
  }

  releaseGrab(dir: THREE.Vector3, force: number): void {
    this.knockdown(dir, force);
  }

  protected knockdown(dir: THREE.Vector3, force: number): void {
    this.state = 'down';
    this.stateTimer = 0;
    this.invuln = 0.9;
    this.applyKnockback(dir, force);
    this.squashImpact(0.7);
  }

  protected die(): void {
    this.alive = false;
    this.state = 'dead';
    this.stateTimer = 0;
    this.markedForRemoval = false; // Game decides removal timing for FX
  }

  reviveAt(position: THREE.Vector3): void {
    this.hp = this.maxHp;
    this.alive = true;
    this.state = 'idle';
    this.stateTimer = 0;
    this.invuln = 1.5;
    this.velocity.set(0, 0, 0);
    this.group.position.copy(position);
    this.group.position.y = 0;
    this.rig.rotation.set(0, 0, 0);
    this.parts.head.rotation.set(0, 0, 0);
  }

  protected flashHit(peak: number): void {
    this.flashTimer = 0.22;
    this.flashPeak = peak;
  }

  protected squashImpact(yScale: number): void {
    this.squashY = yScale;
    this.squashVel = 0;
  }

  // Update shared timers + pose. Subclasses call this after their behavior.
  protected updateCharacter(delta: number, moveAmount: number): void {
    this.stateTimer += delta;
    this.cooldownTimer = Math.max(0, this.cooldownTimer - delta);
    this.invuln = Math.max(0, this.invuln - delta);

    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      const k = Math.max(0, this.flashTimer / 0.22);
      for (const m of this.parts.materials) {
        m.emissive.setRGB(0.95 * k, 0.25 * k, 0.2 * k);
        m.emissiveIntensity = 0.6 + (this.flashPeak - 0.6) * k;
      }
    } else {
      for (const m of this.parts.materials) {
        m.emissive.setRGB(0, 0, 0);
        m.emissiveIntensity = m === this.parts.materials[1] ? 0.05 : 0;
      }
    }

    // attack hit-window: opens after windup, closes after active span
    if (this.state === 'attack') {
      const a = this.archetype;
      if (!this.hitActive && this.stateTimer >= a.attackWindup) {
        this.hitActive = true;
      }
      if (this.hitActive && this.stateTimer >= a.attackWindup + a.attackActive) {
        this.hitActive = false;
      }
      if (this.stateTimer >= a.attackDuration) {
        this.endAttack();
      }
    }

    // spring squash back to 1 (volume-preserving-ish via counter-scale on rig)
    const stiffness = 90;
    const damping = 14;
    const force = (1 - this.squashY) * stiffness - this.squashVel * damping;
    this.squashVel += force * delta;
    this.squashY += this.squashVel * delta;

    this.updatePose(delta, moveAmount);
  }

  protected endAttack(): void {
    this.state = 'idle';
    this.hitActive = false;
    this.cooldownTimer = this.archetype.cooldown;
  }
  private updatePose(delta: number, moveAmount: number): void {
    const a = this.archetype;
    const { head, torso, leftArm, rightArm, leftLeg, rightLeg } = this.parts;

    if (this.state === 'down') {
      this.rig.rotation.x = THREE.MathUtils.lerp(this.rig.rotation.x, -Math.PI * 0.46, 0.3);
      this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, 0.15, 0.3);
      return;
    }
    this.rig.rotation.x = THREE.MathUtils.lerp(this.rig.rotation.x, 0, 0.25);
    this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, 0, 0.3);

    switch (this.state) {
      case 'attack': {
        const swing = Math.sin(Math.min(this.stateTimer / (a.attackWindup + a.attackActive), 1) * Math.PI);
        const lead = this.comboStep % 2 === 0 ? rightArm : leftArm;
        const other = lead === rightArm ? leftArm : rightArm;
        lead.rotation.x = THREE.MathUtils.lerp(0.3, -1.7, swing);
        lead.rotation.z = lead === rightArm ? 0.1 : -0.1;
        other.rotation.x = THREE.MathUtils.lerp(other.rotation.x, 0.2, 0.2);
        torso.rotation.x = THREE.MathUtils.lerp(torso.rotation.x, 0.25 * swing, 0.3);
        leftLeg.rotation.x = THREE.MathUtils.lerp(leftLeg.rotation.x, 0.15, 0.3);
        rightLeg.rotation.x = THREE.MathUtils.lerp(rightLeg.rotation.x, -0.2, 0.3);
        break;
      }
      case 'special': {
        const t = this.stateTimer;
        leftArm.rotation.x = -2.2 + Math.sin(t * 22) * 0.3;
        rightArm.rotation.x = -2.2 + Math.cos(t * 22) * 0.3;
        torso.rotation.y = Math.sin(t * 16) * 0.4;
        this.rig.rotation.y = t * 14;
        break;
      }
      case 'jump': {
        leftLeg.rotation.x = -0.7;
        rightLeg.rotation.x = -0.7;
        leftArm.rotation.x = -1.2;
        rightArm.rotation.x = -1.2;
        break;
      }
      case 'hurt': {
        torso.rotation.x = THREE.MathUtils.lerp(torso.rotation.x, -0.35, 0.3);
        head.rotation.x = -0.3;
        leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, 0.6, 0.2);
        rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, 0.6, 0.2);
        break;
      }
      case 'grabbed': {
        torso.rotation.x = 0.2;
        leftArm.rotation.x = 1.4;
        rightArm.rotation.x = 1.4;
        break;
      }
      case 'victory': {
        const t = this.stateTimer;
        leftArm.rotation.x = -2.4;
        rightArm.rotation.x = -2.4;
        this.rig.position.y = Math.abs(Math.sin(t * 6)) * 0.12;
        break;
      }
      case 'walk': {
        this.animPhase += delta * 11 * Math.max(0.5, moveAmount);
        const amp = 0.5 + moveAmount * 0.5;
        leftLeg.rotation.x = Math.sin(this.animPhase) * amp;
        rightLeg.rotation.x = Math.sin(this.animPhase + Math.PI) * amp;
        leftArm.rotation.x = Math.sin(this.animPhase + Math.PI) * amp * 0.6;
        rightArm.rotation.x = Math.sin(this.animPhase) * amp * 0.6;
        torso.rotation.x = Math.sin(this.animPhase) * 0.04;
        break;
      }
      default: {
        // idle: gentle breathing bob + arms relax
        this.animPhase += delta * 2.2;
        leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, 0.15, 0.1);
        rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, 0.15, 0.1);
        leftLeg.rotation.x = THREE.MathUtils.lerp(leftLeg.rotation.x, 0, 0.2);
        rightLeg.rotation.x = THREE.MathUtils.lerp(rightLeg.rotation.x, 0, 0.2);
        this.rig.position.y = Math.sin(this.animPhase) * 0.02;
      }
    }

    // apply squash (volume-preserving counter-scale on X/Z)
    const sy = THREE.MathUtils.clamp(this.squashY, 0.6, 1.3);
    const sxz = 1 / Math.sqrt(sy);
    torso.scale.set(sxz, sy, sxz);
    head.scale.setScalar(1 + (1 - sy) * 0.3);
    head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, 0, 0.15);
  }

  dispose(): void {
    const { torso, head, leftArm, rightArm, leftLeg, rightLeg, materials } = this.parts;
    torso.geometry.dispose();
    (torso.children[0] as THREE.Mesh).geometry.dispose();
    (head.children[0] as THREE.Mesh).geometry.dispose(); // skull
    (head.children[1] as THREE.Mesh).geometry.dispose(); // eyeL
    (head.children[2] as THREE.Mesh).geometry.dispose(); // eyeR
    this.parts.hair.geometry.dispose();
    for (const limb of [leftArm, rightArm, leftLeg, rightLeg]) {
      (limb.children[0] as THREE.Mesh).geometry.dispose();
    }
    for (const m of materials) m.dispose();
  }
}
