import type { ActorPMTTRPG } from "../module/actor/actor.js";
import type { ItemPMTTRPG } from "../module/item/item.js";
import type { TokenPMTTRPG } from "../module/canvas/token.js";
import type { applyAlwaysActiveModifiers } from "../module/easy-effects/registry.js";

// These follow src/yaml/template.yml and what ActorPMTTRPG.prepareData adds. Change them together.

export interface Resource {
  value: number;
  min: number;
  maxBase: number;
  maxMisc: number;
  max: number;
}

export interface PoolResource extends Resource {
  temp: number;
}

export interface InventorySlots {
  value: number;
  used: number;
  over: boolean;
  min: number;
}

export interface Modifier {
  value: number;
  min: number;
}

export interface Ability {
  value: number;
  min: number;
  mod: number;
  debility: boolean;
}

export type AbilityKey = "for" | "pru" | "jus" | "cha" | "ins" | "tem";

export interface Homebrew {
  author: string;
  source: string;
}

export interface ActorAttributes {
  hp: PoolResource;
  st: PoolResource;
  sp: PoolResource;
  level: { value: number; min: number; max: number };
  xp: { value: number; min: number; max: number };
  toolSlots: InventorySlots;
  narrativeSlots: InventorySlots;
  stockSlots: InventorySlots;
  light: Resource;
  actions: Resource;
  reactions: Resource;
  movement: Resource;
  squares: Resource;
  dash: { misc: number };
  reduceStatus: { misc: number };
  attackModifier: Modifier;
  evadeModifier: Modifier;
  blockModifier: Modifier;
  speed: { dice: string; bonus: number };
}

export interface ActorDetails {
  badge: string;
  color: string;
  biography: {
    occupation: string;
    age: string;
    height: string;
    birthplace: string;
    residence: string;
    description: string;
    background: string;
    personality: string;
    ahn: number;
    relationships: string;
    notes: string;
    notableHistory: string;
  };
}

export interface GmBrief {
  complexityGm: number;
  complexityPlayers: number;
  strength: string;
  designIntention: string;
  recommendedBehavior: string;
  lore: string;
  notes: string;
}

interface ActorSystemSource {
  easyEffects: string;
  easyEffectsWorldSync: boolean;
  homebrewDependencies: unknown[];
  abilities: Record<AbilityKey, Ability>;
  attributes: ActorAttributes;
  details: ActorDetails;
  homebrew: Homebrew;
}

export interface CharacterSystemSource extends ActorSystemSource {
  attributes: ActorAttributes & {
    ep: Resource;
    equipmentRankLimit: Modifier;
  };
}

export interface NpcSystemSource extends ActorSystemSource {
  details: ActorDetails & { gmBrief: GmBrief };
}

// the Easy Effects ones are missing if the Always Active pass throws
interface EeMaxOverride {
  eeMaxOverridden?: boolean;
  eeMaxOverrideBy?: string;
}

interface PreparedActorSystem {
  abilities: Record<AbilityKey, Ability & { label: string }>;
  attributes: {
    rank: { value: number };
    hp: EeMaxOverride;
    st: EeMaxOverride;
    sp: EeMaxOverride;
    light: EeMaxOverride;
    squares: { used: number; exhausted: boolean; remaining: number };
    equipmentRankLimit: Modifier;
    easyEffectsMods?: ReturnType<typeof applyAlwaysActiveModifiers>;
  };
  details: { gmBrief: GmBrief };
}

export type CharacterSystem = CharacterSystemSource & PreparedActorSystem;
export type NpcSystem = NpcSystemSource & PreparedActorSystem;

// one entry in a weapon's, outfit's, tool's... Effects list (built by the item sheet)
export interface ItemEffectEntry {
  effectUuid: string;
  easyEffectsTemplate: string;
  name: string;
  cost: number;
  stack: number;
  count: number;
  mode: "positive" | "negative";
  appliesTo: string;
  canPositive: boolean;
  canNegative: boolean;
  allowModeToggle: boolean;
  procOn: string;
  procResult: string;
  procResultLocked: boolean;
  procChoice: string;
  procChoiceLocked: boolean;
  procStat: string;
  procDice: string;
  procAction: string;
  procCondition: string;
  stackMax: number;
  positive: string;
  negative: string;
  macro: { uuid: string };
}

interface ItemSystemBase {
  name: string;
  description: string;
  slug: string;
  homebrewDependencies: unknown[];
  subtype: string;
  subsubtype: string;
  homebrew: Homebrew;
  easyEffects: string;
}

export type DamageResistances = Record<"slash" | "pierce" | "blunt", string>;

export interface WeaponSystem extends ItemSystemBase {
  weaponType: string;
  damageType: string;
  damageTypeFixed: boolean;
  formProperty: string;
  handProperty: string;
  offensiveDice: string;
  rank: number;
  bonusEP: number;
  effects: ItemEffectEntry[];
  equipped: boolean;
  customNotes: string;
  range: number;
}

export interface OutfitSystem extends ItemSystemBase {
  outfitProperty: string;
  rank: number;
  blockDice: string;
  evadeDice: string;
  blockDiceComputed: string;
  evadeDiceComputed: string;
  blockDicePower: number;
  evadeDicePower: number;
  bonusLight: number;
  bonusEP: number;
  effects: ItemEffectEntry[];
  resistances: { hp: DamageResistances; st: DamageResistances };
  equipped: boolean;
  customNotes: string;
}

export interface AmmunitionSystem extends ItemSystemBase {
  ammoType: string;
  damageType: string;
  quantity: number;
  inventoryPool: string;
  price: number;
  effects: ItemEffectEntry[];
}

export interface ToolSystem extends ItemSystemBase {
  rank: number;
  form: string;
  handProperty: string;
  toolKind: string;
  applyTo: string;
  challengeStat: string;
  quantity: number;
  usesMax: number;
  usesRemaining: number;
  allowUse: boolean;
  inventoryTag: string;
  slotCost: number;
  stackPerSlot: number;
  unique: boolean;
  compact: boolean;
  equipped: boolean;
  packing: { accepts: string; capacity: number; used: number; free: number };
  damageType: string;
  customNotes: string;
  effects: ItemEffectEntry[];
}

export interface SkillSystem extends ItemSystemBase {
  skillType: string;
  rank: number;
  lightCost: number;
  innate: boolean;
  stat: string;
  effects: ItemEffectEntry[];
  customNotes: string;
}

export interface AugmentSystem extends ItemSystemBase {
  rank: number;
  effects: ItemEffectEntry[];
  customNotes: string;
  active: boolean;
}

export interface EffectSystem extends ItemSystemBase {
  cost: number;
  stackMax: number;
  appliesTo: string;
  subtypeWhitelist: string[];
  subsubtypeWhitelist: string[];
  tags: string[];
  canPositive: boolean;
  canNegative: boolean;
  procOn: string;
  procResult: string;
  procResultLocked: boolean;
  procChoice: string;
  procChoiceLocked: boolean;
  procStat: string;
  procDice: string;
  procAction: string;
  procCondition: string;
  positive: string;
  negative: string;
  macro: { uuid: string };
  customNotes: string;
}

export interface StatusSystem extends ItemSystemBase {
  stacks: number;
  stackMax: number;
  priority: number;
  pending: boolean;
  arrival: string;
  shelved: boolean;
  origin: string;
  showHoverDetails: boolean;
  proc: {
    turnStart: boolean;
    startOfRound: boolean;
    endOfRound: boolean;
    actionOrReaction: boolean;
    attackerBurst: boolean;
    onHitWhenActorHas: boolean;
    onHitWhenTargetHas: boolean;
    alwaysActive: boolean;
    skillEffect: boolean;
  };
  reduceStatus: { type: string; blocks: string[] };
  customNotes: string;
}

interface ActorSystemSources {
  character: CharacterSystemSource;
  npc: NpcSystemSource;
}

interface ActorSystems {
  character: CharacterSystem;
  npc: NpcSystem;
}

interface ItemSystems {
  weapon: WeaponSystem;
  outfit: OutfitSystem;
  ammunition: AmmunitionSystem;
  tool: ToolSystem;
  skill: SkillSystem;
  augment: AugmentSystem;
  effect: EffectSystem;
  status: StatusSystem;
}

declare module "fvtt-types/configuration" {
  interface DocumentClassConfig {
    Actor: typeof ActorPMTTRPG;
    Item: typeof ItemPMTTRPG;
  }

  // `actor.type` won't narrow `actor.system` by itself (the JS classes aren't generic).
  // Check the type and then cast (`actor as Actor.OfType<"character">`) to read one subtype's fields.
  interface ConfiguredActor<SubType extends Actor.SubType> {
    document: ActorPMTTRPG & Actor<SubType>;
  }

  interface ConfiguredItem<SubType extends Item.SubType> {
    document: ItemPMTTRPG & Item<SubType>;
  }

  interface PlaceableObjectClassConfig {
    Token: typeof TokenPMTTRPG;
  }

  // only this system's subtypes
  interface SystemConfig {
    Actor: { base: "ignore"; moduleSubtype: "ignore" };
    Item: { base: "ignore"; moduleSubtype: "ignore" };
  }

  interface SourceConfig {
    Actor: ActorSystemSources;
    Item: ItemSystems;
  }

  interface DataConfig {
    Actor: ActorSystems;
    Item: ItemSystems;
  }
}
