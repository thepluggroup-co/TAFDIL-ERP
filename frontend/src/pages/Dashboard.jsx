import { useEffect, useState } from 'react';
import { quincaillerieApi } from '@/api/quincaillerie';
import { produitsFiniApi } from '@/api/produitsFinis';
import StatCard from '@/components/shared/StatCard';
import StockConflitAlert from '@/components/quincaillerie/StockConflitAlert';
import { ShoppingCart, Package, Wrench, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import XAFPrice from '@/components/shared/XAFPrice';
import dayjs from 'dayjs';

export default function Dashboard() {
  const [statsJour, setStatsJour] = useState(null);
  const [statsProd, setStatsProd] = useState(null);
  const today = dayjs().format('YYYY-MM-DD');

  useEffect(() => {
    quincaillerieApi.getStatsJour(today).then(r => setStatsJour(r.stats)).catch(() => {});
    const debut = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    produitsFiniApi.getStatsProduction({ debut, fin: today }).then(r => setStatsProd(r.stats)).catch(() => {});
  }, [today]);

  const chartData = statsJour ? [
    { name: 'Public', ca: statsJour.public.ca, nb: statsJour.public.nb },
    { name: 'Interne', ca: statsJour.interne.ca, nb: statsJour.interne.nb },
  ] : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1a3a5c]">
        Tableau de bord — {dayjs().format('DD MMMM YYYY')}
      </h1>

      <StockConflitAlert />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="CA du jour"
          value={<XAFPrice amount={statsJour?.ca_total ?? 0} size="lg" />}
          sub={`${statsJour?.nb_transactions ?? 0} transactions`}
          icon={TrendingUp}
          accent
        />
        <StatCard
          label="Ventes public"
          value={<XAFPrice amount={statsJour?.public.ca ?? 0} size="lg" />}
          sub={`${statsJour?.public.nb ?? 0} ventes`}
          icon={ShoppingCart}
        />
        <StatCard
          label="Sorties internes"
          value={<XAFPrice amount={statsJour?.interne.ca ?? 0} size="lg" />}
          sub={`${statsJour?.interne.nb ?? 0} bons`}
          icon={Package}
        />
        <StatCard
          label="Pièces fabriquées (30j)"
          value={statsProd?.total_pieces ?? '—'}
          sub={`Marge moy. ${statsProd?.marge_pct_moy ?? '—'}%`}
          icon={Wrench}
        />
      </div>

      {/* Graphique ventes du jour */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Répartition ventes aujourd'hui</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} barCategoryGap="40%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => new Intl.NumberFormat('fr-CM').format(v) + ' XAF'} />
            <Bar dataKey="ca" fill="#1a3a5c" radius={[4,4,0,0]} name="CA" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Rentabilité production */}
      {statsProd && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Production (30 derniers jours)</h2>
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <p className="text-gray-500">CA produits finis</p>
              <XAFPrice amount={statsProd.ca_total} size="lg" className="text-[#1a3a5c]" />
            </div>
            <div>
              <p className="text-gray-500">Marge brute</p>
              <XAFPrice amount={statsProd.marge_brute} size="lg" className="text-green-600" />
            </div>
            <div>
              <p className="text-gray-500">Délai moyen</p>
              <p className="text-xl font-bold text-[#e8740c]">
                {statsProd.delai_moyen_jours ?? '—'} <span className="text-sm font-normal text-gray-500">j.</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
