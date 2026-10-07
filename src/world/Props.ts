import * as THREE from 'three';
import { Prims, StaticBatcher } from '../core/Batcher';
import { Solid } from '../core/Physics';
import { facadeTexture, pavingTexture, regroupBox, textTexture, worldBox } from '../core/Textures';

/** Shared state that prop builders write into while the level is assembled. */
export interface LevelContext {
  group: THREE.Group;
  batch: StaticBatcher;      // near decoration (casts shadows)
  farBatch: StaticBatcher;   // distant decoration (no shadows)
  solids: Solid[];
  blockers: THREE.Object3D[]; // camera collision
}

export const PALETTE = {
  coral: 0xff8a5c, sun: 0xffd166, mint: 0x06d6a0, sky: 0x4cc9f0, pink: 0xf15bb5,
  violet: 0x9b5de5, red: 0xff6b6b, lemon: 0xfee440, azure: 0x00bbf9, sand: 0xf4a261,
  terracotta: 0xd8743f, cream: 0xfff1dc, green: 0x18a558,
};
const BUILDING_COLORS = [PALETTE.coral, PALETTE.sun, PALETTE.mint, PALETTE.sky, PALETTE.pink, PALETTE.violet, PALETTE.sand, PALETTE.azure, PALETTE.lemon, PALETTE.red];

const facadeMats = new Map<string, THREE.MeshStandardMaterial>();
function facadeMat(color: number, variant: number) {
  const key = color + ':' + variant;
  let m = facadeMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, map: facadeTexture(variant), roughness: 0.8 });
    facadeMats.set(key, m);
  }
  return m;
}
const roofMats = new Map<number, THREE.MeshStandardMaterial>();
function roofMat(color: number) {
  let m = roofMats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, map: pavingTexture(), roughness: 0.85 });
    roofMats.set(color, m);
  }
  return m;
}

let seed = 7;
/** Deterministic pseudo-random so the level looks the same every run. */
export function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
export function resetRand(s = 7) { seed = s; }
export function pick<T>(arr: T[]): T { return arr[Math.floor(rand() * arr.length)]; }

/**
 * A colourful Lagos building with a patterned facade.
 * `walkable` gives the roof a paved surface so it reads as a play space.
 */
export function building(
  ctx: LevelContext,
  x: number, z: number, w: number, d: number, top: number,
  opts: { base?: number; color?: number; variant?: number; walkable?: boolean; crown?: boolean; solid?: boolean } = {},
) {
  const base = opts.base ?? -6;
  const h = top - base;
  const color = opts.color ?? pick(BUILDING_COLORS);
  const variant = opts.variant ?? Math.floor(rand() * 4);
  const side = facadeMat(color, variant);
  const roof = roofMat(opts.walkable ? 0xfff1dc : 0xd9d2c5);
  const mesh = new THREE.Mesh(regroupBox(worldBox(w, h, d, 4, 3), [0, 0, 1, 1, 0, 0]), [side, roof]);
  // Align facade floors to world height so windows sit consistently.
  mesh.position.set(x, base + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  ctx.group.add(mesh);
  // Only sizeable buildings block the camera; kiosks & pillars shouldn't shove it into Afrobot's afro
  if (h > 6 && w * d > 12) ctx.blockers.push(mesh);
  if (opts.solid !== false) ctx.solids.push(Solid.box(x, top, z, w, h, d));

  // Roof trim band
  ctx.batch.add(Prims.box, { x, y: top + 0.08, z }, opts.walkable ? 0xf5b52a : 0xe8e0d0, { scale: [w + 0.3, 0.16, d + 0.3] });
  if (!opts.walkable && w >= 5 && d >= 5) {
    // Rooftop clutter: water tanks, AC boxes, little sheds
    if (rand() < 0.7) {
      const tx = x + (rand() - 0.5) * (w - 2), tz = z + (rand() - 0.5) * (d - 2);
      ctx.batch.add(Prims.cyl, { x: tx, y: top + 0.9, z: tz }, 0x1c1c24, { scale: [1.4, 1.4, 1.4] });
      ctx.batch.add(Prims.box, { x: tx, y: top + 0.15, z: tz }, 0x6b6b6b, { scale: [1.5, 0.3, 1.5] });
    }
    if (rand() < 0.6) ctx.batch.add(Prims.box, { x: x + (rand() - 0.5) * (w - 2), y: top + 0.5, z: z + (rand() - 0.5) * (d - 2) }, 0xd0d0d0, { scale: [1.4, 1, 1] });
  }
  if (opts.crown) afroCrown(ctx, x, top, z, Math.min(w, d));
  return mesh;
}

/** Afrofuturist rooftop crown: gold spire with rings. */
export function afroCrown(ctx: LevelContext, x: number, top: number, z: number, size: number) {
  const s = size * 0.25;
  ctx.batch.add(Prims.cylHi, { x, y: top + s * 0.5, z }, 0x2b2440, { scale: [s * 1.6, s, s * 1.6] });
  ctx.batch.add(Prims.cone, { x, y: top + s * 2.2, z }, 0xf5b52a, { scale: [s * 1.2, s * 2.6, s * 1.2] });
  ctx.batch.add(Prims.torus, { x, y: top + s * 1.6, z }, 0x5ff7ff, { scale: [s * 2.4, s * 2.4, s * 2.4], rot: [Math.PI / 2, 0, 0], glow: true });
  ctx.batch.add(Prims.sphere, { x, y: top + s * 3.6, z }, 0xff5fa2, { scale: [s * 0.5, s * 0.5, s * 0.5], glow: true });
}

export function palm(ctx: LevelContext, x: number, y: number, z: number, scale = 1) {
  const b = ctx.batch;
  const lean = (rand() - 0.5) * 0.5;
  const leanDir = rand() * Math.PI * 2;
  let px = x, py = y, pz = z;
  const segs = 7;
  const segH = 0.8 * scale;
  for (let i = 0; i < segs; i++) {
    const k = i / segs;
    const off = lean * k * k * 3 * scale;
    px = x + Math.cos(leanDir) * off;
    pz = z + Math.sin(leanDir) * off;
    py = y + segH * (i + 0.5);
    const r = (0.28 - k * 0.08) * scale;
    b.add(Prims.cyl, { x: px, y: py, z: pz }, i % 2 ? 0x8b5a2b : 0xa36f3a, { scale: [r * 2, segH * 1.05, r * 2], sway: k * k * 0.7 * scale });
  }
  const topY = py + segH * 0.5;
  const fronds = 8;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rand() * 0.3;
    const droop = 0.35 + rand() * 0.35;
    const len = (2.4 + rand() * 0.6) * scale;
    const cx = px + Math.sin(a) * len * 0.45 * Math.cos(droop);
    const cz = pz + Math.cos(a) * len * 0.45 * Math.cos(droop);
    const cy = topY - Math.sin(droop) * len * 0.45 + 0.1;
    b.add(Prims.sphereLo, { x: cx, y: cy, z: cz }, i % 2 ? 0x2fae4f : 0x1f8f3e, {
      scale: [0.75 * scale, 0.1 * scale, len], rot: [droop, a, 0], order: 'YXZ', sway: 1.1 * scale,
    });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.add(Prims.sphereLo, { x: px + Math.sin(a) * 0.22 * scale, y: topY - 0.2 * scale, z: pz + Math.cos(a) * 0.22 * scale }, 0x5b3a1e, { scale: [0.3 * scale, 0.3 * scale, 0.3 * scale], sway: 0.75 * scale });
  }
}

export function streetLight(ctx: LevelContext, x: number, y: number, z: number, facing: 1 | -1) {
  const b = ctx.batch;
  b.add(Prims.cyl, { x, y: y + 3, z }, 0x2b2440, { scale: [0.18, 6, 0.18] });
  b.add(Prims.cyl, { x, y: y + 0.3, z }, 0x3b3550, { scale: [0.4, 0.6, 0.4] });
  b.add(Prims.box, { x: x + facing * 0.8, y: y + 6, z }, 0x2b2440, { scale: [1.8, 0.14, 0.14] });
  b.add(Prims.box, { x: x + facing * 1.5, y: y + 5.85, z }, 0x2b2440, { scale: [0.7, 0.2, 0.45] });
  b.add(Prims.box, { x: x + facing * 1.5, y: y + 5.72, z }, 0xfff2b0, { scale: [0.55, 0.08, 0.32], glow: true, glowBoost: 2.6 });
  b.add(Prims.torus, { x, y: y + 4.8, z }, 0x06d6a0, { scale: [0.5, 0.5, 0.5], rot: [Math.PI / 2, 0, 0], glow: true });
  ctx.solids.push(Solid.cyl(x, y + 6, z, 0.2, 6));
}

/** Market stall with a striped canopy you can bounce up onto. */
export function stall(ctx: LevelContext, x: number, y: number, z: number, colA: number, colB: number, rotY = 0) {
  const b = ctx.batch;
  const w = 3.2, d = 2.4, ch = 2.6;
  const along = rotY === 0;
  const sx = along ? w : d, sz = along ? d : w;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    b.add(Prims.cyl, { x: x + dx * (sx / 2 - 0.1), y: y + ch / 2, z: z + dz * (sz / 2 - 0.1) }, 0x6b4a2b, { scale: [0.12, ch, 0.12] });
  }
  // table + goods
  b.add(Prims.box, { x, y: y + 0.45, z }, 0x8b5a2b, { scale: [sx - 0.3, 0.9, sz - 0.6] });
  const goods = [0xff7a00, 0xd7261e, 0x18a558, 0xffc21a, 0x8a2be2];
  for (let i = 0; i < 8; i++) {
    const gx = x + (rand() - 0.5) * (sx - 0.8), gz = z + (rand() - 0.5) * (sz - 1);
    b.add(Prims.sphereLo, { x: gx, y: y + 1.0, z: gz }, pick(goods), { scale: [0.25, 0.22, 0.25] });
  }
  b.add(Prims.cyl, { x: x + (along ? 0.9 : 0), y: y + 1.05, z: z + (along ? 0 : 0.9) }, 0xc8a165, { scale: [0.6, 0.3, 0.6] });
  // striped canopy (alternating slats)
  const slats = 6;
  for (let i = 0; i < slats; i++) {
    const t = (i + 0.5) / slats - 0.5;
    b.add(Prims.box,
      { x: x + (along ? t * sx : 0), y: y + ch + 0.1, z: z + (along ? 0 : t * sz) },
      i % 2 ? colA : colB,
      { scale: [along ? sx / slats + 0.01 : sx + 0.4, 0.2, along ? sz + 0.4 : sz / slats + 0.01] });
  }
  ctx.solids.push(Solid.box(x, y + 0.9, z, sx - 0.3, 0.9, sz - 0.6));
  ctx.solids.push(Solid.box(x, y + ch + 0.2, z, sx + 0.3, 0.3, sz + 0.3));
}

export function umbrella(ctx: LevelContext, x: number, y: number, z: number, color: number) {
  const b = ctx.batch;
  b.add(Prims.cyl, { x, y: y + 1.2, z }, 0xdddddd, { scale: [0.08, 2.4, 0.08] });
  b.add(Prims.cone, { x, y: y + 2.55, z }, color, { scale: [3, 0.7, 3] });
  b.add(Prims.cone, { x, y: y + 2.58, z }, 0xffffff, { scale: [1.2, 0.72, 1.2] });
  ctx.solids.push(Solid.cyl(x, y + 2.4, z, 0.1, 2.4));
}

/** The iconic yellow Lagos danfo minibus. */
export function danfo(ctx: LevelContext, x: number, y: number, z: number) {
  const b = ctx.batch;
  const W = 2.6, H = 2.4, L = 7;
  const by = y + 0.5;
  b.add(Prims.box, { x, y: by + H / 2, z }, 0xffc21a, { scale: [W, H, L] });
  b.add(Prims.box, { x, y: by + H * 0.68, z }, 0x1a2238, { scale: [W + 0.04, 0.8, L - 1.2] }); // windows
  b.add(Prims.box, { x, y: by + H * 0.68, z: z + L / 2 - 0.2 }, 0x1a2238, { scale: [W - 0.3, 0.9, 0.5] }); // windscreen
  for (const yy of [by + 0.55, by + 0.8]) b.add(Prims.box, { x, y: yy, z }, 0x111111, { scale: [W + 0.05, 0.1, L + 0.02] }); // black stripes
  b.add(Prims.box, { x, y: by + H + 0.15, z }, 0x3b3550, { scale: [W - 0.4, 0.12, L - 1.5] }); // roof rack
  for (const dz of [-2.4, 2.4]) for (const dx of [-1, 1]) {
    b.add(Prims.cyl, { x: x + dx * (W / 2 - 0.05), y: y + 0.5, z: z + dz }, 0x1a1a1a, { scale: [1, 0.35, 1], rot: [0, 0, Math.PI / 2] });
    b.add(Prims.cyl, { x: x + dx * (W / 2), y: y + 0.5, z: z + dz }, 0xaaaaaa, { scale: [0.5, 0.37, 0.5], rot: [0, 0, Math.PI / 2] });
  }
  for (const dx of [-0.8, 0.8]) b.add(Prims.box, { x: x + dx, y: by + 0.5, z: z + L / 2 + 0.01 }, 0xfff6c0, { scale: [0.45, 0.3, 0.05], glow: true });
  ctx.solids.push(Solid.box(x, by + H, z, W, H + 0.5, L));
}

export function crate(ctx: LevelContext, x: number, y: number, z: number, s = 1, color = 0xc8894a) {
  ctx.batch.add(Prims.box, { x, y: y + s / 2, z }, color, { scale: [s, s, s] });
  ctx.batch.add(Prims.box, { x, y: y + s / 2, z }, 0x8b5a2b, { scale: [s * 1.02, s * 0.15, s * 1.02] });
  ctx.solids.push(Solid.box(x, y + s, z, s, s, s));
}

export function waterTank(ctx: LevelContext, x: number, y: number, z: number) {
  const b = ctx.batch;
  for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) b.add(Prims.cyl, { x: x + dx, y: y + 0.5, z: z + dz }, 0x6b6b6b, { scale: [0.12, 1, 0.12] });
  b.add(Prims.box, { x, y: y + 1.05, z }, 0x555555, { scale: [1.8, 0.1, 1.8] });
  b.add(Prims.cylHi, { x, y: y + 1.55, z }, 0x1c1c24, { scale: [2, 0.95, 2] });
  b.add(Prims.cylHi, { x, y: y + 2.05, z }, 0x2a2a35, { scale: [1.5, 0.08, 1.5] });
  ctx.solids.push(Solid.cyl(x, y + 2.05, z, 1, 2.05));
}

export function acUnit(ctx: LevelContext, x: number, y: number, z: number) {
  ctx.batch.add(Prims.box, { x, y: y + 0.45, z }, 0xe6e6e6, { scale: [1.2, 0.9, 0.8] });
  ctx.batch.add(Prims.cyl, { x, y: y + 0.45, z: z + 0.41 }, 0x555555, { scale: [0.6, 0.02, 0.6], rot: [Math.PI / 2, 0, 0] });
  ctx.solids.push(Solid.box(x, y + 0.9, z, 1.2, 0.9, 0.8));
}

export function bush(ctx: LevelContext, x: number, y: number, z: number, s = 1) {
  ctx.batch.add(Prims.cyl, { x, y: y + 0.3 * s, z }, 0xd8743f, { scale: [0.9 * s, 0.6 * s, 0.9 * s] });
  ctx.batch.add(Prims.sphereLo, { x, y: y + 0.85 * s, z }, 0x2fae4f, { scale: [1.1 * s, 0.9 * s, 1.1 * s], sway: 0.18 });
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    ctx.batch.add(Prims.sphereLo, { x: x + Math.cos(a) * 0.4 * s, y: y + (0.9 + rand() * 0.3) * s, z: z + Math.sin(a) * 0.4 * s }, pick([0xff5fa2, 0xffd166, 0xff6b6b]), { scale: [0.18 * s, 0.18 * s, 0.18 * s], sway: 0.2 });
  }
  ctx.solids.push(Solid.cyl(x, y + 0.6 * s, z, 0.45 * s, 0.6 * s));
}

/** Triangle flag bunting strung between two points. */
export function bunting(ctx: LevelContext, a: THREE.Vector3, b2: THREE.Vector3, sag = 1.2) {
  const n = Math.floor(a.distanceTo(b2) / 0.9);
  const cols = [0x18a558, 0xffffff, 0xffc21a, 0xff5fa2, 0x4cc9f0];
  const dir = new THREE.Vector3().subVectors(b2, a);
  const yaw = Math.atan2(dir.x, dir.z);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b2, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    ctx.batch.add(Prims.box, p, 0x333333, { scale: [0.03, 0.03, 0.95], rot: [0, yaw, 0] });
    if (i < n) ctx.batch.add(Prims.cone, { x: p.x, y: p.y - 0.3, z: p.z }, cols[i % cols.length], { scale: [0.55, 0.55, 0.06], rot: [Math.PI, yaw + Math.PI / 2, 0], order: 'YXZ', sway: 0.5 });
  }
}

/** Signboard on two posts (or flat against a wall when `posts` is false). */
export function sign(
  ctx: LevelContext,
  key: string, lines: string[],
  x: number, y: number, z: number, rotY: number,
  w: number, h: number,
  opts: { bg?: string; fg?: string; accent?: string; posts?: boolean; postH?: number; font?: number; glow?: boolean } = {},
) {
  const tex = textTexture(key, lines, { bg: opts.bg, fg: opts.fg, accent: opts.accent, w: 512, h: Math.round(512 * (h / w)), font: opts.font });
  const mat = opts.glow
    ? new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.25, 1.25, 1.25) })
    : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const postH = opts.posts === false ? 0 : (opts.postH ?? 1.6);
  board.position.set(x, y + postH + h / 2, z);
  board.rotation.y = rotY;
  ctx.group.add(board);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x2b2440, roughness: 0.5 }));
  back.position.copy(board.position);
  back.rotation.y = rotY;
  back.translateZ(-0.08);
  back.castShadow = true;
  ctx.group.add(back);
  if (opts.posts !== false) {
    const right = new THREE.Vector3(Math.cos(rotY), 0, -Math.sin(rotY));
    for (const s of [-1, 1]) {
      const px = x + right.x * s * (w / 2 - 0.3), pz = z + right.z * s * (w / 2 - 0.3);
      ctx.batch.add(Prims.cyl, { x: px, y: y + (postH + h / 2) / 2, z: pz }, 0x3b3550, { scale: [0.14, postH + h / 2, 0.14] });
      ctx.solids.push(Solid.cyl(px, y + postH + h, pz, 0.12, postH + h));
    }
  }
  return board;
}

/** Concrete pylon under a lagoon platform. */
export function pylon(ctx: LevelContext, x: number, top: number, z: number, r = 0.6) {
  const h = top + 4;
  ctx.batch.add(Prims.cyl, { x, y: top - h / 2, z }, 0xcfc6b8, { scale: [r * 2, h, r * 2] });
  ctx.batch.add(Prims.cyl, { x, y: -1.0, z }, 0x2b8a8a, { scale: [r * 2.3, 0.4, r * 2.3] });
}

export function canoe(ctx: LevelContext, x: number, z: number, rotY: number, color: number) {
  ctx.batch.add(Prims.sphereLo, { x, y: -1.15, z }, 0x8b5a2b, { scale: [1.2, 0.6, 5], rot: [0, rotY, 0] });
  ctx.batch.add(Prims.sphereLo, { x, y: -1.0, z }, color, { scale: [1.25, 0.25, 5.05], rot: [0, rotY, 0] });
}

// ---------------------------------------------------------------------------
// V0.2 props: animated decor & city life

/** Something in the level that animates every frame (decor only). */
export type DecorUpdate = (dt: number, t: number, player: THREE.Vector3) => void;

const SKIN = [0x5b3a1e, 0x7a4a2a, 0x8d5a34, 0x4a2c17, 0x6b4226];
const ANKARA = [0xff6b4a, 0xffc21a, 0x18a558, 0x6b2fd6, 0xff5fa2, 0x1b4fd1, 0x06d6a0, 0xd7261e];

/**
 * A faceless, stylised Lagos citizen silhouette. Turns to watch Afrobot, and gives a
 * little cheer-hop when Afrobot runs past. `walk` makes them stroll back and forth.
 */
export function npc(
  ctx: LevelContext, x: number, y: number, z: number, yaw: number,
  opts: { walk?: [number, number]; seed?: number } = {},
): DecorUpdate {
  const seed = opts.seed ?? Math.floor(rand() * 1000);
  const r = (k: number) => { const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  const b = new StaticBatcher();
  const skin = SKIN[Math.floor(r(1) * SKIN.length)];
  const cloth = ANKARA[Math.floor(r(2) * ANKARA.length)];
  const cloth2 = ANKARA[Math.floor(r(3) * ANKARA.length)];
  const tall = 0.9 + r(4) * 0.25;
  const robe = r(5) < 0.55;
  if (robe) {
    // flowing robe / boubou
    b.add(Prims.cone, { x: 0, y: 0.75 * tall, z: 0 }, cloth, { scale: [1.0, 1.5 * tall, 0.8] });
    b.add(Prims.box, { x: 0, y: 0.9 * tall, z: 0.01 }, cloth2, { scale: [0.75, 0.1, 0.62] });
  } else {
    b.add(Prims.cyl, { x: -0.12, y: 0.35 * tall, z: 0 }, 0x2b2440, { scale: [0.18, 0.7 * tall, 0.18] });
    b.add(Prims.cyl, { x: 0.12, y: 0.35 * tall, z: 0 }, 0x2b2440, { scale: [0.18, 0.7 * tall, 0.18] });
    b.add(Prims.sphere, { x: 0, y: 0.98 * tall, z: 0 }, cloth, { scale: [0.62, 0.75 * tall, 0.45] });
  }
  b.add(Prims.sphere, { x: 0.36, y: 1.0 * tall, z: 0 }, cloth, { scale: [0.2, 0.55, 0.2], rot: [0, 0, 0.2] });
  b.add(Prims.sphere, { x: -0.36, y: 1.0 * tall, z: 0 }, cloth, { scale: [0.2, 0.55, 0.2], rot: [0, 0, -0.2] });
  b.add(Prims.cyl, { x: 0, y: 1.4 * tall, z: 0 }, skin, { scale: [0.15, 0.15, 0.15] });
  b.add(Prims.sphere, { x: 0, y: 1.62 * tall, z: 0 }, skin, { scale: [0.36, 0.42, 0.38] });
  const hat = r(6);
  if (hat < 0.35) {
    // gele headwrap
    b.add(Prims.sphereLo, { x: 0, y: 1.82 * tall, z: -0.02 }, cloth2, { scale: [0.52, 0.32, 0.46] });
    b.add(Prims.cone, { x: 0.12, y: 1.98 * tall, z: -0.05 }, cloth2, { scale: [0.38, 0.32, 0.32], rot: [0, 0, -0.8] });
    b.add(Prims.cone, { x: -0.12, y: 1.98 * tall, z: -0.05 }, cloth2, { scale: [0.38, 0.32, 0.32], rot: [0, 0, 0.8] });
  } else if (hat < 0.6) {
    // kufi cap
    b.add(Prims.cyl, { x: 0, y: 1.8 * tall, z: 0 }, cloth2, { scale: [0.38, 0.16, 0.38] });
  } else if (hat < 0.8) {
    // head basket with fruit
    b.add(Prims.cyl, { x: 0, y: 1.9 * tall, z: 0 }, 0xc8a165, { scale: [0.7, 0.2, 0.7] });
    for (let i = 0; i < 4; i++) b.add(Prims.sphereLo, { x: Math.cos(i * 1.6) * 0.15, y: 2.03 * tall, z: Math.sin(i * 1.6) * 0.15 }, [0xff7a00, 0xd7261e, 0xffc21a, 0x18a558][i], { scale: [0.17, 0.17, 0.17] });
  } else {
    b.add(Prims.sphereLo, { x: 0, y: 1.72 * tall, z: -0.03 }, 0x1a1210, { scale: [0.4, 0.3, 0.4] });
  }
  const g = b.build('npc', { castShadow: true });
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  ctx.group.add(g);
  if (!opts.walk) ctx.solids.push(Solid.cyl(x, y + 1.6, z, 0.4, 1.6));

  const home = new THREE.Vector3(x, y, z);
  let hop = 0, hopV = 0, cheerCd = 0;
  const phase = r(7) * 10;
  return (dt, t, p) => {
    let px = home.x, pz = home.z;
    if (opts.walk) {
      const [dx, dz] = opts.walk;
      const k = Math.sin(t * 0.35 + phase);
      px = home.x + dx * k; pz = home.z + dz * k;
      const dir = Math.cos(t * 0.35 + phase) >= 0 ? 1 : -1;
      g.rotation.y = Math.atan2(dx * dir, dz * dir);
      g.position.y = home.y + Math.abs(Math.sin(t * 6 + phase)) * 0.06;
    }
    const ddx = p.x - px, ddz = p.z - pz;
    const d = Math.hypot(ddx, ddz);
    if (!opts.walk) {
      // turn to watch Afrobot when close, otherwise sway / chat
      const want = d < 9 && Math.abs(p.y - home.y) < 4 ? Math.atan2(ddx, ddz) : yaw + Math.sin(t * 0.4 + phase) * 0.4;
      let dy = want - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.rotation.y += dy * Math.min(1, dt * 4);
      g.rotation.z = Math.sin(t * 1.6 + phase) * 0.03;
      cheerCd -= dt;
      if (d < 3.2 && cheerCd <= 0 && hop === 0) { hopV = 4.5; cheerCd = 3; }
      hopV -= 18 * dt; hop = Math.max(0, hop + hopV * dt);
      if (hop === 0) hopV = 0;
      g.position.y = home.y + hop + Math.sin(t * 2 + phase) * 0.015;
    }
    g.position.x = px; g.position.z = pz;
  };
}

/** Scrolling LED ticker sign. */
export function ticker(ctx: LevelContext, text: string, x: number, y: number, z: number, rotY: number, w: number, h: number, color = '#ffc21a'): DecorUpdate {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#120a2a'; g.fillRect(0, 0, c.width, c.height);
  g.font = '700 84px Fredoka, sans-serif';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  const unit = text + '   ✦   ';
  let px = 0;
  while (px < c.width) { g.fillText(unit, px, 68); px += g.measureText(unit).width; }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(w / (h * 16), 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5) }));
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  ctx.group.add(mesh);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.2), new THREE.MeshStandardMaterial({ color: 0x2b2440, roughness: 0.4, metalness: 0.5 }));
  back.position.copy(mesh.position); back.rotation.y = rotY; back.translateZ(-0.12);
  ctx.group.add(back);
  return (dt) => { tex.offset.x += dt * 0.06; };
}

/** Two-sided billboard spinning on a rooftop pole. */
export function spinningSign(ctx: LevelContext, key: string, lines: string[], x: number, y: number, z: number, opts: { bg?: string; accent?: string } = {}): DecorUpdate {
  ctx.batch.add(Prims.cyl, { x, y: y + 2, z }, 0x3b3550, { scale: [0.3, 4, 0.3] });
  const group = new THREE.Group();
  group.position.set(x, y + 5.2, z);
  const tex = textTexture(key, lines, { bg: opts.bg ?? '#ff5fa2', accent: opts.accent ?? '#ffc21a', w: 512, h: 256, font: 70 });
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.3, 1.3, 1.3) });
  for (const ry of [0, Math.PI]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), mat);
    p.rotation.y = ry;
    p.position.z = ry ? -0.08 : 0.08;
    group.add(p);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5.3, 2.8, 0.12), new THREE.MeshStandardMaterial({ color: 0x2b2440, metalness: 0.5, roughness: 0.4 }));
  frame.castShadow = true;
  group.add(frame);
  ctx.group.add(group);
  return (dt) => { group.rotation.y += dt * 0.6; };
}

/** Holographic projector: light cone + spinning wireframe gem + floating ring. */
export function hologram(ctx: LevelContext, x: number, y: number, z: number): DecorUpdate {
  ctx.batch.add(Prims.cylHi, { x, y: y + 0.4, z }, 0x2b2440, { scale: [1.8, 0.8, 1.8] });
  ctx.batch.add(Prims.torus, { x, y: y + 0.82, z }, 0x5ff7ff, { scale: [1.6, 1.6, 1.6], rot: [Math.PI / 2, 0, 0], glow: true });
  ctx.solids.push(Solid.cyl(x, y + 0.8, z, 0.9, 0.8));
  const g = new THREE.Group();
  g.position.set(x, y + 0.8, z);
  const coneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ff7ff).multiplyScalar(1.2), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.5, 3.4, 24, 1, true), coneMat);
  cone.position.y = 1.7;
  g.add(cone);
  const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ff7ff).multiplyScalar(2), wireframe: true }));
  gem.position.y = 3.6;
  g.add(gem);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.04, 6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc21a).multiplyScalar(2) }));
  ring.position.y = 3.6;
  g.add(ring);
  ctx.group.add(g);
  return (_dt, t) => {
    gem.rotation.y = t * 0.9; gem.rotation.x = t * 0.4;
    gem.position.y = 3.6 + Math.sin(t * 1.5) * 0.2;
    ring.rotation.x = Math.PI / 2 + Math.sin(t) * 0.4; ring.rotation.y = t * 0.6;
    coneMat.opacity = 0.1 + Math.sin(t * 7) * 0.025;
  };
}

/** Futuristic "solar tree": tilted panel petals on a pole, glowing core. */
export function solarTree(ctx: LevelContext, x: number, y: number, z: number) {
  const b = ctx.batch;
  b.add(Prims.cyl, { x, y: y + 2.5, z }, 0xfff1dc, { scale: [0.3, 5, 0.3] });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.add(Prims.box, { x: x + Math.cos(a) * 1.1, y: y + 5 + (i % 2) * 0.4, z: z + Math.sin(a) * 1.1 }, 0x1b2f6b, { scale: [1.8, 0.08, 1.1], rot: [0, -a, 0.3], order: 'YXZ' });
    b.add(Prims.box, { x: x + Math.cos(a) * 1.1, y: y + 4.95 + (i % 2) * 0.4, z: z + Math.sin(a) * 1.1 }, 0xf5b52a, { scale: [1.9, 0.04, 1.2], rot: [0, -a, 0.3], order: 'YXZ' });
  }
  b.add(Prims.sphereLo, { x, y: y + 5.3, z }, 0x3dffb5, { scale: [0.5, 0.5, 0.5], glow: true });
  ctx.solids.push(Solid.cyl(x, y + 5, z, 0.2, 5));
}

/** Shopfront: coloured awning (a bonus bounce platform!) + glowing window. */
export function shopfront(ctx: LevelContext, faceX: number, z: number, dir: 1 | -1, color: number, w = 5) {
  const ax = faceX + dir * 0.75;
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5 - 0.5;
    ctx.batch.add(Prims.box, { x: ax, y: 3.2, z: z + t * w }, i % 2 ? color : 0xffffff, { scale: [1.5, 0.18, w / 5 + 0.01], rot: [0, 0, dir * 0.18] });
  }
  ctx.batch.add(Prims.box, { x: faceX + dir * 0.06, y: 1.5, z }, 0xfff2c4, { scale: [0.1, 1.8, w * 0.7], glow: true, glowBoost: 1.3 });
  ctx.batch.add(Prims.box, { x: faceX + dir * 0.08, y: 1.5, z }, 0x2b2440, { scale: [0.12, 2.0, w * 0.74 + 0.15] });
  ctx.solids.push(Solid.box(ax, 3.3, z, 1.5, 0.3, w));
}
