import {
  isRemoteMode,
  fetchLobbyById,
  fetchUserLobbies as remoteFetchUserLobbies,
  saveLobby as remoteSaveLobby,
} from './remote.js';

const DB_KEY = 'eurolobby_db';

const emptyDb = () => ({ users: [], lobbies: [] });

let lobbyCache = null;
let userCache = null;
let userLobbiesCache = [];

export function isUsingRemote() {
  return isRemoteMode();
}

export function setUserCache(user) {
  userCache = user;
}

export function setLobbyCache(lobby) {
  lobbyCache = lobby;
  window.dispatchEvent(new CustomEvent('eurolobby:update'));
}

export function setUserLobbiesCache(lobbies) {
  userLobbiesCache = lobbies || [];
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

export async function hydrateLobby(lobbyId) {
  if (!isRemoteMode() || !lobbyId) return null;
  const lobby = await fetchLobbyById(lobbyId);
  if (lobby) setLobbyCache(lobby);
  return lobby;
}

export async function refreshUserLobbies(userId) {
  if (!isRemoteMode() || !userId) {
    userLobbiesCache = [];
    return userLobbiesCache;
  }
  const list = await remoteFetchUserLobbies(userId);
  userLobbiesCache = list;
  return list;
}

export function updateLobby(lobbyId, updater) {
  if (isRemoteMode()) {
    const current = lobbyCache;
    if (!current || current.id !== lobbyId) return null;
    const next = typeof updater === 'function' ? updater({ ...current }) : updater;
    setLobbyCache(next);
    remoteSaveLobby(next).catch((err) => console.error('saveLobby', err));
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
