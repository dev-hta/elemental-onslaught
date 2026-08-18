// @ts-nocheck
import {
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  Color,
  DoubleSide,
  AdditiveBlending
} from 'three';
import { damp, clamp } from '../util';
import { NOISE_GLSL, SDF_GLSL } from '../glsl';

export const EnemyState = Object.freeze({
  SPAWN: 'spawn',
  CHASE: 'chase',
  ATTACK: 'attack',
  STAGGER: 'stagger',
  DYING: 'dying',
  DEAD: 'dead'
});

const _tempVec = new Vector3();

/**
 * High-polish Base Enemy class with procedural GLSL shaders,
 * in-world holographic status rings, physical hit reactions,
 * and bespoke 5-element death transformation sequences.
 */
export class Enemy {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.id = opts.id || Math.random().toString(36).substring(2, 9);
    this.type = opts.type || 'enemy';
    this.name = opts.name || 'Monster';

    this.maxHp = opts.maxHp || 100;
    this.hp = this.maxHp;
    this.speed = opts.speed || 3.5;
    this.damage = opts.damage || 15;
    this.attackRange = opts.attackRange || 1.6;
    this.attackCooldown = opts.attackCooldown || 1.2;
    this.attackTimer = Math.random() * 0.5;
    this.radius = opts.radius || 0.6;
    this.height = opts.height || 1.5;
    this.scale = opts.scale || 1.0;
    this.scoreValue = opts.scoreValue || 100;

    this.damageMultipliers = {
      ice: 1.0,
      thunder: 1.0,
      meteor: 1.0,
      beam: 1.0,
      snare: 1.0,
      ...(opts.damageMultipliers || {})
    };

    this.state = EnemyState.SPAWN;
    this.spawnTime = 0.5;
    this.spawnTimer = 0;
    this.staggerTimer = 0;
    this.attackWindup = 0;

    // Death sequence properties
    this.deathElement = 'ice';
    this.deathTimer = 0;
    this.deathDuration = 0.8;
    this.deathBurstTriggered = false;

    this.velocity = new Vector3();
    this.facingYaw = 0;
    this.targetYaw = 0;
    this.hitFlash = 0;

    // Status effects
    this.status = {
      frozen: 0,
      shocked: 0,
      shockTick: 0,
      burning: 0,
      burnTick: 0,
      burnDps: 0,
      snared: 0
    };

    this.group = new Group();
    this.group.name = `Enemy:${this.type}:${this.id}`;
    this.scene.add(this.group);

    this.materials = [];
    this.buildModel();
    this._buildGroundStatusRing();

    this.group.scale.set(0.01, 0.01, 0.01);
  }

  get position() {
    return this.group.position;
  }

  get isAlive() {
    return this.state !== EnemyState.DYING && this.state !== EnemyState.DEAD && this.hp > 0;
  }

  buildModel() {
    // Implemented in subclasses
  }

  _buildGroundStatusRing() {
    const ringMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uHealthFrac: { value: 1.0 },
        uRadius: { value: this.radius },
        uHitFlash: { value: 0.0 },
        uStatusFrozen: { value: 0.0 },
        uStatusShocked: { value: 0.0 },
        uStatusBurning: { value: 0.0 },
        uStatusSnared: { value: 0.0 },
        uColorA: { value: new Color('#22d3ee') },
        uColorB: { value: new Color('#f43f5e') }
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: NOISE_GLSL + `
        varying vec2 vUv;
        uniform float uTime, uHealthFrac, uRadius, uHitFlash;
        uniform float uStatusFrozen, uStatusShocked, uStatusBurning, uStatusSnared;
        uniform vec3 uColorA, uColorB;

        void main(){
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          if(r > 1.0 || r < 0.35) discard;

          float shadow = smoothstep(0.7, 0.0, r) * 0.45;

          float angle = atan(p.y, p.x);
          float normAngle = (angle + 3.14159265) / 6.2831853;
          float arc = step(normAngle, uHealthFrac);

          float ringDist = abs(r - 0.78);
          float ring = smoothstep(0.08, 0.0, ringDist);

          vec3 healthCol = mix(uColorB, uColorA, smoothstep(0.2, 0.8, uHealthFrac));

          if(uStatusFrozen > 0.01) healthCol = mix(healthCol, vec3(0.4, 0.9, 1.0), 0.85);
          else if(uStatusShocked > 0.01) healthCol = mix(healthCol, vec3(0.5, 0.75, 1.0), 0.85);
          else if(uStatusBurning > 0.01) healthCol = mix(healthCol, vec3(1.0, 0.4, 0.1), 0.85);
          else if(uStatusSnared > 0.01) healthCol = mix(healthCol, vec3(0.8, 0.4, 1.0), 0.85);

          healthCol += vec3(uHitFlash * 1.5);

          float ticks = smoothstep(0.45, 0.55, sin(angle * 12.0)) * 0.3;
          float alpha = (ring * (arc * 0.85 + 0.15) + ticks * ring * 0.4 + shadow);
          alpha *= smoothstep(1.0, 0.85, r);

          if(alpha < 0.005) discard;
          gl_FragColor = vec4(healthCol * (ring * 1.2 + 0.3), alpha * 0.8);
        }
      `
    });

    const size = Math.max(1.6, this.radius * 3.4);
    this.groundRing = new Mesh(new PlaneGeometry(size, size), ringMat);
    this.groundRing.rotation.x = -Math.PI / 2;
    this.groundRing.position.y = 0.018;
    this.groundRing.renderOrder = 2;
    this.group.add(this.groundRing);
    this.ringMat = ringMat;
  }

  takeDamage(rawAmount, element = 'physical', isCrit = false, knockbackDir = null) {
    if (!this.isAlive) return 0;

    const multiplier = this.damageMultipliers[element] || 1.0;
    const statusBonus = this.status.frozen > 0 && (element === 'ice' || element === 'meteor') ? 1.6 : 1.0;
    const finalDamage = Math.max(1, Math.round(rawAmount * multiplier * statusBonus * (isCrit ? 1.75 : 1.0)));

    this.hp = Math.max(0, this.hp - finalDamage);
    this.hitFlash = 1.0;

    // Physical knockback
    if (knockbackDir) {
      this.velocity.addScaledVector(knockbackDir, 5.5 / (this.scale * 1.1));
      this.state = EnemyState.STAGGER;
      this.staggerTimer = 0.22;
    }

    if (this.hp <= 0) {
      this.startDeath(element);
    }

    return finalDamage;
  }

  startDeath(element = 'ice') {
    this.state = EnemyState.DYING;
    this.deathElement = element;
    this.deathTimer = 0;
    this.deathDuration = element === 'meteor' ? 0.9 : element === 'ice' ? 0.75 : element === 'snare' ? 0.85 : 0.65;
    this.deathBurstTriggered = false;
    if (this.groundRing) this.groundRing.visible = false;
  }

  applyStatus(type, duration, strength = 1) {
    if (!this.isAlive) return;
    switch (type) {
      case 'frozen':
        this.status.frozen = Math.max(this.status.frozen, duration);
        break;
      case 'shocked':
        this.status.shocked = Math.max(this.status.shocked, duration);
        this.status.shockTick = 0;
        break;
      case 'burning':
        this.status.burning = Math.max(this.status.burning, duration);
        this.status.burnDps = strength;
        this.status.burnTick = 0;
        break;
      case 'snared':
        this.status.snared = Math.max(this.status.snared, duration);
        break;
    }
  }

  update(dt, time, playerPos, onAttackCallback, onTickDamageCallback, onDeathBurstCallback) {
    if (this.state === EnemyState.DEAD) return;

    // 1. Spawning Phase
    if (this.state === EnemyState.SPAWN) {
      this.spawnTimer += dt;
      const t = clamp(this.spawnTimer / this.spawnTime, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const sc = this.scale * ease;
      this.group.scale.set(sc, sc, sc);
      if (t >= 1) {
        this.state = EnemyState.CHASE;
      }
      return;
    }

    // 2. Dynamic Elemental Death Sequence (The 5 Bespoke Transformations)
    if (this.state === EnemyState.DYING) {
      this.deathTimer += dt;
      const progress = clamp(this.deathTimer / this.deathDuration, 0, 1);

      switch (this.deathElement) {
        case 'ice':
          // Flash-freeze into crystal statue, then shatter violently at t=0.3
          if (progress < 0.3) {
            for (const mat of this.materials) {
              if (mat.uniforms && mat.uniforms.uFrozen) mat.uniforms.uFrozen.value = 1.0;
            }
          } else {
            if (!this.deathBurstTriggered) {
              this.deathBurstTriggered = true;
              onDeathBurstCallback?.(this, 'ice');
              this.group.visible = false;
            }
          }
          break;

        case 'thunder':
          // Spasm violently with electric jitter & strobe, disintegrating into sparks
          this.position.x += (Math.random() - 0.5) * 0.12;
          this.position.z += (Math.random() - 0.5) * 0.12;
          for (const mat of this.materials) {
            if (mat.uniforms && mat.uniforms.uShocked) mat.uniforms.uShocked.value = 1.0;
          }
          if (progress >= 0.25 && !this.deathBurstTriggered) {
            this.deathBurstTriggered = true;
            onDeathBurstCallback?.(this, 'thunder');
          }
          if (progress >= 0.45) {
            const sc = Math.max(0, this.scale * (1 - (progress - 0.45) / 0.55));
            this.group.scale.set(sc, sc, sc);
          }
          break;

        case 'meteor':
          // Glow red-hot magma, swell up, and detonate with volcanic chunks
          const swell = 1.0 + Math.sin(progress * Math.PI * 0.8) * 0.3;
          this.group.scale.set(this.scale * swell, this.scale * swell, this.scale * swell);
          for (const mat of this.materials) {
            if (mat.uniforms && mat.uniforms.uHitFlash) mat.uniforms.uHitFlash.value = 1.0;
          }
          if (progress >= 0.25 && !this.deathBurstTriggered) {
            this.deathBurstTriggered = true;
            onDeathBurstCallback?.(this, 'meteor');
            this.group.visible = false;
          }
          break;

        case 'beam':
          // Sliced and dissolved vertically into ascending laser motes
          this.position.y -= dt * 1.8;
          if (progress >= 0.15 && !this.deathBurstTriggered) {
            this.deathBurstTriggered = true;
            onDeathBurstCallback?.(this, 'beam');
          }
          const beamSc = Math.max(0, this.scale * (1 - progress));
          this.group.scale.set(beamSc, beamSc, beamSc);
          break;

        case 'snare':
          // Lifted into air, spinning & stretched into singularity
          this.position.y += dt * 3.2;
          this.group.rotation.y += dt * 22;
          const sx = Math.max(0.01, this.scale * (1 - progress * 0.9));
          const sy = this.scale * (1 + progress * 0.8);
          this.group.scale.set(sx, sy, sx);
          if (progress >= 0.6 && !this.deathBurstTriggered) {
            this.deathBurstTriggered = true;
            onDeathBurstCallback?.(this, 'snare');
            this.group.visible = false;
          }
          break;
      }

      if (progress >= 1.0) {
        this.state = EnemyState.DEAD;
      }
      return;
    }

    // 3. Status Effect Updates
    let speedMul = 1.0;
    if (this.status.frozen > 0) {
      this.status.frozen -= dt;
      speedMul = 0.22;
    }
    if (this.status.snared > 0) {
      this.status.snared -= dt;
      speedMul = 0.04;
    }
    if (this.status.shocked > 0) {
      this.status.shocked -= dt;
      this.status.shockTick += dt;
      if (this.status.shockTick >= 0.3) {
        this.status.shockTick = 0;
        onTickDamageCallback?.(this, 14, 'thunder');
      }
    }
    if (this.status.burning > 0) {
      this.status.burning -= dt;
      this.status.burnTick += dt;
      if (this.status.burnTick >= 0.35) {
        this.status.burnTick = 0;
        onTickDamageCallback?.(this, Math.round(this.status.burnDps * 0.35), 'meteor');
      }
    }

    // 4. Stagger Recovery
    if (this.state === EnemyState.STAGGER) {
      this.staggerTimer -= dt;
      if (this.staggerTimer <= 0) {
        this.state = EnemyState.CHASE;
      }
    }

    // 5. Movement & AI Locomotion
    const toPlayer = _tempVec.copy(playerPos).sub(this.position);
    toPlayer.y = 0;
    const distToPlayer = toPlayer.length();

    if (distToPlayer > 0.1) {
      this.targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
    }

    let diff = this.targetYaw - this.facingYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.facingYaw += diff * Math.min(1, dt * 8.5);
    this.group.rotation.y = this.facingYaw;

    if (this.state === EnemyState.CHASE && distToPlayer > this.attackRange * 0.85) {
      const moveDir = toPlayer.clone().normalize();
      const currentSpeed = this.speed * speedMul;
      this.velocity.x = damp(this.velocity.x, moveDir.x * currentSpeed, 8.5, dt);
      this.velocity.z = damp(this.velocity.z, moveDir.z * currentSpeed, 8.5, dt);
    } else {
      this.velocity.x = damp(this.velocity.x, 0, 12, dt);
      this.velocity.z = damp(this.velocity.z, 0, 12, dt);
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    const distFromCenter = Math.sqrt(this.position.x * this.position.x + this.position.z * this.position.z);
    if (distFromCenter > 24.5) {
      const angle = Math.atan2(this.position.z, this.position.x);
      this.position.x = Math.cos(angle) * 24.5;
      this.position.z = Math.sin(angle) * 24.5;
    }

    // 6. Attack Cycle
    this.attackTimer -= dt;
    if (this.state === EnemyState.CHASE && distToPlayer <= this.attackRange && this.attackTimer <= 0 && this.status.frozen <= 0) {
      this.state = EnemyState.ATTACK;
      this.attackWindup = 0.32;
      this.attackTimer = this.attackCooldown;
    }

    if (this.state === EnemyState.ATTACK) {
      this.attackWindup -= dt;
      if (this.attackWindup <= 0) {
        if (distToPlayer <= this.attackRange * 1.35) {
          onAttackCallback?.(this, this.damage);
        }
        this.state = EnemyState.CHASE;
      }
    }

    // 7. Hit Flash & Status Uniform Updates
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4.5);
    const healthFrac = clamp(this.hp / this.maxHp, 0, 1);

    if (this.ringMat) {
      this.ringMat.uniforms.uTime.value = time;
      this.ringMat.uniforms.uHealthFrac.value = healthFrac;
      this.ringMat.uniforms.uHitFlash.value = this.hitFlash;
      this.ringMat.uniforms.uStatusFrozen.value = this.status.frozen > 0 ? 1 : 0;
      this.ringMat.uniforms.uStatusShocked.value = this.status.shocked > 0 ? 1 : 0;
      this.ringMat.uniforms.uStatusBurning.value = this.status.burning > 0 ? 1 : 0;
      this.ringMat.uniforms.uStatusSnared.value = this.status.snared > 0 ? 1 : 0;
    }

    for (const mat of this.materials) {
      if (mat.uniforms) {
        if (mat.uniforms.uHitFlash) mat.uniforms.uHitFlash.value = this.hitFlash;
        if (mat.uniforms.uTime) mat.uniforms.uTime.value = time;
        if (mat.uniforms.uFrozen) mat.uniforms.uFrozen.value = this.status.frozen > 0 ? 1 : 0;
        if (mat.uniforms.uShocked) mat.uniforms.uShocked.value = this.status.shocked > 0 ? 1 : 0;
      }
    }

    const currentSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    this.updateAnimation(dt, time, currentSpeed);
  }

  updateAnimation(dt, time, speed) {
    // Implemented in subclasses
  }

  dispose() {
    this.scene.remove(this.group);
    if (this.groundRing) {
      this.groundRing.geometry.dispose();
      this.ringMat.dispose();
    }
    for (const mat of this.materials) {
      mat.dispose();
    }
  }
}
