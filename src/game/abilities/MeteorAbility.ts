// @ts-nocheck
import { Object3D, Mesh, IcosahedronGeometry, ShaderMaterial, DoubleSide, AdditiveBlending, Vector3, PlaneGeometry, RingGeometry } from 'three';
import { Ability } from './Ability';
import { settings } from '../settings';
import { Easing, saturate } from '../util';
import { ParticleSystem } from '../ParticleSystem';
import { NOISE_GLSL } from '../glsl';

const _v = new Vector3();

/** R — Cinder Fall: a burning rock lobbed on an arc that detonates and cracks the floor. */
export class MeteorAbility extends Ability {
  createShaders() {
    this.orient = new Object3D();
    this.group.add(this.orient);

    this.mat = new ShaderMaterial({
      transparent: true, depthWrite: true,
      uniforms: {
        uTime: { value: 0 }, uHeat: { value: 0 }, uFade: { value: 0 },
        uRock: { value: new Vector3(0.22, 0.16, 0.15) },
        uLava: { value: new Vector3(1.0, 0.45, 0.1) },
        uGlow: { value: 1 }
      },
      vertexShader: NOISE_GLSL + `
        varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal;
        uniform float uTime;
        void main(){
          vec3 n = normalize(normal);
          float d = (fbm3(n*3.5)-0.5)*0.5;
          vec3 p = position + n*d;
          vLocal = n;
          vec4 wp = modelMatrix * vec4(p,1.0);
          vWorld = wp.xyz;
          vNormal = normalize(mat3(modelMatrix)*n);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: NOISE_GLSL + `
        varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal;
        uniform vec3 uRock,uLava; uniform float uTime,uHeat,uFade,uGlow;
        void main(){
          float seam = fbm3(vLocal*4.0 + 7.0);
          float lava = smoothstep(0.55, 0.62, seam);
          float flick = 0.7 + 0.3*sin(uTime*18.0 + seam*30.0);
          vec3 col = mix(uRock, uLava*1.6, lava*(0.3+uHeat));
          col += uLava * lava * uHeat * flick * 1.5;
          col *= 1.0 - uFade;
          gl_FragColor = vec4(col*uGlow, 1.0);
        }
      `
    });
    this.meteor = new Mesh(new IcosahedronGeometry(1, 3), this.mat);
    this.meteor.frustumCulled = false;
    this.group.add(this.meteor);

    // molten cracks decal at impact
    this.crackMat = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uReveal: { value: 0 }, uFade: { value: 0 },
        uColor: { value: new Vector3(1.0,0.45,0.12) }, uHot: { value: new Vector3(1.0,0.8,0.3) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: NOISE_GLSL + `
        varying vec2 vUv; uniform float uTime,uReveal,uFade; uniform vec3 uColor,uHot;
        void main(){
          vec2 p=(vUv-0.5)*2.0;
          float r=length(p);
          if(r>1.0) discard;
          float grow=smoothstep(1.0,0.0,r);
          vec2 q=p*3.0;
          q+=(vec2(vnoise2(q+1.0),vnoise2(q+4.0))-0.5)*1.4;
          float net=vnoise2(q);
          float cracks=smoothstep(0.5,0.62,net)*grow;
          float flick=0.6+0.4*sin(uTime*10.0+net*20.0);
          float a=cracks*(1.0-uFade)*uReveal;
          if(a<0.002) discard;
          vec3 col=mix(uColor,uHot,smoothstep(0.6,0.7,net));
          gl_FragColor=vec4(col*flick, a);
        }
      `
    });
    this.cracks = new Mesh(new PlaneGeometry(1,1), this.crackMat);
    this.cracks.rotation.x=-Math.PI/2; this.cracks.position.y=0.04;
    this.cracks.visible=false;
    this.group.add(this.cracks);

    // expanding shockwave ring
    this.ringMat = new ShaderMaterial({ transparent:true, depthWrite:false, side:DoubleSide, blending:AdditiveBlending,
      uniforms:{ uT:{value:0}, uColor:{value:new Vector3(1.0,0.6,0.25)} },
      vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`varying vec2 vUv; uniform float uT; uniform vec3 uColor;
        void main(){ float d=abs(length(vUv-0.5)*2.0-0.8); float a=smoothstep(0.12,0.0,d)*(1.0-uT); gl_FragColor=vec4(uColor*(1.0-uT),a); }`
    });
    this.ring = new Mesh(new PlaneGeometry(1,1), this.ringMat);
    this.ring.rotation.x=-Math.PI/2; this.ring.position.y=0.05; this.ring.visible=false;
    this.group.add(this.ring);
  }

  createParticles() {
    this.trail = new ParticleSystem(this.ctx.scene, { capacity: 360, additive: true, gravity: -1.0, drag: 1.2, turb: 0.4, size: 0.5, opacity: 0.8, colorA: '#fff2c0', colorB: '#ff7a2a', colorC: '#7a1a05' });
    this.chunks = new ParticleSystem(this.ctx.scene, { capacity: 300, additive: true, gravity: 10, drag: 0.4, turb: 0.2, size: 0.3, opacity: 0.95, colorA: '#ffd27f', colorB: '#ff5a1e', colorC: '#3a1408' });
    this.sparks = new ParticleSystem(this.ctx.scene, { capacity: 240, additive: true, gravity: 8, drag: 0.5, size: 0.12, stretch: 0.4, opacity: 0.95, colorA: '#ffffff', colorB: '#ffb060', colorC: '#ff3a00' });
  }

  onSpawn() {
    this.cracks.visible = false; this.ring.visible = false;
    this.meteor.visible = true;
    this.mat.uniforms.uHeat.value = 0; this.mat.uniforms.uFade.value = 0;
    this.crackMat.uniforms.uReveal.value = 0; this.crackMat.uniforms.uFade.value = 0;
    this._trailAcc = 0;
    this.trail.reset(); this.chunks.reset(); this.sparks.reset();
    this.r = settings.meteor.radius;
  }

  onTravel(dt) {
    const s = settings.meteor;
    const t = this.ctx.time;
    const u = this.u;
    this.pointAt(u, _v);
    const y = s.arcHeight * Math.sin(Math.PI * u) + s.radius;
    this.position.set(_v.x, y, _v.z);
    this.meteor.position.copy(this.position);
    const sc = s.radius * (1 + 0.06 * Math.sin(t * 30));
    this.meteor.scale.setScalar(sc);
    this.meteor.rotation.x += dt * 2; this.meteor.rotation.y += dt * 1.5;
    this.mat.uniforms.uHeat.value = u * s.lava;
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uGlow.value = settings.global.glow;

    // trail
    this._trailAcc += 80 * dt * settings.global.particles;
    while (this._trailAcc >= 1) {
      this._trailAcc--;
      this.trail.burst(1, () => ({
        pos: this.position.clone().add(new Vector3((Math.random()-0.5)*s.radius, (Math.random()-0.5)*s.radius, (Math.random()-0.5)*s.radius)),
        vel: new Vector3((Math.random()-0.5)*0.6, -0.2-Math.random()*0.5, (Math.random()-0.5)*0.6),
        life: 0.5 + Math.random()*0.6, size: 0.2 + Math.random()*0.4, seed: Math.random()*100
      }), t);
    }
  }

  onImpact() {
    this.lightBoost = 6 * settings.global.impact;
    const t = this.ctx.time;
    const p = this.pointAt(1, _v); p.y = 0.1;
    this.position.set(p.x, 0.5, p.z);
    this.meteor.visible = false;
    // place cracks + ring at impact
    this.cracks.visible = true; this.ring.visible = true;
    const rad = settings.meteor.radius * 4;
    this.cracks.position.set(p.x, 0.04, p.z); this.cracks.scale.set(rad, rad, 1);
    this.ring.position.set(p.x, 0.05, p.z);
    this._ringAge = 0;
    // chunks + sparks
    this.chunks.burst(70 * settings.global.particles | 0, () => ({
      pos: p.clone(),
      vel: new Vector3((Math.random()-0.5)*8, 3+Math.random()*7, (Math.random()-0.5)*8),
      life: 0.8+Math.random()*0.8, size: 0.1+Math.random()*0.3, seed: Math.random()*100
    }), t);
    this.sparks.burst(60 * settings.global.particles | 0, () => ({
      pos: p.clone(),
      vel: new Vector3((Math.random()-0.5)*10, 1+Math.random()*6, (Math.random()-0.5)*10),
      life: 0.4+Math.random()*0.5, size: 0.05+Math.random()*0.12, seed: Math.random()*100
    }), t);
  }

  onFade(dt, phase) {
    const t = this.ctx.time;
    const fade = saturate(Math.max(0, phase - 0.6));
    this.crackMat.uniforms.uReveal.value = 1;
    this.crackMat.uniforms.uFade.value = fade;
    this.crackMat.uniforms.uTime.value = t;
    // ring expand
    this._ringAge += dt;
    const rt = saturate(this._ringAge / 0.6);
    this.ring.scale.setScalar(settings.meteor.radius * (4 + rt * 10));
    this.ringMat.uniforms.uT.value = rt;
    if (rt >= 1) this.ring.visible = false;
  }

  updateParticles(dt) {
    const t = this.ctx.time;
    this.trail.update(dt, t); this.chunks.update(dt, t); this.sparks.update(dt, t);
    const g = settings.global;
    this.trail.uniforms.uGlow.value = g.glow; this.trail.uniforms.uOpacity.value = 0.8*g.particles;
    this.chunks.uniforms.uGlow.value = g.glow;
    this.sparks.uniforms.uGlow.value = g.glow; this.sparks.uniforms.uOpacity.value = 0.95*g.particles;
  }

  onDestroy() {
    this.meteor.visible = false; this.cracks.visible = false; this.ring.visible = false;
    this.trail.reset(); this.chunks.reset(); this.sparks.reset();
  }

  get instanceCount() { return this.meteor.visible ? 1 : 0; }
}

void Easing;
