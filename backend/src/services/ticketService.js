const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const supabase = require('../config/supabase');

const TICKET_WIDTH_PT = 163.8; // 58 mm en points PDF (1mm = 2.8346 pt)
const MARGIN = 8;
const FONT_NORMAL = 'Courier';
const FONT_BOLD = 'Courier-Bold';
const CHARS_PER_LINE = 28; // ~58mm thermique

function tronquer(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str.padEnd(max);
}

function formatXAF(montant) {
  return new Intl.NumberFormat('fr-CM').format(montant) + ' XAF';
}

function ligneProduit(designation, qte, pu, total) {
  const desc = tronquer(designation, 16);
  const qteStr = String(qte).padStart(3);
  const puStr = formatXAF(pu).padStart(12);
  // Ligne 1 : désignation + quantité
  // Ligne 2 : prix unitaire × total
  return `${desc} x${qteStr}\n${''.padEnd(16)} ${puStr}`;
}

/**
 * Génère un Buffer PDF format ticket thermique 58mm.
 * @param {Object} vente - vente avec ses lignes et métadonnées
 * @returns {Promise<Buffer>}
 */
async function genererTicketPDF(vente) {
  const { data: params } = await supabase
    .from('parametres_systeme')
    .select('cle, valeur');

  const cfg = Object.fromEntries(params.map(p => [p.cle, p.valeur]));

  const urlRecu = `${cfg.base_url || 'https://erp.tafdil.cm'}/recus/${vente.id}`;
  const qrBuffer = await QRCode.toBuffer(urlRecu, {
    type: 'png',
    width: 100,
    margin: 1,
  });

  return new Promise((resolve, reject) => {
    const buffers = [];
    const doc = new PDFDocument({
      size: [TICKET_WIDTH_PT, 841], // hauteur auto via autoFirstPage
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
    });

    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const W = TICKET_WIDTH_PT - 2 * MARGIN;
    let y = MARGIN;

    // ---- EN-TÊTE ----
    doc.font(FONT_BOLD).fontSize(9)
      .text(cfg.raison_sociale || 'TAFDIL SARL', MARGIN, y, { width: W, align: 'center' });
    y = doc.y + 2;
    doc.font(FONT_NORMAL).fontSize(7)
      .text(cfg.ville || 'Douala', MARGIN, y, { width: W, align: 'center' });
    y = doc.y + 1;
    doc.text(`Tél : ${cfg.telephone || ''}`, MARGIN, y, { width: W, align: 'center' });
    y = doc.y + 1;
    doc.text(`N° ${vente.numero}`, MARGIN, y, { width: W, align: 'center' });
    y = doc.y + 1;
    doc.text(new Date(vente.date_vente).toLocaleString('fr-CM'), MARGIN, y, { width: W, align: 'center' });

    // ---- SÉPARATEUR ----
    y = doc.y + 3;
    doc.moveTo(MARGIN, y).lineTo(TICKET_WIDTH_PT - MARGIN, y).stroke();
    y += 4;

    // ---- LIGNES PRODUITS ----
    doc.font(FONT_BOLD).fontSize(6.5)
      .text('DÉSIG.           QTÉ   P.U.', MARGIN, y, { width: W });
    y = doc.y + 1;
    doc.moveTo(MARGIN, y).lineTo(TICKET_WIDTH_PT - MARGIN, y).dash(1).stroke();
    doc.undash();
    y += 3;

    for (const ligne of vente.lignes) {
      const desc = tronquer(ligne.designation || '', 16);
      const montantLigne = ligne.quantite * ligne.prix_unitaire_applique * (1 - (ligne.remise_pct || 0) / 100);
      doc.font(FONT_NORMAL).fontSize(6.5)
        .text(`${desc}`, MARGIN, y, { width: W, continued: false });
      y = doc.y;
      const rightPart = `${ligne.quantite}  ${formatXAF(ligne.prix_unitaire_applique)}`;
      doc.text(rightPart, MARGIN, y, { width: W, align: 'right' });
      doc.text(`= ${formatXAF(Math.round(montantLigne))}`, MARGIN, doc.y, { width: W, align: 'right' });
      if (ligne.remise_pct > 0) {
        doc.text(`  Remise : -${ligne.remise_pct}%`, MARGIN, doc.y, { width: W });
      }
      y = doc.y + 2;
    }

    // ---- TOTAUX ----
    y = doc.y + 2;
    doc.moveTo(MARGIN, y).lineTo(TICKET_WIDTH_PT - MARGIN, y).stroke();
    y += 4;

    const ligneTotal = (label, valeur, gras = false) => {
      doc.font(gras ? FONT_BOLD : FONT_NORMAL).fontSize(7)
        .text(label, MARGIN, y, { continued: true, width: W / 2 });
      doc.text(formatXAF(valeur), MARGIN + W / 2, y, { width: W / 2, align: 'right' });
      y = doc.y + 1;
    };

    ligneTotal('Sous-total HT', vente.montant_ht);
    if (vente.montant_remise > 0) ligneTotal(`Remise`, -vente.montant_remise);
    ligneTotal(`TVA (${cfg.tva_taux || 19.25}%)`, vente.montant_tva);
    y += 1;
    doc.moveTo(MARGIN, y).lineTo(TICKET_WIDTH_PT - MARGIN, y).dash(1).stroke();
    doc.undash();
    y += 2;
    ligneTotal('TOTAL TTC', vente.montant_total, true);

    // ---- MODE PAIEMENT ----
    y = doc.y + 3;
    doc.font(FONT_BOLD).fontSize(7)
      .text(`Paiement : ${vente.mode_paiement}`, MARGIN, y, { width: W });
    doc.font(FONT_NORMAL)
      .text(`Caissier : ${vente.vendeur_nom || ''}`, MARGIN, doc.y + 1, { width: W });

    // ---- QR CODE ----
    y = doc.y + 5;
    const qrSize = 65;
    const qrX = (TICKET_WIDTH_PT - qrSize) / 2;
    doc.image(qrBuffer, qrX, y, { width: qrSize });
    y += qrSize + 2;
    doc.font(FONT_NORMAL).fontSize(5.5)
      .text('Scannez pour votre reçu en ligne', MARGIN, y, { width: W, align: 'center' });

    // ---- PIED DE PAGE ----
    y = doc.y + 5;
    doc.moveTo(MARGIN, y).lineTo(TICKET_WIDTH_PT - MARGIN, y).stroke();
    y += 3;
    doc.font(FONT_BOLD).fontSize(8)
      .text('Merci de votre visite !', MARGIN, y, { width: W, align: 'center' });

    doc.end();
  });
}

module.exports = { genererTicketPDF };
