import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const C = { primary: '#1a3a5c', accent: '#e8740c' };

const STATUT_COLOR = {
  ACTIF:         'bg-green-100 text-green-700',
  SUSPENDU:      'bg-yellow-100 text-yellow-700',
  DEMISSIONNAIRE:'bg-gray-100 text-gray-600',
  LICENCIE:      'bg-red-100 text-red-700',
};

const CONTRAT_COLOR = {
  CDI:          'bg-blue-100 text-blue-700',
  CDD:          'bg-orange-100 text-orange-700',
  STAGE:        'bg-purple-100 text-purple-700',
  SOUS_TRAITANT:'bg-gray-100 text-gray-600',
};

function NouvelEmployeModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    nom: '', prenom: '', poste: 'TECHNICIEN', departement: 'ATELIER',
    type_contrat: 'CDI', salaire_base_xaf: '', telephone: '',
    date_embauche: new Date().toISOString().slice(0, 10), cnps_numero_affiliation: '',
    operateur_mobile_money: 'MTN', numero_mm: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.nom || !form.prenom || !form.salaire_base_xaf) {
      alert('Champs obligatoires manquants'); return;
    }
    setSubmitting(true);
    try {
      const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;
      const r = await fetch(`${import.meta.env.VITE_API_URL}/api/rh/employes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, salaire_base_xaf: parseFloat(form.salaire_base_xaf) }),
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

  const POSTES = ['DIRECTEUR','SECRETAIRE','VENDEUR','TECHNICIEN','MAGASINIER','CHAUFFEUR','AUTRE'];
  const DEPTS = ['DIRECTION','ADMINISTRATION','BOUTIQUE','ATELIER','LOGISTIQUE'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-900 text-lg">Nouvel employé</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">×</button>
        </div>
        <div className="overflow-auto flex-1 p-5">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Nom *', key: 'nom', type: 'text' },
              { label: 'Prénom *', key: 'prenom', type: 'text' },
              { label: 'Téléphone', key: 'telephone', type: 'text' },
              { label: 'Date d\'embauche', key: 'date_embauche', type: 'date' },
              { label: 'Salaire de base (XAF) *', key: 'salaire_base_xaf', type: 'number' },
              { label: 'N° CNPS', key: 'cnps_numero_affiliation', type: 'text' },
              { label: 'N° Mobile Money', key: 'numero_mm', type: 'text' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input type={type} value={form[key]} onChange={e => f(key, e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Poste *</label>
              <select value={form.poste} onChange={e => f('poste', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                {POSTES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Département *</label>
              <select value={form.departement} onChange={e => f('departement', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                {DEPTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type contrat *</label>
              <select value={form.type_contrat} onChange={e => f('type_contrat', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                {['CDI','CDD','STAGE','SOUS_TRAITANT'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Opérateur MM</label>
              <select value={form.operateur_mobile_money} onChange={e => f('operateur_mobile_money', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                <option>MTN</option><option>ORANGE</option>
              </select>
            </div>
          </div>
        </div>
        <div className="p-5 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm text-gray-600">Annuler</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm"
            style={{ backgroundColor: submitting ? '#ccc' : C.primary }}>
            {submitting ? 'Enregistrement…' : 'Créer l\'employé'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmployesList() {
  const navigate = useNavigate();
  const [employes, setEmployes] = useState([]);
  const [alertes, setAlertes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreDept, setFiltreDept] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('ACTIF');
  const [showModal, setShowModal] = useState(false);

  const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtreDept) params.set('departement', filtreDept);
      if (filtreStatut) params.set('statut', filtreStatut);

      const [empR, alertR] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/rh/employes?${params}`,
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${import.meta.env.VITE_API_URL}/api/rh/alertes-rh`,
          { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (empR.ok) {
        const d = await empR.json();
        setEmployes(d.employes || []);
      }
      if (alertR.ok) setAlertes(await alertR.json());
    } finally {
      setLoading(false);
    }
  }, [token, filtreDept, filtreStatut]);

  useEffect(() => { load(); }, [load]);

  const DEPTS = ['', 'DIRECTION', 'ADMINISTRATION', 'BOUTIQUE', 'ATELIER', 'LOGISTIQUE'];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ressources Humaines</h1>
          <p className="text-sm text-gray-500">Gestion du personnel TAFDIL SARL</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: C.primary }}>
          + Nouvel employé
        </button>
      </div>

      {/* Alertes RH */}
      {alertes.length > 0 && (
        <div className="mb-6 space-y-2">
          {alertes.map((a, i) => (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${
              a.type_alerte === 'CDD_EXPIRANT' ? 'bg-orange-50 border-orange-200' : 'bg-yellow-50 border-yellow-200'
            }`}>
              <span className="text-lg">{a.type_alerte === 'CDD_EXPIRANT' ? '⏰' : '🏖'}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">
                  {a.type_alerte === 'CDD_EXPIRANT'
                    ? `Contrat CDD expirant dans ${a.jours_restants}j : ${a.nom_complet}`
                    : `${a.jours_restants}j de congés non pris : ${a.nom_complet}`}
                </p>
                <p className="text-xs text-gray-500">{a.poste} · {a.date_echeance || ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtres */}
      <div className="flex gap-4 mb-5">
        <select value={filtreDept} onChange={e => setFiltreDept(e.target.value)}
          className="border rounded-xl px-3 py-2 text-sm bg-white">
          {DEPTS.map(d => <option key={d} value={d}>{d || 'Tous départements'}</option>)}
        </select>
        {['ACTIF','SUSPENDU','DEMISSIONNAIRE','LICENCIE'].map(s => (
          <button key={s} onClick={() => setFiltreStatut(s === filtreStatut ? '' : s)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${
              filtreStatut === s ? 'text-white' : 'bg-white border text-gray-600'
            }`}
            style={filtreStatut === s ? { backgroundColor: C.primary } : {}}>
            {s}
          </button>
        ))}
      </div>

      {/* Table employés */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">Chargement…</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Employé</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Poste</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Contrat</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Salaire base</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {employes.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Aucun employé trouvé</td></tr>
              ) : employes.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: C.primary }}>
                        {e.prenom[0]}{e.nom[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{e.prenom} {e.nom}</p>
                        <p className="text-xs text-gray-400 font-mono">{e.matricule}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.poste}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONTRAT_COLOR[e.type_contrat] || ''}`}>
                      {e.type_contrat}
                    </span>
                    {e.date_fin_contrat && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Fin : {new Date(e.date_fin_contrat).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-gray-700">
                    {Number(e.salaire_base_xaf).toLocaleString('fr-FR')} XAF
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLOR[e.statut] || ''}`}>
                      {e.statut}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/rh/employe/${e.id}`)}
                      className="text-xs px-3 py-1.5 rounded-lg border text-gray-600 hover:bg-gray-100">
                      Fiche →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <NouvelEmployeModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
