import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const C = { primary: '#1a3a5c', accent: '#e8740c' };

const MOIS_FR = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const STATUT_COLOR = {
  BROUILLON: 'bg-gray-100 text-gray-600',
  VALIDE:    'bg-blue-100 text-blue-700',
  PAYE:      'bg-green-100 text-green-700',
};

function BulletinPreviewModal({ employe_id, nom, annee, mois, onClose }) {
  const [calcul, setCalcul] = useState(null);
  const [loading, setLoading] = useState(true);
  const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;

  useEffect(() => {
    const run = async () => {
      try {
        const r = await fetch(`${import.meta.env.VITE_API_URL}/api/paie/calculer-bulletin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ employe_id, annee, mois }),
        });
        const d = await r.json();
        if (r.ok) setCalcul(d.calcul);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [employe_id, annee, mois, token]);

  const openPDF = async () => {
    if (!calcul) return;
    // Recalcul pour avoir bulletin_id
    const r = await fetch(`${import.meta.env.VITE_API_URL}/api/paie/calculer-bulletin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ employe_id, annee, mois }),
    });
    const d = await r.json();
    if (d.bulletin_id) {
      window.open(`${import.meta.env.VITE_API_URL}/api/paie/bulletin/${d.bulletin_id}/pdf`, '_blank');
    }
  };

  const Row = ({ label, value, bold, red, green }) => (
    <div className={`flex justify-between py-1.5 border-b border-gray-50 text-sm ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <span className={`font-mono ${red ? 'text-red-600' : green ? 'text-green-700' : 'text-gray-800'}`}>
        {typeof value === 'number' ? value.toLocaleString('fr-FR') + ' XAF' : value}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-gray-900">{nom}</h2>
            <p className="text-xs text-gray-400">{MOIS_FR[mois]} {annee}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl">×</button>
        </div>

        <div className="overflow-auto flex-1 p-5">
          {loading ? (
            <div className="text-center py-8 text-gray-400">Calcul en cours…</div>
          ) : calcul ? (
            <div>
              {/* Résumé net */}
              <div className="text-center py-4 mb-4 rounded-xl" style={{ backgroundColor: '#f0f8f0' }}>
                <p className="text-xs text-gray-500">NET À PAYER</p>
                <p className="text-3xl font-black" style={{ color: '#16a34a' }}>
                  {calcul.salaire_net?.toLocaleString('fr-FR')} XAF
                </p>
                <p className="text-xs text-gray-400 mt-1 italic">{calcul.salaire_net_lettres}</p>
              </div>

              <Row label="Salaire de base" value={calcul.salaire_base} />
              {calcul.heures_sup > 0 && <Row label={`Heures sup. (${calcul.heures_sup}h)`} value={calcul.montant_heures_sup} />}
              {calcul.primes_total > 0 && <Row label="Primes" value={calcul.primes_total} />}
              <Row label="SALAIRE BRUT" value={calcul.salaire_brut} bold />
              <div className="my-2" />
              <Row label="CNPS Vieillesse (2,8%)" value={calcul.cnps_vieillesse_sal} red />
              <Row label="IRPP mensuel" value={calcul.irpp_mensuel} red />
              <Row label="CAC (10% IRPP)" value={calcul.cac_mensuel} red />
              {calcul.avances_deduites > 0 && <Row label="Avances déduites" value={calcul.avances_deduites} red />}
              <Row label="TOTAL RETENUES" value={calcul.total_retenues + calcul.avances_deduites} bold red />
              <div className="my-2" />
              <Row label="NET À PAYER" value={calcul.salaire_net} bold green />
              <div className="mt-4 pt-3 border-t">
                <p className="text-xs text-gray-400 font-semibold mb-1">Charges patronales (info)</p>
                <Row label="Coût total employeur" value={calcul.cout_total_employeur} />
              </div>
            </div>
          ) : <p className="text-center text-red-500">Erreur de calcul</p>}
        </div>

        <div className="p-5 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm text-gray-600">Fermer</button>
          {calcul && (
            <button onClick={openPDF}
              className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm"
              style={{ backgroundColor: C.primary }}>
              Voir PDF →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JournalPaie() {
  const now = new Date();
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [journaux, setJournaux] = useState([]);
  const [masse, setMasse] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [bulletinModal, setBulletinModal] = useState(null);

  const token = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}')?.access_token;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jR, mR, eR] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/paie/journaux`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${import.meta.env.VITE_API_URL}/api/paie/cout-masse-salariale`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${import.meta.env.VITE_API_URL}/api/rh/employes?statut=ACTIF&limit=100`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (jR.ok) setJournaux(await jR.json());
      if (mR.ok) setMasse(await mR.json());
      if (eR.ok) { const d = await eR.json(); setEmployes(d.employes || []); }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const genererJournal = async () => {
    setGenerating(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_URL}/api/paie/journal/generer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ annee, mois }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      alert(`Journal généré : ${d.bulletins.length} bulletins`);
      load();
    } catch (e) {
      alert('Erreur: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const validerJournal = async (journal_id) => {
    if (!confirm('Valider ce journal de paie ? Cette action est irréversible.')) return;
    try {
      const r = await fetch(`${import.meta.env.VITE_API_URL}/api/paie/journal/${journal_id}/valider`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error((await r.json()).message);
      load();
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  };

  const exportDeclarationCNPS = async (a, m) => {
    const r = await fetch(`${import.meta.env.VITE_API_URL}/api/paie/declaration-cnps?annee=${a}&mois=${m}`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return alert('Erreur export CNPS');
    const data = await r.json();
    // Génère CSV téléchargeable
    const headers = ['Matricule CNPS','Nom','Prénom','Matricule Interne','Salaire Brut','Cotis. Salarié','Cotis. Patronale','AT Patron','Total Patronal'];
    const rows = data.map(d => [
      d.matricule_cnps, d.nom, d.prenom, d.matricule_interne,
      d.salaire_brut, d.cotisation_salarie, d.cotisation_patronale, d.at_patron, d.total_patronal,
    ]);
    const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a_el = document.createElement('a');
    a_el.href = url; a_el.download = `CNPS_${a}_${String(m).padStart(2,'0')}.csv`;
    a_el.click(); URL.revokeObjectURL(url);
  };

  const chartData = masse.slice(0, 12).reverse().map(m => ({
    name: `${MOIS_FR[m.mois]} ${m.annee}`,
    brut: Math.round(m.total_brut / 1000),
    net: Math.round(m.total_net / 1000),
    charges: Math.round(m.total_charges_patronales / 1000),
  }));

  const journalDuMois = journaux.find(j => j.annee === annee && j.mois === mois);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Journal de Paie</h1>
        <p className="text-sm text-gray-500">Calcul CNPS & IRPP — Droit camerounais 2024</p>
      </div>

      {/* Sélecteur période + action */}
      <div className="flex items-end gap-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Année</label>
          <select value={annee} onChange={e => setAnnee(parseInt(e.target.value))}
            className="border rounded-xl px-3 py-2 text-sm bg-white">
            {[2024, 2025, 2026].map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mois</label>
          <select value={mois} onChange={e => setMois(parseInt(e.target.value))}
            className="border rounded-xl px-3 py-2 text-sm bg-white">
            {MOIS_FR.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <button onClick={genererJournal} disabled={generating}
          className="px-5 py-2 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: generating ? '#ccc' : C.primary }}>
          {generating ? 'Génération…' : `Générer journal ${MOIS_FR[mois]} ${annee}`}
        </button>
        {journalDuMois && (
          <button onClick={() => exportDeclarationCNPS(annee, mois)}
            className="px-4 py-2 rounded-xl border text-sm text-gray-700 hover:bg-gray-100">
            Export CNPS CSV
          </button>
        )}
      </div>

      {/* Journal du mois */}
      {journalDuMois && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">
              Journal {MOIS_FR[journalDuMois.mois]} {journalDuMois.annee}
            </h2>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUT_COLOR[journalDuMois.statut]}`}>
                {journalDuMois.statut}
              </span>
              {journalDuMois.statut === 'BROUILLON' && (
                <button onClick={() => validerJournal(journalDuMois.id)}
                  className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
                  style={{ backgroundColor: C.accent }}>
                  Valider
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { label: 'Employés', value: journalDuMois.total_employes },
              { label: 'Total brut', value: `${Number(journalDuMois.total_brut).toLocaleString('fr-FR')} XAF` },
              { label: 'Total net', value: `${Number(journalDuMois.total_net).toLocaleString('fr-FR')} XAF`, color: 'text-green-700' },
              { label: 'Charges pat.', value: `${Number(journalDuMois.total_charges_pat).toLocaleString('fr-FR')} XAF`, color: 'text-red-600' },
              { label: 'Total IRPP', value: `${Number(journalDuMois.total_irpp).toLocaleString('fr-FR')} XAF` },
            ].map(k => (
              <div key={k.label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">{k.label}</p>
                <p className={`font-bold mt-0.5 text-sm ${k.color || 'text-gray-800'}`}>{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste employés avec accès bulletin */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="px-5 py-4 border-b flex justify-between">
          <h2 className="font-semibold text-gray-800">Bulletins individuels</h2>
          <p className="text-xs text-gray-400">{employes.length} employés actifs</p>
        </div>
        <div className="divide-y divide-gray-50 max-h-80 overflow-auto">
          {employes.map(e => (
            <div key={e.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
              <div>
                <p className="font-medium text-sm text-gray-800">{e.prenom} {e.nom}</p>
                <p className="text-xs text-gray-400">{e.matricule} · {e.poste}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-gray-600">
                  {Number(e.salaire_base_xaf).toLocaleString('fr-FR')} XAF
                </span>
                <button
                  onClick={() => setBulletinModal({ employe_id: e.id, nom: `${e.prenom} ${e.nom}` })}
                  className="text-xs px-3 py-1.5 rounded-lg border text-gray-600 hover:bg-gray-100">
                  Simuler →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Graphique masse salariale */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Évolution masse salariale (kXAF)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `${v.toLocaleString('fr-FR')} kXAF`} />
              <Bar dataKey="net" fill="#16a34a" name="Net" radius={[3,3,0,0]} />
              <Bar dataKey="charges" fill="#dc2626" name="Charges pat." radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {bulletinModal && (
        <BulletinPreviewModal
          employe_id={bulletinModal.employe_id}
          nom={bulletinModal.nom}
          annee={annee}
          mois={mois}
          onClose={() => setBulletinModal(null)}
        />
      )}
    </div>
  );
}
