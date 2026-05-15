import clsx from 'clsx';

export default function StatCard({ label, value, sub, icon: Icon, accent = false }) {
  return (
    <div className={clsx(
      'rounded-xl p-5 border flex items-start gap-4',
      accent ? 'bg-[#E30613] border-[#E30613] text-white' : 'bg-white border-gray-200'
    )}>
      {Icon && (
        <div className={clsx(
          'p-2 rounded-lg',
          accent ? 'bg-white/10' : 'bg-[#E30613]/10'
        )}>
          <Icon size={20} className={accent ? 'text-white' : 'text-[#E30613]'} />
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
