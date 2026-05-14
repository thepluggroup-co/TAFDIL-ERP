const supabase = require('../config/supabase');

/**
 * Alertes de maintenance depuis la vue v_alertes_maintenance.
 */
async function getAlertes() {
  const { data, error } = await supabase
    .from('v_alertes_maintenance')
    .select('*')
    .order('alerte')
    .order('jours_avant_echeance');

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Liste des équipements avec leur statut.
 */
async function getEquipements() {
  const { data, error } = await supabase
    .from('equipements')
    .select(`
      *,
      plans:plans_maintenance (
        id, type, frequence_jours, prochaine_maintenance_date, description_operations, cout_estime_xaf
      ),
      interventions_recentes:interventions_maintenance (
        id, type, date_debut, date_fin, cout_reel_xaf, technicien_prestataire
      )
    `)
    .not('statut', 'eq', 'HORS_SERVICE')
    .order('nom');

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Crée une intervention de maintenance (corrective ou préventive).
 */
async function creerIntervention({ equipement_id, plan_id, type, description_panne, technicien_prestataire, impact_production }) {
  const { data, error } = await supabase
    .from('interventions_maintenance')
    .insert({
      equipement_id,
      plan_id: plan_id || null,
      type,
      description_panne,
      technicien_prestataire,
      impact_production,
      date_debut: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Clôture une intervention (saisie date_fin + coût + pièces).
 */
async function clotureIntervention(intervention_id, { actions_realisees, pieces_remplacees, cout_reel_xaf }) {
  const { data, error } = await supabase
    .from('interventions_maintenance')
    .update({
      date_fin: new Date().toISOString(),
      actions_realisees,
      pieces_remplacees: pieces_remplacees || [],
      cout_reel_xaf: parseFloat(cout_reel_xaf || 0),
    })
    .eq('id', intervention_id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Coûts de maintenance agrégés par équipement sur une période.
 */
async function getCoutsMaintenance({ date_debut, date_fin } = {}) {
  let q = supabase
    .from('interventions_maintenance')
    .select(`
      equipement_id, type, cout_reel_xaf, date_debut,
      equipement:equipement_id (nom, localisation)
    `);

  if (date_debut) q = q.gte('date_debut', date_debut);
  if (date_fin) q = q.lte('date_debut', date_fin);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // Agréger par équipement
  const agg = {};
  for (const i of (data || [])) {
    const key = i.equipement_id;
    if (!agg[key]) {
      agg[key] = {
        equipement_id: key,
        nom: i.equipement?.nom,
        localisation: i.equipement?.localisation,
        cout_total: 0,
        cout_preventif: 0,
        cout_correctif: 0,
        nb_interventions: 0,
      };
    }
    const cout = parseFloat(i.cout_reel_xaf || 0);
    agg[key].cout_total += cout;
    agg[key].nb_interventions += 1;
    if (i.type === 'PREVENTIVE') agg[key].cout_preventif += cout;
    else agg[key].cout_correctif += cout;
  }

  return Object.values(agg).sort((a, b) => b.cout_total - a.cout_total);
}

/**
 * Crée ou met à jour un plan de maintenance préventive.
 */
async function upsertPlanMaintenance({ id, equipement_id, type, frequence_jours, description_operations, cout_estime_xaf }) {
  const payload = {
    equipement_id,
    type: type || 'PREVENTIVE',
    frequence_jours: parseInt(frequence_jours, 10),
    description_operations,
    cout_estime_xaf: parseFloat(cout_estime_xaf || 0),
    prochaine_maintenance_date: new Date(Date.now() + parseInt(frequence_jours, 10) * 86400000)
      .toISOString().slice(0, 10),
  };

  if (id) {
    const { data, error } = await supabase
      .from('plans_maintenance')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from('plans_maintenance')
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

module.exports = {
  getAlertes,
  getEquipements,
  creerIntervention,
  clotureIntervention,
  getCoutsMaintenance,
  upsertPlanMaintenance,
};
