import * as THREE from 'three';
import { Solid } from '../core/Physics';
import { glowMat, Platform } from './Platform';

// ---------------------------------------------------------------------------
// Shared interfaces

/** Something Afrobot can walk up to and press E on. */
export interface Interactable {
  readonly position: THREE.Vector3;
  readonly interactRadius: number;
  readonly prompt: string;          // e.g. "TALK", "READ"
  dialogueKey?: string;
  canInteract(): boolean;
}

/** Something that reacts to Afrobot's PULSE. Returns true if it reacted. */
export interface PulseReactive {
  onPulse(center: THREE.Vector3, radius: number): boolean;
}

const stone = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.9 });
const stoneDark = new THREE.MeshStandardMaterial({ color: 0x5a4c44, roughness: 0.95 });
const gold = new THREE.MeshStandardMaterial({ color: 0xf5b52a, roughness: 0.3, metalness: 0.8 });
const metal = new THREE.MeshStandardMaterial({ color: 0x2b2440, roughness: 0.4, metalness: 0.6 });

// ---------------------------------------------------------------------------
// Strange symbols (original glyph designs) — used on ancient objects

const glyphTexCache = new Map<number, THREE.CanvasTexture>();
export function glyphTexture(kind: number) {
  let t = glyphTexCache.get(kind);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath();
  switch (kind % 5) {
    case 0: // crowned eye
      g.arc(64, 70, 18, 0, Math.PI * 2); g.moveTo(36, 70); g.quadraticCurveTo(64, 30, 92, 70); g.quadraticCurveTo(64, 110, 36, 70);
      g.moveTo(44, 30); g.lineTo(52, 42); g.moveTo(64, 22); g.lineTo(64, 38); g.moveTo(84, 30); g.lineTo(76, 42); break;
    case 1: // nested chevrons
      for (let i = 0; i < 3; i++) { g.moveTo(30, 40 + i * 22); g.lineTo(64, 20 + i * 22); g.lineTo(98, 40 + i * 22); } break;
    case 2: // spiral
      for (let a = 0; a < Math.PI * 5; a += 0.15) { const r = 4 + a * 3.2; const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); } break;
    case 3: // gate arch with core
      g.moveTo(34, 108); g.lineTo(34, 54); g.arc(64, 54, 30, Math.PI, 0); g.lineTo(94, 108); g.moveTo(64 + 9, 72); g.arc(64, 72, 9, 0, Math.PI * 2); break;
    default: // sun with rays
      g.arc(64, 64, 16, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.moveTo(64 + Math.cos(a) * 26, 64 + Math.sin(a) * 26); g.lineTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44); }
  }
  g.stroke();
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  glyphTexCache.set(kind, t);
  return t;
}

/** A glowing strange symbol on a surface. Pulses softly. */
export class GlyphDecal {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private t = Math.random() * 10;
  constructor(kind: number, x: number, y: number, z: number, rotY: number, size = 1.6, color = 0x5ff7ff) {
    this.mat = new THREE.MeshBasicMaterial({ map: glyphTexture(kind), color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, depthWrite: false, opacity: 0.8 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.mat);
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = rotY;
  }
  update(dt: number) { this.t += dt; this.mat.opacity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(this.t * 1.3)); }
}

// ---------------------------------------------------------------------------
// ENERGY DOOR — blocks the way until hit with a Pulse

export class EnergyDoor implements Interactable, PulseReactive {
  readonly mesh = new THREE.Group();
  readonly solid: Solid;
  readonly position: THREE.Vector3;
  readonly interactRadius = 3;
  readonly prompt = 'INSPECT';
  dialogueKey = 'door-hint';
  open = false;
  private field: THREE.Mesh;
  private fieldMat: THREE.ShaderMaterial;
  private openT = -1;
  onOpen?: () => void;

  /** axis 'x' = door spans X (you walk through it along Z). */
  constructor(axis: 'x' | 'z', x: number, y: number, z: number, width: number, height: number) {
    this.position = new THREE.Vector3(x, y, z);
    this.mesh.position.copy(this.position);
    if (axis === 'z') this.mesh.rotation.y = Math.PI / 2;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, height + 0.6, 0.9), stoneDark);
      p.position.set(s * (width / 2 + 0.4), (height + 0.6) / 2, 0);
      p.castShadow = true;
      this.mesh.add(p);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, 0.95), glowMat(0x5ff7ff, 2));
      strip.position.set(s * (width / 2 + 0.05), height / 2, 0);
      this.mesh.add(strip);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + 1.8, 0.7, 1.0), gold);
    lintel.position.y = height + 0.6;
    lintel.castShadow = true;
    this.mesh.add(lintel);
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: glyphTexture(3), color: new THREE.Color(0x5ff7ff).multiplyScalar(2), transparent: true }));
    glyph.position.set(0, height + 0.6, 0.51);
    this.mesh.add(glyph);
    this.fieldMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform float uFade; varying vec2 vUv;
        void main(){
          vec2 p = vUv * vec2(6.0, 8.0);
          vec2 h = abs(fract(p + vec2(0.5 * floor(p.y), 0.0)) - 0.5);
          float hex = smoothstep(0.42, 0.48, max(h.x, h.y));
          float scan = 0.5 + 0.5 * sin(vUv.y * 30.0 - uTime * 4.0);
          float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          vec3 col = mix(vec3(0.35, 0.15, 0.9), vec3(0.4, 1.0, 1.0), hex * 0.8 + scan * 0.2) * 1.8;
          gl_FragColor = vec4(col, (0.35 + hex * 0.4 + scan * 0.1) * edge * uFade);
        }`,
    });
    this.field = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.fieldMat);
    this.field.position.y = height / 2;
    this.mesh.add(this.field);
    const w = axis === 'x' ? width : 0.8, d = axis === 'x' ? 0.8 : width;
    this.solid = Solid.box(x, y + height, z, w, height, d);
  }

  canInteract() { return !this.open; }

  onPulse(center: THREE.Vector3, radius: number) {
    if (this.open || center.distanceTo(this.position) > radius + 2) return false;
    this.open = true;
    this.openT = 0;
    this.solid.enabled = false;
    this.onOpen?.();
    return true;
  }

  update(dt: number) {
    this.fieldMat.uniforms.uTime.value += dt;
    if (this.openT >= 0) {
      this.openT += dt;
      const k = Math.min(1, this.openT / 0.7);
      this.fieldMat.uniforms.uFade.value = 1 - k;
      this.field.scale.y = 1 - k * 0.9;
      if (k >= 1) { this.field.visible = false; this.openT = -1; }
    }
  }
}

// ---------------------------------------------------------------------------
// BREAKABLE BARRIER — cracked crates that shatter on a Dash (or Pulse for glitch crates)

const crackTexCache = new Map<string, THREE.CanvasTexture>();
function crackTexture(glow: string) {
  let t = crackTexCache.get(glow);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b07a44'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#8b5a2b'; for (let i = 0; i < 128; i += 16) g.fillRect(0, i, 128, 3);
  g.strokeStyle = '#5a3a1a'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
  g.strokeStyle = glow; g.lineWidth = 4; g.shadowColor = glow; g.shadowBlur = 8;
  g.beginPath(); g.moveTo(20, 10); g.lineTo(50, 50); g.lineTo(40, 80); g.lineTo(70, 118); g.moveTo(50, 50); g.lineTo(100, 40); g.lineTo(118, 70); g.stroke();
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  crackTexCache.set(glow, t);
  return t;
}

export class BreakableBarrier implements PulseReactive {
  readonly mesh = new THREE.Group();
  readonly solid: Solid;
  readonly center: THREE.Vector3;
  broken = false;
  private pieces: { m: THREE.Mesh; v: THREE.Vector3; s: THREE.Vector3 }[] = [];
  private t = -1;
  private half: THREE.Vector3;
  onBreak?: (center: THREE.Vector3) => void;

  constructor(x: number, y: number, z: number, w: number, h: number, d: number, readonly breakBy: 'dash' | 'pulse' | 'both' = 'dash') {
    this.center = new THREE.Vector3(x, y + h / 2, z);
    this.half = new THREE.Vector3(w / 2, h / 2, d / 2);
    const glow = breakBy === 'dash' ? '#ffb02e' : '#c04bff';
    const mat = new THREE.MeshStandardMaterial({ map: crackTexture(glow), roughness: 0.8, emissive: new THREE.Color(glow), emissiveMap: crackTexture(glow), emissiveIntensity: 0.6 });
    const size = 1.1;
    const nx = Math.max(1, Math.round(w / size)), ny = Math.max(1, Math.round(h / size)), nz = Math.max(1, Math.round(d / size));
    const sx = w / nx, sy = h / ny, sz = d / nz;
    const geo = new THREE.BoxGeometry(sx * 0.97, sy * 0.97, sz * 0.97);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x - w / 2 + sx * (i + 0.5), y + sy * (j + 0.5), z - d / 2 + sz * (k + 0.5));
      m.rotation.y = (Math.random() - 0.5) * 0.06;
      m.castShadow = true; m.receiveShadow = true;
      this.mesh.add(m);
      this.pieces.push({ m, v: new THREE.Vector3(), s: new THREE.Vector3() });
    }
    // warning stripes so it reads as "breakable"
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, d) > 0.9 ? 1.2 : 1.0, 1.0), new THREE.MeshBasicMaterial({ map: glyphTexture(1), color: new THREE.Color(glow).multiplyScalar(1.6), transparent: true, depthWrite: false }));
    sign.position.set(x, y + h + 0.7, z);
    this.mesh.add(sign);
    this.solid = Solid.box(x, y + h, z, w, h, d);
  }

  /** Is the point within reach of the barrier (for dash checks)? */
  near(p: THREE.Vector3, r: number) {
    return Math.abs(p.x - this.center.x) < this.half.x + r && Math.abs(p.z - this.center.z) < this.half.z + r && p.y < this.center.y + this.half.y && p.y + 1.5 > this.center.y - this.half.y;
  }

  shatter(from: THREE.Vector3) {
    if (this.broken) return;
    this.broken = true;
    this.solid.enabled = false;
    this.t = 0;
    for (const p of this.pieces) {
      const dir = p.m.position.clone().sub(from).setY(0).normalize();
      p.v.set(dir.x * (4 + Math.random() * 5), 4 + Math.random() * 6, dir.z * (4 + Math.random() * 5));
      p.s.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
    }
    this.mesh.children[this.mesh.children.length - 1].visible = false;
    this.onBreak?.(this.center);
  }

  onPulse(center: THREE.Vector3, radius: number) {
    if (this.broken || this.breakBy === 'dash') return false;
    if (center.distanceTo(this.center) > radius + Math.max(this.half.x, this.half.z)) return false;
    this.shatter(center);
    return true;
  }

  update(dt: number) {
    if (this.t < 0) return;
    this.t += dt;
    for (const p of this.pieces) {
      p.v.y -= 25 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.s.x * dt; p.m.rotation.y += p.s.y * dt; p.m.rotation.z += p.s.z * dt;
      const k = Math.max(0, 1 - (this.t - 0.6) / 0.8);
      p.m.scale.setScalar(k);
    }
    if (this.t > 1.5) { this.mesh.visible = false; this.t = -1; }
  }
}

// ---------------------------------------------------------------------------
// ANCIENT GLYPH PILLAR — a mechanism woken by Pulse; raises hidden stepping stones

export class GlyphPillar implements Interactable, PulseReactive {
  readonly mesh = new THREE.Group();
  readonly solid: Solid;
  readonly position: THREE.Vector3;
  readonly interactRadius = 2.6;
  readonly prompt = 'INSPECT';
  dialogueKey = 'glyph-hint';
  active = false;
  private glyphMats: THREE.MeshBasicMaterial[] = [];
  private ring: THREE.Mesh;
  private stones: RisingStone[] = [];
  onActivate?: () => void;

  constructor(x: number, y: number, z: number) {
    this.position = new THREE.Vector3(x, y, z);
    this.mesh.position.copy(this.position);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 3.2, 6), stone);
    body.position.y = 1.6;
    body.castShadow = true;
    this.mesh.add(body);
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), gold);
    cap.position.y = 3.6;
    this.mesh.add(cap);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.MeshBasicMaterial({ map: glyphTexture(i), color: new THREE.Color(0x333344), transparent: true, depthWrite: false });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), m);
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      p.position.set(Math.sin(a) * 0.66, 1.2 + (i % 2) * 1.1, Math.cos(a) * 0.66);
      p.rotation.y = a;
      this.mesh.add(p);
      this.glyphMats.push(m);
    }
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 24), glowMat(0x5ff7ff, 2));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 3.2;
    this.ring.visible = false;
    this.mesh.add(this.ring);
    this.solid = Solid.cyl(x, y + 3.2, z, 0.7, 3.2);
  }

  addStone(s: RisingStone) { this.stones.push(s); }
  canInteract() { return !this.active; }

  onPulse(center: THREE.Vector3, radius: number) {
    if (this.active || center.distanceTo(this.position) > radius + 1) return false;
    this.active = true;
    this.glyphMats.forEach((m) => m.color.setRGB(0.37 * 2.4, 0.97 * 2.4, 2.4));
    this.ring.visible = true;
    this.stones.forEach((s, i) => s.rise(0.3 + i * 0.35));
    this.onActivate?.();
    return true;
  }

  update(dt: number) { if (this.ring.visible) this.ring.rotation.z += dt * 2; }
}

/** Ancient stepping stone that rises out of nowhere when its mechanism wakes. */
export class RisingStone extends Platform {
  private delay = -1;
  private k = 0;
  constructor(x: number, top: number, z: number, w: number, d: number) {
    super(x, top, z, w, d, 0.8, { top: 0xd9cbb5, side: 0x8a7a6a });
    this.solid.enabled = false;
    this.mesh.visible = false;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, d * 0.6), new THREE.MeshBasicMaterial({ map: glyphTexture(4), color: new THREE.Color(0x5ff7ff).multiplyScalar(1.8), transparent: true, depthWrite: false }));
    g.rotation.x = -Math.PI / 2;
    g.position.y = 0.02;
    this.mesh.add(g);
  }
  rise(delay: number) { this.delay = delay; }
  update(dt: number) {
    if (this.delay < 0) return;
    if (this.delay > 0) { this.delay = Math.max(0, this.delay - dt); if (this.delay > 0) return; }
    this.mesh.visible = true;
    this.k = Math.min(1, this.k + dt * 1.6);
    const e = 1 - Math.pow(1 - this.k, 3);
    this.mesh.position.y = this.home.y - 6 * (1 - e) + Math.sin(this.k * Math.PI) * 0.3;
    if (this.k >= 1) { this.solid.enabled = true; this.mesh.position.y = this.home.y; this.delay = -1; }
  }
}

// ---------------------------------------------------------------------------
// POWER CORE PEDESTAL — discovery of a new ability

export class AbilityPickup {
  readonly mesh = new THREE.Group();
  readonly solid: Solid;
  readonly position: THREE.Vector3;
  taken = false;
  private core = new THREE.Group();
  private beamMat: THREE.MeshBasicMaterial;
  private ringMat: THREE.MeshBasicMaterial;
  private t = 0;

  constructor(readonly ability: 'dash' | 'pulse', x: number, y: number, z: number) {
    this.position = new THREE.Vector3(x, y, z);
    this.mesh.position.copy(this.position);
    const color = ability === 'dash' ? 0xffa62e : 0x5ff7ff;
    // Ancient pedestal with carved glyphs
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.9, 8), stone);
    base.position.y = 0.45; base.castShadow = base.receiveShadow = true;
    this.mesh.add(base);
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: glyphTexture(i), color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, depthWrite: false }));
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      p.position.set(Math.sin(a) * 1.27, 0.45, Math.cos(a) * 1.27);
      p.rotation.y = a;
      p.rotation.x = -0.15;
      this.mesh.add(p);
    }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 0.25, 8), gold);
    top.position.y = 1.0;
    this.mesh.add(top);
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 32), this.ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.14;
    this.mesh.add(ring);
    // The power core itself
    this.core.position.y = 2.2;
    this.mesh.add(this.core);
    if (ability === 'dash') {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5) });
      for (let i = 0; i < 3; i++) {
        const chev = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 3), m);
        chev.rotation.z = -Math.PI / 2;
        chev.position.x = -0.35 + i * 0.35;
        chev.scale.set(1, 1, 0.35);
        this.core.add(chev);
      }
    } else {
      this.core.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.5) })));
    }
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.6 + i * 0.2, 0.035, 6, 32), this.ringMat);
      r.rotation.set(i ? 1.2 : 0.4, i * 0.8, 0);
      this.core.add(r);
    }
    this.beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 30, 16, 1, true), this.beamMat);
    beam.position.y = 16;
    this.mesh.add(beam);
    this.solid = Solid.cyl(x, y + 1.12, z, 1.1, 1.12);
  }

  /** Close enough to grab? */
  touching(p: THREE.Vector3) {
    return !this.taken && Math.hypot(p.x - this.position.x, p.z - this.position.z) < 1.6 && p.y > this.position.y + 0.6 && p.y < this.position.y + 3.5;
  }

  take() {
    this.taken = true;
    this.core.visible = false;
    this.beamMat.opacity = 0;
    this.ringMat.color.multiplyScalar(0.35);
  }

  get corePosition() { return this.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0)); }

  update(dt: number) {
    this.t += dt;
    this.core.rotation.y += dt * 2;
    this.core.position.y = 2.2 + Math.sin(this.t * 2) * 0.15;
    this.core.children.forEach((c, i) => { if (i >= this.core.children.length - 2) c.rotation.z += dt * (1 + i * 0.5); });
    if (!this.taken) this.beamMat.opacity = 0.18 + Math.sin(this.t * 3) * 0.06;
  }
}

// ---------------------------------------------------------------------------
// AFRO RELIC — a rare story artifact

export class RelicPickup {
  readonly mesh = new THREE.Group();
  readonly position: THREE.Vector3;
  taken = false;
  private tablet: THREE.Group = new THREE.Group();
  private orbit = new THREE.Group();
  private t = Math.random() * 5;
  private beamMat: THREE.MeshBasicMaterial;
  private vanishT = -1;

  constructor(readonly relicId: string, x: number, y: number, z: number, glyph = 0) {
    this.position = new THREE.Vector3(x, y, z);
    this.mesh.position.copy(this.position);
    const bronze = new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.35, metalness: 0.85, emissive: 0x3a1a00, emissiveIntensity: 0.5 });
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.16, 6), bronze);
    hex.rotation.x = Math.PI / 2;
    this.tablet.add(hex);
    for (const s of [1, -1]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshBasicMaterial({ map: glyphTexture(glyph), color: new THREE.Color(0xc77dff).multiplyScalar(2.4), transparent: true, depthWrite: false }));
      g.position.z = s * 0.09;
      if (s < 0) g.rotation.y = Math.PI;
      this.tablet.add(g);
    }
    this.mesh.add(this.tablet);
    const cubeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc77dff).multiplyScalar(2) });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), cubeMat);
      const a = (i / 3) * Math.PI * 2;
      c.position.set(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95);
      this.orbit.add(c);
    }
    this.mesh.add(this.orbit);
    this.beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc77dff).multiplyScalar(1.5), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.7, 14, 12, 1, true), this.beamMat);
    beam.position.y = 7;
    this.mesh.add(beam);
  }

  touching(c: THREE.Vector3) { return !this.taken && this.mesh.position.distanceTo(c) < 1.4; }

  take() { this.taken = true; this.vanishT = 0; }

  update(dt: number) {
    this.t += dt;
    if (this.vanishT >= 0) {
      this.vanishT += dt;
      const k = this.vanishT / 0.6;
      this.mesh.scale.setScalar(Math.max(0.001, 1 - k));
      this.tablet.rotation.y += dt * 30;
      if (k >= 1) { this.mesh.visible = false; this.vanishT = -1; }
      return;
    }
    if (this.taken) return;
    this.tablet.rotation.y += dt * 1.2;
    this.tablet.position.y = Math.sin(this.t * 1.6) * 0.15;
    this.orbit.rotation.y -= dt * 1.8;
    this.orbit.rotation.x = Math.sin(this.t) * 0.4;
    this.beamMat.opacity = 0.15 + Math.sin(this.t * 2.5) * 0.06;
  }
}

// ---------------------------------------------------------------------------
// Story props: terminals, murals, a dormant robot, secret zones

export class Terminal implements Interactable {
  readonly mesh = new THREE.Group();
  readonly solid: Solid;
  readonly position: THREE.Vector3;
  readonly interactRadius = 2.4;
  readonly prompt = 'READ';
  private screen: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private t = 0;
  private acc = 0;

  constructor(x: number, y: number, z: number, rotY: number, public dialogueKey: string) {
    this.position = new THREE.Vector3(x, y, z);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = rotY;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.5), metal);
    post.position.y = 0.6; post.castShadow = true;
    this.mesh.add(post);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.35), metal);
    head.position.set(0, 1.5, 0.05); head.rotation.x = -0.3; head.castShadow = true;
    this.mesh.add(head);
    const c = document.createElement('canvas');
    c.width = 128; c.height = 96;
    this.ctx = c.getContext('2d')!;
    this.screen = new THREE.CanvasTexture(c);
    this.screen.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.72), new THREE.MeshBasicMaterial({ map: this.screen, color: new THREE.Color(1.6, 1.6, 1.6) }));
    s.position.set(0, 1.52, 0.24); s.rotation.x = -0.3;
    this.mesh.add(s);
    this.draw();
    this.solid = Solid.box(x, y + 1.9, z, 0.9, 1.9, 0.9);
  }

  private draw() {
    const g = this.ctx;
    g.fillStyle = '#06131a'; g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#5ff7ff';
    g.font = '700 12px monospace';
    for (let r = 0; r < 6; r++) {
      let line = '';
      for (let i = 0; i < 14; i++) line += String.fromCharCode(0x2580 + Math.floor(Math.random() * 30));
      g.globalAlpha = 0.4 + Math.random() * 0.6;
      g.fillText(r === 2 ? '> SIGNAL A-01' : line, 6, 14 + r * 14);
    }
    g.globalAlpha = 1;
    this.screen.needsUpdate = true;
  }

  canInteract() { return true; }
  update(dt: number) { this.t += dt; this.acc += dt; if (this.acc > 0.25) { this.acc = 0; this.draw(); } }
}

export type MuralStyle = 'river' | 'gates';
export class Mural implements Interactable {
  readonly mesh: THREE.Mesh;
  readonly position: THREE.Vector3;
  readonly interactRadius = 3.2;
  readonly prompt = 'LOOK';
  constructor(x: number, y: number, z: number, rotY: number, w: number, h: number, style: MuralStyle, public dialogueKey: string) {
    this.position = new THREE.Vector3(x, y, z);
    const c = document.createElement('canvas');
    c.width = 512; c.height = Math.round(512 * (h / w));
    paintMural(c.getContext('2d')!, c.width, c.height, style);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
    this.mesh.position.set(x, y + h / 2 + 0.3, z);
    this.mesh.rotation.y = rotY;
  }
  canInteract() { return true; }
}

function paintMural(g: CanvasRenderingContext2D, w: number, h: number, style: MuralStyle) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#2b1a55'); grad.addColorStop(1, '#ff8a5c');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.25;
  for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < 0.5 ? '#000' : '#fff'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.globalAlpha = 1;
  if (style === 'river') {
    g.fillStyle = '#1fb3c8';
    g.beginPath(); g.moveTo(0, h * 0.7);
    for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.7 + Math.sin(x * 0.05) * 8);
    g.lineTo(w, h); g.lineTo(0, h); g.fill();
    for (let i = 0; i < 7; i++) {
      const x = 40 + i * (w - 80) / 6, y = h * 0.62 + Math.sin(i) * 6;
      g.fillStyle = '#fff1dc'; g.beginPath(); g.arc(x, y - 14, 10, 0, Math.PI * 2); g.fill();
      g.fillRect(x - 8, y - 6, 16, 18);
      g.fillStyle = '#ffc93c'; g.shadowColor = '#ffc93c'; g.shadowBlur = 14;
      g.beginPath(); g.arc(x, y - 40, 6, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      if (i === 3) { g.fillStyle = '#6b2fd6'; for (const [dx, dy] of [[0, -24], [-8, -20], [8, -20]]) { g.beginPath(); g.arc(x + dx, y + dy, 7, 0, Math.PI * 2); g.fill(); } }
    }
  } else {
    const cx = w / 2, cy = h * 0.52;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * w * 0.33, y = cy + Math.sin(a) * h * 0.32;
      g.strokeStyle = '#ffc21a'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(x - 16, y + 20); g.lineTo(x - 16, y - 4); g.arc(x, y - 4, 16, Math.PI, 0); g.lineTo(x + 16, y + 20); g.stroke();
      g.fillStyle = '#5ff7ff'; g.beginPath(); g.arc(x, y + 4, 4, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#fff1dc'; g.beginPath(); g.arc(cx, cy - 6, 12, 0, Math.PI * 2); g.fill(); g.fillRect(cx - 9, cy + 4, 18, 22);
    g.strokeStyle = '#ffe9a0'; g.lineWidth = 3; g.shadowColor = '#ffc93c'; g.shadowBlur = 16;
    for (let i = 0; i < 9; i++) { const a = -Math.PI + (i / 8) * Math.PI; g.beginPath(); g.moveTo(cx + Math.cos(a) * 18, cy - 10 + Math.sin(a) * 18); g.lineTo(cx + Math.cos(a) * 30, cy - 10 + Math.sin(a) * 30); g.stroke(); }
    g.shadowBlur = 0;
  }
  g.strokeStyle = '#ffc21a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
}

/** An old, dormant robot — clearly a relative of Afrobot. One eye still flickers. */
export class BrokenRobot implements Interactable {
  readonly mesh = new THREE.Group();
  readonly solid: Solid;
  readonly position: THREE.Vector3;
  readonly interactRadius = 2.6;
  readonly prompt = 'INSPECT';
  dialogueKey = 'broken-robot';
  private eye: THREE.MeshBasicMaterial;
  private t = 0;
  constructor(x: number, y: number, z: number, rotY: number) {
    this.position = new THREE.Vector3(x, y, z);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = rotY;
    const rust = new THREE.MeshStandardMaterial({ color: 0x9a7b5f, roughness: 0.9, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2530, roughness: 0.6 });
    const add = (g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], s: [number, number, number], r: [number, number, number] = [0, 0, 0]) => {
      const o = new THREE.Mesh(g, m); o.position.set(...p); o.scale.set(...s); o.rotation.set(...r); o.castShadow = true; this.mesh.add(o); return o;
    };
    const sph = new THREE.SphereGeometry(1, 16, 12);
    add(sph, rust, [0, 0.45, 0], [0.5, 0.45, 0.45]);                // slumped body
    add(sph, rust, [0.05, 1.05, 0.15], [0.55, 0.45, 0.5], [0.5, 0, 0.25]); // tilted head
    add(sph, dark, [0.05, 1.0, 0.45], [0.42, 0.3, 0.2], [0.5, 0, 0.25]);
    add(sph, rust, [0.55, 0.25, 0.2], [0.12, 0.35, 0.12], [0.3, 0, 1.2]);
    add(sph, rust, [-0.5, 0.2, 0.3], [0.12, 0.35, 0.12], [1.2, 0, -0.4]);
    add(new THREE.BoxGeometry(0.04, 0.5, 0.04), rust, [0.25, 1.55, -0.1], [1, 1, 1], [0.2, 0, -0.9]); // bent antenna
    this.eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ff7ff).multiplyScalar(2) });
    const e = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), this.eye);
    e.position.set(0.18, 1.05, 0.58); e.rotation.set(-0.5, 0.2, 0.25);
    this.mesh.add(e);
    // moss & vines
    const moss = new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 1 });
    for (let i = 0; i < 6; i++) add(sph, moss, [(Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 1.1, (Math.random() - 0.5) * 0.6], [0.12, 0.08, 0.12]);
    this.solid = Solid.cyl(x, y + 1.0, z, 0.6, 1.0);
  }
  canInteract() { return true; }
  update(dt: number) {
    this.t += dt;
    const on = Math.sin(this.t * 13) > 0.2 && Math.sin(this.t * 0.7) > -0.3;
    this.eye.color.setRGB(on ? 0.8 : 0.05, on ? 2 : 0.15, on ? 2.2 : 0.2);
  }
}

export class SecretZone {
  readonly box: THREE.Box3;
  constructor(readonly id: string, readonly name: string, min: THREE.Vector3, max: THREE.Vector3) {
    this.box = new THREE.Box3(min, max);
  }
  contains(p: THREE.Vector3) { return this.box.containsPoint(p); }
}

