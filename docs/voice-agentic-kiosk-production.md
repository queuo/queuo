# Voice-Agentic Kiosk — Production Flow

> **Production mode:** `NODE_ENV === "production"` (i.e. `npm run build && npm start` or any deployment).
> All camera and vision-server calls are **disabled**. Decisions that were camera-driven are replaced with **random generation** — the same pattern used in the business dashboard (`const CAMERAS_ENABLED = process.env.NODE_ENV !== "production"`).

---

## How Production Differs from Dev

| Step | Dev / Local | Production |
|---|---|---|
| Party-size detection | Opens `getUserMedia`, polls `POST /detect` on vision server every 300 ms, stabilises over 5-reading window | **Random**: `Math.floor(Math.random() * 5) + 1` (1–5 guests) |
| Table availability check | `GET /api/cameras/CAM-FLOOR/table-zones` → finds first `status=free` zone with `capacity ≥ partySize` | **Random**: 60% chance a table is available → random table name `Table 1–9` |
| Reservation confirmation | (same in both) → random table 1–9 | (same) |
| Email / waitlist flow | (same in both) → POSTs to `/api/waitlist` | (same) |

---

## Production High-Level Flow

```
[PRODUCTION — vision server not running, cameras not accessed]
       │
       ▼
Random party size generated: Math.floor(Math.random() * 5) + 1  →  N
       │
       ▼
Kiosk speaks: "Welcome! We detected a party of N. Is that correct?"
       │
       ├─ User says YES (confirm_party_size)
       │       │
       │       ▼
       │   Kiosk speaks: "Do you have a reservation with us today?"
       │       │
       │       ├─ User says YES (has_reservation)
       │       │       │
       │       │       ▼
       │       │   Kiosk speaks: "Got it, what's the code for your reservation?"
       │       │       │
       │       │       ▼
       │       │   [Voice transcript → Gemini extracts 3-digit code]
       │       │       │
       │       │       ▼
       │       │   Kiosk speaks: "Got it! Your reservation has been confirmed.
       │       │   Please proceed to table [random 1–9]."
       │       │   → 10s pause → reset for next guest
       │       │
       │       └─ User says NO (no_reservation)
       │               │
       │               ▼
       │          [PRODUCTION: random table availability — no API call]
       │               │
       │               ├─ ~60% chance: table available
       │               │       │
       │               │       ▼
       │               │   Kiosk speaks: "Great news! Table [random 1–9] is ready
       │               │   for your party of N. Please proceed — a team member
       │               │   will be with you shortly."
       │               │   → 10s pause → reset for next guest
       │               │
       │               └─ ~40% chance: all full
       │                       │
       │                       ▼
       │                   Kiosk speaks: "It looks like all tables are currently
       │                   full. Please say your email address and we'll notify
       │                   you when a table is ready."
       │                       │
       │                       ▼
       │                   [Live voice transcript → Gemini extracts email]
       │                       │
       │                       ▼
       │                   Kiosk speaks: "Got it — email@example.com. Is that correct?"
       │                       │
       │                       ├─ YES → POST /api/waitlist → confirmation email sent
       │                       │        Kiosk speaks estimated wait → 10s → reset
       │                       │
       │                       └─ NO  → ask for email again
       │
       └─ User says NO / wrong count (deny_party_size)
               │
               ▼
          Kiosk speaks: "How many guests are in your party?"
               │
               ▼
          [Voice → Gemini extracts number]
               │
               ▼
          Update partySize → resume from reservation question
```

---

## Component Behaviour in Production

### `WelcomePage` (`app/admin/customer/welcome-page/page.tsx`)

```
const KIOSK_VISION_ENABLED = process.env.NODE_ENV !== "production";
```

**Party-size detection `useEffect`**
```
if (!KIOSK_VISION_ENABLED) {
  randomSize = Math.floor(Math.random() * 5) + 1   // 1–5
  fireGreeting(randomSize)   ← skips camera + vision server entirely
  return
}
// dev path: getUserMedia → poll /detect → stabilise
```

**`no_reservation` branch in `handleGeminiResponse`**
```
if (!KIOSK_VISION_ENABLED) {
  hasTable = Math.random() > 0.4    // 60% yes
  if (hasTable):
    tableNum = Math.floor(Math.random() * 9) + 1   // 1–9
    speak "Great news! Table N is ready…" → 10s → reset
  else:
    speak "All tables full, please say your email…" → collect email flow
  return
}
// dev path: GET /api/cameras/CAM-FLOOR/table-zones → find free zone
```

All other logic (Gemini STT/NLU, TTS, email/waitlist, reservation code) is **identical** between dev and production.

---

## Data Flow (Production)

```
[Microphone]
     │  audio stream
     ▼
[Web Speech API (SpeechRecognition)]
     │  finalTranscript (string)
     ▼
[POST /api/gemini  ←  GEMINI_API_KEY server-side]
     │  { reply, intent, partySize?, email?, reservationCode? }
     ▼
[WelcomePage state machine]
     │
     ├─ Party size    → Math.random()  (no vision server)
     ├─ Table avail.  → Math.random()  (no vision server)
     ├─ Speak reply   → useTextToSpeech (Web Speech API)
     └─ Waitlist      → POST /api/waitlist → Supabase + Resend
```

---

## State Machine (unchanged from dev)

| State | Kiosk says | Listens for |
|---|---|---|
| `greeting` | "Welcome! We detected a party of N. Is that correct?" | yes / no |
| `ask_party_size` | "How many guests are in your party?" | number |
| `ask_reservation` | "Do you have a reservation?" | yes / no |
| `collect_reservation_code` | "What's the code for your reservation?" | 3-digit code |
| `collect_email` | "Please say your email address…" | spoken email |
| `confirm_email` | "Got it — [email]. Is that correct?" | yes / no |
| `routing` | (terminal — speaks confirmation) | — |
