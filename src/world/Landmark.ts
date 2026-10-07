import * as THREE from 'three';
import { Prims, StaticBatcher } from '../core/Batcher';
import { WATER_Y } from './Environment';

/**
 * THE SUNCROWN SPIRE — the level's signature landmark.
 * An original Afrofuturist tower: tapering tiers banded with glowing kente colours,
 * Sahel-style protruding beams, sweeping buttress fins, and a rotating halo crown
 * holding a giant floating Afro Core. Sits behind the Afro Gate so the gate frames it.
 */
export class SuncrownSpire {
  readonly group = new THREE.Group();
  private crown = new THREE.Group();
  private halos: THREE.Mesh[] = [];
  private gem: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  private t = 0;
  readonly top: number;

  constructor(x: number, z: number) {
    this.group.position.set(x, 0, z);
    const b = new StaticBatcher();
    const base = WATER_Y;

    // Island + palms ring
    b.add(Prims.cylHi, { x: 0, y: base - 1, z: 0 }, 0xf5deb0, { scale: [92, 2.4, 92] });
    b.add(Prims.cylHi, { x: 0, y: base + 0.6, z: 0 }, 0x8fcf7a, { scale: [82, 1.2, 82] });

    // Stepped plinth
    const tiers = [[60, 3, 0xd8743f], [48, 3, 0xfff1dc], [38, 3, 0x6b2fd6]] as const;
    let y = base + 1.2;
    for (const [d, h, c] of tiers) {
      b.add(Prims.cylHi, { x: 0, y: y + h / 2, z: 0 }, c, { scale: [d, h, d] });
      b.add(Prims.torus, { x: 0, y: y + h, z: 0 }, 0xffc21a, { scale: [d * 1.0, d * 1.0, 6], rot: [Math.PI / 2, 0, 0], glow: true, glowBoost: 1.6 });
      y += h;
    }

    // Buttress fins sweeping up the base
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add(Prims.cone, { x: Math.cos(a) * 15, y: y + 14, z: Math.sin(a) * 15 }, i % 2 ? 0xf5b52a : 0xff6b4a, {
        scale: [4, 30, 9], rot: [0, -a, 0.32], order: 'YXZ',
      });
    }

    // Tapering tower segments with torons (protruding beams) and glowing kente bands
    const segs = 9;
    const kente = [0xf6b40e, 0x18a558, 0xd7261e, 0x1b4fd1, 0xff5fa2];
    let r = 13;
    for (let i = 0; i < segs; i++) {
      const h = 11 - i * 0.4;
      const r2 = r * 0.86;
      const geo = new THREE.CylinderGeometry(r2, r, h, 20);
      b.add(geo, { x: 0, y: y + h / 2, z: 0 }, i % 2 ? 0xd8743f : 0xfff1dc);
      // band
      b.add(Prims.cylHi, { x: 0, y: y + h - 0.6, z: 0 }, kente[i % kente.length], { scale: [r2 * 2 + 0.6, 1.2, r2 * 2 + 0.6], glow: true, glowBoost: 1.5 });
      // torons
      const n = Math.max(8, Math.round(r * 1.2));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + i * 0.3;
        const rr = (r + r2) / 2;
        b.add(Prims.box, { x: Math.cos(a) * (rr + 0.9), y: y + h * 0.45, z: Math.sin(a) * (rr + 0.9) }, 0x6b4a2b, { scale: [2.4, 0.45, 0.45], rot: [0, -a, 0] });
      }
      // little glowing windows
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + i * 0.5;
        const rr = (r + r2) / 2 + 0.05;
        b.add(Prims.box, { x: Math.cos(a) * rr, y: y + h * 0.7, z: Math.sin(a) * rr }, 0x9ff3ff, { scale: [0.3, 1.6, 1.2], rot: [0, -a, 0], glow: true, glowBoost: 1.4 });
      }
      y += h;
      r = r2;
    }
    // Crown seat
    b.add(Prims.cylHi, { x: 0, y: y + 1.5, z: 0 }, 0x2b2440, { scale: [r * 2.6, 3, r * 2.6] });
    b.add(Prims.cone, { x: 0, y: y + 6, z: 0 }, 0xf5b52a, { scale: [r * 1.6, 7, r * 1.6] });
    this.top = y + 10;

    const mesh = b.build('suncrown', { castShadow: false, receiveShadow: false });
    this.group.add(mesh);

    // Animated crown: sun-ray spikes, tilted halo rings and the floating giant core
    this.crown.position.y = this.top + 14;
    this.group.add(this.crown);
    const gold = new THREE.MeshStandardMaterial({ color: 0xf5b52a, roughness: 0.25, metalness: 0.85, emissive: 0x6a3c00, emissiveIntensity: 0.4 });
    const spikeGeo = new THREE.ConeGeometry(1.4, 9, 4);
    const rays = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const s = new THREE.Mesh(spikeGeo, gold);
      s.position.set(Math.cos(a) * 16, 0, Math.sin(a) * 16);
      s.rotation.set(0, -a, -Math.PI / 2);
      s.scale.setScalar(i % 2 ? 0.7 : 1);
      rays.add(s);
    }
    this.crown.add(rays);
    const haloCols = [0x5ff7ff, 0xffc21a, 0xff5fa2];
    haloCols.forEach((c, i) => {
      const h = new THREE.Mesh(new THREE.TorusGeometry(11 + i * 3, 0.55, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2) }));
      h.rotation.set(Math.PI / 2 + (i - 1) * 0.5, i * 0.7, 0);
      this.crown.add(h);
      this.halos.push(h);
    });
    this.gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(6, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc93c).multiplyScalar(2.6) }),
    );
    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(8.5, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dffb5).multiplyScalar(1.4), transparent: true, opacity: 0.25, depthWrite: false, wireframe: true }),
    );
    this.gem.add(shell);
    this.crown.add(this.gem);

    // Sky beacon
    this.beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff3ff).multiplyScalar(1.6), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 5, 400, 16, 1, true), this.beamMat);
    beam.position.y = this.top + 200;
    this.group.add(beam);
  }

  update(dt: number) {
    this.t += dt;
    this.crown.rotation.y += dt * 0.12;
    this.halos.forEach((h, i) => { h.rotation.z += dt * (0.3 + i * 0.15) * (i % 2 ? -1 : 1); });
    this.gem.rotation.y -= dt * 0.6;
    this.gem.position.y = Math.sin(this.t * 0.8) * 1.5;
    this.beamMat.opacity = 0.18 + Math.sin(this.t * 1.5) * 0.05;
  }
}
