from __future__ import annotations

from typing import Dict, List

from state.types import TrackedPerson
from trackers.track_parser import TrackDetection
from zones.geometry import bbox_bottom_center
from zones.zone_manager import ZoneManager


class TrackRegistry:
    def __init__(self, max_track_age_seconds: float = 6.0) -> None:
        self.max_track_age_seconds = max_track_age_seconds
        self.tracks: Dict[int, TrackedPerson] = {}
        self.active_track_ids: set[int] = set()

    def update_tracks(self, detections: List[TrackDetection], timestamp: float) -> None:
        self.active_track_ids.clear()

        for det in detections:
            anchor = bbox_bottom_center(det.bbox_xyxy)
            track = self.tracks.get(det.track_id)

            if track is None:
                track = TrackedPerson(
                    track_id=det.track_id,
                    bbox_xyxy=det.bbox_xyxy,
                    anchor_point=anchor,
                    confidence=det.confidence,
                    last_seen_ts=timestamp,
                    zone_entered_ts=timestamp,
                )
                self.tracks[det.track_id] = track

            track.bbox_xyxy = det.bbox_xyxy
            track.anchor_point = anchor
            track.confidence = det.confidence
            track.last_seen_ts = timestamp
            track.history.append(anchor)
            self.active_track_ids.add(det.track_id)

    def update_zones(self, zone_manager: ZoneManager, timestamp: float) -> None:
        for track_id in self.active_track_ids:
            track = self.tracks[track_id]
            table_id = zone_manager.find_table_for_point(track.anchor_point)
            special_zone_id = zone_manager.find_special_zone_for_point(track.anchor_point)
            new_zone = zone_manager.compose_zone_label(table_id, special_zone_id)

            if new_zone != track.current_zone:
                track.current_zone = new_zone
                track.current_table_zone = table_id
                track.current_special_zone = special_zone_id
                track.zone_entered_ts = timestamp
                track.zone_history.append(new_zone)
            else:
                track.current_table_zone = table_id
                track.current_special_zone = special_zone_id
                if not track.zone_history:
                    track.zone_history.append(new_zone)

    def prune_stale_tracks(self, timestamp: float) -> None:
        stale_ids = [
            track_id
            for track_id, track in self.tracks.items()
            if (timestamp - track.last_seen_ts) > self.max_track_age_seconds
        ]
        for track_id in stale_ids:
            del self.tracks[track_id]

    def get_active_tracks(self, timestamp: float, stale_after_seconds: float) -> Dict[int, TrackedPerson]:
        return {
            track_id: track
            for track_id, track in self.tracks.items()
            if (timestamp - track.last_seen_ts) <= stale_after_seconds
        }
