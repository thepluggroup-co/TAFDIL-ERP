import { Bell, WifiOff, LogOut } from 'lucide-react';
import { useStockStore } from '@/stores/useStockStore';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function TopBar() {
  const { conflits, fetchConflits } = useStockStore();
  const [offline, setOffline] = useState(!navigator.onLine);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    fetchConflits();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserEmail(user.email || '');
    });
    const onOff = () => setOffline(true);
    const onOn  = () => setOffline(false);
    window.addEventListener('offline', onOff);
    window.addEventListener('online', onOn);
    return () => { window.removeEventListener('offline', onOff); window.removeEventListener('online', onOn); };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success('Déconnecté');
  }

  const initials = userEmail ? userEmail.substring(0, 2).toUpperCase() : 'ERP';

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div />

      <div className="flex items-center gap-4">
        {offline && (
          <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
            <WifiOff size={12} /> Hors ligne
          </span>
        )}

        {conflits.length > 0 && (
          <button className="relative" title={`${conflits.length} conflit(s) de stock`}>
            <Bell size={18} className="text-gray-500" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
              {conflits.length}
            </span>
          </button>
        )}

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#1a3a5c] text-white text-xs flex items-center justify-center font-bold">
            {initials}
          </div>
          {userEmail && (
            <span className="text-xs text-gray-500 hidden sm:block max-w-32 truncate">{userEmail}</span>
          )}
          <button onClick={handleSignOut} title="Se déconnecter" className="text-gray-400 hover:text-red-500 transition-colors">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
