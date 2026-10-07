import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const coreGeo = new THREE.OctahedronGeometry(0.34, 0);
const shellGeo = new THREE.IcosahedronGeometry(0.46, 0);
const ringGeo = new THREE.TorusGeometry(0.58, 0.035, 6, 32);
/** Crystal + two rings merged into one vertex-coloured mesh (1 draw call instead of 3). */
const gemGeo = (() => {
  const tint = (g: THREE.BufferGeometry, c: THREE.Color) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  };
  const gold = new THREE.Color(0xffc93c).multiplyScalar(2.6), mint = new THREE.Color(0x3dffb5).multiplyScalar(2.2);
  const r1 = ringGeo.clone().rotateX(Math.PI / 2);
  const r2 = ringGeo.clone().scale(0.8, 0.8, 0.8).rotateY(Math.PI / 2);
  return mergeGeometries([tint(coreGeo.clone(), gold), tint(r1, mint), tint(r2, mint)]);
})();
const gemMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const shellMat = new THREE.MeshStandardMaterial({
  color: 0x35ffb0, emissive: 0x18c27a, emissiveIntensity: 0.8, transparent: true, opacity: 0.35,
  roughness: 0.1, metalness: 0.2, flatShading: true, depthWrite: false,
});
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.28, depthWrite: false });
const haloTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,220,120,0.9)'); gr.addColorStop(0.4, 'rgba(80,255,180,0.35)'); gr.addColorStop(1, 'rgba(80,255,180,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

export const CORE_NEAR = 6;
const MAGNET = 2.6;

/**
 * AFRO CORE — a glowing collectible energy crystal.
 * Reacts as Afrobot gets close; drifts toward him at short range.
 */
export class AfroCore {
  readonly mesh = new THREE.Group();
  readonly position: THREE.Vector3;
  collected = false;
  /** Collected on a previous run: translucent, no count. */
  ghost = false;
  /** Invisible until revealed by a Pulse. */
  hidden: boolean;
  private core: THREE.Mesh;
  private shell: THREE.Mesh;
  /** Distance-culled by the level (too far to see). */
  culled = false;
  private vanished = false;
  private halo: THREE.Sprite;
  private t = Math.random() * 10;
  private vanishT = -1;
  private revealT = -1;
  private nearness = 0;
  private wasNear = false;
  private sparkleT = Math.random();
  /** Set for one frame when Afrobot first comes close (for the soft chime). */
  justNear = false;
  /** Set when the core wants to emit a sparkle particle this frame. */
  sparkle = false;

  constructor(readonly id: string, x: number, y: number, z: number, hidden = false) {
    this.position = new THREE.Vector3(x, y, z);
    this.hidden = hidden;
    this.mesh.position.copy(this.position);
    this.core = new THREE.Mesh(gemGeo, gemMat);
    this.shell = new THREE.Mesh(shellGeo, shellMat);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.scale.setScalar(1.6);
    this.mesh.add(this.halo, this.core, this.shell);
    if (hidden) this.mesh.visible = false;
  }

  setGhost() {
    this.ghost = true;
    for (const m of [this.core, this.shell]) m.material = ghostMat;
    this.halo.visible = false;
  }

  /** Pulse reveal: pops into view with a flourish. */
  reveal() {
    if (!this.hidden) return false;
    this.hidden = false;
    this.mesh.visible = true;
    this.revealT = 0;
    return true;
  }

  get collectable() { return !this.collected && !this.hidden; }

  update(dt: number, playerCenter: THREE.Vector3) {
    this.t += dt;
    this.justNear = false;
    this.sparkle = false;
    if (this.vanishT >= 0) {
      // Pop up, spin fast, shrink away
      this.vanishT += dt;
      const k = this.vanishT / 0.45;
      this.mesh.position.y += dt * 3;
      this.mesh.rotation.y += dt * 25;
      const s = k < 0.3 ? 1 + k * 2 : Math.max(0, 1.6 * (1 - (k - 0.3) / 0.7));
      this.mesh.scale.setScalar(s);
      if (k >= 1) { this.mesh.visible = false; this.vanishT = -1; this.vanished = true; }
      return;
    }
    this.mesh.visible = !this.hidden && !this.vanished && !this.culled;
    if (this.collected || this.hidden || this.culled) return;

    const d = this.mesh.position.distanceTo(playerCenter);
    const near = d < CORE_NEAR;
    if (near && !this.wasNear && !this.ghost) this.justNear = true;
    this.wasNear = near;
    this.nearness += ((near ? 1 - d / CORE_NEAR : 0) - this.nearness) * Math.min(1, dt * 5);
    const n = this.nearness;

    // Magnet: drift toward Afrobot at close range
    if (d < MAGNET && !this.ghost) {
      const pull = (1 - d / MAGNET) * 9 * dt;
      this.mesh.position.lerp(playerCenter, Math.min(1, pull));
    } else {
      const homeY = this.position.y + Math.sin(this.t * 2.2) * (0.18 + n * 0.12) + n * 0.25;
      this.mesh.position.x += (this.position.x - this.mesh.position.x) * Math.min(1, dt * 4);
      this.mesh.position.z += (this.position.z - this.mesh.position.z) * Math.min(1, dt * 4);
      this.mesh.position.y += (homeY - this.mesh.position.y) * Math.min(1, dt * 6);
    }
    const spin = 1 + n * 3;
    this.core.rotation.y += dt * 2.2 * spin;
    this.core.rotation.x = Math.sin(this.t * 1.3) * 0.4;
    this.core.rotation.z = Math.sin(this.t * 1.7 + 1) * 0.3;
    this.shell.rotation.y -= dt * 0.9 * spin;
    this.shell.rotation.x += dt * 0.5;
    const s = 1 + n * 0.25 + (this.revealT >= 0 ? Math.sin(Math.min(1, this.revealT) * Math.PI) * 0.8 : 0);
    this.mesh.scale.setScalar(s);
    this.halo.scale.setScalar(1.4 + n * 1.4 + Math.sin(this.t * 4) * 0.1);
    (this.halo.material as THREE.SpriteMaterial).opacity = 0.35 + n * 0.65;
    if (this.revealT >= 0) { this.revealT += dt * 2; if (this.revealT > 1) this.revealT = -1; }

    // Occasional sparkles; more often when close
    if (!this.ghost) {
      this.sparkleT -= dt * (0.6 + n * 5);
      if (this.sparkleT <= 0) { this.sparkleT = 1; this.sparkle = true; }
    }
  }

  collect() {
    this.collected = true;
    this.vanishT = 0;
  }
}
