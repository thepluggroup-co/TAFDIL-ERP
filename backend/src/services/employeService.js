const supabase = require('../config/supabase');

async function listeEmployes({ departement, statut, type_contrat, page = 1, limit = 30 } = {}) {
  let q = supabase
    .from('employes')
    .select(`
      id, matricule, nom, prenom, poste, departement,
      type_contrat, date_embauche, date_fin_contrat,
      salaire_base_xaf, statut, telephone, photo_url,
      cnps_numero_affiliation
    `, { count: 'exact' })
    .order('nom')
    .range((page - 1) * limit, page * limit - 1);

  if (departement) q = q.eq('departement', departement);
  if (statut)      q = q.eq('statut', statut);
  if (type_contrat) q = q.eq('type_contrat', type_contrat);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { employes: data, total: count, page, limit };
}

async function getEmploye(id) {
  const { data, error } = await supabase
    .from('employes')
    .select(`
      *,
      contrats (id, type, date_debut, date_fin, salaire_base, document_url, created_at),
      soldes_conges (jours_acquis, jours_pris, jours_restants, annee),
      evaluations (
        id, periode, annee, date_evaluation, note_globale, mention
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function creerEmploye(payload, cree_par) {
  // Génération matricule
  const { data: mat } = await supabase.rpc('next_matricule');
  const matricule = mat || `EMP-${Date.now()}`;

  const { data, error } = await supabase
    .from('employes')
    .insert({ ...payload, matricule })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Créer contrat initial
  await supabase.from('contrats').insert({
    employe_id: data.id,
    type: payload.type_contrat,
    date_debut: payload.date_embauche || new Date().toISOString().slice(0, 10),
    date_fin: payload.date_fin_contrat || null,
    salaire_base: payload.salaire_base_xaf,
    cree_par,
  });

  // Créer solde congés
  await supabase.from('soldes_conges').insert({ employe_id: data.id }).catch(() => {});

  return data;
}

async function mettreAJourEmploye(id, payload, modifie_par) {
  const { data: ancien } = await supabase.from('employes').select('*').eq('id', id).single();

  const { data, error } = await supabase
    .from('employes')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Historique si changement de poste ou salaire
  const mouvements = [];
  if (ancien && payload.poste && ancien.poste !== payload.poste) {
    mouvements.push({ type: 'MUTATION', ancien_poste: ancien.poste, nouveau_poste: payload.poste });
  }
  if (ancien && payload.salaire_base_xaf && ancien.salaire_base_xaf !== parseFloat(payload.salaire_base_xaf)) {
    mouvements.push({
      type: 'AUGMENTATION',
      ancien_salaire: ancien.salaire_base_xaf,
      nouveau_salaire: payload.salaire_base_xaf,
    });
  }
  for (const m of mouvements) {
    await supabase.from('mouvements_rh').insert({
      employe_id: id,
      ...m,
      motif: payload.motif_mouvement || '',
      cree_par: modifie_par,
    }).catch(() => {});
  }

  return data;
}

async function getHistorique(employe_id) {
  const { data, error } = await supabase
    .from('mouvements_rh')
    .select('*')
    .eq('employe_id', employe_id)
    .order('date_mouvement', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

async function getAlertesRH() {
  const { data, error } = await supabase
    .from('v_alertes_rh')
    .select('*')
    .order('jours_restants');

  if (error) throw new Error(error.message);
  return data || [];
}

// Congés
async function demanderConge({ employe_id, type, date_debut, date_fin, motif }) {
  // Calculer jours ouvrables (exclut sam/dim)
  const debut = new Date(date_debut);
  const fin = new Date(date_fin);
  let nb_jours = 0;
  const cur = new Date(debut);
  while (cur <= fin) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) nb_jours++;
    cur.setDate(cur.getDate() + 1);
  }

  const { data, error } = await supabase
    .from('conges')
    .insert({ employe_id, type, date_debut, date_fin, nb_jours_ouvrables: nb_jours, motif })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function validerConge(id, statut, valide_par) {
  const { data: conge } = await supabase.from('conges').select('*').eq('id', id).single();
  if (!conge) throw new Error('Congé introuvable');

  const { data, error } = await supabase
    .from('conges')
    .update({ statut, valide_par, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Si validé : décrémenter le solde
  if (statut === 'VALIDE' && conge.type === 'ANNUEL') {
    await supabase
      .from('soldes_conges')
      .update({
        jours_pris: supabase.rpc('coalesce', {}), // handled below
        updated_at: new Date().toISOString(),
      })
      .eq('employe_id', conge.employe_id);

    // Simple update via rpc-free approach
    const { data: solde } = await supabase
      .from('soldes_conges')
      .select('jours_pris')
      .eq('employe_id', conge.employe_id)
      .single();

    if (solde) {
      await supabase
        .from('soldes_conges')
        .update({ jours_pris: parseFloat(solde.jours_pris) + (conge.nb_jours_ouvrables || 0) })
        .eq('employe_id', conge.employe_id);
    }
  }

  return data;
}

// Évaluations
async function creerEvaluation({ employe_id, evaluateur_id, periode, annee, criteres, commentaire, objectifs }) {
  if (!criteres || criteres.length === 0) throw new Error('Critères requis');

  const somme = criteres.reduce((s, c) => s + parseFloat(c.note_sur_5 || 0), 0);
  const note_globale = Math.round((somme / criteres.length) * 100) / 100;

  const mention =
    note_globale >= 4.5 ? 'EXCELLENT' :
    note_globale >= 3.5 ? 'TRES_BIEN' :
    note_globale >= 2.5 ? 'BIEN' :
    note_globale >= 1.5 ? 'MOYEN' : 'INSUFFISANT';

  const { data, error } = await supabase
    .from('evaluations')
    .insert({
      employe_id,
      evaluateur_id,
      periode,
      annee: annee || new Date().getFullYear(),
      criteres,
      note_globale,
      commentaire,
      objectifs_periode_suivante: objectifs,
      mention,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

module.exports = {
  listeEmployes, getEmploye, creerEmploye, mettreAJourEmploye,
  getHistorique, getAlertesRH, demanderConge, validerConge, creerEvaluation,
};
