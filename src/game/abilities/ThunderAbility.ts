// @ts-nocheck
import { Object3D, Mesh, InstancedBufferGeometry, BufferAttribute, InstancedBufferAttribute, ShaderMaterial, DoubleSide, AdditiveBlending, Vector3, Color, PlaneGeometry } from 'three';
import { Ability } from './Ability';
import { settings } from '../settings';
import { makeRng, Easing, saturate, clamp } from '../util';
import { ParticleSystem } from '../ParticleSystem';
import { NOISE_GLSL } from '../glsl';

const MAX_STRANDS = 24;
const SAMPLES = 48;
const _v = new Vector3();

function ribbonStrip() {
  const geo = new InstancedBufferGeometry();
  const pos = [];
  const aT = [];
  const aSide = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    aT.push(t, t); aSide.push(-1, 1);
    pos.push(0, 0, 0, 0, 0, 0);
  }
  const idx = [];
  for (let i = 0; i < SAMPLES; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    idx.push(a, b, c, b, d, c);
  }
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('aT', new BufferAttribute(new Float32Array(aT), 1));
  geo.setAttribute('aSide', new BufferAttribute(new Float32Array(aSide), 1));
  geo.setIndex(idx);
  return geo;
}

/** E — Storm Lance: lightning filaments drawn out behind the strike front. */
export class ThunderAbility extends Ability {
  createShaders() {
    this.orient = new Object3D();
    this.group.add(this.orient);

    const geo = ribbonStrip();
    const fan = new Float32Array(MAX_STRANDS);
    const phase = new Float32Array(MAX_STRANDS);
    const seed = new Float32Array(MAX_STRANDS);
    for (let i = 0; i < MAX_STRANDS; i++) { fan[i] = i; phase[i] = Math.random(); seed[i] = Math.random() * 100; }
    geo.setAttribute('aFan', new InstancedBufferAttribute(fan, 1));
    geo.setAttribute('aPhase', new InstancedBufferAttribute(phase, 1));
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1));
    geo.instanceCount = 0;
    this.geo = geo;

    const vert = NOISE_GLSL + `
      attribute float aT; attribute float aSide; attribute float aFan; attribute float aPhase; attribute float aSeed;
      uniform vec3 uHand,uTarget; uniform float uStrands,uSpread,uSpreadNear,uTwist,uSag,uJitter,uJitterScale,uTime,uWidth,uSeed,uRestrike,uCrawl;
      varying float vT; varying float vEdge;
      void main(){
        float t = aT;
        vec3 axis = mix(uHand, uTarget, t);
        axis.y -= uSag * 0.5 * sin(t*3.14159);
        vec3 axisDir = normalize(uTarget - uHand + vec3(0.0001,0.5,0.0001));
        vec3 up = vec3(0.0,1.0,0.0);
        vec3 Nn = normalize(cross(axisDir, up));
        vec3 Bn = normalize(cross(axisDir, Nn));
        float a = (aFan/max(uStrands,1.0))*6.2831 + uTwist*t + aPhase*6.28;
        float rad = mix(uSpreadNear, uSpread, t);
        vec3 fanOff = (Nn*cos(a) + Bn*sin(a)) * rad;
        float rs = floor(uTime*uRestrike);
        float cr = uTime*uCrawl;
        float k1 = vnoise3(vec3(t*uJitterScale + cr, aFan*0.7+5.0, uSeed+rs+aSeed)) - 0.5;
        float k2 = vnoise3(vec3(t*uJitterScale + cr + 11.0, aFan*1.3, uSeed+rs+aSeed+3.0)) - 0.5;
        vec3 kink = (Nn*k1 + Bn*k2) * uJitter * (0.4 + t*0.9);
        vec3 center = axis + fanOff + kink;
        vec3 view = normalize(cameraPosition - center);
        vec3 facing = normalize(cross(axisDir, view));
        vec3 world = center + facing * aSide * uWidth;
        vT = t; vEdge = aSide*0.5+0.5;
        gl_Position = projectionMatrix * viewMatrix * vec4(world,1.0);
      }
    `;
    const frag = `
      varying float vT; varying float vEdge;
      uniform vec3 uColorCore,uColorGlow; uniform float uOpacity,uGlow,uCore;
      void main(){
        float core = smoothstep(0.5,0.0,abs(vEdge-0.5)*2.0);
        core = mix(core, 1.0, uCore);
        vec3 col = mix(uColorGlow, uColorCore, core);
        float fade = smoothstep(1.0, 0.85, vT) * smoothstep(0.0,0.06,vT);
        float a = uOpacity * (0.2 + core) * fade;
        gl_FragColor = vec4(col*uGlow, a);
      }
    `;

    this.haloMat = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      uniforms: this._u({ uWidth: 0.5, uColorCore: '#2e6bff', uColorGlow: '#2e6bff', uOpacity: 0.35, uCore: 0.0 }) });
    this.coreMat = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      uniforms: this._u({ uWidth: 0.12, uColorCore: '#eaf6ff', uColorGlow: '#5ab0ff', uOpacity: 1.0, uCore: 0.7 }) });
    this.haloMat.vertexShader = vert; this.haloMat.fragmentShader = frag;
    this.coreMat.vertexShader = vert; this.coreMat.fragmentShader = frag;

    this.halo = new Mesh(geo, this.haloMat); this.halo.frustumCulled = false; this.halo.renderOrder = 6;
    this.core = new Mesh(geo, this.coreMat); this.core.frustumCulled = false; this.core.renderOrder = 7;
    this.group.add(this.halo, this.core);

    // ground burn decal
    this.decalMat = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uReveal: { value: 0 }, uFade: { value: 0 }, uColor: { value: new Vector3(0.22,0.48,1) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: NOISE_GLSL + `
        varying vec2 vUv; uniform float uTime,uReveal,uFade; uniform vec3 uColor;
        void main(){
          vec2 p=(vUv-0.5); float along=p.y*2.0, lat=p.x;
          float reveal=smoothstep(uReveal*2.0+0.02,uReveal*2.0-0.08,along);
          // branching burn via domain-warped noise
          vec2 q=vec2(lat*4.0, along*12.0);
          q += (vec2(vnoise2(q+1.7), vnoise2(q+5.3))-0.5)*1.5;
          float burn = smoothstep(0.55,0.7, vnoise2(q));
          float a = burn*0.6*reveal*(1.0-uFade);
          if(a<0.002) discard;
          gl_FragColor=vec4(uColor, a);
        }
      `
    });
    this.decal = new Mesh(new PlaneGeometry(1,1), this.decalMat);
    this.decal.rotation.x = -Math.PI/2; this.decal.position.y = 0.03;
    this.orient.add(this.decal);
    this._seed = 0;
  }

  _u(extra) {
    const s = settings.thunder;
    return Object.assign({
      uHand: { value: new Vector3() }, uTarget: { value: new Vector3() },
      uStrands: { value: s.strands }, uSpread: { value: s.spread }, uSpreadNear: { value: s.spreadNear },
      uTwist: { value: s.twist }, uSag: { value: s.sag }, uJitter: { value: s.jitter }, uJitterScale: { value: s.jitterScale },
      uTime: { value: 0 }, uWidth: { value: 0.12 }, uSeed: { value: 0 }, uRestrike: { value: s.restrike }, uCrawl: { value: s.crawl },
      uGlow: { value: 1 }, uColorCore: { value: new Color() }, uColorGlow: { value: new Color() }, uOpacity: { value: 1 }, uCore: { value: 0 }
    }, extra);
  }

  _syncUniforms() {
    const s = settings.thunder;
    const hand = this.origin.clone().addScaledVector(this.direction, 0.3); hand.y = 1.35;
    const target = this.pointAt(1, _v).clone(); target.y = 0.4;
    for (const m of [this.haloMat, this.coreMat]) {
      const u = m.uniforms;
      u.uHand.value.copy(hand); u.uTarget.value.copy(target);
      u.uStrands.value = s.strands; u.uSpread.value = s.spread; u.uSpreadNear.value = s.spreadNear;
      u.uTwist.value = s.twist; u.uSag.value = s.sag; u.uJitter.value = s.jitter; u.uJitterScale.value = s.jitterScale;
      u.uRestrike.value = s.restrike; u.uCrawl.value = s.crawl; u.uSeed.value = this._seed;
    }
    this.haloMat.uniforms.uColorGlow.value = getColor(s.colorHalo); this.haloMat.uniforms.uColorCore.value = getColor(s.colorHalo);
    this.coreMat.uniforms.uColorCore.value = getColor(s.colorCore); this.coreMat.uniforms.uColorGlow.value = getColor(s.colorGlow);
    this.haloMat.uniforms.uGlow.value = settings.global.glow; this.coreMat.uniforms.uGlow.value = settings.global.glow;
  }

  createParticles() {
    this.sparks = new ParticleSystem(this.ctx.scene, { capacity: 420, additive: true, gravity: 9, drag: 0.6, turb: 0.3, size: 0.16, stretch: 0.5, opacity: 0.95, colorA: '#ffffff', colorB: '#8fd0ff', colorC: '#2e6bff' });
    this.motes = new ParticleSystem(this.ctx.scene, { capacity: 240, additive: true, gravity: -0.4, drag: 1.0, turb: 0.5, size: 0.12, opacity: 0.7, colorA: '#cfe6ff', colorB: '#5aa0ff', colorC: '#1a3a8a' });
  }

  onSpawn() {
    this._seed = Math.random() * 100;
    this.geo.instanceCount = Math.min(MAX_STRANDS, settings.thunder.strands | 0);
    this._syncUniforms();
    this.orient.position.set(this.origin.x, 0, this.origin.z);
    this.orient.rotation.y = Math.atan2(this.direction.x, this.direction.z);
    this.decal.scale.set(2.2, this.length, 1);
    this.decal.position.set(0, 0.03, this.length / 2);
    this.decalMat.uniforms.uFade.value = 0;
    this._sparkAcc = 0;
    this.sparks.reset(); this.motes.reset();
  }

  onTravel(dt) {
    const t = this.ctx.time;
    this.haloMat.uniforms.uTime.value = t; this.coreMat.uniforms.uTime.value = t;
    this._syncUniforms();
    this.decalMat.uniforms.uReveal.value = this.u;
    this.decalMat.uniforms.uTime.value = t;

    // sparks shed along the whole bolt
    this._sparkAcc += 60 * dt * settings.global.particles;
    const hand = this.origin.clone().addScaledVector(this.direction, 0.3); hand.y = 1.35;
    const target = this.pointAt(this.u, _v);
    while (this._sparkAcc >= 1) {
      this._sparkAcc--;
      const f = Math.random();
      const p = hand.clone().lerp(target, f);
      this.sparks.burst(1, () => ({
        pos: p,
        vel: new Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2),
        life: 0.3 + Math.random() * 0.4, size: 0.05 + Math.random() * 0.1, seed: Math.random() * 100
      }), t);
    }
    this.motes.burst((4 * dt * settings.global.particles) | 0 || (Math.random() < dt * 4 ? 1 : 0), () => ({
      pos: hand.clone().lerp(target, Math.random()).add(new Vector3((Math.random()-0.5), Math.random()*0.6, (Math.random()-0.5))),
      vel: new Vector3((Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4),
      life: 0.8 + Math.random() * 0.8, size: 0.08 + Math.random() * 0.08, seed: Math.random() * 100
    }), t);
  }

  onImpact() {
    this.lightBoost = 5 * settings.global.impact;
    const t = this.ctx.time;
    const p = this.pointAt(1, _v);
    this.sparks.burst(80 * settings.global.particles | 0, () => ({
      pos: p.clone(),
      vel: new Vector3((Math.random() - 0.5) * 7, 1 + Math.random() * 5, (Math.random() - 0.5) * 7),
      life: 0.4 + Math.random() * 0.5, size: 0.06 + Math.random() * 0.14, seed: Math.random() * 100
    }), t);
  }

  onFade(_dt, phase) {
    const fade = saturate(Math.max(0, phase - 1));
    this.haloMat.uniforms.uOpacity.value = 0.35 * (1 - fade);
    this.coreMat.uniforms.uOpacity.value = 1.0 * (1 - fade);
    this.decalMat.uniforms.uFade.value = fade;
  }

  updateParticles(dt) {
    const t = this.ctx.time;
    this.sparks.update(dt, t); this.motes.update(dt, t);
    this.sparks.uniforms.uGlow.value = settings.global.glow;
    this.sparks.uniforms.uOpacity.value = 0.95 * settings.global.particles;
  }

  onDestroy() {
    this.geo.instanceCount = 0;
    this.sparks.reset(); this.motes.reset();
  }

  get instanceCount() { return this.geo.instanceCount * (SAMPLES + 1) * 2; }
}

void Easing; void clamp;
