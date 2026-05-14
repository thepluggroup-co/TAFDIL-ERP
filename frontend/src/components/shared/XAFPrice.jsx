/**
 * Formate un montant en XAF avec séparateur de milliers.
 */
export default function XAFPrice({ amount, className = '', size = 'md' }) {
  const formatted = new Intl.NumberFormat('fr-CM').format(amount ?? 0);
  const sizeClass = { sm: 'text-sm', md: 'text-base', lg: 'text-xl', xl: 'text-2xl' }[size] || 'text-base';

  return (
    <span className={`font-semibold tabular-nums ${sizeClass} ${className}`}>
      {formatted}
      <span className="text-xs font-normal text-gray-500 ml-1">XAF</span>
    </span>
  );
}
