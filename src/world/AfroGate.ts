import * as THREE from 'three';
import { Solid } from '../core/Physics';
import { kenteTexture } from '../core/Textures';

const goldMat = new THREE.MeshStandardMaterial({ color: 0xf5b52a, roughness: 0.25, metalness: 0.85 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2440, roughness: 0.35, metalness: 0.6 });
const purpleMat = new THREE.MeshStandardMaterial({ color: 0x6b2fd6, roughness: 0.4, metalness: 0.3 });

/** THE AFRO GATE — the level's goal. Locked until all power nodes are active. */
export class AfroGate {
  readonly mesh = new THREE.Group();
  readonly position: THREE.Vector3;
  readonly solids: Solid[] = [];
  unlocked = false;
  private ring = new THREE.Group();
  private portalMat: THREE.ShaderMaterial;
  private lights: THREE.MeshBasicMaterial[] = [];
  private t = 0;
  private power = 0;
  readonly radius = 4.2;

  constructor(x: number, y: number, z: number, private nodeCount = 3) {
    this.position = new THREE.Vector3(x, y, z);
    this.mesh.position.copy(this.position);
    const R = this.radius;
    const cy = R + 1.2;

    // Stepped dais
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(R + 2.2 - i * 0.7, R + 2.4 - i * 0.7, 0.3, 40), i === 1 ? purpleMat : darkMat);
      step.position.y = 0.15 + i * 0.3;
      step.receiveShadow = step.castShadow = true;
      this.mesh.add(step);
      this.solids.push(Solid.cyl(x, y + 0.3 + i * 0.3, z, R + 2.2 - i * 0.7, 0.3));
    }

    // The ring itself
    this.ring.position.y = cy;
    this.mesh.add(this.ring);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(R, 0.45, 16, 64), goldMat);
    torus.castShadow = true;
    this.ring.add(torus);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R - 0.5, 0.12, 8, 64), new THREE.MeshStandardMaterial({ map: kenteTexture(), roughness: 0.5 }));
    this.ring.add(inner);
    // Sun-ray spikes around the ring (Afrofuturist crown)
    const spikeGeo = new THREE.ConeGeometry(0.28, 1.4, 4);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (Math.sin(a) < -0.55) continue; // leave the bottom open
      const s = new THREE.Mesh(spikeGeo, i % 2 ? goldMat : purpleMat);
      const r = R + 0.9 + (i % 2) * 0.3;
      s.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      s.rotation.z = a - Math.PI / 2;
      s.castShadow = true;
      this.ring.add(s);
    }
    // Node lights on the ring, one per power node
    for (let i = 0; i < nodeCount; i++) {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3d6e).multiplyScalar(1.2) });
      const a = Math.PI / 2 + (i - (nodeCount - 1) / 2) * 0.45;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), m);
      l.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.45);
      this.ring.add(l);
      this.lights.push(m);
    }

    // Swirling portal surface
    this.portalMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uPower; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
          if (r > 1.0) discard;
          float swirl = sin(a * 6.0 + r * 14.0 - uTime * (1.5 + uPower * 4.0));
          float bands = smoothstep(0.2, 1.0, swirl) * (1.0 - r * 0.6);
          vec3 locked = mix(vec3(0.25, 0.08, 0.45), vec3(0.6, 0.2, 0.9), bands);
          vec3 open = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.8, 0.25), bands) * (1.0 + 0.7 * (1.0 - r));
          vec3 col = mix(locked, open, uPower);
          float alpha = mix(0.55, 0.85, uPower) * smoothstep(1.0, 0.85, r);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R - 0.35, 48), this.portalMat);
    this.ring.add(disc);

    // Pillars
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, cy - 0.4, 8), darkMat);
      p.position.set(sx * (R + 0.2), (cy - 0.4) / 2 + 0.9, 0);
      p.castShadow = true;
      this.mesh.add(p);
      const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), goldMat);
      top.position.set(sx * (R + 0.2), cy + 0.6, 0);
      this.mesh.add(top);
      this.solids.push(Solid.cyl(x + sx * (R + 0.2), y + cy + 0.5, z, 0.55, cy));
    }
  }

  setPower(activeNodes: number) {
    this.lights.forEach((m, i) => {
      if (i < activeNodes) m.color.setRGB(0.37 * 3, 0.97 * 3, 1.0 * 3);
    });
    if (activeNodes >= this.nodeCount) this.unlocked = true;
  }

  update(dt: number) {
    this.t += dt;
    this.power += ((this.unlocked ? 1 : 0) - this.power) * Math.min(1, dt * 1.5);
    this.portalMat.uniforms.uTime.value = this.t;
    this.portalMat.uniforms.uPower.value = this.power;
    this.ring.rotation.z = Math.sin(this.t * 0.4) * 0.05;
  }

  /** Is the player stepping into the portal? */
  contains(p: THREE.Vector3) {
    const local = p.clone().sub(this.position);
    return Math.abs(local.z) < 1.2 && Math.abs(local.x) < this.radius - 0.8 && local.y > -0.5 && local.y < this.radius * 2;
  }

  get portalCenter() { return this.position.clone().add(new THREE.Vector3(0, this.radius + 1.2, 0)); }
}
