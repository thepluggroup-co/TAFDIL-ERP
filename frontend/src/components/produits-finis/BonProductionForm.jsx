import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { produitsFiniApi } from '@/api/produitsFinis';
import { Plus, Trash2, Calculator } from 'lucide-react';
import XAFPrice from '@/components/shared/XAFPrice';
import toast from 'react-hot-toast';

const TYPES = ['PORTAIL', 'PORTE', 'BALCON', 'GARDE_CORPS', 'CLAUSTRA', 'AUTRE'];

export default function BonProductionForm({ onSuccess }) {
  const [coutCalc, setCoutCalc] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { register, control, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      materiaux_utilises: [{ produit_id: '', quantite: 1 }],
      cout_main_oeuvre: 0,
      type: 'PORTAIL',
      date_debut: new Date().toISOString().slice(0, 10),
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'materiaux_utilises' });

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      const res = await produitsFiniApi.creerBonProduction({
        ...data,
        technicien_id: data.technicien_id,
        cout_main_oeuvre: +data.cout_main_oeuvre,
        dimensions: {
          largeur: +data.largeur || 0,
          hauteur: +data.hauteur || 0,
          profondeur: +data.profondeur || 0,
        },
        materiaux_utilises: data.materiaux_utilises
          .filter(m => m.produit_id)
          .map(m => ({ ...m, quantite: +m.quantite })),
      });

      setCoutCalc(res.cout_detail);
      toast.success(`Bon ${res.reference} soumis au DG`);
      onSuccess?.(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Infos produit */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="form-label">Désignation *</label>
          <input {...register('designation', { required: true })} className="input-base" placeholder="Ex: Portail coulissant 4m×2m" />
        </div>
        <div>
          <label className="form-label">Type *</label>
          <select {...register('type')} className="input-base">
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Matériau</label>
          <input {...register('materiau')} className="input-base" placeholder="Acier galvanisé" />
        </div>
        <div>
          <label className="form-label">Finition</label>
          <input {...register('finition')} className="input-base" placeholder="Peinture époxy" />
        </div>
        <div>
          <label className="form-label">Couleur</label>
          <input {...register('couleur')} className="input-base" placeholder="Noir mat" />
        </div>
      </div>

      {/* Dimensions */}
      <div>
        <label className="form-label">Dimensions (mm)</label>
        <div className="grid grid-cols-3 gap-2">
          <input {...register('largeur')} type="number" className="input-base" placeholder="Largeur" />
          <input {...register('hauteur')} type="number" className="input-base" placeholder="Hauteur" />
          <input {...register('profondeur')} type="number" className="input-base" placeholder="Profondeur" />
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Date début *</label>
          <input {...register('date_debut', { required: true })} type="date" className="input-base" />
        </div>
        <div>
          <label className="form-label">Date fin</label>
          <input {...register('date_fin')} type="date" className="input-base" />
        </div>
      </div>

      {/* Matériaux utilisés */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="form-label mb-0">Matériaux consommés</label>
          <button type="button" onClick={() => append({ produit_id: '', quantite: 1 })}
            className="text-xs text-[#1a3a5c] hover:text-[#e8740c] flex items-center gap-1">
            <Plus size={13} /> Ajouter
          </button>
        </div>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={f.id} className="flex gap-2">
              <input {...register(`materiaux_utilises.${i}.produit_id`)}
                className="input-base flex-1" placeholder="UUID produit quincaillerie" />
              <input {...register(`materiaux_utilises.${i}.quantite`)}
                type="number" min="0.001" step="0.001"
                className="input-base w-24" placeholder="Qté" />
              <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main d'œuvre */}
      <div>
        <label className="form-label">Coût main d'œuvre (XAF) *</label>
        <input {...register('cout_main_oeuvre', { required: true, min: 0 })}
          type="number" className="input-base" placeholder="0" />
      </div>

      <input {...register('technicien_id', { required: true })}
        className="input-base" placeholder="UUID technicien *" />

      {/* Résultat calcul */}
      {coutCalc && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-green-800 flex items-center gap-2 mb-2">
            <Calculator size={14} /> Coût calculé automatiquement
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
            <span>Matériaux :</span> <XAFPrice amount={coutCalc.cout_materiaux} size="sm" />
            <span>Main d'œuvre :</span> <XAFPrice amount={coutCalc.cout_main_oeuvre} size="sm" />
            <span className="font-semibold">Total :</span> <XAFPrice amount={coutCalc.cout_total} size="sm" className="text-[#1a3a5c]" />
            <span className="text-green-700 font-semibold">Prix suggéré (+35%) :</span>
            <XAFPrice amount={coutCalc.prix_vente_suggere} size="sm" className="text-[#e8740c]" />
          </div>
        </div>
      )}

      <button type="submit" disabled={submitting}
        className="w-full py-2.5 bg-[#1a3a5c] hover:bg-[#0f2540] disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
        {submitting ? 'Envoi…' : 'Soumettre au DG'}
      </button>
    </form>
  );
}
