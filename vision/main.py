from __future__ import annotations

import argparse
import sys
import time
from typing import Any, Optional

import cv2

from detectors.yolo_detector import YOLOPersonTracker
from state.state_engine import StateEngine
from state.table_state_engine import TableStateEngine
from state.track_registry import TrackRegistry
from trackers.track_parser import extract_tracked_people
from utils.config_loader import load_config
from utils.state_writer import JsonStateWriter
from utils.visualizer import Visualizer
from zones.zone_manager import ZoneManager


def parse_video_source(source_value: Any) -> Any:
    if isinstance(source_value, int):
        return source_value
    if isinstance(source_value, str) and source_value.isdigit():
        return int(source_value)
    return source_value


def resolve_video_fps(capture: cv2.VideoCapture, fallback_fps: float) -> float:
    fps = capture.get(cv2.CAP_PROP_FPS)
    if fps is None or fps <= 1.0:
        return float(fallback_fps)
    return float(fps)


def create_video_writer(path: str, fps: float, frame_width: int, frame_height: int) -> cv2.VideoWriter:
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    return cv2.VideoWriter(path, fourcc, fps, (frame_width, frame_height))


def run(args: argparse.Namespace) -> int:
    config = load_config(args.config)

    if args.source is not None:
        config["video"]["source"] = args.source
    if args.model is not None:
        config["model"]["name"] = args.model
    if args.no_display:
        config["video"]["display"] = False
    if args.save_video is not None:
        config["output"]["save_annotated_video"] = args.save_video
    if args.json_dir is not None:
        config["output"]["json_snapshot_dir"] = args.json_dir
    if args.json_every is not None:
        config["output"]["json_snapshot_every_n_frames"] = args.json_every

    source = parse_video_source(config["video"]["source"])
    capture = cv2.VideoCapture(source)
    if not capture.isOpened():
        print(f"Unable to open video source: {source}", file=sys.stderr)
        return 1

    zone_manager = ZoneManager(config)

    detector = YOLOPersonTracker(
        model_name=config["model"]["name"],
        tracker_config=config["tracking"]["tracker_config"],
        conf_threshold=float(config["model"]["confidence"]),
        iou_threshold=float(config["model"]["iou"]),
        image_size=int(config["model"]["image_size"]),
        device=config["model"].get("device"),
    )

    track_registry = TrackRegistry(max_track_age_seconds=float(config["thresholds"]["max_track_age_seconds"]))
    table_state_engine = TableStateEngine(
        table_capacities=zone_manager.get_table_capacities(),
        table_assignment_seconds=float(config["thresholds"]["table_assignment_seconds"]),
        vacancy_timeout_seconds=float(config["thresholds"]["vacancy_timeout_seconds"]),
        min_frames_for_assignment=int(config["thresholds"]["min_frames_for_assignment"]),
        recently_vacated_seconds=float(config["thresholds"]["recently_vacated_seconds"]),
        track_stale_seconds=float(config["thresholds"]["track_stale_seconds"]),
        reassignment_seconds=float(config["thresholds"]["reassignment_seconds"]),
    )
    state_engine = StateEngine(
        zone_manager=zone_manager,
        track_registry=track_registry,
        table_state_engine=table_state_engine,
        track_stale_seconds=float(config["thresholds"]["track_stale_seconds"]),
    )

    visualizer = Visualizer(
        zone_manager=zone_manager,
        show_anchor_points=bool(config["visualization"]["show_anchor_points"]),
        show_track_trails=bool(config["visualization"]["show_track_trails"]),
        trail_length=int(config["visualization"]["trail_length"]),
    )

    state_writer: Optional[JsonStateWriter] = None
    output_dir = config["output"].get("json_snapshot_dir")
    if output_dir:
        state_writer = JsonStateWriter(
            output_dir=output_dir,
            every_n_frames=int(config["output"]["json_snapshot_every_n_frames"]),
        )

    fps = resolve_video_fps(capture, fallback_fps=float(config["video"]["default_fps"]))

    writer = None
    save_annotated_path = config["output"].get("save_annotated_video")
    if save_annotated_path:
        frame_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        writer = create_video_writer(save_annotated_path, fps=fps, frame_width=frame_width, frame_height=frame_height)

    frame_index = 0
    is_live_source = isinstance(source, int)
    start_time = time.monotonic()

    print("Starting pipeline...")
    print(f"Video source: {source}")
    print(f"Model: {detector.model_path} | Tracker: {config['tracking']['tracker_config']}")

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break

            if is_live_source:
                timestamp = time.monotonic() - start_time
            else:
                timestamp = frame_index / fps

            track_result = detector.track(frame)
            detections = extract_tracked_people(track_result)

            state = state_engine.update(
                frame_index=frame_index,
                timestamp=timestamp,
                detections=detections,
            )

            visualizer.draw(frame, state)

            if state_writer:
                state_writer.maybe_write(state)

            if writer is not None:
                writer.write(frame)

            if config["video"]["display"]:
                cv2.imshow("Restaurant Vision Pipeline", frame)
                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    break

            frame_index += 1
            if args.max_frames and frame_index >= args.max_frames:
                break

    finally:
        capture.release()
        if writer is not None:
            writer.release()
        cv2.destroyAllWindows()

    print(f"Finished. Processed frames: {frame_index}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Restaurant vision detection/tracking/state pipeline")
    parser.add_argument("--config", default="vision/config/sample_restaurant.yaml", help="Path to YAML/JSON config")
    parser.add_argument("--source", default=None, help="Video source override (e.g., 0 or /path/video.mp4)")
    parser.add_argument("--model", default=None, help="YOLO model override (e.g., yolov8n.pt)")
    parser.add_argument("--no-display", action="store_true", help="Disable OpenCV preview window")
    parser.add_argument("--save-video", default=None, help="Path to write annotated output video")
    parser.add_argument("--json-dir", default=None, help="Directory for periodic state JSON snapshots")
    parser.add_argument("--json-every", type=int, default=None, help="Write JSON snapshots every N frames")
    parser.add_argument("--max-frames", type=int, default=None, help="Optional frame limit for quick tests")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    sys.exit(run(args))


if __name__ == "__main__":
    main()
