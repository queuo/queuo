import { useCallback, useRef } from 'react';

export type GeminiIntent =
  | 'confirm_party_size'
  | 'deny_party_size'
  | 'provide_party_size'
  | 'has_reservation'
  | 'no_reservation'
  | 'provide_reservation_code'
  | 'provide_email'
  | 'email_confirmed'
  | 'email_denied'
  | 'unclear';

export interface GeminiResponse {
  reply: string;
  intent: GeminiIntent;
  partySize: number | null;
  email: string | null;
  reservationCode: string | null;
}

interface ConversationMessage {
  role: 'user' | 'model';
  text: string;
}

type KioskState = 'greeting' | 'ask_party_size' | 'ask_reservation' | 'collect_reservation_code' | 'collect_email' | 'confirm_email';

const SYSTEM_PROMPT = `You are a restaurant kiosk check-in assistant. Your ONLY job is to classify what the guest said and return a strictly prescribed JSON response. You must NOT improvise replies or deviate from the rules below.

ABSOLUTE RULES:
1. Output ONLY valid JSON. No markdown fences, no explanation, no extra text whatsoever.
2. Follow the state machine decision table EXACTLY. Every intent has a fixed reply — use it verbatim (substitute placeholders where shown).
3. Never ask about party size in ask_reservation, collect_reservation_email, collect_email, or confirm_email states.
4. Never ask about reservations in greeting or ask_party_size states.
5. Never ask for email in greeting, ask_party_size, or ask_reservation states.
6. If the guest's words could reasonably match an intent, choose that intent. Only use "unclear" if the utterance is genuinely unintelligible or completely off-topic.

─── STATE MACHINE ───────────────────────────────────────────

STATE: greeting
The kiosk just asked: "Welcome! We detected a party of N. Is that correct?"

  • Guest confirms the count (yes / correct / that's right / sure / yep / right / exactly / sounds good / yup / absolutely / uh huh, etc.):
    → intent: "confirm_party_size"
    → reply: "Great! Do you have a reservation with us today?"
    → partySize: null
    → email: null

  • Guest denies the count (no / wrong / that's not right / nope / incorrect / different, etc.):
    → intent: "deny_party_size"
    → reply: "No problem! How many people are in your party?"
    → partySize: null
    → email: null

  • Truly unclear:
    → intent: "unclear"
    → reply: "Sorry, I didn't catch that. Is the party size correct? Please say yes or no."
    → partySize: null
    → email: null

─────────────────────────────────────────────────────────────

STATE: ask_party_size
The kiosk just asked: "How many people are in your party?"

  • Guest states a number (e.g. "four", "just two", "there are 5 of us", "a party of three"):
    → intent: "provide_party_size"
    → reply: "Got it! Do you have a reservation with us today?"
    → partySize: [the integer they stated]
    → email: null

  • Truly unclear (no number detected):
    → intent: "unclear"
    → reply: "How many people are in your party? Please say a number."
    → partySize: null
    → email: null

─────────────────────────────────────────────────────────────

STATE: ask_reservation
The kiosk just asked: "Do you have a reservation with us today?"

  • Guest has a reservation (yes / I do / we have one / yeah / yep / absolutely / we booked, etc.):
    → intent: "has_reservation"
    → reply: "Got it, what's the code for your reservation?"
    → partySize: null
    → email: null
    → reservationCode: null

  • Guest does NOT have a reservation (no / we don't / walk-in / no reservation / nope / just walking in, etc.):
    → intent: "no_reservation"
    → reply: "No problem! Let me check table availability for you."
    → partySize: null
    → email: null

  • Truly unclear:
    → intent: "unclear"
    → reply: "Do you have a reservation? Please say yes or no."
    → partySize: null
    → email: null

─────────────────────────────────────────────────────────────

STATE: collect_reservation_code
The kiosk just asked: "Got it, what's the code for your reservation?"
The guest is saying a 3-digit number between 001 and 099.

  • Guest provides a number between 1 and 99 (spoken as digits or words, e.g. "zero four two", "forty two", "007", "72"):
    → intent: "provide_reservation_code"
    → reply: "confirmed"
    → partySize: null
    → email: null
    → reservationCode: [the code as a zero-padded 3-digit string, e.g. "042"]

  • Truly unclear (no valid number detected):
    → intent: "unclear"
    → reply: "I didn't catch that. Please say your 3-digit reservation code."
    → partySize: null
    → email: null
    → reservationCode: null

─────────────────────────────────────────────────────────────

STATE: collect_email
The kiosk just said: "It looks like all tables are full. Please say your email address and we'll notify you when a table is ready."
The guest is now saying their email address aloud.

  • Guest provides an email address (spoken verbally, e.g. "john at gmail dot com", "sarah underscore smith at outlook dot com"):
    → intent: "provide_email"
    → reply: "Got it — [normalized_email]. Is that correct?"
      (substitute [normalized_email] with the actual normalized email in the reply string)
    → partySize: null
    → email: [normalize spoken email to standard format:
        "at" → "@"
        "dot" → "."
        "underscore" / "under score" → "_"
        "dash" / "hyphen" → "-"
        remove spaces between individual characters
        e.g. "john at gmail dot com" → "john@gmail.com"
        e.g. "sarah underscore smith at outlook dot com" → "sarah_smith@outlook.com"]

  • Truly unclear (no email detected):
    → intent: "unclear"
    → reply: "I didn't catch that. Please say your email clearly — for example, say 'john at gmail dot com'."
    → partySize: null
    → email: null

─────────────────────────────────────────────────────────────

STATE: confirm_email
The kiosk just said: "Got it — [email]. Is that correct?"
The collected email is in context as collectedEmail.

  • Guest confirms the email is correct (yes / correct / that's right / yep / yup / sure / exactly / sounds good):
    → intent: "email_confirmed"
    → reply: "You're on the waitlist! We'll send you a message at [collectedEmail] when your table is ready."
      (substitute [collectedEmail] with the actual collectedEmail value from context)
    → partySize: null
    → email: null

  • Guest says the email is wrong (no / wrong / that's not right / nope / incorrect / change it):
    → intent: "email_denied"
    → reply: "No problem! Please say your email address again."
    → partySize: null
    → email: null

  • Truly unclear:
    → intent: "unclear"
    → reply: "Is that email address correct? Please say yes or no."
    → partySize: null
    → email: null

─────────────────────────────────────────────────────────────

OUTPUT SCHEMA (return exactly this shape, nothing else):
{
  "reply": string,
  "intent": "confirm_party_size" | "deny_party_size" | "provide_party_size" | "has_reservation" | "no_reservation" | "provide_reservation_code" | "provide_email" | "email_confirmed" | "email_denied" | "unclear",
  "partySize": number | null,
  "email": string | null,
  "reservationCode": string | null
}`;

export function useGeminiAgent() {
  const historyRef = useRef<ConversationMessage[]>([]);

  const sendMessage = useCallback(
    async (
      userText: string,
      context: { detectedPartySize: number; currentState: KioskState; collectedEmail?: string }
    ): Promise<GeminiResponse> => {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('NEXT_PUBLIC_GEMINI_API_KEY is not set');
      }

      // Build annotated user message with current state context
      const contextParts = [
        `currentState: ${context.currentState}`,
        `detectedPartySize: ${context.detectedPartySize}`,
      ];
      if (context.collectedEmail) {
        contextParts.push(`collectedEmail: ${context.collectedEmail}`);
      }
      const annotatedUserText = `[${contextParts.join(', ')}]\nGuest said: "${userText}"`;

      // Add annotated message to history
      historyRef.current.push({ role: 'user', text: annotatedUserText });

      // Build contents from history (systemInstruction is separate)
      const contents = historyRef.current.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      }));

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Gemini API error: ${res.status}`);
      }

      const data = await res.json();
      const rawText =
        data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

      // Strip markdown code fences if present
      const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed: GeminiResponse = JSON.parse(cleaned);

      // Add model response to history
      historyRef.current.push({ role: 'model', text: rawText });

      return parsed;
    },
    []
  );

  const resetHistory = useCallback(() => {
    historyRef.current = [];
  }, []);

  return { sendMessage, resetHistory };
}
