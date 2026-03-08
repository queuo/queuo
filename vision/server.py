"""
FastAPI server exposing a /detect endpoint for person counting via YOLOv8,
plus MJPEG camera streaming for multiple sources (e.g. iPhone via Continuity Camera).
Run from the repo root: uvicorn vision.server:app --port 8000 --reload
"""
from __future__ import annotations

import base64
import queue
import sys
import threading
import time
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ultralytics import YOLO

# ---------------------------------------------------------------------------
# Model setup
# ---------------------------------------------------------------------------
_MODELS_DIR = Path(__file__).resolve().parent / "models"
_MODELS_DIR.mkdir(parents=True, exist_ok=True)
_MODEL_PATH = _MODELS_DIR / "yolov8n.pt"

print(f"Loading YOLO model from {_MODEL_PATH} …", file=sys.stderr)
model = YOLO(str(_MODEL_PATH))
print("Model ready.", file=sys.stderr)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Reception Vision API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "DELETE"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class DetectRequest(BaseModel):
    image: str  # base64-encoded JPEG
    include_annotated: bool = True
    include_tracking: bool = True
    imgsz: int = 320


class DetectResponse(BaseModel):
    count: int
    annotated_frame: str  # base64-encoded JPEG with bounding boxes
    boxes: list[list[float]]
    frame_width: int
    frame_height: int


class AddCameraRequest(BaseModel):
    source: int = 0
    name: str = "Camera"
    zone: str = "Entrance"


class CameraInfo(BaseModel):
    camera_id: str
    source: int
    name: str
    zone: str
    people_count: int = 0


class CameraState(CameraInfo):
    boxes: list[list[float]] = []
    frame_width: int = 0
    frame_height: int = 0


def _bbox_iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, (ax2 - ax1) * (ay2 - ay1))
    area_b = max(0.0, (bx2 - bx1) * (by2 - by1))
    union = area_a + area_b - inter
    if union <= 0.0:
        return 0.0
    return inter / union


def _extract_detections(result: Any) -> list[tuple[float, float, float, float, float]]:
    if result.boxes is None or result.boxes.xyxy is None:
        return []
    xyxy_raw = result.boxes.xyxy.tolist()
    conf_raw = result.boxes.conf.tolist() if result.boxes.conf is not None else [0.0] * len(xyxy_raw)
    detections: list[tuple[float, float, float, float, float]] = []
    for idx, coords in enumerate(xyxy_raw):
        if len(coords) < 4:
            continue
        conf = float(conf_raw[idx]) if idx < len(conf_raw) else 0.0
        detections.append(
            (
                float(coords[0]),
                float(coords[1]),
                float(coords[2]),
                float(coords[3]),
                conf,
            )
        )
    return detections


def _update_tracks(
    detections: list[tuple[float, float, float, float, float]],
    track_state: dict[str, Any],
    now_monotonic: float,
    stale_seconds: float = 2.5,
    match_iou_threshold: float = 0.3,
) -> list[dict[str, Any]]:
    tracks: dict[int, dict[str, Any]] = track_state["tracks"]
    next_id: int = int(track_state["next_id"])
    matched_track_ids: set[int] = set()
    tracked: list[dict[str, Any]] = []

    for x1, y1, x2, y2, conf in detections:
        bbox = (x1, y1, x2, y2)
        best_track_id: Optional[int] = None
        best_iou = 0.0

        for track_id, track in tracks.items():
            if track_id in matched_track_ids:
                continue
            if now_monotonic - float(track["last_seen"]) > stale_seconds:
                continue

            iou = _bbox_iou(bbox, track["bbox"])
            if iou >= match_iou_threshold and iou > best_iou:
                best_iou = iou
                best_track_id = track_id

        if best_track_id is None:
            best_track_id = next_id
            next_id += 1
            tracks[best_track_id] = {
                "bbox": bbox,
                "first_seen": now_monotonic,
                "last_seen": now_monotonic,
            }
        else:
            tracks[best_track_id]["bbox"] = bbox
            tracks[best_track_id]["last_seen"] = now_monotonic

        matched_track_ids.add(best_track_id)
        dwell_seconds = max(0.0, now_monotonic - float(tracks[best_track_id]["first_seen"]))
        tracked.append(
            {
                "track_id": best_track_id,
                "bbox": bbox,
                "conf": conf,
                "dwell_seconds": dwell_seconds,
            }
        )

    stale_ids = [
        track_id
        for track_id, track in tracks.items()
        if now_monotonic - float(track["last_seen"]) > stale_seconds
    ]
    for track_id in stale_ids:
        del tracks[track_id]

    track_state["next_id"] = next_id
    return tracked


def _annotate_frame(frame: np.ndarray, tracked: list[dict[str, Any]]) -> np.ndarray:
    annotated = frame.copy()
    for item in tracked:
        x1, y1, x2, y2 = item["bbox"]
        conf = float(item["conf"])

        p1 = (int(round(x1)), int(round(y1)))
        p2 = (int(round(x2)), int(round(y2)))
        cv2.rectangle(annotated, p1, p2, (28, 28, 242), 2)

        label = f"{conf:.2f}"
        (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.48, 1)
        top = max(0, p1[1] - th - baseline - 6)
        cv2.rectangle(annotated, (p1[0], top), (p1[0] + tw + 8, top + th + baseline + 6), (28, 28, 242), -1)
        cv2.putText(
            annotated,
            label,
            (p1[0] + 4, top + th + 1),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )
    return annotated


# ---------------------------------------------------------------------------
# MJPEG camera stream manager
# ---------------------------------------------------------------------------
class CameraStream:
    """Captures frames from a local camera source, runs YOLO, and queues
    annotated JPEG bytes for MJPEG streaming."""

    def __init__(self, camera_id: str, source: int, name: str, zone: str) -> None:
        self.camera_id = camera_id
        self.source = source
        self.name = name
        self.zone = zone
        self.people_count: int = 0
        self.boxes: list[list[float]] = []
        self.frame_width: int = 0
        self.frame_height: int = 0
        self._track_state: dict[str, Any] = {"next_id": 1, "tracks": {}}
        self._frame_queue: queue.Queue[bytes] = queue.Queue(maxsize=2)
        self.running = False
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        self.running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        # Only signal — never release _cap from outside the capture thread.
        # Calling cap.release() while cap.read() is running on another thread
        # crashes the AVFoundation layer on macOS.  The capture thread will
        # release the device itself as soon as the current read returns.
        self.running = False

    def _capture_loop(self) -> None:
        cap = cv2.VideoCapture(self.source)
        if not cap.isOpened():
            print(f"[CameraStream {self.camera_id}] Unable to open source {self.source}", file=sys.stderr)
            self.running = False
            return

        print(f"[CameraStream {self.camera_id}] Started — source {self.source}", file=sys.stderr)

        try:
            while self.running:
                ok, frame = cap.read()
                if not ok:
                    time.sleep(0.05)
                    continue

                results = model(frame, classes=[0], conf=0.35, imgsz=320, verbose=False)
                result = results[0]
                detections = _extract_detections(result)
                tracked = _update_tracks(detections, self._track_state, now_monotonic=time.monotonic())

                self.people_count = len(tracked)
                self.frame_width = int(frame.shape[1])
                self.frame_height = int(frame.shape[0])
                boxes: list[list[float]] = []
                for item in tracked:
                    x1, y1, x2, y2 = item["bbox"]
                    boxes.append([float(x1), float(y1), float(x2), float(y2)])
                self.boxes = boxes

                annotated = _annotate_frame(frame, tracked)
                _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
                frame_bytes = buf.tobytes()

                # Drop the oldest frame if the queue is full so we stay real-time
                if self._frame_queue.full():
                    try:
                        self._frame_queue.get_nowait()
                    except queue.Empty:
                        pass
                try:
                    self._frame_queue.put_nowait(frame_bytes)
                except queue.Full:
                    pass
        finally:
            cap.release()
            print(f"[CameraStream {self.camera_id}] Stopped.", file=sys.stderr)

    def generate(self):
        """Generator yielding MJPEG multipart chunks."""
        while self.running:
            try:
                frame_bytes = self._frame_queue.get(timeout=1.0)
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + frame_bytes
                    + b"\r\n"
                )
            except queue.Empty:
                continue


_cameras: dict[str, CameraStream] = {}
_camera_counter = 0
_detect_track_lock = threading.Lock()
_detect_track_state: dict[str, Any] = {"next_id": 1, "tracks": {}}


# ---------------------------------------------------------------------------
# Existing /detect endpoint (browser-camera HTTP polling)
# ---------------------------------------------------------------------------
@app.post("/detect", response_model=DetectResponse)
async def detect(req: DetectRequest) -> DetectResponse:
    img_bytes = base64.b64decode(req.image)
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        return DetectResponse(
            count=0,
            annotated_frame=req.image if req.include_annotated else "",
            boxes=[],
            frame_width=0,
            frame_height=0,
        )

    requested_imgsz = int(req.imgsz) if isinstance(req.imgsz, int) else 320
    imgsz = max(192, min(requested_imgsz, 640))
    results = model(frame, classes=[0], conf=0.35, imgsz=imgsz, verbose=False)
    result = results[0]
    detections = _extract_detections(result)
    if req.include_tracking:
        with _detect_track_lock:
            tracked = _update_tracks(detections, _detect_track_state, now_monotonic=time.monotonic())
    else:
        # Lightweight path for dashboard polling: skip temporal tracking and
        # use raw person detections for count + boxes.
        tracked = [
            {
                "bbox": (x1, y1, x2, y2),
                "conf": conf,
            }
            for x1, y1, x2, y2, conf in detections
        ]

    count = len(tracked)
    boxes: list[list[float]] = []
    for item in tracked:
        x1, y1, x2, y2 = item["bbox"]
        boxes.append([float(x1), float(y1), float(x2), float(y2)])

    annotated_b64 = ""
    if req.include_annotated:
        annotated = _annotate_frame(frame, tracked)
        _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
        annotated_b64 = base64.b64encode(buf).decode()

    return DetectResponse(
        count=count,
        annotated_frame=annotated_b64,
        boxes=boxes,
        frame_width=int(frame.shape[1]),
        frame_height=int(frame.shape[0]),
    )


# ---------------------------------------------------------------------------
# Camera management endpoints
# ---------------------------------------------------------------------------
@app.post("/cameras", response_model=CameraInfo)
async def add_camera(req: AddCameraRequest) -> CameraInfo:
    global _camera_counter
    _camera_counter += 1
    camera_id = f"cam-{_camera_counter}"

    stream = CameraStream(camera_id, req.source, req.name, req.zone)
    stream.start()
    _cameras[camera_id] = stream

    return CameraInfo(
        camera_id=camera_id,
        source=req.source,
        name=req.name,
        zone=req.zone,
        people_count=0,
    )


@app.get("/cameras", response_model=list[CameraInfo])
async def list_cameras() -> list[CameraInfo]:
    return [
        CameraInfo(
            camera_id=c.camera_id,
            source=c.source,
            name=c.name,
            zone=c.zone,
            people_count=c.people_count,
        )
        for c in _cameras.values()
    ]


@app.get("/cameras/{camera_id}", response_model=CameraInfo)
async def get_camera(camera_id: str) -> CameraInfo:
    if camera_id not in _cameras:
        raise HTTPException(status_code=404, detail="Camera not found")
    c = _cameras[camera_id]
    return CameraInfo(
        camera_id=c.camera_id,
        source=c.source,
        name=c.name,
        zone=c.zone,
        people_count=c.people_count,
    )


@app.get("/cameras/{camera_id}/state", response_model=CameraState)
async def get_camera_state(camera_id: str) -> CameraState:
    if camera_id not in _cameras:
        raise HTTPException(status_code=404, detail="Camera not found")
    c = _cameras[camera_id]
    return CameraState(
        camera_id=c.camera_id,
        source=c.source,
        name=c.name,
        zone=c.zone,
        people_count=c.people_count,
        boxes=c.boxes,
        frame_width=c.frame_width,
        frame_height=c.frame_height,
    )


@app.delete("/cameras/{camera_id}")
async def remove_camera(camera_id: str) -> dict:
    if camera_id not in _cameras:
        raise HTTPException(status_code=404, detail="Camera not found")
    _cameras[camera_id].stop()
    del _cameras[camera_id]
    return {"status": "stopped"}


@app.get("/stream/{camera_id}")
async def stream_camera(camera_id: str):
    if camera_id not in _cameras:
        raise HTTPException(status_code=404, detail="Camera not found")
    stream = _cameras[camera_id]
    return StreamingResponse(
        stream.generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
