-- ============================================================
-- TAFDIL ERP — Migration 012
-- OPT-4 : Comptabilité SYSCOHADA — Plan comptable, Écritures
-- ============================================================

-- ── PLAN COMPTABLE OHADA (extrait pertinent TAFDIL) ──────────
CREATE TABLE IF NOT EXISTS plan_comptable (
  code       VARCHAR(10) PRIMARY KEY,
  libelle    VARCHAR(200) NOT NULL,
  classe     SMALLINT NOT NULL CHECK (classe BETWEEN 1 AND 9),
  sens       VARCHAR(6) NOT NULL CHECK (sens IN ('DEBIT','CREDIT','MIXTE')),
  mapping_erp TEXT   -- type d'événement ERP lié
);

INSERT INTO plan_comptable (code, libelle, classe, sens, mapping_erp) VALUES
-- Classe 1 - Ressources durables
('101000','Capital social',1,'CREDIT',NULL),
('121000','Report à nouveau',1,'MIXTE',NULL),
-- Classe 2 - Actifs immobilisés
('215000','Matériel et outillage industriel',2,'DEBIT',NULL),
('281500','Amort. matériel outillage',2,'CREDIT',NULL),
-- Classe 3 - Stocks
('311000','Stocks matières premières',3,'DEBIT','stock_entree'),
('391000','Dépréc. stocks matières',3,'CREDIT','inventaire_ecart'),
-- Classe 4 - Tiers
('401000','Fournisseurs',4,'CREDIT','achat_fournisseur'),
('411000','Clients',4,'DEBIT','vente_client'),
('421000','Personnel — rémunérations dues',4,'CREDIT','paie_mensuelle'),
('431000','CNPS — cotisations sociales',4,'CREDIT','cotisations_cnps'),
('442000','État — impôts et taxes / IRPP',4,'CREDIT','retenues_irpp'),
('443000','État — TVA collectée',4,'CREDIT','tva_vente'),
('445000','État — TVA déductible',4,'DEBIT','tva_achat'),
('471000','Débiteurs divers',4,'DEBIT',NULL),
-- Classe 5 - Trésorerie
('521000','Banques',5,'DEBIT','encaissement_banque'),
('571000','Caisse XAF',5,'DEBIT','encaissement_caisse'),
('585000','Mobile money',5,'DEBIT','encaissement_mm'),
-- Classe 6 - Charges
('601000','Achats matières premières',6,'DEBIT','achat_fournisseur'),
('602000','Achats fournitures atelier',6,'DEBIT','bon_sortie'),
('611000','Sous-traitance générale',6,'DEBIT',NULL),
('661000','Rémunérations personnel',6,'DEBIT','paie_mensuelle'),
('664000','Charges sociales patronales',6,'DEBIT','cotisations_cnps'),
('681000','Dotations aux amortissements',6,'DEBIT',NULL),
-- Classe 7 - Produits
('701000','Ventes de marchandises — boutique',7,'CREDIT','vente_comptoir'),
('706000','Ventes de produits finis',7,'CREDIT','vente_produit_fini'),
('758000','Autres produits d''exploitation',7,'CREDIT',NULL)
ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle;

-- ── MAPPING ERP → COMPTES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS mapping_comptable (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evenement       VARCHAR(60) UNIQUE NOT NULL,  -- clé métier
  libelle         VARCHAR(150),
  journal         VARCHAR(20) NOT NULL,  -- VENTES│ACHATS│CAISSE│PAIE│OD
  lignes_modele   JSONB NOT NULL  -- [{role, compte, sens, pct_montant}]
);

INSERT INTO mapping_comptable (evenement, libelle, journal, lignes_modele) VALUES
('vente_comptoir_cash',    'Vente comptoir — paiement immédiat', 'VENTES', '[
  {"role":"debit_tresor",  "compte":"571000","sens":"DEBIT", "pct":1.0},
  {"role":"credit_vente",  "compte":"701000","sens":"CREDIT","pct":0.8379},
  {"role":"credit_tva",    "compte":"443000","sens":"CREDIT","pct":0.1621}
]'),
('vente_comptoir_credit',  'Vente comptoir — crédit client',     'VENTES', '[
  {"role":"debit_client",  "compte":"411000","sens":"DEBIT", "pct":1.0},
  {"role":"credit_vente",  "compte":"701000","sens":"CREDIT","pct":0.8379},
  {"role":"credit_tva",    "compte":"443000","sens":"CREDIT","pct":0.1621}
]'),
('encaissement_client',    'Règlement client',                   'CAISSE', '[
  {"role":"debit_caisse",  "compte":"571000","sens":"DEBIT", "pct":1.0},
  {"role":"credit_client", "compte":"411000","sens":"CREDIT","pct":1.0}
]'),
('achat_fournisseur',      'Facture fournisseur matières',       'ACHATS', '[
  {"role":"debit_achat",   "compte":"601000","sens":"DEBIT", "pct":0.8379},
  {"role":"debit_tva",     "compte":"445000","sens":"DEBIT", "pct":0.1621},
  {"role":"credit_fourn",  "compte":"401000","sens":"CREDIT","pct":1.0}
]'),
('reglement_fournisseur',  'Règlement fournisseur',              'CAISSE', '[
  {"role":"debit_fourn",   "compte":"401000","sens":"DEBIT", "pct":1.0},
  {"role":"credit_caisse", "compte":"571000","sens":"CREDIT","pct":1.0}
]'),
('paie_mensuelle',         'Comptabilisation bulletin de paie',  'PAIE',   '[
  {"role":"debit_salaires","compte":"661000","sens":"DEBIT", "pct":1.0},
  {"role":"credit_personnel","compte":"421000","sens":"CREDIT","pct":1.0}
]'),
('reglement_salaires',     'Paiement net salariés',              'PAIE',   '[
  {"role":"debit_personnel","compte":"421000","sens":"DEBIT","pct":1.0},
  {"role":"credit_caisse", "compte":"521000","sens":"CREDIT","pct":1.0}
]'),
('charges_patronales_cnps','Cotisations patronales CNPS',        'OD',     '[
  {"role":"debit_charges", "compte":"664000","sens":"DEBIT", "pct":1.0},
  {"role":"credit_cnps",   "compte":"431000","sens":"CREDIT","pct":1.0}
]'),
('inventaire_ecart_perte', 'Ajustement inventaire — perte',     'OD',     '[
  {"role":"debit_deprec",  "compte":"391000","sens":"DEBIT", "pct":1.0},
  {"role":"credit_stock",  "compte":"311000","sens":"CREDIT","pct":1.0}
]')
ON CONFLICT (evenement) DO NOTHING;

-- ── ÉCRITURES COMPTABLES ────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE statut_ecriture AS ENUM ('AUTOMATIQUE','VALIDE','CORRIGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS seq_piece_compta START 1;

CREATE TABLE IF NOT EXISTS ecritures_comptables (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  journal      VARCHAR(20) NOT NULL,
  piece_ref    VARCHAR(30),
  libelle      TEXT NOT NULL,
  lignes       JSONB NOT NULL,  -- [{compte, libelle, debit, credit}]
  source_type  VARCHAR(30),     -- VENTE│ACHAT│PAIE│MANUEL
  source_id    UUID,
  statut       statut_ecriture DEFAULT 'AUTOMATIQUE',
  exercice     INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  valide_par   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Fonction utilitaire pour créer une écriture depuis un mapping
CREATE OR REPLACE FUNCTION creer_ecriture_auto(
  p_evenement  TEXT,
  p_montant    NUMERIC,
  p_libelle    TEXT,
  p_source_type TEXT,
  p_source_id  UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_mapping   RECORD;
  v_lignes    JSONB := '[]';
  v_ligne     JSONB;
  v_id        UUID;
  v_piece     TEXT;
BEGIN
  SELECT * INTO v_mapping FROM mapping_comptable WHERE evenement = p_evenement;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Construire les lignes
  FOR v_ligne IN SELECT jsonb_array_elements(v_mapping.lignes_modele) LOOP
    DECLARE
      v_montant_ligne NUMERIC := ROUND(p_montant * (v_ligne->>'pct_montant')::NUMERIC, 0);
      v_sens TEXT := v_ligne->>'sens';
    BEGIN
      v_lignes := v_lignes || jsonb_build_object(
        'compte',  v_ligne->>'compte',
        'libelle', p_libelle,
        'debit',   CASE WHEN v_sens = 'DEBIT' THEN v_montant_ligne ELSE 0 END,
        'credit',  CASE WHEN v_sens = 'CREDIT' THEN v_montant_ligne ELSE 0 END
      );
    END;
  END LOOP;

  v_piece := v_mapping.journal || '-' || TO_CHAR(NOW(),'YYYY') || '-' ||
             LPAD(nextval('seq_piece_compta')::TEXT, 5, '0');

  INSERT INTO ecritures_comptables (journal, piece_ref, libelle, lignes, source_type, source_id)
  VALUES (v_mapping.journal, v_piece, p_libelle, v_lignes, p_source_type, p_source_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- ── VUES COMPTABLES ────────────────────────────────────────────

-- Grand livre (mouvements par compte)
CREATE OR REPLACE VIEW v_grand_livre AS
SELECT
  ec.id, ec.date, ec.journal, ec.piece_ref, ec.libelle,
  ec.exercice, ec.statut,
  ligne->>'compte'            AS compte,
  pc.libelle                  AS libelle_compte,
  pc.classe,
  (ligne->>'debit')::NUMERIC  AS debit,
  (ligne->>'credit')::NUMERIC AS credit
FROM ecritures_comptables ec
CROSS JOIN jsonb_array_elements(ec.lignes) AS ligne
LEFT JOIN plan_comptable pc ON pc.code = ligne->>'compte'
WHERE ec.statut IN ('AUTOMATIQUE','VALIDE');

-- Balance générale SYSCOHADA
CREATE OR REPLACE VIEW v_balance_syscohada AS
SELECT
  compte,
  libelle_compte,
  classe,
  SUM(debit)              AS total_debit,
  SUM(credit)             AS total_credit,
  SUM(debit) - SUM(credit) AS solde_debiteur,
  SUM(credit) - SUM(debit) AS solde_crediteur
FROM v_grand_livre
GROUP BY compte, libelle_compte, classe
ORDER BY compte;

-- ── INDEX ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ecritures_date      ON ecritures_comptables(date);
CREATE INDEX IF NOT EXISTS idx_ecritures_journal   ON ecritures_comptables(journal, date);
CREATE INDEX IF NOT EXISTS idx_ecritures_source    ON ecritures_comptables(source_type, source_id);

ALTER TABLE ecritures_comptables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_compta" ON ecritures_comptables FOR ALL USING (auth.role() IN ('authenticated','service_role'));
