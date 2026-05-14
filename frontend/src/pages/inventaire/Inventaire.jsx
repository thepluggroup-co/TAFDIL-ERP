import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../api/client';
import StatCard from '../../components/shared/StatCard';
import XAFPrice from '../../components/shared/XAFPrice';

const EMPLACEMENTS = ['TOUS', 'ATELIER', 'BOUTIQUE', 'EXTERNE'];

export default function Inventaire() {
  const [produits, setProduits]       = useState([]);
  const [emplacement, setEmplacement] = useState('TOUS');
  const [session, setSession]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState('stock');

  useEffect(() => { fetchProduits(); }, [emplacement]);

  async function fetchProduits() {
    setLoading(true);
    try {
      const params = emplacement !== 'TOUS' ? `?emplacement=${emplacement}` : '';
      // service returns array directly; interceptor unwraps r.data → array
      const res = await api.get(`/inventaire/stock-consolide${params}`);
      setProduits(Array.isArray(res) ? res : []);
    } catch { toast.error('Erreur chargement stock'); }
    finally { setLoading(false); }
  }

  async function demarrerSession() {
    try {
      const empCode = emplacement !== 'TOUS' ? emplacement : 'BQ01';
      // backend accepts emplacement_code and looks up emplacement_id
      const res = await api.post('/inventaire/sessions', { emplacement_code: empCode });
      // res IS the session row; add emplacement_code for display
      setSession({ ...res, emplacement_code: empCode });
      setTab('inventaire');
      toast.success('Session d\'inventaire démarrée');
    } catch (e) { toast.error(e.message || 'Erreur démarrage session'); }
  }

  async function validerEcart(produit_id, quantite_comptee) {
    try {
      await api.post(`/inventaire/sessions/${session.id}/ecart`, { produit_id, quantite_comptee });
      toast.success('Écart enregistré');
    } catch { toast.error('Erreur enregistrement'); }
  }

  // v_stock_consolide returns stock_total (not stock_actuel), stock_minimum (not stock_min)
  const ruptures   = produits.filter(p => (p.stock_total || 0) <= 0).length;
  const alertes    = produits.filter(p => (p.stock_total || 0) > 0 && (p.stock_total || 0) <= (p.stock_minimum || 0)).length;
  const valeurTotale = produits.reduce((s, p) => s + ((p.stock_total || 0) * (p.prix_public || 0)), 0);

  if (loading) return <div className="p-6 text-gray-500">Chargement…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Inventaire & Multi-Entrepôts</h1>
        <button onClick={demarrerSession} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
          + Nouvelle session inventaire
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Références" value={produits.length} icon="📦" />
        <StatCard label="Ruptures" value={ruptures} icon="🔴" color="red" />
        <StatCard label="Alertes stock" value={alertes} icon="🟠" color="orange" />
        <StatCard label="Valeur stock" value={<XAFPrice amount={valeurTotale} />} icon="💰" />
      </div>

      {/* Filtre emplacement */}
      <div className="flex gap-2">
        {EMPLACEMENTS.map(e => (
          <button
            key={e}
            onClick={() => setEmplacement(e)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              emplacement === e ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[['stock', 'État des stocks'], ['inventaire', 'Session inventaire'], ['mouvements', 'Mouvements inter-sites']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === key ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Référence', 'Désignation', 'Emplacement', 'Stock', 'Réservé atelier', 'Disponible', 'Stock min', 'Valeur', 'Alerte'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {produits.map(p => {
                const stock = p.stock_total || 0;
                const dispo = Math.max(0, stock - (p.quantite_reservee_atelier || 0));
                const alerte = stock <= (p.stock_minimum || 0);
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${alerte ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-3 text-gray-500 font-mono text-xs">{p.reference}</td>
                    <td className="px-3 py-3 font-medium text-gray-800">{p.designation}</td>
                    <td className="px-3 py-3 text-gray-500">{p.unite}</td>
                    <td className="px-3 py-3 font-semibold">{stock} {p.unite}</td>
                    <td className="px-3 py-3 text-orange-600">{p.quantite_reservee_atelier || 0}</td>
                    <td className="px-3 py-3 font-semibold text-green-700">{dispo}</td>
                    <td className="px-3 py-3 text-gray-500">{p.stock_minimum}</td>
                    <td className="px-3 py-3"><XAFPrice amount={stock * (p.prix_public || 0)} /></td>
                    <td className="px-3 py-3">
                      {alerte && <span className="text-red-600 text-xs font-bold">⚠ ALERTE</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'inventaire' && (
        <div className="space-y-4">
          {session ? (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="font-semibold text-blue-800">Session active — {session.emplacement_code}</p>
                <p className="text-sm text-blue-600">Démarrée le {new Date(session.date_debut).toLocaleString('fr-CM')}</p>
              </div>
              <div className="space-y-3">
                {produits.slice(0, 20).map(p => (
                  <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{p.designation}</p>
                      <p className="text-sm text-gray-500">Théorique : {p.stock_total || 0} {p.unite}</p>
                    </div>
                    <input
                      type="number"
                      placeholder="Quantité comptée"
                      min="0"
                      className="w-36 border border-gray-300 rounded px-3 py-1 text-sm"
                      onBlur={e => e.target.value !== '' && validerEcart(p.id, parseFloat(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">📋</p>
              <p>Cliquez sur "Nouvelle session inventaire" pour commencer</p>
            </div>
          )}
        </div>
      )}

      {tab === 'mouvements' && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">↔️</p>
          <p>Historique des transferts inter-sites</p>
        </div>
      )}
    </div>
  );
}
