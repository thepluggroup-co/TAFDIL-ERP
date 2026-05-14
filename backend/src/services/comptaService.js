const supabase = require('../config/supabase');

// ── GRAND LIVRE ──────────────────────────────────────────────────
async function getGrandLivre({ compte, journal, date_debut, date_fin, exercice } = {}) {
  let q = supabase.from('v_grand_livre').select('*');
  if (compte)     q = q.like('compte', `${compte}%`);
  if (journal)    q = q.eq('journal', journal);
  if (exercice)   q = q.eq('exercice', parseInt(exercice));
  if (date_debut) q = q.gte('date', date_debut);
  if (date_fin)   q = q.lte('date', date_fin);
  q = q.order('date', { ascending: true }).order('piece_ref', { ascending: true });

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

// ── BALANCE SYSCOHADA ────────────────────────────────────────────
async function getBalance({ exercice } = {}) {
  let q = supabase.from('v_balance_syscohada').select('*');
  if (exercice) {
    // Re-filter via grand livre for specific year
    const lignes = await getGrandLivre({ exercice });
    const map = {};
    for (const l of lignes) {
      if (!map[l.compte]) map[l.compte] = { compte: l.compte, libelle_compte: l.libelle_compte, classe: l.classe, total_debit: 0, total_credit: 0 };
      map[l.compte].total_debit  += parseFloat(l.debit  || 0);
      map[l.compte].total_credit += parseFloat(l.credit || 0);
    }
    return Object.values(map).map(r => ({
      ...r,
      solde_debiteur:  Math.max(0, r.total_debit - r.total_credit),
      solde_crediteur: Math.max(0, r.total_credit - r.total_debit),
    })).sort((a, b) => a.compte.localeCompare(b.compte));
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

// ── ÉTATS FINANCIERS SIMPLIFIÉS ──────────────────────────────────
async function getEtatsFinanciers(exercice) {
  const balance = await getBalance({ exercice });

  const byClasse = {};
  for (const row of balance) {
    const cl = row.classe;
    if (!byClasse[cl]) byClasse[cl] = { debit: 0, credit: 0 };
    byClasse[cl].debit  += row.total_debit;
    byClasse[cl].credit += row.total_credit;
  }

  // Compte de résultat simplifié
  const produits  = (byClasse[7]?.credit || 0) - (byClasse[7]?.debit || 0);
  const charges   = (byClasse[6]?.debit  || 0) - (byClasse[6]?.credit || 0);
  const resultat  = produits - charges;

  // Bilan simplifié
  const actif_circulant  = (byClasse[3]?.debit || 0) - (byClasse[3]?.credit || 0);
  const actif_creances   = (byClasse[4]?.debit || 0);
  const tresorerie_actif = (byClasse[5]?.debit || 0);
  const immobilisations  = (byClasse[2]?.debit || 0) - (byClasse[2]?.credit || 0);
  const total_actif      = immobilisations + actif_circulant + actif_creances + tresorerie_actif;

  const dettes_court  = (byClasse[4]?.credit || 0);
  const ressources    = (byClasse[1]?.credit || 0) - (byClasse[1]?.debit || 0);
  const total_passif  = dettes_court + ressources + resultat;

  return {
    exercice,
    compte_resultat: {
      produits: Math.round(produits),
      charges: Math.round(charges),
      resultat_net: Math.round(resultat),
    },
    bilan: {
      actif: {
        immobilisations: Math.round(immobilisations),
        stocks: Math.round(actif_circulant),
        creances_clients: Math.round(actif_creances),
        tresorerie: Math.round(tresorerie_actif),
        total: Math.round(total_actif),
      },
      passif: {
        capitaux_propres: Math.round(ressources + resultat),
        dettes_court_terme: Math.round(dettes_court),
        total: Math.round(total_passif),
      },
    },
  };
}

// ── EXPORT SAGE CSV ──────────────────────────────────────────────
async function exportSageCSV({ date_debut, date_fin, journal, exercice }) {
  const lignes = await getGrandLivre({ date_debut, date_fin, journal, exercice });
  const rows = [
    'Date;Journal;Piece;Compte;Libelle;Debit;Credit',
    ...lignes.map(l =>
      [
        l.date, l.journal, l.piece_ref || '',
        l.compte, `"${(l.libelle || '').replace(/"/g, '""')}"`,
        (l.debit  || 0).toFixed(0),
        (l.credit || 0).toFixed(0),
      ].join(';')
    ),
  ];
  return rows.join('\r\n');
}

// ── CRÉER ÉCRITURE MANUELLE ──────────────────────────────────────
async function creerEcritureManuelle({ date, journal, libelle, lignes, source_type, source_id }) {
  const { data, error } = await supabase
    .from('ecritures_comptables')
    .insert({ date, journal, libelle, lignes, source_type, source_id, statut: 'VALIDE' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── VALIDER ÉCRITURE ─────────────────────────────────────────────
async function validerEcriture(id, valide_par) {
  const { data, error } = await supabase
    .from('ecritures_comptables')
    .update({ statut: 'VALIDE', valide_par })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── JOURNAUX DISPONIBLES ─────────────────────────────────────────
async function getJournaux() {
  const { data, error } = await supabase
    .from('ecritures_comptables')
    .select('journal')
    .order('journal');
  if (error) throw new Error(error.message);
  const uniq = [...new Set((data || []).map(r => r.journal))];
  return uniq;
}

module.exports = {
  getGrandLivre, getBalance, getEtatsFinanciers,
  exportSageCSV, creerEcritureManuelle, validerEcriture, getJournaux,
};
