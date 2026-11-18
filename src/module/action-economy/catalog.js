import { ACTION_KINDS, ECONOMY_TYPES } from "./kinds.js";

export const ACTION_GROUPS = [
  { id: "attack", labelKey: "PMTTRPG.ActionMenu.Group.Attack", order: 10 },
  { id: "combat", labelKey: "PMTTRPG.ActionMenu.Group.Combat", order: 20 },
  { id: "movement", labelKey: "PMTTRPG.ActionMenu.Group.Movement", order: 30 },
  { id: "equipment", labelKey: "PMTTRPG.ActionMenu.Group.Equipment", order: 40 },
  { id: "utility", labelKey: "PMTTRPG.ActionMenu.Group.Utility", order: 50 },
];

/**
 * Rows of the Combat tab's Action Menu. `costKey` and `offTurnCostKey` are just hints
 * since Consume cost can waive the cost. `checkCostFirst` rows refuse a cost the actor
 * can't pay before the workflow's dialogs open.
 */
export const ACTION_DEFINITIONS = [
  {
    id: "meleeAttack",
    group: "attack",
    kind: ACTION_KINDS.ATTACK,
    order: 10,
    labelKey: "PMTTRPG.ActionMenu.MeleeAttack",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.Reaction",
    workflow: "meleeAttack",
  },
  {
    id: "rangedAttack",
    group: "attack",
    kind: ACTION_KINDS.ATTACK,
    order: 20,
    labelKey: "PMTTRPG.ActionMenu.RangedAttack",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.Reaction",
    workflow: "rangedAttack",
  },
  {
    id: "assist",
    group: "combat",
    kind: ACTION_KINDS.ASSIST,
    order: 10,
    labelKey: "PMTTRPG.ActionMenu.Assist",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.ActionLight",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.ReactionLight",
    checkCostFirst: true,
    workflow: "assist",
  },
  {
    id: "grapple",
    group: "combat",
    kind: ACTION_KINDS.GRAPPLE,
    order: 20,
    labelKey: "PMTTRPG.ActionMenu.Grapple",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.Reaction",
    checkCostFirst: true,
    workflow: "grapple",
  },
  {
    id: "breakFree",
    group: "combat",
    kind: ACTION_KINDS.BREAK_FREE,
    order: 22,
    labelKey: "PMTTRPG.ActionMenu.BreakFree",
    implemented: true,
    // only shows up when the Grapple state makes it usable
    contextual: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.Reaction",
    checkCostFirst: true,
    workflow: "breakFree",
  },
  {
    id: "throw",
    group: "combat",
    kind: ACTION_KINDS.THROW,
    order: 24,
    labelKey: "PMTTRPG.ActionMenu.Throw",
    implemented: true,
    contextual: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.Reaction",
    workflow: "throw",
  },
  {
    id: "grappleReduceReactions",
    group: "combat",
    kind: ACTION_KINDS.GRAPPLE,
    order: 26,
    labelKey: "PMTTRPG.ActionMenu.GrappleReduceReactions",
    implemented: true,
    contextual: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.Reaction",
    checkCostFirst: true,
    workflow: "grappleReduceReactions",
  },
  {
    id: "protect",
    group: "combat",
    kind: ACTION_KINDS.PROTECT,
    order: 30,
    labelKey: "PMTTRPG.ActionMenu.Protect",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.Reaction",
    workflow: "protect",
  },
  {
    id: "ready",
    group: "combat",
    kind: ACTION_KINDS.READY,
    order: 40,
    labelKey: "PMTTRPG.ActionMenu.Ready",
    implemented: true,
    economyType: ECONOMY_TYPES.REACTION,
    costKey: "PMTTRPG.ActionMenu.Cost.Reaction",
    checkCostFirst: true,
    workflow: "ready",
  },
  {
    id: "takeCover",
    group: "combat",
    kind: ACTION_KINDS.TAKE_COVER,
    order: 50,
    labelKey: "PMTTRPG.ActionMenu.TakeCover",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.Reaction",
    // you can Leave Cover at any time
    endableOffTurn: true,
    workflow: "takeCover",
  },
  {
    id: "dash",
    group: "movement",
    kind: ACTION_KINDS.DASH,
    order: 10,
    labelKey: "PMTTRPG.ActionMenu.Dash",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    workflow: "dash",
  },
  {
    id: "disengage",
    group: "movement",
    kind: ACTION_KINDS.DISENGAGE,
    order: 20,
    labelKey: "PMTTRPG.ActionMenu.Disengage",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    workflow: "disengage",
  },
  {
    id: "changeWeapons",
    group: "equipment",
    kind: ACTION_KINDS.CHANGE_WEAPON,
    order: 10,
    labelKey: "PMTTRPG.ActionMenu.ChangeWeapons",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.FreeOrAction",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.FreeOrReaction",
    workflow: "changeWeapons",
  },
  {
    id: "changeOutfit",
    group: "equipment",
    kind: ACTION_KINDS.CHANGE_OUTFIT,
    order: 20,
    labelKey: "PMTTRPG.ActionMenu.ChangeOutfit",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.Reaction",
    checkCostFirst: true,
    workflow: "changeOutfit",
  },
  {
    id: "useTool",
    group: "equipment",
    kind: ACTION_KINDS.TOOL,
    order: 30,
    labelKey: "PMTTRPG.ActionMenu.UseTool",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.Reaction",
    workflow: "useTool",
  },
  {
    id: "convertToReactions",
    group: "utility",
    kind: ACTION_KINDS.CONVERT_TO_REACTIONS,
    order: 10,
    labelKey: "PMTTRPG.ActionMenu.ConvertToReactions",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Actions",
    workflow: "convertToReactions",
  },
  {
    id: "delay",
    group: "utility",
    kind: ACTION_KINDS.DELAY,
    order: 20,
    labelKey: "PMTTRPG.ActionMenu.Delay",
    implemented: true,
    // picked from the incoming-turn offer, before the turn starts
    showInActionMenu: false,
    workflow: null,
  },
  {
    id: "reduceStatus",
    group: "utility",
    kind: ACTION_KINDS.REDUCE_STATUS,
    order: 30,
    labelKey: "PMTTRPG.ActionMenu.ReduceStatus",
    implemented: true,
    costKey: "PMTTRPG.ActionMenu.Cost.Action",
    offTurnCostKey: "PMTTRPG.ActionMenu.Cost.Reaction",
    checkCostFirst: true,
    workflow: "reduceStatus",
  },
];

export function getActionDefinition(id) {
  return ACTION_DEFINITIONS.find((entry) => entry.id === id) ?? null;
}

function actionDefinitionsForMenu() {
  return ACTION_DEFINITIONS.filter((entry) => entry.implemented && entry.showInActionMenu !== false)
    .sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
}

export function groupedActionDefinitions(definitions = actionDefinitionsForMenu()) {
  const byGroup = new Map();
  for (const def of definitions) {
    const list = byGroup.get(def.group) ?? [];
    list.push(def);
    byGroup.set(def.group, list);
  }
  return ACTION_GROUPS
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      ...group,
      actions: (byGroup.get(group.id) ?? []).sort((a, b) => a.order - b.order),
    }))
    .filter((group) => group.actions.length);
}
