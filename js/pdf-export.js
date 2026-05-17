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

const MARGIN = 14;

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
  if (n >= 2) return [105, 240, 174];
  if (n > 0) return [180, 240, 200];
  if (n === 0) return [220, 220, 220];
  if (n >= -1) return [255, 200, 200];
  return [255, 120, 120];
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

function ensureSpace(doc, y, need = 20) {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function sectionTitle(doc, title, y) {
  y = ensureSpace(doc, y, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 40);
  doc.text(title, MARGIN, y);
  doc.setTextColor(0, 0, 0);
  return y + 7;
}

export function exportLobbyPdf(lobby, user, options = {}) {
  const data = buildLobbyReportData(lobby, user);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('EuroLobby', MARGIN, y);
  y += 9;

  doc.setFontSize(15);
  doc.text('Rapport Eurovision 2027', MARGIN, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(
    pdfText(`${data.lobbyName}  ·  Code ${data.lobbyCode}  ·  ${data.date}`),
    MARGIN,
    y
  );
  y += 5;
  doc.text(
    `${data.memberCount} participants  ·  ${data.performanceCount} prestations  ·  ${data.voteCount} votes`,
    MARGIN,
    y
  );
  doc.setTextColor(0, 0, 0);
  y += 10;

  if (data.winner) {
    y = ensureSpace(doc, y, 14);
    const w = data.winner.perf;
    const meta = getCountryByCode(w.code) || w;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(
      `Vainqueur du lobby : ${meta.country}  (${formatAvg(data.winner.avg)})`,
      MARGIN,
      y
    );
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${meta.artist}  —  ${meta.song}`, MARGIN, y);
    y += 9;
  }

  if (data.user) {
    y = ensureSpace(doc, y, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Votre session : ${data.user.pseudo}`, MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    if (data.prediction) {
      doc.text(`Pronostic : ${data.prediction}`, MARGIN, y);
      y += 5;
    }
    if (data.userWinner) {
      const p = data.userWinner.perf;
      const meta = getCountryByCode(p.code) || p;
      doc.text(
        `Meilleure note : ${meta.country}  (${formatScore(data.userWinner.score)})`,
        MARGIN,
        y
      );
      y += 5;
    }
    y += 4;
  }

  if (options.stats && data.stats) {
    y = sectionTitle(doc, 'Statistiques', y);
    const rows = [['Moyenne du groupe', `${formatAvg(data.stats.groupAvg)} / 3`]];
    if (data.stats.generous) {
      rows.push([
        'Le plus genereux',
        `${pdfText(data.stats.generous.member.pseudo)} (${formatAvg(data.stats.generous.avg)})`,
      ]);
    }
    if (data.stats.severe) {
      rows.push([
        'Le plus severe',
        `${pdfText(data.stats.severe.member.pseudo)} (${formatAvg(data.stats.severe.avg)})`,
      ]);
    }
    if (data.stats.popular) {
      rows.push(['Gouts populaires', pdfText(data.stats.popular.member.pseudo)]);
    }
    autoTable(doc, {
      startY: y,
      body: rows,
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = tableEndY(doc, y) + 8;
  }

  if (data.top3.length) {
    y = sectionTitle(doc, 'Podium', y);
    autoTable(doc, {
      startY: y,
      head: [['Place', 'Pays', 'Artiste', 'Moyenne']],
      body: data.top3.map((r, i) => [
        String(i + 1),
        perfLabel(r.perf),
        r.perf.artist || '—',
        formatAvg(r.avg),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [124, 77, 255], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 2 },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = tableEndY(doc, y) + 8;
  }

  if (options.ranking && data.ranking.length) {
    y = sectionTitle(doc, 'Classement complet', y);
    autoTable(doc, {
      startY: y,
      head: [['#', 'Pays', 'Artiste', 'Moyenne', 'Votes']],
      body: data.ranking.map((r, i) => [
        String(i + 1),
        perfLabel(r.perf),
        r.perf.artist || '—',
        formatAvg(r.avg),
        String(r.votes.length),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [224, 64, 251], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 1.5 },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = tableEndY(doc, y) + 8;
  }

  const showVotes = options.detailedVotes || options.heatmap;
  if (showVotes && data.members.length && data.ranking.length) {
    y = sectionTitle(
      doc,
      options.heatmap ? 'Heatmap des votes' : 'Votes par participant',
      y
    );
    const head = ['#', 'Pays', ...data.members.map((m) => (m.pseudo || '?').slice(0, 10))];
    const memberStartCol = 2;
    const body = data.ranking.map((r, i) => {
      const row = [String(i + 1), perfLabel(r.perf).slice(0, 18)];
      data.members.forEach((m) => {
        const v = getUserVote(lobby, r.perf.id, m.id);
        row.push(v ? formatScore(v.score) : '—');
      });
      return row;
    });

    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      theme: 'grid',
      headStyles: { fillColor: [60, 60, 80], fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1, overflow: 'linebreak' },
      margin: { left: MARGIN, right: MARGIN },
      didParseCell: options.heatmap
        ? (hook) => {
            if (hook.section !== 'body' || hook.column.index < memberStartCol) return;
            const rgb = scoreFillColor(hook.cell.raw);
            if (rgb) hook.cell.styles.fillColor = rgb;
          }
        : undefined,
    });
  }

  const safeCode = (data.lobbyCode || 'lobby').replace(/[^\w-]+/g, '');
  const dateSlug = new Date().toISOString().slice(0, 10);
  doc.save(`eurolobby-${safeCode}-${dateSlug}.pdf`);
}
