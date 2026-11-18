/**
 * The rule-contribution registry. Core defines a subject (like `grapple` or `movement`) with its roles
 * and allowed fields, each with a fixed merge rule. Providers return `{ subject, role, changes, source }`
 * entries that `resolveRuleProfile` folds into a copy of the caller's baseline.
 * Every merge rule is commutative so provider order doesn't matter.
 * Providers have to be synchronous because Foundry's movement cost function reads the movement subject.
 * Anything that throws or fails validation just gets dropped with a warning with everything else still applying.
 */

import { trimmedString } from "../shared-helpers.js";

export const RULE_MERGES = {
  SUM: "sum",
  ALL: "all",
  ANY: "any",
  INTERSECT: "intersect",
  MIN: "min",
  PREFER: "prefer",
};

const MERGE_SET = new Set(Object.values(RULE_MERGES));

/** @type {Map<string, { roles: Set<string>, fields: Map<string, object> }>} */
const subjects = new Map();

/** @type {{ id: string, order: number, seq: number, getContributions: Function }[]} */
const providers = [];
let providerSeq = 0;

const warnedKeys = new Set();

// cost functions spam the resolver many times per drag. Warning once will keep it quiet.
function warnOnce(key, message, extra) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn(`[PMTTRPG] ${message}`, extra ?? "");
}

function readPath(target, path) {
  let current = target;
  for (const part of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function writePath(target, path, value) {
  const parts = path.split(".");
  let current = target;
  for (let index = 0; index < parts.length - 1; index++) {
    const part = parts[index];
    if (current[part] == null || typeof current[part] !== "object") current[part] = {};
    current = current[part];
  }
  current[parts.at(-1)] = value;
}

function normalizeFieldSpec(field, spec) {
  if (!spec || typeof spec !== "object") throw new Error(`[PMTTRPG] Rule field '${field}' needs a spec`);
  if (!MERGE_SET.has(spec.merge)) throw new Error(`[PMTTRPG] Rule field '${field}' has unknown merge '${spec.merge}'`);
  return {
    type: spec.type,
    merge: spec.merge,
    values: Array.isArray(spec.values) ? [...spec.values] : null,
    prefer: spec.prefer ?? null,
    min: Number.isFinite(spec.min) ? spec.min : null,
  };
}

/**
 * Core only. Redefining a subject just replaces it.
 * @param {string} subject
 * @param {{ roles: string[], fields: Record<string, { type: string, merge: string, values?: any[], prefer?: any, min?: number }> }} definition
 */
export function defineRuleSubject(subject, { roles = [], fields = {} } = {}) {
  const key = trimmedString(subject);
  if (!key) throw new Error("[PMTTRPG] Rule subject requires a name");
  const fieldMap = new Map();
  for (const [field, spec] of Object.entries(fields)) fieldMap.set(field, normalizeFieldSpec(field, spec));
  subjects.set(key, {
    roles: new Set(roles.map((role) => String(role))),
    fields: fieldMap,
  });
}

export function getRuleSubject(subject) {
  const entry = subjects.get(String(subject ?? ""));
  if (!entry) return null;
  return { roles: [...entry.roles], fields: [...entry.fields.keys()] };
}

/**
 * Registering the same `id` again replaces the earlier one. `getContributions(context)`
 * has to be synchronous and return an array of entries.
 */
export function registerRuleContributionProvider({ id, order = 0, getContributions } = {}) {
  const key = trimmedString(id);
  if (!key || typeof getContributions !== "function") {
    throw new Error("[PMTTRPG] Rule provider requires id and getContributions");
  }
  unregisterRuleContributionProvider(key);
  providers.push({
    id: key,
    order: Number.isFinite(Number(order)) ? Number(order) : 0,
    seq: providerSeq++,
    getContributions,
  });
}

export function unregisterRuleContributionProvider(id) {
  const key = String(id ?? "");
  const index = providers.findIndex((entry) => entry.id === key);
  if (index >= 0) providers.splice(index, 1);
}

export function listRuleContributionProviders() {
  return sortedProviders().map((entry) => ({ id: entry.id, order: entry.order }));
}

function sortedProviders() {
  return [...providers].sort((a, b) => (a.order - b.order) || (a.seq - b.seq));
}

function validFieldValue(spec, value) {
  switch (spec.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return Number.isInteger(value) && (spec.min == null || spec.merge !== RULE_MERGES.MIN || value >= spec.min);
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      return spec.values?.includes(value) ?? false;
    case "subset":
      return Array.isArray(value) && value.every((entry) => spec.values?.includes(entry));
    default:
      return false;
  }
}

/**
 * Entries for other subjects get skipped quietly so one provider can serve several subjects.
 * @returns {{ entries: object[], warnings: string[] }}
 */
function collectRuleContributions(subject, context = {}) {
  const definition = subjects.get(String(subject ?? ""));
  const warnings = [];
  if (!definition) {
    warnOnce(`subject:${subject}`, "Unknown rule subject", { subject });
    return { entries: [], warnings: [`unknown-subject:${subject}`] };
  }

  const entries = [];
  for (const provider of sortedProviders()) {
    let raw;
    try {
      raw = provider.getContributions({ ...context, subject });
    } catch (error) {
      warnOnce(`throw:${provider.id}`, `Rule provider '${provider.id}' threw, so its contributions are ignored`, error);
      warnings.push(`provider-threw:${provider.id}`);
      continue;
    }
    if (raw == null) continue;
    if (!Array.isArray(raw)) {
      warnOnce(`shape:${provider.id}`, `Rule provider '${provider.id}' must return an array`);
      warnings.push(`provider-shape:${provider.id}`);
      continue;
    }
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      if (entry.subject !== subject) continue;
      const role = trimmedString(entry.role);
      if (!role || !definition.roles.has(role)) {
        warnOnce(`role:${provider.id}:${subject}:${entry.role}`, `Dropped a rule contribution with role '${entry.role}' for subject '${subject}'`, { provider: provider.id });
        warnings.push(`bad-role:${provider.id}`);
        continue;
      }
      if (!entry.changes || typeof entry.changes !== "object" || Array.isArray(entry.changes)) {
        warnOnce(`changes:${provider.id}:${subject}`, "Dropped a rule contribution without a changes object", { provider: provider.id });
        warnings.push(`bad-changes:${provider.id}`);
        continue;
      }
      const changes = {};
      for (const [field, value] of Object.entries(foundry.utils.flattenObject(entry.changes))) {
        const spec = definition.fields.get(field);
        if (!spec) {
          warnOnce(`field:${provider.id}:${subject}:${field}`, `Dropped unknown rule field '${field}' for subject '${subject}'`, { provider: provider.id });
          warnings.push(`unknown-field:${field}`);
          continue;
        }
        if (!validFieldValue(spec, value)) {
          warnOnce(`value:${provider.id}:${subject}:${field}`, `Dropped an invalid rule value for '${field}'`, { provider: provider.id, value });
          warnings.push(`invalid-value:${field}`);
          continue;
        }
        changes[field] = value;
      }
      if (!Object.keys(changes).length) continue;
      entries.push({
        providerId: provider.id,
        subject,
        role,
        changes,
        source: entry.source && typeof entry.source === "object" ? { ...entry.source } : null,
      });
    }
  }
  return { entries, warnings };
}

function mergeField(spec, field, baseValue, values, warnings) {
  switch (spec.merge) {
    case RULE_MERGES.SUM: {
      let total = Number(baseValue) || 0;
      for (const value of values) total += value;
      if (spec.min != null) total = Math.max(spec.min, total);
      return total;
    }
    case RULE_MERGES.ALL:
      return values.reduce((acc, value) => acc && value, baseValue !== false);
    case RULE_MERGES.ANY:
      return values.reduce((acc, value) => acc || value, baseValue === true);
    case RULE_MERGES.INTERSECT: {
      const base = Array.isArray(baseValue) ? baseValue : [];
      const result = values.reduce((acc, value) => acc.filter((entry) => value.includes(entry)), base);
      if (!result.length) {
        warnOnce(`empty:${field}`, `Rule contributions leave '${field}' empty, so the baseline is kept`);
        warnings.push(`empty-intersection:${field}`);
        return [...base];
      }
      return result;
    }
    case RULE_MERGES.MIN: {
      const candidates = [...values];
      if (Number.isFinite(baseValue)) candidates.push(baseValue);
      return candidates.length ? Math.min(...candidates) : baseValue;
    }
    case RULE_MERGES.PREFER:
      return values.includes(spec.prefer) ? spec.prefer : baseValue;
    default:
      return baseValue;
  }
}

/**
 * The baseline plus every valid contribution. `changed` is false if the result matches the baseline field by field.
 * @returns {{ profile: object, sources: object[], warnings: string[], changed: boolean }}
 */
export function resolveRuleProfile(subject, baseline = {}, context = {}) {
  const profile = foundry.utils.deepClone(baseline ?? {});
  const definition = subjects.get(String(subject ?? ""));
  if (!definition) {
    warnOnce(`subject:${subject}`, "Unknown rule subject", { subject });
    return { profile, sources: [], warnings: [`unknown-subject:${subject}`], changed: false };
  }

  const { entries, warnings } = collectRuleContributions(subject, context);
  const byField = new Map();
  const sources = [];
  for (const entry of entries) {
    for (const [field, value] of Object.entries(entry.changes)) {
      const list = byField.get(field) ?? [];
      list.push(value);
      byField.set(field, list);
      sources.push({
        providerId: entry.providerId,
        role: entry.role,
        field,
        value,
        itemUuid: entry.source?.itemUuid ?? null,
        actorUuid: entry.source?.actorUuid ?? null,
      });
    }
  }

  let changed = false;
  for (const [field, values] of byField) {
    const spec = definition.fields.get(field);
    const before = readPath(profile, field);
    const after = mergeField(spec, field, before, values, warnings);
    if (JSON.stringify(before) !== JSON.stringify(after)) changed = true;
    writePath(profile, field, after);
  }
  return { profile, sources, warnings, changed };
}

/**
 * The built-in rule-contribution provider for owned content. Content opts in with
 * `flags.projectmoonttrpg.ruleContributions`, an array of `{ subject, role, changes }` entries.
 * Only entries matching the participant's role count (a status on the Grappler only counts as `grappler` content).
 * A participant can also name an Item, which counts even if it isn't active on anyone.
 */


const OWNED_CONTENT_PROVIDER_ID = "owned-content";

function readItemRuleContributions(item) {
  const raw = item.flags?.projectmoonttrpg?.ruleContributions;
  return Array.isArray(raw) ? raw : [];
}

function listActiveOwnedContent(actor, { isActive } = {}) {
  if (!actor) return [];
  return actor.items.filter((item) => {
    try {
      return !!isActive(item, actor);
    } catch {
      return false;
    }
  });
}

function participantsOf(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function entriesFromItem(item, { subject, role, actor }) {
  const out = [];
  for (const entry of readItemRuleContributions(item)) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.subject !== subject || entry.role !== role) continue;
    out.push({
      subject,
      role,
      changes: entry.changes,
      source: {
        itemUuid: item.uuid,
        actorUuid: actor?.uuid ?? item.parent?.uuid ?? null,
      },
    });
  }
  return out;
}

/**
 * @param {object} context `{ subject, roles }`, where each role is a participant
 *   `{ actor, item? }` or an array of them
 */
function ownedContentRuleContributions(context = {}, { isActive } = {}) {
  const subject = context.subject;
  const roles = context.roles ?? {};
  const out = [];
  for (const [role, value] of Object.entries(roles)) {
    for (const participant of participantsOf(value)) {
      const seen = new Set();
      const actor = participant.actor ?? null;
      for (const item of listActiveOwnedContent(actor, { isActive })) {
        seen.add(item.uuid);
        out.push(...entriesFromItem(item, { subject, role, actor }));
      }
      const explicit = participant.item ?? null;
      if (explicit && !seen.has(explicit.uuid)) {
        out.push(...entriesFromItem(explicit, { subject, role, actor: actor ?? explicit.parent ?? null }));
      }
    }
  }
  return out;
}

export function registerOwnedContentRuleProvider({ isActive, order = 0 } = {}) {
  registerRuleContributionProvider({
    id: OWNED_CONTENT_PROVIDER_ID,
    order,
    getContributions: (context) => ownedContentRuleContributions(context, { isActive }),
  });
}
