import * as THREE from 'three';
import type { Character } from '../entities/Character';
import type { Enemy } from '../entities/Enemy';
import type { Boss } from '../entities/Boss';
import type { Player } from '../entities/Player';
import type { Projectile } from '../entities/Projectile';
import type { HitFx } from '../game/types';

const _dir = new THREE.Vector3();
const _contact = new THREE.Vector3();

function inFront(forward: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3): boolean {
  _dir.set(to.x - from.x, 0, to.z - from.z);
  if (_dir.lengthSq() < 1e-5) return true;
  _dir.normalize();
  return forward.dot(_dir) > 0.15;
}

export interface MeleeSummary {
  playerLandHits: number;
  playerKills: number;
  playerGotHit: boolean;
  heavyLandings: number;
}

export class CombatSystem {
  private tryHit(
    attacker: Character,
    target: Character,
    fx: HitFx,
    rng: () => number,
  ): { hit: boolean; killed: boolean; heavy: boolean } {
    const hit = attacker.getActiveHit();
    if (!hit) return { hit: false, killed: false, heavy: false };
    if (attacker.hitThisSwing.has(target)) return { hit: false, killed: false, heavy: false };
    const dx = target.group.position.x - hit.origin.x;
    const dz = target.group.position.z - hit.origin.z;
    const dist = Math.hypot(dx, dz);
    const reach = hit.reach + hit.range + target.radius;
    if (dist > reach) return { hit: false, killed: false, heavy: false };
    if (!inFront(hit.forward, hit.origin, target.group.position)) return { hit: false, killed: false, heavy: false };

    const dir = new THREE.Vector3(dx, 0, dz);
    if (dir.lengthSq() < 1e-5) dir.copy(hit.forward);
    else dir.normalize();
    attacker.hitThisSwing.add(target);

    _contact.set(
      target.group.position.x - dir.x * target.radius,
      0.9,
      target.group.position.z - dir.z * target.radius,
    );
    const heavy = hit.damage >= 14 || hit.knockdown;
    const connected = target.takeHit(hit.damage, dir, hit.knockback, hit.knockdown);
    if (!connected) return { hit: false, killed: false, heavy: false };

    const color = attacker.isPlayer ? '#ffe27a' : '#ff6a5a';
    fx.spawnSpark(_contact, color, heavy ? 14 : 8, heavy ? 0.7 : 0.45);
    fx.spawnHitNumber(_contact, hit.damage, heavy);
    fx.addTrauma(heavy ? 0.45 : 0.22);
    if (heavy) {
      fx.hitstop(0.07, 0.05);
      fx.rumble(0.6, 0.3, 180);
    }
    void rng;
    return { hit: true, killed: !target.alive, heavy };
  }

  resolveMelee(
    player: Player,
    enemies: readonly Enemy[],
    boss: Boss | null,
    fx: HitFx,
    rng: () => number,
  ): MeleeSummary {
    let playerLandHits = 0;
    let playerKills = 0;
    let heavyLandings = 0;

    // player -> enemies + boss
    const targets: Character[] = [...enemies];
    if (boss) targets.push(boss);
    for (const t of targets) {
      if (!t.alive) continue;
      const r = this.tryHit(player, t, fx, rng);
      if (r.hit) {
        playerLandHits += 1;
        if (r.heavy) heavyLandings += 1;
        if (r.killed) playerKills += 1;
      }
    }

    // enemies + boss -> player
    let playerGotHit = false;
    const attackers: Character[] = [...enemies];
    if (boss) attackers.push(boss);
    for (const a of attackers) {
      if (!a.alive) continue;
      const r = this.tryHit(a, player, fx, rng);
      if (r.hit) playerGotHit = true;
    }

    return { playerLandHits, playerKills, playerGotHit, heavyLandings };
  }

  resolveProjectiles(projectiles: readonly Projectile[], player: Player, fx: HitFx): number {
    let hits = 0;
    for (const p of projectiles) {
      if (!p.alive) continue;
      const dx = player.group.position.x - p.group.position.x;
      const dy = (player.group.position.y + 0.6) - p.group.position.y;
      const dz = player.group.position.z - p.group.position.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const r = player.radius + 0.4;
      if (d2 <= r * r) {
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        if (player.takeHit(p.damage, dir, 4, false)) {
          hits += 1;
          p.alive = false;
          fx.spawnSpark(p.group.position, '#9ad36b', 10, 0.5);
          fx.addTrauma(0.25);
        }
      }
    }
    return hits;
  }
}
