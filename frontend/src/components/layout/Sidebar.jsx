import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import TafdilLogo from '@/components/shared/TafdilLogo';
import {
  LayoutDashboard, ShoppingCart, Package, Wrench,
  ClipboardList, BarChart2, Settings, ChevronDown,
  FileText, CalendarDays, CheckSquare, Cog, Users, DollarSign,
  TrendingUp, BookOpen, Gauge, Truck, Warehouse, ShieldCheck,
} from 'lucide-react';
import clsx from 'clsx';

// ─── Nav structure ────────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    key: 'quincaillerie',
    group: 'Boutique Quincaillerie',
    icon: ShoppingCart,
    items: [
      { label: 'Vente comptoir', to: '/quincaillerie/vente',  icon: ShoppingCart },
      { label: 'Stock',          to: '/quincaillerie/stock',  icon: Package },
    ],
  },
  {
    key: 'produits-finis',
    group: 'Produits Finis',
    icon: ClipboardList,
    items: [
      { label: 'Catalogue',  to: '/produits-finis/catalogue',  icon: ClipboardList },
      { label: 'Production', to: '/produits-finis/production', icon: Wrench },
      { label: 'Commandes',  to: '/produits-finis/commandes',  icon: BarChart2 },
    ],
  },
  {
    key: 'devis-crm',
    group: 'Devis & CRM',
    icon: FileText,
    items: [
      { label: 'Estimateur devis', to: '/devis/estimateur', icon: FileText },
      { label: 'Pipeline CRM',     to: '/crm/pipeline',     icon: TrendingUp },
    ],
  },
  {
    key: 'mrp',
    group: 'Production MRP',
    icon: CalendarDays,
    items: [
      { label: 'Planning atelier', to: '/mrp/planning', icon: CalendarDays },
    ],
  },
  {
    key: 'qualite',
    group: 'Qualité & Maintenance',
    icon: CheckSquare,
    items: [
      { label: 'Contrôle qualité', to: '/qualite',      icon: CheckSquare },
      { label: 'Maintenance',      to: '/maintenance',  icon: Cog },
    ],
  },
  {
    key: 'rh',
    group: 'Ressources Humaines',
    icon: Users,
    items: [
      { label: 'Employés',        to: '/rh/employes',  icon: Users },
      { label: 'Journal de paie', to: '/paie/journal', icon: DollarSign },
    ],
  },
  {
    key: 'stock',
    group: 'Stock & Logistique',
    icon: Warehouse,
    items: [
      { label: 'Inventaire',        to: '/inventaire',        icon: Warehouse },
      { label: 'Approvisionnement', to: '/approvisionnement', icon: Truck },
    ],
  },
  {
    key: 'finance',
    group: 'Finance & Contrôle',
    icon: BookOpen,
    items: [
      { label: 'Comptabilité',       to: '/compta/balance',  icon: BookOpen },
      { label: 'Tableau de bord DG', to: '/kpis/dashboard',  icon: Gauge },
      { label: "Journal d'audit",    to: '/audit',            icon: ShieldCheck },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getActiveGroupKey(pathname) {
  for (const g of NAV_GROUPS) {
    if (g.items.some(item => pathname.startsWith(item.to))) return g.key;
  }
  return null;
}

const linkCls = ({ isActive }) =>
  clsx(
    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150',
    isActive
      ? 'bg-[#E30613] text-white font-semibold shadow-sm'
      : 'text-gray-300 hover:bg-white/10 hover:text-white'
  );

const subLinkCls = ({ isActive }) =>
  clsx(
    'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors duration-150',
    isActive
      ? 'bg-[#E30613]/90 text-white font-semibold'
      : 'text-gray-400 hover:bg-white/10 hover:text-white'
  );

// ─── Sub-items animation variants ────────────────────────────────────────────

const containerVariants = {
  open: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1], staggerChildren: 0.04 },
  },
  closed: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
  },
};

const itemVariants = {
  open:   { x: 0,  opacity: 1, transition: { duration: 0.15 } },
  closed: { x: -6, opacity: 0, transition: { duration: 0.1  } },
};

// ─── NavGroup component ────────────────────────────────────────────────────────

function NavGroup({ group, isOpen, onToggle }) {
  const GroupIcon = group.icon;

  return (
    <div>
      {/* Group header — clickable */}
      <button
        onClick={onToggle}
        className={clsx(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold',
          'uppercase tracking-widest transition-colors duration-150',
          isOpen
            ? 'text-white bg-white/8'
            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
        )}
      >
        <GroupIcon size={15} className="shrink-0" />
        <span className="flex-1 text-left">{group.group}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="shrink-0"
        >
          <ChevronDown size={13} />
        </motion.span>
      </button>

      {/* Animated sub-items */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="submenu"
            variants={containerVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className="overflow-hidden"
          >
            <div className="ml-3 mt-0.5 mb-1 pl-3 border-l border-white/15 space-y-0.5">
              {group.items.map((item) => (
                <motion.div key={item.to} variants={itemVariants}>
                  <NavLink to={item.to} className={subLinkCls}>
                    <item.icon size={13} className="shrink-0" />
                    {item.label}
                  </NavLink>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState(() => {
    const active = getActiveGroupKey(location.pathname);
    return active ? new Set([active]) : new Set();
  });

  // Auto-open group when navigating to a route inside it
  useEffect(() => {
    const active = getActiveGroupKey(location.pathname);
    if (active) {
      setOpenGroups(prev => prev.has(active) ? prev : new Set([...prev, active]));
    }
  }, [location.pathname]);

  const toggleGroup = (key) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <motion.aside
      initial={{ x: -240, opacity: 0 }}
      animate={{ x: 0,    opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.8 }}
      className="w-60 bg-[#111111] flex flex-col shrink-0 h-full shadow-xl"
    >
      {/* ── Logo ── */}
      <div className="px-4 py-4 border-b border-white/10 shrink-0">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="flex items-center gap-2.5"
        >
          <TafdilLogo size={36} />
          <div className="leading-none">
            <span className="text-white font-bold text-lg tracking-wide">TAFDIL</span>
            <span className="text-[#E30613] font-bold text-lg"> ERP</span>
          </div>
        </motion.div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 scrollbar-hide">

        {/* Dashboard — standalone link */}
        <NavLink to="/dashboard" className={linkCls} end>
          <LayoutDashboard size={16} className="shrink-0" />
          Tableau de bord
        </NavLink>

        {/* Divider */}
        <div className="h-px bg-white/10 my-2" />

        {/* Collapsible groups */}
        <div className="space-y-0.5">
          {NAV_GROUPS.map((group) => (
            <NavGroup
              key={group.key}
              group={group}
              isOpen={openGroups.has(group.key)}
              onToggle={() => toggleGroup(group.key)}
            />
          ))}
        </div>
      </nav>

      {/* ── Footer ── */}
      <div className="px-4 py-3 border-t border-white/10 shrink-0">
        <NavLink
          to="/settings"
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors duration-150"
        >
          <Settings size={14} />
          Paramètres
        </NavLink>
      </div>
    </motion.aside>
  );
}
