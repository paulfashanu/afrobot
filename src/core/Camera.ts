import * as THREE from 'three';
import type { Input } from './Input';

const DEFAULT_PITCH = 0.34;
const MIN_PITCH = -0.15;
const MAX_PITCH = 1.15;
const BASE_DIST = 8.2;
const BASE_FOV = 60;

export interface FollowInfo {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  grounded: boolean;
  dashing: boolean;
}

/**
 * Third-person platformer camera:
 * smooth lagged follow with look-ahead, dynamic distance, airborne framing,
 * trauma-based shake, dash FOV kick, multi-ray wall avoidance and a cinematic mode.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = DEFAULT_PITCH;
  blockers: THREE.Object3D[] = [];
  sensitivity = 0.0024;

  private target = new THREE.Vector3();
  private lookAhead = new THREE.Vector3();
  private dist = BASE_DIST;
  private idle = 0;
  private airPitch = 0;
  private trauma = 0;
  private shakeT = 0;
  private fov = BASE_FOV;
  private fovKick = 0;
  private ray = new THREE.Raycaster();
  private tmp = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private side = new THREE.Vector3();
  private origin = new THREE.Vector3();

  // cinematic
  private cine = false;
  private cinePos = new THREE.Vector3();
  private cineLook = new THREE.Vector3();
  private curLook = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.1, 1600);
  }

  /** Add screen shake (0..1). Stacks, capped at 1. */
  shake(amount: number) { this.trauma = Math.min(1, this.trauma + amount); }
  kickFov(amount: number) { this.fovKick = Math.max(this.fovKick, amount); }

  snapTo(pos: THREE.Vector3, yaw: number) {
    this.cine = false;
    this.yaw = yaw;
    this.pitch = DEFAULT_PITCH;
    this.target.copy(pos).add(new THREE.Vector3(0, 1.4, 0));
    this.lookAhead.set(0, 0, 0);
    this.dist = BASE_DIST;
    this.airPitch = 0;
    this.place();
  }

  /** Cinematic: smoothly move the camera to `pos`, looking at `look`. */
  setCinematic(pos: THREE.Vector3, look: THREE.Vector3, snap = false) {
    if (!this.cine || snap) { this.camera.position.copy(pos); this.curLook.copy(look); }
    this.cine = true;
    this.cinePos.copy(pos);
    this.cineLook.copy(look);
  }

  /** Leave cinematic mode, blending back into follow behind the player. */
  endCinematic(pos: THREE.Vector3, yaw: number) {
    this.cine = false;
    this.yaw = yaw;
    this.pitch = DEFAULT_PITCH;
    this.target.copy(pos).add(new THREE.Vector3(0, 1.4, 0));
    this.dist = BASE_DIST;
  }

  get inCinematic() { return this.cine; }

  update(dt: number, input: Input | null, f: FollowInfo) {
    if (this.cine) {
      const k = 1 - Math.exp(-dt * 2.6);
      this.camera.position.lerp(this.cinePos, k);
      this.curLook.lerp(this.cineLook, 1 - Math.exp(-dt * 4));
      this.camera.lookAt(this.curLook);
      this.applyShakeAndFov(dt);
      return;
    }

    const hs = Math.hypot(f.vel.x, f.vel.z);
    if (input) {
      const mx = input.mouseDX, my = input.mouseDY;
      this.yaw -= mx * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch + my * this.sensitivity, MIN_PITCH, MAX_PITCH);
      if (Math.abs(mx) + Math.abs(my) > 0.5) this.idle = 0;
      else this.idle += dt;
      if (this.idle > 1.6) {
        // Automatic height: drift back to a comfortable pitch
        this.pitch += (DEFAULT_PITCH - this.pitch) * Math.min(1, dt * 1.2);
        // Gentle auto-follow: swing around when running across the view
        if (hs > 4 && f.grounded) {
          const moveYaw = Math.atan2(-f.vel.x, -f.vel.z); // camera yaw that would sit behind the motion
          let d = moveYaw - this.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          if (Math.abs(d) < 2.2) this.yaw += d * Math.min(1, dt * 0.35) * Math.min(1, (this.idle - 1.6));
        }
      }
    }

    // Look-ahead in the direction of travel (camera lag + better framing)
    const ahead = this.tmp.set(f.vel.x, 0, f.vel.z).multiplyScalar(0.12);
    if (ahead.length() > 1.6) ahead.setLength(1.6);
    this.lookAhead.lerp(ahead, 1 - Math.exp(-dt * 3));

    const desired = this.tmp.copy(f.pos).add(this.lookAhead);
    desired.y += 1.4;
    const kXZ = 1 - Math.exp(-dt * 9);
    const kY = 1 - Math.exp(-dt * (f.grounded ? 7 : 2.8));
    this.target.x += (desired.x - this.target.x) * kXZ;
    this.target.z += (desired.z - this.target.z) * kXZ;
    this.target.y += (desired.y - this.target.y) * kY;
    // Never let the player drop out of frame when falling fast
    if (f.pos.y + 0.6 < this.target.y - 2.2) this.target.y = f.pos.y + 0.6 + 2.2;
    if (f.pos.y + 2.6 > this.target.y + 2.0) this.target.y = f.pos.y + 2.6 - 2.0;

    // Airborne framing: tilt down a little while falling so landings are visible
    const wantAir = !f.grounded && f.vel.y < -6 ? 0.16 : !f.grounded ? 0.04 : 0;
    this.airPitch += (wantAir - this.airPitch) * Math.min(1, dt * 2.5);

    // Dynamic distance: pull back with speed and while airborne
    const want = BASE_DIST + Math.min(hs, 12) * 0.1 + (f.grounded ? 0 : 0.9);
    this.dir.set(0, 0, 0);
    const pitch = this.pitch + this.airPitch;
    const cp = Math.cos(pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp).normalize();

    // Multi-ray wall avoidance (centre + left/right/up probes)
    let allowed = want;
    if (this.blockers.length) {
      this.side.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const offsets: [number, number][] = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.4]];
      for (const [sx, sy] of offsets) {
        this.origin.copy(this.target).addScaledVector(this.side, sx);
        this.origin.y += sy;
        this.ray.set(this.origin, this.dir);
        this.ray.far = want + 0.6;
        const hit = this.ray.intersectObjects(this.blockers, false)[0];
        if (hit) allowed = Math.min(allowed, Math.max(1.8, hit.distance - 0.6));
      }
    }
    if (allowed < this.dist) this.dist += (allowed - this.dist) * Math.min(1, dt * 18); // pull in fast
    else this.dist += (allowed - this.dist) * (1 - Math.exp(-dt * 1.8)); // ease out slowly

    if (f.dashing) this.kickFov(7);
    this.place();
    this.applyShakeAndFov(dt);
  }

  private place() {
    this.camera.position.copy(this.target).addScaledVector(this.dir.lengthSq() ? this.dir : this.defaultDir(), this.dist);
    this.camera.lookAt(this.target.x, this.target.y + 0.3, this.target.z);
  }

  private defaultDir() {
    const cp = Math.cos(this.pitch);
    return this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  private applyShakeAndFov(dt: number) {
    this.shakeT += dt;
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const t = this.shakeT * 38;
      this.camera.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.18 * s;
      this.camera.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.5) * 0.15 * s;
      this.camera.rotation.z += Math.sin(t * 1.3 + 2) * 0.025 * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
    this.fovKick = Math.max(0, this.fovKick - dt * 22);
    const targetFov = BASE_FOV + this.fovKick;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 10);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Unit forward/right vectors on the ground plane, for camera-relative movement. */
  basis(forward: THREE.Vector3, right: THREE.Vector3) {
    forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}
