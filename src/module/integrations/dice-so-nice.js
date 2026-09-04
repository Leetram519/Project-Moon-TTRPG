import { ModuleRegistry } from './module-registry.js';

export async function registerDiceSoNice(dice3d) {
  // Sanity Check
  if(!ModuleRegistry.isEnabled("dice-so-nice")) return;

  dice3d.addColorset({
    name: 'blunt',
    description: 'Blunt Damage',
    category: 'Damage',
    foreground: '#ff7917',
    background: '#4d2f1a',
    outline: 'none',
    edge: '#ff7917',
    texture: 'concrete',
    material: 'stone',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'slash',
    description: 'Slash Damage',
    category: 'Damage',
    foreground: '#ff7917',
    background: '#4d2f1a',
    outline: 'none',
    edge: '#ff7917',
    texture: 'bronze01',
    material: 'metal',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'pierce',
    description: 'Pierce Damage',
    category: 'Damage',
    foreground: '#ff7917',
    background: '#4d2f1a',
    outline: 'none',
    edge: '#ff7917',
    texture: 'ice',
    material: 'glass',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'evade',
    description: 'Evade Dice',
    category: 'Defense',
    foreground: '#00f9ff',
    background: '#0f5657',
    outline: 'none',
    edge: '#00f9ff',
    texture: 'frosted',
    material: 'cloudy',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'block',
    description: 'Block Dice',
    category: 'Defense',
    foreground: '#00f9ff',
    background: '#0f5657',
    outline: 'none',
    edge: '#00f9ff',
    texture: 'metal',
    material: 'none',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'kinetic',
    description: 'Kinetic Force Damage',
    category: 'Combat',
    foreground: '#ffffff',
    background: '#000000',
    outline: 'none',
    edge: '#ffffff',
    texture: 'stars',
    material: 'glass',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'poise',
    description: 'Poise',
    category: 'Critical',
    foreground: '#bec5c6',
    background: '#333333',
    outline: 'none',
    edge: '#bec5c6',
    texture: 'water',
    material: 'glass',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'critical',
    description: 'Critical',
    category: 'Critical',
    foreground: '#dabe17',
    background: '#333333',
    outline: 'none',
    edge: '#dabe17',
    texture: 'water_2',
    material: 'glass',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'ruin',
    description: 'Ruin',
    category: 'Devastation',
    foreground: '#aa1a1f',
    background: '#13082b',
    outline: 'none',
    edge: '#38177e',
    texture: 'none',
    material: 'chrome',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'devastation',
    description: 'Devastation',
    category: 'Devastation',
    foreground: '#301368',
    background: '#000000',
    outline: 'none',
    edge: '#54108d',
    texture: 'none',
    material: 'chrome',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'fortitude',
    description: 'Fortitude',
    category: 'Stats',
    foreground: '#ff0000',
    background: '#000000',
    outline: 'none',
    edge: '#ff0000',
    texture: 'none',
    material: 'frosted',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'prudence',
    description: 'Prudence',
    category: 'Stats',
    foreground: '#ede9bd',
    background: '#000000',
    outline: 'none',
    edge: '#ede9bd',
    texture: 'none',
    material: 'frosted',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'justice',
    description: 'Justice',
    category: 'Stats',
    foreground: '#3fbdb3',
    background: '#000000',
    outline: 'none',
    edge: '#3fbdb3',
    texture: 'none',
    material: 'frosted',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'charm',
    description: 'Charm',
    category: 'Stats',
    foreground: '#834c81',
    background: '#000000',
    outline: 'none',
    edge: '#834c81',
    texture: 'none',
    material: 'frosted',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'insight',
    description: 'Insight',
    category: 'Stats',
    foreground: '#f2ebc0',
    background: '#000000',
    outline: 'none',
    edge: '#f2ebc0',
    texture: 'none',
    material: 'frosted',
    font: 'signika'
  });

  dice3d.addColorset({
    name: 'temperance',
    description: 'Temperance',
    category: 'Stats',
    foreground: '#804c82',
    background: '#000000',
    outline: 'none',
    edge: '#804c82',
    texture: 'none',
    material: 'frosted',
    font: 'signika'
  });

  // ─── DAMAGE TYPE DEFAULTS ────────────────────────────────────────────────────

  dice3d.addDamageTypeDefaults({
    blunt: {
      colorset: 'blunt',
      label: 'Blunt'
    },
    slash: {
      colorset: 'slash',
      label: 'Slash'
    },
    pierce: {
      colorset: 'pierce',
      label: 'Pierce'
    },
    evade: {
      colorset: 'evade',
      label: 'Evade'
    },
    block: {
      colorset: 'block',
      label: 'Block'
    },
    force: {
      colorset: 'kinetic',
      label: 'Force'
    },
    poise: {
      colorset: 'poise',
      label: 'Poise'
    },
    critical: {
      colorset: 'critical',
      label: 'Critical'
    },
    ruin: {
      colorset: 'ruin',
      label: 'Ruin'
    },
    devastation: {
      colorset: 'devastation',
      label: 'Devastation'
    },
    fortitude: {
      colorset: 'fortitude',
      label: 'Fortitude'
    },
    prudence: {
      colorset: 'prudence',
      label: 'Prudence'
    },
    justice: {
      colorset: 'justice',
      label: 'Justice'
    },
    charm: {
      colorset: 'charm',
      label: 'Charm'
    },
    insight: {
      colorset: 'insight',
      label: 'Insight'
    },
    temperance: {
      colorset: 'temperance',
      label: 'Temperance'
    }
  });
}

export function getDiceType(key) {
  switch(key){
    case "for":
      return "fortitude";
    case "pru":
      return "prudence";
    case "jus":
      return "justice";
    case "cha":
      return "charm";
    case "ins":
      return "insight";
    case "tem":
      return "temperance";
  }
  return "none";
}