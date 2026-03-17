# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Keeping This File Updated

Whenever a new feature, service, route, or architectural change is added to this project, update CLAUDE.md to reflect it. Remind the user to do this if they haven't. This file is the source of truth for future Claude instances working in this repo.

## Commands

```bash
npm run dev          # Start Next.js + vision FastAPI server (concurrently)
npm run build        # Production build
npm run lint         # Run ESLint
npm run test:supabase  # Test Supabase connection (requires .env)
npm run test:resend    # Test Resend email connection (requires .env)
```

Tests use `npx tsx --env-file=.env` — ensure a `.env` file exists with the required variables before running them.

## Branding

The product brand name is **Queuo**.

## Documentation

- [docs/architecture.md](docs/architecture.md) — Full architecture reference: tech stack table, high-level system diagram (ASCII), kiosk voice flow, business dashboard data flow, waitlist algorithm, database schema, auth flow, and complete file map. Keep this updated when adding features.
- [docs/architecture-diagram.md](docs/architecture-diagram.md) — Mermaid whiteboard diagram of the high-level system architecture. Renders in VS Code (Markdown Preview Mermaid Support extension), GitHub, or mermaid.live. References `architecture.md` for detail.
- [docs/voice-agentic-kiosk.md](docs/voice-agentic-kiosk.md) — Design doc for the voice-agentic kiosk flow: STT → Gemini NLU → TTS state machine, component responsibilities, UX states, conversation bubble layout, fallback behaviour.
- [docs/voice-agentic-kiosk-production.md](docs/voice-agentic-kiosk-production.md) — Production-mode kiosk flow diagram: shows how camera-driven decisions (party size, table availability) are replaced with random generation when `NODE_ENV === "production"`. Includes dev vs. production comparison table, ASCII flow, component behaviour pseudocode, and state machine reference.
- [docs/Customer_Kiosk_Flow.md](docs/Customer_Kiosk_Flow.md) — Original kiosk screen flow wireframes and route map.
- [sql/setup.sql](sql/setup.sql) — **The only file you need.** Run once in Supabase SQL Editor to create all tables and policies (safe to re-run). Includes `tables`, `table_zones`, `waitlist`, `profiles`, and all RLS policies.
- [sql/old/](sql/old/) — Individual migration files kept for reference (`table_zones.sql`, `waitlist.sql`, `profiles.sql`, `rls_policies.sql`).

## Project: Reception Bot (Primary — Hack-Attack 2026)

A computer-vision-powered reception system for restaurants. An iPhone camera + YOLO detects arriving guests and their party size. A kiosk screen then guides them through seating via simple button taps — no human host needed. Built for Hack-Attack 2026 "Bettering Businesses" theme.

### Two Sides of the App

- **Business Side (Staff Dashboard)** — Staff configure table zones and monitor floor state in real time
- **Consumer Side (Kiosk)** — Guest-facing screen at the entrance; shows greeting and guides seating via tappable buttons

### Production Deployment Behaviour

- **`CAMERAS_ENABLED` flag** (business dashboard) — `const CAMERAS_ENABLED = process.env.NODE_ENV !== "production"`. In production, all camera and vision features are disabled at the source:
  - No `getUserMedia` calls, no vision bridge started, no detection polling
  - Camera tiles show "Camera not available" placeholder
  - Zone editor modal, "Configure Floor Tables", and "Manage Zones" buttons are hidden; clicking camera tiles does nothing
- **`KIOSK_VISION_ENABLED` flag** (kiosk welcome page) — `const KIOSK_VISION_ENABLED = process.env.NODE_ENV !== "production"`. In production, camera-driven kiosk decisions are replaced with random generation:
  - **Party size** — `Math.floor(Math.random() * 5) + 1` (1–5 guests); no `getUserMedia` or vision server polling
  - **Table availability** — `Math.random() > 0.4` (60% chance a table is free) → random `Table 1–9`; no `GET /api/cameras/CAM-FLOOR/table-zones` fetch
  - All voice logic (STT → Gemini → TTS), reservation code flow, and email/waitlist remain fully active in production
  - See [docs/voice-agentic-kiosk-production.md](docs/voice-agentic-kiosk-production.md) for the full production flow diagram
- **Hydration fix** — `timestamp` initialises to `""` and `trafficSamples` initialises to `[]` on both server and client; both are populated in `useEffect` after mount. This eliminates the React error #418 hydration mismatch caused by `toLocaleTimeString()` and `localStorage` reads during SSR.
- To simulate production locally: `npm run build && npm start`

### Recent Implemented Changes (March 2026)

- **SQL directory moved to root**: `docs/sql/` has been moved to `sql/` at the project root. All references in `CLAUDE.md`, `GEMINI.md`, `README.md`, `docs/voice-agentic-kiosk.md`, and `vision/README.md` have been updated accordingly.


- **Kiosk production mode (`KIOSK_VISION_ENABLED`)**: Welcome page now differentiates dev from production using `const KIOSK_VISION_ENABLED = process.env.NODE_ENV !== "production"`. In production, party-size detection is replaced with `Math.floor(Math.random() * 5) + 1` and table availability is replaced with `Math.random() > 0.4`. No camera permission is ever requested in production. Mirrors the `CAMERAS_ENABLED` pattern used in the business dashboard.

- Admin table-zone setup is now integrated directly in the business dashboard modal (draw, edit, delete, save).
- Table zone records are persisted in Supabase table `table_zones` with normalized bounds and per-table capacity.
- Occupancy + dwell are driven from live person detections intersecting configured table zones:
  - Dwell activation gate: table must detect `>1` people at least once, then occupancy is maintained while `>0` remain.
  - Dwell display resets to `00:00` immediately when zone count reaches `0`.
- Dining camera tiles render zone overlays with status colors:
  - Green = open
  - Red = occupied
  - Label shows `current_detected/capacity` and dwell
- Zone editor UX updates:
  - Saved zones have edit + delete controls
  - Active edit zone is visually highlighted
  - Clicking outside the modal saves changes and closes
  - Camera feed framing is consistent between dashboard tile and zone editor
- Camera routing for demo:
  - Entrance defaults to local Mac camera
  - Dining defaults to Vision Bridge source index `0` (iPhone Continuity camera on macOS)
- Entrance feed now shows both:
  - live people counter
  - live bbox overlays for detected people
- Vision performance improvements:
  - `/detect` supports lightweight mode (`include_annotated`, `include_tracking`, `imgsz`)
  - Dashboard polling uses lightweight detection payloads and lower-cost frame settings for better responsiveness
- **Kiosk party-size detection (live)**: Welcome page now detects real party size via its own camera + vision server on mount. Opens `getUserMedia`, captures frames every 300ms, POSTs to `/detect`, stabilises across a 5-reading sliding window (all readings within ±1), then fires the greeting with the detected count. Falls back to asking the guest directly if the vision server is unreachable, camera is unavailable, or detection returns 0 after a 4-second timeout.
- **Live table availability check**: The `no_reservation` branch no longer uses `Math.random()`. It now fetches `GET /api/cameras/CAM-FLOOR/table-zones` and finds the first zone where `status === "free"` AND `capacity >= partySize`. If found, the kiosk announces that specific table by name. If all tables are full or none can fit the party, it falls through to the email/waitlist flow. API errors default to the waitlist path.
- **Voice-agentic reservation flow (updated)**: When a guest says they have a reservation, the kiosk now asks for a 3-digit reservation code (001–099) instead of an email address. Gemini extracts and zero-pads the spoken number (e.g. "seventy two" → `"072"`). On a valid code, the kiosk responds: *"Got it! Your reservation has been confirmed. Please proceed to table [N]."* where N is a random number 1–9 generated at runtime. The `collect_reservation_email` kiosk state has been replaced by `collect_reservation_code`, and a new `provide_reservation_code` Gemini intent handles this flow. The `GeminiResponse` type now includes a `reservationCode: string | null` field.
- **Kiosk API error handling (robust)**:
  - `lib/use-gemini-agent.ts` throws structured, prefixed errors: `API_KEY_MISSING:`, `API_KEY_INVALID:<status>:`, `RATE_LIMIT:429:`, `API_ERROR:<status>:`. Each includes the raw error body so the exact message is surfaced.
  - Permanent errors (missing/invalid key): show a full-screen red overlay with error detail; suppress TTS and the greeting entirely via `permanentErrorRef`; do not auto-clear.
  - Transient errors (429 rate limit, other HTTP errors): speak the error aloud, show it in the bottom bar in red monospace, then auto-retry after 2 s.
  - `processingRef` is reset immediately at the top of every catch block so the next STT result is never silently dropped.
  - `stopSpeech()` is called whenever a permanent error is set, including from the runtime catch paths.
- **Gemini API key moved server-side**: The Gemini API key is now `GEMINI_API_KEY` (no `NEXT_PUBLIC_` prefix) and is never sent to the browser. `lib/use-gemini-agent.ts` calls `POST /api/gemini` (a Next.js API route) which reads the key server-side and proxies the request to Gemini. The client-side startup key-format check has been removed.

- **Waitlist email flow (fully implemented)**:
  - When a guest's email is confirmed on the kiosk (`confirm_email` + `email_confirmed`), the welcome page POSTs to `POST /api/waitlist` with `{ email, partySize }`.
  - The API calculates an estimated wait time using the **dwell-time algorithm** (see below) and inserts a row into the `waitlist` Supabase table.
  - A branded confirmation email is sent via Resend with the estimated wait time and queue position.
  - When any table zone transitions `occupied → free` via `POST /api/cameras/CAM-FLOOR/table-occupancy`, the next waitlist guest whose `party_size <= freed table capacity` is looked up, marked `notified_at`, and sent a "Your table is ready" email via Resend.
  - **Wait-time algorithm**: `MEAL_DURATION = 25 min`. For each occupied zone with a `seated_at`, `remaining = max(5, 25 - dwellMinutes)`. Sort ascending. New guest's estimated wait = `remaining[queuePosition]`. If queue is longer than table count, stacks in cycles (lap × 25 min added). Falls back to flat 25 min if no occupied tables have `seated_at`.
  - Email templates live in `lib/emails/` as plain HTML strings — no external dependency required.

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

### Kiosk Screen Flow

```
Camera detects party of N approaching
  └─ Kiosk (Welcome Page - typing animation):
       1. "Welcome to Restaurant X" (types out, 2s pause)
       2. "We saw you have a party of N." (types out, 2s pause)
       3. "Do you have a reservation?" (types out)
       ├─ [Yes, I do] → confirm reservation → "Proceed to Table X"
       └─ [No reservation] → check YOLO-tracked table availability
                  ├─ Table free (capacity ≥ N) → "Table X is ready for you"
                  └─ All full → show estimated wait time
                                └─ Guest enters email → waitlist entry created
                                    └─ Table frees → Resend email → guest returns
```

**Welcome Page Features:**
- Conversational typing animation (character-by-character display)
- Sequential message flow with automatic transitions
- Responsive design for kiosk displays
- Yes/No buttons appear after final message
- **Text-to-speech (TTS)** — All welcome messages are read aloud via Web Speech API as guests interact with the kiosk

### Additional Kiosk Option
- **[Call a staff member]** button → triggers a notification on the staff dashboard

### Text-to-Speech (TTS)
The welcome page automatically reads all messages aloud using the Web Speech API. This improves accessibility and provides audio guidance for guests:
- Greeting message speaks when text animation completes
- Party size announcement speaks after greeting
- Reservation prompt speaks after party size message

The `useTextToSpeech` hook (in `lib/use-text-to-speech.ts`) is configured with a speaking rate of 1.5x to deliver messages faster.

## Architecture

- **[app/](app/)** — Next.js App Router. Contains:
  - [app/page.tsx](app/page.tsx) — Public marketing/landing page; async Server Component; calls `getServerUser()` to read auth state and renders an auth-aware navbar: unauthenticated shows Login + Contact, authenticated shows only `UserMenu` icon (Contact is hidden when logged in)
  - [app/login/page.tsx](app/login/page.tsx) — Login page (Supabase email/password auth); redirects to `/admin/entry` on success; links to `/register`
  - [app/register/page.tsx](app/register/page.tsx) — Registration page; calls `supabaseBrowser.auth.signUp()`; validates passwords client-side; redirects to `/admin/entry` on success (requires email confirmation disabled in Supabase Dashboard → Authentication → Settings)
  - [app/logout/route.ts](app/logout/route.ts) — Logout route handler (`GET`); signs out server-side via `@supabase/ssr`, then immediately `302`-redirects to `/`. No client render — eliminates the white flash of the old client-side approach.
  - [app/admin/](app/admin/) — Kiosk-facing guest-interaction interface and admin routes (protected by `proxy.ts`):
    - [app/admin/layout.tsx](app/admin/layout.tsx) — Admin layout wrapper
    - [app/admin/page.tsx](app/admin/page.tsx) — Admin home/dashboard
    - [app/admin/customer/](app/admin/customer/) — Kiosk-facing guest flow:
        - [app/admin/customer/welcome-page/page.tsx](app/admin/customer/welcome-page/page.tsx) — Kiosk greeting screen; displays party size detected by YOLO and asks about reservation
      - [app/admin/customer/welcome-page/KioskFrontCamera.tsx](app/admin/customer/welcome-page/KioskFrontCamera.tsx) — Client component that accesses the device camera, captures frames every 300ms, POSTs base64 JPEG to `vision/server.py` at `http://localhost:8000/detect`, and renders the annotated frame with a people-count overlay. Exposes `onPartySizeChange?: (count: number) => void` prop to pass live party size up to the welcome page.
      - [app/admin/customer/confirm-reservation/page.tsx](app/admin/customer/confirm-reservation/page.tsx) — Displays confirmed reservation details and assigned table
      - [app/admin/customer/table-free/page.tsx](app/admin/customer/table-free/page.tsx) — Displays available table and seating instructions for walk-in guests
      - [app/admin/customer/all-full/page.tsx](app/admin/customer/all-full/page.tsx) — Prompted when all tables are full; guest enters email to join waitlist
    - [app/admin/entry/page.tsx](app/admin/entry/page.tsx) — Post-login landing page; animated typing sequence ("Welcome, Restaurant X." → "How would you like to proceed?") followed by two buttons: **Customer View** → `/admin/customer/welcome-page` and **Business View** → `/admin/business/dashboard`
    - [app/admin/business/](app/admin/business/) — Staff-facing business management:
      - [app/admin/business/dashboard/page.tsx](app/admin/business/dashboard/page.tsx) — Primary staff dashboard with two camera roles:
        - **Entrance camera (`CAM-ENTRANCE`)**: local browser camera via `getUserMedia`; polls `POST /detect`; renders people counter + live person bboxes.
        - **Dining camera (`CAM-FLOOR`)**: defaults to Vision Bridge stream (`source=0`); can use browser camera fallback; drives table occupancy/dwell by intersecting bboxes with configured zones.
        - **Table zone modal**: draw boxes, set table name/capacity, edit by dragging, delete, save to Supabase.
        - **Occupancy overlays**: per-zone red/green visuals + `current/capacity` + dwell shown in live feed and summary cards.
        - **Open behavior**: clicking the dining camera feed opens the same zone-config modal.
      - [app/admin/business/camera/[cameraId]/page.tsx](app/admin/business/camera/[cameraId]/page.tsx) — Legacy full-screen camera viewer/editor route (dashboard modal is now the main setup path).
- **[app/api/](app/api/)** — Next.js API routes:
  - [app/api/tables/route.ts](app/api/tables/route.ts) — `POST /api/tables`; accepts an array of `{ name, capacity, status }` rows and upserts them into the `tables` table using the server-side secret key (bypasses RLS). Used by the camera zone editor.
  - [app/api/cameras/[cameraId]/table-zones/route.ts](app/api/cameras/[cameraId]/table-zones/route.ts) — `GET`/`PUT` table-zone persistence for dashboard (validates bounds/capacity, upserts, deletes removed zones).
  - [app/api/cameras/[cameraId]/table-occupancy/route.ts](app/api/cameras/[cameraId]/table-occupancy/route.ts) — `POST` occupancy transitions (`free`/`occupied`) and `seated_at` updates per zone. On `occupied → free` transition, queries `waitlist` for next fitting guest, sets `notified_at`, and sends "table ready" email via Resend.
  - [app/api/waitlist/route.ts](app/api/waitlist/route.ts) — `POST` joins a guest to the waitlist: runs dwell-time wait algorithm, inserts into `waitlist`, sends confirmation email. `GET` returns all unnotified entries ordered by `joined_at`.
  - [app/api/gemini/route.ts](app/api/gemini/route.ts) — `POST /api/gemini`; server-side proxy to Gemini `generateContent` API. Reads `GEMINI_API_KEY` (never exposed to browser); forwards the request body verbatim; maps Gemini HTTP errors to structured prefixed error strings (`API_KEY_MISSING:`, `API_KEY_INVALID:`, `RATE_LIMIT:`, `API_ERROR:`) for the client to parse.
- **[lib/](lib/)** — Shared service clients:
  - [lib/supabase.ts](lib/supabase.ts) — Server-side Supabase client (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`); bypasses RLS; use in API routes and server actions only
  - [lib/supabase-browser.ts](lib/supabase-browser.ts) — Browser-side Supabase client (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`); uses `@supabase/ssr` `createBrowserClient`; stores session in cookies for proxy access
  - [lib/resend.ts](lib/resend.ts) — Resend client (`RESEND_API_KEY`); sends waitlist-ready and reservation confirmation emails
  - [lib/emails/waitlist-confirmation.ts](lib/emails/waitlist-confirmation.ts) — HTML email template: waitlist confirmation with estimated wait time and queue position; Queuo black/zinc brand design
  - [lib/emails/table-ready.ts](lib/emails/table-ready.ts) — HTML email template: "your table is ready" notification with table name; dark hero + brand design
  - [lib/get-session.ts](lib/get-session.ts) — `getServerUser()` helper; reads Supabase session server-side via `@supabase/ssr` + Next.js `cookies()`; returns the current `User` or `null`; use in any async Server Component instead of duplicating the cookie client setup
  - [lib/utils.ts](lib/utils.ts) — `cn` helper for Tailwind class merging
  - [lib/use-text-to-speech.ts](lib/use-text-to-speech.ts) — Custom React hook for text-to-speech using Web Speech API; provides `speak()`, `stop()`, and `isSpeaking()` functions with configurable rate, pitch, volume, and language
  - [lib/use-speech-to-text.ts](lib/use-speech-to-text.ts) — Custom React hook for speech-to-text using the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`); provides `start()`, `stop()`, `transcript`, `isListening`, and `isSupported`
  - [lib/use-gemini-agent.ts](lib/use-gemini-agent.ts) — Custom React hook that manages conversation history and sends messages to `POST /api/gemini`; parses structured `GeminiResponse` JSON (intent, partySize, email, reservationCode); exports `GeminiIntent` and `GeminiResponse` types
- **[components/UserMenu.tsx](components/UserMenu.tsx)** — Client component; renders a `frosted-pill` circular trigger (matches the design system's pill language — `bg-white/50 border-white/72 backdrop-blur`) that opens a shadcn `DropdownMenu`. Dropdown uses the same `frosted-surface` values as `GlassPanel` with ambient sky/indigo orbs. Shows signed-in email + "Your account", **Dashboard** → `/admin/entry`, and **Sign out** → `/logout`. Trigger lifts `−0.5` on hover. Accepts a Supabase `User` prop from the server.
- **[proxy.ts](proxy.ts)** — Next.js 16 proxy (replaces `middleware.ts`); protects all `/admin/*` routes; redirects unauthenticated users to `/login`
- **[tests/](tests/)** — Connectivity tests for Supabase and Resend
- **[vision/](vision/)** — Python vision microservice (see full breakdown below)

### Supabase Schema (expected)
- `tables` — staff-configured table zones: `id`, `name`, `capacity`, `status` (`free`/`occupied`/`reserved`), `seated_at` (timestamp for dwell tracking)
- `table_zones` — dashboard-configured floor zones: `id`, `camera_id`, `name`, `capacity`, normalized bounds (`x`,`y`,`w`,`h`), `status`, `seated_at`
- `reservations` — `id`, `guest_name`, `party_size`, `reserved_for` (timestamp), `table_id`, `status`
- `waitlist` — `id`, `guest_name`, `party_size`, `email`, `joined_at`, `notified_at`
- `profiles` — one row per auth user: `id` (FK → `auth.users`), `email`, `role` (`'user'`/`'admin'`), `created_at`. Auto-created on signup via trigger. Promote to admin with: `update public.profiles set role = 'admin' where email = '...';`

#### Setup
Paste [sql/setup.sql](sql/setup.sql) into the Supabase SQL Editor and run. Creates all tables and RLS policies in one shot, safe to re-run.

---

## Vision Microservice (`vision/`)

A self-contained Python package for real-time person detection, tracking, and table occupancy inference.

### Two modes

1. **FastAPI server (`vision/server.py`)** — HTTP endpoint consumed by the Next.js kiosk and business dashboard. Start with:
   ```bash
   uvicorn vision.server:app --port 8000 --reload
   ```
   - `POST /detect` — accepts `{ image, include_annotated?, include_tracking?, imgsz? }`; returns `{ count, annotated_frame, boxes, frame_width, frame_height }`
   - `GET /health` — returns `{ status: "ok" }`
   - `POST /cameras` — starts a background MJPEG capture thread for a given source index; accepts `{ source: int, name: str, zone: str }`; returns `{ camera_id, source, name, zone, people_count }`
   - `GET /cameras` — list all active camera streams
   - `GET /cameras/{camera_id}` — get camera info + live `people_count`
   - `GET /cameras/{camera_id}/state` — get camera info + live `people_count`, `boxes`, `frame_width`, `frame_height`
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
GEMINI_API_KEY=                 # Google AI Studio API key (server-side only, used by /api/gemini proxy)
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
- FastAPI + Uvicorn — serves `POST /detect` (supports lightweight/no-annotation mode) and camera-bridge MJPEG/state endpoints used by dashboard + kiosk
- Browser capture + Vision Bridge — current implementation uses browser `getUserMedia` polling and FastAPI camera bridge (`/cameras`, `/stream/{id}`, `/cameras/{id}/state`)

## Auth

- Login: `POST /login` via `supabaseBrowser.auth.signInWithPassword`
- Register: `/register` via `supabaseBrowser.auth.signUp`; email confirmation must be **disabled** in Supabase Dashboard → Authentication → Settings for immediate sign-in after registration
- Logout: visit `/logout` — signs out and redirects to `/login`
- Protected routes: all `/admin/*` routes are guarded by `proxy.ts`; unauthenticated requests redirect to `/login`
- Session storage: cookies (via `@supabase/ssr`) so the proxy can read auth state server-side
- **Do not use `lib/supabase.ts` (secret key) for client-side auth** — only use `lib/supabase-browser.ts`
- **RBAC**: `profiles` table stores `role` (`'user'`/`'admin'`); new signups default to `'user'` via trigger. RLS policies block direct database access (via Supabase dashboard, REST API, or anon key) for non-admin users. All app routes and API routes are intentionally open to any authenticated user — the RLS layer is purely a guard against external DB manipulation, not in-app access control.

| Where | Who | Can touch DB? |
|---|---|---|
| Web app API routes | any user | Yes (service role bypasses RLS) |
| Direct Supabase access | admin | Yes (RLS allows) |
| Direct Supabase access | regular user | No (RLS blocks) |
