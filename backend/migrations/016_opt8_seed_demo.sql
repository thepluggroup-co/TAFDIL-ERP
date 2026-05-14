-- ============================================================
-- TAFDIL ERP — Migration 016
-- OPT-8 : Données de démo (seed)
-- ============================================================

-- ── FOURNISSEURS ─────────────────────────────────────────────────
INSERT INTO fournisseurs (id, code, nom, telephone, email, ville, delai_livraison_jours, actif) VALUES
  ('00000001-0000-0000-0000-000000000001','FRN-001','ACIER CAMEROUN SARL',    '+237 6 55 11 22 33','contact@aciercm.com',   'Douala', 7,  TRUE),
  ('00000001-0000-0000-0000-000000000002','FRN-002','METALLIX DISTRIBUTION',  '+237 6 77 44 55 66','metallix@mail.cm',      'Yaoundé',10, TRUE),
  ('00000001-0000-0000-0000-000000000003','FRN-003','QUINCAILLERIE CENTRALE',  '+237 6 99 00 11 22','qc@centrale.cm',        'Douala', 5,  TRUE)
ON CONFLICT (code) DO NOTHING;

-- ── CLIENTS ──────────────────────────────────────────────────────
INSERT INTO clients (id, code, nom, telephone, email, adresse, ville, pipeline_statut, score_risque) VALUES
  ('00000002-0000-0000-0000-000000000001','CLI-001','SOCIÉTÉ BUILDING PLUS',   '+237 6 70 10 20 30','info@buildingplus.cm',  'Akwa, Douala',        'GAGNE',       'A'),
  ('00000002-0000-0000-0000-000000000002','CLI-002','RÉSIDENCE LES PALMIERS',  '+237 6 80 22 33 44','palmiers@yahoo.fr',     'Bonanjo, Douala',     'NEGOCIATION', 'B'),
  ('00000002-0000-0000-0000-000000000003','CLI-003','ÉCOLE INTERNATIONALE',    '+237 6 55 60 70 80','admin@ecolinternl.cm', 'Bastos, Yaoundé',     'DEVIS_ENVOYE','A'),
  ('00000002-0000-0000-0000-000000000004','CLI-004','M. PAUL MBARGA',          '+237 6 91 44 55 66',NULL,                   'Bonapriso, Douala',   'PROSPECT',    'B'),
  ('00000002-0000-0000-0000-000000000005','CLI-005','HOTEL BEACHVIEW',         '+237 6 62 88 99 00','direction@beachview.cm','Kribi',               'GAGNE',       'C')
ON CONFLICT (code) DO NOTHING;

-- ── PRODUITS (matières premières) ────────────────────────────────
INSERT INTO produits (id, reference, designation, unite, categorie, stock_actuel, stock_minimum, prix_interne, actif) VALUES
  ('00000003-0000-0000-0000-000000000001','MP-001','Fer carré 25×25mm',       'ML',  'MATIERE_PREMIERE', 850,  200, 1200,  TRUE),
  ('00000003-0000-0000-0000-000000000002','MP-002','Fer plat 40×4mm',         'ML',  'MATIERE_PREMIERE', 620,  150, 950,   TRUE),
  ('00000003-0000-0000-0000-000000000003','MP-003','Tôle galvanisée 1.5mm',   'M2',  'MATIERE_PREMIERE', 180,  50,  4800,  TRUE),
  ('00000003-0000-0000-0000-000000000004','MP-004','Tôle noire 2mm',          'M2',  'MATIERE_PREMIERE', 95,   30,  3600,  TRUE),
  ('00000003-0000-0000-0000-000000000005','MP-005','Peinture époxy noire',    'L',   'MATIERE_PREMIERE', 42,   10,  2500,  TRUE),
  ('00000003-0000-0000-0000-000000000006','MP-006','Électrodes soudure 2.5mm','KG',  'CONSOMMABLE',       38,   10,  1800,  TRUE),
  ('00000003-0000-0000-0000-000000000007','MP-007','Disques meuleuse 125mm',  'PCS', 'CONSOMMABLE',       85,   20,  450,   TRUE),
  ('00000003-0000-0000-0000-000000000008','MP-008','Charnières portail 150mm','PCS', 'COMPOSANT',         120,  25,  1500,  TRUE),
  ('00000003-0000-0000-0000-000000000009','MP-009','Serrure portail 3 points','PCS', 'COMPOSANT',         35,   10,  12500, TRUE),
  ('00000003-0000-0000-0000-000000000010','MP-010','Peinture antirouille',    'L',   'MATIERE_PREMIERE', 28,   8,   2200,  TRUE)
ON CONFLICT (reference) DO NOTHING;

-- ── PRODUITS BOUTIQUE QUINCAILLERIE ──────────────────────────────
INSERT INTO produits (id, reference, designation, unite, categorie, stock_actuel, stock_minimum, prix_vente_ht, prix_interne, actif) VALUES
  ('00000003-0000-0000-0000-000000000011','BQ-001','Cadenas laiton 50mm',     'PCS', 'QUINCAILLERIE', 45,  10, 4500,  2800, TRUE),
  ('00000003-0000-0000-0000-000000000012','BQ-002','Charnière acier 100mm',   'PCS', 'QUINCAILLERIE', 120, 20, 1200,  700,  TRUE),
  ('00000003-0000-0000-0000-000000000013','BQ-003','Visserie acier M8×50',    'KG',  'QUINCAILLERIE', 35,  5,  3500,  2000, TRUE),
  ('00000003-0000-0000-0000-000000000014','BQ-004','Poignée porte inox',      'PCS', 'QUINCAILLERIE', 28,  5,  8500,  5200, TRUE),
  ('00000003-0000-0000-0000-000000000015','BQ-005','Joint caoutchouc 8mm/ml', 'ML',  'QUINCAILLERIE', 200, 50, 350,   200,  TRUE)
ON CONFLICT (reference) DO NOTHING;

-- ── FOURNISSEURS_PRODUITS ─────────────────────────────────────────
INSERT INTO fournisseurs_produits (fournisseur_id, produit_id, prix_achat_xaf, delai_livraison_jours, est_preferentiel)
SELECT '00000001-0000-0000-0000-000000000001', id, prix_interne * 0.7, 7, TRUE
FROM produits WHERE reference LIKE 'MP-00%'
ON CONFLICT DO NOTHING;

-- ── EMPLOYÉS ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_user1 UUID := gen_random_uuid();
  v_user2 UUID := gen_random_uuid();
  v_user3 UUID := gen_random_uuid();
  v_user4 UUID := gen_random_uuid();
  v_user5 UUID := gen_random_uuid();
BEGIN
  INSERT INTO employes (id, matricule, nom, prenom, date_naissance, telephone, poste, departement, type_contrat, statut, date_embauche, salaire_base_xaf, numero_cnps) VALUES
    (v_user1,'EMP-001','MBARGA','Jean-Baptiste', '1985-03-15','+237 6 70 11 22 33','SOUDEUR',      'ATELIER',         'CDI',   'ACTIF', '2019-01-15', 185000,'CN12345678'),
    (v_user2,'EMP-002','NKOMO', 'Clémentine',   '1990-07-22','+237 6 81 44 55 66','SECRETAIRE',   'ADMINISTRATION',  'CDI',   'ACTIF', '2020-03-01', 220000,'CN23456789'),
    (v_user3,'EMP-003','FOUDA', 'André',         '1988-11-05','+237 6 92 77 88 99','TECHNICIEN_QC','QUALITE',         'CDI',   'ACTIF', '2021-06-01', 175000,'CN34567890'),
    (v_user4,'EMP-004','BELLA', 'Sandrine',      '1995-04-18','+237 6 63 00 11 22','VENDEUR',      'COMMERCIAL',      'CDD',   'ACTIF', '2023-01-02', 155000, NULL),
    (v_user5,'EMP-005','ONDO',  'Patrick',       '1982-09-30','+237 6 54 33 44 55','CHEF_ATELIER', 'ATELIER',         'CDI',   'ACTIF', '2018-05-10', 310000,'CN45678901')
  ON CONFLICT (matricule) DO NOTHING;

  -- Soldes congés
  INSERT INTO soldes_conges (employe_id, annee, jours_acquis, jours_pris)
  SELECT id, 2026, 18, 3 FROM employes WHERE matricule IN ('EMP-001','EMP-002','EMP-003','EMP-005')
  ON CONFLICT DO NOTHING;
  INSERT INTO soldes_conges (employe_id, annee, jours_acquis, jours_pris)
  SELECT id, 2026, 9, 0 FROM employes WHERE matricule = 'EMP-004'
  ON CONFLICT DO NOTHING;
END $$;

-- ── DEVIS ────────────────────────────────────────────────────────
INSERT INTO devis (reference, client_id, type_produit, largeur_m, hauteur_m, quantite, montant_ht, tva, montant_ttc, statut, source)
SELECT
  'DEV-2026-001',
  '00000002-0000-0000-0000-000000000001',
  'PORTAIL_COULISSANT', 4.0, 2.0, 1,
  630000, 121275, 751275,
  'ACCEPTE', 'MANUEL'
WHERE NOT EXISTS (SELECT 1 FROM devis WHERE reference = 'DEV-2026-001');

INSERT INTO devis (reference, client_id, type_produit, largeur_m, hauteur_m, quantite, montant_ht, tva, montant_ttc, statut, source)
SELECT
  'DEV-2026-002',
  '00000002-0000-0000-0000-000000000003',
  'GRILLE_FENETRE', 1.2, 0.8, 12,
  504000, 97020, 601020,
  'ENVOYE', 'MANUEL'
WHERE NOT EXISTS (SELECT 1 FROM devis WHERE reference = 'DEV-2026-002');

INSERT INTO devis (reference, client_id, type_produit, largeur_m, hauteur_m, quantite, montant_ht, tva, montant_ttc, statut, source)
SELECT
  'DEV-2026-003',
  '00000002-0000-0000-0000-000000000002',
  'PORTAIL_BATTANT', 3.0, 2.0, 1,
  485000, 93363, 578363,
  'EN_ATTENTE', 'AUTO'
WHERE NOT EXISTS (SELECT 1 FROM devis WHERE reference = 'DEV-2026-003');

-- ── COMMANDES PRODUITS FINIS ──────────────────────────────────────
INSERT INTO commandes_produits_finis (id, numero, client_id, type_produit, largeur_m, hauteur_m, quantite, description, montant_total, statut, delai_livraison)
VALUES
  ('00000004-0000-0000-0000-000000000001','CMD-2026-001','00000002-0000-0000-0000-000000000001','PORTAIL_COULISSANT',4.0,2.0,1,'Portail coulissant acier noir mat finition époxy', 751275,'EN_FABRICATION', NOW() + INTERVAL '14 days'),
  ('00000004-0000-0000-0000-000000000002','CMD-2026-002','00000002-0000-0000-0000-000000000005','PORTAIL_BATTANT',   3.0,2.2,2,'2x Portails battants galvanisés — Hôtel Beachview', 1156726,'EN_ATTENTE_MATIERE', NOW() + INTERVAL '21 days'),
  ('00000004-0000-0000-0000-000000000003','CMD-2026-003','00000002-0000-0000-0000-000000000001','PORTE_GARAGE',      3.5,2.5,1,'Porte de garage sectionnelle acier galvanisé', 895000,'LIVRE', NOW() - INTERVAL '5 days')
ON CONFLICT (numero) DO NOTHING;

-- ── ACOMPTES ────────────────────────────────────────────────────
INSERT INTO acomptes (commande_id, montant_xaf, pourcentage, mode_paiement, statut, date_paiement, reference_paiement)
VALUES
  ('00000004-0000-0000-0000-000000000001', 375638, 50, 'VIREMENT', 'VALIDE', NOW() - INTERVAL '10 days', 'VIR-2026-0042'),
  ('00000004-0000-0000-0000-000000000002', 578363, 50, 'CHEQUE',   'VALIDE', NOW() - INTERVAL '3 days',  'CHQ-0078'),
  ('00000004-0000-0000-0000-000000000003', 895000, 100,'VIREMENT', 'VALIDE', NOW() - INTERVAL '6 days',  'VIR-2026-0051')
ON CONFLICT DO NOTHING;

-- ── ORDRES DE FABRICATION ────────────────────────────────────────
INSERT INTO ordres_fabrication (id, reference, commande_id, type_produit, quantite, statut, priorite, heures_estimees, date_debut_prevue, date_fin_prevue)
VALUES
  ('00000005-0000-0000-0000-000000000001','OF-2026-001','00000004-0000-0000-0000-000000000001','PORTAIL_COULISSANT',1,'EN_COURS',  'HAUTE', 24, NOW() - INTERVAL '2 days', NOW() + INTERVAL '5 days'),
  ('00000005-0000-0000-0000-000000000002','OF-2026-002','00000004-0000-0000-0000-000000000002','PORTAIL_BATTANT',   2,'PLANIFIE',  'NORMALE',32, NOW() + INTERVAL '3 days', NOW() + INTERVAL '12 days'),
  ('00000005-0000-0000-0000-000000000003','OF-2026-003','00000004-0000-0000-0000-000000000003','PORTE_GARAGE',      1,'TERMINE',   'NORMALE',18, NOW() - INTERVAL '12 days',NOW() - INTERVAL '6 days')
ON CONFLICT (reference) DO NOTHING;

UPDATE ordres_fabrication
SET date_debut_reel = NOW() - INTERVAL '12 days',
    date_fin_reel   = NOW() - INTERVAL '6 days'
WHERE reference = 'OF-2026-003';

-- ── VENTES COMPTOIR (boutique) ────────────────────────────────────
INSERT INTO ventes_comptoir (reference, montant_ht, tva, montant_ttc, mode_paiement, statut)
SELECT 'VC-' || LPAD(gs::TEXT, 4, '0'),
  ROUND((50000 + random() * 200000)::numeric, 0),
  0,0,'CASH','VALIDE'
FROM generate_series(1, 20) gs
WHERE NOT EXISTS (SELECT 1 FROM ventes_comptoir WHERE reference = 'VC-' || LPAD(gs::TEXT, 4, '0'));

UPDATE ventes_comptoir SET
  tva         = ROUND(montant_ht * 0.1925, 0),
  montant_ttc = montant_ht + ROUND(montant_ht * 0.1925, 0)
WHERE montant_ttc = 0;

-- ── POINTAGES (30 derniers jours) ────────────────────────────────
INSERT INTO pointages (employe_id, date, heure_arrivee, heure_depart, statut)
SELECT
  e.id,
  CURRENT_DATE - (gs * INTERVAL '1 day'),
  '07:30:00'::TIME + (INTERVAL '1 minute' * FLOOR(random() * 30)),
  '16:30:00'::TIME + (INTERVAL '1 minute' * FLOOR(random() * 60)),
  'PRESENT'
FROM employes e, generate_series(1, 25) gs
WHERE e.matricule IN ('EMP-001','EMP-002','EMP-003','EMP-005')
  AND EXTRACT(DOW FROM CURRENT_DATE - (gs * INTERVAL '1 day')) NOT IN (0, 6)
ON CONFLICT (employe_id, date) DO NOTHING;

-- ── NOTES CRM ────────────────────────────────────────────────────
INSERT INTO notes_crm (client_id, type, contenu, date_prochaine_action)
VALUES
  ('00000002-0000-0000-0000-000000000001','REUNION',    'RDV chantier validé. Client satisfait de la qualité. Demande devis extension grillage.', NOW() + INTERVAL '7 days'),
  ('00000002-0000-0000-0000-000000000002','RELANCE',    'Relance devis portail battant. Client en attente accord syndic copropriété.',             NOW() + INTERVAL '3 days'),
  ('00000002-0000-0000-0000-000000000005','LITIGE',     'Retard de paiement 2ème acompte. Contact DG demandé.', NOW() + INTERVAL '1 day'),
  ('00000002-0000-0000-0000-000000000003','APPEL',      'Demande accélération délai. Expliqué contrainte approvisionnement.',                      NULL)
ON CONFLICT DO NOTHING;

-- ── BULLETINS PAIE — Avril 2026 ─────────────────────────────────
-- Note : les vrais bulletins sont générés par le service Node.js
-- Ici on insère des données représentatives pour la démo
INSERT INTO bulletins_paie (employe_id, annee, mois, salaire_base, nb_jours_travailles, heures_sup, primes_total, brut_imposable, base_cnps, cnps_salarial, irpp_mensuel, cac_mensuel, avances_deduites, net_a_payer, statut)
SELECT
  id,
  2026, 4,
  salaire_base_xaf,
  22,
  CASE WHEN matricule = 'EMP-001' THEN 8 ELSE 0 END,
  CASE WHEN matricule = 'EMP-005' THEN 25000 ELSE 0 END,
  salaire_base_xaf + CASE WHEN matricule = 'EMP-001' THEN ROUND(salaire_base_xaf/173.33*8*1.25,0) ELSE 0 END + CASE WHEN matricule = 'EMP-005' THEN 25000 ELSE 0 END,
  LEAST(salaire_base_xaf, 750000),
  ROUND(LEAST(salaire_base_xaf, 750000) * 0.028, 0),
  -- IRPP simplifié pour seed
  ROUND((salaire_base_xaf * 0.70 * 0.12) / 12, 0),
  ROUND((salaire_base_xaf * 0.70 * 0.12) / 12 * 0.10, 0),
  0,
  salaire_base_xaf - ROUND(LEAST(salaire_base_xaf, 750000) * 0.028, 0) - ROUND((salaire_base_xaf * 0.70 * 0.12) / 12, 0) - ROUND((salaire_base_xaf * 0.70 * 0.12) / 12 * 0.10, 0),
  'VALIDE'
FROM employes
WHERE statut = 'ACTIF'
ON CONFLICT (employe_id, annee, mois) DO NOTHING;

-- ── PARAMÈTRES SYSTÈME WhatsApp (placeholder démo) ───────────────
INSERT INTO parametres_systeme (cle, valeur, label) VALUES
  ('whatsapp_provider', 'twilio',              'Provider WhatsApp Business'),
  ('whatsapp_api_url',  '',                    'URL API WhatsApp (Twilio)'),
  ('whatsapp_api_token','',                    'Token API WhatsApp')
ON CONFLICT (cle) DO NOTHING;

-- ── STOCKS EMPLACEMENTS (distribution initiale) ──────────────────
INSERT INTO stocks_emplacements (produit_id, emplacement_id, quantite)
SELECT p.id, e.id,
  CASE e.code
    WHEN 'AT01' THEN p.stock_actuel * 0.60
    WHEN 'AT02' THEN p.stock_actuel * 0.25
    WHEN 'REC01'THEN p.stock_actuel * 0.15
    ELSE 0
  END
FROM produits p, emplacements e
WHERE p.reference LIKE 'MP-%'
  AND e.code IN ('AT01','AT02','REC01')
  AND p.stock_actuel > 0
ON CONFLICT (produit_id, emplacement_id) DO NOTHING;

INSERT INTO stocks_emplacements (produit_id, emplacement_id, quantite)
SELECT p.id, e.id, p.stock_actuel
FROM produits p, emplacements e
WHERE p.reference LIKE 'BQ-%'
  AND e.code = 'BQ01'
  AND p.stock_actuel > 0
ON CONFLICT (produit_id, emplacement_id) DO NOTHING;
