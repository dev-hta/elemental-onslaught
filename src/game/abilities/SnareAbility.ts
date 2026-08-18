// @ts-nocheck
import { Object3D, Mesh, InstancedBufferGeometry, BufferAttribute, InstancedBufferAttribute, ShaderMaterial, DoubleSide, AdditiveBlending, Vector3, Color, PlaneGeometry } from 'three';
import { Ability, AbilityPhase } from './Ability';
import { settings } from '../settings';
import { Easing, saturate, getColor } from '../util';
import { ParticleSystem } from '../ParticleSystem';
import { NOISE_GLSL } from '../glsl';

const MAX_TENDRILS = 24;
const _v = new Vector3();

function flatStrip(samples) {
  const geo = new InstancedBufferGeometry();
  const pos = [], aT = [], aSide = [], idx = [];
  for (let i = 0; i <= samples; i++) { aT.push(i / samples, i / samples); aSide.push(-1, 1); pos.push(0, 0, 0, 0, 0, 0); }
  for (let i = 0; i < samples; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('aT', new BufferAttribute(new Float32Array(aT), 1));
  geo.setAttribute('aSide', new BufferAttribute(new Float32Array(aSide), 1));
  geo.setIndex(idx);
  return geo;
}

/** V — Voltaic Snare: the far cast. Field disc + violet column + boundary tendrils. */
export class SnareAbility extends Ability {
  createShaders() {
    this.orient = new Object3D();
    this.group.add(this.orient);

    // burnt field disc
    this.fieldMat = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSnap: { value: 0 }, uFade: { value: 0 }, uRadius: { value: 3 },
        uColor: { value: new Color(0.47, 0.23, 1.0) }, uHot: { value: new Color(0.94, 0.84, 1.0) }, uGlow: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: NOISE_GLSL + `
        varying vec2 vUv; uniform float uTime,uSnap,uFade,uRadius; uniform vec3 uColor,uHot;
        void main(){
          vec2 p=(vUv-0.5)*2.0;
          float r=length(p);
          if(r>1.0) discard;
          // veins via domain warp
          vec2 q=p*3.0;
          q+=(vec2(vnoise2(q+1.0),vnoise2(q+4.0))-0.5)*1.6;
          float vein=smoothstep(0.52,0.64, vnoise2(q));
          float flick=0.6+0.4*sin(uTime*9.0+vnoise2(q*2.0)*20.0);
          // rim arcs at the boundary
          float rim=smoothstep(0.86,0.97,r)*(0.5+0.5*sin(atan(p.y,p.x)*12.0+uTime*4.0));
          float center=smoothstep(0.25,0.0,r);
          float a=(vein*0.7 + rim*0.9 + center*0.5)*(1.0-uFade);
          if(a<0.002) discard;
          vec3 col=mix(uColor,uHot, vein);
          gl_FragColor=vec4(col*flick, a);
        }
      `
    });
    this.field = new Mesh(new PlaneGeometry(1, 1), this.fieldMat);
    this.field.rotation.x = -Math.PI / 2; this.field.position.y = 0.04;
    this.orient.add(this.field);

    // column (vertical ribbon)
    this.colMat = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      uniforms: { uCenter: { value: new Vector3() }, uTime: { value: 0 }, uSnap: { value: 0 },
        uHeight: { value: 4.6 }, uThroat: { value: 0.4 }, uSpread: { value: 1.4 }, uTwist: { value: 6 },
        uWidth: { value: 0.1 }, uColor: { value: new Color(0.63,0.35,1.0) }, uHot: { value: new Color(0.95,0.85,1.0) }, uGlow: { value: 1 } },
      vertexShader: NOISE_GLSL + `
        attribute float aT; attribute float aSide;
        uniform vec3 uCenter; uniform float uTime,uSnap,uHeight,uThroat,uSpread,uTwist,uWidth;
        varying float vT;
        void main(){
          float t=aT;
          float h=uHeight*uSnap;
          float rad=mix(uThroat,uSpread,t)*uSnap;
          float ang=t*uTwist*6.2831+uTime*2.0;
          vec3 c=uCenter+vec3(0.0,t*h,0.0)+vec3(cos(ang),0.0,sin(ang))*rad;
          vec3 view=normalize(cameraPosition-c);
          vec3 upa=vec3(0,1,0);
          vec3 facing=normalize(cross(upa,view));
          vT=t;
          vec3 world=c+facing*aSide*uWidth;
          gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);
        }
      `,
      fragmentShader: `varying float vT; uniform vec3 uColor,uHot; uniform float uGlow; void main(){
        float f=1.0-smoothstep(0.0,1.0,vT);
        gl_FragColor=vec4(mix(uColor,uHot,f)*uGlow, 0.85);
      }`
    });
    this.column = new Mesh(flatStrip(24), this.colMat); this.column.geometry.instanceCount = 1; this.column.frustumCulled = false; this.column.renderOrder = 7;
    this.group.add(this.column);

    // tendrils (instanced flat ribbons crawling to the boundary)
    const tend = flatStrip(20);
    const ang = new Float32Array(MAX_TENDRILS), veer = new Float32Array(MAX_TENDRILS), seed = new Float32Array(MAX_TENDRILS);
    for (let i = 0; i < MAX_TENDRILS; i++) { ang[i] = (i / MAX_TENDRILS) * Math.PI * 2 + Math.random(); veer[i] = (Math.random() - 0.5) * 1.5; seed[i] = Math.random() * 100; }
    tend.setAttribute('aAngle', new InstancedBufferAttribute(ang, 1));
    tend.setAttribute('aVeer', new InstancedBufferAttribute(veer, 1));
    tend.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1));
    tend.instanceCount = 0;
    this.tend = tend;
    this.tendMat = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      uniforms: { uCenter: { value: new Vector3() }, uTime: { value: 0 }, uSnap: { value: 0 }, uRadius: { value: 3 },
        uWidth: { value: 0.07 }, uColor: { value: new Color(0.7,0.4,1.0) }, uHot: { value: new Color(1.0,0.9,1.0) }, uGlow: { value: 1 } },
      vertexShader: NOISE_GLSL + `
        attribute float aT; attribute float aSide; attribute float aAngle; attribute float aVeer; attribute float aSeed;
        uniform vec3 uCenter; uniform float uTime,uSnap,uRadius,uWidth;
        varying float vT;
        void main(){
          float t=aT;
          float dir=aAngle+aVeer*t;
          vec2 d=vec2(cos(dir),sin(dir));
          float rad=t*uRadius*uSnap;
          vec2 flat=d*rad;
          flat+=vec2(vnoise2(vec2(t*6.0,aSeed))-0.5, vnoise2(vec2(t*6.0+5.0,aSeed))-0.5)*0.5*uRadius*uSnap;
          vec3 c=vec3(uCenter.x+flat.x,0.12,uCenter.z+flat.y);
          vec3 view=normalize(cameraPosition-c);
          vec3 fwd=normalize(vec3(d.x,0.0,d.y));
          vec3 facing=normalize(cross(fwd,view));
          vT=t;
          vec3 world=c+facing*aSide*uWidth*(0.6+0.4*(1.0-t));
          gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);
        }
      `,
      fragmentShader: `varying float vT; uniform vec3 uColor,uHot; uniform float uGlow; void main(){
        gl_FragColor=vec4(mix(uColor,uHot,1.0-vT)*uGlow,0.7);
      }`
    });
    this.tendrils = new Mesh(tend, this.tendMat); this.tendrils.frustumCulled = false; this.tendrils.renderOrder = 7;
    this.group.add(this.tendrils);
  }

  createParticles() {
    this.updraft = new ParticleSystem(this.ctx.scene, { capacity: 360, additive: true, gravity: -3.0, drag: 0.4, turb: 0.7, size: 0.14, opacity: 0.8, colorA: '#f0d8ff', colorB: '#a05bff', colorC: '#4a1a8a' });
    this.sparks = new ParticleSystem(this.ctx.scene, { capacity: 240, additive: true, gravity: 5, drag: 0.6, size: 0.1, stretch: 0.4, opacity: 0.9, colorA: '#ffffff', colorB: '#c08bff', colorC: '#5a1ad0' });
  }

  get impactDuration() { return 1.4; }
  get fadeDuration() { return 0.9; }

  advance(dt) {
    const s = settings.snare;
    const prevU = this.u;
    this.u = saturate(this.age / s.snapTime);
    this.pointAt(1, this.position);
    this.position.y = 0.5;
    return this.age >= s.snapTime && prevU < 1;
  }

  _center() { const c = this.pointAt(1, _v).clone(); c.y = 0; return c; }

  onSpawn() {
    const s = settings.snare;
    const c = this._center();
    this.orient.position.copy(c);
    this.orient.rotation.y = Math.atan2(this.direction.x, this.direction.z);
    const rad = Math.max(0.5, s.zoneRadius);
    this.field.scale.set(rad * 2, rad * 2, 1);
    this.fieldMat.uniforms.uRadius.value = rad;
    this.colMat.uniforms.uCenter.value.copy(c); this.colMat.uniforms.uHeight.value = s.height; this.colMat.uniforms.uThroat.value = s.throat; this.colMat.uniforms.uSpread.value = s.columnSpread;
    this.tendMat.uniforms.uCenter.value.copy(c); this.tendMat.uniforms.uRadius.value = rad;
    this.tend.instanceCount = Math.min(MAX_TENDRILS, s.tendrils | 0);
    this.fieldMat.uniforms.uFade.value = 0;
    this._upAcc = 0;
    this.updraft.reset(); this.sparks.reset();
  }

  _snapValue() {
    // overshoot then settle
    const t = this.u;
    const ease = 1 - Math.pow(1 - t, 3);
    return ease * (1 + 0.12 * Math.sin(t * Math.PI));
  }

  onTravel(dt) {
    const t = this.ctx.time;
    const snap = this._snapValue();
    this.fieldMat.uniforms.uSnap.value = snap;
    this.colMat.uniforms.uSnap.value = snap;
    this.tendMat.uniforms.uSnap.value = snap;
    this.fieldMat.uniforms.uTime.value = t;
    this.colMat.uniforms.uTime.value = t;
    this.tendMat.uniforms.uTime.value = t;
    this._syncColors();

    // updraft hauling air into the pillar
    this._upAcc += 40 * dt * settings.global.particles;
    const c = this._center();
    while (this._upAcc >= 1) {
      this._upAcc--;
      const a = Math.random() * Math.PI * 2, rr = Math.random() * settings.snare.zoneRadius;
      const p = new Vector3(c.x + Math.cos(a) * rr, 0.1, c.z + Math.sin(a) * rr);
      this.updraft.burst(1, () => ({
        pos: p, vel: new Vector3(0, 2 + Math.random() * 3, 0),
        life: 0.7 + Math.random() * 0.7, size: 0.07 + Math.random() * 0.1, seed: Math.random() * 100
      }), t);
    }
  }

  _syncColors() {
    const s = settings.snare;
    this.fieldMat.uniforms.uColor.value.set(s.fieldColor); this.fieldMat.uniforms.uHot.value.set(s.colorCore);
    this.colMat.uniforms.uColor.value.set(s.colorGlow); this.colMat.uniforms.uHot.value.set(s.colorCore);
    this.tendMat.uniforms.uColor.value.set(s.colorGlow); this.tendMat.uniforms.uHot.value.set(s.colorCore);
    const g = settings.global.glow;
    this.fieldMat.uniforms.uGlow.value = g; this.colMat.uniforms.uGlow.value = g; this.tendMat.uniforms.uGlow.value = g;
  }

  onImpact() {
    this.lightBoost = 4 * settings.global.impact;
    const t = this.ctx.time;
    const c = this._center();
    this.sparks.burst(50 * settings.global.particles | 0, () => ({
      pos: c.clone().setY(0.1),
      vel: new Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 4),
      life: 0.4 + Math.random() * 0.5, size: 0.05 + Math.random() * 0.1, seed: Math.random() * 100
    }), t);
  }

  onFade(_dt, phase) {
    const fade = saturate(Math.max(0, phase - 0.6));
    this.fieldMat.uniforms.uFade.value = fade;
    // collapse column/tendrils
    const col = 1 - fade;
    this.colMat.uniforms.uSnap.value = this._snapValue() * col;
    this.tendMat.uniforms.uSnap.value = this._snapValue() * col;
  }

  updateParticles(dt) {
    const t = this.ctx.time;
    this.updraft.update(dt, t); this.sparks.update(dt, t);
    const g = settings.global;
    this.updraft.uniforms.uGlow.value = g.glow; this.updraft.uniforms.uOpacity.value = 0.8 * g.particles;
    this.sparks.uniforms.uGlow.value = g.glow; this.sparks.uniforms.uOpacity.value = 0.9 * g.particles;
  }

  onDestroy() {
    this.tend.instanceCount = 0;
    this.fieldMat.uniforms.uSnap.value = 0;
    this.colMat.uniforms.uSnap.value = 0;
    this.updraft.reset(); this.sparks.reset();
  }

  get instanceCount() { return this.phase === AbilityPhase.IDLE ? 0 : this.tend.instanceCount; }
}

void Easing; void AbilityPhase;
