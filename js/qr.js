/* ==========================================================================
   IGT MISSIONS RDC — qr.js — Wrapper du générateur de QR Code
   S'appuie sur le moteur robuste "qrcode-generator" (Kazuhiko Arase, MIT)
   fourni dans qrcode-lib.js. Expose une API simple de rendu sur canvas.
   ========================================================================== */
'use strict';

const QRCode = (() => {
  // qrcode est le constructeur global fourni par qrcode-lib.js
  const lib = (typeof qrcode === 'function') ? qrcode : null;

  function generate(text, ecl) {
    if (!lib) throw new Error('Moteur QR Code non chargé.');
    const type = ecl || 'M';
    const qr = lib(0, type); // typeNumber=0 -> auto
    qr.addData(text, 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    const m = [];
    for (let y = 0; y < count; y++) {
      const row = [];
      for (let x = 0; x < count; x++) row.push(qr.isDark(y, x) ? 1 : 0);
      m.push(row);
    }
    return { m, size: count };
  }

  function toCanvas(canvas, text, opts) {
    opts = opts || {};
    const q = generate(text, opts.ecl || 'M');
    const size = q.size;
    const scale = opts.scale || 6;
    const quiet = opts.quiet == null ? 4 : opts.quiet;
    const dim = (size + quiet * 2) * scale;
    canvas.width = dim; canvas.height = dim;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = '#000000';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
      if (q.m[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    return canvas;
  }

  return { generate, toCanvas };
})();
