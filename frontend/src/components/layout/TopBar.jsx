import { useEffect, useRef, useState } from 'react';
import { useLocation, NavLink } from 'react-router-dom';
import { Bell, WifiOff, LogOut, AlertTriangle, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStockStore } from '@/stores/useStockStore';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// ─── Page title map ───────────────────────────────────────────────────────────

const PAGE_TITLES = {
  '/dashboard':                  'Tableau de bord',
  '/quincaillerie/vente':        'Vente comptoir',
  '/quincaillerie/stock':        'Stock quincaillerie',
  '/produits-finis/catalogue':   'Catalogue produits finis',
  '/produits-finis/production':  'Bons de production',
  '/produits-finis/commandes':   'Commandes',
  '/devis/estimateur':           'Estimateur devis',
  '/mrp/planning':               'Planning atelier',
  '/qualite':                    'Contrôle qualité',
  '/maintenance':                'Maintenance',
  '/rh/employes':                'Employés',
  '/paie/journal':               'Journal de paie',
  '/crm/pipeline':               'Pipeline CRM',
  '/compta/balance':             'Comptabilité',
  '/inventaire':                 'Inventaire',
  '/approvisionnement':          'Approvisionnement',
  '/audit':                      "Journal d'audit",
  '/kpis/dashboard':             'Tableau de bord DG',
};

// ─── Dropdown animation variants ─────────────────────────────────────────────

const dropdownVariants = {
  hidden: { opacity: 0, y: -8, scale: 0.97 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
  },
  exit: {
    opacity: 0, y: -6, scale: 0.97,
    transition: { duration: 0.13, ease: 'easeIn' },
  },
};

const itemVariants = {
  hidden:  { opacity: 0, x: -6 },
  visible: (i) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.04, duration: 0.14 },
  }),
};

// ─── User menu dropdown ───────────────────────────────────────────────────────

function UserMenu({ userEmail, initials, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-100 transition-colors duration-150"
      >
        <div className="w-8 h-8 rounded-full bg-[#1a3a5c] text-white text-xs flex items-center justify-center font-bold select-none">
          {initials}
        </div>
        {userEmail && (
          <span className="text-xs text-gray-500 hidden sm:block max-w-36 truncate">
            {userEmail}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs text-gray-400">Connecté en tant que</p>
              <p className="text-sm font-semibold text-gray-800 truncate">{userEmail}</p>
            </div>
            <div className="p-1">
              <NavLink
                to="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Paramètres du compte
                <ChevronRight size={14} className="ml-auto text-gray-400" />
              </NavLink>
              <button
                onClick={() => { setOpen(false); onSignOut(); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={14} />
                Se déconnecter
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Notification bell + dropdown ────────────────────────────────────────────

function NotificationBell({ conflits }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (conflits.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors duration-150"
        title={`${conflits.length} conflit(s) de stock`}
      >
        <Bell size={18} className="text-gray-500" />
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold"
        >
          {conflits.length > 9 ? '9+' : conflits.length}
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-500" />
                <span className="text-sm font-semibold text-gray-800">
                  Conflits de stock ({conflits.length})
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Conflict list */}
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
              {conflits.map((c, i) => (
                <motion.div
                  key={c.id || i}
                  custom={i}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  className="px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {c.designation || c.produit || `Article #${i + 1}`}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Stock disponible :{' '}
                        <span className="font-semibold text-red-600">
                          {c.stock_actuel ?? c.stock ?? '—'}
                        </span>
                        {c.stock_minimum != null && (
                          <> / min : <span className="text-gray-700">{c.stock_minimum}</span></>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                      CONFLIT
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60">
              <NavLink
                to="/quincaillerie/stock"
                onClick={() => setOpen(false)}
                className="text-xs text-[#1a3a5c] font-semibold hover:underline flex items-center gap-1"
              >
                Voir le stock complet <ChevronRight size={12} />
              </NavLink>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

export default function TopBar() {
  const { conflits, fetchConflits } = useStockStore();
  const [offline, setOffline]       = useState(!navigator.onLine);
  const [userEmail, setUserEmail]   = useState('');
  const location = useLocation();

  useEffect(() => {
    fetchConflits();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserEmail(user.email || '');
    });
    const onOff = () => setOffline(true);
    const onOn  = () => setOffline(false);
    window.addEventListener('offline', onOff);
    window.addEventListener('online',  onOn);
    return () => {
      window.removeEventListener('offline', onOff);
      window.removeEventListener('online',  onOn);
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success('Déconnecté');
  }

  const initials  = userEmail ? userEmail.substring(0, 2).toUpperCase() : 'ERP';
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'TAFDIL ERP';

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 z-10">

      {/* Current page title — animates on route change */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.h2
          key={location.pathname}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="text-sm font-semibold text-gray-700"
        >
          {pageTitle}
        </motion.h2>
      </AnimatePresence>

      {/* Right side controls */}
      <div className="flex items-center gap-2">

        {/* Offline badge */}
        <AnimatePresence>
          {offline && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium"
            >
              <WifiOff size={12} /> Hors ligne
            </motion.span>
          )}
        </AnimatePresence>

        {/* Notification bell */}
        <NotificationBell conflits={conflits} />

        {/* User menu */}
        <UserMenu
          userEmail={userEmail}
          initials={initials}
          onSignOut={handleSignOut}
        />
      </div>
    </header>
  );
}
