export function actorItems(actor) {
  return actor ? [...actor.items] : [];
}

export function actorItem(actor, itemId) {
  if (!actor || itemId == null) return null;
  return actor.items.get(String(itemId)) ?? null;
}

export function optionalString(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text || null;
}

export function trimmedString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function documentId(value) {
  if (value == null) return null;
  const id = typeof value === "object" ? value.id : value;
  return id == null ? null : String(id);
}

export function cloneData(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneData);
  const out = {};
  for (const [key, entry] of Object.entries(value)) out[key] = cloneData(entry);
  return out;
}

export function localize(key, data) {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

export function warnAbnormal(message, extra) {
  console.warn(`[PMTTRPG] ${message}`, extra);
}

export function warnUser(key, data, extra) {
  const text = localize(key, data);
  ui.notifications.warn(text);
  console.warn(`[PMTTRPG] ${text}`, extra ?? "");
}

export function projectOptions(options = {}) {
  return options.projectmoonttrpg ?? {};
}

export function tokenDocument(token) {
  return token?.document ?? token ?? null;
}
