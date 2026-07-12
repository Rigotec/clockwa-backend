export const MSG = {
  en: {
    notRegistered: "This number isn't registered with your employer's ClockWA system. Please contact your supervisor.",
    askLocation: "Please share your location to confirm your arrival on site.",
    askPhoto: "Thanks — now please send a quick selfie to confirm your identity.",
    clockInDone: (time) => `✅ Clock-in recorded — ${time}`,
    lunchOutPrompt: "Tap below when you leave for lunch.",
    lunchOutBtn: "🍽️ Starting lunch",
    lunchOutDone: (time) => `✅ Lunch break started — ${time}`,
    lunchInPrompt: "Tap below when you're back on site.",
    lunchInBtn: "▶️ Back from lunch",
    lunchInDone: (time) => `✅ Lunch break ended — ${time}`,
    endPrompt: "Tap below when you finish for the day.",
    endBtn: "🏁 End of shift",
    endDone: (time, hours) => `✅ Clock-out recorded — ${time}\nHours today: ${hours ?? "—"}`,
    dayComplete: "You've already completed all clock events for today. See you tomorrow!",
    outOfZone: "⚠️ You appear to be outside the authorised site zone. Your clock-in was recorded and flagged for your supervisor.",
  },
  fr: {
    notRegistered: "Ce numéro n'est pas enregistré dans le système ClockWA de votre employeur. Contactez votre superviseur.",
    askLocation: "Veuillez partager votre position pour confirmer votre arrivée sur site.",
    askPhoto: "Merci — envoyez maintenant un selfie rapide pour confirmer votre identité.",
    clockInDone: (time) => `✅ Pointage enregistré — ${time}`,
    lunchOutPrompt: "Appuyez ci-dessous en partant en pause déjeuner.",
    lunchOutBtn: "🍽️ Départ en pause",
    lunchOutDone: (time) => `✅ Pause déjeuner commencée — ${time}`,
    lunchInPrompt: "Appuyez ci-dessous à votre retour sur site.",
    lunchInBtn: "▶️ Retour de pause",
    lunchInDone: (time) => `✅ Pause déjeuner terminée — ${time}`,
    endPrompt: "Appuyez ci-dessous en terminant votre journée.",
    endBtn: "🏁 Fin de service",
    endDone: (time, hours) => `✅ Sortie enregistrée — ${time}\nHeures aujourd'hui : ${hours ?? "—"}`,
    dayComplete: "Vous avez déjà terminé tous les pointages d'aujourd'hui. À demain !",
    outOfZone: "⚠️ Vous semblez être en dehors de la zone autorisée. Votre pointage a été enregistré et signalé à votre superviseur.",
  },
};

export function t(lang, key, ...args) {
  const dict = MSG[lang] || MSG.en;
  const entry = dict[key];
  return typeof entry === "function" ? entry(...args) : entry;
}
