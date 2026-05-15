import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import TafdilLogo from '@/components/shared/TafdilLogo';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [mode, setMode]         = useState('login'); // 'login' | 'signup'
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) toast.error(error.message);
      else navigate('/dashboard');
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) toast.error(error.message);
      else {
        toast.success('Compte créé ! Connexion automatique…');
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
        if (!loginErr) navigate('/dashboard');
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#E30613] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <TafdilLogo size={64} className="mb-3" />
          <h1 className="text-2xl font-bold">
            <span className="text-[#E30613]">TAFDIL</span>
            <span className="text-black"> ERP</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Système de gestion intégré</p>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-lg border border-gray-200 mb-6 overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-[#E30613] text-white' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-[#E30613] text-white' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Créer un compte
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adresse e-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E30613]"
              placeholder="vous@tafdil.cm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mot de passe {mode === 'signup' && <span className="text-gray-400">(min. 6 caractères)</span>}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E30613]"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#E30613] hover:bg-[#B80010] text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {loading ? '…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          TAFDIL SARL — Douala, Cameroun
        </p>
      </div>
    </div>
  );
}
