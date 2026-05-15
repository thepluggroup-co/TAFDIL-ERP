import { useState, useEffect, useCallback } from 'react';

const C = { primary: '#1a3a5c', accent: '#e8740c' };

const DECISION_CONFIG = {
  VALIDE:   { color: 'bg-green-100 text-green-800',  icon: '✓' },
  RETOUCHE: { color: 'bg-yellow-100 text-yellow-800', icon: '↺' },
  REJET:    { color: 'bg-red-100 text-red-800',       icon: '✗' },
};

function FicheQCForm({ of, onClose, onSuccess }) {
  const [criteres, setCriteres] = useState([]);
  const [defauts, setDefauts] = useState('');
  const [actions, setActions] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;
      const r = await fetch(
        `${import.meta.env.VITE_API_URL}/api/qualite/criteres/${of.type_produit}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (r.ok) {
        const data = await r.json();
        setCriteres(data.map(c => ({
          ...c,
          valeur_mesuree: '',
          conforme: null,
        })));
      }
    };
    load();
  }, [of.type_produit]);

  const toggleCritere = (idx, conforme) => {
    setCriteres(cs => cs.map((c, i) => i === idx ? { ...c, conforme } : c));
  };

  const handleSubmit = async () => {
    const nonRenseignes = criteres.filter(c => c.obligatoire && c.conforme === null);
    if (nonRenseignes.length > 0) {
      alert(`${nonRenseignes.length} critère(s) obligatoire(s) non renseigné(s)`);
      return;
    }

    setSubmitting(true);
    try {
      const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;
      const r = await fetch(`${import.meta.env.VITE_API_URL}/api/qualite/fiches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          of_id: of.id,
          criteres_verifies: criteres.map(c => ({
            critere: c.critere,
            tolerance: c.tolerance,
            valeur_mesuree: c.valeur_mesuree,
            conforme: c.conforme,
          })),
          defauts_constates: defauts,
          actions_correctives: actions,
        }),
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

  const nbConformes = criteres.filter(c => c.conforme === true).length;
  const taux = criteres.length > 0 ? Math.round((nbConformes / criteres.length) * 100) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Contrôle Qualité</h2>
            <p className="text-sm text-gray-500">{of.reference} — {of.type_produit}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <div className="overflow-auto flex-1 p-5">
          {/* Taux en temps réel */}
          {taux !== null && (
            <div className="mb-4 p-3 rounded-xl bg-gray-50 flex items-center gap-4">
              <div className="flex-1 bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${taux >= 100 ? 'bg-green-500' : taux >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${taux}%` }}
                />
              </div>
              <span className={`font-bold text-sm ${taux >= 100 ? 'text-green-600' : taux >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                {taux}% conformes
              </span>
              <span className="text-xs text-gray-500">
                → {taux === 100 ? 'VALIDÉ' : taux >= 70 ? 'RETOUCHE' : 'REJET'}
              </span>
            </div>
          )}

          {/* Liste critères */}
          <div className="space-y-3 mb-5">
            {criteres.map((c, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-medium text-sm text-gray-800">
                      {c.critere}
                      {c.obligatoire && <span className="text-red-500 ml-1">*</span>}
                    </p>
                    {c.tolerance && <p className="text-xs text-gray-400">Tolérance : {c.tolerance}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleCritere(idx, true)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                        c.conforme === true ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-50'
                      }`}
                    >
                      ✓ OK
                    </button>
                    <button
                      onClick={() => toggleCritere(idx, false)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                        c.conforme === false ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-50'
                      }`}
                    >
                      ✗ NOK
                    </button>
                  </div>
                </div>
                {c.conforme !== null && (
                  <input
                    type="text"
                    value={c.valeur_mesuree}
                    onChange={e => setCriteres(cs => cs.map((item, i) =>
                      i === idx ? { ...item, valeur_mesuree: e.target.value } : item
                    ))}
                    placeholder="Valeur mesurée (optionnel)"
                    className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Défauts & actions */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Défauts constatés</label>
              <textarea
                value={defauts}
                onChange={e => setDefauts(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
                placeholder="Décrire les défauts observés…"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Actions correctives prévues</label>
              <textarea
                value={actions}
                onChange={e => setActions(e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
                placeholder="Actions à entreprendre…"
              />
            </div>
          </div>
        </div>

        <div className="p-5 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm transition"
            style={{ backgroundColor: submitting ? '#ccc' : C.primary }}
          >
            {submitting ? 'Envoi…' : 'Soumettre fiche QC'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ControleQualite() {
  const [fiches, setFiches] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ofPourQC, setOfPourQC] = useState(null); // OF sélectionné pour créer une fiche

  const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fichesR, statsR] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/qualite/fiches?limit=30`,
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${import.meta.env.VITE_API_URL}/api/qualite/taux-conformite`,
          { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (fichesR.ok) setFiches(await fichesR.json());
      if (statsR.ok) setStats(await statsR.json());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contrôle Qualité</h1>
          <p className="text-sm text-gray-500">Fiches QC — Ordres de Fabrication</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total fiches', value: stats.total, color: 'text-gray-900' },
            { label: 'Validés', value: stats.valide, color: 'text-green-600' },
            { label: 'Retouches', value: stats.retouche, color: 'text-yellow-600' },
            { label: 'Rejets', value: stats.rejet, color: 'text-red-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              {s.label === 'Validés' && stats.total > 0 && (
                <p className="text-xs text-gray-400 mt-1">{stats.taux_conformite}% de conformité</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Liste fiches */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">Chargement…</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Fiches de contrôle</h2>
            <p className="text-xs text-gray-400">
              Pour créer une fiche, allez dans Planning Atelier → OF → Contrôle QC
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {fiches.length === 0 ? (
              <p className="text-center py-12 text-gray-400">Aucune fiche QC enregistrée</p>
            ) : fiches.map(f => {
              const dc = DECISION_CONFIG[f.decision] || DECISION_CONFIG.VALIDE;
              return (
                <div key={f.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${dc.color}`}>
                      {dc.icon}
                    </span>
                    <div>
                      <p className="font-medium text-sm text-gray-800">
                        {f.of?.reference || '—'} — {f.of?.type_produit}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(f.date_controle).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {f.defauts_constates && (
                      <span className="text-xs text-gray-400 max-w-xs truncate">{f.defauts_constates}</span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${dc.color}`}>
                      {f.decision}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal fiche QC */}
      {ofPourQC && (
        <FicheQCForm
          of={ofPourQC}
          onClose={() => setOfPourQC(null)}
          onSuccess={(fiche) => {
            setOfPourQC(null);
            load();
            alert(`Fiche QC créée — Décision : ${fiche.decision}`);
          }}
        />
      )}
    </div>
  );
}
