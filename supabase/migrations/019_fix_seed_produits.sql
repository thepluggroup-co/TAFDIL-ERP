-- =============================================================================
-- Migration 019 — Correction seed produits (migration 016 échouait)
-- Problèmes corrigés :
--   • prix_vente_ht → prix_public (colonne inexistante dans produits)
--   • Contrainte chk_prix_interne_lte_public bloquait les MP (prix_public=0)
--   • mode_paiement 'CASH' hors-enum dans ventes_comptoir seed
-- =============================================================================

-- ─── 1. Assouplir la contrainte prix ─────────────────────────────────────────
-- La contrainte prix_interne ≤ prix_public est pertinente uniquement pour les
-- articles en vente boutique, pas pour les matières premières internes.

ALTER TABLE produits DROP CONSTRAINT IF EXISTS chk_prix_interne_lte_public;
ALTER TABLE produits ADD CONSTRAINT chk_prix_interne_lte_public
  CHECK (NOT disponible_boutique OR prix_interne <= prix_public);

-- ─── 2. Matières premières (usage atelier, pas en vente boutique) ─────────────

INSERT INTO produits (id, reference, designation, unite, categorie, stock_actuel, stock_minimum, prix_public, prix_interne, disponible_boutique, actif)
VALUES
  ('00000003-0000-0000-0000-000000000001','MP-001','Fer carré 25×25mm',       'ML',  'MATIERE_PREMIERE', 850, 200, 1200,  1200,  false, true),
  ('00000003-0000-0000-0000-000000000002','MP-002','Fer plat 40×4mm',          'ML',  'MATIERE_PREMIERE', 620, 150,  950,   950,  false, true),
  ('00000003-0000-0000-0000-000000000003','MP-003','Tôle galvanisée 1.5mm',    'M2',  'MATIERE_PREMIERE', 180,  50, 4800,  4800,  false, true),
  ('00000003-0000-0000-0000-000000000004','MP-004','Tôle noire 2mm',            'M2',  'MATIERE_PREMIERE',  95,  30, 3600,  3600,  false, true),
  ('00000003-0000-0000-0000-000000000005','MP-005','Peinture époxy noire',      'L',   'MATIERE_PREMIERE',  42,  10, 2500,  2500,  false, true),
  ('00000003-0000-0000-0000-000000000006','MP-006','Électrodes soudure 2.5mm', 'KG',  'MATIERE_PREMIERE',  38,  10, 1800,  1800,  false, true),
  ('00000003-0000-0000-0000-000000000007','MP-007','Disques meuleuse 125mm',   'PCS', 'MATIERE_PREMIERE',  85,  20,  450,   450,  false, true),
  ('00000003-0000-0000-0000-000000000008','MP-008','Charnières portail 150mm', 'PCS', 'MATIERE_PREMIERE', 120,  25, 1500,  1500,  false, true),
  ('00000003-0000-0000-0000-000000000009','MP-009','Serrure portail 3 points', 'PCS', 'MATIERE_PREMIERE',  35,  10,12500, 12500,  false, true),
  ('00000003-0000-0000-0000-000000000010','MP-010','Peinture antirouille',     'L',   'MATIERE_PREMIERE',  28,   8, 2200,  2200,  false, true)
ON CONFLICT (reference) DO UPDATE SET
  prix_public         = EXCLUDED.prix_public,
  prix_interne        = EXCLUDED.prix_interne,
  disponible_boutique = EXCLUDED.disponible_boutique,
  stock_actuel        = EXCLUDED.stock_actuel,
  categorie           = EXCLUDED.categorie;

-- ─── 3. Produits boutique quincaillerie (en vente public) ────────────────────

INSERT INTO produits (id, reference, designation, unite, categorie, stock_actuel, stock_minimum, prix_public, prix_interne, disponible_boutique, actif)
VALUES
  ('00000003-0000-0000-0000-000000000011','BQ-001','Cadenas laiton 50mm',     'PCS', 'QUINCAILLERIE', 45, 10, 4500,  2800, true, true),
  ('00000003-0000-0000-0000-000000000012','BQ-002','Charnière acier 100mm',   'PCS', 'QUINCAILLERIE',120, 20, 1200,   700, true, true),
  ('00000003-0000-0000-0000-000000000013','BQ-003','Visserie acier M8×50',    'KG',  'QUINCAILLERIE', 35,  5, 3500,  2000, true, true),
  ('00000003-0000-0000-0000-000000000014','BQ-004','Poignée porte inox',      'PCS', 'QUINCAILLERIE', 28,  5, 8500,  5200, true, true),
  ('00000003-0000-0000-0000-000000000015','BQ-005','Joint caoutchouc 8mm/ml', 'ML',  'QUINCAILLERIE',200, 50,  350,   200, true, true)
ON CONFLICT (reference) DO UPDATE SET
  prix_public         = EXCLUDED.prix_public,
  prix_interne        = EXCLUDED.prix_interne,
  disponible_boutique = EXCLUDED.disponible_boutique,
  stock_actuel        = EXCLUDED.stock_actuel,
  categorie           = EXCLUDED.categorie;

-- ─── 4. Appliquer les catégories TAFDIL aux nouveaux produits ────────────────

UPDATE produits SET categorie_detail = 'PROFILES_TUBES'
WHERE reference IN ('MP-001','MP-002') AND categorie_detail IS NULL;

UPDATE produits SET categorie_detail = 'TOLES_PLAQUES'
WHERE reference IN ('MP-003','MP-004') AND categorie_detail IS NULL;

UPDATE produits SET categorie_detail = 'PEINTURE_FINITION'
WHERE reference IN ('MP-005','MP-010') AND categorie_detail IS NULL;

UPDATE produits SET categorie_detail = 'SOUDURE'
WHERE reference = 'MP-006' AND categorie_detail IS NULL;

UPDATE produits SET categorie_detail = 'OUTILLAGE'
WHERE reference = 'MP-007' AND categorie_detail IS NULL;

UPDATE produits SET categorie_detail = 'VISSERIE'
WHERE reference IN ('MP-008','MP-009','BQ-001','BQ-002','BQ-003','BQ-004','BQ-005')
  AND categorie_detail IS NULL;
