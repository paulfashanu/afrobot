import * as THREE from 'three';

const coreGeo = new THREE.OctahedronGeometry(0.34, 0);
const shellGeo = new THREE.IcosahedronGeometry(0.46, 0);
const ringGeo = new THREE.TorusGeometry(0.58, 0.035, 6, 32);
const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc93c).multiplyScalar(2.6) });
const shellMat = new THREE.MeshStandardMaterial({
  color: 0x35ffb0, emissive: 0x18c27a, emissiveIntensity: 0.8, transparent: true, opacity: 0.35,
  roughness: 0.1, metalness: 0.2, flatShading: true, depthWrite: false,
});
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dffb5).multiplyScalar(2.2) });

/** AFRO CORE — a glowing collectible energy crystal. */
export class AfroCore {
  readonly mesh = new THREE.Group();
  readonly position: THREE.Vector3;
  collected = false;
  private core: THREE.Mesh;
  private shell: THREE.Mesh;
  private ring: THREE.Mesh;
  private ring2: THREE.Mesh;
  private t = Math.random() * 10;
  private vanishT = -1;

  constructor(x: number, y: number, z: number) {
    this.position = new THREE.Vector3(x, y, z);
    this.mesh.position.copy(this.position);
    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.shell = new THREE.Mesh(shellGeo, shellMat);
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring2 = new THREE.Mesh(ringGeo, ringMat);
    this.ring2.scale.setScalar(0.8);
    this.mesh.add(this.core, this.shell, this.ring, this.ring2);
  }

  update(dt: number) {
    this.t += dt;
    if (this.vanishT >= 0) {
      // Pop up, spin fast, shrink away
      this.vanishT += dt;
      const k = this.vanishT / 0.4;
      this.mesh.position.y = this.position.y + k * 1.4;
      this.mesh.rotation.y += dt * 25;
      const s = k < 0.3 ? 1 + k * 1.5 : Math.max(0, 1.45 * (1 - (k - 0.3) / 0.7));
      this.mesh.scale.setScalar(s);
      if (k >= 1) { this.mesh.visible = false; this.vanishT = -1; }
      return;
    }
    if (this.collected) return;
    this.mesh.position.y = this.position.y + Math.sin(this.t * 2.2) * 0.18;
    this.core.rotation.y += dt * 2.2;
    this.shell.rotation.y -= dt * 0.9;
    this.shell.rotation.x += dt * 0.5;
    this.ring.rotation.x = Math.PI / 2 + Math.sin(this.t * 1.3) * 0.4;
    this.ring.rotation.y += dt * 1.5;
    this.ring2.rotation.x = Math.sin(this.t * 1.7 + 1) * 1.2;
    this.ring2.rotation.z += dt * 2;
  }

  collect() {
    this.collected = true;
    this.vanishT = 0;
  }
}
