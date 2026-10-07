import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Input } from './Input';
import { CameraRig } from './Camera';
import { groundHeightBelow } from './Physics';
import { SwayTime } from './Batcher';
import { AudioManager } from '../audio/AudioManager';
import { Particles } from '../fx/Particles';
import { PulseWave } from '../fx/PulseWave';
import { GradeShader } from '../fx/Grade';
import { Environment, WATER_Y } from '../world/Environment';
import { Ambient } from '../world/Ambient';
import { SuncrownSpire } from '../world/Landmark';
import { LagosLevel } from '../world/LagosLevel';
import { PowerNode } from '../world/PowerNode';
import type { Interactable } from '../world/Interactive';
import { RobotNpc } from '../npc/RobotNpc';
import { PlayerController, PLAYER_HEIGHT, PLAYER_RADIUS } from '../player/PlayerController';
import { HUD } from '../ui/HUD';
import { PauseMenu } from '../ui/PauseMenu';
import { LevelComplete } from '../ui/LevelComplete';
import { TitleScreen } from '../ui/TitleScreen';
import { EventBus, type GameEvents } from '../systems/EventBus';
import { SaveManager } from '../systems/SaveManager';
import { AbilityManager } from '../systems/AbilityManager';
import { ProgressionManager } from '../systems/ProgressionManager';
import { CollectibleManager } from '../systems/CollectibleManager';
import { MissionManager } from '../systems/MissionManager';
import { DialogueManager } from '../systems/DialogueManager';
import { WorldManager } from '../systems/WorldManager';
import { DIALOGUE } from '../data/dialogue';
import { relicById } from '../data/relics';

type State = 'title' | 'intro' | 'playing' | 'paused' | 'discovery' | 'card' | 'victory' | 'complete';

const PHYSICS_STEP = 1 / 120;
const PULSE_RADIUS = 7;
const KENTE = [0xf6b40e, 0x18a558, 0xd7261e, 0x5ff7ff, 0xff5fa2];

/**
 * Orchestrates AFROBOT: rendering, the game-state machine and the gameplay systems
 * (abilities, progression, collectibles, missions, dialogue, saves, worlds).
 */
export class Game {
  // --- engine ---
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private composer: EffectComposer;
  private rig: CameraRig;
  private input: Input;
  private audio = new AudioManager();
  private sparks = new Particles(true);
  private dust = new Particles(false);
  private pulseFx = new PulseWave(PULSE_RADIUS);
  private env: Environment;
  private ambient = new Ambient();
  private spire = new SuncrownSpire(0, -305);
  private blob: THREE.Mesh;
  private beam: THREE.Mesh;

  // --- systems ---
  private bus = new EventBus<GameEvents>();
  private save = new SaveManager();
  private abilities = new AbilityManager();
  private progression: ProgressionManager;
  private collectibles: CollectibleManager;
  private missions: MissionManager;
  private dialogue: DialogueManager;
  private worlds = new WorldManager();

  // --- game objects / UI ---
  private level!: LagosLevel;
  private player = new PlayerController();
  private hud: HUD;
  private pauseMenu: PauseMenu;
  private completeScreen: LevelComplete;
  private title: TitleScreen;

  // --- session ---
  private state: State = 'title';
  private clock = new THREE.Clock();
  private simTime = 0;
  private levelTime = 0;
  private nodesActive = 0;
  private checkpointIndex = -1;
  private respawnPoint = new THREE.Vector3();
  private respawnYaw = Math.PI;
  private respawnT = -1;
  private hitStop = 0;
  private stateT = 0;
  private introLong = true;
  private gateHintCd = 0;
  private trailT = 0;
  private nearChimeCd = 0;
  private autosaveT = 0;
  private playT = 0;
  private levelDone = false;
  private discoveryId = '';
  private talkingTo: Interactable | null = null;
  private tmpV = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;

    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.input = new Input(this.renderer.domElement);

    // Post: MSAA target → bloom → colour grade → tone map/sRGB
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.rig.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.5, 0.92));
    this.composer.addPass(new ShaderPass(GradeShader));
    this.composer.addPass(new OutputPass());

    this.env = new Environment(this.scene, LagosLevel.center);
    this.scene.add(this.sparks.points, this.dust.points, this.pulseFx.group, this.ambient.group, this.spire.group, this.player.model.root);
    this.blob = this.makeBlob();
    this.scene.add(this.blob);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.8, 40, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff3ff).multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.beam.visible = false;
    this.scene.add(this.beam);

    // Systems
    this.player.abilities = this.abilities;
    this.progression = new ProgressionManager(this.abilities, this.save, this.bus);
    this.collectibles = new CollectibleManager(this.save, this.bus);
    this.missions = new MissionManager(this.save, this.bus);
    this.audio.setVolumes(this.save.settings.music, this.save.settings.sfx);

    // UI
    const ui = document.body;
    this.hud = new HUD(ui, this.player.maxHealth);
    this.hud.setVisible(false);
    this.dialogue = new DialogueManager(ui, () => this.audio.play('blip'));
    this.pauseMenu = new PauseMenu(ui, () => this.resume(), () => this.restartRun(), () => this.toMenu());
    this.completeScreen = new LevelComplete(ui, () => this.restartRun(), () => this.toMenu());
    this.title = new TitleScreen(ui, {
      onNewGame: () => this.newGame(),
      onContinue: () => this.continueGame(),
      onSettings: (s) => { this.save.settings = s; this.save.saveSettings(); this.audio.setVolumes(s.music, s.sfx); },
    }, this.save.settings);

    this.wireEvents();
    this.wirePlayerEvents();
    this.wireGlobalKeys();
    window.addEventListener('resize', () => this.onResize());

    this.loadLevel();
    this.refreshTitle();
    this.renderer.setAnimationLoop(() => this.frame());
    (window as unknown as { __afrobot: Game }).__afrobot = this;
  }

  private makeBlob() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(20,10,40,0.55)');
    grad.addColorStop(1, 'rgba(20,10,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  // =====================================================================
  // Lifecycle: title → new game / continue → play → complete → menu
  // =====================================================================

  private refreshTitle() {
    const has = this.save.hasSave();
    const lv = this.save.level('lagos-run');
    const best = lv.bestTime !== null ? ` · BEST ${fmt(lv.bestTime)}` : '';
    const total = this.level.cores.length;
    this.title.refresh(has, `LAGOS · LAGOS RUN — ${lv.cores.length}/${total} CORES · ${lv.relics.length}/3 RELICS${lv.completed ? ' · COMPLETE ✓' : ''}${best}`);
  }

  private newGame() {
    this.save.newGame();
    this.beginSession(true);
  }

  private continueGame() {
    this.beginSession(false);
  }

  /** Builds the level and applies saved progress. */
  private beginSession(fresh: boolean) {
    this.audio.unlock();
    this.audio.play('click');
    this.progression.restore();
    this.loadLevel();
    this.applySave();
    this.title.hide();
    this.hud.setVisible(true);
    this.syncHud();
    this.input.requestLock();
    const lv = this.save.level(this.level.id);
    this.introLong = fresh || (lv.checkpoint < 0 && lv.elapsed === 0 && !lv.completed && lv.cores.length === 0);
    this.startIntro();
  }

  /** Restart the run (keeps unlocked powers, collected cores/relics/secrets). */
  private restartRun() {
    const lv = this.save.level(this.level.id);
    lv.checkpoint = -1; lv.elapsed = 0; lv.nodes = [];
    this.save.save();
    this.pauseMenu.show(false);
    this.completeScreen.hide();
    this.beginSession(false);
  }

  private toMenu() {
    this.saveProgress();
    this.pauseMenu.show(false);
    this.completeScreen.hide();
    this.dialogue.close();
    this.hud.setVisible(false);
    this.hud.setLetterbox(false);
    this.input.exitLock();
    this.state = 'title';
    this.loadLevel();
    this.refreshTitle();
    this.title.show_();
    this.audio.setMusicDuck(false);
  }

  private loadLevel() {
    if (this.level) { this.scene.remove(this.level.group); this.level.dispose(); }
    this.level = this.worlds.build('lagos-run');
    this.scene.add(this.level.group);
    this.rig.blockers = this.level.blockers;
    for (const b of this.level.bytes) {
      b.onAlert = () => this.audio.play('alert');
      b.onChirp = () => this.audio.play('chirp');
      b.onWindup = () => this.audio.play('windup');
    }
    this.nodesActive = 0;
    this.checkpointIndex = -1;
    this.levelTime = 0;
    this.simTime = 0;
    this.respawnT = -1;
    this.hitStop = 0;
    this.levelDone = false;
    this.respawnPoint.copy(this.level.spawn);
    this.respawnYaw = this.level.spawnYaw;
    this.player.frozen = false;
    this.player.heal();
    this.player.model.root.scale.setScalar(1);
    this.player.model.setPose('play');
    this.player.spawn(this.level.spawn, this.level.spawnYaw);
    this.rig.snapTo(this.player.pos, 0);
    this.sparks.clear();
    this.dust.clear();
    this.beam.visible = false;
  }

  /** Apply the save file to the freshly built level. */
  private applySave() {
    const L = this.level;
    const lv = this.save.level(L.id);
    this.collectibles.begin(L.id, L.coreIds, L.relicIds, L.secretIds);
    for (const c of L.cores) if (this.collectibles.isCoreCollected(c.id)) c.setGhost();
    for (const r of L.relics) if (this.collectibles.hasRelic(r.relicId)) { r.taken = true; r.mesh.visible = false; }
    for (const p of L.pickups) if (this.abilities.isUnlocked(p.ability)) p.take();
    // Run state (Continue)
    this.levelTime = lv.elapsed;
    this.checkpointIndex = lv.checkpoint;
    L.checkpoints.forEach((cp, i) => { if (i <= lv.checkpoint) cp.activate(); });
    if (lv.checkpoint >= 0) {
      const cp = L.checkpoints[lv.checkpoint];
      this.respawnPoint.copy(cp.position).add(new THREE.Vector3(0, 0.25, -1.8));
      this.respawnYaw = Math.PI;
      this.player.spawn(this.respawnPoint, this.respawnYaw);
      this.rig.snapTo(this.player.pos, 0);
    }
    for (const i of lv.nodes) { const n = L.nodes[i]; if (n && !n.active) { n.activate(); this.nodesActive++; } }
    L.gate.setPower(this.nodesActive);

    this.missions.begin(L.id, [
      { id: 'reach-gate', title: 'REACH THE AFRO GATE', main: true, check: () => this.levelDone },
      { id: 'cores-10', title: 'Collect 10 Afro Cores', main: false, progress: () => `${Math.min(10, this.collectibles.coresCollected)}/10`, check: () => this.collectibles.coresCollected >= 10 },
      { id: 'find-relic', title: 'Find an Afro Relic', main: false, check: () => this.collectibles.relicsFound >= 1 },
      { id: 'find-secret', title: 'Discover a hidden area', main: false, check: () => this.collectibles.secretsFound >= 1 },
    ]);
    this.missions.evaluate();
  }

  private syncHud() {
    const L = this.level;
    this.hud.reset();
    this.hud.setCores(this.collectibles.coresCollected, this.collectibles.totalCores, false);
    this.hud.setRelics(this.collectibles.relicsFound, this.collectibles.totalRelics);
    this.hud.setHealth(this.player.health);
    this.hud.setTime(this.levelTime);
    this.hud.setCheckpoints(this.checkpointIndex + 1, L.checkpoints.length);
    this.hud.setAbilities(this.abilities.all, (id) => this.abilities.isUnlocked(id));
    this.updateMainHint();
    this.hud.setMissions(this.missions.list, this.missions.mainHint);
    this.hud.showHints(true);
    this.playT = 0;
  }

  private updateMainHint() {
    const total = this.level.nodes.length;
    this.missions.mainHint = this.nodesActive >= total ? 'The gate is open!'
      : this.nodesActive > 0 || this.checkpointIndex >= 1 ? `Power the gate nodes ${this.nodesActive}/${total}` : '';
  }

  /** Persist the run so CONTINUE resumes from here. */
  private saveProgress() {
    if (!this.level || this.state === 'title' || this.state === 'complete') return;
    const lv = this.save.level(this.level.id);
    lv.elapsed = this.levelTime;
    lv.checkpoint = this.checkpointIndex;
    this.save.save();
  }

  // =====================================================================
  // Intro cinematic (≈5s): Lagos vista → Afrobot beams down → looks around → go
  // =====================================================================

  private startIntro() {
    this.state = 'intro';
    this.stateT = 0;
    this.player.frozen = true;
    this.player.model.root.visible = false;
    this.hud.setLetterbox(true);
    const p = this.player.pos;
    if (this.introLong) {
      this.rig.setCinematic(new THREE.Vector3(p.x + 4, p.y + 26, p.z + 26), new THREE.Vector3(0, 40, -260), true);
    } else {
      this.rig.setCinematic(new THREE.Vector3(p.x + 3, p.y + 4, p.z + 7), new THREE.Vector3(p.x, p.y + 1.5, p.z), true);
    }
  }

  private updateIntro(dt: number) {
    this.stateT += dt;
    const T = this.stateT;
    const p = this.player.pos;
    const long = this.introLong;
    const dropAt = long ? 1.7 : 0.3;
    const landAt = dropAt + 0.75;
    const end = long ? 5.0 : 1.9;

    if (long && T < dropAt) {
      // Sweep down from the skyline toward the street
      this.rig.setCinematic(new THREE.Vector3(p.x + 5, p.y + 5, p.z + 11), new THREE.Vector3(p.x, p.y + 6, p.z - 20));
    }
    // Afrobot descends in a beam of light
    if (T >= dropAt - 0.4 && T < landAt + 0.5) {
      this.beam.visible = true;
      this.beam.position.set(p.x, p.y + 20, p.z);
      const m = this.beam.material as THREE.MeshBasicMaterial;
      m.opacity = T < landAt ? Math.min(0.32, (T - dropAt + 0.4) * 1.2) : Math.max(0, 0.32 - (T - landAt) * 0.9);
      if (T - dt < dropAt - 0.4) this.audio.play('beam');
      if (Math.random() < 0.6) this.sparks.emit({ x: p.x + (Math.random() - 0.5) * 2, y: p.y + Math.random() * 10, z: p.z + (Math.random() - 0.5) * 2 }, { count: 2, color: 0x9ff3ff, speed: 0.6, up: -3, life: 0.8, size: 0.4, gravity: 0 });
    } else this.beam.visible = false;

    const root = this.player.model.root;
    if (T >= dropAt && T < landAt) {
      root.visible = true;
      const k = (T - dropAt) / (landAt - dropAt);
      root.position.set(p.x, p.y + 14 * (1 - k * k), p.z);
      root.rotation.y = this.player.facing + (1 - k) * 6;
      this.player.model.update(dt, { speed: 0, grounded: false, vy: -10, dashing: false, dashReady: true, turnRate: 0 });
    } else if (T >= landAt) {
      if (T - dt < landAt) {
        // Touchdown!
        root.visible = true;
        this.player.model.land(22);
        this.rig.shake(0.45);
        this.hud.flash('#bff6ff', 0.4);
        this.audio.play('hardLand');
        this.dust.emit({ x: p.x, y: p.y + 0.1, z: p.z }, { count: 26, color: 0xfff1dc, speed: 6, up: 0.6, life: 0.6, size: 0.6, gravity: 0 });
        this.sparks.emit({ x: p.x, y: p.y + 0.4, z: p.z }, { count: 30, color: 0x5ff7ff, speed: 7, life: 0.6, size: 0.3, gravity: -2 });
        this.player.model.setPose('lookAround');
      }
      this.player.updateVisual(dt);
      // Camera in front of Afrobot while it looks around, then swings behind
      const fx = Math.sin(this.player.facing), fz = Math.cos(this.player.facing);
      if (long && T < end - 0.6) {
        this.rig.setCinematic(new THREE.Vector3(p.x + fx * 4.4 + 1.6, p.y + 1.7, p.z + fz * 4.4), new THREE.Vector3(p.x, p.y + 1.15, p.z));
      } else {
        this.rig.setCinematic(new THREE.Vector3(p.x - fx * 8, p.y + 3.4, p.z - fz * 8), new THREE.Vector3(p.x + fx * 4, p.y + 1.5, p.z + fz * 4));
      }
    } else if (T < dropAt) {
      root.visible = false;
    }
    this.rig.update(dt, null, { pos: p, vel: this.player.vel, grounded: true, dashing: false });

    const skip = this.input.jumpPressed || this.input.wasPressed('Enter') || this.input.wasPressed('Escape');
    if (T >= end || (skip && T > 0.3)) this.endIntro();
  }

  private endIntro() {
    this.beam.visible = false;
    this.player.model.root.visible = true;
    this.player.model.setPose('play');
    this.player.frozen = false;
    this.player.spawn(this.player.pos.clone(), this.player.facing);
    this.hud.setLetterbox(false);
    this.rig.endCinematic(this.player.pos, this.player.facing + Math.PI);
    this.state = 'playing';
    this.input.clear();
    this.clock.getDelta();
    if (this.introLong) {
      setTimeout(() => this.hud.banner('LAGOS RUN', 'REACH THE AFRO GATE', { life: 2.2 }), 150);
    }
  }

  // =====================================================================
  // Pause / input wiring
  // =====================================================================

  private pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.saveProgress();
    this.pauseMenu.show(true);
    this.hud.showHints(true);
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

  private wireGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === 'playing' && !this.dialogue.active) this.pause();
        else if (this.state === 'paused') this.resume();
      } else if (e.code === 'KeyM') {
        const on = this.audio.toggleMusic();
        if (this.state === 'playing') this.hud.toast(on ? 'MUSIC ON' : 'MUSIC OFF', 1);
      } else if (e.code === 'KeyN') {
        const muted = this.audio.toggleMute();
        if (this.state === 'playing') this.hud.toast(muted ? 'SOUND MUTED' : 'SOUND ON', 1);
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.state === 'playing' && !this.dialogue.active) this.pause();
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
      if (this.state === 'intro' && this.stateT > 0.3) this.endIntro();
    });
    window.addEventListener('beforeunload', () => this.saveProgress());
  }

  /** Cross-system reactions to gameplay events. */
  private wireEvents() {
    this.bus.on('coreCollected', () => this.missions.evaluate());
    this.bus.on('relicCollected', () => { this.hud.setRelics(this.collectibles.relicsFound, this.collectibles.totalRelics, true); this.missions.evaluate(); });
    this.bus.on('secretFound', () => this.missions.evaluate());
    this.bus.on('missionComplete', (m) => {
      if (!m.main) {
        this.audio.play('mission');
        this.hud.toast(`✓ OPTIONAL MISSION — ${m.title}`, 2.6, 'mission');
      }
      this.hud.setMissions(this.missions.list, this.missions.mainHint, true);
    });
    this.bus.on('abilityUnlocked', () => this.hud.setAbilities(this.abilities.all, (a) => this.abilities.isUnlocked(a)));
  }

  private wirePlayerEvents() {
    this.player.onEvent = (e, p, extra) => {
      if (this.state !== 'playing') return;
      switch (e) {
        case 'jump':
          this.audio.play('jump');
          this.dust.emit({ x: p.x, y: p.y + 0.1, z: p.z }, { count: 8, color: 0xfff1dc, speed: 2.5, life: 0.4, size: 0.45, gravity: 0 });
          break;
        case 'doubleJump':
          this.audio.play('doubleJump');
          this.sparks.emit({ x: p.x, y: p.y + 0.4, z: p.z }, { count: 22, color: 0x5ff7ff, speed: 4, life: 0.5, size: 0.3, gravity: -2 });
          this.rig.shake(0.05);
          break;
        case 'dash':
          this.audio.play('dash');
          this.sparks.emit({ x: p.x, y: p.y + 0.8, z: p.z }, { count: 16, color: 0x3dffb5, speed: 5, life: 0.35, size: 0.3, gravity: 0 });
          this.rig.shake(0.08);
          break;
        case 'land':
          if ((extra ?? 0) > 6) {
            this.audio.play('land');
            this.dust.emit({ x: p.x, y: p.y + 0.1, z: p.z }, { count: 10, color: 0xfff1dc, speed: 3, life: 0.4, size: 0.5, gravity: 0, up: 0.4 });
          }
          break;
        case 'hardLand':
          this.audio.play('hardLand');
          this.rig.shake(0.3);
          this.dust.emit({ x: p.x, y: p.y + 0.1, z: p.z }, { count: 20, color: 0xfff1dc, speed: 5.5, life: 0.5, size: 0.6, gravity: 0, up: 0.4 });
          break;
        case 'step':
          this.audio.play('step');
          this.dust.emit({ x: p.x, y: p.y + 0.05, z: p.z }, { count: 2, color: 0xf5e6cc, speed: 0.8, life: 0.35, size: 0.35, gravity: 0, up: 0.3 });
          break;
        case 'skid':
          this.audio.play('skid');
          this.dust.emit({ x: p.x, y: p.y + 0.1, z: p.z }, { count: 8, color: 0xfff1dc, speed: 2.5, life: 0.4, size: 0.45, gravity: 0 });
          break;
        case 'hurt':
          this.audio.play('hurt');
          this.hud.hurtFlash();
          this.rig.shake(0.35);
          this.hitStop = 0.06;
          this.hud.setHealth(Math.max(0, this.player.health));
          this.sparks.emit({ x: p.x, y: p.y + 0.8, z: p.z }, { count: 18, color: 0xff3d6e, speed: 5, life: 0.5, size: 0.3 });
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

  // =====================================================================
  // Main loop
  // =====================================================================

  private frame() {
    const rawDt = Math.min(this.clock.getDelta(), 1 / 20);
    let dt = rawDt;
    if (this.hitStop > 0) { this.hitStop -= rawDt; dt = 0; }

    switch (this.state) {
      case 'playing': if (dt > 0) this.updatePlaying(dt); else this.rig.update(rawDt, null, this.follow()); break;
      case 'intro': this.updateIntro(rawDt); break;
      case 'discovery': this.updateDiscovery(rawDt); break;
      case 'victory': case 'complete': this.updateVictory(rawDt); break;
      case 'card': this.rig.update(rawDt, null, this.follow()); break;
      case 'title': this.updateTitle(rawDt); break;
    }

    if (this.state !== 'paused') {
      this.sparks.update(rawDt);
      this.dust.update(rawDt);
      this.pulseFx.update(rawDt);
      this.level.cull(this.rig.camera.position);
      this.level.updateVisuals(rawDt, this.player.center);
      this.env.update(rawDt, this.rig.camera, this.player.pos);
      SwayTime.value += rawDt;
      this.ambient.update(rawDt, this.player.pos, this.rig.camera);
      this.spire.update(rawDt);
      this.level.updateDecor(rawDt, SwayTime.value, this.player.pos);
      this.dialogue.update(rawDt);
      this.hud.update(rawDt);
      this.abilities.setAvailable('doubleJump', this.player.doubleJumpAvailable);
      this.hud.updateAbilities((id) => this.abilities.readiness(id));
      this.gateAmbience();
    }
    this.composer.render();
    this.input.endFrame();
  }

  private follow() {
    const p = this.player;
    return { pos: p.pos, vel: p.vel, grounded: p.grounded, dashing: p.dashing };
  }

  private updateTitle(dt: number) {
    this.simTime += dt;
    this.level.update(dt, this.simTime);
    for (const b of this.level.bytes) b.update(dt, this.player.pos, false);
    this.player.updateVisual(dt);
    const a = this.simTime * 0.06;
    this.rig.setCinematic(new THREE.Vector3(Math.sin(a) * 26, 16 + Math.sin(a * 0.7) * 3, 6 + Math.cos(a) * 22), new THREE.Vector3(0, 14, -140));
    this.rig.update(dt, null, this.follow());
  }

  private updatePlaying(dt: number) {
    const L = this.level;
    const p = this.player;
    if (this.respawnT < 0) this.levelTime += dt;
    this.hud.setTime(this.levelTime);
    this.gateHintCd = Math.max(0, this.gateHintCd - dt);
    this.nearChimeCd = Math.max(0, this.nearChimeCd - dt);
    this.playT += dt;
    if (this.playT > 25 && this.playT - dt <= 25) this.hud.showHints(false);
    this.autosaveT += dt;
    if (this.autosaveT > 10) { this.autosaveT = 0; this.saveProgress(); }

    // Respawn fade sequence
    if (this.respawnT >= 0) {
      this.respawnT += dt;
      if (this.respawnT > 0.3 && p.frozen && !this.dialogue.active) {
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
    this.abilities.update(dt);

    const active = !p.frozen;
    for (const b of L.bytes) b.update(dt, p.pos, active);

    if (active) {
      this.checkHazards();
      this.checkEnemies();
      this.checkCollectibles();
      this.checkPickups();
      this.checkSecrets();
      this.checkCheckpoints();
      this.checkBreakables();
      this.checkGate();
      if (p.pos.y < L.killY) {
        this.audio.play('splash');
        this.sparks.emit({ x: p.pos.x, y: WATER_Y + 0.2, z: p.pos.z }, { count: 40, color: 0xbff6ff, speed: 6, up: 6, life: 0.8, size: 0.45, gravity: -18 });
        this.beginRespawn('SPLASH!');
      }
    }
    if (this.state === 'playing') this.handleInteraction();

    if (p.dashing) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.015;
        this.sparks.emit({ x: p.pos.x, y: p.pos.y + 0.8, z: p.pos.z }, { count: 2, color: 0x3dffb5, speed: 0.6, life: 0.35, size: 0.5, gravity: 0, spread: 0.4 });
      }
    }

    p.updateVisual(dt);
    this.updateBlob();
    this.rig.update(dt, this.dialogue.active ? null : this.input, this.follow());
  }

  private updateBlob() {
    const p = this.player.pos;
    let gy = groundHeightBelow(this.level.solids, p.x, p.y + 0.1, p.z);
    if (gy === -Infinity) gy = WATER_Y;
    const hgt = p.y - gy;
    this.blob.position.set(p.x, gy + 0.03, p.z);
    this.blob.scale.setScalar(THREE.MathUtils.clamp(1 - hgt * 0.06, 0.4, 1));
    (this.blob.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(1 - hgt * 0.05, 0.25, 1);
    this.blob.visible = this.player.model.root.visible && this.state === 'playing';
  }

  // =====================================================================
  // Interaction: E talks/reads/activates; otherwise E (or Q) fires PULSE
  // =====================================================================

  private nearestInteractable(): Interactable | PowerNode | null {
    const p = this.player.pos;
    let best: Interactable | PowerNode | null = null, bestD = Infinity;
    for (const it of this.level.interactables) {
      if (!it.canInteract()) continue;
      const d = Math.hypot(p.x - it.position.x, p.z - it.position.z);
      if (d < it.interactRadius && Math.abs(p.y - it.position.y) < 2.5 && d < bestD) { best = it; bestD = d; }
    }
    for (const n of this.level.nodes) {
      if (!n.inRange(p)) continue;
      const d = Math.hypot(p.x - n.position.x, p.z - n.position.z);
      if (d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  private handleInteraction() {
    const input = this.input;
    if (this.dialogue.active) {
      this.hud.prompt(null);
      if (input.wasPressed('KeyE') || input.jumpPressed || input.wasPressed('Enter')) this.dialogue.advance();
      return;
    }
    if (this.player.frozen) { this.hud.prompt(null); return; }
    const near = this.nearestInteractable();
    const label = near instanceof PowerNode ? 'ACTIVATE' : near?.prompt;
    this.hud.prompt(near ? `<span class="key">E</span> ${label}` : null);
    if (input.interactPressed) {
      if (near instanceof PowerNode) this.activateNode(near);
      else if (near) this.interact(near);
      else this.tryPulse();
    } else if (input.wasPressed('KeyQ')) {
      this.tryPulse();
    }
  }

  private interact(it: Interactable) {
    const key = it.dialogueKey;
    if (!key || !DIALOGUE[key]) return;
    this.audio.play('click');
    this.player.frozen = true;
    this.player.vel.set(0, this.player.vel.y, 0);
    this.talkingTo = it;
    if (it instanceof RobotNpc) it.talking = true;
    this.audio.setMusicDuck(true);
    this.dialogue.start(DIALOGUE[key], () => {
      this.player.frozen = false;
      if (this.talkingTo instanceof RobotNpc) this.talkingTo.talking = false;
      this.talkingTo = null;
      this.audio.setMusicDuck(false);
      this.input.clear();
    });
  }

  private tryPulse() {
    if (!this.abilities.isUnlocked('pulse')) return;
    if (!this.abilities.tryActivate('pulse')) return;
    const p = this.player;
    const c = p.center;
    this.pulseFx.fire(c, p.pos.y);
    this.audio.play('pulse');
    this.rig.shake(0.2);
    this.hud.flash('#5ff7ff', 0.12);
    p.model.land(8);
    this.sparks.emit(c, { count: 30, color: 0x5ff7ff, speed: 10, life: 0.5, size: 0.3, gravity: 0 });
    this.bus.emit('pulse', { x: c.x, y: c.y, z: c.z });

    const L = this.level;
    for (const r of L.pulseReactives) {
      if (!r.onPulse(c, PULSE_RADIUS)) continue;
      const breakable = L.breakables.find((b) => b === (r as unknown));
      if (breakable) { this.onBreak(breakable.center); continue; }
      const pos = (r as unknown as { position: THREE.Vector3 }).position;
      this.audio.play('door');
      this.sparks.emit({ x: pos.x, y: pos.y + 2, z: pos.z }, { count: 30, color: 0x5ff7ff, speed: 5, up: 2, life: 0.9, size: 0.35 });
      const isDoor = L.doors.some((d) => d === (r as unknown));
      this.hud.toast(isDoor ? 'ENERGY DOOR OPENED' : 'ANCIENT MECHANISM AWAKENED', 1.8);
    }
    for (const n of L.nodes) if (!n.active && n.position.distanceTo(p.pos) < PULSE_RADIUS + 1) this.activateNode(n);
    for (const b of L.bytes) {
      if (b.alive && b.pos.distanceTo(p.pos) < PULSE_RADIUS) { b.stun(3.2); this.audio.play('stun'); }
    }
    let revealed = 0;
    for (const core of L.cores) {
      if (core.hidden && core.position.distanceTo(c) < 14 && core.reveal()) {
        revealed++;
        this.sparks.emit(core.position, { count: 30, color: 0xffc93c, speed: 5, life: 0.8, size: 0.35, gravity: 0 });
      }
    }
    if (revealed) { this.hud.toast('HIDDEN AFRO CORE REVEALED!', 1.8); this.audio.play('secret'); }
  }

  private activateNode(n: PowerNode) {
    if (n.active) return;
    n.activate();
    this.nodesActive++;
    const lv = this.save.level(this.level.id);
    const idx = this.level.nodes.indexOf(n);
    if (!lv.nodes.includes(idx)) lv.nodes.push(idx);
    this.saveProgress();
    this.level.gate.setPower(this.nodesActive);
    this.audio.play('node');
    this.rig.shake(0.15);
    this.sparks.emit({ x: n.position.x, y: n.position.y + 1.5, z: n.position.z }, { count: 40, color: 0x5ff7ff, speed: 6, up: 4, life: 1, size: 0.35 });
    const total = this.level.nodes.length;
    this.updateMainHint();
    this.hud.setMissions(this.missions.list, this.missions.mainHint, true);
    if (this.nodesActive >= total) {
      this.hud.banner('THE AFRO GATE IS OPEN', 'FIND YOUR WAY THROUGH', { life: 2.4 });
      setTimeout(() => this.audio.play('portal'), 350);
      setTimeout(() => { if (this.state === 'playing') this.hud.toast('…SIGNAL A-01… WELCOME BACK…', 3, 'signal'); }, 3200);
    } else {
      this.hud.toast(`POWER NODE ${this.nodesActive} / ${total}`, 1.8);
    }
  }

  // =====================================================================
  // Gameplay checks
  // =====================================================================

  private checkHazards() {
    const p = this.player;
    for (const hz of this.level.hazards) {
      const dir = hz.hit(p.pos, PLAYER_RADIUS, PLAYER_HEIGHT);
      if (dir && p.invuln <= 0) { this.audio.play('zap'); p.damage(dir); break; }
    }
  }

  private checkEnemies() {
    const p = this.player;
    for (const b of this.level.bytes) {
      if (!b.alive) continue;
      const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z;
      if (Math.hypot(dx, dz) > b.radius + PLAYER_RADIUS + 0.1) continue;
      if (p.pos.y > b.pos.y + 1.1 || p.pos.y + PLAYER_HEIGHT < b.pos.y) continue;
      const stomp = p.vel.y < -0.5 && p.pos.y > b.pos.y + 0.4;
      if (stomp || p.dashing || b.isStunned) {
        b.defeat();
        this.audio.play('enemyDefeat');
        this.hitStop = 0.07;
        this.rig.shake(0.2);
        const at = { x: b.pos.x, y: b.pos.y + 0.5, z: b.pos.z };
        this.sparks.emit(at, { count: 26, color: 0xff7a2f, speed: 7, life: 0.7, size: 0.35 });
        this.sparks.emit(at, { count: 12, color: 0xffe14a, speed: 4, life: 0.6, size: 0.3 });
        this.dust.emit(at, { count: 8, color: 0x8a8aa0, speed: 5, up: 3, life: 0.7, size: 0.3, gravity: -14 });
        if (stomp) p.bounce();
        this.hud.toast('BYTE BUSTED!', 0.9);
      } else if (b.dangerous && p.invuln <= 0) {
        p.damage(new THREE.Vector3(dx, 0, dz));
      }
    }
  }

  private checkCollectibles() {
    const c = this.player.center;
    for (const core of this.level.cores) {
      if (core.justNear && this.nearChimeCd <= 0) { this.audio.play('coreNear'); this.nearChimeCd = 0.4; }
      if (core.sparkle) this.sparks.emit(core.mesh.position, { count: 1, color: Math.random() < 0.5 ? 0xffc93c : 0x3dffb5, speed: 1.2, up: 0.8, life: 0.7, size: 0.25, gravity: 0, spread: 0.8 });
      if (!core.collectable) continue;
      if (core.mesh.position.distanceTo(c) > 0.95) continue;
      const pos = core.mesh.position.clone();
      core.collect();
      if (core.ghost) {
        this.audio.play('ghost');
        this.sparks.emit(pos, { count: 8, color: 0x9fd8ff, speed: 2, life: 0.4, size: 0.25 });
        continue;
      }
      this.collectibles.collectCore(core.id);
      this.audio.play('collect');
      this.player.model.happy();
      this.sparks.emit(pos, { count: 24, color: 0xffc93c, speed: 6, life: 0.6, size: 0.35, gravity: -4 });
      this.sparks.emit(pos, { count: 12, color: 0x3dffb5, speed: 3, up: 2, life: 0.8, size: 0.3, gravity: 0 });
      const scr = this.toScreen(pos);
      this.hud.flyCore(scr.x, scr.y);
      const n = this.collectibles.coresCollected, total = this.collectibles.totalCores;
      setTimeout(() => this.hud.setCores(n, total), 520);
      if (n === total) setTimeout(() => this.hud.banner('ALL AFRO CORES!', `${total} / ${total}`, { life: 2.4 }), 600);
      this.hud.setMissions(this.missions.list, this.missions.mainHint);
    }
    for (const r of this.level.relics) {
      if (!r.touching(c)) continue;
      r.take();
      const def = this.collectibles.collectRelic(r.relicId) ?? relicById(r.relicId);
      if (!def) continue;
      this.audio.play('relic');
      this.audio.setMusicDuck(true);
      this.sparks.emit(r.mesh.position, { count: 40, color: 0xc77dff, speed: 6, life: 1, size: 0.4, gravity: 0 });
      this.player.model.happy(2);
      this.state = 'card';
      this.input.exitLock();
      void this.hud.relicCard(def.name, def.description, def.icon).then(() => {
        this.audio.setMusicDuck(false);
        this.state = 'playing';
        this.input.clear();
        this.input.requestLock();
        this.clock.getDelta();
      });
      return;
    }
  }

  private checkPickups() {
    for (const pk of this.level.pickups) {
      if (!pk.touching(this.player.pos)) continue;
      pk.take();
      this.sparks.emit(pk.corePosition, { count: 60, color: pk.ability === 'dash' ? 0xffa62e : 0x5ff7ff, speed: 8, life: 1, size: 0.4, gravity: 0 });
      if (this.progression.discover(pk.ability)) this.startDiscovery(pk.ability);
    }
  }

  private checkSecrets() {
    for (const s of this.level.secrets) {
      if (!s.contains(this.player.center) || this.collectibles.hasSecret(s.id)) continue;
      this.collectibles.findSecret(s.id);
      this.audio.play('secret');
      this.hud.banner('SECRET AREA', `${s.name} · ${this.collectibles.secretsFound} / ${this.collectibles.totalSecrets}`, { kind: 'secret', life: 2.4 });
      this.sparks.emit(this.player.center, { count: 40, color: 0xc77dff, speed: 6, up: 2, life: 1, size: 0.35 });
    }
  }

  private checkCheckpoints() {
    const p = this.player;
    this.level.checkpoints.forEach((cp, i) => {
      if (cp.active || !cp.contains(p.pos)) return;
      cp.activate();
      this.checkpointIndex = Math.max(this.checkpointIndex, i);
      this.respawnPoint.copy(cp.position).add(new THREE.Vector3(0, 0.25, -1.8));
      this.respawnYaw = Math.PI;
      p.heal();
      this.hud.setHealth(p.health);
      this.hud.setCheckpoints(this.checkpointIndex + 1, this.level.checkpoints.length, true);
      this.audio.play('checkpoint');
      this.hud.banner(`CHECKPOINT ${i + 1}`, 'PROGRESS SAVED', { kind: 'checkpoint', life: 1.8 });
      for (let k = 0; k < 4; k++) this.sparks.emit({ x: cp.position.x, y: cp.position.y + 0.5 + k, z: cp.position.z }, { count: 12, color: 0x3dffb5, speed: 3, up: 4, life: 1, size: 0.35, gravity: 0 });
      this.updateMainHint();
      this.hud.setMissions(this.missions.list, this.missions.mainHint);
      this.saveProgress();
    });
  }

  private checkBreakables() {
    if (!this.player.dashing) return;
    for (const b of this.level.breakables) {
      if (b.broken || b.breakBy === 'pulse' || !b.near(this.player.pos, 0.65)) continue;
      b.shatter(this.player.pos);
      this.onBreak(b.center);
    }
  }

  private onBreak(at: THREE.Vector3) {
    this.audio.play('break');
    this.rig.shake(0.3);
    this.hitStop = 0.05;
    this.dust.emit(at, { count: 24, color: 0xc8894a, speed: 6, up: 3, life: 0.8, size: 0.5, gravity: -12 });
    this.sparks.emit(at, { count: 16, color: 0xffb02e, speed: 5, life: 0.5, size: 0.3 });
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
    this.startVictory();
  }

  private gateAmbience() {
    const g = this.level.gate;
    if (!g.unlocked || Math.random() > 0.35) return;
    const c = g.portalCenter;
    const a = Math.random() * Math.PI * 2, r = 3.6;
    this.sparks.emit({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, z: c.z + 0.3 }, { count: 1, color: Math.random() < 0.5 ? 0x5ff7ff : 0xffc21a, speed: 0.5, life: 1, size: 0.35, gravity: 0 });
  }

  private toScreen(p: THREE.Vector3) {
    const v = this.tmpV.copy(p).project(this.rig.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  // =====================================================================
  // Power discovery moment
  // =====================================================================

  private startDiscovery(id: string) {
    this.state = 'discovery';
    this.stateT = 0;
    this.discoveryId = id;
    this.player.frozen = true;
    this.player.vel.set(0, 0, 0);
    this.player.model.setPose('victory');
    this.audio.play('unlock');
    this.audio.setMusicDuck(true);
    this.hud.flash('#ffffff', 0.5);
    this.hud.setLetterbox(true, false);
    const def = this.abilities.def(id)!;
    const names: Record<string, [string, string]> = {
      dash: ['KINETIC CORE ACQUIRED', 'DASH UNLOCKED — PRESS SHIFT'],
      pulse: ['PULSE CORE ACQUIRED', 'PULSE UNLOCKED — PRESS E or Q'],
    };
    const [t, sub] = names[id] ?? [`${def.name} UNLOCKED`, def.key];
    setTimeout(() => this.hud.banner(t, sub, { icon: def.icon, kind: 'power', life: 2.6 }), 250);
  }

  private updateDiscovery(dt: number) {
    this.stateT += dt;
    const p = this.player;
    p.updateVisual(dt);
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
    const a = this.stateT * 0.4;
    this.rig.setCinematic(
      new THREE.Vector3(p.pos.x + fx * 3.6 + Math.cos(a) * 1.5, p.pos.y + 1.6, p.pos.z + fz * 3.6 + Math.sin(a) * 1.5),
      new THREE.Vector3(p.pos.x, p.pos.y + 1.0, p.pos.z),
    );
    this.rig.update(dt, null, this.follow());
    if (Math.random() < 0.5) {
      const color = this.discoveryId === 'dash' ? 0xffa62e : 0x5ff7ff;
      this.sparks.emit({ x: p.pos.x + (Math.random() - 0.5) * 1.6, y: p.pos.y, z: p.pos.z + (Math.random() - 0.5) * 1.6 }, { count: 2, color, speed: 0.5, up: 3, life: 1, size: 0.35, gravity: 0 });
    }
    if (this.stateT > 2.9) {
      p.model.setPose('play');
      p.frozen = false;
      this.hud.setLetterbox(false);
      this.rig.endCinematic(p.pos, p.facing + Math.PI);
      this.audio.setMusicDuck(false);
      this.state = 'playing';
      this.input.clear();
      this.clock.getDelta();
    }
  }

  // =====================================================================
  // Victory → LEVEL COMPLETE
  // =====================================================================

  private startVictory() {
    this.state = 'victory';
    this.stateT = 0;
    this.hitStop = 0.18;
    this.levelDone = true;
    const p = this.player;
    p.frozen = true;
    p.vel.set(0, 0, 0);
    p.facing = 0; // turn to face the camera / the city
    p.model.setPose('victory');
    this.hud.prompt(null);
    this.hud.flash('#ffffff', 0.6);
    this.hud.setLetterbox(true, false);
    this.audio.play('portal');
    this.audio.setMusicDuck(true);
    this.rig.shake(0.3);
    this.missions.evaluate();
  }

  private updateVictory(dt: number) {
    this.stateT += dt;
    const T = this.stateT;
    const p = this.player;
    const root = p.model.root;
    if (T < 2.4) {
      p.updateVisual(dt);
      // Three-quarter view: Afrobot cheering with the gate glowing beside it
      const a = 0.85 + Math.sin(T * 0.6) * 0.25;
      this.rig.setCinematic(new THREE.Vector3(p.pos.x + Math.sin(a) * 5, p.pos.y + 2.0, p.pos.z + Math.cos(a) * 5), new THREE.Vector3(p.pos.x - 0.6, p.pos.y + 1.4, p.pos.z));
      for (const t0 of [0.15, 0.7, 1.3]) {
        if (T >= t0 && T - dt < t0) {
          if (t0 === 0.15) this.audio.play('complete');
          for (const c of KENTE) this.sparks.emit({ x: p.pos.x, y: p.pos.y + 2.2, z: p.pos.z }, { count: 10, color: c, speed: 7, up: 5, life: 1.3, size: 0.35, gravity: -9 });
        }
      }
    } else {
      // Into the portal
      const target = this.level.gate.portalCenter;
      const k = Math.min(1, (T - 2.4) / 1.0);
      root.position.lerp(target, Math.min(1, dt * 3.5));
      root.rotation.y += dt * (4 + k * 18);
      root.scale.setScalar(Math.max(0.01, 1 - k));
      this.rig.setCinematic(new THREE.Vector3(target.x + 3, target.y + 1, target.z + 12), target);
      if (Math.random() < 0.6) this.sparks.emit(target, { count: 3, color: Math.random() < 0.5 ? 0x5ff7ff : 0xffc21a, speed: 5, life: 0.8, size: 0.4, gravity: 0 });
      if (T >= 3.5 && T - dt < 3.5) this.finishLevel();
    }
    this.simTime += dt;
    this.level.update(dt, this.simTime);
    this.rig.update(dt, null, this.follow());
  }

  private finishLevel() {
    this.state = 'complete';
    const lv = this.save.level(this.level.id);
    const time = this.levelTime;
    const newRecord = lv.bestTime === null || time < lv.bestTime;
    if (newRecord) lv.bestTime = time;
    lv.completed = true;
    lv.checkpoint = -1; lv.elapsed = 0; lv.nodes = [];
    this.save.save();
    this.bus.emit('levelComplete', { time });
    this.hud.setVisible(false);
    this.hud.setLetterbox(false);
    this.input.exitLock();
    this.completeScreen.show({
      cores: this.collectibles.coresCollected, totalCores: this.collectibles.totalCores,
      relics: this.collectibles.relicsFound, totalRelics: this.collectibles.totalRelics,
      secrets: this.collectibles.secretsFound, totalSecrets: this.collectibles.totalSecrets,
      time, best: lv.bestTime, newRecord,
    });
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

function fmt(s: number) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
