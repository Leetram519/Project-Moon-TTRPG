import {
  normalizeToken,
  resolveOriginatingToken,
  tokenDistanceSquares,
  tokenIdOf,
} from "../canvas/spatial.js";
import { declareActorAction } from "./declare.js";
import { ACTION_KINDS, ECONOMY_TYPES, actionEconomyApplies } from "./kinds.js";
import { checkWorkflowTiming, warnNotYourTurn } from "./timing.js";
import {
  canReduceActor,
  describeReduceStatusOptions,
  resolveReduceStatusPlan,
} from "./reduce-status-data.js";
import { promptReduceStatusAllocation } from "./reduce-status-dialog.js";
import { cancelButton, confirmButton, waitForWindowChoice } from "../apps/dialog-wait.js";
import { runAsOwnerOrGM } from "../easy-effects/gm-route.js";

const { renderTemplate } = foundry.applications.handlebars;

const TEMPLATE_TARGET = "systems/projectmoonttrpg/templates/dialog/action-reduce-status-target.hbs";

function sceneToken(token, tokenId) {
  const id = tokenId || tokenIdOf(token);
  if (!id) return null;
  return canvas.tokens?.get(id) ?? null;
}

function isSameActingActor(actingActor, otherActor) {
  if (!actingActor || !otherActor) return false;
  if (actingActor === otherActor) return true;
  if (actingActor.isToken || otherActor.isToken) return false;
  return Boolean(actingActor.id && actingActor.id === otherActor.id);
}

function selfChoice(actingActor, sourceToken) {
  return {
    actor: actingActor,
    token: sourceToken ?? null,
    tokenId: tokenIdOf(sourceToken),
    isSelf: true,
  };
}

function adjacentChoice(token) {
  const placed = normalizeToken(token);
  return {
    actor: placed?.actor ?? token?.actor ?? null,
    token: placed,
    tokenId: tokenIdOf(placed ?? token),
    isSelf: false,
  };
}

function isAdjacent(a, b) {
  const gap = tokenDistanceSquares(a, b);
  return Number.isFinite(gap) && gap <= 1;
}

function listAdjacentTargetTokens(sourceToken, actingActor) {
  const source = normalizeToken(sourceToken);
  if (!source) return [];
  const sourceId = tokenIdOf(source);
  const out = [];
  for (const token of canvas.tokens?.placeables ?? []) {
    if (!token?.actor) continue;
    if (tokenIdOf(token) === sourceId) continue;
    if (isSameActingActor(actingActor, token.actor)) continue;
    if (!isAdjacent(source, token)) continue;
    if (!canReduceActor(token.actor)) continue;
    out.push(token);
  }
  out.sort((a, b) => String(a.name ?? a.actor?.name ?? "").localeCompare(String(b.name ?? b.actor?.name ?? "")));
  return out;
}

function tokenImage(token) {
  return token?.document?.texture?.src
    ?? token?.texture?.src
    ?? token?.actor?.img
    ?? null;
}

async function promptReduceStatusTarget(actingActor, tokens) {
  const html = await renderTemplate(TEMPLATE_TARGET, {
    selfImg: actingActor.img,
    selfChecked: true,
    targets: tokens.map((token) => ({
      tokenId: tokenIdOf(token),
      name: token.name ?? token.actor?.name ?? "",
      img: tokenImage(token),
    })),
    i18n: {
      hint: game.i18n.localize("PMTTRPG.ActionMenu.ReduceStatusTargetHint"),
      self: game.i18n.localize("PMTTRPG.ActionMenu.ReduceStatusSelf"),
    },
  });

  return waitForWindowChoice({
    window: { title: game.i18n.localize("PMTTRPG.ActionMenu.ReduceStatusChooseTarget") },
    content: html,
    buttons: [
      cancelButton(),
      confirmButton((_event, _button, dialog) => {
        const form = dialog.element.querySelector("form");
        return form?.querySelector("[name='targetId']:checked")?.value?.trim() || null;
      }),
    ],
    rejectClose: false,
  });
}

function warnNotAdjacent() {
  ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.ReduceStatusNotAdjacent"));
}

function warnTargetGone() {
  ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.ReduceStatusTargetGone"));
}

function choiceFromRequestedTarget(actingActor, sourceToken, requested) {
  if (requested == null) return null;
  if (requested === "self" || requested === actingActor) {
    return selfChoice(actingActor, sourceToken);
  }

  const asToken = normalizeToken(requested);
  if (asToken?.actor) {
    if (isSameActingActor(actingActor, asToken.actor) || asToken.actor === actingActor) {
      return selfChoice(actingActor, sourceToken);
    }
    if (!sourceToken) {
      warnNotAdjacent();
      return null;
    }
    if (!isAdjacent(sourceToken, asToken)) {
      warnNotAdjacent();
      return null;
    }
    const choice = adjacentChoice(asToken);
    if (!choice.actor) {
      warnTargetGone();
      return null;
    }
    return choice;
  }

  if (requested?.documentName === "Actor") {
    if (isSameActingActor(actingActor, requested)) return selfChoice(actingActor, sourceToken);
    warnNotAdjacent();
    return null;
  }

  return null;
}

async function resolveReduceStatusChoice(actingActor, sourceToken, requested) {
  if (requested != null) {
    return choiceFromRequestedTarget(actingActor, sourceToken, requested);
  }

  const tokens = listAdjacentTargetTokens(sourceToken, actingActor);
  if (!tokens.length) return selfChoice(actingActor, sourceToken);

  const pickedId = await promptReduceStatusTarget(actingActor, tokens);
  if (pickedId == null) return null;
  if (pickedId === "self") return selfChoice(actingActor, sourceToken);

  const token = tokens.find((entry) => tokenIdOf(entry) === pickedId) ?? canvas.tokens.get(pickedId);
  if (!token?.actor) {
    warnTargetGone();
    return null;
  }
  if (!isAdjacent(sourceToken, token)) {
    warnNotAdjacent();
    return null;
  }
  return adjacentChoice(token);
}

function isAdjacentChoiceStillValid(sourceToken, choice) {
  if (!choice || choice.isSelf) return true;
  const source = sceneToken(sourceToken);
  const target = sceneToken(choice.token, choice.tokenId);
  if (!source || !target) return false;
  if (!target.actor) return false;
  if (choice.actor.isToken) {
    if (target.actor !== choice.actor) return false;
  } else if (target.actor?.id !== choice.actor.id) {
    return false;
  }
  return isAdjacent(source, target);
}

async function applyReduceStatusPlan(actor, plan) {
  for (const row of plan.reductions) {
    const planned = Math.max(0, Math.trunc(Number(row.amount) || 0));
    if (planned <= 0) continue;
    const current = actor.getStatusStacks(row.statusName);
    const amount = Math.min(planned, current);
    if (amount <= 0) {
      console.warn(`[PMTTRPG] Reduce Status skipped ${row.statusName} because it has no stacks left`);
      continue;
    }
    if (amount < planned) {
      console.warn(`[PMTTRPG] Reduce Status on ${row.statusName} planned ${planned} but applies ${amount}`);
    }
    try {
      await runAsOwnerOrGM(actor, "removeStatusStacks", { statusName: row.statusName, amount });
    } catch (error) {
      console.error("[PMTTRPG] Reduce Status update failed after declaration", error);
      ui.notifications.error(game.i18n.localize("PMTTRPG.ActionMenu.ReduceStatusFailed"));
      return;
    }
  }
}

export async function startReduceStatus(actor, options = {}) {
  if (!actor) return;

  const timing = checkWorkflowTiming(actor, options, { economyType: ECONOMY_TYPES.ACTION, kind: ACTION_KINDS.REDUCE_STATUS });
  if (!timing.ok) {
    warnNotYourTurn(options);
    return { ok: false, reason: timing.reason };
  }

  const sourceToken = resolveOriginatingToken(actor, options.token);
  const choice = await resolveReduceStatusChoice(actor, sourceToken, options.target);
  if (!choice) return;

  const targetActor = choice.actor;
  const describeOpts = { budgetActor: actor };
  const allocation = describeReduceStatusOptions(targetActor, describeOpts);
  if (!allocation.canReduce) {
    ui.notifications.warn(game.i18n.format("PMTTRPG.ActionMenu.ReduceStatusNoEligible", {
      name: targetActor.name,
    }));
    return;
  }

  const title = choice.isSelf
    ? game.i18n.localize("PMTTRPG.ActionMenu.ReduceStatus")
    : game.i18n.format("PMTTRPG.ActionMenu.ReduceStatusOn", { name: targetActor.name });
  const submission = await promptReduceStatusAllocation(targetActor, {
    budgetActor: actor,
    consume: options.consume !== false && actionEconomyApplies(timing.combat, timing.combatant),
    asReaction: timing.asReaction === true,
    title,
  });
  if (submission == null) return;

  const sourceNow = resolveOriginatingToken(actor, options.token);
  if (!isAdjacentChoiceStillValid(sourceNow, choice)) {
    if (choice.isSelf) return;
    if (!sceneToken(sourceNow) || !sceneToken(choice.token, choice.tokenId)?.actor) {
      warnTargetGone();
    } else {
      warnNotAdjacent();
    }
    return;
  }

  const plan = resolveReduceStatusPlan(targetActor, submission, { ...describeOpts, cap: true });
  if (!plan) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.ReduceStatusInvalid"));
    return;
  }

  const result = await declareActorAction({
    actor,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.REDUCE_STATUS,
    cost: 1,
    target: targetActor,
    combatant: timing.combatant ?? options.combatant ?? null,
    tokenId: options.tokenId ?? options.token?.id ?? null,
    timing: options.timing ?? null,
    consume: options.consume,
    metadata: {
      mode: plan.mode,
      reductions: plan.reductions,
      feedbackDetail: plan.reductions.map((row) => `${row.statusName}\u00a0−${row.amount}`).join(", "),
    },
  });
  if (!result.ok) return result;

  await applyReduceStatusPlan(targetActor, plan);
  return result;
}
