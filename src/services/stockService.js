const supabase = require('../config/supabase');

/**
 * Retourne le stock disponible boutique pour un produit :
 *   stock_actuel − quantité_réservée_atelier (bons EN_ATTENTE)
 */
async function getStockDispo(produitId) {
  const { data, error } = await supabase
    .from('v_stock_dispo_boutique')
    .select('*')
    .eq('id', produitId)
    .single();

  if (error) throw new Error(`Stock introuvable : ${error.message}`);
  return data;
}

/**
 * Liste des produits avec conflit de stock (réservation atelier > 0 ET disponible boutique)
 */
async function getStockConflits() {
  const { data, error } = await supabase
    .from('v_stock_dispo_boutique')
    .select('*')
    .gt('quantite_reservee_atelier', 0)
    .eq('disponible_boutique', true)
    .order('quantite_reservee_atelier', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Vérifie la disponibilité d'un lot de lignes (produit_id + quantité)
 * Applique la règle de priorité atelier selon le paramètre système.
 *
 * Retourne { ok: true } ou { ok: false, conflits: [...] }
 */
async function verifierDisponibilite(lignes) {
  const { data: param } = await supabase
    .from('parametres_systeme')
    .select('valeur')
    .eq('cle', 'priorite_atelier')
    .single();

  const prioriteAtelier = param?.valeur === 'true';

  const conflits = [];

  for (const ligne of lignes) {
    const stock = await getStockDispo(ligne.produit_id);

    const stockConsidere = prioriteAtelier
      ? stock.stock_dispo_boutique   // stock net après réservation atelier
      : stock.stock_actuel;          // stock brut (atelier n'est pas prioritaire)

    if (stockConsidere < ligne.quantite) {
      conflits.push({
        produit_id: ligne.produit_id,
        designation: stock.designation,
        demande: ligne.quantite,
        disponible: stockConsidere,
        reservee_atelier: stock.quantite_reservee_atelier,
        stock_actuel: stock.stock_actuel,
      });
    }
  }

  return conflits.length === 0
    ? { ok: true }
    : { ok: false, conflits };
}

/**
 * Décrémente le stock après validation d'une vente.
 * Utilise une transaction Supabase via RPC pour l'atomicité.
 */
async function decrementerStock(lignes) {
  for (const ligne of lignes) {
    const { error } = await supabase.rpc('decrementer_stock_produit', {
      p_produit_id: ligne.produit_id,
      p_quantite: ligne.quantite,
    });
    if (error) throw new Error(`Erreur décrémentation stock [${ligne.produit_id}] : ${error.message}`);
  }
}

module.exports = { getStockDispo, getStockConflits, verifierDisponibilite, decrementerStock };
