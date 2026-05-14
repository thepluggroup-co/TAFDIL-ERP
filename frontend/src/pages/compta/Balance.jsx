import { useState, useEffect } from 'react';
import { BookOpen, Download, TrendingUp, TrendingDown, BarChart2, Filter } from 'lucide-react';
import api from '../../api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const JOURNAUX = ['VENTES', 'ACHATS', 'CAISSE', 'PAIE', 'OD'];
const CLASSES = { 1: 'Ressources durables', 2: 'Actifs immobilisés', 3: 'Stocks', 4: 'Tiers', 5: 'Trésorerie', 6: 'Charges', 7: 'Produits' };

function fmt(n) { return Math.abs(Math.round(n || 0)).toLocaleString('fr-FR'); }

export default function Balance() {
  const [tab, setTab] = useState('balance'); // balance | grandlivre | etats
  const [exercice, setExercice] = useState(new Date().getFullYear());
  const [journal, setJournal] = useState('');
  const [compte, setCompte] = useState('');
  const [balance, setBalance] = useState([]);
  const [grandLivre, setGrandLivre] = useState([]);
  const [etats, setEtats] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadBalance() {
    setLoading(true);
    try {
      const r = await api.get(`/compta/balance?exercice=${exercice}`);
      setBalance(Array.isArray(r) ? r : []);
    } finally { setLoading(false); }
  }

  async function loadGrandLivre() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ exercice });
      if (journal) params.set('journal', journal);
      if (compte)  params.set('compte', compte);
      const r = await api.get(`/compta/grand-livre?${params}`);
      setGrandLivre(Array.isArray(r) ? r : []);
    } finally { setLoading(false); }
  }

  async function loadEtats() {
    setLoading(true);
    try {
      const r = await api.get(`/compta/etats-financiers?exercice=${exercice}`);
      setEtats(r || null);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (tab === 'balance')    loadBalance();
    if (tab === 'grandlivre') loadGrandLivre();
    if (tab === 'etats')      loadEtats();
  }, [tab, exercice]);

  async function exportSage() {
    const params = new URLSearchParams({ exercice });
    if (journal) params.set('journal', journal);
    window.open(`/api/compta/sage-export?${params}`, '_blank');
  }

  // Grouper balance par classe
  const byClasse = {};
  for (const r of balance) {
    if (!byClasse[r.classe]) byClasse[r.classe] = [];
    byClasse[r.classe].push(r);
  }

  // Chart data pour états financiers
  const chartData = etats ? [
    { label: 'Produits', montant: etats.compte_resultat.produits / 1000000 },
    { label: 'Charges',  montant: etats.compte_resultat.charges  / 1000000 },
    { label: 'Résultat', montant: etats.compte_resultat.resultat_net / 1000000 },
  ] : [];

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="text-orange-500" size={24} /> Comptabilité SYSCOHADA
          </h1>
          <p className="text-sm text-gray-500 mt-1">Plan comptable OHADA — Exercice {exercice}</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={exercice} onChange={e => setExercice(parseInt(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {[2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
          <button onClick={exportSage}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
            <Download size={16} /> Sage CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {[['balance','Balance'], ['grandlivre','Grand livre'], ['etats','États financiers']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${tab === k ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-16 text-gray-400">Chargement…</div>}

      {/* ── BALANCE ── */}
      {!loading && tab === 'balance' && (
        <div className="space-y-4">
          {Object.entries(byClasse).sort(([a],[b]) => +a-+b).map(([cl, rows]) => (
            <div key={cl} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <p className="font-semibold text-sm text-gray-700">Classe {cl} — {CLASSES[cl]}</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Compte</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Libellé</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Débit</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Crédit</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Solde débiteur</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Solde créditeur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(r => (
                    <tr key={r.compte} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-600">{r.compte}</td>
                      <td className="px-4 py-2 text-gray-800">{r.libelle_compte}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{fmt(r.total_debit)}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{fmt(r.total_credit)}</td>
                      <td className="px-4 py-2 text-right font-medium text-blue-700">{r.solde_debiteur > 0 ? fmt(r.solde_debiteur) : ''}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-700">{r.solde_crediteur > 0 ? fmt(r.solde_crediteur) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {balance.length === 0 && <p className="text-center text-gray-400 py-12">Aucune écriture pour cet exercice.</p>}
        </div>
      )}

      {/* ── GRAND LIVRE ── */}
      {!loading && tab === 'grandlivre' && (
        <div>
          <div className="flex gap-3 mb-4">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <Filter size={14} className="text-gray-400" />
              <input value={compte} onChange={e => setCompte(e.target.value)}
                placeholder="Compte (ex: 411)" className="text-sm outline-none w-28"
                onBlur={loadGrandLivre} />
            </div>
            <select value={journal} onChange={e => { setJournal(e.target.value); }}
              onBlur={loadGrandLivre}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">Tous journaux</option>
              {JOURNAUX.map(j => <option key={j}>{j}</option>)}
            </select>
            <button onClick={loadGrandLivre}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600">
              Filtrer
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Date</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Journal</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Pièce</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Compte</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Libellé</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Débit</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Crédit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grandLivre.slice(0, 300).map((l, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-1.5 text-gray-600 text-xs">{l.date}</td>
                    <td className="px-4 py-1.5"><span className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded">{l.journal}</span></td>
                    <td className="px-4 py-1.5 font-mono text-xs text-gray-500">{l.piece_ref}</td>
                    <td className="px-4 py-1.5 font-mono text-xs font-medium text-gray-700">{l.compte}</td>
                    <td className="px-4 py-1.5 text-gray-700 max-w-xs truncate">{l.libelle}</td>
                    <td className="px-4 py-1.5 text-right text-blue-700">{l.debit > 0 ? fmt(l.debit) : ''}</td>
                    <td className="px-4 py-1.5 text-right text-green-700">{l.credit > 0 ? fmt(l.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {grandLivre.length === 0 && <p className="text-center text-gray-400 py-12">Aucune écriture.</p>}
            {grandLivre.length >= 300 && <p className="text-center text-xs text-gray-400 py-2">300 premières lignes affichées — affinez le filtre pour en voir plus.</p>}
          </div>
        </div>
      )}

      {/* ── ÉTATS FINANCIERS ── */}
      {!loading && tab === 'etats' && etats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Compte de résultat */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-orange-500" /> Compte de résultat {exercice}
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Produits d'exploitation</span>
                <span className="font-semibold text-green-700">{fmt(etats.compte_resultat.produits)} XAF</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Charges d'exploitation</span>
                <span className="font-semibold text-red-600">({fmt(etats.compte_resultat.charges)}) XAF</span>
              </div>
              <div className={`flex justify-between items-center py-3 rounded-lg px-3 ${etats.compte_resultat.resultat_net >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <span className="font-bold text-gray-900">Résultat net</span>
                <span className={`font-bold text-lg ${etats.compte_resultat.resultat_net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {etats.compte_resultat.resultat_net >= 0 ? '+' : ''}{fmt(etats.compte_resultat.resultat_net)} XAF
                </span>
              </div>
            </div>
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v.toFixed(1) + 'M'} />
                  <Tooltip formatter={v => (v * 1000000).toLocaleString('fr-FR') + ' XAF'} />
                  <Bar dataKey="montant" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bilan */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart2 size={18} className="text-orange-500" /> Bilan simplifié {exercice}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold text-blue-700 uppercase mb-2">ACTIF</p>
                {[
                  ['Immobilisations', etats.bilan.actif.immobilisations],
                  ['Stocks', etats.bilan.actif.stocks],
                  ['Créances clients', etats.bilan.actif.creances_clients],
                  ['Trésorerie', etats.bilan.actif.tresorerie],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-sm py-1 border-b border-gray-100">
                    <span className="text-gray-600">{l}</span>
                    <span className="font-medium">{fmt(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold mt-2 pt-2 border-t border-gray-300">
                  <span>Total Actif</span>
                  <span className="text-blue-700">{fmt(etats.bilan.actif.total)}</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-green-700 uppercase mb-2">PASSIF</p>
                {[
                  ['Capitaux propres', etats.bilan.passif.capitaux_propres],
                  ['Dettes court terme', etats.bilan.passif.dettes_court_terme],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-sm py-1 border-b border-gray-100">
                    <span className="text-gray-600">{l}</span>
                    <span className="font-medium">{fmt(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold mt-2 pt-2 border-t border-gray-300">
                  <span>Total Passif</span>
                  <span className="text-green-700">{fmt(etats.bilan.passif.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {!loading && tab === 'etats' && !etats && (
        <p className="text-center text-gray-400 py-12">Aucune donnée pour {exercice}.</p>
      )}
    </div>
  );
}
