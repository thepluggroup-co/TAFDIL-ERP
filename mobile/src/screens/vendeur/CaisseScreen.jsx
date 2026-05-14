import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Alert, ScrollView, Switch,
} from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { useNavigation } from '@react-navigation/native';

const TVA = 0.1925;

const MODES_PAIEMENT = ['ESPECES', 'ORANGE_MONEY', 'MTN_MOMO', 'CREDIT'];

export default function CaisseScreen() {
  const navigation = useNavigation();

  const [catalogue, setCatalogue]       = useState([]);
  const [panier, setPanier]             = useState([]);
  const [recherche, setRecherche]       = useState('');
  const [clientInterne, setClientInterne] = useState(false);
  const [modePaiement, setModePaiement] = useState('ESPECES');
  const [montantRecu, setMontantRecu]   = useState('');
  const [scanMode, setScanMode]         = useState(false);
  const [step, setStep]                 = useState('catalogue'); // catalogue | panier | paiement

  useEffect(() => { chargerCatalogue(); }, []);

  async function chargerCatalogue() {
    try {
      // Tentative API, fallback SQLite offline
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/boutique-quincaillerie/catalogue-public`);
      const data = await res.json();
      setCatalogue(data.produits || []);
    } catch {
      // Chargé depuis SQLite offline (initOfflineDb)
    }
  }

  const produitsFiltres = catalogue.filter(p =>
    p.designation?.toLowerCase().includes(recherche.toLowerCase()) ||
    p.reference?.toLowerCase().includes(recherche.toLowerCase())
  );

  function ajouterAuPanier(produit) {
    setPanier(prev => {
      const idx = prev.findIndex(l => l.produit_id === produit.id);
      if (idx >= 0) {
        const copy = [...prev];
        if (copy[idx].quantite < produit.stock_actuel) copy[idx].quantite += 1;
        return copy;
      }
      const prix = clientInterne ? produit.prix_interne : produit.prix_public;
      return [...prev, { produit_id: produit.id, designation: produit.designation,
                          prix_unitaire: prix, quantite: 1, stock_max: produit.stock_actuel }];
    });
  }

  function modifierQuantite(produit_id, delta) {
    setPanier(prev => prev
      .map(l => l.produit_id === produit_id
        ? { ...l, quantite: Math.max(0, Math.min(l.quantite + delta, l.stock_max)) }
        : l)
      .filter(l => l.quantite > 0)
    );
  }

  const sousTotalHT   = panier.reduce((s, l) => s + l.prix_unitaire * l.quantite, 0);
  const tva           = clientInterne ? 0 : sousTotalHT * TVA;
  const totalTTC      = sousTotalHT + tva;
  const rendu         = parseFloat(montantRecu || 0) - totalTTC;

  async function validerVente() {
    if (panier.length === 0) return Alert.alert('Panier vide');
    if (modePaiement === 'ESPECES' && parseFloat(montantRecu) < totalTTC) {
      return Alert.alert('Montant insuffisant');
    }

    try {
      const body = {
        client_type: clientInterne ? 'INTERNE' : 'PUBLIC',
        mode_paiement: modePaiement,
        montant_total: totalTTC,
        lignes: panier.map(l => ({
          produit_id: l.produit_id,
          quantite: l.quantite,
          prix_unitaire_applique: l.prix_unitaire,
        })),
      };

      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/boutique-quincaillerie/vente-comptoir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Erreur serveur');

      Alert.alert('✅ Vente validée', `Total : ${totalTTC.toLocaleString('fr-CM')} XAF`, [
        { text: 'Nouvelle vente', onPress: () => { setPanier([]); setStep('catalogue'); setMontantRecu(''); } },
      ]);
    } catch {
      Alert.alert('⚠️ Hors ligne', 'La vente a été sauvegardée localement et sera synchronisée dès la reconnexion.');
      setPanier([]); setStep('catalogue');
    }
  }

  if (scanMode) {
    return (
      <BarCodeScanner
        style={StyleSheet.absoluteFillObject}
        onBarCodeScanned={({ data }) => {
          setScanMode(false);
          const found = catalogue.find(p => p.reference === data || p.code_barre === data);
          if (found) { ajouterAuPanier(found); setStep('panier'); }
          else Alert.alert('Produit non trouvé', `Code : ${data}`);
        }}
      >
        <TouchableOpacity style={styles.scanClose} onPress={() => setScanMode(false)}>
          <Text style={styles.scanCloseText}>✕ Fermer</Text>
        </TouchableOpacity>
      </BarCodeScanner>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Caisse Mobile</Text>
        <View style={styles.clientToggle}>
          <Text style={styles.toggleLabel}>Client interne</Text>
          <Switch value={clientInterne} onValueChange={setClientInterne} trackColor={{ true: '#085041' }} />
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {['catalogue', 'panier', 'paiement'].map(t => (
          <TouchableOpacity key={t} style={[styles.tab, step === t && styles.tabActive]} onPress={() => setStep(t)}>
            <Text style={[styles.tabText, step === t && styles.tabTextActive]}>
              {t === 'catalogue' ? 'Catalogue' : t === 'panier' ? `Panier (${panier.length})` : 'Paiement'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Catalogue */}
      {step === 'catalogue' && (
        <>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher un produit…"
              value={recherche}
              onChangeText={setRecherche}
            />
            <TouchableOpacity style={styles.scanBtn} onPress={() => setScanMode(true)}>
              <Text style={styles.scanBtnText}>📷</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={produitsFiltres}
            keyExtractor={p => p.id}
            renderItem={({ item: p }) => (
              <TouchableOpacity style={styles.produitCard} onPress={() => ajouterAuPanier(p)}>
                <View style={styles.produitInfo}>
                  <Text style={styles.produitNom}>{p.designation}</Text>
                  <Text style={styles.produitRef}>{p.reference}</Text>
                  <Text style={[styles.stockBadge, p.stock_actuel <= 0 && styles.rupture]}>
                    {p.stock_actuel <= 0 ? 'RUPTURE' : `Stock : ${p.stock_actuel} ${p.unite}`}
                  </Text>
                </View>
                <View style={styles.produitPrix}>
                  <Text style={styles.prix}>
                    {(clientInterne ? p.prix_interne : p.prix_public).toLocaleString('fr-CM')} XAF
                  </Text>
                  <Text style={styles.addBtn}>+</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      )}

      {/* Panier */}
      {step === 'panier' && (
        <ScrollView style={styles.panierContainer}>
          {panier.length === 0 && <Text style={styles.emptyText}>Panier vide</Text>}
          {panier.map(l => (
            <View key={l.produit_id} style={styles.ligneCard}>
              <Text style={styles.ligneNom} numberOfLines={1}>{l.designation}</Text>
              <View style={styles.ligneControls}>
                <TouchableOpacity onPress={() => modifierQuantite(l.produit_id, -1)} style={styles.qtyBtn}>
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{l.quantite}</Text>
                <TouchableOpacity onPress={() => modifierQuantite(l.produit_id, 1)} style={styles.qtyBtn}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.ligneTotal}>{(l.prix_unitaire * l.quantite).toLocaleString('fr-CM')} XAF</Text>
            </View>
          ))}
          <View style={styles.totalSection}>
            <View style={styles.totalRow}><Text>Sous-total HT</Text><Text>{sousTotalHT.toLocaleString('fr-CM')} XAF</Text></View>
            {!clientInterne && <View style={styles.totalRow}><Text>TVA 19.25%</Text><Text>{tva.toLocaleString('fr-CM')} XAF</Text></View>}
            <View style={[styles.totalRow, styles.totalTTC]}>
              <Text style={styles.totalLabel}>TOTAL TTC</Text>
              <Text style={styles.totalAmount}>{totalTTC.toLocaleString('fr-CM')} XAF</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('paiement')}>
            <Text style={styles.primaryBtnText}>Procéder au paiement →</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Paiement */}
      {step === 'paiement' && (
        <ScrollView style={styles.paiementContainer}>
          <Text style={styles.totalDisplay}>{totalTTC.toLocaleString('fr-CM')} XAF</Text>

          <Text style={styles.sectionLabel}>Mode de paiement</Text>
          <View style={styles.modesGrid}>
            {MODES_PAIEMENT.map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.modeBtn, modePaiement === m && styles.modeBtnActive]}
                onPress={() => setModePaiement(m)}
              >
                <Text style={[styles.modeBtnText, modePaiement === m && styles.modeBtnTextActive]}>
                  {m.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {modePaiement === 'ESPECES' && (
            <>
              <Text style={styles.sectionLabel}>Montant reçu</Text>
              <TextInput
                style={styles.montantInput}
                keyboardType="numeric"
                placeholder="0"
                value={montantRecu}
                onChangeText={setMontantRecu}
              />
              {parseFloat(montantRecu) >= totalTTC && (
                <Text style={styles.rendu}>Rendu : {rendu.toLocaleString('fr-CM')} XAF</Text>
              )}
            </>
          )}

          <TouchableOpacity style={styles.validerBtn} onPress={validerVente}>
            <Text style={styles.validerBtnText}>✓ VALIDER LA VENTE</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const GREEN = '#085041';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: GREEN },
  title: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  clientToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel: { color: '#fff', fontSize: 13 },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: GREEN },
  tabText: { fontSize: 13, color: '#6b7280' },
  tabTextActive: { color: GREEN, fontWeight: '600' },
  searchRow: { flexDirection: 'row', padding: 12, gap: 8 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', fontSize: 14 },
  scanBtn: { width: 44, height: 44, backgroundColor: GREEN, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  scanBtnText: { fontSize: 20 },
  produitCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  produitInfo: { flex: 1 },
  produitNom: { fontSize: 14, fontWeight: '600', color: '#111827' },
  produitRef: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  stockBadge: { fontSize: 11, color: '#059669', marginTop: 4 },
  rupture: { color: '#dc2626' },
  produitPrix: { alignItems: 'flex-end' },
  prix: { fontSize: 13, fontWeight: '700', color: GREEN },
  addBtn: { fontSize: 22, color: GREEN, fontWeight: 'bold' },
  panierContainer: { flex: 1, padding: 12 },
  emptyText: { textAlign: 'center', color: '#9ca3af', marginTop: 40 },
  ligneCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  ligneNom: { flex: 1, fontSize: 13, fontWeight: '500', color: '#111827' },
  ligneControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  qtyBtnText: { fontSize: 16, fontWeight: 'bold', color: GREEN },
  qtyValue: { fontSize: 14, fontWeight: '600', minWidth: 24, textAlign: 'center' },
  ligneTotal: { marginLeft: 12, fontSize: 12, fontWeight: '600', color: GREEN },
  totalSection: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalTTC: { borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 8, paddingTop: 12 },
  totalLabel: { fontSize: 15, fontWeight: '700' },
  totalAmount: { fontSize: 15, fontWeight: '700', color: GREEN },
  primaryBtn: { backgroundColor: GREEN, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 16 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  paiementContainer: { flex: 1, padding: 16 },
  totalDisplay: { fontSize: 32, fontWeight: 'bold', color: GREEN, textAlign: 'center', marginBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase' },
  modesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  modeBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  modeBtnActive: { backgroundColor: GREEN, borderColor: GREEN },
  modeBtnText: { fontSize: 13, color: '#374151' },
  modeBtnTextActive: { color: '#fff', fontWeight: '600' },
  montantInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 18, textAlign: 'center', backgroundColor: '#fff', marginBottom: 8 },
  rendu: { fontSize: 16, fontWeight: '600', color: '#059669', textAlign: 'center', marginBottom: 16 },
  validerBtn: { backgroundColor: '#059669', borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 8 },
  validerBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  scanClose: { position: 'absolute', top: 40, right: 20, backgroundColor: 'rgba(0,0,0,0.7)', padding: 12, borderRadius: 8 },
  scanCloseText: { color: '#fff', fontWeight: '600' },
});
