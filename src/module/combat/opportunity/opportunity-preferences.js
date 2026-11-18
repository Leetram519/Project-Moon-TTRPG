import { resolveActingUser, resolveTokenOrWorldActor } from "../../acting-user.js";
import { projectOptions } from "../../shared-helpers.js";

const SYSTEM_ID = "projectmoonttrpg";
const BADGE_ID = "pmttrpg-admin-movement-badge";

const OPPORTUNITY_PROMPT_PREFERENCES = {
  ASK: "ask",
  OFF: "off",
};

const OPPORTUNITY_PROMPT_FLAG_SCOPE = SYSTEM_ID;
const OPPORTUNITY_PROMPT_FLAG_KEY = "opportunityPrompts";
const OPPORTUNITY_PROMPT_SETTING = "opportunityPrompts";
const ADMINISTRATIVE_MOVEMENT_SETTING = "administrativeMovement";
const ADMINISTRATIVE_MOVEMENT_KEYBINDING = "administrativeMovement";

let adminMovementHeld = false;
let adminBadgeEl = null;

function normalizePreference(value) {
  return value === OPPORTUNITY_PROMPT_PREFERENCES.OFF
    ? OPPORTUNITY_PROMPT_PREFERENCES.OFF
    : OPPORTUNITY_PROMPT_PREFERENCES.ASK;
}

function getOpportunityPromptPreference(user) {
  if (!user) return OPPORTUNITY_PROMPT_PREFERENCES.ASK;
  return normalizePreference(user.getFlag(OPPORTUNITY_PROMPT_FLAG_SCOPE, OPPORTUNITY_PROMPT_FLAG_KEY));
}

function isOpportunityPromptingEnabledForUser(user) {
  return getOpportunityPromptPreference(user) !== OPPORTUNITY_PROMPT_PREFERENCES.OFF;
}

async function persistOpportunityPromptPreference(value) {
  const user = game.user;
  const next = normalizePreference(value);
  const current = getOpportunityPromptPreference(user);
  if (current === next) return;
  await user.setFlag(OPPORTUNITY_PROMPT_FLAG_SCOPE, OPPORTUNITY_PROMPT_FLAG_KEY, next);
}

function actingUserForOpportunity(opportunity) {
  if (!opportunity) return null;
  const actor = resolveTokenOrWorldActor(opportunity.reactorActorId, opportunity.reactorTokenId);
  return resolveActingUser(actor, opportunity.reactorTokenId);
}

/**
 * Drops the automatic Opportunities whose acting user set the prompt preference
 * to Off, before a session can pause for them (Ask is the default).
 */
export function filterAutomaticCheckpointsByPromptPreference(checkpoints) {
  const filtered = [];
  for (const checkpoint of checkpoints ?? []) {
    const opportunities = [];
    for (const opportunity of checkpoint.opportunities ?? []) {
      const user = actingUserForOpportunity(opportunity);
      if (!isOpportunityPromptingEnabledForUser(user)) continue;
      opportunities.push(opportunity);
    }
    if (!opportunities.length) continue;
    filtered.push({ ...checkpoint, opportunities });
  }
  return filtered;
}

function currentUserIsGM() {
  return game.user.isGM === true;
}

function readAdminSetting() {
  return game.settings.get(SYSTEM_ID, ADMINISTRATIVE_MOVEMENT_SETTING) === true;
}

export function isAdministrativeMovementActive(options = {}) {
  if (!currentUserIsGM()) return false;
  const pmt = projectOptions(options);
  if (pmt.adminSuppressed === true) return true;
  if (adminMovementHeld) return true;
  return readAdminSetting();
}

export function setAdministrativeMovementHeld(held) {
  adminMovementHeld = held === true;
  refreshAdministrativeMovementBadge();
  return adminMovementHeld;
}

function ensureAdminBadge() {
  if (adminBadgeEl?.isConnected) return adminBadgeEl;
  let el = document.getElementById(BADGE_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = BADGE_ID;
    el.className = "pmttrpg-admin-movement-badge";
    el.hidden = true;
    document.body.appendChild(el);
  }
  el.textContent = game.i18n.localize("PMTTRPG.Opportunity.AdministrativeMovementActive");
  adminBadgeEl = el;
  return el;
}

function refreshAdministrativeMovementBadge() {
  const el = ensureAdminBadge();
  const active = currentUserIsGM() && (adminMovementHeld || readAdminSetting());
  el.hidden = !active;
}

function registerOpportunityPreferenceSettings() {
  game.settings.register(SYSTEM_ID, OPPORTUNITY_PROMPT_SETTING, {
    name: "PMTTRPG.Settings.opportunityPrompts.name",
    hint: "PMTTRPG.Settings.opportunityPrompts.hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      [OPPORTUNITY_PROMPT_PREFERENCES.ASK]: "PMTTRPG.Settings.opportunityPrompts.ask",
      [OPPORTUNITY_PROMPT_PREFERENCES.OFF]: "PMTTRPG.Settings.opportunityPrompts.off",
    },
    default: OPPORTUNITY_PROMPT_PREFERENCES.ASK,
    onChange: (value) => {
      void persistOpportunityPromptPreference(value);
    },
  });

  game.settings.register(SYSTEM_ID, ADMINISTRATIVE_MOVEMENT_SETTING, {
    name: "PMTTRPG.Settings.administrativeMovement.name",
    hint: "PMTTRPG.Settings.administrativeMovement.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => refreshAdministrativeMovementBadge(),
  });
}

function registerOpportunityKeybindings() {
  game.keybindings.register(SYSTEM_ID, ADMINISTRATIVE_MOVEMENT_KEYBINDING, {
    name: "PMTTRPG.Keybindings.administrativeMovement.name",
    hint: "PMTTRPG.Keybindings.administrativeMovement.hint",
    editable: [],
    restricted: true,
    onDown: () => {
      if (!currentUserIsGM()) return false;
      setAdministrativeMovementHeld(true);
      return true;
    },
    onUp: () => {
      setAdministrativeMovementHeld(false);
      return true;
    },
  });
}

async function syncOpportunityPromptPreferenceFlag() {
  await persistOpportunityPromptPreference(game.settings.get(SYSTEM_ID, OPPORTUNITY_PROMPT_SETTING));
}

export function registerOpportunityClientControls() {
  registerOpportunityPreferenceSettings();
  registerOpportunityKeybindings();
  Hooks.once("ready", () => {
    void syncOpportunityPromptPreferenceFlag();
    refreshAdministrativeMovementBadge();
    const adminSetting = game.settings.settings.get(`${SYSTEM_ID}.${ADMINISTRATIVE_MOVEMENT_SETTING}`);
    if (adminSetting && !currentUserIsGM()) adminSetting.config = false;
  });
}
