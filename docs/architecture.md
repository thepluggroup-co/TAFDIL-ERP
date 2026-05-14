# TAFDIL ERP — Architecture Système

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENTS                             │
│  Web (Lovable)  ·  Electron (Win/Mac)  ·  Expo (Mobile) │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / WebSocket
┌────────────────────────▼────────────────────────────────┐
│              API GATEWAY  (Node.js/Express)             │
│  Auth JWT · Rate Limiting · Logging · CORS              │
│  /api/boutique-quincaillerie                            │
│  /api/boutique-produits-finis                           │
│  /sync/push · /sync/pull                                │
│  /webhooks/paiement · /webhooks/commande                │
└────────────────────────┬────────────────────────────────┘
                         │ Supabase JS SDK
┌────────────────────────▼────────────────────────────────┐
│                  SUPABASE (source de vérité)            │
│  PostgreSQL · Auth · Realtime · Storage                 │
│                                                         │
│  Tables clés :                                          │
│  produits · ventes_comptoir · bons_sortie_atelier       │
│  produits_finis · bons_production                       │
│  devis · commandes_produits_finis · bons_livraison      │
│  sync_queue · parametres_systeme                        │
└─────────────────────────────────────────────────────────┘
```

## Modules

| Module | Description | Status |
|--------|-------------|--------|
| A1 Boutique Quincaillerie | Vente comptoir B2C + interne, stock partagé | ✅ |
| A2 Boutique Produits Finis | Devis, commandes sur mesure, livraison | ✅ |
| B1 API Gateway + SDK | Sync offline, Realtime, webhooks | 🔄 |
| B2 Electron Desktop | Windows/Mac, caisse offline, impression native | 🔄 |
| B3 Expo Mobile | Android/iOS, scanner, notifications push | 🔄 |

## Flux de données

### Vente comptoir quincaillerie
```
Vendeur → CaisseForm → POST /api/boutique-quincaillerie/vente-comptoir
  → stockService.verifierDisponibilite (conflit atelier ?)
  → pricingService.calculerPrix (PUBLIC vs INTERNE)
  → INSERT ventes_comptoir + lignes
  → decrementerStock (RPC atomique FOR UPDATE)
  → ticketService.genererTicketPDF → retour Buffer PDF 58mm
```

### Validation bon de production
```
Technicien → BonProductionForm → POST /api/boutique-produits-finis/bon-production
  → productionService.calculerCoutProduction (matériaux × prix_interne)
  → CREATE produits_finis (EN_FABRICATION) + bons_production (SOUMIS)
  
DG → PUT /bon-production/:id/valider
  → Vérif stock quincaillerie suffisant
  → decrementerStock pour chaque matériau
  → produits_finis.statut = DISPONIBLE
  → publie_ecommerce = true si photos présentes
```

### Signature livraison
```
Livreur → POST /commande/:id/bon-livraison → BL créé + signature_token UUID
Client → GET {BASE_URL}/signature/{token} → SignatureCapture.jsx
Client → POST /bl/signer/{token} { signature_base64 }
  → BL.statut = SIGNE, commande.statut = LIVRE
  → PDF régénéré avec signature incrustée
```

## Règles métier critiques

### Conflit de stock
```
priorite_atelier = true  →  stock_visible = stock_actuel − réservé_atelier
priorite_atelier = false →  stock_visible = stock_actuel (atelier non prioritaire)
```
Configurable dans `parametres_systeme.priorite_atelier`.

### Prix automatique
- `client_type = INTERNE` → `prix_interne` appliqué, jamais de prix public
- `client_type = PUBLIC`  → `prix_public`, remise DG ≤ `remise_max_dg`%

### Marge produits finis
```
prix_vente_suggere = cout_total × marge_coeff_pf  (défaut 1.35 = +35%)
```
Le DG peut écraser au moment de la validation du bon.

## Stack technique

| Couche | Technologies |
|--------|-------------|
| Base de données | Supabase (PostgreSQL 15) |
| Backend API | Node.js 20 · Express 4 · Supabase JS SDK |
| Frontend Web | React 18 · Vite · TailwindCSS · Zustand |
| Desktop | Electron 29 · better-sqlite3 |
| Mobile | Expo SDK 50 · React Native |
| PDF | PDFKit · QRCode |
| Auth | Supabase Auth (JWT) |
| Déploiement | Docker · Nginx |
