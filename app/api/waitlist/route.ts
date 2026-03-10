import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { resend } from "@/lib/resend";
import { waitlistConfirmationHtml } from "@/lib/emails/waitlist-confirmation";

// Average meal duration in minutes. Tables that have been seated longer than
// this are assumed to be finishing up soon.
const MEAL_DURATION_MINUTES = 25;
// Floor for any remaining-time estimate — never tell a guest < 5 min wait.
const MIN_WAIT_MINUTES = 5;

interface TableZoneRow {
  id: string;
  status: "free" | "occupied";
  seated_at: string | null;
  capacity: number;
}

interface WaitlistRow {
  id: string;
}

/**
 * Wait-time algorithm
 * -------------------
 * 1. Fetch all occupied zones from CAM-FLOOR that have a `seated_at` timestamp.
 * 2. For each zone compute: remainingMinutes = MEAL_DURATION - dwell_so_far_minutes
 *    (clamped to MIN_WAIT_MINUTES so we never show < 5 min).
 * 3. Sort remainingMinutes ascending — the table closest to freeing up is first.
 * 4. Get the current queue depth (# of waitlist entries not yet notified).
 * 5. The new guest's position = queueDepth (0-indexed).
 *    - If position < occupied table count  → pick remainingMinutes[position]
 *    - If position >= occupied table count → stack: add full MEAL_DURATION
 *      cycles for each overflow lap.
 *
 * Example: 2 occupied tables with 10 and 25 min remaining, 3 people already
 * waiting. New guest is position 3. Lap 1 covers positions 0 & 1, lap 2 covers
 * positions 2 & 3.  remainingMinutes[(3 % 2)] + MEAL_DURATION * floor(3/2)
 * = remainingMinutes[1] + 60 = 25 + 60 = 85 min.
 */
async function calculateEstimatedWait(partySize: number): Promise<{ estimatedWait: number; position: number }> {
  const [zonesResult, queueResult] = await Promise.all([
    supabase
      .from("table_zones")
      .select("id,status,seated_at,capacity")
      .eq("camera_id", "CAM-FLOOR")
      .eq("status", "occupied"),
    supabase
      .from("waitlist")
      .select("id", { count: "exact", head: true })
      .is("notified_at", null),
  ]);

  const occupiedZones = ((zonesResult.data ?? []) as TableZoneRow[]).filter(
    (z) => z.seated_at && z.capacity >= partySize
  );

  const now = Date.now();
  const remainingTimes = occupiedZones
    .map((z) => {
      const dwellMs = now - new Date(z.seated_at!).getTime();
      const dwellMinutes = dwellMs / 60_000;
      return Math.max(MIN_WAIT_MINUTES, MEAL_DURATION_MINUTES - dwellMinutes);
    })
    .sort((a, b) => a - b);

  const position = (queueResult.count ?? 0) as number;

  if (remainingTimes.length === 0) {
    // No occupied tables that fit — conservatively estimate one full meal cycle
    return { estimatedWait: MEAL_DURATION_MINUTES, position: position + 1 };
  }

  let estimatedWait: number;
  if (position < remainingTimes.length) {
    estimatedWait = remainingTimes[position];
  } else {
    const idx = position % remainingTimes.length;
    const lap = Math.floor(position / remainingTimes.length);
    estimatedWait = remainingTimes[idx] + MEAL_DURATION_MINUTES * lap;
  }

  return { estimatedWait: Math.round(estimatedWait), position: position + 1 };
}

export async function POST(req: NextRequest) {
  let body: { email: string; partySize: number; guestName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, partySize, guestName } = body;
  if (!email || !partySize) {
    return NextResponse.json({ error: "email and partySize are required" }, { status: 400 });
  }

  const { estimatedWait, position } = await calculateEstimatedWait(partySize);

  const { data: entry, error: insertErr } = await supabase
    .from("waitlist")
    .insert({
      email,
      party_size: partySize,
      guest_name: guestName ?? "Guest",
      joined_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertErr) {
    console.error("Waitlist insert error:", insertErr);
    return NextResponse.json({ error: insertErr.message, details: insertErr }, { status: 500 });
  }

  const { error: emailErr } = await resend.emails.send({
    from: "Queuo <onboarding@resend.dev>",
    to: email,
    subject: `You're on the waitlist — ~${estimatedWait} min wait`,
    html: waitlistConfirmationHtml({ email, partySize, estimatedWait, position }),
  });

  if (emailErr) {
    console.error("Resend error (confirmation):", emailErr);
  }

  return NextResponse.json({ entry, estimatedWait, position });
}

export async function GET() {
  const { data, error } = await supabase
    .from("waitlist")
    .select("*")
    .is("notified_at", null)
    .order("joined_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ waitlist: (data ?? []) as WaitlistRow[] });
}
