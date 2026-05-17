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

export function getCountryByCode(code) {
  if (!code) return null;
  return countriesCatalog.find((c) => c.code === code) ?? null;
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

/** Affiche un drapeau image dans un conteneur (pas d’emoji texte, évite « GB » sous Windows). */
export function applyPerformanceFlag(el, perf, { width = 80, className = 'flag-icon' } = {}) {
  if (!el || !perf) return;
  el.classList.remove('flag-fallback');
  if (perf.code) {
    const img = document.createElement('img');
    const code = String(perf.code).toLowerCase();
    img.className = className;
    img.src = getFlagUrl(perf.code, width);
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.loading = 'eager';
    img.decoding = 'async';
    img.addEventListener('error', function onFlagError() {
      if (!this.dataset.retry) {
        this.dataset.retry = '1';
        this.src = `https://flagcdn.com/${code}.svg`;
        return;
      }
      el.classList.add('flag-fallback');
      el.replaceChildren();
    });
    el.replaceChildren(img);
  } else {
    el.replaceChildren();
    el.classList.add('flag-fallback');
  }
}

/** HTML drapeau pour listes / templates. */
export function flagImgHtml(perf, { width = 80, className = 'flag-icon' } = {}) {
  if (!perf?.code) {
    return `<span class="${className} flag-fallback" aria-hidden="true"></span>`;
  }
  const code = String(perf.code).toLowerCase();
  const url = getFlagUrl(perf.code, width);
  const svg = `https://flagcdn.com/${code}.svg`;
  const w = width;
  const h = Math.round(width * 0.75);
  return `<img class="${className}" src="${url}" alt="" width="${w}" height="${h}" loading="lazy" decoding="async" aria-hidden="true" onerror="if(!this.dataset.retry){this.dataset.retry='1';this.src='${svg}'}else{this.replaceWith(Object.assign(document.createElement('span'),{className:'${className} flag-fallback',ariaHidden:'true'}))}">`;
}
