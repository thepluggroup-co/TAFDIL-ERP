import clsx from 'clsx';

export default function StatCard({ label, value, sub, icon: Icon, accent = false }) {
  return (
    <div className={clsx(
      'rounded-xl p-5 border flex items-start gap-4',
      accent ? 'bg-[#1a3a5c] border-[#1a3a5c] text-white' : 'bg-white border-gray-200'
    )}>
      {Icon && (
        <div className={clsx(
          'p-2 rounded-lg',
          accent ? 'bg-white/10' : 'bg-[#1a3a5c]/10'
        )}>
          <Icon size={20} className={accent ? 'text-[#e8740c]' : 'text-[#1a3a5c]'} />
        </div>
      )}
      <div className="min-w-0">
        <p className={clsx('text-xs uppercase tracking-wide', accent ? 'text-white/60' : 'text-gray-500')}>
          {label}
        </p>
        <p className={clsx('text-2xl font-bold mt-0.5 truncate', accent ? 'text-white' : 'text-gray-900')}>
          {value}
        </p>
        {sub && (
          <p className={clsx('text-xs mt-0.5', accent ? 'text-white/60' : 'text-gray-400')}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}
