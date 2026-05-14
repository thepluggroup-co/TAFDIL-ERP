import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const C = { primary: '#1a3a5c', accent: '#e8740c' };

const STATUT_COLOR = {
  PLANIFIE: 'bg-blue-100 text-blue-800',
  EN_ATTENTE_MATIERE: 'bg-yellow-100 text-yellow-800',
  EN_COURS: 'bg-green-100 text-green-800',
  SUSPENDU: 'bg-gray-100 text-gray-600',
  TERMINE: 'bg-emerald-100 text-emerald-800',
  ANNULE: 'bg-red-100 text-red-700',
};

const PRIORITE_LABEL = { 1: 'Urgent', 2: 'Normal', 3: 'Faible' };
const PRIORITE_COLOR = { 1: 'text-red-600 font-bold', 2: 'text-gray-700', 3: 'text-gray-400' };

function OFCard({ of, onExploser, onStatut }) {
  const tech = of.technicien?.raw_user_meta_data?.nom || of.technicien?.email || '—';
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-1">
        <span className="font-mono text-xs text-gray-500">{of.reference}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUT_COLOR[of.statut] || 'bg-gray-100 text-gray-600'}`}>
          {of.statut}
        </span>
      </div>
      <p className="font-semibold text-sm text-gray-800 mb-1">
        {of.type_produit} — {of.dimensions?.largeur_m}m × {of.dimensions?.hauteur_m}m (×{of.dimensions?.quantite})
      </p>
      <div className="flex gap-3 text-xs text-gray-500 mb-2">
        <span className={PRIORITE_COLOR[of.priorite]}>P{of.priorite} {PRIORITE_LABEL[of.priorite]}</span>
        <span>{of.heures_estimees}h estimées</span>
        <span>Tech: {tech}</span>
      </div>
      <div className="flex gap-2">
        {['PLANIFIE', 'EN_ATTENTE_MATIERE'].includes(of.statut) && (
          <button
            onClick={() => onExploser(of.id)}
            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
          >
            Exploser BOM
          </button>
        )}
        {of.statut === 'PLANIFIE' && (
          <button
            onClick={() => onStatut(of.id, 'EN_COURS')}
            className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition"
          >
            Démarrer
          </button>
        )}
        {of.statut === 'EN_COURS' && (
          <button
            onClick={() => onStatut(of.id, 'TERMINE')}
            className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition"
          >
            Terminer
          </button>
        )}
      </div>
    </div>
  );
}

export default function PlanningAtelier() {
  const navigate = useNavigate();
  const [planning, setPlanning] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateDebut, setDateDebut] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateFin, setDateFin] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [bomModal, setBomModal] = useState(null); // { of_id, result }
  const [loadingBom, setLoadingBom] = useState(false);

  const fetchPlanning = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;
      const r = await fetch(
        `${import.meta.env.VITE_API_URL}/api/mrp/planning?date_debut=${dateDebut}&date_fin=${dateFin}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) throw new Error((await r.json()).message);
      setPlanning(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dateDebut, dateFin]);

  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);

  const exploserBOM = async (of_id) => {
    setLoadingBom(true);
    try {
      const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;
      const r = await fetch(`${import.meta.env.VITE_API_URL}/api/mrp/exploser-bom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ of_id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      setBomModal({ of_id, result: data });
      fetchPlanning();
    } catch (e) {
      alert('Erreur BOM: ' + e.message);
    } finally {
      setLoadingBom(false);
    }
  };

  const changerStatut = async (of_id, statut) => {
    try {
      const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;
      const r = await fetch(`${import.meta.env.VITE_API_URL}/api/mrp/ofs/${of_id}/statut`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ statut }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.message);
      }
      fetchPlanning();
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  };

  const totalOFsSemaine = planning.reduce((s, j) => s + j.ofs.length, 0);
  const enCours = planning.flatMap(j => j.ofs).filter(o => o.statut === 'EN_COURS').length;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planning Atelier</h1>
          <p className="text-sm text-gray-500">Ordres de Fabrication — MRP</p>
        </div>
        <button
          onClick={() => navigate('/mrp/ofs')}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: C.primary }}
        >
          Tous les OF
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'OF sur la période', value: totalOFsSemaine },
          { label: 'En cours', value: enCours, color: 'text-green-600' },
          { label: 'Jours planifiés', value: planning.length },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className={`text-3xl font-bold mt-1 ${k.color || 'text-gray-900'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtres dates */}
      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date début</label>
          <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date fin</label>
          <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex items-end">
          <button onClick={fetchPlanning}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: C.accent }}>
            Actualiser
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm mb-4">{error}</div>}

      {loading ? (
        <div className="text-center py-20 text-gray-400">Chargement du planning…</div>
      ) : planning.length === 0 ? (
        <div className="text-center py-20 text-gray-400">Aucun OF planifié sur cette période.</div>
      ) : (
        /* Grille Gantt simplifiée — un bloc par jour */
        <div className="space-y-4">
          {planning.map(jour => {
            const cap = jour.capacite;
            const charge_pct = cap.heures_disponibles > 0
              ? Math.min(100, Math.round((cap.heures_allouees / cap.heures_disponibles) * 100))
              : 0;
            const surcharge = charge_pct > 100;

            return (
              <div key={jour.date} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* En-tête jour */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-800">
                      {new Date(jour.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </span>
                    {cap.fermeture && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        Fermé : {cap.motif_fermeture}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{jour.ofs.length} OF</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${surcharge ? 'bg-red-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(charge_pct, 100)}%` }}
                        />
                      </div>
                      <span className={surcharge ? 'text-red-600 font-semibold' : ''}>
                        {cap.heures_allouees}h / {cap.heures_disponibles}h
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cards OF */}
                <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {jour.ofs.map(of => (
                    <OFCard
                      key={of.id}
                      of={of}
                      onExploser={exploserBOM}
                      onStatut={changerStatut}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal résultat BOM */}
      {bomModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-gray-900">Besoins matières — {bomModal.result.reference}</h2>
              <button onClick={() => setBomModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="overflow-auto p-4 flex-1">
              <div className="flex gap-4 text-sm mb-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  bomModal.result.statut_global === 'DISPONIBLE'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {bomModal.result.statut_global}
                </span>
                <span className="text-gray-500">{bomModal.result.nb_lignes} lignes</span>
                {bomModal.result.nb_ruptures > 0 && (
                  <span className="text-red-600">{bomModal.result.nb_ruptures} rupture(s)</span>
                )}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">Matière</th>
                    <th className="pb-2 text-right">Qté</th>
                    <th className="pb-2 text-center">Dispo</th>
                  </tr>
                </thead>
                <tbody>
                  {bomModal.result.besoins.map((b, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1.5 text-gray-800">
                        {b.designation_matiere || b.produit_quincaillerie_id}
                      </td>
                      <td className="py-1.5 text-right font-mono">{b.quantite_theorique} {b.unite}</td>
                      <td className="py-1.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          b.statut_dispo === 'DISPONIBLE' ? 'bg-green-100 text-green-700'
                          : b.statut_dispo === 'PARTIEL' ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                        }`}>
                          {b.statut_dispo}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t">
              <button
                onClick={() => setBomModal(null)}
                className="w-full py-2 rounded-lg font-medium text-white"
                style={{ backgroundColor: C.primary }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
