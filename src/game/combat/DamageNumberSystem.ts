// @ts-nocheck
import { Group, Sprite, SpriteMaterial, CanvasTexture, Vector3 } from 'three';

const POOL_SIZE = 40;

const COLOR_MAP = {
  ice: '#a5f3fc',
  thunder: '#93c5fd',
  meteor: '#fdba74',
  beam: '#67e8f9',
  snare: '#d8b4fe',
  physical: '#f1f5f9',
  crit: '#fde047',
  player: '#f87171',
  status: '#86efac'
};

/**
 * High-performance 3D floating combat text system using pre-allocated pooled canvas sprites
 * with crisp typography and subtle ethereal glow.
 */
export class DamageNumberSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    this.group.name = 'DamageNumbers';
    this.scene.add(this.group);

    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const texture = new CanvasTexture(canvas);
      texture.generateMipmaps = false;

      const mat = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
      const sprite = new Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 20;
      sprite.scale.set(2.0, 0.5, 1);
      this.group.add(sprite);

      this.pool.push({
        sprite,
        canvas,
        ctx,
        texture,
        mat,
        active: false,
        age: 0,
        lifetime: 0.85,
        velocity: new Vector3(),
        startPos: new Vector3()
      });
    }
  }

  spawn(position, text, type = 'physical', isCrit = false) {
    let item = this.pool.find((p) => !p.active);
    if (!item) {
      item = this.pool[0];
      let maxAge = -1;
      for (const p of this.pool) {
        if (p.age > maxAge) {
          maxAge = p.age;
          item = p;
        }
      }
    }

    const { ctx, canvas, texture, sprite } = item;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const color = isCrit ? COLOR_MAP.crit : (COLOR_MAP[type] || '#f1f5f9');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = isCrit ? '900 34px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace' : '700 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 32);

    texture.needsUpdate = true;

    const jitterX = (Math.random() - 0.5) * 0.4;
    const jitterZ = (Math.random() - 0.5) * 0.4;
    sprite.position.set(position.x + jitterX, position.y + 0.8, position.z + jitterZ);
    item.startPos.copy(sprite.position);

    item.velocity.set((Math.random() - 0.5) * 0.6, 2.0 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6);
    item.lifetime = isCrit ? 1.0 : 0.8;
    item.age = 0;
    item.active = true;
    item.isCrit = isCrit;
    sprite.visible = true;
    sprite.scale.set(isCrit ? 2.6 : 1.9, isCrit ? 0.65 : 0.48, 1);
  }

  update(dt) {
    for (const item of this.pool) {
      if (!item.active) continue;
      item.age += dt;
      if (item.age >= item.lifetime) {
        item.active = false;
        item.sprite.visible = false;
        continue;
      }

      const t = item.age / item.lifetime;
      item.sprite.position.addScaledVector(item.velocity, dt);
      item.velocity.y -= dt * 1.8;

      const pop = t < 0.2 ? 1 + Math.sin(t * Math.PI * 5) * 0.3 : 1;
      const baseW = item.isCrit ? 2.6 : 1.9;
      const baseH = item.isCrit ? 0.65 : 0.48;
      item.sprite.scale.set(baseW * pop, baseH * pop, 1);

      const alpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      item.mat.opacity = Math.max(0, alpha);
    }
  }

  clear() {
    for (const item of this.pool) {
      item.active = false;
      item.sprite.visible = false;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const item of this.pool) {
      item.texture.dispose();
      item.mat.dispose();
    }
    this.pool.length = 0;
  }
}
