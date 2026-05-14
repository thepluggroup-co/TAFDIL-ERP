const supabase = require('../config/supabase');

// 1 point par 1 000 XAF dépensés
const POINTS_PAR_1000 = 1;

async function identifierClient(telephone) {
  const { data, error } = await supabase
    .from('clients_fidelite')
    .select('*')
    .eq('telephone', telephone)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data || null;
}

async function creerOuRecupererClient({ telephone, prenom, nom, client_id }) {
  // Upsert par téléphone
  const { data, error } = await supabase
    .from('clients_fidelite')
    .upsert(
      { telephone, prenom, nom, client_id },
      { onConflict: 'telephone', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function getSolde(telephone) {
  const client = await identifierClient(telephone);
  if (!client) return null;

  const { data: transactions } = await supabase
    .from('fidelite_transactions')
    .select('type, points, montant_vente, created_at, description')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return { client, transactions: transactions || [] };
}

async function crediterPoints(telephone, vente_id, montant_vente) {
  const client = await identifierClient(telephone);
  if (!client) return null;

  const points = Math.floor(montant_vente / 1000) * POINTS_PAR_1000;
  if (points === 0) return { client, points: 0 };

  // Enregistrer transaction
  await supabase.from('fidelite_transactions').insert({
    client_id: client.id,
    vente_id,
    type: 'GAIN',
    points,
    montant_vente,
    description: `Achat ${new Date().toLocaleDateString('fr-FR')}`,
  });

  // Mettre à jour cumul + nb_visites + CA
  const { data: updated } = await supabase
    .from('clients_fidelite')
    .update({
      points_cumules: client.points_cumules + points,
      nb_visites: client.nb_visites + 1,
      ca_cumule_xaf: parseFloat(client.ca_cumule_xaf) + montant_vente,
    })
    .eq('id', client.id)
    .select()
    .single();

  return { client: updated, points_gagnes: points };
}

async function utiliserPoints(telephone, points_a_utiliser, vente_id) {
  const client = await identifierClient(telephone);
  if (!client) throw new Error('Client fidélité introuvable');
  if (client.points_cumules < points_a_utiliser) {
    throw new Error(`Solde insuffisant : ${client.points_cumules} points disponibles`);
  }

  // Valeur en XAF : 100 points = 1 000 XAF
  const valeur_xaf = Math.floor(points_a_utiliser / 100) * 1000;

  await supabase.from('fidelite_transactions').insert({
    client_id: client.id,
    vente_id,
    type: 'UTILISATION',
    points: -points_a_utiliser,
    description: `Utilisation ${points_a_utiliser} pts = ${valeur_xaf.toLocaleString()} XAF`,
  });

  const { data: updated } = await supabase
    .from('clients_fidelite')
    .update({ points_cumules: client.points_cumules - points_a_utiliser })
    .eq('id', client.id)
    .select()
    .single();

  return { client: updated, points_utilises: points_a_utiliser, valeur_xaf };
}

module.exports = { identifierClient, creerOuRecupererClient, getSolde, crediterPoints, utiliserPoints };
