from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import yaml


def _read_config_file(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    raw = path.read_text(encoding="utf-8")
    if path.suffix.lower() in {".yaml", ".yml"}:
        data = yaml.safe_load(raw)
    elif path.suffix.lower() == ".json":
        data = json.loads(raw)
    else:
        raise ValueError("Config format not supported. Use JSON or YAML.")

    if not isinstance(data, dict):
        raise ValueError("Top-level config must be an object.")
    return data


def _with_defaults(config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(config)
    cfg.setdefault("video", {})
    cfg.setdefault("model", {})
    cfg.setdefault("tracking", {})
    cfg.setdefault("thresholds", {})
    cfg.setdefault("visualization", {})
    cfg.setdefault("output", {})
    cfg.setdefault("tables", [])
    cfg.setdefault("zones", {})

    cfg["video"].setdefault("source", 0)
    cfg["video"].setdefault("display", True)
    cfg["video"].setdefault("default_fps", 30.0)

    cfg["model"].setdefault("name", "yolov8n.pt")
    cfg["model"].setdefault("confidence", 0.35)
    cfg["model"].setdefault("iou", 0.5)
    cfg["model"].setdefault("image_size", 960)
    cfg["model"].setdefault("device", None)

    cfg["tracking"].setdefault("tracker_config", "bytetrack.yaml")

    cfg["thresholds"].setdefault("table_assignment_seconds", 1.8)
    cfg["thresholds"].setdefault("reassignment_seconds", 2.2)
    cfg["thresholds"].setdefault("vacancy_timeout_seconds", 2.8)
    cfg["thresholds"].setdefault("min_frames_for_assignment", 8)
    cfg["thresholds"].setdefault("recently_vacated_seconds", 6.0)
    cfg["thresholds"].setdefault("track_stale_seconds", 1.8)
    cfg["thresholds"].setdefault("max_track_age_seconds", 8.0)

    cfg["visualization"].setdefault("show_anchor_points", True)
    cfg["visualization"].setdefault("show_track_trails", True)
    cfg["visualization"].setdefault("trail_length", 30)

    cfg["output"].setdefault("json_snapshot_dir", None)
    cfg["output"].setdefault("json_snapshot_every_n_frames", 15)
    cfg["output"].setdefault("save_annotated_video", None)

    return cfg


def load_config(config_path: str) -> Dict[str, Any]:
    cfg = _read_config_file(Path(config_path))
    return _with_defaults(cfg)
