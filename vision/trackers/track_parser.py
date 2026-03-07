from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Tuple


@dataclass
class TrackDetection:
    track_id: int
    bbox_xyxy: Tuple[int, int, int, int]
    confidence: float


def extract_tracked_people(result: Any) -> List[TrackDetection]:
    detections: List[TrackDetection] = []

    boxes = getattr(result, "boxes", None)
    if boxes is None or boxes.id is None:
        return detections

    xyxy = boxes.xyxy.cpu().numpy()
    ids = boxes.id.int().cpu().tolist()
    confs = boxes.conf.cpu().numpy()

    for bbox, track_id, conf in zip(xyxy, ids, confs):
        x1, y1, x2, y2 = [int(v) for v in bbox]
        detections.append(
            TrackDetection(
                track_id=int(track_id),
                bbox_xyxy=(x1, y1, x2, y2),
                confidence=float(conf),
            )
        )

    return detections
