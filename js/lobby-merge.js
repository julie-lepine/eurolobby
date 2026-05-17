/** Fusion de payloads lobby pour éviter d'écraser votes/chat lors des sauvegardes concurrentes. */

function voteKey(v) {
  return `${v.performanceId}:${v.userId}`;
}

export function mergeVotes(serverVotes = [], localVotes = []) {
  const byKey = new Map();
  for (const v of serverVotes) byKey.set(voteKey(v), v);
  for (const v of localVotes) {
    const key = voteKey(v);
    const existing = byKey.get(key);
    if (!existing || (v.createdAt || 0) >= (existing.createdAt || 0)) {
      byKey.set(key, v);
    }
  }
  return Array.from(byKey.values());
}

function predictionKey(p) {
  return p.userId;
}

export function mergePredictions(serverPredictions = [], localPredictions = []) {
  const byKey = new Map();
  for (const p of serverPredictions) byKey.set(predictionKey(p), p);
  for (const p of localPredictions) {
    const key = predictionKey(p);
    const existing = byKey.get(key);
    if (!existing || (p.updatedAt || 0) >= (existing.updatedAt || 0)) {
      byKey.set(key, p);
    }
  }
  return Array.from(byKey.values());
}

export function mergeChat(serverChat = [], localChat = []) {
  const byId = new Map();
  for (const m of serverChat) byId.set(m.id, m);
  for (const m of localChat) byId.set(m.id, m);
  return Array.from(byId.values())
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .slice(-100);
}

function mergeMembers(serverMembers = [], localMembers = []) {
  const byId = new Map();
  for (const m of serverMembers) if (m?.id) byId.set(m.id, m);
  for (const m of localMembers) if (m?.id) byId.set(m.id, m);
  return Array.from(byId.values());
}

/** Combine l'état serveur avec les modifications locales (priorité locale hors votes/chat). */
export function mergeLobbyPayload(server, local) {
  if (!server) return local;
  if (!local) return server;

  const memberIds = [...new Set([...(server.memberIds || []), ...(local.memberIds || [])])];

  return {
    ...server,
    ...local,
    memberIds,
    members: mergeMembers(server.members, local.members),
    votes: mergeVotes(server.votes, local.votes),
    predictions: mergePredictions(server.predictions, local.predictions),
    chat: mergeChat(server.chat, local.chat),
    ready: { ...server.ready, ...local.ready },
  };
}
