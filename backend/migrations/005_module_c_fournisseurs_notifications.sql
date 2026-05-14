-- ============================================================
-- TAFDIL ERP — Migration 005
-- C5 : Fournisseurs & Approvisionnement
-- C6 : Notifications & Automatisations
-- ============================================================

-- ============================================================
-- C5 — FOURNISSEURS
-- ============================================================
CREATE TABLE IF NOT EXISTS fournisseurs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom                   VARCHAR(150) UNIQUE NOT NULL,
  contact_nom           VARCHAR(100),
  contact_telephone     VARCHAR(30),
  contact_email         VARCHAR(150),
  ville                 VARCHAR(80),
  specialite            TEXT[],
  delai_livraison_jours INT DEFAULT 3,
  conditions_paiement   VARCHAR(100) DEFAULT 'Comptant',
  note_fiabilite        NUMERIC(2,1) DEFAULT 3.0 CHECK (note_fiabilite BETWEEN 1 AND 5),
  lot_minimum           JSONB DEFAULT '{}',   -- {produit_id: qté_min}
  actif                 BOOLEAN DEFAULT TRUE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Relation produit ↔ fournisseur avec prix d'achat
CREATE TABLE IF NOT EXISTS fournisseurs_produits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fournisseur_id  UUID NOT NULL REFERENCES fournisseurs(id),
  produit_id      UUID NOT NULL REFERENCES produits(id),
  prix_achat_xaf  NUMERIC(14,2) NOT NULL,
  lot_min_commande NUMERIC(10,3) DEFAULT 1,
  delai_specifique INT,   -- si différent du délai fournisseur général
  est_preferentiel BOOLEAN DEFAULT FALSE,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fournisseur_id, produit_id)
);

DO $$ BEGIN
  CREATE TYPE statut_commande_achat AS ENUM (
    'BROUILLON','ENVOYE','CONFIRME','EN_LIVRAISON','RECEPTIONNE','ANNULE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS seq_commande_achat START 1;

CREATE TABLE IF NOT EXISTS commandes_achat (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             VARCHAR(30) UNIQUE NOT NULL,   -- CA-2026-00001
  fournisseur_id        UUID NOT NULL REFERENCES fournisseurs(id),
  date_commande         TIMESTAMPTZ DEFAULT NOW(),
  date_livraison_prevue DATE,
  date_livraison_reelle TIMESTAMPTZ,
  statut                statut_commande_achat DEFAULT 'BROUILLON',
  montant_total_xaf     NUMERIC(14,2) DEFAULT 0,
  mode_paiement         mode_paiement_enum DEFAULT 'VIREMENT',
  facture_fournisseur_url TEXT,
  notes                 TEXT,
  cree_par              UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commandes_achat_lignes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id       UUID NOT NULL REFERENCES commandes_achat(id) ON DELETE CASCADE,
  produit_id        UUID NOT NULL REFERENCES produits(id),
  quantite_commandee NUMERIC(12,3) NOT NULL,
  quantite_recue    NUMERIC(12,3) DEFAULT 0,
  prix_unitaire_xaf NUMERIC(14,2) NOT NULL,
  montant_ligne     NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND(quantite_commandee * prix_unitaire_xaf, 2)
  ) STORED
);

-- Trigger : entrée en stock à la réception
CREATE OR REPLACE FUNCTION reception_commande_achat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.statut = 'RECEPTIONNE' AND OLD.statut <> 'RECEPTIONNE' THEN
    UPDATE produits p
    SET stock_actuel = stock_actuel + cal.quantite_commandee,
        updated_at   = NOW()
    FROM commandes_achat_lignes cal
    WHERE cal.commande_id = NEW.id AND cal.produit_id = p.id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_reception_achat
  AFTER UPDATE ON commandes_achat
  FOR EACH ROW EXECUTE FUNCTION reception_commande_achat();

CREATE OR REPLACE FUNCTION next_ref_commande_achat()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'CA-' || TO_CHAR(NOW(),'YYYY') || '-' ||
         LPAD(nextval('seq_commande_achat')::TEXT,5,'0');
END $$;

-- Vue suggestions réappro
CREATE OR REPLACE VIEW v_suggestions_reappro AS
WITH consommation AS (
  SELECT
    produit_id,
    SUM(quantite) / GREATEST(COUNT(DISTINCT DATE(created_at)), 1) AS conso_jour_moy
  FROM ventes_comptoir_lignes vcl
  JOIN ventes_comptoir vc ON vc.id = vcl.vente_id
  WHERE vc.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY produit_id
),
stock_info AS (
  SELECT
    p.id, p.reference, p.designation, p.stock_actuel, p.stock_minimum,
    COALESCE(c.conso_jour_moy, 0) AS conso_jour_moy,
    CASE WHEN COALESCE(c.conso_jour_moy, 0) > 0
      THEN ROUND(p.stock_actuel / c.conso_jour_moy)
    ELSE NULL END AS jours_restants,
    fp.fournisseur_id,
    fp.prix_achat_xaf,
    fp.lot_min_commande,
    f.nom AS fournisseur_nom,
    f.delai_livraison_jours
  FROM produits p
  LEFT JOIN consommation c ON c.produit_id = p.id
  LEFT JOIN fournisseurs_produits fp ON fp.produit_id = p.id AND fp.est_preferentiel = TRUE
  LEFT JOIN fournisseurs f ON f.id = fp.fournisseur_id
  WHERE p.stock_actuel <= p.stock_minimum * 1.5
)
SELECT *,
  CASE
    WHEN jours_restants IS NOT NULL AND jours_restants <= delai_livraison_jours THEN 'URGENT'
    WHEN stock_actuel <= stock_minimum THEN 'CRITIQUE'
    ELSE 'A_COMMANDER'
  END AS urgence
FROM stock_info;

-- ============================================================
-- C6 — NOTIFICATIONS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE canal_notification AS ENUM ('IN_APP','PUSH','WHATSAPP','SMS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  type        VARCHAR(60) NOT NULL,
  titre       VARCHAR(200) NOT NULL,
  message     TEXT NOT NULL,
  lien_deep   TEXT,
  lu          BOOLEAN DEFAULT FALSE,
  canal       canal_notification DEFAULT 'IN_APP',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_push_tokens (
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  token      TEXT NOT NULL,
  platform   VARCHAR(10),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, token)
);

CREATE TABLE IF NOT EXISTS user_notification_prefs (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id),
  alertes          JSONB DEFAULT '{"stock_critique":true,"bon_sortie":true,"paiement":true,"commande_enligne":true}',
  canaux           TEXT[] DEFAULT ARRAY['IN_APP','PUSH'],
  silence_debut_h  INT DEFAULT 21,   -- heure début silence (21h)
  silence_fin_h    INT DEFAULT 7,    -- heure fin silence (7h)
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user    ON notifications(user_id, lu, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_type    ON notifications(type);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_notifs" ON notifications
  FOR ALL USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- Paramètre système : URL WhatsApp API
INSERT INTO parametres_systeme (cle, valeur, label) VALUES
  ('whatsapp_api_url',    '',          'URL API WhatsApp Business'),
  ('whatsapp_api_token',  '',          'Token API WhatsApp'),
  ('sms_api_url',         '',          'URL API SMS camerounaise'),
  ('sms_api_key',         '',          'Clé API SMS')
ON CONFLICT (cle) DO NOTHING;
