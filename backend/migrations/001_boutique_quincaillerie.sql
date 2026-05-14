-- ============================================================
-- TAFDIL ERP — Migration 001 : Boutique Quincaillerie
-- ============================================================

-- ---- Extension UUID (Supabase l'active par défaut) ----------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 0. ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE categorie_produit AS ENUM (
    'QUINCAILLERIE', 'PRODUIT_FINI', 'MATIERE_PREMIERE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE client_type_enum AS ENUM ('PUBLIC', 'INTERNE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_paiement_enum AS ENUM (
    'EN_ATTENTE', 'PARTIEL', 'PAYE', 'ANNULE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mode_paiement_enum AS ENUM (
    'ESPECES', 'CARTE', 'MOBILE_MONEY', 'VIREMENT', 'CREDIT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 1. TABLE PRODUITS — extension des colonnes existantes
-- ============================================================
-- Si la table produits n'existe pas encore, on la crée complète.
-- Si elle existe déjà, on ajoute uniquement les colonnes manquantes.
CREATE TABLE IF NOT EXISTS produits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             VARCHAR(50) UNIQUE NOT NULL,
  designation           VARCHAR(200) NOT NULL,
  unite                 VARCHAR(20) DEFAULT 'unité',
  stock_actuel          NUMERIC(12,3) DEFAULT 0,
  stock_minimum         NUMERIC(12,3) DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Colonnes boutique (idempotentes)
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS prix_public        NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prix_interne       NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disponible_boutique BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS categorie          categorie_produit DEFAULT 'QUINCAILLERIE';

-- Contrainte : prix interne ≤ prix public
ALTER TABLE produits
  DROP CONSTRAINT IF EXISTS chk_prix_interne_lte_public;
ALTER TABLE produits
  ADD CONSTRAINT chk_prix_interne_lte_public
    CHECK (prix_interne <= prix_public);

-- ============================================================
-- 2. TABLE PARAMETRES_SYSTEME
-- ============================================================
CREATE TABLE IF NOT EXISTS parametres_systeme (
  cle     VARCHAR(100) PRIMARY KEY,
  valeur  TEXT NOT NULL,
  label   VARCHAR(200),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO parametres_systeme (cle, valeur, label) VALUES
  ('priorite_atelier', 'true',  'Priorité atelier sur boutique en cas de conflit de stock'),
  ('tva_taux',         '19.25', 'Taux TVA (%)'),
  ('raison_sociale',   'TAFDIL SARL', 'Raison sociale'),
  ('ville',            'Douala', 'Ville'),
  ('telephone',        '+237 000 000 000', 'Téléphone'),
  ('base_url',         'https://erp.tafdil.cm', 'URL base pour QR codes'),
  ('remise_max_dg',    '30', 'Remise maximale autorisée par le DG (%)')
ON CONFLICT (cle) DO NOTHING;

-- ============================================================
-- 3. TABLE VENTES_COMPTOIR
-- ============================================================
CREATE TABLE IF NOT EXISTS ventes_comptoir (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero           VARCHAR(30) UNIQUE NOT NULL,   -- ex: VC-2026-00001
  vendeur_id       UUID NOT NULL REFERENCES auth.users(id),
  date_vente       TIMESTAMPTZ DEFAULT NOW(),
  client_type      client_type_enum NOT NULL DEFAULT 'PUBLIC',
  client_id        UUID REFERENCES clients(id),   -- nullable pour public anonyme
  client_nom       VARCHAR(150),                  -- saisie libre si anonyme
  mode_paiement    mode_paiement_enum NOT NULL DEFAULT 'ESPECES',
  montant_ht       NUMERIC(14,2) DEFAULT 0,
  montant_remise   NUMERIC(14,2) DEFAULT 0,
  montant_tva      NUMERIC(14,2) DEFAULT 0,
  montant_total    NUMERIC(14,2) DEFAULT 0,
  statut_paiement  statut_paiement_enum DEFAULT 'EN_ATTENTE',
  notes            TEXT,
  sync_offline     BOOLEAN DEFAULT FALSE,  -- marqué TRUE si créé hors ligne
  ticket_imprime   BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. TABLE VENTES_COMPTOIR_LIGNES
-- ============================================================
CREATE TABLE IF NOT EXISTS ventes_comptoir_lignes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vente_id              UUID NOT NULL REFERENCES ventes_comptoir(id) ON DELETE CASCADE,
  produit_id            UUID NOT NULL REFERENCES produits(id),
  quantite              NUMERIC(12,3) NOT NULL CHECK (quantite > 0),
  prix_unitaire_applique NUMERIC(14,2) NOT NULL,
  remise_pct            NUMERIC(5,2) DEFAULT 0 CHECK (remise_pct BETWEEN 0 AND 100),
  montant_ligne         NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND(quantite * prix_unitaire_applique * (1 - remise_pct / 100), 2)
  ) STORED,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. TABLE BONS_SORTIE_ATELIER (si non existante)
--    Référencée pour le calcul des réservations de stock
-- ============================================================
CREATE TABLE IF NOT EXISTS bons_sortie_atelier (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id  UUID NOT NULL REFERENCES produits(id),
  quantite    NUMERIC(12,3) NOT NULL CHECK (quantite > 0),
  statut      VARCHAR(30) DEFAULT 'EN_ATTENTE',  -- EN_ATTENTE | VALIDE | ANNULE
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. TABLE CLIENTS (si non existante)
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom          VARCHAR(150) NOT NULL,
  telephone    VARCHAR(30),
  email        VARCHAR(150),
  type_client  VARCHAR(20) DEFAULT 'PUBLIC',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. SÉQUENCE NUMÉROTATION VENTES
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS seq_vente_comptoir START 1;

CREATE OR REPLACE FUNCTION next_numero_vente()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'VC-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
         LPAD(nextval('seq_vente_comptoir')::TEXT, 5, '0');
END $$;

-- ============================================================
-- 8. TRIGGER updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

CREATE OR REPLACE TRIGGER trg_produits_updated_at
  BEFORE UPDATE ON produits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_ventes_updated_at
  BEFORE UPDATE ON ventes_comptoir
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 9. VUE stock_disponible_boutique
--    stock réel  −  réservé atelier (bons EN_ATTENTE)
-- ============================================================
CREATE OR REPLACE VIEW v_stock_dispo_boutique AS
SELECT
  p.id,
  p.reference,
  p.designation,
  p.unite,
  p.stock_actuel,
  COALESCE(SUM(b.quantite) FILTER (WHERE b.statut = 'EN_ATTENTE'), 0) AS quantite_reservee_atelier,
  p.stock_actuel - COALESCE(SUM(b.quantite) FILTER (WHERE b.statut = 'EN_ATTENTE'), 0) AS stock_dispo_boutique,
  p.prix_public,
  p.prix_interne,
  p.disponible_boutique,
  p.categorie
FROM produits p
LEFT JOIN bons_sortie_atelier b ON b.produit_id = p.id
GROUP BY p.id;

-- ============================================================
-- 10. INDEX PERFORMANCES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_vcl_vente_id   ON ventes_comptoir_lignes(vente_id);
CREATE INDEX IF NOT EXISTS idx_vcl_produit_id ON ventes_comptoir_lignes(produit_id);
CREATE INDEX IF NOT EXISTS idx_vc_date        ON ventes_comptoir(date_vente DESC);
CREATE INDEX IF NOT EXISTS idx_vc_client_type ON ventes_comptoir(client_type);
CREATE INDEX IF NOT EXISTS idx_bsa_produit    ON bons_sortie_atelier(produit_id, statut);

-- ============================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE ventes_comptoir       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventes_comptoir_lignes ENABLE ROW LEVEL SECURITY;

-- Vendeurs voient toutes les ventes ; admin peut tout modifier
CREATE POLICY "vendeurs_select" ON ventes_comptoir
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "vendeurs_insert" ON ventes_comptoir
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_ventes" ON ventes_comptoir
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "lignes_select" ON ventes_comptoir_lignes
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "lignes_insert" ON ventes_comptoir_lignes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
