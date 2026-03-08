"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Camera, Check, Clock3, Pencil, Plus, Trash2, TrendingUp, Users, Wifi, WifiOff, X } from "lucide-react";
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

const USE_FAKE_ANALYTICS = true;

const MOCK_HOURLY_OCCUPANCY = [
  4, 3, 2, 2, 3, 6, 10, 14, 18, 21, 25, 29,
  34, 31, 28, 24, 22, 26, 33, 36, 30, 20, 12, 7,
];

const MOCK_ZONE_DISTRIBUTION = [
  { zone: "Entrance", count: 34, cameras: 2, queueMinutes: 8 },
  { zone: "Dining Hall", count: 49, cameras: 3, queueMinutes: 14 },
  { zone: "Bar", count: 23, cameras: 2, queueMinutes: 9 },
  { zone: "Patio", count: 18, cameras: 1, queueMinutes: 6 },
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

interface TrafficSample {
  timestamp: number;
  totalPeople: number;
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
  onCountChange,
  timestamp,
}: {
  camera: VisionCamera;
  onRemove: (id: string) => void;
  onCountChange: (id: string, count: number) => void;
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
          const nextCount = typeof data.people_count === "number" ? data.people_count : 0;
          setCount(nextCount);
          onCountChange(camera.id, nextCount);
        }
      } catch {
        // server offline
      }
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => clearInterval(interval);
  }, [camera.id, onCountChange]);

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
  const [activeView, setActiveView] = useState<"cameras" | "analytics">("cameras");
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
  const [trafficSamples, setTrafficSamples] = useState<TrafficSample[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("traffic-samples-v1");
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved) as TrafficSample[];
      if (!Array.isArray(parsed)) return [];
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      return parsed
        .filter((sample) => sample && typeof sample.timestamp === "number" && typeof sample.totalPeople === "number")
        .filter((sample) => sample.timestamp >= oneDayAgo);
    } catch {
      return [];
    }
  });

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

  const handleVisionCountChange = useCallback((id: string, count: number) => {
    setVisionCameras((prev) =>
      prev.map((camera) => (camera.id === id ? { ...camera, peopleCount: count } : camera))
    );
  }, []);

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

  const totalPeopleNow = useMemo(
    () => browserCameraData.reduce((acc, cam) => acc + cam.peopleCount, 0) + visionCameras.reduce((acc, cam) => acc + cam.peopleCount, 0),
    [browserCameraData, visionCameras]
  );

  useEffect(() => {
    const addSample = () => {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      setTrafficSamples((prev) => {
        const next = [...prev, { timestamp: Date.now(), totalPeople: totalPeopleNow }]
          .filter((sample) => sample.timestamp >= oneDayAgo);
        localStorage.setItem("traffic-samples-v1", JSON.stringify(next));
        return next;
      });
    };

    addSample();
    const interval = setInterval(addSample, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [totalPeopleNow]);

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

  const zonePeopleNow = useMemo(() => {
    if (USE_FAKE_ANALYTICS) {
      return MOCK_ZONE_DISTRIBUTION.reduce<Record<string, number>>((acc, item) => {
        acc[item.zone] = item.count;
        return acc;
      }, {});
    }
    const next: Record<string, number> = {};
    for (const cam of browserCameraData) next[cam.zone] = (next[cam.zone] ?? 0) + cam.peopleCount;
    for (const cam of visionCameras) next[cam.zone] = (next[cam.zone] ?? 0) + cam.peopleCount;
    return next;
  }, [browserCameraData, visionCameras]);

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
    if (USE_FAKE_ANALYTICS) {
      return MOCK_ZONE_DISTRIBUTION.reduce<Record<string, number>>((acc, item) => {
        acc[item.zone] = item.cameras;
        return acc;
      }, {});
    }
    const counts: Record<string, number> = {};
    for (const cam of browserCameraData) counts[cam.zone] = (counts[cam.zone] ?? 0) + 1;
    for (const cam of visionCameras) counts[cam.zone] = (counts[cam.zone] ?? 0) + 1;
    return counts;
  }, [browserCameraData, visionCameras]);

  const queueByZone = useMemo(
    () => {
      if (USE_FAKE_ANALYTICS) {
        return MOCK_ZONE_DISTRIBUTION.map((item) => ({
          zone: item.zone,
          count: item.count,
          cameras: item.cameras,
          queueMinutes: item.queueMinutes,
          queueLevel: item.queueMinutes >= 12 ? "High" : item.queueMinutes >= 7 ? "Medium" : "Low",
        }));
      }
      return zoneDistribution.map((item) => {
        const cameras = zoneCameraCounts[item.zone] ?? 1;
        const queueMinutes = Math.max(1, Math.round((item.count * 2.8) / cameras));
        const queueLevel = queueMinutes >= 12 ? "High" : queueMinutes >= 7 ? "Medium" : "Low";
        return { ...item, cameras, queueMinutes, queueLevel };
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

        <nav className="mt-6 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
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
            {/* Zone filter tabs */}
            <nav className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
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
            <div className="mt-6 flex flex-col gap-8">
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
                        onCountChange={handleVisionCountChange}
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
          </>
        )}

        {activeView === "analytics" && (
          <section className="mt-4 flex flex-col gap-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Estimated visitors (24h)</p>
                <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-zinc-900">
                  <Users className="size-5 text-zinc-500" />
                  {estimatedVisitorsToday}
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Peak hour</p>
                <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-zinc-900">
                  <Clock3 className="size-5 text-zinc-500" />
                  {peakHour}
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Live occupancy</p>
                <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-zinc-900">
                  <BarChart3 className="size-5 text-zinc-500" />
                  {analyticsLiveOccupancy}
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Busiest zone now</p>
                <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-zinc-900">
                  <TrendingUp className="size-5 text-zinc-500" />
                  {busiestZone}
                </p>
              </article>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm xl:col-span-2">
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

              <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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

            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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

            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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
