/* =====================================================================
   audit.js — Journal de traçabilité (qui a fait quoi et quand).
   Enregistre : date, heure, action, module, objet, ancienne/nouvelle donnée.
   Aucune suppression du journal n'est proposée dans l'interface.
   ===================================================================== */

const Audit = (() => {

  /**
   * Enregistre une entrée au journal.
   * @param {string} action ex : CRÉATION, MODIFICATION, ARCHIVAGE, VALIDATION...
   * @param {string} module ex : Entreprises, Missions, Ordres...
   * @param {string} objet description de l'objet concerné
   * @param {*} ancienneDonnee
   * @param {*} nouvelleDonnee
   * @param {string} details commentaire libre
   */
  async function enregistrer(action, module, objet, ancienneDonnee = null, nouvelleDonnee = null, details = '') {
    const maintenant = new Date();
    const entree = {
      id: Utils.uid('log'),
      date: maintenant.toISOString(),
      action: String(action).toUpperCase(),
      module: module || '—',
      objet: objet || '—',
      ancienneDonnee: ancienneDonnee === undefined ? null : ancienneDonnee,
      nouvelleDonnee: nouvelleDonnee === undefined ? null : nouvelleDonnee,
      details: details || ''
    };
    try {
      await DB.ajouter('auditLogs', entree);
    } catch (e) {
      // Le journal ne doit jamais bloquer une opération métier.
      console.warn('Journal indisponible :', e);
    }
    return entree;
  }

  /** Toutes les entrées, plus récentes d'abord. */
  async function lister() {
    const logs = await DB.tout('auditLogs');
    return logs.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  return { enregistrer, lister };
})();
