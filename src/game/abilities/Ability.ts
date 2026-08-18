// @ts-nocheck
import { Group, Vector3, Color } from 'three';
import { settings } from '../settings';
import { saturate, Easing, getColor } from '../util';

export const AbilityPhase = Object.freeze({
  IDLE: 'idle', TRAVEL: 'travel', IMPACT: 'impact', FADE: 'fade', DONE: 'done'
});

const _up = new Vector3(0, 1, 0);

/**
 * Abstract base for a linear skillshot. Owns the phase machine, a front that
 * advances along the line at constant m/s, the local frame, and dynamic-light
 * bookkeeping with a decaying impact punch. Subclasses implement the hooks.
 */
export class Ability {
  constructor(element, context) {
    this.element = element;
    this.ctx = context;
    this.group = new Group();
    this.group.name = `Ability:${element}`;
    this.group.matrixAutoUpdate = true;
    this.group.visible = false;
    this.phase = AbilityPhase.IDLE;

    this.origin = new Vector3();
    this.direction = new Vector3(0, 0, 1);
    this.side = new Vector3(1, 0, 0);
    this.length = 1;

    this.front = 0;
    this.u = 0;
    this.position = new Vector3();

    this.age = 0;
    this.impactTime = 0;
    this.fadeTime = 0;

    this.light = null;
    this.lightColor = new Color();
    this.lightBoost = 0;

    this.createShaders();
    this.createParticles();
  }

  get config() { return settings[this.element]; }
  get isActive() { return this.phase !== AbilityPhase.IDLE && this.phase !== AbilityPhase.DONE; }
  get isFinished() { return this.phase === AbilityPhase.DONE; }
  get instanceCount() { return 0; }

  /* subclass hooks */
  createShaders() {}
  createParticles() {}
  onSpawn() {}
  onTravel(_dt) {}
  onImpact() {}
  onFade(_dt, _t) {}
  onDestroy() {}

  get impactDuration() { return 1.1; }
  get fadeDuration() { return 1.2; }
  lightShimmer() { return 0.9 + 0.1 * Math.sin(this.age * 9.3) * Math.sin(this.age * 3.7); }

  spawn(origin, direction, distance) {
    this.origin.set(origin.x, 0, origin.z);
    this.direction.copy(direction).setY(0).normalize();
    this.side.crossVectors(this.direction, _up).normalize();
    this.length = Math.max(0.1, distance);

    this.front = 0;
    this.u = 0;
    this.age = 0;
    this.impactTime = 0;
    this.fadeTime = 0;
    this.lightBoost = 0;
    this.phase = AbilityPhase.TRAVEL;

    this.position.copy(this.origin);
    this.light = this.ctx.lights.acquire();
    this.group.visible = true;
    this.onSpawn();
  }

  pointAt(s, out) {
    return out.copy(this.origin).addScaledVector(this.direction, s * this.length);
  }

  advance(dt) {
    const speed = this.config.speed * settings.global.speed;
    const easeIn = Easing.outQuad(saturate(this.age / 0.08));
    this.front += speed * easeIn * dt;
    const previousU = this.u;
    this.u = saturate(this.front / this.length);
    this.pointAt(this.u, this.position);
    return this.u >= 1 && previousU < 1;
  }

  update(dt) {
    if (!this.isActive) return;
    this.age += dt;
    switch (this.phase) {
      case AbilityPhase.TRAVEL: {
        const reachedEnd = this.advance(dt);
        this.onTravel(dt);
        this._updateLight(dt, 1);
        if (reachedEnd) {
          this.phase = AbilityPhase.IMPACT;
          this.impactTime = 0;
          this.onImpact();
        }
        break;
      }
      case AbilityPhase.IMPACT: {
        this.impactTime += dt;
        const t = saturate(this.impactTime / this.impactDuration);
        this.onFade(dt, t);
        this._updateLight(dt, 1 - Easing.inQuad(t) * 0.45);
        if (t >= 1) { this.phase = AbilityPhase.FADE; this.fadeTime = 0; }
        break;
      }
      case AbilityPhase.FADE: {
        this.fadeTime += dt;
        const t = saturate(this.fadeTime / this.fadeDuration);
        this.onFade(dt, 1 + t);
        this._updateLight(dt, (1 - t) * 0.35);
        if (t >= 1) this.phase = AbilityPhase.DONE;
        break;
      }
      default: break;
    }
    this.updateParticles(dt);
  }

  updateParticles(_dt) {}

  _updateLight(dt, scale) {
    if (!this.light) return;
    const cfg = this.config;
    this.lightColor.copy(getColor(cfg.lightColor));
    const shimmer = this.lightShimmer();
    this.ctx.lights.set(
      this.light, this.position, this.lightColor,
      cfg.lightIntensity * scale * shimmer * settings.global.lights + this.lightBoost,
      cfg.lightRadius * (1 + this.lightBoost * 0.02), dt
    );
    this.lightBoost = Math.max(0, this.lightBoost - this.lightBoost * 4.5 * dt - 0.5 * dt);
  }

  destroy() {
    this.onDestroy();
    this.ctx.lights.release(this.light);
    this.light = null;
    this.group.visible = false;
    this.phase = AbilityPhase.IDLE;
  }
}
