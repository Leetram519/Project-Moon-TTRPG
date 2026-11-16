
export const ECONOMY_TYPES = {
  ACTION: "action",
  REACTION: "reaction",
};

/** Anything not in this list gets refused before it spends anything. Content-specific actions use `custom`. */
export const ACTION_KINDS = {
  ATTACK: "attack",
  BLOCK: "block",
  EVADE: "evade",
  COUNTER: "counter",
  RECYCLED_EVADE: "recycledEvade",
  TOOL: "tool",
  DASH: "dash",
  DISENGAGE: "disengage",
  REDUCE_STATUS: "reduceStatus",
  CONVERT_TO_REACTIONS: "convertToReactions",
  CHANGE_WEAPON: "changeWeapon",
  CHANGE_OUTFIT: "changeOutfit",
  MANUAL: "manual",
  ASSIST: "assist",
  DELAY: "delay",
  GRAPPLE: "grapple",
  BREAK_FREE: "breakFree",
  THROW: "throw",
  PROTECT: "protect",
  READY: "ready",
  TAKE_COVER: "takeCover",
  OPPORTUNITY_ATTACK: "opportunityAttack",
  CUSTOM: "custom",
};

/** Kinds that still spend but don't emit [On Action] by default. */
const KINDS_WITHOUT_ACTION_EFFECTS = [
  ACTION_KINDS.CONVERT_TO_REACTIONS,
  ACTION_KINDS.DASH,
  ACTION_KINDS.DISENGAGE,
  ACTION_KINDS.REDUCE_STATUS,
];

export const DECLARATION_FAILURE_REASONS = {
  INVALID_ACTOR: "invalid-actor",
  INVALID_ECONOMY_TYPE: "invalid-economy-type",
  INVALID_COST: "invalid-cost",
  INVALID_KIND: "invalid-kind",
  UNKNOWN_KIND: "unknown-kind",
  AMBIGUOUS_COMBATANT: "ambiguous-combatant",
  COMBATANT_MISMATCH: "combatant-mismatch",
  NOT_ACTIVE_TURN: "not-active-turn",
  PRECHECK_FAILED: "precheck-failed",
  ACT_FROM_TOKEN: "act-from-token",
  INSUFFICIENT_ACTIONS: "insufficient-actions",
  INSUFFICIENT_REACTIONS: "insufficient-reactions",
  REACTION_CREDIT_PERSIST_FAILED: "reaction-credit-persist-failed",
};

export const ACTION_DECLARED_HOOK = "pmttrpg.actionDeclared";

/** When a declaration can be made in a started combat. */
export const ACTION_TIMING = {
  OWN_TURN: "ownTurn",
  /** Normal on your own turn. Off turn an Action costs one Reaction instead. */
  REACTION_OFF_TURN: "reactionOffTurn",
  ANYTIME: "anytime",
};

export function actionEconomyApplies(combat, combatant) {
  return !!combat?.started && !!combatant;
}

const OWN_TURN_ONLY_ACTION_KINDS = [
  ACTION_KINDS.CONVERT_TO_REACTIONS,
  ACTION_KINDS.DASH,
  ACTION_KINDS.DISENGAGE,
];

export function defaultTimingFor(economyType, kind) {
  if (economyType === ECONOMY_TYPES.ACTION) {
    return OWN_TURN_ONLY_ACTION_KINDS.includes(kind) ? ACTION_TIMING.OWN_TURN : ACTION_TIMING.REACTION_OFF_TURN;
  }
  if (kind === ACTION_KINDS.READY) return ACTION_TIMING.OWN_TURN;
  return ACTION_TIMING.ANYTIME;
}

export function kindTriggersActionEffects(kind, explicit) {
  if (explicit === true || explicit === false) return explicit;
  return !KINDS_WITHOUT_ACTION_EFFECTS.includes(kind);
}
