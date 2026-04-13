const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.sendReminderNotifications = onSchedule(
  { schedule: "every 1 minutes", timeZone: "Europe/Rome" },
  async () => {
    const db = getFirestore();
    const messaging = getMessaging();

    // Leggi token FCM salvato
    const tokenSnap = await db.collection("chermisiart").doc("fcm_token_main").get();
    if (!tokenSnap.exists) { console.log('Nessun token FCM trovato'); return; }
    const token = tokenSnap.data().token;
    if (!token) { console.log('Token vuoto'); return; }

    // Leggi i promemoria
    const remSnap = await db.collection("chermisiart").doc("chermisi_reminders").get();
    if (!remSnap.exists) return;
    const reminders = JSON.parse(remSnap.data().data || "[]");

    // Leggi i clienti
    const cliSnap = await db.collection("chermisiart").doc("chermisi_clients").get();
    const clients = cliSnap.exists ? JSON.parse(cliSnap.data().data || "[]") : [];

    const now = new Date();
    const windowMs = 60 * 1000; // finestra di 1 minuto

    const toSend = reminders.filter(r => {
      if (r.status !== "pending") return false;
      const sendAt = new Date(r.sendAt);
      const diff = sendAt - now;
      return diff >= 0 && diff < windowMs;
    });

    if (!toSend.length) return;

    for (const r of toSend) {
      const client = clients.find(c => c.id === r.clientId);
      const nome = client?.name || "cliente";

      const TITLE = "\u23F0 Ch\u00E8rmisiArt \u2014 Promemoria";
      const BODY  = "\u00C8 ora di scrivere a " + nome + " su WhatsApp!";

      const message = {
        // Campo notification: necessario per la priorità alta su Android Chrome
        // e per il fallback automatico del browser se il SW non risponde.
        notification: {
          title: TITLE,
          body:  BODY,
        },

        // Campo data: usato dal SW onBackgroundMessage e dall'onMessage della pagina.
        data: {
          title:       TITLE,
          body:        BODY,
          reminderId:  r.id,
          clientName:  nome,
          phone:       client?.phone || "",
        },

        // Priorità alta per Android: sveglia il dispositivo immediatamente.
        android: {
          priority: "high",
          notification: {
            channel_id:  "promemoria_chermisiart",
            priority:    "high",
            visibility:  "public",
            sound:       "default",
            default_vibrate_timings: true,
          },
        },

        // Urgency alta per Chrome Web Push su Android/Desktop.
        webpush: {
          headers: { Urgency: "high" },
          notification: {
            requireInteraction: true,
            vibrate:            [200, 100, 200, 100, 400],
            icon:               "https://chermisiart.github.io/promemoria-chermisiart/icon-192.png",
            badge:              "https://chermisiart.github.io/promemoria-chermisiart/icon-192.png",
            tag:                r.id || "reminder",
            renotify:           true,
          },
          fcm_options: {
            link: "https://chermisiart.github.io/promemoria-chermisiart/",
          },
        },

        token,
      };

      try {
        const result = await messaging.send(message);
        console.log(`Notifica inviata per ${nome} (${r.id}): ${result}`);
      } catch (e) {
        console.error("Errore invio notifica:", e);
      }
    }
  }
);
