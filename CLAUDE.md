# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Keeping This File Updated

Whenever a new feature, service, route, or architectural change is added to this project, update CLAUDE.md to reflect it. Remind the user to do this if they haven't. This file is the source of truth for future Claude instances working in this repo.

## Commands

```bash
npm run dev          # Start development server on localhost:3000
npm run build        # Production build
npm run lint         # Run ESLint
npm run test:supabase  # Test Supabase connection (requires .env)
npm run test:resend    # Test Resend email connection (requires .env)
```

Tests use `npx tsx --env-file=.env` — ensure a `.env` file exists with the required variables before running them.

## Branding

The product brand name is currently **PlaceholderName** across the UI (`app/page.tsx`, `app/layout.tsx`). Update all instances when a final name is decided.

## Project: Reception Bot (Primary — Hack-Attack 2026)

A computer-vision-powered reception system for restaurants. An iPhone camera + YOLO detects arriving guests and their party size. A kiosk screen then guides them through seating via simple button taps — no human host needed. Built for Hack-Attack 2026 "Bettering Businesses" theme.

### Two Sides of the App

- **Business Side (Staff Dashboard)** — Staff configure table zones and monitor floor state in real time
- **Consumer Side (Kiosk)** — Guest-facing screen at the entrance; shows greeting and guides seating via tappable buttons

### How It Works (end-to-end)

1. **Staff Setup (Business Side)** — Staff pre-configure table zones: name, seating capacity, and physical location. The camera view is mapped to these zones so YOLO can determine which tables are occupied vs. free.
2. **Guest Detection** — The iPhone camera streams to the Python/YOLO microservice via WebRTC. YOLO counts the number of people approaching and detects which tables are currently occupied.
3. **Kiosk Greeting (Consumer Side)** — The kiosk auto-displays: *"Welcome! We see a party of 5. Do you have a reservation?"* Party size is inferred from the camera. Guest taps **Yes** or **No**.
4. **Reservation Flow (Yes)** — System looks up the reservation and displays: *"Proceed to Table 4 on your left."* Table state updates to occupied in Supabase.
5. **Walk-in Flow (No):**
   - YOLO-tracked occupancy is queried for a free table with sufficient capacity.
   - **Table available** → display: *"Table 7 is ready for you."* Table state updates to occupied.
   - **All tables full** → calculate estimated wait time from dwell time of occupied tables (`now - seated_at`). Display wait estimate. Guest enters email to join waitlist.
6. **Email Notification (Resend)** — When a table frees up (YOLO detects empty or staff marks free), Resend fires an email to the next waitlisted guest: *"Your table is ready!"*
7. **Staff Dashboard (Next.js + Supabase Realtime)** — Live floor map with table states (free / occupied / reserved), dwell timers, and waitlist queue. All updates flow via Supabase Realtime from the Python service writing to Supabase.

### Kiosk Screen Flow (Voice-Agentic)

The welcome page is fully voice-driven — no buttons, no navigation to other pages. All flows complete inline and reset for the next guest after 10 seconds.

```
Camera detects party of N (TBD: YOLO; currently hardcoded to 3)
  └─ Kiosk speaks: "Welcome! We detected a party of N. Is that correct?"
       │
       ├─ YES → "Do you have a reservation with us today?"
       │       │
       │       ├─ YES → "Perfect! What email address is your reservation under?"
       │       │         [Voice transcription] → Gemini normalises email
       │       │         TBD: Supabase lookup; currently always confirms
       │       │         → "Got it — email. Your reservation has been confirmed!
       │       │            Please proceed to your table." → 10s → reset
       │       │
       │       └─ NO → check table availability (TBD: YOLO; currently 50/50 random)
       │                ├─ Table free → "Great news! Table 7 is ready for you." → 10s → reset
       │                └─ All full → "Please say your email and we'll notify you."
       │                              [Voice transcription] → Gemini normalises email
       │                              → "Got it — email. Is that correct?"
       │                              ├─ YES → "You're on the waitlist!" → 10s → reset
       │                              └─ NO → ask for email again
       │
       └─ NO → "How many people are in your party?" → update count → back to reservation Q
```

**Welcome Page Features:**
- Fully voice-driven state machine powered by Google Gemini (`gemini-2.0-flash`)
- Chat bubble UI: AI messages left-aligned, guest messages right-aligned, auto-scrolls
- Live interim transcript shown in guest bubble as they speak
- Character-by-character streaming for AI reply bubbles
- Visual mic state strip: `idle` / `listening` / `thinking` / `speaking` / `error`
- Fallback quick-reply chips appear after 2 consecutive `unclear` intents
- After each terminal outcome, kiosk resets automatically after 10 seconds for next guest
- **Text-to-speech (TTS)** — Gemini replies spoken aloud via Web Speech API; mic disabled during TTS to prevent feedback

### Additional Kiosk Option
- **[Call a staff member]** button → triggers a notification on the staff dashboard

### Text-to-Speech (TTS)
The welcome page reads all AI replies aloud using the Web Speech API (`useTextToSpeech` hook in `lib/useTextToSpeech.ts`), configured at 1.5x rate. The mic is never active while TTS is playing.

## Architecture

- **[app/](app/)** — Next.js App Router. Contains:
  - [app/page.tsx](app/page.tsx) — Public marketing/landing page
  - [app/login/page.tsx](app/login/page.tsx) — Login page (Supabase email/password auth); redirects to `/admin/entry` on success
  - [app/logout/page.tsx](app/logout/page.tsx) — Logout route; signs out and redirects to `/login`
  - [app/admin/](app/admin/) — Kiosk-facing guest-interaction interface and admin routes (protected by `proxy.ts`):
    - [app/admin/layout.tsx](app/admin/layout.tsx) — Admin layout wrapper
    - [app/admin/page.tsx](app/admin/page.tsx) — Admin home/dashboard
    - [app/admin/customer/](app/admin/customer/) — Kiosk-facing guest flow:
        - [app/admin/customer/welcome-page/page.tsx](app/admin/customer/welcome-page/page.tsx) — Kiosk greeting screen; fully voice-driven state machine (greeting → party size → reservation → email collection → reset). All flows complete inline — no navigation to other pages. Uses `useGeminiAgent` for intent classification and `useSpeechToText` + `useTextToSpeech` for voice I/O.
      - [app/admin/customer/confirm-reservation/page.tsx](app/admin/customer/confirm-reservation/page.tsx) — Legacy page (no longer navigated to; reservation confirmation now handled inline on welcome page)
      - [app/admin/customer/table-free/page.tsx](app/admin/customer/table-free/page.tsx) — Legacy page (no longer navigated to; table-free announcement now handled inline on welcome page)
      - [app/admin/customer/all-full/page.tsx](app/admin/customer/all-full/page.tsx) — Legacy page (no longer navigated to; waitlist email collection now handled inline on welcome page)
    - [app/admin/entry/page.tsx](app/admin/entry/page.tsx) — Post-login landing page; animated typing sequence ("Welcome, Restaurant X." → "How would you like to proceed?") followed by two buttons: **Customer View** → `/admin/customer/welcome-page` and **Business View** → `/admin/business/dashboard`
    - [app/admin/business/](app/admin/business/) — Staff-facing business management:
      - [app/admin/business/dashboard/page.tsx](app/admin/business/dashboard/page.tsx) — Staff dashboard with two top-level views: **Cameras** and **Analytics**.
        - **Cameras view**: camera monitoring dashboard with two camera types:
        - **Browser camera (CAM-01)**: auto-starts via `getUserMedia` on page load; polls `POST /detect` every 900ms for people count; clicking the tile navigates to the zone editor.
        - **Vision server cameras**: added manually via "Add Camera" button → modal (name, zone, free-text, source index; `0` = iPhone via Continuity Camera). Each camera POSTs to `POST /cameras` on the vision server, then streams MJPEG from `GET /stream/{camera_id}`. People count polled from `GET /cameras/{camera_id}` every 1.5s. Remove button (×) calls `DELETE /cameras/{camera_id}`.
        - **Zone tabs**: dynamically derived from all camera zones. Non-"Entrance" zones show pencil (inline rename) and trash (delete zone + its cameras) icons on hover. Rename updates all cameras in that zone; delete stops them on the server.
        - **Persistence**: vision server camera configs (`name`, `zone`, `source`) saved to `localStorage` key `vision-cameras`; re-registered with the vision server on page mount.
        - **Vision health**: pings `GET /health` every 5s for the "Vision Connected / Offline" badge.
        - **Analytics view**: includes metric cards + multiple graphs:
          - Cards: estimated visitors (24h), peak hour, live occupancy, busiest zone.
          - Graphs: hourly occupancy trend (line/area), zone share (donut), current load by zone (bars), queue time by zone (bars + level).
          - Rolling sample cache for analytics uses `localStorage` key `traffic-samples-v1` when live data mode is used.
          - Demo mode currently enabled via `USE_FAKE_ANALYTICS = true` in `app/admin/business/dashboard/page.tsx`, which drives analytics from mock datasets for presentation.
      - [app/admin/business/camera/[cameraId]/page.tsx](app/admin/business/camera/[cameraId]/page.tsx) — Full-screen camera viewer + table zone editor. Left: live video feed with canvas overlay for drawing zones (click & drag). Right sidebar: zone list with editable name and seat capacity per zone, confirm/cancel flow for new zones. Zones persisted to `localStorage` keyed by `camera-zones-${cameraId}`. "Save to Database" upserts name + capacity to Supabase `tables` via `POST /api/tables`.
- **[app/api/](app/api/)** — Next.js API routes:
  - [app/api/tables/route.ts](app/api/tables/route.ts) — `POST /api/tables`; accepts an array of `{ name, capacity, status }` rows and upserts them into the `tables` table using the server-side secret key (bypasses RLS). Used by the camera zone editor.
- **[lib/](lib/)** — Shared service clients:
  - [lib/supabase.ts](lib/supabase.ts) — Server-side Supabase client (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`); bypasses RLS; use in API routes and server actions only
  - [lib/supabase-browser.ts](lib/supabase-browser.ts) — Browser-side Supabase client (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`); uses `@supabase/ssr` `createBrowserClient`; stores session in cookies for proxy access
  - [lib/resend.ts](lib/resend.ts) — Resend client (`RESEND_API_KEY`); sends waitlist-ready and reservation confirmation emails
  - [lib/utils.ts](lib/utils.ts) — `cn` helper for Tailwind class merging
  - [lib/useTextToSpeech.ts](lib/useTextToSpeech.ts) — Custom React hook for text-to-speech using Web Speech API; provides `speak()`, `stop()`, and `isSpeaking()` functions with configurable rate, pitch, volume, and language
  - [lib/useSpeechToText.ts](lib/useSpeechToText.ts) — Custom React hook wrapping the browser `SpeechRecognition` API; `continuous: false`, `interimResults: true`; fires `onResult(finalTranscript)` callback; exposes `start()`, `stop()`, `transcript`, `isListening`, `isSupported`
  - [lib/useGeminiAgent.ts](lib/useGeminiAgent.ts) — Google Gemini REST API hook (`gemini-2.0-flash`); maintains conversation history across turns; uses strict state-machine `systemInstruction` prompt; annotates each user message with `[currentState, detectedPartySize, collectedEmail?]`; returns `{ reply, intent, partySize, email }`. Intents: `confirm_party_size`, `deny_party_size`, `provide_party_size`, `has_reservation`, `no_reservation`, `provide_email`, `email_confirmed`, `email_denied`, `unclear`. States: `greeting`, `ask_party_size`, `ask_reservation`, `collect_reservation_email`, `collect_email`, `confirm_email`. Key: `NEXT_PUBLIC_GEMINI_API_KEY`.
- **[proxy.ts](proxy.ts)** — Next.js 16 proxy (replaces `middleware.ts`); protects all `/admin/*` routes; redirects unauthenticated users to `/login`
- **[tests/](tests/)** — Connectivity tests for Supabase and Resend
- **[vision/](vision/)** — Python vision microservice (see full breakdown below)

### Supabase Schema (expected)
- `tables` — staff-configured table zones: `id`, `name`, `capacity`, `status` (`free`/`occupied`/`reserved`), `seated_at` (timestamp for dwell tracking)
- `reservations` — `id`, `guest_name`, `party_size`, `reserved_for` (timestamp), `table_id`, `status`
- `waitlist` — `id`, `guest_name`, `party_size`, `email`, `joined_at`, `notified_at`

#### Migration: create `tables`
Run in Supabase SQL Editor to create the `tables` table (required for the zone editor save):
```sql
create table public.tables (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capacity integer not null default 4,
  status text not null default 'free' check (status in ('free', 'occupied', 'reserved')),
  seated_at timestamptz
);
```

---

## Vision Microservice (`vision/`)

A self-contained Python package for real-time person detection, tracking, and table occupancy inference.

### Two modes

1. **FastAPI server (`vision/server.py`)** — HTTP endpoint consumed by the Next.js kiosk and business dashboard. Start with:
   ```bash
   uvicorn vision.server:app --port 8000 --reload
   ```
   - `POST /detect` — accepts `{ image: "<base64 JPEG>" }`, returns `{ count: int, annotated_frame: "<base64 JPEG>" }`
   - `GET /health` — returns `{ status: "ok" }`
   - `POST /cameras` — starts a background MJPEG capture thread for a given source index; accepts `{ source: int, name: str, zone: str }`; returns `{ camera_id, source, name, zone, people_count }`
   - `GET /cameras` — list all active camera streams
   - `GET /cameras/{camera_id}` — get camera info + live `people_count`
   - `DELETE /cameras/{camera_id}` — stop a camera (sets `running=False`; thread releases `VideoCapture` itself to avoid macOS AVFoundation crash)
   - `GET /stream/{camera_id}` — MJPEG stream (`multipart/x-mixed-replace`); browser displays in `<img>` tag; YOLO bounding boxes drawn on each frame
   - Camera source `0` = iPhone via Continuity Camera on macOS
   - CORS open to all origins; model: `yolov8n.pt` loaded from `vision/models/`

2. **Standalone CLI pipeline (`vision/main.py`)** — Offline processing / demo mode. Run from repo root:
   ```bash
   # Webcam
   vision/.venv/bin/python vision/main.py --config vision/config/sample_restaurant.yaml --source 0
   # Video file
   vision/.venv/bin/python vision/main.py --config vision/config/sample_restaurant.yaml --source test_footage/footage.mp4
   ```
   CLI flags: `--no-display`, `--save-video <path>`, `--json-dir <dir>`, `--json-every <n>`, `--max-frames <n>`

### Setup
```bash
python3 -m venv vision/.venv
source vision/.venv/bin/activate
pip install -r vision/requirements.txt
```
Dependencies: `ultralytics`, `opencv-python`, `numpy`, `PyYAML`, `lapx`, `fastapi`, `uvicorn[standard]`

### Module structure
| Path | Purpose |
|---|---|
| `vision/server.py` | FastAPI server: `/detect`, `/health`, `/cameras`, `/stream/{id}` |
| `vision/main.py` | CLI pipeline entrypoint |
| `vision/config/sample_restaurant.yaml` | Default table layout, zones, and tuning thresholds |
| `vision/models/yolov8n.pt` | Bundled YOLO model |
| `vision/detectors/yolo_detector.py` | YOLOv8 + ByteTrack wrapper |
| `vision/trackers/track_parser.py` | Normalises tracked detections |
| `vision/zones/zone_manager.py` | Loads table & special-zone polygons/rects from config |
| `vision/zones/geometry.py` | Polygon/rect helpers + anchor point calc |
| `vision/state/track_registry.py` | Per-track memory, history, zone dwell time |
| `vision/state/table_state_engine.py` | Table assignment + occupancy state transitions |
| `vision/state/state_engine.py` | Assembles per-frame structured state dict |
| `vision/state/types.py` | Shared type definitions |
| `vision/utils/visualizer.py` | Debug overlays (bounding boxes, trails, zone labels) |
| `vision/utils/state_writer.py` | Periodic JSON snapshots to disk |
| `vision/utils/config_loader.py` | YAML/JSON config loader |
| `vision/tools/polygon_picker.py` | Click-to-define table polygon helper |
| `vision/tools/table_config_ui.py` | Live-feed drag-to-draw table config UI |

### Per-frame state shape (CLI pipeline output)
```json
{
  "frame_index": 42,
  "timestamp": 1.4,
  "tables": [{ "table_id": "T1", "capacity": 2, "state": "occupied", "party_size": 2, "assigned_track_ids": [3] }],
  "tracks": [{ "track_id": 3, "bbox": [...], "anchor_point": [...], "current_zone": "T1", "zone_dwell_seconds": 4.2, "assigned_table_id": "T1" }],
  "occupancy_summary": { "total": 3, "occupied": 1, "free": 2 }
}
```

### Config (`vision/config/sample_restaurant.yaml`)
- Tables defined as `polygon` (list of `[x,y]` points) or `rect` (`[x1,y1,x2,y2]`)
- Special zones: `entrance_zone`, `waiting_zone`, `exit_zone`, `staff_only_zone`
- Key thresholds: `table_assignment_seconds`, `vacancy_timeout_seconds`, `reassignment_seconds`, `track_stale_seconds`

### Tools
- **Polygon picker** — `python vision/tools/polygon_picker.py --input <image_or_video> --output <json>`
- **Table config UI** — `python vision/tools/table_config_ui.py --config <yaml> --source 0` (drag to draw tables on live feed, `s` to save)

---

## Secondary Feature: Dine & Dash Defender (implement if time permits)

A real-time computer vision security layer that reduces revenue loss from dine-and-dash incidents.

### How It Works (end-to-end)

1. **Camera Feed (WebRTC)** — A device camera monitors the restaurant floor and exit, streaming in real-time to the Python microservice via WebRTC.
2. **Vision Engine (Python + YOLO)** — YOLO detects all persons in frame. Employees are filtered out via heuristic (uniform color detection or staff-only zone origin). Customer bounding boxes are tracked; rapid movement toward the "Exit Zone" polygon flags them as a suspect.
3. **Evidence Capture (Supabase Storage)** — The suspect's bounding box is cropped and uploaded as a JPEG to Supabase Storage.
4. **Live Alert (Next.js + Supabase Realtime)** — Python inserts a row into `alerts`; the dashboard receives it via Realtime and flashes a shadcn toast to staff.
5. **Incident Report (Resend)** — Automated email sent to management with time, location, and suspect image.

### Dine & Dash: Future Direction (POS Integration)
- **Table Mapping:** Map camera view to table numbers
- **State Checking:** When YOLO tracks a person walking from table to exit, query POS API for that table's payment status
- **Decision:** "Paid" → ignore. "Open/Unpaid" → fire alert before they reach the door

### Dine & Dash: Supabase Schema
- `alerts` table — `id`, `timestamp`, `location`, `image_url`
- Supabase Storage bucket — cropped suspect JPEG evidence images

## Submission

Devpost submission due **Sunday, March 8th at 10:00 AM**. Includes the GitHub repo link and a 2-minute demo video of the working prototype.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables

Copy `env-example.txt` to `.env` and fill in the values:
```bash
cp env-example.txt .env
```

`.env` structure:
```
SUPABASE_URL=                   # Project URL (server-side)
SUPABASE_SECRET_KEY=            # service_role secret key (server-side only, never expose)
NEXT_PUBLIC_SUPABASE_URL=       # Same value as SUPABASE_URL (browser-safe)
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # anon/public key (browser-safe)
RESEND_API_KEY=
RESEND_TEST_EMAIL=              # Your Resend account email — used by npm run test:resend
```

**Getting credentials:**
- **Supabase** — Create a project at [supabase.com](https://supabase.com). For `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`: click **Connect** in the top header → **API Keys** → copy the Project URL. For `SUPABASE_SECRET_KEY`: **Settings → API Keys → service_role**. For `NEXT_PUBLIC_SUPABASE_ANON_KEY`: **Settings → API Keys → anon/public**.
- **Resend** — Go to [resend.com](https://resend.com), navigate to API Keys → Create API Key. Copy the key as `RESEND_API_KEY`. Set `RESEND_TEST_EMAIL` to the email address associated with your Resend account (required for the sandbox `onboarding@resend.dev` sender to work).

### 3. Verify connections
```bash
npm run test:supabase
npm run test:resend
```

### 4. Start the dev server
```bash
npm run dev
```

## Stack

- Next.js 16 with React 19 (App Router, TypeScript)
- Tailwind CSS v4 + shadcn/ui (Radix UI + CVA + tailwind-merge)
- Supabase (Postgres, Realtime WebSockets, Storage, Auth)
- `@supabase/ssr` — cookie-based session management for Next.js proxy auth
- Resend (waitlist-ready + reservation confirmation emails)
- Python + YOLO (Ultralytics) + ByteTrack — vision microservice; detects party size and table occupancy
- FastAPI + Uvicorn — serves `POST /detect`; browser captures frames and POSTs base64 JPEG every 300ms
- WebRTC — planned iPhone camera-to-Python transport (not yet wired; current kiosk uses browser `getUserMedia` → HTTP polling)

## Auth

- Login: `POST /login` via `supabaseBrowser.auth.signInWithPassword`
- Logout: visit `/logout` — signs out and redirects to `/login`
- Protected routes: all `/admin/*` routes are guarded by `proxy.ts`; unauthenticated requests redirect to `/login`
- Session storage: cookies (via `@supabase/ssr`) so the proxy can read auth state server-side
- **Do not use `lib/supabase.ts` (secret key) for client-side auth** — only use `lib/supabase-browser.ts`
