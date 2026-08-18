// @ts-nocheck
import {
  Group,
  Mesh,
  InstancedMesh,
  ConeGeometry,
  IcosahedronGeometry,
  BoxGeometry,
  RingGeometry,
  PlaneGeometry,
  ShaderMaterial,
  MeshBasicMaterial,
  Vector3,
  Color,
  Object3D,
  Matrix4,
  DoubleSide,
  AdditiveBlending
} from 'three';
import { ParticleSystem } from '../ParticleSystem';
import { NOISE_GLSL } from '../glsl';
import { soundSynth } from '../audio/SoundSynth';

const _dummy = new Object3D();
const _v = new Vector3();
const _m = new Matrix4();

const MAX_ICE_SHARDS = 120;
const MAX_METEOR_CHUNKS = 80;

/**
 * Manages the 5 distinct, bespoke destruction physics and visual simulations
 * when monsters are defeated by each elemental ability.
 */
export class DestructionEffects {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.group = new Group();
    this.group.name = 'DestructionEffects';
    this.scene.add(this.group);

    this.activeEffects = [];

    // --- 1. Ice Shard Instanced Mesh ---
    const iceGeo = new ConeGeometry(0.12, 0.4, 5);
    this.iceMat = new ShaderMaterial({
      transparent: true,
      depthWrite: true,
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 0 },
        uColorEdge: { value: new Color('#e6f8ff') },
        uColorMid: { value: new Color('#4fc3ff') },
        uColorDeep: { value: new Color('#175a93') }
      },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vWorld;
        void main(){
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal; varying vec3 vWorld;
        uniform vec3 uColorEdge, uColorMid, uColorDeep; uniform float uFade;
        void main(){
          float th = pow(abs(dot(normalize(vNormal), vec3(0.0, 1.0, 0.4))), 0.8);
          vec3 col = mix(uColorDeep, uColorMid, th);
          col = mix(col, uColorEdge, pow(th, 2.5));
          gl_FragColor = vec4(col * 1.4, (1.0 - uFade) * 0.95);
        }
      `
    });
    this.iceMesh = new InstancedMesh(iceGeo, this.iceMat, MAX_ICE_SHARDS);
    this.iceMesh.frustumCulled = false;
    this.iceMesh.count = 0;
    this.group.add(this.iceMesh);

    this.iceShards = [];
    for (let i = 0; i < MAX_ICE_SHARDS; i++) {
      this.iceShards.push({
        active: false,
        pos: new Vector3(),
        vel: new Vector3(),
        rot: new Vector3(),
        rotVel: new Vector3(),
        scale: 1,
        life: 0,
        maxLife: 1.2
      });
    }

    // --- 2. Meteor Molten Chunk Instanced Mesh ---
    const meteorGeo = new IcosahedronGeometry(0.18, 1);
    this.meteorMat = new ShaderMaterial({
      transparent: true,
      depthWrite: true,
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 0 },
        uLava: { value: new Color('#ff6622') },
        uRock: { value: new Color('#2a1a18') }
      },
      vertexShader: `
        varying vec3 vWorld;
        void main(){
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorld; uniform vec3 uLava, uRock; uniform float uFade;
        void main(){
          vec3 col = mix(uLava * 1.6, uRock, 0.4);
          gl_FragColor = vec4(col, 1.0 - uFade);
        }
      `
    });
    this.meteorMesh = new InstancedMesh(meteorGeo, this.meteorMat, MAX_METEOR_CHUNKS);
    this.meteorMesh.frustumCulled = false;
    this.meteorMesh.count = 0;
    this.group.add(this.meteorMesh);

    this.meteorChunks = [];
    for (let i = 0; i < MAX_METEOR_CHUNKS; i++) {
      this.meteorChunks.push({
        active: false,
        pos: new Vector3(),
        vel: new Vector3(),
        rot: new Vector3(),
        rotVel: new Vector3(),
        scale: 1,
        life: 0,
        maxLife: 1.4
      });
    }

    // --- 3. Particle Systems for Destructions ---
    this.frostMist = new ParticleSystem(scene, {
      capacity: 320,
      additive: true,
      gravity: 0.5,
      drag: 1.0,
      turb: 0.6,
      size: 0.8,
      opacity: 0.7,
      colorA: '#ffffff',
      colorB: '#8ee6ff',
      colorC: '#2060aa'
    });

    this.lightningSparks = new ParticleSystem(scene, {
      capacity: 360,
      additive: true,
      gravity: 3,
      drag: 0.4,
      turb: 0.8,
      size: 0.15,
      stretch: 0.6,
      opacity: 0.95,
      colorA: '#ffffff',
      colorB: '#80c0ff',
      colorC: '#2050e0'
    });

    this.fireDebris = new ParticleSystem(scene, {
      capacity: 320,
      additive: true,
      gravity: 8,
      drag: 0.6,
      turb: 0.4,
      size: 0.35,
      opacity: 0.9,
      colorA: '#fff0a0',
      colorB: '#ff6020',
      colorC: '#601005'
    });

    this.beamVapor = new ParticleSystem(scene, {
      capacity: 320,
      additive: true,
      gravity: -6.0,
      drag: 0.8,
      turb: 0.5,
      size: 0.18,
      stretch: 0.4,
      opacity: 0.95,
      colorA: '#ffffff',
      colorB: '#80f0ff',
      colorC: '#0080ff'
    });

    this.vortexSparks = new ParticleSystem(scene, {
      capacity: 320,
      additive: true,
      gravity: -1.0,
      drag: 0.3,
      turb: 0.9,
      size: 0.16,
      opacity: 0.9,
      colorA: '#ffffff',
      colorB: '#d080ff',
      colorC: '#6010b0'
    });
  }

  /** Trigger one of the 5 distinct elemental destructions on an enemy */
  triggerDeath(enemy, element, onComplete) {
    soundSynth.playEnemyDestroy(element);

    const pos = enemy.position.clone();
    const size = enemy.scale || 1.0;

    switch (element) {
      case 'ice':
        this._triggerIceShatter(pos, size, enemy);
        break;
      case 'thunder':
        this._triggerThunderElectrocution(pos, size, enemy);
        break;
      case 'meteor':
        this._triggerMeteorObliteration(pos, size, enemy);
        break;
      case 'beam':
        this._triggerBeamVaporization(pos, size, enemy);
        break;
      case 'snare':
        this._triggerSnareImplosion(pos, size, enemy);
        break;
      default:
        this._triggerGenericDeath(pos, size);
        break;
    }

    if (onComplete) onComplete();
  }

  // 1. Ice: Flash freeze -> shatter into 20+ physics tumbling ice shards
  _triggerIceShatter(pos, size, enemy) {
    const shardCount = Math.floor(18 + size * 10);
    const now = this.ctx.time || 0;

    // Burst mist & frost particles
    this.frostMist.burst(30, () => ({
      pos: pos.clone().add(new Vector3((Math.random() - 0.5) * size, Math.random() * size * 1.2, (Math.random() - 0.5) * size)),
      vel: new Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3),
      life: 0.8 + Math.random() * 0.5,
      size: 0.3 + Math.random() * 0.4,
      seed: Math.random() * 100
    }), now);

    // Spawn tumbling ice shards
    let spawned = 0;
    for (const shard of this.iceShards) {
      if (!shard.active) {
        shard.active = true;
        shard.pos.copy(pos).add(new Vector3((Math.random() - 0.5) * size * 0.8, Math.random() * size * 1.2, (Math.random() - 0.5) * size * 0.8));
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 6;
        shard.vel.set(Math.cos(angle) * speed, 2 + Math.random() * 6, Math.sin(angle) * speed);
        shard.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        shard.rotVel.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
        shard.scale = 0.5 + Math.random() * 0.8;
        shard.life = 0;
        shard.maxLife = 0.9 + Math.random() * 0.6;
        spawned++;
        if (spawned >= shardCount) break;
      }
    }

    // Flash a frost point light
    const light = this.ctx.lights?.acquire();
    if (light) {
      this.activeEffects.push({
        type: 'lightFade',
        light,
        color: new Color('#a0ecff'),
        pos: pos.clone().setY(pos.y + 0.8),
        intensity: 8,
        radius: 10,
        age: 0,
        maxAge: 0.45
      });
    }
  }

  // 2. Thunder: High voltage spasm & blinding electric skeleton disintegration
  _triggerThunderElectrocution(pos, size, enemy) {
    const now = this.ctx.time || 0;

    // Violent spark cascade
    this.lightningSparks.burst(50, () => ({
      pos: pos.clone().add(new Vector3((Math.random() - 0.5) * size * 0.8, Math.random() * size * 1.5, (Math.random() - 0.5) * size * 0.8)),
      vel: new Vector3((Math.random() - 0.5) * 8, 2 + Math.random() * 6, (Math.random() - 0.5) * 8),
      life: 0.4 + Math.random() * 0.4,
      size: 0.08 + Math.random() * 0.14,
      seed: Math.random() * 100
    }), now);

    // Expanding lightning ground shock ring
    const ringGeo = new RingGeometry(0.2, 0.35, 20);
    const ringMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: { uFade: { value: 0 }, uColor: { value: new Color('#7fd0ff') } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uFade; void main(){ gl_FragColor = vec4(uColor * 2.0, (1.0 - uFade) * 0.9); }`
    });
    const ringMesh = new Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.copy(pos).setY(0.04);
    this.group.add(ringMesh);

    this.activeEffects.push({
      type: 'shockRing',
      mesh: ringMesh,
      mat: ringMat,
      geo: ringGeo,
      scale: 1,
      maxScale: 3.5 * size,
      age: 0,
      maxAge: 0.35
    });

    // High intensity flash light
    const light = this.ctx.lights?.acquire();
    if (light) {
      this.activeEffects.push({
        type: 'lightFade',
        light,
        color: new Color('#80d0ff'),
        pos: pos.clone().setY(pos.y + 1),
        intensity: 12,
        radius: 14,
        age: 0,
        maxAge: 0.3
      });
    }
  }

  // 3. Meteor: Fiery detonation, flaming chunks flying outward, ground scorch
  _triggerMeteorObliteration(pos, size, enemy) {
    const chunkCount = Math.floor(14 + size * 8);
    const now = this.ctx.time || 0;

    // Fire debris and smoke explosion
    this.fireDebris.burst(40, () => ({
      pos: pos.clone().add(new Vector3((Math.random() - 0.5) * size, Math.random() * size, (Math.random() - 0.5) * size)),
      vel: new Vector3((Math.random() - 0.5) * 10, 3 + Math.random() * 8, (Math.random() - 0.5) * 10),
      life: 0.6 + Math.random() * 0.7,
      size: 0.2 + Math.random() * 0.35,
      seed: Math.random() * 100
    }), now);

    // Spawn fiery molten rock chunks
    let spawned = 0;
    for (const chunk of this.meteorChunks) {
      if (!chunk.active) {
        chunk.active = true;
        chunk.pos.copy(pos).add(new Vector3((Math.random() - 0.5) * size * 0.5, Math.random() * size * 0.8, (Math.random() - 0.5) * size * 0.5));
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 7;
        chunk.vel.set(Math.cos(angle) * speed, 3 + Math.random() * 7, Math.sin(angle) * speed);
        chunk.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        chunk.rotVel.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
        chunk.scale = 0.6 + Math.random() * 0.8;
        chunk.life = 0;
        chunk.maxLife = 1.0 + Math.random() * 0.5;
        spawned++;
        if (spawned >= chunkCount) break;
      }
    }

    // Heavy fiery flash light
    const light = this.ctx.lights?.acquire();
    if (light) {
      this.activeEffects.push({
        type: 'lightFade',
        light,
        color: new Color('#ff7020'),
        pos: pos.clone().setY(pos.y + 0.8),
        intensity: 14,
        radius: 16,
        age: 0,
        maxAge: 0.5
      });
    }
  }

  // 4. Nova Beam: Laser vaporization, upward streaming cyan laser motes and light columns
  _triggerBeamVaporization(pos, size, enemy) {
    const now = this.ctx.time || 0;

    // Upward beam vapor stream
    this.beamVapor.burst(50, () => ({
      pos: pos.clone().add(new Vector3((Math.random() - 0.5) * size * 0.8, Math.random() * size * 1.4, (Math.random() - 0.5) * size * 0.8)),
      vel: new Vector3((Math.random() - 0.5) * 1.5, 4 + Math.random() * 6, (Math.random() - 0.5) * 1.5),
      life: 0.5 + Math.random() * 0.4,
      size: 0.12 + Math.random() * 0.18,
      seed: Math.random() * 100
    }), now);

    // Laser expanding shock rings
    const ringGeo = new RingGeometry(0.1, 0.4, 24);
    const ringMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: { uFade: { value: 0 }, uColor: { value: new Color('#3fd0ff') } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uFade; void main(){ gl_FragColor = vec4(uColor * 2.2, (1.0 - uFade)); }`
    });
    const ringMesh = new Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.copy(pos).setY(0.5);
    this.group.add(ringMesh);

    this.activeEffects.push({
      type: 'shockRing',
      mesh: ringMesh,
      mat: ringMat,
      geo: ringGeo,
      scale: 1,
      maxScale: 2.8 * size,
      age: 0,
      maxAge: 0.4
    });

    const light = this.ctx.lights?.acquire();
    if (light) {
      this.activeEffects.push({
        type: 'lightFade',
        light,
        color: new Color('#80f0ff'),
        pos: pos.clone().setY(pos.y + 1),
        intensity: 12,
        radius: 14,
        age: 0,
        maxAge: 0.4
      });
    }
  }

  // 5. Voltaic Snare: Gravitational vortex lift, twisting tendrils, imploding singularity
  _triggerSnareImplosion(pos, size, enemy) {
    const now = this.ctx.time || 0;

    // Singularity intake vortex particles
    this.vortexSparks.burst(45, () => {
      const a = Math.random() * Math.PI * 2;
      const r = (1.5 + Math.random() * 1.5) * size;
      const spawnPos = pos.clone().add(new Vector3(Math.cos(a) * r, 0.2 + Math.random() * 1.5, Math.sin(a) * r));
      const target = pos.clone().setY(pos.y + 0.8);
      const vel = target.sub(spawnPos).multiplyScalar(2.5);
      return {
        pos: spawnPos,
        vel,
        life: 0.4 + Math.random() * 0.3,
        size: 0.12 + Math.random() * 0.15,
        seed: Math.random() * 100
      };
    }, now);

    // Expanding then snapping violet implosion core
    const coreGeo = new IcosahedronGeometry(0.4 * size, 2);
    const coreMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uFade: { value: 0 }, uColor: { value: new Color('#b050ff') } },
      vertexShader: `varying vec3 vNormal; void main(){ vNormal = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vNormal; uniform vec3 uColor; uniform float uFade; void main(){ float rim = pow(1.0 - abs(dot(vNormal, vec3(0,0,1))), 2.0); gl_FragColor = vec4(uColor * (1.0 + rim * 2.0), (1.0 - uFade) * 0.9); }`
    });
    const coreMesh = new Mesh(coreGeo, coreMat);
    coreMesh.position.copy(pos).setY(pos.y + 0.8);
    this.group.add(coreMesh);

    this.activeEffects.push({
      type: 'implosionCore',
      mesh: coreMesh,
      mat: coreMat,
      geo: coreGeo,
      scale: 1,
      age: 0,
      maxAge: 0.45
    });

    const light = this.ctx.lights?.acquire();
    if (light) {
      this.activeEffects.push({
        type: 'lightFade',
        light,
        color: new Color('#c070ff'),
        pos: pos.clone().setY(pos.y + 0.8),
        intensity: 10,
        radius: 12,
        age: 0,
        maxAge: 0.45
      });
    }
  }

  _triggerGenericDeath(pos, size) {
    const now = this.ctx.time || 0;
    this.frostMist.burst(20, () => ({
      pos: pos.clone().add(new Vector3((Math.random() - 0.5) * size, Math.random() * size, (Math.random() - 0.5) * size)),
      vel: new Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3),
      life: 0.5,
      size: 0.2,
      seed: Math.random() * 100
    }), now);
  }

  update(dt, time) {
    // 1. Update Ice Shards Simulation
    let activeIce = 0;
    for (let i = 0; i < MAX_ICE_SHARDS; i++) {
      const s = this.iceShards[i];
      if (!s.active) {
        _dummy.position.set(0, -999, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.iceMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        continue;
      }

      // Physics: gravity + ground bounce
      s.vel.y -= 14 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < 0.1) {
        s.pos.y = 0.1;
        s.vel.y = -s.vel.y * 0.45;
        s.vel.x *= 0.7;
        s.vel.z *= 0.7;
      }
      s.rot.addScaledVector(s.rotVel, dt);

      const fade = Math.max(0, s.life / s.maxLife);
      const sc = s.scale * (1 - fade * 0.6);

      _dummy.position.copy(s.pos);
      _dummy.rotation.set(s.rot.x, s.rot.y, s.rot.z);
      _dummy.scale.set(sc, sc, sc);
      _dummy.updateMatrix();
      this.iceMesh.setMatrixAt(i, _dummy.matrix);
      activeIce++;
    }
    this.iceMesh.count = MAX_ICE_SHARDS;
    this.iceMesh.instanceMatrix.needsUpdate = true;
    this.iceMat.uniforms.uTime.value = time;

    // 2. Update Meteor Chunks Simulation
    let activeMeteor = 0;
    for (let i = 0; i < MAX_METEOR_CHUNKS; i++) {
      const c = this.meteorChunks[i];
      if (!c.active) {
        _dummy.position.set(0, -999, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.meteorMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      c.life += dt;
      if (c.life >= c.maxLife) {
        c.active = false;
        continue;
      }

      c.vel.y -= 16 * dt;
      c.pos.addScaledVector(c.vel, dt);
      if (c.pos.y < 0.1) {
        c.pos.y = 0.1;
        c.vel.y = -c.vel.y * 0.35;
        c.vel.x *= 0.65;
        c.vel.z *= 0.65;
      }
      c.rot.addScaledVector(c.rotVel, dt);

      const fade = Math.max(0, c.life / c.maxLife);
      const sc = c.scale * (1 - fade * 0.5);

      _dummy.position.copy(c.pos);
      _dummy.rotation.set(c.rot.x, c.rot.y, c.rot.z);
      _dummy.scale.set(sc, sc, sc);
      _dummy.updateMatrix();
      this.meteorMesh.setMatrixAt(i, _dummy.matrix);
      activeMeteor++;
    }
    this.meteorMesh.count = MAX_METEOR_CHUNKS;
    this.meteorMesh.instanceMatrix.needsUpdate = true;
    this.meteorMat.uniforms.uTime.value = time;

    // 3. Update Particle Systems
    this.frostMist.update(dt, time);
    this.lightningSparks.update(dt, time);
    this.fireDebris.update(dt, time);
    this.beamVapor.update(dt, time);
    this.vortexSparks.update(dt, time);

    // 4. Update Active Mesh / Light Effects
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const eff = this.activeEffects[i];
      eff.age += dt;
      const progress = eff.age / eff.maxAge;

      if (progress >= 1) {
        if (eff.type === 'lightFade' && eff.light) {
          this.ctx.lights?.release(eff.light);
        } else if (eff.mesh) {
          this.group.remove(eff.mesh);
          eff.geo?.dispose();
          eff.mat?.dispose();
        }
        this.activeEffects.splice(i, 1);
        continue;
      }

      if (eff.type === 'lightFade') {
        const falloff = 1 - progress;
        this.ctx.lights?.set(eff.light, eff.pos, eff.color, eff.intensity * falloff, eff.radius * falloff, dt);
      } else if (eff.type === 'shockRing') {
        const curScale = 1 + (eff.maxScale - 1) * progress;
        eff.mesh.scale.set(curScale, curScale, 1);
        eff.mat.uniforms.uFade.value = progress;
      } else if (eff.type === 'implosionCore') {
        // Expand first then snap shrink
        const s = progress < 0.3 ? 1 + progress * 2.0 : Math.max(0.01, (1 - (progress - 0.3) / 0.7));
        eff.mesh.scale.set(s, s, s);
        eff.mesh.rotation.y += dt * 8;
        eff.mat.uniforms.uFade.value = progress;
      }
    }
  }

  clear() {
    for (const s of this.iceShards) s.active = false;
    for (const c of this.meteorChunks) c.active = false;
    for (const eff of this.activeEffects) {
      if (eff.type === 'lightFade' && eff.light) this.ctx.lights?.release(eff.light);
      else if (eff.mesh) {
        this.group.remove(eff.mesh);
        eff.geo?.dispose();
        eff.mat?.dispose();
      }
    }
    this.activeEffects.length = 0;
    this.frostMist.reset();
    this.lightningSparks.reset();
    this.fireDebris.reset();
    this.beamVapor.reset();
    this.vortexSparks.reset();
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
    this.iceMesh.geometry.dispose();
    this.iceMat.dispose();
    this.meteorMesh.geometry.dispose();
    this.meteorMat.dispose();
    this.frostMist.dispose();
    this.lightningSparks.dispose();
    this.fireDebris.dispose();
    this.beamVapor.dispose();
    this.vortexSparks.dispose();
  }
}
