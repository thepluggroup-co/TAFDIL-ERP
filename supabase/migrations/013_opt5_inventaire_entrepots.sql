-- ============================================================
-- TAFDIL ERP — Migration 013
-- OPT-5 : Multi-Entrepôts & Inventaire Tournant
-- ============================================================

-- ── EMPLACEMENTS ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE type_emplacement AS ENUM ('ATELIER','BOUTIQUE','EXTERNE','RECEPTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS emplacements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(20) UNIQUE NOT NULL,  -- AT01, BQ01, EXT01
  designation     VARCHAR(150) NOT NULL,
  type            type_emplacement DEFAULT 'ATELIER',
  responsable_id  UUID REFERENCES auth.users(id),
  actif           BOOLEAN DEFAULT TRUE,
  notes           TEXT
);

INSERT INTO emplacements (code, designation, type) VALUES
  ('AT01', 'Atelier soudure',    'ATELIER'),
  ('AT02', 'Atelier coupe',      'ATELIER'),
  ('AT03', 'Atelier finition',   'ATELIER'),
  ('BQ01', 'Boutique quincaillerie', 'BOUTIQUE'),
  ('REC01','Zone réception',     'RECEPTION')
ON CONFLICT (code) DO NOTHING;

-- ── STOCK PAR EMPLACEMENT ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stocks_emplacements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id      UUID NOT NULL REFERENCES produits(id),
  emplacement_id  UUID NOT NULL REFERENCES emplacements(id),
  quantite        NUMERIC(14,3) DEFAULT 0 CHECK (quantite >= 0),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(produit_id, emplacement_id)
);

-- Vue stock total consolidé par produit
CREATE OR REPLACE VIEW v_stock_consolide AS
SELECT
  p.id, p.reference, p.designation, p.unite, p.stock_minimum,
  COALESCE(SUM(se.quantite), p.stock_actuel) AS stock_total,
  jsonb_agg(jsonb_build_object(
    'emplacement_id', e.id,
    'code', e.code,
    'designation', e.designation,
    'quantite', se.quantite
  )) FILTER (WHERE e.id IS NOT NULL) AS par_emplacement
FROM produits p
LEFT JOIN stocks_emplacements se ON se.produit_id = p.id
LEFT JOIN emplacements e ON e.id = se.emplacement_id AND e.actif = TRUE
WHERE p.actif = TRUE
GROUP BY p.id, p.reference, p.designation, p.unite, p.stock_minimum, p.stock_actuel;

-- ── MOUVEMENTS INTER-SITES ────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE motif_transfert AS ENUM (
    'TRANSFERT','RESTITUTION','AFFECTATION','CORRECTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_transfert AS ENUM ('EN_ATTENTE','VALIDE','ANNULE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS seq_transfert START 1;

CREATE TABLE IF NOT EXISTS mouvements_inter_sites (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference            VARCHAR(20) UNIQUE,
  produit_id           UUID NOT NULL REFERENCES produits(id),
  emplacement_source   UUID NOT NULL REFERENCES emplacements(id),
  emplacement_cible    UUID NOT NULL REFERENCES emplacements(id),
  quantite             NUMERIC(12,3) NOT NULL CHECK (quantite > 0),
  motif                motif_transfert DEFAULT 'TRANSFERT',
  statut               statut_transfert DEFAULT 'EN_ATTENTE',
  demandeur_id         UUID REFERENCES auth.users(id),
  valide_par           UUID REFERENCES auth.users(id),
  date_mouvement       TIMESTAMPTZ DEFAULT NOW(),
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger validation transfert → mise à jour stocks_emplacements
CREATE OR REPLACE FUNCTION appliquer_transfert_inter_sites()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.statut = 'VALIDE' AND OLD.statut = 'EN_ATTENTE' THEN
    -- Décrémenter source
    UPDATE stocks_emplacements
    SET quantite = quantite - NEW.quantite, updated_at = NOW()
    WHERE produit_id = NEW.produit_id AND emplacement_id = NEW.emplacement_source;

    -- Incrémenter cible
    INSERT INTO stocks_emplacements (produit_id, emplacement_id, quantite)
    VALUES (NEW.produit_id, NEW.emplacement_cible, NEW.quantite)
    ON CONFLICT (produit_id, emplacement_id)
    DO UPDATE SET quantite = stocks_emplacements.quantite + NEW.quantite, updated_at = NOW();
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_appliquer_transfert
  AFTER UPDATE ON mouvements_inter_sites
  FOR EACH ROW EXECUTE FUNCTION appliquer_transfert_inter_sites();

-- ── INVENTAIRE TOURNANT ────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE statut_inventaire AS ENUM ('EN_COURS','VALIDE','ANNULE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS sessions_inventaire (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emplacement_id    UUID NOT NULL REFERENCES emplacements(id),
  date_debut        TIMESTAMPTZ DEFAULT NOW(),
  date_fin          TIMESTAMPTZ,
  statut            statut_inventaire DEFAULT 'EN_COURS',
  responsable_id    UUID NOT NULL REFERENCES auth.users(id),
  valide_par        UUID REFERENCES auth.users(id),
  produits_comptes  INT DEFAULT 0,
  ecarts_detectes   INT DEFAULT 0,
  rapport_pdf_url   TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lignes_inventaire (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES sessions_inventaire(id) ON DELETE CASCADE,
  produit_id       UUID NOT NULL REFERENCES produits(id),
  emplacement_id   UUID NOT NULL REFERENCES emplacements(id),
  stock_theorique  NUMERIC(14,3) NOT NULL,   -- valeur ERP au moment de l'inventaire
  stock_compte     NUMERIC(14,3),            -- saisie physique
  ecart            NUMERIC(14,3) GENERATED ALWAYS AS (
    COALESCE(stock_compte, stock_theorique) - stock_theorique
  ) STORED,
  justification    TEXT,
  valeur_ecart_xaf NUMERIC(14,2),  -- calculée à la validation
  UNIQUE(session_id, produit_id, emplacement_id)
);

-- Procédure de validation inventaire (DG)
CREATE OR REPLACE FUNCTION valider_inventaire(p_session_id UUID, p_valide_par UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_ligne  RECORD;
  v_prix   NUMERIC;
BEGIN
  -- Pour chaque ligne avec écart
  FOR v_ligne IN
    SELECT li.*, p.prix_interne AS prix_unit
    FROM lignes_inventaire li
    JOIN produits p ON p.id = li.produit_id
    WHERE li.session_id = p_session_id
      AND li.stock_compte IS NOT NULL
      AND ABS(li.ecart) > 0.001
  LOOP
    -- Ajuster stock ERP
    UPDATE produits
    SET stock_actuel = stock_actuel + v_ligne.ecart,
        updated_at = NOW()
    WHERE id = v_ligne.produit_id;

    -- Ajuster stock emplacement
    UPDATE stocks_emplacements
    SET quantite = quantite + v_ligne.ecart,
        updated_at = NOW()
    WHERE produit_id = v_ligne.produit_id
      AND emplacement_id = v_ligne.emplacement_id;

    -- Calculer valeur écart
    UPDATE lignes_inventaire
    SET valeur_ecart_xaf = ABS(v_ligne.ecart) * COALESCE(v_ligne.prix_unit, 0)
    WHERE id = v_ligne.id;
  END LOOP;

  -- Clore la session
  UPDATE sessions_inventaire
  SET statut = 'VALIDE',
      date_fin = NOW(),
      valide_par = p_valide_par,
      produits_comptes = (SELECT COUNT(*) FROM lignes_inventaire WHERE session_id = p_session_id AND stock_compte IS NOT NULL),
      ecarts_detectes  = (SELECT COUNT(*) FROM lignes_inventaire WHERE session_id = p_session_id AND ABS(ecart) > 0.001)
  WHERE id = p_session_id;
END $$;

-- ── INDEX ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stocks_emp_produit ON stocks_emplacements(produit_id);
CREATE INDEX IF NOT EXISTS idx_stocks_emp_emp     ON stocks_emplacements(emplacement_id);
CREATE INDEX IF NOT EXISTS idx_transferts_statut  ON mouvements_inter_sites(statut);
CREATE INDEX IF NOT EXISTS idx_inventaire_session ON lignes_inventaire(session_id);

ALTER TABLE sessions_inventaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE mouvements_inter_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_inventaire" ON sessions_inventaire FOR ALL USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "auth_transferts" ON mouvements_inter_sites FOR ALL USING (auth.role() IN ('authenticated','service_role'));
