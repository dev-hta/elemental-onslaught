// @ts-nocheck
import { Color, Fog, HemisphereLight, DirectionalLight, AmbientLight, Mesh, PlaneGeometry, SphereGeometry, ShaderMaterial, Vector3, BackSide } from 'three';
import { settings } from './settings';
import { ParticleSystem } from './ParticleSystem';
import { getColor } from './util';
import { NOISE_GLSL } from './glsl';

/** The dark stage: a procedural grid floor, three-point lighting and slow dust. */
export class Environment {
  constructor(scene) {
    this.scene = scene;
    scene.background = getColor(settings.world.fogColor);
    scene.fog = new Fog(getColor(settings.world.fogColor).getHex(), settings.world.fogNear, settings.world.fogFar);

    // floor
    this.floorMat = new ShaderMaterial({
      uniforms: {
        uGround: { value: getColor(settings.world.groundColor) },
        uGrid: { value: getColor(settings.world.gridColor) },
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec2 vWorld;
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          vWorld = wp.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: NOISE_GLSL + `
        varying vec2 vWorld;
        uniform vec3 uGround,uGrid; uniform float uTime;
        void main(){
          vec2 g = abs(fract(vWorld) - 0.5);
          float line = min(g.x, g.y);
          float grid = smoothstep(0.05, 0.0, line);
          vec2 g5 = abs(fract(vWorld*0.2) - 0.5);
          float grid5 = smoothstep(0.025, 0.0, min(g5.x, g5.y));
          float dist = length(vWorld);
          float fade = smoothstep(46.0, 6.0, dist);
          vec3 col = uGround;
          col += uGrid * grid * 0.45 * fade;
          col += uGrid * grid5 * 0.9 * fade;
          col += (fbm2(vWorld*0.5) - 0.5) * 0.02;
          col *= mix(0.4, 1.0, smoothstep(40.0, 4.0, dist)); // darken at distance
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.floor = new Mesh(new PlaneGeometry(200, 200), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0;
    scene.add(this.floor);

    // a faint dome so the void isn't pure flat colour
    const domeMat = new ShaderMaterial({
      side: BackSide,
      uniforms: { uColor: { value: getColor(settings.world.fogColor) } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vDir; uniform vec3 uColor; void main(){ float h = clamp(vDir.y*0.5+0.5,0.0,1.0); vec3 c = mix(uColor*0.6, uColor*1.4, h); gl_FragColor = vec4(c,1.0); }`
    });
    this.dome = new Mesh(new SphereGeometry(60, 32, 32), domeMat);
    scene.add(this.dome);

    // lights
    this.hemi = new HemisphereLight(getColor(settings.world.hemiSky), getColor(settings.world.hemiGround), settings.world.ambient);
    scene.add(this.hemi);
    this.sun = new DirectionalLight(getColor(settings.world.sunColor), settings.world.sunIntensity);
    this.sun.position.set(8, 16, 6);
    scene.add(this.sun);
    this.ambient = new AmbientLight(0xffffff, 0.08);
    scene.add(this.ambient);

    // drifting dust
    this.dust = new ParticleSystem(scene, {
      capacity: 220, additive: true, gravity: 0, drag: 0.2, turb: 0.4, turbScale: 0.5,
      size: 0.5, opacity: 0.18,
      colorA: '#6f8fcf', colorB: '#3a4f86', colorC: '#10162a'
    });
    for (let i = 0; i < 220; i++) {
      this.dust.burst(1, () => ({
        pos: new Vector3((Math.random() - 0.5) * 50, Math.random() * 14, (Math.random() - 0.5) * 50),
        vel: new Vector3((Math.random() - 0.5) * 0.15, 0.05 + Math.random() * 0.1, (Math.random() - 0.5) * 0.15),
        life: 12 + Math.random() * 12, size: 0.03 + Math.random() * 0.05, seed: Math.random() * 100
      }), -Math.random() * 6);
    }
  }

  update(dt, time) {
    this.floorMat.uniforms.uTime.value = time;
    this.dust.update(dt, time);
    this.hemi.intensity = settings.world.ambient;
    this.sun.intensity = settings.world.sunIntensity;
    // recycle dust gently
    if (Math.random() < 0.02) {
      this.dust.burst(1, () => ({
        pos: new Vector3((Math.random() - 0.5) * 50, 0, (Math.random() - 0.5) * 50),
        vel: new Vector3((Math.random() - 0.5) * 0.15, 0.05 + Math.random() * 0.1, 0),
        life: 12 + Math.random() * 12, size: 0.03 + Math.random() * 0.05, seed: Math.random() * 100
      }), time);
    }
  }

  dispose() {
    this.scene.remove(this.floor, this.dome, this.hemi, this.sun, this.ambient);
    this.floorMat.dispose(); this.floor.geometry.dispose();
    this.dust.dispose();
  }
}
