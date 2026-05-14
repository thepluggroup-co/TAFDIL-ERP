-- ============================================================
-- TAFDIL ERP — Migration 003 : Boutique Produits Finis
-- ============================================================

-- ============================================================
-- 0. ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE type_produit_fini AS ENUM (
    'PORTAIL','PORTE','BALCON','GARDE_CORPS','CLAUSTRA','AUTRE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_produit_fini AS ENUM (
    'EN_FABRICATION','DISPONIBLE','RESERVE','VENDU'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_bon_production AS ENUM (
    'BROUILLON','SOUMIS','VALIDE','REJETE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_devis AS ENUM (
    'BROUILLON','ENVOYE','ACCEPTE','REFUSE','EXPIRE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_commande_pf AS ENUM (
    'EN_ATTENTE_ACOMPTE','EN_FABRICATION','PRET','LIVRE','ANNULE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_bl AS ENUM ('EN_ATTENTE','SIGNE','REFUSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 1. PARAMÈTRES SUPPLÉMENTAIRES
-- ============================================================
INSERT INTO parametres_systeme (cle, valeur, label) VALUES
  ('marge_coeff_pf',        '1.35', 'Coefficient marge produits finis (ex: 1.35 = +35%)'),
  ('acompte_defaut_pct',    '30',   'Pourcentage acompte par défaut (%)'),
  ('delai_fabrication_def', '14',   'Délai fabrication par défaut (jours)')
ON CONFLICT (cle) DO NOTHING;

-- ============================================================
-- 2. TABLE PRODUITS_FINIS
-- ============================================================
CREATE TABLE IF NOT EXISTS produits_finis (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           VARCHAR(60) UNIQUE NOT NULL,
  designation         VARCHAR(250) NOT NULL,
  type                type_produit_fini NOT NULL DEFAULT 'AUTRE',
  dimensions          JSONB DEFAULT '{}',          -- {largeur, hauteur, profondeur} en mm
  materiau            VARCHAR(100),
  finition            VARCHAR(100),
  couleur             VARCHAR(80),
  cout_production     NUMERIC(14,2) DEFAULT 0,
  prix_vente          NUMERIC(14,2) DEFAULT 0,
  marge_pct           NUMERIC(6,2) GENERATED ALWAYS AS (
    CASE WHEN cout_production > 0
      THEN ROUND(((prix_vente - cout_production) / cout_production) * 100, 2)
    ELSE 0 END
  ) STORED,
  statut              statut_produit_fini DEFAULT 'EN_FABRICATION',
  photos_urls         TEXT[] DEFAULT '{}',
  chantier_origine_id UUID,                         -- FK chantiers (si module chantier actif)
  bon_production_id   UUID,                         -- backfilled après création bon
  publie_ecommerce    BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. TABLE BONS_PRODUCTION
-- ============================================================
CREATE TABLE IF NOT EXISTS bons_production (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference            VARCHAR(60) UNIQUE NOT NULL,     -- BP-2026-00001
  produit_fini_id      UUID REFERENCES produits_finis(id),
  technicien_id        UUID NOT NULL REFERENCES auth.users(id),
  date_debut           DATE NOT NULL,
  date_fin             DATE,
  quantite_produite    NUMERIC(8,3) DEFAULT 1,
  -- Matériaux consommés : [{produit_id, designation, quantite, prix_unitaire_achat, total}]
  materiaux_utilises   JSONB DEFAULT '[]',
  cout_materiaux       NUMERIC(14,2) DEFAULT 0,
  cout_main_oeuvre     NUMERIC(14,2) DEFAULT 0,
  cout_total           NUMERIC(14,2) GENERATED ALWAYS AS (
    cout_materiaux + cout_main_oeuvre
  ) STORED,
  prix_vente_suggere   NUMERIC(14,2) DEFAULT 0,
  statut               statut_bon_production DEFAULT 'BROUILLON',
  valide_par           UUID REFERENCES auth.users(id),
  date_validation      TIMESTAMPTZ,
  observations         TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- FK croisée (produits_finis → bons_production)
ALTER TABLE produits_finis
  ADD CONSTRAINT fk_pf_bon_prod
    FOREIGN KEY (bon_production_id) REFERENCES bons_production(id)
    DEFERRABLE INITIALLY DEFERRED;

-- ============================================================
-- 4. TABLE DEVIS
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS seq_devis START 1;
CREATE SEQUENCE IF NOT EXISTS seq_commande_pf START 1;
CREATE SEQUENCE IF NOT EXISTS seq_bon_livraison START 1;
CREATE SEQUENCE IF NOT EXISTS seq_bon_production START 1;

CREATE TABLE IF NOT EXISTS devis (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                  VARCHAR(30) UNIQUE NOT NULL,   -- DV-2026-00001
  client_id               UUID REFERENCES clients(id),
  client_nom              VARCHAR(150),
  client_telephone        VARCHAR(30),
  client_email            VARCHAR(150),
  commercial_id           UUID REFERENCES auth.users(id),
  produit_fini_id         UUID REFERENCES produits_finis(id),  -- si produit en stock
  type_produit            type_produit_fini,
  specifications          JSONB DEFAULT '{}',   -- dimensions custom, finition, notes
  montant_ht              NUMERIC(14,2) DEFAULT 0,
  montant_tva             NUMERIC(14,2) DEFAULT 0,
  montant_total           NUMERIC(14,2) DEFAULT 0,
  acompte_pct             NUMERIC(5,2)  DEFAULT 30,
  montant_acompte         NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND(montant_total * acompte_pct / 100, 2)
  ) STORED,
  statut                  statut_devis DEFAULT 'BROUILLON',
  date_validite           DATE,
  delai_fabrication_jours INT DEFAULT 14,
  notes_internes          TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. TABLE COMMANDES_PRODUITS_FINIS
-- ============================================================
CREATE TABLE IF NOT EXISTS commandes_produits_finis (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                 VARCHAR(30) UNIQUE NOT NULL,   -- CMD-2026-00001
  devis_id               UUID REFERENCES devis(id),
  client_id              UUID REFERENCES clients(id),
  client_nom             VARCHAR(150),
  produit_fini_id        UUID REFERENCES produits_finis(id),
  statut                 statut_commande_pf DEFAULT 'EN_ATTENTE_ACOMPTE',
  date_commande          TIMESTAMPTZ DEFAULT NOW(),
  date_livraison_prevue  DATE,
  date_livraison_reelle  TIMESTAMPTZ,
  montant_total          NUMERIC(14,2) NOT NULL,
  acompte_attendu        NUMERIC(14,2) DEFAULT 0,
  acompte_verse          NUMERIC(14,2) DEFAULT 0,
  solde_restant          NUMERIC(14,2) GENERATED ALWAYS AS (
    montant_total - acompte_verse
  ) STORED,
  bon_livraison_id       UUID,   -- FK ajouté après création bons_livraison
  notes                  TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. TABLE ACOMPTES
-- ============================================================
CREATE TABLE IF NOT EXISTS acomptes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id         UUID NOT NULL REFERENCES commandes_produits_finis(id),
  montant             NUMERIC(14,2) NOT NULL CHECK (montant > 0),
  mode_paiement       mode_paiement_enum NOT NULL DEFAULT 'ESPECES',
  date_paiement       TIMESTAMPTZ DEFAULT NOW(),
  reference_paiement  VARCHAR(100),
  encaisse_par        UUID REFERENCES auth.users(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. TABLE BONS_LIVRAISON
-- ============================================================
CREATE TABLE IF NOT EXISTS bons_livraison (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                  VARCHAR(30) UNIQUE NOT NULL,   -- BL-2026-00001
  commande_id             UUID NOT NULL REFERENCES commandes_produits_finis(id),
  livreur_id              UUID REFERENCES auth.users(id),
  date_livraison          TIMESTAMPTZ DEFAULT NOW(),
  adresse_livraison       TEXT,
  observations_livreur    TEXT,
  signature_client_b64    TEXT,             -- PNG base64 de la signature manuscrite
  signature_token         UUID UNIQUE DEFAULT gen_random_uuid(),
  signe_le                TIMESTAMPTZ,
  statut                  statut_bl DEFAULT 'EN_ATTENTE',
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- FK retour sur commandes
ALTER TABLE commandes_produits_finis
  ADD CONSTRAINT fk_cmd_bl
    FOREIGN KEY (bon_livraison_id) REFERENCES bons_livraison(id)
    DEFERRABLE INITIALLY DEFERRED;

-- ============================================================
-- 8. SÉQUENCES — fonctions de numérotation
-- ============================================================
CREATE OR REPLACE FUNCTION next_numero_devis()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'DV-' || TO_CHAR(NOW(),'YYYY') || '-' ||
         LPAD(nextval('seq_devis')::TEXT, 5, '0');
END $$;

CREATE OR REPLACE FUNCTION next_numero_commande_pf()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'CMD-' || TO_CHAR(NOW(),'YYYY') || '-' ||
         LPAD(nextval('seq_commande_pf')::TEXT, 5, '0');
END $$;

CREATE OR REPLACE FUNCTION next_numero_bl()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'BL-' || TO_CHAR(NOW(),'YYYY') || '-' ||
         LPAD(nextval('seq_bon_livraison')::TEXT, 5, '0');
END $$;

CREATE OR REPLACE FUNCTION next_numero_bp()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'BP-' || TO_CHAR(NOW(),'YYYY') || '-' ||
         LPAD(nextval('seq_bon_production')::TEXT, 5, '0');
END $$;

-- ============================================================
-- 9. TRIGGERS
-- ============================================================
CREATE OR REPLACE TRIGGER trg_pf_updated_at
  BEFORE UPDATE ON produits_finis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_bp_updated_at
  BEFORE UPDATE ON bons_production
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_devis_updated_at
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_cmd_pf_updated_at
  BEFORE UPDATE ON commandes_produits_finis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Trigger : quand un acompte est inséré → mettre à jour acompte_verse sur commande
CREATE OR REPLACE FUNCTION maj_acompte_commande()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE commandes_produits_finis
  SET acompte_verse = (
    SELECT COALESCE(SUM(montant), 0)
    FROM acomptes
    WHERE commande_id = NEW.commande_id
  ),
  statut = CASE
    WHEN (SELECT COALESCE(SUM(montant),0) FROM acomptes WHERE commande_id = NEW.commande_id) >= acompte_attendu
    THEN 'EN_FABRICATION'::statut_commande_pf
    ELSE statut
  END,
  updated_at = NOW()
  WHERE id = NEW.commande_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_acompte_cumul
  AFTER INSERT ON acomptes
  FOR EACH ROW EXECUTE FUNCTION maj_acompte_commande();

-- ============================================================
-- 10. VUE rentabilité production
-- ============================================================
CREATE OR REPLACE VIEW v_rentabilite_production AS
SELECT
  bp.id                            AS bon_id,
  bp.reference                     AS bon_reference,
  pf.designation,
  pf.type,
  bp.cout_materiaux,
  bp.cout_main_oeuvre,
  bp.cout_total,
  pf.prix_vente,
  pf.prix_vente - bp.cout_total    AS marge_brute,
  CASE WHEN bp.cout_total > 0
    THEN ROUND(((pf.prix_vente - bp.cout_total) / bp.cout_total) * 100, 2)
  ELSE 0 END                       AS marge_pct,
  bp.date_debut,
  bp.date_fin,
  CASE WHEN bp.date_fin IS NOT NULL
    THEN bp.date_fin - bp.date_debut
  ELSE NULL END                    AS duree_fabrication_jours,
  pf.statut,
  bp.statut                        AS statut_bon
FROM bons_production bp
JOIN produits_finis pf ON pf.id = bp.produit_fini_id;

-- ============================================================
-- 11. INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pf_statut   ON produits_finis(statut);
CREATE INDEX IF NOT EXISTS idx_pf_type     ON produits_finis(type);
CREATE INDEX IF NOT EXISTS idx_bp_statut   ON bons_production(statut);
CREATE INDEX IF NOT EXISTS idx_devis_stat  ON devis(statut);
CREATE INDEX IF NOT EXISTS idx_cmd_statut  ON commandes_produits_finis(statut);
CREATE INDEX IF NOT EXISTS idx_bl_token    ON bons_livraison(signature_token);
CREATE INDEX IF NOT EXISTS idx_acompte_cmd ON acomptes(commande_id);

-- ============================================================
-- 12. RLS
-- ============================================================
ALTER TABLE produits_finis          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bons_production         ENABLE ROW LEVEL SECURITY;
ALTER TABLE devis                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE commandes_produits_finis ENABLE ROW LEVEL SECURITY;
ALTER TABLE bons_livraison          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_pf"    ON produits_finis
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "auth_write_pf"   ON produits_finis
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "auth_read_bp"    ON bons_production
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "tech_insert_bp"  ON bons_production
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "service_all_bp"  ON bons_production
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "auth_read_devis" ON devis
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "auth_write_devis" ON devis
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "auth_read_cmd"   ON commandes_produits_finis
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "auth_all_cmd"    ON commandes_produits_finis
  FOR ALL USING (auth.role() = 'service_role');

-- BL : le token public permet la signature sans authentification
CREATE POLICY "service_all_bl"  ON bons_livraison
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "public_sign_bl"  ON bons_livraison
  FOR UPDATE USING (
    auth.role() = 'anon' AND statut = 'EN_ATTENTE'
  )
  WITH CHECK (TRUE);
