/* =====================================================================
   auth.js — Authentification du Gestionnaire Administrateur UNIQUE.
   Le mot de passe n'est jamais stocké en clair (PBKDF2 via database.js).
   Session conservée dans LocalStorage (préférence non critique).
   ===================================================================== */

const Auth = (() => {
  const CLE_SESSION = 'igt_session';

  async function connexion(utilisateur, motDePasse) {
    const auth = await DB.getReglage('auth');
    if (!auth) throw new Error("Le compte administrateur n'est pas initialisé. Rechargez l'application.");
    if (String(utilisateur).trim().toLowerCase() !== String(auth.utilisateur).toLowerCase()) {
      await Audit.enregistrer('CONNEXION', 'Authentification', utilisateur || '(vide)', null, null, 'Échec : identifiant inconnu');
      throw new Error("Nom d'utilisateur ou mot de passe incorrect.");
    }
    const ok = await DB.verifierMotDePasse(motDePasse, auth);
    if (!ok) {
      await Audit.enregistrer('CONNEXION', 'Authentification', utilisateur, null, null, 'Échec : mot de passe incorrect');
      throw new Error("Nom d'utilisateur ou mot de passe incorrect.");
    }
    const session = {
      utilisateur: auth.utilisateur,
      role: auth.role,
      depuis: new Date().toISOString()
    };
    localStorage.setItem(CLE_SESSION, JSON.stringify(session));
    await Audit.enregistrer('CONNEXION', 'Authentification', auth.utilisateur, null, null, 'Connexion réussie');
    return session;
  }

  function deconnexion() {
    const s = session();
    if (s) Audit.enregistrer('DÉCONNEXION', 'Authentification', s.utilisateur, null, null, 'Déconnexion');
    localStorage.removeItem(CLE_SESSION);
    window.location.href = 'index.html';
  }

  function session() {
    try { return JSON.parse(localStorage.getItem(CLE_SESSION)); }
    catch { return null; }
  }

  function estConnecte() { return !!session(); }

  /** Redirige vers la page de connexion si pas de session. */
  function protegerPage() {
    if (!estConnecte()) {
      window.location.replace('index.html');
      return false;
    }
    return true;
  }

  async function changerMotDePasse(actuel, nouveau, confirmation) {
    const auth = await DB.getReglage('auth');
    if (!auth) throw new Error("Compte introuvable.");
    const ok = await DB.verifierMotDePasse(actuel, auth);
    if (!ok) throw new Error("Le mot de passe actuel est incorrect.");
    if (!nouveau || nouveau.length < 6) {
      throw new Error("Le nouveau mot de passe doit contenir au moins 6 caractères.");
    }
    if (nouveau !== confirmation) {
      throw new Error("La confirmation ne correspond pas au nouveau mot de passe.");
    }
    const { hash, sel } = await DB.hacherMotDePasse(nouveau);
    const nouvelAuth = {
      ...auth,
      hash, sel,
      dateModificationMdp: new Date().toISOString()
    };
    await DB.setReglage('auth', nouvelAuth);
    await Audit.enregistrer('SÉCURITÉ', 'Authentification', auth.utilisateur, 'Mot de passe modifié', '********', 'Changement de mot de passe');
  }

  async function nomAdministrateur() {
    const auth = await DB.getReglage('auth');
    return auth ? auth.utilisateur : 'admin';
  }

  return { connexion, deconnexion, session, estConnecte, protegerPage, changerMotDePasse, nomAdministrateur };
})();
