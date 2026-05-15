import { useEffect, useState, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { produitsFiniApi } from '@/api/produitsFinis';
import { quincaillerieApi } from '@/api/quincaillerie';
import { Plus, Trash2, Calculator, Search, ChevronDown } from 'lucide-react';
import XAFPrice from '@/components/shared/XAFPrice';
import toast from 'react-hot-toast';

const TYPES = ['PORTAIL', 'PORTE', 'BALCON', 'GARDE_CORPS', 'CLAUSTRA', 'AUTRE'];

// ─── Sélecteur de produit quincaillerie connecté à la DB ─────────────────────

function ProduitQuincaillerieSelect({ value, onChange, index }) {
  const [query,    setQuery]    = useState('');
  const [options,  setOptions]  = useState([]);
  const [open,     setOpen]     = useState(false);
  const [selected, setSelected] = useState(null);
  const [loading,  setLoading]  = useState(false);

  // Recherche avec debounce
  useEffect(() => {
    if (query.length < 2) { setOptions([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      quincaillerieApi.getCatalogue({ search: query, limit: 20 })
        .then(res => { setOptions(res.produits || []); setLoading(false); })
        .catch(() => setLoading(false));
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  const handleSelect = (p) => {
    setSelected(p);
    setQuery(p.designation);
    setOpen(false);
    onChange(p.id);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery('');
    setOpen(false);
    onChange('');
  };

  return (
    <div className="relative flex-1">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) handleClear(); }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder={`Matériau #${index + 1} — saisir pour chercher…`}
          className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#1a3a5c] outline-none"
        />
        {selected && (
          <button type="button" onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500">
            ×
          </button>
        )}
      </div>

      {/* Dropdown résultats */}
      {open && (query.length >= 2) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-gray-400 px-3 py-2">Recherche…</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-2">Aucun résultat</p>
          ) : (
            options.map(p => (
              <button key={p.id} type="button"
                onClick={() => handleSelect(p)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                <p className="text-sm font-medium text-gray-800 truncate">{p.designation}</p>
                <p className="text-xs text-gray-400">
                  {p.reference} — Stock : {p.stock_dispo_boutique} {p.unite}
                  {p.stock_dispo_boutique <= 0 && (
                    <span className="ml-1 text-red-500 font-medium">RUPTURE</span>
                  )}
                </p>
              </button>
            ))
          )}
        </div>
      )}

      {/* Badge unité si sélectionné */}
      {selected && (
        <p className="text-xs text-gray-500 mt-0.5 px-1">
          Unité : <span className="font-medium">{selected.unite}</span>
          {' '} — Stock dispo :{' '}
          <span className={selected.stock_dispo_boutique > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
            {selected.stock_dispo_boutique} {selected.unite}
          </span>
        </p>
      )}
    </div>
  );
}

// ─── BonProductionForm ────────────────────────────────────────────────────────

export default function BonProductionForm({ onSuccess }) {
  const [coutCalc,   setCoutCalc]   = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { register, control, handleSubmit, setValue, formState: { errors } } = useForm({
    defaultValues: {
      materiaux_utilises: [{ produit_id: '', quantite: 1 }],
      cout_main_oeuvre:   0,
      type:               'PORTAIL',
      date_debut:         new Date().toISOString().slice(0, 10),
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'materiaux_utilises' });

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      const res = await produitsFiniApi.creerBonProduction({
        ...data,
        cout_main_oeuvre: +data.cout_main_oeuvre,
        dimensions: {
          largeur:    +data.largeur    || 0,
          hauteur:    +data.hauteur    || 0,
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
          <input {...register('designation', { required: true })}
            className="input-base" placeholder="Ex : Portail coulissant 4m×2m" />
        </div>
        <div>
          <label className="form-label">Type *</label>
          <select {...register('type')} className="input-base">
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Matériau principal</label>
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
          <input {...register('largeur')}    type="number" className="input-base" placeholder="Largeur" />
          <input {...register('hauteur')}    type="number" className="input-base" placeholder="Hauteur" />
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

      {/* ── Matériaux consommés — connectés à la base quincaillerie ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="form-label mb-0">Matériaux consommés</label>
          <button type="button"
            onClick={() => append({ produit_id: '', quantite: 1 })}
            className="text-xs text-[#1a3a5c] hover:text-[#e8740c] flex items-center gap-1 transition-colors">
            <Plus size={13} /> Ajouter un matériau
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((f, i) => (
            <div key={f.id} className="flex gap-2 items-start">
              {/* Sélecteur connecté à la DB */}
              <ProduitQuincaillerieSelect
                index={i}
                value={f.produit_id}
                onChange={(id) => setValue(`materiaux_utilises.${i}.produit_id`, id)}
              />
              {/* Quantité */}
              <div className="w-24 shrink-0">
                <input
                  {...register(`materiaux_utilises.${i}.quantite`)}
                  type="number" min="0.001" step="0.001"
                  className="input-base w-full"
                  placeholder="Qté"
                />
              </div>
              <button type="button" onClick={() => remove(i)}
                className="mt-1.5 text-red-400 hover:text-red-600 transition-colors shrink-0">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        {fields.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-lg">
            Aucun matériau — cliquez "Ajouter" pour saisir les consommations
          </p>
        )}
      </div>

      {/* Main d'œuvre */}
      <div>
        <label className="form-label">Coût main d'œuvre (XAF) *</label>
        <input
          {...register('cout_main_oeuvre', { required: true, min: 0 })}
          type="number" className="input-base" placeholder="0"
        />
      </div>

      {/* Résultat calcul coût */}
      {coutCalc && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-green-800 flex items-center gap-2 mb-2">
            <Calculator size={14} /> Coût calculé automatiquement
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
            <span>Matériaux :</span>    <XAFPrice amount={coutCalc.cout_materiaux}    size="sm" />
            <span>Main d'œuvre :</span> <XAFPrice amount={coutCalc.cout_main_oeuvre}  size="sm" />
            <span className="font-semibold">Total :</span>
            <XAFPrice amount={coutCalc.cout_total} size="sm" className="text-[#1a3a5c]" />
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
