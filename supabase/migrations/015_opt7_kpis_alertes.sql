-- ============================================================
-- TAFDIL ERP — Migration 015
-- OPT-7 : KPIs Avancés & Alertes Prédictives
-- ============================================================

-- ── VUE PILOTAGE CHANTIERS ─────────────────────────────────────
CREATE OR REPLACE VIEW v_pilotage_chantiers AS
SELECT
  cmd.id                                          AS commande_id,
  cmd.numero,
  c.nom                                           AS client_nom,
  c.telephone                                     AS client_tel,
  cmd.statut,
  cmd.montant_total                               AS budget_devis,
  COALESCE(bp.cout_total, 0)                      AS cout_reel,
  cmd.montant_total - COALESCE(bp.cout_total, 0)  AS marge_brute,
  CASE
    WHEN cmd.montant_total > 0
    THEN ROUND(((cmd.montant_total - COALESCE(bp.cout_total, 0)) / cmd.montant_total) * 100, 1)
    ELSE 0
  END                                             AS marge_pct,
  CASE
    WHEN cmd.montant_total > 0
    THEN CASE
      WHEN ((cmd.montant_total - COALESCE(bp.cout_total, 0)) / cmd.montant_total) >= 0.25 THEN 'VERT'
      WHEN ((cmd.montant_total - COALESCE(bp.cout_total, 0)) / cmd.montant_total) >= 0.15 THEN 'ORANGE'
      ELSE 'ROUGE'
    END
    ELSE 'GRIS'
  END                                             AS indicateur_marge,
  -- Acomptes
  COALESCE((
    SELECT SUM(a.montant) FROM acomptes a
    WHERE a.commande_id = cmd.id
  ), 0)                                           AS montant_encaisse,
  cmd.montant_total - COALESCE((
    SELECT SUM(a.montant) FROM acomptes a
    WHERE a.commande_id = cmd.id
  ), 0)                                           AS restant_a_facturer,
  -- OF lié
  of_row.reference                                AS of_reference,
  of_row.statut                                   AS of_statut,
  cmd.created_at
FROM commandes_produits_finis cmd
JOIN clients c ON c.id = cmd.client_id
LEFT JOIN bons_production bp ON bp.produit_fini_id = cmd.produit_fini_id AND bp.statut = 'VALIDE'
LEFT JOIN ordres_fabrication of_row ON of_row.commande_id = cmd.id
WHERE cmd.statut NOT IN ('ANNULE');

-- ── VUE ALERTES PRÉDICTIVES STOCK ──────────────────────────────
-- Vitesse de consommation sur les 30 derniers jours
CREATE OR REPLACE VIEW v_alertes_predictives_stock AS
WITH conso_30j AS (
  SELECT
    bsa.produit_id,
    SUM(bsa.quantite) AS total_sorti_30j,
    SUM(bsa.quantite) / 30.0 AS vitesse_jour
  FROM bons_sortie_atelier bsa
  WHERE bsa.created_at >= CURRENT_DATE - 30
    AND bsa.statut = 'VALIDE'
  GROUP BY bsa.produit_id
),
avec_delai AS (
  SELECT
    p.id, p.reference, p.designation, p.stock_actuel, p.stock_minimum,
    p.unite,
    COALESCE(c.vitesse_jour, 0)    AS vitesse_conso_jour,
    CASE
      WHEN COALESCE(c.vitesse_jour, 0) > 0
      THEN ROUND(p.stock_actuel / c.vitesse_jour)
      ELSE NULL
    END                            AS jours_restants,
    COALESCE(fp.delai_specifique, f.delai_livraison_jours, 7) AS delai_fourn_jours,
    f.nom                          AS fournisseur_nom,
    fp.prix_achat_xaf
  FROM produits p
  LEFT JOIN conso_30j c ON c.produit_id = p.id
  LEFT JOIN fournisseurs_produits fp ON fp.produit_id = p.id AND fp.est_preferentiel = TRUE
  LEFT JOIN fournisseurs f ON f.id = fp.fournisseur_id
  WHERE p.actif = TRUE
)
SELECT *,
  CASE
    WHEN jours_restants IS NOT NULL
     AND jours_restants < delai_fourn_jours + 3 THEN 'ALERTE_ROUGE'
    WHEN stock_actuel <= stock_minimum           THEN 'ALERTE_ORANGE'
    ELSE 'OK'
  END AS niveau_alerte,
  CASE
    WHEN vitesse_conso_jour > 0
    THEN CONCAT(designation, ' épuisé dans ~', jours_restants, ' jours')
    ELSE NULL
  END AS message_alerte
FROM avec_delai
WHERE stock_actuel <= stock_minimum * 2 OR jours_restants < 15;

-- ── VUE TRÉSORERIE PRÉVISIONNELLE 30J ──────────────────────────
CREATE OR REPLACE VIEW v_tresorerie_previsionnelle AS
WITH encaissements AS (
  -- Acomptes en attente sur commandes actives
  SELECT
    COALESCE(SUM(cmd.montant_total * 0.70), 0) AS montant,  -- 70% restant estimé
    'ENCAISSEMENT_CLIENT' AS type
  FROM commandes_produits_finis cmd
  WHERE cmd.statut IN ('EN_FABRICATION','LIVRE')
    AND cmd.created_at >= NOW() - INTERVAL '60 days'
),
decaissements AS (
  SELECT
    COALESCE(SUM(ca.montant_total_xaf), 0) AS montant,
    'COMMANDE_FOURNISSEUR' AS type
  FROM commandes_achat ca
  WHERE ca.statut IN ('CONFIRME','EN_LIVRAISON')
),
paie_estimee AS (
  SELECT
    COALESCE(SUM(e.salaire_base_xaf) * 1.3, 0) AS montant,  -- +30% charges
    'PAIE_MENSUELLE' AS type
  FROM employes e
  WHERE e.statut = 'ACTIF'
)
SELECT
  (SELECT montant FROM encaissements)   AS encaissements_attendus,
  (SELECT montant FROM decaissements)   AS decaissements_fournisseurs,
  (SELECT montant FROM paie_estimee)    AS paie_estimee,
  (SELECT montant FROM decaissements) + (SELECT montant FROM paie_estimee)
                                        AS total_decaissements,
  (SELECT montant FROM encaissements) -
  ((SELECT montant FROM decaissements) + (SELECT montant FROM paie_estimee))
                                        AS solde_previsionnel_30j;

-- ── VUE PERFORMANCE ATELIER ─────────────────────────────────────
CREATE OR REPLACE VIEW v_performance_atelier AS
SELECT
  of_row.type_produit,
  COUNT(*)                              AS nb_of,
  AVG(of_row.heures_estimees)           AS heures_estimees_moy,
  AVG(EXTRACT(EPOCH FROM (of_row.date_fin_reel - of_row.date_debut_reel)) / 3600.0)
                                        AS heures_reelles_moy,
  CASE WHEN AVG(of_row.heures_estimees) > 0
    THEN ROUND(AVG(EXTRACT(EPOCH FROM (of_row.date_fin_reel - of_row.date_debut_reel)) / 3600.0)
              / AVG(of_row.heures_estimees), 2)
    ELSE NULL
  END                                   AS ratio_reel_estime,
  CASE WHEN AVG(of_row.heures_estimees) > 0
    AND AVG(EXTRACT(EPOCH FROM (of_row.date_fin_reel - of_row.date_debut_reel)) / 3600.0)
        / AVG(of_row.heures_estimees) > 1.20
    THEN 'SOUS_EVALUE'
    ELSE 'OK'
  END                                   AS alerte
FROM ordres_fabrication of_row
WHERE of_row.statut = 'TERMINE'
  AND of_row.date_fin_reel IS NOT NULL
  AND of_row.date_debut_reel IS NOT NULL
  AND of_row.date_fin_reel >= NOW() - INTERVAL '90 days'
GROUP BY of_row.type_produit;
