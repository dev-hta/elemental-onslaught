// @ts-nocheck
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import GUI from 'lil-gui';

import { settings, ELEMENTS, ELEMENT_META, POWERUPS } from './settings';
import { Environment } from './Environment';
import { Character } from './Character';
import { LightPool } from './LightPool';
import { InputManager } from './InputManager';
import { AimController } from './AimController';
import { AbilityManager } from './abilities/AbilityManager';
import { DamageNumberSystem } from './combat/DamageNumberSystem';
import { EnemyManager } from './monsters/EnemyManager';
import { soundSynth } from './audio/SoundSynth';

/** Ties the renderer, camera, character movement, enemy waves, combat & abilities together. */
export class Engine {
  constructor(container) {
    this.container = container;
    this.paused = false;
    this.help = false;
    this.editorOn = false;
    this.soundMuted = false;
    this.clock = new THREE.Clock();
    this.time = 0;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = settings.post.exposure;
    container.appendChild(this.renderer.domElement);
    this.dom = this.renderer.domElement;
    this.dom.style.display = 'block';
    this.dom.style.touchAction = 'none';

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 400);
    this.camera.position.set(0, 7.5, 14.5);

    this.controls = new OrbitControls(this.camera, this.dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 1.1, 0);
    this.controls.minDistance = 5;
    this.controls.maxDistance = 45;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };

    this.ctx = { scene: this.scene, lights: null, time: 0 };

    this.lights = new LightPool(this.scene, 6);
    this.ctx.lights = this.lights;
    this.environment = new Environment(this.scene);
    this.character = new Character(this.scene);
    this.aim = new AimController(this.camera);
    this.scene.add(this.aim.object3D);
    this.abilities = new AbilityManager(this.ctx);
    this.input = new InputManager(this.dom);

    // Combat & Monster Wave Systems
    this.damageNumbers = new DamageNumberSystem(this.scene);
    this.enemyManager = new EnemyManager(this.scene, this.ctx, this.damageNumbers);

    // Game Progression State
    this.gameState = 'playing'; // 'playing' | 'wave_clear' | 'game_over' | 'paused'
    this.score = 0;
    this.highScore = 0;
    try {
      this.highScore = parseInt(localStorage.getItem('elemental_sandbox_highscore') || '0', 10);
    } catch (e) {}

    this.combo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1.0;
    this.killFeed = [];
    this.waveOptions = [];

    this._setupCombatCallbacks();
    this._buildPost(w, h);
    this._bindInput();
    this._buildEditor();

    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(container);

    this._lastStats = 0;
    this.fps = 60;
    this.onStats = null;
    this.onState = null;

    // Start Wave 1
    this.enemyManager.startWave(1);
  }

  _setupCombatCallbacks() {
    this.enemyManager.onKill = (enemy, element) => {
      this.combo++;
      this.comboTimer = 3.8;
      this.comboMultiplier = 1.0 + Math.floor(this.combo / 2) * 0.25;

      const earned = Math.round(enemy.scoreValue * this.comboMultiplier);
      this.score += earned;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        try {
          localStorage.setItem('elemental_sandbox_highscore', `${this.highScore}`);
        } catch (e) {}
      }

      // Add to kill feed
      const meta = ELEMENT_META[element] || { glyph: '✦', label: element };
      const entry = {
        id: Math.random().toString(36).substring(2, 9),
        name: enemy.name,
        glyph: meta.glyph,
        element,
        score: earned,
        combo: this.combo
      };
      this.killFeed.unshift(entry);
      if (this.killFeed.length > 5) this.killFeed.pop();

      this._emitState();
    };

    this.enemyManager.onWaveClear = (wave) => {
      this.gameState = 'wave_clear';
      // Pick 3 random power-up options
      const shuffled = [...POWERUPS].sort(() => 0.5 - Math.random());
      this.waveOptions = shuffled.slice(0, 3);
      this._emitState();
    };

    this.enemyManager.onPlayerDamaged = (dmg) => {
      this.character.takeDamage(dmg);
      this.damageNumbers.spawn(this.character.position, `-${dmg}`, 'player');

      // Camera hit shake
      const s = 0.4 * settings.global.shake;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;

      if (this.character.isDead) {
        this.gameState = 'game_over';
      }
      this._emitState();
    };
  }

  _buildPost(w, h) {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), settings.post.bloomStrength, settings.post.bloomRadius, settings.post.bloomThreshold);
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uExposure: { value: settings.post.exposure },
        uVignette: { value: settings.post.vignette },
        uAberration: { value: settings.post.aberration },
        uGrain: { value: settings.post.grain },
        uTime: { value: 0 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uExposure,uVignette,uAberration,uGrain,uTime; varying vec2 vUv;
        void main(){
          vec2 uv=vUv; vec2 dir=uv-0.5;
          float r=texture2D(tDiffuse, uv+dir*uAberration*0.012).r;
          float g=texture2D(tDiffuse, uv).g;
          float b=texture2D(tDiffuse, uv-dir*uAberration*0.012).b;
          vec3 col=vec3(r,g,b)*uExposure;
          float vig=smoothstep(1.05,0.3,length(dir)*1.35);
          col*=mix(1.0,vig,uVignette);
          float gr=fract(sin(dot(uv,vec2(12.9898,78.233))+uTime)*43758.5453);
          col+=(gr-0.5)*uGrain;
          gl_FragColor=vec4(col,1.0);
        }
      `
    });
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  _bindInput() {
    this.input.on('pointer:move', (p) => this.aim.point(p));
    this.input.on('pointer:confirm', () => this.doConfirm());
    this.input.on('action', (name, slot) => this._onAction(name, slot));
    this.aim.on('cast', (origin, dir, dist) => {
      const el = this.aim.element;
      if (this.abilities.cast(el, origin, dir, dist)) {
        this.character.triggerCast(el);
        soundSynth.playCast(el);
      }
    });
  }

  _onAction(name, slot) {
    switch (name) {
      case 'ability':
        this.armSlot(slot);
        break;
      case 'dash':
        this.character.dash();
        this._emitState();
        break;
      case 'cancel':
        this.doCancel();
        break;
      case 'clear':
        this.clearAll();
        break;
      case 'togglePause':
        this.togglePause();
        break;
      case 'toggleEditor':
        this.toggleEditor();
        break;
      case 'toggleHelp':
        this.toggleHelp();
        break;
      default:
        break;
    }
  }

  _findNearestEnemy() {
    let nearest = null;
    let minD = 999;
    const pPos = this.character.position;
    for (const e of this.enemyManager.enemies) {
      if (!e.isAlive) continue;
      const d = pPos.distanceTo(e.position);
      if (d < minD) {
        minD = d;
        nearest = e;
      }
    }
    return nearest;
  }

  /* ---- public UI hooks ---- */
  armSlot(slot) {
    if (this.gameState !== 'playing') return;
    const el = ELEMENTS[slot];
    if (!el) return;
    if (this.aim.isArmed && this.aim.element === el) {
      this.doConfirm();
      return;
    }
    this.aim.setElement(el);
    this.aim.arm();

    // Direct aim to nearest enemy if pointer is not actively positioned
    const nearest = this._findNearestEnemy();
    if (nearest && (!this.aim._hasPointer || Math.abs(this.aim._pointer.x) < 0.05 && Math.abs(this.aim._pointer.y) < 0.05)) {
      const dir = nearest.position.clone().sub(this.character.position);
      dir.y = 0;
      if (dir.lengthSq() > 0.1) {
        const d = dir.length();
        this.aim.direction.copy(dir).normalize();
        this.aim.yaw = Math.atan2(this.aim.direction.x, this.aim.direction.z);
        this.aim.distance = Math.min(d, this.aim.config.range);
      }
    }

    this._emitState();
  }

  doConfirm() {
    this.aim.confirm();
    this._emitState();
  }

  doCancel() {
    this.aim.cancel();
    this._emitState();
  }

  doDash() {
    this.character.dash();
    this._emitState();
  }

  setVirtualMove(x, y) {
    this.input.setVirtualMove(x, y);
  }

  togglePause() {
    this.paused = !this.paused;
    this._emitState();
  }

  toggleSound() {
    this.soundMuted = !this.soundMuted;
    soundSynth.setMuted(this.soundMuted);
    this._emitState();
  }

  clearAll() {
    this.abilities.clear();
    this.lights.releaseAll();
    this.damageNumbers.clear();
    this._emitState();
  }

  toggleHelp() {
    this.help = !this.help;
    this._emitState();
  }

  toggleEditor() {
    this.editorOn = !this.editorOn;
    if (this.gui) this.gui.domElement.style.display = this.editorOn ? '' : 'none';
    this._emitState();
  }

  selectPowerup(id) {
    const p = POWERUPS.find((item) => item.id === id);
    if (p) {
      p.apply(this.character);
    }
    this.gameState = 'playing';
    this.enemyManager.startWave(this.enemyManager.currentWave + 1);
    this._emitState();
  }

  restartGame() {
    this.character.reset(0, 0);
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1;
    this.killFeed = [];
    this.enemyManager.clear();
    this.abilities.clear();
    this.damageNumbers.clear();
    this.gameState = 'playing';
    this.enemyManager.startWave(1);
    this._emitState();
  }

  _buildEditor() {
    try {
      this.gui = new GUI({ title: 'VFX Editor (G)' });
      this.gui.domElement.style.display = 'none';
      const g = settings.global;
      const fg = this.gui.addFolder('Global');
      fg.add(g, 'speed', 0.1, 3, 0.01);
      fg.add(g, 'glow', 0, 3, 0.01);
      fg.add(g, 'particles', 0, 3, 0.01);
      fg.add(g, 'lights', 0, 3, 0.01);
      fg.add(g, 'impact', 0, 3, 0.01);
      fg.add(g, 'shake', 0, 2, 0.01);
      fg.add(g, 'timeScale', 0, 1, 0.01);
      fg.close();

      const post = settings.post;
      const fp = this.gui.addFolder('Post processing');
      fp.add(post, 'bloomStrength', 0, 3, 0.01);
      fp.add(post, 'bloomRadius', 0, 1.5, 0.01);
      fp.add(post, 'bloomThreshold', 0, 1, 0.01);
      fp.add(post, 'exposure', 0, 3, 0.01).onChange((v) => {
        this.renderer.toneMappingExposure = v;
        this.grade.uniforms.uExposure.value = v;
      });
      fp.add(post, 'vignette', 0, 1.5, 0.01);
      fp.add(post, 'aberration', 0, 3, 0.01);
      fp.add(post, 'grain', 0, 0.2, 0.001);
      fp.close();

      for (const el of ELEMENTS) {
        const s = settings[el];
        const meta = ELEMENT_META[el];
        const f = this.gui.addFolder(`${meta.key} — ${meta.label}`);
        if (s.range !== undefined) f.add(s, 'range', 4, 20, 0.1);
        if (s.speed !== undefined) f.add(s, 'speed', 2, 40, 0.1);
        if (s.cooldown !== undefined) f.add(s, 'cooldown', 0, 3, 0.05);
        const knobs = Object.keys(s).filter((k) => typeof s[k] === 'number' && !['range', 'speed', 'cooldown'].includes(k)).slice(0, 8);
        for (const k of knobs) f.add(s, k, 0, Math.max(10, s[k] * 3), 0.01);
        const ckey = Object.keys(s).find((k) => typeof s[k] === 'string' && k.startsWith('color')) || Object.keys(s).find((k) => typeof s[k] === 'string');
        if (ckey) f.addColor(s, ckey);
        f.close();
      }
      this.container.appendChild(this.gui.domElement);
    } catch (e) {
      console.warn('Editor unavailable', e);
    }
  }

  _resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  _emitState() {
    const slot = this.aim.isArmed ? ELEMENTS.indexOf(this.aim.element) : -1;

    // Collect enemy radar blips for minimap
    const radarBlips = this.enemyManager.enemies
      .filter((e) => e.isAlive)
      .map((e) => ({
        x: e.position.x,
        z: e.position.z,
        type: e.type
      }));

    this.onState?.({
      armed: this.aim.isArmed,
      slot,
      cooldowns: ELEMENTS.map((el) => this.abilities.cooldownFrac(el)),
      paused: this.paused,
      help: this.help,
      editor: this.editorOn,
      soundMuted: this.soundMuted,

      // Game state properties
      gameState: this.gameState,
      score: this.score,
      highScore: this.highScore,
      combo: this.combo,
      comboTimer: this.comboTimer,
      comboMultiplier: this.comboMultiplier,
      currentWave: this.enemyManager.currentWave,
      aliveCount: this.enemyManager.aliveCount,
      totalWaveCount: this.enemyManager.totalWaveEnemies,
      totalKills: this.enemyManager.totalKills,
      elementalKills: this.enemyManager.elementalKills,
      killFeed: this.killFeed,
      waveOptions: this.waveOptions,
      radarBlips,

      // Player status
      health: this.character.health,
      maxHealth: this.character.maxHealth,
      shield: this.character.shield,
      maxShield: this.character.maxShield + this.character.buffs.shieldBonus,
      dashCooldown: this.character.dashCooldownTimer > 0 ? this.character.dashCooldownTimer / (this.character.dashCooldown * this.character.buffs.cooldownMul) : 0,
      playerPos: { x: this.character.position.x, z: this.character.position.z }
    });
  }

  _emitStats() {
    const draws = this.renderer.info.render.calls;
    const particles = this.abilities.totalParticles();
    let instances = 0;
    this.abilities.forEachActive((a) => { instances += a.instanceCount || 0; });
    this.onStats?.({ fps: Math.round(this.fps), particles, instances, draws });
  }

  start() {
    this._emitState();
    this._loop();
  }

  _loop = () => {
    this.raf = requestAnimationFrame(this._loop);
    const real = Math.min(0.05, this.clock.getDelta());
    this.time += real;
    const sim = this.paused ? 0 : real * settings.global.timeScale;
    this.ctx.time += sim;

    // 1. Player Locomotion Input & Movement
    if (this.gameState === 'playing' && !this.paused) {
      const moveVec = this.input.getMoveVector(this.camera);
      this.character.setMoveInput(moveVec.x, moveVec.z);
    } else {
      this.character.setMoveInput(0, 0);
    }

    // 2. Combo Timer Decay
    if (this.comboTimer > 0) {
      this.comboTimer -= real;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboMultiplier = 1;
      }
    }

    // 3. Aim & Character Updates
    this.aim.setOrigin(this.character.position);
    this.aim.update(real);
    this.character.faceTo(this.aim.isArmed ? this.aim.facing : this.character.yaw);
    this.character.update(real, this.time);

    // 4. Smooth Camera Tracking Follow Player
    const targetOffset = new THREE.Vector3(this.character.position.x, 1.1, this.character.position.z);
    const camDiff = targetOffset.clone().sub(this.controls.target);
    this.controls.target.addScaledVector(camDiff, Math.min(1, real * 6.0));
    this.camera.position.addScaledVector(camDiff, Math.min(1, real * 6.0));

    // 5. Environment, Abilities & Monster Updates
    this.environment.update(sim > 0 ? sim : real, this.time);
    this.abilities.update(sim);
    this.enemyManager.update(sim, this.time, this.character, this.abilities);
    this.damageNumbers.update(sim);
    this.controls.update();

    // 6. Camera shake on impacts & abilities
    let shakeAmt = 0;
    this.abilities.forEachActive((a) => { if (a.lightBoost) shakeAmt = Math.max(shakeAmt, a.lightBoost); });
    if (shakeAmt > 0.1) {
      const s = shakeAmt * 0.01 * settings.global.shake;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }

    // 7. Post Uniforms
    this.bloom.strength = settings.post.bloomStrength;
    this.bloom.radius = settings.post.bloomRadius;
    this.bloom.threshold = settings.post.bloomThreshold;
    this.renderer.toneMappingExposure = settings.post.exposure;
    this.grade.uniforms.uVignette.value = settings.post.vignette;
    this.grade.uniforms.uAberration.value = settings.post.aberration;
    this.grade.uniforms.uGrain.value = settings.post.grain;
    this.grade.uniforms.uTime.value = this.time;

    this.composer.render();

    // FPS smoothing & throttled state emit
    this.fps = this.fps * 0.92 + (1 / Math.max(0.0001, real)) * 0.08;
    if (this.time - this._lastStats > 0.15) {
      this._lastStats = this.time;
      this._emitStats();
      this._emitState();
    }
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this._resizeObs?.disconnect();
    this.input.dispose();
    this.aim.dispose();
    this.abilities.clear();
    this.enemyManager.dispose();
    this.damageNumbers.dispose();
    this.environment.dispose();
    this.character.dispose();
    this.lights.dispose();
    this.gui?.destroy();
    this.composer.dispose();
    this.renderer.dispose();
    if (this.dom.parentNode) this.dom.parentNode.removeChild(this.dom);
  }
}
