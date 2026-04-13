// Service Worker per notifiche push FCM.
// Non usa firebase-messaging-compat (che ignora le actions nel payload),
// gestisce invece direttamente l'evento push raw per controllo completo.
// Il token FCM è gestito dalla pagina tramite Firebase JS SDK — il SW non lo tocca.

const APP_URL = 'https://chermisiart.github.io/promemoria-chermisiart/';

// Attiva subito il nuovo SW senza aspettare la chiusura di tutti i tab.
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); } catch (e) { return; }

  // FCM mappa webpush.notification → payload.notification
  // e il campo data top-level → payload.data
  const notif = payload.notification || {};
  const data  = payload.data         || {};

  const title   = notif.title   || data.title   || '\u23F0 Ch\u00E8rmisiArt \u2014 Promemoria';
  const body    = notif.body    || data.body     || '\u00C8 ora di inviare un messaggio!';
  const tag     = notif.tag     || data.reminderId || 'reminder';
  const icon    = notif.icon    || '/promemoria-chermisiart/icon-192.png';
  const badge   = notif.badge   || '/promemoria-chermisiart/icon-192.png';
  const vibrate = notif.vibrate || [200, 100, 200, 100, 400];

  // waUrl: preferisce quello pre-costruito dal server
  const waUrl = (notif.data && notif.data.waUrl) || data.waUrl || '';

  const actions = notif.actions && notif.actions.length
    ? notif.actions
    : waUrl
      ? [{ action: 'whatsapp', title: '\uD83D\uDCAC WhatsApp' }, { action: 'dismiss', title: 'Ignora' }]
      : [{ action: 'open',     title: 'Apri app' },              { action: 'dismiss', title: 'Ignora' }];

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      requireInteraction: notif.requireInteraction !== false,
      vibrate,
      tag,
      renotify: true,
      data: { url: APP_URL, waUrl, ...data, ...(notif.data || {}) },
      actions,
    })
  );
});

// Click sulla notifica o sulle azioni
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  // ── Azione WhatsApp: apre WA con messaggio precompilato e cancella il promemoria ──
  if (event.action === 'whatsapp') {
    const d          = event.notification.data || {};
    const reminderId = d.reminderId || '';
    const waUrl      = d.waUrl || (() => {
      const phone   = (d.phone || '').replace(/\D/g, '');
      const message = d.message || '';
      return phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message) : null;
    })();

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        const appClients = list.filter(c => c.url.startsWith(APP_URL));
        if (reminderId) appClients.forEach(c => c.postMessage({ type: 'deleteReminder', id: reminderId }));
        const tasks = [];
        if (waUrl) tasks.push(clients.openWindow(waUrl));
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
