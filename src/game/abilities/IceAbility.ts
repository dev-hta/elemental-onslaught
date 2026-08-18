// @ts-nocheck
import { Object3D, InstancedMesh, ConeGeometry, InstancedBufferAttribute, Mesh, PlaneGeometry, ShaderMaterial, DoubleSide, NormalBlending, AdditiveBlending, Vector3 } from 'three';
import { Ability, AbilityPhase } from './Ability';
import { settings } from '../settings';
import { makeRng, Easing, saturate, clamp } from '../util';
import { ParticleSystem } from '../ParticleSystem';
import { NOISE_GLSL } from '../glsl';

const CAP = 256;
const _dummy = new Object3D();
const _v = new Vector3();

/** Q — Frost Lance: a fracture front races out and ice crystals tear up behind it. */
export class IceAbility extends Ability {
  constructor(element, ctx) {
    super(element, ctx);
  }

  createShaders() {
    this.orient = new Object3D();
    this.group.add(this.orient);

    const geo = new ConeGeometry(0.16, 1, 6, 1);
    geo.translate(0, 0.5, 0);
    geo.setAttribute('aBirth', new InstancedBufferAttribute(new Float32Array(CAP), 1));

    this.mat = new ShaderMaterial({
      transparent: true, depthWrite: true, side: DoubleSide,
      uniforms: {
        uTime: { value: 0 }, uFade: { value: 0 },
        uColorEdge: { value: new Vector3(0.9, 0.97, 1) },
        uColorMid: { value: new Vector3(0.31, 0.76, 1) },
        uColorDeep: { value: new Vector3(0.09, 0.35, 0.58) },
        uOpacity: { value: 0.92 }, uFrost: { value: 0.6 },
        uGlow: { value: 1 }
      },
      vertexShader: `
        attribute float aBirth;
        varying vec3 vWorld; varying vec3 vNormal; varying float vLocalY; varying float vBirth; varying vec3 vView;
        uniform float uTime;
        void main(){
          vLocalY = position.y;
          vBirth = aBirth;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position,1.0);
          vWorld = wp.xyz;
          vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vView = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: NOISE_GLSL + `
        varying vec3 vWorld; varying vec3 vNormal; varying float vLocalY; varying float vBirth; varying vec3 vView;
        uniform vec3 uColorEdge,uColorMid,uColorDeep; uniform float uOpacity,uFrost,uGlow,uFade,uTime;
        void main(){
          float th = pow(abs(dot(normalize(vNormal), normalize(vView))), 0.8);
          vec3 col = mix(uColorDeep, uColorMid, th);
          col = mix(col, uColorEdge, pow(th, 3.0));
          // internal fracture (world-space, fixed physical scale)
          float frac = fbm3(vWorld*4.0);
          col *= 0.7 + 0.5*frac;
          // feather frost creeping up the local axis
          float frost = smoothstep(0.1, 0.9, fbm2(vec2(vLocalY*4.0, vWorld.x*2.0+vWorld.z*2.0))) * uFrost;
          col = mix(col, vec3(0.85,0.95,1.0), frost*0.5);
          // glint
          float glint = smoothstep(0.86, 1.0, fbm3(vWorld*22.0 + uTime*0.4)) * th;
          col += glint * 1.6;
          // birth flash
          col += vBirth * vec3(0.7,0.95,1.2) * 2.0;
          float alpha = uOpacity * (0.45 + 0.55*th) * (1.0 - uFade*0.9);
          gl_FragColor = vec4(col*uGlow, alpha);
        }
      `
    });

    this.crystals = new InstancedMesh(geo, this.mat, CAP);
    this.crystals.frustumCulled = false;
    this.crystals.count = 0;
    this.orient.add(this.crystals);

    // ground frost decal along the line
    this.decalMat = new ShaderMaterial({
      transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uReveal: { value: 0 },
        uColor: { value: new Vector3(0.45, 0.85, 1) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: NOISE_GLSL + `
        varying vec2 vUv; uniform float uTime,uFade,uReveal; uniform vec3 uColor;
        void main(){
          vec2 p = (vUv-0.5);
          float along = clamp(p.y*2.0, -1.0, 1.0); // -1..1 downrange
          float lat = p.x;
          float reveal = smoothstep(uReveal*2.0+0.02, uReveal*2.0-0.06, along);
          vec2 vv = voronoi2(vec2(lat*6.0, along*10.0) + uTime*0.05);
          float plates = smoothstep(0.0, 0.5, vv.y - vv.x);
          float edge = smoothstep(0.5, 0.42, abs(lat));
          float a = (plates*0.5 + edge*0.4) * reveal * (1.0-uFade) * (1.0 - abs(along)*0.3);
          if(a<0.002) discard;
          gl_FragColor = vec4(uColor, a*0.6);
        }
      `
    });
    this.decal = new Mesh(new PlaneGeometry(1, 1), this.decalMat);
    this.decal.rotation.x = -Math.PI / 2;
    this.decal.position.y = 0.03;
    this.orient.add(this.decal);

    // per-crystal records
    this.rec = new Float32Array(CAP * 7); // u,lat,hMul,lean,yawJit,seed,delay
  }

  createParticles() {
    const s = settings.ice;
    this.mist = new ParticleSystem(this.ctx.scene, { capacity: 360, additive: false, gravity: 0.4, drag: 1.2, turb: 0.6, turbScale: 0.6, size: 1.1, opacity: 0.22, colorA: '#cfeaff', colorB: '#7fb8e6', colorC: '#2a4a72' });
    this.shards = new ParticleSystem(this.ctx.scene, { capacity: 260, additive: true, gravity: 11, drag: 0.5, turb: 0.2, size: 0.28, opacity: 0.9, colorA: '#eafbff', colorB: '#6fd0ff', colorC: '#1c4f86' });
    this.glitter = new ParticleSystem(this.ctx.scene, { capacity: 420, additive: true, gravity: -2.2, drag: 0.3, turb: 0.8, turbScale: 0.7, size: 0.16, opacity: 0.9, colorA: '#ffffff', colorB: '#9fe8ff', colorC: '#3aa0ff' });
  }

  onSpawn() {
    const s = settings.ice;
    const count = Math.min(CAP, s.count | 0);
    this.crystals.count = count;
    const rng = makeRng((Date.now() & 0xffff) ^ (this.length * 97) | 0);
    for (let i = 0; i < count; i++) {
      const u = Math.pow(rng(), 1 / (1 + s.frontBias));   // bias toward far
      this.rec[i * 7] = u;
      this.rec[i * 7 + 1] = (rng() * 2 - 1);              // lat fraction
      this.rec[i * 7 + 2] = 0.5 + rng();                  // hMul
      this.rec[i * 7 + 3] = (rng() * 2 - 1) * s.lean;     // lean
      this.rec[i * 7 + 4] = rng() * Math.PI * 2;          // yawJit
      this.rec[i * 7 + 5] = rng() * 100;                  // seed
      this.rec[i * 7 + 6] = rng() * s.birthFade;          // delay
    }
    // hide the rest
    for (let i = count; i < CAP; i++) this.rec[i * 7] = 2;

    this.orient.position.set(this.origin.x, 0, this.origin.z);
    this.orient.rotation.y = Math.atan2(this.direction.x, this.direction.z);
    this.decal.scale.set(2.4, this.length, 1);
    this.decal.position.set(0, 0.03, this.length / 2);
    this.mat.uniforms.uFade.value = 0;
    this.decalMat.uniforms.uFade.value = 0;
    this._mistAcc = 0; this._glitAcc = 0;
    this.mist.reset(); this.shards.reset(); this.glitter.reset();
  }

  onTravel(dt) {
    const s = settings.ice;
    const t = this.ctx.time;
    const speed = s.speed * settings.global.speed;
    const count = this.crystals.count;
    for (let i = 0; i < count; i++) {
      const u = this.rec[i * 7];
      if (u > 1.5) { this.crystals.setMatrixAt(i, _dummy.matrix.identity().scale(_v.set(0, 0, 0))); continue; }
      const latF = this.rec[i * 7 + 1];
      const hMul = this.rec[i * 7 + 2];
      const lean = this.rec[i * 7 + 3];
      const yawJit = this.rec[i * 7 + 4];
      const delay = this.rec[i * 7 + 6];

      const passed = this.u - u;
      const growth = saturate((passed) / Math.max(0.04, s.birthFade * 0.12));
      if (growth <= 0.001) { this.crystals.setMatrixAt(i, _dummy.matrix.identity().scale(_v.set(0,0,0))); continue; }

      const profile = Math.pow(u, s.heightCurve) * (1 - s.clumping * Math.min(1, latF * latF));
      const h = s.height * profile * hMul * Easing.outBack(growth) + 0.15;
      const latM = latF * (0.35 + 1.15 * u);

      _dummy.position.set(latM, 0, u * this.length);
      _dummy.rotation.set(lean, yawJit, lean * 0.4);
      const sxz = 0.7 + 0.5 * (1 - growth);
      _dummy.scale.set(sxz, h, sxz);
      _dummy.updateMatrix();
      this.crystals.setMatrixAt(i, _dummy.matrix);

      const localAge = Math.max(0, passed) * (this.length / Math.max(1, speed));
      const birth = saturate(1 - (localAge - delay) / 0.4);
      this.crystals.geometry.attributes.aBirth.array[i] = birth;
    }
    this.crystals.instanceMatrix.needsUpdate = true;
    this.crystals.geometry.attributes.aBirth.needsUpdate = true;

    // ground frost reveal
    this.decalMat.uniforms.uReveal.value = this.u;
    this.decalMat.uniforms.uTime.value = t;

    // emit mist + glitter near the front
    this.pointAt(this.u, _v);
    this._mistAcc += 40 * dt * settings.global.particles;
    while (this._mistAcc >= 1) { this._mistAcc--; this.mist.burst(1, () => ({ pos: randCircle(_v, 0.6), vel: new Vector3(0, 0.3 + Math.random() * 0.4, 0), life: 0.9 + Math.random() * 0.7, size: 0.25 + Math.random() * 0.3, seed: Math.random() * 100 }), t); }
    this._glitAcc += 26 * dt * settings.global.particles;
    while (this._glitAcc >= 1) { this._glitAcc--; this.glitter.burst(1, () => ({ pos: randCircle(_v, 0.8), vel: new Vector3(0, 1.2 + Math.random() * 1.5, 0), life: 0.8 + Math.random() * 0.6, size: 0.06 + Math.random() * 0.08, seed: Math.random() * 100 }), t); }
  }

  onImpact() {
    const t = this.ctx.time;
    this.lightBoost = 4 * settings.global.impact;
    this.pointAt(1, _v);
    // shard burst + glitter plume at impact
    this.shards.burst(50 * settings.global.particles | 0, () => ({
      pos: _v.clone().setY(0.1),
      vel: new Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 5, (Math.random() - 0.5) * 5),
      life: 0.8 + Math.random() * 0.7, size: 0.1 + Math.random() * 0.25, seed: Math.random() * 100
    }), t);
    this.glitter.burst(60 * settings.global.particles | 0, () => ({
      pos: _v.clone().setY(0.1),
      vel: new Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2),
      life: 0.9 + Math.random() * 0.8, size: 0.08 + Math.random() * 0.1, seed: Math.random() * 100
    }), t);
  }

  onFade(_dt, t) {
    const fade = saturate(Math.max(0, t - 1));
    this.mat.uniforms.uFade.value = fade;
    this.decalMat.uniforms.uFade.value = fade;
    this.mat.uniforms.uTime.value = this.ctx.time;
  }

  updateParticles(dt) {
    const t = this.ctx.time;
    this.mist.update(dt, t); this.shards.update(dt, t); this.glitter.update(dt, t);
    const g = settings.global;
    this.mist.uniforms.uOpacity.value = 0.22 * g.particles;
    this.glitter.uniforms.uOpacity.value = 0.9 * g.particles;
    this.glitter.uniforms.uGlow.value = g.glow;
    this.mat.uniforms.uGlow.value = g.glow;
  }

  onDestroy() {
    this.crystals.count = 0;
    this.mist.reset(); this.shards.reset(); this.glitter.reset();
  }

  get instanceCount() { return this.crystals.count; }
}

function randCircle(center, r) {
  const a = Math.random() * Math.PI * 2;
  const rr = Math.random() * r;
  return new Vector3(center.x + Math.cos(a) * rr, 0.1, center.z + Math.sin(a) * rr);
}
