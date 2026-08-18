// @ts-nocheck
import { Vector3 } from 'three';
import { VoidCrawler, ObsidianGolem, AetherPhantom, PyreFiend, GloomBehemoth } from './EnemyTypes';
import { DestructionEffects } from './DestructionEffects';
import { soundSynth } from '../audio/SoundSynth';

const _tempVec = new Vector3();
const _lineStart = new Vector3();
const _lineEnd = new Vector3();
const _point = new Vector3();

function distToSegmentXZ(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) {
    const px = p.x - a.x;
    const pz = p.z - a.z;
    return Math.sqrt(px * px + pz * pz);
  }
  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cz = a.z + t * dz;
  const px = p.x - cx;
  const pz = p.z - cz;
  return Math.sqrt(px * px + pz * pz);
}

/**
 * Manages monster spawning waves, spatial hit detection across all 5 spells,
 * flocking separation, and damage routing with physical feedback.
 */
export class EnemyManager {
  constructor(scene, ctx, damageNumbers) {
    this.scene = scene;
    this.ctx = ctx;
    this.damageNumbers = damageNumbers;
    this.destruction = new DestructionEffects(scene, ctx);

    this.enemies = [];
    this.currentWave = 1;
    this.waveState = 'active';
    this.waveSpawnQueue = [];
    this.spawnInterval = 0.55;
    this.spawnTimer = 0;

    this.totalKills = 0;
    this.elementalKills = { ice: 0, thunder: 0, meteor: 0, beam: 0, snare: 0 };
    this.onKill = null;
    this.onWaveClear = null;
    this.onPlayerDamaged = null;

    this.hitCooldowns = new Map();
  }

  get aliveCount() {
    return this.enemies.filter((e) => e.isAlive).length + this.waveSpawnQueue.length;
  }

  get totalWaveEnemies() {
    return this._totalInCurrentWave || 1;
  }

  startWave(waveNumber = 1) {
    this.currentWave = waveNumber;
    this.waveState = 'spawning';
    this.waveSpawnQueue = this._generateWaveQueue(waveNumber);
    this._totalInCurrentWave = this.waveSpawnQueue.length;
    this.spawnTimer = 0.8;
    soundSynth.playWaveStart();
  }

  _generateWaveQueue(wave) {
    const queue = [];
    const baseCount = 5 + wave * 3;

    if (wave === 1) {
      for (let i = 0; i < 6; i++) queue.push('crawler');
    } else if (wave === 2) {
      for (let i = 0; i < 6; i++) queue.push('crawler');
      for (let i = 0; i < 2; i++) queue.push('golem');
    } else if (wave === 3) {
      for (let i = 0; i < 5; i++) queue.push('crawler');
      for (let i = 0; i < 3; i++) queue.push('phantom');
      for (let i = 0; i < 3; i++) queue.push('pyrefiend');
    } else if (wave === 4) {
      for (let i = 0; i < 6; i++) queue.push('crawler');
      for (let i = 0; i < 4; i++) queue.push('pyrefiend');
      for (let i = 0; i < 3; i++) queue.push('golem');
      for (let i = 0; i < 3; i++) queue.push('phantom');
    } else if (wave === 5) {
      queue.push('behemoth');
      for (let i = 0; i < 4; i++) queue.push('crawler');
      for (let i = 0; i < 2; i++) queue.push('golem');
      for (let i = 0; i < 2; i++) queue.push('phantom');
    } else {
      const count = Math.min(24, baseCount);
      const types = ['crawler', 'golem', 'phantom', 'pyrefiend'];
      if (wave % 5 === 0) queue.push('behemoth');
      for (let i = 0; i < count; i++) {
        const t = types[Math.floor(Math.random() * types.length)];
        queue.push(t);
      }
    }
    return queue;
  }

  _spawnEnemy(type) {
    const angle = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * 4;
    const spawnX = Math.cos(angle) * r;
    const spawnZ = Math.sin(angle) * r;

    let enemy = null;
    switch (type) {
      case 'crawler':
        enemy = new VoidCrawler(this.scene);
        break;
      case 'golem':
        enemy = new ObsidianGolem(this.scene);
        break;
      case 'phantom':
        enemy = new AetherPhantom(this.scene);
        break;
      case 'pyrefiend':
        enemy = new PyreFiend(this.scene);
        break;
      case 'behemoth':
        enemy = new GloomBehemoth(this.scene);
        break;
      default:
        enemy = new VoidCrawler(this.scene);
        break;
    }

    enemy.position.set(spawnX, 0, spawnZ);
    this.enemies.push(enemy);
  }

  update(dt, time, player, abilities) {
    this.destruction.update(dt, time);

    // 1. Spawning Queue
    if (this.waveSpawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const nextType = this.waveSpawnQueue.shift();
        this._spawnEnemy(nextType);
        this.spawnTimer = this.spawnInterval;
      }
    }

    // 2. Hit Detections with Active Abilities
    if (abilities && abilities.active) {
      for (const ability of abilities.active) {
        if (!ability.isActive) continue;
        this._testAbilityHits(ability, time);
      }
    }

    // 3. Enemy Flocking Separation
    this._applyEnemySeparation(dt);

    // 4. Update Each Enemy
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      if (enemy.state === 'dead') {
        enemy.dispose();
        this.enemies.splice(i, 1);
        continue;
      }

      enemy.update(
        dt,
        time,
        player.position,
        (atkEnemy, dmg) => {
          soundSynth.playPlayerHit();
          this.onPlayerDamaged?.(dmg);
        },
        (tickEnemy, tickDmg, el) => {
          const dealt = tickEnemy.takeDamage(tickDmg, el, false);
          this.damageNumbers.spawn(tickEnemy.position, `${dealt}`, el);
          if (!tickEnemy.isAlive && tickEnemy.state !== 'dying' && tickEnemy.state !== 'dead') {
            this._killEnemy(tickEnemy, el);
          }
        },
        (dyingEnemy, el) => {
          // Trigger the physical debris / particles at the exact transformation burst
          this.destruction.triggerDeath(dyingEnemy, el);
        }
      );
    }

    // 5. Check Wave Completion
    if (this.waveSpawnQueue.length === 0 && this.enemies.filter((e) => e.isAlive).length === 0 && this.waveState !== 'cleared') {
      this.waveState = 'cleared';
      soundSynth.playWaveClear();
      this.onWaveClear?.(this.currentWave);
    }
  }

  _testAbilityHits(ability, time) {
    const el = ability.element;
    const uid = ability.id || (ability._uid = ability._uid || Math.random().toString(36).substring(2, 7));

    _lineStart.copy(ability.origin);
    _lineEnd.copy(ability.origin).addScaledVector(ability.direction, ability.length * (ability.u || 1));

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;

      const ePos = enemy.position;
      const hitKey = `${uid}_${enemy.id}`;
      const lastHit = this.hitCooldowns.get(hitKey) || 0;

      if (el === 'ice') {
        const dist = distToSegmentXZ(ePos, _lineStart, _lineEnd);
        if (dist <= enemy.radius + 1.2 && time - lastHit > 0.35) {
          this.hitCooldowns.set(hitKey, time);
          const isCrit = Math.random() < 0.25;
          const dmg = enemy.takeDamage(90, 'ice', isCrit, ability.direction);
          enemy.applyStatus('frozen', 2.4);
          this.damageNumbers.spawn(ePos, isCrit ? `CRIT ${dmg}!` : `${dmg}`, 'ice', isCrit);
          soundSynth.playEnemyHit();

          if (!enemy.isAlive) {
            this._killEnemy(enemy, 'ice');
          }
        }
      } else if (el === 'thunder') {
        const dist = distToSegmentXZ(ePos, _lineStart, _lineEnd);
        if (dist <= enemy.radius + 1.3 && time - lastHit > 0.3) {
          this.hitCooldowns.set(hitKey, time);
          const isCrit = Math.random() < 0.3;
          const dmg = enemy.takeDamage(100, 'thunder', isCrit, ability.direction);
          enemy.applyStatus('shocked', 2.0);
          this.damageNumbers.spawn(ePos, isCrit ? `SHOCK ${dmg}!` : `${dmg}`, 'thunder', isCrit);
          soundSynth.playEnemyHit();

          this._chainLightning(enemy, 60, 2);

          if (!enemy.isAlive) {
            this._killEnemy(enemy, 'thunder');
          }
        }
      } else if (el === 'meteor') {
        if (ability.phase === 'impact' || ability.phase === 'fade') {
          const impactPos = ability.pointAt ? ability.pointAt(1, _point) : ability.position;
          const d = Math.sqrt((ePos.x - impactPos.x) * (ePos.x - impactPos.x) + (ePos.z - impactPos.z) * (ePos.z - impactPos.z));
          const explosionRadius = 4.5;
          if (d <= explosionRadius + enemy.radius && time - lastHit > 0.5) {
            this.hitCooldowns.set(hitKey, time);
            const knockDir = ePos.clone().sub(impactPos).normalize();
            knockDir.y = 0.8; // launch upward
            const isCrit = Math.random() < 0.35;
            const dmg = enemy.takeDamage(170, 'meteor', isCrit, knockDir);
            enemy.applyStatus('burning', 3.2, 35);
            this.damageNumbers.spawn(ePos, isCrit ? `BLAST ${dmg}!` : `${dmg}`, 'meteor', isCrit);
            soundSynth.playEnemyHit();

            if (!enemy.isAlive) {
              this._killEnemy(enemy, 'meteor');
            }
          }
        }
      } else if (el === 'beam') {
        const dist = distToSegmentXZ(ePos, _lineStart, _lineEnd);
        if (dist <= enemy.radius + 1.15 && time - lastHit > 0.1) {
          this.hitCooldowns.set(hitKey, time);
          const isCrit = Math.random() < 0.2;
          const dmg = enemy.takeDamage(32, 'beam', isCrit, ability.direction);
          this.damageNumbers.spawn(ePos, `${dmg}`, 'beam', isCrit);

          if (!enemy.isAlive) {
            this._killEnemy(enemy, 'beam');
          }
        }
      } else if (el === 'snare') {
        const center = ability._center ? ability._center() : ability.position;
        const rad = ability.config?.zoneRadius || 3.4;
        const d = Math.sqrt((ePos.x - center.x) * (ePos.x - center.x) + (ePos.z - center.z) * (ePos.z - center.z));
        if (d <= rad + enemy.radius && time - lastHit > 0.22) {
          this.hitCooldowns.set(hitKey, time);
          const pullDir = center.clone().sub(ePos).normalize();
          enemy.velocity.addScaledVector(pullDir, 4.0);
          enemy.applyStatus('snared', 2.0);

          const isCrit = Math.random() < 0.2;
          const dmg = enemy.takeDamage(50, 'snare', isCrit);
          this.damageNumbers.spawn(ePos, `${dmg}`, 'snare', isCrit);

          if (!enemy.isAlive) {
            this._killEnemy(enemy, 'snare');
          }
        }
      }
    }
  }

  _chainLightning(sourceEnemy, dmg, maxChains) {
    let chains = 0;
    for (const other of this.enemies) {
      if (other === sourceEnemy || !other.isAlive) continue;
      const d = sourceEnemy.position.distanceTo(other.position);
      if (d <= 6.0) {
        const dealt = other.takeDamage(dmg, 'thunder', false);
        other.applyStatus('shocked', 1.6);
        this.damageNumbers.spawn(other.position, `⚡ ${dealt}`, 'thunder');
        if (!other.isAlive) {
          this._killEnemy(other, 'thunder');
        }
        chains++;
        if (chains >= maxChains) break;
      }
    }
  }

  _killEnemy(enemy, element) {
    this.totalKills++;
    this.elementalKills[element] = (this.elementalKills[element] || 0) + 1;
    enemy.startDeath(element);
    this.onKill?.(enemy, element);
  }

  _applyEnemySeparation(dt) {
    const len = this.enemies.length;
    for (let i = 0; i < len; i++) {
      const a = this.enemies[i];
      if (!a.isAlive) continue;
      for (let j = i + 1; j < len; j++) {
        const b = this.enemies[j];
        if (!b.isAlive) continue;

        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const distSq = dx * dx + dz * dz;
        const minDist = a.radius + b.radius;

        if (distSq > 0.0001 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;

          a.position.x -= nx * overlap;
          a.position.z -= nz * overlap;
          b.position.x += nx * overlap;
          b.position.z += nz * overlap;
        }
      }
    }
  }

  clear() {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    this.waveSpawnQueue.length = 0;
    this.destruction.clear();
    this.hitCooldowns.clear();
  }

  dispose() {
    this.clear();
    this.destruction.dispose();
  }
}
