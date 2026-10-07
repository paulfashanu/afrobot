import * as THREE from 'three';

const MAX = 1200;

/** Pooled additive particle system (bursts, sparkles, dust, dash trails). */
export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private baseSize = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private cursor = 0;
  private tmpC = new THREE.Color();

  constructor(additive = true) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uAdd: { value: additive ? 1 : 0 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAdd;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = uAdd > 0.5 ? smoothstep(0.5, 0.0, d) : smoothstep(0.5, 0.3, d) * 0.85;
          gl_FragColor = vec4(vColor * (1.0 + a * uAdd), a * vAlpha);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
  }

  emit(
    p: THREE.Vector3Like,
    opts: { count?: number; color?: THREE.ColorRepresentation; speed?: number; up?: number; life?: number; size?: number; gravity?: number; spread?: number } = {},
  ) {
    const count = opts.count ?? 20;
    this.tmpC.set(opts.color ?? 0xffd75a);
    const speed = opts.speed ?? 5;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const s = opts.spread ?? 0.1;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * s;
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * s;
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * s;
      // random direction on sphere
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.vel[i * 3] = r * Math.cos(th) * sp;
      this.vel[i * 3 + 1] = u * sp + (opts.up ?? 0);
      this.vel[i * 3 + 2] = r * Math.sin(th) * sp;
      this.col[i * 3] = this.tmpC.r; this.col[i * 3 + 1] = this.tmpC.g; this.col[i * 3 + 2] = this.tmpC.b;
      const life = (opts.life ?? 0.8) * (0.6 + Math.random() * 0.4);
      this.life[i] = life; this.maxLife[i] = life;
      this.baseSize[i] = (opts.size ?? 0.35) * (0.6 + Math.random() * 0.6);
      this.grav[i] = opts.gravity ?? -6;
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      const drag = Math.exp(-dt * 2);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = t;
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true; a.color.needsUpdate = true; a.size.needsUpdate = true; a.alpha.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}
