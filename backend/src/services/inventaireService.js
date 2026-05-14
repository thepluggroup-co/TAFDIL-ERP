const supabase = require('../config/supabase');

// ── EMPLACEMENTS ─────────────────────────────────────────────────
async function getEmplacements() {
  const { data, error } = await supabase
    .from('emplacements')
    .select('*')
    .eq('actif', true)
    .order('code');
  if (error) throw new Error(error.message);
  return data || [];
}

// ── STOCK CONSOLIDÉ ──────────────────────────────────────────────
async function getStockConsolide({ emplacement_id, search } = {}) {
  let q = supabase.from('v_stock_consolide').select('*');
  if (search) q = q.ilike('designation', `%${search}%`);
  const { data, error } = await q.order('designation');
  if (error) throw new Error(error.message);
  if (emplacement_id) {
    return (data || []).filter(p =>
      (p.par_emplacement || []).some(e => e.emplacement_id === emplacement_id)
    );
  }
  return data || [];
}

// ── SESSIONS INVENTAIRE ──────────────────────────────────────────
async function listerSessions({ statut } = {}) {
  let q = supabase.from('sessions_inventaire')
    .select('*, emplacement:emplacement_id(code,designation)')
    .order('created_at', { ascending: false });
  if (statut) q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function creerSession({ emplacement_id, responsable_id }) {
  // Vérifier qu'il n'y a pas de session EN_COURS sur cet emplacement
  const { data: existing } = await supabase
    .from('sessions_inventaire')
    .select('id')
    .eq('emplacement_id', emplacement_id)
    .eq('statut', 'EN_COURS')
    .limit(1)
    .single();
  if (existing) throw new Error('Une session d\'inventaire est déjà en cours sur cet emplacement.');

  // Pré-charger les lignes depuis stock ERP
  const { data: stocks } = await supabase
    .from('stocks_emplacements')
    .select('produit_id, quantite')
    .eq('emplacement_id', emplacement_id);

  const { data: session, error } = await supabase
    .from('sessions_inventaire')
    .insert({ emplacement_id, responsable_id })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Créer les lignes avec stock_theorique
  if (stocks && stocks.length > 0) {
    const lignes = stocks.map(s => ({
      session_id: session.id,
      produit_id: s.produit_id,
      emplacement_id,
      stock_theorique: s.quantite,
    }));
    await supabase.from('lignes_inventaire').insert(lignes);
  }

  return session;
}

async function getLignesSession(session_id) {
  const { data, error } = await supabase
    .from('lignes_inventaire')
    .select('*, produit:produit_id(reference,designation,unite)')
    .eq('session_id', session_id)
    .order('produit_id');
  if (error) throw new Error(error.message);
  return data || [];
}

async function saisirLigne({ session_id, ligne_id, stock_compte, justification }) {
  const { data, error } = await supabase
    .from('lignes_inventaire')
    .update({ stock_compte, justification })
    .eq('id', ligne_id)
    .eq('session_id', session_id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function validerInventaire(session_id, valide_par) {
  const { error } = await supabase.rpc('valider_inventaire', {
    p_session_id: session_id,
    p_valide_par: valide_par,
  });
  if (error) throw new Error(error.message);

  const { data } = await supabase
    .from('sessions_inventaire')
    .select('*, emplacement:emplacement_id(code,designation)')
    .eq('id', session_id)
    .single();
  return data;
}

// ── TRANSFERTS INTER-SITES ────────────────────────────────────────
async function listerTransferts({ statut } = {}) {
  let q = supabase
    .from('mouvements_inter_sites')
    .select(`
      *,
      produit:produit_id(reference,designation,unite),
      source:emplacement_source(code,designation),
      cible:emplacement_cible(code,designation)
    `)
    .order('created_at', { ascending: false });
  if (statut) q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function creerTransfert({ produit_id, emplacement_source, emplacement_cible, quantite, motif, demandeur_id, notes }) {
  // Vérifier stock source
  const { data: stockSrc } = await supabase
    .from('stocks_emplacements')
    .select('quantite')
    .eq('produit_id', produit_id)
    .eq('emplacement_id', emplacement_source)
    .single();

  if (!stockSrc || parseFloat(stockSrc.quantite) < parseFloat(quantite)) {
    throw new Error('Stock insuffisant sur l\'emplacement source.');
  }

  const num = await nextNumTransfert();
  const { data, error } = await supabase
    .from('mouvements_inter_sites')
    .insert({ reference: num, produit_id, emplacement_source, emplacement_cible, quantite, motif, demandeur_id, notes })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function validerTransfert(id, valide_par) {
  const { data, error } = await supabase
    .from('mouvements_inter_sites')
    .update({ statut: 'VALIDE', valide_par })
    .eq('id', id)
    .eq('statut', 'EN_ATTENTE')
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function annulerTransfert(id) {
  const { data, error } = await supabase
    .from('mouvements_inter_sites')
    .update({ statut: 'ANNULE' })
    .eq('id', id)
    .eq('statut', 'EN_ATTENTE')
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function nextNumTransfert() {
  const year = new Date().getFullYear().toString().slice(-2);
  const { count } = await supabase
    .from('mouvements_inter_sites')
    .select('id', { count: 'exact', head: true });
  return `TRF-${year}-${String((count || 0) + 1).padStart(4, '0')}`;
}

module.exports = {
  getEmplacements, getStockConsolide,
  listerSessions, creerSession, getLignesSession, saisirLigne, validerInventaire,
  listerTransferts, creerTransfert, validerTransfert, annulerTransfert,
};
