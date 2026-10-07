import * as THREE from 'three';
import type { Solid } from '../core/Physics';
import type { Input } from '../core/Input';
import type { CameraRig } from '../core/Camera';
import { Afrobot } from './Afrobot';

export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.5;

const RUN_SPEED = 9;
const GROUND_ACCEL = 70;
const GROUND_DECEL = 55;
const AIR_ACCEL = 32;
const GRAVITY = 38;
const FALL_GRAVITY_MULT = 1.35;
const MAX_FALL = 32;
const JUMP_VEL = 14;
const DOUBLE_JUMP_VEL = 12.5;
const JUMP_CUT = 0.5;
const COYOTE = 0.12;
const JUMP_BUFFER = 0.13;
const DASH_SPEED = 21;
const DASH_TIME = 0.19;
const DASH_COOLDOWN = 0.42;
const STEP_HEIGHT = 0.4;
const MAX_HEALTH = 3;

export type PlayerEvent = 'jump' | 'doubleJump' | 'dash' | 'land' | 'hurt' | 'dead';

/** Owns the player's physics state and drives the Afrobot model. */
export class PlayerController {
  readonly model = new Afrobot();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  facing = 0;
  grounded = false;
  ground: Solid | null = null;
  health = MAX_HEALTH;
  readonly maxHealth = MAX_HEALTH;
  invuln = 0;
  frozen = false;

  private coyote = 0;
  private jumpBuffer = 0;
  private canDouble = true;
  private jumpCutAvailable = false;
  private dashT = 0;
  private dashCd = 0;
  private airDash = true;
  private dashDir = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private wish = new THREE.Vector3();
  private prevGrounded = false;
  private fallSpeed = 0;
  private stunned = 0;

  /** Event listeners (sound, particles, ...). */
  onEvent: (e: PlayerEvent, p: THREE.Vector3, extra?: number) => void = () => {};

  get dashing() { return this.dashT > 0; }
  get center() { return new THREE.Vector3(this.pos.x, this.pos.y + PLAYER_HEIGHT / 2, this.pos.z); }

  spawn(p: THREE.Vector3, yaw: number) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.facing = yaw;
    this.grounded = false;
    this.ground = null;
    this.dashT = 0;
    this.stunned = 0;
    this.canDouble = true;
    this.airDash = true;
    this.model.root.position.copy(p);
    this.model.root.rotation.y = yaw;
  }

  /** Called once per frame before physics substeps to capture edge-triggered input. */
  readInput(input: Input) {
    if (this.frozen) return;
    if (input.jumpPressed) this.jumpBuffer = JUMP_BUFFER;
    if (input.wasReleased('Space') && this.jumpCutAvailable && this.vel.y > 0) {
      this.vel.y *= JUMP_CUT;
      this.jumpCutAvailable = false;
    }
    if (input.dashPressed) this.tryDash = true;
  }
  private tryDash = false;

  step(dt: number, input: Input, cam: CameraRig, solids: Solid[]) {
    // 1) Ride whatever we're standing on
    if (this.ground && this.ground.carry && this.ground.enabled) {
      const g = this.ground;
      this.pos.add(g.delta);
      if (g.yawDelta !== 0) {
        const dx = this.pos.x - g.center.x, dz = this.pos.z - g.center.z;
        const c = Math.cos(g.yawDelta), s = Math.sin(g.yawDelta);
        this.pos.x = g.center.x + dx * c + dz * s;
        this.pos.z = g.center.z - dx * s + dz * c;
        this.facing += g.yawDelta;
      }
    }

    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.stunned = Math.max(0, this.stunned - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? COYOTE : Math.max(0, this.coyote - dt);

    // 2) Desired direction, camera-relative
    const ax = this.frozen || this.stunned > 0 ? { x: 0, y: 0 } : input.moveAxis();
    cam.basis(this.fwd, this.right);
    this.wish.set(0, 0, 0).addScaledVector(this.right, ax.x).addScaledVector(this.fwd, ax.y);
    const wishLen = this.wish.length();

    // 3) Dash
    if (this.tryDash) {
      this.tryDash = false;
      if (this.dashCd <= 0 && (this.grounded || this.airDash) && this.stunned <= 0) {
        if (wishLen > 0.1) this.dashDir.copy(this.wish).normalize();
        else this.dashDir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
        this.dashT = DASH_TIME;
        this.dashCd = DASH_COOLDOWN;
        if (!this.grounded) this.airDash = false;
        this.facing = Math.atan2(this.dashDir.x, this.dashDir.z);
        this.onEvent('dash', this.pos);
      }
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vel.x = this.dashDir.x * DASH_SPEED;
      this.vel.z = this.dashDir.z * DASH_SPEED;
      this.vel.y = 0;
      if (this.dashT <= 0) {
        this.vel.x = this.dashDir.x * RUN_SPEED * 1.05;
        this.vel.z = this.dashDir.z * RUN_SPEED * 1.05;
      }
    } else {
      // 4) Horizontal acceleration / deceleration
      const target = this.wish.multiplyScalar(RUN_SPEED);
      const accel = this.grounded ? (wishLen > 0.01 ? GROUND_ACCEL : GROUND_DECEL) : AIR_ACCEL * (wishLen > 0.01 ? 1 : 0.35);
      const dvx = target.x - this.vel.x, dvz = target.z - this.vel.z;
      const dl = Math.hypot(dvx, dvz);
      const maxDv = accel * dt;
      if (dl <= maxDv) { this.vel.x = target.x; this.vel.z = target.z; }
      else { this.vel.x += (dvx / dl) * maxDv; this.vel.z += (dvz / dl) * maxDv; }

      // 5) Jumping
      if (this.jumpBuffer > 0 && !this.frozen) {
        if (this.grounded || this.coyote > 0) {
          this.vel.y = JUMP_VEL;
          this.grounded = false; this.ground = null; this.coyote = 0; this.jumpBuffer = 0;
          this.jumpCutAvailable = true;
          this.model.jump();
          this.onEvent('jump', this.pos);
        } else if (this.canDouble) {
          this.vel.y = DOUBLE_JUMP_VEL;
          this.canDouble = false; this.jumpBuffer = 0;
          this.jumpCutAvailable = false;
          this.model.doubleJump();
          this.onEvent('doubleJump', this.pos);
        }
      }

      // 6) Gravity (heavier on the way down for a snappier arc)
      const g = this.vel.y < 0 ? GRAVITY * FALL_GRAVITY_MULT : GRAVITY;
      this.vel.y = Math.max(-MAX_FALL, this.vel.y - g * dt);
    }

    // 7) Integrate + collide, one axis at a time
    this.moveAxis('x', this.vel.x * dt, solids);
    this.moveAxis('z', this.vel.z * dt, solids);
    this.moveVertical(this.vel.y * dt, solids);

    if (this.grounded) {
      this.canDouble = true;
      this.airDash = true;
      if (!this.prevGrounded) {
        this.model.land(this.fallSpeed);
        this.onEvent('land', this.pos, this.fallSpeed);
        this.ground?.onLand?.();
      }
    }
    if (!this.grounded) this.fallSpeed = Math.max(0, -this.vel.y);
    this.prevGrounded = this.grounded;

    // Face movement direction
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.5 && this.stunned <= 0) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      let d = targetYaw - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 16);
    }
  }

  private moveAxis(axis: 'x' | 'z', amount: number, solids: Solid[]) {
    this.pos[axis] += amount;
    const R = PLAYER_RADIUS;
    for (const s of solids) {
      if (!s.enabled) continue;
      if (!s.overlapsY(this.pos.y, PLAYER_HEIGHT) || !s.overlapsXZ(this.pos.x, this.pos.z, R)) continue;
      const rise = s.top - this.pos.y;
      if (rise <= STEP_HEIGHT && (this.grounded || this.vel.y <= 0)) {
        // Step up small ledges (kerbs, stairs)
        this.pos.y = s.top;
        continue;
      }
      if (s.kind === 'box') {
        const pushNeg = this.pos[axis] + R - s.min[axis];
        const pushPos = s.max[axis] - (this.pos[axis] - R);
        if (pushNeg < pushPos) this.pos[axis] -= pushNeg + 1e-4;
        else this.pos[axis] += pushPos + 1e-4;
        if (this.dashT <= 0) this.vel[axis] = 0;
      } else {
        const dx = this.pos.x - s.center.x, dz = this.pos.z - s.center.z;
        const l = Math.hypot(dx, dz) || 1;
        const r = s.radius + R + 1e-4;
        this.pos.x = s.center.x + (dx / l) * r;
        this.pos.z = s.center.z + (dz / l) * r;
      }
    }
  }

  private moveVertical(amount: number, solids: Solid[]) {
    const prevFeet = this.pos.y;
    this.pos.y += amount;
    this.grounded = false;
    const R = PLAYER_RADIUS * 0.9;
    let landed: Solid | null = null;
    for (const s of solids) {
      if (!s.enabled) continue;
      if (!s.overlapsXZ(this.pos.x, this.pos.z, R)) continue;
      if (this.vel.y <= 0) {
        // Small epsilon above the top so resting contact is stable even with tiny timesteps.
        const touching = this.pos.y <= s.top + 0.01 && this.pos.y + PLAYER_HEIGHT > s.bottom;
        if (touching && prevFeet >= s.top - 0.3 - Math.max(0, s.delta.y)) {
          if (!landed || s.top > landed.top) landed = s;
        }
      } else if (s.overlapsY(this.pos.y, PLAYER_HEIGHT) && prevFeet + PLAYER_HEIGHT <= s.bottom + 0.3) {
        this.pos.y = s.bottom - PLAYER_HEIGHT;
        this.vel.y = 0;
      }
    }
    if (landed) {
      this.pos.y = landed.top;
      this.vel.y = 0;
      this.grounded = true;
      this.ground = landed;
    } else {
      this.ground = null;
    }
  }

  /** Bounce off an enemy after stomping it. */
  bounce(v = 13) {
    this.vel.y = v;
    this.grounded = false;
    this.ground = null;
    this.canDouble = true;
    this.airDash = true;
    this.jumpCutAvailable = true;
  }

  /** Take damage with knockback. Returns true if this hit was lethal. */
  damage(dir: THREE.Vector3): boolean {
    if (this.invuln > 0 || this.frozen) return false;
    this.health -= 1;
    this.invuln = 1.4;
    this.stunned = 0.35;
    this.dashT = 0;
    const d = dir.clone().setY(0);
    if (d.lengthSq() < 1e-4) d.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));
    d.normalize();
    this.vel.set(d.x * 9, 9, d.z * 9);
    this.grounded = false;
    this.ground = null;
    this.model.hurt();
    this.onEvent('hurt', this.pos);
    if (this.health <= 0) {
      this.onEvent('dead', this.pos);
      return true;
    }
    return false;
  }

  heal() { this.health = MAX_HEALTH; }

  updateVisual(dt: number) {
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
    this.model.update(dt, {
      speed: Math.hypot(this.vel.x, this.vel.z),
      grounded: this.grounded,
      vy: this.vel.y,
      dashing: this.dashing,
    });
  }
}
