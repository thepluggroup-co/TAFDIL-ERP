import { useEffect, useState } from 'react';
import { produitsFiniApi } from '@/api/produitsFinis';
import { supabase } from '@/lib/supabase';
import XAFPrice from '@/components/shared/XAFPrice';
import { FileText, Truck, Globe, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const STATUT_COLOR = {
  EN_ATTENTE_ACOMPTE: 'bg-amber-100 text-amber-700',
  EN_FABRICATION:     'bg-blue-100  text-blue-700',
  PRET:               'bg-purple-100 text-purple-700',
  LIVRE:              'bg-green-100  text-green-700',
  ANNULE:             'bg-red-100    text-red-700',
};

const TABS = [
  { key: 'ECOMMERCE', label: 'E-commerce', icon: Globe },
  { key: 'ERP',       label: 'ERP interne' },
];

export default function Commandes() {
  const [commandes, setCommandes] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('ECOMMERCE');  // vue e-commerce par défaut

  const fetchCommandes = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('commandes_produits_finis')
      .select(`
        *,
        produit:produit_fini_id(designation, type),
        devis:devis_id(numero)
      `)
      .eq('source_canal', tab)          // filtre e-commerce vs ERP
      .order('created_at', { ascending: false })
      .limit(100);
    setCommandes(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCommandes(); }, [tab]);

  const handleBL = async (cmd) => {
    const livreur = prompt('UUID du livreur :');
    if (!livreur) return;
    const adresse = prompt('Adresse de livraison :') || '';
    try {
      const res = await produitsFiniApi.creerBonLivraison(cmd.id, {
        livreur_id: livreur,
        adresse_livraison: adresse,
      });
      toast.success(`BL ${res.numero} créé`);
      fetchCommandes();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openDevisPdf = async (devisId) => {
    try {
      const blob = await produitsFiniApi.getDevis(devisId, 'pdf');
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1a3a5c]">Commandes</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Produits finis & quincaillerie — plateforme e-commerce
          </p>
        </div>
        <button onClick={fetchCommandes}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1a3a5c] border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      {/* Onglets source */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-white text-[#1a3a5c] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              {Icon && <Icon size={13} />}
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'ECOMMERCE' && (
        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
          <Globe size={13} />
          Commandes reçues via la plateforme e-commerce (produits finis + quincaillerie en ligne)
        </div>
      )}

      {/* Table commandes */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <tr>
              {['N° Commande', 'Client', 'Produit', 'Total', 'Acompte versé', 'Solde', 'Livraison prévue', 'Statut', 'Actions'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">Chargement…</td></tr>
            ) : commandes.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400">
                  <Globe size={24} className="mx-auto mb-2 opacity-30" />
                  <p>Aucune commande {tab === 'ECOMMERCE' ? 'e-commerce' : 'ERP'}</p>
                </td>
              </tr>
            ) : commandes.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[#1a3a5c]">
                  {c.numero}
                </td>
                <td className="px-4 py-2.5">
                  <p className="font-medium">{c.client_nom || '—'}</p>
                  {c.client_email && (
                    <p className="text-xs text-gray-400 truncate max-w-[140px]">{c.client_email}</p>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-600 max-w-[160px] truncate">
                  {c.produit?.designation || 'Sur mesure'}
                  {c.produit?.type && (
                    <span className="ml-1 text-xs text-gray-400">({c.produit.type})</span>
                  )}
                </td>
                <td className="px-4 py-2.5"><XAFPrice amount={c.montant_total} size="sm" /></td>
                <td className="px-4 py-2.5">
                  <XAFPrice amount={c.acompte_verse} size="sm" className="text-green-600" />
                </td>
                <td className="px-4 py-2.5">
                  <XAFPrice amount={c.solde_restant} size="sm"
                    className={c.solde_restant > 0 ? 'text-red-600' : 'text-green-600'} />
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">
                  {c.date_livraison_prevue
                    ? dayjs(c.date_livraison_prevue).format('DD/MM/YYYY')
                    : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLOR[c.statut] || 'bg-gray-100 text-gray-600'}`}>
                    {c.statut?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {c.devis_id && (
                      <button onClick={() => openDevisPdf(c.devis_id)} title="Voir devis PDF"
                        className="text-gray-400 hover:text-[#1a3a5c] transition-colors">
                        <FileText size={14} />
                      </button>
                    )}
                    {c.statut === 'PRET' && !c.bon_livraison_id && (
                      <button onClick={() => handleBL(c)} title="Créer bon de livraison"
                        className="text-gray-400 hover:text-[#e8740c] transition-colors">
                        <Truck size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
