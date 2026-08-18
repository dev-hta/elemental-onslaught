// @ts-nocheck
import { Color } from 'three';

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const saturate = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
export const smoothstep = (e0, e1, x) => {
  const t = saturate(invLerp(e0, e1, x));
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;

/** Frame-rate independent exponential approach (the "damp" idiom). */
export const damp = (current, target, lambda, dt) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

export const Easing = {
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuint: (t) => 1 - (1 - t) ** 5,
  outBack: (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  outElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }
};

/** Deterministic-ish PRNG so two casts of the same ability can differ. */
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export const randRange = (rng, a, b) => a + (b - a) * rng();
export const randSign = (rng) => (rng() < 0.5 ? -1 : 1);

/** Tiny event emitter used by input + aim controllers. */
export class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }
  on(name, fn) {
    if (!this._listeners.has(name)) this._listeners.set(name, new Set());
    this._listeners.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    this._listeners.get(name)?.delete(fn);
  }
  emit(name, ...args) {
    this._listeners.get(name)?.forEach((fn) => fn(...args));
  }
  clear() {
    this._listeners.clear();
  }
}

/** Cached THREE.Color from any hex string so per-frame colour reads are free. */
const _colorCache = new Map();
export function getColor(input) {
  if (typeof input !== 'string') return input;
  let c = _colorCache.get(input);
  if (!c) {
    c = new Color(input);
    _colorCache.set(input, c);
  }
  return c;
}

/** Cheap pseudo-random hash for the fragment shaders. */
export const glslHash = /* glsl */ `
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));
  p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.xx+p3.yz)*p3.zy);
}
`;
