const supabase = require('../config/supabase');

/**
 * Enregistre l'arrivée d'un employé (horodatage serveur).
 */
async function enregistrerArrivee(employe_id, mode = 'MOBILE_APP') {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Upsert : si déjà pointé aujourd'hui, met à jour l'heure d'arrivée
  const { data, error } = await supabase
    .from('pointages')
    .upsert(
      {
        employe_id,
        date: today,
        heure_arrivee: now.toISOString(),
        mode,
      },
      { onConflict: 'employe_id,date' }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Enregistre la sortie d'un employé — le trigger calculer_heures_pointage
 * calcule automatiquement heures_normales et heures_supplementaires.
 */
async function enregistrerSortie(employe_id) {
  const today = new Date().toISOString().slice(0, 10);

  // Vérifier qu'il y a bien une entrée
  const { data: existing } = await supabase
    .from('pointages')
    .select('id, heure_arrivee')
    .eq('employe_id', employe_id)
    .eq('date', today)
    .single();

  if (!existing) throw new Error('Aucune arrivée enregistrée aujourd\'hui');
  if (!existing.heure_arrivee) throw new Error('Heure d\'arrivée manquante');

  const { data, error } = await supabase
    .from('pointages')
    .update({ heure_depart: new Date().toISOString() })
    .eq('id', existing.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Récapitulatif mensuel d'un employé pour la paie.
 * Retourne heures normales, heures sup, jours travaillés, absences.
 */
async function getRecapMensuel(employe_id, annee, mois) {
  const dateDebut = `${annee}-${String(mois).padStart(2, '0')}-01`;
  const dateFin = new Date(annee, mois, 0).toISOString().slice(0, 10); // dernier jour du mois

  const [pointagesR, absencesR] = await Promise.all([
    supabase
      .from('pointages')
      .select('*')
      .eq('employe_id', employe_id)
      .gte('date', dateDebut)
      .lte('date', dateFin)
      .order('date'),
    supabase
      .from('absences')
      .select('*')
      .eq('employe_id', employe_id)
      .gte('date', dateDebut)
      .lte('date', dateFin),
  ]);

  const pointages = pointagesR.data || [];
  const absences = absencesR.data || [];

  const heures_normales_total = pointages.reduce((s, p) => s + parseFloat(p.heures_normales || 0), 0);
  const heures_sup_total = pointages.reduce((s, p) => s + parseFloat(p.heures_supplementaires || 0), 0);

  // Montant heures sup : taux horaire × heures × majoration
  // Le taux horaire est calculé dans paieService, ici on renvoie les données brutes
  const jours_travailles = pointages.filter(p => p.heure_arrivee && p.heure_depart).length;
  const absences_impact_paie = absences.filter(a => a.impact_paie).length;

  return {
    employe_id,
    annee,
    mois,
    jours_travailles,
    heures_normales_total: Math.round(heures_normales_total * 100) / 100,
    heures_sup_total: Math.round(heures_sup_total * 100) / 100,
    absences_total: absences.length,
    absences_impact_paie,
    pointages,
    absences,
  };
}

/**
 * Récapitulatif de tous les employés pour un mois (appel paie globale).
 */
async function getRecapMensuelTous(annee, mois) {
  const { data: employes } = await supabase
    .from('employes')
    .select('id, matricule, nom, prenom')
    .eq('statut', 'ACTIF');

  const recaps = await Promise.all(
    (employes || []).map(e => getRecapMensuel(e.id, annee, mois))
  );

  return recaps;
}

/**
 * Pointage manuel (superviseur) — override sur une date précise.
 */
async function pointageManuel({ employe_id, date, heure_arrivee, heure_depart, observations, valide_par }) {
  const { data, error } = await supabase
    .from('pointages')
    .upsert(
      {
        employe_id,
        date,
        heure_arrivee: heure_arrivee ? new Date(`${date}T${heure_arrivee}`).toISOString() : null,
        heure_depart: heure_depart ? new Date(`${date}T${heure_depart}`).toISOString() : null,
        mode: 'MANUEL',
        observations,
        valide_par_superviseur: valide_par,
      },
      { onConflict: 'employe_id,date' }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

module.exports = { enregistrerArrivee, enregistrerSortie, getRecapMensuel, getRecapMensuelTous, pointageManuel };
