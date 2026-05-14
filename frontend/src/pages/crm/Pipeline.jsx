import { useState, useEffect } from 'react';
import { Users, Phone, AlertTriangle, TrendingUp, Plus, MoreVertical, MessageCircle } from 'lucide-react';
import api from '../../api/client';

const COLONNES = [
  { key: 'PROSPECT',     label: 'Prospects',       color: 'border-gray-400',   bg: 'bg-gray-50' },
  { key: 'DEVIS_ENVOYE', label: 'Devis envoyés',   color: 'border-blue-400',   bg: 'bg-blue-50' },
  { key: 'NEGOCIATION',  label: 'Négociation',     color: 'border-orange-400', bg: 'bg-orange-50' },
  { key: 'GAGNE',        label: 'Gagnés',          color: 'border-green-400',  bg: 'bg-green-50' },
];

const SCORE_COLOR = { A: 'bg-green-100 text-green-700', B: 'bg-yellow-100 text-yellow-700', C: 'bg-orange-100 text-orange-700', D: 'bg-red-100 text-red-700' };

function ClientCard({ client, onMove, onNote }) {
  const [menu, setMenu] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">{client.nom}</p>
          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
            <Phone size={11} /> {client.telephone}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {client.score_risque && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${SCORE_COLOR[client.score_risque] || 'bg-gray-100 text-gray-600'}`}>
              {client.score_risque}
            </span>
          )}
          <div className="relative">
            <button onClick={() => setMenu(m => !m)} className="p-0.5 hover:bg-gray-100 rounded">
              <MoreVertical size={14} className="text-gray-400" />
            </button>
            {menu && (
              <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded shadow-lg py-1 w-40">
                {COLONNES.map(c => c.key !== client.pipeline_statut && (
                  <button key={c.key} onClick={() => { onMove(client.id, c.key); setMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">
                    → {c.label}
                  </button>
                ))}
                <hr className="my-1" />
                <button onClick={() => { onNote(client); setMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2">
                  <MessageCircle size={12} /> Ajouter note
                </button>
                <button onClick={() => { onMove(client.id, 'PERDU'); setMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 text-red-600">
                  Marquer perdu
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {client.encours_total_xaf > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-orange-600">
          <AlertTriangle size={11} />
          <span>{(client.encours_total_xaf / 1000).toFixed(0)}k XAF en cours</span>
        </div>
      )}

      {client.devis && client.devis.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {client.devis.slice(0, 2).map(d => (
            <span key={d.id} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
              {d.numero} — {((d.montant_total || 0) / 1000).toFixed(0)}k
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteModal({ client, onClose }) {
  const [form, setForm] = useState({ type: 'APPEL', contenu: '', date_prochaine_action: '' });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/crm/clients/${client.id}/note`, form);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900">Note — {client.nom}</h3>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {['APPEL','EMAIL','VISITE','RELANCE','LITIGE','DIVERS'].map(t => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Contenu</label>
            <textarea rows={3} required value={form.contenu}
              onChange={e => setForm(f => ({ ...f, contenu: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
              placeholder="Détail de l'échange…" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Prochaine action</label>
            <input type="datetime-local" value={form.date_prochaine_action}
              onChange={e => setForm(f => ({ ...f, date_prochaine_action: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {saving ? 'Envoi…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Pipeline() {
  const [pipeline, setPipeline] = useState({});
  const [loading, setLoading] = useState(true);
  const [noteClient, setNoteClient] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/crm/pipeline');
      setPipeline(r || {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleMove(client_id, statut) {
    await api.post(`/crm/clients/${client_id}/pipeline`, { statut });
    load();
  }

  const totalClients = Object.values(pipeline).reduce((s, col) => s + (col?.length || 0), 0);
  const totalEncours = Object.values(pipeline).flat().reduce((s, c) => s + parseFloat(c?.encours_total_xaf || 0), 0);

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="text-orange-500" size={24} /> Pipeline Commercial
          </h1>
          <p className="text-sm text-gray-500 mt-1">{totalClients} clients • {(totalEncours / 1000000).toFixed(1)} M XAF en cours</p>
        </div>
        <button onClick={() => window.location.href = '/clients/nouveau'}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-medium">
          <Plus size={16} /> Nouveau client
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLONNES.map(col => {
            const clients = pipeline[col.key] || [];
            return (
              <div key={col.key} className={`flex-shrink-0 w-72 rounded-xl border-t-4 ${col.color} ${col.bg} flex flex-col`}>
                <div className="p-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm text-gray-700">{col.label}</p>
                    <p className="text-xs text-gray-500">{clients.length} client{clients.length > 1 ? 's' : ''}</p>
                  </div>
                  <span className="bg-white border border-gray-200 rounded-full px-2 py-0.5 text-xs font-bold text-gray-600">
                    {clients.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2 px-3 pb-3 overflow-y-auto max-h-[calc(100vh-240px)]">
                  {clients.map(c => (
                    <ClientCard key={c.id} client={c} onMove={handleMove} onNote={setNoteClient} />
                  ))}
                  {clients.length === 0 && (
                    <p className="text-center text-xs text-gray-400 py-6">Aucun client</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {noteClient && <NoteModal client={noteClient} onClose={() => { setNoteClient(null); load(); }} />}
    </div>
  );
}
