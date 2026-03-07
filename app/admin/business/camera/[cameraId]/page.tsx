"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Save, Loader2, CheckCircle, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

const CAMERA_META: Record<string, { name: string; filter: string }> = {
  "CAM-01": { name: "Main Entrance", filter: "saturate(1.05)" },
};

const ZONE_COLORS = [
  "#18181b", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444",
];

interface TableZone {
  id: string;
  name: string;
  capacity: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

interface DrawPoint { x: number; y: number }

type SaveStatus = "idle" | "saving" | "saved" | "error";

function storageKey(id: string) { return `camera-zones-${id}`; }

function loadZones(id: string): TableZone[] {
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? (JSON.parse(raw) as TableZone[]) : [];
  } catch { return []; }
}

function persistZones(id: string, zones: TableZone[]) {
  localStorage.setItem(storageKey(id), JSON.stringify(zones));
}

function drawZones(
  canvas: HTMLCanvasElement,
  zones: TableZone[],
  draft: { start: DrawPoint; current: DrawPoint } | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const W = canvas.width;
  const H = canvas.height;

  for (const zone of zones) {
    const px = zone.x * W;
    const py = zone.y * H;
    const pw = zone.w * W;
    const ph = zone.h * H;

    ctx.strokeStyle = zone.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(px, py, pw, ph);
    ctx.fillStyle = zone.color + "28";
    ctx.fillRect(px, py, pw, ph);

    const label = `${zone.name}  ·  ${zone.capacity} seats`;
    const labelW = Math.min(pw, ctx.measureText(label).width + 12);
    ctx.fillStyle = zone.color;
    ctx.fillRect(px, py, labelW, 20);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(label, px + 6, py + 14);
  }

  if (draft) {
    const rx = Math.min(draft.start.x, draft.current.x);
    const ry = Math.min(draft.start.y, draft.current.y);
    const rw = Math.abs(draft.current.x - draft.start.x);
    const rh = Math.abs(draft.current.y - draft.start.y);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = "#ffffff14";
    ctx.fillRect(rx, ry, rw, rh);
  }
}

export default function CameraDetailPage() {
  const { cameraId } = useParams<{ cameraId: string }>();
  const meta = CAMERA_META[cameraId] ?? { name: cameraId, filter: "none" };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [zones, setZones] = useState<TableZone[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const drawStartRef = useRef<DrawPoint | null>(null);
  const [draft, setDraft] = useState<{ start: DrawPoint; current: DrawPoint } | null>(null);
  const [pendingBounds, setPendingBounds] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [pendingCapacity, setPendingCapacity] = useState(4);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => { if (cameraId) setZones(loadZones(cameraId)); }, [cameraId]);

  useEffect(() => {
    let cancelled = false;
    let currentStream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        currentStream = s;
        setStream(s);
        const video = videoRef.current;
        if (video) { video.srcObject = s; video.play().catch(() => {}); }
      })
      .catch(() => setCameraError("Camera permission denied or no camera available."));
    return () => { cancelled = true; currentStream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const sync = () => { canvas.width = video.clientWidth; canvas.height = video.clientHeight; drawZones(canvas, zones, draft); };
    const ro = new ResizeObserver(sync);
    ro.observe(video);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawZones(canvas, zones, draft);
  }, [zones, draft]);

  const canvasPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>): DrawPoint => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    const pt = canvasPoint(e);
    drawStartRef.current = pt;
    setIsDrawing(true);
    setDraft({ start: pt, current: pt });
  }, [drawMode, canvasPoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawStartRef.current) return;
    setDraft({ start: drawStartRef.current, current: canvasPoint(e) });
  }, [isDrawing, canvasPoint]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawStartRef.current) return;
    const canvas = canvasRef.current!;
    const end = canvasPoint(e);
    const start = drawStartRef.current;
    const x = Math.min(start.x, end.x) / canvas.width;
    const y = Math.min(start.y, end.y) / canvas.height;
    const w = Math.abs(end.x - start.x) / canvas.width;
    const h = Math.abs(end.y - start.y) / canvas.height;
    if (w < 0.02 || h < 0.02) { setIsDrawing(false); setDraft(null); return; }
    setPendingBounds({ x, y, w, h });
    setPendingName(`Table ${zones.length + 1}`);
    setPendingCapacity(4);
    setIsDrawing(false);
    setDraft(null);
    setDrawMode(false);
  }, [isDrawing, canvasPoint, zones.length]);

  const confirmZone = useCallback(() => {
    if (!pendingBounds || !pendingName.trim()) return;
    const updated = [...zones, {
      id: crypto.randomUUID(),
      name: pendingName.trim(),
      capacity: Math.max(1, pendingCapacity),
      color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
      ...pendingBounds,
    }];
    setZones(updated);
    persistZones(cameraId, updated);
    setPendingBounds(null);
  }, [pendingBounds, pendingName, pendingCapacity, zones, cameraId]);

  const updateZone = useCallback((id: string, patch: Partial<Pick<TableZone, "name" | "capacity">>) => {
    setZones((prev) => { const u = prev.map((z) => z.id === id ? { ...z, ...patch } : z); persistZones(cameraId, u); return u; });
  }, [cameraId]);

  const deleteZone = useCallback((id: string) => {
    setZones((prev) => { const u = prev.filter((z) => z.id !== id); persistZones(cameraId, u); return u; });
  }, [cameraId]);

  const saveToDatabase = useCallback(async () => {
    if (zones.length === 0) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          zones.map((z) => ({ name: z.name, capacity: z.capacity, status: "free" }))
        ),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err) {
      console.error("Save to database failed:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [zones]);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-gradient-to-b from-zinc-100 via-zinc-50 to-white font-sans text-zinc-900 antialiased">

      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white/85 px-6 py-3 backdrop-blur shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/business/dashboard"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-900"
          >
            <ArrowLeft className="size-3.5" />
            Dashboard
          </Link>
          <div className="h-4 w-px bg-zinc-200" />
          <div>
            <p className="text-sm font-semibold text-zinc-900">{meta.name}</p>
            <p className="text-[11px] text-zinc-400">{cameraId} &bull; Zone editor</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setDrawMode((v) => !v); setPendingBounds(null); }}
            className={`flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${
              drawMode
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            <Plus className="size-3.5" />
            {drawMode ? "Drawing… click & drag" : "Add Zone"}
          </button>

          <Button
            size="sm"
            disabled={zones.length === 0 || saveStatus === "saving"}
            onClick={saveToDatabase}
            className="h-8 rounded-xl bg-black px-4 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
          >
            {saveStatus === "saving" && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {saveStatus === "saved" && <CheckCircle className="mr-1.5 size-3.5" />}
            {saveStatus === "idle" && <Save className="mr-1.5 size-3.5" />}
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved!" : saveStatus === "error" ? "Error — retry" : "Save to Database"}
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">

        {/* Camera feed */}
        <div className="relative flex flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 shadow-sm">
          {cameraError ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-zinc-500">
              <Camera className="size-10 text-zinc-700" />
              <p className="text-sm">{cameraError}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                muted
                playsInline
                className="h-full w-full object-contain"
                style={{ filter: meta.filter }}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full"
                style={{ cursor: drawMode ? "crosshair" : "default" }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); setDraft(null); } }}
              />
            </>
          )}

          {drawMode && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl border border-white/10 bg-black/70 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
              Click and drag to draw a table zone
            </div>
          )}

          {!stream && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-8 animate-spin text-zinc-600" />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">
              Table Zones
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Draw a zone on the feed, then name it and set capacity.
            </p>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">

            {/* Pending new zone */}
            {pendingBounds && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-zinc-700">New zone</p>
                <input
                  autoFocus
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  placeholder="Zone name"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-0"
                />
                <div className="flex items-center gap-2">
                  <label className="whitespace-nowrap text-xs text-zinc-500">Seats</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={pendingCapacity}
                    onChange={(e) => setPendingCapacity(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={confirmZone}
                    disabled={!pendingName.trim()}
                    className="flex-1 rounded-lg bg-black py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingBounds(null)}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {zones.length === 0 && !pendingBounds && (
              <p className="py-8 text-center text-xs text-zinc-400">
                No zones yet. Click &ldquo;Add Zone&rdquo; and draw on the feed.
              </p>
            )}

            {zones.map((zone) => (
              <div
                key={zone.id}
                className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full border border-black/10"
                    style={{ backgroundColor: zone.color }}
                  />
                  <input
                    value={zone.name}
                    onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-zinc-900 outline-none hover:border-zinc-200 focus:border-zinc-300 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => deleteZone(zone.id)}
                    className="shrink-0 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-red-500"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 pl-4">
                  <label className="whitespace-nowrap text-[11px] text-zinc-500">Seats</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={zone.capacity}
                    onChange={(e) => updateZone(zone.id, { capacity: Number(e.target.value) })}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                  />
                </div>
              </div>
            ))}
          </div>

          {zones.length > 0 && (
            <div className="border-t border-zinc-100 px-4 py-3">
              <p className="text-[11px] text-zinc-500">
                {zones.length} zone{zones.length !== 1 ? "s" : ""} &bull;{" "}
                {zones.reduce((s, z) => s + z.capacity, 0)} total seats
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                Bounds saved locally. &ldquo;Save to Database&rdquo; syncs to Supabase.
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
