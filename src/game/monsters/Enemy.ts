// @ts-nocheck
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  Vector3,
  Color
} from 'three';
import { damp, clamp } from '../util';

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
 * Base Enemy class with AI state machine, health bar, status effects,
 * hit reaction flash shader, and contact shadow.
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

    // Elemental damage weaknesses / resistances
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
      snared: 0,
      snareCenter: null
    };

    this.group = new Group();
    this.group.name = `Enemy:${this.type}:${this.id}`;
    this.scene.add(this.group);

    this.materials = [];
    this.buildModel();
    this._buildContactShadow();
    this._buildHealthBar();

    this.group.scale.set(0.01, 0.01, 0.01);
  }

  get position() {
    return this.group.position;
  }

  get isAlive() {
    return this.state !== EnemyState.DYING && this.state !== EnemyState.DEAD && this.hp > 0;
  }

  buildModel() {
    // Subclasses construct their procedural geometry meshes here
  }

  _buildContactShadow() {
    const shadowMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uAlpha: { value: 0.6 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float uAlpha; void main(){ float d=length(vUv-0.5)*2.0; float a=smoothstep(1.0,0.0,d)*uAlpha; gl_FragColor=vec4(0.0,0.0,0.0,a); }`
    });
    this.shadow = new Mesh(new PlaneGeometry(this.radius * 3.2, this.radius * 3.2), shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.015;
    this.shadow.renderOrder = 1;
    this.group.add(this.shadow);
    this.shadowMat = shadowMat;
  }

  _buildHealthBar() {
    this.hbCanvas = document.createElement('canvas');
    this.hbCanvas.width = 128;
    this.hbCanvas.height = 16;
    this.hbCtx = this.hbCanvas.getContext('2d');
    this.hbTexture = new CanvasTexture(this.hbCanvas);
    this.hbTexture.generateMipmaps = false;

    this.hbMat = new SpriteMaterial({
      map: this.hbTexture,
      transparent: true,
      depthWrite: false
    });
    this.hbSprite = new Sprite(this.hbMat);
    this.hbSprite.position.set(0, this.height + 0.35, 0);
    this.hbSprite.scale.set(1.4 * this.scale, 0.18 * this.scale, 1);
    this.hbSprite.renderOrder = 15;
    this.group.add(this.hbSprite);
    this._updateHealthBarTexture();
  }

  _updateHealthBarTexture() {
    const ctx = this.hbCtx;
    const w = this.hbCanvas.width;
    const h = this.hbCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background pill
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Health Fill
    const frac = clamp(this.hp / this.maxHp, 0, 1);
    const fillW = Math.max(0, (w - 4) * frac);

    let fillColor = '#34d399'; // Green
    if (frac < 0.3) fillColor = '#f87171'; // Red
    else if (frac < 0.6) fillColor = '#fbbf24'; // Yellow

    if (this.status.frozen > 0) fillColor = '#67e8f9'; // Cyan if frozen
    else if (this.status.shocked > 0) fillColor = '#60a5fa'; // Blue if shocked

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.roundRect(2, 2, fillW, h - 4, 6);
    ctx.fill();

    this.hbTexture.needsUpdate = true;
  }

  /** Apply damage from a weapon */
  takeDamage(rawAmount, element = 'physical', isCrit = false, knockbackDir = null) {
    if (!this.isAlive) return 0;

    const multiplier = this.damageMultipliers[element] || 1.0;
    // Frozen targets take 1.5x physical / shatter damage
    const statusBonus = this.status.frozen > 0 && (element === 'ice' || element === 'meteor') ? 1.5 : 1.0;
    const finalDamage = Math.max(1, Math.round(rawAmount * multiplier * statusBonus * (isCrit ? 1.75 : 1.0)));

    this.hp = Math.max(0, this.hp - finalDamage);
    this.hitFlash = 1.0;
    this._updateHealthBarTexture();

    // Knockback
    if (knockbackDir) {
      this.velocity.addScaledVector(knockbackDir, 4.5 / (this.scale * 1.2));
      this.state = EnemyState.STAGGER;
      this.staggerTimer = 0.2;
    }

    if (this.hp <= 0) {
      this.state = EnemyState.DYING;
    }

    return finalDamage;
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
    this._updateHealthBarTexture();
  }

  update(dt, time, playerPos, onAttackCallback, onTickDamageCallback) {
    if (this.state === EnemyState.DEAD) return;

    // 1. Spawning Phase
    if (this.state === EnemyState.SPAWN) {
      this.spawnTimer += dt;
      const t = clamp(this.spawnTimer / this.spawnTime, 0, 1);
      const sc = this.scale * (1 - Math.pow(1 - t, 3));
      this.group.scale.set(sc, sc, sc);
      if (t >= 1) {
        this.state = EnemyState.CHASE;
      }
      return;
    }

    if (this.state === EnemyState.DYING) {
      return;
    }

    // 2. Status Effect Updates (DoT ticks & slowdown)
    let speedMul = 1.0;
    if (this.status.frozen > 0) {
      this.status.frozen -= dt;
      speedMul = 0.25; // 75% slow
    }
    if (this.status.snared > 0) {
      this.status.snared -= dt;
      speedMul = 0.05; // rooted
    }
    if (this.status.shocked > 0) {
      this.status.shocked -= dt;
      this.status.shockTick += dt;
      if (this.status.shockTick >= 0.35) {
        this.status.shockTick = 0;
        onTickDamageCallback?.(this, 12, 'thunder');
      }
    }
    if (this.status.burning > 0) {
      this.status.burning -= dt;
      this.status.burnTick += dt;
      if (this.status.burnTick >= 0.4) {
        this.status.burnTick = 0;
        onTickDamageCallback?.(this, Math.round(this.status.burnDps * 0.4), 'meteor');
      }
    }

    // 3. Stagger / Knockback recovery
    if (this.state === EnemyState.STAGGER) {
      this.staggerTimer -= dt;
      if (this.staggerTimer <= 0) {
        this.state = EnemyState.CHASE;
      }
    }

    // 4. Movement & AI
    const toPlayer = _tempVec.copy(playerPos).sub(this.position);
    toPlayer.y = 0;
    const distToPlayer = toPlayer.length();

    if (distToPlayer > 0.1) {
      this.targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
    }

    // Smooth yaw rotation
    let diff = this.targetYaw - this.facingYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.facingYaw += diff * Math.min(1, dt * 8);
    this.group.rotation.y = this.facingYaw;

    // Movement physics
    if (this.state === EnemyState.CHASE && distToPlayer > this.attackRange * 0.85) {
      const moveDir = toPlayer.clone().normalize();
      const currentSpeed = this.speed * speedMul;
      this.velocity.x = damp(this.velocity.x, moveDir.x * currentSpeed, 8, dt);
      this.velocity.z = damp(this.velocity.z, moveDir.z * currentSpeed, 8, dt);
    } else {
      this.velocity.x = damp(this.velocity.x, 0, 10, dt);
      this.velocity.z = damp(this.velocity.z, 0, 10, dt);
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // Arena boundary clamp (radius 26m)
    const distFromCenter = Math.sqrt(this.position.x * this.position.x + this.position.z * this.position.z);
    if (distFromCenter > 25.5) {
      const angle = Math.atan2(this.position.z, this.position.x);
      this.position.x = Math.cos(angle) * 25.5;
      this.position.z = Math.sin(angle) * 25.5;
    }

    // 5. Attack Logic
    this.attackTimer -= dt;
    if (this.state === EnemyState.CHASE && distToPlayer <= this.attackRange && this.attackTimer <= 0 && this.status.frozen <= 0) {
      this.state = EnemyState.ATTACK;
      this.attackWindup = 0.35;
      this.attackTimer = this.attackCooldown;
    }

    if (this.state === EnemyState.ATTACK) {
      this.attackWindup -= dt;
      if (this.attackWindup <= 0) {
        if (distToPlayer <= this.attackRange * 1.3) {
          onAttackCallback?.(this, this.damage);
        }
        this.state = EnemyState.CHASE;
      }
    }

    // 6. Hit Flash decay & custom animation
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    for (const mat of this.materials) {
      if (mat.emissive) {
        const flashColor = this.status.frozen > 0 ? '#80e0ff' : '#ff4444';
        mat.emissive.set(flashColor);
        mat.emissiveIntensity = this.hitFlash * 2.0 + (this.status.shocked > 0 ? Math.sin(time * 30) * 0.5 + 0.5 : 0.1);
      }
    }

    const currentSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    this.updateAnimation(dt, time, currentSpeed);
  }

  updateAnimation(dt, time, speed) {
    // Override in subclasses
  }

  dispose() {
    this.scene.remove(this.group);
    this.hbTexture.dispose();
    this.hbMat.dispose();
    this.shadowMat.dispose();
    this.shadow.geometry.dispose();
    for (const mat of this.materials) {
      mat.dispose();
    }
  }
}
