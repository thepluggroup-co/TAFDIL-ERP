# API — Boutique Quincaillerie

Base URL : `/api/boutique-quincaillerie`

---

## POST /vente-comptoir

Crée une vente caisse.

**Body**
```json
{
  "vendeur_id": "uuid",
  "client_type": "PUBLIC | INTERNE",
  "client_nom": "string (optionnel)",
  "mode_paiement": "ESPECES | CARTE | MOBILE_MONEY | VIREMENT | CREDIT",
  "lignes": [
    { "produit_id": "uuid", "quantite": 2, "remise_pct": 0 }
  ],
  "remise_dg_pct": 0
}
```

**Réponse 201**
```json
{
  "success": true,
  "vente_id": "uuid",
  "numero": "VC-2026-00001",
  "totaux": { "montant_ht": 50000, "montant_tva": 9625, "montant_total": 59625 }
}
```

**Erreur 409** — conflit de stock
```json
{
  "success": false,
  "message": "Conflit de stock détecté",
  "conflits": [{ "designation": "Tôle 2mm", "demande": 5, "disponible": 3 }]
}
```

---

## GET /catalogue-public

Paramètres query : `categorie`, `stock_min`, `search`, `page`, `limit`

---

## GET /stock-dispo/:id

Retourne le stock réel moins les réservations atelier en attente.

---

## POST /caisse/ticket

**Body** `{ "vente_id": "uuid" }`  
**Réponse** `application/pdf` — PDF thermique 58mm

---

## GET /stats/jour

Paramètre : `?date=YYYY-MM-DD`

```json
{
  "stats": {
    "nb_transactions": 12,
    "ca_total": 450000,
    "public": { "nb": 9, "ca": 380000 },
    "interne": { "nb": 3, "ca": 70000 }
  }
}
```

---

## GET /stock-conflits

Liste des produits avec réservation atelier active ET disponibles en boutique.

---

## POST /sync-offline  *(alias /api/boutique/sync-offline)*

Synchronisation idempotente de ventes créées hors ligne.

**Body** `{ "ventes": [...] }`  
**Réponse** `{ "resume": { "synchronisees": 5, "erreurs": 0, "doublons": 1 } }`
