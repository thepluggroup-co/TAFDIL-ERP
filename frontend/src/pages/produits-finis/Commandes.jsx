import { useEffect, useState } from 'react';
import { produitsFiniApi } from '@/api/produitsFinis';
import XAFPrice from '@/components/shared/XAFPrice';
import { FileText, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import supabase from '@/lib/supabase';
import dayjs from 'dayjs';

const STATUT_COLOR = {
  EN_ATTENTE_ACOMPTE: 'bg-amber-100 text-amber-700',
  EN_FABRICATION:     'bg-blue-100 text-blue-700',
  PRET:               'bg-purple-100 text-purple-700',
  LIVRE:              'bg-green-100 text-green-700',
  ANNULE:             'bg-red-100 text-red-700',
};

export default function Commandes() {
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCommandes = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('commandes_produits_finis')
      .select('*, produit:produit_fini_id(designation, type), devis:devis_id(numero)')
      .order('created_at', { ascending: false })
      .limit(50);
    setCommandes(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCommandes(); }, []);

  const handleBL = async (cmd) => {
    const livreur = prompt('UUID du livreur :');
    if (!livreur) return;
    try {
      const res = await produitsFiniApi.creerBonLivraison(cmd.id, {
        livreur_id: livreur,
        adresse_livraison: prompt('Adresse de livraison :') || '',
      });
      toast.success(`BL ${res.numero} créé — URL signature : ${res.url_signature_client}`);
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
      <h1 className="text-xl font-bold text-[#1a3a5c]">Commandes Produits Finis</h1>

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
            ) : commandes.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[#1a3a5c]">{c.numero}</td>
                <td className="px-4 py-2.5 font-medium">{c.client_nom || '—'}</td>
                <td className="px-4 py-2.5 text-gray-600 max-w-[160px] truncate">
                  {c.produit?.designation || 'Sur mesure'}
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
                  {c.date_livraison_prevue ? dayjs(c.date_livraison_prevue).format('DD/MM/YYYY') : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLOR[c.statut] || 'bg-gray-100'}`}>
                    {c.statut?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {c.devis_id && (
                      <button onClick={() => openDevisPdf(c.devis_id)} title="Devis PDF"
                        className="text-gray-400 hover:text-[#1a3a5c]">
                        <FileText size={14} />
                      </button>
                    )}
                    {c.statut === 'PRET' && !c.bon_livraison_id && (
                      <button onClick={() => handleBL(c)} title="Créer bon de livraison"
                        className="text-gray-400 hover:text-[#e8740c]">
                        <Truck size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !commandes.length && (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">Aucune commande</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
