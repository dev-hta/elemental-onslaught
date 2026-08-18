// @ts-nocheck
import { Object3D, Mesh, InstancedBufferGeometry, BufferAttribute, InstancedBufferAttribute, ShaderMaterial, DoubleSide, AdditiveBlending, Vector3, Color, IcosahedronGeometry, RingGeometry } from 'three';
import { Ability, AbilityPhase } from './Ability';
import { settings } from '../settings';
import { saturate, getColor } from '../util';
import { ParticleSystem } from '../ParticleSystem';
import { NOISE_GLSL } from '../glsl';

const _v = new Vector3();

function tubeGrid(radial, len) {
  const geo = new InstancedBufferGeometry();
  const pos = [], aT = [], aA = [];
  for (let j = 0; j <= len; j++) {
    for (let i = 0; i <= radial; i++) {
      aT.push(j / len); aA.push((i / radial) * Math.PI * 2);
      pos.push(0, 0, 0);
    }
  }
  const idx = [];
  const stride = radial + 1;
  for (let j = 0; j < len; j++) {
    for (let i = 0; i < radial; i++) {
      const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('aT', new BufferAttribute(new Float32Array(aT), 1));
  geo.setAttribute('aA', new BufferAttribute(new Float32Array(aA), 1));
  geo.setIndex(idx);
  return geo;
}

function coilStrip(len) {
  const geo = new InstancedBufferGeometry();
  const pos = [], aT = [], aSide = [], idx = [];
  for (let i = 0; i <= len; i++) { aT.push(i / len, i / len); aSide.push(-1, 1); pos.push(0, 0, 0, 0, 0, 0); }
  for (let i = 0; i < len; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('aT', new BufferAttribute(new Float32Array(aT), 1));
  geo.setAttribute('aSide', new BufferAttribute(new Float32Array(aSide), 1));
  geo.setIndex(idx);
  geo.instanceCount = 1;
  return geo;
}

/** F — Nova Beam: charge orb → tube core/sheath/halo + coils + shock discs, held then collapsed. */
export class BeamAbility extends Ability {
  createShaders() {
    this.tubeGeo = tubeGrid(12, 40);
    const vert = NOISE_GLSL + `
      attribute float aT; attribute float aA;
      uniform vec3 uHand,uTarget; uniform float uRadius,uFlare,uExtend,uTime,uRadiusMul,uCoil;
      varying float vNdotV; varying float vT;
      void main(){
        float t = aT * uExtend;
        vec3 axis = mix(uHand, uTarget, t);
        vec3 axisDir = normalize(uTarget - uHand + vec3(0.0001,0.4,0.0001));
        vec3 up = vec3(0,1,0);
        vec3 Nn = normalize(cross(axisDir, up));
        vec3 Bn = normalize(cross(axisDir, Nn));
        float flare = 1.0 + uFlare * smoothstep(0.6, 1.0, t);
        float r = uRadius * uRadiusMul * flare;
        vec3 radialN = Nn*cos(aA) + Bn*sin(aA);
        vec3 world = axis + radialN * r;
        vT = t;
        vec3 view = normalize(cameraPosition - world);
        vNdotV = dot(radialN, view);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `;
    const frag = `
      varying float vNdotV; varying float vT;
      uniform vec3 uColor; uniform float uOpacity,uGlow,uMode;
      void main(){
        float ndv = abs(vNdotV);
        float w = mix(pow(1.0 - ndv, 2.2), ndv*1.3, uMode);
        float flow = 0.6 + 0.4*sin(vT*40.0 - uMode*3.0);
        float a = uOpacity * (0.12 + w);
        gl_FragColor = vec4(uColor*uGlow*(0.4 + w)*flow, a);
      }
    `;
    this.makeTubeMat = (color, radiusMul, mode, opacity) => new ShaderMaterial({
      transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      uniforms: {
        uHand: { value: new Vector3() }, uTarget: { value: new Vector3() },
        uRadius: { value: settings.beam.radius }, uFlare: { value: settings.beam.flare }, uExtend: { value: 0 },
        uTime: { value: 0 }, uRadiusMul: { value: radiusMul }, uMode: { value: mode },
        uColor: { value: new Color(color) }, uOpacity: { value: opacity }, uGlow: { value: 1 }
      },
      vertexShader: vert, fragmentShader: frag
    });

    this.haloMat = this.makeTubeMat(settings.beam.haloColor, 2.4, 0.0, 0.30);
    this.sheathMat = this.makeTubeMat(settings.beam.sheathColor, 1.0, 0.0, 0.7);
    this.coreMat = this.makeTubeMat(settings.beam.coreColor, settings.beam.coreWidth, 1.0, 1.0);
    this.halo = new Mesh(this.tubeGeo, this.haloMat); this.halo.frustumCulled = false; this.halo.renderOrder = 6;
    this.sheath = new Mesh(this.tubeGeo, this.sheathMat); this.sheath.frustumCulled = false; this.sheath.renderOrder = 7;
    this.core = new Mesh(this.tubeGeo, this.coreMat); this.core.frustumCulled = false; this.core.renderOrder = 8;
    this.group.add(this.halo, this.sheath, this.core);

    // coils
    this.coilMat = new ShaderMaterial({ transparent:true, depthWrite:false, side:DoubleSide, blending:AdditiveBlending,
      uniforms:{ uHand:{value:new Vector3()}, uTarget:{value:new Vector3()}, uExtend:{value:0}, uTime:{value:0},
        uCoils:{value:settings.beam.coils}, uRadius:{value:settings.beam.radius}, uColor:{value:new Color(settings.beam.coilColor)}, uOpacity:{value:0.9}, uGlow:{value:1} },
      vertexShader: NOISE_GLSL + `
        attribute float aT; attribute float aSide;
        uniform vec3 uHand,uTarget; uniform float uExtend,uTime,uCoils,uRadius;
        void main(){
          float t=aT*uExtend;
          vec3 axis=mix(uHand,uTarget,t);
          vec3 axisDir=normalize(uTarget-uHand+vec3(0.0001,0.4,0.0001));
          vec3 up=vec3(0,1,0);
          vec3 Nn=normalize(cross(axisDir,up)); vec3 Bn=normalize(cross(axisDir,Nn));
          float ang=t*uCoils*6.2831+uTime*3.0;
          vec3 c=Nn*cos(ang)+Bn*sin(ang);
          vec3 view=normalize(cameraPosition-axis);
          vec3 facing=normalize(cross(axisDir,view));
          vec3 world=axis+c*(uRadius*1.25)+facing*aSide*0.06;
          gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);
        }
      `,
      fragmentShader:`uniform vec3 uColor; uniform float uOpacity,uGlow; void main(){ gl_FragColor=vec4(uColor*uGlow,uOpacity); }`
    });
    this.coils = new Mesh(coilStrip(48), this.coilMat); this.coils.frustumCulled=false; this.coils.renderOrder=7;
    this.group.add(this.coils);

    // shock discs — one ring geometry, instanced along the barrel by aIdx
    const ring = new RingGeometry(0.7, 1.0, 24);
    const discGeo = new InstancedBufferGeometry();
    discGeo.index = ring.index;
    discGeo.setAttribute('position', ring.attributes.position);
    discGeo.setAttribute('uv', ring.attributes.uv);
    const idx = new Float32Array(settings.beam.rings);
    for (let i = 0; i < idx.length; i++) idx[i] = i;
    discGeo.setAttribute('aIdx', new InstancedBufferAttribute(idx, 1));
    discGeo.instanceCount = settings.beam.rings;
    this.discMat = new ShaderMaterial({ transparent:true, depthWrite:false, side:DoubleSide, blending:AdditiveBlending,
      uniforms:{ uHand:{value:new Vector3()}, uTarget:{value:new Vector3()}, uExtend:{value:0}, uTime:{value:0},
        uCount:{value:settings.beam.rings}, uRadius:{value:settings.beam.radius}, uColor:{value:new Color(settings.beam.sheathColor)}, uOpacity:{value:0.8}, uGlow:{value:1} },
      vertexShader: NOISE_GLSL + `
        attribute float aIdx;
        uniform vec3 uHand,uTarget; uniform float uExtend,uTime,uCount,uRadius;
        void main(){
          float ph=fract(aIdx/uCount + uTime*0.8);
          float t=ph*uExtend;
          vec3 axis=mix(uHand,uTarget,t);
          vec3 axisDir=normalize(uTarget-uHand+vec3(0.0001,0.4,0.0001));
          vec3 up=vec3(0,1,0);
          vec3 Nn=normalize(cross(axisDir,up)); vec3 Bn=normalize(cross(axisDir,Nn));
          float r=uRadius*(2.2 - ph*1.6);
          vec3 p=position;
          vec3 world=axis + (Nn*p.x + Bn*p.y + axisDir*p.z)*r;
          gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);
        }
      `,
      fragmentShader:`uniform vec3 uColor; uniform float uOpacity,uGlow; void main(){ gl_FragColor=vec4(uColor*uGlow,uOpacity); }`
    });
    this.discs = new Mesh(discGeo, this.discMat);
    this.discs.frustumCulled = false;
    this.discs.count = settings.beam.rings; // instanced via geometry? handled below
    this.discs.isInstancedMesh = true;
    this.discs.instanceCount = settings.beam.rings;
    this.discMat.defines = this.discMat.defines || {};
    this.group.add(this.discs);

    // charge orb
    this.orbMat = new ShaderMaterial({ transparent:true, depthWrite:false, blending:AdditiveBlending,
      uniforms:{ uTime:{value:0}, uPower:{value:0}, uColor:{value:new Color(settings.beam.coreColor)}, uGlow:{value:1} },
      vertexShader:`varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normal); vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: NOISE_GLSL + `varying vec3 vN; varying vec3 vP; uniform float uTime,uPower,uGlow; uniform vec3 uColor;
        void main(){ float n=fbm3(vN*4.0+uTime); vec3 c=mix(uColor, vec3(1.0), uPower); gl_FragColor=vec4(c*(0.6+n)*uGlow, 0.9); }`
    });
    this.orb = new Mesh(new IcosahedronGeometry(0.3, 3), this.orbMat); this.orb.frustumCulled=false; this.group.add(this.orb);
    this._seed = 0;
  }

  advance(dt) {
    const s = settings.beam;
    if (this.age < s.charge) {
      this.u = 0; this.front = 0; this.pointAt(0, this.position);
      return false;
    }
    const t = this.age - s.charge;
    const prevU = this.u;
    this.u = saturate(t / 0.12);
    this.pointAt(Math.max(0.05, this.u), this.position);
    return this.u >= 1 && prevU < 1;
  }

  _hand() { const h = this.origin.clone().addScaledVector(this.direction, 0.3); h.y = 1.35; return h; }
  _target() { const tg = this.pointAt(1, _v).clone(); tg.y = 0.4; return tg; }

  _sync() {
    const s = settings.beam;
    const hand = this._hand(), target = this._target();
    for (const m of [this.haloMat, this.sheathMat, this.coreMat, this.coilMat, this.discMat]) {
      m.uniforms.uHand.value.copy(hand); m.uniforms.uTarget.value.copy(target);
    }
    this.haloMat.uniforms.uColor.value.set(s.haloColor);
    this.sheathMat.uniforms.uColor.value.set(s.sheathColor);
    this.coreMat.uniforms.uColor.value.set(s.coreColor);
    this.coreMat.uniforms.uRadiusMul.value = s.coreWidth;
    this.coilMat.uniforms.uColor.value.set(s.coilColor); this.coilMat.uniforms.uCoils.value = s.coils;
    this.discMat.uniforms.uColor.value.set(s.sheathColor);
    this.orbMat.uniforms.uColor.value.set(s.coreColor);
    for (const m of [this.haloMat, this.sheathMat, this.coreMat, this.coilMat, this.discMat, this.orbMat])
      m.uniforms.uGlow.value = settings.global.glow;
  }

  createParticles() {
    this.motes = new ParticleSystem(this.ctx.scene, { capacity: 320, additive: true, gravity: -0.3, drag: 1.2, turb: 0.6, size: 0.12, opacity: 0.8, colorA: '#ffffff', colorB: '#9fe6ff', colorC: '#1e6bff' });
    this.sparks = new ParticleSystem(this.ctx.scene, { capacity: 360, additive: true, gravity: 6, drag: 0.5, turb: 0.3, size: 0.12, stretch: 0.5, opacity: 0.95, colorA: '#ffffff', colorB: '#7fd0ff', colorC: '#1e6bff' });
  }

  onSpawn() {
    this._sync();
    this._moteAcc = 0; this._sparkAcc = 0;
    this.motes.reset(); this.sparks.reset();
    this.orb.visible = true;
  }

  onTravel(dt) {
    const s = settings.beam;
    const t = this.ctx.time;
    this._sync();
    const charging = this.age < s.charge;
    const extend = this.u;
    for (const m of [this.haloMat, this.sheathMat, this.coreMat, this.coilMat, this.discMat]) m.uniforms.uExtend.value = extend;
    for (const m of [this.haloMat, this.sheathMat, this.coreMat, this.coilMat, this.discMat]) m.uniforms.uTime.value = t;

    // charge orb
    this.orbMat.uniforms.uTime.value = t;
    this.orbMat.uniforms.uPower.value = saturate(this.age / s.charge);
    const orbScale = 0.3 + 0.9 * saturate(this.age / s.charge);
    this.orb.scale.setScalar(orbScale * s.radius);
    this.orb.position.copy(this._hand());

    // intake motes spiralling into orb while charging
    if (charging) {
      this._moteAcc += 60 * dt * settings.global.particles;
      const h = this._hand();
      while (this._moteAcc >= 1) {
        this._moteAcc--;
        const ang = Math.random() * Math.PI * 2, rad = 1.2 + Math.random();
        this.motes.burst(1, () => ({
          pos: h.clone().add(new Vector3(Math.cos(ang)*rad, Math.sin(ang)*rad*0.6, Math.sin(ang)*rad)),
          vel: h.clone().sub(new Vector3(Math.cos(ang)*rad, Math.sin(ang)*rad*0.6, Math.sin(ang)*rad)).multiplyScalar(2.0),
          life: 0.4 + Math.random()*0.3, size: 0.05 + Math.random()*0.06, seed: Math.random()*100
        }), t);
      }
    }
  }

  onImpact() {
    this.lightBoost = 5 * settings.global.impact;
    this.orb.visible = false;
    this._holdTime = 0;
  }

  onFade(dt, phase) {
    const t = this.ctx.time;
    this._holdTime += dt;
    const fade = saturate(Math.max(0, phase - 0.7));
    // collapse to a thread then blink out
    const collapse = 1 - fade;
    this.haloMat.uniforms.uOpacity.value = 0.30 * collapse;
    this.sheathMat.uniforms.uOpacity.value = 0.7 * collapse;
    this.coreMat.uniforms.uOpacity.value = 1.0 * collapse;
    this.coreMat.uniforms.uRadiusMul.value = settings.beam.coreWidth * (0.2 + 0.8 * collapse);
    this.coilMat.uniforms.uOpacity.value = 0.9 * collapse;
    this.discMat.uniforms.uOpacity.value = 0.8 * collapse;

    // burning floor: sparks thrown back up the line at the impact
    this._sparkAcc += 80 * dt * settings.global.particles;
    const target = this._target();
    while (this._sparkAcc >= 1) {
      this._sparkAcc--;
      this.sparks.burst(1, () => ({
        pos: target.clone(),
        vel: new Vector3((Math.random()-0.5)*3, 3+Math.random()*5, (Math.random()-0.5)*3),
        life: 0.3+Math.random()*0.4, size: 0.05+Math.random()*0.1, seed: Math.random()*100
      }), t);
    }
  }

  updateParticles(dt) {
    const t = this.ctx.time;
    this.motes.update(dt, t); this.sparks.update(dt, t);
    const g = settings.global;
    this.motes.uniforms.uGlow.value = g.glow; this.motes.uniforms.uOpacity.value = 0.8*g.particles;
    this.sparks.uniforms.uGlow.value = g.glow; this.sparks.uniforms.uOpacity.value = 0.95*g.particles;
  }

  onDestroy() {
    for (const m of [this.haloMat, this.sheathMat, this.coreMat, this.coilMat, this.discMat]) m.uniforms.uExtend.value = 0;
    this.orb.visible = false;
    this.motes.reset(); this.sparks.reset();
  }

  get instanceCount() { return this.phase === AbilityPhase.IDLE ? 0 : 1; }
}

void saturate;
