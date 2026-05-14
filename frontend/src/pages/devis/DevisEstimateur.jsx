import { useState } from 'react';

const C = { primary: '#1a3a5c', accent: '#e8740c' };

const TYPES_PRODUIT = ['PORTAIL', 'PORTE', 'BALCON', 'GARDE_CORPS', 'CLAUSTRA'];
const MATERIAUX = ['acier'];
const FINITIONS = ['peinture_epoxy', 'galvanise', 'brut'];
const COMPLEXITES = ['standard', 'ornemente', 'sur_mesure'];

function StatutDispo({ statut }) {
  const cfg = {
    DISPONIBLE: { color: 'bg-green-100 text-green-700', label: 'Stock disponible' },
    PARTIEL:    { color: 'bg-yellow-100 text-yellow-700', label: 'Stock partiel' },
    RUPTURE:    { color: 'bg-red-100 text-red-700', label: 'Rupture stock' },
  };
  const c = cfg[statut] || cfg.PARTIEL;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>{c.label}</span>;
}

export default function DevisEstimateur() {
  const [form, setForm] = useState({
    type_produit: 'PORTAIL',
    largeur_m: '2.5',
    hauteur_m: '2',
    materiau: 'acier',
    finition: 'peinture_epoxy',
    quantite: '1',
    complexite: 'standard',
    adresse_chantier: '',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [similaires, setSimilaires] = useState([]);
  const [creerDevis, setCreerDevis] = useState(false);
  const [clientId, setClientId] = useState('');
  const [devisCree, setDevisCree] = useState(null);

  const f = (field, val) => setForm(prev => ({ ...prev, [field]: val }));
  const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;

  const estimer = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setSimilaires([]);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_URL}/api/devis/estimer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          largeur_m: parseFloat(form.largeur_m),
          hauteur_m: parseFloat(form.hauteur_m),
          quantite: parseInt(form.quantite, 10),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      setResult(data);

      // Charger similaires en parallèle
      const rs = await fetch(
        `${import.meta.env.VITE_API_URL}/api/devis/historique-similaires?type_produit=${form.type_produit}&largeur_m=${form.largeur_m}&hauteur_m=${form.hauteur_m}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (rs.ok) setSimilaires(await rs.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveDevis = async () => {
    if (!clientId) { alert('Veuillez saisir un ID client'); return; }
    setLoading(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_URL}/api/devis/creer-auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          largeur_m: parseFloat(form.largeur_m),
          hauteur_m: parseFloat(form.hauteur_m),
          quantite: parseInt(form.quantite, 10),
          client_id: clientId,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      setDevisCree(data.devis);
      setCreerDevis(false);
    } catch (e) {
      alert('Erreur: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Estimateur de Devis</h1>
        <p className="text-sm text-gray-500">Calcul automatique du prix sur mesure</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulaire */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Paramètres du produit</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Type de produit</label>
              <div className="flex flex-wrap gap-2">
                {TYPES_PRODUIT.map(t => (
                  <button
                    key={t}
                    onClick={() => f('type_produit', t)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      form.type_produit === t ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={form.type_produit === t ? { backgroundColor: C.primary } : {}}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Largeur (m)</label>
              <input type="number" step="0.1" min="0.3" value={form.largeur_m}
                onChange={e => f('largeur_m', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hauteur (m)</label>
              <input type="number" step="0.1" min="0.5" value={form.hauteur_m}
                onChange={e => f('hauteur_m', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantité</label>
              <input type="number" min="1" value={form.quantite}
                onChange={e => f('quantite', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Finition</label>
              <select value={form.finition} onChange={e => f('finition', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                {FINITIONS.map(fin => <option key={fin} value={fin}>{fin}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Complexité</label>
              <div className="flex gap-2">
                {COMPLEXITES.map(comp => (
                  <button key={comp}
                    onClick={() => f('complexite', comp)}
                    className={`flex-1 py-1.5 rounded-lg text-sm transition ${
                      form.complexite === comp ? 'text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                    style={form.complexite === comp ? { backgroundColor: C.accent } : {}}
                  >
                    {comp}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Adresse chantier</label>
              <input type="text" value={form.adresse_chantier}
                onChange={e => f('adresse_chantier', e.target.value)}
                placeholder="Quartier, Douala…"
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={estimer}
            disabled={loading}
            className="mt-5 w-full py-3 rounded-xl text-white font-semibold transition"
            style={{ backgroundColor: loading ? '#ccc' : C.primary }}
          >
            {loading ? 'Calcul en cours…' : 'Calculer l\'estimation'}
          </button>
        </div>

        {/* Résultat */}
        <div className="space-y-4">
          {result ? (
            <>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">Résultat de l'estimation</h2>
                  <StatutDispo statut={result.disponibilite_stock} />
                </div>

                {/* Prix principal */}
                <div className="text-center py-4 rounded-xl mb-4" style={{ backgroundColor: '#f0f4f8' }}>
                  <p className="text-xs text-gray-500 mb-1">Prix client TTC</p>
                  <p className="text-4xl font-black" style={{ color: C.primary }}>
                    {result.prix_client_ttc?.toLocaleString('fr-FR')}
                    <span className="text-lg font-normal text-gray-500 ml-2">XAF</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    HT : {result.prix_client_ht?.toLocaleString('fr-FR')} XAF · TVA 19,25% : {result.tva?.toLocaleString('fr-FR')} XAF
                  </p>
                </div>

                {/* Décomposition coûts */}
                <div className="space-y-2">
                  {[
                    { label: 'Matériaux estimés', value: result.cout_materiaux_estime, color: 'text-blue-600' },
                    { label: 'Main d\'œuvre estimée', value: result.cout_mo_estime, color: 'text-purple-600' },
                    { label: 'Marge TAFDIL', value: result.marge_tafdil, color: 'text-green-600' },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between text-sm py-2 border-b border-gray-50">
                      <span className="text-gray-600">{item.label}</span>
                      <span className={`font-semibold ${item.color}`}>
                        {item.value?.toLocaleString('fr-FR')} XAF
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 pt-3 border-t flex justify-between text-sm text-gray-500">
                  <span>Délai estimé</span>
                  <span className="font-medium text-gray-800">{result.delai_estime_jours} jours</span>
                </div>
              </div>

              {/* Matériaux nécessaires */}
              {result.liste_materiaux_necessaires?.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <h3 className="font-semibold text-gray-800 mb-3 text-sm">Matériaux nécessaires</h3>
                  <div className="space-y-1.5">
                    {result.liste_materiaux_necessaires.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                        <span className="text-gray-700">{m.designation}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500 font-mono">{m.quantite} {m.unite}</span>
                          {m.suffisant !== null && (
                            <span className={`w-2 h-2 rounded-full ${m.suffisant ? 'bg-green-500' : 'bg-red-500'}`} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {!devisCree ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  {creerDevis ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-2">ID Client (UUID)</label>
                      <input type="text" value={clientId} onChange={e => setClientId(e.target.value)}
                        placeholder="UUID du client…" className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
                      <div className="flex gap-2">
                        <button onClick={() => setCreerDevis(false)}
                          className="flex-1 py-2 rounded-lg border text-sm text-gray-600">Annuler</button>
                        <button onClick={saveDevis} disabled={loading}
                          className="flex-1 py-2 rounded-lg text-white font-medium text-sm"
                          style={{ backgroundColor: C.primary }}>
                          Enregistrer le devis
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setCreerDevis(true)}
                      className="w-full py-3 rounded-xl font-semibold text-sm text-white"
                      style={{ backgroundColor: C.accent }}>
                      Créer un devis client →
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
                  <p className="font-semibold text-green-800">Devis créé : {devisCree.reference}</p>
                  <p className="text-sm text-green-600 mt-1">Statut : {devisCree.statut}</p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
              <p className="text-4xl mb-3">📐</p>
              <p>Saisissez les dimensions et cliquez sur<br />"Calculer l'estimation"</p>
            </div>
          )}

          {/* Devis similaires */}
          {similaires.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 mb-3 text-sm">Devis similaires (±20%)</h3>
              <div className="space-y-2">
                {similaires.slice(0, 5).map(s => (
                  <div key={s.id} className="flex justify-between text-xs py-2 border-b border-gray-50">
                    <span className="text-gray-600 font-medium">{s.reference}</span>
                    <span className="text-gray-400">
                      {s.specifications?.largeur_m}m×{s.specifications?.hauteur_m}m
                    </span>
                    <span className="font-semibold text-gray-800">
                      {s.montant_ttc?.toLocaleString('fr-FR')} XAF
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
