import * as THREE from 'three';
import { Solid } from '../core/Physics';

const pedMat = new THREE.MeshStandardMaterial({ color: 0x2b2440, roughness: 0.35, metalness: 0.6 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xf5b52a, roughness: 0.3, metalness: 0.8 });

/** Rooftop power node — press E nearby to send energy to the Afro Gate. */
export class PowerNode {
  readonly mesh = new THREE.Group();
  readonly solid: Solid;
  readonly position: THREE.Vector3;
  active = false;
  private orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3d6e).multiplyScalar(1.6) });
  private orb: THREE.Mesh;
  private beam: THREE.Mesh;
  private beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ff7ff).multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  private t = 0;
  private claws: THREE.Group;

  constructor(x: number, y: number, z: number) {
    this.position = new THREE.Vector3(x, y, z);
    this.mesh.position.copy(this.position);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.0, 6), pedMat);
    ped.position.y = 0.5;
    ped.castShadow = ped.receiveShadow = true;
    this.mesh.add(ped);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 6), goldMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.0;
    this.mesh.add(rim);
    this.claws = new THREE.Group();
    this.claws.position.y = 1.0;
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.18), goldMat);
      const a = (i / 3) * Math.PI * 2;
      c.position.set(Math.cos(a) * 0.42, 0.3, Math.sin(a) * 0.42);
      c.rotation.y = -a;
      c.rotation.z = 0.3;
      this.claws.add(c);
    }
    this.mesh.add(this.claws);
    this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), this.orbMat);
    this.orb.position.y = 1.45;
    this.mesh.add(this.orb);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 60, 12, 1, true), this.beamMat);
    this.beam.position.y = 31.5;
    this.beam.visible = false;
    this.mesh.add(this.beam);
    this.solid = Solid.cyl(x, y + 1.0, z, 0.65, 1.0);
  }

  activate() {
    this.active = true;
    this.orbMat.color.setRGB(0.37 * 2.6, 0.97 * 2.6, 1.0 * 2.6);
    this.beam.visible = true;
  }

  inRange(p: THREE.Vector3) {
    return !this.active && Math.hypot(p.x - this.position.x, p.z - this.position.z) < 2.3 && Math.abs(p.y - this.position.y) < 2.2;
  }

  update(dt: number) {
    this.t += dt;
    this.orb.position.y = 1.45 + Math.sin(this.t * 3) * 0.08;
    this.orb.rotation.y += dt * (this.active ? 3 : 0.8);
    this.claws.rotation.y += dt * (this.active ? 2 : 0.3);
    if (!this.active) {
      const blink = Math.sin(this.t * 6) > 0 ? 1.8 : 0.8;
      this.orbMat.color.setRGB(blink, 0.24 * blink, 0.43 * blink);
    } else {
      this.beamMat.opacity = Math.min(0.55, this.beamMat.opacity + dt) * (0.85 + Math.sin(this.t * 10) * 0.15);
    }
  }
}
