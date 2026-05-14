-- ============================================================
-- TAFDIL ERP — Migration 004
-- C1 : Moteur devis automatique
-- C3 : Fidélité clients
-- C4 : Traçabilité matière
-- ============================================================

-- ============================================================
-- C1 — TARIFS DE BASE DEVIS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE complexite_enum AS ENUM ('standard','ornemente','sur_mesure');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tarifs_base (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_produit          type_produit_fini NOT NULL,
  materiau              VARCHAR(80)   NOT NULL,
  finition              VARCHAR(80),
  prix_m2               NUMERIC(12,2) DEFAULT 0,   -- XAF/m²
  prix_ml               NUMERIC(12,2) DEFAULT 0,   -- XAF/ml (périmètre)
  majoration_hauteur_pct NUMERIC(5,2) DEFAULT 15,  -- si h > 2m
  complexite            complexite_enum DEFAULT 'standard',
  majoration_complexite_pct NUMERIC(5,2) DEFAULT 0,
  delai_jours_base      INT DEFAULT 7,
  actif                 BOOLEAN DEFAULT TRUE,
  created_by            UUID REFERENCES auth.users(id),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Données de démarrage configurables par le DG
INSERT INTO tarifs_base (type_produit, materiau, finition, prix_m2, prix_ml, delai_jours_base) VALUES
  ('PORTAIL',     'acier',  'peinture_epoxy',  85000, 12000, 10),
  ('PORTAIL',     'acier',  'galvanise',        92000, 13000, 12),
  ('PORTE',       'acier',  'peinture_epoxy',  70000, 10000, 7),
  ('BALCON',      'acier',  'peinture_epoxy',  55000, 8000,  8),
  ('GARDE_CORPS', 'acier',  'peinture_epoxy',  45000, 7000,  6),
  ('CLAUSTRA',    'acier',  'peinture_epoxy',  40000, 6000,  5)
ON CONFLICT DO NOTHING;

-- Lignes de nomenclature estimative (ratios matériaux pour le moteur de devis)
-- Utilisées pour estimer les matériaux nécessaires par type
CREATE TABLE IF NOT EXISTS tarifs_base_materiaux (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarif_id             UUID NOT NULL REFERENCES tarifs_base(id) ON DELETE CASCADE,
  produit_quincaillerie_id UUID REFERENCES produits(id),
  designation_matiere  VARCHAR(200) NOT NULL,  -- si produit non encore en stock
  quantite_par_m2      NUMERIC(10,4) DEFAULT 0,
  quantite_par_ml      NUMERIC(10,4) DEFAULT 0,
  quantite_fixe        NUMERIC(10,4) DEFAULT 0,
  unite                VARCHAR(20) DEFAULT 'kg'
);

-- Historique devis (extensions de la table devis existante)
ALTER TABLE devis
  ADD COLUMN IF NOT EXISTS source          VARCHAR(30) DEFAULT 'MANUEL',   -- MANUEL | AUTO | ECOMMERCE
  ADD COLUMN IF NOT EXISTS cout_materiaux  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cout_mo         NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS marge_tafdil   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS liste_materiaux JSONB DEFAULT '[]';

-- ============================================================
-- C3 — FIDÉLITÉ CLIENTS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE niveau_fidelite AS ENUM ('BRONZE','ARGENT','OR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS clients_fidelite (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telephone             VARCHAR(20) UNIQUE NOT NULL,
  prenom                VARCHAR(80),
  nom                   VARCHAR(80),
  client_id             UUID REFERENCES clients(id),
  points_cumules        INT DEFAULT 0,
  niveau                niveau_fidelite DEFAULT 'BRONZE',
  date_premiere_visite  TIMESTAMPTZ DEFAULT NOW(),
  nb_visites            INT DEFAULT 0,
  ca_cumule_xaf         NUMERIC(16,2) DEFAULT 0,
  remise_active_pct     NUMERIC(5,2)  DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Table des utilisations de points (audit trail)
CREATE TABLE IF NOT EXISTS fidelite_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients_fidelite(id),
  vente_id       UUID REFERENCES ventes_comptoir(id),
  type           VARCHAR(20) NOT NULL,   -- GAIN | UTILISATION
  points         INT NOT NULL,
  montant_vente  NUMERIC(14,2),
  description    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cf_telephone ON clients_fidelite(telephone);
CREATE INDEX IF NOT EXISTS idx_ft_client    ON fidelite_transactions(client_id);

-- Trigger mise à jour niveau
CREATE OR REPLACE FUNCTION maj_niveau_fidelite()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.niveau = CASE
    WHEN NEW.points_cumules >= 2000 THEN 'OR'::niveau_fidelite
    WHEN NEW.points_cumules >= 500  THEN 'ARGENT'::niveau_fidelite
    ELSE 'BRONZE'::niveau_fidelite
  END;
  NEW.remise_active_pct = CASE
    WHEN NEW.niveau = 'OR'::niveau_fidelite     THEN 10
    WHEN NEW.niveau = 'ARGENT'::niveau_fidelite THEN 5
    ELSE 0
  END;
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_maj_niveau
  BEFORE UPDATE ON clients_fidelite
  FOR EACH ROW EXECUTE FUNCTION maj_niveau_fidelite();

-- ============================================================
-- C4 — TRAÇABILITÉ MATIÈRE
-- ============================================================
CREATE TABLE IF NOT EXISTS tracabilite_liens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_fini_id     UUID NOT NULL REFERENCES produits_finis(id),
  bon_production_id   UUID NOT NULL REFERENCES bons_production(id),
  produit_quinca_id   UUID REFERENCES produits(id),   -- matière première
  quantite_consommee  NUMERIC(12,4),
  cout_unitaire       NUMERIC(14,2),
  cout_total          NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND(quantite_consommee * cout_unitaire, 2)
  ) STORED,
  lot_reference       VARCHAR(60),   -- lot fournisseur si disponible
  date_entree_stock   DATE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tl_produit_fini  ON tracabilite_liens(produit_fini_id);
CREATE INDEX IF NOT EXISTS idx_tl_produit_quinca ON tracabilite_liens(produit_quinca_id);
CREATE INDEX IF NOT EXISTS idx_tl_bon_prod       ON tracabilite_liens(bon_production_id);

-- Vue rentabilité réelle vs devis
CREATE OR REPLACE VIEW v_rentabilite_comparee AS
SELECT
  cmd.id                               AS commande_id,
  cmd.numero                           AS commande_num,
  cmd.montant_total                    AS prix_client,
  dv.montant_ht                        AS devis_ht,
  bp.cout_total                        AS cout_reel,
  pf.prix_vente                        AS prix_vente,
  pf.prix_vente - bp.cout_total        AS marge_reelle,
  dv.montant_ht - bp.cout_total        AS ecart_devis_reel,
  CASE WHEN bp.cout_total > 0
    THEN ROUND(((pf.prix_vente - bp.cout_total) / bp.cout_total) * 100, 2)
  ELSE 0 END                           AS marge_reelle_pct,
  CASE WHEN dv.montant_ht > 0
    THEN ROUND(((dv.montant_ht - bp.cout_total) / dv.montant_ht) * 100, 2)
  ELSE 0 END                           AS marge_estimee_pct
FROM commandes_produits_finis cmd
JOIN devis dv ON dv.id = cmd.devis_id
JOIN produits_finis pf ON pf.id = cmd.produit_fini_id
JOIN bons_production bp ON bp.produit_fini_id = pf.id
WHERE bp.statut = 'VALIDE';
