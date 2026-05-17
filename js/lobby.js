import { uid, generateLobbyCode, VOTE_DURATION, REVEAL_THRESHOLD, loadCountries } from './utils.js';
import {
  loadDb,
  saveDb,
  setSession,
  getSession,
  updateLobby,
  getCurrentUser,
  getCurrentLobby,
  isUsingRemote,
  setLobbyCache,
  removeLobbyFromCaches,
  refreshUserLobbies,
  applyLobbyNormalization,
  ensureLobbyCache,
} from './store.js';
import {
  isRemoteMode,
  insertLobby,
  saveLobby,
  fetchLobbyByCode,
  fetchLobbyById,
  deleteLobbyById,
  isCodeTaken,
} from './remote.js';

let countriesCache = null;

export async function getCountries() {
  if (!countriesCache) countriesCache = await loadCountries();
  return countriesCache;
}

export function getLobbyMembers(lobby) {
  if (isRemoteMode()) {
    const members = lobby.members || [];
    if (members.length) return members;
    return lobby.memberIds.map((id) => ({ id, pseudo: 'Joueur', avatar: '🎤' }));
  }
  const db = loadDb();
  return lobby.memberIds.map((id) => db.users.find((u) => u.id === id)).filter(Boolean);
}

export function getCurrentPerformance(lobby) {
  return lobby.performances[lobby.currentPerformanceIndex] || null;
}

async function generateUniqueCode() {
  let code = generateLobbyCode();
  if (isRemoteMode()) {
    while (await isCodeTaken(code)) code = generateLobbyCode();
    return code;
  }
  const db = loadDb();
  while (db.lobbies.some((l) => l.code === code)) code = generateLobbyCode();
  return code;
}

export async function createLobby({ name, maxPlayers, isPrivate, dramaticReveal }) {
  const user = getCurrentUser();
  if (!user) return { ok: false, error: 'Connecte-toi pour créer un lobby.' };

  const countries = await getCountries();
  const code = await generateUniqueCode();

  const performances = countries.map((c, i) => ({
    id: uid(),
    order: i + 1,
    code: c.code,
    flag: c.flag,
    country: c.country,
    artist: c.artist,
    song: c.song,
  }));

  const lobby = {
    id: uid(),
    code,
    name: name?.trim() || 'Soirée Eurovision 2025 🎤',
    maxPlayers: Math.min(50, Math.max(2, Number(maxPlayers) || 10)),
    isPrivate: !!isPrivate,
    dramaticReveal: dramaticReveal !== false,
    adminId: user.id,
    memberIds: [user.id],
    members: [{ id: user.id, pseudo: user.pseudo, avatar: user.avatar }],
    performances,
    currentPerformanceIndex: 0,
    status: 'waiting',
    timerEndsAt: null,
    votes: [],
    chat: [],
    ready: { [user.id]: false },
    createdAt: Date.now(),
    finishedAt: null,
  };

  if (isRemoteMode()) {
    try {
      await insertLobby(lobby);
      setLobbyCache(lobby);
      const session = getSession() || {};
      setSession({ ...session, userId: user.id, lobbyId: lobby.id });
      return { ok: true, lobby };
    } catch (err) {
      console.error(err);
      return { ok: false, error: 'Impossible de créer le lobby. Vérifie Supabase (schéma SQL).' };
    }
  }

  const db = loadDb();
  db.lobbies.push(lobby);
  saveDb(db);
  const session = getSession() || {};
  setSession({ ...session, userId: user.id, lobbyId: lobby.id });
  return { ok: true, lobby };
}

export async function joinLobby(code) {
  const user = getCurrentUser();
  if (!user) return { ok: false, error: 'Connecte-toi ou rejoins en invité.' };

  const normalized = code.toUpperCase().trim();
  let lobby;

  if (isRemoteMode()) {
    lobby = await fetchLobbyByCode(normalized);
    if (!lobby) return { ok: false, error: 'Code invalide. Vérifie avec ton ami.' };

    lobby = await applyLobbyNormalization(lobby);

    if (lobby.memberIds.length >= lobby.maxPlayers) return { ok: false, error: 'Lobby complet.' };

    if (!lobby.memberIds.includes(user.id)) {
      lobby.memberIds.push(user.id);
      lobby.ready = { ...lobby.ready, [user.id]: false };
      lobby.members = [
        ...(lobby.members || []),
        { id: user.id, pseudo: user.pseudo, avatar: user.avatar },
      ];
      try {
        await saveLobby(lobby);
      } catch (err) {
        console.error(err);
        return { ok: false, error: 'Erreur lors de la connexion au lobby.' };
      }
    }

    setLobbyCache(lobby);
    setSession({ ...getSession(), lobbyId: lobby.id });
    return { ok: true, lobby };
  }

  const db = loadDb();
  lobby = db.lobbies.find((l) => l.code === normalized);
  if (!lobby) return { ok: false, error: 'Code invalide. Vérifie avec ton ami.' };
  if (lobby.memberIds.length >= lobby.maxPlayers) return { ok: false, error: 'Lobby complet.' };
  if (lobby.memberIds.includes(user.id)) {
    setSession({ ...getSession(), lobbyId: lobby.id });
    return { ok: true, lobby };
  }

  lobby.memberIds.push(user.id);
  lobby.ready[user.id] = false;
  saveDb(db);
  setSession({ ...getSession(), lobbyId: lobby.id });
  return { ok: true, lobby };
}

export function setReady(isReady) {
  const user = getCurrentUser();
  const session = getSession();
  if (!user || !session?.lobbyId) return null;
  return updateLobby(session.lobbyId, (l) => {
    if (!l) return l;
    return { ...l, ready: { ...l.ready, [user.id]: isReady } };
  });
}

export function startPerformance() {
  const user = getCurrentUser();
  const session = getSession();
  return updateLobby(session.lobbyId, (l) => {
    if (!l || l.adminId !== user?.id) return l;
    return {
      ...l,
      status: 'live',
      timerEndsAt: Date.now() + VOTE_DURATION * 1000,
      revealed: false,
    };
  });
}

export function stopTimer() {
  const session = getSession();
  return updateLobby(session.lobbyId, (l) => ({ ...l, timerEndsAt: null }));
}

export function nextPerformance() {
  const user = getCurrentUser();
  const session = getSession();
  return updateLobby(session.lobbyId, (l) => {
    if (!l || l.adminId !== user?.id) return l;
    const next = l.currentPerformanceIndex + 1;
    if (next >= l.performances.length) {
      return { ...l, status: 'finished', timerEndsAt: null, finishedAt: Date.now() };
    }
    return {
      ...l,
      currentPerformanceIndex: next,
      timerEndsAt: Date.now() + VOTE_DURATION * 1000,
      revealed: false,
      status: 'live',
    };
  });
}

export function resetLobby() {
  const user = getCurrentUser();
  const session = getSession();
  return updateLobby(session.lobbyId, (l) => {
    if (!l || l.adminId !== user?.id) return l;
    return {
      ...l,
      currentPerformanceIndex: 0,
      status: 'waiting',
      timerEndsAt: null,
      votes: [],
      chat: [],
      ready: Object.fromEntries(l.memberIds.map((id) => [id, false])),
      revealed: false,
      finishedAt: null,
    };
  });
}

export async function submitVote(score) {
  const session = getSession();
  const user = getCurrentUser();
  if (!session?.lobbyId || !user) return { ok: false, error: 'Non connecté.' };

  if (isRemoteMode()) {
    const hydrated = await ensureLobbyCache(session.lobbyId);
    if (!hydrated) return { ok: false, error: 'Lobby introuvable. Rejoins la partie.' };
  }

  const lobby = getCurrentLobby();
  if (!isVoteOpen(lobby)) {
    return { ok: false, error: 'Le vote est fermé.' };
  }

  const updated = updateLobby(session.lobbyId, (l) => {
    if (!l) return l;
    const perf = l.performances[l.currentPerformanceIndex];
    if (!perf) return l;
    const votes = l.votes.filter((v) => !(v.performanceId === perf.id && v.userId === user.id));
    votes.push({
      id: uid(),
      performanceId: perf.id,
      userId: user.id,
      score,
      createdAt: Date.now(),
    });
    return { ...l, votes };
  });
  return updated ? { ok: true, lobby: updated } : { ok: false, error: 'Erreur vote.' };
}

export function setRevealed() {
  const session = getSession();
  return updateLobby(session.lobbyId, (l) => (l ? { ...l, revealed: true } : l));
}

export function sendChatMessage(text) {
  const session = getSession();
  const user = getCurrentUser();
  if (!text?.trim() || !session?.lobbyId || !user) return null;

  return updateLobby(session.lobbyId, (l) => ({
    ...l,
    chat: [
      ...l.chat,
      { id: uid(), userId: user.id, pseudo: user.pseudo, text: text.trim(), ts: Date.now() },
    ].slice(-100),
  }));
}

export function getRemainingSeconds(lobby) {
  if (!lobby?.timerEndsAt) return VOTE_DURATION;
  return Math.max(0, Math.ceil((lobby.timerEndsAt - Date.now()) / 1000));
}

export function isVoteOpen(lobby) {
  if (!lobby?.timerEndsAt || Date.now() >= lobby.timerEndsAt) return false;
  if (
    lobby.dramaticReveal &&
    !lobby.revealed &&
    getRemainingSeconds(lobby) <= REVEAL_THRESHOLD
  ) {
    return false;
  }
  return true;
}

export function isAdmin(lobby, userId) {
  return lobby?.adminId === userId;
}

export async function deleteLobby(lobbyId) {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: 'Connecte-toi pour supprimer un lobby.' };

  let lobby = null;
  if (isRemoteMode()) {
    const current = getCurrentLobby();
    lobby =
      current?.id === lobbyId
        ? current
        : (await fetchLobbyById(lobbyId)) || null;
  } else {
    lobby = loadDb().lobbies.find((l) => l.id === lobbyId) || null;
  }

  if (!lobby) return { ok: false, error: 'Lobby introuvable.' };
  if (lobby.adminId !== user.id) {
    return { ok: false, error: 'Seul l\'admin peut supprimer ce lobby.' };
  }

  if (isRemoteMode()) {
    await deleteLobbyById(lobbyId);
    removeLobbyFromCaches(lobbyId);
    await refreshUserLobbies(user.id);
  } else {
    const db = loadDb();
    db.lobbies = db.lobbies.filter((l) => l.id !== lobbyId);
    saveDb(db);
  }

  const session = getSession();
  if (session?.lobbyId === lobbyId) {
    setSession({ ...session, lobbyId: null });
    setLobbyCache(null);
  }

  return { ok: true, name: lobby.name };
}
