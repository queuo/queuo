from __future__ import annotations

from typing import Dict, List, Tuple

import cv2
import numpy as np

from zones.zone_manager import ZoneManager

Color = Tuple[int, int, int]

TABLE_STATE_COLORS: Dict[str, Color] = {
    "available": (80, 200, 80),
    "occupied": (50, 90, 220),
    "maybe_transitioning": (0, 190, 255),
    "recently_vacated": (0, 140, 255),
}


def _draw_polygon(frame, polygon, color: Color, thickness: int = 2):
    pts = [np.array(polygon, dtype=np.int32)]
    cv2.polylines(frame, pts, isClosed=True, color=color, thickness=thickness)


class Visualizer:
    def __init__(self, zone_manager: ZoneManager, show_anchor_points: bool, show_track_trails: bool, trail_length: int):
        self.zone_manager = zone_manager
        self.show_anchor_points = show_anchor_points
        self.show_track_trails = show_track_trails
        self.trail_length = trail_length

    def draw(self, frame, state: Dict) -> None:
        table_states = {table["table_id"]: table for table in state["tables"]}

        for table in self.zone_manager.tables:
            table_payload = table_states.get(table.table_id, {})
            table_state = table_payload.get("state", "available")
            party_size = table_payload.get("party_size", 0)
            color = TABLE_STATE_COLORS.get(table_state, (255, 255, 255))

            _draw_polygon(frame, table.polygon, color, thickness=2)
            x, y = table.polygon[0]
            label = table.label or table.table_id
            text = f"{label} | {table_state} | {party_size}/{table.capacity}"
            cv2.putText(frame, text, (x, max(24, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

        for special_zone in self.zone_manager.special_zones:
            _draw_polygon(frame, special_zone.polygon, (170, 170, 170), thickness=1)
            sx, sy = special_zone.polygon[0]
            cv2.putText(
                frame,
                special_zone.zone_id,
                (sx, max(20, sy - 5)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (200, 200, 200),
                1,
            )

        for track in state["tracks"]:
            x1, y1, x2, y2 = track["bbox"]
            anchor = tuple(track["anchor_point"])
            track_id = track["track_id"]
            assigned_table = track.get("assigned_table_id") or "-"
            current_zone = track.get("current_zone", "zone:none")

            cv2.rectangle(frame, (x1, y1), (x2, y2), (40, 220, 240), 2)
            cv2.putText(
                frame,
                f"ID {track_id} | tbl {assigned_table}",
                (x1, max(18, y1 - 10)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (40, 220, 240),
                2,
            )
            cv2.putText(
                frame,
                current_zone,
                (x1, min(frame.shape[0] - 10, y2 + 16)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.4,
                (40, 220, 240),
                1,
            )

            if self.show_anchor_points:
                cv2.circle(frame, anchor, 4, (0, 255, 255), -1)

            if self.show_track_trails:
                history = track.get("history", [])[-self.trail_length :]
                for idx in range(1, len(history)):
                    p1 = tuple(history[idx - 1])
                    p2 = tuple(history[idx])
                    cv2.line(frame, p1, p2, (0, 240, 240), 1)

        summary = state["occupancy_summary"]
        cv2.putText(
            frame,
            (
                f"Frame {state['frame_index']} | "
                f"Occupied {summary['occupied_tables']}/{summary['total_tables']} | "
                f"Available {summary['available_tables']}"
            ),
            (12, 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            2,
        )
