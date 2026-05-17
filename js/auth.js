import { uid, hashPassword } from './utils.js';
import { loadDb, saveDb, setSession, getCurrentUser } from './store.js';

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function signup({ email, password, pseudo, avatar }) {
  if (!pseudo?.trim()) return { ok: false, error: 'Le pseudo est requis.' };
  if (!validateEmail(email)) return { ok: false, error: 'Email invalide.' };
  if (!password || password.length < 6) return { ok: false, error: 'Mot de passe : 6 caractères minimum.' };

  const db = loadDb();
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: 'Cet email est déjà utilisé.' };
  }

  const user = {
    id: uid(),
    email: email.toLowerCase().trim(),
    pseudo: pseudo.trim(),
    avatar: avatar || '🎤',
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
  };
  db.users.push(user);
  saveDb(db);
  setSession({ userId: user.id, lobbyId: null, isGuest: false });
  return { ok: true, user };
}

export function login({ email, password }) {
  if (!validateEmail(email)) return { ok: false, error: 'Email invalide.' };
  const db = loadDb();
  const user = db.users.find((u) => u.email === email.toLowerCase().trim());
  if (!user || user.passwordHash !== hashPassword(password)) {
    return { ok: false, error: 'Email ou mot de passe incorrect.' };
  }
  setSession({ userId: user.id, lobbyId: null, isGuest: false });
  return { ok: true, user };
}

export function loginAsGuest({ pseudo, avatar }) {
  if (!pseudo?.trim()) return { ok: false, error: 'Choisis un pseudo pour continuer.' };
  const user = {
    id: uid(),
    email: null,
    pseudo: pseudo.trim(),
    avatar: avatar || '🎤',
    passwordHash: null,
    isGuest: true,
    createdAt: Date.now(),
  };
  const db = loadDb();
  db.users.push(user);
  saveDb(db);
  setSession({ userId: user.id, lobbyId: null, isGuest: true });
  return { ok: true, user };
}

export function logout() {
  setSession(null);
}

export function requireAuth() {
  return getCurrentUser();
}
