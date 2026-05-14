import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { notifyLocal } from '@/services/notifications';
import supabase from '@/services/supabaseClient';

const C = { primary: '#1a3a5c', accent: '#e8740c', bg: '#f5f7fa' };

export default function ControleQCScreen({ route, navigation }) {
  const { of_id, of_reference, type_produit } = route.params;
  const [criteres, setCriteres] = useState([]);
  const [defauts, setDefauts] = useState('');
  const [actions, setActions] = useState('');
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const r = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/qualite/criteres/${type_produit}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (r.ok) {
        const data = await r.json();
        setCriteres(data.map(c => ({ ...c, conforme: null, valeur_mesuree: '' })));
      }
    };
    load();
  }, [type_produit]);

  const toggleCritere = (idx, conforme) => {
    setCriteres(cs => cs.map((c, i) => i === idx ? { ...c, conforme } : c));
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      const compressed = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPhotos(p => [...p, compressed.uri]);
    }
  };

  const handleSubmit = async () => {
    const nonRenseignes = criteres.filter(c => c.obligatoire && c.conforme === null);
    if (nonRenseignes.length > 0) {
      Alert.alert('Critères manquants', `${nonRenseignes.length} critère(s) obligatoire(s) non renseigné(s)`);
      return;
    }

    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      // Upload photos
      const photoUrls = [];
      for (const uri of photos) {
        const fileName = `qc/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const blob = await (await fetch(uri)).blob();
        const { data, error } = await supabase.storage
          .from('tafdil-media')
          .upload(fileName, blob, { contentType: 'image/jpeg' });
        if (!error) {
          const { data: pub } = supabase.storage.from('tafdil-media').getPublicUrl(fileName);
          photoUrls.push(pub.publicUrl);
        }
      }

      const r = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/qualite/fiches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          of_id,
          criteres_verifies: criteres.map(c => ({
            critere: c.critere,
            tolerance: c.tolerance,
            valeur_mesuree: c.valeur_mesuree,
            conforme: c.conforme,
          })),
          defauts_constates: defauts,
          actions_correctives: actions,
          photos_controle: photoUrls,
        }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.message);

      await notifyLocal('Fiche QC soumise', `OF ${of_reference} — Décision : ${data.decision}`);
      Alert.alert('Succès', `Fiche QC enregistrée\nDécision : ${data.decision}`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Erreur', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const nbConformes = criteres.filter(c => c.conforme === true).length;
  const taux = criteres.length > 0 ? Math.round((nbConformes / criteres.length) * 100) : null;

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Contrôle Qualité</Text>
      <Text style={styles.subtitle}>{of_reference} — {type_produit}</Text>

      {/* Taux de conformité temps réel */}
      {taux !== null && (
        <View style={styles.tauxCard}>
          <View style={styles.barBg}>
            <View style={[styles.barFill, {
              width: `${taux}%`,
              backgroundColor: taux >= 100 ? '#16a34a' : taux >= 70 ? '#d97706' : '#dc2626',
            }]} />
          </View>
          <Text style={[styles.tauxText, {
            color: taux >= 100 ? '#16a34a' : taux >= 70 ? '#d97706' : '#dc2626',
          }]}>
            {taux}% — {taux === 100 ? 'VALIDÉ' : taux >= 70 ? 'RETOUCHE' : 'REJET'}
          </Text>
        </View>
      )}

      {/* Critères */}
      {criteres.map((c, idx) => (
        <View key={idx} style={styles.critereCard}>
          <Text style={styles.critereName}>
            {c.critere}{c.obligatoire ? ' *' : ''}
          </Text>
          {c.tolerance && <Text style={styles.tolerance}>Tolérance : {c.tolerance}</Text>}
          <View style={styles.btnRow}>
            <TouchableOpacity
              onPress={() => toggleCritere(idx, true)}
              style={[styles.critereBtn, c.conforme === true && styles.conformeBtn]}
            >
              <Text style={[styles.critereBtnText, c.conforme === true && { color: '#fff' }]}>✓ OK</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => toggleCritere(idx, false)}
              style={[styles.critereBtn, c.conforme === false && styles.nonConformeBtn]}
            >
              <Text style={[styles.critereBtnText, c.conforme === false && { color: '#fff' }]}>✗ NOK</Text>
            </TouchableOpacity>
          </View>
          {c.conforme !== null && (
            <TextInput
              style={styles.mesureInput}
              value={c.valeur_mesuree}
              onChangeText={t => setCriteres(cs => cs.map((item, i) =>
                i === idx ? { ...item, valeur_mesuree: t } : item
              ))}
              placeholder="Valeur mesurée (optionnel)"
            />
          )}
        </View>
      ))}

      {/* Défauts */}
      <Text style={styles.label}>Défauts constatés</Text>
      <TextInput style={[styles.input, { height: 80 }]} multiline
        value={defauts} onChangeText={setDefauts}
        placeholder="Décrire les défauts observés…" />

      <Text style={styles.label}>Actions correctives</Text>
      <TextInput style={[styles.input, { height: 60 }]} multiline
        value={actions} onChangeText={setActions}
        placeholder="Actions prévues…" />

      {/* Photos */}
      <Text style={styles.label}>Photos QC ({photos.length})</Text>
      <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto}>
        <Text style={styles.photoBtnText}>📷 Prendre une photo</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.submitText}>
          {submitting ? 'Envoi…' : 'Soumettre la fiche QC'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: C.primary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#555', marginBottom: 16 },
  tauxCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#eee' },
  barBg: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  barFill: { height: 8, borderRadius: 4 },
  tauxText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  critereCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  critereName: { fontSize: 14, fontWeight: '600', color: '#1f2937', marginBottom: 4 },
  tolerance: { fontSize: 11, color: '#9ca3af', marginBottom: 8 },
  btnRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  critereBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center' },
  conformeBtn: { backgroundColor: '#16a34a' },
  nonConformeBtn: { backgroundColor: '#dc2626' },
  critereBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  mesureInput: { marginTop: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#333' },
  photoBtn: { borderWidth: 1, borderColor: C.accent, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  photoBtnText: { color: C.accent, fontWeight: '600' },
  submitBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 32, marginBottom: 40 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
