const TIEBREAK_PATH = "flags.projectmoonttrpg.turnTiebreak";

export function isRolledCombatant(combatant) {
  const value = combatant?.initiative;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string" && value.trim()) return Number.isFinite(Number(value));
  return false;
}

export function readTiebreak(combatant) {
  const raw = Number(combatant?.flags?.projectmoonttrpg?.turnTiebreak ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

export function canControlCombatantOrder(combatant) {
  return Boolean(combatant && (game.user.isGM || combatant.isOwner));
}

function playerCharacterRank(combatant) {
  return combatant?.actor?.type === "character" ? 1 : 0;
}

export function compareCombatants(a, b) {
  const aRolled = isRolledCombatant(a);
  const bRolled = isRolledCombatant(b);
  if (aRolled !== bRolled) return aRolled ? -1 : 1;

  if (aRolled) {
    const initDiff = Number(b.initiative) - Number(a.initiative);
    if (initDiff) return initDiff;
    const tieDiff = readTiebreak(b) - readTiebreak(a);
    if (tieDiff) return tieDiff;
    // New rolls leave turnTiebreak at 0. Characters sort before npcs.
    // Drag writes turnTiebreak. That field is compared before actor type.
    const sideDiff = playerCharacterRank(b) - playerCharacterRank(a);
    if (sideDiff) return sideDiff;
  }

  const idA = String(a?.id ?? a?._id ?? "");
  const idB = String(b?.id ?? b?._id ?? "");
  return idA > idB ? 1 : idA < idB ? -1 : 0;
}

function joinInitiativeGroup(initiative, { above, below }) {
  const aboveSame = above && Number(above.initiative) === initiative;
  const belowSame = below && Number(below.initiative) === initiative;
  const aboveTb = aboveSame ? readTiebreak(above) : Number.POSITIVE_INFINITY;
  const belowTb = belowSame ? readTiebreak(below) : Number.NEGATIVE_INFINITY;

  if (aboveSame && belowSame && aboveTb > belowTb) {
    const mid = (aboveTb + belowTb) / 2;
    if (mid !== aboveTb && mid !== belowTb) {
      return { initiative, turnTiebreak: mid };
    }
  }
  if (aboveSame && !belowSame) {
    return { initiative, turnTiebreak: readTiebreak(above) - 1 };
  }
  if (belowSame && !aboveSame) {
    return { initiative, turnTiebreak: readTiebreak(below) + 1 };
  }
  return { initiative, turnTiebreak: aboveSame ? readTiebreak(above) - 1 : 0, needsGroupResequence: true };
}

/**
 * If the neighbors differ by 2 or more, return an integer between them.
 * If they match or differ by 1, keep an integer Speed and set turnTiebreak.
 */
export function placementForSlot({ above = null, below = null, dropped = null } = {}) {
  const droppedRolled = isRolledCombatant(dropped);
  const droppedInit = droppedRolled ? Number(dropped.initiative) : NaN;

  if (!above && !below) {
    return { initiative: droppedRolled ? droppedInit : 0, turnTiebreak: 0 };
  }

  if (!above && below) {
    if (!isRolledCombatant(below)) {
      return { initiative: droppedRolled ? droppedInit : 0, turnTiebreak: 0 };
    }
    const lo = Number(below.initiative);
    if (droppedRolled && droppedInit === lo) return joinInitiativeGroup(lo, { above, below });
    return { initiative: lo + 1, turnTiebreak: 0 };
  }

  if (above && !below) {
    if (!isRolledCombatant(above)) {
      return { initiative: droppedRolled ? droppedInit : 0, turnTiebreak: 0 };
    }
    const hi = Number(above.initiative);
    if (droppedRolled && droppedInit === hi) return joinInitiativeGroup(hi, { above, below });
    return { initiative: hi - 1, turnTiebreak: 0 };
  }

  const hi = Number(above.initiative);
  const lo = Number(below.initiative);
  const aboveRolled = Number.isFinite(hi);
  const belowRolled = Number.isFinite(lo);

  if (!aboveRolled && !belowRolled) {
    return { initiative: droppedRolled ? droppedInit : 0, turnTiebreak: 0 };
  }
  if (!aboveRolled) {
    if (droppedRolled && droppedInit === lo) return joinInitiativeGroup(lo, { above, below });
    return { initiative: lo + 1, turnTiebreak: 0 };
  }
  if (!belowRolled) {
    if (droppedRolled && droppedInit === hi) return joinInitiativeGroup(hi, { above, below });
    return { initiative: hi - 1, turnTiebreak: 0 };
  }

  if (droppedRolled && (droppedInit === lo || droppedInit === hi)) {
    return joinInitiativeGroup(droppedInit, { above, below });
  }

  if (hi - lo >= 2) {
    return { initiative: Math.floor((hi + lo) / 2), turnTiebreak: 0 };
  }

  return joinInitiativeGroup(hi, { above, below });
}

export function neighborsFromDrop(combat, dropped, target, placeBefore) {
  const turns = Array.from(combat?.turns ?? []);
  if (!dropped || !turns.length) return null;
  if (target?.id && target.id === dropped.id) return null;

  const withoutDropped = turns.filter((entry) => entry.id !== dropped.id);
  let targetEntry = target && withoutDropped.find((entry) => entry.id === target.id);
  let before = placeBefore;

  if (isRolledCombatant(dropped) && target && !isRolledCombatant(target)) {
    const firstUnrolled = withoutDropped.find((entry) => !isRolledCombatant(entry));
    if (!firstUnrolled) {
      return { above: withoutDropped.at(-1) ?? null, below: null };
    }
    targetEntry = firstUnrolled;
    before = true;
  }

  if (!targetEntry) return null;

  const targetIndex = withoutDropped.indexOf(targetEntry);
  const insertIndex = before ? targetIndex : targetIndex + 1;
  let above = insertIndex > 0 ? withoutDropped[insertIndex - 1] : null;
  let below = insertIndex < withoutDropped.length ? withoutDropped[insertIndex] : null;

  if (isRolledCombatant(dropped) && below && !isRolledCombatant(below)) {
    below = null;
  }

  return { above, below };
}

function sameNeighbor(left, right) {
  return (left?.id ?? null) === (right?.id ?? null);
}

function isAlreadyInSlot(combat, combatant, above, below) {
  const turns = Array.from(combat?.turns ?? []);
  const index = turns.findIndex((entry) => entry.id === combatant.id);
  if (index < 0) return false;
  const currentAbove = index > 0 ? turns[index - 1] : null;
  const currentBelow = index < turns.length - 1 ? turns[index + 1] : null;
  return sameNeighbor(currentAbove, above) && sameNeighbor(currentBelow, below);
}

function resequenceGroupUpdates(combat, dropped, initiative, above) {
  const order = [];
  for (const entry of combat.turns ?? []) {
    if (entry.id === dropped.id) continue;
    if (Number(entry.initiative) === initiative) order.push(entry);
  }

  let insertAt = 0;
  if (above && Number(above.initiative) === initiative) {
    const after = order.findIndex((entry) => entry.id === above.id);
    insertAt = after < 0 ? 0 : after + 1;
  }
  order.splice(insertAt, 0, dropped);

  const last = order.length - 1;
  return order.map((entry, index) => ({
    _id: entry.id,
    initiative,
    [TIEBREAK_PATH]: last - index,
  }));
}

export async function applyCombatantPlacement(combat, combatant, placement, operation = {}) {
  if (!combat || !combatant || !placement) return null;
  const updates = placement.updates ?? [{
    _id: combatant.id,
    initiative: placement.initiative,
    [TIEBREAK_PATH]: placement.turnTiebreak,
  }];
  return combat.updateEmbeddedDocuments("Combatant", updates, operation);
}

export function planCombatantPlacement(combat, combatant, { above = null, below = null } = {}) {
  if (!combat || !combatant) return null;
  if (isAlreadyInSlot(combat, combatant, above, below)) return null;
  const placement = placementForSlot({ above, below, dropped: combatant });
  if (placement.needsGroupResequence) {
    return resequenceGroupUpdates(combat, combatant, placement.initiative, above);
  }
  return [{
    _id: combatant.id,
    initiative: placement.initiative,
    [TIEBREAK_PATH]: placement.turnTiebreak,
  }];
}

export async function placeCombatantInOrder(combat, combatant, { above = null, below = null } = {}, operation = {}) {
  if (!combat || !combatant || !canControlCombatantOrder(combatant)) return null;
  const updates = planCombatantPlacement(combat, combatant, { above, below });
  if (!updates) return combatant;
  return applyCombatantPlacement(combat, combatant, { updates }, operation);
}

export async function applyManualInitiative(combat, combatant, value) {
  if (!combat || !combatant || !canControlCombatantOrder(combatant)) return null;

  const raw = String(value ?? "").trim();
  const initiative = Number(raw);
  if (!raw || !Number.isFinite(initiative)) return false;

  const current = Number(combatant.initiative);
  const currentTb = readTiebreak(combatant);
  if (current === initiative && currentTb === 0) return combatant;

  if (currentTb === 0) return combat.setInitiative(combatant.id, initiative);
  return applyCombatantPlacement(combat, combatant, { initiative, turnTiebreak: 0 });
}
