import * as THREE from 'three';
import { kenteTexture } from '../core/Textures';

export interface AnimState {
  speed: number;       // horizontal speed
  grounded: boolean;
  vy: number;
  dashing: boolean;
}

/**
 * AFROBOT — procedural character model + animation.
 * Silhouette: compact cream shell, big visor eyes, a puffy violet "afro" dome
 * with a gold afro-pick antenna, kente waistband and a glowing core backpack.
 */
export class Afrobot {
  readonly root = new THREE.Group();     // positioned at the feet; yaw applied here
  private body = new THREE.Group();      // squash/stretch + lean
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private eyeMat: THREE.MeshBasicMaterial;
  private coreMat: THREE.MeshBasicMaterial;
  private thrusterMat: THREE.MeshBasicMaterial;
  private thruster: THREE.Mesh;
  private flip = new THREE.Group();

  private t = 0;
  private phase = 0;
  private squash = 1;
  private squashVel = 0;
  private blinkTimer = 2.5;
  private blink = 0;
  private flipT = -1;
  private happyT = 0;
  private hurtT = 0;

  constructor() {
    const shell = new THREE.MeshStandardMaterial({ color: 0xfff3e2, roughness: 0.32, metalness: 0.08 });
    const shellDark = new THREE.MeshStandardMaterial({ color: 0x3b3550, roughness: 0.5, metalness: 0.3 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf5b52a, roughness: 0.3, metalness: 0.75 });
    const afro = new THREE.MeshStandardMaterial({ color: 0x5b2ab8, roughness: 0.45, metalness: 0.35 });
    const afroHi = new THREE.MeshStandardMaterial({ color: 0x7b45e0, roughness: 0.4, metalness: 0.35 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x0d0b1a, roughness: 0.12, metalness: 0.6 });
    const kente = new THREE.MeshStandardMaterial({ map: kenteTexture(), roughness: 0.6 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ff7ff).multiplyScalar(2.2) });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x35ff9a).multiplyScalar(2.4) });
    this.thrusterMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7affd0).multiplyScalar(3), transparent: true, opacity: 0, depthWrite: false });

    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, p: [number, number, number], s?: [number, number, number], r?: [number, number, number]) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(...p);
      if (s) o.scale.set(...s);
      if (r) o.rotation.set(...r);
      o.castShadow = true;
      parent.add(o);
      return o;
    };

    const sph = new THREE.SphereGeometry(1, 24, 16);
    const sphLo = new THREE.SphereGeometry(1, 14, 10);
    const cap = new THREE.CapsuleGeometry(1, 1, 6, 12);

    this.root.add(this.flip);
    this.flip.position.y = 0.75;
    this.flip.add(this.body);
    this.body.position.y = -0.75;

    // --- Legs (pivot at hip) ---
    for (const [leg, x] of [[this.legL, 0.17], [this.legR, -0.17]] as const) {
      leg.position.set(x, 0.5, 0);
      this.body.add(leg);
      mesh(cap, shellDark, leg, [0, -0.17, 0], [0.085, 0.12, 0.085]);
      const boot = mesh(sphLo, gold, leg, [0, -0.38, 0.04], [0.15, 0.11, 0.2]);
      boot.receiveShadow = true;
      mesh(sphLo, shell, leg, [0, -0.43, 0.04], [0.16, 0.05, 0.21]);
    }

    // --- Torso ---
    this.torso.position.y = 0.5;
    this.body.add(this.torso);
    mesh(sph, shell, this.torso, [0, 0.27, 0], [0.33, 0.3, 0.29]);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.31, 0.12, 24, 1, true), kente);
    band.position.y = 0.13;
    band.castShadow = true;
    this.torso.add(band);
    // chest light: little glowing chevron
    mesh(new THREE.ConeGeometry(0.06, 0.09, 3), this.coreMat, this.torso, [0, 0.33, 0.29], [1, 1, 0.4], [Math.PI / 2, 0, Math.PI]);

    // --- Backpack / energy core ---
    const pack = new THREE.Group();
    pack.position.set(0, 0.3, -0.26);
    this.torso.add(pack);
    mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.36, 16), gold, pack, [0, 0, -0.04]);
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 16), this.coreMat, pack, [0, 0, -0.1]);
    mesh(sphLo, shellDark, pack, [0, 0.2, -0.05], [0.16, 0.05, 0.16]);
    mesh(sphLo, shellDark, pack, [0, -0.2, -0.05], [0.16, 0.05, 0.16]);
    for (const x of [-0.17, 0.17]) mesh(new THREE.BoxGeometry(0.04, 0.26, 0.14), afro, pack, [x, 0.02, -0.06], undefined, [0, 0, x > 0 ? -0.2 : 0.2]);
    this.thruster = mesh(new THREE.ConeGeometry(0.09, 0.5, 12, 1, true), this.thrusterMat, pack, [0, -0.45, -0.08], undefined, [Math.PI, 0, 0]);
    this.thruster.castShadow = false;

    // --- Arms (pivot at shoulder) ---
    for (const [arm, x] of [[this.armL, 0.36], [this.armR, -0.36]] as const) {
      arm.position.set(x, 0.42, 0);
      this.torso.add(arm);
      mesh(sphLo, gold, arm, [0, 0, 0], [0.1, 0.1, 0.1]);
      mesh(cap, shell, arm, [Math.sign(x) * 0.03, -0.17, 0], [0.07, 0.09, 0.07]);
      mesh(sphLo, gold, arm, [Math.sign(x) * 0.04, -0.34, 0.02], [0.1, 0.1, 0.1]);
    }

    // --- Head ---
    this.head.position.y = 0.6;
    this.torso.add(this.head);
    mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 12), shellDark, this.head, [0, 0, 0]);
    const skull = new THREE.Group();
    skull.position.y = 0.27;
    this.head.add(skull);
    mesh(sph, shell, skull, [0, 0, 0], [0.4, 0.33, 0.36]);
    mesh(sph, visor, skull, [0, -0.01, 0.13], [0.33, 0.24, 0.25]);
    // Eyes: big glowing ovals
    const eyeGeo = new THREE.CircleGeometry(0.075, 24);
    for (const x of [0.12, -0.12]) {
      const e = new THREE.Mesh(eyeGeo, this.eyeMat);
      e.position.set(x, 0.0, 0.372);
      e.rotation.y = x * 1.6;
      e.scale.set(1, 1.35, 1);
      skull.add(e);
      this.eyes.push(e);
    }
    // Ear pods (gold) with glowing rings
    for (const x of [0.39, -0.39]) {
      mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 18), gold, skull, [x, 0, 0], undefined, [0, 0, Math.PI / 2]);
      mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 18), this.coreMat, skull, [x * 1.11, 0, 0], undefined, [0, Math.PI / 2, 0]);
    }
    // The afro: clustered spheres forming a big puffy dome
    const afroBits: [number, number, number, number][] = [
      [0, 0.24, -0.05, 0.3], [0.2, 0.2, -0.04, 0.22], [-0.2, 0.2, -0.04, 0.22],
      [0.12, 0.33, 0.07, 0.2], [-0.12, 0.33, 0.07, 0.2], [0, 0.36, -0.18, 0.24],
      [0.22, 0.12, -0.18, 0.2], [-0.22, 0.12, -0.18, 0.2], [0, 0.14, -0.28, 0.22],
      [0.28, 0.3, -0.12, 0.15], [-0.28, 0.3, -0.12, 0.15], [0, 0.44, 0.0, 0.17],
    ];
    afroBits.forEach(([x, y, z, r], i) => mesh(sphLo, i % 3 === 0 ? afroHi : afro, skull, [x, y, z], [r, r, r]));
    // Afro-pick antenna: gold comb with a glowing tip
    const pick = new THREE.Group();
    pick.position.set(0.16, 0.42, -0.18);
    pick.rotation.set(-0.5, 0, -0.35);
    skull.add(pick);
    mesh(new THREE.BoxGeometry(0.035, 0.34, 0.03), gold, pick, [0, 0.17, 0]);
    mesh(new THREE.BoxGeometry(0.16, 0.04, 0.03), gold, pick, [0, 0.36, 0]);
    for (let i = -2; i <= 2; i++) mesh(new THREE.BoxGeometry(0.018, 0.06, 0.02), gold, pick, [i * 0.035, 0.4, 0]);
    mesh(sphLo, this.coreMat, pick, [0, 0.46, 0], [0.045, 0.045, 0.045]);
  }

  /** Called on land with the impact speed to squash. */
  land(impact: number) {
    this.squashVel -= Math.min(impact, 25) * 0.5;
  }
  jump() { this.squashVel += 6; }
  doubleJump() { this.flipT = 0; this.squashVel += 4; }
  happy() { this.happyT = 1.0; }
  hurt() { this.hurtT = 1.2; }

  update(dt: number, s: AnimState) {
    this.t += dt;
    const run = THREE.MathUtils.clamp(s.speed / 9, 0, 1.2);

    // Squash & stretch spring
    const k = 260, damp = 14;
    this.squashVel += ((1 - this.squash) * k - this.squashVel * damp) * dt;
    this.squash += this.squashVel * dt;
    let sy = this.squash;
    if (!s.grounded && !s.dashing) sy *= 1 + THREE.MathUtils.clamp(Math.abs(s.vy) * 0.008, 0, 0.08);
    const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
    this.body.scale.set(sxz, sy, s.dashing ? sxz * 1.25 : sxz);

    const lerp = (o: THREE.Object3D, ax: 'x' | 'y' | 'z', v: number, sp = 14) => {
      o.rotation[ax] += (v - o.rotation[ax]) * Math.min(1, dt * sp);
    };

    if (s.dashing) {
      lerp(this.body, 'x', 0.55, 20);
      lerp(this.armL, 'x', 1.2, 20); lerp(this.armR, 'x', 1.2, 20);
      lerp(this.armL, 'z', 0.5, 20); lerp(this.armR, 'z', -0.5, 20);
      lerp(this.legL, 'x', 0.6, 20); lerp(this.legR, 'x', 0.6, 20);
      this.body.position.y = -0.75;
    } else if (s.grounded) {
      if (run > 0.05) {
        this.phase += dt * (6 + s.speed * 0.9);
        const sw = Math.sin(this.phase);
        lerp(this.legL, 'x', sw * 0.95 * run, 30);
        lerp(this.legR, 'x', -sw * 0.95 * run, 30);
        lerp(this.armL, 'x', -sw * 0.9 * run, 30);
        lerp(this.armR, 'x', sw * 0.9 * run, 30);
        lerp(this.armL, 'z', 0.15, 10); lerp(this.armR, 'z', -0.15, 10);
        lerp(this.body, 'x', 0.18 * run, 10);
        this.body.position.y = -0.75 + Math.abs(Math.cos(this.phase)) * 0.07 * run;
        lerp(this.torso, 'y', sw * 0.12 * run, 20);
        lerp(this.head, 'y', -sw * 0.1 * run, 20);
      } else {
        // Idle: breathing bob, gentle sway, curious head tilt
        const b = Math.sin(this.t * 2.4);
        this.body.position.y = -0.75 + b * 0.015;
        lerp(this.legL, 'x', 0, 10); lerp(this.legR, 'x', 0, 10);
        lerp(this.armL, 'x', Math.sin(this.t * 2.4) * 0.06, 8);
        lerp(this.armR, 'x', -Math.sin(this.t * 2.4) * 0.06, 8);
        lerp(this.armL, 'z', 0.12 + b * 0.04, 8); lerp(this.armR, 'z', -0.12 - b * 0.04, 8);
        lerp(this.body, 'x', 0, 8);
        lerp(this.torso, 'y', Math.sin(this.t * 0.7) * 0.08, 4);
        lerp(this.head, 'y', Math.sin(this.t * 0.9 + 1) * 0.25, 3);
        this.head.rotation.z = Math.sin(this.t * 0.5) * 0.06;
      }
    } else {
      // Airborne: arms up while rising, flail when falling, legs tucked
      const rising = s.vy > 0;
      this.body.position.y = -0.75;
      lerp(this.armL, 'x', rising ? -0.4 : -0.9 + Math.sin(this.t * 22) * 0.3, 12);
      lerp(this.armR, 'x', rising ? -0.4 : -0.9 - Math.sin(this.t * 22) * 0.3, 12);
      lerp(this.armL, 'z', rising ? 2.3 : 1.3, 10); lerp(this.armR, 'z', rising ? -2.3 : -1.3, 10);
      lerp(this.legL, 'x', rising ? -0.7 : -0.25, 12);
      lerp(this.legR, 'x', rising ? 0.3 : 0.25, 12);
      lerp(this.body, 'x', rising ? -0.08 : 0.1, 6);
    }
    if (s.grounded || s.dashing) { this.head.rotation.z *= 0.9; }

    // Double-jump front flip
    if (this.flipT >= 0) {
      this.flipT += dt / 0.42;
      const e = Math.min(1, this.flipT);
      this.flip.rotation.x = (1 - Math.pow(1 - e, 3)) * Math.PI * 2;
      if (this.flipT >= 1) { this.flipT = -1; this.flip.rotation.x = 0; }
    }

    // Eyes: blink, and squint into happy arcs after collecting
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blink = 0.14; this.blinkTimer = 2 + Math.random() * 3.5; }
    this.blink = Math.max(0, this.blink - dt);
    this.happyT = Math.max(0, this.happyT - dt);
    const open = this.blink > 0 ? 0.12 : this.happyT > 0 ? 0.45 : s.dashing ? 0.7 : 1.35;
    for (const e of this.eyes) e.scale.y += (open - e.scale.y) * Math.min(1, dt * 30);

    // Core pulse + thruster
    const pulse = 1.8 + Math.sin(this.t * 5) * 0.5 + (s.dashing ? 2 : 0);
    this.coreMat.color.setRGB(0.21 * pulse, 1.0 * pulse, 0.6 * pulse);
    const thrustTarget = s.dashing ? 1 : 0;
    this.thrusterMat.opacity += (thrustTarget - this.thrusterMat.opacity) * Math.min(1, dt * 18);
    this.thruster.scale.set(1, 1 + Math.sin(this.t * 60) * 0.2, 1);
    this.thruster.visible = this.thrusterMat.opacity > 0.02;

    // Hurt flash
    if (this.hurtT > 0) {
      this.hurtT -= dt;
      this.root.visible = Math.floor(this.hurtT * 14) % 2 === 0 || this.hurtT <= 0;
      this.eyeMat.color.setRGB(2.4, 0.5, 0.4);
    } else {
      this.root.visible = true;
      this.eyeMat.color.setRGB(0.37 * 2.2, 0.97 * 2.2, 1.0 * 2.2);
    }
  }
}
