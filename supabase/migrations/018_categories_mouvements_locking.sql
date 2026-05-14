-- =============================================================================
-- Migration 018 — Catégories TAFDIL, Mouvements stock, Verrouillage concurrent
-- =============================================================================

-- ─── 1. Colonne categorie_detail + nouvelles colonnes produits ───────────────

ALTER TABLE produits ADD COLUMN IF NOT EXISTS categorie_detail TEXT;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS en_ligne         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS description      TEXT;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS photos_urls      JSONB  NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_produits_categorie_detail ON produits (categorie_detail);
CREATE INDEX IF NOT EXISTS idx_produits_en_ligne          ON produits (en_ligne) WHERE en_ligne = true;

-- ─── 2. Vue stock_dispo_boutique enrichie (remplace celle de migration 001) ──
-- Inclut categorie_detail pour permettre le filtrage par catégorie TAFDIL.
-- Les colonnes existantes (id → categorie) restent en position pour compatibilité;
-- les nouvelles colonnes sont ajoutées à la fin.

CREATE OR REPLACE VIEW v_stock_dispo_boutique AS
SELECT
  p.id,
  p.reference,
  p.designation,
  p.unite,
  p.stock_actuel,
  COALESCE(SUM(b.quantite) FILTER (WHERE b.statut = 'EN_ATTENTE'), 0) AS quantite_reservee_atelier,
  p.stock_actuel - COALESCE(SUM(b.quantite) FILTER (WHERE b.statut = 'EN_ATTENTE'), 0) AS stock_dispo_boutique,
  p.prix_public,
  p.prix_interne,
  p.disponible_boutique,
  p.categorie,
  p.categorie_detail,
  p.en_ligne,
  p.photos_urls,
  p.description,
  p.actif
FROM produits p
LEFT JOIN bons_sortie_atelier b ON b.produit_id = p.id
GROUP BY p.id;

-- ─── 3. Table mouvements_stock — trafic entrée/sortie ────────────────────────

CREATE TABLE IF NOT EXISTS mouvements_stock (
  id             UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id     UUID     NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  type_mouvement TEXT     NOT NULL CHECK (type_mouvement IN ('ENTREE','SORTIE','AJUSTEMENT','RETOUR')),
  quantite       DECIMAL(14,4) NOT NULL,
  stock_avant    DECIMAL(14,4),
  stock_apres    DECIMAL(14,4),
  source_canal   TEXT     NOT NULL DEFAULT 'ERP'
                   CHECK (source_canal IN ('ERP','ECOMMERCE','ATELIER','INVENTAIRE','RETOUR')),
  reference_doc  TEXT,
  motif          TEXT,
  user_id        UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mvt_produit ON mouvements_stock (produit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mvt_source  ON mouvements_stock (source_canal);
CREATE INDEX IF NOT EXISTS idx_mvt_type    ON mouvements_stock (type_mouvement);

-- ─── 4. Fonction de verrouillage consultatif (advisory lock) ─────────────────

CREATE OR REPLACE FUNCTION fn_lock_produit_stock(p_produit_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_produit_id::text)::bigint);
END;
$$;

-- ─── 5. Fonction : décrémenter stock avec verrou (atomique) ──────────────────

CREATE OR REPLACE FUNCTION fn_decrement_stock_secure(
  p_produit_id  UUID,
  p_quantite    DECIMAL,
  p_source      TEXT DEFAULT 'ERP'
)
RETURNS TABLE(ok BOOLEAN, message TEXT, stock_restant DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_stock  DECIMAL(14,4);
BEGIN
  PERFORM fn_lock_produit_stock(p_produit_id);

  SELECT stock_actuel INTO v_stock
  FROM produits WHERE id = p_produit_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Produit introuvable', 0::DECIMAL;
    RETURN;
  END IF;

  IF v_stock < p_quantite THEN
    RETURN QUERY SELECT false,
      format('Stock insuffisant : %s disponible, %s demandé', v_stock, p_quantite),
      v_stock;
    RETURN;
  END IF;

  UPDATE produits
  SET stock_actuel = stock_actuel - p_quantite,
      updated_at   = now()
  WHERE id = p_produit_id;

  RETURN QUERY SELECT true, 'OK', (v_stock - p_quantite);
END;
$$;

-- ─── 6. Source canal sur commandes produits finis ────────────────────────────

ALTER TABLE commandes_produits_finis
  ADD COLUMN IF NOT EXISTS source_canal TEXT NOT NULL DEFAULT 'ERP'
    CHECK (source_canal IN ('ERP','ECOMMERCE'));

ALTER TABLE commandes_produits_finis
  ADD COLUMN IF NOT EXISTS client_email TEXT;

CREATE INDEX IF NOT EXISTS idx_cpf_source ON commandes_produits_finis (source_canal);

ALTER TABLE ventes_comptoir
  ADD COLUMN IF NOT EXISTS source_canal TEXT NOT NULL DEFAULT 'ERP'
    CHECK (source_canal IN ('ERP','ECOMMERCE'));

-- ─── 7. Vue : v_catalogue_en_ligne ───────────────────────────────────────────

CREATE OR REPLACE VIEW v_catalogue_en_ligne AS
SELECT
  p.id,
  p.reference,
  p.designation,
  p.description,
  p.categorie,
  p.categorie_detail,
  p.stock_actuel,
  p.stock_actuel AS stock_dispo_boutique,
  p.unite,
  p.prix_public,
  p.photos_urls,
  p.actif
FROM produits p
WHERE p.en_ligne = true
  AND p.actif    = true
  AND p.stock_actuel > 0;

-- ─── 8. Seed catégories pour produits existants ──────────────────────────────
-- Basé sur les désignations réelles de la migration 016 (MP-001→MP-010, BQ-001→BQ-005)

-- PROFILES_TUBES : fers carrés, plats, tubes, profilés, HEA/IPE/UPN
UPDATE produits SET categorie_detail = 'PROFILES_TUBES'
WHERE categorie_detail IS NULL
  AND (designation ILIKE '%tube%'
    OR designation ILIKE '%profilé%'
    OR designation ILIKE '%profil%'
    OR designation ILIKE '%HEA%'
    OR designation ILIKE '%IPE%'
    OR designation ILIKE '%UPN%'
    OR designation ILIKE '%carré%'
    OR designation ILIKE '%fer carré%'
    OR designation ILIKE '%fer plat%'
    OR designation ILIKE '%plat %'
    OR designation ILIKE '%cornière%'
    OR designation ILIKE '%rond %'
    OR designation ILIKE '%laminé%');

-- TOLES_PLAQUES : tôles et plaques (galvanisées, noires, etc.)
UPDATE produits SET categorie_detail = 'TOLES_PLAQUES'
WHERE categorie_detail IS NULL
  AND (designation ILIKE '%tôle%'
    OR designation ILIKE '%tole%'
    OR designation ILIKE '%plaque%'
    OR designation ILIKE '%feuille%'
    OR designation ILIKE '%galvanisé%');

-- SOUDURE : électrodes, fils MIG/TIG, baguettes, flux
UPDATE produits SET categorie_detail = 'SOUDURE'
WHERE categorie_detail IS NULL
  AND (designation ILIKE '%électrode%'
    OR designation ILIKE '%electrode%'
    OR designation ILIKE '%fil MIG%'
    OR designation ILIKE '%fil TIG%'
    OR designation ILIKE '%baguette%'
    OR designation ILIKE '%soudure%'
    OR designation ILIKE '%flux%');

-- PEINTURE_FINITION : peintures, apprêts, antirouilles, solvants, laques
UPDATE produits SET categorie_detail = 'PEINTURE_FINITION'
WHERE categorie_detail IS NULL
  AND (designation ILIKE '%peinture%'
    OR designation ILIKE '%apprêt%'
    OR designation ILIKE '%appret%'
    OR designation ILIKE '%antirouille%'
    OR designation ILIKE '%anti-rouille%'
    OR designation ILIKE '%solvant%'
    OR designation ILIKE '%laque%'
    OR designation ILIKE '%époxy%'
    OR designation ILIKE '%epoxy%'
    OR designation ILIKE '%primaire%');

-- VISSERIE : visserie, boulons, écrous, rivets, chevilles, charnières (fixation)
UPDATE produits SET categorie_detail = 'VISSERIE'
WHERE categorie_detail IS NULL
  AND (designation ILIKE '%visserie%'
    OR designation ILIKE '%boulon%'
    OR designation ILIKE '%écrou%'
    OR designation ILIKE '%ecrou%'
    OR designation ILIKE '% vis %'
    OR designation ILIKE 'vis %'
    OR designation ILIKE '%rivet%'
    OR designation ILIKE '%cheville%'
    OR designation ILIKE '%goujon%'
    OR designation ILIKE '%charnière%'
    OR designation ILIKE '%charniere%'
    OR designation ILIKE '%serrure%'
    OR designation ILIKE '%cadenas%'
    OR designation ILIKE '%poignée%'
    OR designation ILIKE '%poignee%'
    OR designation ILIKE '%verrou%'
    OR designation ILIKE '%joint%');

-- EPI : équipements de protection individuelle
UPDATE produits SET categorie_detail = 'EPI'
WHERE categorie_detail IS NULL
  AND (designation ILIKE '%gant%'
    OR designation ILIKE '%casque%'
    OR designation ILIKE '%masque%'
    OR designation ILIKE '%lunette%protection%'
    OR designation ILIKE '%tablier%soudeur%'
    OR designation ILIKE '%harnais%'
    OR designation ILIKE '%botte%protection%'
    OR designation ILIKE '%combinaison%');

-- OUTILLAGE : disques, meules, forets, scies, consommables machine
UPDATE produits SET categorie_detail = 'OUTILLAGE'
WHERE categorie_detail IS NULL
  AND (designation ILIKE '%meule%'
    OR designation ILIKE '%disque%'
    OR designation ILIKE '%foret%'
    OR designation ILIKE '%scie%'
    OR designation ILIKE '%fraise%'
    OR designation ILIKE '%lime %'
    OR designation ILIKE '%burin%');

-- Fallback DIVERS pour tout quincaillerie/matière non classifiée
-- (cast ::TEXT pour couvrir les valeurs hors-enum comme CONSOMMABLE, COMPOSANT)
UPDATE produits SET categorie_detail = 'DIVERS'
WHERE categorie_detail IS NULL
  AND categorie::TEXT IN ('QUINCAILLERIE', 'MATIERE_PREMIERE', 'CONSOMMABLE', 'COMPOSANT');

-- Produits finis dans la table produits (cas rare, utilise la désignation)
UPDATE produits SET categorie_detail = 'AUTRE'
  WHERE categorie_detail IS NULL AND categorie::TEXT = 'PRODUIT_FINI';

-- ─── 9. Commentaires ─────────────────────────────────────────────────────────

COMMENT ON TABLE  mouvements_stock IS 'Historique entrées/sorties pour chaque produit (ERP + e-commerce)';
COMMENT ON COLUMN produits.en_ligne IS 'Produit visible et commandable sur la plateforme e-commerce';
COMMENT ON COLUMN produits.categorie_detail IS 'Catégorie fine selon le portefeuille TAFDIL';
COMMENT ON FUNCTION fn_decrement_stock_secure IS
  'Décrémentation atomique avec advisory lock — prévient les conflits de commandes simultanées ERP/e-commerce';
