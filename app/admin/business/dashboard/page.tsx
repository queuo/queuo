"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Check, Pencil, Plus, Trash2, Users, Wifi, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const VISION_SERVER =
  process.env.NEXT_PUBLIC_VISION_SERVER ?? "http://localhost:8000";

type CameraStatus = "online" | "degraded" | "offline";

// ---- Browser-camera preset (existing CAM-01) ----
interface CameraPreset {
  id: string;
  name: string;
  zone: string;
  peopleOffset: number;
  filter: string;
}

const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: "CAM-01",
    name: "Main Entrance",
    zone: "Entrance",
    peopleOffset: 0,
    filter: "saturate(1.05)",
  },
];

// ---- Vision-server camera (MJPEG stream) ----
interface VisionCamera {
  id: string;
  name: string;
  zone: string;
  source: number;
  streamUrl: string;
  peopleCount: number;
}

const STATUS_BADGE: Record<CameraStatus, string> = {
  online: "bg-emerald-500",
  degraded: "bg-amber-500",
  offline: "bg-red-500",
};

function now(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ---- Tile for browser-camera (getUserMedia) ----
function BrowserCameraTile({
  camera,
  stream,
  status,
  peopleCount,
  fps,
  latencyMs,
  visionConnected,
  timestamp,
}: {
  camera: CameraPreset;
  stream: MediaStream | null;
  status: CameraStatus;
  peopleCount: number;
  fps: number;
  latencyMs: number;
  visionConnected: boolean;
  timestamp: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) video.play().catch(() => {});
    return () => {
      if (video.srcObject) video.srcObject = null;
    };
  }, [stream]);

  return (
    <Link href={`/admin/business/camera/${camera.id}`} className="block">
      <article className="group overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 shadow-sm transition hover:border-zinc-300 hover:shadow-md cursor-pointer">
        <div className="relative aspect-video w-full">
          {stream ? (
            <video
              ref={videoRef}
              muted
              playsInline
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
            <span className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <Users className="size-3" />
              {peopleCount}
            </span>
          </div>

          <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{camera.name}</p>
                <p className="text-[11px] text-zinc-300">
                  {camera.id} &bull; {timestamp}
                </p>
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
          </div>
        </div>
      </article>
    </Link>
  );
}

// ---- Tile for vision-server camera (MJPEG stream) ----
function VisionCameraTile({
  camera,
  onRemove,
  timestamp,
}: {
  camera: VisionCamera;
  onRemove: (id: string) => void;
  timestamp: string;
}) {
  const [count, setCount] = useState(camera.peopleCount);

  // Poll the server for the live people count every 1.5s
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${VISION_SERVER}/cameras/${camera.id}`);
        if (res.ok) {
          const data = await res.json();
          setCount(typeof data.people_count === "number" ? data.people_count : 0);
        }
      } catch {
        // server offline
      }
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => clearInterval(interval);
  }, [camera.id]);

  return (
    <article className="group overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 shadow-sm transition hover:border-zinc-300 hover:shadow-md">
      <div className="relative aspect-video w-full">
        {/* MJPEG stream — browser renders this natively via multipart/x-mixed-replace */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={camera.streamUrl}
          alt={camera.name}
          className="h-full w-full object-cover"
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500 shadow-sm" />
          <Wifi className="size-3.5 text-white/70" />
          <button
            type="button"
            onClick={() => onRemove(camera.id)}
            className="rounded bg-black/50 p-0.5 text-white/60 backdrop-blur-sm transition hover:bg-red-500/80 hover:text-white"
            title="Remove camera"
          >
            <X className="size-3" />
          </button>
        </div>

        <div className="absolute right-3 top-3">
          <span className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            <Users className="size-3" />
            {count}
          </span>
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{camera.name}</p>
              <p className="text-[11px] text-zinc-300">
                {camera.id} &bull; src:{camera.source} &bull; {timestamp}
              </p>
            </div>
            <span className="rounded bg-emerald-600/80 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
              LIVE
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

// ---- Add Camera Modal ----

function AddCameraModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (camera: VisionCamera) => void;
}) {
  const [name, setName] = useState("");
  const [zone, setZone] = useState("Entrance");
  const [source, setSource] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Camera name is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${VISION_SERVER}/cameras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: parseInt(source, 10),
          name: name.trim(),
          zone,
        }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      onAdd({
        id: data.camera_id,
        name: data.name,
        zone: data.zone,
        source: data.source,
        streamUrl: `${VISION_SERVER}/stream/${data.camera_id}`,
        peopleCount: 0,
      });
      onClose();
    } catch {
      setError(
        "Could not connect to vision server. Make sure it is running:\n" +
          "uvicorn vision.server:app --port 8000 --reload"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">Add Camera</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-700">
              Camera Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. iPhone Main Cam"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-700">
              Zone
            </label>
            <input
              type="text"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="e.g. Entrance, Floor, Bar…"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-700">
              Camera Source Index
            </label>
            <input
              type="number"
              min={0}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            />
            <p className="mt-1 text-[11px] text-zinc-400">
              0 = iPhone via Continuity Camera. Use 1, 2 … for additional devices.
            </p>
          </div>

          {error && (
            <p className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {loading ? "Starting…" : "Start Camera"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Dashboard page ----
export default function BusinessDashboardPage() {
  const [activeZone, setActiveZone] = useState<string>("All");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [visionConnected, setVisionConnected] = useState(false);
  const [peopleCount, setPeopleCount] = useState(0);
  const [estimatedFps, setEstimatedFps] = useState(0);
  const [timestamp, setTimestamp] = useState(now());
  const [visionCameras, setVisionCameras] = useState<VisionCamera[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingZone, setEditingZone] = useState<string | null>(null);
  const [editZoneValue, setEditZoneValue] = useState("");

  // Restore persisted cameras on mount
  useEffect(() => {
    const saved = localStorage.getItem("vision-cameras");
    if (!saved) return;
    let configs: Array<{ name: string; zone: string; source: number }>;
    try {
      configs = JSON.parse(saved);
    } catch {
      return;
    }
    configs.forEach(async (config) => {
      try {
        const res = await fetch(`${VISION_SERVER}/cameras`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });
        if (!res.ok) return;
        const data = await res.json();
        setVisionCameras((prev) => [
          ...prev,
          {
            id: data.camera_id,
            name: data.name,
            zone: data.zone,
            source: data.source,
            streamUrl: `${VISION_SERVER}/stream/${data.camera_id}`,
            peopleCount: 0,
          },
        ]);
      } catch {
        // vision server not running — skip silently
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analysisVideoRef = useRef<HTMLVideoElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const detectInflightRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setTimestamp(now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let currentStream: MediaStream | null = null;

    async function initCamera() {
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          currentStream.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(currentStream);
        setCameraError(null);
      } catch {
        setCameraError("Camera permission denied or no camera available.");
      }
    }

    initCamera();
    return () => {
      cancelled = true;
      currentStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const video = analysisVideoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) video.play().catch(() => {});
  }, [stream]);

  useEffect(() => {
    if (!stream) return;

    const video = analysisVideoRef.current;
    const canvas = analysisCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!video || !canvas || !ctx) return;

    const detect = () => {
      if (detectInflightRef.current || video.readyState < 2) return;

      const W = 360;
      const scale = W / (video.videoWidth || 1280);
      const H = Math.round((video.videoHeight || 720) * scale);
      canvas.width = W;
      canvas.height = H;
      ctx.drawImage(video, 0, 0, W, H);

      const image = canvas.toDataURL("image/jpeg", 0.72).split(",")[1];
      const t0 = performance.now();
      detectInflightRef.current = true;

      fetch(`${VISION_SERVER}/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((d: { count?: number }) => {
          setPeopleCount(typeof d.count === "number" ? d.count : 0);
          setVisionConnected(true);
          setEstimatedFps(Math.max(1, Math.round(1000 / Math.max(performance.now() - t0, 1))));
        })
        .catch(() => setVisionConnected(false))
        .finally(() => {
          detectInflightRef.current = false;
        });
    };

    detect();
    const interval = setInterval(detect, 900);
    return () => clearInterval(interval);
  }, [stream]);

  function persistCameras(cameras: VisionCamera[]) {
    localStorage.setItem(
      "vision-cameras",
      JSON.stringify(cameras.map(({ name, zone, source }) => ({ name, zone, source })))
    );
  }

  function handleAddCamera(cam: VisionCamera) {
    setVisionCameras((prev) => {
      const next = [...prev, cam];
      persistCameras(next);
      return next;
    });
  }

  async function handleRemoveCamera(id: string) {
    try {
      await fetch(`${VISION_SERVER}/cameras/${id}`, { method: "DELETE" });
    } catch {
      // best-effort
    }
    setVisionCameras((prev) => {
      const next = prev.filter((c) => c.id !== id);
      persistCameras(next);
      return next;
    });
  }

  function handleRenameZone(oldZone: string, newZone: string) {
    const trimmed = newZone.trim();
    if (!trimmed || trimmed === oldZone) { setEditingZone(null); return; }
    const updated = visionCameras.map((c) => c.zone === oldZone ? { ...c, zone: trimmed } : c);
    setVisionCameras(updated);
    persistCameras(updated);
    if (activeZone === oldZone) setActiveZone(trimmed);
    setEditingZone(null);
  }

  async function handleDeleteZone(zone: string) {
    const toRemove = visionCameras.filter((c) => c.zone === zone);
    await Promise.allSettled(
      toRemove.map((c) => fetch(`${VISION_SERVER}/cameras/${c.id}`, { method: "DELETE" }).catch(() => {}))
    );
    const remaining = visionCameras.filter((c) => c.zone !== zone);
    setVisionCameras(remaining);
    persistCameras(remaining);
    if (activeZone === zone) setActiveZone("All");
  }

  const browserCameraData = useMemo(() =>
    CAMERA_PRESETS.map((cam, i) => ({
      ...cam,
      status: (stream ? (visionConnected ? "online" : "degraded") : "offline") as CameraStatus,
      peopleCount: Math.max(0, peopleCount + cam.peopleOffset),
      fps: stream ? Math.max(4, estimatedFps - i) : 0,
      latencyMs: stream ? 84 + i * 11 : 0,
    })),
    [stream, visionConnected, peopleCount, estimatedFps]
  );

  // Combine all zones (presets + vision cameras)
  const allZones = useMemo(() => {
    const zones = new Set(["All", ...CAMERA_PRESETS.map((c) => c.zone), ...visionCameras.map((c) => c.zone)]);
    return Array.from(zones);
  }, [visionCameras]);

  const filteredBrowser = useMemo(() =>
    activeZone === "All" ? browserCameraData : browserCameraData.filter((c) => c.zone === activeZone),
    [browserCameraData, activeZone]
  );

  const filteredVision = useMemo(() =>
    activeZone === "All" ? visionCameras : visionCameras.filter((c) => c.zone === activeZone),
    [visionCameras, activeZone]
  );

  // Group all cameras by zone for display
  const grouped = useMemo(() => {
    const groups: Record<string, { browser: typeof filteredBrowser; vision: VisionCamera[] }> = {};

    for (const cam of filteredBrowser) {
      if (!groups[cam.zone]) groups[cam.zone] = { browser: [], vision: [] };
      groups[cam.zone].browser.push(cam);
    }
    for (const cam of filteredVision) {
      if (!groups[cam.zone]) groups[cam.zone] = { browser: [], vision: [] };
      groups[cam.zone].vision.push(cam);
    }

    return groups;
  }, [filteredBrowser, filteredVision]);

  const totalCameras = browserCameraData.length + visionCameras.length;
  const onlineCount = browserCameraData.filter((c) => c.status === "online").length + visionCameras.length;

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-100 via-zinc-50 to-white font-sans text-zinc-900 antialiased">
      <div className="mx-auto w-full max-w-[1400px] px-6 py-8 md:px-10">

        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/entry"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-900"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Restaurant X
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">Business Dashboard</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                visionConnected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              <span className={`size-1.5 rounded-full ${visionConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
              {visionConnected ? "Vision Connected" : "Vision Offline"}
            </span>
            <span className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 shadow-sm">
              {onlineCount}/{totalCameras} cameras online
            </span>
          </div>
        </header>

        {/* Zone filter tabs */}
        <nav className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
          {allZones.map((zone) => {
            if (zone === "All") {
              return (
                <button
                  key="All"
                  type="button"
                  onClick={() => setActiveZone("All")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    activeZone === "All" ? "bg-black text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  All
                </button>
              );
            }

            if (editingZone === zone) {
              return (
                <div key={zone} className="flex items-center gap-1 rounded-xl border border-zinc-300 bg-zinc-50 px-2 py-1">
                  <input
                    autoFocus
                    value={editZoneValue}
                    onChange={(e) => setEditZoneValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameZone(zone, editZoneValue);
                      if (e.key === "Escape") setEditingZone(null);
                    }}
                    className="w-24 bg-transparent text-sm font-semibold text-zinc-900 outline-none"
                  />
                  <button type="button" onClick={() => handleRenameZone(zone, editZoneValue)} className="text-emerald-600 hover:text-emerald-700">
                    <Check className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => setEditingZone(null)} className="text-zinc-400 hover:text-zinc-600">
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            }

            const isStatic = zone === "Entrance";
            return (
              <div key={zone} className="group flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setActiveZone(zone)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    activeZone === zone ? "bg-black text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  {zone}
                </button>
                {!isStatic && (
                  <div className="hidden group-hover:flex items-center">
                    <button
                      type="button"
                      onClick={() => { setEditingZone(zone); setEditZoneValue(zone); }}
                      className="rounded p-1 text-zinc-400 hover:text-zinc-700"
                      title="Rename zone"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteZone(zone)}
                      className="rounded p-1 text-zinc-400 hover:text-red-500"
                      title="Delete zone and its cameras"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl text-xs gap-1.5"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="size-3.5" />
              Add Camera
            </Button>
          </div>
        </nav>

        {cameraError && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {cameraError}
          </div>
        )}

        {/* Camera grid grouped by zone */}
        <div className="mt-6 space-y-8">
          {Object.entries(grouped).map(([zone, { browser, vision }]) => (
            <section key={zone}>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-base font-semibold text-zinc-900">{zone}</h2>
                <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-500">
                  {browser.length + vision.length} camera{browser.length + vision.length !== 1 ? "s" : ""}
                </span>
                <div className="flex-1 border-t border-zinc-200" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {browser.map((cam) => (
                  <BrowserCameraTile
                    key={cam.id}
                    camera={cam}
                    stream={stream}
                    status={cam.status}
                    peopleCount={cam.peopleCount}
                    fps={cam.fps}
                    latencyMs={cam.latencyMs}
                    visionConnected={visionConnected}
                    timestamp={timestamp}
                  />
                ))}
                {vision.map((cam) => (
                  <VisionCameraTile
                    key={cam.id}
                    camera={cam}
                    onRemove={handleRemoveCamera}
                    timestamp={timestamp}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {filteredBrowser.length === 0 && filteredVision.length === 0 && (
          <div className="mt-12 flex flex-col items-center gap-3 text-zinc-400">
            <Camera className="size-12" />
            <p className="text-sm font-medium">No cameras in this zone</p>
          </div>
        )}
      </div>

      <video ref={analysisVideoRef} muted playsInline className="hidden" />
      <canvas ref={analysisCanvasRef} className="hidden" />

      {showAddModal && (
        <AddCameraModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddCamera}
        />
      )}
    </main>
  );
}
