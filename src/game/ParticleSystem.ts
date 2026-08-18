// @ts-nocheck
import {
  Mesh,
  PlaneGeometry,
  InstancedBufferGeometry,
  InstancedBufferAttribute,
  ShaderMaterial,
  Color,
  AdditiveBlending,
  NormalBlending,
  DoubleSide
} from 'three';
import { NOISE_GLSL } from './glsl';

/**
 * A GPU-simulated, instanced-quad particle system. Motion (velocity, gravity,
 * analytic drag, turbulence), size-over-lifetime, the colour gradient and alpha
 * fade are all evaluated in the shader from per-instance spawn attributes. The
 * CPU only ever writes spawn data, and particles live in a ring buffer so
 * spamming the ability recycles slots instead of allocating.
 */
export class ParticleSystem {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.capacity = Math.max(8, opts.capacity | 0);
    this.additive = opts.additive !== false;
    this.cursor = 0;
    this.live = 0;
    this._dirty = true;

    const cap = this.capacity;
    this.spawn = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.birth = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.seed = new Float32Array(cap);
    for (let i = 0; i < cap; i++) {
      this.life[i] = -1; // born dead
      this.birth[i] = -1e9;
    }

    const base = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    geo.setAttribute('aSpawn', new InstancedBufferAttribute(this.spawn, 3));
    geo.setAttribute('aVel', new InstancedBufferAttribute(this.vel, 3));
    geo.setAttribute('aBirth', new InstancedBufferAttribute(this.birth, 1));
    geo.setAttribute('aLife', new InstancedBufferAttribute(this.life, 1));
    geo.setAttribute('aSize', new InstancedBufferAttribute(this.size, 1));
    geo.setAttribute('aSeed', new InstancedBufferAttribute(this.seed, 1));
    geo.instanceCount = cap;
    this.geo = geo;

    this.uniforms = {
      uTime: { value: 0 },
      uGravity: { value: opts.gravity ?? 0 },
      uDrag: { value: opts.drag ?? 0.6 },
      uTurb: { value: opts.turb ?? 0.0 },
      uTurbScale: { value: opts.turbScale ?? 1.0 },
      uSizeScale: { value: opts.size ?? 1.0 },
      uStretch: { value: opts.stretch ?? 0 },
      uOpacity: { value: opts.opacity ?? 1.0 },
      uColorA: { value: new Color(opts.colorA ?? '#ffffff') },
      uColorB: { value: new Color(opts.colorB ?? '#88ccff') },
      uColorC: { value: new Color(opts.colorC ?? '#336699') },
      uGlow: { value: 1.0 }
    };

    this.mat = new ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: this.additive ? AdditiveBlending : NormalBlending,
      vertexShader: NOISE_GLSL + `
        attribute vec3 aSpawn; attribute vec3 aVel;
        attribute float aBirth; attribute float aLife; attribute float aSize; attribute float aSeed;
        uniform float uTime,uGravity,uDrag,uTurb,uTurbScale,uSizeScale,uStretch;
        varying float vT; varying vec2 vUv; varying float vAlive;
        void main(){
          vUv = uv;
          float age = uTime - aBirth;
          if(age < 0.0 || age > aLife || aLife <= 0.0){
            vAlive = 0.0; gl_Position = vec4(2.0,2.0,2.0,1.0); return;
          }
          vAlive = 1.0;
          float t = age / aLife;
          vT = t;
          float dr = max(uDrag, 0.001);
          vec3 p = aSpawn + aVel * ((1.0 - exp(-dr*age)) / dr);
          p.y -= 0.5 * uGravity * age * age;
          vec3 n = vec3(
            fbm3(aSeed*7.1 + p*uTurbScale + vec3(0.0,0.0,age*1.3)),
            fbm3(aSeed*3.3 + p*uTurbScale + vec3(11.0,0.0,age*1.1)),
            fbm3(aSeed*5.7 + p*uTurbScale + vec3(23.0,0.0,age*1.2))
          );
          p += (n - 0.5) * uTurb * age;
          // floor clamp for ground-hugging systems
          if(p.y < 0.02) p.y = 0.02;
          float g = smoothstep(0.0, 0.15, t);
          float fade = 1.0 - smoothstep(0.55, 1.0, t);
          float sz = aSize * uSizeScale * (g * fade * 0.95 + 0.06);
          vec4 vp = viewMatrix * vec4(p, 1.0);
          vec2 off = position.xy * sz;
          if(uStretch > 0.0){
            vec2 vv = normalize((viewMatrix * vec4(aVel, 0.0)).xy + 1e-5);
            float sp = length(aVel);
            vec2 c2 = vec2(position.x, position.y * (1.0 + uStretch * sp));
            float ca = vv.x, sa = vv.y;
            off = vec2(c2.x*ca - c2.y*sa, c2.x*sa + c2.y*ca) * sz;
          }
          gl_Position = projectionMatrix * (vp + vec4(off, 0.0, 0.0));
        }
      `,
      fragmentShader: `
        varying float vT; varying vec2 vUv; varying float vAlive;
        uniform vec3 uColorA,uColorB,uColorC; uniform float uOpacity,uGlow;
        void main(){
          if(vAlive < 0.5) discard;
          float d = length(vUv - 0.5) * 2.0;
          float soft = smoothstep(1.0, 0.0, d);
          vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 0.5, vT));
          col = mix(col, uColorC, smoothstep(0.5, 1.0, vT));
          col *= uGlow;
          float a = soft * uOpacity * (1.0 - smoothstep(0.8, 1.0, vT));
          gl_FragColor = vec4(col * soft, a);
        }
      `
    });

    this.mesh = new Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  /** Emit `count` particles using the sampler fn(i) -> {pos,vel,life,size,seed}. */
  burst(count, fn, time) {
    const c = Math.max(0, count | 0);
    for (let i = 0; i < c; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const d = fn(i) || {};
      this.spawn[idx * 3] = d.pos?.x ?? 0;
      this.spawn[idx * 3 + 1] = d.pos?.y ?? 0;
      this.spawn[idx * 3 + 2] = d.pos?.z ?? 0;
      this.vel[idx * 3] = d.vel?.x ?? 0;
      this.vel[idx * 3 + 1] = d.vel?.y ?? 0;
      this.vel[idx * 3 + 2] = d.vel?.z ?? 0;
      this.birth[idx] = time;
      this.life[idx] = d.life ?? 1.0;
      this.size[idx] = d.size ?? 0.3;
      this.seed[idx] = d.seed ?? Math.random() * 100;
    }
    this._dirty = true;
  }

  setColors(a, b, c) {
    if (a) this.uniforms.uColorA.value.set(a);
    if (b) this.uniforms.uColorB.value.set(b);
    if (c) this.uniforms.uColorC.value.set(c);
  }
  set(name, v) {
    if (this.uniforms[name]) this.uniforms[name].value = v;
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] > 0 && time - this.birth[i] <= this.life[i]) live++;
    }
    this.live = live;
    if (this._dirty) {
      for (const k of ['aSpawn', 'aVel', 'aBirth', 'aLife', 'aSize', 'aSeed']) {
        this.geo.attributes[k].needsUpdate = true;
      }
      this._dirty = false;
    }
  }

  reset() {
    for (let i = 0; i < this.capacity; i++) this.life[i] = -1;
    this._dirty = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
