/* ==========================================================================
   IGT MISSIONS RDC — statistiques.js — Statistiques & répartition des agents
   ========================================================================== */
'use strict';

const STATISTIQUES = (() => {
  async function compute() {
    const missions = await DB.getAll('missions');
    const agents = await DB.getAll('agents');
    const equipes = await DB.getAll('equipes');
    const entreprises = (await DB.getAll('entreprises')).filter((e) => !e.archive);
    const annee = String(new Date().getFullYear());
    const mois = String(new Date().getMonth() + 1).padStart(2, '0');
    const today = Utils.todayISO();
    const moisAvert = await MISSIONS.recentWindowMonths();
    const limite = Utils.addMonths(today, -moisAvert);

    const byMonth = {};
    const byYear = {};
    const byEquipe = {};
    const byAgent = {};
    missions.forEach((m) => {
      const mk = Utils.monthKey(m.dateDebut || m.dateCreation);
      const yk = Utils.yearKey(m.dateDebut || m.dateCreation);
      byMonth[mk] = (byMonth[mk] || 0) + 1;
      byYear[yk] = (byYear[yk] || 0) + 1;
      if (m.equipeId) byEquipe[m.equipeId] = (byEquipe[m.equipeId] || 0) + 1;
      (m.agentIds || []).forEach((a) => { byAgent[a] = (byAgent[a] || 0) + 1; });
    });

    const visitees = entreprises.filter((e) => e.derniereVisite).length;
    const jamais = entreprises.filter((e) => !e.derniereVisite).length;
    const recement = entreprises.filter((e) => e.derniereVisite && String(e.derniereVisite) >= String(limite)).length;
    const enMission = entreprises.filter((e) => e.statut === 'EN_MISSION').length;

    const agentStats = agents.map((a) => {
      const all = (a.nbMissions || 0);
      const currYear = missions.filter((m) => (m.agentIds || []).includes(a.id) && Utils.yearKey(m.dateDebut) === annee).length;
      const currMonth = missions.filter((m) => (m.agentIds || []).includes(a.id) && Utils.monthKey(m.dateDebut) === annee + '-' + mois).length;
      const enCours = missions.filter((m) => (m.agentIds || []).includes(a.id) && m.statut === 'EN_MISSION').length;
      return { agent: a, total: all, annee: currYear, mois: currMonth, derniere: a.derniereMission || '', enCours };
    });

    return {
      byMonth, byYear, byEquipe, byAgent, agentStats, equipes, agents,
      visitees, jamais, recement, enMission, totalEntreprises: entreprises.length,
      totalMissions: missions.length, today, moisAvert
    };
  }

  function chartMonth(data) {
    const keys = Object.keys(data).sort();
    const max = Math.max(1, ...keys.map((k) => data[k]));
    return `<div style="display:flex;gap:6px;align-items:flex-end;height:160px">` + keys.map((k) => `<div style="flex:1;text-align:center"><div style="background:var(--bleu-accent);border-radius:4px 4px 0 0;height:${Math.round(data[k] / max * 140)}px;min-height:4px;transition:height var(--transition)" title="${k}: ${data[k]}"></div><div class="mini">${k.slice(2)}</div></div>`).join('') + '</div>';
  }

  async function render(container) {
    const s = await compute();
    const agentRows = s.agentStats.sort((a, b) => b.total - a.total);
    const maxA = Math.max(1, ...agentRows.map((a) => a.total));
    // détection d'écart fort
    let alerte = '';
    if (agentRows.length > 1) {
      const top = agentRows[0].total, low = agentRows[agentRows.length - 1].total;
      if (top - low >= 10) alerte = `<div class="alert-item c-avertissement"><div class="a-ic">⚠️</div><div><div class="a-t">Répartition à examiner</div><div class="a-m">Forte différence entre l'agent le plus sollicité (${agentRows[0].agent.nom} : ${top}) et le moins sollicité (${agentRows[agentRows.length - 1].agent.nom} : ${low}).</div></div></div>`;
    }
    container.innerHTML = `
      <h2 class="section-title">Statistiques</h2>
      <div class="grid-stats" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat c-bl"><div class="b"></div><div class="v">${s.totalEntreprises}</div><div class="l">Entreprises</div></div>
        <div class="stat c-gr"><div class="b"></div><div class="v">${s.visitees}</div><div class="l">Entreprises visitées</div></div>
        <div class="stat c-ve"><div class="b"></div><div class="v">${s.jamais}</div><div class="l">Jamais visitées</div></div>
        <div class="stat c-or"><div class="b"></div><div class="v">${s.recement}</div><div class="l">Récemment visitées</div></div>
        <div class="stat c-re"><div class="b"></div><div class="v">${s.enMission}</div><div class="l">En mission</div></div>
        <div class="stat c-bl"><div class="b"></div><div class="v">${s.totalMissions}</div><div class="l">Missions totales</div></div>
        <div class="stat c-gr"><div class="b"></div><div class="v">${s.equipes.length}</div><div class="l">Équipes</div></div>
        <div class="stat c-ja"><div class="b"></div><div class="v">${s.agents.length}</div><div class="l">Agents</div></div>
      </div>
      ${alerte}
      <div class="card"><h3>Missions par mois</h3>${chartMonth(s.byMonth)}</div>
      <div class="card-grid" style="grid-template-columns:1fr 1fr">
        <div class="card"><h3>Missions par équipe</h3>${equipeBars(s)}</div>
        <div class="card"><h3>Missions par agent</h3>${agentBars(agentRows, maxA)}</div>
      </div>
      <div class="card"><h3>Charge des agents (répartition)</h3>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Agent</th><th>Total</th><th>Cette année</th><th>Ce mois</th><th>En cours</th><th>Dernière mission</th></tr></thead><tbody>
        ${agentRows.map((a) => `<tr><td><strong>${Utils.esc(a.agent.nom)} ${Utils.esc(a.agent.postnom || '')}</strong></td><td>${a.total}</td><td>${a.annee}</td><td>${a.mois}</td><td>${a.enCours}</td><td>${Utils.fmtDate(a.derniere)}</td></tr>`).join('')}
        </tbody></table></div>
      </div>`;

    function equipeBars(s) {
      const rows = s.equipes.map((eq) => ({ nom: eq.nom, n: s.byEquipe[eq.id] || 0 }));
      const max = Math.max(1, ...rows.map((r) => r.n));
      return rows.map((r) => `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><div class="mini" style="width:140px">${Utils.esc(r.nom)}</div><div style="background:var(--bleu-clair);border-radius:4px;height:16px;width:${Math.round(r.n / max * 100)}%;min-width:4px"></div><span class="mini">${r.n}</span></div>`).join('');
    }
    function agentBars(rows, max) {
      const r2 = rows.slice(0, 10);
      const m2 = Math.max(1, ...r2.map((r) => r.total));
      return r2.map((a) => `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><div class="mini" style="width:120px">${Utils.esc(a.agent.nom)}</div><div style="background:var(--orange-clair);border-radius:4px;height:16px;width:${Math.round(a.total / m2 * 100)}%;min-width:4px"></div><span class="mini">${a.total}</span></div>`).join('');
    }
  }

  return { render, compute };
})();
