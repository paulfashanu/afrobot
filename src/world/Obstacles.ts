import * as THREE from 'three';
import { Solid, type Hazard } from '../core/Physics';
import { glowMat, type Updatable } from './Platform';

const metal = new THREE.MeshStandardMaterial({ color: 0x3b3550, roughness: 0.4, metalness: 0.6 });
const yellow = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.5, metalness: 0.2 });

/** A rotating bar that sweeps across a platform. Jump over it! */
export class Spinner implements Updatable, Hazard {
  readonly mesh = new THREE.Group();
  readonly solid: Solid;
  private arm = new THREE.Group();
  private angle = 0;
  private lo: number;
  private hi: number;

  constructor(private x: number, baseY: number, private z: number, private length: number, private speed = 1.6) {
    this.mesh.position.set(x, baseY, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.3, 16), metal);
    post.position.y = 0.65;
    post.castShadow = true;
    this.mesh.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10), glowMat(0xff3d6e, 2));
    cap.position.y = 1.35;
    this.mesh.add(cap);
    this.arm.position.y = 0.65;
    this.mesh.add(this.arm);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(length * 2, 0.45, 0.45), yellow);
    bar.castShadow = true;
    this.arm.add(bar);
    // hazard stripes
    const stripeGeo = new THREE.BoxGeometry(0.25, 0.47, 0.47);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    for (let i = -length + 0.4; i < length; i += 0.7) {
      const s = new THREE.Mesh(stripeGeo, stripeMat);
      s.position.x = i;
      this.arm.add(s);
    }
    for (const sx of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), glowMat(0xff3d6e, 2));
      tip.position.x = sx * length;
      this.arm.add(tip);
    }
    this.solid = Solid.cyl(x, baseY + 1.3, z, 0.5, 1.3);
    this.lo = baseY + 0.35;
    this.hi = baseY + 0.95;
  }

  update(dt: number) {
    this.angle += this.speed * dt;
    this.arm.rotation.y = this.angle;
  }

  hit(p: THREE.Vector3, r: number, h: number): THREE.Vector3 | null {
    if (p.y > this.hi || p.y + h < this.lo) return null;
    // Bar direction in world XZ (local +X rotated by angle around Y)
    const dx = Math.cos(this.angle), dz = -Math.sin(this.angle);
    const rx = p.x - this.x, rz = p.z - this.z;
    const along = THREE.MathUtils.clamp(rx * dx + rz * dz, -this.length, this.length);
    const cx = this.x + dx * along, cz = this.z + dz * along;
    const ox = p.x - cx, oz = p.z - cz;
    if (ox * ox + oz * oz > (r + 0.28) ** 2) return null;
    // Push along the sweep direction + a little outward
    const sweep = new THREE.Vector3(-dz, 0, dx).multiplyScalar(Math.sign(this.speed) * -Math.sign(along || 1));
    return sweep.add(new THREE.Vector3(rx, 0, rz).normalize().multiplyScalar(0.4));
  }
}

/**
 * Electric fence between two posts that switches on/off on a timer.
 * axis 'x' = fence runs along X (blocks movement in Z).
 */
export class ElectricBarrier implements Updatable, Hazard {
  readonly mesh = new THREE.Group();
  readonly solids: Solid[] = [];
  private beams: THREE.Mesh[] = [];
  private beamMat: THREE.MeshBasicMaterial;
  private active = true;
  private warn = false;
  onToggle?: (on: boolean) => void;
  private min = new THREE.Vector3();
  private max = new THREE.Vector3();
  private emitters: THREE.MeshBasicMaterial;

  constructor(
    private axis: 'x' | 'z',
    from: number, to: number, private fixed: number, baseY: number,
    height = 3.2,
    private onTime = 1.6, private offTime = 1.6, private offset = 0,
  ) {
    const len = to - from;
    const mid = (from + to) / 2;
    const cx = axis === 'x' ? mid : fixed;
    const cz = axis === 'x' ? fixed : mid;
    this.mesh.position.set(cx, baseY, cz);
    this.beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fd8ff).multiplyScalar(3), transparent: true, opacity: 1, depthWrite: false });
    this.emitters = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fd8ff).multiplyScalar(2) });
    const postGeo = new THREE.BoxGeometry(0.7, height + 0.4, 0.7);
    for (const end of [from, to]) {
      const post = new THREE.Mesh(postGeo, metal);
      const off = end - mid;
      post.position.set(axis === 'x' ? off : 0, (height + 0.4) / 2, axis === 'x' ? 0 : off);
      post.castShadow = true;
      this.mesh.add(post);
      for (let i = 0; i < 4; i++) {
        const em = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), this.emitters);
        em.position.copy(post.position).setY(0.5 + i * (height - 0.6) / 3);
        this.mesh.add(em);
      }
      const px = axis === 'x' ? cx + off : cx, pz = axis === 'x' ? cz : cz + off;
      this.solids.push(Solid.box(px, baseY + height + 0.4, pz, 0.7, height + 0.4, 0.7));
    }
    // beams: several jittery lines
    const beamLen = Math.abs(len) - 0.7;
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? beamLen : 0.06, 0.06, axis === 'x' ? 0.06 : beamLen), this.beamMat);
      b.position.y = 0.5 + i * (height - 0.6) / 3;
      this.mesh.add(b);
      this.beams.push(b);
    }
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(beamLen, height - 0.4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5fc8ff).multiplyScalar(1.5), transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    );
    sheet.position.y = height / 2;
    if (axis === 'z') sheet.rotation.y = Math.PI / 2;
    this.mesh.add(sheet);
    this.beams.push(sheet);

    const half = Math.abs(len) / 2;
    this.min.set(axis === 'x' ? cx - half : cx - 0.25, baseY, axis === 'x' ? cz - 0.25 : cz - half);
    this.max.set(axis === 'x' ? cx + half : cx + 0.25, baseY + height, axis === 'x' ? cz + 0.25 : cz + half);
  }

  update(_dt: number, t: number) {
    const cycle = this.onTime + this.offTime;
    const ph = ((t + this.offset) % cycle + cycle) % cycle;
    const on = ph < this.onTime;
    this.warn = !on && ph > cycle - 0.45;
    if (on !== this.active) { this.active = on; this.onToggle?.(on); }
    for (const [i, b] of this.beams.entries()) {
      b.visible = on || (this.warn && Math.floor(t * 20) % 2 === 0);
      if (i < 4) b.position.x = this.axis === 'z' ? (Math.random() - 0.5) * 0.06 : 0;
    }
    this.beamMat.opacity = on ? 0.75 + Math.random() * 0.25 : 0.35;
    this.emitters.color.setRGB(on ? 0.5 * 2 : 0.6, on ? 0.85 * 2 : 0.3, on ? 1 * 2 : 0.3);
  }

  get isActive() { return this.active; }

  hit(p: THREE.Vector3, r: number, h: number): THREE.Vector3 | null {
    if (!this.active) return null;
    if (p.x + r < this.min.x || p.x - r > this.max.x) return null;
    if (p.z + r < this.min.z || p.z - r > this.max.z) return null;
    if (p.y > this.max.y || p.y + h < this.min.y) return null;
    const c = this.axis === 'x' ? p.z - this.fixed : p.x - this.fixed;
    const s = c >= 0 ? 1 : -1;
    return this.axis === 'x' ? new THREE.Vector3(0, 0, s) : new THREE.Vector3(s, 0, 0);
  }
}
