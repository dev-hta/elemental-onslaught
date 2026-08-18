// @ts-nocheck
import { PointLight, Color } from 'three';

/**
 * Six dynamic point lights created at boot and parked at zero intensity rather
 * than added/removed — changing the light count forces every material to
 * recompile. acquire() returns null when the pool is exhausted and every use of
 * the handle is guarded by the caller.
 */
const LIGHT_GAIN = 28; // candela scale; tuned against the bloom pass

export class LightPool {
  constructor(scene, count = 6) {
    this.scene = scene;
    this.lights = [];
    this.free = [];
    for (let i = 0; i < count; i++) {
      const l = new PointLight(0x000000, 0, 30, 2);
      l.visible = true;
      scene.add(l);
      this.lights.push(l);
      this.free.push(l);
    }
  }

  acquire() {
    return this.free.pop() ?? null;
  }

  release(light) {
    if (!light) return;
    light.intensity = 0;
    light.color.set(0x000000);
    this.free.push(light);
  }

  set(light, position, color, intensity, distance, _dt) {
    if (!light) return;
    light.position.copy(position);
    if (color) light.color.copy(color instanceof Color ? color : color);
    light.intensity = intensity * LIGHT_GAIN;
    light.distance = Math.max(2, distance);
  }

  releaseAll() {
    for (const l of this.lights) {
      l.intensity = 0;
      this.free.push(l);
    }
    this.free = this.lights.slice();
  }

  dispose() {
    for (const l of this.lights) this.scene.remove(l);
    this.lights.length = 0;
    this.free.length = 0;
  }
}
