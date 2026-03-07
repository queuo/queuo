"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Users, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

const VISION_SERVER =
  process.env.NEXT_PUBLIC_VISION_SERVER ?? "http://localhost:8000";

type CameraStatus = "online" | "degraded" | "offline";

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

const ZONES = ["All", "Entrance"] as const;
type Zone = (typeof ZONES)[number];

const STATUS_BADGE: Record<CameraStatus, string> = {
  online: "bg-emerald-500",
  degraded: "bg-amber-500",
  offline: "bg-red-500",
};

function now(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function CameraTile({
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

        {/* Top-left status dot + wifi */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${STATUS_BADGE[status]} shadow-sm`} />
          {visionConnected ? (
            <Wifi className="size-3.5 text-white/70" />
          ) : (
            <WifiOff className="size-3.5 text-amber-400/80" />
          )}
        </div>

        {/* Top-right people count */}
        <div className="absolute right-3 top-3">
          <span className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            <Users className="size-3" />
            {peopleCount}
          </span>
        </div>

        {/* Bottom overlay */}
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

export default function BusinessDashboardPage() {
  const [activeZone, setActiveZone] = useState<Zone>("All");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [visionConnected, setVisionConnected] = useState(false);
  const [peopleCount, setPeopleCount] = useState(0);
  const [estimatedFps, setEstimatedFps] = useState(0);
  const [timestamp, setTimestamp] = useState(now());

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

  const cameraData = useMemo(() =>
    CAMERA_PRESETS.map((cam, i) => ({
      ...cam,
      status: (stream ? (visionConnected ? "online" : "degraded") : "offline") as CameraStatus,
      peopleCount: Math.max(0, peopleCount + cam.peopleOffset),
      fps: stream ? Math.max(4, estimatedFps - i) : 0,
      latencyMs: stream ? 84 + i * 11 : 0,
    })),
    [stream, visionConnected, peopleCount, estimatedFps]
  );

  const filteredCameras = useMemo(() =>
    activeZone === "All"
      ? cameraData
      : cameraData.filter((c) => c.zone === activeZone),
    [cameraData, activeZone]
  );

  const grouped = useMemo(() => {
    if (activeZone !== "All") return { [activeZone]: filteredCameras };
    return filteredCameras.reduce<Record<string, typeof filteredCameras>>((acc, cam) => {
      (acc[cam.zone] ??= []).push(cam);
      return acc;
    }, {});
  }, [filteredCameras, activeZone]);

  const onlineCount = cameraData.filter((c) => c.status === "online").length;

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
              {onlineCount}/{cameraData.length} cameras online
            </span>
          </div>
        </header>

        {/* Zone filter tabs */}
        <nav className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
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
            <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs">
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
          {Object.entries(grouped).map(([zone, cameras]) => (
            <section key={zone}>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-base font-semibold text-zinc-900">{zone}</h2>
                <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-500">
                  {cameras.length} camera{cameras.length !== 1 ? "s" : ""}
                </span>
                <div className="flex-1 border-t border-zinc-200" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {cameras.map((cam) => (
                  <CameraTile
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
              </div>
            </section>
          ))}
        </div>

        {filteredCameras.length === 0 && (
          <div className="mt-12 flex flex-col items-center gap-3 text-zinc-400">
            <Camera className="size-12" />
            <p className="text-sm font-medium">No cameras in this zone</p>
          </div>
        )}
      </div>

      <video ref={analysisVideoRef} muted playsInline className="hidden" />
      <canvas ref={analysisCanvasRef} className="hidden" />
    </main>
  );
}
