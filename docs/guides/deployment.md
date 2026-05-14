# Guide de déploiement

## Prérequis
- Docker & Docker Compose
- Projet Supabase actif (cloud ou local via `supabase start`)
- Node.js 20+ (développement local)

## 1. Variables d'environnement

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp ecommerce/.env.example ecommerce/.env
```

Variables obligatoires à renseigner :

| Fichier | Variable | Description |
|---|---|---|
| backend/.env | SUPABASE_URL | URL Supabase project |
| backend/.env | SUPABASE_SERVICE_KEY | Service role key |
| backend/.env | CRON_SECRET | Clé secrète pour les jobs cron |
| frontend/.env | VITE_SUPABASE_URL | URL Supabase (public) |
| frontend/.env | VITE_SUPABASE_ANON_KEY | Anon key (public) |
| ecommerce/.env | ERP_API_GATEWAY_URL | URL publique du backend ERP |
| ecommerce/.env | ERP_API_KEY | Clé API inter-services |
| ecommerce/.env | NOTCHPAY_HMAC_SECRET | Signature webhook NotchPay |

## 2. Migrations base de données

Exécuter toutes les migrations dans l'ordre via le SQL Editor Supabase ou `supabase db push` :

```
001_boutique_quincaillerie.sql
002_rpc_stock.sql
003_boutique_produits_finis.sql
004_module_c_devis_fidelite_tracabilite.sql
005_module_c_fournisseurs_notifications.sql
006_module_d_mrp.sql
007_module_d_qualite_maintenance.sql
008_sync_queue.sql
009_module_e_rh_employes.sql
010_module_e_paie.sql
011_opt3_crm_enrichi.sql
012_opt4_comptabilite_syscohada.sql
013_opt5_inventaire_entrepots.sql
014_opt6_audit_trail.sql
015_opt7_kpis_alertes.sql
016_opt8_seed_demo.sql   ← données de démonstration (facultatif en production)
```

## 3. Démarrage local

```bash
# Supabase local
supabase start

# Backend ERP
cd backend && npm install && npm run dev

# Frontend ERP (autre terminal)
cd frontend && npm install && npm run dev

# Backend e-commerce (autre terminal, optionnel)
cd ecommerce && npm install && npm run dev
```

## 4. Docker (production)

```bash
# Créer .env à la racine avec toutes les variables
docker-compose up -d

# Vérifier
curl http://localhost:3000/health
```

## 5. Configuration des jobs cron (alertes notifications)

Les alertes stock critique et maintenance sont déclenchées par des appels HTTP externes.
Configurer un scheduler (Render Cron Jobs, Railway Cron, cron-job.org) pour appeler :

```
POST https://api.tafdil.cm/api/notifications/cron/stock-critique
Header: X-Cron-Key: <valeur de CRON_SECRET>
Fréquence recommandée : toutes les 6 heures
```

```
POST https://api.tafdil.cm/api/notifications/cron/maintenance
Header: X-Cron-Key: <valeur de CRON_SECRET>
Fréquence recommandée : toutes les 24 heures (matin)
```

> ⚠️ Sans ces jobs configurés, les notifications d'alerte stock et maintenance ne se déclencheront jamais.

## 6. SDK — build avant publication

Le SDK doit être compilé avant usage :

```bash
cd sdk && npm install && npm run build
# Génère sdk/dist/index.js et sdk/dist/index.d.ts
```

Pour publier sur le registre GitHub Packages :
```bash
cd sdk && npm publish
```

## 7. Mise à jour

```bash
git pull
docker-compose build
docker-compose up -d --no-deps backend frontend
```
