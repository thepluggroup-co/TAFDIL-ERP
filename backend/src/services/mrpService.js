const supabase = require('../config/supabase');

const COEFF_CHUTE = 1.08; // 8% chute métal par défaut

/**
 * Explose la nomenclature (BOM) pour un ordre de fabrication.
 * Calcule les besoins matières et les sauvegarde dans of_besoins_materiaux.
 */
async function exploserBOM(of_id) {
  // 1. Récupérer l'OF
  const { data: of_row, error: of_err } = await supabase
    .from('ordres_fabrication')
    .select('*')
    .eq('id', of_id)
    .single();

  if (of_err || !of_row) throw new Error('Ordre de fabrication introuvable');
  if (!['PLANIFIE', 'EN_ATTENTE_MATIERE'].includes(of_row.statut)) {
    throw new Error(`L'OF est en statut ${of_row.statut}, explosion BOM impossible`);
  }

  const dims = of_row.dimensions;
  const L = parseFloat(dims.largeur_m ?? 1);
  const H = parseFloat(dims.hauteur_m ?? 2);
  const Q = parseInt(dims.quantite ?? 1, 10);
  const perim = (L + H) * 2;

  // 2. Trouver la nomenclature active pour ce type_produit
  const { data: nomen, error: nomen_err } = await supabase
    .from('nomenclatures_types')
    .select('*, lignes:nomenclatures_lignes(*)')
    .eq('type_produit', of_row.type_produit)
    .eq('actif', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (nomen_err || !nomen) {
    throw new Error(`Aucune nomenclature active pour le type ${of_row.type_produit}`);
  }

  const coeff = parseFloat(nomen.coefficient_chute ?? COEFF_CHUTE);

  // 3. Calculer les besoins ligne par ligne
  const besoins = [];
  for (const ligne of (nomen.lignes || [])) {
    const qte_base = (
      (parseFloat(ligne.quantite_par_m2 ?? 0) * L * H) +
      (parseFloat(ligne.quantite_par_ml ?? 0) * perim) +
      parseFloat(ligne.quantite_fixe ?? 0)
    ) * Q * coeff;

    const qte = Math.ceil(qte_base * 1000) / 1000; // arrondi sup 3 décimales

    // Vérifier stock disponible si produit en base
    let statut_dispo = 'DISPONIBLE';
    if (ligne.produit_quincaillerie_id) {
      const { data: prod } = await supabase
        .from('produits')
        .select('stock_actuel')
        .eq('id', ligne.produit_quincaillerie_id)
        .single();

      if (!prod) {
        statut_dispo = 'RUPTURE';
      } else if (prod.stock_actuel < qte) {
        statut_dispo = prod.stock_actuel > 0 ? 'PARTIEL' : 'RUPTURE';
      }
    }

    besoins.push({
      of_id,
      produit_quincaillerie_id: ligne.produit_quincaillerie_id || null,
      designation_matiere: ligne.designation_matiere || null,
      quantite_theorique: qte,
      quantite_reelle: 0,
      unite: ligne.unite,
      statut_dispo,
    });
  }

  // 4. Supprimer les anciens besoins puis réinsérer (idempotent)
  await supabase.from('of_besoins_materiaux').delete().eq('of_id', of_id);

  if (besoins.length > 0) {
    const { error: ins_err } = await supabase
      .from('of_besoins_materiaux')
      .insert(besoins);
    if (ins_err) throw new Error(ins_err.message);
  }

  // 5. Mettre à jour statut OF : si au moins 1 RUPTURE → EN_ATTENTE_MATIERE, sinon PLANIFIE
  const has_rupture = besoins.some(b => b.statut_dispo !== 'DISPONIBLE');
  await supabase
    .from('ordres_fabrication')
    .update({
      statut: has_rupture ? 'EN_ATTENTE_MATIERE' : 'PLANIFIE',
      updated_at: new Date().toISOString(),
    })
    .eq('id', of_id);

  return {
    of_id,
    reference: of_row.reference,
    type_produit: of_row.type_produit,
    dimensions: { largeur_m: L, hauteur_m: H, quantite: Q },
    nomenclature: { id: nomen.id, designation: nomen.designation_type, version: nomen.version },
    besoins,
    statut_global: has_rupture ? 'EN_ATTENTE_MATIERE' : 'DISPONIBLE',
    nb_lignes: besoins.length,
    nb_ruptures: besoins.filter(b => b.statut_dispo === 'RUPTURE').length,
    nb_partiels: besoins.filter(b => b.statut_dispo === 'PARTIEL').length,
  };
}

/**
 * Retourne le planning des OF pour une période donnée.
 * Inclut la charge journalière vs capacité.
 */
async function getPlanning({ date_debut, date_fin }) {
  const debut = date_debut || new Date().toISOString().slice(0, 10);
  const fin = date_fin || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const { data: ofs, error } = await supabase
    .from('ordres_fabrication')
    .select(`
      id, reference, type_produit, statut, priorite,
      dimensions, heures_estimees,
      date_planifiee_debut, date_planifiee_fin,
      technicien:technicien_assigne_id (
        id, email, raw_user_meta_data
      )
    `)
    .gte('date_planifiee_debut', debut)
    .lte('date_planifiee_debut', fin)
    .not('statut', 'in', '("ANNULE","TERMINE")')
    .order('date_planifiee_debut')
    .order('priorite');

  if (error) throw new Error(error.message);

  const { data: capacites } = await supabase
    .from('capacite_atelier')
    .select('*')
    .gte('date', debut)
    .lte('date', fin)
    .order('date');

  // Indexer capacité par date
  const cap_map = {};
  for (const c of (capacites || [])) cap_map[c.date] = c;

  // Grouper les OF par date
  const planning = {};
  for (const of_row of (ofs || [])) {
    const d = of_row.date_planifiee_debut;
    if (!planning[d]) {
      planning[d] = {
        date: d,
        ofs: [],
        capacite: cap_map[d] || { heures_disponibles: 8, heures_allouees: 0, fermeture: false },
      };
    }
    planning[d].ofs.push(of_row);
  }

  return Object.values(planning).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Assigne un technicien à un OF.
 */
async function assignerTechnicien(of_id, technicien_id) {
  const { data, error } = await supabase
    .from('ordres_fabrication')
    .update({ technicien_assigne_id: technicien_id, updated_at: new Date().toISOString() })
    .eq('id', of_id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * CRUD OF — liste paginée avec filtres.
 */
async function listeOF({ statut, technicien_id, date_debut, date_fin, page = 1, limit = 20 }) {
  let q = supabase
    .from('ordres_fabrication')
    .select(`
      id, reference, type_produit, statut, priorite,
      dimensions, heures_estimees,
      date_planifiee_debut, date_planifiee_fin,
      date_debut_reel, date_fin_reel,
      observations_atelier,
      technicien:technicien_assigne_id (id, email, raw_user_meta_data),
      commande:commande_id (id, numero),
      devis:devis_id (id, reference, montant_ttc)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (statut) q = q.eq('statut', statut);
  if (technicien_id) q = q.eq('technicien_assigne_id', technicien_id);
  if (date_debut) q = q.gte('date_planifiee_debut', date_debut);
  if (date_fin) q = q.lte('date_planifiee_debut', date_fin);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { ofs: data, total: count, page, limit };
}

/**
 * Démarrer/mettre à jour le statut d'un OF.
 */
async function mettreAJourStatutOF(of_id, nouveau_statut, user_id) {
  const updates = { statut: nouveau_statut, updated_at: new Date().toISOString() };

  if (nouveau_statut === 'EN_COURS') {
    updates.date_debut_reel = new Date().toISOString();
  }
  if (nouveau_statut === 'TERMINE') {
    updates.date_fin_reel = new Date().toISOString();
    updates.valide_par_dg = user_id;
  }

  const { data, error } = await supabase
    .from('ordres_fabrication')
    .update(updates)
    .eq('id', of_id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Récupère les besoins matières d'un OF avec disponibilité stock en temps réel.
 */
async function getBesoinsOF(of_id) {
  const { data, error } = await supabase
    .from('of_besoins_materiaux')
    .select(`
      *,
      produit:produit_quincaillerie_id (
        id, reference, designation, stock_actuel, unite
      )
    `)
    .eq('of_id', of_id)
    .order('statut_dispo');

  if (error) throw new Error(error.message);
  return data;
}

module.exports = {
  exploserBOM,
  getPlanning,
  assignerTechnicien,
  listeOF,
  mettreAJourStatutOF,
  getBesoinsOF,
};
