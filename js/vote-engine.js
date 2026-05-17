import { SCORES, formatAvg, formatScore } from './utils.js';

export function getPerformanceVotes(lobby, performanceId) {
  return lobby.votes.filter((v) => v.performanceId === performanceId);
}

export function getUserVote(lobby, performanceId, userId) {
  return lobby.votes.find((v) => v.performanceId === performanceId && v.userId === userId);
}

export function computeAverage(votes) {
  if (!votes.length) return 0;
  const sum = votes.reduce((a, v) => a + v.score, 0);
  return sum / votes.length;
}

export function computeDistribution(votes) {
  const dist = Object.fromEntries(SCORES.map((s) => [s, 0]));
  votes.forEach((v) => {
    if (dist[v.score] !== undefined) dist[v.score]++;
  });
  return dist;
}

export function getMinMaxVoters(votes, members) {
  if (!votes.length) return { min: null, max: null };
  let min = votes[0];
  let max = votes[0];
  votes.forEach((v) => {
    if (v.score < min.score) min = v;
    if (v.score > max.score) max = v;
  });
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  return {
    min: min ? { ...min, member: byId[min.userId] } : null,
    max: max ? { ...max, member: byId[max.userId] } : null,
  };
}

export function computePerformanceRanking(lobby) {
  const results = lobby.performances.map((perf) => {
    const votes = getPerformanceVotes(lobby, perf.id);
    const avg = computeAverage(votes);
    return { perf, avg, votes };
  });
  return results
    .filter((r) => r.votes.length > 0)
    .sort((a, b) => b.avg - a.avg);
}

/** Classement final : toutes les prestations, y compris sans vote (moyenne 0). */
export function computeFullPerformanceRanking(lobby) {
  return lobby.performances
    .map((perf) => {
      const votes = getPerformanceVotes(lobby, perf.id);
      return { perf, avg: computeAverage(votes), votes };
    })
    .sort((a, b) => b.avg - a.avg);
}

export function computeLobbyStats(lobby, members) {
  const allVotes = lobby.votes;
  if (!allVotes.length) {
    return { groupAvg: 0, generous: null, severe: null, popular: null };
  }
  const groupAvg = computeAverage(allVotes);
  const byUser = {};
  members.forEach((m) => {
    const uv = allVotes.filter((v) => v.userId === m.id);
    if (uv.length) byUser[m.id] = { member: m, avg: computeAverage(uv) };
  });
  const entries = Object.values(byUser);
  const generous = entries.reduce((a, b) => (b.avg > a.avg ? b : a), entries[0]);
  const severe = entries.reduce((a, b) => (b.avg < a.avg ? b : a), entries[0]);
  const popular = entries.reduce((a, b) => {
    const aHigh = allVotes.filter((v) => v.userId === a.member.id && v.score >= 2).length;
    const bHigh = allVotes.filter((v) => v.userId === b.member.id && v.score >= 2).length;
    return bHigh > aHigh ? b : a;
  }, entries[0]);
  return { groupAvg, generous, severe, popular };
}

export { formatAvg, formatScore };
