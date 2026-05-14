-- ============================================================
-- TAFDIL ERP — Migration 008
-- Sync Queue — pour le gateway de synchronisation offline
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    UUID UNIQUE NOT NULL,   -- UUID idempotent côté client
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  table_name      TEXT NOT NULL,
  operation       TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  payload         JSONB NOT NULL DEFAULT '{}',
  applied_at      TIMESTAMPTZ DEFAULT NOW(),
  client_ts       TIMESTAMPTZ NOT NULL,   -- timestamp client (LAST_WRITE_WINS)
  ttl_expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '72 hours'
);

-- Index pour purge TTL et lookup par operation_id
CREATE INDEX IF NOT EXISTS idx_sync_queue_op_id  ON sync_queue(operation_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_user   ON sync_queue(user_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_queue_ttl    ON sync_queue(ttl_expires_at);

-- Purge automatique des entrées expirées (appelée par cron ou pg_cron)
CREATE OR REPLACE FUNCTION purger_sync_queue_expires()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE nb INTEGER;
BEGIN
  DELETE FROM sync_queue WHERE ttl_expires_at < NOW();
  GET DIAGNOSTICS nb = ROW_COUNT;
  RETURN nb;
END $$;

-- RLS : chaque user ne voit que ses propres entrées
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_sync" ON sync_queue
  FOR ALL USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- ============================================================
-- Table de delta pull — vue pour faciliter le pull incrémental
-- ============================================================
CREATE OR REPLACE VIEW v_sync_delta AS
SELECT
  'produits'::TEXT                   AS table_name,
  id, updated_at, 'UPDATE'::TEXT     AS op
FROM produits
UNION ALL
SELECT 'ventes_comptoir', id, updated_at, 'UPDATE' FROM ventes_comptoir
UNION ALL
SELECT 'ordres_fabrication', id, updated_at, 'UPDATE' FROM ordres_fabrication
UNION ALL
SELECT 'bons_sortie_atelier', id, updated_at, 'UPDATE' FROM bons_sortie_atelier
UNION ALL
SELECT 'fiches_controle_qualite', id, updated_at, 'UPDATE' FROM fiches_controle_qualite;
