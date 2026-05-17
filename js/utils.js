export const VOTE_DURATION = 180;
export const REVEAL_THRESHOLD = 15;
export const SCORES = [-3, -2, -1, 0, 1, 2, 3];

export function uid() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function hashPassword(password) {
  return btoa(unescape(encodeURIComponent(password)));
}

export function formatScore(n) {
  if (n > 0) return `+${n}`;
  return String(n);
}

export function formatAvg(n) {
  const rounded = Math.round(n * 10) / 10;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export function scoreClass(n) {
  if (n > 0) return 'pos';
  if (n < 0) return 'neg';
  return 'zero';
}

export async function loadCountries() {
  const url = `${import.meta.env.BASE_URL}data/countries-2025.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Impossible de charger le catalogue pays');
  return res.json();
}
