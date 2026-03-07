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
from typing import Optional

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


class DetectResponse(BaseModel):
    count: int
    annotated_frame: str  # base64-encoded JPEG with bounding boxes


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
                self.people_count = len(result.boxes) if result.boxes is not None else 0

                annotated = result.plot()
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


# ---------------------------------------------------------------------------
# Existing /detect endpoint (browser-camera HTTP polling)
# ---------------------------------------------------------------------------
@app.post("/detect", response_model=DetectResponse)
async def detect(req: DetectRequest) -> DetectResponse:
    img_bytes = base64.b64decode(req.image)
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        return DetectResponse(count=0, annotated_frame=req.image)

    results = model(frame, classes=[0], conf=0.35, imgsz=320, verbose=False)
    result = results[0]

    count = len(result.boxes) if result.boxes is not None else 0

    annotated = result.plot()
    _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
    annotated_b64 = base64.b64encode(buf).decode()

    return DetectResponse(count=count, annotated_frame=annotated_b64)


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
