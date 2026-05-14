import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, Wrench,
  ClipboardList, BarChart2, Settings, ChevronRight,
  FileText, CalendarDays, CheckSquare, Cog, Users, DollarSign,
  TrendingUp, BookOpen, Gauge, Truck, Warehouse, ShieldCheck
} from 'lucide-react';
import clsx from 'clsx';

const NAV = [
  { label: 'Tableau de bord', to: '/dashboard', icon: LayoutDashboard },
  {
    group: 'Boutique Quincaillerie',
    items: [
      { label: 'Vente comptoir', to: '/quincaillerie/vente', icon: ShoppingCart },
      { label: 'Stock', to: '/quincaillerie/stock', icon: Package },
    ],
  },
  {
    group: 'Produits Finis',
    items: [
      { label: 'Catalogue', to: '/produits-finis/catalogue', icon: ClipboardList },
      { label: 'Production', to: '/produits-finis/production', icon: Wrench },
      { label: 'Commandes', to: '/produits-finis/commandes', icon: BarChart2 },
    ],
  },
  {
    group: 'Devis & CRM',
    items: [
      { label: 'Estimateur devis', to: '/devis/estimateur', icon: FileText },
      { label: 'Pipeline CRM',     to: '/crm/pipeline',     icon: TrendingUp },
    ],
  },
  {
    group: 'Production MRP',
    items: [
      { label: 'Planning atelier', to: '/mrp/planning', icon: CalendarDays },
    ],
  },
  {
    group: 'Qualité & Maintenance',
    items: [
      { label: 'Contrôle qualité', to: '/qualite', icon: CheckSquare },
      { label: 'Maintenance', to: '/maintenance', icon: Cog },
    ],
  },
  {
    group: 'Ressources Humaines',
    items: [
      { label: 'Employés',       to: '/rh/employes',  icon: Users },
      { label: 'Journal de paie',to: '/paie/journal',  icon: DollarSign },
    ],
  },
  {
    group: 'Stock & Logistique',
    items: [
      { label: 'Inventaire',         to: '/inventaire',       icon: Warehouse },
      { label: 'Approvisionnement',  to: '/approvisionnement', icon: Truck },
    ],
  },
  {
    group: 'Finance & Contrôle',
    items: [
      { label: 'Comptabilité',        to: '/compta/balance',  icon: BookOpen },
      { label: 'Tableau de bord DG',  to: '/kpis/dashboard', icon: Gauge },
      { label: 'Journal d\'audit',    to: '/audit',           icon: ShieldCheck },
    ],
  },
];

const linkCls = ({ isActive }) =>
  clsx(
    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
    isActive
      ? 'bg-[#e8740c] text-white font-semibold'
      : 'text-gray-300 hover:bg-white/10 hover:text-white'
  );

export default function Sidebar() {
  return (
    <aside className="w-60 bg-[#1a3a5c] flex flex-col shrink-0 h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <span className="text-white font-bold text-xl tracking-wide">TAFDIL</span>
        <span className="text-[#e8740c] font-bold text-xl"> ERP</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV.map((item, i) =>
          item.group ? (
            <div key={i} className="pt-3">
              <p className="text-xs uppercase tracking-widest text-gray-400 px-3 pb-1">
                {item.group}
              </p>
              {item.items.map((sub) => (
                <NavLink key={sub.to} to={sub.to} className={linkCls}>
                  <sub.icon size={16} />
                  {sub.label}
                  <ChevronRight size={12} className="ml-auto opacity-40" />
                </NavLink>
              ))}
            </div>
          ) : (
            <NavLink key={item.to} to={item.to} className={linkCls}>
              <item.icon size={16} />
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10">
        <NavLink to="/settings" className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors">
          <Settings size={14} /> Paramètres
        </NavLink>
      </div>
    </aside>
  );
}
