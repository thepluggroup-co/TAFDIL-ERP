-- ============================================================
-- TAFDIL ERP — Migration 009
-- Module E1 : Ressources Humaines — Fiches, Temps, Congés, Évaluations
-- Droit camerounais — Code du Travail
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE poste_employe AS ENUM (
    'DIRECTEUR','SECRETAIRE','VENDEUR','TECHNICIEN',
    'MAGASINIER','CHAUFFEUR','AUTRE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE departement_employe AS ENUM (
    'DIRECTION','ADMINISTRATION','BOUTIQUE','ATELIER','LOGISTIQUE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE type_contrat AS ENUM ('CDI','CDD','STAGE','SOUS_TRAITANT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_employe AS ENUM (
    'ACTIF','SUSPENDU','DEMISSIONNAIRE','LICENCIE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE type_conge AS ENUM (
    'ANNUEL','MALADIE','MATERNITE','SANS_SOLDE','EXCEPTIONNEL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_conge AS ENUM ('DEMANDE','VALIDE','REFUSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mode_pointage AS ENUM ('MANUEL','QR_CODE','MOBILE_APP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE type_absence AS ENUM ('NON_JUSTIFIEE','AUTORISEE','MALADIE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mention_evaluation AS ENUM (
    'INSUFFISANT','MOYEN','BIEN','TRES_BIEN','EXCELLENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE periode_evaluation AS ENUM (
    'TRIM1','TRIM2','TRIM3','TRIM4','ANNUEL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SÉQUENCE MATRICULE
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS seq_matricule START 1;

CREATE OR REPLACE FUNCTION next_matricule()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'EMP-' || LPAD(nextval('seq_matricule')::TEXT, 3, '0');
END $$;

-- ============================================================
-- TABLE EMPLOYÉS
-- ============================================================
CREATE TABLE IF NOT EXISTS employes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID REFERENCES auth.users(id),   -- lien compte ERP si applicable
  matricule               VARCHAR(20) UNIQUE NOT NULL,
  nom                     VARCHAR(100) NOT NULL,
  prenom                  VARCHAR(100) NOT NULL,
  date_naissance          DATE,
  lieu_naissance          VARCHAR(100),
  nationalite             VARCHAR(80) DEFAULT 'Camerounaise',
  cni_numero              VARCHAR(30),
  cni_date_expiration     DATE,
  telephone               VARCHAR(20),
  email                   VARCHAR(150),
  adresse                 TEXT,
  photo_url               TEXT,
  poste                   poste_employe NOT NULL DEFAULT 'AUTRE',
  departement             departement_employe NOT NULL DEFAULT 'ADMINISTRATION',
  date_embauche           DATE NOT NULL DEFAULT CURRENT_DATE,
  type_contrat            type_contrat NOT NULL DEFAULT 'CDI',
  date_fin_contrat        DATE,  -- obligatoire si CDD/STAGE
  salaire_base_xaf        NUMERIC(14,2) NOT NULL DEFAULT 0,
  categorie_cnps          VARCHAR(5) DEFAULT 'I',  -- catégorie convention collective
  rib_bancaire            VARCHAR(30),
  operateur_mobile_money  VARCHAR(20),  -- ORANGE/MTN
  numero_mm               VARCHAR(20),
  cnps_numero_affiliation VARCHAR(30),
  statut                  statut_employe DEFAULT 'ACTIF',
  notes_rh                TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_fin_contrat CHECK (
    type_contrat NOT IN ('CDD','STAGE') OR date_fin_contrat IS NOT NULL
  )
);

-- ============================================================
-- CONTRATS (historique)
-- ============================================================
CREATE TABLE IF NOT EXISTS contrats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id      UUID NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  type            type_contrat NOT NULL,
  date_debut      DATE NOT NULL,
  date_fin        DATE,
  salaire_base    NUMERIC(14,2) NOT NULL,
  document_url    TEXT,
  renouvellements JSONB DEFAULT '[]',  -- [{date, salaire, motif}]
  cree_par        UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONGÉS
-- ============================================================
CREATE TABLE IF NOT EXISTS conges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id          UUID NOT NULL REFERENCES employes(id),
  type                type_conge NOT NULL DEFAULT 'ANNUEL',
  date_debut          DATE NOT NULL,
  date_fin            DATE NOT NULL,
  nb_jours_ouvrables  INT,  -- calculé automatiquement
  statut              statut_conge DEFAULT 'DEMANDE',
  valide_par          UUID REFERENCES auth.users(id),
  motif               TEXT,
  document_url        TEXT,  -- arrêt maladie si applicable
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SOLDES CONGÉS (droit acquis)
-- ============================================================
CREATE TABLE IF NOT EXISTS soldes_conges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id      UUID UNIQUE NOT NULL REFERENCES employes(id),
  annee           INT NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  jours_acquis    NUMERIC(5,1) DEFAULT 0,   -- 1.5 j/mois travaillé
  jours_pris      NUMERIC(5,1) DEFAULT 0,
  jours_restants  NUMERIC(5,1) GENERATED ALWAYS AS (jours_acquis - jours_pris) STORED,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger : accrual automatique 1.5j/mois au 1er de chaque mois (appelé par cron)
CREATE OR REPLACE FUNCTION accumuler_conges_annuels()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO soldes_conges (employe_id, annee, jours_acquis)
  SELECT id, EXTRACT(YEAR FROM NOW()), 0
  FROM employes WHERE statut = 'ACTIF'
  ON CONFLICT (employe_id) DO NOTHING;

  UPDATE soldes_conges sc
  SET jours_acquis = LEAST(sc.jours_acquis + 1.5, 30),  -- plafond 30j/an
      updated_at = NOW()
  FROM employes e
  WHERE sc.employe_id = e.id AND e.statut = 'ACTIF';
END $$;

-- ============================================================
-- POINTAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS pointages (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id              UUID NOT NULL REFERENCES employes(id),
  date                    DATE NOT NULL DEFAULT CURRENT_DATE,
  heure_arrivee           TIMESTAMPTZ,
  heure_depart            TIMESTAMPTZ,
  mode                    mode_pointage DEFAULT 'MOBILE_APP',
  heures_normales         NUMERIC(5,2) DEFAULT 0,
  heures_supplementaires  NUMERIC(5,2) DEFAULT 0,
  taux_majoration_sup     NUMERIC(4,2) DEFAULT 1.25,  -- 25% par défaut
  est_dimanche_nuit       BOOLEAN DEFAULT FALSE,
  observations            TEXT,
  valide_par_superviseur  UUID REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, date)
);

-- Calcul automatique des heures à la sortie
CREATE OR REPLACE FUNCTION calculer_heures_pointage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_duree_h   NUMERIC;
  v_legale    NUMERIC := 8.0;  -- 8h légales/jour
  v_dimanche  BOOLEAN;
BEGIN
  IF NEW.heure_depart IS NOT NULL AND NEW.heure_arrivee IS NOT NULL THEN
    v_duree_h := EXTRACT(EPOCH FROM (NEW.heure_depart - NEW.heure_arrivee)) / 3600.0;
    v_dimanche := EXTRACT(DOW FROM NEW.date) = 0;  -- dimanche = 0

    IF v_duree_h <= v_legale THEN
      NEW.heures_normales        := v_duree_h;
      NEW.heures_supplementaires := 0;
      NEW.taux_majoration_sup    := 1.0;
    ELSE
      NEW.heures_normales        := v_legale;
      NEW.heures_supplementaires := v_duree_h - v_legale;
      -- Dimanche/nuit → +100%, sinon +25% (8 premières sup) ou +50% au-delà
      NEW.taux_majoration_sup    := CASE
        WHEN v_dimanche                         THEN 2.0   -- +100%
        WHEN (v_duree_h - v_legale) <= 8       THEN 1.25  -- +25%
        ELSE                                         1.50  -- +50%
      END;
      NEW.est_dimanche_nuit := v_dimanche;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_calcul_heures
  BEFORE INSERT OR UPDATE ON pointages
  FOR EACH ROW EXECUTE FUNCTION calculer_heures_pointage();

-- ============================================================
-- ABSENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS absences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id   UUID NOT NULL REFERENCES employes(id),
  date         DATE NOT NULL,
  type         type_absence NOT NULL DEFAULT 'NON_JUSTIFIEE',
  impact_paie  BOOLEAN DEFAULT TRUE,
  motif        TEXT,
  document_url TEXT,
  cree_par     UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÉVALUATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id                UUID NOT NULL REFERENCES employes(id),
  evaluateur_id             UUID NOT NULL REFERENCES auth.users(id),
  periode                   periode_evaluation NOT NULL,
  annee                     INT NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  date_evaluation           DATE DEFAULT CURRENT_DATE,
  criteres                  JSONB NOT NULL DEFAULT '[]',
  -- [{critere, note_sur_5, poids}]
  note_globale              NUMERIC(3,2),  -- calculée
  commentaire               TEXT,
  objectifs_periode_suivante TEXT,
  mention                   mention_evaluation,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- HISTORIQUE MOUVEMENTS RH
-- ============================================================
CREATE TABLE IF NOT EXISTS mouvements_rh (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id      UUID NOT NULL REFERENCES employes(id),
  type            VARCHAR(50) NOT NULL,  -- PROMOTION, MUTATION, SANCTION, AUGMENTATION…
  date_mouvement  DATE DEFAULT CURRENT_DATE,
  ancien_poste    VARCHAR(100),
  nouveau_poste   VARCHAR(100),
  ancien_salaire  NUMERIC(14,2),
  nouveau_salaire NUMERIC(14,2),
  motif           TEXT,
  cree_par        UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEX & RLS
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_emp_statut       ON employes(statut);
CREATE INDEX IF NOT EXISTS idx_emp_dept         ON employes(departement);
CREATE INDEX IF NOT EXISTS idx_pointage_emp_date ON pointages(employe_id, date);
CREATE INDEX IF NOT EXISTS idx_conges_emp        ON conges(employe_id);
CREATE INDEX IF NOT EXISTS idx_absences_emp_date ON absences(employe_id, date);
CREATE INDEX IF NOT EXISTS idx_eval_emp_annee    ON evaluations(employe_id, annee);

ALTER TABLE employes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pointages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conges           ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_employes"   ON employes   FOR ALL USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "auth_pointages"  ON pointages  FOR ALL USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "auth_conges"     ON conges     FOR ALL USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "auth_evals"      ON evaluations FOR ALL USING (auth.role() IN ('authenticated','service_role'));

-- Vue alertes RH (CDD expirants, congés non pris, anniversaires embauche)
CREATE OR REPLACE VIEW v_alertes_rh AS
SELECT
  'CDD_EXPIRANT'              AS type_alerte,
  e.id                        AS employe_id,
  e.matricule,
  e.nom || ' ' || e.prenom    AS nom_complet,
  e.poste::TEXT,
  e.date_fin_contrat::TEXT    AS date_echeance,
  e.date_fin_contrat - CURRENT_DATE AS jours_restants
FROM employes e
WHERE e.type_contrat IN ('CDD','STAGE')
  AND e.statut = 'ACTIF'
  AND e.date_fin_contrat IS NOT NULL
  AND e.date_fin_contrat <= CURRENT_DATE + 30

UNION ALL

SELECT
  'CONGES_NON_PRIS',
  e.id, e.matricule,
  e.nom || ' ' || e.prenom,
  e.poste::TEXT,
  NULL,
  sc.jours_restants::INT
FROM employes e
JOIN soldes_conges sc ON sc.employe_id = e.id
WHERE e.statut = 'ACTIF'
  AND sc.jours_restants >= 15;
