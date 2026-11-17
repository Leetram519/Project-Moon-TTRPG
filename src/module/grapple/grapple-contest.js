/**
 * The opposed Grapple contest
 */

import { canActAs } from "../acting-user.js";
import { currentTurnIdentity, sameTurnIdentity } from "../combat/turn-stamps.js";
import { combatantName, combatantOf } from "../combat/combatant-match.js";
import { GRAPPLE_OPS, applyGrappleMutation, withGrappleStateMutation } from "./grapple-authority.js";
import { RULE_MERGES, defineRuleSubject, resolveRuleProfile } from "../rules/rule-contributions.js";

const SCOPE = "projectmoonttrpg";
const GRAPPLE_CONTEST_FLAG = "grappleContest";
const GRAPPLE_CONTEST_TEMPLATE = "systems/projectmoonttrpg/templates/chat/grapple-contest.hbs";

const CONTEST_STATES = {
  PENDING: "pending",
  ROLLING: "rolling",
  WON: "won",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

const STAT_LABEL_KEYS = { for: "PMTTRPG.AbilityFor", jus: "PMTTRPG.AbilityJus" };

function serializeRollChoices(choices) {
  if (!choices?.rollDialog) return null;
  return {
    stat: choices.stat,
    rollDialog: {
      rollMode: choices.rollDialog.rollMode ?? "def",
      modifier: Number(choices.rollDialog.modifier) || 0,
      assistEntryId: choices.rollDialog.assistEntryId ?? null,
    },
    recipientId: choices.recipientId ?? null,
  };
}

function readContestFlag(message) {
  const raw = message?.getFlag(SCOPE, GRAPPLE_CONTEST_FLAG);
  return raw && typeof raw === "object" && raw.version === 1 ? raw : null;
}

/** The Grappler has to win outright (a tie or a total that isn't a number fails). */
function decideGrappleContest(grapplerTotal, defenderTotal) {
  const g = Number(grapplerTotal);
  const d = Number(defenderTotal);
  if (!Number.isFinite(g) || !Number.isFinite(d)) return CONTEST_STATES.FAILED;
  return g > d ? CONTEST_STATES.WON : CONTEST_STATES.FAILED;
}

function buildContestView(flag, { combat = null } = {}) {
  const grappler = combatantOf(combat, flag.grapplerCombatantId);
  const target = combatantOf(combat, flag.targetCombatantId);
  const allowed = (flag.profile?.defender?.allowedStats ?? GRAPPLE_STATS).filter((stat) => GRAPPLE_STATS.includes(stat));
  const statLabels = allowed.map((stat) => game.i18n.localize(STAT_LABEL_KEYS[stat] ?? stat));
  const statList = game.i18n.getListFormatter({ type: "disjunction" }).format(statLabels);
  const resolved = flag.state === CONTEST_STATES.WON || flag.state === CONTEST_STATES.FAILED;
  return {
    messageContestId: flag.contestId,
    grapplerName: combatantName(grappler) || flag.grapplerName || "",
    targetName: combatantName(target) || flag.targetName || "",
    pending: flag.state === CONTEST_STATES.PENDING,
    rolling: flag.state === CONTEST_STATES.ROLLING,
    resolved,
    won: flag.state === CONTEST_STATES.WON,
    cancelled: flag.state === CONTEST_STATES.CANCELLED,
    grapplerTotal: flag.grapplerTotal,
    defenderTotal: flag.defenderTotal,
    defenderStatLabel: flag.defenderStat ? game.i18n.localize(STAT_LABEL_KEYS[flag.defenderStat] ?? flag.defenderStat) : null,
    stats: allowed.map((stat, index) => ({ stat, label: statLabels[index] })),
    i18n: {
      title: game.i18n.localize("PMTTRPG.Grapple.ContestTitle"),
      awaiting: game.i18n.format("PMTTRPG.Grapple.ContestAwaiting", { target: combatantName(target) || flag.targetName || "", stats: statList }),
      answer: game.i18n.format("PMTTRPG.Grapple.ContestAnswer", { stats: statList }),
      rolling: game.i18n.localize("PMTTRPG.Grapple.ContestRolling"),
      won: game.i18n.localize("PMTTRPG.Grapple.ContestWon"),
      failed: game.i18n.localize("PMTTRPG.Grapple.ContestFailed"),
      cancelled: game.i18n.localize("PMTTRPG.Grapple.ContestCancelled"),
      respond: game.i18n.localize("PMTTRPG.Grapple.ContestRespond"),
    },
  };
}

async function renderContest(flag, combat) {
  return foundry.applications.handlebars.renderTemplate(GRAPPLE_CONTEST_TEMPLATE, buildContestView(flag, { combat }));
}

/** Runs on the declaring client once the GRAPPLE declaration goes through. */
export async function postGrappleContest({ combat, grappler, target, declarationId, grapplerChoices, profile }) {
  const flag = {
    version: 1,
    contestId: foundry.utils.randomID(),
    combatId: combat?.id ?? null,
    state: CONTEST_STATES.PENDING,
    grapplerCombatantId: grappler.id,
    targetCombatantId: target.id,
    grapplerTokenId: grappler.tokenId ?? null,
    targetTokenId: target.tokenId ?? null,
    grapplerName: combatantName(grappler),
    targetName: combatantName(target),
    declarationId: declarationId ?? null,
    grapplerChoices: serializeRollChoices(grapplerChoices),
    profile: {
      attacker: { ...profile.attempt.attacker },
      defender: { allowedStats: [...profile.attempt.defender.allowedStats], modifier: profile.attempt.defender.modifier },
    },
    defenderStat: null,
    grapplerTotal: null,
    defenderTotal: null,
    relationshipId: null,
  };
  return ChatMessage.create({
    content: await renderContest(flag, combat),
    speaker: ChatMessage.getSpeaker({ actor: grappler.actor }),
    flags: { [SCOPE]: { [GRAPPLE_CONTEST_FLAG]: flag } },
  });
}

async function writeContest(message, flag, combat) {
  await message.update({
    content: await renderContest(flag, combat),
    [`flags.${SCOPE}.${GRAPPLE_CONTEST_FLAG}`]: flag,
  });
}

function userMayDefend(user, target) {
  if (!user) return false;
  if (user.isGM) return true;
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  return !!(target.token?.testUserPermission(user, owner) || target.actor.testUserPermission(user, owner));
}

async function rollStatWithChoices(args) {
  const { PMTTRPGRolls } = await import("../rolls.js");
  return PMTTRPGRolls.rollStatWithChoices(args);
}

/** Runs on the primary GM when the defender commits. */
export async function commitGrappleContestDefense(data = {}, meta = {}) {
  const message = game.messages.get(data.messageId);
  const flag = readContestFlag(message);
  if (!flag) return { ok: false, reason: "no-contest" };
  const combat = game.combats.get(flag.combatId);
  if (!combat) return { ok: false, reason: "no-combat" };

  return withGrappleStateMutation(`contest:${flag.contestId}`, async () => {
    const live = readContestFlag(message);
    if (!live || live.state !== CONTEST_STATES.PENDING) return { ok: false, reason: "not-pending" };
    const grappler = combatantOf(combat, live.grapplerCombatantId);
    const target = combatantOf(combat, live.targetCombatantId);
    if (!grappler?.actor || !target?.actor) {
      await writeContest(message, { ...live, state: CONTEST_STATES.CANCELLED }, combat);
      return { ok: false, reason: "combatant-missing" };
    }
    const user = game.users.get(meta.fromUserId);
    if (!userMayDefend(user, target)) return { ok: false, reason: "not-defender" };
    const allowed = live.profile?.defender?.allowedStats ?? GRAPPLE_STATS;
    if (!allowed.includes(data.stat)) return { ok: false, reason: "stat-not-allowed" };

    const rolling = { ...live, state: CONTEST_STATES.ROLLING, defenderStat: data.stat };
    await writeContest(message, rolling, combat);

    let grapplerResult = null;
    let defenderResult = null;
    try {
      grapplerResult = await rollStatWithChoices({
        actor: grappler.actor,
        stat: live.grapplerChoices?.stat ?? "for",
        choices: live.grapplerChoices,
        templateData: { title: game.i18n.localize("PMTTRPG.Grapple.ContestRollGrappler"), opposed: true },
        statModifier: Number(live.profile?.attacker?.modifier) || 0,
        rollModeSources: {
          advantage: Number(live.profile?.attacker?.advantage) || 0,
          disadvantage: Number(live.profile?.attacker?.disadvantage) || 0,
        },
        returnResult: true,
      });
      defenderResult = await rollStatWithChoices({
        actor: target.actor,
        stat: data.stat,
        choices: data.choices,
        templateData: { title: game.i18n.localize("PMTTRPG.Grapple.ContestRollTarget"), opposed: true },
        statModifier: Number(live.profile?.defender?.modifier) || 0,
        returnResult: true,
      });
    } catch (error) {
      console.warn("[PMTTRPG] Grapple contest roll failed", error);
    }

    if (!grapplerResult || !defenderResult) {
      await writeContest(message, { ...rolling, state: CONTEST_STATES.CANCELLED }, combat);
      return { ok: false, reason: "roll-failed" };
    }

    const outcome = decideGrappleContest(grapplerResult.total, defenderResult.total);
    let relationshipId = null;
    let finalState = outcome;
    if (outcome === CONTEST_STATES.WON) {
      const turn = currentTurnIdentity(combat, grappler);
      const marker = grappler.flags?.[SCOPE]?.actionState?.firstAction ?? null;
      const freeThrow = turn && marker?.declarationId && marker.declarationId === live.declarationId
        && sameTurnIdentity({ combatantId: grappler.id, started: marker.started, round: marker.round }, turn)
        ? { started: turn.started, round: turn.round }
        : null;
      const created = await applyGrappleMutation(combat, GRAPPLE_OPS.CREATE, {
        grapplerCombatantId: grappler.id,
        targetCombatantId: target.id,
        grapplerTokenId: grappler.tokenId ?? null,
        targetTokenId: target.tokenId ?? null,
        createdDeclarationId: live.declarationId,
        createdTurn: turn,
        freeThrow,
      });
      if (created.ok) relationshipId = created.relationship?.id ?? null;
      else {
        finalState = CONTEST_STATES.FAILED;
        console.warn("[PMTTRPG] Grapple won but the relationship could not be created", created.reason);
      }
    }
    await writeContest(message, {
      ...rolling,
      state: finalState,
      grapplerTotal: grapplerResult.total,
      defenderTotal: defenderResult.total,
      relationshipId,
    }, combat);
    return { ok: true, outcome: finalState, relationshipId, grapplerTotal: grapplerResult.total, defenderTotal: defenderResult.total };
  });
}

/** Runs on the defender's client and just sends their roll choices to the primary GM. */
export async function onGrappleContestClick(event) {
  const button = event.target.closest("[data-action='grapple-defend']");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const messageId = button.closest("[data-message-id]")?.dataset.messageId;
  const message = game.messages.get(messageId);
  const flag = readContestFlag(message);
  if (!flag || flag.state !== CONTEST_STATES.PENDING) return;
  const combat = game.combats.get(flag.combatId) ?? game.combat;
  const target = combatantOf(combat, flag.targetCombatantId);
  if (!target?.actor || !canActAs(target.actor, target.tokenId)) return;
  const stat = button.dataset.stat;
  const { PMTTRPGRolls } = await import("../rolls.js");
  const choices = await PMTTRPGRolls.collectStatRollChoices({
    actor: target.actor,
    stat,
    label: game.i18n.localize(STAT_LABEL_KEYS[stat] ?? stat),
    tokenId: target.tokenId ?? null,
    combatant: target,
  });
  if (!choices) return;
  const { runOnPrimaryGM } = await import("../easy-effects/gm-route.js");
  const result = await runOnPrimaryGM("commitGrappleContestDefense", {
    messageId,
    stat,
    choices: serializeRollChoices(choices),
  });
  if (result && result.ok === false && result.reason !== "not-pending") {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Grapple.ContestCommitFailed"));
  }
}

/** Only the target's controlling users (and GMs) see the stat buttons. */
export function enhanceGrappleContestCard(message, html) {
  const flag = readContestFlag(message);
  if (!flag) return;
  const combat = game.combats.get(flag.combatId) ?? game.combat;
  const target = combatantOf(combat, flag.targetCombatantId);
  const allowed = flag.state === CONTEST_STATES.PENDING && !!target?.actor && canActAs(target.actor, target.tokenId);
  for (const button of html.querySelectorAll("[data-action='grapple-defend']")) {
    button.hidden = !allowed;
    button.disabled = !allowed;
  }
  for (const line of html.querySelectorAll("[data-contest-viewer]")) {
    line.hidden = (line.dataset.contestViewer === "answerer") !== allowed;
  }
}

/** Deleting a pending card ends the contest (whatever it cost stays spent though). */
export function cancelGrappleContestForRemovedChat(message) {
  const flag = readContestFlag(message);
  if (!flag || flag.state !== CONTEST_STATES.PENDING) return false;
  ui.notifications.warn(game.i18n.localize("PMTTRPG.Grapple.ContestDeleted"));
  return true;
}

/**
 * The CR baseline for Grapples: the Grappler rolls Fortitude with Disadvantage and the
 * target answers with Fortitude or Justice. Anything else comes from `grapple` rule contributions.
 */


const GRAPPLE_RULE_SUBJECT = "grapple";

const GRAPPLE_ROLES = { GRAPPLER: "grappler", TARGET: "target" };

const GRAPPLE_STATS = ["for", "jus"];

const GRAPPLE_BASELINE_PROFILE = {
  attempt: {
    attacker: { advantage: 0, disadvantage: 1, modifier: 0 },
    defender: { allowedStats: GRAPPLE_STATS, modifier: 0 },
  },
  relationship: { end: false },
};

export function defineGrappleRuleSubject() {
  defineRuleSubject(GRAPPLE_RULE_SUBJECT, {
    roles: Object.values(GRAPPLE_ROLES),
    fields: {
      "attempt.attacker.advantage": { type: "integer", merge: RULE_MERGES.SUM, min: 0 },
      "attempt.attacker.disadvantage": { type: "integer", merge: RULE_MERGES.SUM, min: 0 },
      "attempt.attacker.modifier": { type: "integer", merge: RULE_MERGES.SUM },
      "attempt.defender.allowedStats": { type: "subset", merge: RULE_MERGES.INTERSECT, values: [...GRAPPLE_STATS] },
      "attempt.defender.modifier": { type: "integer", merge: RULE_MERGES.SUM },
      "relationship.end": { type: "boolean", merge: RULE_MERGES.ANY },
    },
  });
}

function participant(combatant) {
  if (!combatant) return null;
  return { actor: combatant.actor ?? null, combatant, token: combatant.token ?? null };
}

function context(phase, { combat, grappler, target }) {
  return {
    phase,
    combat,
    roles: {
      [GRAPPLE_ROLES.GRAPPLER]: participant(grappler),
      [GRAPPLE_ROLES.TARGET]: participant(target),
    },
  };
}

export function resolveGrappleAttemptProfile({ combat = null, grappler = null, target = null } = {}) {
  return resolveRuleProfile(GRAPPLE_RULE_SUBJECT, GRAPPLE_BASELINE_PROFILE, context("attempt", { combat, grappler, target }));
}

export function grappleRelationshipMustEnd({ combat = null, grappler = null, target = null } = {}) {
  const { profile } = resolveRuleProfile(GRAPPLE_RULE_SUBJECT, GRAPPLE_BASELINE_PROFILE, context("relationship", { combat, grappler, target }));
  return profile.relationship?.end === true;
}
