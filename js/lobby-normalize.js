import { loadCountries, uid } from './utils.js';

let catalogCache = null;

async function getCatalog() {
  if (!catalogCache) catalogCache = await loadCountries();
  return catalogCache;
}

function catalogSignature(catalog) {
  return catalog.map((c) => c.code).join('|');
}

function performancesSignature(performances) {
  return (performances || []).map((p) => p.code).join('|');
}

/** Aligne un lobby sur le catalogue actuel (ex. 37 → 25 prestations). */
export async function normalizeLobby(lobby) {
  if (!lobby) return lobby;

  const catalog = await getCatalog();
  if (!catalog.length) return lobby;

  const current = lobby.performances || [];
  if (
    current.length === catalog.length &&
    performancesSignature(current) === catalogSignature(catalog)
  ) {
    return lobby;
  }

  const oldPerfById = Object.fromEntries(current.map((p) => [p.id, p]));

  const performances = catalog.map((c, i) => {
    const existing = current.find((p) => p.code === c.code);
    return {
      id: existing?.id ?? uid(),
      order: i + 1,
      code: c.code,
      flag: c.flag,
      country: c.country,
      artist: c.artist,
      song: c.song,
    };
  });

  const codeToNewId = Object.fromEntries(performances.map((p) => [p.code, p.id]));
  const votes = (lobby.votes || [])
    .map((v) => {
      const oldPerf = oldPerfById[v.performanceId];
      if (!oldPerf) return null;
      const newId = codeToNewId[oldPerf.code];
      if (!newId) return null;
      return { ...v, performanceId: newId };
    })
    .filter(Boolean);

  const currentPerformanceIndex = Math.min(
    lobby.currentPerformanceIndex ?? 0,
    Math.max(0, performances.length - 1)
  );

  return { ...lobby, performances, votes, currentPerformanceIndex };
}

export function lobbyWasNormalized(before, after) {
  if (!before || !after) return false;
  return performancesSignature(before.performances) !== performancesSignature(after.performances);
}

export async function getCatalogPerformanceCount() {
  const catalog = await getCatalog();
  return catalog.length;
}
