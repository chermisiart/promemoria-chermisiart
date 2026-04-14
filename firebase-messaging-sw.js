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

// Gestisce i messaggi in background (app chiusa o non in focus).
messaging.onBackgroundMessage((payload) => {
  const title = payload.data?.title || payload.notification?.title || '\u23F0 Ch\u00E8rmisiArt \u2014 Promemoria';
  const body  = payload.data?.body  || payload.notification?.body  || '\u00C8 ora di inviare un messaggio!';
  const tag   = payload.data?.reminderId || 'reminder';
  const waUrl = payload.data?.waUrl || '';

  const actions = waUrl
    ? [{ action: 'whatsapp', title: '\uD83D\uDCAC WhatsApp' }, { action: 'dismiss', title: 'Ignora' }]
    : [{ action: 'open',     title: 'Apri app' },              { action: 'dismiss', title: 'Ignora' }];

  return self.registration.showNotification(title, {
    body,
    icon:               '/promemoria-chermisiart/icon-192.png',
    badge:              '/promemoria-chermisiart/icon-192.png',
    requireInteraction: true,
    vibrate:            [200, 100, 200, 100, 400],
    tag,
    renotify:           true,
    data:               { url: APP_URL, waUrl, ...payload.data },
    actions,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const d          = event.notification.data || {};
  const reminderId = d.reminderId || '';
  const waUrl      = d.waUrl || (() => {
    const phone   = (d.phone || '').replace(/\D/g, '');
    const message = d.message || '';
    return phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message) : '';
  })();

  const openWa = event.action === 'whatsapp' || event.action === '' || event.action === 'open';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const appClients = list.filter(c => c.url.startsWith(APP_URL));

      if (reminderId) appClients.forEach(c => c.postMessage({ type: 'deleteReminder', id: reminderId }));

      if (openWa && waUrl) {
        if (appClients.length) {
          // App aperta: invia postMessage → l'app fa window.location.href (nessun popup blocker)
          appClients[0].postMessage({ type: 'openWhatsApp', waUrl });
          return appClients[0].focus();
        }
        // App chiusa: aprila con ?wa= così la rileva al caricamento
        const del = reminderId ? '&del=' + encodeURIComponent(reminderId) : '';
        return clients.openWindow(APP_URL + '?wa=' + encodeURIComponent(waUrl) + del);
      }

      // Nessun numero o azione open: porta solo in primo piano l'app
      if (appClients.length) return appClients[0].focus();
      return clients.openWindow(APP_URL);
    })
  );
});
