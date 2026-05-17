import { VOTE_DURATION, REVEAL_THRESHOLD } from './utils.js';
import {
  getSession,
  setSession,
  getCurrentUser,
  getCurrentLobby,
  getUserLobbies,
  isUsingRemote,
  hydrateLobby,
  refreshUserLobbies,
  setLobbyCache,
  applyLobbyNormalization,
} from './store.js';
import { signup, login, loginAsGuest, requireAuth, restoreSession, logout } from './auth.js';
import { subscribeToLobby, isRemoteMode } from './remote.js';
import { isSupabaseConfigured } from './supabase.js';
import {
  createLobby,
  joinLobby,
  setReady,
  startPerformance,
  stopTimer,
  nextPerformance,
  resetLobby,
  submitVote,
  setRevealed,
  sendChatMessage,
  getRemainingSeconds,
  isVoteOpen,
  isAdmin,
  getCurrentPerformance,
  getLobbyMembers,
  deleteLobby,
} from './lobby.js';
import { renderAll, renderReveal, renderCreatePreview } from './render.js';

const BOTTOM_NAV_SCREENS = [
  'screen-dashboard',
  'screen-vote',
  'screen-results',
  'screen-final',
  'screen-admin',
  'screen-waiting',
];

let timerInterval = null;
let revealTriggered = false;
let selectedVote = null;
let unsubscribeLobby = null;
let confirmResolve = null;

function getLobby() {
  return getCurrentLobby();
}

function syncScreenFromLobby(lobby) {
  if (!lobby) return;
  const active = document.querySelector('.screen.active');
  if (!active) return;
  if (lobby.status === 'live' && active.id === 'screen-waiting') {
    goTo('screen-vote');
  }
  if (lobby.status === 'finished' && (active.id === 'screen-vote' || active.id === 'screen-waiting')) {
    goTo('screen-final');
  }
}

async function refresh() {
  const user = getCurrentUser();
  if (isUsingRemote() && user?.id) {
    await refreshUserLobbies(user.id);
  }
  let lobby = getLobby();
  if (lobby) {
    lobby = await applyLobbyNormalization(lobby);
  }
  renderAll(lobby, user);
  syncTimerFromLobby(lobby);
  syncScreenFromLobby(lobby);
}

function setupLobbyRealtime(lobbyId) {
  if (unsubscribeLobby) {
    unsubscribeLobby();
    unsubscribeLobby = null;
  }
  if (!isRemoteMode() || !lobbyId) return;
  unsubscribeLobby = subscribeToLobby(
    lobbyId,
    async (lobby) => {
      await applyLobbyNormalization(lobby);
      const current = getLobby();
      const user = getCurrentUser();
      renderAll(current, user);
      syncTimerFromLobby(current);
      syncScreenFromLobby(current);
    },
    () => {
      const session = getSession();
      if (session?.lobbyId !== lobbyId) return;
      setSession({ ...session, lobbyId: null });
      setLobbyCache(null);
      if (unsubscribeLobby) {
        unsubscribeLobby();
        unsubscribeLobby = null;
      }
      showToast('Ce lobby a été supprimé.');
      goTo('screen-dashboard');
      refresh();
    }
  );
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function closeConfirm(result) {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
}

function showConfirm({
  title = 'Confirmer',
  message = '',
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn) {
      resolve(false);
      return;
    }
    confirmResolve = resolve;
    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    okBtn.focus();
  });
}

function showAuthError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

export function handleDashAction(action) {
  const lobby = getLobby();
  const user = getCurrentUser();

  switch (action) {
    case 'create':
      goTo('screen-create');
      return;
    case 'join':
      goTo('screen-join');
      return;
    case 'vote':
      if (!lobby) {
        showToast('Rejoins ou crée un lobby pour voter.');
        goTo('screen-join');
        return;
      }
      if (lobby.status === 'live') {
        enterLobbyVote(lobby.id);
        return;
      }
      if (lobby.status === 'waiting') {
        enterLobbyWaiting(lobby.id);
        showToast('En attente du lancement par l\'admin.');
        return;
      }
      goTo('screen-final');
      return;
    case 'results':
      if (!lobby) {
        showToast('Rejoins ou crée un lobby pour voir les résultats.');
        return;
      }
      if (lobby.status === 'live') {
        goTo('screen-results');
        return;
      }
      if (lobby.status === 'finished') {
        goTo('screen-final');
        return;
      }
      showToast('La soirée n\'a pas encore commencé.');
      return;
    case 'admin':
      if (!lobby) {
        showToast('Rejoins ou crée un lobby d\'abord.');
        return;
      }
      if (!isAdmin(lobby, user?.id)) {
        showToast('Réservé à l\'admin du lobby.');
        return;
      }
      goTo('screen-admin');
      return;
    default:
      break;
  }
}

function bindDashboardActions() {
  document.querySelectorAll('[data-dash-action]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      handleDashAction(el.dataset.dashAction);
    });
  });
}

export function goTo(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (!target) return;

  target.classList.add('active');
  target.scrollTop = 0;
  target.querySelector('.results-body')?.scrollTo(0, 0);
  target.querySelector('.final-body')?.scrollTo(0, 0);

  const nav = document.getElementById('bottom-nav');
  if (nav) nav.style.display = BOTTOM_NAV_SCREENS.includes(id) ? 'flex' : 'none';

  syncBottomNav(id);
  revealTriggered = false;

  if (id === 'screen-final') initConfetti();
  if (id === 'screen-vote') {
    resetVoteUI();
    startTimerLoop();
  } else if (id !== 'screen-results') {
    hideReveal();
  }

  if (id === 'screen-dashboard' || id === 'screen-waiting' || id === 'screen-vote' || id === 'screen-results' || id === 'screen-final' || id === 'screen-admin') {
    refresh();
  }
}

function syncBottomNav(screenId) {
  const navMap = { 'screen-dashboard': 0, 'screen-vote': 1, 'screen-results': 2, 'screen-final': 3 };
  const index = navMap[screenId];
  document.querySelectorAll('.nav-item').forEach((item, i) => {
    item.classList.toggle('active', index !== undefined && i === index);
  });
}

export function navTo(screenId, el) {
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  el.classList.add('active');
  goTo(screenId);
}

export function selectAvatar(el) {
  document.querySelectorAll('.avatar-opt').forEach((a) => a.classList.remove('selected'));
  el.classList.add('selected');
}

export async function signupAndGo() {
  const pseudo = document.getElementById('pseudo-input')?.value;
  const email = document.getElementById('signup-email')?.value;
  const password = document.getElementById('signup-password')?.value;
  const avatar = document.querySelector('#screen-signup .avatar-opt.selected')?.textContent;
  const result = await signup({ pseudo, email, password, avatar });
  if (!result.ok) {
    showAuthError('signup-error', result.error);
    return;
  }
  showAuthError('signup-error', '');
  const msg = result.needsEmailConfirmation
    ? `Compte créé ! Confirme ton email (${email}) puis connecte-toi.`
    : `Bienvenue ${result.user.pseudo} !`;
  showToast(msg);
  if (isUsingRemote()) await refreshUserLobbies(result.user.id);
  if (!result.needsEmailConfirmation) goTo('screen-dashboard');
}

export async function loginAndGo() {
  const email = document.getElementById('login-email')?.value;
  const password = document.getElementById('login-password')?.value;
  const result = await login({ email, password });
  if (!result.ok) {
    showAuthError('login-error', result.error);
    return;
  }
  showAuthError('login-error', '');
  const session = getSession();
  if (isUsingRemote()) await refreshUserLobbies(result.user.id);
  const lobbies = getUserLobbies(result.user.id);
  if (session?.lobbyId || lobbies.length) {
    const lobby = lobbies.find((l) => l.id === session?.lobbyId) || lobbies[lobbies.length - 1];
    if (lobby) {
      setSession({ ...getSession(), lobbyId: lobby.id });
      await hydrateLobby(lobby.id);
      setupLobbyRealtime(lobby.id);
    }
  }
  showToast(`Content de te revoir, ${result.user.pseudo} !`);
  goTo('screen-dashboard');
}

export async function joinAsGuest() {
  const pseudo = document.getElementById('guest-pseudo')?.value;
  const avatar = document.querySelector('#screen-join .avatar-opt.selected')?.textContent || '🎤';
  const result = await loginAsGuest({ pseudo, avatar });
  if (!result.ok) {
    showAuthError('join-error', result.error);
    return;
  }
  await joinLobbyAndGo();
}

export function createLobbyAndGo() {
  const user = requireAuth();
  if (!user) {
    showToast('Connecte-toi d\'abord');
    goTo('screen-login');
    return;
  }
  const name = document.getElementById('lobby-name-input')?.value;
  const maxPlayers = document.getElementById('lobby-max-input')?.value;
  const isPrivate = document.getElementById('toggle-private')?.classList.contains('on');
  const dramaticReveal = document.getElementById('toggle-dramatic')?.classList.contains('on');

  createLobby({ name, maxPlayers, isPrivate, dramaticReveal }).then(async (result) => {
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    setupLobbyRealtime(result.lobby.id);
    if (isUsingRemote()) await refreshUserLobbies(getCurrentUser()?.id);
    renderCreatePreview(result.lobby.code);
    showToast(`Lobby créé ! Code : ${result.lobby.code}`);
    goTo('screen-waiting');
  });
}

export async function joinLobbyAndGo() {
  const code = document.getElementById('join-code-input')?.value;
  let user = requireAuth();
  if (!user) {
    const pseudo = document.getElementById('guest-pseudo')?.value;
    if (!pseudo?.trim()) {
      showAuthError('join-error', 'Pseudo requis pour rejoindre.');
      return;
    }
    const g = await loginAsGuest({ pseudo, avatar: '🎤' });
    if (!g.ok) {
      showAuthError('join-error', g.error);
      return;
    }
    user = g.user;
  }
  const result = await joinLobby(code);
  if (!result.ok) {
    showAuthError('join-error', result.error);
    return;
  }
  setupLobbyRealtime(result.lobby.id);
  if (isUsingRemote()) await refreshUserLobbies(user.id);
  showAuthError('join-error', '');
  showToast(`Bienvenue dans ${result.lobby.name} !`);
  goTo(result.lobby.status === 'live' ? 'screen-vote' : 'screen-waiting');
}

export async function deleteLobbyById(lobbyId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const user = getCurrentUser();
  if (!user?.id) {
    showToast('Connecte-toi pour supprimer un lobby.');
    return;
  }
  let lobby = getUserLobbies(user.id).find((l) => l.id === lobbyId);
  if (!lobby && isRemoteMode()) {
    await hydrateLobby(lobbyId);
    lobby = getCurrentLobby();
  }
  if (!lobby) {
    showToast('Lobby introuvable.');
    return;
  }
  const confirmed = await showConfirm({
    title: 'Supprimer le lobby ?',
    message: `Supprimer définitivement « ${lobby.name} » ? Cette action est irréversible.`,
    confirmText: 'Supprimer',
    cancelText: 'Annuler',
  });
  if (!confirmed) return;
  try {
    const result = await deleteLobby(lobbyId);
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    if (unsubscribeLobby) {
      unsubscribeLobby();
      unsubscribeLobby = null;
    }
    showToast(`Lobby « ${result.name} » supprimé.`);
    await refresh();
    goTo('screen-dashboard');
  } catch (err) {
    console.error('deleteLobby', err);
    showToast('Impossible de supprimer le lobby.');
  }
}

export async function enterLobbyWaiting(lobbyId) {
  setSession({ ...getSession(), lobbyId });
  await hydrateLobby(lobbyId);
  setupLobbyRealtime(lobbyId);
  goTo('screen-waiting');
}

export async function enterLobbyVote(lobbyId) {
  setSession({ ...getSession(), lobbyId });
  await hydrateLobby(lobbyId);
  setupLobbyRealtime(lobbyId);
  goTo('screen-vote');
}

export function toggleReady() {
  const lobby = getLobby();
  const user = getCurrentUser();
  if (!lobby || !user) return;
  const next = !lobby.ready[user.id];
  setReady(next);
  showToast(next ? 'Tu es prêt !' : 'Prêt annulé');
  refresh();
}

export function adminStart() {
  const lobby = getLobby();
  const user = getCurrentUser();
  if (!isAdmin(lobby, user?.id)) return showToast('Réservé à l\'admin');
  if (lobby?.status !== 'waiting') return showToast('La partie est déjà lancée');
  const members = getLobbyMembers(lobby);
  const readyCount = members.filter((m) => lobby.ready[m.id]).length;
  if (readyCount < members.length) {
    return showToast(`Encore ${members.length - readyCount} joueur(s) pas prêt(s)`);
  }
  startPerformance();
  showToast('C\'est parti ! Bonne soirée Eurovision 🎤');
  goTo('screen-vote');
}

export function adminStop() {
  const lobby = getLobby();
  const user = getCurrentUser();
  if (!isAdmin(lobby, user?.id)) return;
  stopTimer();
  showToast('Timer stoppé');
  refresh();
}

export function adminNext() {
  const lobby = getLobby();
  const user = getCurrentUser();
  if (!isAdmin(lobby, user?.id)) return;
  const updated = nextPerformance();
  if (updated?.status === 'finished') {
    showToast('Soirée terminée !');
    goTo('screen-final');
  } else {
    showToast('Prestation suivante !');
    hideReveal();
    goTo('screen-vote');
  }
}

export function adminReset() {
  const lobby = getLobby();
  const user = getCurrentUser();
  if (!isAdmin(lobby, user?.id)) return;
  if (!confirm('Réinitialiser toute la session ?')) return;
  resetLobby();
  showToast('Session réinitialisée');
  goTo('screen-waiting');
}

export function resultsNext() {
  const lobby = getLobby();
  const user = getCurrentUser();
  if (isAdmin(lobby, user?.id)) {
    adminNext();
  } else {
    goTo('screen-vote');
  }
}

function resetVoteUI() {
  selectedVote = null;
  document.querySelectorAll('.vote-btn').forEach((b) => b.classList.remove('selected'));
  document.getElementById('vote-confirmed')?.classList.remove('show');
}

export function castVote(el, val) {
  const lobby = getLobby();
  if (!isVoteOpen(lobby)) {
    showToast('Le vote est fermé');
    return;
  }
  if (lobby.dramaticReveal && getRemainingSeconds(lobby) <= REVEAL_THRESHOLD && !lobby.revealed) {
    showToast('Révélation imminente — vote fermé');
    return;
  }

  const result = submitVote(val);
  if (result?.ok === false) {
    showToast(result.error || 'Vote refusé');
    return;
  }
  document.querySelectorAll('.vote-btn').forEach((b) => b.classList.remove('selected'));
  el.classList.add('selected');
  selectedVote = val;
  setTimeout(() => document.getElementById('vote-confirmed')?.classList.add('show'), 300);
  showToast('Vote enregistré');
  refresh();
}

export function showReveal() {
  setRevealed();
  document.getElementById('reveal-overlay')?.classList.add('active');
  renderReveal(getLobby());
  refresh();
}

export function hideReveal() {
  document.getElementById('reveal-overlay')?.classList.remove('active');
}

function startTimerLoop() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const lobby = getLobby();
    if (!lobby) return;
    const secs = getRemainingSeconds(lobby);
    updateTimerDisplay(secs);

    if (lobby.dramaticReveal && secs <= REVEAL_THRESHOLD && secs > 0 && !lobby.revealed && !revealTriggered) {
      revealTriggered = true;
      showReveal();
    }

    if (secs === 0 && lobby.timerEndsAt) {
      if (!lobby.revealed) showReveal();
      clearInterval(timerInterval);
    }
  }, 250);
}

function syncTimerFromLobby(lobby) {
  if (!lobby?.timerEndsAt) return;
  updateTimerDisplay(getRemainingSeconds(lobby));
  if (!timerInterval) startTimerLoop();
}

function updateTimerDisplay(timerSecs) {
  const m = Math.floor(timerSecs / 60);
  const s = timerSecs % 60;
  const timeText = `${m}:${s.toString().padStart(2, '0')}`;
  const pct = (timerSecs / VOTE_DURATION) * 100;

  [
    { el: document.getElementById('vote-timer-value'), fill: document.getElementById('progress-fill') },
    { el: document.getElementById('admin-timer-display'), fill: document.getElementById('admin-progress-fill') },
  ].forEach(({ el, fill }) => {
    if (!el || !fill) return;
    el.textContent = timeText;
    fill.style.width = pct + '%';
    el.className = 'timer-value';
    fill.className = 'progress-fill';
    if (timerSecs <= REVEAL_THRESHOLD) {
      el.className += ' danger';
      fill.className += ' danger';
    } else if (timerSecs <= 30) {
      el.className += ' warning';
      fill.className += ' warning';
    }
  });
}

export async function copyInviteCode() {
  const code = document.querySelector('.invite-code-sm')?.textContent?.trim()
    || document.getElementById('create-invite-code')?.textContent?.trim();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showToast('Code copié !');
  } catch {
    showToast('Impossible de copier le code');
  }
}

export function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input?.value;
  if (!text?.trim()) return;
  sendChatMessage(text);
  if (input) input.value = '';
  refresh();
}

export function exportPdf() {
  showToast('Export PDF : branche jsPDF (Phase 5)');
}

export function shareResults() {
  const lobby = getLobby();
  if (!lobby) return;
  const url = `${location.origin}${location.pathname}?lobby=${lobby.code}`;
  navigator.clipboard.writeText(url).then(
    () => showToast('Lien copié !'),
    () => showToast('Partage : ' + url)
  );
}

export async function logoutUser() {
  if (unsubscribeLobby) {
    unsubscribeLobby();
    unsubscribeLobby = null;
  }
  await logout();
  showToast('Déconnecté');
  goTo('screen-home');
}

function initStars() {
  const container = document.getElementById('stars');
  if (!container || container.children.length) return;
  for (let i = 0; i < 60; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size = Math.random() * 2.5 + 0.5;
    star.style.cssText = `width:${size}px;height:${size}px;left:${Math.random() * 100}%;top:${Math.random() * 100}%;--d:${2 + Math.random() * 4}s;animation-delay:${Math.random() * 4}s;`;
    container.appendChild(star);
  }
}

function initConfetti() {
  const container = document.getElementById('confetti');
  if (!container || container.children.length > 0) return;
  const colors = ['#e040fb', '#7c4dff', '#ffd740', '#00e5cc', '#ff4081', '#69f0ae'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.cssText = `left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};--d:${1.5 + Math.random() * 2}s;--delay:${Math.random() * 2}s;width:${6 + Math.random() * 6}px;height:${6 + Math.random() * 6}px;border-radius:${Math.random() > 0.5 ? '50%' : '2px'};`;
    container.appendChild(p);
  }
}

function previewCreateCode() {
  renderCreatePreview('······');
}

function bindConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  modal?.classList.remove('active');
  modal?.setAttribute('aria-hidden', 'true');

  document.getElementById('confirm-modal-ok')?.addEventListener('click', () => closeConfirm(true));
  document.getElementById('confirm-modal-cancel')?.addEventListener('click', () => closeConfirm(false));
  document.getElementById('confirm-modal-backdrop')?.addEventListener('click', () => closeConfirm(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('confirm-modal')?.classList.contains('active')) {
      closeConfirm(false);
    }
  });
}

function bindEvents() {
  bindConfirmModal();
  bindDashboardActions();
  document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });
  document.getElementById('chat-send')?.addEventListener('click', sendChat);

  window.addEventListener('storage', (e) => {
    if (e.key === 'eurolobby_db') refresh();
  });
  window.addEventListener('eurolobby:update', refresh);

  setInterval(() => {
    const lobby = getLobby();
    if (lobby?.timerEndsAt) syncTimerFromLobby(lobby);
  }, 2000);

  const params = new URLSearchParams(location.search);
  const code = params.get('lobby');
  if (code) {
    const input = document.getElementById('join-code-input');
    if (input) input.value = code;
  }
}

function exposeGlobals() {
  const fns = {
    goTo, navTo, selectAvatar, signupAndGo, loginAndGo, joinAsGuest,
    createLobbyAndGo, joinLobbyAndGo, enterLobbyWaiting, enterLobbyVote,
    toggleReady, adminStart, adminStop, adminNext, adminReset, resultsNext,
    castVote, showReveal, hideReveal, copyInviteCode, sendChat, exportPdf,
    shareResults, logout: logoutUser, previewCreateCode, deleteLobbyById,
  };
  Object.assign(window, fns);
}

function navigateAfterRestore(lobby) {
  if (!lobby) {
    goTo('screen-dashboard');
    return;
  }
  if (lobby.status === 'live') goTo('screen-vote');
  else if (lobby.status === 'finished') goTo('screen-final');
  else goTo('screen-waiting');
}

async function initRemote() {
  if (!isSupabaseConfigured) return { user: null, lobby: null };

  const user = await restoreSession();
  const session = getSession();
  let lobby = null;

  if (user?.id) {
    await refreshUserLobbies(user.id);
    if (session?.lobbyId) {
      lobby = await hydrateLobby(session.lobbyId);
      if (lobby) setupLobbyRealtime(session.lobbyId);
    }
  }

  if (isRemoteMode()) {
    showToast('Mode en ligne — lobbys partagés');
  }

  return { user, lobby };
}

async function init() {
  initStars();
  bindEvents();
  exposeGlobals();
  previewCreateCode();

  const { user, lobby } = (await initRemote()) || { user: null, lobby: null };

  if (user) {
    await refresh();
    navigateAfterRestore(lobby || getLobby());
  }
}

init();
