import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useState } from 'react';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
import { notifyLocal } from '@/services/notifications';
import supabase from '@/services/supabaseClient';

const C = { primary: '#1a3a5c', accent: '#e8740c', bg: '#f5f7fa' };

export default function BonSortieScreen({ navigation }) {
  const [form, setForm] = useState({
    designation: '', observations: '', date_debut: new Date().toISOString().slice(0, 10),
  });
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission refusée');

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8,
    });
    if (!result.canceled) {
      // Compression auto (max 800px)
      const compressed = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPhotos(p => [...p, compressed.uri]);
    }
  };

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  };

  const handleSubmit = async () => {
    if (!form.designation.trim()) return Alert.alert('Erreur', 'Désignation requise');
    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      // Upload photos
      const photoUrls = [];
      for (const uri of photos) {
        const fileName = `production/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const blob = await (await fetch(uri)).blob();
        const { data, error } = await supabase.storage
          .from('tafdil-media')
          .upload(fileName, blob, { contentType: 'image/jpeg' });
        if (!error) {
          const { data: pub } = supabase.storage.from('tafdil-media').getPublicUrl(fileName);
          photoUrls.push(pub.publicUrl);
        }
      }

      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/boutique-produits-finis/bon-production`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          technicien_id: session?.session?.user?.id,
          photos_urls: photoUrls,
          materiaux_utilises: [],
          cout_main_oeuvre: 0,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).message);
      const data = await res.json();

      await notifyLocal('Bon soumis', `${data.reference} envoyé au DG pour validation`);
      Alert.alert('Succès', `Bon ${data.reference} soumis au DG`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Erreur', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Nouveau bon de production</Text>

      <Text style={styles.label}>Désignation *</Text>
      <TextInput style={styles.input} value={form.designation}
        onChangeText={t => setForm(f => ({ ...f, designation: t }))}
        placeholder="Ex: Portail coulissant 4m×2m" />

      <Text style={styles.label}>Observations</Text>
      <TextInput style={[styles.input, { height: 80 }]} multiline
        value={form.observations}
        onChangeText={t => setForm(f => ({ ...f, observations: t }))}
        placeholder="Détails de fabrication…" />

      <Text style={styles.label}>Date début</Text>
      <TextInput style={styles.input} value={form.date_debut}
        onChangeText={t => setForm(f => ({ ...f, date_debut: t }))} />

      {/* Photos */}
      <Text style={styles.label}>Photos ({photos.length})</Text>
      <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto}>
        <Text style={styles.photoBtnText}>+ Ajouter une photo</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
        onPress={handleSubmit} disabled={submitting}>
        <Text style={styles.submitText}>
          {submitting ? 'Envoi en cours…' : 'Soumettre au DG'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: C.primary, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#333' },
  photoBtn: { borderWidth: 1, borderColor: C.accent, borderStyle: 'dashed', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  photoBtnText: { color: C.accent, fontWeight: '600' },
  submitBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 32, marginBottom: 40 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
