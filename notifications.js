/* Tunanepal — Firebase Cloud Messaging setup. */

import { rpc } from './api.js';

let fcmToken = null;

export async function initNotifications(playerId) {
  console.log('[FCM] Init started with playerId:', playerId);
  
  if (!playerId) {
    console.error('[FCM] No player ID provided');
    return;
  }

  if (!('Notification' in window)) {
    console.log('[FCM] Notifications not supported');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.log('[FCM] Service workers not supported');
    return;
  }

  if (!window.firebase || !window.firebase.messaging) {
    console.error('[FCM] Firebase not initialized. Check index.html');
    return;
  }

  console.log('[FCM] Firebase ready');

  if (Notification.permission === 'denied') {
    console.log('[FCM] Notifications denied by user');
    return;
  }

  if (Notification.permission === 'granted') {
    console.log('[FCM] Already granted, subscribing...');
    await subscribe(playerId);
    return;
  }

  console.log('[FCM] Requesting permission...');
  try {
    const result = await Notification.requestPermission();
    console.log('[FCM] Permission result:', result);
    if (result === 'granted') {
      await subscribe(playerId);
    }
  } catch (e) {
    console.error('[FCM] Permission error:', e);
  }
}

async function subscribe(playerId) {
  console.log('[FCM] Subscribe started');
  
  if (!navigator.serviceWorker) {
    console.error('[FCM] Service worker unavailable');
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    console.log('[FCM] Service worker ready');

    const messaging = firebase.messaging();
    console.log('[FCM] Messaging instance created');

    if (!window.FIREBASE_VAPID_KEY) {
      console.error('[FCM] VAPID key missing');
      return;
    }

    console.log('[FCM] Getting token...');
    fcmToken = await messaging.getToken({
      serviceWorkerRegistration: reg,
      vapidKey: window.FIREBASE_VAPID_KEY
    });

    console.log('[FCM] Token received:', fcmToken);

    if (!fcmToken) {
      console.error('[FCM] No token returned');
      return;
    }

    // Send to Supabase with playerId
    console.log('[FCM] Storing token in Supabase with playerId:', playerId);
    const result = await rpc('tuna_fcm_subscribe', { 
      p_player_id: playerId,
      p_token: fcmToken, 
      p_device: 'web' 
    });
    console.log('[FCM] Supabase response:', result);

    if (result && result.ok) {
      console.log('[FCM] Setup complete!');
    } else {
      console.error('[FCM] Save failed:', result?.error);
    }

    // Handle token refresh
    messaging.onTokenRefresh(async () => {
      console.log('[FCM] Token refresh triggered');
      try {
        const newToken = await messaging.getToken({
          serviceWorkerRegistration: reg,
          vapidKey: window.FIREBASE_VAPID_KEY
        });
        if (newToken && newToken !== fcmToken) {
          fcmToken = newToken;
          await rpc('tuna_fcm_subscribe', { 
            p_player_id: playerId,
            p_token: fcmToken, 
            p_device: 'web' 
          });
          console.log('[FCM] Token refreshed');
        }
      } catch (e) {
        console.error('[FCM] Token refresh failed:', e);
      }
    });

  } catch (e) {
    console.error('[FCM] Subscribe error:', e);
  }
}

export async function unsubscribeFromNotifications() {
  if (fcmToken) {
    try {
      await rpc('tuna_fcm_unsubscribe', { p_token: fcmToken });
      fcmToken = null;
      console.log('[FCM] Unsubscribed');
    } catch (e) {
      console.error('[FCM] Unsubscribe failed:', e);
    }
  }
}

export function getNotificationStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function isSubscribed() {
  return fcmToken !== null;
}
