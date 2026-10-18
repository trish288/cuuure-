# Homeclinic24 — Backend & API Documentation

Homeclinic24 is a healthcare appointment booking system with a WhatsApp Cloud API bot, an Express backend, PostgreSQL storage, admin appointment/payment management, and WhatsApp promotional messaging.

This README documents the backend routes found in the project source. Example patient details, IDs, timestamps, and message IDs are illustrative.

## Backend

- **Runtime:** Node.js (package configuration specifies Node.js 18.x)
- **Server:** Express.js
- **Database:** PostgreSQL
- **WhatsApp integration:** Meta WhatsApp Cloud API
- **Deployment:** Railway
- **Production base URL:** `https://cuuure-production.up.railway.app`

> The deployed hostname currently contains `cuuure-production`. Use the exact Railway domain configured for the service. Change it here if the Railway domain changes.

## Run locally

1. Install Node.js 18.x.
2. From the backend project root, install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file using the environment variables described below.
4. Start the backend:

   ```bash
   npm start
   ```

The app starts on `process.env.PORT` or port `3000` locally. The app initializes its database before listening.

### Environment variables

Configure secrets in `.env` locally and in Railway Variables for deployment. **Do not commit `.env`, access tokens, passwords, service-account credentials, or database URLs.**

| Variable | Purpose |
|---|---|
| `PORT` | Port provided by the host; defaults to `3000` locally |
| `DATABASE_URL` | PostgreSQL connection string |
| `NODE_ENV` | Set to `production` in production; database SSL is enabled in that mode |
| `SESSION_SECRET` | Secret used to sign session cookies; set a strong random value |
| `WHATSAPP_TOKEN` or `META_TOKEN` | Meta WhatsApp Cloud API access token |
| `WHATSAPP_PHONE_ID` or `PHONE_NUMBER_ID` | Meta WhatsApp phone-number ID |
| `VERIFY_TOKEN` | Token used when Meta verifies the webhook |
| `GOOGLE_CALENDAR_ID` | Google Calendar integration setting, if used by configured flows |
| `UPI_ID` | UPI payment configuration, if used by configured flows |
| `UPI_NAME` | UPI payee name, if used by configured flows |

The Meta configuration in `meta/config.js` expects a WhatsApp token and phone-number ID. Do not put real secret values in this README.

## API conventions

- Base URL: `https://cuuure-production.up.railway.app`
- JSON endpoints use `Content-Type: application/json`.
- API examples below use the full deployed base URL.
- `/api/admin` is the route prefix for admin data APIs.
- The current CORS configuration allows only `http://localhost:3039`. Ask the frontend developer for the exact local and deployed frontend origins before changing the allowlist.
- The supplied `/api/admin` handlers do not enforce admin authentication. Secure these routes before exposing patient or payment data to a public frontend.

## Endpoint summary

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Backend health/status text |
| `GET` | `/api/admin/appointments` | List appointments |
| `POST` | `/api/admin/appointments` | Create an appointment |
| `PUT` | `/api/admin/appointments/:id` | Update an appointment |
| `GET` | `/api/admin/payments` | List payment requests |
| `POST` | `/api/admin/payments` | Create a payment request |
| `POST` | `/api/admin/promotions/send` | Send opted-in WhatsApp promotions |
| `POST` | `/admin/login` | Admin login; responds with a redirect |
| `GET` | `/admin` | Admin dashboard HTML; requires an admin session |
| `GET` | `/webhook` | Meta WhatsApp webhook verification |
| `POST` | `/webhook` | Receive Meta WhatsApp webhook events |

No appointment deletion endpoint is defined in the supplied admin API router.

---

## 1. Health check

### `GET /`

Full URL: `https://cuuure-production.up.railway.app/`

No request body is required. The current handler returns the text:

```text
Homeclinic24 Healthcare Bot is live ✅
```

This is a text response, not a JSON response.

## 2. Appointments

### `GET /api/admin/appointments`

Lists appointments ordered by most recently created.

**Request body:** None.

**Example:**

```javascript
const response = await fetch(
  "https://cuuure-production.up.railway.app/api/admin/appointments"
);
const result = await response.json();

if (!response.ok || !result.success) {
  throw new Error(result.message || "Could not load appointments");
}
console.log(result.data);
```

**Success response (`200`):**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "patient_name": "Rahul Kumar",
      "phone": "9876543210",
      "age": 25,
      "date": "2026-10-20",
      "time_label": "10:00 AM",
      "time_value": "10",
      "address": "Mysore",
      "location_link": null,
      "doctor_name": "Dr. Example",
      "doctor_specialization": "General Physician",
      "status": "Booked"
    }
  ]
}
```

`data` is the array of database rows. Values above are examples; actual records and field values come from PostgreSQL. `age` can be `null` if there is no matching user age.

**Server error (`500`):**

```json
{
  "success": false,
  "message": "Failed to fetch appointments"
}
```

### `POST /api/admin/appointments`

Creates an appointment manually.

**Headers:** `Content-Type: application/json`

**Request payload:**

```json
{
  "phone": "9876543210",
  "patient_name": "Rahul Kumar",
  "age": 25,
  "date": "2026-10-20",
  "time_label": "10:00 AM",
  "time_value": "10",
  "address": "Mysore",
  "location_link": null,
  "doctor_name": "Dr. Example",
  "doctor_specialization": "General Physician"
}
```

**Required:** `phone`, `patient_name`, `date`, `time_value`, `doctor_name`.

**Optional:** `age`, `time_label`, `address`, `location_link`, `doctor_specialization`.

The phone is normalized by removing non-digits and a leading `91`, then must be 10 digits. The name must contain only English letters and spaces. If supplied, age must be between 1 and 110. Past slots are rejected.

**Success (`200`):**

```json
{
  "success": true,
  "id": 123
}
```

**Possible errors:**

| Status | Message |
|---|---|
| `400` | `Phone number must be exactly 10 digits` |
| `400` | `Patient name must contain only letters and spaces` |
| `400` | `Age must be between 1 and 110` |
| `400` | `Missing required appointment fields` |
| `400` | `Cannot book a date or time that has already passed` |
| `500` | `Failed to add appointment` |

Example error:

```json
{
  "success": false,
  "message": "Missing required appointment fields"
}
```

### `PUT /api/admin/appointments/:id`

Updates an existing appointment. Replace `:id` with the numeric appointment ID.

Example URL: `https://cuuure-production.up.railway.app/api/admin/appointments/123`

**Headers:** `Content-Type: application/json`

**Request payload:**

```json
{
  "phone": "9876543210",
  "patient_name": "Rahul Kumar",
  "age": 25,
  "date": "2026-10-21",
  "time_label": "11:00 AM",
  "time_value": "11",
  "address": "Mysore",
  "doctor_name": "Dr. Example",
  "doctor_specialization": "General Physician"
}
```

**Required:** `phone`, `patient_name`, `date`, `time_value`, `doctor_name`.

**Optional:** `age`, `time_label`, `address`, `doctor_specialization`.

The update route does not accept `location_link`. If the date/time changes, the handler rejects past slots and returns a conflict if another appointment already uses the requested date/time.

**Success (`200`):**

```json
{
  "success": true,
  "id": 123
}
```

**Possible errors:**

| Status | Meaning/message |
|---|---|
| `400` | Invalid appointment ID |
| `400` | Invalid phone, name, or age |
| `400` | Missing required appointment fields |
| `400` | Appointment cannot be moved to a past slot |
| `404` | `Appointment not found` |
| `409` | `That date and time slot is already booked` |
| `500` | `Failed to update appointment` |

Example conflict response:

```json
{
  "success": false,
  "message": "That date and time slot is already booked"
}
```

---

## 3. Payment requests

### `GET /api/admin/payments`

Returns payment requests ordered by creation time, newest first.

**Request body:** None.

**Success (`200`):**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "appointment_id": 123,
      "doctor_name": "Dr. Example",
      "patient_name": "Rahul Kumar",
      "patient_phone": "9876543210",
      "amount": 500,
      "status": "PENDING",
      "payment_link": "https://example.com/pay",
      "created_at": "2026-10-18T10:00:00.000Z"
    }
  ]
}
```

The example is illustrative. `amount` and `created_at` formats depend on the database and PostgreSQL driver.

**Server error (`500`):**

```json
{
  "success": false,
  "message": "Failed to fetch payment requests"
}
```

### `POST /api/admin/payments`

Creates a payment-request record. This endpoint does not itself generate a payment link or confirm a payment.

**Headers:** `Content-Type: application/json`

**Request payload:**

```json
{
  "appointment_id": 123,
  "doctor_name": "Dr. Example",
  "patient_name": "Rahul Kumar",
  "patient_phone": "9876543210",
  "amount": 500,
  "payment_link": "https://example.com/pay",
  "status": "PENDING"
}
```

**Required:** `patient_phone`, `amount`.

**Optional:** `appointment_id`, `doctor_name`, `patient_name`, `payment_link`, `status`. If omitted, `status` defaults to `PENDING`.

**Success (`200`):**

```json
{
  "success": true,
  "id": 456
}
```

**Missing required fields (`400`):**

```json
{
  "success": false,
  "message": "patient_phone and amount are required"
}
```

**Server error (`500`):**

```json
{
  "success": false,
  "message": "Failed to create payment request"
}
```

---

## 4. WhatsApp promotions

### `POST /api/admin/promotions/send`

Sends a promotional message to selected patients using the WhatsApp messaging service. Only contact recipients who have opted in to promotional messages.

**Headers:** `Content-Type: application/json`

**Request payload:**

```json
{
  "phones": ["9876543210", "9876501234"],
  "message": "Book your next healthcare appointment with Homeclinic24.",
  "confirmOptIn": true
}
```

- `phones`: Required array; 1–100 recipients before duplicate removal.
- `message`: Required string, 1–1000 characters after trimming.
- `confirmOptIn`: Required and must be `true`.

Phone values are normalized to 10 digits. Duplicate numbers are removed. The implementation looks up each recipient in existing appointments before sending.

**Response (`200`):**

```json
{
  "success": true,
  "total": 1,
  "sent": 1,
  "failed": 0,
  "results": [
    {
      "phone": "9876543210",
      "success": true,
      "messageId": "wamid.example",
      "error": null
    }
  ]
}
```

Message IDs are examples only. The endpoint may return HTTP `200` even when individual recipients fail; inspect `sent`, `failed`, and each item in `results`.

**Validation errors (`400`)** may include:

- `Confirm that the selected recipients opted in to promotions.`
- `Select at least one recipient.`
- `Select at most 100 recipients per request.`
- `Enter a promotion between 1 and 1000 characters.`
- `One or more phone numbers are invalid.`

---

## 5. Admin login and dashboard

### `POST /admin/login`

Accepts a username and password from the admin login form.

**Request body fields:**

```json
{
  "username": "YOUR_ADMIN_USERNAME",
  "password": "YOUR_ADMIN_PASSWORD"
}
```

The current handler sets `req.session.isAdmin` and `req.session.adminUser` on successful login, then redirects to `/admin`. Invalid credentials redirect to `/admin-login.html?error=1`.

**Important:** This route responds with redirects rather than a JSON success/error body. The exact request format should match the existing login form. Do not put credentials in frontend source code or commit real credentials to Git.

### `GET /admin`

Serves the admin dashboard HTML when the session is authenticated. If there is no valid admin session, the route redirects to `/admin-login.html`.

This is an HTML page route, not a JSON API.

---

## 6. WhatsApp webhook

These routes are for Meta WhatsApp Cloud API and are not general frontend APIs.

### `GET /webhook`

Meta webhook verification endpoint. The backend checks the `hub.mode`, `hub.verify_token`, and `hub.challenge` query parameters. A valid subscription verification returns the challenge; otherwise, the handler returns `403`.

### `POST /webhook`

Receives WhatsApp events, including incoming messages, interactive replies, location messages, and message delivery-status updates. The backend routes messages through the existing patient and doctor conversation flows.

---

## 7. CORS and frontend connection

The current server configuration is:

```javascript
app.use(cors({
  origin: "http://localhost:3039",
  credentials: true
}));
```

Only `http://localhost:3039` is currently allowed by this CORS configuration.

**Frontend developer:** Send the backend owner your exact frontend origin(s), including protocol and port for local development and the deployed domain for production.

**Backend owner:** Add the actual frontend origin(s) to the CORS allowlist and redeploy. Do not use a wildcard origin with credentials.

For session-cookie requests, the frontend may need `credentials: "include"`, and the session cookie settings must be compatible with the deployment. CORS alone is not authentication.

Example frontend request:

```javascript
const response = await fetch(
  "https://cuuure-production.up.railway.app/api/admin/appointments"
);
const result = await response.json();
```

For a JSON POST:

```javascript
const response = await fetch(
  "https://cuuure-production.up.railway.app/api/admin/appointments",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: "9876543210",
      patient_name: "Rahul Kumar",
      date: "2026-10-20",
      time_label: "10:00 AM",
      time_value: "10",
      doctor_name: "Dr. Example"
    })
  }
);
const result = await response.json();
```

Use real test data and a future appointment slot when testing appointment creation.

## 8. Security notes

- The current `/api/admin` handlers do not show admin authentication middleware. Add authentication and authorization before exposing patient or payment data to a frontend.
- The admin login implementation contains hardcoded credentials in source. Move credentials to secure environment variables or a proper identity system, and rotate any credentials that have been exposed.
- Set a strong `SESSION_SECRET` in Railway; do not rely on the fallback secret in production.
- Keep database URLs, WhatsApp access tokens, Google service-account credentials, and `.env` files out of Git.
- Limit promotional messaging to recipients who have provided valid opt-in.
- Validate and authorize sensitive actions on the backend; CORS is not a security boundary.

## 9. Known API gaps in the supplied route files

The supplied admin API route file defines no endpoint for deleting appointments, listing doctors, or retrieving available appointment slots. Additional routes elsewhere in the project may provide other functionality.

## 10. Quick testing checklist

- [ ] `GET /` returns the backend status text.
- [ ] `GET /api/admin/appointments` returns JSON.
- [ ] Appointment creation accepts valid data and rejects invalid data.
- [ ] Appointment update handles missing IDs and slot conflicts.
- [ ] Payment request endpoints return the documented response structure.
- [ ] Promotions are tested only with opted-in test recipients.
- [ ] CORS includes the actual frontend origin.
- [ ] Admin APIs are protected before production use.

---

**Base URL:** `https://cuuure-production.up.railway.app`

For frontend integration, use the endpoint paths, HTTP methods, request payloads, and response structures documented above. Confirm behavior against the deployed service when testing.
