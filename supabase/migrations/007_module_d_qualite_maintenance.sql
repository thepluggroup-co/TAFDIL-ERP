-- ============================================================
-- TAFDIL ERP — Migration 007
-- D2 : Contrôle Qualité & Maintenance Équipements
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE decision_qc AS ENUM ('VALIDE','RETOUCHE','REJET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_equipement AS ENUM (
    'OPERATIONNEL','EN_MAINTENANCE','HS','HORS_SERVICE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE type_maintenance AS ENUM ('PREVENTIVE','CORRECTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE localisation_equipement AS ENUM (
    'ATELIER_SOUDURE','ATELIER_COUPE','ATELIER_FINITION','AUTRE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- CONTRÔLE QUALITÉ
-- ============================================================
CREATE TABLE IF NOT EXISTS fiches_controle_qualite (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  of_id               UUID UNIQUE NOT NULL REFERENCES ordres_fabrication(id),
  technicien_qc_id    UUID NOT NULL REFERENCES auth.users(id),
  date_controle       TIMESTAMPTZ DEFAULT NOW(),
  produit_conforme    BOOLEAN,
  -- Array JSON de critères : [{critere, valeur_mesuree, tolerance, conforme}]
  criteres_verifies   JSONB DEFAULT '[]',
  photos_controle     TEXT[] DEFAULT '{}',
  defauts_constates   TEXT,
  actions_correctives TEXT,
  decision            decision_qc DEFAULT 'VALIDE',
  valide_par_dg       UUID REFERENCES auth.users(id),   -- requis si REJET
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Critères QC par type produit (référence)
CREATE TABLE IF NOT EXISTS criteres_qc_type (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_produit type_produit_fini NOT NULL,
  critere      VARCHAR(100) NOT NULL,
  tolerance    VARCHAR(50),
  description  TEXT,
  obligatoire  BOOLEAN DEFAULT TRUE
);

INSERT INTO criteres_qc_type (type_produit, critere, tolerance, obligatoire) VALUES
  ('PORTAIL', 'Dimensions largeur',  '±5 mm',  TRUE),
  ('PORTAIL', 'Dimensions hauteur',  '±5 mm',  TRUE),
  ('PORTAIL', 'Planéité',           '±3 mm/m', TRUE),
  ('PORTAIL', 'Soudures',           'visuel',  TRUE),
  ('PORTAIL', 'Finition peinture',  'visuel',  TRUE),
  ('PORTE',   'Dimensions largeur',  '±3 mm',  TRUE),
  ('PORTE',   'Dimensions hauteur',  '±3 mm',  TRUE),
  ('PORTE',   'Jeu de cadre',       '2-4 mm',  TRUE),
  ('PORTE',   'Charnières',         'fonctionnel', TRUE),
  ('PORTE',   'Serrure',            'fonctionnel', TRUE),
  ('BALCON',  'Charge test',        '100 kg/ml', TRUE),
  ('BALCON',  'Soudures',           'visuel',  TRUE),
  ('BALCON',  'Finition',           'visuel',  TRUE)
ON CONFLICT DO NOTHING;

-- Retouches
CREATE TABLE IF NOT EXISTS retouches (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiche_qc_id        UUID NOT NULL REFERENCES fiches_controle_qualite(id),
  of_id              UUID NOT NULL REFERENCES ordres_fabrication(id),
  type_defaut        VARCHAR(200) NOT NULL,
  temps_retouche_h   NUMERIC(6,2) DEFAULT 1,
  technicien_id      UUID REFERENCES auth.users(id),
  date_retouche      DATE DEFAULT CURRENT_DATE,
  cout_retouche_xaf  NUMERIC(14,2) DEFAULT 0,
  nouvelle_fiche_id  UUID REFERENCES fiches_controle_qualite(id),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger : OF ne peut être TERMINE sans QC VALIDE
CREATE OR REPLACE FUNCTION verifier_qc_avant_terminer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_qc_decision TEXT;
BEGIN
  IF NEW.statut = 'TERMINE' AND OLD.statut <> 'TERMINE' THEN
    SELECT decision INTO v_qc_decision
    FROM fiches_controle_qualite
    WHERE of_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_qc_decision IS NULL OR v_qc_decision <> 'VALIDE' THEN
      RAISE EXCEPTION 'OF % ne peut être TERMINÉ sans fiche QC VALIDÉE (dernière décision : %)',
        NEW.reference, COALESCE(v_qc_decision, 'AUCUNE');
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_qc_avant_terminer
  BEFORE UPDATE ON ordres_fabrication
  FOR EACH ROW EXECUTE FUNCTION verifier_qc_avant_terminer();

-- ============================================================
-- MAINTENANCE ÉQUIPEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS equipements (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom                       VARCHAR(150) NOT NULL,
  reference                 VARCHAR(80),
  date_acquisition          DATE,
  localisation              localisation_equipement DEFAULT 'AUTRE',
  heures_utilisation_total  NUMERIC(10,2) DEFAULT 0,
  heure_derniere_revision   NUMERIC(10,2) DEFAULT 0,
  statut                    statut_equipement DEFAULT 'OPERATIONNEL',
  notes                     TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO equipements (nom, localisation) VALUES
  ('Poste à souder MIG #1',  'ATELIER_SOUDURE'),
  ('Poste à souder MIG #2',  'ATELIER_SOUDURE'),
  ('Disqueuse ⌀230 #1',      'ATELIER_COUPE'),
  ('Scie métal à ruban',     'ATELIER_COUPE'),
  ('Cabine peinture',        'ATELIER_FINITION'),
  ('Perceuse colonne',       'ATELIER_SOUDURE')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS plans_maintenance (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipement_id             UUID NOT NULL REFERENCES equipements(id),
  type                      type_maintenance DEFAULT 'PREVENTIVE',
  frequence_heures          INT,
  frequence_jours           INT,
  derniere_maintenance_date DATE,
  prochaine_maintenance_date DATE,   -- calculée par trigger/cron
  description_operations    TEXT,
  cout_estime_xaf           NUMERIC(14,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS interventions_maintenance (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipement_id          UUID NOT NULL REFERENCES equipements(id),
  plan_id                UUID REFERENCES plans_maintenance(id),
  type                   type_maintenance NOT NULL,
  date_debut             TIMESTAMPTZ DEFAULT NOW(),
  date_fin               TIMESTAMPTZ,
  description_panne      TEXT,
  actions_realisees      TEXT,
  pieces_remplacees      JSONB DEFAULT '[]',
  cout_reel_xaf          NUMERIC(14,2) DEFAULT 0,
  technicien_prestataire VARCHAR(150),
  impact_production      TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger : mise à jour statut équipement lors d'une intervention
CREATE OR REPLACE FUNCTION maj_statut_equipement()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE equipements SET statut = 'EN_MAINTENANCE', updated_at = NOW()
    WHERE id = NEW.equipement_id AND statut = 'OPERATIONNEL';
  ELSIF TG_OP = 'UPDATE' AND NEW.date_fin IS NOT NULL AND OLD.date_fin IS NULL THEN
    UPDATE equipements SET statut = 'OPERATIONNEL', updated_at = NOW()
    WHERE id = NEW.equipement_id;
    -- Mettre à jour dernière maintenance
    UPDATE plans_maintenance
    SET derniere_maintenance_date = CURRENT_DATE,
        prochaine_maintenance_date = CURRENT_DATE + COALESCE(frequence_jours, 30)
    WHERE equipement_id = NEW.equipement_id AND id = NEW.plan_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_statut_equipement
  AFTER INSERT OR UPDATE ON interventions_maintenance
  FOR EACH ROW EXECUTE FUNCTION maj_statut_equipement();

-- Vue alertes maintenance
CREATE OR REPLACE VIEW v_alertes_maintenance AS
SELECT
  e.id, e.nom, e.localisation, e.statut,
  pm.type, pm.prochaine_maintenance_date,
  pm.prochaine_maintenance_date - CURRENT_DATE AS jours_avant_echeance,
  pm.description_operations,
  pm.cout_estime_xaf,
  CASE
    WHEN e.statut = 'HS' THEN 'HS'
    WHEN pm.prochaine_maintenance_date <= CURRENT_DATE THEN 'ECHU'
    WHEN pm.prochaine_maintenance_date <= CURRENT_DATE + 7 THEN 'IMMINENT'
    ELSE 'OK'
  END AS alerte
FROM equipements e
JOIN plans_maintenance pm ON pm.equipement_id = e.id
WHERE e.statut <> 'HORS_SERVICE';

-- Index & RLS
CREATE INDEX IF NOT EXISTS idx_fiche_qc_of    ON fiches_controle_qualite(of_id);
CREATE INDEX IF NOT EXISTS idx_interv_equip   ON interventions_maintenance(equipement_id);
CREATE INDEX IF NOT EXISTS idx_plans_equip    ON plans_maintenance(equipement_id);

ALTER TABLE fiches_controle_qualite ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_qc" ON fiches_controle_qualite
  FOR ALL USING (auth.role() IN ('authenticated','service_role'));
