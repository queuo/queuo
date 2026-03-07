from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Optional

from ultralytics import YOLO


def resolve_model_path(model_name: str) -> str:
    """
    Keep local model assets under vision/models when a bare '*.pt' name is used.
    Paths with directories or non-PT model identifiers are passed through unchanged.
    """
    candidate = Path(model_name)
    is_bare_pt_name = candidate.suffix == ".pt" and len(candidate.parts) == 1
    if not is_bare_pt_name:
        return model_name

    models_dir = Path(__file__).resolve().parents[1] / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    target = models_dir / candidate.name

    # One-time cleanup: if a model exists in current working directory, move it.
    cwd_model = Path.cwd() / candidate.name
    if not target.exists() and cwd_model.exists() and cwd_model.is_file():
        shutil.move(str(cwd_model), str(target))

    return str(target)


class YOLOPersonTracker:
    """YOLO detector + ByteTrack integration through Ultralytics track mode."""

    def __init__(
        self,
        model_name: str,
        tracker_config: str,
        conf_threshold: float = 0.3,
        iou_threshold: float = 0.5,
        image_size: int = 960,
        device: Optional[str] = None,
    ) -> None:
        self.model_path = resolve_model_path(model_name)
        self.model = YOLO(self.model_path)
        self.tracker_config = tracker_config
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.image_size = image_size
        self.device = device

    def track(self, frame: Any) -> Any:
        results = self.model.track(
            source=frame,
            persist=True,
            verbose=False,
            tracker=self.tracker_config,
            classes=[0],  # person class only
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            imgsz=self.image_size,
            device=self.device,
        )
        return results[0]
