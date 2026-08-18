// @ts-nocheck
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  ConeGeometry,
  SphereGeometry,
  BoxGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  TorusGeometry,
  Color,
  Vector3
} from 'three';
import { Enemy } from './Enemy';

// --------------------------------------------------------------------------
// 1. Void Crawler (Fast, aggressive arachnid swarmer)
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
        beam: 2.0, // weak to concentrated laser beam
        snare: 1.3
      },
      ...opts
    });
  }

  buildModel() {
    const carapaceMat = new MeshStandardMaterial({ color: new Color('#1c142b'), roughness: 0.3, metalness: 0.7 });
    const glowMat = new MeshStandardMaterial({ color: new Color('#7a22ff'), emissive: new Color('#a855f7'), emissiveIntensity: 0.8, roughness: 0.2 });
    this.materials.push(carapaceMat, glowMat);

    // Torso / Carapace
    this.body = new Group();
    this.body.position.y = 0.45;
    this.group.add(this.body);

    const core = new Mesh(new IcosahedronGeometry(0.35, 1), carapaceMat);
    core.scale.set(0.9, 0.7, 1.3);
    this.body.add(core);

    // Glowing crystal spine
    const spine = new Mesh(new ConeGeometry(0.12, 0.45, 5), glowMat);
    spine.rotation.x = -Math.PI * 0.3;
    spine.position.set(0, 0.25, -0.1);
    this.body.add(spine);

    // Glowing eyes
    const eyeL = new Mesh(new SphereGeometry(0.06, 8, 8), glowMat);
    eyeL.position.set(0.12, 0.08, 0.38);
    const eyeR = new Mesh(new SphereGeometry(0.06, 8, 8), glowMat);
    eyeR.position.set(-0.12, 0.08, 0.38);
    this.body.add(eyeL, eyeR);

    // 4 Scuttling Legs
    this.legs = [];
    const legGeo = new CylinderGeometry(0.04, 0.02, 0.5, 5);
    legGeo.translate(0, -0.25, 0);

    const legPositions = [
      { x: 0.3, z: 0.2, sign: 1 },
      { x: -0.3, z: 0.2, sign: -1 },
      { x: 0.32, z: -0.2, sign: 1 },
      { x: -0.32, z: -0.2, sign: -1 }
    ];

    legPositions.forEach((p, i) => {
      const legRoot = new Group();
      legRoot.position.set(p.x, 0.35, p.z);
      this.group.add(legRoot);

      const upper = new Mesh(legGeo, carapaceMat);
      upper.rotation.z = p.sign * 0.7;
      upper.rotation.x = (i < 2 ? 0.2 : -0.2);
      legRoot.add(upper);

      this.legs.push({ root: legRoot, upper, sign: p.sign, phase: i * Math.PI * 0.5 });
    });
  }

  updateAnimation(dt, time, speed) {
    // Scuttle body bobbing
    const moving = speed > 0.1;
    const walkFreq = speed * 4.5;
    this.body.position.y = 0.45 + (moving ? Math.sin(time * walkFreq * 2) * 0.04 : Math.sin(time * 2) * 0.02);
    this.body.rotation.z = moving ? Math.sin(time * walkFreq) * 0.06 : 0;

    // Scuttle leg rotation
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
// 2. Obsidian Golem (Heavy armored rock/magma tank)
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
        thunder: 2.0, // High conductivity breaks rock armor
        meteor: 0.7, // High fire resistance
        beam: 1.2,
        snare: 1.8 // Heavy weight gets crushed by gravitational snare
      },
      ...opts
    });
  }

  buildModel() {
    const rockMat = new MeshStandardMaterial({ color: new Color('#1e1c24'), roughness: 0.85, metalness: 0.2 });
    const magmaMat = new MeshStandardMaterial({ color: new Color('#ff4500'), emissive: new Color('#ff6600'), emissiveIntensity: 1.1, roughness: 0.4 });
    this.materials.push(rockMat, magmaMat);

    this.torso = new Group();
    this.torso.position.y = 1.4;
    this.group.add(this.torso);

    // Heavy torso block
    const chest = new Mesh(new BoxGeometry(1.1, 0.85, 0.75), rockMat);
    this.torso.add(chest);

    // Glowing molten core heart
    const core = new Mesh(new IcosahedronGeometry(0.26, 1), magmaMat);
    core.position.set(0, 0.05, 0.32);
    this.torso.add(core);

    // Head block with magma eye slit
    this.head = new Group();
    this.head.position.set(0, 0.65, 0.1);
    this.torso.add(this.head);

    const skull = new Mesh(new BoxGeometry(0.5, 0.4, 0.45), rockMat);
    this.head.add(skull);
    const eyeVisor = new Mesh(new BoxGeometry(0.38, 0.08, 0.1), magmaMat);
    eyeVisor.position.set(0, 0.02, 0.22);
    this.head.add(eyeVisor);

    // Heavy floating boulder fists
    this.leftArm = new Group();
    this.leftArm.position.set(-0.85, 0.1, 0);
    this.torso.add(this.leftArm);
    const lFist = new Mesh(new BoxGeometry(0.45, 0.7, 0.5), rockMat);
    lFist.position.y = -0.4;
    this.leftArm.add(lFist);

    this.rightArm = new Group();
    this.rightArm.position.set(0.85, 0.1, 0);
    this.torso.add(this.rightArm);
    const rFist = new Mesh(new BoxGeometry(0.45, 0.7, 0.5), rockMat);
    rFist.position.y = -0.4;
    this.rightArm.add(rFist);

    // Heavy pillar legs
    this.leftLeg = new Mesh(new BoxGeometry(0.4, 0.85, 0.45), rockMat);
    this.leftLeg.position.set(-0.35, 0.45, 0);
    this.group.add(this.leftLeg);

    this.rightLeg = new Mesh(new BoxGeometry(0.4, 0.85, 0.45), rockMat);
    this.rightLeg.position.set(0.35, 0.45, 0);
    this.group.add(this.rightLeg);
  }

  updateAnimation(dt, time, speed) {
    const moving = speed > 0.1;
    const walkFreq = speed * 3.2;

    this.torso.position.y = 1.4 + (moving ? Math.sin(time * walkFreq * 2) * 0.08 : Math.sin(time * 1.5) * 0.03);
    this.torso.rotation.y = moving ? Math.sin(time * walkFreq) * 0.12 : 0;
    this.torso.rotation.z = moving ? Math.cos(time * walkFreq) * 0.05 : 0;

    // Heavy arm swings
    this.leftArm.rotation.x = moving ? Math.sin(time * walkFreq) * 0.6 : Math.sin(time * 1.5) * 0.05;
    this.rightArm.rotation.x = moving ? -Math.sin(time * walkFreq) * 0.6 : -Math.sin(time * 1.5) * 0.05;

    // Leg stride
    this.leftLeg.position.z = moving ? Math.sin(time * walkFreq) * 0.25 : 0;
    this.rightLeg.position.z = moving ? -Math.sin(time * walkFreq) * 0.25 : 0;

    // Attack punch animation
    if (this.state === 'attack') {
      this.rightArm.rotation.x = -1.2;
      this.rightArm.position.z = 0.4;
    } else {
      this.rightArm.position.z = 0;
    }
  }
}

// --------------------------------------------------------------------------
// 3. Aether Phantom (Hovering spectral flyer)
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
        ice: 1.8, // Frost crystalizes spectral aura
        thunder: 1.0,
        meteor: 1.2,
        beam: 2.2, // Piercing beam burns through spectral form
        snare: 1.4
      },
      ...opts
    });
  }

  buildModel() {
    const shroudMat = new MeshStandardMaterial({ color: new Color('#0f172a'), roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.85 });
    const soulMat = new MeshStandardMaterial({ color: new Color('#38bdf8'), emissive: new Color('#0284c7'), emissiveIntensity: 1.4, roughness: 0.1 });
    this.materials.push(shroudMat, soulMat);

    this.rootOffset = new Group();
    this.rootOffset.position.y = 1.2;
    this.group.add(this.rootOffset);

    // Floating hooded cowl
    const cowl = new Mesh(new SphereGeometry(0.35, 12, 12), shroudMat);
    cowl.scale.set(0.9, 1.1, 0.9);
    this.rootOffset.add(cowl);

    // Glowing soul orb inside cowl
    const soul = new Mesh(new SphereGeometry(0.18, 10, 10), soulMat);
    soul.position.set(0, 0.02, 0.12);
    this.rootOffset.add(soul);

    // Floating shroud body cone
    const bodyShroud = new Mesh(new ConeGeometry(0.45, 1.1, 8, 1, true), shroudMat);
    bodyShroud.rotation.x = Math.PI;
    bodyShroud.position.y = -0.55;
    this.rootOffset.add(bodyShroud);

    // Spectral wings / wisps
    this.leftWing = new Mesh(new BoxGeometry(0.1, 0.6, 0.35), shroudMat);
    this.leftWing.position.set(-0.45, -0.1, -0.1);
    this.rootOffset.add(this.leftWing);

    this.rightWing = new Mesh(new BoxGeometry(0.1, 0.6, 0.35), shroudMat);
    this.rightWing.position.set(0.45, -0.1, -0.1);
    this.rootOffset.add(this.rightWing);
  }

  updateAnimation(dt, time, speed) {
    // Floating smooth hover bobbing
    this.rootOffset.position.y = 1.2 + Math.sin(time * 3.0) * 0.15;
    this.rootOffset.rotation.z = Math.sin(time * 2.0) * 0.08;
    this.rootOffset.rotation.x = Math.sin(time * 2.5) * 0.06;

    // Wing flapping / undulation
    this.leftWing.rotation.z = 0.3 + Math.sin(time * 4.0) * 0.25;
    this.rightWing.rotation.z = -0.3 - Math.sin(time * 4.0) * 0.25;
  }
}

// --------------------------------------------------------------------------
// 4. Pyre Fiend (Blazing fast predator beast)
// --------------------------------------------------------------------------
export class PyreFiend extends Enemy {
  constructor(scene, opts = {}) {
    super(scene, {
      type: 'pyrefiend',
      name: 'Pyre Fiend',
      maxHp: 110,
      speed: 5.2, // Very fast
      damage: 20,
      attackRange: 1.6,
      attackCooldown: 0.8,
      radius: 0.7,
      height: 1.2,
      scale: 1.15,
      scoreValue: 220,
      damageMultipliers: {
        ice: 2.8, // EXTREME weakness to Frost Lance! (Element counter)
        thunder: 1.1,
        meteor: 0.3, // Absorbs/resists fire
        beam: 1.4,
        snare: 1.5
      },
      ...opts
    });
  }

  buildModel() {
    const skinMat = new MeshStandardMaterial({ color: new Color('#2c0c08'), roughness: 0.6, metalness: 0.4 });
    const flameMat = new MeshStandardMaterial({ color: new Color('#ff7700'), emissive: new Color('#ff4400'), emissiveIntensity: 1.5, roughness: 0.2 });
    this.materials.push(skinMat, flameMat);

    this.body = new Group();
    this.body.position.y = 0.7;
    this.group.add(this.body);

    // Hound torso
    const chest = new Mesh(new BoxGeometry(0.55, 0.5, 1.1), skinMat);
    this.body.add(chest);

    // Fiery dorsal fin spines
    for (let i = 0; i < 3; i++) {
      const spine = new Mesh(new ConeGeometry(0.08, 0.35, 4), flameMat);
      spine.position.set(0, 0.35, -0.3 + i * 0.3);
      spine.rotation.x = -0.2;
      this.body.add(spine);
    }

    // Snouted predator head
    this.head = new Group();
    this.head.position.set(0, 0.25, 0.65);
    this.body.add(this.head);

    const skull = new Mesh(new BoxGeometry(0.35, 0.3, 0.45), skinMat);
    this.head.add(skull);

    // Fiery curved horns
    const hornL = new Mesh(new ConeGeometry(0.06, 0.35, 4), flameMat);
    hornL.position.set(0.16, 0.25, -0.05);
    hornL.rotation.x = -0.4;
    hornL.rotation.z = -0.3;

    const hornR = new Mesh(new ConeGeometry(0.06, 0.35, 4), flameMat);
    hornR.position.set(-0.16, 0.25, -0.05);
    hornR.rotation.x = -0.4;
    hornR.rotation.z = 0.3;
    this.head.add(hornL, hornR);

    // 4 Beast Legs
    this.legs = [];
    const legGeo = new BoxGeometry(0.12, 0.65, 0.16);
    legGeo.translate(0, -0.32, 0);

    const legOffsets = [
      { x: 0.26, z: 0.4 },
      { x: -0.26, z: 0.4 },
      { x: 0.26, z: -0.4 },
      { x: -0.26, z: -0.4 }
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

    // Gallop leg animation
    this.legs.forEach((leg, i) => {
      if (moving) {
        leg.root.rotation.x = Math.sin(time * runFreq + leg.phase) * 0.7;
      } else {
        leg.root.rotation.x = 0;
      }
    });
  }
}

// --------------------------------------------------------------------------
// 5. Gloom Behemoth (Wave Boss Titan with Orbiting Shields)
// --------------------------------------------------------------------------
export class GloomBehemoth extends Enemy {
  constructor(scene, opts = {}) {
    super(scene, {
      type: 'behemoth',
      name: 'Gloom Behemoth',
      maxHp: 650, // Boss tier health
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
    const titanMat = new MeshStandardMaterial({ color: new Color('#120a21'), roughness: 0.4, metalness: 0.8 });
    const voidEyeMat = new MeshStandardMaterial({ color: new Color('#e11d48'), emissive: new Color('#be123c'), emissiveIntensity: 1.8, roughness: 0.1 });
    const shieldMat = new MeshStandardMaterial({ color: new Color('#7c3aed'), emissive: new Color('#6d28d9'), emissiveIntensity: 1.2, roughness: 0.2 });
    this.materials.push(titanMat, voidEyeMat, shieldMat);

    this.torso = new Group();
    this.torso.position.y = 1.8;
    this.group.add(this.torso);

    // Massive diamond chassis
    const bodyMesh = new Mesh(new IcosahedronGeometry(0.8, 1), titanMat);
    bodyMesh.scale.set(1.2, 1.4, 1.0);
    this.torso.add(bodyMesh);

    // Glowing giant cyclopean eye
    const eye = new Mesh(new SphereGeometry(0.3, 16, 16), voidEyeMat);
    eye.position.set(0, 0.2, 0.7);
    this.torso.add(eye);

    // 3 Orbiting Shield Crystals
    this.shields = [];
    this.shieldRing = new Group();
    this.torso.add(this.shieldRing);

    for (let i = 0; i < 3; i++) {
      const shield = new Mesh(new ConeGeometry(0.2, 0.7, 5), shieldMat);
      const angle = (i / 3) * Math.PI * 2;
      shield.position.set(Math.cos(angle) * 1.5, 0, Math.sin(angle) * 1.5);
      shield.rotation.z = Math.PI / 2;
      this.shieldRing.add(shield);
      this.shields.push(shield);
    }

    // Heavy stomp legs
    this.legL = new Mesh(new CylinderGeometry(0.3, 0.45, 1.2, 6), titanMat);
    this.legL.position.set(-0.6, 0.6, 0);
    this.group.add(this.legL);

    this.legR = new Mesh(new CylinderGeometry(0.3, 0.45, 1.2, 6), titanMat);
    this.legR.position.set(0.6, 0.6, 0);
    this.group.add(this.legR);
  }

  updateAnimation(dt, time, speed) {
    const moving = speed > 0.1;
    const walkFreq = speed * 2.2;

    this.torso.position.y = 1.8 + (moving ? Math.sin(time * walkFreq * 2) * 0.1 : Math.sin(time * 1.2) * 0.05);

    // Rotate the orbital shield crystals around boss
    this.shieldRing.rotation.y += dt * 2.5;

    // Heavy stride
    this.legL.position.z = moving ? Math.sin(time * walkFreq) * 0.35 : 0;
    this.legR.position.z = moving ? -Math.sin(time * walkFreq) * 0.35 : 0;
  }
}
