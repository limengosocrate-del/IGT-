# Système de Gestion et de Planification des Missions — Inspection Générale du Travail RDC

Application web **100 % frontend** (HTML5, CSS3, JavaScript ES6+, IndexedDB, PWA)
pour la gestion et la planification des missions de l'Inspection Générale du Travail
de la République Démocratique du Congo.

> **Créé par Inspecteur Limengo Daniel (Pmiller) 2026**

---

## ✅ Fonctionnalités

- **Tableau de bord** : missions, entreprises, agents, alertes en un coup d'œil.
- **Entreprises** : ajout, modification, consultation, recherche instantanée,
  archivage (aucune suppression définitive), **ajout par copier-coller** d'une liste,
  import CSV/TXT avec prévisualisation et détection des doublons.
- **Agents** : gestion complète, activation/désactivation, charge de missions.
- **Équipes / groupes** : création et affectation d'agents (un agent = un groupe).
- **Missions** : création, planification, validation, démarrage, clôture, archivage.
- **Moteur de contrôle des conflits** :
  - entreprise déjà en mission active 🔴 → **CONFLIT bloquant** ;
  - entreprise visitée récemment 🟠 → **AVERTISSEMENT** ;
  - agent en mission chevauchante 🔴 → conflit ;
  - équipe déjà engagée sur le créneau → conflit ;
  - tant qu'un conflit rouge subsiste, **la validation et l'impression sont bloquées**.
- **Ordres de mission** : numéro unique `OM-IGT-AAAA-000001`, génération automatique,
  **QR code de vérification**, modèle entièrement éditable (en-tête, textes, objet,
  signataire, logo…), prévisualisation, **impression A4** et enregistrement PDF.
- **Historique** par entreprise (visites, équipes, ordres, dates).
- **Calendrier** mensuel des missions (programlées, en cours, terminées, conflits).
- **Statistiques** : entreprises, missions, classement et charge des agents, équipes.
- **Archives** : missions, ordres et entreprises archivés (rien n'est supprimé).
- **Journal de traçabilité** : chaque action est enregistrée (date, action, module,
  ancienne/nouvelle valeur).
- **Alertes / notifications** : conflits, visites récentes, agents sursollicités.
- **Paramètres** : mot de passe, préférences, modèle d'ordre, sauvegarde/restauration.
- **Import / Export** : export JSON complet (sauvegarde) et CSV ; import JSON par
  **fusion** (n'efface jamais les données existantes).
- **PWA** : installable (« Ajouter à l'écran d'accueil »), **fonctionne hors ligne**.

## 🔐 Connexion initiale

| Champ | Valeur |
|---|---|
| Identifiant | `admin` |
| Mot de passe | `admin2026` |
| Rôle | Gestionnaire Administrateur (compte unique) |

Le mot de passe est stocké sous forme de **hachage PBKDF2-SHA-256 (Web Crypto)**,
jamais en clair. Changez-le depuis **Paramètres → Compte administrateur**.

## 🧱 Structure du projet

```
systeme-missions-igt-rdc/
├── index.html              # Page de connexion
├── dashboard.html          # Application (coquille SPA)
├── manifest.json           # Manifest PWA
├── service-worker.js       # Cache hors ligne
├── css/                    # style, dashboard, responsive, print
├── js/
│   ├── utils.js            # Utilitaires (dates, DOM, toasts, CSV…)
│   ├── database.js         # Couche IndexedDB (12 object stores) + hachage
│   ├── auth.js             # Authentification administrateur unique
│   ├── audit.js            # Journal de traçabilité
│   ├── notifications.js    # Centre d'alertes
│   ├── entreprises.js      # Registre des entreprises + statuts
│   ├── agents.js           # Agents + charge
│   ├── equipes.js          # Groupes
│   ├── missions.js         # Missions + moteur de contrôle des conflits
│   ├── ordres.js           # Ordres de mission, QR, modèle, impression
│   ├── historique.js       # Historique des visites
│   ├── statistiques.js     # Agrégats et alertes
│   ├── parametres.js       # Réglages
│   ├── import-export.js    # Sauvegarde/restauration JSON & CSV
│   ├── qrcode.js           # Enveloppe QR
│   ├── vendor/             # Bibliothèque QR (MIT, locale, hors ligne)
│   └── app.js              # Routage des modules et interface
├── assets/icons/           # Icônes PWA
├── templates/              # Gabarit de référence de l'ordre
└── data/
```

### Object stores IndexedDB
`settings`, `provinces`, `agents`, `entreprises`, `equipes`, `missions`,
`missionAgents`, `missionEntreprises`, `ordres`, `historique`, `auditLogs`,
`notifications`.

## 🖥️ Utilisation locale

Aucune compilation, aucun serveur requis. Deux options :

1. **Ouvrir directement** `index.html` dans un navigateur moderne.
2. **Serveur local** (recommandé pour le Service Worker / PWA) :
   ```bash
   # Python
   python3 -m http.server 8080
   # ou Node
   npx serve -l 8080 .
   ```
   Puis ouvrir <http://localhost:8080>.

## 🚀 Publication sur GitHub Pages

1. Créez un dépôt GitHub et poussez le contenu du dossier.
2. **Settings → Pages → Source : branche `main`, dossier `/ (root)`.**
3. L'application est servie en HTTPS ; le Service Worker et l'installation PWA
   sont alors disponibles.

## 📱 Installation PWA (téléphone)

1. Ouvrir l'URL GitHub Pages dans Chrome/Edge/ Safari.
2. Menu **« Ajouter à l'écran d'accueil »** / **« Installer l'application »**.
3. L'icône IGT apparaît ; l'application se lance en plein écran et **fonctionne
   hors ligne** après le premier chargement.

## 🔒 Stockage local — limites importantes

- **Mode de stockage : Local sur cet appareil (IndexedDB).**
- Chaque téléphone / ordinateur possède **sa propre base** ; il n'y a **pas de
  synchronisation** entre appareils dans cette version.
- Si deux appareils planifient des missions, ils ne connaissent pas
  automatiquement les conflits de l'autre.
- Cette version 100 % web est un **système local / prototype opérationnel** ;
  une base centralisée sécurisée (API + serveur) pourra être ajoutée ultérieurement
  sans refaire l'interface.
- **Sauvegardes** : utilisez régulièrement **Paramètres → Exporter les données
  (JSON)**. L'import se fait par fusion et ne supprime jamais les données.
- Conformité : il n'existe **aucune** fonction de réinitialisation / vidage de la
  base ; les suppressions définitives sont absentes (archivage uniquement).

## 🖨️ Impression / PDF

Depuis un ordre validé sans conflit : **Aperçu → Imprimer l'ordre de mission**.
La feuille `css/print.css` masque l'interface et présente un document A4 ;
choisissez **« Enregistrer en PDF »** dans la boîte d'impression si besoin.

---

**Créé par Inspecteur Limengo Daniel (Pmiller) 2026**
