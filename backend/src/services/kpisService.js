const supabase = require('../config/supabase');

// ── PILOTAGE CHANTIERS ───────────────────────────────────────────
async function getPilotageChantiers({ statut } = {}) {
  let q = supabase.from('v_pilotage_chantiers').select('*');
  if (statut) q = q.eq('statut', statut);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const chantiers = data || [];
  const total_budget  = chantiers.reduce((s, c) => s + parseFloat(c.budget_devis  || 0), 0);
  const total_cout    = chantiers.reduce((s, c) => s + parseFloat(c.cout_reel     || 0), 0);
  const total_marge   = total_budget - total_cout;
  const marge_pct_global = total_budget > 0 ? Math.round(total_marge / total_budget * 100 * 10) / 10 : 0;

  return {
    synthese: {
      nb_chantiers: chantiers.length,
      total_budget: Math.round(total_budget),
      total_cout: Math.round(total_cout),
      marge_brute: Math.round(total_marge),
      marge_pct: marge_pct_global,
      nb_rouge:   chantiers.filter(c => c.indicateur_marge === 'ROUGE').length,
      nb_orange:  chantiers.filter(c => c.indicateur_marge === 'ORANGE').length,
      nb_vert:    chantiers.filter(c => c.indicateur_marge === 'VERT').length,
    },
    chantiers,
  };
}

// ── ALERTES PRÉDICTIVES STOCK ────────────────────────────────────
async function getAlertesPredictives() {
  const { data, error } = await supabase
    .from('v_alertes_predictives_stock')
    .select('*')
    .order('jours_restants', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);

  const alertes = data || [];
  return {
    nb_alerte_rouge:  alertes.filter(a => a.niveau_alerte === 'ALERTE_ROUGE').length,
    nb_alerte_orange: alertes.filter(a => a.niveau_alerte === 'ALERTE_ORANGE').length,
    alertes,
  };
}

// ── TRÉSORERIE PRÉVISIONNELLE 30J ────────────────────────────────
async function getTresoreriePrevisionnelle() {
  const { data, error } = await supabase
    .from('v_tresorerie_previsionnelle')
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  // Ajouter solde caisse actuel (simplification : somme des encaissements récents)
  const { data: caisse } = await supabase
    .from('ecritures_comptables')
    .select('lignes')
    .in('journal', ['CAISSE','VENTES'])
    .gte('date', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
    .limit(500);

  let solde_caisse = 0;
  for (const ec of (caisse || [])) {
    for (const l of (ec.lignes || [])) {
      if (['571000','521000','585000'].includes(l.compte)) {
        solde_caisse += parseFloat(l.debit || 0) - parseFloat(l.credit || 0);
      }
    }
  }

  return { ...data, solde_caisse_actuel: Math.round(solde_caisse) };
}

// ── PERFORMANCE ATELIER ──────────────────────────────────────────
async function getPerformanceAtelier() {
  const { data, error } = await supabase
    .from('v_performance_atelier')
    .select('*')
    .order('ratio_reel_estime', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// ── DASHBOARD GLOBAL ─────────────────────────────────────────────
async function getDashboardGlobal() {
  const [chantiers, alertes, tresorerie, atelier] = await Promise.all([
    getPilotageChantiers(),
    getAlertesPredictives(),
    getTresoreriePrevisionnelle(),
    getPerformanceAtelier(),
  ]);

  // KPIs ventes du mois
  const debut_mois = new Date();
  debut_mois.setDate(1);
  const { data: ventes_mois } = await supabase
    .from('ventes_comptoir')
    .select('montant_ttc')
    .gte('created_at', debut_mois.toISOString());
  const ca_mois = (ventes_mois || []).reduce((s, v) => s + parseFloat(v.montant_ttc || 0), 0);

  // Commandes en cours
  const { count: nb_cmd_en_cours } = await supabase
    .from('commandes_produits_finis')
    .select('id', { count: 'exact', head: true })
    .not('statut', 'in', '("ANNULE","LIVRE")');

  // Clients risque C/D
  const { count: nb_risque } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .in('score_risque', ['C', 'D']);

  return {
    ca_mois: Math.round(ca_mois),
    nb_cmd_en_cours: nb_cmd_en_cours || 0,
    nb_clients_risque: nb_risque || 0,
    chantiers: chantiers.synthese,
    alertes_stock: { nb_rouge: alertes.nb_alerte_rouge, nb_orange: alertes.nb_alerte_orange },
    tresorerie,
    atelier_alertes: atelier.filter(a => a.alerte === 'SOUS_EVALUE'),
  };
}

module.exports = {
  getPilotageChantiers, getAlertesPredictives,
  getTresoreriePrevisionnelle, getPerformanceAtelier, getDashboardGlobal,
};
