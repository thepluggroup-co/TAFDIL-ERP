import { useMemo, useState } from 'react';
import { useCartStore } from '@/stores/useCartStore';
import { quincaillerieApi } from '@/api/quincaillerie';
import XAFPrice from '@/components/shared/XAFPrice';
import { Trash2, Printer, ChevronDown, Minus, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

const MODES = ['ESPECES', 'CARTE', 'MOBILE_MONEY', 'VIREMENT', 'CREDIT'];
const TVA   = 0.1925;

export default function CaisseForm({ vendeurId, onSuccess }) {
  const {
    lignes, clientNom, modePaiement,
    setClientNom, setModePaiement,
    updateQte, removeLigne, clearCart,
  } = useCartStore();

  const [submitting, setSubmitting] = useState(false);

  // Calcul réactif du total à chaque changement de lignes
  const totaux = useMemo(() => {
    const ht = lignes.reduce(
      (s, l) => s + l.quantite * l.prix_unitaire * (1 - (l.remise_pct ?? 0) / 100),
      0
    );
    const tva = ht * TVA;
    return {
      montant_ht:    Math.round(ht),
      montant_tva:   Math.round(tva),
      montant_total: Math.round(ht + tva),
    };
  }, [lignes]);

  const submit = async () => {
    if (!lignes.length) return toast.error('Panier vide');
    if (!vendeurId || vendeurId === 'replace-with-auth-user-id') {
      return toast.error('Utilisateur non identifié — veuillez vous reconnecter');
    }
    setSubmitting(true);
    try {
      const res = await quincaillerieApi.creerVente({
        vendeur_id:     vendeurId,
        client_type:    'PUBLIC',   // vente comptoir = toujours client externe
        client_nom:     clientNom || null,
        mode_paiement:  modePaiement,
        lignes: lignes.map(l => ({
          produit_id: l.produit_id,
          quantite:   l.quantite,
          remise_pct: l.remise_pct ?? 0,
        })),
      });

      toast.success(`Vente ${res.numero} enregistrée`);

      // Impression ticket — téléchargement direct (évite le blocage popup navigateur)
      try {
        const blob = await quincaillerieApi.genererTicket(res.vente_id);
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `ticket-${res.numero}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        toast('Vente enregistrée — impression ticket non disponible', { icon: '⚠️' });
      }

      clearCart();
      onSuccess?.(res);
    } catch (err) {
      if (err.message?.toLowerCase().includes('conflit')) {
        toast.error('Conflit de stock — quantité insuffisante');
      } else {
        toast.error(err.message || 'Erreur lors de la vente');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-3">

      {/* Nom client */}
      <input
        value={clientNom}
        onChange={e => setClientNom(e.target.value)}
        placeholder="Nom client (optionnel)"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#1a3a5c] outline-none"
      />

      {/* Lignes panier — calcul en temps réel */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {lignes.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">
            Sélectionnez un produit dans le catalogue
          </p>
        ) : (
          lignes.map(l => (
            <div key={l.produit_id}
              className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-lg p-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 leading-tight truncate">
                  {l.designation}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <XAFPrice amount={l.prix_unitaire} size="sm" className="text-[#e8740c]" />
                  {l.remise_pct > 0 && (
                    <span className="text-xs text-green-600 font-medium">−{l.remise_pct}%</span>
                  )}
                </div>
                {/* Sous-total ligne */}
                <p className="text-xs text-gray-500 mt-0.5">
                  Sous-total :{' '}
                  <span className="font-semibold text-gray-700">
                    {new Intl.NumberFormat('fr-CM').format(
                      Math.round(l.quantite * l.prix_unitaire * (1 - (l.remise_pct ?? 0) / 100))
                    )} XAF
                  </span>
                </p>
              </div>

              {/* Contrôle quantité */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => l.quantite > 1
                    ? updateQte(l.produit_id, l.quantite - 1)
                    : removeLigne(l.produit_id)}
                  className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:border-[#1a3a5c] transition-colors">
                  <Minus size={11} />
                </button>
                <input
                  type="number" min="1" value={l.quantite}
                  onChange={e => updateQte(l.produit_id, Math.max(1, +e.target.value))}
                  className="w-10 text-center border border-gray-300 rounded text-sm py-0.5 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
                />
                <button
                  onClick={() => updateQte(l.produit_id, l.quantite + 1)}
                  className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:border-[#1a3a5c] transition-colors">
                  <Plus size={11} />
                </button>
                <button onClick={() => removeLigne(l.produit_id)}
                  className="ml-1 text-red-400 hover:text-red-600 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totaux — mis à jour à chaque ajout/suppression */}
      <div className="border-t pt-3 space-y-1.5 text-sm">
        <div className="flex justify-between text-gray-500">
          <span>Sous-total HT</span>
          <XAFPrice amount={totaux.montant_ht} size="sm" />
        </div>
        <div className="flex justify-between text-gray-500">
          <span>TVA 19,25%</span>
          <XAFPrice amount={totaux.montant_tva} size="sm" />
        </div>
        <div className="flex justify-between font-bold text-base pt-1.5 border-t border-gray-200">
          <span className="text-gray-800">TOTAL TTC</span>
          <XAFPrice amount={totaux.montant_total} size="lg" className="text-[#1a3a5c]" />
        </div>
      </div>

      {/* Mode de paiement */}
      <div className="relative">
        <select
          value={modePaiement}
          onChange={e => setModePaiement(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg appearance-none focus:ring-1 focus:ring-[#1a3a5c] outline-none pr-8"
        >
          {MODES.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>

      {/* Valider & Imprimer */}
      <button
        onClick={submit}
        disabled={submitting || !lignes.length}
        className="w-full py-3 bg-[#e8740c] hover:bg-[#cf6509] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
      >
        <Printer size={16} />
        {submitting ? 'Enregistrement…' : 'Valider & Imprimer'}
      </button>
    </div>
  );
}
