const OWNER = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

/**
 * Unlinked token actors update through ActorDelta. The synthetic actor can
 * still report ownership even when the user cannot update the delta itself.
 */
export function canUserUpdateDocument(doc, user = globalThis.game?.user) {
  if (!doc || !user) return false;
  if (user.isGM) return true;
  const actor = doc.documentName === "Actor" ? doc : (doc.actor ?? null);
  const token = doc.documentName === "Token"
    ? doc
    : (actor?.isToken ? (actor.token ?? doc.token ?? null) : null);
  const delta = doc.documentName === "ActorDelta"
    ? doc
    : (token?.delta ?? (actor?.isToken ? actor.delta : null));
  if (delta && typeof delta.canUserModify === "function") {
    return !!delta.canUserModify(user, "update");
  }
  if (token && typeof token.canUserModify === "function") {
    return !!token.canUserModify(user, "update");
  }
  if (typeof doc.canUserModify === "function") {
    return !!doc.canUserModify(user, "update");
  }
  return !!doc.isOwner;
}

/**
 * Finds a token on the current canvas or in another scene. Clash cards can
 * reference tokens that are not on the scene currently being viewed.
 */
export function resolveTokenDocument(tokenId) {
  if (!tokenId) return null;
  const onCanvas = globalThis.canvas?.tokens?.get(tokenId)?.document;
  if (onCanvas) return onCanvas;
  for (const scene of globalThis.game?.scenes ?? []) {
    const tokenDoc = scene.tokens?.get(tokenId);
    if (tokenDoc) return tokenDoc;
  }
  return null;
}

export function tokenIdForActor(actor, explicitTokenId = null) {
  if (explicitTokenId) return explicitTokenId;
  if (actor?.token?.id) return actor.token.id;
  if (actor?.isToken) return null;
  return actor?.getActiveTokens?.(true)?.[0]?.id ?? null;
}

/** Returns `actor.token.object` for a token actor, and `getActiveTokens(true)` for a world actor. */
export function actorTokenPlaceables(actor) {
  if (!actor) return [];
  if (actor.isToken) {
    const placeable = actor.token?.object ?? null;
    return placeable ? [placeable] : [];
  }
  if (typeof actor.getActiveTokens !== "function") return [];
  return actor.getActiveTokens(true) ?? [];
}

/** Returns `actor.token` for a token actor, and the first linked token document for a world actor. */
export function actorTokenDocument(actor) {
  if (!actor) return null;
  if (actor.isToken) return actor.token ?? null;
  if (typeof actor.getActiveTokens !== "function") return null;
  return actor.getActiveTokens(true, true)?.[0] ?? null;
}

/**
 * Returns the actor on `speaker.token` when that id is set.
 * Returns null when that token is missing.
 * Returns the actor for `speaker.actor` when the speaker has no token id.
 */
export function actorFromSpeaker(speaker) {
  if (!speaker) return null;
  if (speaker.token) {
    const fromDoc = resolveTokenDocument(speaker.token);
    if (fromDoc?.actor) return fromDoc.actor;
    const synthetic = globalThis.game?.actors?.tokens?.[speaker.token];
    if (synthetic) return synthetic;
    return null;
  }
  const fromSpeaker = globalThis.ChatMessage?.getSpeakerActor?.(speaker);
  if (fromSpeaker) return fromSpeaker;
  const actorId = speaker.actor;
  return actorId ? (globalThis.game?.actors?.get(actorId) ?? null) : null;
}

export function canActAs(actor, tokenId = null, user = globalThis.game?.user) {
  if (!user) return false;
  if (user.isGM) return true;
  const level = OWNER();
  const tokenDoc = resolveTokenDocument(tokenIdForActor(actor, tokenId));
  if (tokenDoc?.testUserPermission?.(user, level)) return true;
  if (actor?.testUserPermission?.(user, level)) return true;
  return false;
}

/**
 * Picks which user should handle the action. Callers should only pass active
 * users so Dice So Nice does not end up waiting on an offline client.
 */
export function pickActingUser({ playerOwners = [], currentUser = null, currentUserCanAct = false, activeGm = null } = {}) {
  if (playerOwners[0]) return playerOwners[0];
  if (currentUserCanAct && currentUser) return currentUser;
  if (activeGm) return activeGm;
  return currentUser;
}

/**
 * Finds the active user who should handle prompts for this actor or token.
 * Prefer a player owner, then the current user, then an active GM.
 */
export function resolveActingUser(actor, tokenId = null) {
  const game = globalThis.game;
  if (!game?.users) return game?.user ?? null;

  const resolvedTokenId = tokenIdForActor(actor, tokenId);
  const tokenDoc = resolveTokenDocument(resolvedTokenId);
  const docs = [tokenDoc, actor].filter(Boolean);
  if (!docs.length) return game.user ?? null;
  const level = OWNER();
  const activeOwners = game.users.filter((u) =>
    u.active && docs.some((doc) => doc.testUserPermission?.(u, level))
  );
  const playerOwners = activeOwners.filter((u) => !u.isGM);
  const currentUser = game.user ?? null;

  return pickActingUser({
    playerOwners,
    currentUser,
    currentUserCanAct: !!(currentUser && canActAs(actor, resolvedTokenId, currentUser)),
    activeGm: game.users.find((u) => u.active && u.isGM) ?? null,
  });
}