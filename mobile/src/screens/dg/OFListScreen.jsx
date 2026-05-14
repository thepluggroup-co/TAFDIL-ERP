import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import supabase from '@/services/supabaseClient';

const C = { primary: '#1a3a5c', accent: '#e8740c', bg: '#f5f7fa' };

const STATUT_COLOR = {
  PLANIFIE: '#3b82f6',
  EN_ATTENTE_MATIERE: '#f59e0b',
  EN_COURS: '#16a34a',
  SUSPENDU: '#6b7280',
  TERMINE: '#10b981',
  ANNULE: '#ef4444',
};

export default function OFListScreen({ navigation }) {
  const [ofs, setOfs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filtre, setFiltre] = useState('EN_COURS');

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const params = filtre ? `&statut=${filtre}` : '';
      const r = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/mrp/ofs?limit=30${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (r.ok) {
        const data = await r.json();
        setOfs(data.ofs || []);
      }
    } finally {
      setRefreshing(false);
    }
  }, [filtre]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const exploserBOM = async (of_id, reference) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const r = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/mrp/exploser-bom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ of_id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      const ruptures = data.nb_ruptures;
      Alert.alert(
        'BOM explosée — ' + reference,
        `${data.nb_lignes} matières · ${ruptures} rupture(s)\nStatut : ${data.statut_global}`
      );
      load();
    } catch (e) {
      Alert.alert('Erreur', e.message);
    }
  };

  const FILTRES = ['PLANIFIE', 'EN_COURS', 'EN_ATTENTE_MATIERE', 'TERMINE'];

  const renderOF = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.ref}>{item.reference}</Text>
        <View style={[styles.badge, { backgroundColor: STATUT_COLOR[item.statut] + '22' }]}>
          <Text style={[styles.badgeText, { color: STATUT_COLOR[item.statut] }]}>{item.statut}</Text>
        </View>
      </View>
      <Text style={styles.type}>
        {item.type_produit} — {item.dimensions?.largeur_m}m × {item.dimensions?.hauteur_m}m (×{item.dimensions?.quantite})
      </Text>
      <Text style={styles.meta}>
        {item.date_planifiee_debut} · P{item.priorite} · {item.heures_estimees}h
      </Text>
      {item.technicien && (
        <Text style={styles.tech}>
          Tech: {item.technicien.raw_user_meta_data?.nom || item.technicien.email}
        </Text>
      )}

      <View style={styles.actions}>
        {['PLANIFIE', 'EN_ATTENTE_MATIERE'].includes(item.statut) && (
          <TouchableOpacity style={styles.btnSecondary} onPress={() => exploserBOM(item.id, item.reference)}>
            <Text style={styles.btnSecondaryText}>Exploser BOM</Text>
          </TouchableOpacity>
        )}
        {item.statut !== 'TERMINE' && item.statut !== 'ANNULE' && (
          <TouchableOpacity
            style={styles.btnQC}
            onPress={() => navigation.navigate('ControleQC', {
              of_id: item.id,
              of_reference: item.reference,
              type_produit: item.type_produit,
            })}
          >
            <Text style={styles.btnQCText}>QC →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Filtres */}
      <View style={styles.filtreRow}>
        {FILTRES.map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFiltre(f)}
            style={[styles.filtreBtn, filtre === f && styles.filtreBtnActive]}
          >
            <Text style={[styles.filtreBtnText, filtre === f && styles.filtreBtnTextActive]}>
              {f.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={ofs}
        keyExtractor={item => item.id}
        renderItem={renderOF}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} colors={[C.primary]} />}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucun OF {filtre}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  filtreRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  filtreBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6' },
  filtreBtnActive: { backgroundColor: C.primary },
  filtreBtnText: { fontSize: 11, color: '#6b7280', fontWeight: '600' },
  filtreBtnTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  ref: { fontSize: 13, fontWeight: '700', color: C.primary, fontFamily: 'monospace' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  type: { fontSize: 14, fontWeight: '600', color: '#1f2937', marginBottom: 4 },
  meta: { fontSize: 11, color: '#9ca3af', marginBottom: 2 },
  tech: { fontSize: 11, color: '#9ca3af', marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btnSecondary: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eff6ff', alignItems: 'center' },
  btnSecondaryText: { color: '#3b82f6', fontSize: 12, fontWeight: '600' },
  btnQC: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent, alignItems: 'center' },
  btnQCText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9ca3af', fontSize: 14 },
});
