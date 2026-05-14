-- ============================================================
-- TAFDIL ERP — Migration 010
-- Module E2 : Moteur de Paie — CNPS & IRPP Cameroun 2024
-- ============================================================

-- ============================================================
-- PARAMÈTRES DE PAIE (configurables par le DG)
-- ============================================================
CREATE TABLE IF NOT EXISTS parametres_paie (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annee                   INT NOT NULL,
  -- CNPS taux salarié
  cnps_vieillesse_salarie NUMERIC(5,4) DEFAULT 0.0280,
  plafond_cnps_xaf        NUMERIC(14,2) DEFAULT 750000,
  -- CNPS taux patronal
  cnps_vieillesse_patron  NUMERIC(5,4) DEFAULT 0.0420,
  cnps_at_patron          NUMERIC(5,4) DEFAULT 0.0350,  -- BTP-métal TAFDIL
  cnps_family_patron      NUMERIC(5,4) DEFAULT 0.0700,
  -- IRPP
  tranches_irpp           JSONB NOT NULL DEFAULT '[
    {"de":0,       "a":2000000,  "taux":0.10},
    {"de":2000001, "a":3000000,  "taux":0.155},
    {"de":3000001, "a":5000000,  "taux":0.20},
    {"de":5000001, "a":10000000, "taux":0.245},
    {"de":10000001,"a":null,     "taux":0.35}
  ]',
  abattement_irpp_pct     NUMERIC(4,3) DEFAULT 0.30,
  cac_taux                NUMERIC(4,3) DEFAULT 0.10,
  -- Autres
  taux_horaire_base_xaf   NUMERIC(12,2) DEFAULT 0,  -- calculé si 0 (salaire/173.33h)
  actif                   BOOLEAN DEFAULT TRUE,
  UNIQUE(annee, actif)
);

INSERT INTO parametres_paie (annee) VALUES (2026) ON CONFLICT DO NOTHING;
INSERT INTO parametres_paie (annee) VALUES (2025) ON CONFLICT DO NOTHING;

-- ============================================================
-- PRIMES & AVANTAGES (par employé / par mois)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE type_prime AS ENUM (
    'TRANSPORT','LOGEMENT','PERFORMANCE','ANCIENNETE',
    'ASTREINTE','REPRESENTATION','AUTRE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS primes_mensuelles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id      UUID NOT NULL REFERENCES employes(id),
  annee           INT NOT NULL,
  mois            INT NOT NULL CHECK (mois BETWEEN 1 AND 12),
  type            type_prime NOT NULL,
  montant_xaf     NUMERIC(14,2) NOT NULL,
  imposable       BOOLEAN DEFAULT TRUE,
  description     TEXT,
  cree_par        UUID REFERENCES auth.users(id),
  UNIQUE(employe_id, annee, mois, type)
);

-- ============================================================
-- AVANCES SUR SALAIRE
-- ============================================================
CREATE TABLE IF NOT EXISTS avances_salaire (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id  UUID NOT NULL REFERENCES employes(id),
  annee       INT NOT NULL,
  mois        INT NOT NULL CHECK (mois BETWEEN 1 AND 12),
  montant_xaf NUMERIC(14,2) NOT NULL,
  rembourse   BOOLEAN DEFAULT FALSE,
  motif       TEXT,
  cree_par    UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BULLETINS DE PAIE
-- ============================================================
DO $$ BEGIN
  CREATE TYPE statut_bulletin AS ENUM ('BROUILLON','VALIDE','PAYE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS bulletins_paie (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id              UUID NOT NULL REFERENCES employes(id),
  annee                   INT NOT NULL,
  mois                    INT NOT NULL CHECK (mois BETWEEN 1 AND 12),
  statut                  statut_bulletin DEFAULT 'BROUILLON',

  -- Éléments bruts
  salaire_base            NUMERIC(14,2) NOT NULL,
  heures_normales         NUMERIC(6,2) DEFAULT 0,
  heures_sup              NUMERIC(6,2) DEFAULT 0,
  montant_heures_sup      NUMERIC(14,2) DEFAULT 0,
  primes_total            NUMERIC(14,2) DEFAULT 0,
  avantages_nature        NUMERIC(14,2) DEFAULT 0,
  salaire_brut            NUMERIC(14,2) NOT NULL,

  -- Retenues CNPS salarié
  base_cnps               NUMERIC(14,2) DEFAULT 0,
  cnps_vieillesse_sal     NUMERIC(14,2) DEFAULT 0,
  total_retenues_sal_cnps NUMERIC(14,2) DEFAULT 0,

  -- IRPP
  salaire_imposable_annuel NUMERIC(14,2) DEFAULT 0,
  base_irpp               NUMERIC(14,2) DEFAULT 0,
  irpp_annuel             NUMERIC(14,2) DEFAULT 0,
  irpp_mensuel            NUMERIC(14,2) DEFAULT 0,
  cac_mensuel             NUMERIC(14,2) DEFAULT 0,
  total_irpp              NUMERIC(14,2) DEFAULT 0,

  -- Net
  total_retenues          NUMERIC(14,2) DEFAULT 0,
  avances_deduites        NUMERIC(14,2) DEFAULT 0,
  salaire_net             NUMERIC(14,2) NOT NULL,

  -- Charges patronales (hors bulletin, pour comptabilité)
  cnps_vieillesse_pat     NUMERIC(14,2) DEFAULT 0,
  cnps_at_pat             NUMERIC(14,2) DEFAULT 0,
  cnps_family_pat         NUMERIC(14,2) DEFAULT 0,
  total_charges_pat       NUMERIC(14,2) DEFAULT 0,
  cout_total_employeur    NUMERIC(14,2) DEFAULT 0,

  -- Détail JSON (lignes du bulletin)
  detail_calcul           JSONB DEFAULT '{}',
  primes_detail           JSONB DEFAULT '[]',

  pdf_url                 TEXT,
  valide_par              UUID REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, annee, mois)
);

-- ============================================================
-- JOURNAL DE PAIE MENSUEL
-- ============================================================
DO $$ BEGIN
  CREATE TYPE statut_journal_paie AS ENUM ('BROUILLON','VALIDE','PAYE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS journaux_paie (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annee               INT NOT NULL,
  mois                INT NOT NULL CHECK (mois BETWEEN 1 AND 12),
  statut              statut_journal_paie DEFAULT 'BROUILLON',
  total_employes      INT DEFAULT 0,
  total_brut          NUMERIC(14,2) DEFAULT 0,
  total_net           NUMERIC(14,2) DEFAULT 0,
  total_charges_pat   NUMERIC(14,2) DEFAULT 0,
  total_cnps_sal      NUMERIC(14,2) DEFAULT 0,
  total_irpp          NUMERIC(14,2) DEFAULT 0,
  bulletins_ids       UUID[] DEFAULT '{}',
  valide_par_dg       UUID REFERENCES auth.users(id),
  date_validation     TIMESTAMPTZ,
  date_paiement       TIMESTAMPTZ,
  ecriture_compta_id  UUID,  -- lien vers journal comptable SYSCOHADA
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(annee, mois)
);

-- ============================================================
-- VUE MASSE SALARIALE
-- ============================================================
CREATE OR REPLACE VIEW v_masse_salariale AS
SELECT
  bp.annee,
  bp.mois,
  COUNT(*)                   AS nb_employes,
  SUM(bp.salaire_brut)       AS total_brut,
  SUM(bp.salaire_net)        AS total_net,
  SUM(bp.total_charges_pat)  AS total_charges_patronales,
  SUM(bp.total_irpp)         AS total_irpp,
  SUM(bp.total_retenues_sal_cnps) AS total_cnps_sal,
  SUM(bp.cout_total_employeur) AS cout_total
FROM bulletins_paie bp
WHERE bp.statut IN ('VALIDE','PAYE')
GROUP BY bp.annee, bp.mois
ORDER BY bp.annee DESC, bp.mois DESC;

-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bulletins_emp_mois ON bulletins_paie(employe_id, annee, mois);
CREATE INDEX IF NOT EXISTS idx_bulletins_statut   ON bulletins_paie(statut);
CREATE INDEX IF NOT EXISTS idx_primes_emp_mois    ON primes_mensuelles(employe_id, annee, mois);
CREATE INDEX IF NOT EXISTS idx_avances_emp_mois   ON avances_salaire(employe_id, annee, mois);

ALTER TABLE bulletins_paie  ENABLE ROW LEVEL SECURITY;
ALTER TABLE journaux_paie   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_bulletins" ON bulletins_paie FOR ALL USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "auth_journaux"  ON journaux_paie  FOR ALL USING (auth.role() IN ('authenticated','service_role'));
