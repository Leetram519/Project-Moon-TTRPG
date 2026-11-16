import { pickRadioRow } from "../apps/dialog-wait.js";
import { isCurrentTurnCombatant } from "./combat-flags.js";

export const ACTING_PURPOSES = {
  ACTION: "action",
  REACTION: "reaction",
  DISPLAY: "display",
};

// an unlinked token's Actor only acts for its own token's Combatant (even though
// it shares actorId with every other token of the same base Actor). The base
// Actor only acts for its linked tokens.
export function combatantActsFor(combatant, actor) {
  if (!combatant || !actor) return false;
  const actorTokenId = actor.token?.id ?? null;
  if (actorTokenId) return combatant.tokenId === actorTokenId;
  const own = combatant.actor ?? null;
  if (own) {
    if (own === actor) return true;
    const ownIsToken = own.isToken === true || !!own.token;
    return !ownIsToken && own.id != null && own.id === actor.id;
  }
  return combatant.actorId != null && actor.id != null && combatant.actorId === actor.id;
}

export function combatantsActingFor(actor, combat) {
  return combat?.combatants.filter((entry) => combatantActsFor(entry, actor)) ?? [];
}

export function isUnlinkedTokenCombatantOf(combatant, actor) {
  if (!actor || !combatant || actor.token) return false;
  return !combatantActsFor(combatant, actor)
    && combatant.actorId != null
    && combatant.actorId === actor.id;
}

export function unlinkedTokenCombatants(actor, combat) {
  return combat?.combatants.filter((entry) => isUnlinkedTokenCombatantOf(entry, actor)) ?? [];
}

function contextFor(combatant, fallbackActor) {
  return {
    actor: combatant.actor ?? fallbackActor,
    token: combatant.token ?? null,
    tokenId: combatant.tokenId ?? null,
    combatant,
  };
}

function bareContext(actor) {
  return { actor, token: null, tokenId: null, combatant: null };
}

function controlledAmong(candidates) {
  const controlled = canvas.tokens?.controlled ?? [];
  const ids = new Set(controlled.map((token) => token.document.id));
  const matches = candidates.filter((entry) => ids.has(entry.tokenId));
  return matches.length === 1 ? matches[0] : null;
}

function actingTokenRows(candidates) {
  const nameOf = (entry) => entry.name;
  const counts = new Map();
  for (const entry of candidates) counts.set(nameOf(entry), (counts.get(nameOf(entry)) ?? 0) + 1);
  return candidates.map((entry) => {
    const name = nameOf(entry);
    const speed = entry.initiative == null || entry.initiative === "" ? null : Number(entry.initiative);
    return {
      id: String(entry.id),
      name,
      img: entry.img || entry.actor?.img || "",
      speedLabel: (counts.get(name) ?? 0) > 1 && Number.isFinite(speed)
        ? game.i18n.format("PMTTRPG.Delay.SpeedValue", { speed })
        : "",
    };
  });
}

async function pickActingCombatant(candidates, { actor } = {}) {
  const id = await pickRadioRow({
    title: game.i18n.localize("PMTTRPG.ActingToken.Title"),
    hint: game.i18n.format("PMTTRPG.ActingToken.Hint", { name: actor?.name ?? "" }),
    inputName: "combatantId",
    rows: actingTokenRows(candidates).map((row, index) => ({ ...row, tag: row.speedLabel, checked: index === 0 })),
  });
  return candidates.find((entry) => entry.id === id) ?? null;
}

export async function resolveActingContext(actor, {
  sheetToken = null,
  combat = game.combat,
  purpose = ACTING_PURPOSES.ACTION,
} = {}) {
  if (!actor) return null;
  const token = sheetToken?.document ?? sheetToken ?? actor.token ?? null;
  if (token) {
    const combatant = combat?.combatants.find((entry) => entry.tokenId === token.id) ?? null;
    return { actor: token.actor ?? actor, token, tokenId: token.id ?? null, combatant };
  }

  const own = combatantsActingFor(actor, combat);
  if (own.length === 1) return contextFor(own[0], actor);
  if (own.length > 1) {
    if (purpose === ACTING_PURPOSES.ACTION) {
      const current = own.find((entry) => isCurrentTurnCombatant(combat, entry));
      if (current) return contextFor(current, actor);
    }
    const controlled = controlledAmong(own);
    if (controlled) return contextFor(controlled, actor);
    if (purpose === ACTING_PURPOSES.DISPLAY) return bareContext(actor);
    const chosen = await pickActingCombatant(own, { actor });
    return chosen ? contextFor(chosen, actor) : null;
  }

  const tokens = unlinkedTokenCombatants(actor, combat);
  if (tokens.length) {
    if (purpose === ACTING_PURPOSES.DISPLAY) return bareContext(actor);
    const chosen = await pickActingCombatant(tokens, { actor });
    return chosen ? contextFor(chosen, actor) : null;
  }
  return bareContext(actor);
}
