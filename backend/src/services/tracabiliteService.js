const supabase = require('../config/supabase');

/**
 * Traçabilité complète d'un produit fini : matières consommées, lots, coûts.
 */
async function getTracabiliteProduitFini(produit_fini_id) {
  const { data: pf, error: pf_err } = await supabase
    .from('produits_finis')
    .select('id, designation, reference, prix_vente, type_produit')
    .eq('id', produit_fini_id)
    .single();

  if (pf_err || !pf) throw new Error('Produit fini introuvable');

  const { data: liens } = await supabase
    .from('tracabilite_liens')
    .select(`
      *,
      bon_production:bon_production_id (
        id, reference, statut, date_debut, date_fin_reel, technicien_id
      ),
      matiere:produit_quinca_id (
        id, reference, designation, unite
      )
    `)
    .eq('produit_fini_id', produit_fini_id)
    .order('created_at');

  const cout_total_matieres = (liens || []).reduce((s, l) => s + parseFloat(l.cout_total || 0), 0);

  return {
    produit_fini: pf,
    liens_matieres: liens || [],
    cout_total_matieres: Math.round(cout_total_matieres),
    marge_brute: pf.prix_vente ? Math.round(pf.prix_vente - cout_total_matieres) : null,
  };
}

/**
 * Rentabilité réelle d'une commande vs devis estimé.
 */
async function getRentabiliteCommande(commande_id) {
  const { data, error } = await supabase
    .from('v_rentabilite_comparee')
    .select('*')
    .eq('commande_id', commande_id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Historique de consommation d'une matière première.
 */
async function getHistoriqueMatiere(produit_id) {
  const { data: prod } = await supabase
    .from('produits')
    .select('id, reference, designation, stock_actuel, unite')
    .eq('id', produit_id)
    .single();

  if (!prod) throw new Error('Produit introuvable');

  const { data: sorties } = await supabase
    .from('bons_sortie_atelier')
    .select(`
      id, reference, quantite, date_sortie, motif,
      technicien_id
    `)
    .eq('produit_id', produit_id)
    .order('date_sortie', { ascending: false })
    .limit(50);

  const { data: tracas } = await supabase
    .from('tracabilite_liens')
    .select(`
      quantite_consommee, cout_total, lot_reference, date_entree_stock,
      produit_fini:produit_fini_id (designation, reference)
    `)
    .eq('produit_quinca_id', produit_id)
    .order('created_at', { ascending: false })
    .limit(50);

  const total_sorti = (sorties || []).reduce((s, b) => s + parseFloat(b.quantite || 0), 0);
  const total_consomme = (tracas || []).reduce((s, t) => s + parseFloat(t.quantite_consommee || 0), 0);

  return {
    produit: prod,
    bons_sortie: sorties || [],
    tracabilite_production: tracas || [],
    statistiques: {
      total_sorti: Math.round(total_sorti * 1000) / 1000,
      total_consomme_production: Math.round(total_consomme * 1000) / 1000,
      nb_bons_sortie: (sorties || []).length,
    },
  };
}

/**
 * Vue globale rentabilité (toutes commandes).
 */
async function getRentabiliteGlobale({ date_debut, date_fin } = {}) {
  let q = supabase
    .from('v_rentabilite_comparee')
    .select('*')
    .order('commande_id');

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

module.exports = {
  getTracabiliteProduitFini,
  getRentabiliteCommande,
  getHistoriqueMatiere,
  getRentabiliteGlobale,
};
