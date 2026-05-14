-- ============================================================
-- TAFDIL ERP — Migration 014
-- OPT-6 : Gouvernance des Données — Audit Log & RBAC
-- ============================================================

-- ── TABLE AUDIT LOG ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE action_audit AS ENUM (
    'CREATE','UPDATE','DELETE','VALIDATE','PRINT','EXPORT','LOGIN','LOGOUT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id),
  user_email     TEXT,
  user_role      TEXT,
  action         action_audit NOT NULL,
  table_cible    TEXT,
  record_id      UUID,
  payload_avant  JSONB,
  payload_apres  JSONB,
  ip_address     TEXT,
  user_agent     TEXT,
  session_id     TEXT,
  timestamp      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_log(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table     ON audit_log(table_cible, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);

-- RLS : accessible uniquement au service_role (DG via API protégée)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only_audit" ON audit_log
  FOR ALL USING (auth.role() = 'service_role');

-- ── TRIGGER GÉNÉRIQUE AUDIT ─────────────────────────────────────
-- Fonction appelée sur les tables sensibles
CREATE OR REPLACE FUNCTION fn_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_action    action_audit;
  v_avant     JSONB := NULL;
  v_apres     JSONB := NULL;
BEGIN
  v_action := CASE TG_OP
    WHEN 'INSERT' THEN 'CREATE'::action_audit
    WHEN 'UPDATE' THEN 'UPDATE'::action_audit
    WHEN 'DELETE' THEN 'DELETE'::action_audit
  END;

  IF TG_OP IN ('UPDATE','DELETE') THEN
    v_avant := to_jsonb(OLD);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_apres := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_log (action, table_cible, record_id, payload_avant, payload_apres)
  VALUES (
    v_action,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN (OLD).id ELSE (NEW).id END,
    v_avant,
    v_apres
  );

  RETURN COALESCE(NEW, OLD);
END $$;

-- Appliquer sur les tables sensibles
DO $$ BEGIN
  -- Ventes
  CREATE OR REPLACE TRIGGER audit_ventes_comptoir
    AFTER INSERT OR UPDATE OR DELETE ON ventes_comptoir
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE OR REPLACE TRIGGER audit_ordres_fabrication
    AFTER INSERT OR UPDATE OR DELETE ON ordres_fabrication
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE OR REPLACE TRIGGER audit_bulletins_paie
    AFTER INSERT OR UPDATE OR DELETE ON bulletins_paie
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE OR REPLACE TRIGGER audit_produits
    AFTER UPDATE ON produits
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE OR REPLACE TRIGGER audit_ecritures
    AFTER INSERT OR UPDATE ON ecritures_comptables
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── MATRICE RBAC (référence documentaire) ─────────────────────────
-- Stockée comme paramètre système pour consultation par le middleware
INSERT INTO parametres_systeme (cle, valeur, label) VALUES
('rbac_matrice', '{
  "DG":          ["*"],
  "SECRETAIRE":  ["devis:rw","factures:rw","clients:rw","commandes:rw","paie:r","rh:r"],
  "VENDEUR":     ["ventes_comptoir:rw","catalogue:r","fidelite:rw","clients:r"],
  "TECHNICIEN":  ["bons_sortie:rw","bons_production:rw","pointage:rw","qualite:rw"],
  "MAGASINIER":  ["stock:rw","receptions:rw","inventaire:rw","bons_sortie:r"],
  "CHEF_ATELIER":["of:rw","planning:rw","qc:rw","maintenance:rw","equipe:r"]
}', 'Matrice RBAC par rôle')
ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur;

-- ── PURGE AUTOMATIQUE AUDIT (> 365 jours) ──────────────────────
CREATE OR REPLACE FUNCTION purger_audit_anciens()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE nb INTEGER;
BEGIN
  DELETE FROM audit_log WHERE timestamp < NOW() - INTERVAL '365 days';
  GET DIAGNOSTICS nb = ROW_COUNT;
  RETURN nb;
END $$;
