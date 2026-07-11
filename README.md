# ClockWA Backend

WhatsApp-based attendance and payroll system. Node.js + Express + Supabase + Meta WhatsApp Cloud API.

## How the conversation flow works

1. Employee sends any text message → bot checks what's next for their day (clock_in, lunch_out, lunch_in, or clock_out).
2. **Clock-in** (first event of the day) requires full verification: bot requests location, then a selfie photo, before recording the event.
3. **Lunch out / lunch in / clock-out** are lightweight — just a single button tap, no re-verification, since the employee is already confirmed on site for the day.
4. Every event is timestamped using the *client's send time*, not the server's receive time — this protects against connectivity delays. If the two differ by more than `SYNC_LATE_THRESHOLD_MINUTES`, the event is flagged `synced_late` so you can distinguish "was late" from "message was delayed."

## Setup

### 1. Supabase
- Create a new Supabase project.
- Run `sql/schema.sql` in the SQL editor.
- Create a storage bucket named `clock-in-photos` (Storage → New bucket → set to public, or private with signed URLs if you want stricter photo access control).
- Copy your project URL and **service role key** (Settings → API) into `.env`.

### 2. Meta WhatsApp Cloud API
- Go to Meta Business Manager → WhatsApp → API Setup.
- Get a phone number ID and a permanent access token (System User token, not the 24h temp token).
- Set `WHATSAPP_VERIFY_TOKEN` in `.env` to any random string — you'll enter the same string in Meta's webhook config.
- In Meta's app dashboard, set the webhook URL to `https://your-deployed-url.com/webhook` and the verify token to match.
- Subscribe to the `messages` webhook field.

### 3. Environment
```
cp .env.example .env
# fill in your values
```

### 4. Install & run locally
```
npm install
npm run dev
```

Use [ngrok](https://ngrok.com) or similar to expose your local server for Meta's webhook during development:
```
ngrok http 3000
```

### 5. Deploy
Recommended: **Render** or **Railway** (matches your existing FraisFacile/FleetSafe deployment pattern).
- Push this repo to GitHub.
- Create a new Web Service on Render, connect the repo, set the start command to `npm start`.
- Add all `.env` values as environment variables in the Render dashboard.
- Once deployed, update Meta's webhook URL to point at your Render URL.

## Adding a new client (tenant) onboarding checklist

1. Insert a row into `companies` (currency, standard hours, overtime rate).
2. Insert one row per `sites` (lat/long + radius for the geofence).
3. Insert one row per `employees` (WhatsApp number in E.164 format, assign to a site, set `language`).
4. Test with your own number first before rolling out to the client's staff.

## What's not built yet (roadmap)

- **Admin dashboard** (the live roster / payroll export UI) — separate PWA project, same pattern as FraisFacile.
- **Shift swap flow** — schema (`shift_swaps` table) is ready; conversation flow to be added.
- **USSD fallback** — requires a telco aggregator integration (Africa's Talking or similar), scope as phase 2.
- **Payroll export endpoint** — a `GET /export/:companyId?month=` route that aggregates `clock_events` into CSV.
- **PIN-based admin auth** — matching your other products' pattern, to replace/complement Supabase Auth for the dashboard.
