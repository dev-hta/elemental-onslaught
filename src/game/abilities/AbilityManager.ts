// @ts-nocheck
import { settings, ELEMENTS } from '../settings';
import { clamp } from '../util';
import { IceAbility } from './IceAbility';
import { ThunderAbility } from './ThunderAbility';
import { MeteorAbility } from './MeteorAbility';
import { BeamAbility } from './BeamAbility';
import { SnareAbility } from './SnareAbility';

const MAX_PER_ELEMENT = 6;

const FACTORY = {
  ice: IceAbility,
  thunder: ThunderAbility,
  meteor: MeteorAbility,
  beam: BeamAbility,
  snare: SnareAbility
};

/**
 * Pools abilities per element, enforces per-slot cooldowns, and drives updates.
 * Never locks out the player from casting when spells are ready.
 */
export class AbilityManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.pools = {};
    this.active = [];
    this.cooldowns = {};
    for (const el of ELEMENTS) {
      this.pools[el] = [];
      this.cooldowns[el] = 0;
    }
  }

  get totalActive() {
    return this.active.length;
  }

  canCast(element) {
    return (this.cooldowns[element] ?? 0) <= 0;
  }

  cooldownFrac(element) {
    const cd = this.cooldowns[element] ?? 0;
    const max = settings[element]?.cooldown ?? 1;
    return max > 0 ? clamp(cd / max, 0, 1) : 0;
  }

  _acquire(element) {
    const pool = this.pools[element];
    let inst = pool.find((a) => !a.isActive);
    if (inst) return inst;

    // If under capacity, create a new one
    if (pool.length < MAX_PER_ELEMENT) {
      inst = new FACTORY[element](element, this.ctx);
      this.ctx.scene.add(inst.group);
      pool.push(inst);
      return inst;
    }

    // Reuse the oldest active instance in this element's pool
    let oldest = pool[0];
    let maxAge = -1;
    for (const a of pool) {
      if (a.age > maxAge) {
        maxAge = a.age;
        oldest = a;
      }
    }
    oldest.destroy();
    return oldest;
  }

  cast(element, origin, direction, distance) {
    if ((this.cooldowns[element] ?? 0) > 0) return false;
    const inst = this._acquire(element);
    if (!inst) return false;
    inst.spawn(origin, direction, distance);
    this.cooldowns[element] = settings[element].cooldown;
    if (!this.active.includes(inst)) this.active.push(inst);
    return true;
  }

  update(dt) {
    for (const el of ELEMENTS) {
      this.cooldowns[el] = Math.max(0, (this.cooldowns[el] ?? 0) - dt);
    }
    for (const inst of this.active) {
      inst.update(dt);
      if (inst.isFinished) inst.destroy();
    }
    this.active = this.active.filter((a) => a.isActive);
  }

  clear() {
    for (const el of ELEMENTS) {
      for (const a of this.pools[el]) a.destroy();
    }
    this.active = [];
  }

  forEachActive(fn) {
    for (const a of this.active) fn(a);
  }

  totalParticles() {
    let n = 0;
    for (const el of ELEMENTS) {
      for (const a of this.pools[el]) {
        for (const k in a) {
          if (a[k] && typeof a[k].live === 'number') n += a[k].live;
        }
      }
    }
    return n;
  }
}
