# TAFDIL ERP

Système ERP complet pour TAFDIL SARL — Douala, Cameroun.
Gestion de la boutique quincaillerie, produits finis, production atelier, synchronisation multi-clients.

---

## Structure du projet

```
TAFDIL-ERP/
├── backend/                  ← API Node.js/Express + Supabase
│   ├── src/
│   │   ├── app.js
│   │   ├── config/supabase.js
│   │   ├── middleware/
│   │   │   ├── auth.js           JWT Supabase + gestion des rôles
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── index.js
│   │   │   ├── boutique-quincaillerie.js
│   │   │   └── boutique-produits-finis.js
│   │   └── services/
│   │       ├── stockService.js
│   │       ├── pricingService.js
│   │       ├── ticketService.js
│   │       ├── productionService.js
│   │       ├── devisService.js
│   │       └── bonLivraisonService.js
│   ├── migrations/
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                 ← React 18 + Vite + TailwindCSS
│   ├── src/
│   │   ├── api/              (client.js · quincaillerie.js · produitsFinis.js)
│   │   ├── components/       (layout · shared · quincaillerie · produits-finis)
│   │   ├── pages/            (Dashboard · quincaillerie/ · produits-finis/)
│   │   ├── stores/           (useCartStore · useStockStore)
│   │   └── lib/supabase.js
│   ├── Dockerfile
│   └── package.json
│
├── supabase/                 ← config.toml + migrations miroir
├── docs/                     ← architecture.md · api/ · guides/
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## Démarrage rapide

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Renseigner les clés Supabase dans les deux fichiers

# Migrations (SQL Editor Supabase, dans l'ordre)
# supabase/migrations/001 → 002 → 003

# Dev local
cd backend  && npm install && npm run dev   # port 3000
cd frontend && npm install && npm run dev   # port 5173

# Production
docker-compose up -d
```

---

## Modules

| # | Module | Status |
|---|--------|--------|
| A1 | Boutique Quincaillerie (B2C + interne) | ✅ |
| A2 | Boutique Produits Finis (devis + production) | ✅ |
| B1 | API Gateway + SDK Sync offline + Realtime | 🔄 |
| B2 | Electron Desktop (Windows/Mac) | 🔄 |
| B3 | Expo Mobile (Android/iOS) | 🔄 |

---

## Règles métier clés

- **Conflit stock** → paramètre `priorite_atelier` dans `parametres_systeme`
- **Prix automatique** → PUBLIC : `prix_public` / INTERNE : `prix_interne`
- **Marge produits finis** → `cout_total × marge_coeff_pf` (défaut 1.35)
- **Signature électronique** → token UUID unique, PNG base64 incrusté dans PDF BL
