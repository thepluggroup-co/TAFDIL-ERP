const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

/**
 * Crée un devis pour une commande sur mesure.
 * Le prix est soit passé explicitement, soit calculé par les règles de
 * surface / périmètre selon le type produit.
 *
 * @param {Object} payload
 * @returns {{ devis_id, numero, montant_total, montant_acompte }}
 */
async function creerDevis(payload) {
  const {
    client_id = null,
    client_nom,
    client_telephone,
    client_email,
    commercial_id,
    type_produit,
    specifications = {},     // { largeur, hauteur, profondeur, materiau, finition, couleur, notes }
    prix_ht_manuel = null,   // si le commercial fixe le prix directement
    produit_fini_id = null,  // si commande sur produit en stock
    notes_internes = null,
  } = payload;

  // 1. Résolution TVA et paramètres
  const { data: params } = await supabase
    .from('parametres_systeme')
    .select('cle, valeur')
    .in('cle', ['tva_taux', 'acompte_defaut_pct', 'delai_fabrication_def']);

  const cfg = Object.fromEntries(params.map(p => [p.cle, parseFloat(p.valeur)]));
  const tauxTva = cfg.tva_taux ?? 19.25;
  const acomptePct = cfg.acompte_defaut_pct ?? 30;
  const delaiDef = cfg.delai_fabrication_def ?? 14;

  // 2. Calcul prix si pas saisi manuellement (heuristique surface)
  let montantHt = prix_ht_manuel;
  if (!montantHt && produit_fini_id) {
    const { data: pf } = await supabase
      .from('produits_finis')
      .select('prix_vente')
      .eq('id', produit_fini_id)
      .single();
    montantHt = pf?.prix_vente ?? 0;
  }
  if (!montantHt) {
    montantHt = estimerPrix(type_produit, specifications);
  }

  const montantTva = Math.round(montantHt * tauxTva / 100);
  const montantTotal = montantHt + montantTva;

  // 3. Numérotation
  const { data: numero } = await supabase.rpc('next_numero_devis');

  const devisId = uuidv4();
  const dateValidite = new Date();
  dateValidite.setDate(dateValidite.getDate() + 30);

  const { error } = await supabase.from('devis').insert({
    id: devisId,
    numero,
    client_id,
    client_nom,
    client_telephone,
    client_email,
    commercial_id,
    produit_fini_id,
    type_produit,
    specifications,
    montant_ht: montantHt,
    montant_tva: montantTva,
    montant_total: montantTotal,
    acompte_pct: acomptePct,
    statut: 'ENVOYE',
    date_validite: dateValidite.toISOString().slice(0, 10),
    delai_fabrication_jours: delaiDef,
    notes_internes,
  });

  if (error) throw new Error(`Création devis : ${error.message}`);

  // 4. Si produit en stock → le réserver
  if (produit_fini_id) {
    await supabase
      .from('produits_finis')
      .update({ statut: 'RESERVE' })
      .eq('id', produit_fini_id)
      .eq('statut', 'DISPONIBLE');
  }

  return {
    devis_id: devisId,
    numero,
    montant_ht: montantHt,
    montant_tva: montantTva,
    montant_total: montantTotal,
    montant_acompte: Math.round(montantTotal * acomptePct / 100),
    acompte_pct: acomptePct,
    date_validite: dateValidite.toISOString().slice(0, 10),
    delai_fabrication_jours: delaiDef,
  };
}

/**
 * Client accepte un devis → crée la commande + attend acompte.
 */
async function accepterDevis(devisId) {
  const { data: devis, error: errDevis } = await supabase
    .from('devis')
    .select('*')
    .eq('id', devisId)
    .single();

  if (errDevis || !devis) throw new Error('Devis introuvable');

  const statuts_acceptables = ['ENVOYE', 'BROUILLON'];
  if (!statuts_acceptables.includes(devis.statut)) {
    throw new Error(`Devis ne peut être accepté (statut : ${devis.statut})`);
  }

  // Vérifier expiration
  if (devis.date_validite && new Date(devis.date_validite) < new Date()) {
    await supabase.from('devis').update({ statut: 'EXPIRE' }).eq('id', devisId);
    throw new Error('Ce devis est expiré');
  }

  const { data: numero } = await supabase.rpc('next_numero_commande_pf');

  const dateLivraison = new Date();
  dateLivraison.setDate(dateLivraison.getDate() + (devis.delai_fabrication_jours || 14));

  const commandeId = uuidv4();

  const { error: errCmd } = await supabase.from('commandes_produits_finis').insert({
    id: commandeId,
    numero,
    devis_id: devisId,
    client_id: devis.client_id,
    client_nom: devis.client_nom,
    client_email: devis.client_email,
    client_telephone: devis.client_telephone,
    produit_fini_id: devis.produit_fini_id,
    statut: 'EN_ATTENTE_ACOMPTE',
    source: 'ERP',
    montant_total: devis.montant_total,
    acompte_attendu: devis.montant_acompte,
    date_livraison_prevue: dateLivraison.toISOString().slice(0, 10),
  });

  if (errCmd) throw new Error(`Création commande : ${errCmd.message}`);

  // Passer le devis en ACCEPTE
  await supabase.from('devis').update({ statut: 'ACCEPTE' }).eq('id', devisId);

  return {
    commande_id: commandeId,
    numero,
    montant_total: devis.montant_total,
    acompte_attendu: devis.montant_acompte,
    date_livraison_prevue: dateLivraison.toISOString().slice(0, 10),
    message: `Commande créée. Acompte de ${devis.montant_acompte} XAF attendu pour démarrer la fabrication.`,
  };
}

/**
 * Heuristique de prix par type produit (XAF).
 * Basé sur la surface en m² × prix_m2 de référence.
 * Valeurs ajustables par paramètre DG.
 */
function estimerPrix(typeProduit, specs) {
  const l = (specs.largeur || 1000) / 1000;   // mm → m
  const h = (specs.hauteur || 2000) / 1000;
  const surface = l * h;

  const TARIFS_M2 = {
    PORTAIL: 85_000,
    PORTE: 70_000,
    BALCON: 55_000,
    GARDE_CORPS: 45_000,
    CLAUSTRA: 40_000,
    AUTRE: 50_000,
  };

  const prixM2 = TARIFS_M2[typeProduit] || TARIFS_M2.AUTRE;
  return Math.round(surface * prixM2);
}

module.exports = { creerDevis, accepterDevis };
