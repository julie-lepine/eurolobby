import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatAvg, formatScore, getCountryByCode } from './utils.js';
import { getLobbyMembers, getLobbyMemberCount, getUserPrediction } from './lobby.js';
import {
  computeFullPerformanceRanking,
  computeLobbyStats,
  computeUserWinner,
  getUserVote,
} from './vote-engine.js';

const MARGIN = 16;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Palette alignée sur style.css (:root) */
const C = {
  bg: [10, 10, 18],
  bg2: [16, 16, 42],
  card: [26, 26, 46],
  card2: [31, 31, 56],
  text: [240, 240, 255],
  muted: [128, 128, 160],
  muted2: [90, 90, 120],
  accent: [224, 64, 251],
  accent2: [124, 77, 255],
  gold: [255, 215, 64],
  silver: [176, 190, 197],
  bronze: [161, 136, 127],
  green: [105, 240, 174],
  red: [255, 82, 82],
  page: [252, 252, 255],
  border: [220, 220, 235],
};

const FONT_URLS = {
  syneBold:
    'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/syne/static/Syne-Bold.ttf',
  dmRegular:
    'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/dmsans/static/DMSans-Regular.ttf',
  dmBold:
    'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/dmsans/static/DMSans-Bold.ttf',
};

let fontCache = null;

function pdfText(str) {
  if (str == null) return '';
  return String(str)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tableEndY(doc, fallbackY) {
  return doc.lastAutoTable?.finalY ?? fallbackY;
}

function formatReportDate(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function perfLabel(perf) {
  const meta = getCountryByCode(perf.code);
  return pdfText(meta?.country || perf.country || perf.code || '—');
}

function scoreFillColor(score) {
  if (score == null || score === '—') return null;
  const n = Number(String(score).replace('+', ''));
  if (Number.isNaN(n)) return null;
  if (n >= 2) return [210, 250, 230];
  if (n > 0) return [230, 248, 238];
  if (n === 0) return [245, 245, 250];
  if (n >= -1) return [255, 228, 228];
  return [255, 205, 205];
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function fetchFontBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${url}`);
  return arrayBufferToBase64(await res.arrayBuffer());
}

async function ensurePdfFonts(doc) {
  if (fontCache?.loaded) return fontCache;
  try {
    const [syne, dm, dmBold] = await Promise.all([
      fetchFontBase64(FONT_URLS.syneBold),
      fetchFontBase64(FONT_URLS.dmRegular),
      fetchFontBase64(FONT_URLS.dmBold),
    ]);
    doc.addFileToVFS('Syne-Bold.ttf', syne);
    doc.addFont('Syne-Bold.ttf', 'Syne', 'bold');
    doc.addFileToVFS('DMSans-Regular.ttf', dm);
    doc.addFont('DMSans-Regular.ttf', 'DM Sans', 'normal');
    doc.addFileToVFS('DMSans-Bold.ttf', dmBold);
    doc.addFont('DMSans-Bold.ttf', 'DM Sans', 'bold');
    fontCache = { loaded: true, display: 'Syne', body: 'DM Sans' };
  } catch (e) {
    console.warn('PDF fonts: fallback helvetica', e);
    fontCache = { loaded: true, display: 'helvetica', body: 'helvetica' };
  }
  return fontCache;
}

function setDisplayFont(doc, style = 'bold', size = 12) {
  const f = fontCache?.display || 'helvetica';
  doc.setFont(f, style === 'bold' ? 'bold' : 'normal');
  doc.setFontSize(size);
}

function setBodyFont(doc, style = 'normal', size = 10) {
  const f = fontCache?.body || 'helvetica';
  const weight = style === 'bold' ? 'bold' : 'normal';
  if (f === 'helvetica') {
    doc.setFont('helvetica', weight);
  } else {
    doc.setFont(f, weight);
  }
  doc.setFontSize(size);
}

function pageHeight(doc) {
  return doc.internal.pageSize.getHeight();
}

function ensureSpace(doc, y, need = 24) {
  if (y + need > pageHeight(doc) - 18) {
    doc.addPage();
    paintPageBackground(doc);
    return MARGIN + 6;
  }
  return y;
}

function paintPageBackground(doc) {
  doc.setFillColor(...C.page);
  doc.rect(0, 0, PAGE_W, pageHeight(doc), 'F');
}

function drawAccentBar(doc, y, h = 2.5) {
  const w = CONTENT_W / 2;
  doc.setFillColor(...C.accent);
  doc.rect(MARGIN, y, w, h, 'F');
  doc.setFillColor(...C.accent2);
  doc.rect(MARGIN + w, y, w, h, 'F');
}

function drawCoverHeader(doc, data) {
  const headerH = 52;
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, PAGE_W, headerH, 'F');

  doc.setFillColor(...C.accent2);
  doc.rect(0, headerH - 3, PAGE_W / 2, 3, 'F');
  doc.setFillColor(...C.accent);
  doc.rect(PAGE_W / 2, headerH - 3, PAGE_W / 2, 3, 'F');

  setDisplayFont(doc, 'bold', 26);
  doc.setTextColor(...C.text);
  doc.text('EuroLobby', MARGIN, 18);

  setDisplayFont(doc, 'bold', 14);
  doc.setTextColor(...C.gold);
  doc.text('Rapport Eurovision 2027', MARGIN, 28);

  setBodyFont(doc, 'normal', 10);
  doc.setTextColor(...C.muted);
  doc.text(
    pdfText(`${data.lobbyName}  ·  Code ${data.lobbyCode}`),
    MARGIN,
    37
  );
  doc.text(data.date, MARGIN, 43);

  setBodyFont(doc, 'normal', 9);
  doc.text(
    `${data.memberCount} participants  ·  ${data.performanceCount} prestations  ·  ${data.voteCount} votes`,
    MARGIN,
    49
  );

  doc.setTextColor(0, 0, 0);
  return headerH + 10;
}

function drawInfoCard(doc, y, title, lines) {
  y = ensureSpace(doc, y, 22 + lines.length * 6);
  const cardH = 10 + lines.length * 5.5;
  doc.setFillColor(...C.card);
  doc.setDrawColor(...C.accent2);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 3, 3, 'FD');

  setDisplayFont(doc, 'bold', 9);
  doc.setTextColor(...C.accent);
  doc.text(title.toUpperCase(), MARGIN + 5, y + 6);

  setBodyFont(doc, 'normal', 9.5);
  doc.setTextColor(...C.text);
  lines.forEach((line, i) => {
    doc.text(pdfText(line), MARGIN + 5, y + 12 + i * 5.5);
  });

  doc.setTextColor(0, 0, 0);
  return y + cardH + 8;
}

function drawWinnerHighlight(doc, y, winner) {
  if (!winner) return y;
  const w = winner.perf;
  const meta = getCountryByCode(w.code) || w;
  return drawInfoCard(doc, y, 'Vainqueur du lobby', [
    `${meta.country}  —  moyenne ${formatAvg(winner.avg)}`,
    `${meta.artist || '—'}  ·  ${meta.song || '—'}`,
  ]);
}

function drawUserCard(doc, y, data) {
  if (!data.user) return y;
  const lines = [`Joueur : ${data.user.pseudo}`];
  if (data.prediction) lines.push(`Pronostic : ${data.prediction}`);
  if (data.userWinner) {
    const p = data.userWinner.perf;
    const meta = getCountryByCode(p.code) || p;
    lines.push(
      `Meilleure note : ${meta.country} (${formatScore(data.userWinner.score)})`
    );
  }
  return drawInfoCard(doc, y, 'Votre session', lines);
}

function sectionTitle(doc, title, y) {
  y = ensureSpace(doc, y, 18);
  drawAccentBar(doc, y, 1.5);
  y += 5;
  setDisplayFont(doc, 'bold', 13);
  doc.setTextColor(...C.bg);
  doc.text(title, MARGIN, y);
  doc.setTextColor(0, 0, 0);
  return y + 8;
}

function baseTableOpts(y) {
  return {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      font: fontCache?.body || 'helvetica',
      fontSize: 9,
      cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
      lineColor: C.border,
      lineWidth: 0.15,
      textColor: C.bg,
    },
    headStyles: {
      font: fontCache?.display || 'helvetica',
      fontStyle: 'bold',
      fillColor: C.bg2,
      textColor: C.text,
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: [248, 248, 252] },
    bodyStyles: { fillColor: C.page },
  };
}

function podiumRowColor(rank) {
  if (rank === 1) return [255, 248, 220];
  if (rank === 2) return [242, 246, 248];
  if (rank === 3) return [248, 242, 238];
  return null;
}

function addPageFooters(doc) {
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    const footY = pageHeight(doc) - 10;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, footY - 4, PAGE_W - MARGIN, footY - 4);
    setBodyFont(doc, 'normal', 8);
    doc.setTextColor(...C.muted2);
    doc.text('EuroLobby — eurovision live voting', MARGIN, footY);
    doc.text(`${p} / ${total}`, PAGE_W - MARGIN, footY, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
}

export function buildLobbyReportData(lobby, user) {
  const members = getLobbyMembers(lobby);
  const memberCount = getLobbyMemberCount(lobby);
  const ranking = computeFullPerformanceRanking(lobby);
  const stats = computeLobbyStats(lobby, members);

  return {
    lobbyName: lobby.name || 'Lobby',
    lobbyCode: lobby.code || '',
    date: formatReportDate(lobby.finishedAt || lobby.createdAt),
    memberCount,
    performanceCount: lobby.performances?.length ?? 0,
    voteCount: lobby.votes?.length ?? 0,
    winner: ranking[0] || null,
    top3: ranking.slice(0, 3),
    ranking,
    stats,
    members,
    user: user ? { id: user.id, pseudo: user.pseudo, avatar: user.avatar } : null,
    userWinner: user ? computeUserWinner(lobby, user.id) : null,
    prediction: user ? getUserPrediction(lobby, user.id) : '',
  };
}

export function readExportOptions() {
  const on = (id, fallback) =>
    document.getElementById(id)?.classList.contains('on') ?? fallback;
  return {
    ranking: on('export-toggle-ranking', true),
    detailedVotes: on('export-toggle-votes', true),
    stats: on('export-toggle-stats', true),
    heatmap: on('export-toggle-heatmap', false),
  };
}

export async function exportLobbyPdf(lobby, user, options = {}) {
  const data = buildLobbyReportData(lobby, user);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await ensurePdfFonts(doc);

  paintPageBackground(doc);
  let y = drawCoverHeader(doc, data);

  y = drawWinnerHighlight(doc, y, data.winner);
  y = drawUserCard(doc, y, data);

  if (options.stats && data.stats) {
    y = sectionTitle(doc, 'Statistiques', y);
    const rows = [['Moyenne du groupe', `${formatAvg(data.stats.groupAvg)} / 3`]];
    if (data.stats.generous) {
      rows.push([
        'Le plus généreux',
        `${pdfText(data.stats.generous.member.pseudo)} (${formatAvg(data.stats.generous.avg)})`,
      ]);
    }
    if (data.stats.severe) {
      rows.push([
        'Le plus sévère',
        `${pdfText(data.stats.severe.member.pseudo)} (${formatAvg(data.stats.severe.avg)})`,
      ]);
    }
    if (data.stats.popular) {
      rows.push(['Goûts populaires', pdfText(data.stats.popular.member.pseudo)]);
    }
    autoTable(doc, {
      ...baseTableOpts(y),
      body: rows,
      theme: 'plain',
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 58, textColor: C.muted },
        1: { textColor: C.bg },
      },
    });
    y = tableEndY(doc, y) + 10;
  }

  if (data.top3.length) {
    y = sectionTitle(doc, 'Podium', y);
    autoTable(doc, {
      ...baseTableOpts(y),
      head: [['', 'Pays', 'Artiste', 'Moyenne']],
      body: data.top3.map((r, i) => {
        const medals = ['1', '2', '3'];
        return [
          medals[i],
          perfLabel(r.perf),
          pdfText(r.perf.artist || '—'),
          formatAvg(r.avg),
        ];
      }),
      theme: 'plain',
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 42 },
        3: { halign: 'right', fontStyle: 'bold', textColor: C.accent2 },
      },
      didParseCell: (hook) => {
        if (hook.section !== 'body' || hook.column.index !== 0) return;
        const fill = podiumRowColor(parseInt(hook.cell.raw, 10));
        if (fill) hook.cell.styles.fillColor = fill;
        const rank = parseInt(hook.cell.raw, 10);
        if (rank === 1) hook.cell.styles.textColor = [180, 140, 0];
        if (rank === 2) hook.cell.styles.textColor = [100, 115, 125];
        if (rank === 3) hook.cell.styles.textColor = [130, 100, 85];
      },
    });
    y = tableEndY(doc, y) + 10;
  }

  if (options.ranking && data.ranking.length) {
    y = sectionTitle(doc, 'Classement complet', y);
    autoTable(doc, {
      ...baseTableOpts(y),
      head: [['#', 'Pays', 'Artiste', 'Moyenne', 'Votes']],
      body: data.ranking.map((r, i) => [
        String(i + 1),
        perfLabel(r.perf),
        pdfText(r.perf.artist || '—'),
        formatAvg(r.avg),
        String(r.votes.length),
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: C.accent2,
        textColor: C.text,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        3: { halign: 'right', fontStyle: 'bold' },
        4: { halign: 'center', textColor: C.muted },
      },
      didParseCell: (hook) => {
        if (hook.section !== 'body' || hook.column.index !== 0) return;
        const rank = parseInt(hook.cell.raw, 10);
        const fill = podiumRowColor(rank);
        if (fill && rank <= 3) hook.cell.styles.fillColor = fill;
      },
    });
    y = tableEndY(doc, y) + 10;
  }

  const showVotes = options.detailedVotes || options.heatmap;
  if (showVotes && data.members.length && data.ranking.length) {
    y = sectionTitle(
      doc,
      options.heatmap ? 'Heatmap des votes' : 'Votes par participant',
      y
    );
    const head = [
      '#',
      'Pays',
      ...data.members.map((m) => pdfText((m.pseudo || '?').slice(0, 9))),
    ];
    const memberStartCol = 2;
    const body = data.ranking.map((r, i) => {
      const row = [String(i + 1), perfLabel(r.perf).slice(0, 16)];
      data.members.forEach((m) => {
        const v = getUserVote(lobby, r.perf.id, m.id);
        row.push(v ? formatScore(v.score) : '—');
      });
      return row;
    });

    autoTable(doc, {
      ...baseTableOpts(y),
      head: [head],
      body,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: {
        fillColor: C.bg,
        fontSize: 7,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 28 },
      },
      didParseCell: (hook) => {
        if (options.heatmap && hook.section === 'body' && hook.column.index >= memberStartCol) {
          const rgb = scoreFillColor(hook.cell.raw);
          if (rgb) hook.cell.styles.fillColor = rgb;
        }
      },
    });
  }

  addPageFooters(doc);

  const safeCode = (data.lobbyCode || 'lobby').replace(/[^\w-]+/g, '');
  const dateSlug = new Date().toISOString().slice(0, 10);
  doc.save(`eurolobby-${safeCode}-${dateSlug}.pdf`);
}
