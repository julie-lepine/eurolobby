import countriesCatalog from '../data/countries-2027.json';

export const VOTE_DURATION = 180;
export const REVEAL_THRESHOLD = 15;
export const PERFORMANCE_COUNT = 25;
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
  if (countriesCatalog?.length) {
    return countriesCatalog.slice(0, PERFORMANCE_COUNT);
  }
  const base = import.meta.env.BASE_URL || '/';
  const urls = [
    `${base}data/countries-2027.json`,
    `${base}data/countries-2025.json`,
    '/data/countries-2027.json',
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length) return data.slice(0, PERFORMANCE_COUNT);
    } catch {
      /* essai URL suivante */
    }
  }
  throw new Error('Impossible de charger le catalogue pays');
}

/** URL image drapeau (PNG) à partir du code ISO (FR, GB…). */
export function getFlagUrl(code, width = 80) {
  if (!code) return '';
  return `https://flagcdn.com/w${width}/${String(code).toLowerCase()}.png`;
}

/** Affiche un drapeau image dans un conteneur ; emoji si chargement impossible. */
export function applyPerformanceFlag(el, perf, { width = 80, className = 'flag-icon' } = {}) {
  if (!el || !perf) return;
  el.textContent = '';
  if (perf.code) {
    const img = document.createElement('img');
    img.className = className;
    img.src = getFlagUrl(perf.code, width);
    img.alt = perf.country || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener(
      'error',
      () => {
        el.textContent = perf.flag || '🏳️';
      },
      { once: true }
    );
    el.appendChild(img);
  } else {
    el.textContent = perf.flag || '🏳️';
  }
}

/** HTML drapeau pour listes / templates. */
export function flagImgHtml(perf, { width = 80, className = 'flag-icon' } = {}) {
  if (!perf?.code) return perf?.flag || '🏳️';
  const url = getFlagUrl(perf.code, width);
  const alt = String(perf.country || perf.code)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
  const emoji = perf.flag || '🏳️';
  return `<img class="${className}" src="${url}" alt="${alt}" width="${width}" height="${Math.round(width * 0.75)}" loading="lazy" decoding="async" onerror="this.replaceWith(document.createTextNode('${emoji}'))">`;
}
