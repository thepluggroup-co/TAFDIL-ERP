const supabase = require('../config/supabase');

// ── CONSULTER AUDIT LOG ──────────────────────────────────────────
async function getAuditLog({ user_id, action, table_cible, date_debut, date_fin, limit = 200, offset = 0 } = {}) {
  let q = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('timestamp', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (user_id)     q = q.eq('user_id', user_id);
  if (action)      q = q.eq('action', action);
  if (table_cible) q = q.eq('table_cible', table_cible);
  if (date_debut)  q = q.gte('timestamp', date_debut);
  if (date_fin)    q = q.lte('timestamp', date_fin);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0 };
}

// ── LOG MANUEL (actions UI : PRINT, EXPORT, LOGIN, LOGOUT) ───────
async function logAction({ user_id, user_email, user_role, action, table_cible, record_id, payload_avant, payload_apres, ip_address, user_agent, session_id }) {
  const { data, error } = await supabase
    .from('audit_log')
    .insert({ user_id, user_email, user_role, action, table_cible, record_id, payload_avant, payload_apres, ip_address, user_agent, session_id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── PURGE ANCIENS LOGS ───────────────────────────────────────────
async function purgerAnciens() {
  const { data, error } = await supabase.rpc('purger_audit_anciens');
  if (error) throw new Error(error.message);
  return { supprimés: data };
}

// ── EXPORT CSV ───────────────────────────────────────────────────
async function exportCSV(filtres = {}) {
  const { data } = await getAuditLog({ ...filtres, limit: 10000 });
  const rows = [
    'Timestamp;Utilisateur;Role;Action;Table;ID Enregistrement;IP',
    ...data.map(r => [
      r.timestamp,
      r.user_email || '',
      r.user_role  || '',
      r.action,
      r.table_cible || '',
      r.record_id   || '',
      r.ip_address  || '',
    ].join(';')),
  ];
  return rows.join('\r\n');
}

// ── STATISTIQUES RAPIDES ─────────────────────────────────────────
async function getStats() {
  const { data, error } = await supabase
    .from('audit_log')
    .select('action, user_role')
    .gte('timestamp', new Date(Date.now() - 30 * 86400000).toISOString());
  if (error) throw new Error(error.message);

  const par_action = {};
  const par_role   = {};
  for (const r of (data || [])) {
    par_action[r.action] = (par_action[r.action] || 0) + 1;
    if (r.user_role) par_role[r.user_role] = (par_role[r.user_role] || 0) + 1;
  }
  return { total_30j: (data || []).length, par_action, par_role };
}

module.exports = { getAuditLog, logAction, purgerAnciens, exportCSV, getStats };
