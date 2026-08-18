// @ts-nocheck
/**
 * settings.ts — the single source of truth for every parameter.
 */

export const CastShape = Object.freeze({ LINE: 'line', ZONE: 'zone' });

/** The five slots, in bar order. The HUD and input are built from this array. */
export const ELEMENTS = ['ice', 'thunder', 'meteor', 'beam', 'snare'];

export const ELEMENT_META = {
  ice: { key: 'Q', label: 'Frost Lance', shape: CastShape.LINE, color: '#9fe8ff', glyph: '❄', description: 'Freezes & shatters foes into tumbling ice shards' },
  thunder: { key: 'E', label: 'Storm Lance', shape: CastShape.LINE, color: '#7fb8ff', glyph: '⚡', description: 'Electrocutes & chains lightning across swarms' },
  meteor: { key: 'R', label: 'Cinder Fall', shape: CastShape.LINE, color: '#ff8a3a', glyph: '☄', description: 'Obliterates area with fiery blast & burning debris' },
  beam: { key: 'F', label: 'Nova Beam', shape: CastShape.LINE, color: '#aee6ff', glyph: '✦', description: 'Piercing laser beam that disintegrates targets' },
  snare: { key: 'V', label: 'Voltaic Snare', shape: CastShape.ZONE, color: '#c08bff', glyph: '⬡', description: 'Vortex zone that pulls, roots & crushes enemies' }
};

export const POWERUPS = [
  { id: 'dmg_boost', title: 'Elemental Catalyst', desc: '+25% Spell Damage across all elements', icon: '⚡', apply: (char) => { char.buffs.damageMul *= 1.25; } },
  { id: 'cd_reduc', title: 'Chrono Infusion', desc: '-20% All Ability Cooldowns', icon: '⏳', apply: (char) => { char.buffs.cooldownMul *= 0.8; } },
  { id: 'speed_up', title: 'Aether Stride', desc: '+25% Movement Speed & Dash Velocity', icon: '💨', apply: (char) => { char.buffs.moveSpeedMul *= 1.25; } },
  { id: 'shield_up', title: 'Titan Aegis', desc: '+50 Max Shield & Instant Shield Recharge', icon: '🛡', apply: (char) => { char.buffs.shieldBonus += 50; char.shield = char.maxShield + char.buffs.shieldBonus; } },
  { id: 'heal_full', title: 'Essence Restoration', desc: 'Instantly Restore 100% Health & Shield', icon: '💖', apply: (char) => { char.health = char.maxHealth; char.shield = char.maxShield + char.buffs.shieldBonus; } }
];

export function castShapeOf(element) {
  return ELEMENT_META[element]?.shape ?? CastShape.LINE;
}

export const settings = {
  global: {
    speed: 1,
    glow: 1,
    noise: 1,
    particles: 1,
    lights: 1,
    impact: 1,
    shake: 0.5,
    timeScale: 1
  },

  aim: {
    reveal: 0.18,
    shaft: 0.42, // metres
    headLength: 1.5,
    headHalf: 0.95,
    outline: 0.05,
    chevronSpacing: 1.0,
    frost: 0.6,
    color: '#7fdfff',
    colorInvalid: '#ff5566'
  },

  zone: {
    reveal: 0.24,
    boundary: 0.34, // metres, the heavy ring
    boundaryBias: 0.42,
    snap: 1.0,
    contour: 0.5,
    color: '#b07bff',
    colorInvalid: '#ff5566'
  },

  ice: {
    range: 14,
    minRange: 0,
    speed: 18,
    cooldown: 0.35,
    count: 220,
    height: 3.2,
    heightCurve: 1.4,
    frontBias: 0.7,
    lean: 0.25,
    clumping: 0.5,
    taper: 0.5,
    roughness: 0.5,
    bend: 0.3,
    opacity: 0.92,
    colorEdge: '#e6f8ff',
    colorMid: '#4fc3ff',
    colorDeep: '#175a93',
    groundColor: '#86e6ff',
    birthFade: 0.35,
    lightColor: '#9fe8ff',
    lightIntensity: 6,
    lightRadius: 12
  },

  thunder: {
    range: 15,
    minRange: 0,
    speed: 32,
    cooldown: 0.35,
    strands: 14,
    samples: 64,
    spread: 1.4,
    spreadNear: 0.18,
    twist: 1.5,
    sag: 0.5,
    jitter: 1.0,
    jitterScale: 2.2,
    restrike: 5,
    crawl: 1.0,
    ribbonWidth: 0.18,
    colorCore: '#eaf6ff',
    colorGlow: '#5ab0ff',
    colorHalo: '#2e6bff',
    burnColor: '#3a7bff',
    lightColor: '#7fd0ff',
    lightIntensity: 8,
    lightRadius: 14
  },

  meteor: {
    range: 14,
    minRange: 0,
    speed: 14,
    cooldown: 0.45,
    arcHeight: 7,
    radius: 0.72,
    lava: 0.85,
    crackColor: '#ff5a1e',
    rockColor: '#3a2a28',
    glowColor: '#ff7a2a',
    coreColor: '#ffd27f',
    lightColor: '#ff8a3a',
    lightIntensity: 10,
    lightRadius: 14
  },

  beam: {
    range: 15,
    minRange: 0,
    speed: 18,
    cooldown: 0.4,
    radius: 0.55,
    flare: 1.6,
    charge: 0.55,
    lifetime: 1.0,
    coreWidth: 0.5,
    coreFill: 0.6,
    coils: 6,
    rings: 12,
    haloColor: '#1e6bff',
    sheathColor: '#3fd0ff',
    coreColor: '#ffffff',
    coilColor: '#ffd86a',
    lightColor: '#9fd8ff',
    lightIntensity: 12,
    lightRadius: 16
  },

  snare: {
    range: 15,
    minRange: 0,
    speed: 20,
    cooldown: 0.5,
    zoneRadius: 3.6,
    height: 4.6,
    throat: 0.4,
    columnSpread: 1.4,
    tendrils: 10,
    rimArcs: 6,
    strands: 56,
    snapTime: 0.35,
    colorCore: '#f0d8ff',
    colorGlow: '#a05bff',
    fieldColor: '#7a3bff',
    lightColor: '#b985ff',
    lightIntensity: 9,
    lightRadius: 12
  },

  world: {
    fogColor: '#05070d',
    fogNear: 20,
    fogFar: 70,
    groundColor: '#080b12',
    gridColor: '#16223c',
    ambient: 0.3,
    hemiSky: '#27406b',
    hemiGround: '#0a0d14',
    sunColor: '#bcd6ff',
    sunIntensity: 2.2
  },

  post: {
    bloom: 1,
    bloomStrength: 0.95,
    bloomRadius: 0.6,
    bloomThreshold: 0.18,
    exposure: 1.1,
    vignette: 0.5,
    aberration: 0.6,
    grain: 0.05
  },

  character: {
    castBlendIn: 0.12,
    castBlendOut: 0.2,
    scale: 1
  }
};

/** Deep-clone a plain object (used by presets). */
export function cloneSettings() {
  return JSON.parse(JSON.stringify(settings));
}
