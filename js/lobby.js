import { uid, generateLobbyCode, VOTE_DURATION, loadCountries } from './utils.js';
import { loadDb, saveDb, setSession, getSession, updateLobby, getCurrentUser, getCurrentLobby } from './store.js';

let countriesCache = null;

export async function getCountries() {
  if (!countriesCache) countriesCache = await loadCountries();
  return countriesCache;
}

export function getLobbyMembers(lobby) {
  const db = loadDb();
  return lobby.memberIds.map((id) => db.users.find((u) => u.id === id)).filter(Boolean);
}

export function getCurrentPerformance(lobby) {
  return lobby.performances[lobby.currentPerformanceIndex] || null;
}

export function createLobby({ name, maxPlayers, isPrivate, dramaticReveal }) {
  const user = getCurrentUser();
  if (!user) return { ok: false, error: 'Connecte-toi pour créer un lobby.' };

  return getCountries().then((countries) => {
    const db = loadDb();
    let code = generateLobbyCode();
    while (db.lobbies.some((l) => l.code === code)) code = generateLobbyCode();

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

    db.lobbies.push(lobby);
    saveDb(db);
    const session = getSession() || {};
    setSession({ ...session, userId: user.id, lobbyId: lobby.id });
    return { ok: true, lobby };
  });
}

export function joinLobby(code) {
  const user = getCurrentUser();
  if (!user) return { ok: false, error: 'Connecte-toi ou rejoins en invité.' };

  const db = loadDb();
  const lobby = db.lobbies.find((l) => l.code === code.toUpperCase().trim());
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
  const session = getSession();
  const lobby = updateLobby(session.lobbyId, (l) => {
    if (!l) return l;
    return { ...l, ready: { ...l.ready, [session.userId]: isReady } };
  });
  return lobby;
}

export function startPerformance() {
  const session = getSession();
  return updateLobby(session.lobbyId, (l) => {
    if (!l || l.adminId !== session.userId) return l;
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
  const session = getSession();
  return updateLobby(session.lobbyId, (l) => {
    if (!l || l.adminId !== session.userId) return l;
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
  const session = getSession();
  return updateLobby(session.lobbyId, (l) => {
    if (!l || l.adminId !== session.userId) return l;
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

export function submitVote(score) {
  const session = getSession();
  const user = getCurrentUser();
  if (!session?.lobbyId || !user) return { ok: false, error: 'Non connecté.' };

  const lobby = getCurrentLobby();
  if (!lobby?.timerEndsAt || Date.now() > lobby.timerEndsAt) {
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
  return lobby?.timerEndsAt && Date.now() < lobby.timerEndsAt;
}

export function isAdmin(lobby, userId) {
  return lobby?.adminId === userId;
}
