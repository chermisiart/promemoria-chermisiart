const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const APP_URL = "https://chermisiart.github.io/promemoria-chermisiart/";
const ICON    = APP_URL + "icon-192.png";

// Sequenza automatica dei richiami: dopo lo stage 1 (follow-up) inviato, se la cliente non
// riprenota entro N giorni si genera e invia SUBITO lo stage successivo (mai in anticipo,
// mai come promemoria "in attesa" visibile). Dopo lo stage finale (recupero) non resta nulla:
// la "sveglia" si spegne, l'eventuale cliente rimasta scoperta si vede solo nella lista
// "da recuperare" in app come rete di sicurezza finale.
const NEXT_STAGE = {
  followup:  { type: "sollecito", afterDays: 7,  defaultText: "Ciao {nome}! Ti ricordi il messaggio che ti ho mandato qualche giorno fa? Fammi sapere quando hai un attimo per riprenotare 😊" },
  sollecito: { type: "recupero",  afterDays: 21, defaultText: "Ciao {nome}, ho visto che è passato un po' di tempo dalla tua ultima {trattamento}. Se vuoi riprenotare, scrivimi pure quando preferisci 😊" },
};

function fillTemplate(text, vars) {
  return (text || "")
    .replace(/{nome}/gi, vars.nome || "")
    .replace(/{trattamento}/gi, vars.trattamento || "");
}

function buildPushMessage({ token, nome, phone, testo, tag }) {
  const TITLE = "⏰ ChèrmisiArt — Promemoria";
  const BODY  = "È ora di scrivere a " + nome + " su WhatsApp!";

  const rawPhone = (phone || "").replace(/\D/g, "");
  const waText   = testo || ("Ciao " + nome + "!");
  const waNum  = rawPhone.startsWith('39') ? rawPhone : '39' + (rawPhone.startsWith('0') ? rawPhone.slice(1) : rawPhone);
  const waUrl  = rawPhone
    ? "https://api.whatsapp.com/send?phone=" + waNum + "&text=" + encodeURIComponent(waText)
    : "";

  const actions = waUrl
    ? [{ action: "whatsapp", title: "💬 WhatsApp" }, { action: "dismiss", title: "Ignora" }]
    : [{ action: "open",     title: "Apri app" },              { action: "dismiss", title: "Ignora" }];

  return {
    data: { title: TITLE, body: BODY, reminderId: tag || "", clientName: nome, phone: phone || "", message: testo || "", waUrl },
    android: { priority: "high" },
    webpush: {
      headers: { Urgency: "high" },
      notification: {
        title: TITLE, body: BODY, icon: ICON, badge: ICON,
        tag: tag || "reminder", requireInteraction: true, renotify: true,
        vibrate: [200, 100, 200, 100, 400],
        data: { waUrl, reminderId: tag || "" },
        actions,
      },
      fcm_options: { link: APP_URL },
    },
    token,
  };
}

exports.sendReminderNotifications = onSchedule(
  { schedule: "every 1 minutes", timeZone: "Europe/Rome" },
  async () => {
    const db = getFirestore();
    const messaging = getMessaging();

    // Leggi UID del proprietario dalla configurazione
    const configSnap = await db.collection("chermisiart").doc("config").get();
    if (!configSnap.exists) { console.log('Nessun config trovato'); return; }
    const ownerUid = configSnap.data().ownerUid;
    if (!ownerUid) { console.log('Owner UID non configurato'); return; }

    // Leggi token FCM dal percorso sicuro
    const tokenSnap = await db.doc(`users/${ownerUid}/config/fcm_token`).get();
    if (!tokenSnap.exists) { console.log('Nessun token FCM trovato'); return; }
    const token = tokenSnap.data().token;
    if (!token) { console.log('Token vuoto'); return; }

    const remRef = db.doc(`users/${ownerUid}/data/chermisi_reminders`);
    const cliRef = db.doc(`users/${ownerUid}/data/chermisi_clients`);
    const tplRef = db.doc(`users/${ownerUid}/data/chermisi_templates`);

    const [remSnap, cliSnap, tplSnap] = await Promise.all([remRef.get(), cliRef.get(), tplRef.get()]);
    if (!remSnap.exists) return;
    let reminders = JSON.parse(remSnap.data().data || "[]");
    let clients   = cliSnap.exists ? JSON.parse(cliSnap.data().data || "[]") : [];
    const templates = tplSnap.exists ? JSON.parse(tplSnap.data().data || "[]") : [];

    const now = new Date();
    const windowMs = 60 * 1000; // finestra di 1 minuto

    // sendAt è salvato come orario locale italiano (es. "2026-04-14T19:00") senza timezone.
    // La Function gira in UTC, quindi new Date("2026-04-14T19:00") lo interpreta come UTC.
    // Fix: convertiamo "now" in orario italiano locale con lo stesso trucco,
    // così il confronto avviene tra due valori nello stesso "spazio" (locale italiano).
    const nowItaly = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    const pad = n => String(n).padStart(2, '0');
    const todayStr = nowItaly.getFullYear() + '-' + pad(nowItaly.getMonth() + 1) + '-' + pad(nowItaly.getDate());

    let remindersChanged = false;
    let clientsChanged = false;

    // ── 1) Promemoria normali in scadenza (conferma, appuntamento, ciclo, compleanno, stage 1 follow-up) ──
    const toSend = reminders.filter(r => {
      if (r.status !== "pending") return false;
      const sendAt = new Date(r.sendAt);
      const diff = sendAt - nowItaly;
      return diff >= 0 && diff < windowMs;
    });

    for (const r of toSend) {
      const client = clients.find(c => c.id === r.clientId);
      const nome = client?.name || "cliente";
      const message = buildPushMessage({ token, nome, phone: client?.phone, testo: r.message, tag: r.id });

      let sent = false;
      try {
        const result = await messaging.send(message);
        console.log(`Notifica inviata per ${nome} (${r.id}, ${r.type}): ${result}`);
        sent = true;
      } catch (e) {
        console.error("Errore invio notifica:", e);
      }
      if (!sent) continue;

      // Stage 1 (follow-up) inviato: non resta "in attesa" — si accende la "sveglia" invisibile
      // per lo stage successivo, che scatterà da sola quando sarà il momento.
      if (r.autoGenerated && r.type === "followup" && client) {
        const idx = clients.findIndex(c => c.id === r.clientId);
        if (idx !== -1) {
          const pipelines = Array.isArray(clients[idx].recallPipelines) ? clients[idx].recallPipelines : [];
          pipelines.push({ categorieIds: r.categorieIds || [], trattamento: r.trattamento || "", stage: 1, firedAt: todayStr });
          clients[idx] = { ...clients[idx], recallPipelines: pipelines };
          clientsChanged = true;
        }
      }
      if (r.autoGenerated && ["followup", "sollecito", "recupero"].includes(r.type)) {
        reminders = reminders.filter(x => x.id !== r.id);
        remindersChanged = true;
      }
    }

    // ── 2) "Sveglie" invisibili: controlla se per qualche cliente è scattato il momento
    //     di generare E inviare, nello stesso istante, lo stage successivo del richiamo ──
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const pipelines = Array.isArray(client.recallPipelines) ? client.recallPipelines : [];
      if (!pipelines.length) continue;
      const remaining = [];
      let changed = false;
      for (const p of pipelines) {
        const next = NEXT_STAGE[p.stage === 1 ? "followup" : "sollecito"];
        const fireDate = new Date(p.firedAt + "T10:00");
        const dueDate = new Date(fireDate.getTime() + next.afterDays * 86400000);
        const diff = dueDate - nowItaly;
        if (!(diff >= 0 && diff < windowMs)) { remaining.push(p); continue; }

        const tpl = templates.find(t => t.type === next.type);
        const firstName = (client.name || "").split(" ")[0];
        const testo = fillTemplate(tpl ? tpl.text : next.defaultText, { nome: firstName, trattamento: p.trattamento });
        const message = buildPushMessage({ token, nome: client.name || "cliente", phone: client.phone, testo, tag: "richiamo_" + client.id + "_" + next.type });
        try {
          const result = await messaging.send(message);
          console.log(`Richiamo automatico (${next.type}) inviato per ${client.name} (${client.id}): ${result}`);
        } catch (e) {
          console.error("Errore invio richiamo automatico:", e);
          remaining.push(p); // riprova al prossimo giro se l'invio fallisce
          continue;
        }
        changed = true;
        // Stage "recupero" = finale: non si ripubblica nulla, la sveglia si spegne
        if (next.type !== "recupero") remaining.push({ ...p, stage: 2, firedAt: todayStr });
      }
      if (changed) {
        clients[i] = { ...client, recallPipelines: remaining };
        clientsChanged = true;
      }
    }

    if (remindersChanged) await remRef.set({ data: JSON.stringify(reminders), updatedAt: new Date().toISOString() });
    if (clientsChanged)   await cliRef.set({ data: JSON.stringify(clients),   updatedAt: new Date().toISOString() });
  }
);
