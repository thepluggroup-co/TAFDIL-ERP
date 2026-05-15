const supabase = require('../config/supabase');
const PDFDocument = require('pdfkit');
const { TAFDIL } = require('./pdfBranding');

/**
 * Suggestions de réapprovisionnement depuis la vue v_suggestions_reappro.
 */
async function getSuggestions({ urgence } = {}) {
  let q = supabase
    .from('v_suggestions_reappro')
    .select('*')
    .order('urgence')
    .order('jours_restants');

  if (urgence) q = q.eq('urgence', urgence);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Crée une commande fournisseur à partir d'une liste de lignes.
 */
async function creerCommandeAchat({ fournisseur_id, lignes, date_livraison_prevue, notes }, user_id) {
  if (!lignes || lignes.length === 0) throw new Error('Aucune ligne de commande');

  // Référence auto via séquence
  const annee = new Date().getFullYear();
  const { data: seq } = await supabase.rpc('nextval', { regclass: 'seq_commande_achat' }).single();
  const reference = `CA-${annee}-${String(seq || Date.now()).padStart(5, '0')}`;

  // Calculer le montant total
  const montant_total = lignes.reduce(
    (s, l) => s + parseFloat(l.quantite_commandee) * parseFloat(l.prix_unitaire_xaf),
    0
  );

  const { data: cmd, error: cmd_err } = await supabase
    .from('commandes_achat')
    .insert({
      reference,
      fournisseur_id,
      date_livraison_prevue: date_livraison_prevue || null,
      statut: 'BROUILLON',
      montant_total_xaf: Math.round(montant_total),
      notes,
      cree_par: user_id,
    })
    .select()
    .single();

  if (cmd_err) throw new Error(cmd_err.message);

  // Insérer les lignes
  const lignes_db = lignes.map(l => ({
    commande_id: cmd.id,
    produit_id: l.produit_id,
    quantite_commandee: parseFloat(l.quantite_commandee),
    quantite_recue: 0,
    prix_unitaire_xaf: parseFloat(l.prix_unitaire_xaf),
  }));

  const { error: lines_err } = await supabase.from('commandes_achat_lignes').insert(lignes_db);
  if (lines_err) throw new Error(lines_err.message);

  return cmd;
}

/**
 * Génère un PDF de bon de commande fournisseur (A4).
 */
async function genererPDFCommandeAchat(commande_id) {
  const { data: cmd, error } = await supabase
    .from('commandes_achat')
    .select(`
      *,
      fournisseur:fournisseur_id (nom, contact_nom, contact_telephone, contact_email, ville),
      lignes:commandes_achat_lignes (
        quantite_commandee, prix_unitaire_xaf, montant_ligne,
        produit:produit_id (reference, designation, unite)
      )
    `)
    .eq('id', commande_id)
    .single();

  if (error || !cmd) throw new Error('Commande introuvable');

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const C = { primary: TAFDIL.rouge, accent: TAFDIL.rouge };

      // En-tête
      doc.rect(0, 0, doc.page.width, 85).fill(C.primary);
      doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
        .text(TAFDIL.raison_sociale, 50, 16);
      doc.fontSize(9).font('Helvetica')
        .text(TAFDIL.activite, 50, 42)
        .text(`${TAFDIL.adresse} | ${TAFDIL.tel1}`, 50, 54)
        .text(TAFDIL.email, 50, 66);
      doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
        .text('BON DE COMMANDE', 350, 25, { align: 'right', width: 200 });
      doc.fillColor('white').fontSize(9).font('Helvetica')
        .text('FOURNISSEUR', 350, 52, { align: 'right', width: 200 });

      doc.fillColor('#333').moveDown(2);
      doc.fontSize(10).font('Helvetica');

      // Référence + dates
      doc.text(`Référence : ${cmd.reference}`, 50, 100);
      doc.text(`Date : ${new Date(cmd.date_commande).toLocaleDateString('fr-FR')}`, 50, 115);
      if (cmd.date_livraison_prevue) {
        doc.text(`Livraison prévue : ${new Date(cmd.date_livraison_prevue).toLocaleDateString('fr-FR')}`, 50, 130);
      }

      // Fournisseur
      doc.rect(350, 95, 200, 70).stroke(C.primary);
      doc.font('Helvetica-Bold').text('FOURNISSEUR', 360, 100);
      doc.font('Helvetica')
        .text(cmd.fournisseur.nom, 360, 115)
        .text(cmd.fournisseur.contact_nom || '', 360, 130)
        .text(cmd.fournisseur.contact_telephone || '', 360, 145);

      // Tableau lignes
      const tableTop = 185;
      doc.rect(50, tableTop, 495, 20).fill(C.primary);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
        .text('Référence', 55, tableTop + 5)
        .text('Désignation', 130, tableTop + 5)
        .text('Qté', 320, tableTop + 5, { width: 50, align: 'right' })
        .text('Unité', 375, tableTop + 5, { width: 40, align: 'center' })
        .text('P.U. (XAF)', 420, tableTop + 5, { width: 60, align: 'right' })
        .text('Total (XAF)', 485, tableTop + 5, { width: 60, align: 'right' });

      doc.fillColor('#333').font('Helvetica').fontSize(9);
      let y = tableTop + 25;
      let alt = false;

      for (const l of cmd.lignes) {
        if (alt) doc.rect(50, y - 4, 495, 18).fill(TAFDIL.gris_clair);
        doc.fillColor('#333')
          .text(l.produit?.reference || '', 55, y, { width: 70 })
          .text(l.produit?.designation || '', 130, y, { width: 185 })
          .text(l.quantite_commandee.toString(), 320, y, { width: 50, align: 'right' })
          .text(l.produit?.unite || '', 375, y, { width: 40, align: 'center' })
          .text(Number(l.prix_unitaire_xaf).toLocaleString('fr-FR'), 420, y, { width: 60, align: 'right' })
          .text(Number(l.montant_ligne).toLocaleString('fr-FR'), 485, y, { width: 60, align: 'right' });
        y += 18;
        alt = !alt;
      }

      // Total
      y += 10;
      doc.rect(350, y, 195, 25).fill(C.accent);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11)
        .text(`TOTAL : ${Number(cmd.montant_total_xaf).toLocaleString('fr-FR')} XAF`, 355, y + 6, { width: 185, align: 'right' });

      if (cmd.notes) {
        y += 40;
        doc.fillColor('#333').font('Helvetica').fontSize(9)
          .text(`Notes : ${cmd.notes}`, 50, y, { width: 495 });
      }

      // Signature
      const sig_y = doc.page.height - 120;
      doc.fontSize(9).font('Helvetica')
        .text('Établi par :', 50, sig_y)
        .text('Signature DG :', 300, sig_y);
      doc.rect(50, sig_y + 15, 150, 50).stroke('#ccc');
      doc.rect(300, sig_y + 15, 150, 50).stroke('#ccc');

      // Footer
      doc.rect(0, doc.page.height - 30, doc.page.width, 30).fill(TAFDIL.noir);
      doc.fillColor('white').fontSize(7).font('Helvetica')
        .text(
          `${TAFDIL.raison_sociale} | ${TAFDIL.adresse} | ${TAFDIL.tel1} | ${TAFDIL.email}`,
          0, doc.page.height - 20, { align: 'center', width: doc.page.width }
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Marquer une commande comme envoyée/confirmée/reçue.
 */
async function mettreAJourStatutCommande(commande_id, statut) {
  const updates = { statut, updated_at: new Date().toISOString() };
  if (statut === 'RECEPTIONNE') {
    updates.date_livraison_reelle = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('commandes_achat')
    .update(updates)
    .eq('id', commande_id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Liste des fournisseurs avec leurs produits.
 */
async function listeFournisseurs(actif = true) {
  const { data, error } = await supabase
    .from('fournisseurs')
    .select(`
      *,
      produits:fournisseurs_produits (
        produit_id, prix_achat_xaf, lot_min_commande, est_preferentiel,
        produit:produit_id (reference, designation)
      )
    `)
    .eq('actif', actif)
    .order('note_fiabilite', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

module.exports = {
  getSuggestions,
  creerCommandeAchat,
  genererPDFCommandeAchat,
  mettreAJourStatutCommande,
  listeFournisseurs,
};
