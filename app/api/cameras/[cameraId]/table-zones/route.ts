import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface ZonePayload {
  id: string;
  name: string;
  capacity: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
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

function sanitizeZone(cameraId: string, zone: ZonePayload) {
  const name = zone.name?.trim();
  if (!name) {
    throw new Error("Each zone must have a name");
  }

  const capacity = Math.max(1, Math.floor(Number(zone.capacity) || 0));
  const x = Number(zone.x);
  const y = Number(zone.y);
  const w = Number(zone.w);
  const h = Number(zone.h);

  const boundsAreValid =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(w) &&
    Number.isFinite(h) &&
    x >= 0 &&
    y >= 0 &&
    w > 0 &&
    h > 0 &&
    x + w <= 1.001 &&
    y + h <= 1.001;

  if (!boundsAreValid) {
    throw new Error(`Zone ${name} has invalid bounds`);
  }

  return {
    id: zone.id,
    camera_id: cameraId,
    name,
    capacity,
    x,
    y,
    w,
    h,
    color: zone.color ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> }
) {
  const { cameraId } = await params;

  const { data, error } = await supabase
    .from("table_zones")
    .select("id,camera_id,name,capacity,x,y,w,h,color,status,seated_at,updated_at")
    .eq("camera_id", cameraId)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ zones: (data ?? []) as ZoneRow[] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> }
) {
  const { cameraId } = await params;

  let zones: ZonePayload[];
  try {
    zones = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(zones)) {
    return NextResponse.json({ error: "Expected an array of zones" }, { status: 400 });
  }

  const zoneIds = new Set<string>();
  const duplicateNameGuard = new Set<string>();

  let sanitized: ReturnType<typeof sanitizeZone>[];
  try {
    sanitized = zones.map((zone) => {
      if (!zone.id) {
        throw new Error("Each zone must have an id");
      }
      if (zoneIds.has(zone.id)) {
        throw new Error(`Duplicate zone id: ${zone.id}`);
      }
      zoneIds.add(zone.id);

      const out = sanitizeZone(cameraId, zone);
      const normalizedName = out.name.toLowerCase();
      if (duplicateNameGuard.has(normalizedName)) {
        throw new Error(`Duplicate zone name: ${out.name}`);
      }
      duplicateNameGuard.add(normalizedName);
      return out;
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid zone payload" },
      { status: 400 }
    );
  }

  const { data: existing, error: existingErr } = await supabase
    .from("table_zones")
    .select("id")
    .eq("camera_id", cameraId);

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const existingIds = (existing ?? []).map((row) => row.id as string);
  const deletedIds = existingIds.filter((id) => !zoneIds.has(id));

  if (deletedIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from("table_zones")
      .delete()
      .eq("camera_id", cameraId)
      .in("id", deletedIds);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }
  }

  if (sanitized.length > 0) {
    const { error: upsertErr } = await supabase
      .from("table_zones")
      .upsert(sanitized, { onConflict: "id" });

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }
  }

  const { data: latest, error: latestErr } = await supabase
    .from("table_zones")
    .select("id,camera_id,name,capacity,x,y,w,h,color,status,seated_at,updated_at")
    .eq("camera_id", cameraId)
    .order("name", { ascending: true });

  if (latestErr) {
    return NextResponse.json({ error: latestErr.message }, { status: 500 });
  }

  return NextResponse.json({ zones: (latest ?? []) as ZoneRow[] });
}
