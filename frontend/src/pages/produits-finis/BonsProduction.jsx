import { useEffect, useState } from 'react';
import { produitsFiniApi } from '@/api/produitsFinis';
import BonProductionForm from '@/components/produits-finis/BonProductionForm';
import XAFPrice from '@/components/shared/XAFPrice';
import { Plus, CheckCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import supabase from '@/lib/supabase';

const STATUT_COLOR = {
  BROUILLON: 'bg-gray-100 text-gray-600',
  SOUMIS:    'bg-amber-100 text-amber-700',
  VALIDE:    'bg-green-100 text-green-700',
  REJETE:    'bg-red-100 text-red-700',
};

export default function BonsProduction() {
  const [bons, setBons] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [validating, setValidating] = useState(null);

  const fetchBons = async () => {
    const { data } = await supabase
      .from('bons_production')
      .select('*, produit_fini:produit_fini_id(designation, type, prix_vente)')
      .order('created_at', { ascending: false })
      .limit(50);
    setBons(data || []);
  };

  useEffect(() => { fetchBons(); }, []);

  const handleValider = async (bon) => {
    const prixOverride = prompt(
      `Valider le bon ${bon.reference}\n\nPrix suggéré : ${bon.prix_vente_suggere} XAF\nSaisir un prix différent ou laisser vide :`,
    );
    if (prixOverride === null) return; // annulé

    setValidating(bon.id);
    try {
      await produitsFiniApi.validerBon(bon.id, {
        valide_par: 'dg-user-id-placeholder',
        prix_vente_override: prixOverride ? +prixOverride : null,
      });
      toast.success(`Bon ${bon.reference} validé — produit entré en stock`);
      fetchBons();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setValidating(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1a3a5c]">Bons de Production</h1>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#1a3a5c] text-white text-sm font-semibold rounded-lg hover:bg-[#0f2540] transition-colors">
          <Plus size={14} /> Nouveau bon
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <tr>
              {['Référence', 'Produit', 'Type', 'Coût total', 'Prix suggéré', 'Statut', 'Actions'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bons.map(b => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{b.reference}</td>
                <td className="px-4 py-2.5 font-medium">{b.produit_fini?.designation || '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{b.produit_fini?.type}</td>
                <td className="px-4 py-2.5"><XAFPrice amount={b.cout_total} size="sm" /></td>
                <td className="px-4 py-2.5"><XAFPrice amount={b.prix_vente_suggere} size="sm" className="text-[#e8740c]" /></td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLOR[b.statut] || 'bg-gray-100 text-gray-600'}`}>
                    {b.statut}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {b.statut === 'SOUMIS' && (
                    <button onClick={() => handleValider(b)}
                      disabled={validating === b.id}
                      className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 font-semibold disabled:opacity-50">
                      <CheckCircle size={13} />
                      {validating === b.id ? 'Validation…' : 'Valider'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!bons.length && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Aucun bon de production</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-[#1a3a5c]">Déclarer une production</h2>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-500" /></button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[80vh]">
              <BonProductionForm onSuccess={() => { setShowForm(false); fetchBons(); }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
