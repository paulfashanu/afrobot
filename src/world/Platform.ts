import * as THREE from 'three';
import { Solid } from '../core/Physics';
import { pavingTexture, trimTexture, worldBox } from '../core/Textures';

export interface Updatable {
  update(dt: number, t: number): void;
  reset?(): void;
}

const matCache = new Map<string, THREE.Material>();
function texturedMat(kind: 'top' | 'side', color: THREE.ColorRepresentation, emissive = 0): THREE.Material {
  const key = kind + new THREE.Color(color).getHexString() + emissive;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      map: kind === 'top' ? pavingTexture() : trimTexture(),
      roughness: 0.7,
      metalness: 0.05,
      emissive: new THREE.Color(color),
      emissiveIntensity: emissive,
    });
    matCache.set(key, m);
  }
  return m;
}

const glowCache = new Map<number, THREE.MeshBasicMaterial>();
export function glowMat(color: number, boost = 2.2) {
  const key = color * 10 + boost;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(boost) });
    glowCache.set(key, m);
  }
  return m;
}

export interface PlatformStyle {
  top?: THREE.ColorRepresentation;
  side?: THREE.ColorRepresentation;
}

export const STYLES = {
  street: { top: 0xffe7c2, side: 0xe0763c },
  teal: { top: 0xf7f0e3, side: 0x19b3a5 },
  purple: { top: 0xfff2d6, side: 0x7b45e0 },
  pink: { top: 0xfff0f4, side: 0xff5fa2 },
  gold: { top: 0xfff4d6, side: 0xf5a623 },
  green: { top: 0xf2ffe8, side: 0x18a558 },
  falling: { top: 0xffd27a, side: 0xff7a2f },
  moving: { top: 0xe8fbff, side: 0x2f7bff },
} satisfies Record<string, PlatformStyle>;

/** A static box platform with readable top + patterned sides. */
export class Platform implements Updatable {
  readonly mesh: THREE.Mesh;
  readonly solid: Solid;
  protected home = new THREE.Vector3();

  constructor(x: number, top: number, z: number, w: number, d: number, h = 1, style: PlatformStyle = STYLES.teal) {
    const geo = worldBox(w, h, d, 2, 2);
    geo.translate(0, -h / 2, 0);
    const side = texturedMat('side', style.side ?? 0x19b3a5);
    const topM = texturedMat('top', style.top ?? 0xffffff);
    this.mesh = new THREE.Mesh(geo, [side, side, topM, side, side, side]);
    this.mesh.position.set(x, top, z);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.solid = Solid.box(x, top, z, w, h, d);
    this.home.set(x, top, z);
  }

  update(_dt: number, _t: number) {}
}

/** Shuttles between two points (ping-pong with eased ends). Carries the player. */
export class MovingPlatform extends Platform {
  private a: THREE.Vector3;
  private b: THREE.Vector3;
  private cur = new THREE.Vector3();
  private next = new THREE.Vector3();

  constructor(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, private period = 4, private phase = 0, style: PlatformStyle = STYLES.moving) {
    super(a.x, a.y, a.z, w, d, 0.6, style);
    this.a = a.clone();
    this.b = b.clone();
    this.cur.copy(a);
    // glowing thruster underneath
    const thr = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * 0.28, 0.05, 0.35, 16), glowMat(0x6ff3ff, 2.5));
    thr.position.y = -0.75;
    thr.rotation.x = Math.PI;
    thr.scale.y = -1;
    this.mesh.add(thr);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) * 0.32, 0.05, 6, 24), glowMat(0x6ff3ff, 2.5));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.62;
    this.mesh.add(ring);
  }

  update(_dt: number, t: number) {
    const k = 0.5 - 0.5 * Math.cos(((t / this.period) + this.phase) * Math.PI * 2);
    this.next.lerpVectors(this.a, this.b, k);
    this.solid.translate(this.next.x - this.cur.x, this.next.y - this.cur.y, this.next.z - this.cur.z);
    this.cur.copy(this.next);
    this.mesh.position.copy(this.cur);
  }
}

/** A spinning disc that rotates the player with it. */
export class RotatingPlatform implements Updatable {
  readonly mesh: THREE.Group;
  readonly solid: Solid;

  constructor(x: number, top: number, z: number, radius: number, private speed = 0.8, style: PlatformStyle = STYLES.purple) {
    this.mesh = new THREE.Group();
    this.mesh.position.set(x, top, z);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.92, 0.7, 40),
      [texturedMat('side', style.side ?? 0x7b45e0), texturedMat('top', style.top ?? 0xffffff), texturedMat('side', style.side ?? 0x7b45e0)],
    );
    disc.position.y = -0.35;
    disc.castShadow = disc.receiveShadow = true;
    this.mesh.add(disc);
    // Arrow chevrons on top so rotation reads clearly
    const chevGeo = new THREE.ConeGeometry(0.35, 0.7, 3);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const c = new THREE.Mesh(chevGeo, glowMat(0xffd23f, 1.6));
      c.scale.set(1, 1, 0.15);
      c.position.set(Math.cos(a) * radius * 0.72, 0.02, Math.sin(a) * radius * 0.72);
      c.rotation.set(-Math.PI / 2, 0, 0);
      c.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -a + (speed > 0 ? Math.PI : 0));
      this.mesh.add(c);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 24), glowMat(0x6ff3ff, 2));
    hub.position.y = 0.02;
    this.mesh.add(hub);
    this.solid = Solid.cyl(x, top, z, radius, 0.7);
  }

  update(dt: number) {
    const d = this.speed * dt;
    this.mesh.rotation.y += d;
    this.solid.yawDelta = d;
  }
}

/** Shakes when stood on, drops, then respawns. */
export class FallingPlatform extends Platform {
  private state: 'idle' | 'shaking' | 'falling' | 'gone' = 'idle';
  private timer = 0;
  private vy = 0;
  private offsetY = 0;

  constructor(x: number, top: number, z: number, w: number, d: number) {
    super(x, top, z, w, d, 0.6, STYLES.falling);
    this.solid.onLand = () => {
      if (this.state === 'idle') { this.state = 'shaking'; this.timer = 0; }
    };
  }

  update(dt: number) {
    this.timer += dt;
    this.solid.delta.set(0, 0, 0);
    if (this.state === 'shaking') {
      this.mesh.position.set(this.home.x + (Math.random() - 0.5) * 0.12, this.home.y, this.home.z + (Math.random() - 0.5) * 0.12);
      if (this.timer > 0.6) { this.state = 'falling'; this.timer = 0; this.vy = 0; this.solid.carry = false; }
    } else if (this.state === 'falling') {
      this.vy -= 30 * dt;
      const dy = this.vy * dt;
      this.offsetY += dy;
      this.solid.translate(0, dy, 0);
      this.mesh.position.set(this.home.x, this.home.y + this.offsetY, this.home.z);
      if (this.timer > 1.6) { this.state = 'gone'; this.timer = 0; this.solid.enabled = false; this.mesh.visible = false; }
    } else if (this.state === 'gone' && this.timer > 2.8) {
      this.reset();
    }
  }

  reset() {
    this.state = 'idle';
    this.timer = 0;
    this.solid.translate(0, -this.offsetY, 0);
    this.solid.delta.set(0, 0, 0);
    this.offsetY = 0;
    this.solid.enabled = true;
    this.solid.carry = true;
    this.mesh.visible = true;
    this.mesh.position.copy(this.home);
    this.mesh.scale.setScalar(0.01);
    const grow = () => {
      const s = Math.min(1, this.mesh.scale.x + 0.08);
      this.mesh.scale.setScalar(s);
      if (s < 1) requestAnimationFrame(grow);
    };
    grow();
  }
}
