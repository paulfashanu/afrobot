import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Input } from './Input';
import { CameraRig } from './Camera';
import { groundHeightBelow } from './Physics';
import { AudioManager } from '../audio/AudioManager';
import { Particles } from '../fx/Particles';
import { Environment, WATER_Y } from '../world/Environment';
import { LagosLevel } from '../world/LagosLevel';
import { PlayerController, PLAYER_HEIGHT, PLAYER_RADIUS } from '../player/PlayerController';
import { HUD } from '../ui/HUD';
import { PauseMenu } from '../ui/PauseMenu';
import { LevelComplete } from '../ui/LevelComplete';
import { TitleScreen } from '../ui/TitleScreen';

type State = 'title' | 'playing' | 'paused' | 'complete';

const PHYSICS_STEP = 1 / 120;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private rig: CameraRig;
  private input: Input;
  private audio = new AudioManager();
  private particles = new Particles();
  private env: Environment;
  private level!: LagosLevel;
  private player = new PlayerController();
  private hud!: HUD;
  private pauseMenu: PauseMenu;
  private completeScreen: LevelComplete;
  private title: TitleScreen;
  private blob: THREE.Mesh;

  private state: State = 'title';
  private clock = new THREE.Clock();
  private simTime = 0;
  private levelTime = 0;
  private cores = 0;
  private nodesActive = 0;
  private respawnPoint = new THREE.Vector3();
  private respawnYaw = Math.PI;
  private respawnT = -1;
  private completeT = -1;
  private gateHintCd = 0;
  private trailT = 0;
  private titleOrbit = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;

    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.input = new Input(this.renderer.domElement);

    // Post-processing: MSAA render target + soft bloom for glowing bits
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.rig.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.5, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.env = new Environment(this.scene, LagosLevel.center);
    this.scene.add(this.particles.points);
    this.scene.add(this.player.model.root);

    // Blob shadow under the player (helps judge landings)
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(20,10,40,0.55)');
    grad.addColorStop(1, 'rgba(20,10,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.scene.add(this.blob);

    this.loadLevel();

    // UI
    const ui = document.body;
    this.hud = new HUD(ui, this.level.cores.length, this.player.maxHealth, this.level.nodes.length);
    this.hud.setVisible(false);
    this.pauseMenu = new PauseMenu(ui, () => this.resume(), () => this.restart());
    this.completeScreen = new LevelComplete(ui, () => this.restart());
    this.title = new TitleScreen(ui, () => this.start());

    this.wirePlayerEvents();
    this.wireGlobalKeys();
    window.addEventListener('resize', () => this.onResize());

    this.renderer.setAnimationLoop(() => this.frame());
    (window as unknown as { __afrobot: Game }).__afrobot = this;
  }

  // ---------- lifecycle ----------
  private loadLevel() {
    if (this.level) {
      this.scene.remove(this.level.group);
      this.level.dispose();
    }
    this.level = new LagosLevel();
    this.scene.add(this.level.group);
    this.rig.blockers = this.level.blockers;
    for (const b of this.level.bytes) b.onAlert = () => this.audio.play('alert');

    this.cores = 0;
    this.nodesActive = 0;
    this.levelTime = 0;
    this.simTime = 0;
    this.respawnT = -1;
    this.completeT = -1;
    this.respawnPoint.copy(this.level.spawn);
    this.respawnYaw = this.level.spawnYaw;
    this.player.frozen = false;
    this.player.heal();
    this.player.model.root.scale.setScalar(1);
    this.player.spawn(this.level.spawn, this.level.spawnYaw);
    this.rig.snapTo(this.player.pos, 0);
    this.particles.clear();
  }

  private start() {
    this.audio.unlock();
    this.audio.play('click');
    this.title.hide();
    this.hud.setVisible(true);
    this.hud.reset();
    this.hud.setHealth(this.player.health);
    this.state = 'playing';
    this.input.clear();
    this.input.requestLock();
    this.rig.snapTo(this.player.pos, 0);
    setTimeout(() => this.hud.toast('LAGOS RUN — REACH THE AFRO GATE!', 3), 400);
  }

  private pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pauseMenu.show(true);
    this.input.exitLock();
    this.audio.setMusicDuck(true);
  }

  private resume() {
    if (this.state !== 'paused') return;
    this.audio.play('click');
    this.pauseMenu.show(false);
    this.state = 'playing';
    this.input.clear();
    this.input.requestLock();
    this.clock.getDelta();
    this.audio.setMusicDuck(false);
  }

  private restart() {
    this.audio.play('click');
    this.pauseMenu.show(false);
    this.completeScreen.hide();
    this.loadLevel();
    this.hud.reset();
    this.hud.setHealth(this.player.health);
    this.hud.setVisible(true);
    this.state = 'playing';
    this.input.clear();
    this.input.requestLock();
    this.audio.setMusicDuck(false);
    this.clock.getDelta();
  }

  private wireGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      } else if (e.code === 'KeyM') {
        const on = this.audio.toggleMusic();
        if (this.state === 'playing') this.hud.toast(on ? 'MUSIC ON' : 'MUSIC OFF', 1);
      } else if (e.code === 'KeyN') {
        const muted = this.audio.toggleMute();
        if (this.state === 'playing') this.hud.toast(muted ? 'SOUND MUTED' : 'SOUND ON', 1);
      } else if (e.code === 'Enter' && this.state === 'title') {
        this.start();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      // Browsers swallow ESC while pointer-locked; losing the lock means "pause".
      if (!this.input.locked && this.state === 'playing') this.pause();
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
    });
  }

  private wirePlayerEvents() {
    this.player.onEvent = (e, p, extra) => {
      switch (e) {
        case 'jump':
          this.audio.play('jump');
          this.particles.emit({ x: p.x, y: p.y + 0.1, z: p.z }, { count: 8, color: 0xfff1dc, speed: 2.5, life: 0.4, size: 0.4, gravity: 0 });
          break;
        case 'doubleJump':
          this.audio.play('doubleJump');
          this.particles.emit({ x: p.x, y: p.y + 0.3, z: p.z }, { count: 22, color: 0x5ff7ff, speed: 4, life: 0.5, size: 0.3, gravity: -2 });
          break;
        case 'dash':
          this.audio.play('dash');
          this.particles.emit({ x: p.x, y: p.y + 0.8, z: p.z }, { count: 16, color: 0x3dffb5, speed: 5, life: 0.35, size: 0.3, gravity: 0 });
          break;
        case 'land':
          if ((extra ?? 0) > 9) {
            this.audio.play('land');
            this.particles.emit({ x: p.x, y: p.y + 0.1, z: p.z }, { count: 12, color: 0xfff1dc, speed: 3.5, life: 0.4, size: 0.45, gravity: 0, up: 0.5 });
          }
          break;
        case 'hurt':
          this.audio.play('hurt');
          this.hud.hurtFlash();
          this.hud.setHealth(Math.max(0, this.player.health));
          this.particles.emit({ x: p.x, y: p.y + 0.8, z: p.z }, { count: 18, color: 0xff3d6e, speed: 5, life: 0.5, size: 0.3 });
          break;
        case 'dead':
          this.beginRespawn('OUCH! BACK TO CHECKPOINT');
          break;
      }
    };
  }

  private beginRespawn(msg?: string) {
    if (this.respawnT >= 0) return;
    this.respawnT = 0;
    this.player.frozen = true;
    this.hud.fade(true);
    if (msg) this.hud.toast(msg, 1.6);
  }

  // ---------- main loop ----------
  private frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'complete') this.updateComplete(dt);
    else if (this.state === 'title') this.updateTitle(dt);

    if (this.state !== 'paused') {
      this.particles.update(dt);
      this.level.updateVisuals(dt);
      this.env.update(dt, this.rig.camera, this.player.pos);
    }
    this.composer.render();
    this.input.endFrame();
  }

  private updateTitle(dt: number) {
    // Gentle orbit around Afrobot behind the title screen
    this.simTime += dt;
    this.level.update(dt, this.simTime);
    for (const b of this.level.bytes) b.update(dt, this.player.pos, false);
    this.player.updateVisual(dt);
    this.titleOrbit += dt * 0.12;
    this.rig.yaw = this.titleOrbit;
    this.rig.update(dt, null, this.player.pos, 0, true);
  }

  private updatePlaying(dt: number) {
    const L = this.level;
    const p = this.player;
    if (this.respawnT < 0 && this.completeT < 0) this.levelTime += dt;
    this.hud.setTime(this.levelTime);
    this.gateHintCd = Math.max(0, this.gateHintCd - dt);

    // Respawn fade sequence
    if (this.respawnT >= 0) {
      this.respawnT += dt;
      if (this.respawnT > 0.3 && p.frozen) {
        p.spawn(this.respawnPoint, this.respawnYaw);
        p.heal();
        p.invuln = 1.0;
        p.frozen = false;
        this.hud.setHealth(p.health);
        this.rig.snapTo(p.pos, this.respawnYaw + Math.PI);
        this.hud.fade(false);
      }
      if (this.respawnT > 0.6) this.respawnT = -1;
    }

    // Fixed-step physics
    p.readInput(this.input);
    const steps = Math.max(1, Math.ceil(dt / PHYSICS_STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.simTime += h;
      L.update(h, this.simTime);
      p.step(h, this.input, this.rig, L.solids);
    }

    const playerActive = !p.frozen;
    for (const b of L.bytes) b.update(dt, p.pos, playerActive);

    if (playerActive) {
      this.checkHazards();
      this.checkEnemies();
      this.checkCollectibles();
      this.checkCheckpoints();
      this.checkNodes();
      this.checkGate();
      if (p.pos.y < L.killY) {
        this.audio.play('splash');
        this.particles.emit({ x: p.pos.x, y: WATER_Y + 0.2, z: p.pos.z }, { count: 40, color: 0xbff6ff, speed: 6, up: 6, life: 0.8, size: 0.45, gravity: -18 });
        this.beginRespawn('SPLASH!');
      }
    }

    // Dash trail
    if (p.dashing) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.015;
        this.particles.emit({ x: p.pos.x, y: p.pos.y + 0.8, z: p.pos.z }, { count: 2, color: 0x3dffb5, speed: 0.6, life: 0.35, size: 0.5, gravity: 0, spread: 0.4 });
      }
    }

    p.updateVisual(dt);
    this.updateBlob();
    this.rig.update(dt, this.input, p.pos, Math.hypot(p.vel.x, p.vel.z), p.grounded);
  }

  private updateBlob() {
    const p = this.player.pos;
    let gy = groundHeightBelow(this.level.solids, p.x, p.y + 0.1, p.z);
    if (gy === -Infinity) gy = WATER_Y;
    const hgt = p.y - gy;
    this.blob.position.set(p.x, gy + 0.03, p.z);
    const s = THREE.MathUtils.clamp(1 - hgt * 0.06, 0.4, 1);
    this.blob.scale.setScalar(s);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(1 - hgt * 0.05, 0.25, 1);
    this.blob.visible = this.player.model.root.visible && this.completeT < 0;
  }

  // ---------- gameplay checks ----------
  private checkHazards() {
    const p = this.player;
    for (const hz of this.level.hazards) {
      const dir = hz.hit(p.pos, PLAYER_RADIUS, PLAYER_HEIGHT);
      if (dir && p.invuln <= 0) {
        this.audio.play('zap');
        p.damage(dir);
        break;
      }
    }
  }

  private checkEnemies() {
    const p = this.player;
    for (const b of this.level.bytes) {
      if (!b.alive) continue;
      const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > b.radius + PLAYER_RADIUS + 0.1) continue;
      if (p.pos.y > b.pos.y + 1.1 || p.pos.y + PLAYER_HEIGHT < b.pos.y) continue;
      const stomp = p.vel.y < -0.5 && p.pos.y > b.pos.y + 0.4;
      if (stomp || p.dashing) {
        b.defeat();
        this.audio.play('enemyDefeat');
        this.particles.emit({ x: b.pos.x, y: b.pos.y + 0.5, z: b.pos.z }, { count: 30, color: 0xff7a2f, speed: 7, life: 0.7, size: 0.35 });
        this.particles.emit({ x: b.pos.x, y: b.pos.y + 0.5, z: b.pos.z }, { count: 14, color: 0xffe14a, speed: 4, life: 0.6, size: 0.3 });
        if (stomp) p.bounce();
        this.hud.toast('BYTE BUSTED!', 1.2);
      } else if (p.invuln <= 0) {
        p.damage(new THREE.Vector3(dx, 0, dz));
      }
    }
  }

  private checkCollectibles() {
    const c = this.player.center;
    for (const core of this.level.cores) {
      if (core.collected) continue;
      if (core.mesh.position.distanceTo(c) < 1.25) {
        core.collect();
        this.cores++;
        this.hud.setCores(this.cores);
        this.audio.play('collect');
        this.player.model.happy();
        this.particles.emit(core.mesh.position, { count: 28, color: 0xffc93c, speed: 6, life: 0.7, size: 0.35, gravity: -4 });
        this.particles.emit(core.mesh.position, { count: 16, color: 0x3dffb5, speed: 3, up: 2, life: 0.9, size: 0.3, gravity: 0 });
        if (this.cores === this.level.cores.length) this.hud.toast('ALL 20 AFRO CORES!', 2.5);
      }
    }
  }

  private checkCheckpoints() {
    const p = this.player;
    this.level.checkpoints.forEach((cp, i) => {
      if (cp.active || !cp.contains(p.pos)) return;
      cp.activate();
      this.respawnPoint.copy(cp.position).add(new THREE.Vector3(0, 0.25, -1.8));
      this.respawnYaw = Math.PI;
      p.heal();
      this.hud.setHealth(p.health);
      this.audio.play('checkpoint');
      this.hud.toast(`CHECKPOINT ${i + 1}!`, 1.8);
      this.particles.emit({ x: cp.position.x, y: cp.position.y + 1.5, z: cp.position.z }, { count: 40, color: 0x3dffb5, speed: 6, up: 3, life: 1, size: 0.35 });
    });
  }

  private checkNodes() {
    const p = this.player;
    const near = this.level.nodes.find((n) => n.inRange(p.pos));
    this.hud.prompt(near ? '<span class="key">E</span> ACTIVATE POWER NODE' : null);
    if (near && this.input.interactPressed) {
      near.activate();
      this.nodesActive++;
      this.level.gate.setPower(this.nodesActive);
      this.hud.setNodes(this.nodesActive);
      this.audio.play('node');
      this.particles.emit({ x: near.position.x, y: near.position.y + 1.5, z: near.position.z }, { count: 40, color: 0x5ff7ff, speed: 6, up: 4, life: 1, size: 0.35 });
      const total = this.level.nodes.length;
      if (this.nodesActive >= total) {
        this.hud.toast('THE AFRO GATE IS OPEN!', 3);
        setTimeout(() => this.audio.play('portal'), 350);
      } else {
        this.hud.toast(`POWER NODE ${this.nodesActive} / ${total}`, 1.8);
      }
    }
  }

  private checkGate() {
    const g = this.level.gate;
    if (!g.contains(this.player.pos)) return;
    if (!g.unlocked) {
      if (this.gateHintCd <= 0) {
        this.hud.toast(`POWER ALL ${this.level.nodes.length} NODES FIRST!`, 2);
        this.gateHintCd = 3;
      }
      return;
    }
    // Enter the gate!
    this.state = 'complete';
    this.completeT = 0;
    this.player.frozen = true;
    this.hud.prompt(null);
    this.audio.play('portal');
  }

  private updateComplete(dt: number) {
    this.completeT += dt;
    const p = this.player;
    const target = this.level.gate.portalCenter;
    const k = Math.min(1, this.completeT / 1.3);
    p.model.root.position.lerp(target, Math.min(1, dt * 3));
    p.model.root.rotation.y += dt * (4 + k * 18);
    p.model.root.scale.setScalar(Math.max(0.01, 1 - k));
    if (Math.random() < 0.6) this.particles.emit(target, { count: 3, color: Math.random() < 0.5 ? 0x5ff7ff : 0xffc21a, speed: 5, life: 0.8, size: 0.4, gravity: 0 });
    this.simTime += dt;
    this.level.update(dt, this.simTime);
    this.rig.update(dt, null, p.pos, 0, true);
    if (this.completeT > 1.4 && this.completeT - dt <= 1.4) {
      this.audio.play('complete');
      this.hud.setVisible(false);
      this.input.exitLock();
      this.completeScreen.show(this.cores, this.level.cores.length, this.levelTime);
    }
  }

  private onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
  }

  /** Debug helper (console): __afrobot.debugTeleport(x, y, z) */
  debugTeleport(x: number, y: number, z: number) {
    this.player.spawn(new THREE.Vector3(x, y, z), Math.PI);
    this.rig.snapTo(this.player.pos, 0);
  }
}
