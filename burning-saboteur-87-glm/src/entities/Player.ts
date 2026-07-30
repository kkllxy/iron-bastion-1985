import * as THREE from 'three';
import { GridMap } from '../systems/GridMap';
import { TUNING, type WeaponType, type InputIntent } from '../game/types';

export interface PlayerState {
  hp: number;
  maxHp: number;
  lives: number;
  weapon: WeaponType;
  cardLevel: number; // highest keycard tier held
  rations: number;
  explosives: number;
  score: number;
  rescued: number;
  boxed: boolean;
  facing: number; // radians
}

export class Player {
  readonly group = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  readonly state: PlayerState;
  private fireCooldown = 0;
  private body!: THREE.Group;
  private boxMesh!: THREE.Mesh;
  private muzzle!: THREE.PointLight;
  private muzzleTimer = 0;
  private hurtTimer = 0;
  private readonly aim = new THREE.Vector2(1, 0); // last move dir (screen space x,y)

  constructor() {
    this.state = {
      hp: TUNING.playerMaxHp,
      maxHp: TUNING.playerMaxHp,
      lives: TUNING.startingLives,
      weapon: 'pistol',
      cardLevel: 0,
      rations: 1,
      explosives: 0,
      score: 0,
      rescued: 0,
      boxed: false,
      facing: 0,
    };
    this.build();
  }

  private build() {
    this.body = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: '#33415c', roughness: 0.6, metalness: 0.3 });
    const vest = new THREE.MeshStandardMaterial({ color: '#1b2436', roughness: 0.7, metalness: 0.2 });
    const skin = new THREE.MeshStandardMaterial({ color: '#caa07a', roughness: 0.8 });
    const band = new THREE.MeshStandardMaterial({ color: '#d63b3b', emissive: '#7a1414', emissiveIntensity: 0.4, roughness: 0.5 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.6, 4, 10), suit);
    torso.position.y = 0.78;
    torso.castShadow = true;
    this.body.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), skin);
    head.position.y = 1.36;
    head.castShadow = true;
    this.body.add(head);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.12), band);
    visor.position.set(0.06, 1.38, 0.16);
    this.body.add(visor);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.3), vest);
    chest.position.y = 0.92;
    chest.castShadow = true;
    this.body.add(chest);

    // directional gun indicator
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.4, metalness: 0.7 }));
    gun.position.set(0.22, 0.86, 0.32);
    gun.castShadow = true;
    this.body.add(gun);

    // facing wedge (front marker on the ground)
    const wedge = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.34, 4),
      new THREE.MeshStandardMaterial({ color: '#39d0ff', emissive: '#0a4a66', emissiveIntensity: 0.6 }),
    );
    wedge.rotation.x = Math.PI / 2;
    wedge.rotation.z = Math.PI / 4;
    wedge.position.set(0, 0.06, 0.6);
    this.body.add(wedge);

    this.group.add(this.body);

    // box disguise
    const boxMat = new THREE.MeshStandardMaterial({ color: '#9a6b3a', roughness: 0.95 });
    this.boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), boxMat);
    this.boxMesh.position.y = 0.45;
    this.boxMesh.visible = false;
    this.boxMesh.castShadow = true;
    this.group.add(this.boxMesh);

    this.muzzle = new THREE.PointLight('#ffd27a', 0, 6, 2);
    this.muzzle.position.set(0, 1.0, 0.6);
    this.group.add(this.muzzle);
  }

  reset(pos: THREE.Vector3) {
    this.group.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.state.hp = this.state.maxHp;
    this.state.weapon = 'pistol';
    this.state.cardLevel = 0;
    this.state.rations = 1;
    this.state.explosives = 0;
    this.state.score = 0;
    this.state.rescued = 0;
    this.state.boxed = false;
    this.state.facing = 0;
    this.aim.set(1, 0);
    this.fireCooldown = 0;
    this.setBoxVisual(false);
  }

  healStartForRun() {
    this.state.hp = this.state.maxHp;
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  private setBoxVisual(on: boolean) {
    this.body.visible = !on;
    this.boxMesh.visible = on;
  }

  toggleBox(): boolean {
    this.state.boxed = !this.state.boxed;
    this.setBoxVisual(this.state.boxed);
    return this.state.boxed;
  }

  // returns true if a shot was fired this frame
  update(
    dt: number,
    intent: InputIntent,
    map: GridMap,
    out: { fired: boolean; muzzle: boolean; takedown: boolean; noise: number; rationUsed: boolean },
  ): void {
    out.fired = false;
    out.muzzle = false;
    out.takedown = false;
    out.noise = 0;
    out.rationUsed = false;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) this.muzzle.intensity = 0;
    }
    if (this.hurtTimer > 0) this.hurtTimer -= dt;

    const stealth = intent.stealth;
    const speed = TUNING.playerSpeed * (stealth ? TUNING.stealthSpeedMul : 1) * (this.state.boxed ? 0.55 : 1);
    const move = intent.move;
    const mag = Math.hypot(move.x, move.y);
    if (mag > 0.08) {
      this.velocity.x = move.x * speed;
      this.velocity.z = move.y * speed;
      // facing from movement (screen y maps to world +z)
      this.state.facing = Math.atan2(move.y, move.x);
      this.aim.set(move.x, move.y);
      if (this.state.boxed) {
        // moving reveals you slightly but keeps disguise
        out.noise = Math.max(out.noise, 0);
      }
    } else {
      this.velocity.x *= 0.74;
      this.velocity.z *= 0.74;
    }

    let nx = this.group.position.x + this.velocity.x * dt;
    let nz = this.group.position.z + this.velocity.z * dt;
    const r = TUNING.playerRadius;
    const a = map.resolveCircle(nx, nz, r);
    nx = a.x;
    nz = a.z;
    this.group.position.x = nx;
    this.group.position.z = nz;

    // rotation (face aim)
    this.body.rotation.y = this.state.facing;

    // fire
    if (intent.fire && this.fireCooldown <= 0 && !this.state.boxed) {
      if (this.state.weapon === 'pistol') {
        this.fireCooldown = TUNING.pistolCooldown;
        out.fired = true;
        out.muzzle = true;
        out.noise = Math.max(out.noise, 11); // loud
        this.muzzle.intensity = 4;
        this.muzzleTimer = 0.06;
      } else if (this.state.weapon === 'tranq') {
        this.fireCooldown = TUNING.tranqCooldown;
        out.takedown = true; // melee-range, handled by Game
        out.noise = Math.max(out.noise, 2.4);
      }
    }

    // ration use mapped onto interact? no—ration via swap/dedicated. We handle ration in Game on demand.
  }

  damage(amount: number): boolean {
    if (this.state.boxed) amount *= 0.4;
    this.state.hp -= amount;
    this.hurtTimer = 0.25;
    return this.state.hp <= 0;
  }

  get hurtFlash(): number {
    return this.hurtTimer > 0 ? this.hurtTimer / 0.25 : 0;
  }

  aimDir(): THREE.Vector2 {
    return this.aim;
  }

  // muzzle world position for spawning bullets
  muzzleWorld(target: THREE.Vector3) {
    target.set(this.group.position.x, 1.0, this.group.position.z);
    target.x += Math.cos(this.state.facing) * 0.5;
    target.z += Math.sin(this.state.facing) * 0.5;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
  }
}
