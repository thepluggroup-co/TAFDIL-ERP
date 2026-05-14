import clsx from 'clsx';

/**
 * Affiche un badge coloré selon le niveau de stock disponible.
 * @param {number} dispo  Stock disponible boutique
 * @param {number} min    Seuil minimum configuré
 * @param {string} unite
 */
export default function StockBadge({ dispo, min = 0, unite = 'u.' }) {
  const niveau = dispo <= 0 ? 'rupture' : dispo <= min ? 'bas' : 'ok';

  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full',
      niveau === 'rupture' && 'bg-red-100 text-red-700',
      niveau === 'bas'     && 'bg-amber-100 text-amber-700',
      niveau === 'ok'      && 'bg-green-100 text-green-700',
    )}>
      <span className={clsx(
        'w-1.5 h-1.5 rounded-full',
        niveau === 'rupture' && 'bg-red-500',
        niveau === 'bas'     && 'bg-amber-500',
        niveau === 'ok'      && 'bg-green-500',
      )} />
      {dispo <= 0 ? 'Rupture' : `${dispo} ${unite}`}
    </span>
  );
}
