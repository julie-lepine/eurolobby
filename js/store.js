const DB_KEY = 'eurolobby_db';

const emptyDb = () => ({ users: [], lobbies: [] });

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
  const session = getSession();
  if (!session?.userId) return null;
  const db = loadDb();
  return db.users.find((u) => u.id === session.userId) || null;
}

export function getCurrentLobby() {
  const session = getSession();
  if (!session?.lobbyId) return null;
  const db = loadDb();
  return db.lobbies.find((l) => l.id === session.lobbyId) || null;
}

export function updateLobby(lobbyId, updater) {
  const db = loadDb();
  const idx = db.lobbies.findIndex((l) => l.id === lobbyId);
  if (idx === -1) return null;
  db.lobbies[idx] = typeof updater === 'function' ? updater(db.lobbies[idx]) : updater;
  saveDb(db);
  return db.lobbies[idx];
}

export function getUserLobbies(userId) {
  const db = loadDb();
  return db.lobbies.filter((l) => l.memberIds.includes(userId));
}
