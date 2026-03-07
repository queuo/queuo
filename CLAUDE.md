# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server on localhost:3000
npm run build        # Production build
npm run lint         # Run ESLint
npm run test:supabase  # Test Supabase connection (requires .env)
npm run test:resend    # Test Resend email connection (requires .env)
```

Tests use `npx tsx --env-file=.env` — ensure a `.env` file exists with the required variables before running them.

## Project: Dine & Dash Defender

A real-time computer vision security layer for restaurants that reduces revenue loss from dine-and-dash incidents. Built for Hack-Attack 2026 "Bettering Businesses" theme.

### How It Works (end-to-end)

1. **Camera Feed (WebRTC)** — A device camera (e.g. an iPhone) monitors the restaurant floor and exit, streaming in real-time to the Python microservice via WebRTC.
2. **Vision Engine (Python + YOLO)** — YOLO detects all persons in frame. A heuristic (TBD — options include uniform color detection or staff-only zone origin) filters out employees. Customer bounding boxes are tracked; rapid movement toward the designated "Exit Zone" polygon flags them as a suspect.
3. **Evidence Capture (Supabase Storage)** — The moment a suspect crosses the threshold, their bounding box is cropped and uploaded as a JPEG to a Supabase Storage bucket.
4. **Live Staff Dashboard (Next.js + Supabase Realtime)** — The Python service inserts a row into the `alerts` table. The Next.js frontend, subscribed via Supabase Realtime WebSockets, instantly receives the payload and flashes a high-visibility shadcn toast notification to staff.
5. **Incident Report (Resend)** — Simultaneously, an automated email is sent to management containing the time, location, and cropped suspect image from Supabase Storage.

## Architecture

- **[app/](app/)** — Next.js App Router staff dashboard. Subscribes to Supabase Realtime for live alert toasts.
- **[lib/](lib/)** — Shared service clients:
  - [lib/supabase.ts](lib/supabase.ts) — Supabase client (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`); used for DB writes, Realtime subscriptions, and Storage
  - [lib/resend.ts](lib/resend.ts) — Resend client (`RESEND_API_KEY`); sends automated incident report emails
  - [lib/utils.ts](lib/utils.ts) — `cn` helper for Tailwind class merging
- **[tests/](tests/)** — Connectivity tests for Supabase and Resend
- **Python microservice** (separate service, not in this repo) — Receives WebRTC stream, runs YOLO inference, uploads evidence to Supabase Storage, and inserts alert rows

### Supabase Schema (expected)
- `alerts` table — written by the Python service; columns include timestamp, location, and image URL from Storage
- Supabase Storage bucket — holds cropped suspect JPEG evidence images

### Known Limitation & Future Direction

The current system triggers an alert only after a customer has already left the premises — by that point, intervention is too late. The goal is to fire the alert before they reach the door.

**Future Solution:**
- **Table Mapping:** Map the camera view to specific table numbers
- **State Checking:** When YOLO tracks a person walking from a table to the exit, query the POS API for that table's payment status
- **Decision:** If POS returns "Paid" → ignore exit. If "Open/Unpaid" → fire the alert before they reach the door

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
- Resend (automated incident report emails)
- Python + YOLO (Ultralytics) — vision microservice
- WebRTC — camera-to-backend video transport
