# API — Boutique Produits Finis

Base URL : `/api/boutique-produits-finis`

---

## POST /bon-production
Technicien déclare une production terminée. Calcul coût automatique.

**Body** `{ technicien_id, designation, type, dimensions, materiau, finition, couleur, materiaux_utilises[], cout_main_oeuvre, date_debut, date_fin?, observations?, photos_urls? }`

**Réponse 201**
```json
{
  "bon_id": "uuid", "reference": "BP-2026-00001",
  "cout_detail": { "cout_materiaux": 80000, "cout_main_oeuvre": 25000, "cout_total": 105000, "prix_vente_suggere": 141750 }
}
```

---

## PUT /bon-production/:id/valider
DG valide → décrémente stock quincaillerie → produit DISPONIBLE.

**Body** `{ "valide_par": "uuid", "prix_vente_override": 150000 }`

---

## GET /catalogue
Filtres : `type`, `materiau`, `search`, `page`, `limit`

---

## POST /commande-sur-mesure
Crée un devis avec prix calculé automatiquement par heuristique surface.

**Body** `{ type_produit, client_nom, client_telephone, specifications: { largeur, hauteur, materiau, finition, couleur, notes } }`

---

## GET /devis/:id
`?format=pdf` → retourne PDF A4 du devis.

---

## PUT /devis/:id/accepter
Client accepte → crée commande + attend acompte.

```json
{
  "commande_id": "uuid", "numero": "CMD-2026-00001",
  "acompte_attendu": 42525,
  "date_livraison_prevue": "2026-05-27"
}
```

---

## POST /commande/:id/acompte
`{ montant, mode_paiement, encaisse_par, reference_paiement? }`  
Trigger SQL recalcule `acompte_verse` et passe la commande en `EN_FABRICATION` si seuil atteint.

---

## POST /commande/:id/bon-livraison
Crée BL + génère URL de signature client unique.

---

## GET /bon-livraison/:id/pdf
PDF A4 avec bloc signature (vide ou incrustée si déjà signée).

---

## POST /bl/signer/:token *(endpoint public)*
`{ "signature_base64": "data:image/png;base64,..." }`  
BL → SIGNE, commande → LIVRE.

---

## GET /tracabilite/:produit_fini_id
Remonte la chaîne : produit → bon de production → matières premières → coûts → marge %.

---

## GET /stats/production
Paramètres : `?debut=YYYY-MM-DD&fin=YYYY-MM-DD`

```json
{
  "stats": {
    "total_pieces": 8, "ca_total": 1200000, "cout_total": 840000,
    "marge_brute": 360000, "marge_pct_moy": 42.8, "delai_moyen_jours": 11,
    "repartition_par_type": { "PORTAIL": 4, "PORTE": 2, "BALCON": 2 }
  }
}
```
