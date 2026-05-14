const supabase = require('../config/supabase');

/**
 * Retourne le prix applicable selon le type client.
 * Un DG peut accorder une remise supplémentaire (remise_dg_pct).
 *
 * @param {string} produitId
 * @param {'PUBLIC'|'INTERNE'} clientType
 * @param {number} remiseDgPct - remise additionnelle accordée par DG (0 par défaut)
 * @returns {{ prix_base, remise_pct, prix_final }}
 */
async function calculerPrix(produitId, clientType, remiseDgPct = 0) {
  const { data: produit, error } = await supabase
    .from('produits')
    .select('prix_public, prix_interne, designation')
    .eq('id', produitId)
    .single();

  if (error || !produit) throw new Error(`Produit introuvable : ${produitId}`);

  const { data: maxRemiseParam } = await supabase
    .from('parametres_systeme')
    .select('valeur')
    .eq('cle', 'remise_max_dg')
    .single();

  const remiseMax = parseFloat(maxRemiseParam?.valeur ?? '30');

  if (remiseDgPct > remiseMax) {
    throw new Error(`Remise ${remiseDgPct}% dépasse le maximum autorisé (${remiseMax}%)`);
  }

  const prixBase = clientType === 'INTERNE' ? produit.prix_interne : produit.prix_public;
  const prixFinal = Math.round(prixBase * (1 - remiseDgPct / 100));

  return {
    prix_base: prixBase,
    remise_pct: remiseDgPct,
    prix_final: prixFinal,
  };
}

/**
 * Calcule les totaux d'une vente (HT, remise globale, TVA, TTC).
 */
async function calculerTotaux(lignes, tauxTvaOverride = null) {
  const { data: tvaParam } = await supabase
    .from('parametres_systeme')
    .select('valeur')
    .eq('cle', 'tva_taux')
    .single();

  const taux = tauxTvaOverride ?? parseFloat(tvaParam?.valeur ?? '19.25');

  let montantHt = 0;
  let montantRemise = 0;

  for (const ligne of lignes) {
    const brut = ligne.quantite * ligne.prix_unitaire_applique;
    const remise = brut * (ligne.remise_pct ?? 0) / 100;
    montantHt += brut - remise;
    montantRemise += remise;
  }

  const montantTva = Math.round(montantHt * taux / 100);
  const montantTotal = montantHt + montantTva;

  return {
    montant_ht: Math.round(montantHt),
    montant_remise: Math.round(montantRemise),
    taux_tva: taux,
    montant_tva: montantTva,
    montant_total: montantTotal,
  };
}

module.exports = { calculerPrix, calculerTotaux };
