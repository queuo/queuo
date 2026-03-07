from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import yaml

Point = Tuple[int, int]
Rect = Tuple[int, int, int, int]


@dataclass
class TableRect:
    table_id: str
    capacity: int
    rect: Rect
    label: Optional[str]
    priority: int

    def to_config(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "table_id": self.table_id,
            "capacity": self.capacity,
            "rect": [self.rect[0], self.rect[1], self.rect[2], self.rect[3]],
            "priority": self.priority,
        }
        if self.label:
            payload["label"] = self.label
        return payload


def parse_source(source_value: str) -> Any:
    return int(source_value) if source_value.isdigit() else source_value


def normalize_rect(start: Point, end: Point) -> Rect:
    x1 = min(start[0], end[0])
    y1 = min(start[1], end[1])
    x2 = max(start[0], end[0])
    y2 = max(start[1], end[1])
    return (x1, y1, x2, y2)


def rect_is_valid(rect: Rect, min_size: int = 12) -> bool:
    width = rect[2] - rect[0]
    height = rect[3] - rect[1]
    return width >= min_size and height >= min_size


def polygon_to_rect(polygon: List[List[int]]) -> Rect:
    xs = [int(p[0]) for p in polygon]
    ys = [int(p[1]) for p in polygon]
    return (min(xs), min(ys), max(xs), max(ys))


def next_table_id(existing_ids: List[str]) -> str:
    seen = set(existing_ids)
    index = 1
    while True:
        candidate = f"T{index}"
        if candidate not in seen:
            return candidate
        index += 1


def load_config(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {
            "video": {"source": 0, "display": True, "default_fps": 30},
            "model": {"name": "yolov8n.pt", "confidence": 0.35, "iou": 0.5, "image_size": 960},
            "tracking": {"tracker_config": "bytetrack.yaml"},
            "thresholds": {
                "table_assignment_seconds": 1.8,
                "reassignment_seconds": 2.2,
                "vacancy_timeout_seconds": 2.8,
                "min_frames_for_assignment": 8,
                "recently_vacated_seconds": 6.0,
                "track_stale_seconds": 1.8,
                "max_track_age_seconds": 8.0,
            },
            "visualization": {"show_anchor_points": True, "show_track_trails": True, "trail_length": 30},
            "output": {"json_snapshot_dir": "vision/output/state_snapshots", "json_snapshot_every_n_frames": 15},
            "tables": [],
            "zones": {},
        }

    raw = path.read_text(encoding="utf-8")
    data = yaml.safe_load(raw)
    if not isinstance(data, dict):
        raise ValueError("Config root must be a mapping/object.")
    data.setdefault("tables", [])
    return data


def load_tables_from_config(config: Dict[str, Any]) -> List[TableRect]:
    tables: List[TableRect] = []
    for idx, table_cfg in enumerate(config.get("tables", []), start=1):
        table_id = str(table_cfg.get("table_id", f"T{idx}"))
        capacity = int(table_cfg.get("capacity", 2))
        label = table_cfg.get("label")
        priority = int(table_cfg.get("priority", idx))

        if table_cfg.get("rect"):
            rect_raw = table_cfg["rect"]
            rect = (int(rect_raw[0]), int(rect_raw[1]), int(rect_raw[2]), int(rect_raw[3]))
        elif table_cfg.get("polygon"):
            rect = polygon_to_rect(table_cfg["polygon"])
            print(f"Converted polygon table {table_id} to editable rectangle {rect}.")
        else:
            print(f"Skipping table {table_id}: no rect/polygon found.")
            continue

        tables.append(TableRect(table_id=table_id, capacity=capacity, rect=rect, label=label, priority=priority))

    return tables


def save_tables_to_config(config_path: Path, output_path: Path, tables: List[TableRect], base_config: Dict[str, Any]) -> None:
    base_config["tables"] = [table.to_config() for table in tables]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(yaml.safe_dump(base_config, sort_keys=False), encoding="utf-8")
    print(f"Saved {len(tables)} tables to {output_path}")
    if output_path != config_path:
        print(f"Source config left unchanged: {config_path}")


class TableConfiguratorUI:
    def __init__(self, capture: cv2.VideoCapture, existing_tables: List[TableRect]):
        self.capture = capture
        self.tables: List[TableRect] = existing_tables
        self.window_name = "Table Config UI"

        self.paused = False
        self.current_frame = None

        self.drag_start: Optional[Point] = None
        self.drag_end: Optional[Point] = None

        self.unsaved_changes = False

    def on_mouse(self, event, x, y, _flags, _param) -> None:
        if not self.paused:
            return

        point = (int(x), int(y))
        if event == cv2.EVENT_LBUTTONDOWN:
            self.drag_start = point
            self.drag_end = point
        elif event == cv2.EVENT_MOUSEMOVE and self.drag_start is not None:
            self.drag_end = point
        elif event == cv2.EVENT_LBUTTONUP and self.drag_start is not None:
            self.drag_end = point
            rect = normalize_rect(self.drag_start, self.drag_end)
            self.drag_start = None
            self.drag_end = None

            if not rect_is_valid(rect):
                print("Ignored tiny rectangle. Draw a larger box.")
                return

            table = self._prompt_table(rect)
            if table is None:
                print("Table creation cancelled.")
                return

            self.tables.append(table)
            self._reassign_priorities()
            self.unsaved_changes = True
            print(f"Added table {table.table_id} capacity={table.capacity} rect={table.rect}")

    def _prompt_table(self, rect: Rect) -> Optional[TableRect]:
        existing_ids = [table.table_id for table in self.tables]
        default_id = next_table_id(existing_ids)

        print("\nNew table rectangle drawn:", rect)
        table_id = input(f"Table ID [{default_id}]: ").strip() or default_id
        if table_id in set(existing_ids):
            print(f"Table ID {table_id} already exists.")
            return None

        capacity_raw = input("Seat capacity [2]: ").strip() or "2"
        try:
            capacity = int(capacity_raw)
            if capacity <= 0:
                raise ValueError
        except ValueError:
            print("Capacity must be a positive integer.")
            return None

        label_raw = input("Optional label [blank for none]: ").strip()
        label = label_raw if label_raw else None

        return TableRect(
            table_id=table_id,
            capacity=capacity,
            rect=rect,
            label=label,
            priority=len(self.tables) + 1,
        )

    def _reassign_priorities(self) -> None:
        for idx, table in enumerate(self.tables, start=1):
            table.priority = idx

    def _draw_overlay(self, frame):
        canvas = frame.copy()

        for table in self.tables:
            x1, y1, x2, y2 = table.rect
            cv2.rectangle(canvas, (x1, y1), (x2, y2), (90, 220, 90), 2)
            text = f"{table.table_id} | {table.capacity} seats"
            cv2.putText(canvas, text, (x1, max(20, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (90, 220, 90), 2)

        if self.drag_start is not None and self.drag_end is not None:
            x1, y1, x2, y2 = normalize_rect(self.drag_start, self.drag_end)
            cv2.rectangle(canvas, (x1, y1), (x2, y2), (0, 220, 255), 2)

        status = "PAUSED" if self.paused else "LIVE"
        cv2.putText(canvas, f"Mode: {status}", (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
        cv2.putText(
            canvas,
            "p:pause/resume  draw:drag mouse(when paused)  u:undo  c:clear  s:save  l:list  q:quit",
            (12, 48),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 255, 255),
            1,
        )

        return canvas

    def print_tables(self) -> None:
        if not self.tables:
            print("No tables configured yet.")
            return
        print("Current tables:")
        for table in self.tables:
            print(f"- {table.table_id} cap={table.capacity} rect={table.rect} priority={table.priority}")

    def run(self, on_save) -> None:
        cv2.namedWindow(self.window_name)
        cv2.setMouseCallback(self.window_name, self.on_mouse)

        while True:
            if not self.paused or self.current_frame is None:
                ok, frame = self.capture.read()
                if not ok:
                    print("Video stream ended or camera read failed.")
                    break
                self.current_frame = frame

            canvas = self._draw_overlay(self.current_frame)
            cv2.imshow(self.window_name, canvas)

            key = cv2.waitKey(16) & 0xFF
            if key == ord("p"):
                self.paused = not self.paused
                print("Paused." if self.paused else "Resumed.")
            elif key == ord("u"):
                if self.tables:
                    removed = self.tables.pop()
                    self._reassign_priorities()
                    self.unsaved_changes = True
                    print(f"Removed table {removed.table_id}")
            elif key == ord("c"):
                self.tables.clear()
                self.unsaved_changes = True
                print("Cleared all tables.")
            elif key == ord("l"):
                self.print_tables()
            elif key == ord("s"):
                on_save(self.tables)
                self.unsaved_changes = False
            elif key in (ord("q"), 27):
                if self.unsaved_changes:
                    print("You have unsaved changes. Press 's' to save before quitting if needed.")
                break

        cv2.destroyAllWindows()


def main() -> None:
    parser = argparse.ArgumentParser(description="Employee table-box configurator on live camera feed")
    parser.add_argument("--config", default="vision/config/sample_restaurant.yaml", help="Existing YAML config to read")
    parser.add_argument("--output", default=None, help="Output config path (default: overwrite --config)")
    parser.add_argument("--source", default="0", help="Camera index or video path")
    args = parser.parse_args()

    config_path = Path(args.config)
    output_path = Path(args.output) if args.output else config_path

    base_config = load_config(config_path)
    existing_tables = load_tables_from_config(base_config)

    source = parse_source(args.source)
    capture = cv2.VideoCapture(source)
    if not capture.isOpened():
        raise RuntimeError(f"Failed to open video source: {source}")

    print(f"Loaded {len(existing_tables)} existing tables from {config_path}")
    print("Press 'p' to pause and draw boxes, then fill table metadata in terminal.")

    ui = TableConfiguratorUI(capture=capture, existing_tables=existing_tables)

    def save_handler(tables: List[TableRect]) -> None:
        save_tables_to_config(config_path=config_path, output_path=output_path, tables=tables, base_config=base_config)

    try:
        ui.run(on_save=save_handler)
    finally:
        capture.release()


if __name__ == "__main__":
    main()
