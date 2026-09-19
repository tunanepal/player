/* Tunanepal — Firebase Cloud Messaging setup.

   Call initNotifications() on app startup to request permission and subscribe.
   Notifications will show on the lock screen and home screen even when the
   app is closed. */

import { rpc } from './api.js';

let fcmToken = null;

export async function initNotifications() {
  // Skip if the browser doesn't support notifications
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.log('Notifications not supported');
    return;
  }

  // Skip if the user has already denied (or never will get asked again)
  if (Notification.permission === 'denied') {
    console.log('Notifications denied by user');
    return;
  }

  // If already granted, subscribe silently
  if (Notification.permission === 'granted') {
    subscribeToNotifications();
    return;
  }

  // Otherwise, ask for permission
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      subscribeToNotifications();
    }
  } catch (e) {
    console.error('Notification permission error:', e);
  }
}

async function subscribeToNotifications() {
  if (!('serviceWorker' in navigator)) return;

  try {
    // Get the service worker registration
    const reg = await navigator.serviceWorker.ready;

    // Firebase SDK must be imported in your HTML
    // <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js"></script>
    // <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging.js"></script>
    // And initialized with your Firebase config

    if (!window.firebase || !window.firebase.messaging) {
      console.warn('Firebase messaging not initialized. See comments in notifications.js');
      return;
    }

    const messaging = firebase.messaging();

    // Get the FCM token
    try {
      fcmToken = await messaging.getToken({
        serviceWorkerRegistration: reg,
        vapidKey: window.FIREBASE_VAPID_KEY  // set this in your config.js
      });

      if (fcmToken) {
        console.log('FCM token:', fcmToken);
        // Send the token to Supabase so the backend can send notifications
        await rpc('tuna_fcm_subscribe', { p_token: fcmToken, p_device: 'web' });
      }
    } catch (e) {
      console.error('Failed to get FCM token:', e);
    }

    // Handle token refresh (Firebase refreshes periodically)
    messaging.onTokenRefresh(async () => {
      try {
        const newToken = await messaging.getToken({
          serviceWorkerRegistration: reg,
          vapidKey: window.FIREBASE_VAPID_KEY
        });
        if (newToken && newToken !== fcmToken) {
          fcmToken = newToken;
          await rpc('tuna_fcm_subscribe', { p_token: fcmToken, p_device: 'web' });
          console.log('FCM token refreshed');
        }
      } catch (e) {
        console.error('Token refresh failed:', e);
      }
    });
  } catch (e) {
    console.error('Notification setup failed:', e);
  }
}

export async function unsubscribeFromNotifications() {
  if (fcmToken) {
    try {
      await rpc('tuna_fcm_unsubscribe', { p_token: fcmToken });
      fcmToken = null;
    } catch (e) {
      console.error('Unsubscribe failed:', e);
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
