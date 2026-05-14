const supabase = require('../config/supabase');

/**
 * Envoie une notification in-app (et push si token disponible).
 */
async function notifier({ user_id, type, titre, message, lien_deep, canal = 'IN_APP' }) {
  // Vérifier les préférences utilisateur
  const { data: prefs } = await supabase
    .from('user_notification_prefs')
    .select('alertes, canaux, silence_debut_h, silence_fin_h')
    .eq('user_id', user_id)
    .single();

  // Vérifier heure de silence
  if (prefs) {
    const heure = new Date().getHours();
    const { silence_debut_h: debut, silence_fin_h: fin } = prefs;
    const en_silence = debut > fin
      ? heure >= debut || heure < fin  // ex: 21h-7h
      : heure >= debut && heure < fin;
    if (en_silence && canal !== 'IN_APP') return null; // blocage silencieux sauf IN_APP
  }

  // Créer la notification en base
  const { data: notif, error } = await supabase
    .from('notifications')
    .insert({ user_id, type, titre, message, lien_deep, canal })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Push notification si token disponible
  if (canal === 'PUSH' || (prefs?.canaux || []).includes('PUSH')) {
    const { data: tokens } = await supabase
      .from('user_push_tokens')
      .select('token, platform')
      .eq('user_id', user_id);

    for (const t of (tokens || [])) {
      await envoyerExpoPush(t.token, titre, message, lien_deep).catch(() => {});
    }
  }

  return notif;
}

/**
 * Envoie une notification à plusieurs utilisateurs d'un rôle.
 */
async function notifierRole(role, payload) {
  // On récupère les users ayant ce rôle via leurs métadonnées
  const { data: users } = await supabase
    .from('auth.users')
    .select('id, raw_user_meta_data')
    .filter('raw_user_meta_data->>role', 'eq', role);

  const results = [];
  for (const u of (users || [])) {
    try {
      const n = await notifier({ user_id: u.id, ...payload });
      if (n) results.push(n);
    } catch {}
  }
  return results;
}

/**
 * Marquer des notifications comme lues.
 */
async function marquerLues(user_id, ids = []) {
  let q = supabase.from('notifications').update({ lu: true });
  if (ids.length > 0) {
    q = q.in('id', ids).eq('user_id', user_id);
  } else {
    q = q.eq('user_id', user_id).eq('lu', false);
  }
  const { error } = await q;
  if (error) throw new Error(error.message);
}

/**
 * Récupère les notifications non lues d'un user.
 */
async function getNotifications(user_id, { non_lues_seulement = false, limit = 30 } = {}) {
  let q = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (non_lues_seulement) q = q.eq('lu', false);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Vérification stock critique — appelé par cron ou webhook.
 */
async function alertesStockCritique() {
  const { data: produits } = await supabase
    .from('produits')
    .select('id, designation, stock_actuel, stock_minimum')
    .filter('stock_actuel', 'lte', 'stock_minimum')
    .eq('actif', true)
    .limit(20);

  if (!produits || produits.length === 0) return [];

  // Notifier les magasiniers et DG
  const notifs = [];
  for (const p of produits) {
    const n = await notifier({
      user_id: null, // broadcast via rôle
      type: 'STOCK_CRITIQUE',
      titre: `Stock critique : ${p.designation}`,
      message: `Stock : ${p.stock_actuel} (min : ${p.stock_minimum})`,
      lien_deep: `/stock/${p.id}`,
      canal: 'IN_APP',
    }).catch(() => null);
    if (n) notifs.push(n);
  }
  return notifs;
}

/**
 * Alerte maintenance imminente depuis la vue v_alertes_maintenance.
 */
async function alertesMaintenance() {
  const { data: alertes } = await supabase
    .from('v_alertes_maintenance')
    .select('*')
    .in('alerte', ['ECHU', 'IMMINENT']);

  if (!alertes || alertes.length === 0) return [];

  const notifs = [];
  for (const a of alertes) {
    const n = await notifier({
      user_id: null,
      type: 'MAINTENANCE_' + a.alerte,
      titre: `Maintenance ${a.alerte} : ${a.nom}`,
      message: `Prochaine maintenance : ${a.prochaine_maintenance_date} (${a.alerte})`,
      lien_deep: `/maintenance/${a.id}`,
      canal: 'IN_APP',
    }).catch(() => null);
    if (n) notifs.push(n);
  }
  return notifs;
}

// Expo Push via REST API
async function envoyerExpoPush(token, titre, body, data) {
  if (!token.startsWith('ExponentPushToken')) return;
  const { data: url_param } = await supabase
    .from('parametres_systeme')
    .select('valeur')
    .eq('cle', 'expo_push_url')
    .single();

  const url = url_param?.valeur || 'https://exp.host/--/api/v2/push/send';
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, title: titre, body, data: { lien: data } }),
  });
}

module.exports = {
  notifier,
  notifierRole,
  marquerLues,
  getNotifications,
  alertesStockCritique,
  alertesMaintenance,
};
