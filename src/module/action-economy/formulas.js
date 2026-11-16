export function dashMovementGain(justice, dashMisc = 0) {
  return 3 + (Number(justice) || 0) + (Number(dashMisc) || 0);
}

export function reduceStatusStandardBudget(justice, rank, reduceStatusMisc = 0) {
  const jus = Number(justice) || 0;
  const rnk = Number(rank) || 0;
  const misc = Number(reduceStatusMisc) || 0;
  const sum = jus + rnk;
  const base = sum <= 0 ? 1 : sum * 2;
  if (sum <= 0) return Math.max(1, base + misc);
  return Math.max(0, base + misc);
}

export function reduceStatusPauseBudget(justice) {
  return Math.max(0, Math.floor((Number(justice) || 0) / 2));
}

export function movementActionExpended({ squaresExhausted = false, movementValue = 0 } = {}) {
  return !!squaresExhausted || (Number(movementValue) || 0) <= 0;
}

export const HELD_HAND_CAPACITY = 2;

function normalizedHandProperty(item) {
  return String(item?.system?.handProperty ?? "").trim().toLowerCase();
}

export function handOccupancy(item) {
  const hand = normalizedHandProperty(item);
  if (!hand || hand === "handless") return 0;
  if (hand === "off2h" || hand === "def2h" || hand === "twohanded" || hand === "two-handed" || hand === "2h") {
    return 2;
  }
  if (hand === "off1h" || hand === "def1h" || hand === "onehanded" || hand === "one-handed" || hand === "1h") {
    return 1;
  }
  return 0;
}

export function isOneHandedHeldItem(item) {
  return handOccupancy(item) === 1;
}

export const DROPPED_ITEM_PATH = "flags.projectmoonttrpg.dropped";

export function isDroppedItem(item) {
  return item?.flags?.projectmoonttrpg?.dropped === true;
}

export function parseConversionAmount(raw, available) {
  const max = Math.max(0, Math.floor(Number(available) || 0));
  if (max <= 0) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  return n;
}
