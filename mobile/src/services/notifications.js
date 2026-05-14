import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import supabase from './supabaseClient';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Demande les permissions et enregistre le token push Expo.
 * Stocke le token dans la table user_push_tokens.
 */
export async function registerPushToken(userId) {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('tafdil-erp', {
      name: 'TAFDIL ERP',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#e8740c',
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  await supabase.from('user_push_tokens').upsert({
    user_id: userId,
    token,
    platform: Platform.OS,
    updated_at: new Date().toISOString(),
  });

  return token;
}

/**
 * Envoie une notification locale immédiate.
 */
export async function notifyLocal(title, body, data = {}) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: 'default' },
    trigger: null,
  });
}

/**
 * Abonnements Realtime → notifications push locales
 */
export function subscribeToAlerts(supabaseClient, role) {
  // Bon de sortie soumis → alerte magasinier/DG
  if (['dg', 'magasinier', 'admin'].includes(role)) {
    supabaseClient
      .channel('bons-sortie')
      .on('broadcast', { event: 'new_bon' }, ({ payload }) => {
        notifyLocal('Nouveau bon de sortie', `Bon ${payload.reference} en attente de validation`);
      })
      .subscribe();
  }

  // Paiement confirmé → alerte DG
  if (['dg', 'admin'].includes(role)) {
    supabaseClient
      .channel('paiements')
      .on('broadcast', { event: 'paiement_confirme' }, ({ payload }) => {
        notifyLocal('Paiement reçu', `${payload.amount} ${payload.currency} — Réf: ${payload.reference}`);
      })
      .subscribe();

    supabaseClient
      .channel('commandes-live')
      .on('broadcast', { event: 'nouvelle_commande_enligne' }, ({ payload }) => {
        notifyLocal('Nouvelle commande en ligne', `Client: ${payload.client} — ${payload.numero}`);
      })
      .subscribe();
  }
}
