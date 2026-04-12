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

    // Leggi token FCM salvati
    const tokenSnap = await db.collection("fcm_tokens").get();
    if (tokenSnap.empty) return;
    const tokens = tokenSnap.docs.map(d => d.data().token).filter(Boolean);
    if (!tokens.length) return;

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

      const message = {
        notification: {
          title: "â° ChÃ¨rmisiArt â€” Promemoria",
          body: `Ãˆ ora di scrivere a ${nome} su WhatsApp!`,
        },
        data: {
          reminderId: r.id,
          clientName: nome,
          phone: client?.phone || "",
        },
        tokens,
      };

      try {
        await messaging.sendEachForMulticast(message);
        console.log(`Notifica inviata per ${nome} (${r.id})`);
      } catch (e) {
        console.error("Errore invio notifica:", e);
      }
    }
  }
);
