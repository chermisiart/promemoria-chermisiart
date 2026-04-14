importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD9lmycIBZZm7Ef3GumXYBcYEYMLeo4y0c",
  authDomain: "promemoria-chermisiart.firebaseapp.com",
  projectId: "promemoria-chermisiart",
  storageBucket: "promemoria-chermisiart.firebasestorage.app",
  messagingSenderId: "1008023462326",
  appId: "1:1008023462326:web:d31fd9ef1207e6e70e6117"
});

const messaging = firebase.messaging();
const APP_URL   = 'https://chermisiart.github.io/promemoria-chermisiart/';

// Attiva subito il nuovo SW senza aspettare la chiusura di tutti i tab.
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

const ICON = APP_URL + 'icon-192.png';

messaging.onBackgroundMessage(async (payload) => {
  // Se l'app è visibile in foreground, onMessage nel page mostra già la notifica.
  // Evitare la doppia notifica (la nostra + il fallback Chrome).
  const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  const appVisible = allClients.some(c => c.url.startsWith(APP_URL) && c.visibilityState === 'visible');
  if (appVisible) return;

  const d          = payload.data || {};
  const title      = d.title      || '\u23F0 Ch\u00E8rmisiArt \u2014 Promemoria';
  const body       = d.body       || '\u00C8 ora di inviare un messaggio!';
  const waUrl      = d.waUrl      || '';
  const reminderId = d.reminderId || '';
  const tag        = reminderId   || 'reminder';

  return self.registration.showNotification(title, {
    body,
    icon:               ICON,
    badge:              ICON,
    tag,
    renotify:           true,
    requireInteraction: true,
    vibrate:            [200, 100, 200, 100, 400],
    data:               { waUrl, reminderId, url: APP_URL },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const nd         = event.notification.data || {};
  const waUrl      = nd.waUrl      || '';
  const reminderId = nd.reminderId || '';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const appClients = list.filter(c => c.url.startsWith(APP_URL));

      // Cancella il promemoria se l'app è aperta
      if (reminderId) appClients.forEach(c => c.postMessage({ type: 'deleteReminder', id: reminderId }));

      // Tap sulla notifica → apri WhatsApp
      if (waUrl) {
        const del = reminderId ? '&del=' + encodeURIComponent(reminderId) : '';
        const waParam = APP_URL + '?wa=' + encodeURIComponent(waUrl) + del;
        if (appClients.length) {
          // App in memoria: porta in primo piano PRIMA di inviare il redirect
          return appClients[0].focus().then((client) => {
            if (client) client.postMessage({ type: 'openWhatsApp', waUrl });
            else clients.openWindow(waParam);
          });
        }
        return clients.openWindow(waParam);
      }

      // Nessun numero → apri solo l'app
      if (appClients.length) return appClients[0].focus();
      return clients.openWindow(APP_URL);
    })
  );
});
