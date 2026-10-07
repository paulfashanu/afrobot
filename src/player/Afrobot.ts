import * as THREE from 'three';
import { kenteTexture } from '../core/Textures';

export interface AnimState {
  speed: number;        // horizontal speed
  grounded: boolean;
  vy: number;
  dashing: boolean;
  dashReady: boolean;
  turnRate: number;     // facing change per second (for leaning into turns)
}

export type Mood = 'normal' | 'happy' | 'squint' | 'wide' | 'hurt' | 'closed';
type Pose = 'play' | 'victory' | 'lookAround' | 'frozen';

const BPM = 108;

/**
 * AFROBOT — procedural character model + animation.
 * Silhouette: oversized round head with a puffy violet afro dome and gold afro-pick
 * antenna, big visor eyes, tiny cream body with a kente scarf + waistband, stubby legs
 * and a glowing energy-core backpack.
 */
export class Afrobot {
  readonly root = new THREE.Group();     // positioned at the feet; yaw applied here
  private flip = new THREE.Group();      // double-jump flip / victory spin (pivot at centre)
  private body = new THREE.Group();      // squash/stretch + lean (origin at feet)
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private eyesGroup = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private pick = new THREE.Group();
  private scarf: THREE.Group[] = [];
  private eyes: { group: THREE.Group; oval: THREE.Mesh; shine: THREE.Mesh; arc: THREE.Mesh; x: THREE.Group }[] = [];
  private blush: THREE.Mesh[] = [];
  private eyeMat: THREE.MeshBasicMaterial;
  private coreMat: THREE.MeshBasicMaterial;
  private blushMat: THREE.MeshBasicMaterial;
  private thrusterMat: THREE.MeshBasicMaterial;
  private thruster: THREE.Mesh;

  private t = 0;
  private phase = 0;
  private squash = 1;
  private squashVel = 0;
  private blinkTimer = 2.5;
  private blink = 0;
  private flipT = -1;
  private happyT = 0;
  private hurtT = 0;
  private landT = 0;
  private idleT = 0;
  private lookYaw = 0;
  private lookTimer = 2;
  private lookTarget = 0;
  private pickAngle = 0;
  private pickVel = 0;
  private scarfAngle = 0;
  private scarfVel = 0;
  private prevSpeed = 0;
  private pose: Pose = 'play';
  private poseT = 0;
  private mood: Mood = 'normal';

  constructor() {
    const shell = new THREE.MeshStandardMaterial({ color: 0xfff3e2, roughness: 0.28, metalness: 0.05 });
    const shellDark = new THREE.MeshStandardMaterial({ color: 0x3b3550, roughness: 0.45, metalness: 0.35 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf5b52a, roughness: 0.28, metalness: 0.8 });
    const afro = new THREE.MeshStandardMaterial({ color: 0x5b2ab8, roughness: 0.42, metalness: 0.3 });
    const afroHi = new THREE.MeshStandardMaterial({ color: 0x8150e8, roughness: 0.38, metalness: 0.3 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x0d0b1a, roughness: 0.08, metalness: 0.7 });
    const kenteTex = kenteTexture();
    const kente = new THREE.MeshStandardMaterial({ map: kenteTex, roughness: 0.6 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ff7ff).multiplyScalar(2.4) });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x35ff9a).multiplyScalar(2.4) });
    this.blushMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6fae).multiplyScalar(1.6), transparent: true, opacity: 0 });
    this.thrusterMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7affd0).multiplyScalar(3), transparent: true, opacity: 0, depthWrite: false });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, p: [number, number, number], s?: [number, number, number], r?: [number, number, number]) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(...p);
      if (s) o.scale.set(...s);
      if (r) o.rotation.set(...r);
      o.castShadow = true;
      parent.add(o);
      return o;
    };

    const sph = new THREE.SphereGeometry(1, 28, 18);
    const sphLo = new THREE.SphereGeometry(1, 14, 10);
    const cap = new THREE.CapsuleGeometry(1, 1, 6, 12);

    this.root.add(this.flip);
    this.flip.position.y = 0.8;
    this.flip.add(this.body);
    this.body.position.y = -0.8;
    this.body.add(this.hips);

    // --- Stubby legs (pivot at hip) ---
    for (const [leg, x] of [[this.legL, 0.15], [this.legR, -0.15]] as const) {
      leg.position.set(x, 0.38, 0);
      this.hips.add(leg);
      mesh(cap, shellDark, leg, [0, -0.11, 0], [0.08, 0.07, 0.08]);
      mesh(sphLo, gold, leg, [0, -0.27, 0.05], [0.15, 0.11, 0.2]);
      mesh(sphLo, shell, leg, [0, -0.33, 0.05], [0.16, 0.05, 0.21]);
    }

    // --- Small round torso ---
    this.torso.position.y = 0.38;
    this.hips.add(this.torso);
    mesh(sph, shell, this.torso, [0, 0.22, 0], [0.29, 0.26, 0.26]);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.27, 0.1, 28, 1, true), kente);
    band.position.y = 0.1;
    band.castShadow = true;
    this.torso.add(band);
    mesh(new THREE.ConeGeometry(0.055, 0.08, 3), this.coreMat, this.torso, [0, 0.27, 0.262], [1, 1, 0.4], [Math.PI / 2, 0, Math.PI]);

    // --- Backpack / energy core ---
    const pack = new THREE.Group();
    pack.position.set(0, 0.24, -0.22);
    this.torso.add(pack);
    mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.32, 16), gold, pack, [0, 0, -0.04]);
    mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.27, 16), this.coreMat, pack, [0, 0, -0.1]);
    mesh(sphLo, shellDark, pack, [0, 0.17, -0.05], [0.14, 0.045, 0.14]);
    mesh(sphLo, shellDark, pack, [0, -0.17, -0.05], [0.14, 0.045, 0.14]);
    for (const x of [-0.15, 0.15]) mesh(new THREE.BoxGeometry(0.035, 0.22, 0.12), afro, pack, [x, 0.02, -0.06], undefined, [0, 0, x > 0 ? -0.2 : 0.2]);
    this.thruster = mesh(new THREE.ConeGeometry(0.08, 0.5, 12, 1, true), this.thrusterMat, pack, [0, -0.42, -0.08], undefined, [Math.PI, 0, 0]);
    this.thruster.castShadow = false;

    // --- Arms with chunky mitten hands (pivot at shoulder) ---
    for (const [arm, x] of [[this.armL, 0.31], [this.armR, -0.31]] as const) {
      arm.position.set(x, 0.33, 0);
      this.torso.add(arm);
      mesh(sphLo, gold, arm, [0, 0, 0], [0.085, 0.085, 0.085]);
      mesh(cap, shell, arm, [Math.sign(x) * 0.02, -0.13, 0], [0.06, 0.07, 0.06]);
      mesh(sphLo, gold, arm, [Math.sign(x) * 0.03, -0.29, 0.02], [0.1, 0.1, 0.1]);
    }

    // --- Kente scarf: knot at the neck + two swinging tails ---
    mesh(new THREE.TorusGeometry(0.15, 0.05, 8, 20), kente, this.torso, [0, 0.47, 0], undefined, [Math.PI / 2, 0, 0]);
    let parent: THREE.Object3D = this.torso;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group();
      seg.position.set(i === 0 ? 0.07 : 0, i === 0 ? 0.45 : -0.11, i === 0 ? -0.15 : 0);
      parent.add(seg);
      mesh(new THREE.BoxGeometry(0.1, 0.12, 0.025), kente, seg, [0, -0.055, 0]);
      this.scarf.push(seg);
      parent = seg;
    }

    // --- Big head ---
    this.head.position.y = 0.5;
    this.torso.add(this.head);
    mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.1, 12), shellDark, this.head, [0, 0, 0]);
    const skull = new THREE.Group();
    skull.position.y = 0.33;
    this.head.add(skull);
    mesh(sph, shell, skull, [0, 0, 0], [0.47, 0.39, 0.42]);
    mesh(sph, visor, skull, [0, -0.02, 0.15], [0.39, 0.29, 0.29]);

    // Eyes live on a group we can nudge for "look" direction
    skull.add(this.eyesGroup);
    this.eyesGroup.position.set(0, -0.01, 0);
    const ovalGeo = new THREE.CircleGeometry(0.085, 28);
    const shineGeo = new THREE.CircleGeometry(0.025, 12);
    const arcGeo = new THREE.TorusGeometry(0.07, 0.02, 6, 16, Math.PI);
    const barGeo = new THREE.BoxGeometry(0.14, 0.03, 0.01);
    for (const x of [0.14, -0.14]) {
      const g = new THREE.Group();
      g.position.set(x, 0, 0.432 - Math.abs(x) * 0.18);
      g.rotation.y = x * 1.7;
      this.eyesGroup.add(g);
      const oval = new THREE.Mesh(ovalGeo, this.eyeMat);
      oval.scale.set(1, 1.3, 1);
      g.add(oval);
      const shine = new THREE.Mesh(shineGeo, white);
      shine.position.set(0.03, 0.045, 0.002);
      g.add(shine);
      const arc = new THREE.Mesh(arcGeo, this.eyeMat);
      arc.visible = false;
      g.add(arc);
      const xg = new THREE.Group();
      const b1 = new THREE.Mesh(barGeo, this.eyeMat); b1.rotation.z = 0.8;
      const b2 = new THREE.Mesh(barGeo, this.eyeMat); b2.rotation.z = -0.8;
      xg.add(b1, b2);
      xg.visible = false;
      g.add(xg);
      this.eyes.push({ group: g, oval, shine, arc, x: xg });
      const bl = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), this.blushMat);
      bl.position.set(x * 1.45, -0.12, 0.37);
      bl.rotation.y = x * 2.6;
      skull.add(bl);
      this.blush.push(bl);
    }
    // Ear pods with glowing rings
    for (const x of [0.46, -0.46]) {
      mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.09, 18), gold, skull, [x, 0, 0], undefined, [0, 0, Math.PI / 2]);
      mesh(new THREE.TorusGeometry(0.075, 0.016, 6, 18), this.coreMat, skull, [x * 1.11, 0, 0], undefined, [0, Math.PI / 2, 0]);
    }
    // The afro: clustered spheres forming a big puffy dome
    const afroBits: [number, number, number, number][] = [
      [0, 0.28, -0.06, 0.34], [0.24, 0.23, -0.05, 0.25], [-0.24, 0.23, -0.05, 0.25],
      [0.14, 0.38, 0.08, 0.22], [-0.14, 0.38, 0.08, 0.22], [0, 0.42, -0.2, 0.27],
      [0.26, 0.13, -0.2, 0.22], [-0.26, 0.13, -0.2, 0.22], [0, 0.16, -0.32, 0.25],
      [0.32, 0.34, -0.14, 0.17], [-0.32, 0.34, -0.14, 0.17], [0, 0.51, 0.0, 0.19],
      [0.17, 0.5, -0.14, 0.17], [-0.17, 0.5, -0.14, 0.17],
    ];
    afroBits.forEach(([x, y, z, r], i) => mesh(sphLo, i % 3 === 0 ? afroHi : afro, skull, [x, y, z], [r, r, r]));
    // Afro-pick antenna on a spring
    this.pick.position.set(0.18, 0.5, -0.2);
    this.pick.rotation.set(-0.5, 0, -0.35);
    skull.add(this.pick);
    mesh(new THREE.BoxGeometry(0.035, 0.36, 0.03), gold, this.pick, [0, 0.18, 0]);
    mesh(new THREE.BoxGeometry(0.17, 0.045, 0.03), gold, this.pick, [0, 0.38, 0]);
    for (let i = -2; i <= 2; i++) mesh(new THREE.BoxGeometry(0.018, 0.065, 0.02), gold, this.pick, [i * 0.037, 0.42, 0]);
    mesh(sphLo, this.coreMat, this.pick, [0, 0.49, 0], [0.05, 0.05, 0.05]);
  }

  // ---------- triggers ----------
  /** Called on land with the impact speed to squash. */
  land(impact: number) {
    this.squashVel -= Math.min(impact, 28) * 0.55;
    this.landT = Math.min(0.25, impact * 0.012);
    this.pickVel += impact * 0.4;
  }
  jump() { this.squashVel += 7; this.pickVel -= 6; }
  doubleJump() { this.flipT = 0; this.squashVel += 5; }
  happy(d = 1.0) { this.happyT = Math.max(this.happyT, d); }
  hurt() { this.hurtT = 1.2; this.pickVel += 10; }
  dash() { this.squashVel -= 3; this.pickVel -= 12; }
  setPose(p: Pose) { this.pose = p; this.poseT = 0; this.flipT = -1; this.flip.rotation.set(0, 0, 0); }

  update(dt: number, s: AnimState) {
    this.t += dt;
    this.poseT += dt;
    const run = THREE.MathUtils.clamp(s.speed / 9.5, 0, 1.2);
    const lerp = (o: THREE.Object3D, ax: 'x' | 'y' | 'z', v: number, sp = 14) => {
      o.rotation[ax] += (v - o.rotation[ax]) * Math.min(1, dt * sp);
    };

    // Squash & stretch spring (stretch with vertical speed while airborne)
    const k = 280, damp = 15;
    this.squashVel += ((1 - this.squash) * k - this.squashVel * damp) * dt;
    this.squash += this.squashVel * dt;
    let sy = this.squash;
    if (!s.grounded && !s.dashing) sy *= 1 + THREE.MathUtils.clamp(Math.abs(s.vy) * 0.009, 0, 0.12);
    const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
    this.body.scale.set(sxz, sy, s.dashing ? sxz * 1.3 : sxz);
    this.landT = Math.max(0, this.landT - dt);

    let mood: Mood = 'normal';
    let headYaw = 0, headPitch = 0;
    let eyeX = 0, eyeY = 0;
    this.torso.scale.y = 1;

    if (this.pose === 'victory') {
      // Hop, spin, cheer!
      const T = this.poseT;
      const hop = Math.abs(Math.sin(T * 5.5)) * 0.35 * (T < 2.4 ? 1 : 0.5);
      this.body.position.y = -0.8 + hop;
      this.flip.rotation.y = T < 0.7 ? (T / 0.7) * Math.PI * 4 : 0;
      lerp(this.armL, 'z', 2.6 + Math.sin(T * 11) * 0.3, 18); lerp(this.armR, 'z', -2.6 - Math.sin(T * 11 + 1) * 0.3, 18);
      lerp(this.armL, 'x', 0, 10); lerp(this.armR, 'x', 0, 10);
      lerp(this.legL, 'x', hop > 0.1 ? -0.5 : 0, 16); lerp(this.legR, 'x', hop > 0.1 ? 0.3 : 0, 16);
      lerp(this.body, 'x', -0.1, 8);
      headPitch = -0.25;
      headYaw = Math.sin(T * 3) * 0.2;
      mood = 'happy';
      this.happyT = 1;
    } else if (this.pose === 'lookAround') {
      // Intro: look left, look right, then a cheerful wave
      const T = this.poseT;
      this.body.position.y = -0.8 + Math.sin(this.t * 2.4) * 0.012;
      headYaw = T < 0.9 ? 0.75 : T < 1.8 ? -0.75 : 0;
      eyeX = Math.sign(headYaw) * 0.03;
      lerp(this.armL, 'x', 0, 8); lerp(this.legL, 'x', 0, 10); lerp(this.legR, 'x', 0, 10);
      lerp(this.armL, 'z', 0.15, 8);
      if (T > 1.8) {
        lerp(this.armR, 'z', -2.5 + Math.sin(T * 14) * 0.35, 18);
        lerp(this.armR, 'x', -0.2, 10);
        mood = 'happy';
      } else {
        lerp(this.armR, 'z', -0.15, 8); lerp(this.armR, 'x', 0, 8);
        mood = T % 0.9 > 0.6 ? 'wide' : 'normal';
      }
      lerp(this.body, 'x', 0, 8);
    } else if (this.pose === 'frozen') {
      // hold still (used during hit-stop / transitions)
    } else if (s.dashing) {
      this.idleT = 0;
      lerp(this.body, 'x', 0.6, 22);
      lerp(this.armL, 'x', 1.3, 22); lerp(this.armR, 'x', 1.3, 22);
      lerp(this.armL, 'z', 0.5, 22); lerp(this.armR, 'z', -0.5, 22);
      lerp(this.legL, 'x', 0.7, 22); lerp(this.legR, 'x', 0.5, 22);
      this.body.position.y = -0.8;
      mood = 'squint';
    } else if (s.grounded) {
      if (run > 0.05) {
        this.idleT = 0;
        this.phase += dt * (7 + s.speed * 1.0);
        const sw = Math.sin(this.phase);
        lerp(this.legL, 'x', sw * 1.0 * run, 30);
        lerp(this.legR, 'x', -sw * 1.0 * run, 30);
        lerp(this.armL, 'x', -sw * 1.0 * run, 30);
        lerp(this.armR, 'x', sw * 1.0 * run, 30);
        lerp(this.armL, 'z', 0.2, 10); lerp(this.armR, 'z', -0.2, 10);
        lerp(this.body, 'x', 0.2 * run, 10);
        lerp(this.body, 'z', THREE.MathUtils.clamp(-s.turnRate * 0.06, -0.35, 0.35) * run, 8);
        this.body.position.y = -0.8 + Math.abs(Math.cos(this.phase)) * 0.09 * run - this.landT * 0.4;
        lerp(this.torso, 'y', sw * 0.14 * run, 20);
        headYaw = -sw * 0.12 * run + THREE.MathUtils.clamp(s.turnRate * 0.08, -0.4, 0.4);
        headPitch = -0.05;
      } else {
        // Idle: breathing, look around; after a while, a little Afrobeats shuffle
        this.idleT += dt;
        const breathe = Math.sin(this.t * 2.2);
        lerp(this.body, 'z', 0, 8);
        lerp(this.body, 'x', 0, 8);
        if (this.idleT > 6) {
          const beat = this.t * (BPM / 60) * Math.PI;
          const b = Math.abs(Math.sin(beat));
          this.body.position.y = -0.8 + b * 0.06;
          lerp(this.torso, 'y', Math.sin(beat * 0.5) * 0.3, 10);
          lerp(this.armL, 'x', -0.6 - b * 0.5, 14); lerp(this.armR, 'x', -0.6 - (1 - b) * 0.5, 14);
          lerp(this.armL, 'z', 0.5, 10); lerp(this.armR, 'z', -0.5, 10);
          lerp(this.legL, 'x', Math.sin(beat) * 0.25, 14); lerp(this.legR, 'x', -Math.sin(beat) * 0.25, 14);
          headYaw = Math.sin(beat * 0.5) * 0.25;
          headPitch = -b * 0.1;
          mood = 'happy';
        } else {
          this.body.position.y = -0.8 + breathe * 0.012 - this.landT * 0.4;
          this.torso.scale.y = 1 + breathe * 0.025;
          lerp(this.legL, 'x', 0, 10); lerp(this.legR, 'x', 0, 10);
          lerp(this.armL, 'x', breathe * 0.06, 8); lerp(this.armR, 'x', -breathe * 0.06, 8);
          lerp(this.armL, 'z', 0.14 + breathe * 0.04, 8); lerp(this.armR, 'z', -0.14 - breathe * 0.04, 8);
          lerp(this.torso, 'y', Math.sin(this.t * 0.7) * 0.06, 4);
          this.lookTimer -= dt;
          if (this.lookTimer <= 0) { this.lookTarget = (Math.random() - 0.5) * 1.3; this.lookTimer = 1.2 + Math.random() * 2.2; }
          headYaw = this.lookTarget;
          headPitch = Math.sin(this.t * 0.6) * 0.06;
          eyeX = THREE.MathUtils.clamp(this.lookTarget * 0.04, -0.03, 0.03);
        }
      }
    } else {
      // Airborne: arms up while rising, flail + wide eyes when falling, legs tucked/dangling
      this.idleT = 0;
      const rising = s.vy > 1;
      const falling = s.vy < -6;
      this.body.position.y = -0.8;
      lerp(this.body, 'z', 0, 8);
      if (rising) {
        lerp(this.armL, 'x', -0.3, 14); lerp(this.armR, 'x', -0.3, 14);
        lerp(this.armL, 'z', 2.4, 12); lerp(this.armR, 'z', -2.4, 12);
        lerp(this.legL, 'x', -0.8, 14); lerp(this.legR, 'x', 0.35, 14);
        lerp(this.body, 'x', -0.08, 6);
        headPitch = -0.15;
      } else if (falling) {
        const f = Math.sin(this.t * 24);
        lerp(this.armL, 'x', -0.6 + f * 0.4, 16); lerp(this.armR, 'x', -0.6 - f * 0.4, 16);
        lerp(this.armL, 'z', 1.8, 12); lerp(this.armR, 'z', -1.8, 12);
        lerp(this.legL, 'x', 0.3 + f * 0.25, 14); lerp(this.legR, 'x', 0.3 - f * 0.25, 14);
        lerp(this.body, 'x', 0.12, 6);
        headPitch = 0.25;
        eyeY = -0.03;
        mood = 'wide';
      } else {
        // apex: little float
        lerp(this.armL, 'z', 1.4, 10); lerp(this.armR, 'z', -1.4, 10);
        lerp(this.legL, 'x', -0.3, 10); lerp(this.legR, 'x', 0.1, 10);
        headPitch = 0.1;
      }
    }
    if (this.pose !== 'victory') this.flip.rotation.y = 0;

    // Head look (smoothed) + secondary bob
    this.lookYaw += (headYaw - this.lookYaw) * Math.min(1, dt * 8);
    this.head.rotation.y = this.lookYaw;
    lerp(this.head, 'x', headPitch, 8);
    this.head.rotation.z = this.hurtT > 0 ? Math.sin(this.t * 30) * 0.15 * this.hurtT : Math.sin(this.t * 0.5) * 0.04;
    this.eyesGroup.position.x += (eyeX + this.lookYaw * 0.02 - this.eyesGroup.position.x) * Math.min(1, dt * 10);
    this.eyesGroup.position.y += (eyeY - this.eyesGroup.position.y) * Math.min(1, dt * 10);

    // Double-jump front flip
    if (this.flipT >= 0) {
      this.flipT += dt / 0.4;
      const e = Math.min(1, this.flipT);
      this.flip.rotation.x = (1 - Math.pow(1 - e, 3)) * Math.PI * 2;
      if (this.flipT >= 1) { this.flipT = -1; this.flip.rotation.x = 0; }
    }

    // Antenna spring reacts to acceleration
    const accel = (s.speed - this.prevSpeed) / Math.max(dt, 1e-3);
    this.prevSpeed = s.speed;
    this.pickVel += (-this.pickAngle * 160 - this.pickVel * 9 - accel * 0.02 + (s.grounded ? 0 : s.vy * 0.05)) * dt;
    this.pickAngle += this.pickVel * dt;
    this.pick.rotation.x = -0.5 + THREE.MathUtils.clamp(this.pickAngle, -0.8, 0.8);

    // Scarf trails behind with speed / bounces with vertical motion
    const scarfTarget = -Math.min(1.3, s.speed * 0.11) - (s.grounded ? 0 : THREE.MathUtils.clamp(s.vy * 0.04, -0.6, 0.6)) - (s.dashing ? 0.4 : 0);
    this.scarfVel += ((scarfTarget - this.scarfAngle) * 90 - this.scarfVel * 8) * dt;
    this.scarfAngle += this.scarfVel * dt;
    this.scarf.forEach((seg, i) => {
      seg.rotation.x = -(this.scarfAngle * (i === 0 ? 0.6 : 0.35)) + Math.sin(this.t * 9 + i) * 0.06 * (0.3 + run);
      seg.rotation.z = Math.sin(this.t * 5 + i * 0.8) * 0.08;
    });

    // Eyes: mood shapes + blink
    if (this.hurtT > 0) mood = 'hurt';
    else if (this.happyT > 0 && mood === 'normal') mood = 'happy';
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blink = 0.13; this.blinkTimer = 2 + Math.random() * 3.5; }
    this.blink = Math.max(0, this.blink - dt);
    if (this.blink > 0 && mood === 'normal') mood = 'closed';
    this.happyT = Math.max(0, this.happyT - dt);
    this.applyMood(mood, dt);

    // Core pulse: green when dash is ready, dim amber while recharging
    const pulse = 1.8 + Math.sin(this.t * 5) * 0.5 + (s.dashing ? 2 : 0);
    if (s.dashReady) this.coreMat.color.setRGB(0.21 * pulse, 1.0 * pulse, 0.6 * pulse);
    else this.coreMat.color.setRGB(1.2, 0.55, 0.15);
    this.thrusterMat.opacity += ((s.dashing ? 1 : 0) - this.thrusterMat.opacity) * Math.min(1, dt * 18);
    this.thruster.scale.set(1, 1 + Math.sin(this.t * 60) * 0.2, 1);
    this.thruster.visible = this.thrusterMat.opacity > 0.02;

    // Hurt flash
    if (this.hurtT > 0) {
      this.hurtT -= dt;
      this.root.visible = Math.floor(this.hurtT * 14) % 2 === 0 || this.hurtT <= 0;
    } else {
      this.root.visible = true;
    }
  }

  private applyMood(mood: Mood, dt: number) {
    if (mood !== this.mood) this.mood = mood;
    const sp = Math.min(1, dt * 28);
    let sy = 1.3, sx = 1, tilt = 0;
    const arc = mood === 'happy';
    const x = mood === 'hurt';
    switch (mood) {
      case 'closed': sy = 0.1; break;
      case 'squint': sy = 0.55; sx = 1.1; tilt = 0.25; break;
      case 'wide': sy = 1.55; sx = 1.2; break;
    }
    this.eyes.forEach((e, i) => {
      e.oval.visible = e.shine.visible = !arc && !x;
      e.arc.visible = arc;
      e.x.visible = x;
      e.oval.scale.y += (sy - e.oval.scale.y) * sp;
      e.oval.scale.x += (sx - e.oval.scale.x) * sp;
      e.oval.rotation.z = tilt * (i === 0 ? -1 : 1);
    });
    const blushTarget = arc ? 0.85 : 0;
    this.blushMat.opacity += (blushTarget - this.blushMat.opacity) * Math.min(1, dt * 8);
    const c = x ? [2.6, 0.6, 0.5] : [0.37 * 2.4, 0.97 * 2.4, 1.0 * 2.4];
    this.eyeMat.color.setRGB(c[0], c[1], c[2]);
  }
}
