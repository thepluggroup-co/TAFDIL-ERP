const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const supabase = require('../config/supabase');
const { TAFDIL } = require('./pdfBranding');

const MARGIN = 50;
const A4_W = 595.28;
const A4_H = 841.89;
const CONTENT_W = A4_W - 2 * MARGIN;

const COLOR_PRIMARY = TAFDIL.rouge;
const COLOR_ACCENT  = TAFDIL.rouge;
const COLOR_LIGHT   = TAFDIL.gris_clair;
const COLOR_BORDER  = TAFDIL.gris_bord;

/**
 * Génère un PDF A4 pour le bon de livraison.
 * Le bloc signature reste vide si non encore signé.
 *
 * @param {string} blId UUID du bon de livraison
 * @returns {Promise<Buffer>}
 */
async function genererBonLivraisonPDF(blId) {
  const { data: bl, error } = await supabase
    .from('bons_livraison')
    .select(`
      *,
      commande:commande_id (
        numero, montant_total, acompte_verse, solde_restant, notes,
        date_livraison_prevue,
        client_nom,
        produit_fini:produit_fini_id (
          designation, type, dimensions, materiau, finition, couleur, reference, photos_urls
        ),
        devis:devis_id ( numero, specifications )
      )
    `)
    .eq('id', blId)
    .single();

  if (error || !bl) throw new Error('Bon de livraison introuvable');

  const { data: params } = await supabase
    .from('parametres_systeme')
    .select('cle, valeur');
  const cfg = Object.fromEntries(params.map(p => [p.cle, p.valeur]));

  const urlSignature = `${cfg.base_url || 'https://erp.tafdil.cm'}/signature/${bl.signature_token}`;
  const qrBuffer = await QRCode.toBuffer(urlSignature, { type: 'png', width: 120, margin: 1 });

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });

    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const cmd = bl.commande;
    const pf = cmd?.produit_fini;
    const specs = cmd?.devis?.specifications || {};

    // ── EN-TÊTE ───────────────────────────────────────────────
    doc.rect(0, 0, A4_W, 90).fill(COLOR_PRIMARY);

    doc.fillColor('white').font('Helvetica-Bold').fontSize(20)
      .text(cfg.raison_sociale || TAFDIL.raison_sociale, MARGIN, 18, { width: CONTENT_W * 0.6 });
    doc.font('Helvetica').fontSize(8).fillColor('white')
      .text(TAFDIL.activite, MARGIN, 43)
      .text(`${cfg.ville || 'Douala'} | Tél : ${cfg.telephone || TAFDIL.tel1}`, MARGIN, 54)
      .text(TAFDIL.email, MARGIN, 65);

    doc.fillColor('white').font('Helvetica-Bold').fontSize(20)
      .text('BON DE LIVRAISON', MARGIN + CONTENT_W * 0.5, 18, { width: CONTENT_W * 0.5, align: 'right' });
    doc.font('Helvetica').fontSize(11)
      .text(`N° ${bl.numero}`, MARGIN + CONTENT_W * 0.5, 48, { width: CONTENT_W * 0.5, align: 'right' });

    // ── INFOS COMMANDE + CLIENT ───────────────────────────────
    let y = 110;

    const boxLeft = (x, yy, w, h, label, value) => {
      doc.rect(x, yy, w, h).fillAndStroke(COLOR_LIGHT, COLOR_BORDER);
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(8)
        .text(label, x + 8, yy + 8, { width: w - 16 });
      doc.fillColor('#333').font('Helvetica').fontSize(10)
        .text(value || '—', x + 8, yy + 22, { width: w - 16 });
    };

    const COL = CONTENT_W / 2 - 5;
    boxLeft(MARGIN, y, COL, 55, 'N° COMMANDE', cmd?.numero);
    boxLeft(MARGIN + COL + 10, y, COL, 55, 'CLIENT', cmd?.client_nom);
    y += 65;
    boxLeft(MARGIN, y, COL, 55, 'DATE DE LIVRAISON',
      new Date(bl.date_livraison).toLocaleDateString('fr-CM'));
    boxLeft(MARGIN + COL + 10, y, COL, 55, 'LIVREUR',
      bl.livreur_nom || '');
    y += 70;

    // ── DÉTAIL PRODUIT ────────────────────────────────────────
    doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(12)
      .text('DÉTAIL DU PRODUIT LIVRÉ', MARGIN, y);
    y += 18;
    doc.moveTo(MARGIN, y).lineTo(A4_W - MARGIN, y).strokeColor(COLOR_ACCENT).lineWidth(2).stroke();
    doc.lineWidth(1).strokeColor(COLOR_BORDER);
    y += 10;

    const ligneSpec = (label, val) => {
      if (!val) return;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_PRIMARY)
        .text(`${label} :`, MARGIN, y, { width: 130, continued: false });
      doc.font('Helvetica').fontSize(9).fillColor('#333')
        .text(String(val), MARGIN + 135, y - 10, { width: CONTENT_W - 135 });
      y += 14;
    };

    ligneSpec('Référence', pf?.reference);
    ligneSpec('Désignation', pf?.designation);
    ligneSpec('Type', pf?.type);
    if (pf?.dimensions) {
      const d = pf.dimensions;
      const dimStr = [
        d.largeur ? `L ${d.largeur} mm` : null,
        d.hauteur  ? `H ${d.hauteur} mm`  : null,
        d.profondeur ? `P ${d.profondeur} mm` : null,
      ].filter(Boolean).join(' × ');
      ligneSpec('Dimensions', dimStr || null);
    }
    ligneSpec('Matériau', pf?.materiau || specs.materiau);
    ligneSpec('Finition', pf?.finition || specs.finition);
    ligneSpec('Couleur', pf?.couleur || specs.couleur);
    if (specs.notes) ligneSpec('Notes spéciales', specs.notes);

    y += 6;

    // ── RÉCAPITULATIF FINANCIER ───────────────────────────────
    doc.moveTo(MARGIN, y).lineTo(A4_W - MARGIN, y).strokeColor(COLOR_BORDER).stroke();
    y += 12;

    doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(11)
      .text('RÉCAPITULATIF FINANCIER', MARGIN, y);
    y += 20;

    const ligneFinanciere = (label, valeur, accent = false) => {
      doc.font(accent ? 'Helvetica-Bold' : 'Helvetica').fontSize(accent ? 11 : 9)
        .fillColor(accent ? COLOR_PRIMARY : '#555')
        .text(label, MARGIN, y, { width: CONTENT_W * 0.65 });
      doc.font(accent ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(accent ? COLOR_ACCENT : '#333')
        .text(formatXAF(valeur), MARGIN, y, { width: CONTENT_W, align: 'right' });
      y += accent ? 18 : 14;
    };

    ligneFinanciere('Montant total', cmd?.montant_total);
    ligneFinanciere('Acompte versé', cmd?.acompte_verse);
    doc.moveTo(MARGIN, y).lineTo(A4_W - MARGIN, y).strokeColor(COLOR_BORDER).stroke();
    y += 8;
    ligneFinanciere('SOLDE RESTANT DÛ', cmd?.solde_restant, true);
    y += 10;

    // ── BLOC SIGNATURES ───────────────────────────────────────
    doc.moveTo(MARGIN, y).lineTo(A4_W - MARGIN, y).strokeColor(COLOR_ACCENT).lineWidth(2).stroke();
    doc.lineWidth(1);
    y += 14;

    doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(12)
      .text('SIGNATURES', MARGIN, y);
    y += 18;

    const sigW = CONTENT_W / 2 - 10;

    // Bloc livreur
    doc.rect(MARGIN, y, sigW, 90).strokeColor(COLOR_BORDER).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_PRIMARY)
      .text('Signature du livreur', MARGIN + 8, y + 8);
    doc.font('Helvetica').fontSize(7).fillColor('#666')
      .text('Nom & Date :', MARGIN + 8, y + 68);

    // Bloc client
    const sigClientX = MARGIN + sigW + 20;
    doc.rect(sigClientX, y, sigW, 90).strokeColor(COLOR_BORDER).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_PRIMARY)
      .text('Signature du client (réception)', sigClientX + 8, y + 8);

    if (bl.signature_client_b64 && bl.statut === 'SIGNE') {
      // Intégrer la signature si déjà signée
      const sigImgBuf = Buffer.from(bl.signature_client_b64, 'base64');
      doc.image(sigImgBuf, sigClientX + 8, y + 18, { width: sigW - 16, height: 50 });
      doc.font('Helvetica').fontSize(7).fillColor('#2a7a2a')
        .text(`Signé électroniquement le ${new Date(bl.signe_le).toLocaleString('fr-CM')}`,
          sigClientX + 8, y + 70);
    } else {
      doc.font('Helvetica').fontSize(7).fillColor('#666')
        .text('Ou scannez le QR pour signer\nen ligne', sigClientX + 8, y + 68);
    }
    y += 100;

    // ── QR CODE SIGNATURE ────────────────────────────────────
    if (bl.statut !== 'SIGNE') {
      const qrX = A4_W - MARGIN - 90;
      const qrY = y - 80;
      doc.image(qrBuffer, qrX, qrY, { width: 80 });
      doc.font('Helvetica').fontSize(6).fillColor('#888')
        .text('Signer en ligne', qrX, qrY + 82, { width: 80, align: 'center' });
    }

    // ── PIED DE PAGE ─────────────────────────────────────────
    doc.rect(0, A4_H - 35, A4_W, 35).fill(TAFDIL.noir);
    doc.fillColor('white').font('Helvetica').fontSize(7)
      .text(
        `${TAFDIL.raison_sociale} | ${TAFDIL.adresse} | ${TAFDIL.tel1} | ${TAFDIL.email} — Généré le ${new Date().toLocaleString('fr-CM')}`,
        MARGIN, A4_H - 22, { width: CONTENT_W, align: 'center' }
      );

    doc.end();
  });
}

function formatXAF(n) {
  return new Intl.NumberFormat('fr-CM').format(n || 0) + ' XAF';
}

/**
 * Enregistre la signature électronique du client.
 * Le token est à usage unique et expire après signature.
 */
async function enregistrerSignature(token, signatureBase64) {
  if (!signatureBase64 || !signatureBase64.startsWith('data:image')) {
    throw new Error('Format de signature invalide (attendu: data:image/png;base64,...)');
  }

  const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, '');

  const { data: bl, error } = await supabase
    .from('bons_livraison')
    .select('id, statut, commande_id')
    .eq('signature_token', token)
    .single();

  if (error || !bl) throw new Error('Token de signature invalide ou expiré');
  if (bl.statut !== 'EN_ATTENTE') throw new Error(`BL déjà traité (statut : ${bl.statut})`);

  const { error: errUpd } = await supabase
    .from('bons_livraison')
    .update({
      signature_client_b64: base64Data,
      signe_le: new Date().toISOString(),
      statut: 'SIGNE',
    })
    .eq('id', bl.id);

  if (errUpd) throw new Error(`Enregistrement signature : ${errUpd.message}`);

  // Marquer la commande comme livrée
  await supabase
    .from('commandes_produits_finis')
    .update({
      statut: 'LIVRE',
      date_livraison_reelle: new Date().toISOString(),
    })
    .eq('id', bl.commande_id);

  return { bl_id: bl.id, signe_le: new Date().toISOString() };
}

module.exports = { genererBonLivraisonPDF, enregistrerSignature };
