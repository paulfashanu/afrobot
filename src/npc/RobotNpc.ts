import * as THREE from 'three';
import { Solid } from '../core/Physics';
import type { Interactable } from '../world/Interactive';

export type NpcType = 'lagos' | 'market';

/** Draws a pixel face on the robot's screen. */
function faceTexture(): { tex: THREE.CanvasTexture; draw: (mood: 'idle' | 'happy' | 'talk' | 'blink', t: number) => void } {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 48;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const draw = (mood: 'idle' | 'happy' | 'talk' | 'blink', t: number) => {
    g.fillStyle = '#0b1a24'; g.fillRect(0, 0, 64, 48);
    g.fillStyle = '#7dffb2';
    if (mood === 'blink') { g.fillRect(14, 20, 10, 3); g.fillRect(40, 20, 10, 3); }
    else if (mood === 'happy') { for (const x of [14, 40]) { g.fillRect(x, 20, 3, 3); g.fillRect(x + 3, 17, 4, 3); g.fillRect(x + 7, 20, 3, 3); } }
    else { g.fillRect(15, 14, 8, 10); g.fillRect(41, 14, 8, 10); }
    // mouth
    if (mood === 'talk') { const o = Math.abs(Math.sin(t * 18)) * 6; g.fillRect(26, 32, 12, 2 + o); }
    else if (mood === 'happy') { g.fillRect(24, 32, 16, 3); g.fillRect(22, 30, 3, 3); g.fillRect(39, 30, 3, 3); }
    else g.fillRect(27, 33, 10, 2);
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

/**
 * Friendly robot citizens. They idle, look around, turn to face Afrobot,
 * wave when Afrobot comes close, and talk when you press E.
 */
export class RobotNpc implements Interactable {
  readonly mesh = new THREE.Group();
  readonly solid: Solid;
  readonly position: THREE.Vector3;
  readonly interactRadius = 3;
  readonly prompt = 'TALK';
  talking = false;
  private head = new THREE.Group();
  private armR = new THREE.Group();
  private armL = new THREE.Group();
  private bubble: THREE.Sprite;
  private face: ReturnType<typeof faceTexture>;
  private t = Math.random() * 10;
  private yaw: number;
  private lookT = 0;
  private lookTarget = 0;
  private waveT = 0;
  private greeted = false;
  private faceAcc = 0;

  constructor(readonly type: NpcType, x: number, y: number, z: number, yaw: number, public dialogueKey: string) {
    this.position = new THREE.Vector3(x, y, z);
    this.yaw = yaw;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = yaw;
    this.face = faceTexture();
    this.face.draw('idle', 0);

    const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], s: [number, number, number] = [1, 1, 1], r: [number, number, number] = [0, 0, 0]) => {
      const o = new THREE.Mesh(g, m); o.position.set(...p); o.scale.set(...s); o.rotation.set(...r); o.castShadow = true; parent.add(o); return o;
    };
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2440, roughness: 0.45, metalness: 0.5 });
    const screenMat = new THREE.MeshBasicMaterial({ map: this.face.tex, color: new THREE.Color(1.5, 1.5, 1.5) });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const sph = new THREE.SphereGeometry(1, 16, 12);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 16);

    let headY: number;
    if (type === 'lagos') {
      // Tall slim local in danfo yellow with black stripes and a long antenna
      const yellow = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.35, metalness: 0.2 });
      add(this.mesh, cyl, dark, [-0.18, 0.45, 0], [0.09, 0.9, 0.09]);
      add(this.mesh, cyl, dark, [0.18, 0.45, 0], [0.09, 0.9, 0.09]);
      add(this.mesh, sph, dark, [-0.18, 0.05, 0.06], [0.16, 0.08, 0.22]);
      add(this.mesh, sph, dark, [0.18, 0.05, 0.06], [0.16, 0.08, 0.22]);
      add(this.mesh, box, yellow, [0, 1.35, 0], [0.75, 0.95, 0.5]);
      add(this.mesh, box, dark, [0, 1.25, 0], [0.77, 0.08, 0.52]);
      add(this.mesh, box, dark, [0, 1.45, 0], [0.77, 0.08, 0.52]);
      headY = 2.05;
      this.head.position.y = headY;
      this.mesh.add(this.head);
      add(this.head, box, yellow, [0, 0.25, 0], [0.75, 0.55, 0.55]);
      add(this.head, new THREE.PlaneGeometry(0.62, 0.42), screenMat, [0, 0.25, 0.28]);
      add(this.head, cyl, dark, [0.25, 0.75, 0], [0.02, 0.5, 0.02]);
      add(this.head, sph, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5fa2).multiplyScalar(2) }), [0.25, 1.02, 0], [0.07, 0.07, 0.07]);
      for (const [arm, sx] of [[this.armL, 1], [this.armR, -1]] as const) {
        arm.position.set(sx * 0.45, 1.75, 0);
        this.mesh.add(arm);
        add(arm, cyl, dark, [0, -0.35, 0], [0.06, 0.7, 0.06]);
        add(arm, sph, yellow, [0, -0.72, 0], [0.11, 0.11, 0.11]);
      }
    } else {
      // Boxy vendor on a single wheel, striped apron, basket of goods
      const teal = new THREE.MeshStandardMaterial({ color: 0x19b3a5, roughness: 0.4, metalness: 0.25 });
      const apronTex = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#ff5fa2'; for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 8, 64);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
      })();
      add(this.mesh, cyl, dark, [0, 0.28, 0], [0.28, 0.16, 0.28], [0, 0, Math.PI / 2]);
      add(this.mesh, box, teal, [0, 1.0, 0], [0.95, 1.0, 0.8]);
      add(this.mesh, new THREE.PlaneGeometry(0.75, 0.7), new THREE.MeshStandardMaterial({ map: apronTex, roughness: 0.8 }), [0, 0.92, 0.41]);
      add(this.mesh, cyl, new THREE.MeshStandardMaterial({ color: 0xc8a165, roughness: 0.9 }), [0.62, 1.05, 0.15], [0.3, 0.22, 0.3]);
      const fruit = [0xff7a00, 0xd7261e, 0xffc21a, 0x18a558];
      fruit.forEach((c, i) => add(this.mesh, sph, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }), [0.55 + (i % 2) * 0.14, 1.22, 0.08 + Math.floor(i / 2) * 0.14], [0.08, 0.08, 0.08]));
      headY = 1.6;
      this.head.position.y = headY;
      this.mesh.add(this.head);
      add(this.head, box, teal, [0, 0.3, 0], [0.85, 0.6, 0.6]);
      add(this.head, new THREE.PlaneGeometry(0.66, 0.44), screenMat, [0, 0.3, 0.31]);
      add(this.head, cyl, new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.6 }), [0, 0.68, 0], [0.5, 0.06, 0.5]); // sun hat brim
      add(this.head, cyl, new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.6 }), [0, 0.8, 0], [0.28, 0.22, 0.28]);
      for (const [arm, sx] of [[this.armL, 1], [this.armR, -1]] as const) {
        arm.position.set(sx * 0.52, 1.35, 0);
        this.mesh.add(arm);
        add(arm, cyl, dark, [0, -0.25, 0], [0.06, 0.5, 0.06]);
        add(arm, sph, teal, [0, -0.52, 0], [0.12, 0.12, 0.12]);
      }
    }

    // Speech-bubble sprite (shown when Afrobot is near)
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 28, 24, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(22, 46); g.lineTo(16, 60); g.lineTo(34, 50); g.fill();
    g.fillStyle = '#1d1240'; for (const x of [22, 32, 42]) { g.beginPath(); g.arc(x, 28, 4, 0, Math.PI * 2); g.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    this.bubble.scale.setScalar(0.65);
    this.bubble.position.set(0.5, headY + 1.2, 0);
    this.bubble.visible = false;
    this.mesh.add(this.bubble);

    this.solid = Solid.cyl(x, y + headY, z, 0.55, headY);
  }

  canInteract() { return !this.talking; }

  update(dt: number, player: THREE.Vector3) {
    this.t += dt;
    const dx = player.x - this.position.x, dz = player.z - this.position.z;
    const d = Math.hypot(dx, dz);
    const near = d < 7 && Math.abs(player.y - this.position.y) < 3;

    // Turn the whole body toward Afrobot when near; otherwise idle look-around
    const wantYaw = near ? Math.atan2(dx, dz) : this.yaw;
    let dy = wantYaw - this.mesh.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.mesh.rotation.y += dy * Math.min(1, dt * 3);
    this.lookT -= dt;
    if (this.lookT <= 0) { this.lookTarget = (Math.random() - 0.5) * 1.2; this.lookT = 1.5 + Math.random() * 2.5; }
    const headYaw = near ? 0 : this.lookTarget;
    this.head.rotation.y += (headYaw - this.head.rotation.y) * Math.min(1, dt * 4);
    this.head.rotation.z = Math.sin(this.t * 1.1) * 0.05;
    this.mesh.position.y = this.position.y + Math.abs(Math.sin(this.t * (this.type === 'market' ? 3 : 2))) * 0.04;

    // Wave hello the first time Afrobot comes close
    if (near && d < 5 && !this.greeted) { this.greeted = true; this.waveT = 1.6; }
    if (!near && d > 10) this.greeted = false;
    this.waveT = Math.max(0, this.waveT - dt);
    const wave = this.waveT > 0 || this.talking;
    this.armR.rotation.z += ((wave ? -2.4 + Math.sin(this.t * 12) * 0.35 : -0.1 + Math.sin(this.t * 1.5) * 0.05) - this.armR.rotation.z) * Math.min(1, dt * 10);
    this.armL.rotation.z += ((0.1 + Math.sin(this.t * 1.5 + 1) * 0.05) - this.armL.rotation.z) * Math.min(1, dt * 6);

    this.bubble.visible = near && d < this.interactRadius + 1.5 && !this.talking;
    this.bubble.position.y += (Math.sin(this.t * 3) * 0.002);

    this.faceAcc += dt;
    if (this.faceAcc > 0.08) {
      this.faceAcc = 0;
      const blink = Math.sin(this.t * 0.9) > 0.97;
      this.face.draw(this.talking ? 'talk' : blink ? 'blink' : (near || this.waveT > 0) ? 'happy' : 'idle', this.t);
    }
  }
}
