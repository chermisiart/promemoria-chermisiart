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

const APP_URL = 'https://chermisiart.github.io/promemoria-chermisiart/';

// Gestisce i messaggi in background (app chiusa o non in focus).
messaging.onBackgroundMessage((payload) => {
  const title = payload.data?.title || '\u23F0 Ch\u00E8rmisiArt \u2014 Promemoria';
  const body  = payload.data?.body  || '\u00C8 ora di inviare un messaggio!';
  const tag   = payload.data?.reminderId || 'reminder';

  return self.registration.showNotification(title, {
    body,
    icon:             '/promemoria-chermisiart/icon-192.png',
    badge:            '/promemoria-chermisiart/icon-192.png',
    requireInteraction: true,
    vibrate:          [200, 100, 200, 100, 400],
    tag,
    renotify:         true,   // ri-vibra anche se esiste già una notifica con lo stesso tag
    data:             { url: APP_URL, ...payload.data },
    actions: [
      { action: 'open', title: 'Apri app' },
      { action: 'dismiss', title: 'Ignora' },
    ],
  });
});

// Click sulla notifica o sull'azione "open": porta in primo piano l'app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const target = event.notification.data?.url || APP_URL;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Se l'app è già aperta in un tab, portala in focus
      for (const client of list) {
        if (client.url.startsWith(APP_URL) && 'focus' in client) {
          return client.focus();
        }
      }
      // Altrimenti apri una nuova finestra
      return clients.openWindow(target);
    })
  );
});
