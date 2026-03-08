"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Camera,
  Clock3,
  Loader2,
  Pencil,
  Plus,
  Save,
  TrendingUp,
  Trash2,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FrostedPage, FrostedPill, GlassPanel } from "@/components/ui/frosted-shell";

const VISION_SERVER =
  process.env.NEXT_PUBLIC_VISION_SERVER ?? "http://localhost:8000";

const ENTRANCE_CAMERA_ID = "CAM-ENTRANCE";
const FLOOR_CAMERA_ID = "CAM-FLOOR";
const DETECT_FRAME_WIDTH = 288;
const DETECT_JPEG_QUALITY = 0.58;
const DETECT_MODEL_IMGSZ = 224;
const ENTRANCE_DETECT_INTERVAL_MS = 300;
const FLOOR_DETECT_INTERVAL_MS = 900;

type CameraStatus = "online" | "degraded" | "offline";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface CameraPreset {
  id: string;
  name: string;
  zone: string;
  peopleOffset: number;
  filter: string;
}

interface DrawPoint {
  x: number;
  y: number;
}

interface DraftRect {
  start: DrawPoint;
  current: DrawPoint;
}

interface TableZone {
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
  updated_at?: string;
}

interface VisionCameraInfo {
  camera_id: string;
  source: number;
  name: string;
  zone: string;
  people_count: number;
}

interface VisionCameraState extends VisionCameraInfo {
  boxes: number[][];
  frame_width: number;
  frame_height: number;
}

interface DetectionSnapshot {
  boxes: number[][];
  frameWidth: number;
  frameHeight: number;
}

interface TrafficSample {
  timestamp: number;
  totalPeople: number;
}

interface ZoneEditorProps {
  stream: MediaStream | null;
  streamUrl?: string | null;
  cameraName: string;
  zones: TableZone[];
  peopleAtTableById: Record<string, number>;
  onClose: () => void;
  onSave: (zones: TableZone[]) => Promise<void>;
  saveStatus: SaveStatus;
}

const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: ENTRANCE_CAMERA_ID,
    name: "Entrance Camera",
    zone: "Entrance",
    peopleOffset: 0,
    filter: "saturate(1.05)",
  },
  {
    id: FLOOR_CAMERA_ID,
    name: "Floor Camera",
    zone: "Dining",
    peopleOffset: 0,
    filter: "saturate(1.02)",
  },
];

const ZONE_COLORS = [
  "#18181b",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

const ZONES = ["All", "Entrance", "Dining"] as const;
type Zone = (typeof ZONES)[number];

const USE_FAKE_ANALYTICS = true;

const MOCK_HOURLY_OCCUPANCY = [
  4, 3, 2, 2, 3, 6, 10, 14, 18, 21, 25, 29,
  34, 31, 28, 24, 22, 26, 33, 36, 30, 20, 12, 7,
];

const MOCK_ZONE_DISTRIBUTION = [
  { zone: "Entrance", count: 34, queueMinutes: 8 },
  { zone: "Dining", count: 49, queueMinutes: 14 },
  { zone: "Bar", count: 23, queueMinutes: 9 },
  { zone: "Patio", count: 18, queueMinutes: 6 },
];

const STATUS_BADGE: Record<CameraStatus, string> = {
  online: "bg-emerald-500",
  degraded: "bg-amber-500",
  offline: "bg-red-500",
};

const TABLE_STATUS_COLOR = {
  open: "#10b981",
  occupied: "#ef4444",
} as const;

function now(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDwell(seatedAt: string | null): string {
  if (!seatedAt) return "00:00";
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(seatedAt).getTime()) / 1000)
  );
  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function overlapArea(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

function mapBoxToCoverViewport(
  box: number[],
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number
): { left: number; top: number; width: number; height: number } | null {
  if (
    box.length < 4 ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return null;
  }

  const x1 = Math.max(0, Math.min(box[0], box[2]));
  const y1 = Math.max(0, Math.min(box[1], box[3]));
  const x2 = Math.min(sourceWidth, Math.max(box[0], box[2]));
  const y2 = Math.min(sourceHeight, Math.max(box[1], box[3]));
  if (x2 <= x1 || y2 <= y1) return null;

  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const renderWidth = sourceWidth * scale;
  const renderHeight = sourceHeight * scale;
  const offsetX = (viewportWidth - renderWidth) / 2;
  const offsetY = (viewportHeight - renderHeight) / 2;

  const left = x1 * scale + offsetX;
  const top = y1 * scale + offsetY;
  const right = x2 * scale + offsetX;
  const bottom = y2 * scale + offsetY;

  const clippedLeft = Math.max(0, left);
  const clippedTop = Math.max(0, top);
  const clippedRight = Math.min(viewportWidth, right);
  const clippedBottom = Math.min(viewportHeight, bottom);
  if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return null;

  return {
    left: clippedLeft,
    top: clippedTop,
    width: clippedRight - clippedLeft,
    height: clippedBottom - clippedTop,
  };
}

function drawZones(
  canvas: HTMLCanvasElement,
  zones: TableZone[],
  draft: DraftRect | null,
  peopleAtTableById: Record<string, number>,
  editingZoneId: string | null
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const zone of zones) {
    const px = zone.x * canvas.width;
    const py = zone.y * canvas.height;
    const pw = zone.w * canvas.width;
    const ph = zone.h * canvas.height;
    const currentAtTable = peopleAtTableById[zone.id] ?? 0;
    const isOccupied = zone.status === "occupied";
    const statusColor = isOccupied ? TABLE_STATUS_COLOR.occupied : TABLE_STATUS_COLOR.open;

    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(px, py, pw, ph);

    ctx.fillStyle = isOccupied ? `${TABLE_STATUS_COLOR.occupied}33` : `${TABLE_STATUS_COLOR.open}2a`;
    ctx.fillRect(px, py, pw, ph);

    const label = `${zone.name} · ${currentAtTable}/${zone.capacity}`;
    ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
    const labelWidth = Math.min(pw, ctx.measureText(label).width + 14);

    ctx.fillStyle = statusColor;
    ctx.fillRect(px, py, labelWidth, 20);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, px + 6, py + 14);

    if (editingZoneId === zone.id) {
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(px - 1, py - 1, pw + 2, ph + 2);
      ctx.setLineDash([]);

      const editLabel = "EDITING";
      ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
      const editW = ctx.measureText(editLabel).width + 10;
      const ey = Math.max(0, py - 18);
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(px, ey, editW, 16);
      ctx.fillStyle = "#0f172a";
      ctx.fillText(editLabel, px + 5, ey + 12);
    }
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
    ctx.fillStyle = "#ffffff22";
    ctx.fillRect(rx, ry, rw, rh);
  }
}

function ZoneEditorModal({
  stream,
  streamUrl,
  cameraName,
  zones,
  peopleAtTableById,
  onClose,
  onSave,
  saveStatus,
}: ZoneEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [localZones, setLocalZones] = useState<TableZone[]>(() => zones);
  const [drawMode, setDrawMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draft, setDraft] = useState<DraftRect | null>(null);
  const drawStartRef = useRef<DrawPoint | null>(null);

  const [pendingBounds, setPendingBounds] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [pendingCapacity, setPendingCapacity] = useState(4);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const draggingZoneIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  useEffect(() => {
    if (stream) {
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.play().catch(() => {});
      return () => {
        if (video.srcObject) video.srcObject = null;
      };
    }
  }, [stream]);

  useEffect(() => {
    const target = stream ? videoRef.current : imageRef.current;
    const canvas = canvasRef.current;
    if (!target || !canvas) return;

    const sync = () => {
      canvas.width = target.clientWidth;
      canvas.height = target.clientHeight;
      drawZones(canvas, localZones, draft, peopleAtTableById, editingZoneId);
    }

    const ro = new ResizeObserver(sync);
    ro.observe(target);
    sync();
    return () => ro.disconnect();
  }, [draft, editingZoneId, localZones, peopleAtTableById, stream, streamUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawZones(canvas, localZones, draft, peopleAtTableById, editingZoneId);
  }, [editingZoneId, localZones, draft, peopleAtTableById]);

  const pointFromEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): DrawPoint => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    []
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pt = pointFromEvent(e);
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (drawMode) {
        drawStartRef.current = pt;
        setIsDrawing(true);
        setDraft({ start: pt, current: pt });
        return;
      }

      if (!editingZoneId) return;
      const zone = localZones.find((item) => item.id === editingZoneId);
      if (!zone) return;

      const zonePx = {
        x: zone.x * canvas.width,
        y: zone.y * canvas.height,
        w: zone.w * canvas.width,
        h: zone.h * canvas.height,
      };

      const inside =
        pt.x >= zonePx.x &&
        pt.x <= zonePx.x + zonePx.w &&
        pt.y >= zonePx.y &&
        pt.y <= zonePx.y + zonePx.h;
      if (!inside) return;

      draggingZoneIdRef.current = zone.id;
      dragOffsetRef.current = {
        dx: pt.x - zonePx.x,
        dy: pt.y - zonePx.y,
      };
    },
    [drawMode, editingZoneId, localZones, pointFromEvent]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDrawing && drawStartRef.current) {
        setDraft({ start: drawStartRef.current, current: pointFromEvent(e) });
        return;
      }

      if (!draggingZoneIdRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const pt = pointFromEvent(e);
      const zoneId = draggingZoneIdRef.current;
      const offset = dragOffsetRef.current;

      setLocalZones((prev) =>
        prev.map((zone) => {
          if (zone.id !== zoneId) return zone;
          const xPx = Math.max(0, Math.min(canvas.width - zone.w * canvas.width, pt.x - offset.dx));
          const yPx = Math.max(0, Math.min(canvas.height - zone.h * canvas.height, pt.y - offset.dy));
          return {
            ...zone,
            x: xPx / canvas.width,
            y: yPx / canvas.height,
          };
        })
      );
    },
    [isDrawing, pointFromEvent]
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (draggingZoneIdRef.current) {
        draggingZoneIdRef.current = null;
        return;
      }

      if (!isDrawing || !drawStartRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const end = pointFromEvent(e);
      const start = drawStartRef.current;
      const x = Math.min(start.x, end.x) / canvas.width;
      const y = Math.min(start.y, end.y) / canvas.height;
      const w = Math.abs(end.x - start.x) / canvas.width;
      const h = Math.abs(end.y - start.y) / canvas.height;

      setIsDrawing(false);
      setDraft(null);

      if (w < 0.02 || h < 0.02) return;

      setPendingBounds({ x, y, w, h });
      setPendingName(`Table ${localZones.length + 1}`);
      setPendingCapacity(4);
      setDrawMode(false);
    },
    [isDrawing, localZones.length, pointFromEvent]
  );

  const addPendingZone = useCallback(() => {
    if (!pendingBounds || !pendingName.trim()) return;

    setLocalZones((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        camera_id: FLOOR_CAMERA_ID,
        name: pendingName.trim(),
        capacity: Math.max(1, Math.floor(pendingCapacity) || 1),
        ...pendingBounds,
        color: ZONE_COLORS[prev.length % ZONE_COLORS.length],
        status: "free",
        seated_at: null,
      },
    ]);

    setPendingBounds(null);
    setPendingName("");
  }, [pendingBounds, pendingName, pendingCapacity]);

  const removeZone = useCallback((id: string) => {
    if (editingZoneId === id) {
      setEditingZoneId(null);
    }
    setLocalZones((prev) => prev.filter((zone) => zone.id !== id));
  }, [editingZoneId]);

  const updateZone = useCallback(
    (id: string, patch: Partial<Pick<TableZone, "name" | "capacity">>) => {
      setLocalZones((prev) =>
        prev.map((zone) => (zone.id === id ? { ...zone, ...patch } : zone))
      );
    },
    []
  );

  const closeAndSave = useCallback(() => {
    if (saveStatus === "saving") return;
    void onSave(localZones).finally(() => {
      onClose();
    });
  }, [localZones, onClose, onSave, saveStatus]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeAndSave();
        }
      }}
    >
      <div
        className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Zone Setup
            </p>
            <h2 className="text-lg font-semibold text-zinc-900">{cameraName}</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDrawMode((prev) => !prev);
                setPendingBounds(null);
                setEditingZoneId(null);
              }}
              className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${
                drawMode
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              <Plus className="size-3.5" />
              {drawMode ? "Drawing" : "Add Zone"}
            </button>

            <Button
              size="sm"
              disabled={saveStatus === "saving"}
              onClick={() => onSave(localZones)}
              className="h-9 rounded-xl bg-black px-4 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saveStatus === "saving" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 size-3.5" />
              )}
              {saveStatus === "saving"
                ? "Saving"
                : saveStatus === "saved"
                ? "Saved"
                : saveStatus === "error"
                ? "Error"
                : "Save Layout"}
            </Button>

            <button
              type="button"
              onClick={closeAndSave}
              className="rounded-lg border border-zinc-200 p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="flex flex-1 gap-4 overflow-hidden p-4">
          <div className="flex flex-1 items-start overflow-hidden">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950">
              {stream ? (
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                  style={{ filter: "saturate(1.02)" }}
                />
              ) : streamUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={imageRef}
                  src={streamUrl}
                  alt="Dining camera stream"
                  className="h-full w-full object-cover"
                  style={{ filter: "saturate(1.02)" }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
                  No dining camera stream
                </div>
              )}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full"
                style={{ cursor: drawMode ? "crosshair" : editingZoneId ? "move" : "default" }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={() => {
                  draggingZoneIdRef.current = null;
                  if (isDrawing) {
                    setIsDrawing(false);
                    setDraft(null);
                  }
                }}
              />

              {drawMode && (
                <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl border border-white/20 bg-black/70 px-4 py-2 text-sm font-medium text-white">
                  Click and drag to draw table zone
                </div>
              )}
              {editingZoneId && !drawMode && (
                <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl border border-white/20 bg-black/70 px-4 py-2 text-sm font-medium text-white">
                  Drag selected table box to reposition
                </div>
              )}
            </div>
          </div>

          <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Tables
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Set table names and seat capacities.
              </p>
              {editingZoneId && (
                <p className="mt-1 text-[11px] font-semibold text-cyan-700">
                  Editing selected table box
                </p>
              )}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {pendingBounds && (
                <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs font-semibold text-zinc-700">New zone</p>
                  <input
                    autoFocus
                    value={pendingName}
                    onChange={(e) => setPendingName(e.target.value)}
                    placeholder="Table name"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-400"
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addPendingZone}
                      disabled={!pendingName.trim()}
                      className="flex-1 rounded-lg bg-black py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingBounds(null)}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {localZones.length === 0 && !pendingBounds && (
                <p className="py-8 text-center text-xs text-zinc-400">
                  No zones yet. Draw your first table zone.
                </p>
              )}

              {localZones.map((zone) => (
                <div
                  key={zone.id}
                  className={`space-y-2 rounded-xl border p-3 ${
                    editingZoneId === zone.id
                      ? "border-zinc-300 bg-zinc-100"
                      : "border-zinc-100 bg-zinc-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full border border-black/10"
                      style={{ backgroundColor: zone.color ?? "#18181b" }}
                    />
                    <input
                      value={zone.name}
                      onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-zinc-900 outline-none hover:border-zinc-200 focus:border-zinc-300 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setDrawMode(false);
                        setPendingBounds(null);
                        setEditingZoneId((prev) => (prev === zone.id ? null : zone.id));
                      }}
                      className={`rounded-md p-1 transition ${
                        editingZoneId === zone.id
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                      }`}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeZone(zone.id)}
                      className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-red-500"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pl-4">
                    <label className="text-[11px] text-zinc-500">Seats</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={zone.capacity}
                      onChange={(e) =>
                        updateZone(zone.id, {
                          capacity: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                    />
                  </div>
                </div>
              ))}
            </div>

            {localZones.length > 0 && (
              <div className="border-t border-zinc-100 px-4 py-3">
                <p className="text-[11px] text-zinc-500">
                  {localZones.length} zones • {localZones.reduce((s, z) => s + z.capacity, 0)} total seats
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function CameraTile({
  camera,
  stream,
  streamUrl,
  status,
  peopleCount,
  fps,
  latencyMs,
  visionConnected,
  timestamp,
  tableSummary,
  tableZones,
  peopleAtTableById,
  detectionSnapshot,
  onConfigureTables,
  onOpenView,
}: {
  camera: CameraPreset;
  stream: MediaStream | null;
  streamUrl?: string | null;
  status: CameraStatus;
  peopleCount: number;
  fps: number;
  latencyMs: number;
  visionConnected: boolean;
  timestamp: string;
  tableSummary?: string;
  tableZones?: TableZone[];
  peopleAtTableById?: Record<string, number>;
  detectionSnapshot?: DetectionSnapshot;
  onConfigureTables?: () => void;
  onOpenView?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaFrameRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) video.play().catch(() => {});
    return () => {
      if (video.srcObject) video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    const frame = mediaFrameRef.current;
    if (!frame) return;

    const sync = () => {
      setViewportSize({
        width: frame.clientWidth,
        height: frame.clientHeight,
      });
    };

    const ro = new ResizeObserver(sync);
    ro.observe(frame);
    sync();
    return () => ro.disconnect();
  }, []);

  return (
    <article
      className={`group overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 shadow-sm transition hover:border-zinc-300 hover:shadow-md ${
        onOpenView ? "cursor-pointer" : ""
      }`}
      onClick={onOpenView}
    >
      <div ref={mediaFrameRef} className="relative aspect-[16/10] w-full">
        {stream ? (
          <video
            ref={videoRef}
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{ filter: camera.filter }}
          />
        ) : streamUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={streamUrl}
            alt={`${camera.name} stream`}
            className="h-full w-full object-cover"
            style={{ filter: camera.filter }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
            <div className="flex flex-col items-center gap-2">
              <Camera className="size-8 text-zinc-600" />
              <span>No signal</span>
            </div>
          </div>
        )}

        {camera.id === ENTRANCE_CAMERA_ID &&
          detectionSnapshot &&
          detectionSnapshot.boxes.length > 0 && (
            <div className="pointer-events-none absolute inset-0">
              {detectionSnapshot.boxes.map((box, index) => {
                const rect = mapBoxToCoverViewport(
                  box,
                  detectionSnapshot.frameWidth,
                  detectionSnapshot.frameHeight,
                  viewportSize.width,
                  viewportSize.height
                );
                if (!rect) return null;
                return (
                  <div
                    key={`entrance-bbox-${index}`}
                    className="absolute border-2 border-red-500/90 bg-red-500/10"
                    style={{
                      left: `${(rect.left / viewportSize.width) * 100}%`,
                      top: `${(rect.top / viewportSize.height) * 100}%`,
                      width: `${(rect.width / viewportSize.width) * 100}%`,
                      height: `${(rect.height / viewportSize.height) * 100}%`,
                    }}
                  />
                );
              })}
            </div>
          )}

        {tableZones && tableZones.length > 0 && (
          <div className="pointer-events-none absolute inset-0">
            {tableZones.map((zone) => {
              const isOccupied = zone.status === "occupied";
              const currentAtTable = peopleAtTableById?.[zone.id] ?? 0;
              const dwellLabel =
                currentAtTable > 0 && isOccupied ? formatDwell(zone.seated_at) : "00:00";
              return (
                <div
                  key={zone.id}
                  className="absolute"
                  style={{
                    left: `${zone.x * 100}%`,
                    top: `${zone.y * 100}%`,
                    width: `${zone.w * 100}%`,
                    height: `${zone.h * 100}%`,
                    border: `2px solid ${isOccupied ? "#ef4444" : "#10b981"}`,
                    backgroundColor: isOccupied ? "rgba(239,68,68,0.16)" : "rgba(16,185,129,0.14)",
                  }}
                >
                  <div
                    className="inline-block px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    style={{
                      backgroundColor: isOccupied ? "#ef4444" : "#10b981",
                    }}
                  >
                    {zone.name} {currentAtTable}/{zone.capacity} · {dwellLabel}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${STATUS_BADGE[status]} shadow-sm`} />
          {visionConnected ? (
            <Wifi className="size-3.5 text-white/70" />
          ) : (
            <WifiOff className="size-3.5 text-amber-400/80" />
          )}
        </div>

        <div className="absolute right-3 top-3">
          {camera.id === ENTRANCE_CAMERA_ID ? (
            <span className="rounded-md bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              People detected: {peopleCount}
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <Users className="size-3" />
              {peopleCount}
            </span>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{camera.name}</p>
              <p className="text-[11px] text-zinc-300">
                {camera.id} • {timestamp}
              </p>
              {tableSummary && (
                <p className="mt-1 text-[11px] font-medium text-emerald-300">{tableSummary}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-300 backdrop-blur-sm">
                {fps} FPS
              </span>
              <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-300 backdrop-blur-sm">
                {latencyMs}ms
              </span>
            </div>
          </div>
          {onConfigureTables && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onConfigureTables();
              }}
              className="mt-2 w-full rounded-lg border border-white/20 bg-black/55 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-black/70"
            >
              Configure Table Zones
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function BusinessDashboardPage() {
  const [activeView, setActiveView] = useState<"cameras" | "analytics">("cameras");
  const [activeZone, setActiveZone] = useState<Zone>("All");
  const [cameraStreams, setCameraStreams] = useState<Record<string, MediaStream | null>>({
    [ENTRANCE_CAMERA_ID]: null,
    [FLOOR_CAMERA_ID]: null,
  });
  const streamsRef = useRef<Record<string, MediaStream | null>>({
    [ENTRANCE_CAMERA_ID]: null,
    [FLOOR_CAMERA_ID]: null,
  });
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<{
    entrance: string;
    dining: string;
  }>({ entrance: "", dining: "" });
  const [useVisionBridgeForDining, setUseVisionBridgeForDining] = useState(true);
  const [diningSourceIndex, setDiningSourceIndex] = useState(0);
  const [visionBridgeCameraIdByRole, setVisionBridgeCameraIdByRole] = useState<{
    entrance: string | null;
    dining: string | null;
  }>({ entrance: null, dining: null });
  const visionBridgeIdsRef = useRef<{ entrance: string | null; dining: string | null }>({
    entrance: null,
    dining: null,
  });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [visionConnectedByCamera, setVisionConnectedByCamera] = useState<Record<string, boolean>>({
    [ENTRANCE_CAMERA_ID]: false,
    [FLOOR_CAMERA_ID]: false,
  });
  const [peopleCountByCamera, setPeopleCountByCamera] = useState<Record<string, number>>({
    [ENTRANCE_CAMERA_ID]: 0,
    [FLOOR_CAMERA_ID]: 0,
  });
  const [detectionSnapshotByCamera, setDetectionSnapshotByCamera] = useState<
    Record<string, DetectionSnapshot>
  >({
    [ENTRANCE_CAMERA_ID]: { boxes: [], frameWidth: 0, frameHeight: 0 },
    [FLOOR_CAMERA_ID]: { boxes: [], frameWidth: 0, frameHeight: 0 },
  });
  const [estimatedFpsByCamera, setEstimatedFpsByCamera] = useState<Record<string, number>>({
    [ENTRANCE_CAMERA_ID]: 0,
    [FLOOR_CAMERA_ID]: 0,
  });
  const [timestamp, setTimestamp] = useState(now());
  const [trafficSamples, setTrafficSamples] = useState<TrafficSample[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("traffic-samples-v1");
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved) as TrafficSample[];
      if (!Array.isArray(parsed)) return [];
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      return parsed
        .filter(
          (sample) =>
            sample &&
            typeof sample.timestamp === "number" &&
            typeof sample.totalPeople === "number"
        )
        .filter((sample) => sample.timestamp >= oneDayAgo);
    } catch {
      return [];
    }
  });
  const [zoneEditorOpen, setZoneEditorOpen] = useState(false);
  const [zones, setZones] = useState<TableZone[]>([]);
  const [peopleAtTableById, setPeopleAtTableById] = useState<Record<string, number>>({});
  const [zoneLoadError, setZoneLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const analysisEntranceVideoRef = useRef<HTMLVideoElement>(null);
  const analysisEntranceCanvasRef = useRef<HTMLCanvasElement>(null);
  const analysisDiningVideoRef = useRef<HTMLVideoElement>(null);
  const analysisDiningCanvasRef = useRef<HTMLCanvasElement>(null);
  const detectInflightRef = useRef<Record<string, boolean>>({
    [ENTRANCE_CAMERA_ID]: false,
    [FLOOR_CAMERA_ID]: false,
  });
  const lastFpsUiUpdateRef = useRef<Record<string, number>>({
    [ENTRANCE_CAMERA_ID]: 0,
    [FLOOR_CAMERA_ID]: 0,
  });

  const zoneStateRef = useRef<
    Record<string, { occupied: boolean; hasSeenMultiPerson: boolean }>
  >({});
  const lastPostedOccupancyRef = useRef<string>("");

  const stopStream = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const isIphoneCameraLabel = useCallback((label: string) => {
    return /(iphone|continuity)/i.test(label);
  }, []);

  const isLikelyLocalCameraLabel = useCallback((label: string) => {
    return /(facetime|built-?in|integrated|internal|webcam)/i.test(label) && !isIphoneCameraLabel(label);
  }, [isIphoneCameraLabel]);

  const pickDefaultDeviceIds = useCallback((inputs: MediaDeviceInfo[]) => {
    if (inputs.length === 0) {
      return { entrance: "", dining: "" };
    }

    const iphone = inputs.find((d) => isIphoneCameraLabel(d.label));
    const local =
      inputs.find((d) => isLikelyLocalCameraLabel(d.label)) ??
      inputs.find((d) => d.deviceId !== iphone?.deviceId) ??
      inputs[0];

    const dining = iphone ?? inputs.find((d) => d.deviceId !== local?.deviceId) ?? inputs[0];

    return {
      entrance: local?.deviceId ?? "",
      dining: dining?.deviceId ?? "",
    };
  }, [isIphoneCameraLabel, isLikelyLocalCameraLabel]);

  const chooseValidSelection = useCallback(
    (
      previous: { entrance: string; dining: string },
      inputs: MediaDeviceInfo[]
    ) => {
      if (inputs.length === 0) {
        return { entrance: "", dining: "" };
      }

      const defaults = pickDefaultDeviceIds(inputs);
      const hasDevice = (deviceId: string) => inputs.some((d) => d.deviceId === deviceId);

      const entrance = hasDevice(previous.entrance) ? previous.entrance : defaults.entrance;
      let dining = hasDevice(previous.dining) ? previous.dining : defaults.dining;

      if (entrance === dining && inputs.length > 1) {
        const altForDining = inputs.find((d) => d.deviceId !== entrance);
        if (altForDining) {
          dining = altForDining.deviceId;
        }
      }

      return { entrance, dining };
    },
    [pickDefaultDeviceIds]
  );

  const refreshVideoInputs = useCallback(
    async (ensurePermission: boolean) => {
      let bootstrapStream: MediaStream | null = null;

      if (ensurePermission) {
        try {
          // Ensure labels are available before enumerateDevices().
          bootstrapStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch {
          setCameraError("Camera permission denied or no camera available.");
          return;
        } finally {
          stopStream(bootstrapStream);
        }
      }

      try {
        const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
          (device) => device.kind === "videoinput"
        );
        setVideoInputs(inputs);
        setSelectedDeviceIds((previous) => chooseValidSelection(previous, inputs));
        if (inputs.length === 0) {
          setCameraError("No camera devices found.");
        } else {
          setCameraError(null);
        }
      } catch {
        setCameraError("Unable to enumerate camera devices.");
      }
    },
    [chooseValidSelection, stopStream]
  );

  const setVisionBridgeIds = useCallback((next: { entrance: string | null; dining: string | null }) => {
    visionBridgeIdsRef.current = next;
    setVisionBridgeCameraIdByRole(next);
  }, []);

  const stopVisionBridgeCameras = useCallback(async () => {
    const ids = [visionBridgeIdsRef.current.dining].filter(
      (id): id is string => Boolean(id)
    );
    await Promise.all(
      ids.map((cameraId) =>
        fetch(`${VISION_SERVER}/cameras/${cameraId}`, { method: "DELETE" }).catch(() => null)
      )
    );
    setVisionBridgeIds({ entrance: null, dining: null });
  }, [setVisionBridgeIds]);

  const startVisionBridgeCameras = useCallback(async () => {
    try {
      await stopVisionBridgeCameras();

      const diningRes = await fetch(`${VISION_SERVER}/cameras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: diningSourceIndex,
          name: "Dining Camera",
          zone: "Dining",
        }),
      });
      if (!diningRes.ok) {
        throw new Error(`Unable to start dining camera source ${diningSourceIndex}`);
      }
      const dining = (await diningRes.json()) as VisionCameraInfo;

      setVisionBridgeIds({
        entrance: null,
        dining: dining.camera_id,
      });
      setCameraError(null);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? err.message
          : `Unable to start vision camera bridge (source ${diningSourceIndex}).`
      );
    }
  }, [diningSourceIndex, setVisionBridgeIds, stopVisionBridgeCameras]);

  useEffect(() => {
    const timer = setInterval(() => setTimestamp(now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadZones = useCallback(async () => {
    try {
      setZoneLoadError(null);
      const res = await fetch(`/api/cameras/${FLOOR_CAMERA_ID}/table-zones`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { zones?: TableZone[] };
      const loadedZones = data.zones ?? [];
      setZones(loadedZones);
      setPeopleAtTableById((prev) => {
        const next: Record<string, number> = {};
        for (const zone of loadedZones) {
          next[zone.id] = prev[zone.id] ?? 0;
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to load zones", err);
      setZoneLoadError("Unable to load floor table zones.");
    }
  }, []);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  useEffect(() => {
    refreshVideoInputs(true);

    const onDeviceChange = () => {
      refreshVideoInputs(false);
    };

    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
    };
  }, [refreshVideoInputs]);

  useEffect(() => {
    if (!selectedDeviceIds.entrance && !selectedDeviceIds.dining) return;

    let cancelled = false;
    const nextStreams: Record<string, MediaStream | null> = {
      [ENTRANCE_CAMERA_ID]: null,
      [FLOOR_CAMERA_ID]: null,
    };
    const errors: string[] = [];

    async function startCamera(cameraId: string, deviceId: string, label: string) {
      if (!deviceId) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stopStream(stream);
          return;
        }
        nextStreams[cameraId] = stream;
      } catch {
        errors.push(`Unable to start ${label}.`);
      }
    }

    async function startSelectedCameras() {
      await Promise.all([
        startCamera(ENTRANCE_CAMERA_ID, selectedDeviceIds.entrance, "entrance camera"),
        ...(useVisionBridgeForDining
          ? []
          : [startCamera(FLOOR_CAMERA_ID, selectedDeviceIds.dining, "dining camera")]),
      ]);

      if (cancelled) {
        stopStream(nextStreams[ENTRANCE_CAMERA_ID]);
        stopStream(nextStreams[FLOOR_CAMERA_ID]);
        return;
      }

      stopStream(streamsRef.current[ENTRANCE_CAMERA_ID]);
      stopStream(streamsRef.current[FLOOR_CAMERA_ID]);
      if (useVisionBridgeForDining) {
        nextStreams[FLOOR_CAMERA_ID] = null;
      }
      streamsRef.current = nextStreams;
      setCameraStreams(nextStreams);
      setCameraError(errors.length > 0 ? errors.join(" ") : null);
    }

    startSelectedCameras();

    return () => {
      cancelled = true;
    };
  }, [selectedDeviceIds.dining, selectedDeviceIds.entrance, stopStream, useVisionBridgeForDining]);

  useEffect(() => {
    return () => {
      stopStream(streamsRef.current[ENTRANCE_CAMERA_ID]);
      stopStream(streamsRef.current[FLOOR_CAMERA_ID]);
    };
  }, [stopStream]);

  useEffect(() => {
    if (!useVisionBridgeForDining) {
      stopVisionBridgeCameras();
      return;
    }
    startVisionBridgeCameras();
    return () => {
      stopVisionBridgeCameras();
    };
  }, [startVisionBridgeCameras, stopVisionBridgeCameras, useVisionBridgeForDining]);

  useEffect(() => {
    const video = analysisEntranceVideoRef.current;
    if (!video) return;
    video.srcObject = cameraStreams[ENTRANCE_CAMERA_ID];
    if (cameraStreams[ENTRANCE_CAMERA_ID]) video.play().catch(() => {});
  }, [cameraStreams]);

  useEffect(() => {
    const video = analysisDiningVideoRef.current;
    if (!video) return;
    video.srcObject = cameraStreams[FLOOR_CAMERA_ID];
    if (cameraStreams[FLOOR_CAMERA_ID]) video.play().catch(() => {});
  }, [cameraStreams]);

  const syncFloorOccupancy = useCallback(
    async (boxes: number[][], frameWidth: number, frameHeight: number) => {
      if (zones.length === 0 || frameWidth <= 0 || frameHeight <= 0) return;

      const normalizedBoxes = boxes
        .map((box) => {
          const [x1, y1, x2, y2] = box;
          const left = Math.max(0, Math.min(x1, x2)) / frameWidth;
          const top = Math.max(0, Math.min(y1, y2)) / frameHeight;
          const right = Math.min(frameWidth, Math.max(x1, x2)) / frameWidth;
          const bottom = Math.min(frameHeight, Math.max(y1, y2)) / frameHeight;
          const w = Math.max(0, right - left);
          const h = Math.max(0, bottom - top);
          return { x: left, y: top, w, h };
        })
        .filter((box) => box.w > 0 && box.h > 0);

      const nextStable: { id: string; occupied: boolean }[] = [];
      const nextPeopleAtTableById: Record<string, number> = {};

      for (const zone of zones) {
        const zoneRect = { x: zone.x, y: zone.y, w: zone.w, h: zone.h };
        const currentAtTable = normalizedBoxes.filter((box) => {
          const overlap = overlapArea(box, zoneRect);
          // Occupied if any part of the person box intersects the table zone.
          return overlap > 0;
        }).length;
        nextPeopleAtTableById[zone.id] = currentAtTable;

        const state = zoneStateRef.current[zone.id] ?? {
          occupied: zone.status === "occupied",
          hasSeenMultiPerson: zone.status === "occupied",
        };
        if (currentAtTable > 1) {
          state.hasSeenMultiPerson = true;
        }
        // Dwell activation gate:
        // 1) First trigger requires >1 people in-zone.
        // 2) After that has happened once for this table, any in-zone person keeps/restarts occupancy.
        const rawOccupied = state.hasSeenMultiPerson && currentAtTable > 0;

        if (rawOccupied) {
          if (!state.occupied) {
            state.occupied = true;
          }
        } else {
          if (state.occupied) {
            state.occupied = false;
          }
        }

        zoneStateRef.current[zone.id] = state;
        nextStable.push({ id: zone.id, occupied: state.occupied });
      }

      setPeopleAtTableById(nextPeopleAtTableById);

      const signature = JSON.stringify(nextStable);
      if (signature === lastPostedOccupancyRef.current) return;
      lastPostedOccupancyRef.current = signature;

      try {
        const res = await fetch(`/api/cameras/${FLOOR_CAMERA_ID}/table-occupancy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextStable),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as { zones?: TableZone[] };
        if (Array.isArray(data.zones)) {
          setZones(data.zones);
          setPeopleAtTableById((prev) => {
            const next: Record<string, number> = {};
            for (const zone of data.zones ?? []) {
              next[zone.id] = prev[zone.id] ?? 0;
            }
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to sync occupancy", err);
      }
    },
    [zones]
  );

  useEffect(() => {
    if (!useVisionBridgeForDining) return;
    const diningBridgeId = visionBridgeCameraIdByRole.dining;
    if (!diningBridgeId) return;

    const poll = () => {
      const t0 = performance.now();

      fetch(`${VISION_SERVER}/cameras/${diningBridgeId}/state`, {
          cache: "no-store",
        })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json() as Promise<VisionCameraState>;
        })
        .then((diningState) => {
          setPeopleCountByCamera((prev) => ({
            ...prev,
            [FLOOR_CAMERA_ID]: diningState.people_count ?? 0,
          }));
          setVisionConnectedByCamera((prev) => ({
            ...prev,
            [FLOOR_CAMERA_ID]: true,
          }));
          setEstimatedFpsByCamera((prev) => {
            const fps = Math.max(1, Math.round(1000 / Math.max(performance.now() - t0, 1)));
            return {
              ...prev,
              [FLOOR_CAMERA_ID]: fps,
            };
          });

          const boxes = Array.isArray(diningState.boxes) ? diningState.boxes : [];
          const width = Number(diningState.frame_width) || 0;
          const height = Number(diningState.frame_height) || 0;
          if (width > 0 && height > 0) {
            syncFloorOccupancy(boxes, width, height);
          }
        })
        .catch(() =>
          setVisionConnectedByCamera((prev) => ({
            ...prev,
            [FLOOR_CAMERA_ID]: false,
          }))
        );
    };

    poll();
    const interval = setInterval(poll, 900);
    return () => clearInterval(interval);
  }, [syncFloorOccupancy, useVisionBridgeForDining, visionBridgeCameraIdByRole.dining]);

  useEffect(() => {
    const entranceStream = cameraStreams[ENTRANCE_CAMERA_ID];
    if (!entranceStream) {
      setDetectionSnapshotByCamera((prev) => ({
        ...prev,
        [ENTRANCE_CAMERA_ID]: { boxes: [], frameWidth: 0, frameHeight: 0 },
      }));
      return;
    }

    const video = analysisEntranceVideoRef.current;
    const canvas = analysisEntranceCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!video || !canvas || !ctx) return;

    const detect = () => {
      if (detectInflightRef.current[ENTRANCE_CAMERA_ID] || video.readyState < 2) return;

      const frameWidth = DETECT_FRAME_WIDTH;
      const scale = frameWidth / (video.videoWidth || 1280);
      const frameHeight = Math.round((video.videoHeight || 720) * scale);
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      ctx.drawImage(video, 0, 0, frameWidth, frameHeight);

      const image = canvas.toDataURL("image/jpeg", DETECT_JPEG_QUALITY).split(",")[1];
      const t0 = performance.now();
      detectInflightRef.current[ENTRANCE_CAMERA_ID] = true;

      fetch(`${VISION_SERVER}/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          include_annotated: false,
          include_tracking: false,
          imgsz: DETECT_MODEL_IMGSZ,
        }),
      })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then(
          (d: {
            count?: number;
            boxes?: number[][];
            frame_width?: number;
            frame_height?: number;
          }) => {
            const boxes = Array.isArray(d.boxes) ? d.boxes : [];
            const responseFrameWidth =
              typeof d.frame_width === "number" && d.frame_width > 0 ? d.frame_width : frameWidth;
            const responseFrameHeight =
              typeof d.frame_height === "number" && d.frame_height > 0 ? d.frame_height : frameHeight;
            setPeopleCountByCamera((prev) => ({
              ...prev,
              [ENTRANCE_CAMERA_ID]: typeof d.count === "number" ? d.count : 0,
            }));
            setDetectionSnapshotByCamera((prev) => ({
              ...prev,
              [ENTRANCE_CAMERA_ID]: {
                boxes,
                frameWidth: responseFrameWidth,
                frameHeight: responseFrameHeight,
              },
            }));
            setVisionConnectedByCamera((prev) =>
              prev[ENTRANCE_CAMERA_ID] ? prev : { ...prev, [ENTRANCE_CAMERA_ID]: true }
            );

            const measuredFps = Math.max(
              1,
              Math.round(1000 / Math.max(performance.now() - t0, 1))
            );
            const nowMs = performance.now();
            if (nowMs - lastFpsUiUpdateRef.current[ENTRANCE_CAMERA_ID] >= 900) {
              lastFpsUiUpdateRef.current[ENTRANCE_CAMERA_ID] = nowMs;
              setEstimatedFpsByCamera((prev) =>
                prev[ENTRANCE_CAMERA_ID] === measuredFps
                  ? prev
                  : { ...prev, [ENTRANCE_CAMERA_ID]: measuredFps }
              );
            }
          }
        )
        .catch(() => {
          setDetectionSnapshotByCamera((prev) => ({
            ...prev,
            [ENTRANCE_CAMERA_ID]: { boxes: [], frameWidth: 0, frameHeight: 0 },
          }));
          setVisionConnectedByCamera((prev) =>
            prev[ENTRANCE_CAMERA_ID] ? { ...prev, [ENTRANCE_CAMERA_ID]: false } : prev
          );
        })
        .finally(() => {
          detectInflightRef.current[ENTRANCE_CAMERA_ID] = false;
        });
    };

    detect();
    const interval = setInterval(detect, ENTRANCE_DETECT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [cameraStreams]);

  useEffect(() => {
    if (useVisionBridgeForDining) return;
    const diningStream = cameraStreams[FLOOR_CAMERA_ID];
    if (!diningStream) return;

    const video = analysisDiningVideoRef.current;
    const canvas = analysisDiningCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!video || !canvas || !ctx) return;

    const detect = () => {
      if (detectInflightRef.current[FLOOR_CAMERA_ID] || video.readyState < 2) return;

      const frameWidth = DETECT_FRAME_WIDTH;
      const scale = frameWidth / (video.videoWidth || 1280);
      const frameHeight = Math.round((video.videoHeight || 720) * scale);
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      ctx.drawImage(video, 0, 0, frameWidth, frameHeight);

      const image = canvas.toDataURL("image/jpeg", DETECT_JPEG_QUALITY).split(",")[1];
      const t0 = performance.now();
      detectInflightRef.current[FLOOR_CAMERA_ID] = true;

      fetch(`${VISION_SERVER}/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          include_annotated: false,
          include_tracking: false,
          imgsz: DETECT_MODEL_IMGSZ,
        }),
      })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then(
          (d: {
            count?: number;
            boxes?: number[][];
            frame_width?: number;
            frame_height?: number;
          }) => {
            setPeopleCountByCamera((prev) => ({
              ...prev,
              [FLOOR_CAMERA_ID]: typeof d.count === "number" ? d.count : 0,
            }));
            setVisionConnectedByCamera((prev) =>
              prev[FLOOR_CAMERA_ID] ? prev : { ...prev, [FLOOR_CAMERA_ID]: true }
            );

            const measuredFps = Math.max(
              1,
              Math.round(1000 / Math.max(performance.now() - t0, 1))
            );
            const nowMs = performance.now();
            if (nowMs - lastFpsUiUpdateRef.current[FLOOR_CAMERA_ID] >= 900) {
              lastFpsUiUpdateRef.current[FLOOR_CAMERA_ID] = nowMs;
              setEstimatedFpsByCamera((prev) =>
                prev[FLOOR_CAMERA_ID] === measuredFps
                  ? prev
                  : { ...prev, [FLOOR_CAMERA_ID]: measuredFps }
              );
            }

            const boxes = Array.isArray(d.boxes) ? d.boxes : [];
            const w = typeof d.frame_width === "number" ? d.frame_width : frameWidth;
            const h = typeof d.frame_height === "number" ? d.frame_height : frameHeight;
            syncFloorOccupancy(boxes, w, h);
          }
        )
        .catch(() =>
          setVisionConnectedByCamera((prev) =>
            prev[FLOOR_CAMERA_ID] ? { ...prev, [FLOOR_CAMERA_ID]: false } : prev
          )
        )
        .finally(() => {
          detectInflightRef.current[FLOOR_CAMERA_ID] = false;
        });
    };

    detect();
    const interval = setInterval(detect, FLOOR_DETECT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [cameraStreams, syncFloorOccupancy, useVisionBridgeForDining]);

  const saveZones = useCallback(async (draftZones: TableZone[]) => {
    setSaveStatus("saving");
    try {
      const payload = draftZones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        capacity: zone.capacity,
        x: zone.x,
        y: zone.y,
        w: zone.w,
        h: zone.h,
        color: zone.color,
      }));

      const res = await fetch(`/api/cameras/${FLOOR_CAMERA_ID}/table-zones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { zones?: TableZone[] };
      const savedZones = data.zones ?? [];
      setZones(savedZones);
      setPeopleAtTableById((prev) => {
        const next: Record<string, number> = {};
        for (const zone of savedZones) {
          next[zone.id] = prev[zone.id] ?? 0;
        }
        return next;
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1800);
    } catch (err) {
      console.error("Failed to save zones", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2200);
    }
  }, []);

  const cameraOptionLabel = useCallback((device: MediaDeviceInfo, index: number) => {
    const raw = device.label?.trim();
    return raw.length > 0 ? raw : `Camera ${index + 1}`;
  }, []);

  const hasIphoneCameraOption = useMemo(
    () => videoInputs.some((device) => isIphoneCameraLabel(device.label)),
    [isIphoneCameraLabel, videoInputs]
  );

  const entranceDeviceLabel = useMemo(() => {
    const index = videoInputs.findIndex((device) => device.deviceId === selectedDeviceIds.entrance);
    if (index < 0) return "Not selected";
    return cameraOptionLabel(videoInputs[index], index);
  }, [cameraOptionLabel, selectedDeviceIds.entrance, videoInputs]);

  const diningDeviceLabel = useMemo(() => {
    const index = videoInputs.findIndex((device) => device.deviceId === selectedDeviceIds.dining);
    if (index < 0) return "Not selected";
    return cameraOptionLabel(videoInputs[index], index);
  }, [cameraOptionLabel, selectedDeviceIds.dining, videoInputs]);

  const diningVisionStreamUrl = useMemo(() => {
    if (!useVisionBridgeForDining || !visionBridgeCameraIdByRole.dining) return null;
    return `${VISION_SERVER}/stream/${visionBridgeCameraIdByRole.dining}`;
  }, [useVisionBridgeForDining, visionBridgeCameraIdByRole.dining]);

  const cameraData = useMemo(
    () =>
      CAMERA_PRESETS.map((cam, i) => ({
        ...cam,
        stream:
          cam.id === FLOOR_CAMERA_ID && useVisionBridgeForDining
            ? null
            : cameraStreams[cam.id],
        streamUrl:
          cam.id === FLOOR_CAMERA_ID && useVisionBridgeForDining
            ? diningVisionStreamUrl
            : null,
        visionConnected: visionConnectedByCamera[cam.id] ?? false,
        status: ((cam.id === FLOOR_CAMERA_ID && useVisionBridgeForDining
          ? Boolean(diningVisionStreamUrl)
          : Boolean(cameraStreams[cam.id]))
          ? visionConnectedByCamera[cam.id]
            ? "online"
            : "degraded"
          : "offline") as CameraStatus,
        peopleCount: Math.max(0, (peopleCountByCamera[cam.id] ?? 0) + cam.peopleOffset),
        fps:
          (cam.id === FLOOR_CAMERA_ID && useVisionBridgeForDining
            ? Boolean(diningVisionStreamUrl)
            : Boolean(cameraStreams[cam.id]))
            ? Math.max(1, estimatedFpsByCamera[cam.id] ?? 0)
            : 0,
        latencyMs:
          (cam.id === FLOOR_CAMERA_ID && useVisionBridgeForDining
            ? Boolean(diningVisionStreamUrl)
            : Boolean(cameraStreams[cam.id]))
            ? 84 + i * 11
            : 0,
      })),
    [
      cameraStreams,
      diningVisionStreamUrl,
      estimatedFpsByCamera,
      peopleCountByCamera,
      useVisionBridgeForDining,
      visionConnectedByCamera,
    ]
  );

  const visionConnected = cameraData.some((cam) => cam.visionConnected);
  const occupiedCount = zones.filter((zone) => zone.status === "occupied").length;
  const floorSummary =
    zones.length > 0
      ? `${occupiedCount}/${zones.length} tables occupied`
      : "No table zones configured";

  const filteredCameras = useMemo(
    () =>
      activeZone === "All"
        ? cameraData
        : cameraData.filter((c) => c.zone === activeZone),
    [cameraData, activeZone]
  );

  const onlineCount = cameraData.filter((c) => c.status === "online").length;
  const totalPeopleNow = useMemo(
    () => cameraData.reduce((acc, cam) => acc + cam.peopleCount, 0),
    [cameraData]
  );

  useEffect(() => {
    const addSample = () => {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      setTrafficSamples((prev) => {
        const next = [...prev, { timestamp: Date.now(), totalPeople: totalPeopleNow }].filter(
          (sample) => sample.timestamp >= oneDayAgo
        );
        localStorage.setItem("traffic-samples-v1", JSON.stringify(next));
        return next;
      });
    };

    addSample();
    const interval = setInterval(addSample, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [totalPeopleNow]);

  const zonePeopleNow = useMemo(() => {
    if (USE_FAKE_ANALYTICS) {
      return MOCK_ZONE_DISTRIBUTION.reduce<Record<string, number>>((acc, item) => {
        acc[item.zone] = item.count;
        return acc;
      }, {});
    }
    const next: Record<string, number> = {};
    for (const cam of cameraData) {
      next[cam.zone] = (next[cam.zone] ?? 0) + cam.peopleCount;
    }
    return next;
  }, [cameraData]);

  const busiestZone = useMemo(() => {
    const entries = Object.entries(zonePeopleNow);
    if (entries.length === 0) return "N/A";
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }, [zonePeopleNow]);

  const hourlyOccupancy = useMemo(() => {
    if (USE_FAKE_ANALYTICS) {
      return MOCK_HOURLY_OCCUPANCY.map((avg, hour) => ({
        hour,
        total: avg,
        samples: 1,
        avg,
        label: `${String(hour).padStart(2, "0")}:00`,
      }));
    }
    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      total: 0,
      samples: 0,
      avg: 0,
      label: `${String(hour).padStart(2, "0")}:00`,
    }));

    for (const sample of trafficSamples) {
      const hour = new Date(sample.timestamp).getHours();
      buckets[hour].total += sample.totalPeople;
      buckets[hour].samples += 1;
    }

    return buckets.map((bucket) => ({
      ...bucket,
      avg: bucket.samples > 0 ? Math.round(bucket.total / bucket.samples) : 0,
    }));
  }, [trafficSamples]);

  const peakHour = useMemo(() => {
    const busiest = [...hourlyOccupancy].sort((a, b) => b.avg - a.avg)[0];
    return busiest?.avg ? busiest.label : "Not enough data";
  }, [hourlyOccupancy]);

  const estimatedVisitorsToday = useMemo(() => {
    if (USE_FAKE_ANALYTICS) return 286;
    if (trafficSamples.length < 2) return totalPeopleNow;
    const ordered = [...trafficSamples].sort((a, b) => a.timestamp - b.timestamp);
    let totalInflow = 0;
    for (let i = 1; i < ordered.length; i += 1) {
      const delta = ordered[i].totalPeople - ordered[i - 1].totalPeople;
      if (delta > 0) totalInflow += delta;
    }
    return totalInflow;
  }, [trafficSamples, totalPeopleNow]);

  const highestHourlyLoad = useMemo(
    () => hourlyOccupancy.reduce((max, hour) => Math.max(max, hour.avg), 0),
    [hourlyOccupancy]
  );

  const trendChart = useMemo(() => {
    const width = 720;
    const height = 220;
    const left = 24;
    const right = width - 24;
    const top = 16;
    const bottom = height - 28;
    const maxY = Math.max(highestHourlyLoad, 1);
    const stepX = (right - left) / Math.max(hourlyOccupancy.length - 1, 1);

    const points = hourlyOccupancy.map((entry, index) => {
      const x = left + index * stepX;
      const y = bottom - (entry.avg / maxY) * (bottom - top);
      return { ...entry, x, y };
    });

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
    const areaPath = `${linePath} L ${right} ${bottom} L ${left} ${bottom} Z`;

    return { width, height, left, right, top, bottom, points, linePath, areaPath };
  }, [hourlyOccupancy, highestHourlyLoad]);

  const zoneDistribution = useMemo(
    () =>
      USE_FAKE_ANALYTICS
        ? MOCK_ZONE_DISTRIBUTION.map((item) => ({ zone: item.zone, count: item.count }))
        : Object.entries(zonePeopleNow)
            .map(([zone, count]) => ({ zone, count }))
            .sort((a, b) => b.count - a.count),
    [zonePeopleNow]
  );

  const totalZonePeople = useMemo(
    () => zoneDistribution.reduce((sum, item) => sum + item.count, 0),
    [zoneDistribution]
  );

  const analyticsLiveOccupancy = USE_FAKE_ANALYTICS ? totalZonePeople : totalPeopleNow;

  const zoneCameraCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cam of cameraData) {
      counts[cam.zone] = (counts[cam.zone] ?? 0) + 1;
    }
    return counts;
  }, [cameraData]);

  const queueByZone = useMemo(
    () => {
      if (USE_FAKE_ANALYTICS) {
        return MOCK_ZONE_DISTRIBUTION.map((item) => ({
          zone: item.zone,
          count: item.count,
          queueMinutes: item.queueMinutes,
          queueLevel: item.queueMinutes >= 12 ? "High" : item.queueMinutes >= 7 ? "Medium" : "Low",
        }));
      }
      return zoneDistribution.map((item) => {
        const cameras = zoneCameraCounts[item.zone] ?? 1;
        const queueMinutes = Math.max(1, Math.round((item.count * 2.8) / cameras));
        const queueLevel = queueMinutes >= 12 ? "High" : queueMinutes >= 7 ? "Medium" : "Low";
        return { ...item, queueMinutes, queueLevel };
      });
    },
    [zoneDistribution, zoneCameraCounts]
  );

  const maxQueueMinutes = useMemo(
    () => queueByZone.reduce((max, item) => Math.max(max, item.queueMinutes), 0),
    [queueByZone]
  );

  const donutSegments = useMemo(() => {
    if (totalZonePeople === 0) return [];
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const palette = ["#111827", "#374151", "#6B7280", "#9CA3AF", "#D1D5DB"];
    let offset = 0;
    return zoneDistribution.slice(0, 5).map((item, index) => {
      const ratio = item.count / totalZonePeople;
      const length = ratio * circumference;
      const segment = {
        ...item,
        stroke: palette[index % palette.length],
        dasharray: `${length} ${circumference - length}`,
        dashoffset: -offset,
        percent: Math.round(ratio * 100),
      };
      offset += length;
      return segment;
    });
  }, [totalZonePeople, zoneDistribution]);

  return (
    <FrostedPage className="font-[var(--font-geist-sans)]">
      <div className="mx-auto w-full max-w-[1400px] px-6 py-5 md:px-10">
        <GlassPanel className="p-5 md:p-7">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/entry"
              className="flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/60 px-3 py-2 text-sm font-medium text-zinc-600 backdrop-blur-lg transition hover:bg-white/80 hover:text-zinc-900"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Restaurant X
              </p>
              <h1 className="text-[clamp(1.4rem,2.2vw,2rem)] font-semibold leading-tight tracking-tight text-zinc-900">
                Business Dashboard
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold tracking-[0.08em] ${
                visionConnected
                  ? "border-emerald-200/90 bg-emerald-50/90 text-emerald-700"
                  : "border-amber-200/90 bg-amber-50/90 text-amber-700"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  visionConnected ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              {visionConnected ? "Vision Connected" : "Vision Offline"}
            </span>
            <FrostedPill className="!py-2 !font-medium">
              {onlineCount}/{cameraData.length} cameras online
            </FrostedPill>
          </div>
        </header>

        <nav className="mt-6 flex items-center gap-2 rounded-2xl border border-white/70 bg-white/55 p-2 backdrop-blur-lg">
          <button
            type="button"
            onClick={() => setActiveView("cameras")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeView === "cameras" ? "bg-black text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            Cameras
          </button>
          <button
            type="button"
            onClick={() => setActiveView("analytics")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeView === "analytics" ? "bg-black text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            Analytics
          </button>
        </nav>

        {activeView === "cameras" && (
          <>
            <nav className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/70 bg-white/55 p-2 backdrop-blur-lg">
              {ZONES.map((zone) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => setActiveZone(zone)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    activeZone === zone
                      ? "bg-black text-white shadow-sm"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  {zone}
                </button>
              ))}

              <div className="ml-auto flex items-center gap-2">
                <div className="hidden rounded-xl border border-white/70 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-zinc-600 md:block">
                  Entrance: {entranceDeviceLabel}
                </div>
                <div className="hidden rounded-xl border border-white/70 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-zinc-600 md:block">
                  Dining: {useVisionBridgeForDining ? `Vision source ${diningSourceIndex}` : diningDeviceLabel}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl border-transparent bg-black px-4 text-xs font-semibold text-white hover:bg-zinc-800"
                  onClick={() => setZoneEditorOpen(true)}
                >
                  Configure Floor Tables
                </Button>
              </div>
            </nav>

            {videoInputs.length > 0 && (
              <section className="mt-4 rounded-[1.4rem] border border-white/70 bg-white/55 p-4 backdrop-blur-lg md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      Camera Assignment
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Route entrance and dining feeds with consistent source controls.
                    </p>
                  </div>
                  <FrostedPill className="!min-h-8 !px-3 !py-1.5 !text-[10px] !font-medium">
                    {videoInputs.length} video input{videoInputs.length !== 1 ? "s" : ""}
                  </FrostedPill>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[1.15fr_1fr]">
                  <div className="rounded-2xl border border-white/70 bg-white/65 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Bridge Controls
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => refreshVideoInputs(false)}
                        className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100"
                      >
                        Refresh Camera List
                      </button>
                      <button
                        type="button"
                        onClick={() => setUseVisionBridgeForDining((prev) => !prev)}
                        className={`rounded-xl border px-3 py-1.5 text-[11px] font-medium transition ${
                          useVisionBridgeForDining
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                        }`}
                      >
                        {useVisionBridgeForDining ? "Dining via Vision Bridge: ON" : "Dining via Vision Bridge: OFF"}
                      </button>
                      {useVisionBridgeForDining && (
                        <>
                          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
                            <span className="text-[11px] text-zinc-600">Dining source index</span>
                            <input
                              type="number"
                              min={0}
                              max={8}
                              value={diningSourceIndex}
                              onChange={(e) => setDiningSourceIndex(Math.max(0, Number(e.target.value) || 0))}
                              className="w-12 rounded border border-zinc-300 px-1 py-0.5 text-xs text-zinc-800 outline-none focus:border-zinc-500"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={startVisionBridgeCameras}
                            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100"
                          >
                            Restart Vision Bridge
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/65 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Current Routing
                    </p>
                    <div className="mt-2 space-y-2">
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-medium text-zinc-600">
                        Entrance: {entranceDeviceLabel}
                      </div>
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-medium text-zinc-600">
                        Dining: {useVisionBridgeForDining ? `Vision source ${diningSourceIndex}` : diningDeviceLabel}
                      </div>
                    </div>
                  </div>
                </div>

                {(!hasIphoneCameraOption ||
                  (selectedDeviceIds.entrance === selectedDeviceIds.dining && videoInputs.length > 1)) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!hasIphoneCameraOption && (
                      <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700">
                        iPhone/Continuity camera not detected yet.
                      </span>
                    )}
                    {selectedDeviceIds.entrance === selectedDeviceIds.dining && videoInputs.length > 1 && (
                      <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700">
                        Entrance and dining are set to the same device.
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Entrance Camera (local)
                    </span>
                    <select
                      value={selectedDeviceIds.entrance}
                      onChange={(e) =>
                        setSelectedDeviceIds((prev) => {
                          const entrance = e.target.value;
                          if (entrance !== prev.dining || videoInputs.length <= 1) {
                            return { ...prev, entrance };
                          }
                          const alt = videoInputs.find((device) => device.deviceId !== entrance);
                          return { entrance, dining: alt?.deviceId ?? prev.dining };
                        })
                      }
                      className="rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 text-sm text-zinc-800 outline-none transition focus:border-zinc-400"
                    >
                      {videoInputs.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {cameraOptionLabel(device, index)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Dining Camera (iPhone Continuity)
                    </span>
                    <select
                      value={selectedDeviceIds.dining}
                      disabled={useVisionBridgeForDining}
                      onChange={(e) =>
                        setSelectedDeviceIds((prev) => {
                          const dining = e.target.value;
                          if (dining !== prev.entrance || videoInputs.length <= 1) {
                            return { ...prev, dining };
                          }
                          const alt = videoInputs.find((device) => device.deviceId !== dining);
                          return { entrance: alt?.deviceId ?? prev.entrance, dining };
                        })
                      }
                      className="rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 text-sm text-zinc-800 outline-none transition focus:border-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                    >
                      {videoInputs.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {cameraOptionLabel(device, index)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
            )}

            {cameraError && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {cameraError}
              </div>
            )}

            {zoneLoadError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {zoneLoadError}
              </div>
            )}

            <section className="mt-6 rounded-2xl border border-white/70 bg-white/55 p-4 backdrop-blur-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    Floor Occupancy
                  </p>
                  <p className="mt-1 text-sm font-medium text-zinc-700">{floorSummary}</p>
                </div>
                <Button
                  size="sm"
                  className="h-8 rounded-xl bg-black px-4 text-xs font-semibold text-white hover:bg-zinc-800"
                  onClick={() => setZoneEditorOpen(true)}
                >
                  Manage Zones
                </Button>
              </div>

              {zones.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {zones.map((zone) => {
                    const currentAtTable = peopleAtTableById[zone.id] ?? 0;
                    const isOccupied = zone.status === "occupied";
                    return (
                      <div
                        key={zone.id}
                        className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-zinc-800">{zone.name}</p>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                              isOccupied
                                ? "bg-red-100 text-red-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {isOccupied ? "occupied" : "open"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-zinc-700">
                          {isOccupied
                            ? `Table occupied, ${currentAtTable}/${zone.capacity}`
                            : `Table open, ${currentAtTable}/${zone.capacity}`}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Dwell: {currentAtTable > 0 && isOccupied ? formatDwell(zone.seated_at) : "00:00"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mt-6">
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-base font-semibold text-zinc-900">
                  {activeZone === "All" ? "Camera feeds" : `${activeZone} camera feeds`}
                </h2>
                <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-500">
                  {filteredCameras.length} camera{filteredCameras.length !== 1 ? "s" : ""}
                </span>
                <div className="flex-1 border-t border-zinc-200" />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {filteredCameras.map((cam) => (
                  <CameraTile
                    key={cam.id}
                    camera={cam}
                    stream={cam.stream}
                    streamUrl={cam.streamUrl}
                    status={cam.status}
                    peopleCount={cam.peopleCount}
                    fps={cam.fps}
                    latencyMs={cam.latencyMs}
                    visionConnected={cam.visionConnected}
                    timestamp={timestamp}
                    tableSummary={cam.id === FLOOR_CAMERA_ID ? floorSummary : undefined}
                    tableZones={cam.id === FLOOR_CAMERA_ID ? zones : undefined}
                    peopleAtTableById={cam.id === FLOOR_CAMERA_ID ? peopleAtTableById : undefined}
                    detectionSnapshot={
                      cam.id === ENTRANCE_CAMERA_ID
                        ? detectionSnapshotByCamera[ENTRANCE_CAMERA_ID]
                        : undefined
                    }
                    onOpenView={cam.id === FLOOR_CAMERA_ID ? () => setZoneEditorOpen(true) : undefined}
                    onConfigureTables={
                      cam.id === FLOOR_CAMERA_ID
                        ? () => setZoneEditorOpen(true)
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>

            {filteredCameras.length === 0 && (
              <div className="mt-12 flex flex-col items-center gap-3 text-zinc-400">
                <Camera className="size-12" />
                <p className="text-sm font-medium">No cameras in this zone</p>
              </div>
            )}
          </>
        )}

        {activeView === "analytics" && (
          <section className="mt-4 flex flex-col gap-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Estimated visitors (24h)</p>
                <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-zinc-900">
                  <Users className="size-5 text-zinc-500" />
                  {estimatedVisitorsToday}
                </p>
              </article>
              <article className="rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Peak hour</p>
                <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-zinc-900">
                  <Clock3 className="size-5 text-zinc-500" />
                  {peakHour}
                </p>
              </article>
              <article className="rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Live occupancy</p>
                <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-zinc-900">
                  <BarChart3 className="size-5 text-zinc-500" />
                  {analyticsLiveOccupancy}
                </p>
              </article>
              <article className="rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Busiest zone now</p>
                <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-zinc-900">
                  <TrendingUp className="size-5 text-zinc-500" />
                  {busiestZone}
                </p>
              </article>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <article className="rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-lg xl:col-span-2">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-zinc-900">Hourly occupancy trend</h2>
                  <span className="text-xs text-zinc-500">Rolling 24h line graph</span>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                  <svg viewBox={`0 0 ${trendChart.width} ${trendChart.height}`} className="h-56 w-full">
                    <line x1={trendChart.left} y1={trendChart.bottom} x2={trendChart.right} y2={trendChart.bottom} className="stroke-zinc-200" />
                    <line x1={trendChart.left} y1={trendChart.top} x2={trendChart.left} y2={trendChart.bottom} className="stroke-zinc-200" />
                    <path d={trendChart.areaPath} fill="rgba(24, 24, 27, 0.12)" />
                    <path d={trendChart.linePath} fill="none" stroke="#18181B" strokeWidth="2.5" />
                    {trendChart.points.filter((_, i) => i % 4 === 0).map((point) => (
                      <text key={point.hour} x={point.x} y={trendChart.bottom + 14} textAnchor="middle" className="fill-zinc-500 text-[9px]">
                        {point.label.slice(0, 2)}
                      </text>
                    ))}
                  </svg>
                </div>
              </article>

              <article className="rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-lg">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-zinc-900">Zone share</h2>
                  <span className="text-xs text-zinc-500">{USE_FAKE_ANALYTICS ? "Demo split" : "Live split"}</span>
                </div>
                <div className="flex items-center justify-center rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                  <div className="relative size-36">
                    <svg viewBox="0 0 120 120" className="size-36 -rotate-90">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="#E4E4E7" strokeWidth="12" />
                      {donutSegments.map((segment) => (
                        <circle
                          key={segment.zone}
                          cx="60"
                          cy="60"
                          r="52"
                          fill="none"
                          stroke={segment.stroke}
                          strokeWidth="12"
                          strokeDasharray={segment.dasharray}
                          strokeDashoffset={segment.dashoffset}
                          strokeLinecap="butt"
                        />
                      ))}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-center">
                      <div>
                        <p className="text-xl font-semibold text-zinc-900">{totalZonePeople}</p>
                        <p className="text-[11px] text-zinc-500">people now</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {donutSegments.map((segment) => (
                    <div key={segment.zone} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: segment.stroke }} />
                        <span className="font-medium text-zinc-700">{segment.zone}</span>
                      </div>
                      <span className="text-zinc-500">{segment.percent}%</span>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <article className="rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-lg">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-zinc-900">Current load by zone</h2>
                <span className="text-xs text-zinc-500">Horizontal bar graph</span>
              </div>
              <div className="flex flex-col gap-2">
                {zoneDistribution.length === 0 && (
                  <p className="text-sm text-zinc-500">No occupancy data yet.</p>
                )}
                {zoneDistribution.map((zone) => {
                  const width = totalZonePeople > 0 ? Math.max(4, Math.round((zone.count / totalZonePeople) * 100)) : 4;
                  return (
                    <div key={zone.zone} className="grid grid-cols-[120px_1fr_52px] items-center gap-3">
                      <span className="text-xs font-medium text-zinc-600 truncate">{zone.zone}</span>
                      <div className="h-2.5 rounded bg-zinc-100">
                        <div className="h-2.5 rounded bg-zinc-800" style={{ width: `${width}%` }} />
                      </div>
                      <span className="text-right text-xs font-semibold text-zinc-700">{zone.count}</span>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-lg">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-zinc-900">Queue time by zone</h2>
                <span className="text-xs text-zinc-500">Estimated wait in minutes</span>
              </div>
              <div className="flex flex-col gap-3">
                {queueByZone.length === 0 && (
                  <p className="text-sm text-zinc-500">No queue data yet.</p>
                )}
                {queueByZone.map((zone) => {
                  const width = maxQueueMinutes > 0 ? Math.max(6, Math.round((zone.queueMinutes / maxQueueMinutes) * 100)) : 6;
                  return (
                    <div key={zone.zone} className="grid grid-cols-[120px_1fr_86px_56px] items-center gap-3">
                      <span className="text-xs font-medium text-zinc-600 truncate">{zone.zone}</span>
                      <div className="h-2.5 rounded bg-zinc-100">
                        <div className="h-2.5 rounded bg-zinc-700" style={{ width: `${width}%` }} />
                      </div>
                      <span className="text-right text-xs font-semibold text-zinc-800">{zone.queueMinutes} min</span>
                      <span className="text-right text-[11px] font-medium text-zinc-500">{zone.queueLevel}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-zinc-500">
                {USE_FAKE_ANALYTICS
                  ? "Demo queue values for presentation mode."
                  : "Computed from live occupancy density per zone and camera coverage. Replace with POS/host queue events for exact values."}
              </p>
            </article>
          </section>
        )}
        </GlassPanel>
      </div>

      {zoneEditorOpen && (
        <ZoneEditorModal
          stream={useVisionBridgeForDining ? null : cameraStreams[FLOOR_CAMERA_ID]}
          streamUrl={useVisionBridgeForDining ? diningVisionStreamUrl : null}
          cameraName="Floor Camera"
          zones={zones}
          peopleAtTableById={peopleAtTableById}
          onClose={() => setZoneEditorOpen(false)}
          onSave={saveZones}
          saveStatus={saveStatus}
        />
      )}

      <video ref={analysisEntranceVideoRef} muted playsInline className="hidden" />
      <canvas ref={analysisEntranceCanvasRef} className="hidden" />
      <video ref={analysisDiningVideoRef} muted playsInline className="hidden" />
      <canvas ref={analysisDiningCanvasRef} className="hidden" />
    </FrostedPage>
  );
}
