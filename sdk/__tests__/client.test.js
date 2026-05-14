'use strict';

const { TafdilClient, OfflineQueue, MemoryStorageAdapter, CHANNELS } = require('../src/index');

// ── Mocks ──────────────────────────────────────────────────────────────────────

global.fetch = jest.fn();

let mockChannel;
let mockSupabase;

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => {
    mockChannel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    };
    mockSupabase = {
      channel: jest.fn(() => mockChannel),
      removeChannel: jest.fn().mockResolvedValue(undefined),
      removeAllChannels: jest.fn().mockResolvedValue(undefined),
    };
    return mockSupabase;
  }),
}));

const BASE = {
  supabaseUrl:     'https://test.supabase.co',
  supabaseAnonKey: 'anon-key',
  apiGatewayUrl:   'http://localhost:3000',
  jwtToken:        'test-jwt',
};

function mockOk(body) {
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => body });
}

function mockErr(status, message) {
  global.fetch.mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ message }),
  });
}

// ── MemoryStorageAdapter ───────────────────────────────────────────────────────

describe('MemoryStorageAdapter', () => {
  let adapter;
  beforeEach(() => { adapter = new MemoryStorageAdapter(); });

  test('push then getAll', async () => {
    const op = { id: 'op1', table_cible: 't', operation: 'INSERT', payload: {}, client_ts: new Date().toISOString(), retries: 0 };
    await adapter.push(op);
    const all = await adapter.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('op1');
  });

  test('remove by id', async () => {
    await adapter.push({ id: 'a', table_cible: 't', operation: 'INSERT', payload: {}, client_ts: new Date().toISOString(), retries: 0 });
    await adapter.push({ id: 'b', table_cible: 't', operation: 'UPDATE', payload: {}, client_ts: new Date().toISOString(), retries: 0 });
    await adapter.remove(['a']);
    const all = await adapter.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('b');
  });

  test('getAll filtre les opérations > 72h', async () => {
    const old = {
      id: 'expired',
      table_cible: 't',
      operation: 'INSERT',
      payload: {},
      client_ts: new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString(),
      retries: 0,
    };
    await adapter.push(old);
    expect(await adapter.getAll()).toHaveLength(0);
  });

  test('clear vide le store', async () => {
    await adapter.push({ id: 'x', table_cible: 't', operation: 'INSERT', payload: {}, client_ts: new Date().toISOString(), retries: 0 });
    await adapter.clear();
    expect(await adapter.getAll()).toHaveLength(0);
  });
});

// ── OfflineQueue ───────────────────────────────────────────────────────────────

describe('OfflineQueue', () => {
  test('push attribue id et client_ts automatiquement', async () => {
    const q = new OfflineQueue();
    const id = await q.push({ table_cible: 'produits', operation: 'INSERT', payload: { nom: 'Meuble' } });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    const all = await q.getAll();
    expect(all[0].client_ts).toBeDefined();
    expect(all[0].retries).toBe(0);
  });

  test('accepte un adapter personnalisé', async () => {
    const custom = new MemoryStorageAdapter();
    const q = new OfflineQueue(custom);
    await q.push({ table_cible: 't', operation: 'DELETE', payload: { id: 1 } });
    expect(await custom.getAll()).toHaveLength(1);
  });
});

// ── TafdilClient — constructeur ────────────────────────────────────────────────

describe('TafdilClient — constructeur', () => {
  test('lève une erreur sans supabaseUrl', () => {
    expect(() => new TafdilClient({ supabaseAnonKey: 'k', apiGatewayUrl: 'u' }))
      .toThrow('supabaseUrl');
  });

  test('lève une erreur sans supabaseAnonKey', () => {
    expect(() => new TafdilClient({ supabaseUrl: 'u', apiGatewayUrl: 'g' }))
      .toThrow('supabaseAnonKey');
  });

  test('lève une erreur sans apiGatewayUrl', () => {
    expect(() => new TafdilClient({ supabaseUrl: 'u', supabaseAnonKey: 'k' }))
      .toThrow('apiGatewayUrl');
  });

  test('retire le slash final de apiGatewayUrl', () => {
    const c = new TafdilClient({ ...BASE, apiGatewayUrl: 'http://localhost:3000/' });
    expect(c._gatewayUrl).toBe('http://localhost:3000');
  });
});

// ── TafdilClient — connect / disconnect ───────────────────────────────────────

describe('TafdilClient — connect / disconnect', () => {
  test('connect() retourne this (chainable)', async () => {
    const c = new TafdilClient(BASE);
    expect(await c.connect()).toBe(c);
  });

  test('disconnect() nullifie _supabase', async () => {
    const c = new TafdilClient(BASE);
    await c.connect();
    await c.disconnect();
    await expect(c.get('test')).rejects.toThrow('connect()');
  });
});

// ── TafdilClient — Realtime ────────────────────────────────────────────────────

describe('TafdilClient — Realtime subscriptions', () => {
  let client;

  beforeEach(async () => {
    client = new TafdilClient(BASE);
    await client.connect();
  });

  afterEach(() => client.disconnect());

  test.each([
    ['onCatalogueUpdate', CHANNELS.CATALOGUE],
    ['onNewOrder',        CHANNELS.ORDERS],
    ['onPaymentConfirmed',CHANNELS.PAYMENTS],
    ['onStockChange',     CHANNELS.STOCK],
    ['onPlanningUpdate',  CHANNELS.PLANNING],
  ])('%s() s\'abonne au channel "%s"', (method, channelName) => {
    const result = client[method](jest.fn());
    expect(result).toBe(client);
    expect(mockSupabase.channel).toHaveBeenCalledWith(channelName);
  });

  test('double appel au même channel est ignoré', () => {
    const cb = jest.fn();
    client.onStockChange(cb);
    client.onStockChange(cb);
    expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
  });

  test('offAll() vide _subs et retourne this', async () => {
    client.onStockChange(jest.fn());
    client.onNewOrder(jest.fn());
    const result = await client.offAll();
    expect(result).toBe(client);
    expect(Object.keys(client._subs)).toHaveLength(0);
  });
});

// ── TafdilClient — isOnline & onStatusChange ──────────────────────────────────

describe('TafdilClient — état en ligne', () => {
  test('isOnline est un getter', () => {
    const c = new TafdilClient(BASE);
    expect(typeof c.isOnline).toBe('boolean');
  });

  test('onStatusChange retourne une fonction de désabonnement', () => {
    const c = new TafdilClient(BASE);
    const off = c.onStatusChange(jest.fn());
    expect(typeof off).toBe('function');
    off(); // ne doit pas lever d'erreur
  });
});

// ── TafdilClient — HTTP ────────────────────────────────────────────────────────

describe('TafdilClient — API calls', () => {
  let client;

  beforeEach(async () => {
    client = new TafdilClient(BASE);
    await client.connect();
    global.fetch.mockReset();
  });

  afterEach(() => client.disconnect());

  test('get() cible /api/{path} avec Authorization', async () => {
    mockOk({ data: [] });
    await client.get('produits');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/produits');
    expect(opts.method).toBe('GET');
    expect(opts.headers.Authorization).toBe('Bearer test-jwt');
  });

  test('get() gère le slash initial dans le path', async () => {
    mockOk({});
    await client.get('/produits/1');
    expect(global.fetch.mock.calls[0][0]).toBe('http://localhost:3000/api/produits/1');
  });

  test('post() envoie le body JSON', async () => {
    mockOk({ id: 'abc' });
    await client.post('commandes', { montant: 5000 });
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ montant: 5000 });
  });

  test('post() réessaie 3 fois sur échec réseau puis met en file', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));
    const result = await client.post('commandes', { montant: 5000 });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result.queued).toBe(true);
    expect(result.originalError).toBe('Network error');
  });

  test('post() met en file directement si hors ligne', async () => {
    client._online = false;
    const result = await client.post('commandes', { montant: 1000 });
    expect(result.queued).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('put() cible /api/{path}', async () => {
    mockOk({});
    await client.put('produits/1', { stock: 10 });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/produits/1');
    expect(opts.method).toBe('PUT');
  });

  test('delete() cible /api/{path}', async () => {
    mockOk({});
    await client.delete('produits/1');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/produits/1');
    expect(opts.method).toBe('DELETE');
  });

  test('lève une erreur sur réponse HTTP non-ok', async () => {
    mockErr(403, 'Forbidden');
    await expect(client.get('secret')).rejects.toThrow('Forbidden');
  });

  test('_assertConnected() lève si connect() non appelé', async () => {
    const c = new TafdilClient(BASE);
    await expect(c.get('x')).rejects.toThrow('connect()');
  });
});

// ── TafdilClient — sync ───────────────────────────────────────────────────────

describe('TafdilClient — sync()', () => {
  let client;

  beforeEach(async () => {
    client = new TafdilClient(BASE);
    await client.connect();
    global.fetch.mockReset();
  });

  afterEach(() => client.disconnect());

  test('retourne { skipped } si hors ligne', async () => {
    client._online = false;
    const res = await client.sync();
    expect(res.skipped).toBe(true);
  });

  test('retourne { ok:0, total:0 } si file vide', async () => {
    const res = await client.sync();
    expect(res.ok).toBe(0);
    expect(res.total).toBe(0);
  });

  test('envoie les opérations et purge les OK', async () => {
    await client.offlineQueue.push({ table_cible: 'ventes', operation: 'INSERT', payload: { montant: 100 } });
    const ops = await client.offlineQueue.getAll();
    const opId = ops[0].id;

    mockOk({
      total: 1, ok: 1, errors: 0,
      results: [{ id: opId, status: 'OK' }],
    });

    await client.sync();
    expect(await client.offlineQueue.getAll()).toHaveLength(0);
  });

  test('conserve les ops en erreur dans la file', async () => {
    await client.offlineQueue.push({ table_cible: 'ventes', operation: 'INSERT', payload: {} });
    const ops = await client.offlineQueue.getAll();
    const opId = ops[0].id;

    mockOk({
      total: 1, ok: 0, errors: 1,
      results: [{ id: opId, status: 'ERROR', reason: 'DB error' }],
    });

    await client.sync();
    expect(await client.offlineQueue.getAll()).toHaveLength(1);
  });

  test('retourne { skipped } si le gateway est injoignable', async () => {
    await client.offlineQueue.push({ table_cible: 'test', operation: 'INSERT', payload: {} });
    global.fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await client.sync();
    expect(res.skipped).toBe(true);
    expect(res.reason).toContain('ECONNREFUSED');
  });
});

// ── CHANNELS constant ─────────────────────────────────────────────────────────

describe('CHANNELS', () => {
  test('toutes les valeurs correctes', () => {
    expect(CHANNELS.CATALOGUE).toBe('catalogue-sync');
    expect(CHANNELS.ORDERS).toBe('commandes-live');
    expect(CHANNELS.PAYMENTS).toBe('paiements');
    expect(CHANNELS.STOCK).toBe('boutique-stock');
    expect(CHANNELS.PLANNING).toBe('planning-atelier');
  });
});
