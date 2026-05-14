const supabase = require('../../backend/src/config/supabase');

const CHANNELS = {
  STOCK:      'boutique-stock',
  COMMANDES:  'commandes-live',
  BONS_SORTIE:'bons-sortie',
  PRODUCTION: 'production-update',
  PAIEMENTS:  'paiements',
};

/**
 * Initialise les subscriptions Supabase Realtime côté serveur
 * pour relayer les changements DB vers les clients connectés.
 *
 * Appelé une fois au démarrage du gateway.
 */
function initRealtimeListeners() {
  // Stock — quand un produit est mis à jour
  supabase
    .channel(CHANNELS.STOCK)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'produits',
      filter: 'stock_actuel=neq.stock_actuel',
    }, (payload) => {
      console.log(JSON.stringify({ channel: CHANNELS.STOCK, event: 'stock_change', product_id: payload.new?.id }));
    })
    .subscribe();

  // Nouveau bon de sortie → alerte magasinier
  supabase
    .channel(CHANNELS.BONS_SORTIE)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'bons_sortie_atelier',
    }, (payload) => {
      console.log(JSON.stringify({ channel: CHANNELS.BONS_SORTIE, event: 'new_bon', id: payload.new?.id }));
    })
    .subscribe();

  // Produit fini DISPONIBLE → mise à jour catalogue
  supabase
    .channel(CHANNELS.PRODUCTION)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'produits_finis',
      filter: "statut=eq.DISPONIBLE",
    }, (payload) => {
      console.log(JSON.stringify({ channel: CHANNELS.PRODUCTION, event: 'produit_disponible', id: payload.new?.id }));
    })
    .subscribe();

  console.log('Realtime listeners initialisés :', Object.values(CHANNELS).join(', '));
}

/**
 * Broadcast un événement sur un channel nommé.
 */
async function broadcast(channel, event, payload) {
  return supabase.channel(channel).send({ type: 'broadcast', event, payload });
}

module.exports = { initRealtimeListeners, broadcast, CHANNELS };
