import * as THREE from 'three';
import { StaticBatcher } from '../core/Batcher';
import type { Hazard, Solid } from '../core/Physics';
import { roadTexture } from '../core/Textures';
import { AfroCore } from '../collectibles/AfroCore';
import { Byte } from '../enemies/Byte';
import { AfroGate } from './AfroGate';
import { Checkpoint } from './Checkpoint';
import { ElectricBarrier, Spinner } from './Obstacles';
import { FallingPlatform, MovingPlatform, Platform, RotatingPlatform, STYLES, type Updatable } from './Platform';
import { PowerNode } from './PowerNode';
import {
  PALETTE, acUnit, afroCrown, building, bunting, bush, canoe, crate, danfo, palm, pylon, resetRand,
  sign, stall, streetLight, umbrella, waterTank, type LevelContext,
} from './Props';

/**
 * AFROBOT: LAGOS RUN — level layout.
 * The route runs from +Z toward -Z:
 *   1. Lagos street (tutorial)        z  14 → -44
 *   2. Lagoon hop (+ optional path)   z -44 → -82
 *   3. Market plaza (checkpoint 1)    z -82 → -122
 *   4. Elevated causeway              z -122 → -172
 *   5. Rooftops (checkpoint 2, nodes) z -173 → -238, Afro Gate at the end
 */
export class LagosLevel {
  readonly group = new THREE.Group();
  readonly solids: Solid[] = [];
  readonly blockers: THREE.Object3D[] = [];
  readonly updatables: Updatable[] = [];
  readonly hazards: Hazard[] = [];
  readonly barriers: ElectricBarrier[] = [];
  readonly cores: AfroCore[] = [];
  readonly bytes: Byte[] = [];
  readonly checkpoints: Checkpoint[] = [];
  readonly nodes: PowerNode[] = [];
  readonly gate: AfroGate;
  readonly spawn = new THREE.Vector3(0, 0, 11);
  readonly spawnYaw = Math.PI; // facing -Z
  readonly killY = -1.6;
  static readonly center = new THREE.Vector3(0, 0, -110);

  private ctx: LevelContext;

  constructor() {
    resetRand(7);
    const batch = new StaticBatcher();
    const farBatch = new StaticBatcher();
    this.ctx = { group: this.group, batch, farBatch, solids: this.solids, blockers: this.blockers };

    this.buildStreet();
    this.buildLagoon();
    this.buildMarket();
    this.buildElevated();
    this.buildRooftops();
    this.gate = this.buildGate();
    this.buildBackdrop();

    this.group.add(batch.build('decor', { castShadow: true }));
    this.group.add(farBatch.build('farDecor', { castShadow: false }));
  }

  // ---------- helpers ----------
  private plat(p: Platform | MovingPlatform | FallingPlatform, pylons = true) {
    this.group.add(p.mesh);
    this.solids.push(p.solid);
    this.updatables.push(p);
    if (pylons && !(p instanceof MovingPlatform)) {
      const s = p.solid;
      pylon(this.ctx, (s.min.x + s.max.x) / 2, s.min.y, (s.min.z + s.max.z) / 2, Math.min(s.max.x - s.min.x, s.max.z - s.min.z) * 0.18);
    }
    return p;
  }
  private core(x: number, y: number, z: number) {
    const c = new AfroCore(x, y, z);
    this.cores.push(c);
    this.group.add(c.mesh);
  }
  private byte(x: number, y: number, z: number, r = 3.5, leash = 6.5) {
    const b = new Byte(new THREE.Vector3(x, y, z), r, leash);
    this.bytes.push(b);
    this.group.add(b.mesh);
  }
  private checkpoint(x: number, y: number, z: number) {
    const c = new Checkpoint(x, y, z, Math.PI / 2);
    this.checkpoints.push(c);
    this.group.add(c.mesh);
  }
  private node(x: number, y: number, z: number) {
    const n = new PowerNode(x, y, z);
    this.nodes.push(n);
    this.solids.push(n.solid);
    this.group.add(n.mesh);
  }
  private barrier(b: ElectricBarrier) {
    this.group.add(b.mesh);
    this.solids.push(...b.solids);
    this.updatables.push(b);
    this.hazards.push(b);
    this.barriers.push(b);
  }
  private spinner(s: Spinner) {
    this.group.add(s.mesh);
    this.solids.push(s.solid);
    this.updatables.push(s);
    this.hazards.push(s);
  }
  private hint(key: string, lines: string[], x: number, z: number, y = 0, rotY = 0) {
    sign(this.ctx, key, lines, x, y, z, rotY, 4.6, 1.5, { bg: '#1d1240', fg: '#ffffff', accent: '#ffc21a', postH: 1.1, font: 44 });
  }
  private ground(x0: number, x1: number, z0: number, z1: number, top: number, style = STYLES.street) {
    const p = new Platform((x0 + x1) / 2, top, (z0 + z1) / 2, x1 - x0, z0 - z1, top + 6, style);
    this.group.add(p.mesh);
    this.solids.push(p.solid);
    return p;
  }

  // ---------- 1. Street ----------
  private buildStreet() {
    const c = this.ctx;
    this.ground(-20, 20, 28, -44, 0);
    // Road surface
    const tex = roadTexture().clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, 72 / 12);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(12, 72), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.015, -8);
    road.receiveShadow = true;
    this.group.add(road);

    // Welcome arch
    for (const x of [-7.5, 7.5]) {
      building(c, x, 6, 1.6, 1.6, 7.5, { base: 0, color: PALETTE.violet, variant: 3, solid: true });
    }
    sign(c, 'arch', ['WELCOME TO LAGOS'], 0, 6.2, 6, 0, 13.4, 2.2, { posts: false, bg: '#6b2fd6', accent: '#ffc21a', fg: '#fff', glow: true, font: 70 });
    afroCrown(c, -7.5, 7.5, 6, 3);
    afroCrown(c, 7.5, 7.5, 6, 3);

    // Buildings lining the street (both sides)
    const zs = [25.7, 19, 10, 1, -8, -17, -26, -35, -41];
    zs.forEach((z, i) => {
      const d = i === zs.length - 1 ? 5 : i === 0 ? 4.4 : 8.4;
      building(c, -16.5, z, 7, d, 8 + ((i * 5) % 9), { base: 0, crown: i === 3 });
      building(c, 16.5, z, 7, d, 9 + ((i * 7) % 8), { base: 0, crown: i === 1 });
    });
    // Shop signs on facades
    sign(c, 'jollof', ['JOLLOF EXPRESS'], -12.9, 3.2, -1, Math.PI / 2, 6, 1.3, { posts: false, bg: '#ff6b4a', accent: '#ffc21a', font: 66 });
    sign(c, 'suya', ['MAMA T SUYA SPOT'], 12.9, 3.6, -8, -Math.PI / 2, 6.5, 1.3, { posts: false, bg: '#18a558', accent: '#fff', font: 60 });
    sign(c, 'naijatech', ['EKO TECH HUB'], -12.9, 5, -26, Math.PI / 2, 6, 1.3, { posts: false, bg: '#1b4fd1', accent: '#5ff7ff', font: 66, glow: true });
    sign(c, 'radio', ['AFROBEAT FM 99.3'], 12.9, 4.4, -35, -Math.PI / 2, 6.5, 1.3, { posts: false, bg: '#ff5fa2', accent: '#ffc21a', font: 60 });
    sign(c, 'danfo-stop', ['DANFO STOP'], 7.2, 0, -19, 0, 3.4, 1.0, { bg: '#ffc21a', fg: '#1a1a1a', accent: '#111', postH: 2.2 });

    // Tutorial hints
    this.hint('h-move', ['WASD  MOVE', 'MOUSE  LOOK'], -4.2, 1.5);
    this.hint('h-jump', ['SPACE  JUMP'], -4.8, -12.5);
    this.hint('h-double', ['SPACE x2', 'DOUBLE JUMP'], 4.6, -21.5);
    this.hint('h-dash', ['SHIFT  DASH', 'STOMP or DASH BYTES'], -4.6, -30.5);

    // Market stalls (jump onto canopies!)
    stall(c, -9.6, 0, -12, PALETTE.red, 0xffffff);
    stall(c, -9.6, 0, -18, PALETTE.mint, PALETTE.lemon);
    stall(c, -9.6, 0, -24, PALETTE.violet, 0xffffff);
    danfo(c, 9.6, 0, -27);

    // Street furniture
    for (const z of [18, 9, -2, -32, -40]) { palm(c, -7.6, 0, z, 1.05); palm(c, 7.8, 0, z + 2.5, 0.95); }
    for (const z of [3, -9, -21, -33]) { streetLight(c, -6.8, 0, z, 1); streetLight(c, 6.8, 0, z - 6, -1); }
    bunting(c, new THREE.Vector3(-13, 8, -4), new THREE.Vector3(13, 8, -4));
    bunting(c, new THREE.Vector3(-13, 7.5, -20), new THREE.Vector3(13, 7.5, -20));
    bush(c, 10.5, 0, 2); bush(c, -10.5, 0, -4); bush(c, 10.5, 0, -14, 1.2);
    crate(c, 11.2, 0, -19.5); crate(c, 11.6, 1, -19.6, 0.8); crate(c, -11.5, 0, -30, 1.2);
    // Quay bollards at the lagoon edge
    for (let x = -18; x <= 18; x += 4) if (Math.abs(x) > 3) crate(c, x, 0, -43.3, 0.6, 0x3b3550);

    // Afro Cores — easy ones on the road, then stall top, behind & on the danfo
    this.core(-2.5, 1.1, -3);
    this.core(2.5, 1.1, -8);
    this.core(-9.6, 3.7, -18);       // canopy
    this.core(12.0, 1.1, -27);       // hidden behind the danfo
    this.core(9.6, 4.1, -27);        // on the danfo roof (double jump)

    this.byte(2, 0, -35, 3, 6);
  }

  // ---------- 2. Lagoon hop ----------
  private buildLagoon() {
    const c = this.ctx;
    this.plat(new Platform(0, 0, -48.5, 4, 4, 1, STYLES.teal));
    this.plat(new Platform(2.5, 0.6, -54.5, 4, 4, 1, STYLES.pink));
    this.plat(new Platform(-1, 1.2, -60.5, 3.5, 3.5, 1, STYLES.gold));
    const m1 = new MovingPlatform(new THREE.Vector3(-5, 1.2, -67), new THREE.Vector3(5, 1.2, -67), 4, 4, 5);
    this.plat(m1);
    this.plat(new Platform(0, 1.2, -73.5, 5, 5, 1, STYLES.teal));
    this.plat(new Platform(0, 0.6, -79, 4, 3, 1, STYLES.purple));
    this.core(-1, 2.4, -60.5);
    this.core(0, 2.6, -67);

    // Optional side route (right): higher, trickier, two cores
    this.plat(new Platform(9, 2.0, -56, 3, 3, 1, STYLES.purple));
    this.plat(new Platform(14, 3.4, -61, 3, 3, 1, STYLES.purple));
    this.plat(new FallingPlatform(13, 2.4, -67, 3, 3), false);
    this.plat(new Platform(8, 1.8, -72, 3, 3, 1, STYLES.purple));
    this.core(14, 4.6, -61);
    this.core(13, 3.6, -67);
    sign(c, 'side', ['SECRET ROUTE →'], 6.2, 0.6, -52.6, 0, 2.8, 0.8, { bg: '#ffc21a', fg: '#1d1240', postH: 0.6, font: 60 });

    // Lagoon life
    canoe(c, -10, -58, 0.4, PALETTE.red);
    canoe(c, -14, -72, -0.2, PALETTE.mint);
    canoe(c, 20, -50, 1.2, PALETTE.lemon);
    canoe(c, 22, -78, 0.1, PALETTE.violet);
  }

  // ---------- 3. Market plaza ----------
  private buildMarket() {
    const c = this.ctx;
    this.ground(-18, 18, -82, -122, 0, STYLES.gold);
    this.checkpoint(0, 0, -86.5);
    sign(c, 'eko-market', ['EKO MARKET'], 0, 5.4, -89.5, 0, 10, 1.8, { posts: false, bg: '#ff6b4a', accent: '#ffc21a', glow: true, font: 80 });
    for (const x of [-5.6, 5.6]) building(c, x, -89.5, 1.2, 1.2, 7.4, { base: 0, color: PALETTE.coral, variant: 1 });

    // Stalls & umbrellas
    stall(c, -11.5, 0, -94, PALETTE.lemon, PALETTE.green, Math.PI / 2);
    stall(c, -11.5, 0, -101, PALETTE.pink, 0xffffff, Math.PI / 2);
    stall(c, -11.5, 0, -108, PALETTE.azure, PALETTE.lemon, Math.PI / 2);
    stall(c, 11.5, 0, -100, PALETTE.red, PALETTE.lemon, Math.PI / 2);
    stall(c, 11.5, 0, -108, PALETTE.mint, 0xffffff, Math.PI / 2);
    umbrella(c, -6, 0, -97, PALETTE.red);
    umbrella(c, 8, 0, -103, PALETTE.mint);
    umbrella(c, -7, 0, -110, PALETTE.lemon);
    // Kiosk with a core on the roof
    building(c, 7, -94, 2.6, 2.6, 2.6, { base: 0, color: PALETTE.azure, variant: 2 });
    this.core(7, 3.8, -94);
    // Crates hide a core at the back of the market
    crate(c, -15, 0, -96.5, 1.4); crate(c, -15, 0, -98, 1.4); crate(c, -15, 1.4, -97.2, 1.2);
    this.core(-16.8, 1.1, -97.3);
    for (const [x, z] of [[15, -88], [-15, -88], [15, -118], [-15, -118]]) palm(c, x, 0, z, 1.1);
    for (const [x, z] of [[15.5, -94], [-15.5, -112], [15.5, -114]]) bush(c, x, 0, z);
    bunting(c, new THREE.Vector3(-14, 6, -104), new THREE.Vector3(14, 6, -104));

    // Waterfront buildings framing the plaza
    for (const z of [-86, -95, -104, -113, -120]) {
      building(c, -22.5, z, 7, 8.6, 10 + rand3(z) * 10);
      building(c, 22.5, z, 7, 8.6, 10 + rand3(z + 1) * 10);
    }

    this.byte(-4, 0, -100, 3.5, 6.5);
    this.byte(5, 0, -108, 3.5, 6.5);

    // Electric gate guarding the stairs up
    this.hint('h-zap', ['WAIT FOR THE', 'ZAP FENCE!'], 0, -110.8);
    this.barrier(new ElectricBarrier('x', -18, 18, -115, 0, 4.6, 1.6, 1.5, 0));
  }

  // ---------- 4. Elevated causeway ----------
  private buildElevated() {
    const c = this.ctx;
    // Stairs up
    this.plat(new Platform(0, 1.4, -123.5, 8, 3, 1.4, STYLES.teal));
    this.plat(new Platform(0, 2.8, -126.5, 8, 3, 1.4, STYLES.teal));
    this.plat(new Platform(0, 4.2, -130, 8, 4, 1.4, STYLES.teal));

    // Rotating disc
    const rot = new RotatingPlatform(0, 4.2, -137.5, 3.5, 0.75);
    this.group.add(rot.mesh);
    this.solids.push(rot.solid);
    this.updatables.push(rot);
    pylon(c, 0, 3.5, -137.5, 0.8);
    this.core(2.2, 5.3, -137.5);

    // Falling platforms
    this.plat(new FallingPlatform(-2.5, 4.6, -144, 3, 3), false);
    this.plat(new FallingPlatform(0.5, 5.0, -149.5, 3, 3), false);
    this.plat(new FallingPlatform(3.5, 5.4, -155, 3, 3), false);
    this.core(0.5, 6.3, -149.5);

    // Optional ledge path on the left
    this.plat(new Platform(-8, 5.4, -131, 3, 3, 1, STYLES.purple));
    this.plat(new Platform(-12, 6.8, -137, 3, 3, 1, STYLES.purple));
    this.plat(new Platform(-11, 6.6, -144.5, 3, 4, 1, STYLES.purple));
    this.plat(new Platform(-6, 5.8, -150, 2.5, 2.5, 1, STYLES.purple));
    this.core(-12, 8.0, -137);
    this.core(-11, 7.8, -145.5);

    // Spinner arena
    this.plat(new Platform(2, 5.4, -163, 9, 8, 1.2, STYLES.pink));
    this.spinner(new Spinner(2, 5.4, -163, 4, 1.7));
    this.core(2, 7.9, -163);

    // Elevator up to the rooftops
    this.plat(new MovingPlatform(new THREE.Vector3(2, 5.4, -170), new THREE.Vector3(2, 9.0, -170), 4, 4, 4.5, 0));
  }

  // ---------- 5. Rooftops ----------
  private buildRooftops() {
    const c = this.ctx;
    // Rooftop A
    building(c, 0, -182, 20, 18, 8.6, { color: PALETTE.violet, variant: 2, walkable: true });
    this.checkpoint(0, 8.6, -176.5);
    this.hint('h-nodes', ['POWER 3 NODES [E]', 'TO OPEN THE GATE'], -2.4, -179, 8.6);
    waterTank(c, -6.5, 8.6, -177.5);
    this.core(-6.5, 11.6, -177.5);
    acUnit(c, 7, 8.6, -188); acUnit(c, 8.2, 8.6, -188);
    this.node(-7, 8.6, -188);
    this.byte(3, 8.6, -184, 2.5, 4.5);
    bush(c, 8.5, 8.6, -175); bush(c, -8.5, 8.6, -190);

    // Rooftop B (higher), with spinner and a billboard hiding a core
    building(c, -5, -201, 18, 14, 9.6, { color: PALETTE.coral, variant: 0, walkable: true });
    this.spinner(new Spinner(-5, 9.6, -200, 4, -1.5));
    this.node(-12, 9.6, -206);
    this.core(2, 10.8, -197);
    sign(c, 'billboard', ['LAGOS', 'NEVER SLEEPS'], -5, 9.6, -205.2, 0, 6, 2.4, { bg: '#1b4fd1', accent: '#ffc21a', postH: 1.8, glow: true, font: 80 });
    this.core(-5, 10.7, -207.2);

    // Rooftop C (lower side roof) guarded by a zap fence
    building(c, 12, -202, 8, 10, 7.6, { color: PALETTE.mint, variant: 3, walkable: true });
    this.node(13.5, 7.6, -204);
    this.barrier(new ElectricBarrier('z', -197.5, -206.5, 10.6, 7.6, 4.6, 1.4, 1.6, 0.7));
    waterTank(c, 14, 7.6, -198.8);

    // Rooftop D — the gate plaza
    building(c, 0, -225, 24, 26, 9.6, { color: PALETTE.sun, variant: 1, walkable: true });
    this.barrier(new ElectricBarrier('x', -12, 12, -216.5, 9.6, 4.6, 1.5, 1.5, 0.4));
    this.byte(0, 9.6, -222, 4, 6.5);
    this.core(-6, 12.6, -222);
    for (const x of [-10, 10]) { bush(c, x, 9.6, -214, 1.2); palm(c, x, 9.6, -236, 1.0); }

    // Tall city around the rooftops
    const tall: [number, number, number, number, number][] = [
      [-21, -178, 9, 10, 26], [21, -180, 9, 12, 30], [-24, -196, 10, 9, 38], [22, -197, 8, 9, 20],
      [-21, -214, 9, 10, 30], [21, -216, 9, 10, 24], [-22, -232, 10, 12, 42], [22, -233, 10, 12, 34],
      [-10, -250, 12, 10, 28], [10, -252, 12, 10, 46], [0, -264, 14, 10, 36],
      [-24, -160, 8, 10, 18], [24, -158, 8, 10, 22], [-20, -140, 8, 9, 14], [20, -138, 8, 9, 16],
    ];
    tall.forEach(([x, z, w, d, h], i) => building(c, x, z, w, d, h, { crown: i % 3 === 0 }));
  }

  private buildGate() {
    const g = new AfroGate(0, 9.6, -231.5, this.nodes.length);
    this.group.add(g.mesh);
    this.solids.push(...g.solids);
    sign(this.ctx, 'gate', ['THE AFRO GATE'], 0, 21, -232.2, 0, 9, 1.6, { posts: false, bg: '#2b2440', fg: '#ffc21a', accent: '#5ff7ff', glow: true, font: 80 });
    return g;
  }

  /** Islands and buildings around the playable route for a full city feel. */
  private buildBackdrop() {
    const c = this.ctx;
    const isles: [number, number, number, number][] = [[-48, -20, 22, 34], [46, -40, 20, 40], [-46, -110, 22, 50], [48, -120, 24, 46], [-50, -200, 24, 60], [50, -210, 22, 56]];
    for (const [x, z, w, d] of isles) {
      const p = new Platform(x, 0.4, z, w, d, 6, STYLES.green);
      this.group.add(p.mesh);
      for (let i = 0; i < 5; i++) {
        building(c, x + (rand3(i + x) - 0.5) * (w - 8), z + (i - 2) * (d / 5), 6 + rand3(z + i) * 4, 6 + rand3(x - i) * 3, 8 + rand3(x * z + i) * 22, { base: 0.4, crown: i === 2 });
      }
      for (let i = 0; i < 4; i++) palm(c, x + (i % 2 ? w / 2 - 2 : -w / 2 + 2), 0.4, z + (i - 1.5) * (d / 4), 1.2);
    }
  }

  update(dt: number, t: number) {
    for (const u of this.updatables) u.update(dt, t);
  }

  /** Visual-only updates (once per frame). */
  updateVisuals(dt: number) {
    for (const c of this.cores) c.update(dt);
    for (const cp of this.checkpoints) cp.update(dt);
    for (const n of this.nodes) n.update(dt);
    this.gate.update(dt);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

/** Small stable hash → [0,1) for decorative variety. */
function rand3(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
