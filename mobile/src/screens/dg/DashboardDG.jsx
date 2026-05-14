import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import supabase from '@/services/supabaseClient';
import { notifyLocal } from '@/services/notifications';

const C = { primary: '#1a3a5c', accent: '#e8740c', bg: '#f5f7fa' };

function KPICard({ label, value, sub, onPress }) {
  return (
    <TouchableOpacity style={styles.kpiCard} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {sub && <Text style={styles.kpiSub}>{sub}</Text>}
    </TouchableOpacity>
  );
}

export default function DashboardDG() {
  const [stats, setStats] = useState(null);
  const [bonsEnAttente, setBonsEnAttente] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const nav = useNavigation();

  const fetchData = async () => {
    setRefreshing(true);
    try {
      // Bons de production soumis
      const { data: bons } = await supabase
        .from('bons_production')
        .select('id, reference, prix_vente_suggere, produit_fini:produit_fini_id(designation, type)')
        .eq('statut', 'SOUMIS')
        .order('created_at');

      setBonsEnAttente(bons || []);
      if (bons?.length) notifyLocal('Bons en attente', `${bons.length} bon(s) à valider`);

      // Stats ventes aujourd'hui via API
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/boutique-quincaillerie/stats/jour?date=${today}`, {
        headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
      });
      if (res.ok) setStats((await res.json()).stats);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const fXAF = (n) => new Intl.NumberFormat('fr-CM').format(n || 0) + ' XAF';

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} tintColor={C.accent} />}>

      <Text style={styles.title}>Tableau de bord DG</Text>
      <Text style={styles.date}>{new Date().toLocaleDateString('fr-CM', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>

      {/* KPIs */}
      <View style={styles.kpiGrid}>
        <KPICard label="CA du jour" value={fXAF(stats?.ca_total)} sub={`${stats?.nb_transactions || 0} transactions`} />
        <KPICard label="Ventes public" value={fXAF(stats?.public?.ca)} sub={`${stats?.public?.nb || 0} ventes`} />
        <KPICard label="Usage interne" value={fXAF(stats?.interne?.ca)} sub={`${stats?.interne?.nb || 0} sorties`} />
        <KPICard label="Bons en attente" value={String(bonsEnAttente.length)}
          sub="Appuyer pour valider" onPress={() => nav.navigate('BonsProduction')} />
      </View>

      {/* Bons à valider */}
      {bonsEnAttente.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bons de production à valider</Text>
          {bonsEnAttente.map(b => (
            <TouchableOpacity key={b.id} style={styles.bonCard}
              onPress={() => nav.navigate('ValidationBon', { bon: b })}>
              <View style={styles.bonLeft}>
                <Text style={styles.bonRef}>{b.reference}</Text>
                <Text style={styles.bonDesig}>{b.produit_fini?.designation}</Text>
              </View>
              <View style={styles.bonRight}>
                <Text style={styles.bonPrix}>{fXAF(b.prix_vente_suggere)}</Text>
                <Text style={styles.bonAction}>Valider →</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: C.primary, marginBottom: 2 },
  date: { fontSize: 13, color: '#888', marginBottom: 20 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  kpiCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '47%',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  kpiLabel: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 18, fontWeight: '700', color: C.primary, marginTop: 4 },
  kpiSub: { fontSize: 11, color: '#aaa', marginTop: 2 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.primary, marginBottom: 12 },
  bonCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderLeftWidth: 3, borderLeftColor: C.accent },
  bonLeft: { flex: 1 },
  bonRef: { fontSize: 11, color: '#aaa', fontFamily: 'monospace' },
  bonDesig: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 2 },
  bonRight: { alignItems: 'flex-end' },
  bonPrix: { fontSize: 14, fontWeight: '700', color: C.accent },
  bonAction: { fontSize: 12, color: C.primary, marginTop: 2 },
});
