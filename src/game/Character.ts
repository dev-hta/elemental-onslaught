// @ts-nocheck
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  CapsuleGeometry,
  SphereGeometry,
  Color,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector3
} from 'three';
import { settings } from './settings';
import { damp, clamp } from './util';
import { soundSynth } from './audio/SoundSynth';

/**
 * Animated battle-mage character with WASD movement, procedural step cycles,
 * dash dodging with ghost afterimages, health & auto-recharging shield.
 */
export class Character {
  constructor(scene) {
    this.scene = scene;
    this.root = new Group();
    this.yaw = 0;
    this.cast = 0; // 0..1 cast lunge envelope
    this.bob = 0;

    // Movement & Physics
    this.velocity = new Vector3();
    this.moveInput = new Vector3();
    this.moveSpeed = 6.4;
    this.walkCycle = 0;

    // Dash / Dodge
    this.isDashing = false;
    this.dashDuration = 0.22;
    this.dashTimer = 0;
    this.dashCooldown = 1.1;
    this.dashCooldownTimer = 0;
    this.dashDir = new Vector3(0, 0, 1);
    this.ghosts = [];

    // Health & Shield
    this.maxHealth = 100;
    this.health = 100;
    this.maxShield = 60;
    this.shield = 60;
    this.shieldRegenDelay = 2.8;
    this.timeSinceLastHit = 999;
    this.invulnerableTimer = 0;
    this.isDead = false;

    // Power-up Buffs
    this.buffs = {
      moveSpeedMul: 1.0,
      damageMul: 1.0,
      cooldownMul: 1.0,
      shieldBonus: 0
    };

    const suit = new MeshStandardMaterial({ color: new Color('#1b2440'), roughness: 0.55, metalness: 0.35 });
    const trim = new MeshStandardMaterial({
      color: new Color('#2a3a66'),
      roughness: 0.4,
      metalness: 0.5,
      emissive: new Color('#1be0ff'),
      emissiveIntensity: 0.6
    });
    this.suitMat = suit;
    this.trimMat = trim;

    const add = (geo, mat, parent, x, y, z) => {
      const m = new Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    this.torso = new Group();
    this.torso.position.y = 1.18;
    this.root.add(this.torso);

    add(new CapsuleGeometry(0.3, 0.66, 6, 14), suit, this.torso, 0, 0.0, 0);
    add(new SphereGeometry(0.23, 18, 18), suit, this.torso, 0, 0.62, 0); // head
    this.faceGlow = add(new SphereGeometry(0.06, 10, 10), trim, this.torso, 0, 0.62, 0.22); // face glow
    this.chestCore = add(new CapsuleGeometry(0.09, 0.5, 5, 10), trim, this.torso, 0, 0.12, 0.18); // chest core

    // shoulders + arms
    this.rArm = new Group();
    this.rArm.position.set(0.34, 0.28, 0);
    this.torso.add(this.rArm);
    add(new CapsuleGeometry(0.09, 0.5, 5, 10), suit, this.rArm, 0, -0.32, 0);
    this.rHand = new Object3D();
    this.rHand.position.set(0, -0.62, 0);
    this.rArm.add(this.rHand);
    add(new SphereGeometry(0.09, 10, 10), suit, this.rHand, 0, 0, 0);

    this.lArm = new Group();
    this.lArm.position.set(-0.34, 0.28, 0);
    this.torso.add(this.lArm);
    add(new CapsuleGeometry(0.09, 0.5, 5, 10), suit, this.lArm, 0, -0.32, 0);

    // legs (jointed for walking step cycles)
    this.legL = new Group();
    this.legL.position.set(-0.16, 0.55, 0);
    this.root.add(this.legL);
    add(new CapsuleGeometry(0.12, 0.62, 5, 10), suit, this.legL, 0, -0.32, 0);

    this.legR = new Group();
    this.legR.position.set(0.16, 0.55, 0);
    this.root.add(this.legR);
    add(new CapsuleGeometry(0.12, 0.62, 5, 10), suit, this.legR, 0, -0.32, 0);

    this.root.scale.setScalar(0.95);
    scene.add(this.root);

    // contact shadow
    this.shadowMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; void main(){ float d = length(vUv-0.5)*2.0; float a = smoothstep(1.0,0.0,d)*0.55; gl_FragColor = vec4(0.0,0.0,0.0,a); }`
    });
    this.shadow = new Mesh(new PlaneGeometry(2.6, 2.6), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);
  }

  setMoveInput(x, z) {
    this.moveInput.set(x, 0, z);
    if (this.moveInput.lengthSq() > 1) {
      this.moveInput.normalize();
    }
  }

  faceTo(yaw) {
    this._targetYaw = yaw;
  }

  triggerCast() {
    this.cast = 1;
  }

  dash() {
    if (this.dashCooldownTimer > 0 || this.isDashing || this.isDead) return false;

    // Dash in movement direction or facing direction
    if (this.moveInput.lengthSq() > 0.01) {
      this.dashDir.copy(this.moveInput).normalize();
    } else {
      this.dashDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    }

    this.isDashing = true;
    this.dashTimer = this.dashDuration;
    this.dashCooldownTimer = this.dashCooldown * this.buffs.cooldownMul;
    soundSynth.playDash();

    // Spawn afterimage ghost
    this._spawnGhost();
    return true;
  }

  _spawnGhost() {
    const ghostMat = new MeshStandardMaterial({
      color: new Color('#1be0ff'),
      emissive: new Color('#1be0ff'),
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.6
    });
    const ghostGeo = new CapsuleGeometry(0.3, 0.66, 4, 8);
    const ghostMesh = new Mesh(ghostGeo, ghostMat);
    ghostMesh.position.copy(this.root.position).setY(1.18);
    ghostMesh.rotation.copy(this.root.rotation);
    this.scene.add(ghostMesh);
    this.ghosts.push({ mesh: ghostMesh, mat: ghostMat, geo: ghostGeo, age: 0, maxAge: 0.25 });
  }

  takeDamage(amount) {
    if (this.isDead || this.isDashing || this.invulnerableTimer > 0) return 0;

    let remaining = amount;
    this.timeSinceLastHit = 0;
    this.invulnerableTimer = 0.35;

    // Absorb with shield first
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }

    if (remaining > 0) {
      this.health = Math.max(0, this.health - remaining);
    }

    if (this.health <= 0) {
      this.isDead = true;
      soundSynth.playGameOver();
    }

    return amount;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  reset(x = 0, z = 0) {
    this.root.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.shield = this.maxShield + this.buffs.shieldBonus;
    this.isDead = false;
    this.isDashing = false;
    this.dashCooldownTimer = 0;
    this.invulnerableTimer = 0;
  }

  /** World position of the right hand — where bolts/beams leave the caster. */
  handPos(out = new Vector3()) {
    this.rHand.getWorldPosition(out);
    if (out.y < 0.4) out.y = 1.3;
    return out;
  }

  update(dt, time) {
    const s = settings.character.scale;
    this.root.scale.setScalar(0.95 * s);

    // 1. Dash & Locomotion Physics
    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer -= dt;
    }
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
    }

    this.timeSinceLastHit += dt;
    // Auto-recharge shield after delay
    const totalMaxShield = this.maxShield + this.buffs.shieldBonus;
    if (this.timeSinceLastHit > this.shieldRegenDelay && this.shield < totalMaxShield) {
      this.shield = Math.min(totalMaxShield, this.shield + 22 * dt);
    }

    if (this.isDashing) {
      this.dashTimer -= dt;
      const dashSpeed = 20.0 * this.buffs.moveSpeedMul;
      this.velocity.copy(this.dashDir).multiplyScalar(dashSpeed);
      if (Math.random() < 0.4) this._spawnGhost();
      if (this.dashTimer <= 0) {
        this.isDashing = false;
      }
    } else {
      const targetSpeed = this.moveSpeed * this.buffs.moveSpeedMul;
      this.velocity.x = damp(this.velocity.x, this.moveInput.x * targetSpeed, 14, dt);
      this.velocity.z = damp(this.velocity.z, this.moveInput.z * targetSpeed, 14, dt);
    }

    this.root.position.x += this.velocity.x * dt;
    this.root.position.z += this.velocity.z * dt;

    // Arena boundary clamp (radius 24.5m)
    const distSq = this.root.position.x * this.root.position.x + this.root.position.z * this.root.position.z;
    if (distSq > 24.5 * 24.5) {
      const ang = Math.atan2(this.root.position.z, this.root.position.x);
      this.root.position.x = Math.cos(ang) * 24.5;
      this.root.position.z = Math.sin(ang) * 24.5;
    }

    // 2. Smooth Yaw Rotation to Aim
    if (this._targetYaw !== undefined) {
      let diff = this._targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 10);
    }
    this.root.rotation.y = this.yaw;

    // 3. Locomotion Step Cycles & Body Lean
    const currentSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    const moving = currentSpeed > 0.3;

    if (moving) {
      this.walkCycle += dt * currentSpeed * 2.8;
      this.legL.rotation.x = Math.sin(this.walkCycle) * 0.6;
      this.legR.rotation.x = -Math.sin(this.walkCycle) * 0.6;
      this.lArm.rotation.x = -Math.sin(this.walkCycle) * 0.4;
      this.torso.rotation.z = Math.sin(this.walkCycle) * 0.05;
      this.bob = Math.abs(Math.sin(this.walkCycle)) * 0.06;
    } else {
      this.legL.rotation.x = damp(this.legL.rotation.x, 0, 10, dt);
      this.legR.rotation.x = damp(this.legR.rotation.x, 0, 10, dt);
      this.lArm.rotation.x = Math.sin(time * 1.7) * 0.08 + 0.05;
      this.torso.rotation.z = Math.sin(time * 1.3) * 0.03;
      this.bob = Math.sin(time * 1.7) * 0.03;
    }
    this.root.position.y = this.bob;

    // 4. Cast Lunge: spike then decay
    this.cast = Math.max(0, this.cast - dt / 0.5);
    const c = this.cast;
    this.rArm.rotation.x = damp(this.rArm.rotation.x, -1.7 * c - 0.1, 12, dt);
    this.rArm.rotation.z = damp(this.rArm.rotation.z, -0.2 * c, 12, dt);
    this.torso.rotation.x = damp(this.torso.rotation.x, 0.25 * c, 10, dt);

    // Hit invulnerability flicker
    if (this.invulnerableTimer > 0) {
      const flicker = Math.sin(time * 40) > 0 ? 0.3 : 1.0;
      this.suitMat.opacity = flicker;
      this.suitMat.transparent = true;
    } else {
      this.suitMat.opacity = 1.0;
      this.suitMat.transparent = false;
    }

    // Shadow follow
    this.shadow.position.x = this.root.position.x;
    this.shadow.position.z = this.root.position.z;
    this.shadow.scale.setScalar(1 + c * 0.2);

    // 5. Update Ghosts
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.age += dt;
      if (g.age >= g.maxAge) {
        this.scene.remove(g.mesh);
        g.geo.dispose();
        g.mat.dispose();
        this.ghosts.splice(i, 1);
        continue;
      }
      g.mat.opacity = 0.6 * (1 - g.age / g.maxAge);
    }
  }

  get position() {
    return this.root.position;
  }

  dispose() {
    this.scene.remove(this.root, this.shadow);
    this.shadowMat.dispose();
    this.shadow.geometry.dispose();
    for (const g of this.ghosts) {
      this.scene.remove(g.mesh);
      g.geo.dispose();
      g.mat.dispose();
    }
    this.ghosts.length = 0;
  }
}
