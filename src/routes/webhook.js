import { Router } from "express";
import "dotenv/config";
import { sendText, sendButtons, requestLocation, downloadMedia } from "../lib/whatsapp.js";
import { findEmployeeByWhatsApp, getNextEventType, recordClockEvent, getTodayEvents, computeHoursWorked } from "../lib/attendance.js";
import { t } from "../lib/messages.js";
import { supabase } from "../lib/supabase.js";

const router = Router();

// ------------------------------------------------------------------
// In-memory session store: tracks multi-step clock-in state
// (location received, waiting for photo, etc.) per WhatsApp number.
//
// NOTE for production: this resets on server restart / doesn't scale
// across multiple instances. Swap for a Redis store or a `sessions`
// table in Supabase once you're past the pilot and running >1 dyno.
// ------------------------------------------------------------------
const sessions = new Map();

function getSession(waNumber) {
  if (!sessions.has(waNumber)) sessions.set(waNumber, {});
  return sessions.get(waNumber);
}

// ------------------------------------------------------------------
// GET /webhook — Meta's webhook verification handshake
// ------------------------------------------------------------------
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ------------------------------------------------------------------
// POST /webhook — incoming WhatsApp messages
// ------------------------------------------------------------------
router.post("/", async (req, res) => {
  // Always 200 immediately so Meta doesn't retry-storm us; process async.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    if (!message) return; // could be a status update callback, ignore

    const from = `+${message.from}`; // Meta sends without leading +
    const employee = await findEmployeeByWhatsApp(from);

    if (!employee) {
      await sendText(from, t("en", "notRegistered") + "\n\n" + t("fr", "notRegistered"));
      return;
    }

    const lang = employee.language || "en";
    const session = getSession(from);

    // --- Button reply (lunch_out / lunch_in / clock_out confirmations) ---
    if (message.type === "interactive" && message.interactive?.type === "button_reply") {
      const buttonId = message.interactive.button_reply.id;
      await handleButtonReply({ employee, buttonId, lang, from });
      return;
    }

    // --- Location message (part of clock_in flow) ---
    if (message.type === "location") {
      session.location = {
        latitude: message.location.latitude,
        longitude: message.location.longitude,
      };
      await sendText(from, t(lang, "askPhoto"));
      return;
    }

    // --- Image message (completes clock_in flow) ---
    if (message.type === "image") {
      const { buffer, mimeType } = await downloadMedia(message.image.id);
      const photoUrl = await uploadClockInPhoto(employee.id, buffer, mimeType);

      if (!session.location) {
        await requestLocation(from, t(lang, "askLocation"));
        return;
      }

      const event = await recordClockEvent({
        employeeId: employee.id,
        siteId: employee.site_id,
        eventType: "clock_in",
        clientTimestamp: new Date().toISOString(),
        latitude: session.location.latitude,
        longitude: session.location.longitude,
        photoUrl,
      });

      sessions.delete(from);

      const timeStr = formatTime(event.client_timestamp);
      await sendText(from, t(lang, "clockInDone", timeStr));
      if (event.within_geofence === false) {
        await sendText(from, t(lang, "outOfZone"));
      }
      return;
    }

    // --- Plain text message: figure out what's next for this employee today ---
    if (message.type === "text") {
      await promptNextStep({ employee, lang, from });
      return;
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
});

// ------------------------------------------------------------------
// Determine and send the next expected step for the employee.
// ------------------------------------------------------------------
async function promptNextStep({ employee, lang, from }) {
  const nextType = await getNextEventType(employee.id);

  if (nextType === null) {
    await sendText(from, t(lang, "dayComplete"));
    return;
  }

  if (nextType === "clock_in") {
    // Clock-in needs full verification: location first, then photo.
    await requestLocation(from, t(lang, "askLocation"));
    return;
  }

  if (nextType === "lunch_out") {
    await sendButtons(from, t(lang, "lunchOutPrompt"), [{ id: "lunch_out", title: t(lang, "lunchOutBtn") }]);
    return;
  }
  if (nextType === "lunch_in") {
    await sendButtons(from, t(lang, "lunchInPrompt"), [{ id: "lunch_in", title: t(lang, "lunchInBtn") }]);
    return;
  }
  if (nextType === "clock_out") {
    await sendButtons(from, t(lang, "endPrompt"), [{ id: "clock_out", title: t(lang, "endBtn") }]);
    return;
  }
}

// ------------------------------------------------------------------
// Handle a lightweight button-tap event (lunch_out / lunch_in / clock_out).
// These don't require photo/location re-verification — only the first
// clock-in of the day does.
// ------------------------------------------------------------------
async function handleButtonReply({ employee, buttonId, lang, from }) {
  if (!["lunch_out", "lunch_in", "clock_out"].includes(buttonId)) return;

  const event = await recordClockEvent({
    employeeId: employee.id,
    siteId: employee.site_id,
    eventType: buttonId,
    clientTimestamp: new Date().toISOString(),
  });

  const timeStr = formatTime(event.client_timestamp);

  if (buttonId === "lunch_out") {
    await sendText(from, t(lang, "lunchOutDone", timeStr));
  } else if (buttonId === "lunch_in") {
    await sendText(from, t(lang, "lunchInDone", timeStr));
  } else if (buttonId === "clock_out") {
    const events = await getTodayEvents(employee.id);
    const hours = computeHoursWorked(events);
    await sendText(from, t(lang, "endDone", timeStr, hours));

    // Flag overtime if hours exceed the company's standard daily hours.
    if (hours && employee.companies?.standard_daily_hours && hours > employee.companies.standard_daily_hours) {
      await supabase.from("alerts").insert({
        company_id: employee.company_id,
        employee_id: employee.id,
        alert_type: "overtime",
        message: `${employee.full_name} logged ${hours}h today, ${(hours - employee.companies.standard_daily_hours).toFixed(1)}h over standard hours.`,
        severity: "info",
      });
    }
  }
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Upload the clock-in selfie to Supabase Storage and return a public URL.
 * Assumes a 'clock-in-photos' storage bucket already exists (see README).
 */
async function uploadClockInPhoto(employeeId, buffer, mimeType) {
  const ext = mimeType.split("/")[1] || "jpg";
  const path = `${employeeId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from("clock-in-photos").upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("clock-in-photos").getPublicUrl(path);
  return data.publicUrl;
}

export default router;
