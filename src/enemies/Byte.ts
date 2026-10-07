import * as THREE from 'three';

const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff4d2e, roughness: 0.35, metalness: 0.3 });
const baseMat = new THREE.MeshStandardMaterial({ color: 0x2b2440, roughness: 0.45, metalness: 0.6 });
const visorMat = new THREE.MeshStandardMaterial({ color: 0x15102a, roughness: 0.1, metalness: 0.5 });
const spotMat = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.4 });

/**
 * BYTE — a small skittering glitch-bot. Patrols, spots Afrobot, gives chase.
 * Defeated by a stomp from above or a dash.
 */
export class Byte {
  readonly mesh = new THREE.Group();
  readonly pos: THREE.Vector3;
  alive = true;
  private body = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private eyeMat: THREE.MeshBasicMaterial;
  private alert: THREE.Sprite;
  private state: 'patrol' | 'chase' | 'return' = 'patrol';
  private waypoint = new THREE.Vector3();
  private wait = 0;
  private t = Math.random() * 10;
  private heading = 0;
  private deathT = -1;
  private alertT = 0;
  readonly radius = 0.55;
  onAlert?: () => void;

  constructor(private home: THREE.Vector3, private patrolRadius = 3.5, private leash = 7) {
    this.pos = home.clone();
    this.mesh.position.copy(this.pos);
    this.mesh.add(this.body);
    // Dome body
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
    dome.position.y = 0.32;
    dome.scale.set(1, 0.95, 1.05);
    dome.castShadow = true;
    this.body.add(dome);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.42, 0.18, 20), baseMat);
    base.position.y = 0.26;
    base.castShadow = true;
    this.body.add(base);
    // yellow spots
    for (const [a, h] of [[0.6, 0.62], [2.2, 0.58], [3.6, 0.66], [4.9, 0.6]]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), spotMat);
      s.position.set(Math.sin(a) * 0.36, h, Math.cos(a) * 0.36 - 0.05);
      this.body.add(s);
    }
    // Single big eye
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), visorMat);
    visor.position.set(0, 0.5, 0.36);
    visor.scale.set(1.2, 0.9, 0.6);
    this.body.add(visor);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe14a).multiplyScalar(2.2) });
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), this.eyeMat);
    eye.position.set(0, 0.5, 0.495);
    this.body.add(eye);
    // Antennae
    for (const x of [-0.18, 0.18]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), baseMat);
      ant.position.set(x, 0.85, -0.05);
      ant.rotation.z = -x * 2;
      this.body.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), this.eyeMat);
      tip.position.set(x * 1.6, 1.02, -0.05);
      this.body.add(tip);
    }
    // Six skitter legs
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
    // "!" alert sprite
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ff2e55'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = '700 46px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.alert = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    this.alert.scale.setScalar(0.6);
    this.alert.position.y = 1.5;
    this.alert.visible = false;
    this.mesh.add(this.alert);
    this.pickWaypoint();
  }

  private pickWaypoint() {
    const a = Math.random() * Math.PI * 2, r = Math.random() * this.patrolRadius;
    this.waypoint.set(this.home.x + Math.cos(a) * r, this.home.y, this.home.z + Math.sin(a) * r);
  }

  update(dt: number, player: THREE.Vector3, playerActive: boolean) {
    this.t += dt;
    if (!this.alive) {
      if (this.deathT >= 0) {
        this.deathT += dt;
        const k = this.deathT / 0.5;
        this.body.scale.set(1 + k * 0.8, Math.max(0.05, 1 - k * 1.8), 1 + k * 0.8);
        if (k >= 1) { this.mesh.visible = false; this.deathT = -1; }
      }
      return;
    }

    const dx = player.x - this.pos.x, dz = player.z - this.pos.z;
    const distP = Math.hypot(dx, dz);
    const dyP = Math.abs(player.y - this.pos.y);
    const fromHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    const playerFromHome = Math.hypot(player.x - this.home.x, player.z - this.home.z);

    if (this.state !== 'chase' && playerActive && distP < 7 && dyP < 2.5 && playerFromHome < this.leash + 2) {
      this.state = 'chase';
      this.alertT = 0.9;
      this.onAlert?.();
    } else if (this.state === 'chase' && (!playerActive || distP > 11 || dyP > 4 || playerFromHome > this.leash + 2.5)) {
      this.state = 'return';
    }

    let tx = 0, tz = 0, speed = 0;
    if (this.state === 'chase') {
      tx = dx; tz = dz; speed = 4.4;
      if (fromHome > this.leash && (dx * (this.pos.x - this.home.x) + dz * (this.pos.z - this.home.z)) > 0) speed = 0;
    } else if (this.state === 'return') {
      tx = this.home.x - this.pos.x; tz = this.home.z - this.pos.z; speed = 2.6;
      if (Math.hypot(tx, tz) < 0.5) { this.state = 'patrol'; this.pickWaypoint(); }
    } else {
      tx = this.waypoint.x - this.pos.x; tz = this.waypoint.z - this.pos.z;
      if (this.wait > 0) { this.wait -= dt; speed = 0; }
      else if (Math.hypot(tx, tz) < 0.3) { this.wait = 0.6 + Math.random() * 1.2; this.pickWaypoint(); }
      else speed = 1.8;
    }

    const l = Math.hypot(tx, tz);
    if (l > 0.01 && speed > 0) {
      this.pos.x += (tx / l) * speed * dt;
      this.pos.z += (tz / l) * speed * dt;
      const want = Math.atan2(tx, tz);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 10);
    }

    // Animate
    const moving = speed > 0 ? 1 : 0;
    const hop = this.state === 'chase' ? Math.abs(Math.sin(this.t * 16)) * 0.12 : Math.abs(Math.sin(this.t * 9)) * 0.05 * moving;
    this.mesh.position.set(this.pos.x, this.pos.y + hop, this.pos.z);
    this.mesh.rotation.y = this.heading;
    this.body.rotation.z = Math.sin(this.t * 12) * 0.05 * moving;
    this.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(this.t * (this.state === 'chase' ? 26 : 14) + i * 1.7) * 0.5 * moving; });
    const angry = this.state === 'chase';
    this.eyeMat.color.setRGB(angry ? 2.6 : 2.2, angry ? 0.3 : 1.9, angry ? 0.3 : 0.6);

    this.alertT = Math.max(0, this.alertT - dt);
    this.alert.visible = this.alertT > 0;
    this.alert.position.y = 1.5 + Math.sin(this.alertT * 12) * 0.08;
  }

  defeat() {
    this.alive = false;
    this.deathT = 0;
    this.alert.visible = false;
  }
}
