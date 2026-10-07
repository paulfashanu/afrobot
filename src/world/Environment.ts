import * as THREE from 'three';
import { Prims, StaticBatcher } from '../core/Batcher';
import { skylineTexture, waterTexture } from '../core/Textures';

export const WATER_Y = -1.2;
const SUN_DIR = new THREE.Vector3(0.45, 0.82, 0.36).normalize();

/** Sky dome, sun, lagoon water, clouds, distant skyline and bridge. */
export class Environment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private water: THREE.Mesh;
  private waterTex: THREE.Texture;
  private clouds: THREE.Group;

  constructor(scene: THREE.Scene, levelCenter: THREE.Vector3) {
    scene.fog = new THREE.Fog(0xd4ecff, 90, 560);
    scene.background = new THREE.Color(0x9fd6ff);

    // Sky dome with gradient + sun glow
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uSun: { value: SUN_DIR } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 top = vec3(0.13, 0.45, 0.95);
          vec3 mid = vec3(0.45, 0.76, 1.0);
          vec3 hor = vec3(0.86, 0.93, 1.0);
          vec3 col = h > 0.0 ? mix(hor, mid, smoothstep(0.0, 0.25, h)) : hor;
          col = mix(col, top, smoothstep(0.25, 0.9, h));
          float s = max(dot(normalize(vDir), uSun), 0.0);
          col += vec3(1.0, 0.85, 0.55) * pow(s, 18.0) * 0.55;
          col += vec3(1.0, 0.95, 0.8) * smoothstep(0.9985, 0.9995, s) * 2.5;
          col = mix(col, vec3(1.0, 0.86, 0.7), (1.0 - smoothstep(-0.02, 0.12, h)) * 0.35);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    // Lights
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xf3c48a, 1.25);
    this.group.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.group.add(this.sun, this.sun.target);

    // Lagoon
    this.waterTex = waterTexture().clone();
    this.waterTex.needsUpdate = true;
    this.waterTex.repeat.set(220, 220);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0x1fb8cf, map: this.waterTex, roughness: 0.18, metalness: 0.15 }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_Y;
    this.water.receiveShadow = true;
    this.group.add(this.water);

    // Distant mainland ring + skyline
    const land = new THREE.Mesh(
      new THREE.RingGeometry(260, 1100, 64, 1),
      new THREE.MeshStandardMaterial({ color: 0x8fcf7a, roughness: 1 }),
    );
    land.rotation.x = -Math.PI / 2;
    land.position.set(levelCenter.x, WATER_Y + 0.3, levelCenter.z);
    this.group.add(land);
    const beach = new THREE.Mesh(new THREE.RingGeometry(250, 268, 64, 1), new THREE.MeshStandardMaterial({ color: 0xf5deb0, roughness: 1 }));
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(levelCenter.x, WATER_Y + 0.25, levelCenter.z);
    this.group.add(beach);
    this.buildSkyline(levelCenter);
    this.group.add(this.buildBridge());

    this.clouds = this.buildClouds(levelCenter);
    this.group.add(this.clouds);
    scene.add(this.group);
  }

  private buildSkyline(c: THREE.Vector3) {
    const count = 120;
    const tex = skylineTexture().clone();
    tex.needsUpdate = true;
    tex.repeat.set(2, 6);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: 0x334466, emissiveIntensity: 0.2 });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const colors = [0xffb48a, 0xffe08a, 0x9ee8d4, 0xa8dcff, 0xf6a6d6, 0xc8b0ff, 0xfff1dc, 0xffffff];
    const col = new THREE.Color();
    let s = 3;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.05;
      const dist = 290 + r() * 140;
      const w = 12 + r() * 20, d = 12 + r() * 20;
      const h = 25 + Math.pow(r(), 2) * 110;
      m.compose(
        new THREE.Vector3(c.x + Math.cos(a) * dist, WATER_Y, c.z + Math.sin(a) * dist),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)),
        new THREE.Vector3(w, h, d),
      );
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.set(colors[i % colors.length]));
    }
    this.group.add(inst);

    // Landmark Afrofuturist towers
    const fb = new StaticBatcher();
    const landmark = (x: number, z: number, h: number, color: number) => {
      fb.add(Prims.cylHi, { x, y: h / 2 + WATER_Y, z }, color, { scale: [14, h, 14] });
      fb.add(Prims.cylHi, { x, y: h + WATER_Y + 4, z }, 0x2b2440, { scale: [22, 8, 22] });
      fb.add(Prims.torus, { x, y: h + WATER_Y + 12, z }, 0x5ff7ff, { scale: [26, 26, 60], rot: [Math.PI / 2, 0, 0], glow: true });
      fb.add(Prims.cone, { x, y: h + WATER_Y + 26, z }, 0xf5b52a, { scale: [8, 36, 8] });
    };
    landmark(c.x - 180, c.z - 320, 120, 0xfff1dc);
    landmark(c.x + 240, c.z - 200, 90, 0xffd166);
    landmark(c.x + 160, c.z + 260, 100, 0xa8dcff);
    this.group.add(fb.build('landmarks', { castShadow: false, receiveShadow: false }));
  }

  /** Long lagoon bridge on pylons — a nod to Lagos's famous causeways. */
  private buildBridge() {
    const b = new StaticBatcher();
    const x = -95, y = 8;
    for (let z = 260; z > -620; z -= 30) {
      b.add(Prims.box, { x, y, z: z - 15 }, 0xe8e0d0, { scale: [12, 1.4, 30.2] });
      b.add(Prims.box, { x: x - 5.8, y: y + 1, z: z - 15 }, 0xffc21a, { scale: [0.3, 0.6, 30.2] });
      b.add(Prims.box, { x: x + 5.8, y: y + 1, z: z - 15 }, 0xffc21a, { scale: [0.3, 0.6, 30.2] });
      for (const dx of [-3.5, 3.5]) b.add(Prims.cyl, { x: x + dx, y: (y + WATER_Y) / 2, z }, 0xcfc6b8, { scale: [1.6, y - WATER_Y, 1.6] });
      b.add(Prims.box, { x, y: y - 1.2, z }, 0xcfc6b8, { scale: [9, 1, 2] });
    }
    // little cars
    const carCols = [0xffc21a, 0xff5fa2, 0x4cc9f0, 0xffffff, 0x06d6a0, 0xff6b6b];
    for (let i = 0; i < 26; i++) {
      const z = 240 - i * 33 + (i % 3) * 7;
      b.add(Prims.box, { x: x + (i % 2 ? 2.4 : -2.4), y: y + 1.3, z }, carCols[i % carCols.length], { scale: [1.8, 1.2, 3.8] });
    }
    return b.build('bridge', { castShadow: false });
  }

  private buildClouds(c: THREE.Vector3) {
    const b = new StaticBatcher();
    let s = 11;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const dist = 140 + r() * 320;
      const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist, cy = 70 + r() * 70;
      const puffs = 5 + Math.floor(r() * 5);
      const size = 10 + r() * 12;
      for (let p = 0; p < puffs; p++) {
        const ps = size * (0.6 + r() * 0.6);
        b.add(Prims.sphere, { x: cx + (p - puffs / 2) * size * 0.7, y: cy + r() * size * 0.4, z: cz + (r() - 0.5) * size }, 0xffffff, { scale: [ps * 1.6, ps, ps * 1.3] });
      }
    }
    const g = b.build('clouds', { castShadow: false, receiveShadow: false });
    g.position.set(c.x, 0, c.z);
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'emissive' in m) { m.emissive.set(0xb8c8dd); m.emissiveIntensity = 0.55; m.fog = false; m.roughness = 1; }
    });
    return g;
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3) {
    this.sky.position.copy(camera.position);
    // Keep the shadow frustum centred on the player (snapped to texels to avoid shimmer)
    const snap = 68 / 2048;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(SUN_DIR, 70);
    this.waterTex.offset.x += dt * 0.004;
    this.waterTex.offset.y += dt * 0.006;
    this.clouds.rotation.y += dt * 0.004;
  }
}
