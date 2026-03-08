# Voice-Agentic Kiosk — Design Doc

## Overview

Replace the button/timer-based welcome page with a fully conversational voice experience. Guests speak naturally; the kiosk listens, transcribes in real time, and sends the transcript to Google Gemini to determine intent. Gemini replies in text (spoken back via TTS), and the system progresses through the check-in flow automatically based on what the guest says.

---

## High-Level Flow

```
Camera detects party → N (TBD: replace with YOLO value; currently hardcoded to 3)
       │
       ▼
Kiosk speaks: "Welcome! We detected a party of N. Is that correct?"
       │
       ├─ User says YES / confirms
       │       │
       │       ▼
       │   Kiosk speaks: "Do you have a reservation with us today?"
       │       │
       │       ├─ User says YES
       │       │       └─ Navigate → /admin/customer/table-free
       │       │
       │       └─ User says NO
       │               │
       │               ▼
       │          Check table availability (TBD: real YOLO data; currently 50/50 random)
       │               │
       │               ├─ Space available → Navigate → /admin/customer/table-free
       │               │
       │               └─ All full → STAY on welcome page
       │                                │
       │                                ▼
       │                    Kiosk speaks: "It looks like all tables are full.
       │                    Please say your email address and we'll notify you
       │                    when a table is ready."
       │                                │
       │                                ▼
       │                    [Live voice transcription — interim results shown in real time]
       │                                │
       │                                ▼
       │                    Gemini extracts & normalises email from transcript
       │                    (e.g. "john at gmail dot com" → "john@gmail.com")
       │                                │
       │                                ▼
       │                    Kiosk speaks: "Got it — john@gmail.com. Is that correct?"
       │                                │
       │                    ├─ User says YES
       │                    │       └─ Kiosk speaks: "You're on the waitlist! We'll send
       │                    │          you a message at john@gmail.com when your table is ready."
       │                    │          → 10s pause → chat resets → greets next guest
       │                    │
       │                    └─ User says NO → ask for email again (up to 3 attempts
       │                                      before fallback chips appear)
       │
       └─ User says NO / wrong count
               │
               ▼
          Kiosk speaks: "How many people are in your party?"
               │
               ▼
          User says a number (e.g. "There are 4 of us")
               │
               ▼
          Update party size → resume from reservation question
```

---

## Components & Responsibilities

### 1. `useSpeechToText` hook (`lib/useSpeechToText.ts`)
- Wraps the browser **Web Speech API** (`SpeechRecognition`)
- Provides:
  - `start()` — begin listening
  - `stop()` — stop listening
  - `transcript` — live partial + final transcript string
  - `isListening` — boolean
- Configures `continuous: false`, `interimResults: true` so we get live typing feedback
- Fires an `onResult(finalTranscript)` callback when the user stops speaking

### 2. `useGeminiAgent` hook (`lib/useGeminiAgent.ts`)
- Wraps the **Google Gemini REST API** (`generativelanguage.googleapis.com`)
- Sends a system prompt + conversation history + latest user utterance
- Returns the assistant's next text reply
- System prompt encodes the kiosk state machine so Gemini always responds with a structured JSON:
  ```json
  {
    "reply": "Great! Do you have a reservation?",
    "intent": "confirm_party_size" | "deny_party_size" | "has_reservation" | "no_reservation" | "provide_party_size",
    "partySize": 4
  }
  ```

### 3. Updated `WelcomePage` (`app/admin/customer/welcome-page/page.tsx`)
- **Removes** all button/timer logic
- **State machine** driven by Gemini intents:

| State | Kiosk says | Listens for |
|---|---|---|
| `greeting` | "Welcome! We detected a party of N. Is that correct?" | yes / no |
| `ask_party_size` | "How many people are in your party?" | number utterance |
| `ask_reservation` | "Do you have a reservation?" | yes / no |
| `routing` | (silent, navigates) | — |

- Shows **live transcript** on screen as a subtle caption below the main message
- Microphone icon pulses when actively listening
- On each `onResult`:
  1. Append utterance to conversation history
  2. Send to Gemini
  3. Parse intent from JSON response
  4. Speak Gemini's `reply` via existing `useTextToSpeech`
  5. Transition state based on `intent`

---

## Data Flow Diagram

```
[Microphone]
     │  audio stream
     ▼
[Web Speech API (SpeechRecognition)]
     │  finalTranscript (string)
     ▼
[useGeminiAgent]  ◄──  systemPrompt + conversationHistory
     │  { reply, intent, partySize? }
     ▼
[WelcomePage state machine]
     ├─ speak reply via useTextToSpeech
     └─ transition to next state or navigate
```

---

## State Machine Detail

```
STATES:
  greeting         → initial state; kiosk announces detected party size
  ask_party_size   → user denied party size; kiosk asks for correct count
  ask_reservation  → party size confirmed; kiosk asks about reservation
  routing          → terminal state; navigate to correct page

TRANSITIONS:
  greeting + intent=confirm_party_size  → ask_reservation
  greeting + intent=deny_party_size     → ask_party_size
  ask_party_size + intent=provide_party_size → ask_reservation (update partySize)
  ask_reservation + intent=has_reservation   → navigate(/confirm-reservation)
  ask_reservation + intent=no_reservation    → checkAvailability()
    checkAvailability:
      tableAvailable=true  → navigate(/table-free)
      tableAvailable=false → navigate(/all-full)
```

---

## Gemini System Prompt

```
You are a friendly restaurant kiosk assistant. You are helping a guest check in.
Always respond with valid JSON only — no markdown, no extra text.

Schema:
{
  "reply": string,       // What to say to the guest (1-2 short sentences, warm tone)
  "intent": one of [
    "confirm_party_size",   // guest confirmed the detected count
    "deny_party_size",      // guest said the count is wrong
    "provide_party_size",   // guest stated a number (use partySize field)
    "has_reservation",      // guest has a reservation
    "no_reservation",       // guest has no reservation
    "unclear"               // could not determine intent; ask again
  ],
  "partySize": number | null  // only set when intent = provide_party_size
}

Current context will be injected before each message:
  - detectedPartySize: N
  - currentState: greeting | ask_party_size | ask_reservation
```

---

## Environment Variables

Add to `.env`:
```
NEXT_PUBLIC_GEMINI_API_KEY=   # Google AI Studio API key
```

> The Gemini key is `NEXT_PUBLIC_` because the call is made client-side from the kiosk browser. In a production setting this should be proxied through a Next.js API route.

---

## Files to Create / Modify

| File | Action |
|---|---|
| `lib/useSpeechToText.ts` | **Create** — Web Speech API hook |
| `lib/useGeminiAgent.ts` | **Create** — Gemini REST API hook |
| `app/admin/customer/welcome-page/page.tsx` | **Rewrite** — voice-driven state machine |
| `.env` / `env-example.txt` | **Update** — add `NEXT_PUBLIC_GEMINI_API_KEY` |

---

## UX Details

### Microphone States (visual indicator strip at bottom of screen)

The kiosk always shows a clear visual state so the guest knows exactly what is happening — modelled on how Gemini Live / Google Assistant surfaces audio state.

| State | Label | Visual |
|---|---|---|
| `idle` | — | No indicator shown |
| `speaking` | "Listening…" label hidden; AI bubble animates | Animated waveform / pulsing orb in the AI bubble; mic icon greyed out |
| `listening` | **"Listening…"** | Mic icon glows + animated sound-wave bars that react to voice amplitude in real time |
| `transcribing` | **"Transcribing…"** | Mic icon fades; three-dot shimmer animation while Web Speech API finalises |
| `thinking` | **"Thinking…"** | Spinning/breathing orb indicator while Gemini API call is in-flight |
| `error` | **"Couldn't hear you"** | Soft red pulse; auto-retries after 2 s |

Implementation: a single `uiState` enum drives all of the above. The mic is **never active while TTS is playing** to prevent audio feedback loops.

---

### Conversation Display (Chat Bubble Layout)

The screen is split into a **chat thread** — not just a single headline message. Each turn renders as a bubble, scrolling up as the conversation grows. This makes the interaction feel like a natural two-way dialogue.

```
┌──────────────────────────────────────────────────────┐
│  [Queueo logo]                        Kiosk Check-in │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ 🤖  Welcome! We detected a party of 3.      │    │
│  │     Is that correct?                        │    │  ← AI bubble (left-aligned)
│  └─────────────────────────────────────────────┘    │
│                                                      │
│       ┌──────────────────────────────────────────┐  │
│       │  Yeah, that's right.                     │  │  ← Guest bubble (right-aligned)
│       └──────────────────────────────────────────┘  │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ 🤖  Great! Do you have a reservation?  ▌    │    │  ← AI streaming (cursor blinks)
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ──────────────────────────────────────────────────  │
│  [🎙  ▁▃▅▃▁  Listening…                          ]  │  ← state strip
└──────────────────────────────────────────────────────┘
```

**AI bubble behaviour:**
- Gemini's `reply` text streams in **character-by-character** (same typing animation as the current welcome page) with a blinking cursor `▌` until the string is complete
- Once complete, the cursor disappears and TTS reads the text aloud simultaneously

**Guest bubble behaviour:**
- As the guest speaks, the **interim transcript** appears inside the guest bubble in real time (greyed-out italic) — updating word-by-word
- When the utterance finalises the text turns full-opacity and the bubble locks in

**Scroll behaviour:** the thread auto-scrolls to keep the latest message in view. Older messages fade slightly (opacity 0.4) so focus stays on the current turn.

---

### No double-listening rule
- Microphone is disabled while TTS is playing
- After TTS completes → 400 ms silence gap → mic activates automatically
- Guest can tap the mic icon at any time to interrupt and re-trigger listening

---

### Fallback
- If `intent=unclear` twice in a row → show two tappable option chips (contextual Yes / No or a number pad for party size) underneath the latest AI bubble
- If speech recognition is unavailable (no mic permission, unsupported browser) → fall back to the original button-only UI silently

---

## Table Availability Check (TBD)

For now, `checkAvailability()` returns a hardcoded `true` (table available). Real implementation will:
1. Query Supabase `tables` for any row where `status = 'free'` AND `capacity >= partySize`
2. Return `true` if any row found, `false` otherwise

---

## Open Questions

1. Should conversation history accumulate across turns, or just last-turn context sent to Gemini?
2. Do we want a "Call a staff member" escape hatch reachable by voice command?
3. Should we proxy the Gemini key through `/api/gemini` to avoid exposing it in the browser bundle?