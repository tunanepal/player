/* Tunanepal — Firebase Cloud Messaging setup.
   Simpler, more robust version with detailed logging. */

import { rpc } from './api.js';

let fcmToken = null;

export async function initNotifications(playerId) {
  console.log('[FCM] Init started');
  
  // Check browser support
  if (!('Notification' in window)) {
    console.log('[FCM] Notifications not supported');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.log('[FCM] Service workers not supported');
    return;
  }

  // Check Firebase
  if (!window.firebase || !window.firebase.messaging) {
    console.error('[FCM] Firebase not initialized. Check index.html');
    return;
  }

  console.log('[FCM] Firebase ready');

  // Check permission
  if (Notification.permission === 'denied') {
    console.log('[FCM] Notifications denied by user');
    return;
  }

  if (Notification.permission === 'granted') {
    console.log('[FCM] Already granted, subscribing...');
    await subscribe();
    return;
  }

  // Ask for permission
  console.log('[FCM] Requesting permission...');
  try {
    const result = await Notification.requestPermission();
    console.log('[FCM] Permission result:', result);
    if (result === 'granted') {
      await subscribe();
    }
  } catch (e) {
    console.error('[FCM] Permission error:', e);
  }
}

async function subscribe() {
  console.log('[FCM] Subscribe started');
  
  if (!navigator.serviceWorker) {
    console.error('[FCM] Service worker unavailable');
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    console.log('[FCM] Service worker ready:', reg);

    const messaging = firebase.messaging();
    console.log('[FCM] Messaging instance created');

    if (!window.FIREBASE_VAPID_KEY) {
      console.error('[FCM] VAPID key missing from window');
      return;
    }

    console.log('[FCM] Getting token with VAPID key...');
    fcmToken = await messaging.getToken({
      serviceWorkerRegistration: reg,
      vapidKey: window.FIREBASE_VAPID_KEY
    });

    console.log('[FCM] Token received:', fcmToken);

    if (!fcmToken) {
      console.error('[FCM] No token returned');
      return;
    }

    // Send to Supabase
    console.log('[FCM] Storing token in Supabase...');
    const result = await rpc('tuna_fcm_subscribe', { 
      p_token: fcmToken, 
      p_device: 'web' 
    });
    console.log('[FCM] Supabase response:', result);

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
          await rpc('tuna_fcm_subscribe', { p_token: fcmToken, p_device: 'web' });
          console.log('[FCM] Token refreshed');
        }
      } catch (e) {
        console.error('[FCM] Token refresh failed:', e);
      }
    });

    console.log('[FCM] Setup complete!');

  } catch (e) {
    console.error('[FCM] Subscribe error:', e, e.code, e.message);
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
