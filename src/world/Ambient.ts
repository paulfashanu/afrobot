import * as THREE from 'three';
import { Prims, StaticBatcher } from '../core/Batcher';
import { WATER_Y } from './Environment';

/**
 * Ambient city life — purely decorative, cheap procedural animation:
 * bird flocks, delivery drones, a maglev monorail, boats and floating light motes.
 */
export class Ambient {
  readonly group = new THREE.Group();
  private t = 0;
  private birds: Birds;
  private drones: Drone[] = [];
  private train: THREE.Group;
  private trainZ = 90;
  private trainDir = -1;
  private boats: { mesh: THREE.Object3D; cx: number; cz: number; r: number; speed: number; phase: number }[] = [];
  private motes: Motes;

  constructor() {
    this.birds = new Birds();
    this.group.add(this.birds.group);

    // Drones on looping flight paths over each section
    const droneGeo = buildDroneParts(false);
    const droneGeoPkg = buildDroneParts(true);
    const paths: [number, number, number, number, number, number][] = [
      // cx, cy, cz, ax, az, speed
      [0, 11, -8, 11, 18, 0.35], [-6, 14, -45, 16, 12, 0.3], [2, 12, -100, 13, 16, 0.4],
      [0, 17, -150, 14, 14, 0.32], [0, 19, -200, 16, 15, 0.36], [4, 24, -236, 10, 8, 0.5], [12, 15, -70, 8, 10, 0.45],
    ];
    paths.forEach((p, i) => {
      const d = new Drone(i % 2 ? droneGeoPkg : droneGeo, p, i * 1.7);
      this.drones.push(d);
      this.group.add(d.mesh);
    });

    this.train = this.buildMonorail();

    // Boats drifting in slow loops on the lagoon
    const boatGeo = buildBoat(0xff6b6b, 0xfff1dc);
    const boatGeo2 = buildBoat(0x18a558, 0xffc21a);
    const ferry = buildFerry();
    const boatDefs: [THREE.Object3D, number, number, number, number][] = [
      [boatGeo, -28, -60, 10, 0.08], [boatGeo2, 30, -35, 12, -0.07], [boatGeo.clone(), 34, -140, 9, 0.1],
      [boatGeo2.clone(), -30, -175, 11, -0.09], [ferry, 0, -60, 60, 0.03],
    ];
    boatDefs.forEach(([mesh, cx, cz, r, speed], i) => {
      this.group.add(mesh);
      this.boats.push({ mesh, cx, cz, r, speed, phase: i * 2.1 });
    });

    this.motes = new Motes();
    this.group.add(this.motes.points);
  }

  private buildMonorail() {
    const X = -34, Y = 20;
    const b = new StaticBatcher();
    for (let z = 90; z >= -290; z -= 2) {
      // continuous guideway made of short sections
      b.add(Prims.box, { x: X, y: Y, z }, 0xe8e0d0, { scale: [1.6, 1.0, 2.05] });
      if (Math.round(z) % 8 === 0) b.add(Prims.box, { x: X, y: Y + 0.55, z }, 0x5ff7ff, { scale: [0.3, 0.1, 1.2], glow: true });
    }
    for (let z = 90; z >= -290; z -= 24) {
      b.add(Prims.cylHi, { x: X, y: (Y + WATER_Y) / 2 - 0.5, z }, 0xfff1dc, { scale: [1.6, Y - WATER_Y, 1.6] });
      b.add(Prims.box, { x: X, y: Y - 1.2, z }, 0x6b2fd6, { scale: [3.4, 1.4, 1.8] });
      b.add(Prims.torus, { x: X, y: Y - 3.5, z }, 0xffc21a, { scale: [3, 3, 3], rot: [Math.PI / 2, 0, 0], glow: true, glowBoost: 1.5 });
    }
    this.group.add(b.build('monorail', { castShadow: false }));

    // Train: three sleek cars
    const train = new THREE.Group();
    const tb = new StaticBatcher();
    for (let i = 0; i < 3; i++) {
      const z = i * 9;
      tb.add(Prims.box, { x: 0, y: 1.6, z }, 0xfffaf0, { scale: [2.8, 2.4, 8.4] });
      tb.add(Prims.box, { x: 0, y: 1.9, z }, 0x1a2238, { scale: [2.85, 0.8, 7.6] });
      tb.add(Prims.box, { x: 0, y: 0.7, z }, 0x6b2fd6, { scale: [2.86, 0.35, 8.42] });
      tb.add(Prims.box, { x: 0, y: 2.95, z }, 0xffc21a, { scale: [2.0, 0.2, 7.6] });
      tb.add(Prims.box, { x: 0, y: 1.9, z }, 0x9ff3ff, { scale: [2.9, 0.12, 7.2], glow: true, glowBoost: 1.6 });
    }
    tb.add(Prims.sphere, { x: 0, y: 1.6, z: -4.2 }, 0xfffaf0, { scale: [2.8, 2.4, 3.2] });
    tb.add(Prims.sphere, { x: 0, y: 1.6, z: 22.2 }, 0xfffaf0, { scale: [2.8, 2.4, 3.2] });
    tb.add(Prims.box, { x: 0, y: 1.8, z: -5.7 }, 0xfff2b0, { scale: [1.4, 0.4, 0.1], glow: true, glowBoost: 3 });
    train.add(tb.build('train', { castShadow: false }));
    train.position.set(X, Y + 0.5, this.trainZ);
    this.group.add(train);
    return train;
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera) {
    this.t += dt;
    const t = this.t;
    this.birds.update(dt, t);
    for (const d of this.drones) d.update(dt, t);

    // Monorail: glide along, pause beyond the ends, then come back
    this.trainZ += this.trainDir * 38 * dt;
    if (this.trainZ < -360) this.trainDir = 1;
    if (this.trainZ > 160) this.trainDir = -1;
    this.train.position.z = this.trainZ;
    this.train.rotation.y = this.trainDir > 0 ? Math.PI : 0;
    this.train.visible = this.trainZ > -320 && this.trainZ < 120;

    for (const b of this.boats) {
      const a = t * b.speed + b.phase;
      b.mesh.position.set(b.cx + Math.cos(a) * b.r, WATER_Y + Math.sin(t * 1.8 + b.phase) * 0.08, b.cz + Math.sin(a) * b.r);
      b.mesh.rotation.y = -a + (b.speed > 0 ? 0 : Math.PI);
      b.mesh.rotation.z = Math.sin(t * 1.4 + b.phase) * 0.04;
    }

    this.motes.update(dt, focus, camera);
  }
}

// ---------------------------------------------------------------------------

class Birds {
  readonly group = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private wingsL: THREE.InstancedMesh;
  private wingsR: THREE.InstancedMesh;
  private birds: { flock: number; ox: number; oy: number; oz: number; phase: number; flap: number }[] = [];
  private flocks = [
    { cx: 10, cy: 30, cz: -30, r: 38, speed: 0.12 },
    { cx: -10, cy: 38, cz: -130, r: 45, speed: -0.1 },
    { cx: 5, cy: 44, cz: -230, r: 34, speed: 0.14 },
  ];
  private m = new THREE.Matrix4();
  private mw = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);

  constructor() {
    const n = 30;
    const mat = new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.8 });
    const body = new THREE.SphereGeometry(0.25, 6, 4); body.scale(0.8, 0.7, 2);
    const wing = new THREE.BoxGeometry(1.2, 0.05, 0.45); wing.translate(0.6, 0, 0);
    this.bodies = new THREE.InstancedMesh(body, mat, n);
    this.wingsL = new THREE.InstancedMesh(wing, mat, n);
    const wingR = wing.clone(); wingR.translate(-1.2, 0, 0);
    this.wingsR = new THREE.InstancedMesh(wingR, mat, n);
    for (const im of [this.bodies, this.wingsL, this.wingsR]) { im.frustumCulled = false; this.group.add(im); }
    for (let i = 0; i < n; i++) {
      this.birds.push({ flock: i % 3, ox: (Math.random() - 0.5) * 10, oy: (Math.random() - 0.5) * 4, oz: (Math.random() - 0.5) * 10, phase: Math.random() * 6, flap: 9 + Math.random() * 4 });
    }
  }

  update(_dt: number, t: number) {
    this.birds.forEach((b, i) => {
      const f = this.flocks[b.flock];
      const a = t * f.speed + b.phase * 0.05;
      const x = f.cx + Math.cos(a) * f.r + b.ox + Math.sin(t * 0.7 + b.phase) * 1.5;
      const z = f.cz + Math.sin(a) * f.r + b.oz;
      const y = f.cy + b.oy + Math.sin(t * 0.9 + b.phase) * 1.2;
      // Heading along the circle tangent
      const yaw = Math.atan2(-Math.sin(a) * Math.sign(f.speed), Math.cos(a) * Math.sign(f.speed));
      this.e.set(0, yaw, -0.25 * Math.sign(f.speed));
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(x, y, z), this.q, this.one);
      this.bodies.setMatrixAt(i, this.m);
      // Flap with occasional glides
      const glide = Math.sin(t * 0.5 + b.phase) > 0.6;
      const flap = glide ? 0.15 : Math.sin(t * b.flap + b.phase) * 0.7;
      this.mw.makeRotationZ(flap);
      this.wingsL.setMatrixAt(i, this.mw.premultiply(this.m));
      this.mw.makeRotationZ(-flap);
      this.wingsR.setMatrixAt(i, this.mw.premultiply(this.m));
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wingsL.instanceMatrix.needsUpdate = true;
    this.wingsR.instanceMatrix.needsUpdate = true;
  }
}

function buildDroneParts(pkg: boolean) {
  const b = new StaticBatcher();
  b.add(Prims.sphere, { x: 0, y: 0, z: 0 }, 0xfff1dc, { scale: [0.9, 0.45, 0.9] });
  b.add(Prims.box, { x: 0, y: 0.05, z: 0 }, 0x6b2fd6, { scale: [0.95, 0.12, 0.3] });
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    b.add(Prims.box, { x: dx * 0.45, y: 0.05, z: dz * 0.45 }, 0x3b3550, { scale: [0.7, 0.08, 0.1], rot: [0, Math.atan2(dz, dx) * -1, 0] });
    b.add(Prims.cyl, { x: dx * 0.75, y: 0.15, z: dz * 0.75 }, 0x2b2440, { scale: [0.7, 0.04, 0.7] });
    b.add(Prims.sphereLo, { x: dx * 0.75, y: 0.0, z: dz * 0.75 }, dx > 0 ? 0x5ff7ff : 0xff5fa2, { scale: [0.15, 0.15, 0.15], glow: true, glowBoost: 2.5 });
  }
  b.add(Prims.sphereLo, { x: 0, y: -0.05, z: 0.42 }, 0x9ff3ff, { scale: [0.25, 0.18, 0.12], glow: true, glowBoost: 2 });
  if (pkg) {
    b.add(Prims.box, { x: 0, y: -0.75, z: 0 }, 0xc8894a, { scale: [0.6, 0.5, 0.6] });
    b.add(Prims.box, { x: 0, y: -0.75, z: 0 }, 0xffc21a, { scale: [0.62, 0.12, 0.62] });
    b.add(Prims.cyl, { x: 0, y: -0.35, z: 0 }, 0x333333, { scale: [0.03, 0.5, 0.03] });
  }
  return b.build('drone', { castShadow: true, receiveShadow: false });
}

class Drone {
  readonly mesh: THREE.Object3D;
  private prev = new THREE.Vector3();
  constructor(template: THREE.Object3D, private p: [number, number, number, number, number, number], private phase: number) {
    this.mesh = template.clone();
  }
  update(_dt: number, t: number) {
    const [cx, cy, cz, ax, az, sp] = this.p;
    const T = t * sp + this.phase;
    const x = cx + Math.sin(T) * ax;
    const z = cz + Math.sin(T * 2 + 0.5) * az * 0.5;
    const y = cy + Math.sin(t * 1.3 + this.phase) * 0.6;
    this.prev.copy(this.mesh.position);
    this.mesh.position.set(x, y, z);
    const dx = x - this.prev.x, dz = z - this.prev.z;
    if (Math.abs(dx) + Math.abs(dz) > 1e-4) {
      const yaw = Math.atan2(dx, dz);
      let d = yaw - this.mesh.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.mesh.rotation.y += d * 0.1;
    }
    this.mesh.rotation.x = 0.18; // nose down while cruising
    this.mesh.rotation.z = Math.sin(t * 2 + this.phase) * 0.05;
  }
}

function buildBoat(hull: number, trim: number) {
  const b = new StaticBatcher();
  b.add(Prims.sphereLo, { x: 0, y: 0, z: 0 }, 0x8b5a2b, { scale: [1.3, 0.7, 5.5] });
  b.add(Prims.sphereLo, { x: 0, y: 0.15, z: 0 }, hull, { scale: [1.35, 0.3, 5.55] });
  b.add(Prims.box, { x: 0, y: 0.3, z: 1.2 }, trim, { scale: [1.0, 0.1, 0.4] });
  // a little fisher silhouette with a hat
  b.add(Prims.cyl, { x: 0, y: 0.75, z: -1 }, 0x3b2a5a, { scale: [0.45, 0.9, 0.45] });
  b.add(Prims.sphereLo, { x: 0, y: 1.35, z: -1 }, 0x5b3a1e, { scale: [0.36, 0.36, 0.36] });
  b.add(Prims.cone, { x: 0, y: 1.58, z: -1 }, 0xe8c46a, { scale: [0.9, 0.3, 0.9] });
  b.add(Prims.box, { x: 0.5, y: 0.8, z: -0.6 }, 0x6b4a2b, { scale: [0.06, 0.06, 2.4], rot: [0.5, 0, 0.3] });
  return b.build('boat', { castShadow: false });
}

function buildFerry() {
  const b = new StaticBatcher();
  b.add(Prims.box, { x: 0, y: 0.4, z: 0 }, 0xfffaf0, { scale: [4, 1.2, 12] });
  b.add(Prims.box, { x: 0, y: 1.6, z: -1 }, 0x1b4fd1, { scale: [3.4, 1.4, 7] });
  b.add(Prims.box, { x: 0, y: 1.7, z: -1 }, 0x9ff3ff, { scale: [3.45, 0.4, 6.6], glow: true, glowBoost: 1.4 });
  b.add(Prims.box, { x: 0, y: 2.4, z: -1 }, 0xffc21a, { scale: [3.4, 0.2, 7] });
  b.add(Prims.sphere, { x: 0, y: 0.4, z: 6 }, 0xfffaf0, { scale: [4, 1.2, 3] });
  return b.build('ferry', { castShadow: false });
}

/** Floating golden pollen/light motes around the camera — gives the air some life. */
class Motes {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private seeds: Float32Array;
  private n = 260;
  private R = 26;

  constructor() {
    this.pos = new Float32Array(this.n * 3);
    this.seeds = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.R * 2;
      this.pos[i * 3 + 1] = Math.random() * 14;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.R * 2;
      this.seeds[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('seed', new THREE.BufferAttribute(this.seeds, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float seed; uniform float uTime; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float tw = 0.5 + 0.5 * sin(uTime * 2.0 + seed * 6.0);
          vA = tw * smoothstep(40.0, 6.0, -mv.z) * smoothstep(0.5, 3.0, -mv.z);
          gl_PointSize = (1.5 + tw * 2.5) * (60.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.5) * 1.6, smoothstep(0.5, 0.0, d) * vA * 0.55);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera) {
    const u = (this.points.material as THREE.ShaderMaterial).uniforms.uTime;
    u.value += dt;
    const time = u.value as number;
    const c = camera.position;
    const cx = (c.x + focus.x) / 2, cz = (c.z + focus.z) / 2, cy = focus.y;
    const R = this.R;
    for (let i = 0; i < this.n; i++) {
      const s = this.seeds[i];
      let x = this.pos[i * 3] + Math.sin(time * 0.5 + s) * 0.3 * dt;
      let y = this.pos[i * 3 + 1] + 0.25 * dt;
      let z = this.pos[i * 3 + 2] + 0.4 * dt;
      // wrap around the viewer
      if (x - cx > R) x -= 2 * R; else if (cx - x > R) x += 2 * R;
      if (z - cz > R) z -= 2 * R; else if (cz - z > R) z += 2 * R;
      if (y - cy > 12) y -= 15; else if (cy - y > 3) y += 15;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
