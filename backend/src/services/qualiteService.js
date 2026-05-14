const supabase = require('../config/supabase');

/**
 * Crée une fiche de contrôle qualité pour un OF.
 */
async function creerFicheQC({ of_id, technicien_qc_id, criteres_verifies, defauts_constates, actions_correctives, photos_controle }) {
  // Déterminer la décision automatiquement
  const nb_criteres = (criteres_verifies || []).length;
  const nb_conformes = (criteres_verifies || []).filter(c => c.conforme).length;
  let decision = 'VALIDE';
  let produit_conforme = true;

  if (nb_criteres > 0) {
    const taux = nb_conformes / nb_criteres;
    if (taux < 0.7) {
      decision = 'REJET';
      produit_conforme = false;
    } else if (taux < 1.0) {
      decision = 'RETOUCHE';
      produit_conforme = false;
    }
  }

  const { data, error } = await supabase
    .from('fiches_controle_qualite')
    .insert({
      of_id,
      technicien_qc_id,
      criteres_verifies: criteres_verifies || [],
      photos_controle: photos_controle || [],
      defauts_constates,
      actions_correctives,
      decision,
      produit_conforme,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Une fiche QC existe déjà pour cet OF');
    throw new Error(error.message);
  }

  return data;
}

/**
 * Valide ou rejette une fiche QC (par le DG pour les rejets).
 */
async function validerFicheQC(fiche_id, decision, valide_par_dg) {
  const { data, error } = await supabase
    .from('fiches_controle_qualite')
    .update({
      decision,
      valide_par_dg,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fiche_id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Crée une retouche liée à une fiche QC.
 */
async function creerRetouche({ fiche_qc_id, of_id, type_defaut, temps_retouche_h, technicien_id }) {
  // Coût retouche = temps × taux horaire
  const { data: param } = await supabase
    .from('parametres_systeme')
    .select('valeur')
    .eq('cle', 'taux_horaire_xaf')
    .single();
  const taux = parseFloat(param?.valeur || '3000');
  const cout = Math.round(parseFloat(temps_retouche_h || 1) * taux);

  const { data, error } = await supabase
    .from('retouches')
    .insert({
      fiche_qc_id,
      of_id,
      type_defaut,
      temps_retouche_h: parseFloat(temps_retouche_h || 1),
      technicien_id,
      cout_retouche_xaf: cout,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Récupère les critères QC pour un type de produit.
 */
async function getCriteresType(type_produit) {
  const { data, error } = await supabase
    .from('criteres_qc_type')
    .select('*')
    .eq('type_produit', type_produit)
    .eq('obligatoire', true)
    .order('critere');

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Taux de conformité sur une période.
 */
async function getTauxConformite({ date_debut, date_fin } = {}) {
  let q = supabase
    .from('fiches_controle_qualite')
    .select('decision, of_id, date_controle');

  if (date_debut) q = q.gte('date_controle', date_debut);
  if (date_fin) q = q.lte('date_controle', date_fin);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const total = (data || []).length;
  if (total === 0) return { total: 0, valide: 0, retouche: 0, rejet: 0, taux_conformite: 0 };

  const valide = data.filter(f => f.decision === 'VALIDE').length;
  const retouche = data.filter(f => f.decision === 'RETOUCHE').length;
  const rejet = data.filter(f => f.decision === 'REJET').length;

  return {
    total,
    valide,
    retouche,
    rejet,
    taux_conformite: Math.round((valide / total) * 100),
    taux_retouche: Math.round((retouche / total) * 100),
    taux_rejet: Math.round((rejet / total) * 100),
  };
}

module.exports = {
  creerFicheQC,
  validerFicheQC,
  creerRetouche,
  getCriteresType,
  getTauxConformite,
};
