import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import PageTransition from '@/components/layout/PageTransition';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import VenteComptoir from '@/pages/quincaillerie/VenteComptoir';
import StockView from '@/pages/quincaillerie/StockView';
import Catalogue from '@/pages/produits-finis/Catalogue';
import BonsProduction from '@/pages/produits-finis/BonsProduction';
import Commandes from '@/pages/produits-finis/Commandes';
import DevisEstimateur from '@/pages/devis/DevisEstimateur';
import PlanningAtelier from '@/pages/mrp/PlanningAtelier';
import ControleQualite from '@/pages/qualite/ControleQualite';
import MaintenanceDashboard from '@/pages/maintenance/MaintenanceDashboard';
import EmployesList from '@/pages/rh/EmployesList';
import JournalPaie from '@/pages/paie/JournalPaie';
import Pipeline from '@/pages/crm/Pipeline';
import Balance from '@/pages/compta/Balance';
import DashboardDG from '@/pages/kpis/DashboardDG';
import Approvisionnement from '@/pages/approvisionnement/Approvisionnement';
import Inventaire from '@/pages/inventaire/Inventaire';
import AuditLog from '@/pages/audit/AuditLog';

// ─── Animated page wrapper keyed to route ────────────────────────────────────

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <PageTransition key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />

          {/* Boutique Quincaillerie */}
          <Route path="/quincaillerie/vente" element={<VenteComptoir />} />
          <Route path="/quincaillerie/stock" element={<StockView />} />

          {/* Boutique Produits Finis */}
          <Route path="/produits-finis/catalogue"  element={<Catalogue />} />
          <Route path="/produits-finis/production" element={<BonsProduction />} />
          <Route path="/produits-finis/commandes"  element={<Commandes />} />

          {/* Devis automatique */}
          <Route path="/devis/estimateur" element={<DevisEstimateur />} />

          {/* MRP */}
          <Route path="/mrp/planning" element={<PlanningAtelier />} />

          {/* Qualité & Maintenance */}
          <Route path="/qualite"     element={<ControleQualite />} />
          <Route path="/maintenance" element={<MaintenanceDashboard />} />

          {/* RH & Paie */}
          <Route path="/rh/employes"  element={<EmployesList />} />
          <Route path="/paie/journal" element={<JournalPaie />} />

          {/* CRM */}
          <Route path="/crm/pipeline" element={<Pipeline />} />

          {/* Comptabilité */}
          <Route path="/compta/balance" element={<Balance />} />

          {/* Inventaire & Approvisionnement */}
          <Route path="/inventaire"        element={<Inventaire />} />
          <Route path="/approvisionnement" element={<Approvisionnement />} />

          {/* Audit & KPIs */}
          <Route path="/audit"          element={<AuditLog />} />
          <Route path="/kpis/dashboard" element={<DashboardDG />} />
        </Routes>
      </PageTransition>
    </AnimatePresence>
  );
}

// ─── App shell (authenticated layout) ────────────────────────────────────────

function AppShell() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-0">
          <AnimatedRoutes />
        </main>
      </div>
    </div>
  );
}

// ─── Root app (auth gate) ─────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) navigate('/login');
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#1a3a5c] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-white/70 text-sm">Chargement…</span>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/*"
        element={
          session
            ? <AppShell />
            : <Navigate to="/login" replace state={{ from: location }} />
        }
      />
    </Routes>
  );
}
