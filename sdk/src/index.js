'use strict';

const { createClient } = require('@supabase/supabase-js');

const OFFLINE_TTL_MS = 72 * 60 * 60 * 1000; // 72 heures

const CHANNELS = {
  CATALOGUE: 'catalogue-sync',
  ORDERS:    'commandes-live',
  PAYMENTS:  'paiements',
  STOCK:     'boutique-stock',
  PLANNING:  'planning-atelier',
};

// ── Storage adapters ──────────────────────────────────────────────────────────
// Implémentation en mémoire (défaut — CC backend, tests).
// Pour Electron : injecter SqliteStorageAdapter depuis electron/src/db/localDb.js
// Pour Expo     : injecter ExpoSqliteAdapter depuis mobile/src/services/offlineDb.js

class MemoryStorageAdapter {
  constructor() { this._ops = []; }

  async push(op) { this._ops.push(op); return op.id; }

  async getAll() {
    const cutoff = Date.now() - OFFLINE_TTL_MS;
    this._ops = this._ops.filter(op => new Date(op.client_ts).getTime() > cutoff);
    return [...this._ops];
  }

  async remove(ids) {
    const set = new Set(ids);
    this._ops = this._ops.filter(op => !set.has(op.id));
  }

  async clear() { this._ops = []; }
}

// ── OfflineQueue ──────────────────────────────────────────────────────────────

class OfflineQueue {
  constructor(adapter) {
    this._adapter = adapter || new MemoryStorageAdapter();
  }

  push(op) {
    const full = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      client_ts: new Date().toISOString(),
      retries: 0,
      ...op,
    };
    return this._adapter.push(full);
  }

  getAll()    { return this._adapter.getAll(); }
  remove(ids) { return this._adapter.remove(ids); }
  clear()     { return this._adapter.clear(); }
}

// ── TafdilClient ──────────────────────────────────────────────────────────────

class TafdilClient {
  constructor({ supabaseUrl, supabaseAnonKey, apiGatewayUrl, jwtToken, storageAdapter } = {}) {
    if (!supabaseUrl)     throw new Error('[TafdilSDK] supabaseUrl requis');
    if (!supabaseAnonKey) throw new Error('[TafdilSDK] supabaseAnonKey requis');
    if (!apiGatewayUrl)   throw new Error('[TafdilSDK] apiGatewayUrl requis');

    this._supabaseUrl     = supabaseUrl;
    this._supabaseAnonKey = supabaseAnonKey;
    this._gatewayUrl      = apiGatewayUrl.replace(/\/$/, '');
    this._token           = jwtToken || null;
    this._supabase        = null;
    this._subs            = {};
    this._online          = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this._statusListeners = [];

    this.offlineQueue = new OfflineQueue(storageAdapter);

    if (typeof window !== 'undefined') {
      window.addEventListener('online',  () => this._setOnline(true));
      window.addEventListener('offline', () => this._setOnline(false));
    }
  }

  // ── Connexion & auth ────────────────────────────────────────────────────────

  async connect() {
    this._supabase = createClient(this._supabaseUrl, this._supabaseAnonKey, {
      global: { headers: this._token ? { Authorization: `Bearer ${this._token}` } : {} },
      realtime: { params: { eventsPerSecond: 10 } },
    });
    return this;
  }

  async disconnect() {
    await this.offAll();
    if (this._supabase) {
      await this._supabase.removeAllChannels().catch(() => {});
      this._supabase = null;
    }
  }

  // ── Realtime subscriptions ──────────────────────────────────────────────────

  _sub(channelName, cb) {
    this._assertConnected();
    if (this._subs[channelName]) return this;
    this._subs[channelName] = this._supabase
      .channel(channelName)
      .on('broadcast', { event: '*' }, msg => cb(msg.payload ?? msg))
      .subscribe();
    return this;
  }

  onCatalogueUpdate(cb)  { return this._sub(CHANNELS.CATALOGUE, cb); }
  onNewOrder(cb)         { return this._sub(CHANNELS.ORDERS,    cb); }
  onPaymentConfirmed(cb) { return this._sub(CHANNELS.PAYMENTS,  cb); }
  onStockChange(cb)      { return this._sub(CHANNELS.STOCK,     cb); }
  onPlanningUpdate(cb)   { return this._sub(CHANNELS.PLANNING,  cb); }

  async offAll() {
    const removals = Object.values(this._subs).map(ch =>
      this._supabase ? this._supabase.removeChannel(ch).catch(() => {}) : Promise.resolve()
    );
    await Promise.all(removals);
    this._subs = {};
    return this;
  }

  // ── Online state & status bar ───────────────────────────────────────────────

  get isOnline() { return this._online; }

  // Retourne un unsubscribe. Utilisé par Electron pour mettre à jour la barre de statut.
  onStatusChange(cb) {
    this._statusListeners.push(cb);
    return () => { this._statusListeners = this._statusListeners.filter(l => l !== cb); };
  }

  async _setOnline(val) {
    this._online = val;
    await this._notifyStatus();
    if (val) this.sync().catch(() => {});
  }

  async _notifyStatus() {
    const ops = await Promise.resolve(this.offlineQueue.getAll());
    const pending = Array.isArray(ops) ? ops.length : 0;
    this._statusListeners.forEach(cb => cb({ online: this._online, pending }));
  }

  // ── Offline sync (ERP natif uniquement) ────────────────────────────────────

  async sync() {
    if (!this._online) return { skipped: true, reason: 'offline' };

    const ops = await Promise.resolve(this.offlineQueue.getAll());
    if (!ops.length) return { ok: 0, total: 0, errors: 0 };

    let res;
    try {
      res = await this._req('POST', '/sync/push', { operations: ops });
    } catch (err) {
      return { skipped: true, reason: err.message, ok: 0, total: ops.length, errors: ops.length };
    }

    const synced = (res.results || [])
      .filter(r => r.status === 'OK' || r.status === 'ALREADY_SYNCED')
      .map(r => r.id);
    await Promise.resolve(this.offlineQueue.remove(synced));
    await this._notifyStatus();
    return res;
  }

  // ── API calls ───────────────────────────────────────────────────────────────

  async get(path) {
    return this._req('GET', this._apiPath(path));
  }

  async post(path, body) {
    const apiUrl = this._apiPath(path);

    if (!this._online) {
      const id = await Promise.resolve(
        this.offlineQueue.push({ table_cible: path, operation: 'POST', payload: body })
      );
      await this._notifyStatus();
      return { queued: true, id };
    }

    try {
      return await this._retry(() => this._req('POST', apiUrl, body));
    } catch (err) {
      // Offline fallback après 3 échecs réseau
      const id = await Promise.resolve(
        this.offlineQueue.push({ table_cible: path, operation: 'POST', payload: body })
      );
      await this._notifyStatus();
      return { queued: true, id, originalError: err.message };
    }
  }

  async put(path, body) {
    return this._req('PUT', this._apiPath(path), body);
  }

  async delete(path) {
    return this._req('DELETE', this._apiPath(path));
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  _apiPath(path) {
    return `/api/${String(path).replace(/^\//, '')}`;
  }

  async _retry(fn, maxAttempts = 3) {
    let last;
    for (let i = 1; i <= maxAttempts; i++) {
      try { return await fn(); }
      catch (err) {
        last = err;
        if (i < maxAttempts) await new Promise(r => setTimeout(r, 300 * i));
      }
    }
    throw last;
  }

  async _req(method, path, body = null) {
    this._assertConnected();
    const url = `${this._gatewayUrl}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (this._token) headers.Authorization = `Bearer ${this._token}`;

    const opts = { method, headers };
    if (body !== null && method !== 'GET') opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw Object.assign(
        new Error(payload.message || `HTTP ${res.status}`),
        { status: res.status }
      );
    }
    return res.json();
  }

  _assertConnected() {
    if (!this._supabase) {
      throw new Error("[TafdilSDK] Appelez await client.connect() avant d'utiliser le SDK");
    }
  }
}

module.exports = { TafdilClient, OfflineQueue, MemoryStorageAdapter, CHANNELS };
