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

      // URL WhatsApp diretta con testo pre-compilato (se disponibile numero e messaggio).
      const rawPhone = (client?.phone || "").replace(/\D/g, "");
      const waText   = r.message || ("Ciao " + nome + "!");
      const waUrl    = rawPhone
        ? "https://wa.me/" + rawPhone + "?text=" + encodeURIComponent(waText)
        : "";

      const APP_URL = "https://chermisiart.github.io/promemoria-chermisiart/";

      const message = {
        // notification top-level: necessario per svegliare Chrome Android.
        // Con onBackgroundMessage registrato nel SW, Firebase lo chiama comunque
        // e il nostro handler mostra la notifica ricca con data.waUrl.
        notification: { title: TITLE, body: BODY },

        data: {
          title:      TITLE,
          body:       BODY,
          reminderId: r.id,
          clientName: nome,
          phone:      client?.phone || "",
          message:    r.message     || "",
          waUrl:      waUrl,
        },

        android: { priority: "high" },

        webpush: {
          headers:     { Urgency: "high" },
          fcm_options: { link: APP_URL },
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
