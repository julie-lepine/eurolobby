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

/** Choisit l'état de partie le plus avancé (index, statut, timer). */
export function pickGameState(server, local) {
  const sIdx = server.currentPerformanceIndex ?? 0;
  const lIdx = local.currentPerformanceIndex ?? 0;

  let base;
  if (lIdx > sIdx) base = local;
  else if (sIdx > lIdx) base = server;
  else if (server.status === 'finished' || local.status === 'finished') {
    base = server.status === 'finished' ? server : local;
  } else if ((local.timerEndsAt ?? 0) > (server.timerEndsAt ?? 0)) {
    base = local;
  } else if ((server.timerEndsAt ?? 0) > (local.timerEndsAt ?? 0)) {
    base = server;
  } else {
    base = server;
  }

  const performances =
    (base.performances?.length ?? 0) >= (server.performances?.length ?? 0)
      ? base.performances || server.performances
      : server.performances || local.performances;

  return {
    currentPerformanceIndex: base.currentPerformanceIndex ?? 0,
    status: base.status ?? server.status,
    timerEndsAt: base.timerEndsAt ?? null,
    finishedAt: base.finishedAt ?? server.finishedAt ?? local.finishedAt ?? null,
    performances: performances || [],
    revealed: !!(server.revealed || local.revealed),
  };
}

/** Combine serveur + local : fusion sur votes/chat ; état de partie = le plus avancé. */
export function mergeLobbyPayload(server, local) {
  if (!server) return local;
  if (!local) return server;

  const memberIds = [...new Set([...(server.memberIds || []), ...(local.memberIds || [])])];

  const members = mergeMembers(server.members, local.members);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const syncedMembers = memberIds.map(
    (id) => memberById.get(id) || { id, pseudo: 'Joueur', avatar: '🎤' }
  );

  const game = pickGameState(server, local);

  return {
    ...server,
    ...game,
    id: server.id,
    code: server.code,
    adminId: server.adminId,
    name: server.name ?? local.name,
    maxPlayers: server.maxPlayers ?? local.maxPlayers,
    isPrivate: server.isPrivate ?? local.isPrivate,
    dramaticReveal: server.dramaticReveal ?? local.dramaticReveal,
    createdAt: server.createdAt ?? local.createdAt,
    memberIds,
    members: syncedMembers,
    votes: mergeVotes(server.votes, local.votes),
    predictions: mergePredictions(server.predictions, local.predictions),
    chat: mergeChat(server.chat, local.chat),
    ready: { ...server.ready, ...local.ready },
  };
}
