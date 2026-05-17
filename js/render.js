import {
  SCORES,
  formatAvg,
  formatScore,
  scoreClass,
  REVEAL_THRESHOLD,
  applyPerformanceFlag,
  flagImgHtml,
  getCountryByCode,
} from './utils.js';
import {
  getCurrentPerformance,
  getLobbyMembers,
  getLobbyMemberCount,
  getRemainingSeconds,
  isVoteOpen,
  isAdmin,
  getUserPrediction,
} from './lobby.js';
import { getCurrentUser, getUserLobbies } from './store.js';
import {
  getPerformanceVotes,
  computeAverage,
  computeDistribution,
  getMinMaxVoters,
  computePerformanceRanking,
  computeFullPerformanceRanking,
  computeLobbyStats,
  computeUserWinner,
} from './vote-engine.js';
import { buildLobbyReportData } from './pdf-export.js';

let chatScrollForce = false;

export function markChatScrollForce() {
  chatScrollForce = true;
}

const AVATAR_BGS = [
  'rgba(105,240,174,0.1)',
  'rgba(224,64,251,0.1)',
  'rgba(124,77,255,0.1)',
  'rgba(0,229,204,0.1)',
  'rgba(255,215,64,0.1)',
  'rgba(255,64,129,0.1)',
];

export function renderAll(lobby) {
  const user = getCurrentUser();
  if (user) renderDashboardHeader(user);
  if (!lobby) {
    renderLobbyLists(user?.id);
    return;
  }
  renderLobbyLists(user?.id);
  renderDashboardLive(lobby);
  renderWaitingRoom(lobby, user);
  renderVoteScreen(lobby, user);
  renderReveal(lobby, user);
  renderResults(lobby, user);
  renderFinal(lobby, user);
  renderExportPreview(lobby, user);
  renderAdmin(lobby, user);
}

export function renderExportPreview(lobby, user) {
  if (!lobby) return;
  const data = buildLobbyReportData(lobby, user);
  const lobbyEl = document.getElementById('export-preview-lobby');
  if (lobbyEl) {
    lobbyEl.textContent = `${data.lobbyName} · ${data.memberCount} membres`;
  }
  const winnerEl = document.getElementById('export-preview-winner');
  if (winnerEl) {
    winnerEl.textContent = data.winner
      ? `${perfLabelForExport(data.winner.perf)} (${formatAvg(data.winner.avg)})`
      : '—';
  }
  setText('export-preview-members', `${data.memberCount} votants`);
  setText('export-preview-perfs', `${data.performanceCount} pays`);
  setText('export-preview-avg', `${formatAvg(data.stats.groupAvg)} / 3`);
}

function perfLabelForExport(perf) {
  const meta = getCountryByCode(perf.code);
  return meta?.country || perf.country || '—';
}

export function renderDashboardHeader(user) {
  const el = document.getElementById('dash-name');
  if (el) el.textContent = `${user.avatar} ${user.pseudo}`;
}

export function renderLobbyLists(userId) {
  const activeEl = document.getElementById('lobby-list-active');
  const histEl = document.getElementById('lobby-list-history');
  if (!activeEl || !userId) return;

  const lobbies = getUserLobbies(userId);
  const active = lobbies.filter((l) => l.status !== 'finished');
  const history = lobbies.filter((l) => l.status === 'finished');

  activeEl.innerHTML =
    active.length === 0
      ? '<p class="empty-hint">Aucun lobby actif. Crée-en un !</p>'
      : active
          .map((l) => {
            const badge =
              l.status === 'live'
                ? '<div class="lobby-badge badge-live">🔴 LIVE</div>'
                : '<div class="lobby-badge badge-wait">⏳ Attente</div>';
            const perf = l.performances[l.currentPerformanceIndex];
            const meta =
              l.status === 'live' && perf
                ? `${l.memberIds.length} membres · Prestation ${l.currentPerformanceIndex + 1}/${l.performances.length}`
                : `${l.memberIds.length} membres · En attente`;
            const target = l.status === 'live' ? 'enterLobbyVote' : 'enterLobbyWaiting';
            const del =
              l.adminId === userId
                ? `<button type="button" class="lobby-delete-btn" onclick="deleteLobbyById('${l.id}', event)" title="Supprimer le lobby" aria-label="Supprimer">🗑</button>`
                : '';
            return `<div class="lobby-card">
              <div class="lobby-card-body" onclick="${target}('${l.id}')">
              <div class="lobby-card-top">
                <div class="lobby-card-name">${escapeHtml(l.name)}</div>
                ${badge}
              </div>
              <div class="lobby-meta">${meta}</div>
              </div>
              ${del}
            </div>`;
          })
          .join('');

  histEl.innerHTML =
    history.length === 0
      ? '<p class="empty-hint">Aucun historique pour l\'instant.</p>'
      : history
          .map((l) => {
            const ranking = computePerformanceRanking(l);
            const winner = ranking[0];
            const wText = winner
              ? `${winner.perf.flag} ${winner.perf.country} · ${formatAvg(winner.avg)}`
              : '—';
            const del =
              l.adminId === userId
                ? `<button type="button" class="lobby-delete-btn" onclick="deleteLobbyById('${l.id}', event)" title="Supprimer le lobby" aria-label="Supprimer">🗑</button>`
                : '';
            return `<div class="lobby-card">
              <div class="lobby-card-body">
                <div class="lobby-card-top">
                  <div class="lobby-card-name">${escapeHtml(l.name)}</div>
                  <div class="lobby-badge badge-done">✅ Terminé</div>
                </div>
                <div class="lobby-meta">${l.memberIds.length} membres · Vainqueur: ${wText}</div>
              </div>
              ${del}
            </div>`;
          })
          .join('');
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function renderDashboardLive(lobby) {
  const sub = document.getElementById('dash-live-sub');
  const btn = document.getElementById('dash-vote-btn');
  if (!sub || !lobby) return;
  if (lobby.status === 'live') {
    const perf = getCurrentPerformance(lobby);
    sub.textContent = perf
      ? `Prestation ${lobby.currentPerformanceIndex + 1} · ${perf.country}`
      : 'En direct';
    if (btn) btn.style.display = '';
  } else {
    sub.textContent = lobby.status === 'waiting' ? 'En attente du lancement' : 'Soirée terminée';
    if (btn) btn.style.display = lobby.status === 'finished' ? 'none' : '';
  }
}

export function renderWaitingRoom(lobby, user) {
  if (!lobby) return;
  const title = document.querySelector('#screen-waiting .waiting-title');
  const count = document.getElementById('waiting-count');
  const grid = document.getElementById('participants-grid');
  const codeEl = document.querySelector('#screen-waiting .invite-code-sm');
  const readyStatus = document.getElementById('ready-status');
  const readyBtn = document.getElementById('waiting-ready-btn');
  const startBtn = document.getElementById('waiting-start-btn');

  if (title) title.textContent = lobby.name;
  if (count) count.textContent = `${lobby.memberIds.length} / ${lobby.maxPlayers} participants connectés`;
  if (codeEl) codeEl.textContent = lobby.code;

  const members = getLobbyMembers(lobby);
  if (grid) {
    grid.innerHTML = members
      .map((m, i) => {
        const ready = lobby.ready[m.id];
        return `<div class="participant" style="--delay:${0.05 * (i + 1)}s">
          <div class="participant-avatar${ready ? ' ready' : ''}" style="background:${AVATAR_BGS[i % AVATAR_BGS.length]}">${m.avatar}
            ${ready ? '<div class="participant-ready-dot"></div>' : ''}
          </div>
          <div class="participant-name">${m.id === user?.id ? 'Toi' : escapeHtml(m.pseudo)}</div>
        </div>`;
      })
      .join('');
  }

  const readyCount = members.filter((m) => lobby.ready[m.id]).length;
  const allReady = members.length > 0 && readyCount === members.length;
  const userIsAdmin = isAdmin(lobby, user?.id);

  if (readyBtn && user) {
    const isReady = !!lobby.ready[user.id];
    readyBtn.textContent = isReady ? 'Annuler prêt' : '✅ Je suis prêt !';
    readyBtn.classList.toggle('btn-secondary', isReady);
    readyBtn.classList.toggle('btn-primary', !isReady);
  }

  if (startBtn) {
    const showStart = userIsAdmin && lobby.status === 'waiting';
    startBtn.hidden = !showStart;
    startBtn.disabled = !allReady;
    startBtn.classList.toggle('waiting-start-btn--disabled', showStart && !allReady);
  }

  if (readyStatus) {
    if (userIsAdmin && lobby.status === 'waiting') {
      readyStatus.textContent = allReady
        ? `${readyCount} / ${members.length} prêts · Lance la soirée !`
        : `${readyCount} / ${members.length} prêts · En attente des joueurs`;
    } else {
      readyStatus.textContent = `${readyCount} / ${members.length} prêts · ${
        allReady ? "L'admin va démarrer…" : 'En attente des autres joueurs'
      }`;
    }
  }

  renderChat(lobby);
}

export function renderChat(lobby) {
  const box = document.getElementById('chat-msgs');
  if (!box) return;
  const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
  box.innerHTML = lobby.chat
    .map(
      (m) => `<div class="chat-msg">
        <div class="chat-sender">${escapeHtml(m.pseudo)}</div>
        <div class="chat-text">${escapeHtml(m.text)}</div>
      </div>`
    )
    .join('');
  if (chatScrollForce || wasNearBottom) {
    box.scrollTop = box.scrollHeight;
    chatScrollForce = false;
  }
}

export function renderVoteScreen(lobby, user) {
  if (!lobby) return;
  const perf = getCurrentPerformance(lobby);
  const perfNum = document.getElementById('vote-performance-num');
  const lobbyName = document.getElementById('vote-lobby-name');
  const membersEl = document.getElementById('lobby-members');
  const section = document.getElementById('vote-section');
  const demoBtn = document.getElementById('reveal-demo-btn');

  if (perfNum && perf) {
    perfNum.textContent = `PRESTATION ${lobby.currentPerformanceIndex + 1} / ${lobby.performances.length}`;
  }
  if (lobbyName) lobbyName.textContent = lobby.name;

  if (perf) {
    const meta = getCountryByCode(perf.code);
    const display = meta ? { ...perf, ...meta } : perf;
    applyPerformanceFlag(document.getElementById('country-flag'), display, {
      width: 80,
      className: 'flag-icon flag-icon--lg',
    });
    setText('country-name', display.country);
    setText('artist-name', display.artist);
    setText('song-name', `♪ ${display.song}`);
  }

  const members = getLobbyMembers(lobby);
  if (membersEl) {
    const shown = members.slice(0, 4);
    let html = shown.map((m) => `<div class="member-dot">${m.avatar}</div>`).join('');
    if (members.length > 4) {
      html += `<div class="member-dot" style="background:rgba(224,64,251,0.3);font-size:10px;font-weight:700">+${members.length - 4}</div>`;
    }
    membersEl.innerHTML = html;
  }

  const open = isVoteOpen(lobby);
  if (section) section.classList.toggle('vote-locked', !open);
  if (demoBtn) demoBtn.style.display = lobby.dramaticReveal ? 'none' : '';

  const myVote = perf && lobby.votes.find((v) => v.performanceId === perf.id && v.userId === user?.id);
  const confirmed = document.getElementById('vote-confirmed');
  const hasVote = !!myVote;
  if (confirmed) {
    const showConfirmed = confirmed.classList.contains('show');
    if (showConfirmed !== hasVote) confirmed.classList.toggle('show', hasVote);
  }
  document.querySelectorAll('.vote-btn').forEach((btn) => {
    const val = Number(btn.dataset.score);
    const shouldSelect = !!(myVote && myVote.score === val);
    const isSelected = btn.classList.contains('selected');
    if (isSelected !== shouldSelect) btn.classList.toggle('selected', shouldSelect);
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

export function renderReveal(lobby) {
  const list = document.getElementById('vote-reveal-list');
  const avgEl = document.getElementById('avg-animated');
  const subEl = document.getElementById('reveal-sub');
  const overlayActive = document.getElementById('reveal-overlay')?.classList.contains('active');
  if (!list || !lobby) return;

  const perf = getCurrentPerformance(lobby);
  if (!perf) return;

  const votes = getPerformanceVotes(lobby, perf.id);
  const voteByUser = Object.fromEntries(votes.map((v) => [v.userId, v]));
  const memberById = Object.fromEntries(getLobbyMembers(lobby).map((m) => [m.id, m]));
  const members = (lobby.memberIds || []).map((id) => memberById[id]).filter(Boolean);
  const avg = computeAverage(votes);

  if (subEl) {
    const voteLabel = votes.length > 1 ? 'votes' : 'vote';
    subEl.innerHTML = `${flagImgHtml(perf, { width: 24, className: 'flag-icon flag-icon--inline' })} ${escapeHtml(perf.country)} · ${votes.length}/${members.length} ${voteLabel}`;
  }

  if (members.length === 0) {
    list.innerHTML = '<p class="reveal-empty">Aucun membre dans le lobby.</p>';
  } else {
    list.innerHTML = members
      .map((m, i) => {
        const v = voteByUser[m.id];
        const delay = 0.1 + i * 0.15;
        if (!v) {
          return `<div class="vote-reveal-item vote-reveal-item--pending" style="animation-delay:${delay}s">
            <div class="reveal-user">
              <div class="reveal-avatar">${m.avatar || '?'}</div>
              <div class="reveal-name">${escapeHtml(m.pseudo)}</div>
            </div>
            <div class="reveal-score pending">Pas voté</div>
          </div>`;
        }
        const cls = scoreClass(v.score);
        return `<div class="vote-reveal-item" style="animation-delay:${delay}s">
          <div class="reveal-user">
            <div class="reveal-avatar">${m.avatar || '?'}</div>
            <div class="reveal-name">${escapeHtml(m.pseudo)}</div>
          </div>
          <div class="reveal-score ${cls}">${formatScore(v.score)}</div>
        </div>`;
      })
      .join('');
  }

  if (avgEl) {
    if (!votes.length) avgEl.textContent = '—';
    else if (overlayActive) animateCounter(avgEl, avg);
    else avgEl.textContent = formatAvg(avg);
  }
}

function animateCounter(el, target) {
  const duration = 800;
  const start = performance.now();
  const from = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const val = from + (target - from) * t;
    el.textContent = formatAvg(val);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = formatAvg(target);
  };
  requestAnimationFrame(step);
}

function predictionMatchesCountry(predictionText, perf) {
  if (!predictionText || !perf) return false;
  const p = predictionText.toLowerCase().trim();
  const country = (perf.country || '').toLowerCase();
  const artist = (perf.artist || '').toLowerCase();
  const code = (perf.code || '').toLowerCase();
  return (
    (country && (p.includes(country) || country.includes(p))) ||
    (artist && (p.includes(artist) || artist.includes(p))) ||
    (code && p === code)
  );
}

export function renderResults(lobby, user) {
  if (!lobby) return;
  const perf = getCurrentPerformance(lobby);
  if (!perf) return;

  const votes = getPerformanceVotes(lobby, perf.id);
  const members = getLobbyMembers(lobby);
  const avg = computeAverage(votes);
  const dist = computeDistribution(votes);
  const { min, max } = getMinMaxVoters(votes, members);

  const memberCount = getLobbyMemberCount(lobby);
  const resultsMeta = document.getElementById('results-lobby-meta');
  if (resultsMeta) {
    resultsMeta.textContent = `${lobby.name || 'Lobby'} · ${memberCount} participant${memberCount > 1 ? 's' : ''}`;
  }

  const resultsTitle = document.getElementById('results-title');
  if (resultsTitle) {
    resultsTitle.innerHTML = `${flagImgHtml(perf, { width: 40, className: 'flag-icon flag-icon--inline' })} ${escapeHtml(perf.country)}`;
  }
  const resultsScoreFlag = document.getElementById('results-score-flag');
  if (resultsScoreFlag) applyPerformanceFlag(resultsScoreFlag, perf, { width: 56, className: 'flag-icon flag-icon--score' });
  setText('results-score-big', formatAvg(avg));
  setText('results-best-score', max ? `${formatScore(max.score)} ${max.member?.avatar || ''}` : '—');
  setText('results-best-name', max?.member?.pseudo || '—');
  setText('results-worst-score', min ? `${formatScore(min.score)} ${min.member?.avatar || ''}` : '—');
  setText('results-worst-name', min?.member?.pseudo || '—');

  const distEl = document.getElementById('vote-dist-bars');
  if (distEl) {
    const maxCount = Math.max(1, ...SCORES.map((s) => dist[s]));
    distEl.innerHTML = SCORES.slice()
      .reverse()
      .map((s) => {
        const count = dist[s];
        const pct = (count / maxCount) * 100;
        const bg =
          s > 0 ? 'var(--green)' : s < 0 ? 'var(--red)' : 'var(--muted2)';
        return `<div class="dist-bar-row">
          <div class="dist-label">${formatScore(s)}</div>
          <div class="dist-bar"><div class="dist-fill" style="width:${pct}%;background:${bg}"></div></div>
          <div class="dist-count">${count}</div>
        </div>`;
      })
      .join('');
  }

  const ranking = computePerformanceRanking(lobby);
  const list = document.getElementById('results-ranking');
  const progress = document.getElementById('results-progress');
  const isLastPerformance =
    lobby.currentPerformanceIndex >= lobby.performances.length - 1;
  const showPrediction = isLastPerformance || lobby.status === 'finished';
  const predictionBlock = document.getElementById('prediction-block');
  const predictionInput = document.getElementById('prediction-input');
  if (predictionBlock) {
    predictionBlock.style.display = showPrediction && user ? '' : 'none';
  }
  if (predictionInput && user) {
    const saved = getUserPrediction(lobby, user.id);
    if (document.activeElement !== predictionInput) {
      predictionInput.value = saved;
    }
  }
  const nextBtn = document.getElementById('results-next-btn');
  if (nextBtn) {
    nextBtn.textContent = isLastPerformance
      ? '🏆 Classement final'
      : '→ Prestation suivante';
  }
  if (progress) {
    progress.textContent = `${lobby.currentPerformanceIndex + 1}/${lobby.performances.length} prestations · ${memberCount} joueurs`;
  }
  if (list) {
    list.innerHTML = ranking
      .slice(0, 10)
      .map((r, i) => {
        const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        const current = r.perf.id === perf.id ? ' ← maintenant' : '';
        const highlight =
          r.perf.id === perf.id ? ' style="border-color:var(--accent);background:rgba(224,64,251,0.06)"' : '';
        return `<div class="ranking-item"${highlight}>
          <div class="rank-num ${rankCls}">${i + 1}</div>
          <div class="rank-flag">${flagImgHtml(r.perf, { width: 64, className: 'flag-icon flag-icon--rank' })}</div>
          <div class="rank-country">${escapeHtml(r.perf.country)}${current}</div>
          <div class="rank-score">${formatAvg(r.avg)}</div>
        </div>`;
      })
      .join('');
  }
}

export function renderFinal(lobby, user) {
  if (!lobby) return;
  const members = getLobbyMembers(lobby);
  const ranking = computeFullPerformanceRanking(lobby);
  const stats = computeLobbyStats(lobby, members);

  const predictionText = getUserPrediction(lobby, user?.id);
  const predictionSection = document.getElementById('user-prediction-section');
  const predictionResultEl = document.getElementById('user-prediction-result');
  if (predictionSection) {
    if (predictionText) {
      predictionSection.style.display = '';
      setText('user-prediction-text', predictionText);
      const lobbyTop = ranking[0];
      if (predictionResultEl && lobbyTop) {
        if (predictionMatchesCountry(predictionText, lobbyTop.perf)) {
          predictionResultEl.textContent = `Bon pronostic ! Le lobby a couronn\u00e9 ${lobbyTop.perf.country}.`;
          predictionResultEl.className = 'user-prediction-result user-prediction-result--ok';
        } else {
          predictionResultEl.textContent = `Le lobby a couronn\u00e9 ${lobbyTop.perf.country}.`;
          predictionResultEl.className = 'user-prediction-result';
        }
      } else if (predictionResultEl) {
        predictionResultEl.textContent = '';
      }
    } else {
      predictionSection.style.display = 'none';
    }
  }

  const userPick = computeUserWinner(lobby, user?.id);
  const userSection = document.getElementById('user-winner-section');
  const agreeEl = document.getElementById('user-winner-agree');
  if (userSection) {
    if (userPick) {
      userSection.style.display = '';
      const meta = getCountryByCode(userPick.perf.code);
      const display = meta ? { ...userPick.perf, ...meta } : userPick.perf;
      applyPerformanceFlag(document.getElementById('user-winner-flag'), display, {
        width: 96,
        className: 'flag-icon flag-icon--lg',
      });
      setText('user-winner-country', display.country);
      setText('user-winner-artist', display.artist);
      setText('user-winner-song', `\u266a ${display.song}`);
      const scoreEl = document.getElementById('user-winner-your-score');
      if (scoreEl) {
        scoreEl.textContent = `Votre note : ${formatScore(userPick.score)}`;
        scoreEl.className = `user-winner-your-score ${scoreClass(userPick.score)}`;
      }
      const lobbyTop = ranking[0];
      if (agreeEl) {
        agreeEl.style.display =
          lobbyTop && lobbyTop.perf.id === userPick.perf.id ? 'block' : 'none';
      }
    } else {
      userSection.style.display = 'none';
      if (agreeEl) agreeEl.style.display = 'none';
    }
  }

  setText('stat-popular', stats.popular ? `${stats.popular.member.pseudo} ${stats.popular.member.avatar}` : '—');
  setText('stat-severe', stats.severe ? `${stats.severe.member.pseudo} ${stats.severe.member.avatar}` : '—');
  setText('stat-generous', stats.generous ? `${stats.generous.member.pseudo} ${stats.generous.member.avatar}` : '—');
  setText('stat-group-avg', `${formatAvg(stats.groupAvg)} / 3`);

  const metaEl = document.getElementById('final-ranking-meta');
  if (metaEl) {
    metaEl.textContent = `${lobby.performances.length} prestations · ${getLobbyMemberCount(lobby)} membres`;
  }

  const hasAnyVotes = ranking.some((r) => r.votes.length > 0);
  const emptyEl = document.getElementById('final-ranking-empty');
  const podium = document.getElementById('podium-row');

  if (podium) {
    if (ranking.length >= 3) {
      const top3 = [ranking[1], ranking[0], ranking[2]];
      const blocks = ['podium-2', 'podium-1', 'podium-3'];
      const delays = ['0.3s', '0.1s', '0.5s'];
      const places = ['2', '1', '3'];
      podium.innerHTML = top3
        .map(
          (r, i) => `<div class="podium-item">
          <div class="podium-flag" style="--delay:${delays[i]}">${flagImgHtml(r.perf, { width: 96, className: 'flag-icon flag-icon--podium' })}</div>
          <div class="podium-country">${escapeHtml(r.perf.country)}</div>
          <div class="podium-score">${formatAvg(r.avg)}</div>
          <div class="podium-block ${blocks[i]}">${places[i]}</div>
        </div>`
        )
        .join('');
      if (emptyEl) emptyEl.style.display = hasAnyVotes ? 'none' : '';
    } else if (ranking.length > 0) {
      podium.innerHTML = ranking
        .map(
          (r, i) => `<div class="podium-item podium-item--compact">
            <div class="podium-flag">${flagImgHtml(r.perf, { width: 72, className: 'flag-icon flag-icon--podium' })}</div>
            <div class="podium-country">${escapeHtml(r.perf.country)}</div>
            <div class="podium-score">${formatAvg(r.avg)}</div>
            <div class="podium-block podium-${i + 1}">${i + 1}</div>
          </div>`
        )
        .join('');
      if (emptyEl) emptyEl.style.display = hasAnyVotes ? 'none' : '';
    } else {
      podium.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
    }
  }

  const compact = document.getElementById('final-ranking-compact');
  const compactHeader = document.querySelector('.final-compact-header');
  if (compactHeader) {
    compactHeader.style.display = ranking.length ? '' : 'none';
  }
  if (compact) {
    compact.innerHTML = ranking
      .slice(0, 10)
      .map((r, i) => {
        const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        return `<div class="ranking-item">
          <div class="rank-num ${rankCls}">${i + 1}</div>
          <div class="rank-flag">${flagImgHtml(r.perf, { width: 64, className: 'flag-icon flag-icon--rank' })}</div>
          <div class="rank-country">${escapeHtml(r.perf.country)}</div>
          <div class="rank-score">${formatAvg(r.avg)}</div>
        </div>`;
      })
      .join('');
  }
}

export function renderAdmin(lobby, user) {
  if (!lobby) return;
  const perf = getCurrentPerformance(lobby);
  const list = document.getElementById('admin-perf-list');
  const flag = document.getElementById('admin-perf-flag');
  const name = document.getElementById('admin-perf-name');
  const sub = document.getElementById('admin-perf-sub');

  if (perf && flag) applyPerformanceFlag(flag, perf, { width: 48, className: 'flag-icon flag-icon--admin' });
  if (perf && name) name.textContent = perf.country;
  if (perf && sub) {
    sub.textContent = `${perf.artist} · Prestation ${lobby.currentPerformanceIndex + 1}/${lobby.performances.length}`;
  }

  if (list) {
    list.innerHTML = lobby.performances
      .map((p, i) => {
        const done = i < lobby.currentPerformanceIndex;
        const current = i === lobby.currentPerformanceIndex;
        const order = done
          ? '<div class="admin-perf-order" style="background:rgba(255,215,64,0.15);color:var(--gold)">✓</div>'
          : current
            ? '<div class="admin-perf-order" style="background:rgba(224,64,251,0.2);color:var(--accent)">▶</div>'
            : `<div class="admin-perf-order">${i + 1}</div>`;
        return `<div class="admin-perf-item${current ? ' current' : ''}">
          ${order}
          <div class="admin-perf-flag-wrap">${flagImgHtml(p, { width: 40, className: 'flag-icon flag-icon--admin-sm' })}</div>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:600">${escapeHtml(p.country)}</div>
            <div style="font-size:12px;color:var(--muted)">${escapeHtml(p.artist)}${current ? ' · EN COURS' : ''}</div>
          </div>
        </div>`;
      })
      .join('');
  }
}

export function renderCreatePreview(code) {
  const el = document.getElementById('create-invite-code');
  if (el) el.textContent = code || '······';
}

export { REVEAL_THRESHOLD };

