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

// ── Cache API: persiste l'azione WhatsApp anche se il SW viene killato ──
const PENDING_CACHE = 'chermisi-pending-v1';
const PENDING_KEY   = '/pending-wa';

async function savePendingWa(data) {
  const cache = await caches.open(PENDING_CACHE);
  await cache.put(PENDING_KEY, new Response(JSON.stringify(data)));
}
async function getPendingWa() {
  const cache = await caches.open(PENDING_CACHE);
  const res   = await cache.match(PENDING_KEY);
  return res ? res.json() : null;
}
async function clearPendingWa() {
  const cache = await caches.open(PENDING_CACHE);
  await cache.delete(PENDING_KEY);
}

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
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      const appClients = list.filter(c => c.url.startsWith(APP_URL));

      if (waUrl) {
        if (appClients.length) {
          // App già aperta: porta in primo piano e invia messaggio diretto
          const client = await appClients[0].focus();
          if (client) {
            client.postMessage({ type: 'openWhatsApp', waUrl, reminderId });
            return;
          }
        }
        // App chiusa: salva l'azione in Cache API e apri l'app normalmente.
        // Quando Firebase sarà pronto, l'app manderà 'appReady' e noi risponderemo.
        await savePendingWa({ waUrl, reminderId });
        return clients.openWindow(APP_URL);
      }

      // Nessun URL WhatsApp: cancella il promemoria (se aperta) e apri/focalizza l'app
      if (reminderId) appClients.forEach(c => c.postMessage({ type: 'deleteReminder', id: reminderId }));
      if (appClients.length) return appClients[0].focus();
      return clients.openWindow(APP_URL);
    })
  );
});

// L'app manda 'appReady' dopo che Firebase è inizializzato.
// Se c'è un'azione WhatsApp salvata in cache, la inviamo all'app.
self.addEventListener('message', async (event) => {
  if (event.data?.type === 'appReady') {
    const pending = await getPendingWa();
    if (pending?.waUrl) {
      await clearPendingWa();
      if (event.source) {
        event.source.postMessage({
          type:       'openWhatsApp',
          waUrl:      pending.waUrl,
          reminderId: pending.reminderId || '',
        });
      }
    }
  }
});
