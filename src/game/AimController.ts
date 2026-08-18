// @ts-nocheck
import { Group, Raycaster, Plane, Vector2, Vector3, Color, MathUtils, Mesh, PlaneGeometry, ShaderMaterial, DoubleSide, AdditiveBlending } from 'three';
import { settings, ELEMENTS, CastShape, castShapeOf } from './settings';
import { EventEmitter, Easing, clamp, saturate } from './util';
import { NOISE_GLSL, SDF_GLSL } from './glsl';

const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);

/* ------------------------------------------------------------------ */
/* Line-cast arrow — a single SDF drawn in metres from the caster      */
/* ------------------------------------------------------------------ */
class AimIndicator {
  constructor() {
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uYaw: { value: 0 },
        uLength: { value: 10 },
        uReveal: { value: 0 },
        uValid: { value: 1 },
        uColor: { value: new Color(0.5, 0.87, 1) },
        uColorBad: { value: new Vector3(1, 0.33, 0.4) },
        uHalfSize: { value: 16 }
      },
      vertexShader: `
        uniform float uHalfSize;
        varying vec2 vWorld;
        void main(){
          vec3 p = position * uHalfSize;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: NOISE_GLSL + SDF_GLSL + `
        varying vec2 vWorld;
        uniform float uTime,uYaw,uLength,uReveal,uValid,uHalfSize;
        uniform vec3 uColor,uColorBad;
        void main(){
          float dx = vWorld.x, dz = vWorld.y;
          float sy = sin(uYaw), cy = cos(uYaw);
          float axial  = dx*sy + dz*cy;     // forward metres
          float lateral = -dx*cy + dz*sy;   // signed metres across
          vec3 col = mix(uColorBad, uColor, uValid);

          float len = max(2.0, uLength);
          float shaftW = 0.42;
          float headL = 1.5, headH = 0.95;

          // shaft: rounded box from 0..(len-headL)
          float shaftLen = max(0.0, len - headL);
          vec2 boxC = vec2(0.0, shaftLen*0.5);
          vec2 boxH = vec2(shaftW*0.5, shaftLen*0.5);
          float dShaft = sdRoundBox(vec2(lateral, axial) - boxC, boxH, 0.12);

          // head: triangle tip at (len,0)
          float dHead = sdTriangle(vec2(lateral, axial),
                                   vec2(-headH, len - headL),
                                   vec2(headH, len - headL),
                                   vec2(0.0, len));
          float d = min(dShaft, dHead);

          // reveal sweep
          float sweep = smoothstep(uReveal*len*1.04, uReveal*len*1.04 - 1.2, axial);

          // outline + fill
          float outline = smoothstep(0.16, 0.0, abs(d) - 0.02);
          float fill = smoothstep(0.0, -0.5, d);
          float rim = pow(fill, 2.2);

          // chevrons skewed by |lateral| -> arrowheads pointing forward
          float chPhase = axial*1.0 - uTime*1.6;
          float tri = abs(fract(chPhase*0.5)*2.0 - 1.0);
          float chev = smoothstep(0.45, 0.0, abs(lateral)*(1.0+1.4*tri) - 0.22 + tri*0.0);
          chev *= step(0.2, axial) * step(axial, len-0.2) * fill;

          // ring at the caster's feet
          float ring = smoothstep(0.06,0.0,abs(length(vec2(lateral,axial))-0.62));

          // range cap arc at the tip
          float cap = smoothstep(0.05,0.0,abs(length(vec2(lateral, axial-len))-0.5))
                      * smoothstep(-0.9,-0.2,lateral);

          // frost plates
          vec2 v = voronoi2(vec2(lateral, axial)*2.6 + uTime*0.05);
          float frost = smoothstep(0.0, 0.45, v.y - v.x) * fill * 0.5;

          float a = (outline*0.9 + rim*0.35 + chev*0.5 + ring*0.8 + cap*0.7 + frost) * sweep;
          a *= uReveal;
          if(a < 0.002) discard;
          gl_FragColor = vec4(col * (outline + chev*0.8 + 0.4), a);
        }
      `
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.02;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.object3D = this.mesh;
  }
  setVisible(v) { this.mesh.visible = v; }
  update(origin, yaw, distance, reveal, valid, time) {
    const a = settings.aim;
    this.mesh.position.set(origin.x, 0.02, origin.z);
    const half = Math.max(6, settings[this._element ?? 'ice']?.range ?? 11) + 3;
    this.mat.uniforms.uHalfSize.value = half;
    this.mat.uniforms.uYaw.value = yaw;
    this.mat.uniforms.uLength.value = Math.max(1, distance);
    this.mat.uniforms.uReveal.value = reveal;
    this.mat.uniforms.uValid.value = valid ? 1 : 0;
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uColor.value = getColor(a.color);
    this.mat.uniforms.uColorBad.value = getColor(a.colorInvalid);
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}

/* ------------------------------------------------------------------ */
/* Far-cast circle — a deliberately thick boundary that snaps out       */
/* ------------------------------------------------------------------ */
class ZoneIndicator {
  constructor() {
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uYaw: { value: 0 },
        uRadius: { value: 3 },
        uBoundary: { value: 0.34 },
        uBias: { value: 0.42 },
        uReveal: { value: 0 },
        uValid: { value: 1 },
        uColor: { value: new Color(0.7, 0.48, 1) },
        uColorBad: { value: new Color(1, 0.33, 0.4) },
        uHalf: { value: 4 }
      },
      vertexShader: `
        uniform float uHalf;
        varying vec2 vLocal;
        void main(){
          vec3 p = position * uHalf;
          vec4 wp = modelMatrix * vec4(p,1.0);
          vLocal = wp.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: NOISE_GLSL + `
        varying vec2 vLocal;
        uniform float uTime,uYaw,uRadius,uBoundary,uBias,uReveal,uValid,uHalf;
        uniform vec3 uColor,uColorBad;
        void main(){
          vec2 d = vLocal;
          float r = length(d);
          vec3 col = mix(uColorBad, uColor, uValid);
          float R = max(0.6, uRadius);
          // snap-out: overshoot then settle
          float snap = uReveal * (1.0 + 0.16*sin(uReveal*3.14159));
          float scale = mix(1.7, 1.0, Easing(uReveal));
          float drawnR = R * scale;
          float rr = r / max(drawnR, 0.2);

          // boundary band, split about the nominal radius by bias
          float inner = drawnR - uBoundary*uBias;
          float outer = drawnR + uBoundary*(1.0-uBias);
          float band = smoothstep(inner, inner+0.05, r) * (1.0 - smoothstep(outer-0.05, outer, r));

          // interior wash, rim weighted
          float wash = smoothstep(1.0, 0.0, rr) * 0.18;
          // contour rings travelling outward
          float contour = smoothstep(0.5,0.0,abs(fract(rr*4.0 - uTime*0.8)-0.5)*2.0)*smoothstep(1.0,0.1,rr)*0.4;
          // reticle, downrange arm longer (carries caster yaw)
          float ang = atan(-d.y, d.x) - uYaw;
          float ca = cos(ang), sa = sin(ang);
          float cross = max(smoothstep(0.04,0.0,abs(sa))*smoothstep(0.9,0.0,abs(ca)),
                            smoothstep(0.04,0.0,abs(ca))*smoothstep(1.4,0.0,abs(sa))) * smoothstep(1.0,0.0,rr);
          float center = smoothstep(0.18,0.0,r);

          float a = (band*1.2 + wash + contour + cross*0.7 + center*0.9) * uReveal;
          if(a < 0.002) discard;
          gl_FragColor = vec4(col * (band + 0.5), a);
        }
      `
    });
    // patch Easing placeholder
    this.mat.fragmentShader = this.mat.fragmentShader.replace('Easing(uReveal)', '(1.0 - pow(1.0-uReveal,3.0))');
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.02;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.object3D = this.mesh;
  }
  setVisible(v) { this.mesh.visible = v; }
  update(origin, yaw, distance, radius, _range, reveal, valid, time) {
    const z = settings.zone;
    const tx = origin.x + Math.sin(yaw) * distance;
    const tz = origin.z + Math.cos(yaw) * distance;
    this.mesh.position.set(tx, 0.02, tz);
    this.mat.uniforms.uHalf.value = Math.max(2, radius) + 1.2;
    this.mat.uniforms.uYaw.value = yaw;
    this.mat.uniforms.uRadius.value = Math.max(0.5, radius);
    this.mat.uniforms.uBoundary.value = z.boundary;
    this.mat.uniforms.uBias.value = z.boundaryBias;
    this.mat.uniforms.uReveal.value = reveal;
    this.mat.uniforms.uValid.value = valid ? 1 : 0;
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uColor.value.set(z.color);
    this.mat.uniforms.uColorBad.value.set(z.colorInvalid);
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}

/* ------------------------------------------------------------------ */
/* The controller — owns aim state + both indicators, emits `cast`      */
/* ------------------------------------------------------------------ */
export class AimController extends EventEmitter {
  constructor(camera) {
    super();
    this.camera = camera;
    this.raycaster = new Raycaster();
    this.raycaster.far = 500;
    this.indicator = new AimIndicator();
    this.zone = new ZoneIndicator();
    this.group = new Group();
    this.group.name = 'AimIndicators';
    this.group.add(this.indicator.object3D, this.zone.object3D);

    this.element = ELEMENTS[0];
    this.armed = false;
    this.reveal = 0;
    this.origin = new Vector3();
    this.direction = new Vector3(0, 0, 1);
    this.distance = 0;
    this.yaw = 0;
    this.valid = true;

    this._pointer = new Vector2();
    this._hasPointer = false;
    this._hit = new Vector3();
    this._flat = new Vector3();
  }

  get object3D() { return this.group; }
  get config() { return settings[this.element] ?? settings[ELEMENTS[0]]; }
  get shape() { return castShapeOf(this.element); }
  get zoneRadius() { return Math.max(0.05, this.config.zoneRadius ?? 1); }
  get isArmed() { return this.armed; }
  get facing() { return this.yaw; }

  setElement(element) {
    if (!settings[element]) return;
    this.element = element;
    this.indicator._element = element;
  }
  setOrigin(position) { this.origin.set(position.x, 0, position.z); }

  arm() { if (!this.armed) { this.armed = true; this.emit('arm'); } }
  cancel() { if (this.armed) { this.armed = false; this.emit('cancel'); } }
  toggle() { this.armed ? this.cancel() : this.arm(); }
  point(pointer) { this._pointer.copy(pointer); this._hasPointer = true; }

  confirm() {
    if (!this.armed) return false;
    if (!this.valid) { this.emit('reject'); return false; }
    this.armed = false;
    this.emit('cast', this.origin, this.direction, this.distance);
    return true;
  }

  _resolve() {
    const c = this.config;
    if (this._hasPointer) {
      this.raycaster.setFromCamera(this._pointer, this.camera);
      if (this.raycaster.ray.intersectPlane(GROUND_PLANE, this._hit)) {
        this._flat.copy(this._hit).sub(this.origin);
        this._flat.y = 0;
        const raw = this._flat.length();
        if (raw > 0.1) {
          this.direction.copy(this._flat).multiplyScalar(1 / raw);
          this.yaw = Math.atan2(this.direction.x, this.direction.z);
          this.valid = true;
          this.distance = clamp(raw, 1.5, Math.max(2.0, c.range));
          return;
        }
      }
    }
    this.valid = true;
    this.distance = clamp(this.distance || 8, 1.5, Math.max(2.0, c.range));
  }

  update(dt) {
    this._resolve();
    const zoned = this.shape === CastShape.ZONE;
    const revealTime = Math.max(0.01, zoned ? settings.zone.reveal : settings.aim.reveal);
    const target = this.armed ? 1 : 0;
    const step = dt / revealTime;
    this.reveal = clamp(this.reveal + clamp(target - this.reveal, -step, step), 0, 1);
    const visible = this.reveal > 0.001;
    this.indicator.setVisible(visible && !zoned);
    this.zone.setVisible(visible && zoned);
    if (!visible) return;
    if (zoned) this.zone.update(this.origin, this.yaw, this.distance, this.zoneRadius, this.config.range, this.reveal, this.valid, performance.now() / 1000);
    else this.indicator.update(this.origin, this.yaw, this.distance, this.reveal, this.valid, performance.now() / 1000);
  }

  dispose() { this.indicator.dispose(); this.zone.dispose(); this.clear(); }
}

// silence unused import warnings in some bundlers
void Easing; void saturate;
