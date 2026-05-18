import { SCORES, formatScore, scoreClass, getCountryByCode } from './utils.js';
import { isRecapVoteEditAllowed, submitVoteForPerformance } from './lobby.js';
import { getUserVote } from './vote-engine.js';
import { getCurrentLobby, getCurrentUser } from './store.js';

const dismissedRecapLobbyIds = new Set();
let recapOpen = false;
let expandedPerfId = null;
let recapLobbyRef = null;
let recapUserRef = null;

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function recapStorageKey(lobbyId) {
  return `eurolobby_recap_done_${lobbyId}`;
}

export function isRecapDismissed(lobbyId) {
  if (!lobbyId) return false;
  if (dismissedRecapLobbyIds.has(lobbyId)) return true;
  try {
    return sessionStorage.getItem(recapStorageKey(lobbyId)) === '1';
  } catch {
    return false;
  }
}

function markRecapDismissed(lobbyId) {
  if (!lobbyId) return;
  dismissedRecapLobbyIds.add(lobbyId);
  try {
    sessionStorage.setItem(recapStorageKey(lobbyId), '1');
  } catch {
    /* ignore */
  }
}

export function shouldOfferRecap(lobby, user) {
  if (!lobby || !user || recapOpen) return false;
  if (isRecapDismissed(lobby.id)) return false;
  if (!isRecapVoteEditAllowed(lobby)) return false;
  const n = lobby.performances?.length ?? 0;
  if (n === 0) return false;
  return lobby.currentPerformanceIndex >= n - 1;
}

function perfDisplay(perf) {
  const meta = getCountryByCode(perf.code);
  return meta ? { ...perf, ...meta } : perf;
}

function renderRecapList(lobby, user) {
  const list = document.getElementById('recap-modal-list');
  if (!list || !lobby || !user) return;

  const perfs = [...lobby.performances].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  list.innerHTML = perfs
    .map((perf, index) => {
      const display = perfDisplay(perf);
      const vote = getUserVote(lobby, perf.id, user.id);
      const score = vote?.score;
      const scoreLabel = score != null ? formatScore(score) : '—';
      const scoreCls = score != null ? scoreClass(score) : 'zero';
      const isExpanded = expandedPerfId === perf.id;
      const pid = escapeHtml(perf.id);
      const scoreBtns = SCORES.map((s) => {
        const cls = s < 0 ? 'neg' : s > 0 ? 'pos' : 'neutral';
        const selected = score === s ? ' selected' : '';
        return `<button type="button" class="recap-vote-btn vote-btn ${cls}${selected}" data-perf-id="${pid}" data-score="${s}" onclick="recapCastVote(this)">${formatScore(s)}</button>`;
      }).join('');

      return `<article class="recap-row${isExpanded ? ' recap-row--open' : ''}" data-perf-id="${pid}">
        <div class="recap-row-main">
          <span class="recap-order">${index + 1}</span>
          <div class="recap-meta">
            <div class="recap-artist">${escapeHtml(display.artist || '—')}</div>
            <div class="recap-song">♪ ${escapeHtml(display.song || '—')}</div>
            <div class="recap-country">${escapeHtml(display.country || '')}</div>
          </div>
          <button type="button" class="recap-score-pill ${scoreCls}" onclick="recapToggleEdit('${pid}')" aria-expanded="${isExpanded}">
            ${scoreLabel}
          </button>
        </div>
        <div class="recap-row-edit"${isExpanded ? '' : ' hidden'}>
          <div class="recap-vote-grid">${scoreBtns}</div>
        </div>
      </article>`;
    })
    .join('');
}

export function openRecapModal(lobby, user) {
  const modal = document.getElementById('recap-modal');
  if (!modal || !lobby || !user) return;

  recapOpen = true;
  recapLobbyRef = lobby;
  recapUserRef = user;
  expandedPerfId = null;
  renderRecapList(lobby, user);

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('recap-modal-continue')?.focus();
}

export function closeRecapModal(dismiss = false) {
  const modal = document.getElementById('recap-modal');
  if (!modal) return;

  recapOpen = false;
  expandedPerfId = null;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');

  if (dismiss && recapLobbyRef?.id) {
    markRecapDismissed(recapLobbyRef.id);
    window.dispatchEvent(new CustomEvent('eurolobby:recap-dismissed'));
  }

  recapLobbyRef = null;
  recapUserRef = null;
}

export function maybeOpenRecapModal(lobby, user) {
  if (!shouldOfferRecap(lobby, user)) return;
  const resultsActive = document.getElementById('screen-results')?.classList.contains('active');
  if (!resultsActive) return;
  requestAnimationFrame(() => openRecapModal(lobby, user));
}

export function recapToggleEdit(perfId) {
  if (!recapLobbyRef || !recapUserRef) return;
  expandedPerfId = expandedPerfId === perfId ? null : perfId;
  renderRecapList(recapLobbyRef, recapUserRef);
}

export async function recapCastVote(btn) {
  if (!btn || !recapLobbyRef || !recapUserRef) return;
  const perfId = btn.dataset.perfId;
  const score = Number(btn.dataset.score);
  if (!perfId || Number.isNaN(score)) return;

  const result = await submitVoteForPerformance(perfId, score);
  if (!result.ok) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = result.error || 'Vote refusé';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }
    return;
  }

  recapLobbyRef = result.lobby;
  renderRecapList(recapLobbyRef, recapUserRef);
  window.dispatchEvent(new CustomEvent('eurolobby:update'));
}

export function recapContinue() {
  closeRecapModal(true);
}

/** Rouvre le récap depuis le bloc pronostic (même après fermeture). */
export function reopenRecapModal() {
  const lobby = getCurrentLobby();
  const user = getCurrentUser();
  if (!lobby || !user) return;

  const n = lobby.performances?.length ?? 0;
  const onLastOrDone =
    lobby.status === 'finished' ||
    (n > 0 && lobby.currentPerformanceIndex >= n - 1);
  if (!onLastOrDone) return;

  openRecapModal(lobby, user);
}

export function bindRecapModal() {
  const modal = document.getElementById('recap-modal');
  if (!modal) return;

  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');

  document.getElementById('recap-modal-continue')?.addEventListener('click', recapContinue);
  document.getElementById('recap-modal-backdrop')?.addEventListener('click', () => {
    /* pas de fermeture par clic extérieur — validation explicite */
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      e.preventDefault();
    }
  });
}
