import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import supabase from '@/services/supabaseClient';
import { notifyLocal } from '@/services/notifications';

const C = { primary: '#1a3a5c', accent: '#e8740c', bg: '#f5f7fa' };

export default function PointageScreen() {
  const [employe, setEmploye] = useState(null);
  const [pointageAujourdhui, setPointageAujourdhui] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const user = session?.session?.user;
      if (!user) return;

      const token = session?.session?.access_token;

      // Récupérer la fiche employé liée au compte
      const { data: emp } = await supabase
        .from('employes')
        .select('id, matricule, nom, prenom, poste')
        .eq('user_id', user.id)
        .single();

      setEmploye(emp);

      if (emp) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: p } = await supabase
          .from('pointages')
          .select('*')
          .eq('employe_id', emp.id)
          .eq('date', today)
          .single();
        setPointageAujourdhui(p || null);
      }
    } finally {
      setLoading(false);
    }
  };

  const pointerArrivee = async () => {
    if (!employe) { Alert.alert('Erreur', 'Fiche employé introuvable'); return; }
    setActionLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const r = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/rh/pointage/entree`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employe_id: employe.id, mode: 'MOBILE_APP' }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      setPointageAujourdhui(data);
      await notifyLocal('Pointage', `Arrivée enregistrée à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      Alert.alert('Erreur', e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const pointerSortie = async () => {
    if (!employe) return;
    setActionLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const r = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/rh/pointage/sortie`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employe_id: employe.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      setPointageAujourdhui(data);
      const heures = parseFloat(data.heures_normales || 0).toFixed(1);
      const sup = parseFloat(data.heures_supplementaires || 0);
      const msg = `${heures}h travaillées${sup > 0 ? ` + ${sup.toFixed(1)}h sup` : ''}`;
      await notifyLocal('Pointage', `Sortie enregistrée — ${msg}`);
    } catch (e) {
      Alert.alert('Erreur', e.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (!employe) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Aucune fiche employé liée à ce compte.</Text>
        <Text style={styles.subText}>Contactez votre administrateur RH.</Text>
      </View>
    );
  }

  const aujourd_hui = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const heureArrivee = pointageAujourdhui?.heure_arrivee
    ? new Date(pointageAujourdhui.heure_arrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const heureSortie = pointageAujourdhui?.heure_depart
    ? new Date(pointageAujourdhui.heure_depart).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const aPointe = !!heureArrivee;
  const aSorti = !!heureSortie;

  return (
    <View style={styles.container}>
      {/* Identité */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{employe.prenom[0]}{employe.nom[0]}</Text>
        </View>
        <View>
          <Text style={styles.name}>{employe.prenom} {employe.nom}</Text>
          <Text style={styles.matricule}>{employe.matricule} · {employe.poste}</Text>
        </View>
      </View>

      {/* Date */}
      <Text style={styles.date}>{aujourd_hui}</Text>

      {/* Statut pointage */}
      <View style={styles.statusCard}>
        {!aPointe ? (
          <Text style={styles.statusText}>Vous n'avez pas encore pointé aujourd'hui</Text>
        ) : !aSorti ? (
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: '#16a34a' }]} />
            <Text style={styles.statusText}>Arrivée enregistrée à <Text style={styles.bold}>{heureArrivee}</Text></Text>
          </View>
        ) : (
          <View>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: '#3b82f6' }]} />
              <Text style={styles.statusText}>
                Journée terminée : <Text style={styles.bold}>{heureArrivee}</Text> → <Text style={styles.bold}>{heureSortie}</Text>
              </Text>
            </View>
            <Text style={styles.heuresText}>
              {parseFloat(pointageAujourdhui.heures_normales || 0).toFixed(1)}h normales
              {parseFloat(pointageAujourdhui.heures_supplementaires || 0) > 0
                ? ` + ${parseFloat(pointageAujourdhui.heures_supplementaires).toFixed(1)}h sup.`
                : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Boutons */}
      <View style={styles.buttonsContainer}>
        {!aPointe && (
          <TouchableOpacity
            style={[styles.btn, styles.btnArrivee, actionLoading && styles.btnDisabled]}
            onPress={pointerArrivee}
            disabled={actionLoading}
          >
            {actionLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>✓ Pointer l'arrivée</Text>
            }
          </TouchableOpacity>
        )}

        {aPointe && !aSorti && (
          <TouchableOpacity
            style={[styles.btn, styles.btnSortie, actionLoading && styles.btnDisabled]}
            onPress={pointerSortie}
            disabled={actionLoading}
          >
            {actionLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>⏹ Pointer la sortie</Text>
            }
          </TouchableOpacity>
        )}

        {aSorti && (
          <View style={styles.done}>
            <Text style={styles.doneText}>Journée terminée ✓</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
        <Text style={styles.refreshText}>Actualiser</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatar: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  matricule: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  date: { fontSize: 13, color: '#6b7280', marginBottom: 24, textTransform: 'capitalize' },
  statusCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    marginBottom: 32, borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, color: '#374151' },
  bold: { fontWeight: '700' },
  heuresText: { fontSize: 13, color: '#16a34a', fontWeight: '600', marginTop: 8, marginLeft: 20 },
  buttonsContainer: { gap: 14 },
  btn: {
    paddingVertical: 18, borderRadius: 16, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  btnArrivee: { backgroundColor: '#16a34a' },
  btnSortie: { backgroundColor: C.accent },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  done: {
    backgroundColor: '#f0fdf4', borderWidth: 2, borderColor: '#16a34a',
    borderRadius: 16, paddingVertical: 18, alignItems: 'center',
  },
  doneText: { color: '#16a34a', fontSize: 16, fontWeight: '700' },
  refreshBtn: { marginTop: 24, alignItems: 'center' },
  refreshText: { color: '#9ca3af', fontSize: 13 },
  errorText: { fontSize: 16, color: '#374151', textAlign: 'center', marginBottom: 8 },
  subText: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
});
