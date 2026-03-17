# Queuo — Computer Vision & Voice-Agentic Restaurant Reception Bot

> Built for **Hack-Attack 2026** — "Bettering Businesses" theme

[![Watch the demo](https://img.youtube.com/vi/cx1xIBGYu8w/maxresdefault.jpg)](https://youtu.be/cx1xIBGYu8w)

Queuo is a computer-vision-powered reception system for restaurants. An iPhone camera + YOLOv8 detects arriving guests and their party size. A guest-facing kiosk then guides them through seating via voice interaction and simple button taps — no human host needed.

---

## What It Does

### Guest-Facing Kiosk
When a guest walks up to the kiosk:

1. The front camera detects the party size in real-time using YOLO
2. The kiosk greets them with a typed + spoken message: *"Welcome! We see a party of 3."*
3. The guest is asked: **"Do you have a reservation?"**

**If yes** — the guest speaks a 3-digit reservation code. Gemini NLU extracts it, the kiosk confirms and directs them to a table.

**If no** — the system checks live table availability from the dining floor camera:
- A free table with sufficient capacity → kiosk announces the table by name
- All tables full → estimated wait time is calculated and displayed; guest enters their email to join the waitlist

When a table frees up, the waitlisted guest automatically receives an email: *"Your table is ready."*

### Staff Business Dashboard
Staff log in and get a live floor view:
- **Entrance camera** — live people counter with bounding box overlays
- **Dining floor camera** — table zones with red/green occupancy status, detected count vs. capacity, and dwell timers
- **Table zone editor** — draw, name, and configure table zones directly on the camera feed; saved to Supabase
- **Waitlist queue** — live view of waiting guests and queue position

---

## Features

| Feature | Details |
|---|---|
| Party-size detection | YOLOv8 + ByteTrack via iPhone Continuity Camera or webcam |
| Voice-agentic kiosk | Web Speech API (STT) + Google Gemini (NLU) + Web Speech API (TTS) |
| Live table availability | Real-time zone intersection — YOLO bboxes vs. configured floor zones |
| Waitlist + email | Dwell-time wait algorithm; Resend emails on join and table-ready |
| Reservation flow | 3-digit spoken code; Gemini zero-pads and confirms |
| Staff dashboard | Supabase Realtime WebSockets; live occupancy overlays |
| Zone editor | Draw/drag table zones on live camera feed; persisted to Supabase |
| Auth | Supabase email/password; cookie-based sessions via `@supabase/ssr` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| Database & Realtime | Supabase (Postgres + Realtime WebSockets) |
| Auth | Supabase Auth + `@supabase/ssr` |
| Email | Resend |
| Voice Input | Web Speech API (`SpeechRecognition`) |
| Voice Output | Web Speech API (`SpeechSynthesis`) |
| NLU | Google Gemini REST API |
| Vision / ML | Python + YOLOv8 (Ultralytics) + ByteTrack |
| Vision Server | FastAPI + Uvicorn |

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp env-example.txt .env
```

Fill in `.env`:

```
SUPABASE_URL=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
RESEND_API_KEY=
RESEND_TEST_EMAIL=
```

### 3. Set up the vision microservice

```bash
python3 -m venv vision/.venv
source vision/.venv/bin/activate
pip install -r vision/requirements.txt
```

### 4. Run database migrations

In the Supabase SQL Editor, run the migrations in order:
- `sql/table_zones.sql`
- `sql/waitlist.sql`

### 5. Start the dev server

```bash
npm run dev
```

This starts both the Next.js app (`localhost:3000`) and the FastAPI vision server (`localhost:8000`) concurrently.

---

## Project Structure

```
app/
  page.tsx                          # Public landing page
  login/                            # Supabase auth login
  admin/
    entry/                          # Post-login landing (Customer View / Business View)
    customer/
      welcome-page/                 # Kiosk greeting screen (party detection + voice flow)
      confirm-reservation/          # Reservation confirmed screen
      table-free/                   # Walk-in table assigned screen
      all-full/                     # Waitlist join screen
    business/
      dashboard/                    # Staff floor dashboard (cameras, zones, occupancy)
  api/
    tables/                         # Upsert table configs
    cameras/[cameraId]/
      table-zones/                  # GET/PUT zone persistence
      table-occupancy/              # POST occupancy transitions + waitlist trigger
    waitlist/                       # POST join / GET list

lib/
  supabase.ts                       # Server-side Supabase client
  supabase-browser.ts               # Browser-side Supabase client
  resend.ts                         # Resend email client
  emails/                           # HTML email templates
  useTextToSpeech.ts                # TTS hook (Web Speech API)

vision/
  server.py                         # FastAPI server (POST /detect, /cameras, /stream)
  main.py                           # CLI pipeline for offline processing
  detectors/                        # YOLOv8 + ByteTrack wrapper
  zones/                            # Zone geometry and management
  state/                            # Table state engine and track registry
```

---

## Documentation

For deeper detail, refer to the docs in the `docs/` folder:

| Doc | Description |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Full architecture reference: tech stack, system diagram, data flows, DB schema, auth flow, file map |
| [docs/architecture-diagram.md](docs/architecture-diagram.md) | Mermaid system architecture diagram |
| [docs/voice-agentic-kiosk.md](docs/voice-agentic-kiosk.md) | Voice kiosk design: STT → Gemini NLU → TTS state machine, UX states, fallback behaviour |
| [docs/Customer_Kiosk_Flow.md](docs/Customer_Kiosk_Flow.md) | Original kiosk screen flow wireframes and route map |
| [CLAUDE.md](CLAUDE.md) | Developer reference: commands, architecture summary, recent changes, setup |
