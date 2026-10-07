import * as THREE from 'three';

const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff4d2e, roughness: 0.35, metalness: 0.3 });
const baseMat = new THREE.MeshStandardMaterial({ color: 0x2b2440, roughness: 0.45, metalness: 0.6 });
const visorMat = new THREE.MeshStandardMaterial({ color: 0x15102a, roughness: 0.1, metalness: 0.5 });
const spotMat = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.4 });

type State = 'idle' | 'patrol' | 'alert' | 'chase' | 'windup' | 'lunge' | 'dizzy' | 'stunned' | 'confused' | 'return' | 'dead';

function iconSprite(draw: (g: CanvasRenderingContext2D) => void, scale = 0.6) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.setScalar(scale);
  s.visible = false;
  return s;
}

/**
 * BYTE — a cheeky little glitch-bot. Playful rather than scary:
 * idles and chirps, patrols, spots Afrobot with a surprised hop, chases,
 * winds up and lunges, gets dizzy after missing, and can be stunned by Pulse.
 * Defeated by a stomp, a dash, or by bumping it while it's stunned.
 */
export class Byte {
  readonly mesh = new THREE.Group();
  readonly pos: THREE.Vector3;
  alive = true;
  readonly radius = 0.55;
  private body = new THREE.Group();
  private eye: THREE.Mesh;
  private legs: THREE.Mesh[] = [];
  private antennae: THREE.Group[] = [];
  private eyeMat: THREE.MeshBasicMaterial;
  private alertIcon: THREE.Sprite;
  private questionIcon: THREE.Sprite;
  private stars = new THREE.Group();
  private xEyes: THREE.Group;
  private state: State = 'patrol';
  private stateT = 0;
  private waypoint = new THREE.Vector3();
  private t = Math.random() * 10;
  private heading = Math.random() * 6;
  private hopY = 0;
  private hopV = 0;
  private lungeDir = new THREE.Vector3();
  private chirpT = 2 + Math.random() * 4;
  private blinkT = 2;
  private deathT = -1;
  private deathSpin = 0;
  /** Distance-culled by the level (too far to see). */
  culled = false;
  onAlert?: () => void;
  onChirp?: () => void;
  onWindup?: () => void;

  constructor(private home: THREE.Vector3, private patrolRadius = 3.5, private leash = 7) {
    this.pos = home.clone();
    this.mesh.position.copy(this.pos);
    this.mesh.add(this.body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
    dome.position.y = 0.32; dome.scale.set(1, 0.95, 1.05); dome.castShadow = true;
    this.body.add(dome);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.42, 0.18, 20), baseMat);
    base.position.y = 0.26; base.castShadow = true;
    this.body.add(base);
    for (const [a, h] of [[0.6, 0.62], [2.2, 0.58], [3.6, 0.66], [4.9, 0.6]]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), spotMat);
      s.position.set(Math.sin(a) * 0.36, h, Math.cos(a) * 0.36 - 0.05);
      this.body.add(s);
    }
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), visorMat);
    visor.position.set(0, 0.5, 0.36); visor.scale.set(1.2, 0.9, 0.6);
    this.body.add(visor);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe14a).multiplyScalar(2.2) });
    this.eye = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), this.eyeMat);
    this.eye.position.set(0, 0.5, 0.495);
    this.body.add(this.eye);
    // X eyes for defeat
    this.xEyes = new THREE.Group();
    const bar = new THREE.BoxGeometry(0.2, 0.04, 0.01);
    for (const r of [0.8, -0.8]) { const b = new THREE.Mesh(bar, this.eyeMat); b.rotation.z = r; this.xEyes.add(b); }
    this.xEyes.position.copy(this.eye.position);
    this.xEyes.visible = false;
    this.body.add(this.xEyes);
    // Bobbly antennae on springs
    for (const x of [-0.18, 0.18]) {
      const a = new THREE.Group();
      a.position.set(x, 0.72, -0.05);
      a.rotation.z = -x * 2;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), baseMat);
      stalk.position.y = 0.17;
      a.add(stalk);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), this.eyeMat);
      tip.position.y = 0.36;
      a.add(tip);
      this.body.add(a);
      this.antennae.push(a);
    }
    const legGeo = new THREE.CylinderGeometry(0.035, 0.025, 0.36, 6);
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? 1 : -1;
      const k = (i % 3) - 1;
      const leg = new THREE.Mesh(legGeo, baseMat);
      leg.position.set(side * 0.42, 0.14, k * 0.25);
      leg.rotation.z = side * 0.7;
      leg.castShadow = true;
      this.body.add(leg);
      this.legs.push(leg);
    }
    this.alertIcon = iconSprite((g) => {
      g.fillStyle = '#ff2e55'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = '700 46px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 32, 34);
    });
    this.questionIcon = iconSprite((g) => {
      g.fillStyle = '#ffc21a'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1d1240'; g.font = '700 44px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 32, 34);
    });
    this.alertIcon.position.y = this.questionIcon.position.y = 1.5;
    this.mesh.add(this.alertIcon, this.questionIcon);
    // dizzy stars
    const starMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe14a).multiplyScalar(2) });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), starMat);
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
      this.stars.add(s);
    }
    this.stars.position.y = 1.05;
    this.stars.visible = false;
    this.mesh.add(this.stars);
    this.pickWaypoint();
  }

  /** Harmful to touch? */
  get dangerous() { return this.alive && this.state !== 'stunned' && this.state !== 'dizzy'; }
  get isStunned() { return this.alive && (this.state === 'stunned' || this.state === 'dizzy'); }

  private set(s: State) { this.state = s; this.stateT = 0; }

  private pickWaypoint() {
    const a = Math.random() * Math.PI * 2, r = Math.random() * this.patrolRadius;
    this.waypoint.set(this.home.x + Math.cos(a) * r, this.home.y, this.home.z + Math.sin(a) * r);
  }

  private hop(v: number) { if (this.hopY <= 0.001) this.hopV = v; }

  stun(seconds = 3) {
    if (!this.alive) return;
    this.set('stunned');
    this.stateT = -seconds + 3; // stunned lasts `seconds`
    this.hop(4);
  }

  update(dt: number, player: THREE.Vector3, playerActive: boolean) {
    this.t += dt;
    this.stateT += dt;
    if (!this.alive) { this.updateDeath(dt); return; }
    this.mesh.visible = !this.culled;

    const dx = player.x - this.pos.x, dz = player.z - this.pos.z;
    const distP = Math.hypot(dx, dz);
    const dyP = Math.abs(player.y - this.pos.y);
    const fromHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    const playerFromHome = Math.hypot(player.x - this.home.x, player.z - this.home.z);
    const canSee = playerActive && distP < 7.5 && dyP < 2.5 && playerFromHome < this.leash + 2;

    let tx = 0, tz = 0, speed = 0, faceTarget = true;
    switch (this.state) {
      case 'idle':
      case 'patrol': {
        if (canSee) { this.set('alert'); this.hop(5); this.onAlert?.(); break; }
        if (this.state === 'idle') {
          // look around, little chirps, then wander again
          this.heading += Math.sin(this.t * 1.5) * dt * 1.2;
          faceTarget = false;
          if (this.stateT > 1.6) { this.set('patrol'); this.pickWaypoint(); }
        } else {
          tx = this.waypoint.x - this.pos.x; tz = this.waypoint.z - this.pos.z;
          speed = 1.9;
          if (Math.hypot(tx, tz) < 0.3) { this.set('idle'); if (Math.random() < 0.5) this.hop(3); }
        }
        this.chirpT -= dt;
        if (this.chirpT <= 0) { this.chirpT = 3 + Math.random() * 5; if (distP < 14) this.onChirp?.(); this.hop(2.5); }
        break;
      }
      case 'alert':
        // surprised freeze, facing Afrobot
        tx = dx; tz = dz;
        if (this.stateT > 0.45) this.set('chase');
        break;
      case 'chase': {
        if (!canSee && (distP > 11 || !playerActive || playerFromHome > this.leash + 2.5)) { this.set('confused'); break; }
        tx = dx; tz = dz; speed = 4.6;
        if (fromHome > this.leash && (dx * (this.pos.x - this.home.x) + dz * (this.pos.z - this.home.z)) > 0) speed = 0;
        if (distP < 2.4 && dyP < 1.2) { this.set('windup'); this.onWindup?.(); }
        break;
      }
      case 'windup':
        tx = dx; tz = dz;
        if (this.stateT > 0.42) {
          this.lungeDir.set(dx, 0, dz).normalize();
          this.set('lunge');
          this.hop(6);
        }
        break;
      case 'lunge':
        this.pos.addScaledVector(this.lungeDir, 9 * dt * Math.max(0, 1 - this.stateT / 0.45));
        faceTarget = false;
        if (this.stateT > 0.5) this.set('dizzy');
        break;
      case 'dizzy':
        faceTarget = false;
        this.heading += dt * 6;
        if (this.stateT > 1.1) this.set(canSee ? 'chase' : 'confused');
        break;
      case 'stunned':
        faceTarget = false;
        this.heading += dt * 3;
        if (this.stateT > 3) this.set(canSee ? 'chase' : 'confused');
        break;
      case 'confused':
        faceTarget = false;
        this.heading += Math.sin(this.t * 3) * dt * 3;
        if (canSee && this.stateT > 0.3) { this.set('alert'); this.hop(4); this.onAlert?.(); }
        else if (this.stateT > 1.4) this.set('return');
        break;
      case 'return':
        tx = this.home.x - this.pos.x; tz = this.home.z - this.pos.z; speed = 2.6;
        if (canSee) { this.set('alert'); this.hop(4); this.onAlert?.(); }
        else if (Math.hypot(tx, tz) < 0.5) { this.set('idle'); this.pickWaypoint(); }
        break;
    }

    const l = Math.hypot(tx, tz);
    if (l > 0.01 && speed > 0) {
      this.pos.x += (tx / l) * speed * dt;
      this.pos.z += (tz / l) * speed * dt;
    }
    if (faceTarget && l > 0.01) {
      const want = Math.atan2(tx, tz);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 10);
    }
    // keep within leash so they never wander off their platform
    const fh = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    const maxR = this.leash + 0.5;
    if (fh > maxR) {
      this.pos.x = this.home.x + (this.pos.x - this.home.x) * (maxR / fh);
      this.pos.z = this.home.z + (this.pos.z - this.home.z) * (maxR / fh);
    }

    // Hop physics
    this.hopV -= 22 * dt;
    this.hopY = Math.max(0, this.hopY + this.hopV * dt);
    if (this.hopY === 0) this.hopV = Math.max(0, this.hopV);

    this.animate(dt, speed);
  }

  private animate(dt: number, speed: number) {
    const s = this.state;
    const moving = speed > 0 ? 1 : 0;
    const skitter = s === 'chase' ? Math.abs(Math.sin(this.t * 18)) * 0.1 : Math.abs(Math.sin(this.t * 10)) * 0.05 * moving;
    this.mesh.position.set(this.pos.x, this.pos.y + this.hopY + skitter, this.pos.z);
    this.mesh.rotation.y = this.heading;

    // Body language
    let sx = 1, sy = 1;
    if (s === 'windup') { const shake = Math.sin(this.t * 60) * 0.06; this.body.position.x = shake; sy = 0.75; sx = 1.18; }
    else this.body.position.x = 0;
    if (s === 'alert') { sy = 1.2 - this.stateT * 0.4; sx = 0.9; }
    if (s === 'lunge') { sy = 0.85; sx = 1.1; }
    if (this.hopY > 0.01) sy *= 1.08;
    this.body.scale.x += (sx - this.body.scale.x) * Math.min(1, dt * 18);
    this.body.scale.z = this.body.scale.x;
    this.body.scale.y += (sy - this.body.scale.y) * Math.min(1, dt * 18);
    this.body.rotation.z = s === 'dizzy' || s === 'stunned' ? Math.sin(this.t * 8) * 0.2 : Math.sin(this.t * 12) * 0.05 * moving;
    this.body.rotation.x = s === 'lunge' ? 0.4 : s === 'chase' ? 0.15 : 0;

    const legSpeed = s === 'chase' ? 30 : 15;
    this.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(this.t * legSpeed + i * 1.7) * 0.6 * (moving || s === 'windup' ? 1 : 0.1); });
    this.antennae.forEach((a, i) => { a.rotation.x = Math.sin(this.t * (s === 'chase' ? 14 : 4) + i) * 0.35; });

    // Eye: yellow & round normally, red & squinty when angry, blinking
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 1.5 + Math.random() * 3;
    const angry = s === 'chase' || s === 'windup' || s === 'lunge';
    const flash = s === 'windup' && Math.floor(this.t * 16) % 2 === 0;
    this.eyeMat.color.setRGB(angry ? 2.8 : 2.2, angry ? (flash ? 1.5 : 0.3) : 1.9, angry ? 0.3 : 0.6);
    const eyeY = this.blinkT < 0 ? 0.15 : angry ? 0.6 : s === 'alert' ? 1.4 : 1;
    this.eye.scale.set(s === 'alert' ? 1.3 : 1, eyeY, 1);
    this.eye.rotation.z = angry ? 0.3 : 0;

    this.alertIcon.visible = s === 'alert' || (s === 'chase' && this.stateT < 0.6);
    this.alertIcon.position.y = 1.5 + Math.sin(this.t * 12) * 0.05;
    this.questionIcon.visible = s === 'confused';
    this.stars.visible = s === 'dizzy' || s === 'stunned';
    this.stars.rotation.y += dt * 6;
  }

  defeat() {
    if (!this.alive) return;
    this.alive = false;
    this.deathT = 0;
    this.hopV = 7;
    this.deathSpin = (Math.random() < 0.5 ? -1 : 1) * 14;
    this.alertIcon.visible = this.questionIcon.visible = this.stars.visible = false;
    this.eye.visible = false;
    this.xEyes.visible = true;
  }

  private updateDeath(dt: number) {
    if (this.deathT < 0) return;
    this.deathT += dt;
    this.hopV -= 25 * dt;
    this.hopY = Math.max(0, this.hopY + this.hopV * dt);
    this.mesh.position.set(this.pos.x, this.pos.y + this.hopY, this.pos.z);
    if (this.deathT < 0.45) {
      this.mesh.rotation.y += this.deathSpin * dt;
    } else {
      const k = Math.min(1, (this.deathT - 0.45) / 0.35);
      this.body.scale.set(1 + k * 0.7, Math.max(0.05, 1 - k * 0.95), 1 + k * 0.7);
      if (k >= 1) { this.mesh.visible = false; this.deathT = -1; }
    }
  }
}
