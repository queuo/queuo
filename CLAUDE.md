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

The `useTextToSpeech` hook (in `lib/useTextToSpeech.ts`) is configured with a speaking rate of 1.5x to deliver messages faster.

## Architecture

- **[app/](app/)** — Next.js App Router. Contains:
  - [app/page.tsx](app/page.tsx) — Public marketing/landing page
  - [app/login/page.tsx](app/login/page.tsx) — Login page (Supabase email/password auth); redirects to `/admin/entry` on success
  - [app/logout/page.tsx](app/logout/page.tsx) — Logout route; signs out and redirects to `/login`
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
      - [app/admin/business/dashboard/page.tsx](app/admin/business/dashboard/page.tsx) — Camera monitoring dashboard. Two camera types coexist:
        - **Browser camera (CAM-01)**: auto-starts via `getUserMedia` on page load; polls `POST /detect` every 900ms for people count; clicking the tile navigates to the zone editor.
        - **Vision server cameras**: added manually via "Add Camera" button → modal (name, zone, free-text, source index; `0` = iPhone via Continuity Camera). Each camera POSTs to `POST /cameras` on the vision server, then streams MJPEG from `GET /stream/{camera_id}`. People count polled from `GET /cameras/{camera_id}` every 1.5s. Remove button (×) calls `DELETE /cameras/{camera_id}`.
        - **Zone tabs**: dynamically derived from all camera zones. Non-"Entrance" zones show pencil (inline rename) and trash (delete zone + its cameras) icons on hover. Rename updates all cameras in that zone; delete stops them on the server.
        - **Persistence**: vision server camera configs (`name`, `zone`, `source`) saved to `localStorage` key `vision-cameras`; re-registered with the vision server on page mount.
        - **Vision health**: pings `GET /health` every 5s for the "Vision Connected / Offline" badge.
      - [app/admin/business/camera/[cameraId]/page.tsx](app/admin/business/camera/[cameraId]/page.tsx) — Full-screen camera viewer + table zone editor. Left: live video feed with canvas overlay for drawing zones (click & drag). Right sidebar: zone list with editable name and seat capacity per zone, confirm/cancel flow for new zones. Zones persisted to `localStorage` keyed by `camera-zones-${cameraId}`. "Save to Database" upserts name + capacity to Supabase `tables` via `POST /api/tables`.
- **[app/api/](app/api/)** — Next.js API routes:
  - [app/api/tables/route.ts](app/api/tables/route.ts) — `POST /api/tables`; accepts an array of `{ name, capacity, status }` rows and upserts them into the `tables` table using the server-side secret key (bypasses RLS). Used by the camera zone editor.
- **[lib/](lib/)** — Shared service clients:
  - [lib/supabase.ts](lib/supabase.ts) — Server-side Supabase client (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`); bypasses RLS; use in API routes and server actions only
  - [lib/supabase-browser.ts](lib/supabase-browser.ts) — Browser-side Supabase client (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`); uses `@supabase/ssr` `createBrowserClient`; stores session in cookies for proxy access
  - [lib/resend.ts](lib/resend.ts) — Resend client (`RESEND_API_KEY`); sends waitlist-ready and reservation confirmation emails
  - [lib/utils.ts](lib/utils.ts) — `cn` helper for Tailwind class merging
  - [lib/useTextToSpeech.ts](lib/useTextToSpeech.ts) — Custom React hook for text-to-speech using Web Speech API; provides `speak()`, `stop()`, and `isSpeaking()` functions with configurable rate, pitch, volume, and language
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
- FastAPI + Uvicorn — serves `POST /detect` consumed by `KioskFrontCamera.tsx`; browser captures frames and POSTs base64 JPEG every 300ms
- WebRTC — planned iPhone camera-to-Python transport (not yet wired; current kiosk uses browser `getUserMedia` → HTTP polling)

## Auth

- Login: `POST /login` via `supabaseBrowser.auth.signInWithPassword`
- Logout: visit `/logout` — signs out and redirects to `/login`
- Protected routes: all `/admin/*` routes are guarded by `proxy.ts`; unauthenticated requests redirect to `/login`
- Session storage: cookies (via `@supabase/ssr`) so the proxy can read auth state server-side
- **Do not use `lib/supabase.ts` (secret key) for client-side auth** — only use `lib/supabase-browser.ts`
