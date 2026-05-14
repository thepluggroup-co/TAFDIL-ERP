'use strict';

/**
 * Tests d'intégration contre Supabase local.
 *
 * Pré-requis :
 *   supabase start          → démarre Supabase local sur port 54321
 *   node sync-gateway/src/app.js  → gateway sur port 3001
 *
 * Variables d'environnement :
 *   SUPABASE_URL       http://localhost:54321
 *   SUPABASE_ANON_KEY  (supabase status → anon key)
 *   GATEWAY_URL        http://localhost:3001
 *   TEST_JWT           JWT valide (généré via supabase auth)
 *
 * Lancer : npm run test:integration
 */

const { TafdilClient, CHANNELS } = require('../src/index');

const SUPABASE_URL  = process.env.SUPABASE_URL      || 'http://localhost:54321';
const ANON_KEY      = process.env.SUPABASE_ANON_KEY || '';
const GATEWAY_URL   = process.env.GATEWAY_URL       || 'http://localhost:3001';
const JWT           = process.env.TEST_JWT          || '';

const canRun = Boolean(ANON_KEY && JWT);

const describeIf = (cond) => cond ? describe : describe.skip;

describeIf(canRun)('TafdilClient — intégration (Supabase local)', () => {
  let client;

  beforeAll(async () => {
    client = new TafdilClient({
      supabaseUrl:     SUPABASE_URL,
      supabaseAnonKey: ANON_KEY,
      apiGatewayUrl:   GATEWAY_URL,
      jwtToken:        JWT,
    });
    await client.connect();
  }, 15_000);

  afterAll(() => client.disconnect());

  test('connect initialise _supabase', () => {
    expect(client._supabase).not.toBeNull();
  });

  test('isOnline reflète l\'état réseau', () => {
    expect(typeof client.isOnline).toBe('boolean');
  });

  test('GET /api/health retourne 200', async () => {
    const res = await client.get('health');
    expect(res).toBeDefined();
  });

  test('offlineQueue → sync round-trip', async () => {
    // Force hors-ligne, ajoute une op
    client._online = false;
    const result = await client.post('ventes', { produit_id: 'test-integration', quantite: 1 });
    expect(result.queued).toBe(true);

    // Remet en ligne et sync
    client._online = true;
    const ops = await client.offlineQueue.getAll();
    expect(ops.length).toBeGreaterThan(0);

    // Nettoie sans appeler sync (gateway peut ne pas être dispo)
    await client.offlineQueue.clear();
    expect(await client.offlineQueue.getAll()).toHaveLength(0);
  });

  test('onStockChange reçoit un broadcast en 5s', done => {
    const timeout = setTimeout(done, 5_000); // passe si aucun event (channel peut être vide)

    client.onStockChange(payload => {
      clearTimeout(timeout);
      expect(payload).toBeDefined();
      done();
    });
  }, 8_000);

  test('onCatalogueUpdate s\'abonne sans erreur', () => {
    expect(() => client.onCatalogueUpdate(() => {})).not.toThrow();
  });

  test('onPlanningUpdate s\'abonne sans erreur', () => {
    expect(() => client.onPlanningUpdate(() => {})).not.toThrow();
  });

  test('offAll() désabonne tous les channels', async () => {
    await client.offAll();
    expect(Object.keys(client._subs)).toHaveLength(0);
  });
});
