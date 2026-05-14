-- ============================================================
-- TAFDIL ERP — Migration 002 : RPC atomique décrémentation stock
-- ============================================================

CREATE OR REPLACE FUNCTION decrementer_stock_produit(
  p_produit_id UUID,
  p_quantite   NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock_actuel NUMERIC;
BEGIN
  -- Verrou ligne pour éviter les race conditions
  SELECT stock_actuel INTO v_stock_actuel
  FROM produits
  WHERE id = p_produit_id
  FOR UPDATE;

  IF v_stock_actuel IS NULL THEN
    RAISE EXCEPTION 'Produit introuvable : %', p_produit_id;
  END IF;

  IF v_stock_actuel < p_quantite THEN
    RAISE EXCEPTION 'Stock insuffisant pour le produit % (disponible: %, demandé: %)',
      p_produit_id, v_stock_actuel, p_quantite;
  END IF;

  UPDATE produits
  SET stock_actuel = stock_actuel - p_quantite,
      updated_at   = NOW()
  WHERE id = p_produit_id;
END;
$$;

-- RPC pour récupérer le prochain numéro de vente
-- (complément à next_numero_vente déjà créé dans migration 001)
CREATE OR REPLACE FUNCTION next_numero_vente()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN 'VC-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
         LPAD(nextval('seq_vente_comptoir')::TEXT, 5, '0');
END;
$$;

-- ============================================================
-- Vue enrichie pour le dashboard du jour
-- ============================================================
CREATE OR REPLACE VIEW v_stats_ventes_jour AS
SELECT
  DATE(date_vente AT TIME ZONE 'Africa/Douala') AS jour,
  client_type,
  mode_paiement,
  statut_paiement,
  COUNT(*)                        AS nb_ventes,
  SUM(montant_ht)                 AS total_ht,
  SUM(montant_tva)                AS total_tva,
  SUM(montant_total)              AS total_ttc,
  AVG(montant_total)              AS panier_moyen
FROM ventes_comptoir
WHERE statut_paiement <> 'ANNULE'
GROUP BY 1, 2, 3, 4;
