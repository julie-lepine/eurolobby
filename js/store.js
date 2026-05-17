import {
  isRemoteMode,
  fetchLobbyById,
  fetchUserLobbies as remoteFetchUserLobbies,
  saveLobby as remoteSaveLobby,
} from './remote.js';
import { normalizeLobby, lobbyNeedsNormalization } from './lobby-normalize.js';

/** Ramène le lobby au catalogue (25 prestations) et persiste si besoin. */
export async function applyLobbyNormalization(lobby, { persist = true } = {}) {
  if (!lobby) return null;
  const normalized = await normalizeLobby(lobby);

  if (!lobbyNeedsNormalization(lobby, normalized)) return lobby;

  if (!persist) return normalized;

  if (isRemoteMode()) {
    await remoteSaveLobby(normalized).catch((err) => console.error('normalize saveLobby', err));
    userLobbiesCache = userLobbiesCache.map((l) => (l.id === normalized.id ? normalized : l));
    setLobbyCache(normalized);
  } else {
    const db = loadDb();
    const idx = db.lobbies.findIndex((l) => l.id === normalized.id);
    if (idx >= 0) {
      db.lobbies[idx] = normalized;
      saveDb(db);
    }
  }
  return normalized;
}

const DB_KEY = 'eurolobby_db';

const emptyDb = () => ({ users: [], lobbies: [] });

let lobbyCache = null;
let userCache = null;
let userLobbiesCache = [];

export function isUsingRemote() {
  return isRemoteMode();
}

export function getLobbyCache() {
  return lobbyCache;
}

export function setUserCache(user) {
  userCache = user;
}

function alignMembersWithIds(lobby) {
  if (!lobby?.memberIds?.length) return lobby;
  const byId = new Map((lobby.members || []).filter((m) => m?.id).map((m) => [m.id, m]));
  return {
    ...lobby,
    members: lobby.memberIds.map(
      (id) => byId.get(id) || { id, pseudo: 'Joueur', avatar: '🎤' }
    ),
  };
}

export function setLobbyCache(lobby, { emit = true } = {}) {
  const synced = lobby ? alignMembersWithIds(lobby) : null;
  if (lobbyCache === synced) return;
  lobbyCache = synced;
  if (emit) window.dispatchEvent(new CustomEvent('eurolobby:update'));
}

export function setUserLobbiesCache(lobbies) {
  userLobbiesCache = lobbies || [];
}

export function removeLobbyFromCaches(lobbyId) {
  if (lobbyCache?.id === lobbyId) lobbyCache = null;
  userLobbiesCache = userLobbiesCache.filter((l) => l.id !== lobbyId);
  window.dispatchEvent(new CustomEvent('eurolobby:update'));
}

export function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? JSON.parse(raw) : emptyDb();
  } catch {
    return emptyDb();
  }
}

export function saveDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  window.dispatchEvent(new CustomEvent('eurolobby:update'));
}

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem('eurolobby_session') || 'null');
  } catch {
    return null;
  }
}

export function setSession(session) {
  if (session) sessionStorage.setItem('eurolobby_session', JSON.stringify(session));
  else sessionStorage.removeItem('eurolobby_session');
}

export function getCurrentUser() {
  if (isRemoteMode()) {
    if (userCache) return userCache;
    const session = getSession();
    return session?.user || null;
  }
  const session = getSession();
  if (!session?.userId) return null;
  const db = loadDb();
  return db.users.find((u) => u.id === session.userId) || null;
}

export function getCurrentLobby() {
  const session = getSession();
  if (!session?.lobbyId) return null;
  if (isRemoteMode()) return lobbyCache;
  const db = loadDb();
  return db.lobbies.find((l) => l.id === session.lobbyId) || null;
}

export async function ensureLobbyCache(lobbyId) {
  if (!isRemoteMode() || !lobbyId) return getCurrentLobby();
  if (lobbyCache?.id === lobbyId) return lobbyCache;
  return hydrateLobby(lobbyId);
}

async function persistLobby(localLobby) {
  try {
    const merged = await remoteSaveLobby(localLobby);
    setLobbyCache(merged);
    userLobbiesCache = userLobbiesCache.map((l) => (l.id === merged.id ? merged : l));
    return merged;
  } catch (err) {
    console.error('persistLobby', err);
    throw err;
  }
}

export async function hydrateLobby(lobbyId) {
  if (!isRemoteMode() || !lobbyId) return null;
  const lobby = await fetchLobbyById(lobbyId);
  if (!lobby) {
    const session = getSession();
    if (session?.lobbyId === lobbyId) {
      setSession({ ...session, lobbyId: null });
    }
    return null;
  }
  const normalized = await applyLobbyNormalization(lobby);
  setLobbyCache(normalized);
  return normalized;
}

export async function refreshUserLobbies(userId) {
  if (!isRemoteMode() || !userId) {
    userLobbiesCache = [];
    return userLobbiesCache;
  }
  const list = await remoteFetchUserLobbies(userId);
  const session = getSession();
  const activeId = session?.lobbyId || lobbyCache?.id;
  const normalizedList = [];

  for (const lobby of list) {
    const needsPersist = lobby.id === activeId;
    normalizedList.push(await applyLobbyNormalization(lobby, { persist: needsPersist }));
  }
  userLobbiesCache = normalizedList;
  return normalizedList;
}

export function updateLobby(lobbyId, updater) {
  if (isRemoteMode()) {
    const current = lobbyCache;
    if (!current || current.id !== lobbyId) return null;
    const next = typeof updater === 'function' ? updater({ ...current }) : updater;
    setLobbyCache(next, { emit: false });
    persistLobby(next).catch((err) => console.error('saveLobby', err));
    return next;
  }

  const db = loadDb();
  const idx = db.lobbies.findIndex((l) => l.id === lobbyId);
  if (idx === -1) return null;
  db.lobbies[idx] = typeof updater === 'function' ? updater(db.lobbies[idx]) : updater;
  saveDb(db);
  return db.lobbies[idx];
}

export function getUserLobbies(userId) {
  if (isRemoteMode()) return userLobbiesCache;
  const db = loadDb();
  return db.lobbies.filter((l) => l.memberIds.includes(userId));
}
