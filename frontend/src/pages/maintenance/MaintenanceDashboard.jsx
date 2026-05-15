import { useState, useEffect, useCallback } from 'react';

const C = { primary: '#E30613', accent: '#E30613' };

const ALERTE_COLOR = {
  HS:       'bg-red-600 text-white',
  ECHU:     'bg-red-100 text-red-800',
  IMMINENT: 'bg-yellow-100 text-yellow-800',
  OK:       'bg-green-100 text-green-700',
};

const STATUT_EQUIP_COLOR = {
  OPERATIONNEL:    'bg-green-100 text-green-700',
  EN_MAINTENANCE:  'bg-yellow-100 text-yellow-700',
  HS:              'bg-red-100 text-red-700',
  HORS_SERVICE:    'bg-gray-100 text-gray-500',
};

function InterventionModal({ equipement, onClose, onSuccess }) {
  const [form, setForm] = useState({ type: 'CORRECTIVE', description_panne: '', technicien_prestataire: '', impact_production: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;
      const r = await fetch(`${import.meta.env.VITE_API_URL}/api/maintenance/interventions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ equipement_id: equipement.id, ...form }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      onSuccess(data);
    } catch (e) {
      alert('Erreur: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-900">Nouvelle intervention</h2>
          <button onClick={onClose} className="text-gray-400 text-xl">×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600 font-medium">{equipement.nom}</p>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <div className="flex gap-2">
              {['CORRECTIVE', 'PREVENTIVE'].map(t => (
                <button key={t}
                  onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    form.type === t ? 'text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                  style={form.type === t ? { backgroundColor: t === 'CORRECTIVE' ? '#dc2626' : C.primary } : {}}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description de la panne</label>
            <textarea rows={3} value={form.description_panne}
              onChange={e => setForm(f => ({ ...f, description_panne: e.target.value }))}
              className="w-full border rounded-xl px-3 py-2 text-sm resize-none"
              placeholder="Décrire la panne ou l'opération préventive…" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Technicien / Prestataire</label>
            <input type="text" value={form.technicien_prestataire}
              onChange={e => setForm(f => ({ ...f, technicien_prestataire: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Nom du technicien…" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Impact production</label>
            <input type="text" value={form.impact_production}
              onChange={e => setForm(f => ({ ...f, impact_production: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Ex: Arrêt atelier soudure…" />
          </div>
        </div>
        <div className="p-5 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm text-gray-600">Annuler</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm"
            style={{ backgroundColor: submitting ? '#ccc' : C.primary }}>
            {submitting ? 'Envoi…' : 'Démarrer l\'intervention'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MaintenanceDashboard() {
  const [alertes, setAlertes] = useState([]);
  const [equipements, setEquipements] = useState([]);
  const [couts, setCouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [interventionEquip, setInterventionEquip] = useState(null);

  const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aR, eR, cR] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/maintenance/alertes`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${import.meta.env.VITE_API_URL}/api/maintenance/equipements`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${import.meta.env.VITE_API_URL}/api/maintenance/couts`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (aR.ok) setAlertes(await aR.json());
      if (eR.ok) setEquipements(await eR.json());
      if (cR.ok) setCouts(await cR.json());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const alertesCritiques = alertes.filter(a => ['HS', 'ECHU'].includes(a.alerte)).length;
  const totalCout = couts.reduce((s, c) => s + (c.cout_total || 0), 0);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Maintenance Équipements</h1>
        <p className="text-sm text-gray-500">Suivi préventif & correctif</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Équipements actifs', value: equipements.length },
          { label: 'Alertes critiques', value: alertesCritiques, color: alertesCritiques > 0 ? 'text-red-600' : 'text-gray-900' },
          { label: 'Alertes imminentes', value: alertes.filter(a => a.alerte === 'IMMINENT').length, color: 'text-yellow-600' },
          { label: 'Coûts totaux (XAF)', value: totalCout.toLocaleString('fr-FR'), small: true },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className={`font-bold mt-1 ${k.small ? 'text-lg' : 'text-3xl'} ${k.color || 'text-gray-900'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Chargement…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alertes */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-800">Alertes maintenance</h2>
            </div>
            <div className="divide-y divide-gray-50 max-h-80 overflow-auto">
              {alertes.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm">Aucune alerte active</p>
              ) : alertes.map((a, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-medium text-sm text-gray-800">{a.nom}</p>
                    <p className="text-xs text-gray-400">
                      {a.localisation} · {a.description_operations}
                    </p>
                    {a.prochaine_maintenance_date && (
                      <p className="text-xs text-gray-400">
                        Échéance : {new Date(a.prochaine_maintenance_date).toLocaleDateString('fr-FR')}
                        {a.jours_avant_echeance !== null && ` (${a.jours_avant_echeance}j)`}
                      </p>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ALERTE_COLOR[a.alerte] || ''}`}>
                    {a.alerte}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Équipements */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-800">État des équipements</h2>
            </div>
            <div className="divide-y divide-gray-50 max-h-80 overflow-auto">
              {equipements.map(e => (
                <div key={e.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-medium text-sm text-gray-800">{e.nom}</p>
                    <p className="text-xs text-gray-400">{e.localisation}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_EQUIP_COLOR[e.statut] || ''}`}>
                      {e.statut}
                    </span>
                    {e.statut === 'OPERATIONNEL' && (
                      <button
                        onClick={() => setInterventionEquip(e)}
                        className="text-xs px-2 py-1 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 transition"
                      >
                        + Intervention
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Coûts par équipement */}
          {couts.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 lg:col-span-2">
              <h2 className="font-semibold text-gray-800 mb-4">Coûts de maintenance par équipement</h2>
              <div className="space-y-3">
                {couts.map((c, i) => {
                  const pct = totalCout > 0 ? (c.cout_total / totalCout) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{c.nom}</span>
                        <div className="flex gap-4 text-xs text-gray-500">
                          <span>Préventif : {c.cout_preventif.toLocaleString('fr-FR')} XAF</span>
                          <span>Correctif : {c.cout_correctif.toLocaleString('fr-FR')} XAF</span>
                          <span className="font-semibold text-gray-800">{c.cout_total.toLocaleString('fr-FR')} XAF</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: C.accent }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal intervention */}
      {interventionEquip && (
        <InterventionModal
          equipement={interventionEquip}
          onClose={() => setInterventionEquip(null)}
          onSuccess={() => {
            setInterventionEquip(null);
            load();
          }}
        />
      )}
    </div>
  );
}
