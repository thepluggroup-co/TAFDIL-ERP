-- ============================================================
-- TAFDIL ERP — Migration 006
-- D1 : MRP — Nomenclatures (BOM) & Ordres de Fabrication
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE statut_of AS ENUM (
    'PLANIFIE','EN_ATTENTE_MATIERE','EN_COURS','SUSPENDU','TERMINE','ANNULE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE poste_bom AS ENUM ('STRUCTURE','HABILLAGE','FINITION','FIXATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_dispo_matiere AS ENUM ('DISPONIBLE','PARTIEL','RUPTURE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- NOMENCLATURES (BOM)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS seq_of START 1;

CREATE TABLE IF NOT EXISTS nomenclatures_types (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_produit     type_produit_fini NOT NULL,
  designation_type VARCHAR(200) NOT NULL,
  version          INT DEFAULT 1,
  actif            BOOLEAN DEFAULT TRUE,
  coefficient_chute NUMERIC(4,3) DEFAULT 1.08,  -- 8% chute métal
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(type_produit, version, actif)
);

CREATE TABLE IF NOT EXISTS nomenclatures_lignes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomenclature_id         UUID NOT NULL REFERENCES nomenclatures_types(id) ON DELETE CASCADE,
  produit_quincaillerie_id UUID REFERENCES produits(id),
  designation_matiere     VARCHAR(200),   -- si produit pas encore en base
  quantite_par_m2         NUMERIC(12,6) DEFAULT 0,
  quantite_par_ml         NUMERIC(12,6) DEFAULT 0,
  quantite_fixe           NUMERIC(12,4) DEFAULT 0,
  unite                   VARCHAR(20) DEFAULT 'kg',
  poste                   poste_bom DEFAULT 'STRUCTURE',
  notes_technicien        TEXT
);

-- Données BOM types initiales (portail acier standard)
INSERT INTO nomenclatures_types (type_produit, designation_type) VALUES
  ('PORTAIL',     'Portail battant standard — acier'),
  ('PORTE',       'Porte métallique standard — acier'),
  ('BALCON',      'Garde-corps / Balcon standard'),
  ('GARDE_CORPS', 'Garde-corps simple'),
  ('CLAUSTRA',    'Claustra standard')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ORDRES DE FABRICATION
-- ============================================================
CREATE TABLE IF NOT EXISTS ordres_fabrication (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             VARCHAR(30) UNIQUE NOT NULL,   -- OF-2026-00001
  commande_id           UUID REFERENCES commandes_produits_finis(id),
  devis_id              UUID REFERENCES devis(id),
  type_produit          type_produit_fini NOT NULL,
  dimensions            JSONB NOT NULL,   -- {largeur_m, hauteur_m, quantite}
  statut                statut_of DEFAULT 'PLANIFIE',
  priorite              INT DEFAULT 2 CHECK (priorite BETWEEN 1 AND 3),
  technicien_assigne_id UUID REFERENCES auth.users(id),
  date_planifiee_debut  DATE,
  date_planifiee_fin    DATE,
  date_debut_reel       TIMESTAMPTZ,
  date_fin_reel         TIMESTAMPTZ,
  observations_atelier  TEXT,
  valide_par_dg         UUID REFERENCES auth.users(id),
  valide_par_qc         UUID REFERENCES auth.users(id),
  heures_estimees       NUMERIC(6,2) DEFAULT 8,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION next_ref_of()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'OF-' || TO_CHAR(NOW(),'YYYY') || '-' ||
         LPAD(nextval('seq_of')::TEXT,5,'0');
END $$;

-- ============================================================
-- BESOINS MATIÈRES PAR OF (résultat explosion BOM)
-- ============================================================
CREATE TABLE IF NOT EXISTS of_besoins_materiaux (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  of_id                   UUID NOT NULL REFERENCES ordres_fabrication(id) ON DELETE CASCADE,
  produit_quincaillerie_id UUID REFERENCES produits(id),
  designation_matiere     VARCHAR(200),
  quantite_theorique      NUMERIC(12,4) NOT NULL,
  quantite_reelle         NUMERIC(12,4) DEFAULT 0,   -- saisie fin de prod
  unite                   VARCHAR(20),
  statut_dispo            statut_dispo_matiere DEFAULT 'DISPONIBLE',
  bon_sortie_lie_id       UUID REFERENCES bons_sortie_atelier(id)
);

-- ============================================================
-- CAPACITÉ ATELIER
-- ============================================================
CREATE TABLE IF NOT EXISTS capacite_atelier (
  date                DATE PRIMARY KEY,
  heures_disponibles  NUMERIC(4,2) DEFAULT 8,
  heures_allouees     NUMERIC(6,2) DEFAULT 0,
  techniciens_presents JSONB DEFAULT '[]',
  fermeture           BOOLEAN DEFAULT FALSE,
  motif_fermeture     TEXT
);

-- ============================================================
-- TRIGGER : Création OF automatique lors d'un devis accepté
-- ============================================================
CREATE OR REPLACE FUNCTION creer_of_sur_acceptation_devis()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_of_id UUID;
  v_ref   TEXT;
BEGIN
  IF NEW.statut = 'ACCEPTE' AND OLD.statut <> 'ACCEPTE' THEN
    v_ref := next_ref_of();
    v_of_id := gen_random_uuid();

    INSERT INTO ordres_fabrication (
      id, reference, devis_id, type_produit, dimensions,
      statut, priorite,
      date_planifiee_debut,
      date_planifiee_fin
    ) VALUES (
      v_of_id, v_ref, NEW.id,
      COALESCE(NEW.type_produit, 'AUTRE'),
      COALESCE(NEW.specifications, '{"largeur_m":1,"hauteur_m":2,"quantite":1}'),
      'PLANIFIE', 2,
      CURRENT_DATE + 1,
      CURRENT_DATE + COALESCE(NEW.delai_fabrication_jours, 14)
    );
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_of_auto
  AFTER UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION creer_of_sur_acceptation_devis();

-- ============================================================
-- Mise à jour heures_allouées sur capacite_atelier
-- ============================================================
CREATE OR REPLACE FUNCTION maj_capacite_atelier_of()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.date_planifiee_debut IS NOT NULL THEN
    INSERT INTO capacite_atelier (date)
    VALUES (NEW.date_planifiee_debut)
    ON CONFLICT (date) DO NOTHING;

    UPDATE capacite_atelier
    SET heures_allouees = (
      SELECT COALESCE(SUM(heures_estimees), 0)
      FROM ordres_fabrication
      WHERE date_planifiee_debut = NEW.date_planifiee_debut
        AND statut NOT IN ('ANNULE','TERMINE')
    )
    WHERE date = NEW.date_planifiee_debut;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_cap_atelier
  AFTER INSERT OR UPDATE ON ordres_fabrication
  FOR EACH ROW EXECUTE FUNCTION maj_capacite_atelier_of();

-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_of_statut     ON ordres_fabrication(statut);
CREATE INDEX IF NOT EXISTS idx_of_date_plan  ON ordres_fabrication(date_planifiee_debut);
CREATE INDEX IF NOT EXISTS idx_of_technicien ON ordres_fabrication(technicien_assigne_id);
CREATE INDEX IF NOT EXISTS idx_bom_nomen     ON nomenclatures_lignes(nomenclature_id);
CREATE INDEX IF NOT EXISTS idx_besoins_of    ON of_besoins_materiaux(of_id);

-- RLS
ALTER TABLE ordres_fabrication     ENABLE ROW LEVEL SECURITY;
ALTER TABLE of_besoins_materiaux   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_of"     ON ordres_fabrication   FOR ALL USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "auth_besoins" ON of_besoins_materiaux FOR ALL USING (auth.role() IN ('authenticated','service_role'));
