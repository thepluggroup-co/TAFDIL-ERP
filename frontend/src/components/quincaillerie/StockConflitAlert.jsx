import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useStockStore } from '@/stores/useStockStore';
import XAFPrice from '@/components/shared/XAFPrice';

export default function StockConflitAlert() {
  const { conflits, fetchConflits } = useStockStore();
  if (!conflits.length) return null;

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
          <AlertTriangle size={16} className="text-amber-500" />
          {conflits.length} produit{conflits.length > 1 ? 's' : ''} en conflit de stock atelier / boutique
        </div>
        <button onClick={fetchConflits}
          className="text-amber-600 hover:text-amber-800 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="space-y-2">
        {conflits.map(c => (
          <div key={c.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm border border-amber-200">
            <span className="font-medium text-gray-800 truncate max-w-[60%]">{c.designation}</span>
            <div className="flex items-center gap-3 text-xs text-right shrink-0">
              <span className="text-gray-500">
                Stock: <strong className="text-gray-800">{c.stock_actuel}</strong>
              </span>
              <span className="text-amber-600">
                Réservé atelier: <strong>{c.quantite_reservee_atelier}</strong>
              </span>
              <span className={c.stock_dispo_boutique <= 0 ? 'text-red-600 font-bold' : 'text-green-600'}>
                Dispo: {c.stock_dispo_boutique}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
