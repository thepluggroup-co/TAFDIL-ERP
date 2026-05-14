const supabase = require('../config/supabase');

/**
 * Calcule le coût réel d'un bon de production à partir des matériaux
 * déclarés. Chaque item est résolu contre le prix_achat actuel en stock.
 *
 * @param {Array} materiaux  [{produit_id, quantite}]
 * @param {number} coutMO    Coût main d'œuvre déclaré
 * @returns {{ materiaux_enrichis, cout_materiaux, cout_total, prix_vente_suggere }}
 */
async function calculerCoutProduction(materiaux, coutMO = 0) {
  const { data: param } = await supabase
    .from('parametres_systeme')
    .select('valeur')
    .eq('cle', 'marge_coeff_pf')
    .single();

  const margeCoeff = parseFloat(param?.valeur ?? '1.35');

  // Résolution des prix d'achat depuis la table produits
  const ids = materiaux.map(m => m.produit_id);
  const { data: produits, error } = await supabase
    .from('produits')
    .select('id, designation, prix_interne')
    .in('id', ids);

  if (error) throw new Error(`Résolution matériaux : ${error.message}`);

  const prixMap = Object.fromEntries(produits.map(p => [p.id, p]));
  let coutMateriaux = 0;

  const materiauxEnrichis = materiaux.map(m => {
    const produit = prixMap[m.produit_id];
    if (!produit) throw new Error(`Matériau introuvable : ${m.produit_id}`);
    const total = m.quantite * (produit.prix_interne || 0);
    coutMateriaux += total;
    return {
      produit_id: m.produit_id,
      designation: produit.designation,
      quantite: m.quantite,
      prix_unitaire_achat: produit.prix_interne || 0,
      total,
    };
  });

  const coutTotal = coutMateriaux + coutMO;
  const prixVenteSuggere = Math.round(coutTotal * margeCoeff);

  return {
    materiaux_enrichis: materiauxEnrichis,
    cout_materiaux: Math.round(coutMateriaux),
    cout_main_oeuvre: coutMO,
    cout_total: Math.round(coutTotal),
    prix_vente_suggere: prixVenteSuggere,
  };
}

/**
 * Valide un bon de production (rôle DG) :
 * 1. Décrémente le stock quincaillerie pour chaque matériau consommé
 * 2. Passe le produit fini en DISPONIBLE
 * 3. Publie automatiquement sur e-commerce si photos présentes
 *
 * @param {string} bonId        UUID du bon de production
 * @param {string} validePar    UUID du DG
 * @param {number|null} prixVenteOverride  Si DG souhaite ajuster le prix
 */
async function validerBonProduction(bonId, validePar, prixVenteOverride = null) {
  const { data: bon, error: errBon } = await supabase
    .from('bons_production')
    .select('*, produit_fini:produit_fini_id(*)')
    .eq('id', bonId)
    .single();

  if (errBon || !bon) throw new Error('Bon de production introuvable');
  if (bon.statut !== 'SOUMIS') throw new Error(`Bon non soumis (statut actuel : ${bon.statut})`);

  const materiaux = bon.materiaux_utilises || [];

  // 1. Vérification stock suffisant pour chaque matériau
  for (const mat of materiaux) {
    const { data: prod } = await supabase
      .from('produits')
      .select('designation, stock_actuel')
      .eq('id', mat.produit_id)
      .single();

    if (!prod || prod.stock_actuel < mat.quantite) {
      throw new Error(
        `Stock insuffisant pour "${mat.designation}" : disponible ${prod?.stock_actuel ?? 0}, requis ${mat.quantite}`
      );
    }
  }

  // 2. Décrémentation atomique du stock quincaillerie
  for (const mat of materiaux) {
    const { error } = await supabase.rpc('decrementer_stock_produit', {
      p_produit_id: mat.produit_id,
      p_quantite: mat.quantite,
    });
    if (error) throw new Error(`Décrémentation stock [${mat.designation}] : ${error.message}`);
  }

  // 3. Détermination prix de vente final
  const prixVente = prixVenteOverride ?? bon.prix_vente_suggere;

  // 4. Mise à jour produit fini → DISPONIBLE
  const publieEcommerce = bon.produit_fini?.photos_urls?.length > 0;
  const { error: errPf } = await supabase
    .from('produits_finis')
    .update({
      statut: 'DISPONIBLE',
      prix_vente: prixVente,
      publie_ecommerce: publieEcommerce,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bon.produit_fini_id);

  if (errPf) throw new Error(`Mise à jour produit fini : ${errPf.message}`);

  // 5. Clôture du bon
  const { error: errBonUpd } = await supabase
    .from('bons_production')
    .update({
      statut: 'VALIDE',
      valide_par: validePar,
      date_validation: new Date().toISOString(),
    })
    .eq('id', bonId);

  if (errBonUpd) throw new Error(`Clôture bon : ${errBonUpd.message}`);

  return {
    bon_id: bonId,
    produit_fini_id: bon.produit_fini_id,
    prix_vente_final: prixVente,
    publie_ecommerce: publieEcommerce,
    materiaux_consommes: materiaux.length,
  };
}

/**
 * Stats de production : pièces fabriquées, délai moyen, rentabilité.
 */
async function getStatsProduction(debut = null, fin = null) {
  let q = supabase
    .from('v_rentabilite_production')
    .select('*')
    .eq('statut_bon', 'VALIDE');

  if (debut) q = q.gte('date_debut', debut);
  if (fin) q = q.lte('date_fin', fin);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  if (!data.length) {
    return { total: 0, ca_total: 0, cout_total: 0, marge_brute: 0, marge_pct_moy: 0, delai_moy_jours: null };
  }

  const stats = data.reduce((acc, r) => {
    acc.ca_total        += r.prix_vente || 0;
    acc.cout_total      += r.cout_total || 0;
    acc.marge_brute     += r.marge_brute || 0;
    acc.delais.push(r.duree_fabrication_jours);
    acc.par_type[r.type] = (acc.par_type[r.type] || 0) + 1;
    return acc;
  }, { ca_total: 0, cout_total: 0, marge_brute: 0, delais: [], par_type: {} });

  const delaisValides = stats.delais.filter(d => d !== null);
  const delaiMoy = delaisValides.length
    ? Math.round(delaisValides.reduce((s, d) => s + d, 0) / delaisValides.length)
    : null;

  return {
    total_pieces: data.length,
    ca_total: Math.round(stats.ca_total),
    cout_total: Math.round(stats.cout_total),
    marge_brute: Math.round(stats.marge_brute),
    marge_pct_moy: stats.cout_total > 0
      ? Math.round((stats.marge_brute / stats.cout_total) * 100 * 10) / 10
      : 0,
    delai_moyen_jours: delaiMoy,
    repartition_par_type: stats.par_type,
  };
}

module.exports = { calculerCoutProduction, validerBonProduction, getStatsProduction };
