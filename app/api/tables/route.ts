import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface TableRow {
  name: string;
  capacity: number;
  status: "free" | "occupied" | "reserved";
}

export async function POST(req: NextRequest) {
  let rows: TableRow[];

  try {
    rows = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Expected a non-empty array of table rows" }, { status: 400 });
  }

  const { error } = await supabase
    .from("tables")
    .upsert(rows, { onConflict: "name" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
