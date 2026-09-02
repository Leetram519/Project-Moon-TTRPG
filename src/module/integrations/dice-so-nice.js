import { ModuleRegistry } from './module-registry.js';

export async function registerDiceSoNice(dice3d) {
  // Sanity Check
  if(!ModuleRegistry.isEnabled("dice-so-nice")) return;

  dice3d.addColorset({
    name: 'blunt',
    description: 'Blunt Damage',
    category: 'Damage',
    foreground: '#F2D98A',
    background: '#2E1F0E',
    outline: '#7A5C30',
    texture: 'wood',
    material: 'wood'
  });

  dice3d.addColorset({
    name: 'slash',
    description: 'Slash Damage',
    category: 'Damage',
    foreground: '#FF9EA8',
    background: '#1A0006',
    outline: '#C0233A',
    texture: 'stainedglass',
    material: 'glass'
  });

  dice3d.addColorset({
    name: 'pierce',
    description: 'Pierce Damage',
    category: 'Damage',
    foreground: '#E8F4FF',
    background: '#0D1820',
    outline: '#4A7A9B',
    texture: 'ice',
    material: 'glass'
  });

  dice3d.addColorset({
    name: 'evade',
    description: 'Evade Dice',
    category: 'Defense',
    foreground: '#CCFFEE',
    background: '#061A12',
    outline: '#2EA876',
    texture: 'water',
    material: 'plastic'
  });

  dice3d.addColorset({
    name: 'block',
    description: 'Block Dice',
    category: 'Defense',
    foreground: '#E8E0D0',
    background: '#3A3530',
    outline: '#8C8070',
    texture: 'rock',
    material: 'stone'
  });

  dice3d.addColorset({
    name: 'kinetic',
    description: 'Kinetic Force Damage',
    category: 'Combat',
    foreground: '#E8D0FF',
    background: '#12011F',
    outline: '#8855CC',
    texture: 'stars',
    material: 'glass'
  });

  dice3d.addColorset({
    name: 'poise',
    description: 'Poise',
    category: 'Critical',
    foreground: '#FFFFFF',
    background: '#1C1C22',
    outline: '#9090A8',
    texture: 'chrome',
    material: 'metal'
  });

  dice3d.addColorset({
    name: 'critical',
    description: 'Critical',
    category: 'Critical',
    foreground: '#FFE8D0',
    background: '#200000',
    outline: '#FF3300',
    texture: 'fire',
    material: 'metal'
  });

  dice3d.addColorset({
    name: 'ruin',
    description: 'Ruin',
    category: 'Devastation',
    foreground: '#CCFF44',
    background: '#101808',
    outline: '#5A8020',
    texture: 'poison',
    material: 'plastic'
  });

  dice3d.addColorset({
    name: 'devastation',
    description: 'Devastation',
    category: 'Devastation',
    foreground: '#FF8C00',
    background: '#0A0000',
    outline: '#600000',
    texture: 'lava',
    material: 'metal'
  });

  dice3d.addColorset({
    name: 'fortitude',
    description: 'Fortitude',
    category: 'Stats',
    foreground: '#F5EAD0',
    background: '#2A1A08',
    outline: '#8B5E2A',
    texture: 'marble',
    material: 'stone'
  });

  dice3d.addColorset({
    name: 'prudence',
    description: 'Prudence',
    category: 'Stats',
    foreground: '#D8F0FF',
    background: '#040D18',
    outline: '#2A6090',
    texture: 'glitterFine',
    material: 'glass'
  });

  dice3d.addColorset({
    name: 'justice',
    description: 'Justice',
    category: 'Stats',
    foreground: '#FFF8D0',
    background: '#1A1400',
    outline: '#A08000',
    texture: 'bronze',
    material: 'metal'
  });

  dice3d.addColorset({
    name: 'charm',
    description: 'Charm',
    category: 'Stats',
    foreground: '#FFD6F0',
    background: '#1A0010',
    outline: '#C04080',
    texture: 'candy',
    material: 'plastic'
  });

  dice3d.addColorset({
    name: 'insight',
    description: 'Insight',
    category: 'Stats',
    foreground: '#E8D8FF',
    background: '#0D0818',
    outline: '#6040A0',
    texture: 'glitter',
    material: 'glass'
  });

  dice3d.addColorset({
    name: 'temperance',
    description: 'Temperance',
    category: 'Stats',
    foreground: '#D8FFE8',
    background: '#081410',
    outline: '#305840',
    texture: 'water',
    material: 'stone'
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