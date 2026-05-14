-- ============================================================
-- TAFDIL ERP — Migration 016
-- OPT-8 : Données de démo (seed)
-- ============================================================

-- ── FOURNISSEURS ─────────────────────────────────────────────────
INSERT INTO fournisseurs (id, nom, contact_telephone, contact_email, ville, delai_livraison_jours, actif) VALUES
  ('00000001-0000-0000-0000-000000000001','ACIER CAMEROUN SARL',   '+237 6 55 11 22 33','contact@aciercm.com', 'Douala', 7,  TRUE),
  ('00000001-0000-0000-0000-000000000002','METALLIX DISTRIBUTION', '+237 6 77 44 55 66','metallix@mail.cm',    'Yaoundé',10, TRUE),
  ('00000001-0000-0000-0000-000000000003','QUINCAILLERIE CENTRALE','+237 6 99 00 11 22','qc@centrale.cm',      'Douala', 5,  TRUE)
ON CONFLICT (nom) DO NOTHING;

-- ── CLIENTS ──────────────────────────────────────────────────────
INSERT INTO clients (id, nom, telephone, email, pipeline_statut, score_risque) VALUES
  ('00000002-0000-0000-0000-000000000001','SOCIÉTÉ BUILDING PLUS',  '+237 6 70 10 20 30','info@buildingplus.cm',  'GAGNE',       'A'),
  ('00000002-0000-0000-0000-000000000002','RÉSIDENCE LES PALMIERS', '+237 6 80 22 33 44','palmiers@yahoo.fr',     'NEGOCIATION', 'B'),
  ('00000002-0000-0000-0000-000000000003','ÉCOLE INTERNATIONALE',   '+237 6 55 60 70 80','admin@ecolinternl.cm', 'DEVIS_ENVOYE','A'),
  ('00000002-0000-0000-0000-000000000004','M. PAUL MBARGA',         '+237 6 91 44 55 66', NULL,                   'PROSPECT',    'B'),
  ('00000002-0000-0000-0000-000000000005','HOTEL BEACHVIEW',        '+237 6 62 88 99 00','direction@beachview.cm','GAGNE',       'C')
ON CONFLICT (id) DO NOTHING;

-- ── PRODUITS (matières premières) ────────────────────────────────
-- prix_public = prix_interne pour satisfaire la contrainte CHECK (prix_interne <= prix_public)
INSERT INTO produits (id, reference, designation, unite, categorie, stock_actuel, stock_minimum, prix_public, prix_interne, actif) VALUES
  ('00000003-0000-0000-0000-000000000001','MP-001','Fer carré 25×25mm',       'ML',  'MATIERE_PREMIERE', 850, 200, 1200,  1200,  TRUE),
  ('00000003-0000-0000-0000-000000000002','MP-002','Fer plat 40×4mm',         'ML',  'MATIERE_PREMIERE', 620, 150, 950,   950,   TRUE),
  ('00000003-0000-0000-0000-000000000003','MP-003','Tôle galvanisée 1.5mm',   'M2',  'MATIERE_PREMIERE', 180, 50,  4800,  4800,  TRUE),
  ('00000003-0000-0000-0000-000000000004','MP-004','Tôle noire 2mm',          'M2',  'MATIERE_PREMIERE', 95,  30,  3600,  3600,  TRUE),
  ('00000003-0000-0000-0000-000000000005','MP-005','Peinture époxy noire',    'L',   'MATIERE_PREMIERE', 42,  10,  2500,  2500,  TRUE),
  ('00000003-0000-0000-0000-000000000006','MP-006','Électrodes soudure 2.5mm','KG',  'MATIERE_PREMIERE', 38,  10,  1800,  1800,  TRUE),
  ('00000003-0000-0000-0000-000000000007','MP-007','Disques meuleuse 125mm',  'PCS', 'QUINCAILLERIE',    85,  20,  450,   450,   TRUE),
  ('00000003-0000-0000-0000-000000000008','MP-008','Charnières portail 150mm','PCS', 'QUINCAILLERIE',    120, 25,  1500,  1500,  TRUE),
  ('00000003-0000-0000-0000-000000000009','MP-009','Serrure portail 3 points','PCS', 'QUINCAILLERIE',    35,  10,  12500, 12500, TRUE),
  ('00000003-0000-0000-0000-000000000010','MP-010','Peinture antirouille',    'L',   'MATIERE_PREMIERE', 28,  8,   2200,  2200,  TRUE)
ON CONFLICT (reference) DO NOTHING;

-- ── PRODUITS BOUTIQUE QUINCAILLERIE ──────────────────────────────
INSERT INTO produits (id, reference, designation, unite, categorie, stock_actuel, stock_minimum, prix_public, prix_interne, actif) VALUES
  ('00000003-0000-0000-0000-000000000011','BQ-001','Cadenas laiton 50mm',    'PCS', 'QUINCAILLERIE', 45,  10, 4500,  2800, TRUE),
  ('00000003-0000-0000-0000-000000000012','BQ-002','Charnière acier 100mm',  'PCS', 'QUINCAILLERIE', 120, 20, 1200,  700,  TRUE),
  ('00000003-0000-0000-0000-000000000013','BQ-003','Visserie acier M8×50',   'KG',  'QUINCAILLERIE', 35,  5,  3500,  2000, TRUE),
  ('00000003-0000-0000-0000-000000000014','BQ-004','Poignée porte inox',     'PCS', 'QUINCAILLERIE', 28,  5,  8500,  5200, TRUE),
  ('00000003-0000-0000-0000-000000000015','BQ-005','Joint caoutchouc 8mm/ml','ML',  'QUINCAILLERIE', 200, 50, 350,   200,  TRUE)
ON CONFLICT (reference) DO NOTHING;

-- ── FOURNISSEURS_PRODUITS ─────────────────────────────────────────
INSERT INTO fournisseurs_produits (fournisseur_id, produit_id, prix_achat_xaf, delai_specifique, est_preferentiel)
SELECT '00000001-0000-0000-0000-000000000001', id, prix_interne * 0.7, 7, TRUE
FROM produits WHERE reference LIKE 'MP-%'
ON CONFLICT DO NOTHING;

-- ── EMPLOYÉS ─────────────────────────────────────────────────────
-- Enums poste_employe: DIRECTEUR,SECRETAIRE,VENDEUR,TECHNICIEN,MAGASINIER,CHAUFFEUR,AUTRE
-- Enums departement_employe: DIRECTION,ADMINISTRATION,BOUTIQUE,ATELIER,LOGISTIQUE
INSERT INTO employes (id, matricule, nom, prenom, date_naissance, telephone, poste, departement, type_contrat, statut, date_embauche, salaire_base_xaf, date_fin_contrat, cnps_numero_affiliation) VALUES
  ('00000006-0000-0000-0000-000000000001','EMP-001','MBARGA','Jean-Baptiste','1985-03-15','+237 6 70 11 22 33','TECHNICIEN','ATELIER',        'CDI',  'ACTIF','2019-01-15',185000,NULL,          'CN12345678'),
  ('00000006-0000-0000-0000-000000000002','EMP-002','NKOMO', 'Clémentine',  '1990-07-22','+237 6 81 44 55 66','SECRETAIRE','ADMINISTRATION', 'CDI',  'ACTIF','2020-03-01',220000,NULL,          'CN23456789'),
  ('00000006-0000-0000-0000-000000000003','EMP-003','FOUDA', 'André',        '1988-11-05','+237 6 92 77 88 99','TECHNICIEN','ATELIER',        'CDI',  'ACTIF','2021-06-01',175000,NULL,          'CN34567890'),
  ('00000006-0000-0000-0000-000000000004','EMP-004','BELLA', 'Sandrine',     '1995-04-18','+237 6 63 00 11 22','VENDEUR',   'BOUTIQUE',       'CDD',  'ACTIF','2023-01-02',155000,'2026-12-31', NULL),
  ('00000006-0000-0000-0000-000000000005','EMP-005','ONDO',  'Patrick',      '1982-09-30','+237 6 54 33 44 55','TECHNICIEN','ATELIER',        'CDI',  'ACTIF','2018-05-10',310000,NULL,          'CN45678901')
ON CONFLICT (matricule) DO NOTHING;

-- Soldes congés (un seul enregistrement par employé — UNIQUE employe_id)
INSERT INTO soldes_conges (employe_id, annee, jours_acquis, jours_pris)
SELECT id, 2026, 18, 3 FROM employes WHERE matricule IN ('EMP-001','EMP-002','EMP-003','EMP-005')
ON CONFLICT (employe_id) DO NOTHING;

INSERT INTO soldes_conges (employe_id, annee, jours_acquis, jours_pris)
SELECT id, 2026, 9, 0 FROM employes WHERE matricule = 'EMP-004'
ON CONFLICT (employe_id) DO NOTHING;

-- ── DEVIS ────────────────────────────────────────────────────────
-- Enums statut_devis: BROUILLON,ENVOYE,ACCEPTE,REFUSE,EXPIRE
-- Enums type_produit_fini: PORTAIL,PORTE,BALCON,GARDE_CORPS,CLAUSTRA,AUTRE
INSERT INTO devis (numero, client_id, type_produit, montant_ht, montant_tva, montant_total, statut)
SELECT 'DV-2026-001','00000002-0000-0000-0000-000000000001','PORTAIL',630000,121275,751275,'ACCEPTE'
WHERE NOT EXISTS (SELECT 1 FROM devis WHERE numero = 'DV-2026-001');

INSERT INTO devis (numero, client_id, type_produit, montant_ht, montant_tva, montant_total, statut)
SELECT 'DV-2026-002','00000002-0000-0000-0000-000000000003','AUTRE',  504000,97020, 601020,'ENVOYE'
WHERE NOT EXISTS (SELECT 1 FROM devis WHERE numero = 'DV-2026-002');

INSERT INTO devis (numero, client_id, type_produit, montant_ht, montant_tva, montant_total, statut)
SELECT 'DV-2026-003','00000002-0000-0000-0000-000000000002','PORTAIL',485000,93363, 578363,'BROUILLON'
WHERE NOT EXISTS (SELECT 1 FROM devis WHERE numero = 'DV-2026-003');

-- ── COMMANDES PRODUITS FINIS ──────────────────────────────────────
-- Enums statut_commande_pf: EN_ATTENTE_ACOMPTE,EN_FABRICATION,PRET,LIVRE,ANNULE
INSERT INTO commandes_produits_finis (id, numero, client_id, montant_total, statut, date_livraison_prevue, notes)
VALUES
  ('00000004-0000-0000-0000-000000000001','CMD-2026-001','00000002-0000-0000-0000-000000000001', 751275,'EN_FABRICATION',  (NOW() + INTERVAL '14 days')::DATE,'Portail coulissant acier noir mat finition époxy'),
  ('00000004-0000-0000-0000-000000000002','CMD-2026-002','00000002-0000-0000-0000-000000000005',1156726,'EN_ATTENTE_ACOMPTE',(NOW() + INTERVAL '21 days')::DATE,'2x Portails battants galvanisés — Hôtel Beachview'),
  ('00000004-0000-0000-0000-000000000003','CMD-2026-003','00000002-0000-0000-0000-000000000001', 895000,'LIVRE',           (NOW() - INTERVAL '5 days')::DATE, 'Porte de garage sectionnelle acier galvanisé')
ON CONFLICT (numero) DO NOTHING;

-- ── ACOMPTES ─────────────────────────────────────────────────────
-- Table: commande_id, montant, mode_paiement, date_paiement, reference_paiement
INSERT INTO acomptes (commande_id, montant, mode_paiement, date_paiement, reference_paiement)
SELECT '00000004-0000-0000-0000-000000000001',375638,'VIREMENT',NOW() - INTERVAL '10 days','VIR-2026-0042'
WHERE NOT EXISTS (SELECT 1 FROM acomptes WHERE commande_id = '00000004-0000-0000-0000-000000000001');

INSERT INTO acomptes (commande_id, montant, mode_paiement, date_paiement, reference_paiement)
SELECT '00000004-0000-0000-0000-000000000002',578363,'VIREMENT',NOW() - INTERVAL '3 days', 'CHQ-0078'
WHERE NOT EXISTS (SELECT 1 FROM acomptes WHERE commande_id = '00000004-0000-0000-0000-000000000002');

INSERT INTO acomptes (commande_id, montant, mode_paiement, date_paiement, reference_paiement)
SELECT '00000004-0000-0000-0000-000000000003',895000,'VIREMENT',NOW() - INTERVAL '6 days', 'VIR-2026-0051'
WHERE NOT EXISTS (SELECT 1 FROM acomptes WHERE commande_id = '00000004-0000-0000-0000-000000000003');

-- ── ORDRES DE FABRICATION ────────────────────────────────────────
-- priorite: INT (1=haute, 2=normale, 3=basse)
-- dimensions: JSONB NOT NULL
-- Enums statut_of: PLANIFIE,EN_ATTENTE_MATIERE,EN_COURS,SUSPENDU,TERMINE,ANNULE
-- Enums type_produit_fini: PORTAIL,PORTE,BALCON,GARDE_CORPS,CLAUSTRA,AUTRE
INSERT INTO ordres_fabrication (id, reference, commande_id, type_produit, dimensions, statut, priorite, heures_estimees, date_planifiee_debut, date_planifiee_fin)
VALUES
  ('00000005-0000-0000-0000-000000000001','OF-2026-001','00000004-0000-0000-0000-000000000001','PORTAIL','{"largeur_m":4.0,"hauteur_m":2.0,"quantite":1}', 'EN_COURS',1,24,(NOW() - INTERVAL '2 days')::DATE, (NOW() + INTERVAL '5 days')::DATE),
  ('00000005-0000-0000-0000-000000000002','OF-2026-002','00000004-0000-0000-0000-000000000002','PORTAIL','{"largeur_m":3.0,"hauteur_m":2.2,"quantite":2}', 'PLANIFIE', 2,32,(NOW() + INTERVAL '3 days')::DATE, (NOW() + INTERVAL '12 days')::DATE),
  ('00000005-0000-0000-0000-000000000003','OF-2026-003','00000004-0000-0000-0000-000000000003','PORTE',  '{"largeur_m":3.5,"hauteur_m":2.5,"quantite":1}', 'TERMINE', 2,18,(NOW() - INTERVAL '12 days')::DATE,(NOW() - INTERVAL '6 days')::DATE)
ON CONFLICT (reference) DO NOTHING;

UPDATE ordres_fabrication
SET date_debut_reel = NOW() - INTERVAL '12 days',
    date_fin_reel   = NOW() - INTERVAL '6 days'
WHERE reference = 'OF-2026-003';

-- ── POINTAGES (30 derniers jours) ────────────────────────────────
-- heure_arrivee / heure_depart sont TIMESTAMPTZ (pas TIME)
INSERT INTO pointages (employe_id, date, heure_arrivee, heure_depart)
SELECT
  e.id,
  (CURRENT_DATE - (gs * INTERVAL '1 day'))::DATE,
  (CURRENT_DATE - (gs * INTERVAL '1 day'))::TIMESTAMPTZ + INTERVAL '7 hours 30 minutes'
    + (INTERVAL '1 minute' * FLOOR(random() * 30)),
  (CURRENT_DATE - (gs * INTERVAL '1 day'))::TIMESTAMPTZ + INTERVAL '16 hours 30 minutes'
    + (INTERVAL '1 minute' * FLOOR(random() * 60))
FROM employes e, generate_series(1, 25) gs
WHERE e.matricule IN ('EMP-001','EMP-002','EMP-003','EMP-005')
  AND EXTRACT(DOW FROM CURRENT_DATE - (gs * INTERVAL '1 day')) NOT IN (0, 6)
ON CONFLICT (employe_id, date) DO NOTHING;

-- ── BULLETINS PAIE — Avril 2026 ─────────────────────────────────
-- Colonnes correctes: salaire_brut (NOT NULL), salaire_net (NOT NULL), cnps_vieillesse_sal
INSERT INTO bulletins_paie (employe_id, annee, mois, salaire_base, heures_sup, primes_total, salaire_brut, base_cnps, cnps_vieillesse_sal, irpp_mensuel, cac_mensuel, avances_deduites, salaire_net, statut)
SELECT
  id,
  2026, 4,
  salaire_base_xaf,
  CASE WHEN matricule = 'EMP-001' THEN 8 ELSE 0 END,
  CASE WHEN matricule = 'EMP-005' THEN 25000 ELSE 0 END,
  salaire_base_xaf
    + CASE WHEN matricule = 'EMP-001' THEN ROUND(salaire_base_xaf / 173.33 * 8 * 1.25, 0) ELSE 0 END
    + CASE WHEN matricule = 'EMP-005' THEN 25000 ELSE 0 END,
  LEAST(salaire_base_xaf, 750000),
  ROUND(LEAST(salaire_base_xaf, 750000) * 0.028, 0),
  ROUND((salaire_base_xaf * 0.70 * 0.12) / 12, 0),
  ROUND((salaire_base_xaf * 0.70 * 0.12) / 12 * 0.10, 0),
  0,
  salaire_base_xaf
    - ROUND(LEAST(salaire_base_xaf, 750000) * 0.028, 0)
    - ROUND((salaire_base_xaf * 0.70 * 0.12) / 12, 0)
    - ROUND((salaire_base_xaf * 0.70 * 0.12) / 12 * 0.10, 0),
  'VALIDE'
FROM employes
WHERE statut = 'ACTIF'
ON CONFLICT (employe_id, annee, mois) DO NOTHING;

-- ── PARAMÈTRES SYSTÈME WhatsApp (placeholder démo) ───────────────
INSERT INTO parametres_systeme (cle, valeur, label) VALUES
  ('whatsapp_provider', 'twilio','Provider WhatsApp Business'),
  ('whatsapp_api_url',  '',      'URL API WhatsApp (Twilio)'),
  ('whatsapp_api_token','',      'Token API WhatsApp')
ON CONFLICT (cle) DO NOTHING;

-- ── STOCKS EMPLACEMENTS (distribution initiale) ──────────────────
INSERT INTO stocks_emplacements (produit_id, emplacement_id, quantite)
SELECT p.id, e.id,
  CASE e.code
    WHEN 'AT01'  THEN p.stock_actuel * 0.60
    WHEN 'AT02'  THEN p.stock_actuel * 0.25
    WHEN 'REC01' THEN p.stock_actuel * 0.15
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
