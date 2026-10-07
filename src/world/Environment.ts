import * as THREE from 'three';
import { Prims, StaticBatcher } from '../core/Batcher';
import { skylineTexture, waterTexture } from '../core/Textures';

export const WATER_Y = -1.2;
/** Warm mid-afternoon sun, slightly behind-left of the route so faces catch the light. */
export const SUN_DIR = new THREE.Vector3(0.5, 0.72, 0.42).normalize();
const FOG_COLOR = 0xf4dcc0;
const BRIDGE_X = -95;

/** Sky dome, sun, lagoon water, clouds, distant skyline, bridge traffic. */
export class Environment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private waterTex: THREE.Texture;
  private clouds: THREE.Group;
  private cars: THREE.InstancedMesh;
  private carData: { lane: number; z: number; speed: number }[] = [];
  private m = new THREE.Matrix4();

  constructor(scene: THREE.Scene, levelCenter: THREE.Vector3) {
    scene.fog = new THREE.Fog(FOG_COLOR, 70, 620);
    scene.background = new THREE.Color(FOG_COLOR);

    // Sky dome: deep blue zenith → warm peach horizon, with a soft sun halo
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
          vec3 top = vec3(0.16, 0.44, 0.92);
          vec3 mid = vec3(0.46, 0.74, 0.98);
          vec3 hor = vec3(0.98, 0.88, 0.76);
          vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
          col = mix(col, top, smoothstep(0.22, 0.95, h));
          float s = max(dot(normalize(vDir), uSun), 0.0);
          col += vec3(1.0, 0.78, 0.45) * pow(s, 12.0) * 0.5;
          col += vec3(1.0, 0.92, 0.75) * smoothstep(0.9985, 0.9995, s) * 3.0;
          col = mix(col, vec3(0.96, 0.86, 0.75), 1.0 - smoothstep(-0.05, 0.06, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    // Lights: warm sun + sky/ground bounce
    const hemi = new THREE.HemisphereLight(0xbcdcff, 0xf0b47a, 1.15);
    this.group.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffe0b0, 3.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -36; sc.right = 36; sc.top = 36; sc.bottom = -36; sc.near = 1; sc.far = 170;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.sun.shadow.blurSamples = 12;
    this.group.add(this.sun, this.sun.target);
    // Cool rim light from the opposite side so silhouettes pop
    const rim = new THREE.DirectionalLight(0x9fc8ff, 0.55);
    rim.position.set(-0.6, 0.4, -0.7).multiplyScalar(100);
    this.group.add(rim);

    // Lagoon
    this.waterTex = waterTexture().clone();
    this.waterTex.needsUpdate = true;
    this.waterTex.repeat.set(220, 220);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0x1fb3c8, map: this.waterTex, roughness: 0.12, metalness: 0.2, emissive: 0x0a4a5a, emissiveIntensity: 0.25 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    water.receiveShadow = true;
    this.group.add(water);

    // Distant mainland ring + beach + skyline
    const land = new THREE.Mesh(new THREE.RingGeometry(260, 1100, 64, 1), new THREE.MeshStandardMaterial({ color: 0x9fcf7a, roughness: 1 }));
    land.rotation.x = -Math.PI / 2;
    land.position.set(levelCenter.x, WATER_Y + 0.3, levelCenter.z);
    this.group.add(land);
    const beach = new THREE.Mesh(new THREE.RingGeometry(250, 268, 64, 1), new THREE.MeshStandardMaterial({ color: 0xf5deb0, roughness: 1 }));
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(levelCenter.x, WATER_Y + 0.25, levelCenter.z);
    this.group.add(beach);
    this.buildSkyline(levelCenter);
    this.group.add(this.buildBridge());
    this.cars = this.buildCars();
    this.group.add(this.cars);

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
    const colors = [0xffb48a, 0xffe08a, 0x9ee8d4, 0xa8dcff, 0xf6a6d6, 0xc8b0ff, 0xfff1dc, 0xffffff];
    const col = new THREE.Color();
    let s = 3;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.05;
      const dist = 290 + r() * 140;
      const w = 12 + r() * 20, d = 12 + r() * 20;
      const h = 25 + Math.pow(r(), 2) * 110;
      this.m.compose(
        new THREE.Vector3(c.x + Math.cos(a) * dist, WATER_Y, c.z + Math.sin(a) * dist),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)),
        new THREE.Vector3(w, h, d),
      );
      inst.setMatrixAt(i, this.m);
      inst.setColorAt(i, col.set(colors[i % colors.length]));
    }
    this.group.add(inst);

    // Two secondary Afrofuturist towers on the horizon (the main landmark lives in Landmark.ts)
    const fb = new StaticBatcher();
    const tower = (x: number, z: number, h: number, color: number) => {
      fb.add(Prims.cylHi, { x, y: h / 2 + WATER_Y, z }, color, { scale: [14, h, 14] });
      fb.add(Prims.cylHi, { x, y: h + WATER_Y + 4, z }, 0x2b2440, { scale: [22, 8, 22] });
      fb.add(Prims.torus, { x, y: h + WATER_Y + 12, z }, 0x5ff7ff, { scale: [26, 26, 60], rot: [Math.PI / 2, 0, 0], glow: true });
      fb.add(Prims.cone, { x, y: h + WATER_Y + 26, z }, 0xf5b52a, { scale: [8, 36, 8] });
    };
    tower(c.x + 240, c.z - 200, 90, 0xffd166);
    tower(c.x + 160, c.z + 260, 100, 0xa8dcff);
    this.group.add(fb.build('towers', { castShadow: false, receiveShadow: false }));
  }

  /** Long lagoon bridge on pylons — a nod to Lagos's famous causeways. */
  private buildBridge() {
    const b = new StaticBatcher();
    const x = BRIDGE_X, y = 8;
    for (let z = 260; z > -620; z -= 30) {
      b.add(Prims.box, { x, y, z: z - 15 }, 0xe8e0d0, { scale: [12, 1.4, 30.2] });
      b.add(Prims.box, { x: x - 5.8, y: y + 1, z: z - 15 }, 0xffc21a, { scale: [0.3, 0.6, 30.2] });
      b.add(Prims.box, { x: x + 5.8, y: y + 1, z: z - 15 }, 0xffc21a, { scale: [0.3, 0.6, 30.2] });
      for (const dx of [-3.5, 3.5]) b.add(Prims.cyl, { x: x + dx, y: (y + WATER_Y) / 2, z }, 0xcfc6b8, { scale: [1.6, y - WATER_Y, 1.6] });
      b.add(Prims.box, { x, y: y - 1.2, z }, 0xcfc6b8, { scale: [9, 1, 2] });
      // lamp posts
      b.add(Prims.cyl, { x: x - 5.6, y: y + 3, z }, 0x2b2440, { scale: [0.25, 5, 0.25] });
      b.add(Prims.sphereLo, { x: x - 5.6, y: y + 5.6, z }, 0xfff2b0, { scale: [0.7, 0.7, 0.7], glow: true });
    }
    return b.build('bridge', { castShadow: false });
  }

  /** Cars streaming both ways across the bridge (instanced, animated). */
  private buildCars() {
    const n = 48;
    const geo = new THREE.BoxGeometry(1.8, 1.1, 3.8);
    geo.translate(0, 0.55, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 });
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const carCols = [0xffc21a, 0xffc21a, 0xff5fa2, 0x4cc9f0, 0xffffff, 0x06d6a0, 0xff6b6b, 0x9b5de5];
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const lane = i % 2;
      this.carData.push({ lane, z: 260 - (i / n) * 880 + (i % 3) * 5, speed: (lane ? -1 : 1) * (14 + (i % 5) * 2.5) });
      inst.setColorAt(i, col.set(carCols[i % carCols.length]));
    }
    inst.frustumCulled = false;
    return inst;
  }

  private buildClouds(c: THREE.Vector3) {
    const b = new StaticBatcher();
    let s = 11;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 28; i++) {
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
      if (m && 'emissive' in m) { m.emissive.set(0xc8b8b0); m.emissiveIntensity = 0.6; m.fog = false; m.roughness = 1; }
    });
    return g;
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3) {
    this.sky.position.copy(camera.position);
    // Keep the shadow frustum centred on the player (snapped to texels to avoid shimmer)
    const snap = 72 / 2048;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(SUN_DIR, 80);
    this.waterTex.offset.x += dt * 0.004;
    this.waterTex.offset.y += dt * 0.006;
    this.clouds.rotation.y += dt * 0.004;

    // Traffic
    for (let i = 0; i < this.carData.length; i++) {
      const c = this.carData[i];
      c.z += c.speed * dt;
      if (c.z > 260) c.z -= 880;
      if (c.z < -620) c.z += 880;
      this.m.makeTranslation(BRIDGE_X + (c.lane ? 2.4 : -2.4), 8.7, c.z);
      this.cars.setMatrixAt(i, this.m);
    }
    this.cars.instanceMatrix.needsUpdate = true;
  }
}
