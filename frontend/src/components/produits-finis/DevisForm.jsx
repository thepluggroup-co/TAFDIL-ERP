import { useForm } from 'react-hook-form';
import { produitsFiniApi } from '@/api/produitsFinis';
import { useState } from 'react';
import XAFPrice from '@/components/shared/XAFPrice';
import toast from 'react-hot-toast';

const TYPES = ['PORTAIL', 'PORTE', 'BALCON', 'GARDE_CORPS', 'CLAUSTRA', 'AUTRE'];

export default function DevisForm({ onSuccess }) {
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: { type_produit: 'PORTAIL', specifications: {} },
  });

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      const res = await produitsFiniApi.creerDevis({
        ...data,
        specifications: {
          largeur: +data.largeur || null,
          hauteur: +data.hauteur || null,
          materiau: data.materiau,
          finition: data.finition,
          couleur: data.couleur,
          notes: data.notes,
        },
      });
      setResult(res);
      toast.success(`Devis ${res.numero} créé`);
      onSuccess?.(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (result) return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
      <p className="font-bold text-green-800 text-lg">Devis {result.numero} créé ✓</p>
      <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
        <span>Montant HT :</span>      <XAFPrice amount={result.montant_ht} size="sm" />
        <span>TVA :</span>             <XAFPrice amount={result.montant_tva} size="sm" />
        <span className="font-semibold">Total TTC :</span>
        <XAFPrice amount={result.montant_total} size="md" className="text-[#E30613]" />
        <span className="text-amber-700 font-semibold">Acompte ({result.acompte_pct}%) :</span>
        <XAFPrice amount={result.montant_acompte} size="md" className="text-[#E30613]" />
        <span>Validité :</span>        <span>{result.date_validite}</span>
        <span>Délai fabrication :</span><span>{result.delai_fabrication_jours} jours</span>
      </div>
      <button onClick={() => setResult(null)}
        className="text-sm text-gray-500 hover:text-gray-700 underline">
        Nouveau devis
      </button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="form-label">Client *</label>
          <input {...register('client_nom')} className="input-base" placeholder="Nom du client" />
        </div>
        <div>
          <label className="form-label">Téléphone</label>
          <input {...register('client_telephone')} className="input-base" placeholder="+237 6XX XXX XXX" />
        </div>
        <div>
          <label className="form-label">Email</label>
          <input {...register('client_email')} type="email" className="input-base" />
        </div>
        <div>
          <label className="form-label">Type produit *</label>
          <select {...register('type_produit')} className="input-base">
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Matériau</label>
          <input {...register('materiau')} className="input-base" placeholder="Acier, inox…" />
        </div>
        <div>
          <label className="form-label">Largeur (mm)</label>
          <input {...register('largeur')} type="number" className="input-base" />
        </div>
        <div>
          <label className="form-label">Hauteur (mm)</label>
          <input {...register('hauteur')} type="number" className="input-base" />
        </div>
        <div>
          <label className="form-label">Finition</label>
          <input {...register('finition')} className="input-base" placeholder="Peinture, galva…" />
        </div>
        <div>
          <label className="form-label">Couleur</label>
          <input {...register('couleur')} className="input-base" placeholder="Noir, gris…" />
        </div>
        <div className="col-span-2">
          <label className="form-label">Notes / exigences particulières</label>
          <textarea {...register('notes')} rows={3} className="input-base resize-none"
            placeholder="Serrure électrique, vitre feuilletée…" />
        </div>
      </div>
      <button type="submit" disabled={submitting}
        className="w-full py-2.5 bg-[#E30613] hover:bg-[#B80010] disabled:opacity-50 text-white font-bold rounded-xl transition-colors">
        {submitting ? 'Génération devis…' : 'Générer le devis'}
      </button>
    </form>
  );
}
