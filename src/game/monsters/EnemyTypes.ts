// @ts-nocheck
import {
  Group,
  Mesh,
  ShaderMaterial,
  MeshStandardMaterial,
  ConeGeometry,
  SphereGeometry,
  BoxGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  TorusGeometry,
  Color,
  Vector3,
  DoubleSide,
  AdditiveBlending
} from 'three';
import { Enemy } from './Enemy';
import { NOISE_GLSL } from '../glsl';

/**
 * Creates an ethereal procedural Fresnel shader material matching the project's art style.
 */
function createProceduralMonsterMaterial(opts = {}) {
  const edgeCol = opts.edgeColor || '#88ccff';
  const midCol = opts.midColor || '#224488';
  const deepCol = opts.deepColor || '#0c1022';
  const emissiveCol = opts.emissiveColor || '#00e5ff';
  const roughness = opts.roughness ?? 0.6;
  const isTransparent = opts.transparent ?? false;
  const opacity = opts.opacity ?? 1.0;

  return new ShaderMaterial({
    transparent: isTransparent,
    depthWrite: !isTransparent,
    side: DoubleSide,
    blending: isTransparent ? AdditiveBlending : undefined,
    uniforms: {
      uTime: { value: 0 },
      uHitFlash: { value: 0 },
      uFrozen: { value: 0 },
      uShocked: { value: 0 },
      uOpacity: { value: opacity },
      uEdgeColor: { value: new Color(edgeCol) },
      uMidColor: { value: new Color(midCol) },
      uDeepColor: { value: new Color(deepCol) },
      uEmissiveColor: { value: new Color(emissiveCol) },
      uNoiseScale: { value: opts.noiseScale || 4.0 },
      uGlow: { value: opts.glow || 1.0 }
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: NOISE_GLSL + `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec2 vUv;
      uniform float uTime, uHitFlash, uFrozen, uShocked, uOpacity, uNoiseScale, uGlow;
      uniform vec3 uEdgeColor, uMidColor, uDeepColor, uEmissiveColor;

      void main(){
        float th = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.1);
        float fresnel = 1.0 - th;

        // Procedural fractal surface detail
        float n = fbm3(vWorld * uNoiseScale + vec3(0.0, uTime * 0.2, 0.0));
        vec3 base = mix(uDeepColor, uMidColor, th * 0.7 + n * 0.3);
        base = mix(base, uEdgeColor, pow(fresnel, 2.5));

        // Procedural glowing energy cracks
        float crack = smoothstep(0.65, 0.85, fbm3(vWorld * (uNoiseScale * 1.8)));
        base += uEmissiveColor * crack * (1.2 + 0.4 * sin(uTime * 4.0));

        // Shock status jitter
        if(uShocked > 0.5){
          float spark = step(0.75, fract(sin(dot(vWorld, vec3(12.98, 78.23, 45.1))) * 43758.54 + uTime * 20.0));
          base += vec3(0.6, 0.8, 1.0) * spark * 2.0;
        }

        // Frozen status frost
        if(uFrozen > 0.5){
          vec2 vv = voronoi2(vWorld.xz * 5.0);
          float frost = smoothstep(0.0, 0.4, vv.y - vv.x);
          base = mix(base, vec3(0.8, 0.95, 1.0), frost * 0.75);
        }

        // Hit flash
        base += vec3(uHitFlash * 1.8, uHitFlash * 0.4, uHitFlash * 0.4);

        float a = uOpacity * (0.6 + 0.4 * fresnel);
        gl_FragColor = vec4(base * uGlow, a);
      }
    `
  });
}

// --------------------------------------------------------------------------
// 1. Void Crawler (Ethereal Faceted Arachnid Swarmer)
// --------------------------------------------------------------------------
export class VoidCrawler extends Enemy {
  constructor(scene, opts = {}) {
    super(scene, {
      type: 'crawler',
      name: 'Void Crawler',
      maxHp: 65,
      speed: 4.8,
      damage: 12,
      attackRange: 1.4,
      attackCooldown: 0.9,
      radius: 0.5,
      height: 0.8,
      scale: 0.9,
      scoreValue: 120,
      damageMultipliers: {
        ice: 1.2,
        thunder: 1.0,
        meteor: 1.5,
        beam: 2.0,
        snare: 1.3
      },
      ...opts
    });
  }

  buildModel() {
    const carapaceMat = createProceduralMonsterMaterial({
      edgeColor: '#9333ea',
      midColor: '#3b0764',
      deepColor: '#0a0514',
      emissiveColor: '#c084fc',
      noiseScale: 3.5,
      glow: 1.1
    });
    const spineMat = createProceduralMonsterMaterial({
      edgeColor: '#f43f5e',
      midColor: '#a855f7',
      deepColor: '#1e0836',
      emissiveColor: '#e11d48',
      noiseScale: 5.0,
      glow: 1.4
    });
    this.materials.push(carapaceMat, spineMat);

    this.body = new Group();
    this.body.position.y = 0.45;
    this.group.add(this.body);

    // Faceted diamond abdomen
    const core = new Mesh(new IcosahedronGeometry(0.38, 1), carapaceMat);
    core.scale.set(0.85, 0.65, 1.25);
    this.body.add(core);

    // Glowing crystalline void spine
    const spine = new Mesh(new ConeGeometry(0.12, 0.45, 5), spineMat);
    spine.rotation.x = -Math.PI * 0.32;
    spine.position.set(0, 0.26, -0.12);
    this.body.add(spine);

    // Faceted eyes
    const eyeL = new Mesh(new IcosahedronGeometry(0.07, 0), spineMat);
    eyeL.position.set(0.14, 0.08, 0.38);
    const eyeR = new Mesh(new IcosahedronGeometry(0.07, 0), spineMat);
    eyeR.position.set(-0.14, 0.08, 0.38);
    this.body.add(eyeL, eyeR);

    // 4 Articulated needle legs
    this.legs = [];
    const legGeo = new CylinderGeometry(0.035, 0.015, 0.55, 5);
    legGeo.translate(0, -0.27, 0);

    const legPositions = [
      { x: 0.32, z: 0.22, sign: 1 },
      { x: -0.32, z: 0.22, sign: -1 },
      { x: 0.34, z: -0.22, sign: 1 },
      { x: -0.34, z: -0.22, sign: -1 }
    ];

    legPositions.forEach((p, i) => {
      const legRoot = new Group();
      legRoot.position.set(p.x, 0.32, p.z);
      this.group.add(legRoot);

      const upper = new Mesh(legGeo, carapaceMat);
      upper.rotation.z = p.sign * 0.65;
      upper.rotation.x = (i < 2 ? 0.22 : -0.22);
      legRoot.add(upper);

      this.legs.push({ root: legRoot, upper, sign: p.sign, phase: i * Math.PI * 0.5 });
    });
  }

  updateAnimation(dt, time, speed) {
    const moving = speed > 0.1;
    const walkFreq = speed * 4.6;
    this.body.position.y = 0.45 + (moving ? Math.sin(time * walkFreq * 2) * 0.04 : Math.sin(time * 2) * 0.02);
    this.body.rotation.z = moving ? Math.sin(time * walkFreq) * 0.06 : 0;

    this.legs.forEach((leg) => {
      if (moving) {
        leg.root.rotation.x = Math.sin(time * walkFreq + leg.phase) * 0.45;
        leg.root.rotation.z = Math.cos(time * walkFreq + leg.phase) * 0.2 * leg.sign;
      } else {
        leg.root.rotation.x = 0;
        leg.root.rotation.z = 0;
      }
    });
  }
}

// --------------------------------------------------------------------------
// 2. Obsidian Golem (Floating Basalt Megalith Titan)
// --------------------------------------------------------------------------
export class ObsidianGolem extends Enemy {
  constructor(scene, opts = {}) {
    super(scene, {
      type: 'golem',
      name: 'Obsidian Golem',
      maxHp: 240,
      speed: 2.2,
      damage: 32,
      attackRange: 2.2,
      attackCooldown: 1.8,
      radius: 0.95,
      height: 2.2,
      scale: 1.35,
      scoreValue: 280,
      damageMultipliers: {
        ice: 0.9,
        thunder: 2.0,
        meteor: 0.7,
        beam: 1.2,
        snare: 1.8
      },
      ...opts
    });
  }

  buildModel() {
    const basaltMat = createProceduralMonsterMaterial({
      edgeColor: '#64748b',
      midColor: '#1e293b',
      deepColor: '#090d16',
      emissiveColor: '#ff6600',
      noiseScale: 2.8,
      glow: 1.0
    });
    const magmaCoreMat = createProceduralMonsterMaterial({
      edgeColor: '#ffd27f',
      midColor: '#ff5a1e',
      deepColor: '#801800',
      emissiveColor: '#ff7a2a',
      noiseScale: 4.5,
      glow: 1.6
    });
    this.materials.push(basaltMat, magmaCoreMat);

    this.torso = new Group();
    this.torso.position.y = 1.4;
    this.group.add(this.torso);

    // Segmented basalt chest
    const chest = new Mesh(new IcosahedronGeometry(0.65, 1), basaltMat);
    chest.scale.set(1.2, 0.9, 0.8);
    this.torso.add(chest);

    // Molten voronoi magma heart
    const core = new Mesh(new IcosahedronGeometry(0.3, 1), magmaCoreMat);
    core.position.set(0, 0.05, 0.35);
    this.torso.add(core);

    // Floating basalt skull with visor
    this.head = new Group();
    this.head.position.set(0, 0.65, 0.1);
    this.torso.add(this.head);

    const skull = new Mesh(new IcosahedronGeometry(0.32, 1), basaltMat);
    skull.scale.set(1.1, 0.85, 0.9);
    this.head.add(skull);

    const visor = new Mesh(new BoxGeometry(0.36, 0.08, 0.1), magmaCoreMat);
    visor.position.set(0, 0.02, 0.26);
    this.head.add(visor);

    // Floating boulder fists
    this.leftArm = new Group();
    this.leftArm.position.set(-0.9, 0.1, 0);
    this.torso.add(this.leftArm);
    const lFist = new Mesh(new IcosahedronGeometry(0.35, 1), basaltMat);
    lFist.scale.set(0.9, 1.4, 1.0);
    lFist.position.y = -0.35;
    this.leftArm.add(lFist);

    this.rightArm = new Group();
    this.rightArm.position.set(0.9, 0.1, 0);
    this.torso.add(this.rightArm);
    const rFist = new Mesh(new IcosahedronGeometry(0.35, 1), basaltMat);
    rFist.scale.set(0.9, 1.4, 1.0);
    rFist.position.y = -0.35;
    this.rightArm.add(rFist);

    // Heavy floating pillar legs
    this.leftLeg = new Mesh(new CylinderGeometry(0.24, 0.18, 0.85, 6), basaltMat);
    this.leftLeg.position.set(-0.35, 0.45, 0);
    this.group.add(this.leftLeg);

    this.rightLeg = new Mesh(new CylinderGeometry(0.24, 0.18, 0.85, 6), basaltMat);
    this.rightLeg.position.set(0.35, 0.45, 0);
    this.group.add(this.rightLeg);
  }

  updateAnimation(dt, time, speed) {
    const moving = speed > 0.1;
    const walkFreq = speed * 3.2;

    this.torso.position.y = 1.4 + (moving ? Math.sin(time * walkFreq * 2) * 0.08 : Math.sin(time * 1.5) * 0.03);
    this.torso.rotation.y = moving ? Math.sin(time * walkFreq) * 0.12 : 0;
    this.torso.rotation.z = moving ? Math.cos(time * walkFreq) * 0.05 : 0;

    this.leftArm.rotation.x = moving ? Math.sin(time * walkFreq) * 0.6 : Math.sin(time * 1.5) * 0.05;
    this.rightArm.rotation.x = moving ? -Math.sin(time * walkFreq) * 0.6 : -Math.sin(time * 1.5) * 0.05;

    this.leftLeg.position.z = moving ? Math.sin(time * walkFreq) * 0.25 : 0;
    this.rightLeg.position.z = moving ? -Math.sin(time * walkFreq) * 0.25 : 0;

    if (this.state === 'attack') {
      this.rightArm.rotation.x = -1.25;
      this.rightArm.position.z = 0.45;
    } else {
      this.rightArm.position.z = 0;
    }
  }
}

// --------------------------------------------------------------------------
// 3. Aether Phantom (Translucent Spectral Wraith with Wave Shaders)
// --------------------------------------------------------------------------
export class AetherPhantom extends Enemy {
  constructor(scene, opts = {}) {
    super(scene, {
      type: 'phantom',
      name: 'Aether Phantom',
      maxHp: 90,
      speed: 3.8,
      damage: 18,
      attackRange: 3.5,
      attackCooldown: 1.4,
      radius: 0.6,
      height: 1.6,
      scale: 1.05,
      scoreValue: 180,
      damageMultipliers: {
        ice: 1.8,
        thunder: 1.0,
        meteor: 1.2,
        beam: 2.2,
        snare: 1.4
      },
      ...opts
    });
  }

  buildModel() {
    const shroudMat = createProceduralMonsterMaterial({
      edgeColor: '#38bdf8',
      midColor: '#0369a1',
      deepColor: '#082f49',
      emissiveColor: '#7dd3fc',
      noiseScale: 3.0,
      transparent: true,
      opacity: 0.8,
      glow: 1.3
    });
    const soulMat = createProceduralMonsterMaterial({
      edgeColor: '#ffffff',
      midColor: '#38bdf8',
      deepColor: '#0284c7',
      emissiveColor: '#a5f3fc',
      noiseScale: 6.0,
      glow: 1.8
    });
    this.materials.push(shroudMat, soulMat);

    this.rootOffset = new Group();
    this.rootOffset.position.y = 1.25;
    this.group.add(this.rootOffset);

    // Floating hooded cowl
    const cowl = new Mesh(new SphereGeometry(0.36, 14, 14), shroudMat);
    cowl.scale.set(0.9, 1.15, 0.9);
    this.rootOffset.add(cowl);

    // Pulsing soul singularity
    const soul = new Mesh(new SphereGeometry(0.18, 12, 12), soulMat);
    soul.position.set(0, 0.02, 0.12);
    this.rootOffset.add(soul);

    // Flowing shroud body
    const bodyShroud = new Mesh(new ConeGeometry(0.48, 1.2, 10, 2, true), shroudMat);
    bodyShroud.rotation.x = Math.PI;
    bodyShroud.position.y = -0.6;
    this.rootOffset.add(bodyShroud);

    // Spectral wings
    this.leftWing = new Mesh(new BoxGeometry(0.08, 0.65, 0.38), shroudMat);
    this.leftWing.position.set(-0.48, -0.1, -0.1);
    this.rootOffset.add(this.leftWing);

    this.rightWing = new Mesh(new BoxGeometry(0.08, 0.65, 0.38), shroudMat);
    this.rightWing.position.set(0.48, -0.1, -0.1);
    this.rootOffset.add(this.rightWing);
  }

  updateAnimation(dt, time, speed) {
    this.rootOffset.position.y = 1.25 + Math.sin(time * 3.0) * 0.14;
    this.rootOffset.rotation.z = Math.sin(time * 2.0) * 0.08;
    this.rootOffset.rotation.x = Math.sin(time * 2.5) * 0.06;

    this.leftWing.rotation.z = 0.3 + Math.sin(time * 4.2) * 0.28;
    this.rightWing.rotation.z = -0.3 - Math.sin(time * 4.2) * 0.28;
  }
}

// --------------------------------------------------------------------------
// 4. Pyre Fiend (Sleek Volcanic Horned Predator Hound)
// --------------------------------------------------------------------------
export class PyreFiend extends Enemy {
  constructor(scene, opts = {}) {
    super(scene, {
      type: 'pyrefiend',
      name: 'Pyre Fiend',
      maxHp: 110,
      speed: 5.2,
      damage: 20,
      attackRange: 1.6,
      attackCooldown: 0.8,
      radius: 0.7,
      height: 1.2,
      scale: 1.15,
      scoreValue: 220,
      damageMultipliers: {
        ice: 2.8,
        thunder: 1.1,
        meteor: 0.3,
        beam: 1.4,
        snare: 1.5
      },
      ...opts
    });
  }

  buildModel() {
    const skinMat = createProceduralMonsterMaterial({
      edgeColor: '#f97316',
      midColor: '#7c2d12',
      deepColor: '#1c0a06',
      emissiveColor: '#ff4500',
      noiseScale: 3.2,
      glow: 1.2
    });
    const flameMat = createProceduralMonsterMaterial({
      edgeColor: '#ffd27f',
      midColor: '#ff5a1e',
      deepColor: '#991b1b',
      emissiveColor: '#ff7a2a',
      noiseScale: 5.5,
      glow: 1.7
    });
    this.materials.push(skinMat, flameMat);

    this.body = new Group();
    this.body.position.y = 0.7;
    this.group.add(this.body);

    // Faceted hound torso
    const chest = new Mesh(new BoxGeometry(0.55, 0.48, 1.15), skinMat);
    this.body.add(chest);

    // Fiery dorsal crest spines
    for (let i = 0; i < 3; i++) {
      const spine = new Mesh(new ConeGeometry(0.08, 0.38, 4), flameMat);
      spine.position.set(0, 0.36, -0.3 + i * 0.3);
      spine.rotation.x = -0.25;
      this.body.add(spine);
    }

    // Predatory horned skull
    this.head = new Group();
    this.head.position.set(0, 0.25, 0.65);
    this.body.add(this.head);

    const skull = new Mesh(new BoxGeometry(0.35, 0.3, 0.45), skinMat);
    this.head.add(skull);

    // Curved fiery horns
    const hornL = new Mesh(new ConeGeometry(0.06, 0.38, 4), flameMat);
    hornL.position.set(0.16, 0.25, -0.05);
    hornL.rotation.x = -0.4;
    hornL.rotation.z = -0.3;

    const hornR = new Mesh(new ConeGeometry(0.06, 0.38, 4), flameMat);
    hornR.position.set(-0.16, 0.25, -0.05);
    hornR.rotation.x = -0.4;
    hornR.rotation.z = 0.3;
    this.head.add(hornL, hornR);

    // 4 Articulated beast legs
    this.legs = [];
    const legGeo = new CylinderGeometry(0.08, 0.04, 0.65, 5);
    legGeo.translate(0, -0.32, 0);

    const legOffsets = [
      { x: 0.28, z: 0.4 },
      { x: -0.28, z: 0.4 },
      { x: 0.28, z: -0.4 },
      { x: -0.28, z: -0.4 }
    ];

    legOffsets.forEach((pos, i) => {
      const legRoot = new Group();
      legRoot.position.set(pos.x, 0.6, pos.z);
      this.group.add(legRoot);
      const legMesh = new Mesh(legGeo, skinMat);
      legRoot.add(legMesh);
      this.legs.push({ root: legRoot, phase: i * Math.PI * 0.5 });
    });
  }

  updateAnimation(dt, time, speed) {
    const moving = speed > 0.1;
    const runFreq = speed * 3.8;

    this.body.position.y = 0.7 + (moving ? Math.sin(time * runFreq * 2) * 0.08 : Math.sin(time * 2) * 0.02);
    this.head.rotation.x = moving ? Math.sin(time * runFreq) * 0.1 : 0;

    this.legs.forEach((leg) => {
      if (moving) {
        leg.root.rotation.x = Math.sin(time * runFreq + leg.phase) * 0.7;
      } else {
        leg.root.rotation.x = 0;
      }
    });
  }
}

// --------------------------------------------------------------------------
// 5. Gloom Behemoth (Wave Boss Monolith with Rotating Shield Crystals)
// --------------------------------------------------------------------------
export class GloomBehemoth extends Enemy {
  constructor(scene, opts = {}) {
    super(scene, {
      type: 'behemoth',
      name: 'Gloom Behemoth',
      maxHp: 650,
      speed: 1.8,
      damage: 45,
      attackRange: 2.8,
      attackCooldown: 2.2,
      radius: 1.6,
      height: 3.2,
      scale: 1.8,
      scoreValue: 1000,
      damageMultipliers: {
        ice: 1.2,
        thunder: 1.5,
        meteor: 1.4,
        beam: 1.6,
        snare: 1.5
      },
      ...opts
    });
  }

  buildModel() {
    const titanMat = createProceduralMonsterMaterial({
      edgeColor: '#a855f7',
      midColor: '#4c1d95',
      deepColor: '#0d041a',
      emissiveColor: '#c084fc',
      noiseScale: 2.2,
      glow: 1.1
    });
    const voidEyeMat = createProceduralMonsterMaterial({
      edgeColor: '#ff4d79',
      midColor: '#e11d48',
      deepColor: '#4c0519',
      emissiveColor: '#fb7185',
      noiseScale: 5.0,
      glow: 1.9
    });
    const shieldMat = createProceduralMonsterMaterial({
      edgeColor: '#38bdf8',
      midColor: '#818cf8',
      deepColor: '#1e1b4b',
      emissiveColor: '#a5b4fc',
      noiseScale: 4.0,
      glow: 1.5
    });
    this.materials.push(titanMat, voidEyeMat, shieldMat);

    this.torso = new Group();
    this.torso.position.y = 1.8;
    this.group.add(this.torso);

    // Monolithic faceted diamond torso
    const bodyMesh = new Mesh(new IcosahedronGeometry(0.85, 1), titanMat);
    bodyMesh.scale.set(1.2, 1.45, 1.0);
    this.torso.add(bodyMesh);

    // Glowing giant cyclopean void eye
    const eye = new Mesh(new SphereGeometry(0.32, 16, 16), voidEyeMat);
    eye.position.set(0, 0.2, 0.72);
    this.torso.add(eye);

    // 3 Orbiting faceted shield crystals
    this.shields = [];
    this.shieldRing = new Group();
    this.torso.add(this.shieldRing);

    for (let i = 0; i < 3; i++) {
      const shield = new Mesh(new ConeGeometry(0.22, 0.75, 5), shieldMat);
      const angle = (i / 3) * Math.PI * 2;
      shield.position.set(Math.cos(angle) * 1.6, 0, Math.sin(angle) * 1.6);
      shield.rotation.z = Math.PI / 2;
      this.shieldRing.add(shield);
      this.shields.push(shield);
    }

    // Heavy monolithic pillar legs
    this.legL = new Mesh(new CylinderGeometry(0.32, 0.45, 1.25, 6), titanMat);
    this.legL.position.set(-0.62, 0.6, 0);
    this.group.add(this.legL);

    this.legR = new Mesh(new CylinderGeometry(0.32, 0.45, 1.25, 6), titanMat);
    this.legR.position.set(0.62, 0.6, 0);
    this.group.add(this.legR);
  }

  updateAnimation(dt, time, speed) {
    const moving = speed > 0.1;
    const walkFreq = speed * 2.2;

    this.torso.position.y = 1.8 + (moving ? Math.sin(time * walkFreq * 2) * 0.1 : Math.sin(time * 1.2) * 0.05);
    this.shieldRing.rotation.y += dt * 2.5;

    this.legL.position.z = moving ? Math.sin(time * walkFreq) * 0.35 : 0;
    this.legR.position.z = moving ? -Math.sin(time * walkFreq) * 0.35 : 0;
  }
}
