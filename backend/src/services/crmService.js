const supabase = require('../config/supabase');

// ── PIPELINE ────────────────────────────────────────────────────
async function getPipeline() {
  const { data, error } = await supabase
    .from('clients')
    .select(`
      id, nom, telephone, pipeline_statut, score_risque,
      encours_total_xaf, charge_commercial_id,
      devis:devis (id, reference, montant_ttc, statut, created_at)
    `)
    .not('pipeline_statut', 'eq', 'PERDU')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  // Grouper par colonne Kanban
  const colonnes = {
    PROSPECT:    [],
    DEVIS_ENVOYE:[],
    NEGOCIATION: [],
    GAGNE:       [],
  };
  for (const c of (data || [])) {
    const col = c.pipeline_statut || 'PROSPECT';
    if (colonnes[col]) colonnes[col].push(c);
  }
  return colonnes;
}

async function mettreAJourPipeline(client_id, statut, charge_commercial_id) {
  const { data, error } = await supabase
    .from('clients')
    .update({
      pipeline_statut: statut,
      charge_commercial_id: charge_commercial_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', client_id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── HISTORIQUE 360° ─────────────────────────────────────────────
async function getHistorique360(client_id) {
  const { data, error } = await supabase
    .from('v_historique_client_360')
    .select('*')
    .eq('client_id', client_id)
    .order('date_event', { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return data || [];
}

// ── ENCOURS & RETARDS ────────────────────────────────────────────
async function getEncours(client_id) {
  const { data: commandes } = await supabase
    .from('commandes_produits_finis')
    .select(`
      id, numero, montant_total, statut, created_at,
      acomptes (montant_xaf, statut, date_paiement)
    `)
    .eq('client_id', client_id)
    .not('statut', 'in', '("ANNULE","LIVRE")');

  let encours_total = 0;
  let retard_jours_max = 0;
  const detail = [];

  for (const cmd of (commandes || [])) {
    const paye = (cmd.acomptes || [])
      .filter(a => a.statut === 'VALIDE')
      .reduce((s, a) => s + parseFloat(a.montant_xaf || 0), 0);
    const reste = parseFloat(cmd.montant_total) - paye;
    const age = Math.floor((Date.now() - new Date(cmd.created_at)) / 86400000);

    encours_total += reste;
    if (reste > 0) retard_jours_max = Math.max(retard_jours_max, age);
    detail.push({ ...cmd, montant_reste: reste, age_jours: age, montant_paye: paye });
  }

  // Recalculer le score risque
  await supabase.rpc('calculer_score_risque', { p_client_id: client_id }).catch(() => {});

  return {
    client_id,
    encours_total: Math.round(encours_total),
    retard_jours_max,
    nb_commandes_ouvertes: (commandes || []).length,
    detail,
  };
}

// ── NOTES CRM ────────────────────────────────────────────────────
async function ajouterNote({ client_id, auteur_id, type, contenu, date_prochaine_action }) {
  const { data, error } = await supabase
    .from('notes_crm')
    .insert({ client_id, auteur_id, type, contenu, date_prochaine_action })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── CLIENTS À RISQUE ÉLEVÉ ────────────────────────────────────────
async function getClientsRisqueEleve() {
  const { data, error } = await supabase
    .from('clients')
    .select(`
      id, nom, telephone, score_risque, score_risque_detail,
      encours_total_xaf, retard_max_jours, pipeline_statut
    `)
    .in('score_risque', ['C', 'D'])
    .order('retard_max_jours', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

// ── WHATSAPP ────────────────────────────────────────────────────
async function envoyerWhatsApp({ client_id, telephone, template, contenu, source_type, source_id, envoye_par }) {
  // Récupérer config API WhatsApp
  const { data: cfg } = await supabase
    .from('parametres_systeme')
    .select('cle, valeur')
    .in('cle', ['whatsapp_api_url', 'whatsapp_api_token', 'whatsapp_provider']);

  const params = Object.fromEntries((cfg || []).map(p => [p.cle, p.valeur]));
  const api_url = params.whatsapp_api_url;
  const api_token = params.whatsapp_api_token;
  const provider = params.whatsapp_provider || 'twilio';

  let message_sid = null;
  let statut = 'ENVOYE';

  if (api_url && api_token) {
    try {
      const payload = provider === 'twilio'
        ? { To: `whatsapp:+${telephone.replace(/\D/g, '')}`, From: 'whatsapp:+14155238886', Body: contenu }
        : { recipient_phone: telephone, message: contenu, template };

      const r = await fetch(api_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api_token}`,
        },
        body: JSON.stringify(payload),
      });
      const resp = await r.json();
      message_sid = resp.sid || resp.message_id || null;
      if (!r.ok) statut = 'ECHEC';
    } catch {
      statut = 'ECHEC';
    }
  }

  // Toujours logger dans l'historique
  const { data, error } = await supabase
    .from('messages_whatsapp')
    .insert({
      client_id, telephone, template, contenu,
      statut, message_sid, source_type, source_id, envoye_par,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── RELANCES AUTOMATIQUES IMPAYÉS ────────────────────────────────
async function traiterRelancesImpayees() {
  const now = new Date();
  const relances = [];

  // Récupérer commandes avec solde impayé
  const { data: commandes } = await supabase
    .from('commandes_produits_finis')
    .select(`
      id, numero, montant_total, created_at,
      client:client_id (id, nom, telephone),
      acomptes (montant_xaf, statut)
    `)
    .not('statut', 'in', '("ANNULE","LIVRE")')
    .lt('created_at', new Date(now - 7 * 86400000).toISOString());

  for (const cmd of (commandes || [])) {
    const paye = (cmd.acomptes || []).filter(a => a.statut === 'VALIDE')
      .reduce((s, a) => s + parseFloat(a.montant_xaf || 0), 0);
    const reste = parseFloat(cmd.montant_total) - paye;
    if (reste <= 0) continue;

    const age_jours = Math.floor((now - new Date(cmd.created_at)) / 86400000);
    let template = null;
    if (age_jours >= 30) template = 'RELANCE_J30';
    else if (age_jours >= 15) template = 'RELANCE_J15';
    else if (age_jours >= 7) template = 'RELANCE_J7';

    if (!template) continue;

    // Vérifier qu'un message du même template n'a pas déjà été envoyé dans les 3 derniers jours
    const { data: dejaEnvoye } = await supabase
      .from('messages_whatsapp')
      .select('id')
      .eq('source_id', cmd.id)
      .eq('template', template)
      .gte('envoye_a', new Date(now - 3 * 86400000).toISOString())
      .limit(1)
      .single();

    if (dejaEnvoye) continue;

    const contenu = genererMessageRelance(template, {
      nom: cmd.client.nom,
      commande: cmd.numero,
      montant: reste.toLocaleString('fr-FR'),
      age: age_jours,
    });

    const msg = await envoyerWhatsApp({
      client_id: cmd.client.id,
      telephone: cmd.client.telephone,
      template,
      contenu,
      source_type: 'COMMANDE',
      source_id: cmd.id,
      envoye_par: null,
    }).catch(() => null);

    if (msg) relances.push(msg);
  }

  return relances;
}

function genererMessageRelance(template, { nom, commande, montant, age }) {
  const intro = `Bonjour ${nom},\n\nTAFDIL SARL vous contacte`;
  switch (template) {
    case 'RELANCE_J7':
      return `${intro} au sujet de votre commande ${commande}.\nUn solde de ${montant} XAF est en attente de règlement depuis ${age} jours.\nMerci de nous contacter pour convenir d'un arrangement.\n\nCordialement, TAFDIL SARL — +237 6XX XXX XXX`;
    case 'RELANCE_J15':
      return `${intro} RAPPEL — Commande ${commande}.\nMalgré notre précédent message, un solde de ${montant} XAF reste impayé depuis ${age} jours.\nVeuillez régulariser votre situation dans les meilleurs délais.\n\nTAFDIL SARL`;
    case 'RELANCE_J30':
      return `${intro} DERNIER RAPPEL — Commande ${commande}.\nLe solde de ${montant} XAF est impayé depuis ${age} jours. Sans règlement sous 5 jours ouvrables, nous serons contraints de saisir notre service juridique.\n\nTAFDIL SARL`;
    default:
      return `${intro}. Commande ${commande} — Solde : ${montant} XAF.`;
  }
}

module.exports = {
  getPipeline, mettreAJourPipeline, getHistorique360,
  getEncours, ajouterNote, getClientsRisqueEleve,
  envoyerWhatsApp, traiterRelancesImpayees,
};
