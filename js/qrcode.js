/* =====================================================================
   qrcode.js — Génération de QR Code pour les ordres de mission.
   Enveloppe autour de la bibliothèque canonique « QR Code Generator for
   JavaScript » (Kazuhiko Arase, licence MIT), vendorisée localement dans
   js/vendor/qrcode-generator.js — aucune dépendance réseau, fonctionne
   100 % hors ligne. Niveau de correction d'erreur M, version automatique.
   ===================================================================== */

const QRCode = (() => {

  /** Construit la matrice booléenne (true = module sombre) via la lib vendorisée. */
  function generer(texte) {
    if (typeof qrcode === 'undefined') {
      throw new Error("Le moteur QR n'est pas chargé (qrcode-generator manquant).");
    }
    // Force la conversion UTF-8 (accents et caractères spéciaux français).
    if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    }
    // typeNumber 0 = détection automatique de la version ; 'M' = correction moyenne.
    const qr = qrcode(0, 'M');
    qr.addData(texte, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const matrice = Array.from({ length: n }, () => new Array(n).fill(false));
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        matrice[r][c] = !!qr.isDark(r, c);
    return matrice;
  }

  /** Dessine le QR code sur un canvas (marge silencieuse de 4 modules). */
  function dessiner(texte, canvas, taille = 256) {
    const matrice = generer(texte);
    const n = matrice.length;
    const marge = 4;
    const tailleModule = Math.max(1, Math.floor(taille / (n + 2 * marge)));
    const tailleReelle = tailleModule * (n + 2 * marge);
    const ratio = window.devicePixelRatio || 1;
    canvas.width = tailleReelle * ratio;
    canvas.height = tailleReelle * ratio;
    canvas.style.width = tailleReelle + 'px';
    canvas.style.height = tailleReelle + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tailleReelle, tailleReelle);
    ctx.fillStyle = '#0a2d63';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (matrice[r][c]) ctx.fillRect((c + marge) * tailleModule, (r + marge) * tailleModule, tailleModule, tailleModule);
    }
    return matrice;
  }

  /** Rendu ImageData (utilisé par les tests Node.js). */
  function versImageData(texte, modulePx = 6) {
    const matrice = generer(texte);
    const n = matrice.length;
    const marge = 4;
    const taille = (n + 2 * marge) * modulePx;
    const data = new Uint8ClampedArray(taille * taille * 4).fill(255);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!matrice[r][c]) continue;
      for (let dr = 0; dr < modulePx; dr++) for (let dc = 0; dc < modulePx; dc++) {
        const y = (r + marge) * modulePx + dr, x = (c + marge) * modulePx + dc;
        const idx = (y * taille + x) * 4;
        data[idx] = 10; data[idx + 1] = 45; data[idx + 2] = 99; data[idx + 3] = 255;
      }
    }
    return { data, width: taille, height: taille };
  }

  return { generer, dessiner, versImageData };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QRCode;
