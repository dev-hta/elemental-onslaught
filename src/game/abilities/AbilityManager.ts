// @ts-nocheck
import { settings, ELEMENTS } from '../settings';
import { clamp } from '../util';
import { IceAbility } from './IceAbility';
import { ThunderAbility } from './ThunderAbility';
import { MeteorAbility } from './MeteorAbility';
import { BeamAbility } from './BeamAbility';
import { SnareAbility } from './SnareAbility';

const MAX_TOTAL = 4; // pool ceiling across all slots

const FACTORY = {
  ice: IceAbility, thunder: ThunderAbility, meteor: MeteorAbility, beam: BeamAbility, snare: SnareAbility
};

/** Pools abilities per element, enforces per-slot cooldowns, drives updates. */
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
    let n = 0;
    for (const el of ELEMENTS) for (const a of this.pools[el]) if (a.isActive) n++;
    return n;
  }

  canCast(element) { return (this.cooldowns[element] ?? 0) <= 0; }

  cooldownFrac(element) {
    const cd = this.cooldowns[element] ?? 0;
    const max = settings[element]?.cooldown ?? 1;
    return max > 0 ? clamp(cd / max, 0, 1) : 0;
  }

  _acquire(element) {
    const pool = this.pools[element];
    let inst = pool.find((a) => !a.isActive);
    if (inst) return inst;
    if (this.totalActive >= MAX_TOTAL) {
      // steal the oldest finished-free slot anywhere by reusing a non-active instance
      for (const el of ELEMENTS) {
        const free = this.pools[el].find((a) => !a.isActive);
        if (free) return free.element === element ? free : null;
      }
      return null;
    }
    inst = new FACTORY[element](element, this.ctx);
    this.ctx.scene.add(inst.group);
    pool.push(inst);
    return inst;
  }

  cast(element, origin, direction, distance) {
    if ((this.cooldowns[element] ?? 0) > 0) return false;
    const inst = this._acquire(element);
    if (!inst) return false;
    if (inst.element !== element) return false;
    inst.spawn(origin, direction, distance);
    this.cooldowns[element] = settings[element].cooldown;
    if (!this.active.includes(inst)) this.active.push(inst);
    return true;
  }

  update(dt) {
    for (const el of ELEMENTS) this.cooldowns[el] = Math.max(0, (this.cooldowns[el] ?? 0) - dt);
    for (const inst of this.active) {
      inst.update(dt);
      if (inst.isFinished) inst.destroy();
    }
    this.active = this.active.filter((a) => a.isActive);
  }

  clear() {
    for (const el of ELEMENTS) for (const a of this.pools[el]) a.destroy();
    this.active = [];
  }

  forEachActive(fn) { for (const a of this.active) fn(a); }

  totalParticles() {
    let n = 0;
    for (const el of ELEMENTS) for (const a of this.pools[el]) {
      for (const k in a) if (a[k] && typeof a[k].live === 'number') n += a[k].live;
    }
    return n;
  }
}
