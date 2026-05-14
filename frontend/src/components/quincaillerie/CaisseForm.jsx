import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCartStore } from '@/stores/useCartStore';
import { quincaillerieApi } from '@/api/quincaillerie';
import XAFPrice from '@/components/shared/XAFPrice';
import { Trash2, Printer, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

const MODES = ['ESPECES', 'CARTE', 'MOBILE_MONEY', 'VIREMENT', 'CREDIT'];

export default function CaisseForm({ vendeurId, onSuccess }) {
  const { lignes, clientType, clientNom, modePaiement,
          setClientType, setClientNom, setModePaiement,
          updateQte, removeLigne, clearCart, totaux } = useCartStore();

  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!lignes.length) return toast.error('Panier vide');
    setSubmitting(true);
    try {
      const res = await quincaillerieApi.creerVente({
        vendeur_id: vendeurId,
        client_type: clientType,
        client_nom: clientNom || null,
        mode_paiement: modePaiement,
        lignes: lignes.map(l => ({
          produit_id: l.produit_id,
          quantite: l.quantite,
          remise_pct: l.remise_pct,
        })),
      });

      toast.success(`Vente ${res.numero} enregistrée`);

      // Imprimer ticket automatiquement
      const blob = await quincaillerieApi.genererTicket(res.vente_id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');

      clearCart();
      onSuccess?.(res);
    } catch (err) {
      if (err.message.includes('conflit')) {
        toast.error('Conflit de stock — vérifiez les quantités');
      } else {
        toast.error(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Type client */}
      <div className="flex gap-2">
        {['PUBLIC', 'INTERNE'].map(t => (
          <button key={t}
            onClick={() => setClientType(t)}
            className={`flex-1 py-1.5 text-sm rounded-lg font-medium border transition-colors ${
              clientType === t
                ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]'
                : 'bg-white text-gray-600 border-gray-300 hover:border-[#1a3a5c]'
            }`}>
            {t === 'PUBLIC' ? 'Grand public' : 'Usage interne'}
          </button>
        ))}
      </div>

      {/* Nom client (optionnel) */}
      <input
        value={clientNom}
        onChange={e => setClientNom(e.target.value)}
        placeholder="Nom client (optionnel)"
        className="input-base"
      />

      {/* Lignes panier */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {lignes.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">
            Scannez ou sélectionnez un produit
          </p>
        )}
        {lignes.map(l => (
          <div key={l.produit_id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{l.designation}</p>
              <XAFPrice amount={l.prix_unitaire} size="sm" className="text-[#e8740c]" />
            </div>
            <input
              type="number" min="1" value={l.quantite}
              onChange={e => updateQte(l.produit_id, +e.target.value)}
              className="w-14 text-center border rounded-md text-sm py-1"
            />
            <button onClick={() => removeLigne(l.produit_id)}
              className="text-red-400 hover:text-red-600">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {/* Totaux */}
      <div className="border-t pt-3 space-y-1 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Sous-total HT</span>
          <XAFPrice amount={totaux.montant_ht} size="sm" />
        </div>
        <div className="flex justify-between text-gray-600">
          <span>TVA 19.25%</span>
          <XAFPrice amount={totaux.montant_tva} size="sm" />
        </div>
        <div className="flex justify-between font-bold text-base pt-1 border-t">
          <span>TOTAL TTC</span>
          <XAFPrice amount={totaux.montant_total} size="lg" className="text-[#1a3a5c]" />
        </div>
      </div>

      {/* Mode paiement */}
      <div className="relative">
        <select value={modePaiement} onChange={e => setModePaiement(e.target.value)}
          className="w-full input-base appearance-none pr-8">
          {MODES.map(m => <option key={m}>{m}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>

      {/* Valider */}
      <button
        onClick={submit}
        disabled={submitting || !lignes.length}
        className="w-full py-3 bg-[#e8740c] hover:bg-[#cf6509] disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
        <Printer size={16} />
        {submitting ? 'Enregistrement…' : 'Valider & Imprimer'}
      </button>
    </div>
  );
}
