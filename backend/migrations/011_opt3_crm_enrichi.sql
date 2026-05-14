-- ============================================================
-- TAFDIL ERP — Migration 011
-- OPT-3 : CRM Enrichi — 360°, Pipeline, Score Risque, WhatsApp
-- ============================================================

-- ── Extensions table clients ──────────────────────────────────
DO $$ BEGIN
  CREATE TYPE pipeline_statut AS ENUM (
    'PROSPECT','DEVIS_ENVOYE','NEGOCIATION','GAGNE','PERDU'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE score_risque AS ENUM ('A','B','C','D');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS pipeline_statut   pipeline_statut DEFAULT 'PROSPECT',
  ADD COLUMN IF NOT EXISTS charge_commercial_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS score_risque      score_risque DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS score_risque_detail JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS encours_total_xaf NUMERIC(16,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retard_max_jours  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags              TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_acquisition VARCHAR(60),  -- BOUCHE_A_OREILLE│RESEAUX│CHANTIER
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- ── Notes CRM (relances, litiges, appels...) ────────────────────
DO $$ BEGIN
  CREATE TYPE type_note_crm AS ENUM (
    'APPEL','EMAIL','VISITE','RELANCE','LITIGE','DIVERS'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS notes_crm (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id),
  auteur_id       UUID NOT NULL REFERENCES auth.users(id),
  type            type_note_crm DEFAULT 'DIVERS',
  contenu         TEXT NOT NULL,
  date_prochaine_action DATE,
  rappel_envoye   BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Messages WhatsApp tracés ──────────────────────────────────
DO $$ BEGIN
  CREATE TYPE statut_message_wa AS ENUM ('ENVOYE','LU','REPONDU','ECHEC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE template_wa AS ENUM (
    'CONFIRMATION_COMMANDE','RELANCE_J7','RELANCE_J15',
    'RELANCE_J30','DEVIS_ENVOYE','LIVRAISON_PREVUE','LIBRE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS messages_whatsapp (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id),
  telephone       VARCHAR(25) NOT NULL,
  template        template_wa NOT NULL DEFAULT 'LIBRE',
  contenu         TEXT NOT NULL,
  statut          statut_message_wa DEFAULT 'ENVOYE',
  message_sid     TEXT,           -- ID retourné par le provider (Twilio/D360)
  source_type     VARCHAR(30),    -- FACTURE │ COMMANDE │ RELANCE │ MANUEL
  source_id       UUID,
  envoye_par      UUID REFERENCES auth.users(id),
  envoye_a        TIMESTAMPTZ DEFAULT NOW(),
  lu_a            TIMESTAMPTZ,
  repondu_a       TIMESTAMPTZ,
  reponse_texte   TEXT
);

-- ── Vue historique 360° ───────────────────────────────────────
CREATE OR REPLACE VIEW v_historique_client_360 AS
-- Devis
SELECT
  d.client_id,
  d.created_at              AS date_event,
  'DEVIS'::TEXT             AS type_event,
  d.reference               AS reference,
  d.montant_ttc             AS montant,
  d.statut                  AS statut,
  d.id                      AS source_id
FROM devis d WHERE d.client_id IS NOT NULL

UNION ALL
-- Commandes produits finis
SELECT
  cmd.client_id,
  cmd.created_at,
  'COMMANDE',
  cmd.numero,
  cmd.montant_total,
  cmd.statut,
  cmd.id
FROM commandes_produits_finis cmd WHERE cmd.client_id IS NOT NULL

UNION ALL
-- Ventes comptoir
SELECT
  vc.client_id,
  vc.created_at,
  'VENTE_COMPTOIR',
  vc.numero_vente,
  vc.montant_ttc,
  vc.statut_paiement,
  vc.id
FROM ventes_comptoir vc WHERE vc.client_id IS NOT NULL

UNION ALL
-- Acomptes
SELECT
  cmd2.client_id,
  a.date_paiement,
  'PAIEMENT',
  'Acompte ' || a.reference_paiement,
  a.montant_xaf,
  a.statut::TEXT,
  a.id
FROM acomptes a
JOIN commandes_produits_finis cmd2 ON cmd2.id = a.commande_id

UNION ALL
-- Notes CRM
SELECT
  n.client_id,
  n.created_at,
  'NOTE_' || n.type::TEXT,
  NULL,
  NULL,
  NULL,
  n.id
FROM notes_crm n

UNION ALL
-- Messages WhatsApp
SELECT
  m.client_id,
  m.envoye_a,
  'WHATSAPP',
  m.template::TEXT,
  NULL,
  m.statut::TEXT,
  m.id
FROM messages_whatsapp m;

-- ── Calcul score risque (appelé par trigger ou API) ────────────
CREATE OR REPLACE FUNCTION calculer_score_risque(p_client_id UUID)
RETURNS score_risque LANGUAGE plpgsql AS $$
DECLARE
  v_encours     NUMERIC := 0;
  v_retard_max  INT := 0;
  v_score       TEXT;
BEGIN
  -- Somme des acomptes en retard (commandes non entièrement payées > 30j)
  SELECT
    COALESCE(SUM(cmd.montant_total - COALESCE(
      (SELECT SUM(a2.montant_xaf) FROM acomptes a2 WHERE a2.commande_id = cmd.id AND a2.statut = 'VALIDE'), 0
    )), 0),
    COALESCE(MAX(EXTRACT(DAY FROM NOW() - cmd.created_at)::INT), 0)
  INTO v_encours, v_retard_max
  FROM commandes_produits_finis cmd
  WHERE cmd.client_id = p_client_id
    AND cmd.statut NOT IN ('ANNULE','LIVRE')
    AND cmd.created_at < NOW() - INTERVAL '30 days';

  UPDATE clients SET
    encours_total_xaf = v_encours,
    retard_max_jours  = v_retard_max,
    score_risque_detail = jsonb_build_object(
      'encours_xaf', v_encours,
      'retard_jours', v_retard_max,
      'calcule_le', NOW()
    )
  WHERE id = p_client_id;

  v_score := CASE
    WHEN v_retard_max >= 90 OR v_encours >= 2000000 THEN 'D'
    WHEN v_retard_max >= 60 OR v_encours >= 1000000 THEN 'C'
    WHEN v_retard_max >= 30 OR v_encours >= 500000  THEN 'B'
    ELSE 'A'
  END;

  UPDATE clients SET score_risque = v_score::score_risque WHERE id = p_client_id;
  RETURN v_score::score_risque;
END $$;

-- ── Index ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notes_crm_client     ON notes_crm(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_client            ON messages_whatsapp(client_id, envoye_a DESC);
CREATE INDEX IF NOT EXISTS idx_clients_pipeline     ON clients(pipeline_statut);
CREATE INDEX IF NOT EXISTS idx_clients_score_risque ON clients(score_risque);

ALTER TABLE notes_crm          ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages_whatsapp  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_notes_crm" ON notes_crm         FOR ALL USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "auth_wa_msgs"   ON messages_whatsapp  FOR ALL USING (auth.role() IN ('authenticated','service_role'));
