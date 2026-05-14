-- =============================================================================
-- Migration 017 — Module MRP Complet
-- Tables : nomenclatures_types, nomenclatures_lignes, ordres_fabrication,
--          of_besoins_materiaux, capacite_atelier
-- Séquence de référence OF, trigger devis ACCEPTÉ → OF automatique
-- =============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Séquence numérotation OF (OF-YYYY-XXXX) ─────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS seq_of_numero START 1;

-- =============================================================================
-- 1. nomenclatures_types — BOM maître par type produit
-- =============================================================================
CREATE TABLE IF NOT EXISTS nomenclatures_types (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_produit     TEXT NOT NULL CHECK (type_produit IN (
                     'PORTAIL','PORTE','BALCON','GARDE_CORPS','CLAUSTRA','AUTRE')),
  designation_type TEXT NOT NULL,
  actif            BOOLEAN NOT NULL DEFAULT true,
  version          INTEGER NOT NULL DEFAULT 1,
  coefficient_chute DECIMAL(5,4) NOT NULL DEFAULT 1.08,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nomen_types_produit ON nomenclatures_types (type_produit, actif);

-- =============================================================================
-- 2. nomenclatures_lignes — détail BOM (lignes matières)
-- =============================================================================
CREATE TABLE IF NOT EXISTS nomenclatures_lignes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomenclature_id          UUID NOT NULL REFERENCES nomenclatures_types(id) ON DELETE CASCADE,
  produit_quincaillerie_id UUID REFERENCES produits(id) ON DELETE SET NULL,
  designation_matiere      TEXT,                         -- fallback si pas de produit lié
  quantite_par_m2          DECIMAL(12,6) NOT NULL DEFAULT 0,
  quantite_par_ml          DECIMAL(12,6) NOT NULL DEFAULT 0,
  quantite_fixe            DECIMAL(12,6) NOT NULL DEFAULT 0,
  unite                    TEXT NOT NULL CHECK (unite IN ('KG','M','ML','PCS','L','U')),
  poste                    TEXT NOT NULL CHECK (poste IN ('STRUCTURE','HABILLAGE','FINITION','FIXATION')),
  notes_technicien         TEXT,
  actif                    BOOLEAN NOT NULL DEFAULT true,
  ordre_affichage          INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nomen_lignes_nomen ON nomenclatures_lignes (nomenclature_id);
CREATE INDEX IF NOT EXISTS idx_nomen_lignes_produit ON nomenclatures_lignes (produit_quincaillerie_id);

-- =============================================================================
-- 3. ordres_fabrication
-- =============================================================================
CREATE TABLE IF NOT EXISTS ordres_fabrication (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference               TEXT NOT NULL UNIQUE,          -- OF-2026-0001
  commande_id             UUID,                          -- nullable
  devis_id                UUID REFERENCES devis(id) ON DELETE SET NULL,
  type_produit            TEXT NOT NULL CHECK (type_produit IN (
                            'PORTAIL','PORTE','BALCON','GARDE_CORPS','CLAUSTRA','AUTRE')),
  dimensions              JSONB NOT NULL DEFAULT '{}',   -- {largeur_m, hauteur_m, quantite}
  description_client      TEXT,
  statut                  TEXT NOT NULL DEFAULT 'PLANIFIE'
                            CHECK (statut IN (
                              'PLANIFIE','EN_ATTENTE_MATIERE','EN_COURS',
                              'SUSPENDU','TERMINE','ANNULE')),
  priorite                INTEGER NOT NULL DEFAULT 2
                            CHECK (priorite IN (1,2,3)),  -- 1=urgence 2=normal 3=différé
  heures_estimees         DECIMAL(6,2),
  technicien_assigne_id   UUID,                          -- auth.users.id
  date_planifiee_debut    DATE,
  date_planifiee_fin      DATE,
  date_debut_reel         TIMESTAMPTZ,
  date_fin_reel           TIMESTAMPTZ,
  observations_atelier    TEXT,
  valide_par_dg           UUID,
  valide_par_qc           UUID,
  created_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_of_statut     ON ordres_fabrication (statut);
CREATE INDEX IF NOT EXISTS idx_of_devis      ON ordres_fabrication (devis_id);
CREATE INDEX IF NOT EXISTS idx_of_technicien ON ordres_fabrication (technicien_assigne_id);
CREATE INDEX IF NOT EXISTS idx_of_dates      ON ordres_fabrication (date_planifiee_debut, date_planifiee_fin);

-- =============================================================================
-- 4. of_besoins_materiaux — explosion BOM résultat
-- =============================================================================
CREATE TABLE IF NOT EXISTS of_besoins_materiaux (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  of_id                     UUID NOT NULL REFERENCES ordres_fabrication(id) ON DELETE CASCADE,
  produit_quincaillerie_id  UUID REFERENCES produits(id) ON DELETE SET NULL,
  designation_matiere       TEXT,
  quantite_theorique        DECIMAL(14,4) NOT NULL,
  quantite_reelle_consommee DECIMAL(14,4) NOT NULL DEFAULT 0,
  unite                     TEXT NOT NULL,
  poste                     TEXT,
  statut_dispo              TEXT NOT NULL DEFAULT 'DISPONIBLE'
                              CHECK (statut_dispo IN ('DISPONIBLE','PARTIEL','RUPTURE')),
  bon_sortie_lie_id         UUID,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_besoins_of      ON of_besoins_materiaux (of_id);
CREATE INDEX IF NOT EXISTS idx_besoins_statut  ON of_besoins_materiaux (statut_dispo);
CREATE INDEX IF NOT EXISTS idx_besoins_produit ON of_besoins_materiaux (produit_quincaillerie_id);

-- =============================================================================
-- 5. capacite_atelier — planning journalier de capacité
-- =============================================================================
CREATE TABLE IF NOT EXISTS capacite_atelier (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                 DATE NOT NULL UNIQUE,
  heures_disponibles   DECIMAL(5,2) NOT NULL DEFAULT 8.0,
  heures_allouees      DECIMAL(5,2) NOT NULL DEFAULT 0.0,
  techniciens_presents JSONB NOT NULL DEFAULT '[]',  -- [uuid, ...]
  fermeture            BOOLEAN NOT NULL DEFAULT false,
  motif_fermeture      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cap_date ON capacite_atelier (date);

-- =============================================================================
-- 6. Fonction utilitaire — générer référence OF
-- =============================================================================
CREATE OR REPLACE FUNCTION generate_of_reference()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  annee TEXT := to_char(now(), 'YYYY');
  numero TEXT;
BEGIN
  numero := lpad(nextval('seq_of_numero')::text, 4, '0');
  RETURN 'OF-' || annee || '-' || numero;
END;
$$;

-- =============================================================================
-- 7. Trigger updated_at automatique
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_of_updated_at ON ordres_fabrication;
CREATE TRIGGER trg_of_updated_at
  BEFORE UPDATE ON ordres_fabrication
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_besoins_updated_at ON of_besoins_materiaux;
CREATE TRIGGER trg_besoins_updated_at
  BEFORE UPDATE ON of_besoins_materiaux
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_nomen_updated_at ON nomenclatures_types;
CREATE TRIGGER trg_nomen_updated_at
  BEFORE UPDATE ON nomenclatures_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_cap_updated_at ON capacite_atelier;
CREATE TRIGGER trg_cap_updated_at
  BEFORE UPDATE ON capacite_atelier
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 8. Trigger Supabase : devis ACCEPTÉ → créer OF automatiquement
--    + insérer un événement dans sync_queue pour que le backend explose le BOM
-- =============================================================================
CREATE OR REPLACE FUNCTION trg_devis_accepte_creer_of()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_of_id   UUID;
  v_ref     TEXT;
  v_dims    JSONB;
  v_type    TEXT;
BEGIN
  -- Seulement quand le statut passe à ACCEPTE
  IF NEW.statut <> 'ACCEPTE' OR OLD.statut = 'ACCEPTE' THEN
    RETURN NEW;
  END IF;

  -- Extraire dimensions depuis le devis (champs standards du module devis)
  v_dims := jsonb_build_object(
    'largeur_m', COALESCE((NEW.dimensions->>'largeur_m')::numeric, 1.0),
    'hauteur_m', COALESCE((NEW.dimensions->>'hauteur_m')::numeric, 2.0),
    'quantite',  COALESCE((NEW.dimensions->>'quantite')::integer, 1)
  );

  -- Type produit depuis le devis (colonne type_produit ou famille)
  v_type := COALESCE(NEW.type_produit, 'AUTRE');

  -- Générer la référence OF
  v_ref := generate_of_reference();
  v_of_id := gen_random_uuid();

  -- Créer l'OF
  INSERT INTO ordres_fabrication (
    id, reference, devis_id, type_produit, dimensions,
    description_client, statut, priorite, created_by
  ) VALUES (
    v_of_id, v_ref, NEW.id, v_type, v_dims,
    NEW.objet, 'PLANIFIE', 2, NEW.created_by
  );

  -- Insérer un événement dans sync_queue pour que le backend lance l'explosion BOM
  -- (le backend écoute cette table via Realtime ou polling)
  INSERT INTO sync_queue (type, payload, statut)
  VALUES (
    'MRP_EXPLOSER_BOM',
    jsonb_build_object('of_id', v_of_id, 'devis_id', NEW.id),
    'PENDING'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_devis_accepte ON devis;
CREATE TRIGGER trg_devis_accepte
  AFTER UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION trg_devis_accepte_creer_of();

-- =============================================================================
-- 9. Vue : planning_of_30j — Gantt 30 jours glissants
-- =============================================================================
CREATE OR REPLACE VIEW v_planning_of_30j AS
SELECT
  o.id,
  o.reference,
  o.type_produit,
  o.statut,
  o.priorite,
  o.dimensions,
  o.heures_estimees,
  o.date_planifiee_debut,
  o.date_planifiee_fin,
  o.date_debut_reel,
  o.date_fin_reel,
  o.technicien_assigne_id,
  o.observations_atelier,
  CASE
    WHEN o.date_planifiee_fin < CURRENT_DATE AND o.statut NOT IN ('TERMINE','ANNULE')
    THEN true ELSE false
  END AS en_retard,
  COALESCE(c.heures_disponibles, 8) AS cap_heures_dispo,
  COALESCE(c.heures_allouees, 0)    AS cap_heures_allouees,
  COALESCE(c.fermeture, false)      AS jour_ferme,
  CASE
    WHEN COALESCE(c.heures_allouees, 0) > COALESCE(c.heures_disponibles, 8) * 1.1
    THEN true ELSE false
  END AS surcharge
FROM ordres_fabrication o
LEFT JOIN capacite_atelier c ON c.date = o.date_planifiee_debut
WHERE o.date_planifiee_debut BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
  AND o.statut NOT IN ('ANNULE','TERMINE')
ORDER BY o.date_planifiee_debut, o.priorite;

-- =============================================================================
-- 10. Vue : v_suggestions_appro — matières en rupture/partiel pour OF en attente
-- =============================================================================
CREATE OR REPLACE VIEW v_suggestions_appro AS
SELECT
  bm.of_id,
  of.reference         AS of_reference,
  of.type_produit,
  of.priorite,
  of.date_planifiee_debut,
  bm.produit_quincaillerie_id,
  p.reference          AS produit_reference,
  p.designation        AS produit_designation,
  p.stock_actuel,
  bm.quantite_theorique,
  GREATEST(bm.quantite_theorique - COALESCE(p.stock_actuel, 0), 0) AS quantite_a_commander,
  bm.unite,
  bm.statut_dispo,
  fp.fournisseur_id    AS fournisseur_principal_id
FROM of_besoins_materiaux bm
JOIN ordres_fabrication of ON of.id = bm.of_id
LEFT JOIN produits p ON p.id = bm.produit_quincaillerie_id
LEFT JOIN fournisseurs_produits fp ON fp.produit_id = p.id AND fp.est_preferentiel = true
WHERE bm.statut_dispo IN ('RUPTURE','PARTIEL')
  AND of.statut IN ('PLANIFIE','EN_ATTENTE_MATIERE')
ORDER BY of.priorite, of.date_planifiee_debut, bm.statut_dispo;

-- =============================================================================
-- 11. Vue : v_tableau_bord_production — KPIs atelier (OEE simplifié)
-- =============================================================================
CREATE OR REPLACE VIEW v_tableau_bord_production AS
WITH base AS (
  SELECT
    COUNT(*) FILTER (WHERE statut NOT IN ('ANNULE'))                     AS total_of,
    COUNT(*) FILTER (WHERE statut = 'TERMINE')                           AS of_termines,
    COUNT(*) FILTER (WHERE statut = 'EN_COURS')                         AS of_en_cours,
    COUNT(*) FILTER (WHERE statut IN ('PLANIFIE','EN_ATTENTE_MATIERE'))  AS of_en_attente,
    COUNT(*) FILTER (WHERE statut = 'ANNULE')                           AS of_annules,
    COUNT(*) FILTER (
      WHERE date_planifiee_fin < CURRENT_DATE
        AND statut NOT IN ('TERMINE','ANNULE'))                          AS of_en_retard,
    ROUND(AVG(
      EXTRACT(EPOCH FROM (date_fin_reel - date_debut_reel)) / 3600
    ) FILTER (WHERE date_fin_reel IS NOT NULL)::numeric, 2)             AS duree_moyenne_h,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')    AS of_30j
  FROM ordres_fabrication
),
cap AS (
  SELECT
    SUM(heures_disponibles) AS total_dispo_h,
    SUM(heures_allouees)    AS total_allouees_h
  FROM capacite_atelier
  WHERE date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE
)
SELECT
  b.*,
  c.total_dispo_h,
  c.total_allouees_h,
  CASE
    WHEN c.total_dispo_h > 0
    THEN ROUND((c.total_allouees_h / c.total_dispo_h * 100)::numeric, 1)
    ELSE 0
  END AS taux_utilisation_pct,
  CASE
    WHEN b.of_termines + b.of_en_retard > 0
    THEN ROUND((b.of_termines::numeric / NULLIF(b.of_termines + b.of_en_retard, 0) * 100), 1)
    ELSE 100
  END AS taux_ponctualite_pct
FROM base b, cap c;

-- =============================================================================
-- 12. Seed : nomenclatures types de base (exemples TAFDIL)
-- =============================================================================
INSERT INTO nomenclatures_types (type_produit, designation_type, version, coefficient_chute)
VALUES
  ('PORTAIL',      'Portail battant standard acier',       1, 1.08),
  ('PORTE',        'Porte métallique standard',            1, 1.08),
  ('BALCON',       'Garde-corps balcon barreaux verticaux',1, 1.08),
  ('GARDE_CORPS',  'Garde-corps escalier standard',        1, 1.08),
  ('CLAUSTRA',     'Claustra décoratif laser',             1, 1.10)
ON CONFLICT DO NOTHING;
