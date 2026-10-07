import * as THREE from 'three';
import type { Input } from './Input';

const DEFAULT_PITCH = 0.32;
const MIN_PITCH = -0.15;
const MAX_PITCH = 1.15;
const DISTANCE = 8.5;

/** Third-person orbit camera: smooth follow, mouse yaw/pitch, auto height, anti-clipping. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = DEFAULT_PITCH;
  private target = new THREE.Vector3();
  private dist = DISTANCE;
  private idle = 0;
  private ray = new THREE.Raycaster();
  private tmp = new THREE.Vector3();
  private dir = new THREE.Vector3();
  blockers: THREE.Object3D[] = [];
  sensitivity = 0.0024;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1400);
  }

  snapTo(pos: THREE.Vector3, yaw: number) {
    this.yaw = yaw;
    this.pitch = DEFAULT_PITCH;
    this.target.copy(pos).add(new THREE.Vector3(0, 1.4, 0));
    this.dist = DISTANCE;
    this.update(0, null, pos, 0, true);
  }

  update(dt: number, input: Input | null, playerPos: THREE.Vector3, playerSpeed: number, grounded: boolean) {
    if (input) {
      const mx = input.mouseDX, my = input.mouseDY;
      this.yaw -= mx * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch + my * this.sensitivity, MIN_PITCH, MAX_PITCH);
      if (Math.abs(mx) + Math.abs(my) > 0.5) this.idle = 0;
      else this.idle += dt;
      // Automatic height: drift back to a comfortable pitch after the mouse has been idle.
      if (this.idle > 1.6) this.pitch += (DEFAULT_PITCH - this.pitch) * Math.min(1, dt * 1.2);
    }

    // Smooth follow; vertical follow is softer while airborne so jumps don't bounce the view.
    const desired = this.tmp.copy(playerPos);
    desired.y += 1.4;
    const kXZ = 1 - Math.exp(-dt * 12);
    const kY = 1 - Math.exp(-dt * (grounded ? 8 : 3.5));
    this.target.x += (desired.x - this.target.x) * kXZ;
    this.target.z += (desired.z - this.target.z) * kXZ;
    this.target.y += (desired.y - this.target.y) * kY;
    // Never let the player drop out of frame when falling fast.
    if (playerPos.y + 0.6 < this.target.y - 2.5) this.target.y = playerPos.y + 0.6 + 2.5;

    const wantDist = DISTANCE + Math.min(playerSpeed, 12) * 0.08;
    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();

    // Pull in when level geometry is between player and camera.
    let allowed = wantDist;
    if (this.blockers.length) {
      this.ray.set(this.target, this.dir);
      this.ray.far = wantDist + 0.5;
      const hits = this.ray.intersectObjects(this.blockers, false);
      if (hits.length) allowed = Math.max(1.6, hits[0].distance - 0.5);
    }
    if (allowed < this.dist) this.dist = allowed; // snap in fast
    else this.dist += (allowed - this.dist) * (1 - Math.exp(-dt * 2.5)); // ease out slowly

    this.camera.position.copy(this.target).addScaledVector(this.dir, this.dist);
    this.camera.lookAt(this.target.x, this.target.y + 0.3, this.target.z);
  }

  /** Unit forward/right vectors on the ground plane, for camera-relative movement. */
  basis(forward: THREE.Vector3, right: THREE.Vector3) {
    forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}
