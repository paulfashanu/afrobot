import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges lots of small static decoration pieces into a handful of vertex-coloured meshes,
 * keeping draw calls low (palms, stalls, lamps, clouds, bridges...).
 */
export class StaticBatcher {
  private solid: THREE.BufferGeometry[] = [];
  private glow: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private c = new THREE.Color();

  add(
    geo: THREE.BufferGeometry,
    pos: THREE.Vector3Like,
    color: THREE.ColorRepresentation,
    opts: { rot?: [number, number, number]; order?: THREE.EulerOrder; scale?: [number, number, number]; glow?: boolean; glowBoost?: number } = {},
  ) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    g.deleteAttribute('uv');
    const r = opts.rot ?? [0, 0, 0];
    this.e.set(r[0], r[1], r[2], opts.order ?? 'XYZ');
    this.q.setFromEuler(this.e);
    const s = opts.scale ?? [1, 1, 1];
    this.m.compose(new THREE.Vector3(pos.x, pos.y, pos.z), this.q, new THREE.Vector3(s[0], s[1], s[2]));
    g.applyMatrix4(this.m);
    this.c.set(color);
    if (opts.glow) this.c.multiplyScalar(opts.glowBoost ?? 2.2);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = this.c.r; col[i * 3 + 1] = this.c.g; col[i * 3 + 2] = this.c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (opts.glow ? this.glow : this.solid).push(g);
  }

  /** Merge everything added so far into one solid mesh + one glow mesh. */
  build(name: string, opts: { castShadow?: boolean; receiveShadow?: boolean; flat?: boolean } = {}): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    if (this.solid.length) {
      const mesh = new THREE.Mesh(
        mergeGeometries(this.solid),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, flatShading: opts.flat ?? false }),
      );
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      group.add(mesh);
    }
    if (this.glow.length) {
      const mesh = new THREE.Mesh(mergeGeometries(this.glow), new THREE.MeshBasicMaterial({ vertexColors: true }));
      group.add(mesh);
    }
    this.solid.forEach((g) => g.dispose());
    this.glow.forEach((g) => g.dispose());
    this.solid = [];
    this.glow = [];
    return group;
  }
}

/** Shared primitive geometries for batching. */
export const Prims = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cylHi: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  sphere: new THREE.SphereGeometry(0.5, 12, 8),
  sphereLo: new THREE.SphereGeometry(0.5, 8, 6),
  ico: new THREE.IcosahedronGeometry(0.5, 1),
  torus: new THREE.TorusGeometry(0.5, 0.08, 6, 20),
};
