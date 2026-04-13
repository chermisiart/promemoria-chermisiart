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
// Nota: con webpush.notification nel payload, Firebase SDK potrebbe non chiamare
// questo handler — le opzioni ricche sono quindi impostate anche lato server.
// Questo rimane come backup per i casi in cui Firebase lo chiama.
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

// Click sulla notifica o sulle azioni
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  // ── Azione WhatsApp: apre WA con messaggio precompilato e cancella il promemoria ──
  if (event.action === 'whatsapp') {
    const data       = event.notification.data || {};
    const reminderId = data.reminderId || '';
    // Usa waUrl pre-costruita dal server (se disponibile), altrimenti la costruisce dal numero
    const waUrl = data.waUrl || (() => {
      const phone   = (data.phone || '').replace(/\D/g, '');
      const message = data.message || '';
      return phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message) : null;
    })();

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        const appClients = list.filter(c => c.url.startsWith(APP_URL));
        // Notifica l'app aperta di cancellare il promemoria
        if (reminderId) appClients.forEach(c => c.postMessage({ type: 'deleteReminder', id: reminderId }));
        const tasks = [];
        if (waUrl) tasks.push(clients.openWindow(waUrl));
        // Se l'app non è aperta, aprila con il param per la cancellazione
        if (!appClients.length && reminderId) {
          tasks.push(clients.openWindow(APP_URL + '?deleteReminder=' + encodeURIComponent(reminderId)));
        }
        return Promise.all(tasks);
      })
    );
    return;
  }

  // ── Azione "open" o tap sulla notifica: porta in primo piano l'app ──
  const target = event.notification.data?.url || APP_URL;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(APP_URL) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
