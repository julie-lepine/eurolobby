import { loadCountries } from './utils.js';

let catalogCache = null;

async function getCatalog() {
  if (!catalogCache) catalogCache = await loadCountries();
  return catalogCache;
}

/** Aligne un lobby sur le catalogue actuel (ex. 37 → 25 prestations). */
export async function normalizeLobby(lobby) {
  if (!lobby?.performances?.length) return lobby;

  const catalog = await getCatalog();
  const max = catalog.length;
  if (lobby.performances.length <= max) return lobby;

  const performances = lobby.performances.slice(0, max);
  const keptIds = new Set(performances.map((p) => p.id));
  const votes = (lobby.votes || []).filter((v) => keptIds.has(v.performanceId));
  const currentPerformanceIndex = Math.min(
    lobby.currentPerformanceIndex,
    Math.max(0, performances.length - 1)
  );

  return { ...lobby, performances, votes, currentPerformanceIndex };
}
