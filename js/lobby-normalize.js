import { loadCountries, uid, PERFORMANCE_COUNT } from './utils.js';

function catalogSignature(catalog) {
  return catalog.map((c) => c.code).join('|');
}

function performancesSignature(performances) {
  return (performances || []).map((p) => p.code).join('|');
}

/** Aligne un lobby sur le catalogue actuel (max 25 prestations Eurovision). */
export async function normalizeLobby(lobby) {
  if (!lobby) return lobby;

  const catalog = await loadCountries();
  if (!catalog.length) return lobby;

  const current = lobby.performances || [];
  const catalogSig = catalogSignature(catalog);
  const currentSig = performancesSignature(current);

  if (current.length === catalog.length && current.length <= PERFORMANCE_COUNT && currentSig === catalogSig) {
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

export function lobbyNeedsNormalization(lobby, normalized) {
  if (!lobby || !normalized) return false;
  const beforeLen = lobby.performances?.length ?? 0;
  const afterLen = normalized.performances?.length ?? 0;
  if (beforeLen !== afterLen) return true;
  if (afterLen > PERFORMANCE_COUNT) return true;
  return performancesSignature(lobby.performances) !== performancesSignature(normalized.performances);
}
