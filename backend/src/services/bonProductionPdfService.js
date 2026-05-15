const PDFDocument = require('pdfkit');
const supabase = require('../config/supabase');
const { TAFDIL } = require('./pdfBranding');

const A4_W = 595.28;
const A4_H = 841.89;
const LEFT = 50;
const W = A4_W - 2 * LEFT;

function fmt(n) {
  return new Intl.NumberFormat('fr-CM').format(n || 0) + ' XAF';
}

/**
 * Génère le PDF d'un bon de production A4 avec charte TAFDIL.
 * @param {string} bonId UUID du bon de production
 * @returns {Promise<Buffer>}
 */
async function genererBonProductionPDF(bonId) {
  const { data: bon, error } = await supabase
    .from('bons_production')
    .select(`
      *,
      produit_fini:produit_fini_id (
        reference, designation, type, dimensions, materiau, finition, couleur
      ),
      technicien:technicien_id ( raw_user_meta_data )
    `)
    .eq('id', bonId)
    .single();

  if (error || !bon) throw new Error('Bon de production introuvable');

  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      const doc = new PDFDocument({ size: 'A4', margins: { top: LEFT, bottom: LEFT, left: LEFT, right: LEFT } });
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pf = bon.produit_fini || {};
      const techNom = bon.technicien?.raw_user_meta_data?.full_name
        || bon.technicien?.raw_user_meta_data?.name
        || '—';

      // ── EN-TÊTE ──────────────────────────────────────────────
      doc.rect(0, 0, A4_W, 85).fill(TAFDIL.rouge);

      doc.fillColor('white').font('Helvetica-Bold').fontSize(20)
        .text(TAFDIL.raison_sociale, LEFT, 14, { width: W * 0.6 });
      doc.font('Helvetica').fontSize(8)
        .text(TAFDIL.activite, LEFT, 40)
        .text(`${TAFDIL.adresse} | ${TAFDIL.tel1}`, LEFT, 52)
        .text(TAFDIL.email, LEFT, 64);

      doc.fillColor('white').font('Helvetica-Bold').fontSize(18)
        .text('BON DE PRODUCTION', LEFT + W * 0.5, 14, { width: W * 0.5, align: 'right' });
      doc.font('Helvetica').fontSize(10)
        .text(`Réf : ${bon.reference || '—'}`, LEFT + W * 0.5, 46, { width: W * 0.5, align: 'right' });

      const statutColor = bon.statut === 'VALIDE' ? '#22c55e' : bon.statut === 'SOUMIS' ? '#f59e0b' : '#6b7280';
      doc.roundedRect(LEFT + W * 0.62, 60, 130, 18, 4).fill(statutColor);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
        .text(bon.statut || 'SOUMIS', LEFT + W * 0.62, 65, { width: 130, align: 'center' });

      // ── BLOC PRODUIT ──────────────────────────────────────────
      let y = 100;

      doc.rect(LEFT, y, W, 13).fill(TAFDIL.gris_clair);
      doc.fillColor(TAFDIL.rouge).font('Helvetica-Bold').fontSize(9)
        .text('INFORMATIONS DU PRODUIT', LEFT + 6, y + 3);
      y += 18;

      const infoRow = (label, value) => {
        if (!value) return;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#555')
          .text(`${label} :`, LEFT, y, { width: 130, continued: false });
        doc.font('Helvetica').fontSize(8.5).fillColor('#222')
          .text(String(value), LEFT + 135, y - 10.5, { width: W - 135 });
        y += 14;
      };

      infoRow('Référence', pf.reference);
      infoRow('Désignation', pf.designation);
      infoRow('Type', pf.type);

      if (pf.dimensions) {
        const d = pf.dimensions;
        const dimStr = [
          d.largeur ? `L ${d.largeur} mm` : null,
          d.hauteur ? `H ${d.hauteur} mm` : null,
          d.profondeur ? `P ${d.profondeur} mm` : null,
        ].filter(Boolean).join(' × ');
        if (dimStr) infoRow('Dimensions', dimStr);
      }

      infoRow('Matériau principal', pf.materiau);
      infoRow('Finition', pf.finition);
      infoRow('Couleur', pf.couleur);
      infoRow('Technicien', techNom);
      infoRow('Date début', bon.date_debut ? new Date(bon.date_debut).toLocaleDateString('fr-CM') : null);
      infoRow('Date fin', bon.date_fin ? new Date(bon.date_fin).toLocaleDateString('fr-CM') : null);
      if (bon.observations) infoRow('Observations', bon.observations);

      y += 6;

      // ── MATÉRIAUX CONSOMMÉS ────────────────────────────────────
      doc.moveTo(LEFT, y).lineTo(A4_W - LEFT, y).strokeColor(TAFDIL.rouge).lineWidth(1.5).stroke().lineWidth(1);
      y += 8;

      doc.rect(LEFT, y, W, 13).fill(TAFDIL.rouge);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(9)
        .text('MATÉRIAUX CONSOMMÉS', LEFT + 6, y + 3);
      y += 16;

      const colDesig  = LEFT;
      const colQte    = LEFT + 280;
      const colPU     = LEFT + 340;
      const colTotal  = LEFT + 430;

      // En-têtes colonnes
      doc.rect(LEFT, y, W, 13).fill('#f0f0f0');
      doc.fillColor(TAFDIL.rouge).font('Helvetica-Bold').fontSize(7.5)
        .text('Désignation', colDesig + 4, y + 3, { width: 270 })
        .text('Qté', colQte, y + 3, { width: 55, align: 'right' })
        .text('P.U. (XAF)', colPU, y + 3, { width: 85, align: 'right' })
        .text('Total (XAF)', colTotal, y + 3, { width: 85, align: 'right' });
      y += 14;

      const materiaux = bon.materiaux_utilises || [];
      let shade = false;

      for (const mat of materiaux) {
        if (shade) doc.rect(LEFT, y, W, 14).fill(TAFDIL.gris_clair);
        doc.fillColor('#333').font('Helvetica').fontSize(8)
          .text(mat.designation || '—', colDesig + 4, y + 3, { width: 270 })
          .text(String(mat.quantite ?? ''), colQte, y + 3, { width: 55, align: 'right' })
          .text(new Intl.NumberFormat('fr-CM').format(mat.prix_unitaire_achat ?? 0), colPU, y + 3, { width: 85, align: 'right' })
          .text(new Intl.NumberFormat('fr-CM').format(mat.total ?? 0), colTotal, y + 3, { width: 85, align: 'right' });
        doc.rect(LEFT, y, W, 14).strokeColor('#e5e7eb').stroke();
        y += 14;
        shade = !shade;
      }

      if (materiaux.length === 0) {
        doc.fillColor('#aaa').font('Helvetica-Oblique').fontSize(8)
          .text('Aucun matériau déclaré', LEFT + 4, y + 3);
        y += 18;
      }

      // ── RÉCAPITULATIF FINANCIER ────────────────────────────────
      y += 10;
      doc.rect(LEFT + W * 0.5, y, W * 0.5, 14).fill(TAFDIL.rouge);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
        .text('RÉCAPITULATIF DES COÛTS', LEFT + W * 0.5 + 6, y + 3);
      y += 17;

      const ligneFinanciere = (label, val, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 9.5 : 8.5)
          .fillColor(bold ? TAFDIL.noir : '#555')
          .text(label, LEFT + W * 0.5 + 6, y, { width: W * 0.45 });
        doc.fillColor(bold ? TAFDIL.rouge : '#333')
          .text(fmt(val), LEFT + W * 0.5, y, { width: W * 0.5 - 4, align: 'right' });
        y += bold ? 16 : 13;
      };

      ligneFinanciere('Coût matériaux', bon.cout_materiaux);
      ligneFinanciere("Coût main d'œuvre", bon.cout_main_oeuvre);
      doc.moveTo(LEFT + W * 0.5, y - 2).lineTo(A4_W - LEFT, y - 2).strokeColor(TAFDIL.gris_bord).stroke();
      ligneFinanciere('COÛT TOTAL', bon.cout_materiaux + bon.cout_main_oeuvre, true);
      y += 4;

      if (bon.prix_vente_suggere) {
        doc.rect(LEFT + W * 0.5, y, W * 0.5, 22).fill('#000');
        doc.fillColor('white').font('Helvetica-Bold').fontSize(10)
          .text('Prix vente suggéré', LEFT + W * 0.5 + 6, y + 6, { width: W * 0.3 });
        doc.fillColor(TAFDIL.rouge).font('Helvetica-Bold').fontSize(10)
          .text(fmt(bon.prix_vente_suggere), LEFT + W * 0.5, y + 6, { width: W * 0.5 - 4, align: 'right' });
        y += 28;
      }

      // ── BLOC VALIDATION DG ────────────────────────────────────
      const sigY = A4_H - 155;
      doc.moveTo(LEFT, sigY).lineTo(A4_W - LEFT, sigY).strokeColor(TAFDIL.rouge).lineWidth(1.5).stroke().lineWidth(1);

      doc.fillColor(TAFDIL.rouge).font('Helvetica-Bold').fontSize(11)
        .text('VALIDATION DG', LEFT, sigY + 10);

      const sigW = (W - 20) / 2;

      doc.rect(LEFT, sigY + 28, sigW, 70).strokeColor(TAFDIL.gris_bord).stroke();
      doc.fillColor('#555').font('Helvetica-Bold').fontSize(8)
        .text('Technicien — Signature :', LEFT + 6, sigY + 34);
      doc.font('Helvetica').fontSize(7.5)
        .text(techNom, LEFT + 6, sigY + 47);

      doc.rect(LEFT + sigW + 20, sigY + 28, sigW, 70).strokeColor(TAFDIL.gris_bord).stroke();
      doc.fillColor('#555').font('Helvetica-Bold').fontSize(8)
        .text('Direction Générale — Cachet & Signature :', LEFT + sigW + 26, sigY + 34);

      if (bon.statut === 'VALIDE' && bon.date_validation) {
        doc.fillColor('#22c55e').font('Helvetica-Bold').fontSize(8)
          .text(`✓ Validé le ${new Date(bon.date_validation).toLocaleDateString('fr-CM')}`,
            LEFT + sigW + 26, sigY + 52);
      }

      // ── PIED DE PAGE ─────────────────────────────────────────
      doc.rect(0, A4_H - 32, A4_W, 32).fill(TAFDIL.noir);
      doc.fillColor('white').font('Helvetica').fontSize(7)
        .text(
          `${TAFDIL.raison_sociale} | ${TAFDIL.adresse} | ${TAFDIL.tel1} | ${TAFDIL.email} — Généré le ${new Date().toLocaleString('fr-CM')}`,
          LEFT, A4_H - 18, { width: W, align: 'center' }
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { genererBonProductionPDF };
