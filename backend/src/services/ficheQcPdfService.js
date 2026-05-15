const PDFDocument = require('pdfkit');
const supabase = require('../config/supabase');
const { TAFDIL } = require('./pdfBranding');

const A4_W = 595.28;
const A4_H = 841.89;
const LEFT = 50;
const W = A4_W - 2 * LEFT;

const DECISION_COLORS = {
  VALIDE:   '#22c55e',
  RETOUCHE: '#f59e0b',
  REJET:    '#ef4444',
};

/**
 * Génère le PDF d'une fiche de contrôle qualité A4 avec charte TAFDIL.
 * @param {string} ficheId UUID de la fiche
 * @returns {Promise<Buffer>}
 */
async function genererFicheQcPDF(ficheId) {
  const { data: fiche, error } = await supabase
    .from('fiches_controle_qualite')
    .select(`
      *,
      of:of_id (
        reference, type_produit, statut,
        produit_fini:produit_fini_id (reference, designation, type)
      ),
      technicien:technicien_qc_id ( raw_user_meta_data )
    `)
    .eq('id', ficheId)
    .single();

  if (error || !fiche) throw new Error('Fiche de contrôle qualité introuvable');

  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      const doc = new PDFDocument({ size: 'A4', margins: { top: LEFT, bottom: LEFT, left: LEFT, right: LEFT } });
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const of = fiche.of || {};
      const pf = of.produit_fini || {};
      const techNom = fiche.technicien?.raw_user_meta_data?.full_name
        || fiche.technicien?.raw_user_meta_data?.name
        || '—';

      const decision = fiche.decision || 'VALIDE';
      const decisionColor = DECISION_COLORS[decision] || '#6b7280';

      // ── EN-TÊTE ──────────────────────────────────────────────
      doc.rect(0, 0, A4_W, 85).fill(TAFDIL.rouge);

      doc.fillColor('white').font('Helvetica-Bold').fontSize(20)
        .text(TAFDIL.raison_sociale, LEFT, 14, { width: W * 0.6 });
      doc.font('Helvetica').fontSize(8)
        .text(TAFDIL.activite, LEFT, 40)
        .text(`${TAFDIL.adresse} | ${TAFDIL.tel1}`, LEFT, 52)
        .text(TAFDIL.email, LEFT, 64);

      doc.fillColor('white').font('Helvetica-Bold').fontSize(15)
        .text('FICHE DE CONTRÔLE', LEFT + W * 0.48, 14, { width: W * 0.52, align: 'right' });
      doc.fontSize(13)
        .text('QUALITÉ', LEFT + W * 0.48, 34, { width: W * 0.52, align: 'right' });

      const dateFiche = fiche.date_controle
        ? new Date(fiche.date_controle).toLocaleDateString('fr-CM')
        : new Date().toLocaleDateString('fr-CM');
      doc.font('Helvetica').fontSize(9)
        .text(dateFiche, LEFT + W * 0.48, 60, { width: W * 0.52, align: 'right' });

      // ── BLOC IDENTIFICATION ────────────────────────────────────
      let y = 100;

      doc.rect(LEFT, y, W, 13).fill(TAFDIL.gris_clair);
      doc.fillColor(TAFDIL.rouge).font('Helvetica-Bold').fontSize(9)
        .text('IDENTIFICATION', LEFT + 6, y + 3);
      y += 17;

      const infoRow = (label, value) => {
        if (!value) return;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#555')
          .text(`${label} :`, LEFT, y, { width: 140 });
        doc.font('Helvetica').fillColor('#222')
          .text(String(value), LEFT + 145, y - 10.5, { width: W - 145 });
        y += 14;
      };

      infoRow('N° OF', of.reference);
      infoRow('Type produit', of.type_produit);
      infoRow('Produit', pf.designation || pf.reference);
      infoRow('Technicien QC', techNom);
      infoRow('Date contrôle', dateFiche);

      y += 8;

      // ── DÉCISION GLOBALE ────────────────────────────────────────
      doc.rect(LEFT, y, W, 32).fill(decisionColor);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(16)
        .text(`DÉCISION : ${decision}`, LEFT, y + 8, { width: W, align: 'center' });

      const criteres = fiche.criteres_verifies || [];
      const nbConformes = criteres.filter(c => c.conforme).length;
      const nbTotal = criteres.length;
      if (nbTotal > 0) {
        doc.font('Helvetica').fontSize(8)
          .text(`${nbConformes} / ${nbTotal} critères conformes (${Math.round(nbConformes / nbTotal * 100)}%)`,
            LEFT, y + 25, { width: W, align: 'center' });
      }
      y += 40;

      // ── CRITÈRES DE CONTRÔLE ────────────────────────────────────
      y += 8;
      doc.rect(LEFT, y, W, 13).fill(TAFDIL.rouge);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(9)
        .text('CRITÈRES DE CONTRÔLE', LEFT + 6, y + 3);
      y += 16;

      // En-têtes
      doc.rect(LEFT, y, W, 13).fill('#f0f0f0');
      doc.fillColor(TAFDIL.rouge).font('Helvetica-Bold').fontSize(7.5)
        .text('Critère', LEFT + 4, y + 3, { width: W * 0.65 })
        .text('Conforme', LEFT + W * 0.68, y + 3, { width: 55, align: 'center' })
        .text('Observations', LEFT + W * 0.75, y + 3, { width: W * 0.25 });
      y += 14;

      let shade = false;
      for (const c of criteres) {
        if (shade) doc.rect(LEFT, y, W, 14).fill(TAFDIL.gris_clair);
        const isConf = c.conforme === true;
        doc.font('Helvetica').fontSize(8).fillColor('#333')
          .text(c.critere || '—', LEFT + 4, y + 3, { width: W * 0.65 });
        doc.fillColor(isConf ? '#22c55e' : '#ef4444').font('Helvetica-Bold').fontSize(9)
          .text(isConf ? '✓ OUI' : '✗ NON', LEFT + W * 0.68, y + 3, { width: 55, align: 'center' });
        if (c.observations) {
          doc.fillColor('#555').font('Helvetica').fontSize(7.5)
            .text(c.observations, LEFT + W * 0.75, y + 3, { width: W * 0.25 });
        }
        doc.rect(LEFT, y, W, 14).strokeColor('#e5e7eb').stroke();
        y += 14;
        shade = !shade;
      }

      if (criteres.length === 0) {
        doc.fillColor('#aaa').font('Helvetica-Oblique').fontSize(8)
          .text('Aucun critère enregistré.', LEFT + 4, y + 3);
        y += 18;
      }

      y += 12;

      // ── DÉFAUTS CONSTATÉS ──────────────────────────────────────
      if (fiche.defauts_constates) {
        doc.rect(LEFT, y, W, 13).fill(TAFDIL.rouge_fonce);
        doc.fillColor('white').font('Helvetica-Bold').fontSize(9)
          .text('DÉFAUTS CONSTATÉS', LEFT + 6, y + 3);
        y += 16;

        const defauts = Array.isArray(fiche.defauts_constates)
          ? fiche.defauts_constates.join('\n• ')
          : String(fiche.defauts_constates);

        doc.rect(LEFT, y, W, 0).strokeColor(TAFDIL.gris_bord);
        doc.fillColor('#333').font('Helvetica').fontSize(8.5)
          .text(`• ${defauts}`, LEFT + 6, y + 4, { width: W - 12 });
        y = doc.y + 10;
      }

      // ── ACTIONS CORRECTIVES ────────────────────────────────────
      if (fiche.actions_correctives) {
        doc.rect(LEFT, y, W, 13).fill('#f59e0b');
        doc.fillColor('white').font('Helvetica-Bold').fontSize(9)
          .text('ACTIONS CORRECTIVES', LEFT + 6, y + 3);
        y += 16;

        const actions = Array.isArray(fiche.actions_correctives)
          ? fiche.actions_correctives.join('\n• ')
          : String(fiche.actions_correctives);

        doc.fillColor('#333').font('Helvetica').fontSize(8.5)
          .text(`• ${actions}`, LEFT + 6, y + 4, { width: W - 12 });
        y = doc.y + 10;
      }

      // ── SIGNATURES ────────────────────────────────────────────
      const sigY = Math.max(y + 20, A4_H - 165);
      doc.moveTo(LEFT, sigY).lineTo(A4_W - LEFT, sigY).strokeColor(TAFDIL.rouge).lineWidth(1.5).stroke().lineWidth(1);

      doc.fillColor(TAFDIL.rouge).font('Helvetica-Bold').fontSize(11)
        .text('SIGNATURES', LEFT, sigY + 10);

      const sigW = (W - 20) / 2;

      doc.rect(LEFT, sigY + 28, sigW, 60).strokeColor(TAFDIL.gris_bord).stroke();
      doc.fillColor('#555').font('Helvetica-Bold').fontSize(8)
        .text('Technicien Qualité :', LEFT + 6, sigY + 34);
      doc.font('Helvetica').fontSize(7.5)
        .text(techNom, LEFT + 6, sigY + 46);

      doc.rect(LEFT + sigW + 20, sigY + 28, sigW, 60).strokeColor(TAFDIL.gris_bord).stroke();
      doc.fillColor('#555').font('Helvetica-Bold').fontSize(8)
        .text('Direction Générale :', LEFT + sigW + 26, sigY + 34);
      if (fiche.valide_par_dg) {
        doc.fillColor(decisionColor).font('Helvetica-Bold').fontSize(8)
          .text(`${decision} — DG`, LEFT + sigW + 26, sigY + 50);
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

module.exports = { genererFicheQcPDF };
