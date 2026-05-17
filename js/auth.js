import { uid, hashPassword } from './utils.js';
import { loadDb, saveDb, setSession, getSession, getCurrentUser, isUsingRemote, setUserCache } from './store.js';
import {
  isRemoteMode,
  createGuestProfile,
  signupWithAuth,
  loginWithAuth,
  logoutAuth,
  restoreAuthSession,
  mapAuthError,
} from './remote.js';

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function signup({ email, password, pseudo, avatar }) {
  if (!pseudo?.trim()) return { ok: false, error: 'Le pseudo est requis.' };
  if (!validateEmail(email)) return { ok: false, error: 'Email invalide.' };
  if (!password || password.length < 6) return { ok: false, error: 'Mot de passe : 6 caractères minimum.' };

  if (isRemoteMode()) {
    try {
      const user = await signupWithAuth({
        email,
        password,
        pseudo: pseudo.trim(),
        avatar: avatar || '🎤',
      });
      setUserCache(user);
      setSession({ userId: user.id, user, lobbyId: null, isGuest: false });
      return { ok: true, user };
    } catch (err) {
      return { ok: false, error: mapAuthError(err) };
    }
  }

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

export async function login({ email, password }) {
  if (!validateEmail(email)) return { ok: false, error: 'Email invalide.' };

  if (isRemoteMode()) {
    try {
      const user = await loginWithAuth({ email, password });
      setUserCache(user);
      setSession({ userId: user.id, user, lobbyId: null, isGuest: false });
      return { ok: true, user };
    } catch (err) {
      return { ok: false, error: mapAuthError(err) };
    }
  }

  const db = loadDb();
  const user = db.users.find((u) => u.email === email.toLowerCase().trim());
  if (!user || user.passwordHash !== hashPassword(password)) {
    return { ok: false, error: 'Email ou mot de passe incorrect.' };
  }
  setSession({ userId: user.id, lobbyId: null, isGuest: false });
  return { ok: true, user };
}

export async function loginAsGuest({ pseudo, avatar }) {
  if (!pseudo?.trim()) return { ok: false, error: 'Choisis un pseudo pour continuer.' };

  if (isRemoteMode()) {
    try {
      const user = await createGuestProfile({ pseudo: pseudo.trim(), avatar: avatar || '🎤' });
      setUserCache(user);
      setSession({ userId: user.id, user, lobbyId: null, isGuest: true });
      return { ok: true, user };
    } catch (err) {
      return { ok: false, error: mapAuthError(err) };
    }
  }

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

export async function logout() {
  if (isRemoteMode()) {
    try {
      await logoutAuth();
    } catch {
      /* ignore */
    }
  }
  setUserCache(null);
  setSession(null);
}

export function requireAuth() {
  return getCurrentUser();
}

export async function initRemoteAuth() {
  if (!isUsingRemote()) return null;
  try {
    const user = await restoreAuthSession();
    if (user) {
      setUserCache(user);
      setSession({ userId: user.id, user, lobbyId: getSession()?.lobbyId || null, isGuest: false });
    }
    return user;
  } catch {
    return null;
  }
}
