import { useState, useEffect } from 'react';
import { TrendingUp, AlertTriangle, Package, Users, DollarSign, Factory, BarChart2, RefreshCw } from 'lucide-react';
import api from '../../api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

function fmt(n) { return Math.round(n || 0).toLocaleString('fr-FR'); }

function KpiCard({ icon: Icon, label, value, sub, color = 'orange', alert }) {
  const colors = {
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    green:  'bg-green-50  text-green-600  border-green-200',
    red:    'bg-red-50    text-red-600    border-red-200',
    blue:   'bg-blue-50   text-blue-600   border-blue-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon size={20} />
        {alert && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{alert}</span>}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-80 mt-0.5">{label}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

const COULEUR_MARGE = { VERT: '#22c55e', ORANGE: '#f97316', ROUGE: '#ef4444', GRIS: '#9ca3af' };

export default function DashboardDG() {
  const [data, setData] = useState(null);
  const [alertes, setAlertes] = useState(null);
  const [chantiers, setChantiers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [dRes, aRes, cRes] = await Promise.all([
        api.get('/kpis/dashboard'),
        api.get('/kpis/alertes-stock'),
        api.get('/kpis/chantiers'),
      ]);
      setData(dRes);
      setAlertes(aRes);
      setChantiers(cRes);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Chargement du tableau de bord…</div>;

  const margeData = chantiers?.chantiers?.map(c => ({
    name: c.numero,
    marge: parseFloat(c.marge_pct) || 0,
    budget: Math.round(parseFloat(c.budget_devis || 0) / 1000),
  })) || [];

  const alertePieData = [
    { name: 'Alerte rouge', value: alertes?.nb_alerte_rouge  || 0, color: '#ef4444' },
    { name: 'Alerte orange',value: alertes?.nb_alerte_orange || 0, color: '#f97316' },
  ].filter(d => d.value > 0);

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="text-orange-500" size={24} /> Tableau de Bord DG
          </h1>
          {lastRefresh && <p className="text-xs text-gray-400 mt-1">Mis à jour {lastRefresh.toLocaleTimeString('fr-FR')}</p>}
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={TrendingUp} label="CA du mois" value={`${(data?.ca_mois / 1000000).toFixed(1)} M XAF`} color="orange" />
        <KpiCard icon={Factory} label="Commandes en cours" value={data?.nb_cmd_en_cours} color="blue" />
        <KpiCard icon={Users} label="Clients à risque C/D" value={data?.nb_clients_risque}
          color={data?.nb_clients_risque > 0 ? 'red' : 'green'}
          alert={data?.nb_clients_risque > 0 ? 'Attention' : null} />
        <KpiCard icon={DollarSign} label="Solde prévisionnel 30j"
          value={`${((data?.tresorerie?.solde_previsionnel_30j || 0) / 1000000).toFixed(1)} M`}
          color={(data?.tresorerie?.solde_previsionnel_30j || 0) >= 0 ? 'green' : 'red'} />
      </div>

      {/* Chantiers + Alertes stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Chantiers marge */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Pilotage Chantiers — Marge (%)</h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />≥25%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />15–25%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />&lt;15%</span>
            </div>
          </div>
          {margeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={margeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v + '%'} />
                <Tooltip formatter={(v, n) => n === 'marge' ? v.toFixed(1) + '%' : v + 'k XAF'} />
                <Bar dataKey="marge" name="Marge" radius={[4,4,0,0]}
                  fill="#22c55e"
                  label={{ position: 'top', fontSize: 10, formatter: v => v.toFixed(0) + '%' }}>
                  {margeData.map((entry, i) => {
                    const c = entry.marge >= 25 ? '#22c55e' : entry.marge >= 15 ? '#f97316' : '#ef4444';
                    return <Cell key={i} fill={c} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 py-12 text-sm">Aucun chantier actif.</p>
          )}
        </div>

        {/* Alertes stock */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Package size={16} className="text-orange-500" /> Alertes Stock Prédictives
          </h3>
          {alertePieData.length > 0 ? (
            <PieChart width={180} height={120}>
              <Pie data={alertePieData} cx={90} cy={55} outerRadius={50} dataKey="value" label={({ name, value }) => `${value} ${name.split(' ')[1]}`} labelLine={false} fontSize={10}>
                {alertePieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
            </PieChart>
          ) : (
            <p className="text-center text-green-600 py-4 text-sm">✓ Aucune alerte critique</p>
          )}
          <div className="space-y-2 mt-2">
            {(alertes?.alertes || []).slice(0, 5).map(a => (
              <div key={a.id} className={`flex items-start gap-2 p-2 rounded-lg ${a.niveau_alerte === 'ALERTE_ROUGE' ? 'bg-red-50' : 'bg-orange-50'}`}>
                <AlertTriangle size={13} className={a.niveau_alerte === 'ALERTE_ROUGE' ? 'text-red-500 mt-0.5' : 'text-orange-500 mt-0.5'} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{a.designation}</p>
                  <p className="text-xs text-gray-500">{a.message_alerte || `Stock: ${a.stock_actuel} ${a.unite}`}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trésorerie prévisionnelle */}
      {data?.tresorerie && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign size={16} className="text-orange-500" /> Trésorerie Prévisionnelle — 30 jours
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ['Encaissements attendus', data.tresorerie.encaissements_attendus, 'green'],
              ['Décaissements fournisseurs', data.tresorerie.decaissements_fournisseurs, 'red'],
              ['Masse salariale estimée', data.tresorerie.paie_estimee, 'red'],
              ['Solde prévisionnel', data.tresorerie.solde_previsionnel_30j, data.tresorerie.solde_previsionnel_30j >= 0 ? 'green' : 'red'],
            ].map(([l, v, c]) => (
              <div key={l} className={`p-3 rounded-lg ${c === 'green' ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className="text-xs text-gray-500 mb-1">{l}</p>
                <p className={`text-lg font-bold ${c === 'green' ? 'text-green-700' : 'text-red-600'}`}>
                  {(parseFloat(v || 0) / 1000000).toFixed(1)} M XAF
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Atelier alertes */}
      {data?.atelier_alertes?.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <h3 className="font-semibold text-orange-800 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} /> Types de produits sous-évalués (ratio réel/estimé &gt; 1.20)
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.atelier_alertes.map(a => (
              <span key={a.type_produit} className="bg-orange-100 text-orange-700 text-xs px-3 py-1.5 rounded-lg font-medium">
                {a.type_produit} — ×{parseFloat(a.ratio_reel_estime).toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
