import { supabase } from "./supabase.js";
import { isWithinGeofence } from "./geofence.js";

const EVENT_ORDER = ["clock_in", "lunch_out", "lunch_in", "clock_out"];

/** Returns the start of "today" in the server's local time as an ISO string. */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Look up an employee by their WhatsApp number (E.164, e.g. +27821234567).
 */
export async function findEmployeeByWhatsApp(whatsappNumber) {
  const { data, error } = await supabase
    .from("employees")
    .select("*, sites(*), companies(*)")
    .eq("whatsapp_number", whatsappNumber)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Get today's clock events for an employee, in chronological order.
 */
export async function getTodayEvents(employeeId) {
  const { data, error } = await supabase
    .from("clock_events")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("client_timestamp", startOfToday())
    .order("client_timestamp", { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Determine the next event type expected from this employee today.
 * Returns null if the day is already complete (clocked out).
 */
export async function getNextEventType(employeeId) {
  const events = await getTodayEvents(employeeId);
  const doneTypes = events.map((e) => e.event_type);

  for (const type of EVENT_ORDER) {
    if (!doneTypes.includes(type)) return type;
  }
  return null; // day complete
}

/**
 * Record a clock event. Only clock_in requires geofence + photo verification
 * by convention — lunch/clock_out are lightweight taps once the day has started.
 */
export async function recordClockEvent({
  employeeId,
  siteId,
  eventType,
  clientTimestamp,
  latitude,
  longitude,
  photoUrl,
}) {
  const { data: site } = await supabase.from("sites").select("*").eq("id", siteId).maybeSingle();

  let withinGeofence = null;
  if (latitude != null && longitude != null && site) {
    withinGeofence = isWithinGeofence(latitude, longitude, site);
  }

  const now = new Date();
  const clientTime = new Date(clientTimestamp);
  const lagMinutes = (now - clientTime) / 60000;
  const syncedLate = lagMinutes > Number(process.env.SYNC_LATE_THRESHOLD_MINUTES || 5);

  const { data, error } = await supabase
    .from("clock_events")
    .insert({
      employee_id: employeeId,
      site_id: siteId,
      event_type: eventType,
      client_timestamp: clientTimestamp,
      latitude,
      longitude,
      within_geofence: withinGeofence,
      photo_url: photoUrl || null,
      synced_late: syncedLate,
    })
    .select()
    .single();

  if (error) throw error;

  // Flag an alert if this clock-in landed outside the geofence.
  if (eventType === "clock_in" && withinGeofence === false) {
    const { data: emp } = await supabase.from("employees").select("company_id, full_name").eq("id", employeeId).single();
    await supabase.from("alerts").insert({
      company_id: emp.company_id,
      employee_id: employeeId,
      alert_type: "out_of_zone",
      message: `${emp.full_name} clocked in outside the authorised zone for ${site?.name || "their site"}.`,
      severity: "warning",
    });
  }

  return data;
}

/**
 * Compute total worked hours for an employee for a given day from their four events.
 * Returns null if the day isn't complete yet.
 */
export function computeHoursWorked(events) {
  const byType = Object.fromEntries(events.map((e) => [e.event_type, new Date(e.client_timestamp)]));
  if (!byType.clock_in || !byType.clock_out) return null;

  let totalMs = byType.clock_out - byType.clock_in;
  if (byType.lunch_out && byType.lunch_in) {
    totalMs -= byType.lunch_in - byType.lunch_out;
  }
  return Math.round((totalMs / 3600000) * 100) / 100; // hours, 2dp
}
