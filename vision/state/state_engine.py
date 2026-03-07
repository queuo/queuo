from __future__ import annotations

from typing import Dict, List

from state.table_state_engine import TableStateEngine
from state.track_registry import TrackRegistry
from trackers.track_parser import TrackDetection
from zones.zone_manager import ZoneManager


class StateEngine:
    def __init__(
        self,
        zone_manager: ZoneManager,
        track_registry: TrackRegistry,
        table_state_engine: TableStateEngine,
        track_stale_seconds: float,
    ) -> None:
        self.zone_manager = zone_manager
        self.track_registry = track_registry
        self.table_state_engine = table_state_engine
        self.track_stale_seconds = track_stale_seconds

    def update(self, frame_index: int, timestamp: float, detections: List[TrackDetection]) -> Dict:
        self.track_registry.update_tracks(detections=detections, timestamp=timestamp)
        self.track_registry.update_zones(zone_manager=self.zone_manager, timestamp=timestamp)
        self.track_registry.prune_stale_tracks(timestamp=timestamp)

        table_payload = self.table_state_engine.update(registry=self.track_registry, timestamp=timestamp)

        active_tracks = self.track_registry.get_active_tracks(
            timestamp=timestamp,
            stale_after_seconds=self.track_stale_seconds,
        )

        tracks_out = [
            active_tracks[track_id].to_output(now_ts=timestamp)
            for track_id in sorted(active_tracks.keys())
        ]

        payload = {
            "frame_index": frame_index,
            "timestamp": round(timestamp, 3),
            "tables": table_payload["tables"],
            "tracks": tracks_out,
            "occupancy_summary": table_payload["occupancy_summary"],
        }
        return payload
