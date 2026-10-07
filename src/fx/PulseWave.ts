import * as THREE from 'three';

/** Afrobot's PULSE: an expanding shockwave ring + dome + ground ripple. */
export class PulseWave {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private dome: THREE.Mesh;
  private ground: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private domeMat: THREE.ShaderMaterial;
  private groundMat: THREE.MeshBasicMaterial;
  private t = -1;
  constructor(private radius = 7) {
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ff7ff).multiplyScalar(3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 8, 64), this.ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.domeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uA: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(vec3(0.4, 1.0, 1.0) * 1.8, f * uA * 0.8); }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.domeMat);
    this.groundMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ff7ff).multiplyScalar(2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.ground = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 64), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.group.add(this.ring, this.dome, this.ground);
    this.group.visible = false;
  }

  fire(at: THREE.Vector3, feetY: number) {
    this.t = 0;
    this.group.visible = true;
    this.group.position.copy(at);
    this.ground.position.y = feetY - at.y + 0.05;
  }

  update(dt: number) {
    if (this.t < 0) return;
    this.t += dt;
    const k = Math.min(1, this.t / 0.55);
    const e = 1 - Math.pow(1 - k, 3);
    const r = 0.5 + e * this.radius;
    this.ring.scale.setScalar(r);
    this.ring.scale.z = 1 + (1 - k) * 4;
    this.dome.scale.setScalar(r * 0.9);
    this.ground.scale.setScalar(r * 1.05);
    this.ringMat.opacity = 1 - k;
    this.groundMat.opacity = (1 - k) * 0.8;
    this.domeMat.uniforms.uA.value = 1 - k;
    if (k >= 1) { this.group.visible = false; this.t = -1; }
  }
}
