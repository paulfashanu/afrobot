import * as THREE from 'three';
import { kenteTexture } from '../core/Textures';

const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b3550, roughness: 0.4, metalness: 0.6 });
const baseMat = new THREE.MeshStandardMaterial({ color: 0xfff3e2, roughness: 0.4 });

/** Respawn beacon: a pole with a holo-flag that lights up green when reached. */
export class Checkpoint {
  readonly mesh = new THREE.Group();
  readonly position: THREE.Vector3;
  active = false;
  private ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a3d).multiplyScalar(1.4) });
  private flagMat: THREE.MeshStandardMaterial;
  private ring: THREE.Mesh;
  private flag: THREE.Mesh;
  private padMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a3d), transparent: true, opacity: 0.5, depthWrite: false });
  private t = 0;
  private pop = 0;

  constructor(x: number, y: number, z: number, readonly yaw = 0) {
    this.position = new THREE.Vector3(x, y, z);
    this.mesh.position.copy(this.position);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.2, 28), baseMat);
    base.position.y = 0.1;
    base.receiveShadow = true;
    this.mesh.add(base);
    const pad = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 32), this.padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.21;
    this.mesh.add(pad);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 10), poleMat);
    pole.position.set(-0.9, 1.6, 0);
    pole.castShadow = true;
    this.mesh.add(pole);
    this.flagMat = new THREE.MeshStandardMaterial({ map: kenteTexture(), side: THREE.DoubleSide, roughness: 0.6, color: 0x777777 });
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.75, 10, 1), this.flagMat);
    this.flag.position.set(-0.22, 2.75, 0);
    this.flag.castShadow = true;
    this.mesh.add(this.flag);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 24), this.ringMat);
    this.ring.position.set(-0.9, 3.4, 0);
    this.mesh.add(this.ring);
    this.mesh.rotation.y = yaw;
  }

  activate() {
    this.active = true;
    this.pop = 1;
    this.ringMat.color.setRGB(0.3 * 2.5, 1.0 * 2.5, 0.55 * 2.5);
    this.padMat.color.setRGB(0.3, 1, 0.6);
    this.flagMat.color.setHex(0xffffff);
  }

  update(dt: number) {
    this.t += dt;
    this.ring.rotation.y += dt * (this.active ? 4 : 1);
    this.pop = Math.max(0, this.pop - dt * 2);
    this.ring.scale.setScalar(1 + this.pop * 1.2);
    // flag wave
    const pos = this.flag.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const k = (x + 0.65) / 1.3;
      pos.setZ(i, Math.sin(this.t * (this.active ? 7 : 3) - x * 4) * 0.12 * k);
    }
    pos.needsUpdate = true;
    this.padMat.opacity = 0.35 + Math.sin(this.t * 4) * 0.15;
  }

  /** Player within trigger radius? */
  contains(p: THREE.Vector3) {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z) < 3.4 && Math.abs(p.y - this.position.y) < 3;
  }
}
