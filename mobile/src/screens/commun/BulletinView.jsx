import { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

export default function BulletinView() {
  const navigation = useNavigation();
  const [bulletins, setBulletins]     = useState([]);
  const [conges, setConges]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => { fetchBulletins(); }, []);

  async function fetchBulletins() {
    try {
      const [bulRes, cngRes] = await Promise.all([
        fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/paie/mes-bulletins`),
        fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/rh/mes-conges`),
      ]);
      const bulData = await bulRes.json();
      const cngData = await cngRes.json();
      setBulletins(bulData.bulletins || []);
      setConges(cngData);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger les bulletins');
    } finally { setLoading(false); }
  }

  async function telechargerPdf(bulletinId) {
    setDownloading(bulletinId);
    try {
      const url = `${process.env.EXPO_PUBLIC_API_URL}/api/paie/bulletins/${bulletinId}/pdf`;
      await Linking.openURL(url);
    } catch {
      Alert.alert('Erreur', 'Impossible de télécharger le PDF');
    } finally { setDownloading(null); }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#085041" />
        <Text style={styles.loadingText}>Chargement…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Mes bulletins de paie</Text>
      </View>

      {/* Solde congés */}
      {conges && (
        <View style={styles.congesCard}>
          <View style={styles.congesItem}>
            <Text style={styles.congesValue}>{conges.solde_conges_jours ?? '—'}</Text>
            <Text style={styles.congesLabel}>jours congés restants</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.congesItem}>
            <Text style={styles.congesValue}>{conges.jours_pris ?? '—'}</Text>
            <Text style={styles.congesLabel}>jours pris cette année</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.congesItem}>
            <Text style={styles.congesValue}>{conges.type_contrat ?? '—'}</Text>
            <Text style={styles.congesLabel}>type contrat</Text>
          </View>
        </View>
      )}

      {/* Liste bulletins */}
      <FlatList
        data={bulletins}
        keyExtractor={b => b.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>Aucun bulletin disponible</Text>}
        renderItem={({ item: b }) => {
          const date = new Date(b.periode_mois + '-01');
          const mois = MOIS[date.getMonth()];
          const annee = date.getFullYear();
          return (
            <View style={styles.bulletinCard}>
              <View style={styles.bulletinLeft}>
                <View style={styles.periodeBox}>
                  <Text style={styles.periodeMois}>{mois}</Text>
                  <Text style={styles.periodeAnnee}>{annee}</Text>
                </View>
              </View>
              <View style={styles.bulletinCenter}>
                <Text style={styles.brutLabel}>Salaire brut</Text>
                <Text style={styles.brutValue}>{(b.salaire_brut || 0).toLocaleString('fr-CM')} XAF</Text>
                <Text style={styles.netLabel}>Net à payer</Text>
                <Text style={styles.netValue}>{(b.salaire_net || 0).toLocaleString('fr-CM')} XAF</Text>
              </View>
              <View style={styles.bulletinRight}>
                <View style={[styles.statutBadge, b.statut === 'PAYÉ' ? styles.badgePaid : styles.badgePending]}>
                  <Text style={[styles.statutText, b.statut === 'PAYÉ' ? styles.badgePaidText : styles.badgePendingText]}>
                    {b.statut}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.pdfBtn}
                  onPress={() => telechargerPdf(b.id)}
                  disabled={downloading === b.id}
                >
                  {downloading === b.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.pdfBtnText}>PDF ↓</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const GREEN = '#085041';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6b7280', fontSize: 14 },
  header: { backgroundColor: GREEN, padding: 20, paddingTop: 48 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  congesCard: {
    flexDirection: 'row', backgroundColor: '#fff', margin: 16,
    borderRadius: 12, padding: 16, shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 8, elevation: 2,
  },
  congesItem: { flex: 1, alignItems: 'center' },
  congesValue: { fontSize: 22, fontWeight: 'bold', color: GREEN },
  congesLabel: { fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 4 },
  divider: { width: 1, backgroundColor: '#e5e7eb', marginHorizontal: 8 },
  list: { padding: 16, gap: 12 },
  emptyText: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 },
  bulletinCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12,
    padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    alignItems: 'center',
  },
  bulletinLeft: { marginRight: 12 },
  periodeBox: { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 8, alignItems: 'center', minWidth: 52 },
  periodeMois: { fontSize: 14, fontWeight: 'bold', color: GREEN },
  periodeAnnee: { fontSize: 11, color: '#6b7280' },
  bulletinCenter: { flex: 1 },
  brutLabel: { fontSize: 11, color: '#9ca3af' },
  brutValue: { fontSize: 13, fontWeight: '600', color: '#374151' },
  netLabel: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  netValue: { fontSize: 15, fontWeight: 'bold', color: GREEN },
  bulletinRight: { alignItems: 'flex-end', gap: 8 },
  statutBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgePaid: { backgroundColor: '#d1fae5' },
  badgePending: { backgroundColor: '#fef3c7' },
  statutText: { fontSize: 11, fontWeight: '600' },
  badgePaidText: { color: '#065f46' },
  badgePendingText: { color: '#92400e' },
  pdfBtn: { backgroundColor: GREEN, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, minWidth: 60, alignItems: 'center' },
  pdfBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
