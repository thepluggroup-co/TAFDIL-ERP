# TAFDIL ERP — Guide de Démonstration

> **Environnement** : Supabase (PostgreSQL 15) + Node.js 20 + React 18 + Expo 50  
> **Société** : TAFDIL SARL — Fabrication métallique, Douala, Cameroun

---

## Démarrage rapide

```bash
# 1. Base de données — exécuter les migrations dans l'ordre
# Via Supabase Studio SQL Editor ou psql :
# migrations/001_... → 016_opt8_seed_demo.sql

# 2. Backend
cd backend
cp .env.example .env       # renseigner SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev                # http://localhost:3001

# 3. Frontend
cd frontend
npm install
npm run dev                # http://localhost:5173

# 4. Mobile (optionnel)
cd mobile
npm install
npx expo start
```

---

## Données de démo (migration 016)

| Entité | Quantité |
|--------|----------|
| Fournisseurs | 3 |
| Clients | 5 (pipelines : PROSPECT → GAGNE) |
| Produits matières premières | 10 |
| Produits boutique quincaillerie | 5 |
| Employés | 5 (CDI + 1 CDD) |
| Devis | 3 (ACCEPTÉ / ENVOYÉ / EN_ATTENTE) |
| Commandes produits finis | 3 |
| Ordres de fabrication | 3 (PLANIFIÉ → TERMINÉ) |
| Ventes comptoir | 20 |
| Pointages | ~100 (25 jours × 4 employés) |
| Bulletins de paie | 5 (Avril 2026, validés) |
| Notes CRM | 4 |
| Stocks emplacements | Distribution AT01 / AT02 / REC01 / BQ01 |

---

## Parcours de démonstration

### Scénario 1 — Nouveau client → Livraison (10 min)

1. **Pipeline CRM** (`/crm/pipeline`) — Observer les 5 clients répartis en Kanban
2. Glisser le client *RÉSIDENCE LES PALMIERS* de `NÉGOCIATION` → `GAGNÉ`
3. **Estimateur devis** (`/devis/estimateur`) — Créer un devis : PORTAIL_COULISSANT, 3×2m, quantité 1
4. Observer le calcul automatique HT/TVA/TTC et les matériaux nécessaires
5. **Commandes** (`/produits-finis/commandes`) — La commande apparaît avec statut EN_ATTENTE
6. **Planning atelier** (`/mrp/planning`) — Créer l'OF, cliquer "Exploser BOM" → voir les besoins matières
7. Changer le statut OF : PLANIFIÉ → EN_COURS → TERMINÉ
8. **Contrôle qualité** (`/qualite`) — Créer une fiche QC sur l'OF terminé

### Scénario 2 — Paie du mois (5 min)

1. **Employés RH** (`/rh/employes`) — Voir les 5 employés, alertes CDD/congés
2. **Journal de paie** (`/paie/journal`) — Sélectionner Avril 2026
3. Cliquer "Simuler →" sur Jean-Baptiste MBARGA → voir le bulletin détaillé
4. Cliquer "Générer le journal" puis "Valider" (rôle DG requis)
5. Télécharger le bulletin PDF

### Scénario 3 — Tableau de bord DG (3 min)

1. **Dashboard DG** (`/kpis/dashboard`)
2. Observer : CA du mois, commandes en cours, clients à risque C/D
3. Graphique marge chantiers (VERT ≥25% / ORANGE 15-25% / ROUGE <15%)
4. Alertes stock prédictives (produits épuisés dans < délai fournisseur)
5. Trésorerie prévisionnelle 30 jours

### Scénario 4 — Comptabilité SYSCOHADA (5 min)

1. **Comptabilité** (`/compta/balance`)
2. Onglet "Balance" → explorer par classe OHADA
3. Onglet "Grand livre" → filtrer journal VENTES ou PAIE
4. Onglet "États financiers" → compte de résultat + bilan simplifié
5. Bouton "Sage CSV" → télécharger l'export

### Scénario 5 — Relances impayés WhatsApp

```bash
# Déclencher manuellement (en tant que DG) :
curl -X POST http://localhost:3001/api/crm/relances/auto \
  -H "Authorization: Bearer <token_DG>"

# Réponse : {"envoyes": N, "relances": [...]}
# Messages loggés dans messages_whatsapp avec statut ENVOYE/ECHEC
```

---

## Rôles et accès

| Rôle | Accès |
|------|-------|
| `DG` | Tout (audit log, validation paie, états financiers, relances WA) |
| `SECRETAIRE` | Devis, clients, commandes, paie (lecture), comptabilité |
| `VENDEUR` | Vente comptoir, catalogue, fidélité, clients (lecture) |
| `TECHNICIEN` | Bons sortie, production, pointage, qualité |
| `MAGASINIER` | Stock, réceptions, inventaire |
| `CHEF_ATELIER` | OF, planning, QC, maintenance, équipe |

> Les rôles sont vérifiés via middleware `requireRole(...)` sur chaque route sensible.

---

## Architecture

```
TAFDIL-ERP/
├── backend/
│   ├── migrations/          # 001 → 016 — schéma PostgreSQL complet
│   ├── src/
│   │   ├── config/          # supabase.js (service role)
│   │   ├── middleware/       # auth.js (requireAuth, requireRole)
│   │   ├── services/         # logique métier (14 services)
│   │   └── routes/           # API REST (14 fichiers)
│   └── index.js             # Express app, /api/*
├── frontend/
│   ├── src/
│   │   ├── pages/            # 14 pages React
│   │   └── components/       # Sidebar, TopBar, UI
│   └── vite.config.js
├── mobile/
│   └── src/screens/         # Expo screens (technicien, DG, commun)
└── docs/
    └── README_DEMO.md       # Ce fichier
```

---

## Variables d'environnement

### Backend (`backend/.env`)
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
PORT=3001
NODE_ENV=development
```

### Frontend (`frontend/.env`)
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_API_URL=http://localhost:3001
```

---

## Modules implémentés

| # | Module | Statut |
|---|--------|--------|
| A1 | Boutique quincaillerie | ✅ Complet |
| A2 | Boutique produits finis | ✅ Complet |
| C1 | Estimateur devis automatique | ✅ Complet |
| C2 | Fidélité clients | ✅ Complet |
| C3 | Traçabilité matières | ✅ Complet |
| C4 | Approvisionnement | ✅ Complet |
| C5 | Notifications | ✅ Complet |
| D1 | MRP / Planning atelier | ✅ Complet |
| D2 | Qualité + Maintenance | ✅ Complet |
| E1 | RH — Fiches employés & pointage | ✅ Complet |
| E2 | Paie CNPS/IRPP Cameroun | ✅ Complet |
| OPT-3 | CRM enrichi + WhatsApp | ✅ Complet |
| OPT-4 | Comptabilité SYSCOHADA | ✅ Complet |
| OPT-5 | Multi-entrepôts & inventaire tournant | ✅ Complet |
| OPT-6 | Audit log & RBAC | ✅ Complet |
| OPT-7 | KPIs avancés & alertes prédictives | ✅ Complet |
| OPT-8 | Seed données démo | ✅ Complet |

---

*TAFDIL ERP v2.0 — Mai 2026*
