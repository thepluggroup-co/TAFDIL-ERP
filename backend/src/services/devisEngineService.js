const supabase = require('../config/supabase');

// TVA Cameroun
const TVA = 0.1925;

/**
 * Estime le prix d'un produit sur mesure à partir des tarifs_base.
 * Input : { type_produit, largeur_m, hauteur_m, materiau, finition, quantite, complexite? }
 * Output : { cout_materiaux_estime, cout_mo_estime, marge_tafdil, prix_client_ht, prix_client_ttc,
 *            delai_estime_jours, liste_materiaux_necessaires, disponibilite_stock }
 */
async function estimerDevis({ type_produit, largeur_m, hauteur_m, materiau, finition, quantite = 1, complexite = 'standard' }) {
  const L = parseFloat(largeur_m);
  const H = parseFloat(hauteur_m);
  const Q = parseInt(quantite, 10);

  if (!L || !H || L <= 0 || H <= 0 || Q <= 0) {
    throw new Error('Dimensions et quantité invalides');
  }

  // 1. Récupérer le tarif de base
  const { data: tarif, error: tarif_err } = await supabase
    .from('tarifs_base')
    .select('*')
    .eq('type_produit', type_produit)
    .eq('materiau', materiau)
    .eq('finition', finition)
    .eq('actif', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (tarif_err || !tarif) {
    throw new Error(`Aucun tarif trouvé pour ${type_produit} / ${materiau} / ${finition}`);
  }

  // 2. Calcul surface / périmètre
  const surface_m2 = L * H;
  const perimetre_ml = (L + H) * 2;

  // 3. Prix de base (surface + linéaire)
  let prix_base = (tarif.prix_m2 * surface_m2 + tarif.prix_ml * perimetre_ml) * Q;

  // 4. Majoration hauteur (> 2m)
  if (H > 2 && tarif.majoration_hauteur_pct > 0) {
    prix_base *= (1 + tarif.majoration_hauteur_pct / 100);
  }

  // 5. Majoration complexité
  const complexite_real = complexite || tarif.complexite;
  if (complexite_real !== 'standard' && tarif.majoration_complexite_pct > 0) {
    prix_base *= (1 + tarif.majoration_complexite_pct / 100);
  }

  // 6. Récupérer les matériaux estimatifs (tarifs_base_materiaux)
  const { data: mats } = await supabase
    .from('tarifs_base_materiaux')
    .select(`
      *,
      produits:produit_quincaillerie_id (
        id, reference, designation, stock_actuel, prix_interne
      )
    `)
    .eq('tarif_id', tarif.id);

  const liste_materiaux = [];
  let cout_materiaux = 0;

  for (const m of (mats || [])) {
    const qte_besoin = (
      (m.quantite_par_m2 * surface_m2) +
      (m.quantite_par_ml * perimetre_ml) +
      m.quantite_fixe
    ) * Q * 1.08; // coefficient chute 8%

    const produit = m.produits;
    const prix_unit = produit?.prix_interne || 0;
    const cout_ligne = qte_besoin * prix_unit;
    cout_materiaux += cout_ligne;

    liste_materiaux.push({
      designation: produit?.designation || m.designation_matiere,
      produit_id: produit?.id || null,
      quantite: Math.ceil(qte_besoin * 100) / 100,
      unite: m.unite,
      prix_unitaire: prix_unit,
      cout: Math.round(cout_ligne),
      stock_disponible: produit?.stock_actuel ?? null,
      suffisant: produit ? produit.stock_actuel >= qte_besoin : null,
    });
  }

  // 7. Coût M.O. = 30% du prix de base (valeur paramétrable)
  const { data: param_mo } = await supabase
    .from('parametres_systeme')
    .select('valeur')
    .eq('cle', 'taux_mo_pct')
    .single();
  const taux_mo = parseFloat(param_mo?.valeur ?? '30') / 100;
  const cout_mo = Math.round(prix_base * taux_mo);

  // 8. Marge Tafdil = prix_base - cout_materiaux - cout_mo
  const prix_client_ht = Math.round(prix_base);
  const marge_tafdil = prix_client_ht - Math.round(cout_materiaux) - cout_mo;
  const prix_client_ttc = Math.round(prix_client_ht * (1 + TVA));

  // 9. Disponibilité stock globale
  const ruptures = liste_materiaux.filter(m => m.suffisant === false);
  const disponibilite_stock = ruptures.length === 0 ? 'DISPONIBLE'
    : ruptures.length < liste_materiaux.length ? 'PARTIEL' : 'RUPTURE';

  return {
    type_produit,
    materiau,
    finition,
    dimensions: { largeur_m: L, hauteur_m: H, quantite: Q, surface_m2, perimetre_ml },
    cout_materiaux_estime: Math.round(cout_materiaux),
    cout_mo_estime: cout_mo,
    marge_tafdil,
    prix_client_ht,
    prix_client_ttc,
    tva: Math.round(prix_client_ht * TVA),
    delai_estime_jours: tarif.delai_jours_base + (H > 2 ? 2 : 0) + (Q > 1 ? (Q - 1) * 2 : 0),
    liste_materiaux_necessaires: liste_materiaux,
    disponibilite_stock,
    tarif_id: tarif.id,
  };
}

/**
 * Crée un devis en base et retourne l'objet complet.
 */
async function creerDevisAuto(params, client_id, created_by) {
  const estimation = await estimerDevis(params);

  // Générer référence devis
  const { data: ref_row } = await supabase
    .rpc('nextval', { regclass: 'seq_devis' })
    .single();
  const annee = new Date().getFullYear();
  const reference = `DV-${annee}-${String(ref_row || Date.now()).padStart(5, '0')}`;

  const { data: devis, error } = await supabase
    .from('devis')
    .insert({
      reference,
      client_id,
      type_produit: params.type_produit,
      specifications: {
        largeur_m: estimation.dimensions.largeur_m,
        hauteur_m: estimation.dimensions.hauteur_m,
        quantite: estimation.dimensions.quantite,
        materiau: params.materiau,
        finition: params.finition,
        complexite: params.complexite || 'standard',
        adresse_chantier: params.adresse_chantier,
      },
      montant_ht: estimation.prix_client_ht,
      montant_ttc: estimation.prix_client_ttc,
      tva: estimation.tva,
      acompte_requis_pct: 30,
      source: 'AUTO',
      cout_materiaux: estimation.cout_materiaux_estime,
      cout_mo: estimation.cout_mo_estime,
      marge_tafdil: estimation.marge_tafdil,
      liste_materiaux: estimation.liste_materiaux_necessaires,
      delai_fabrication_jours: estimation.delai_estime_jours,
      statut: 'BROUILLON',
      created_by,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { devis, estimation };
}

/**
 * Retrouve des devis similaires (même type_produit, dimensions proches ±20%).
 */
async function historiqueSimilaires({ type_produit, largeur_m, hauteur_m }) {
  const L = parseFloat(largeur_m);
  const H = parseFloat(hauteur_m);

  const { data, error } = await supabase
    .from('devis')
    .select(`
      id, reference, montant_ht, montant_ttc, statut, created_at,
      specifications, source,
      clients:client_id (nom, telephone)
    `)
    .eq('type_produit', type_produit)
    .gte('created_at', new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString())
    .in('statut', ['ACCEPTE', 'ENVOYE'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);

  // Filtrer par dimensions ±20%
  return (data || []).filter(d => {
    const s = d.specifications || {};
    const dL = parseFloat(s.largeur_m || 0);
    const dH = parseFloat(s.hauteur_m || 0);
    return dL > 0 && dH > 0
      && Math.abs(dL - L) / L <= 0.2
      && Math.abs(dH - H) / H <= 0.2;
  });
}

module.exports = { estimerDevis, creerDevisAuto, historiqueSimilaires };
