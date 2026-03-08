import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { resend } from "@/lib/resend";
import { tableReadyHtml } from "@/lib/emails/table-ready";

interface OccupancyUpdate {
  id: string;
  occupied: boolean;
}

interface ZoneRow {
  id: string;
  camera_id: string;
  name: string;
  capacity: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string | null;
  status: "free" | "occupied";
  seated_at: string | null;
  updated_at: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> }
) {
  const { cameraId } = await params;

  let updates: OccupancyUpdate[];
  try {
    updates = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(updates)) {
    return NextResponse.json({ error: "Expected an array of occupancy updates" }, { status: 400 });
  }

  const updateMap = new Map<string, boolean>();
  for (const update of updates) {
    if (!update?.id || typeof update.occupied !== "boolean") {
      return NextResponse.json(
        { error: "Each update item must include id and occupied boolean" },
        { status: 400 }
      );
    }
    updateMap.set(update.id, update.occupied);
  }

  const zoneIds = [...updateMap.keys()];
  if (zoneIds.length === 0) {
    return NextResponse.json({ zones: [] });
  }

  const { data: zones, error: zoneErr } = await supabase
    .from("table_zones")
    .select("id,camera_id,name,capacity,x,y,w,h,color,status,seated_at,updated_at")
    .eq("camera_id", cameraId)
    .in("id", zoneIds);

  if (zoneErr) {
    return NextResponse.json({ error: zoneErr.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  for (const zone of (zones ?? []) as ZoneRow[]) {
    const nextOccupied = updateMap.get(zone.id);
    if (typeof nextOccupied !== "boolean") {
      continue;
    }

    const isCurrentlyOccupied = zone.status === "occupied";
    if (nextOccupied === isCurrentlyOccupied) {
      continue;
    }

    const nextStatus: "free" | "occupied" = nextOccupied ? "occupied" : "free";
    const nextSeatedAt = nextOccupied ? nowIso : null;

    const { error: updateErr } = await supabase
      .from("table_zones")
      .update({ status: nextStatus, seated_at: nextSeatedAt, updated_at: nowIso })
      .eq("id", zone.id)
      .eq("camera_id", cameraId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  const { data: refreshed, error: refreshedErr } = await supabase
    .from("table_zones")
    .select("id,camera_id,name,capacity,x,y,w,h,color,status,seated_at,updated_at")
    .eq("camera_id", cameraId)
    .order("name", { ascending: true });

  if (refreshedErr) {
    return NextResponse.json({ error: refreshedErr.message }, { status: 500 });
  }

  // When a zone transitions to free, notify the next waitlist guest whose
  // party size fits the newly freed table.
  const freedZones = (zones ?? []).filter((z) => {
    const wasOccupied = z.status === "occupied";
    const nextOccupied = updateMap.get(z.id);
    return wasOccupied && nextOccupied === false;
  }) as ZoneRow[];

  for (const freedZone of freedZones) {
    const { data: nextGuest } = await supabase
      .from("waitlist")
      .select("id,email,party_size,guest_name")
      .is("notified_at", null)
      .lte("party_size", freedZone.capacity)
      .order("joined_at", { ascending: true })
      .limit(1)
      .single();

    if (nextGuest) {
      await supabase
        .from("waitlist")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", nextGuest.id);

      const { error: emailErr } = await resend.emails.send({
        from: "Queueo <onboarding@resend.dev>",
        to: nextGuest.email,
        subject: `Your table is ready — ${freedZone.name}`,
        html: tableReadyHtml({
          email: nextGuest.email,
          partySize: nextGuest.party_size,
          tableName: freedZone.name,
        }),
      });

      if (emailErr) {
        console.error("Resend error (table-ready):", emailErr);
      }
    }
  }

  return NextResponse.json({ zones: (refreshed ?? []) as ZoneRow[] });
}
