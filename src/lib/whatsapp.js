import axios from "axios";
import "dotenv/config";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v20.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;

const client = axios.create({
  baseURL: `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`,
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
});

/** Send a plain text message. */
export async function sendText(to, body) {
  return client.post("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
}

/**
 * Send an interactive button message.
 * buttons: [{ id: "clock_in_location", title: "📍 Share location" }, ...]
 * WhatsApp allows max 3 buttons per message.
 */
export async function sendButtons(to, bodyText, buttons) {
  return client.post("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}

/** Request the location the user should share (client sends a location message back). */
export async function requestLocation(to, bodyText) {
  return client.post("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "location_request_message",
      body: { text: bodyText },
      action: { name: "send_location" },
    },
  });
}

/** Mark an inbound message as read (blue ticks). */
export async function markRead(messageId) {
  return client.post("/messages", {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

/** Fetch a media URL from Meta's servers, then download the bytes (for photos). */
export async function downloadMedia(mediaId) {
  const metaRes = await axios.get(`https://graph.facebook.com/${API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const fileRes = await axios.get(metaRes.data.url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    responseType: "arraybuffer",
  });
  return { buffer: fileRes.data, mimeType: metaRes.data.mime_type };
}
