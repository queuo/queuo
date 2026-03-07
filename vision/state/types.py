from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Deque, List, Optional, Tuple

Point = Tuple[int, int]
BBox = Tuple[int, int, int, int]


@dataclass
class TrackedPerson:
    track_id: int
    bbox_xyxy: BBox
    anchor_point: Point
    confidence: float
    last_seen_ts: float
    history: Deque[Point] = field(default_factory=lambda: deque(maxlen=120))
    zone_history: Deque[str] = field(default_factory=lambda: deque(maxlen=40))
    current_zone: str = "zone:none"
    current_table_zone: Optional[str] = None
    current_special_zone: Optional[str] = None
    zone_entered_ts: float = 0.0
    assigned_table_id: Optional[str] = None
    inferred_role: Optional[str] = None

    def to_output(self, now_ts: float) -> dict:
        dwell = max(0.0, now_ts - self.zone_entered_ts)
        return {
            "track_id": self.track_id,
            "bbox": list(self.bbox_xyxy),
            "anchor_point": list(self.anchor_point),
            "current_zone": self.current_zone,
            "current_table_zone": self.current_table_zone,
            "current_special_zone": self.current_special_zone,
            "zone_dwell_seconds": round(dwell, 2),
            "zone_history": list(self.zone_history),
            "history": [list(p) for p in self.history],
            "last_seen_timestamp": round(self.last_seen_ts, 3),
            "assigned_table_id": self.assigned_table_id,
            "inferred_role": self.inferred_role,
        }
