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
  └─ Kiosk: "Welcome! Party of N — do you have a reservation?"
       ├─ [Yes] → confirm reservation → "Proceed to Table X"
       └─ [No]  → check YOLO-tracked table availability
                  ├─ Table free (capacity ≥ N) → "Table X is ready for you"
                  └─ All full → show estimated wait time
                                └─ Guest enters email → waitlist entry created
                                    └─ Table frees → Resend email → guest returns
```

### Additional Kiosk Option
- **[Call a staff member]** button → triggers a notification on the staff dashboard

## Architecture

- **[app/](app/)** — Next.js App Router. Contains:
  - Staff dashboard: live floor map, table states, waitlist, dwell timers
  - Reception Bot UI: kiosk-facing guest-interaction interface
- **[lib/](lib/)** — Shared service clients:
  - [lib/supabase.ts](lib/supabase.ts) — Supabase client (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`); used for DB reads/writes, Realtime subscriptions
  - [lib/resend.ts](lib/resend.ts) — Resend client (`RESEND_API_KEY`); sends waitlist-ready and reservation confirmation emails
  - [lib/utils.ts](lib/utils.ts) — `cn` helper for Tailwind class merging
- **[tests/](tests/)** — Connectivity tests for Supabase and Resend

### Supabase Schema (expected)
- `tables` — staff-configured table zones: `id`, `name`, `capacity`, `status` (`free`/`occupied`/`reserved`), `seated_at` (timestamp for dwell tracking)
- `reservations` — `id`, `guest_name`, `party_size`, `reserved_for` (timestamp), `table_id`, `status`
- `waitlist` — `id`, `guest_name`, `party_size`, `email`, `joined_at`, `notified_at`

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
SUPABASE_URL=
SUPABASE_SECRET_KEY=
RESEND_API_KEY=
```

**Getting credentials:**
- **Supabase** — Create a project at [supabase.com](https://supabase.com). For `SUPABASE_URL`: click **Connect** in the top header → **API Keys** → copy the Project URL. For `SUPABASE_SECRET_KEY`: go to **Settings → API Keys** and copy the secret key.
- **Resend** — Go to [resend.com](https://resend.com), navigate to API Keys → Create API Key. Copy the key as `RESEND_API_KEY`.

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
- Supabase (Postgres, Realtime WebSockets, Storage)
- Resend (waitlist-ready + reservation confirmation emails)
- Python + YOLO (Ultralytics) — vision microservice; detects party size at entrance and table occupancy
- WebRTC — iPhone camera-to-Python video transport
