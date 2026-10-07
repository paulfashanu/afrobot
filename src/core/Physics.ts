import * as THREE from 'three';

/**
 * A solid the player (and camera) can collide with.
 * Boxes are axis-aligned; cylinders are vertical discs/columns.
 * Moving solids publish `delta` / `yawDelta` each step so whatever stands on them is carried.
 */
export class Solid {
  readonly min = new THREE.Vector3();
  readonly max = new THREE.Vector3();
  readonly center = new THREE.Vector3(); // cylinder axis (x,z) — y unused
  readonly delta = new THREE.Vector3();
  yawDelta = 0;
  radius = 0;
  carry = true;
  enabled = true;
  onLand?: () => void;

  constructor(public readonly kind: 'box' | 'cyl') {}

  static box(cx: number, top: number, cz: number, w: number, h: number, d: number): Solid {
    const s = new Solid('box');
    s.setBox(cx, top, cz, w, h, d);
    return s;
  }

  static cyl(cx: number, top: number, cz: number, radius: number, h: number): Solid {
    const s = new Solid('cyl');
    s.radius = radius;
    s.setCyl(cx, top, cz, h);
    return s;
  }

  setBox(cx: number, top: number, cz: number, w: number, h: number, d: number) {
    this.min.set(cx - w / 2, top - h, cz - d / 2);
    this.max.set(cx + w / 2, top, cz + d / 2);
    this.center.set(cx, top - h / 2, cz);
  }

  setCyl(cx: number, top: number, cz: number, h: number) {
    this.center.set(cx, top - h / 2, cz);
    this.min.set(cx - this.radius, top - h, cz - this.radius);
    this.max.set(cx + this.radius, top, cz + this.radius);
  }

  /** Move by an offset, recording the movement for carrying. */
  translate(dx: number, dy: number, dz: number) {
    this.delta.set(dx, dy, dz);
    this.min.x += dx; this.min.y += dy; this.min.z += dz;
    this.max.x += dx; this.max.y += dy; this.max.z += dz;
    this.center.x += dx; this.center.y += dy; this.center.z += dz;
  }

  get top() { return this.max.y; }
  get bottom() { return this.min.y; }

  overlapsXZ(x: number, z: number, r: number): boolean {
    if (this.kind === 'box') {
      return x + r > this.min.x && x - r < this.max.x && z + r > this.min.z && z - r < this.max.z;
    }
    const dx = x - this.center.x, dz = z - this.center.z;
    const rr = r + this.radius;
    return dx * dx + dz * dz < rr * rr;
  }

  overlapsY(feet: number, h: number): boolean {
    return feet < this.max.y - 0.001 && feet + h > this.min.y + 0.001;
  }
}

/** Something that hurts the player on contact. Returns a knockback direction when hit. */
export interface Hazard {
  hit(pos: THREE.Vector3, radius: number, height: number): THREE.Vector3 | null;
}

/** Highest solid top directly beneath a point (for blob shadow / enemy placement). */
export function groundHeightBelow(solids: Solid[], x: number, y: number, z: number, r = 0.05): number {
  let best = -Infinity;
  for (const s of solids) {
    if (!s.enabled) continue;
    if (s.max.y > y + 0.05) continue;
    if (!s.overlapsXZ(x, z, r)) continue;
    if (s.max.y > best) best = s.max.y;
  }
  return best;
}
