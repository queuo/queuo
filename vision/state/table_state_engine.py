from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Set, Tuple

from state.track_registry import TrackRegistry


@dataclass
class CandidateAssignment:
    started_ts: float
    last_seen_ts: float
    frames: int = 0


class TableStateEngine:
    def __init__(
        self,
        table_capacities: Dict[str, int],
        table_assignment_seconds: float,
        vacancy_timeout_seconds: float,
        min_frames_for_assignment: int,
        recently_vacated_seconds: float,
        track_stale_seconds: float,
        reassignment_seconds: Optional[float] = None,
    ) -> None:
        self.table_capacities = table_capacities
        self.table_assignment_seconds = table_assignment_seconds
        self.vacancy_timeout_seconds = vacancy_timeout_seconds
        self.min_frames_for_assignment = min_frames_for_assignment
        self.recently_vacated_seconds = recently_vacated_seconds
        self.track_stale_seconds = track_stale_seconds
        self.reassignment_seconds = reassignment_seconds or table_assignment_seconds

        self.track_to_table: Dict[int, str] = {}
        self.table_to_tracks: Dict[str, Set[int]] = {table_id: set() for table_id in table_capacities}
        self.candidates: Dict[Tuple[int, str], CandidateAssignment] = {}
        self.away_since: Dict[int, float] = {}
        self.table_last_vacated_ts: Dict[str, float] = {table_id: -1.0 for table_id in table_capacities}

    def _assign_track(self, track_id: int, table_id: str) -> None:
        prev = self.track_to_table.get(track_id)
        if prev == table_id:
            return
        if prev:
            self.table_to_tracks[prev].discard(track_id)
        self.track_to_table[track_id] = table_id
        self.table_to_tracks[table_id].add(track_id)
        self.away_since.pop(track_id, None)

    def _unassign_track(self, track_id: int, timestamp: float) -> None:
        table_id = self.track_to_table.pop(track_id, None)
        if not table_id:
            return
        self.table_to_tracks[table_id].discard(track_id)
        self.away_since.pop(track_id, None)
        if not self.table_to_tracks[table_id]:
            self.table_last_vacated_ts[table_id] = timestamp

    def _update_candidates(self, track_id: int, current_table_id: Optional[str], timestamp: float) -> None:
        # Expire stale candidates for this track on other tables.
        stale_keys = [key for key in self.candidates if key[0] == track_id and key[1] != current_table_id]
        for key in stale_keys:
            del self.candidates[key]

        if not current_table_id:
            return

        key = (track_id, current_table_id)
        if key not in self.candidates:
            self.candidates[key] = CandidateAssignment(started_ts=timestamp, last_seen_ts=timestamp, frames=1)
        else:
            candidate = self.candidates[key]
            candidate.last_seen_ts = timestamp
            candidate.frames += 1

    def _candidate_ready(self, track_id: int, table_id: str, timestamp: float, threshold_seconds: float) -> bool:
        candidate = self.candidates.get((track_id, table_id))
        if not candidate:
            return False
        dwell_seconds = timestamp - candidate.started_ts
        return candidate.frames >= self.min_frames_for_assignment and dwell_seconds >= threshold_seconds

    def _remove_pruned_tracks(self, registry: TrackRegistry, timestamp: float) -> None:
        gone = [track_id for track_id in self.track_to_table if track_id not in registry.tracks]
        for track_id in gone:
            self._unassign_track(track_id, timestamp)

    def update(self, registry: TrackRegistry, timestamp: float) -> Dict:
        self._remove_pruned_tracks(registry, timestamp)

        active_tracks = registry.get_active_tracks(timestamp, self.track_stale_seconds)

        for track_id, track in active_tracks.items():
            self._update_candidates(track_id, track.current_table_zone, timestamp)

            assigned_table = self.track_to_table.get(track_id)
            if not assigned_table and track.current_table_zone:
                if self._candidate_ready(track_id, track.current_table_zone, timestamp, self.table_assignment_seconds):
                    self._assign_track(track_id, track.current_table_zone)
            elif assigned_table and track.current_table_zone and assigned_table != track.current_table_zone:
                if self._candidate_ready(track_id, track.current_table_zone, timestamp, self.reassignment_seconds):
                    self._assign_track(track_id, track.current_table_zone)

        for track_id, assigned_table_id in list(self.track_to_table.items()):
            track = registry.tracks.get(track_id)
            if track is None:
                self._unassign_track(track_id, timestamp)
                continue

            if (timestamp - track.last_seen_ts) > self.track_stale_seconds:
                self.away_since.setdefault(track_id, timestamp)
            elif track.current_table_zone == assigned_table_id:
                self.away_since.pop(track_id, None)
            else:
                self.away_since.setdefault(track_id, timestamp)

            away_ts = self.away_since.get(track_id)
            if away_ts is not None and (timestamp - away_ts) >= self.vacancy_timeout_seconds:
                self._unassign_track(track_id, timestamp)

        for track in registry.tracks.values():
            track.assigned_table_id = self.track_to_table.get(track.track_id)

        tables_out = []
        occupied_count = 0
        available_count = 0
        transitioning_count = 0

        for table_id, capacity in self.table_capacities.items():
            active_assigned_ids = [
                track_id
                for track_id in sorted(self.table_to_tracks[table_id])
                if track_id in active_tracks
            ]
            party_size = len(active_assigned_ids)

            candidate_count = sum(
                1
                for (track_id, candidate_table_id), _candidate in self.candidates.items()
                if candidate_table_id == table_id and track_id in active_tracks and track_id not in active_assigned_ids
            )

            if party_size > 0:
                state = "occupied"
                occupied_count += 1
            else:
                vacated_ts = self.table_last_vacated_ts.get(table_id, -1.0)
                recently_vacated = vacated_ts > 0 and (timestamp - vacated_ts) <= self.recently_vacated_seconds
                if recently_vacated:
                    state = "recently_vacated"
                    transitioning_count += 1
                elif candidate_count > 0:
                    state = "maybe_transitioning"
                    transitioning_count += 1
                else:
                    state = "available"
                    available_count += 1

            tables_out.append(
                {
                    "table_id": table_id,
                    "capacity": capacity,
                    "state": state,
                    "party_size": party_size,
                    "assigned_track_ids": active_assigned_ids,
                    "candidate_track_count": candidate_count,
                }
            )

        return {
            "tables": tables_out,
            "occupancy_summary": {
                "occupied_tables": occupied_count,
                "available_tables": available_count,
                "transitioning_tables": transitioning_count,
                "total_tables": len(self.table_capacities),
            },
        }
