const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const supabase = require('../config/supabase');
const { montantEnLettres } = require('./paieService');
const { TAFDIL } = require('./pdfBranding');

const C = { primary: TAFDIL.rouge, accent: TAFDIL.rouge, light: TAFDIL.gris_clair };

const MOIS_FR = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/**
 * Génère le PDF bulletin de paie A4 (pratique camerounaise).
 */
async function genererBulletinPDF(bulletin_id) {
  const { data: b, error } = await supabase
    .from('bulletins_paie')
    .select(`
      *,
      employe:employe_id (
        matricule, nom, prenom, poste, departement,
        cnps_numero_affiliation, date_embauche, type_contrat,
        categorie_cnps
      )
    `)
    .eq('id', bulletin_id)
    .single();

  if (error || !b) throw new Error('Bulletin introuvable');
  return buildBulletinPDF(b);
}

async function buildBulletinPDF(b) {
  const emp = b.employe;
  const periode = `${MOIS_FR[b.mois]} ${b.annee}`;
  const verif_url = `${process.env.APP_URL || 'https://erp.tafdil.cm'}/paie/verif/${b.id}`;
  const qrBuffer = await QRCode.toBuffer(verif_url, { width: 80 });

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width - 80; // largeur utile
      const left = 40;

      // ── EN-TÊTE ──────────────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 75).fill(C.primary);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(18)
        .text(TAFDIL.raison_sociale, left, 12);
      doc.font('Helvetica').fontSize(8)
        .text(TAFDIL.activite, left, 36)
        .text(`${TAFDIL.adresse} | ${TAFDIL.tel1}`, left, 48)
        .text(`RCCM : ${TAFDIL.rccm}  |  NIU : ${TAFDIL.niu}`, left, 60);

      doc.fillColor('white').font('Helvetica-Bold').fontSize(14)
        .text('BULLETIN DE PAIE', left + W - 160, 16, { width: 160, align: 'right' });
      doc.font('Helvetica').fontSize(9)
        .text(periode.toUpperCase(), left + W - 160, 38, { width: 160, align: 'right' });

      // QR Code vérification (coin haut-droit)
      doc.image(qrBuffer, doc.page.width - 100, 5, { width: 60 });

      // ── BLOC EMPLOYÉ ─────────────────────────────────────────────────────
      const y1 = 85;
      doc.rect(left, y1, W, 55).fill(C.light);
      doc.fillColor('#333').font('Helvetica-Bold').fontSize(10)
        .text(`${emp.nom} ${emp.prenom}`.toUpperCase(), left + 8, y1 + 8);
      doc.font('Helvetica').fontSize(8)
        .text(`Matricule : ${emp.matricule}`, left + 8, y1 + 22)
        .text(`Poste : ${emp.poste} | Département : ${emp.departement}`, left + 8, y1 + 34)
        .text(`Contrat : ${emp.type_contrat} | Catégorie CNPS : ${emp.categorie_cnps || '—'}`, left + 8, y1 + 46);

      doc.font('Helvetica').fontSize(8)
        .text(`N° CNPS : ${emp.cnps_numero_affiliation || '—'}`, left + W / 2, y1 + 22)
        .text(`Embauche : ${emp.date_embauche ? new Date(emp.date_embauche).toLocaleDateString('fr-FR') : '—'}`, left + W / 2, y1 + 34)
        .text(`Période : ${MOIS_FR[b.mois]} ${b.annee}`, left + W / 2, y1 + 46);

      // ── TABLEAU GAINS ────────────────────────────────────────────────────
      let y = y1 + 70;

      const col = [left, left + 260, left + 360, left + W - 2];

      const drawTableHeader = (title, y_pos) => {
        doc.rect(left, y_pos, W, 16).fill(C.primary);
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8)
          .text(title, left + 4, y_pos + 4);
        return y_pos + 16;
      };

      const drawRow = (label, base, taux, montant, y_pos, shade = false) => {
        if (shade) doc.rect(left, y_pos, W, 14).fill('#f0f4f8');
        doc.fillColor('#333').font('Helvetica').fontSize(8)
          .text(label,   col[0] + 4, y_pos + 3, { width: 255 })
          .text(base  ? Number(base).toLocaleString('fr-FR') : '',  col[1] + 4, y_pos + 3, { width: 95, align: 'right' })
          .text(taux  ? taux : '',  col[2] + 4, y_pos + 3, { width: 60, align: 'center' })
          .text(montant ? Number(montant).toLocaleString('fr-FR') + ' XAF' : '', col[3] - 4, y_pos + 3, { width: 100, align: 'right' });
        doc.rect(left, y_pos, W, 14).stroke('#e5e7eb');
        return y_pos + 14;
      };

      // En-têtes colonnes
      y = drawTableHeader('ÉLÉMENTS DE RÉMUNÉRATION', y);
      doc.rect(left, y, W, 13).fill(C.light);
      doc.fillColor(C.primary).font('Helvetica-Bold').fontSize(7)
        .text('Désignation', col[0] + 4, y + 3)
        .text('Base', col[1] + 4, y + 3, { width: 95, align: 'right' })
        .text('Taux / Nb', col[2] + 4, y + 3, { width: 60, align: 'center' })
        .text('Montant (XAF)', col[3] - 4, y + 3, { width: 100, align: 'right' });
      y += 13;

      // Lignes gains
      let shade = false;
      y = drawRow('Salaire de base', '', '', b.salaire_base, y, shade); shade = !shade;
      if (b.heures_sup > 0) {
        y = drawRow('Heures supplémentaires', `${b.heures_sup}h`, '+25%', b.montant_heures_sup, y, shade);
        shade = !shade;
      }
      for (const pr of (b.primes_detail || [])) {
        y = drawRow(`Prime de ${pr.type.toLowerCase()}`, '', '', pr.montant_xaf, y, shade);
        shade = !shade;
      }

      // Ligne total brut
      doc.rect(left, y, W, 16).fill(C.primary);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
        .text('SALAIRE BRUT', col[0] + 4, y + 4)
        .text(Number(b.salaire_brut).toLocaleString('fr-FR') + ' XAF', col[3] - 4, y + 4, { width: 100, align: 'right' });
      y += 20;

      // ── TABLEAU RETENUES ─────────────────────────────────────────────────
      y = drawTableHeader('RETENUES', y);
      shade = false;
      y = drawRow('CNPS Vieillesse (salarié 2,8%)',
        `${Number(b.base_cnps).toLocaleString('fr-FR')} XAF`, '2,80%',
        b.cnps_vieillesse_sal, y, shade); shade = !shade;
      y = drawRow('IRPP mensuel',
        `${Number(b.salaire_imposable_annuel).toLocaleString('fr-FR')} XAF/an`, 'barème',
        b.irpp_mensuel, y, shade); shade = !shade;
      y = drawRow('CAC (10% de l\'IRPP)', '', '10%', b.cac_mensuel, y, shade); shade = !shade;
      if (b.avances_deduites > 0) {
        y = drawRow('Avance sur salaire', '', '', b.avances_deduites, y, shade);
        shade = !shade;
      }

      doc.rect(left, y, W, 16).fill(TAFDIL.rouge_fonce);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
        .text('TOTAL RETENUES', col[0] + 4, y + 4)
        .text(Number(b.total_retenues + b.avances_deduites).toLocaleString('fr-FR') + ' XAF',
          col[3] - 4, y + 4, { width: 100, align: 'right' });
      y += 20;

      // ── NET À PAYER ───────────────────────────────────────────────────────
      doc.rect(left, y, W, 30).fill(C.accent);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(13)
        .text('NET À PAYER', col[0] + 8, y + 8)
        .text(Number(b.salaire_net).toLocaleString('fr-FR') + ' XAF', col[3] - 8, y + 8, { width: 120, align: 'right' });
      y += 35;

      // Net en toutes lettres
      const lettres = b.detail_calcul?.salaire_net_lettres || montantEnLettres(b.salaire_net);
      doc.fillColor('#555').font('Helvetica-Oblique').fontSize(8)
        .text(`Arrêté à la somme de : ${lettres}`, left, y);
      y += 20;

      // ── CHARGES PATRONALES (mention) ──────────────────────────────────────
      doc.rect(left, y, W, 13).fill('#f0f0f0');
      doc.fillColor('#888').font('Helvetica').fontSize(7)
        .text(
          `Charges patronales (information) : Vieillesse pat. ${Number(b.cnps_vieillesse_pat).toLocaleString('fr-FR')} + AT ${Number(b.cnps_at_pat).toLocaleString('fr-FR')} + Famille ${Number(b.cnps_family_pat).toLocaleString('fr-FR')} = ${Number(b.total_charges_pat).toLocaleString('fr-FR')} XAF  |  Coût total employeur : ${Number(b.cout_total_employeur).toLocaleString('fr-FR')} XAF`,
          left + 4, y + 3, { width: W - 8 }
        );
      y += 20;

      // ── SIGNATURES ────────────────────────────────────────────────────────
      const sig_y = doc.page.height - 110;
      doc.fontSize(8).font('Helvetica').fillColor('#333')
        .text('Signature Employé :', left, sig_y)
        .text('Cachet & Signature DG :', left + W / 2, sig_y);
      doc.rect(left, sig_y + 14, W / 2 - 20, 50).stroke('#ccc');
      doc.rect(left + W / 2, sig_y + 14, W / 2, 50).stroke('#ccc');

      // ── FOOTER ────────────────────────────────────────────────────────────
      doc.rect(0, doc.page.height - 30, doc.page.width, 30).fill(TAFDIL.noir);
      doc.fillColor('white').fontSize(7).font('Helvetica')
        .text(
          `${TAFDIL.raison_sociale} — Bulletin de paie confidentiel — Période : ${periode} — Généré le ${new Date().toLocaleDateString('fr-FR')} — Vérification : ${verif_url}`,
          0, doc.page.height - 20, { align: 'center', width: doc.page.width }
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { genererBulletinPDF, buildBulletinPDF };
