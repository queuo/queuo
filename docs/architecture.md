# Architecture Diagram — Queueo Reception Bot

## Tech Stack at a Glance

| Layer | Technology |
|---|---|
| Frontend Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix UI) |
| Database & Realtime | Supabase (Postgres + Realtime WebSockets) |
| Auth | Supabase Auth + `@supabase/ssr` (cookie-based sessions) |
| Email | Resend |
| Voice Input | Web Speech API (`SpeechRecognition`) |
| Voice Output | Web Speech API (`SpeechSynthesis`) |
| AI / NLU | Google Gemini REST API |
| Vision / ML | Python + YOLOv8 (Ultralytics) + ByteTrack |
| Vision Server | FastAPI + Uvicorn |
| Camera Bridge | Browser `getUserMedia` + FastAPI MJPEG stream |

---

## High-Level System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Guest-Facing Device (Browser / Kiosk)           │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    Next.js App (App Router)                        │  │
│  │                                                                    │  │
│  │  /admin/customer/welcome-page   ──►  Voice state machine          │  │
│  │         │  Web Speech API (STT)       Google Gemini (NLU)         │  │
│  │         │  Web Speech API (TTS)       useGeminiAgent hook         │  │
│  │         │  getUserMedia (camera)      useSpeechToText hook        │  │
│  │         │                                                         │  │
│  │         ▼  POST /detect (300ms poll)                              │  │
│  │  ┌──────────────────────┐                                         │  │
│  │  │  KioskFrontCamera    │  ──►  Party size detection              │  │
│  │  └──────────────────────┘                                         │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
         │                              │
         │ GET /api/cameras/…           │ POST /api/waitlist
         │ POST /api/cameras/…          │ GET /api/tables
         ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│               Next.js API Routes (Server-Side)          │
│                                                         │
│  /api/tables                 ── Upsert tables           │
│  /api/cameras/[id]/table-zones   ── GET / PUT zones     │
│  /api/cameras/[id]/table-occupancy ── POST transitions  │
│  /api/waitlist               ── POST join / GET list    │
└────────────────┬────────────────────────────────────────┘
                 │ supabase (service_role)       │ Resend
                 ▼                               ▼
┌───────────────────────────┐    ┌─────────────────────────────────────┐
│        Supabase            │    │              Resend                 │
│                           │    │                                     │
│  tables                   │    │  Waitlist confirmation email        │
│  table_zones              │    │  "Your table is ready" email        │
│  waitlist                 │    │  lib/emails/waitlist-confirmation   │
│  reservations             │    │  lib/emails/table-ready             │
│                           │    └─────────────────────────────────────┘
│  Realtime WebSockets      │
│  (dashboard live updates) │
└───────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                    Staff Device (Browser / Desktop)                      │
│                                                                          │
│  /admin/business/dashboard                                               │
│         │                                                                │
│         ├─ Entrance Camera (CAM-ENTRANCE)                                │
│         │    getUserMedia ──► POST /detect ──► people counter + bboxes  │
│         │                                                                │
│         └─ Dining Camera (CAM-FLOOR)                                     │
│              Vision Bridge MJPEG stream ──► zone overlays               │
│              Table zone modal: draw / edit / delete / save               │
│              Occupancy overlays (red/green, count/capacity, dwell)       │
└──────────────────────────────────────────────────────────────────────────┘
         │  POST /detect (frame polling)
         │  GET  /stream/{camera_id}  (MJPEG)
         │  POST /cameras             (start stream)
         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                   Vision Microservice  (Python / FastAPI)                │
│                                        localhost:8000                    │
│                                                                          │
│  POST /detect          ── JPEG frame in → { count, boxes, annotated }   │
│  GET  /health          ── liveness probe                                 │
│  POST /cameras         ── start MJPEG capture thread                    │
│  GET  /cameras/{id}/state ── live count + boxes                         │
│  GET  /stream/{id}     ── MJPEG multipart stream                        │
│  DELETE /cameras/{id}  ── stop thread                                   │
│                                                                          │
│  YOLOv8n (yolov8n.pt) + ByteTrack                                        │
│  Camera source 0 = iPhone via Continuity Camera (macOS)                 │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Kiosk Voice Flow (Consumer Side)

```
iPhone/Mac camera
       │ frames every 300ms
       ▼
FastAPI /detect  ──►  Party size N (stabilised over 5-reading window)
       │
       ▼
Web Speech API (SpeechRecognition)
       │ final transcript
       ▼
Google Gemini REST API
  system prompt + conversation history + latest utterance
       │
       ▼  { reply, intent, partySize?, email?, reservationCode? }
       │
       ▼
WelcomePage State Machine
  ┌──────────────────────────────────────────────────────────────────┐
  │  greeting                                                        │
  │    └── confirm_party_size  ──► ask_reservation                  │
  │    └── deny_party_size     ──► ask_party_size                   │
  │                                    └── provide_party_size       │
  │                                         └── ask_reservation     │
  │                                                                  │
  │  ask_reservation                                                 │
  │    └── has_reservation  ──► collect_reservation_code            │
  │    │                           └── provide_reservation_code     │
  │    │                                └── routing (confirm table) │
  │    │                                                            │
  │    └── no_reservation   ──► GET /api/cameras/CAM-FLOOR/table-zones
  │                               │                                 │
  │                          free table?                            │
  │                               ├── YES ──► routing (seat guest) │
  │                               └── NO  ──► collect_email        │
  │                                              └── confirm_email  │
  │                                                   └── POST /api/waitlist
  └──────────────────────────────────────────────────────────────────┘
       │
       ▼
Web Speech API (SpeechSynthesis / TTS)
  Gemini reply spoken aloud
```

---

## Business Dashboard Data Flow

```
iPhone (Continuity Camera, source=0)
       │  MJPEG / frames
       ▼
FastAPI Vision Server (localhost:8000)
  YOLOv8 detects persons ──► bounding boxes + count
       │
       ├─► GET /cameras/{id}/state  (polled by dashboard every ~500ms)
       │         { count, boxes, frame_width, frame_height }
       │
       └─► GET /stream/{camera_id}  (MJPEG to <img> tag)

Dashboard intersects bboxes with configured table zones
       │
       ├─ person inside zone? ──► POST /api/cameras/CAM-FLOOR/table-occupancy
       │                               { zoneName, status: "occupied", seated_at }
       │                                     │
       │                                     ▼
       │                               Supabase table_zones updated
       │                               Realtime ──► dashboard re-renders overlays
       │
       └─ zone empties ──────────────► POST /api/cameras/CAM-FLOOR/table-occupancy
                                             { zoneName, status: "free" }
                                                   │
                                                   ▼
                                         Query waitlist for next guest
                                         Set notified_at
                                         Resend ──► "Your table is ready" email
```

---

## Waitlist Algorithm

```
POST /api/waitlist  { email, partySize }
       │
       ▼
Fetch all occupied table_zones (CAM-FLOOR) with seated_at
  For each: remaining = max(5, 25 - dwellMinutes)   [MEAL_DURATION = 25 min]
  Sort ascending
  estimatedWait = remaining[queuePosition]
  If queue > table count: add 25-min cycles
  Fallback: flat 25 min
       │
       ▼
INSERT into waitlist (guest_name, party_size, email, joined_at)
       │
       ▼
Resend: waitlist-confirmation email
  ── estimated wait, queue position, branded HTML template
```

---

## Database Schema

```
Supabase (Postgres)

tables
  id uuid PK
  name text UNIQUE
  capacity int
  status text  CHECK ('free' | 'occupied' | 'reserved')
  seated_at timestamptz

table_zones
  id uuid PK
  camera_id text
  name text
  capacity int
  x, y, w, h double  (normalised 0–1 bounds)
  color text
  status text  CHECK ('free' | 'occupied')
  seated_at timestamptz
  updated_at / created_at
  UNIQUE (camera_id, name)

waitlist
  id uuid PK
  guest_name text
  party_size int
  email text
  joined_at timestamptz
  notified_at timestamptz  (null = not yet notified)

reservations
  id uuid PK
  guest_name text
  party_size int
  reserved_for timestamptz
  table_id uuid → tables.id
  status text
```

---

## Auth Flow

```
/login  ──► supabaseBrowser.auth.signInWithPassword
                 │
                 ▼  session stored in cookies (@supabase/ssr)
             proxy.ts  ──► reads cookie server-side
                 │
                 ├── authenticated ──► pass through to /admin/*
                 └── unauthenticated ──► redirect to /login
```

---

## File Map

```
git-hack-attack-3.0/
├── app/
│   ├── page.tsx                          Landing page
│   ├── login/page.tsx                    Supabase email/password login
│   ├── logout/page.tsx                   Sign out + redirect
│   ├── admin/
│   │   ├── entry/page.tsx                Post-login: Customer View / Business View
│   │   ├── customer/
│   │   │   ├── welcome-page/
│   │   │   │   ├── page.tsx              Voice kiosk state machine (Gemini + STT + TTS)
│   │   │   │   └── KioskFrontCamera.tsx  Camera capture → /detect → party size
│   │   │   ├── confirm-reservation/      Reservation confirmed, table assigned
│   │   │   ├── table-free/               Walk-in, table available
│   │   │   └── all-full/                 All tables full, email waitlist
│   │   └── business/
│   │       ├── dashboard/page.tsx        Staff dashboard: cameras, zones, occupancy
│   │       └── camera/[cameraId]/        Legacy full-screen camera viewer
│   └── api/
│       ├── tables/route.ts               Upsert tables
│       ├── cameras/[cameraId]/
│       │   ├── table-zones/route.ts      GET/PUT zone config
│       │   └── table-occupancy/route.ts  POST occupancy transitions + waitlist notify
│       └── waitlist/route.ts             POST join / GET list
├── lib/
│   ├── supabase.ts                       Server-side client (service_role)
│   ├── supabase-browser.ts               Browser client (anon key)
│   ├── resend.ts                         Resend email client
│   ├── useTextToSpeech.ts                TTS hook (Web Speech API)
│   ├── useSpeechToText.ts                STT hook (Web Speech API)
│   ├── useGeminiAgent.ts                 Gemini REST API hook
│   ├── utils.ts                          cn() Tailwind helper
│   └── emails/
│       ├── waitlist-confirmation.ts      HTML email: waitlist confirmation
│       └── table-ready.ts                HTML email: table ready notification
├── vision/
│   ├── server.py                         FastAPI: /detect /health /cameras /stream
│   ├── main.py                           CLI pipeline (offline/demo)
│   ├── detectors/yolo_detector.py        YOLOv8 + ByteTrack
│   ├── trackers/track_parser.py          Track normalisation
│   ├── zones/zone_manager.py             Table polygon/rect loader
│   ├── zones/geometry.py                 Spatial helpers
│   ├── state/
│   │   ├── track_registry.py             Per-track dwell memory
│   │   ├── table_state_engine.py         Occupancy state transitions
│   │   └── state_engine.py               Per-frame state assembly
│   ├── utils/
│   │   ├── visualizer.py                 Debug overlays
│   │   ├── state_writer.py               JSON snapshot writer
│   │   └── config_loader.py              YAML/JSON loader
│   └── models/yolov8n.pt                 Bundled YOLO model
├── proxy.ts                              Next.js proxy: /admin/* auth guard
├── docs/
│   ├── architecture.md                   This file
│   ├── voice-agentic-kiosk.md            Voice flow design doc
│   ├── Customer_Kiosk_Flow.md            Kiosk screen wireframes
│   └── sql/
│       ├── table_zones.sql               Migration: table_zones
│       └── waitlist.sql                  Migration: waitlist
└── tests/
    ├── supabase.ts                       Supabase connectivity test
    └── resend.ts                         Resend connectivity test
```
