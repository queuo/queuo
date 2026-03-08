## Inspiration

Restaurants are one of the busiest real-world environments for repetitive decision-making. Hosts constantly switch between greeting guests, checking reservations, estimating wait times, tracking table turnover, and answering the same questions during rush hour. We were inspired by the idea that the front desk experience should feel personal and conversational, but still be powered by real-time data.

Instead of building another static queue app, we wanted to create an intelligent reception system that can see what is happening on the floor, talk naturally with guests, and help staff move faster with less chaos.

## What it does

Queuo is an AI-powered restaurant reception and table-flow platform with two connected experiences: a guest-facing voice kiosk and a live staff dashboard.

For guests:
- The kiosk detects party size from camera input in real time.
- It speaks with guests using a conversational voice flow.
- It handles reservation/no-reservation branching.
- It checks live table availability and either seats guests or adds them to the waitlist.
- It sends email confirmations and table-ready notifications automatically.

For staff:
- The dashboard shows live camera feeds and occupancy overlays.
- Staff can draw, edit, and save table zones directly on the floor view.
- Occupancy state is tracked per zone, including dwell timing.
- When a table becomes free, the system finds the next fitting waitlist guest and notifies them.

Key product behavior:
- Real-time occupancy transitions (`free` / `occupied`) are persisted to Supabase.
- Wait estimates are generated from current occupied tables and seating duration.
- Queue progression is capacity-aware (party size must fit table capacity).

## How we built it

We built Queuo as a full-stack, multi-service system:

- Frontend: Next.js 16 (App Router), React 19, TypeScript
- UI: Tailwind CSS v4 + shadcn/ui components
- Backend APIs: Next.js route handlers for waitlist, table zones, occupancy updates, and table sync
- Database/Auth: Supabase Postgres + Supabase Auth (`@supabase/ssr`)
- Notifications: Resend for transactional emails
- Voice layer: Web Speech API for speech-to-text and text-to-speech
- Conversational AI: Google Gemini REST API for intent parsing and state transitions
- Vision service: Python FastAPI microservice with YOLOv8 + ByteTrack + OpenCV

Architecture flow:
1. Camera frames are processed by the vision service for people counts/bounding boxes.
2. The kiosk uses voice input + Gemini intent handling to drive the guest journey.
3. Staff dashboard intersects detections with table zones to infer occupancy.
4. Occupancy updates are written to Supabase and reflected in the UI.
5. Waitlist and notification logic runs through API routes and Resend.

## Challenges we ran into

- Balancing speed and stability in real-time vision polling and occupancy updates
- Preventing noisy state flips when people move near zone boundaries
- Designing a voice flow that feels natural while staying deterministic and safe
- Handling edge cases in speech recognition (unclear input, retries, confirmation loops)
- Creating wait-time estimates that are simple, useful, and not overpromising
- Coordinating a Next.js app and a Python vision server in one cohesive dev workflow

## Accomplishments that we're proud of

- Built an end-to-end working prototype that combines voice AI, computer vision, waitlist automation, and live dashboard tooling
- Delivered a true voice-first check-in experience instead of a button-heavy kiosk
- Implemented zone-based occupancy tracking with automatic table-ready notifications
- Created a practical architecture that can scale to multiple cameras and larger venues
- Shipped polished staff and guest interfaces that are usable in real operational scenarios

## What we learned

- Real-time products are primarily state-management problems, not just model problems
- Tight API contracts between services are critical for reliability
- Voice UX needs explicit fallback paths and confirmation stages to be production-usable
- Queueing logic must consider fairness, capacity constraints, and communication clarity
- Integrating multiple AI and infra services quickly is possible when boundaries are clean

## What's next for queuo

1. Reservation verification end-to-end (real reservation records + validation flow)
2. Smarter ETA modeling using historical turnover and time-of-day patterns
3. Multi-location support with centralized operations visibility
4. Deeper analytics (throughput, waitlist conversion, table utilization)
5. Production hardening: observability, retry policies, role-based access controls, and compliance features
