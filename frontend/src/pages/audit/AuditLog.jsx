import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../api/client';
import StatCard from '../../components/shared/StatCard';

const ACTION_COLORS = {
  CREATE:   'bg-green-100 text-green-700',
  UPDATE:   'bg-blue-100 text-blue-700',
  DELETE:   'bg-red-100 text-red-700',
  VALIDATE: 'bg-purple-100 text-purple-700',
  PRINT:    'bg-yellow-100 text-yellow-700',
  EXPORT:   'bg-orange-100 text-orange-700',
  LOGIN:    'bg-gray-100 text-gray-700',
};

export default function AuditLog() {
  const [logs, setLogs]     = useState([]);
  const [stats, setStats]   = useState({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ user_id: '', action: '', table_cible: '', limit: 100 });

  useEffect(() => { fetchLogs(); }, [filters]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams(Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '')
      ));
      const [logsRes, statsRes] = await Promise.all([
        api.get(`/audit/log?${params}`),
        api.get('/audit/stats'),
      ]);
      // auditService.getAuditLog returns { data: [...], total: N }
      setLogs(logsRes.data || []);
      // auditService.getStats returns { total_30j, par_action, par_role }
      setStats(statsRes || {});
    } catch { toast.error('Erreur chargement audit'); }
    finally { setLoading(false); }
  }

  async function exportCsv() {
    try {
      const res = await api.get('/audit/export-csv', { responseType: 'blob' });
      // interceptor returns r.data, so res IS the blob
      const url = URL.createObjectURL(res);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    } catch { toast.error('Erreur export'); }
  }

  if (loading) return <div className="p-6 text-gray-500">Chargement…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Journal d'audit</h1>
        <button onClick={exportCsv} className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-800">
          Exporter CSV
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Événements 30j" value={stats.total_30j || 0} icon="📋" />
        <StatCard label="Utilisateurs actifs" value={stats.utilisateurs_actifs || 0} icon="👥" />
        <StatCard label="Suppressions" value={stats.suppressions_30j || 0} icon="🗑" color="red" />
        <StatCard label="Exports" value={stats.exports_30j || 0} icon="📤" />
      </div>

      {/* Filtres */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filters.action}
          onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm"
        >
          <option value="">Toutes actions</option>
          {['CREATE', 'UPDATE', 'DELETE', 'VALIDATE', 'PRINT', 'EXPORT', 'LOGIN'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Table cible…"
          value={filters.table_cible}
          onChange={e => setFilters(f => ({ ...f, table_cible: e.target.value }))}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-44"
        />
        <select
          value={filters.limit}
          onChange={e => setFilters(f => ({ ...f, limit: e.target.value }))}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm"
        >
          {[50, 100, 250, 500].map(l => <option key={l} value={l}>{l} lignes</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Horodatage', 'Utilisateur', 'Rôle', 'Action', 'Table', 'IP', 'Détails'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.map((log, i) => (
              <tr key={log.id || i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                  {new Date(log.timestamp).toLocaleString('fr-CM')}
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">{log.user_nom || log.user_id?.slice(0, 8)}</td>
                <td className="px-4 py-3 text-gray-500">{log.role}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{log.table_cible}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{log.ip_address}</td>
                <td className="px-4 py-3">
                  {log.payload_apres && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-blue-600">Voir</summary>
                      <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-auto max-w-xs">
                        {JSON.stringify(log.payload_apres, null, 2)}
                      </pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucun événement trouvé</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
