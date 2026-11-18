import {
  FALLING_DAMAGE_SOURCE,
  FORCE_COLLISION_DAMAGE_SOURCE,
  damageSourceDeclaration,
} from "../damage-source.js";
import { HARD_STOPS } from "../movement/movement-resolve.js";

const BUTTONS = "systems/projectmoonttrpg/templates/parts/chat-buttons.html";

/** How many d8s a fall deals: squares fallen - rank - 1 (An Example: Rank 2 is safe for 3 squares). */
export function fallingDamageDice(squares, rank) {
  const fallen = Math.max(0, Math.floor(Number(squares) || 0));
  const cushion = Math.floor(Number(rank) || 0) + 1;
  return Math.max(0, fallen - cushion);
}

/** One Force die per unspent square when a wall, the scene edge, a floor or a ceiling stops the move. */
export function forceDamageDice(resolved) {
  if (!HARD_STOPS.has(resolved?.stopReason)) return 0;
  const squares = Math.floor(Number(resolved?.unspentSpaces) || 0);
  return squares > 0 ? squares : 0;
}

async function renderRoll(formula) {
  const roll = new Roll(formula);
  await roll.evaluate();
  return { html: await roll.render(), rolls: [roll] };
}

/** The `damageButtons` flag is what stops the createChatMessage hook from replacing this card's body. */
async function postMovementDamageCard(token, { formula, damageType, flavor, source, report = null } = {}) {
  const actorUuid = token?.actor?.uuid;
  if (!actorUuid || !formula) return { posted: false, reason: "no-target" };
  const rolled = await renderRoll(formula);
  const buttons = await foundry.applications.handlebars.renderTemplate(BUTTONS, { damageType });
  const content = `<div class="PMTTRPG chat-card" data-damage-actor-uuid="${foundry.utils.escapeHTML(actorUuid)}"><p>${foundry.utils.escapeHTML(flavor ?? "")}</p>${rolled.html}${buttons}</div>`;
  const projectmoonttrpg = { damageButtons: true, damageType };
  const declaration = damageSourceDeclaration(source);
  if (declaration) projectmoonttrpg.damageSource = declaration;
  if (report && typeof report === "object") projectmoonttrpg.movementReport = report;
  const message = {
    content,
    rolls: rolled.rolls,
    speaker: ChatMessage.getSpeaker({ actor: token.actor, token }),
    flags: { projectmoonttrpg },
  };
  await ChatMessage.create(message);
  return { posted: true, message };
}

/** Just posts the roll. HP only changes when someone applies it from the card. */
export async function postFallingDamage(token, report, { movementReport = null } = {}) {
  if (!report) return { posted: false };
  if (!(Number(report.dice) > 0)) return { posted: false, reason: "no-dice" };
  const flavor = game.i18n.format("PMTTRPG.Falling.Damage", {
    name: token?.name ?? "",
    squares: report.squares,
    formula: report.formula ?? "",
  });
  const posted = await postMovementDamageCard(token, {
    formula: report.formula,
    damageType: "none",
    flavor,
    source: FALLING_DAMAGE_SOURCE,
    report: movementReport,
  });
  return { ...posted, strip: true };
}

export async function postForceCollisionDamage(token, resolved, { movementReport = null } = {}) {
  const dice = forceDamageDice(resolved);
  if (!dice) return { posted: false, reason: "not-force" };
  const name = token?.name ?? "";
  const flavor = game.i18n.format("PMTTRPG.Falling.Force", { name, squares: dice, formula: `${dice}d8` });
  return postMovementDamageCard(token, {
    formula: `${dice}d8`,
    damageType: "force",
    flavor,
    source: FORCE_COLLISION_DAMAGE_SOURCE,
    report: movementReport,
  });
}
