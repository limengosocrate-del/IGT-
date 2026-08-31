/* =====================================================================
   notifications.js — Centre d'alertes de l'application.
   Types : conflit (rouge), visite récente (orange), charge agent (jaune),
   ordre à corriger (rouge), succès (vert).
   ===================================================================== */

const Notifications = (() => {

  async function ajouter(type, titre, message, lienModule = null) {
    const n = {
      id: Utils.uid('ntf'),
      date: new Date().toISOString(),
      type,                 // 'conflit' | 'visite' | 'charge' | 'ordre' | 'succes' | 'info'
      titre,
      message,
      lienModule,
      lu: false
    };
    await DB.ajouter('notifications', n);
    return n;
  }

  async function lister(uniquementNonLues = false) {
    let toutes = await DB.tout('notifications');
    toutes.sort((a, b) => (a.date < b.date ? 1 : -1));
    if (uniquementNonLues) toutes = toutes.filter((n) => !n.lu);
    return toutes;
  }

  async function nombreNonLues() {
    const toutes = await DB.tout('notifications');
    return toutes.filter((n) => !n.lu).length;
  }

  async function marquerLue(id) {
    const n = await DB.get('notifications', id);
    if (n) { n.lu = true; await DB.put('notifications', n); }
  }

  async function marquerToutesLues() {
    const ns = await lister(false);
    await DB.putPlusieurs('notifications', ns.map((n) => ({ ...n, lu: true })));
  }

  const META = {
    conflit: { ico: '🔴', cls: 'rouge', label: 'Conflit de mission' },
    visite:  { ico: '🟠', cls: 'orange', label: 'Entreprise récemment visitée' },
    charge:  { ico: '⚠️', cls: 'orange', label: 'Agent fortement sollicité' },
    ordre:   { ico: '📝', cls: 'rouge', label: 'Ordre à corriger' },
    succes:  { ico: '🟢', cls: 'vert', label: 'Succès' },
    info:    { ico: 'ℹ️', cls: '', label: 'Information' }
  };

  return { ajouter, lister, nombreNonLues, marquerLue, marquerToutesLues, META };
})();
