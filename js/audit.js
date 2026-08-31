/* ==========================================================================
   IGT MISSIONS RDC — audit.js — Journal d'audit (traçabilité)
   Actions : LOGIN LOGOUT CREATE UPDATE ARCHIVE VALIDATE PRINT IMPORT EXPORT
   ========================================================================== */
'use strict';

const AUDIT = (() => {
  const S = 'auditLogs';

  async function log(type, module, objet, utilisateur, extra) {
    try {
      const entry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        type, module: module || '', objet: objet || '', utilisateur: utilisateur || 'admin',
        date: Utils.todayISO(), heure: Utils.nowTime(), dateTime: Utils.nowStamp(),
        identifiant: (extra && extra.reference) || (extra && extra.id) || '', extra: extra || {}
      };
      await DB.put(S, entry);
      return entry;
    } catch (e) { // l'audit ne doit jamais bloquer l'action principale
      return null;
    }
  }

  async function getAll() {
    let list = await DB.getAll(S);
    list.sort((a, b) => String(b.dateTime).localeCompare(String(a.dateTime)));
    return list;
  }
  async function filter(q, opts) {
    let list = await getAll();
    if (q) { const n = Utils.norm(q); list = list.filter((x) => Utils.norm([x.type, x.module, x.objet, x.utilisateur].join(' ')).includes(n)); }
    if (opts && opts.type) list = list.filter((x) => x.type === opts.type);
    if (opts && opts.module) list = list.filter((x) => x.module === opts.module);
    if (opts && opts.date) list = list.filter((x) => x.date === opts.date);
    return list;
  }

  return { log, getAll, filter };
})();
