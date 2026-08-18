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
import { settings } from '../settings';

const _dummy = new Object3D();
const _v = new Vector3();
const _m = new Matrix4();

const MAX_ICE_SHARDS = 140;
const MAX_METEOR_CHUNKS = 90;

/**
 * Manages the 5 distinct, bespoke destruction physics and GLSL shader simulations
 * when monsters are defeated by each elemental weapon.
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
    const iceGeo = new ConeGeometry(0.12, 0.42, 5);
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
      fragmentShader: NOISE_GLSL + `
        varying vec3 vNormal; varying vec3 vWorld;
        uniform vec3 uColorEdge, uColorMid, uColorDeep; uniform float uFade, uTime;
        void main(){
          float th = pow(abs(dot(normalize(vNormal), vec3(0.0, 1.0, 0.4))), 0.85);
          vec3 col = mix(uColorDeep, uColorMid, th);
          col = mix(col, uColorEdge, pow(th, 2.5));
          float frac = fbm3(vWorld * 5.0);
          col *= 0.8 + 0.4 * frac;
          float a = (1.0 - uFade * 0.95) * (0.6 + 0.4 * th);
          gl_FragColor = vec4(col * 1.5, a);
        }
      `
    });
    this.iceMesh = new InstancedMesh(iceGeo, this.iceMat, MAX_ICE_SHARDS);
    this.iceMesh.frustumCulled = false;
    this.iceMesh.count = 0;
    this.group.add(this.iceMesh);

    this.iceShardRecords = [];
    for (let i = 0; i < MAX_ICE_SHARDS; i++) {
      this.iceShardRecords.push({
        active: false,
        pos: new Vector3(),
        vel: new Vector3(),
        rot: new Vector3(),
        rotVel: new Vector3(),
        scale: new Vector3(),
        age: 0,
        maxLife: 1.2
      });
    }

    // --- 2. Meteor Molten Rock Chunks ---
    const meteorGeo = new IcosahedronGeometry(0.18, 1);
    this.meteorMat = new ShaderMaterial({
      transparent: true,
      depthWrite: true,
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 0 },
        uColorCore: { value: new Color('#ffd27f') },
        uColorGlow: { value: new Color('#ff5a1e') },
        uColorRock: { value: new Color('#2a1a18') }
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
      fragmentShader: NOISE_GLSL + `
        varying vec3 vNormal; varying vec3 vWorld;
        uniform vec3 uColorCore, uColorGlow, uColorRock; uniform float uFade, uTime;
        void main(){
          float n = fbm3(vWorld * 6.0);
          float crack = smoothstep(0.4, 0.75, n);
          vec3 col = mix(uColorRock, uColorGlow, crack);
          col = mix(col, uColorCore, pow(crack, 3.0));
          float a = (1.0 - uFade);
          gl_FragColor = vec4(col * 1.8, a);
        }
      `
    });
    this.meteorMesh = new InstancedMesh(meteorGeo, this.meteorMat, MAX_METEOR_CHUNKS);
    this.meteorMesh.frustumCulled = false;
    this.meteorMesh.count = 0;
    this.group.add(this.meteorMesh);

    this.meteorChunkRecords = [];
    for (let i = 0; i < MAX_METEOR_CHUNKS; i++) {
      this.meteorChunkRecords.push({
        active: false,
        pos: new Vector3(),
        vel: new Vector3(),
        rot: new Vector3(),
        rotVel: new Vector3(),
        scale: new Vector3(),
        age: 0,
        maxLife: 1.4
      });
    }

    // --- Particle Systems ---
    this.iceMist = new ParticleSystem(scene, {
      capacity: 320,
      additive: false,
      gravity: 0.3,
      drag: 1.2,
      turb: 0.6,
      size: 1.2,
      opacity: 0.25,
      colorA: '#cfeaff',
      colorB: '#7fb8e6',
      colorC: '#2a4a72'
    });
    this.iceGlitter = new ParticleSystem(scene, {
      capacity: 360,
      additive: true,
      gravity: -1.5,
      drag: 0.4,
      turb: 0.8,
      size: 0.18,
      opacity: 0.9,
      colorA: '#ffffff',
      colorB: '#9fe8ff',
      colorC: '#3aa0ff'
    });
    this.thunderSparks = new ParticleSystem(scene, {
      capacity: 360,
      additive: true,
      gravity: 3.5,
      drag: 0.3,
      turb: 1.2,
      size: 0.25,
      opacity: 1.0,
      colorA: '#ffffff',
      colorB: '#7fd0ff',
      colorC: '#2e6bff'
    });
    this.meteorEmbers = new ParticleSystem(scene, {
      capacity: 360,
      additive: true,
      gravity: 8.0,
      drag: 0.4,
      turb: 0.6,
      size: 0.3,
      opacity: 1.0,
      colorA: '#ffeaa0',
      colorB: '#ff7a2a',
      colorC: '#991500'
    });
    this.meteorSmoke = new ParticleSystem(scene, {
      capacity: 220,
      additive: false,
      gravity: -1.2,
      drag: 0.8,
      turb: 0.5,
      size: 1.6,
      opacity: 0.35,
      colorA: '#33201a',
      colorB: '#1a100c',
      colorC: '#080504'
    });
    this.laserMotes = new ParticleSystem(scene, {
      capacity: 320,
      additive: true,
      gravity: -4.5,
      drag: 0.2,
      turb: 0.8,
      size: 0.22,
      opacity: 1.0,
      colorA: '#ffffff',
      colorB: '#3fd0ff',
      colorC: '#1e6bff'
    });
    this.snareTendrils = new ParticleSystem(scene, {
      capacity: 320,
      additive: true,
      gravity: -0.5,
      drag: 0.6,
      turb: 1.8,
      size: 0.3,
      opacity: 0.9,
      colorA: '#f0d8ff',
      colorB: '#a05bff',
      colorC: '#4a1580'
    });
  }

  /**
   * Triggers the corresponding elemental destruction effect for an enemy death
   */
  triggerDeath(enemy, element) {
    const pos = enemy.position.clone();
    const scale = enemy.scale || 1.0;
    const time = this.ctx.time;

    switch (element) {
      case 'ice':
        this._destroyWithIce(enemy, pos, scale, time);
        soundSynth.playIceShatter();
        break;
      case 'thunder':
        this._destroyWithThunder(enemy, pos, scale, time);
        soundSynth.playThunderShock();
        break;
      case 'meteor':
        this._destroyWithMeteor(enemy, pos, scale, time);
        soundSynth.playMeteorExplode();
        break;
      case 'beam':
        this._destroyWithBeam(enemy, pos, scale, time);
        soundSynth.playBeamDissolve();
        break;
      case 'snare':
        this._destroyWithSnare(enemy, pos, scale, time);
        soundSynth.playSnareSingularity();
        break;
      default:
        this._destroyWithIce(enemy, pos, scale, time);
        soundSynth.playIceShatter();
        break;
    }
  }

  // 1. ICE DESTRUCTION: Flash-freeze & shatter into physics-tumbled ice shards
  _destroyWithIce(enemy, pos, scale, time) {
    const shardCount = Math.round(24 * scale);
    let spawned = 0;

    for (const rec of this.iceShardRecords) {
      if (rec.active) continue;

      rec.active = true;
      rec.age = 0;
      rec.maxLife = 1.0 + Math.random() * 0.6;
      rec.pos.set(
        pos.x + (Math.random() - 0.5) * 0.6 * scale,
        pos.y + 0.2 + Math.random() * 0.8 * scale,
        pos.z + (Math.random() - 0.5) * 0.6 * scale
      );
      const speed = 3.5 + Math.random() * 5.0;
      const angle = Math.random() * Math.PI * 2;
      rec.vel.set(
        Math.cos(angle) * speed,
        2.5 + Math.random() * 4.5,
        Math.sin(angle) * speed
      );
      rec.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      rec.rotVel.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12
      );
      const sc = (0.7 + Math.random() * 0.6) * scale;
      rec.scale.set(sc, sc * (1 + Math.random()), sc);

      spawned++;
      if (spawned >= shardCount) break;
    }

    // Mist burst & Diamond Glitter Plume
    this.iceMist.burst(25, () => ({
      pos: pos.clone().setY(pos.y + 0.4),
      vel: new Vector3((Math.random() - 0.5) * 2, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 2),
      life: 0.9 + Math.random() * 0.6,
      size: 0.4 + Math.random() * 0.4,
      seed: Math.random() * 100
    }), time);

    this.iceGlitter.burst(35, () => ({
      pos: pos.clone().setY(pos.y + 0.4),
      vel: new Vector3((Math.random() - 0.5) * 4, 2.0 + Math.random() * 3.5, (Math.random() - 0.5) * 4),
      life: 0.8 + Math.random() * 0.6,
      size: 0.08 + Math.random() * 0.1,
      seed: Math.random() * 100
    }), time);
  }

  // 2. THUNDER DESTRUCTION: High-voltage spasms & cascading blue electric spark motes
  _destroyWithThunder(enemy, pos, scale, time) {
    this.thunderSparks.burst(65, () => {
      const a = Math.random() * Math.PI * 2;
      const sp = 4.0 + Math.random() * 6.5;
      return {
        pos: pos.clone().setY(pos.y + 0.3 + Math.random() * 0.8 * scale),
        vel: new Vector3(Math.cos(a) * sp, 1.5 + Math.random() * 5.0, Math.sin(a) * sp),
        life: 0.5 + Math.random() * 0.5,
        size: 0.12 + Math.random() * 0.18,
        seed: Math.random() * 100
      };
    }, time);
  }

  // 3. METEOR DESTRUCTION: Molten magma detonation with flying burning rock chunks & smoke
  _destroyWithMeteor(enemy, pos, scale, time) {
    const chunkCount = Math.round(18 * scale);
    let spawned = 0;

    for (const rec of this.meteorChunkRecords) {
      if (rec.active) continue;

      rec.active = true;
      rec.age = 0;
      rec.maxLife = 1.2 + Math.random() * 0.5;
      rec.pos.set(
        pos.x + (Math.random() - 0.5) * 0.5 * scale,
        pos.y + 0.3 + Math.random() * 0.6 * scale,
        pos.z + (Math.random() - 0.5) * 0.5 * scale
      );
      const speed = 4.5 + Math.random() * 7.0;
      const angle = Math.random() * Math.PI * 2;
      rec.vel.set(
        Math.cos(angle) * speed,
        3.5 + Math.random() * 6.0,
        Math.sin(angle) * speed
      );
      rec.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      rec.rotVel.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      );
      const sc = (0.7 + Math.random() * 0.5) * scale;
      rec.scale.set(sc, sc, sc);

      spawned++;
      if (spawned >= chunkCount) break;
    }

    this.meteorEmbers.burst(55, () => ({
      pos: pos.clone().setY(pos.y + 0.3),
      vel: new Vector3((Math.random() - 0.5) * 6, 2.5 + Math.random() * 5.5, (Math.random() - 0.5) * 6),
      life: 0.8 + Math.random() * 0.7,
      size: 0.15 + Math.random() * 0.2,
      seed: Math.random() * 100
    }), time);

    this.meteorSmoke.burst(25, () => ({
      pos: pos.clone().setY(pos.y + 0.3),
      vel: new Vector3((Math.random() - 0.5) * 1.5, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5),
      life: 1.2 + Math.random() * 0.8,
      size: 0.5 + Math.random() * 0.5,
      seed: Math.random() * 100
    }), time);
  }

  // 4. BEAM DESTRUCTION: Piercing laser vaporization into streaming cyan motes
  _destroyWithBeam(enemy, pos, scale, time) {
    this.laserMotes.burst(60, () => ({
      pos: pos.clone().setY(pos.y + Math.random() * 1.2 * scale),
      vel: new Vector3((Math.random() - 0.5) * 1.2, 4.0 + Math.random() * 5.0, (Math.random() - 0.5) * 1.2),
      life: 0.7 + Math.random() * 0.6,
      size: 0.1 + Math.random() * 0.15,
      seed: Math.random() * 100
    }), time);
  }

  // 5. SNARE DESTRUCTION: Gravitational suction vortex into point singularity
  _destroyWithSnare(enemy, pos, scale, time) {
    this.snareTendrils.burst(50, () => {
      const a = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.random() * 1.5;
      return {
        pos: new Vector3(pos.x + Math.cos(a) * r, pos.y + Math.random() * 1.5 * scale, pos.z + Math.sin(a) * r),
        vel: new Vector3(-Math.cos(a) * 3.5, 0.5 + Math.random() * 2.0, -Math.sin(a) * 3.5),
        life: 0.6 + Math.random() * 0.5,
        size: 0.15 + Math.random() * 0.2,
        seed: Math.random() * 100
      };
    }, time);
  }

  update(dt, time) {
    // 1. Update Ice Shards with Floor Bounces & Friction
    let activeIce = 0;
    for (let i = 0; i < MAX_ICE_SHARDS; i++) {
      const rec = this.iceShardRecords[i];
      if (!rec.active) {
        this.iceMesh.setMatrixAt(i, _m.identity().scale(_v.set(0, 0, 0)));
        continue;
      }

      rec.age += dt;
      if (rec.age >= rec.maxLife) {
        rec.active = false;
        this.iceMesh.setMatrixAt(i, _m.identity().scale(_v.set(0, 0, 0)));
        continue;
      }

      activeIce++;
      rec.vel.y -= 13.0 * dt; // Gravity
      rec.pos.addScaledVector(rec.vel, dt);

      // Floor bounce & friction
      if (rec.pos.y < 0.08) {
        rec.pos.y = 0.08;
        rec.vel.y = -rec.vel.y * 0.42; // restitution
        rec.vel.x *= 0.85;
        rec.vel.z *= 0.85;
      }

      rec.rot.x += rec.rotVel.x * dt;
      rec.rot.y += rec.rotVel.y * dt;
      rec.rot.z += rec.rotVel.z * dt;

      const fade = rec.age / rec.maxLife;
      const s = (1 - fade * fade) * 0.95;

      _dummy.position.copy(rec.pos);
      _dummy.rotation.set(rec.rot.x, rec.rot.y, rec.rot.z);
      _dummy.scale.set(rec.scale.x * s, rec.scale.y * s, rec.scale.z * s);
      _dummy.updateMatrix();
      this.iceMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.iceMesh.count = activeIce;
    this.iceMesh.instanceMatrix.needsUpdate = true;
    this.iceMat.uniforms.uTime.value = time;

    // 2. Update Meteor Molten Rock Chunks
    let activeMeteor = 0;
    for (let i = 0; i < MAX_METEOR_CHUNKS; i++) {
      const rec = this.meteorChunkRecords[i];
      if (!rec.active) {
        this.meteorMesh.setMatrixAt(i, _m.identity().scale(_v.set(0, 0, 0)));
        continue;
      }

      rec.age += dt;
      if (rec.age >= rec.maxLife) {
        rec.active = false;
        this.meteorMesh.setMatrixAt(i, _m.identity().scale(_v.set(0, 0, 0)));
        continue;
      }

      activeMeteor++;
      rec.vel.y -= 15.0 * dt;
      rec.pos.addScaledVector(rec.vel, dt);

      if (rec.pos.y < 0.09) {
        rec.pos.y = 0.09;
        rec.vel.y = -rec.vel.y * 0.35;
        rec.vel.x *= 0.82;
        rec.vel.z *= 0.82;
      }

      rec.rot.x += rec.rotVel.x * dt;
      rec.rot.y += rec.rotVel.y * dt;
      rec.rot.z += rec.rotVel.z * dt;

      const fade = rec.age / rec.maxLife;
      const s = (1 - fade * fade) * 0.9;

      _dummy.position.copy(rec.pos);
      _dummy.rotation.set(rec.rot.x, rec.rot.y, rec.rot.z);
      _dummy.scale.set(rec.scale.x * s, rec.scale.y * s, rec.scale.z * s);
      _dummy.updateMatrix();
      this.meteorMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.meteorMesh.count = activeMeteor;
    this.meteorMesh.instanceMatrix.needsUpdate = true;
    this.meteorMat.uniforms.uTime.value = time;

    // 3. Update Particle Systems
    this.iceMist.update(dt, time);
    this.iceGlitter.update(dt, time);
    this.thunderSparks.update(dt, time);
    this.meteorEmbers.update(dt, time);
    this.meteorSmoke.update(dt, time);
    this.laserMotes.update(dt, time);
    this.snareTendrils.update(dt, time);
  }

  clear() {
    for (const r of this.iceShardRecords) r.active = false;
    for (const r of this.meteorChunkRecords) r.active = false;
    this.iceMesh.count = 0;
    this.meteorMesh.count = 0;
    this.iceMist.reset();
    this.iceGlitter.reset();
    this.thunderSparks.reset();
    this.meteorEmbers.reset();
    this.meteorSmoke.reset();
    this.laserMotes.reset();
    this.snareTendrils.reset();
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
    this.iceMesh.geometry.dispose();
    this.iceMat.dispose();
    this.meteorMesh.geometry.dispose();
    this.meteorMat.dispose();
    this.iceMist.dispose();
    this.iceGlitter.dispose();
    this.thunderSparks.dispose();
    this.meteorEmbers.dispose();
    this.meteorSmoke.dispose();
    this.laserMotes.dispose();
    this.snareTendrils.dispose();
  }
}
