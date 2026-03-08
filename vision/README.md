# Restaurant Vision MVP (Backend CV Pipeline)

This folder contains a Python-only real-time pipeline for:
- person detection (pretrained YOLO)
- persistent multi-object tracking (ByteTrack)
- configurable restaurant table/zone layout
- table occupancy + party-size inference
- structured per-frame state output for future API/frontend use

## Why this model/tracker for MVP
- **Model:** `yolov8n.pt`
- **Reason:** best practical speed/reliability tradeoff for a hackathon MVP on common laptops, with strong Ultralytics integration and easy swap to larger models (`yolov8s.pt`, `yolo11s.pt`) later.
- **Tracker:** `bytetrack.yaml` via Ultralytics `model.track(...)` for quick, stable track IDs without extra custom integration burden.
- **Model storage:** bare model names like `yolov8n.pt` are resolved to `vision/models/` to avoid polluting project root.

## Project structure

- `vision/main.py` - runtime entrypoint
- `vision/config/sample_restaurant.yaml` - sample layout + thresholds
- `vision/detectors/yolo_detector.py` - YOLO + ByteTrack wrapper
- `vision/trackers/track_parser.py` - normalized tracked detections
- `vision/zones/geometry.py` - polygon/rect helpers + anchor point
- `vision/zones/zone_manager.py` - table/special zone loading + lookup
- `vision/state/track_registry.py` - track memory, history, zone dwell
- `vision/state/table_state_engine.py` - assignment + occupancy state logic
- `vision/state/state_engine.py` - per-frame structured state assembly
- `vision/utils/visualizer.py` - debug overlays for demoability
- `vision/utils/state_writer.py` - periodic JSON snapshots
- `vision/tools/polygon_picker.py` - click helper for table polygons
- `vision/tools/table_config_ui.py` - employee table-box configuration UI on live feed
- `vision/requirements.txt` - dependencies

## Setup

```bash
python3 -m venv vision/.venv
source vision/.venv/bin/activate
pip install -r vision/requirements.txt
```

## Run

Webcam:
```bash
python vision/main.py --config vision/config/sample_restaurant.yaml --source 0
```

Video file:
```bash
python vision/main.py --config vision/config/sample_restaurant.yaml --source /path/to/restaurant.mp4
```

Headless + JSON snapshots:
```bash
python vision/main.py \
  --config vision/config/sample_restaurant.yaml \
  --source /path/to/restaurant.mp4 \
  --no-display \
  --json-dir vision/output/state_snapshots \
  --json-every 10
```

Save annotated demo video:
```bash
python vision/main.py \
  --config vision/config/sample_restaurant.yaml \
  --source /path/to/restaurant.mp4 \
  --save-video vision/output/annotated.mp4
```

## Config format

Tables can be polygon or rect:
```yaml
tables:
  - table_id: T1
    capacity: 2
    polygon: [[100,120],[180,120],[180,200],[100,200]]

  - table_id: T2
    capacity: 4
    rect: [250,110,360,230] # [x1,y1,x2,y2]
```

Special zones are under `zones`:
```yaml
zones:
  entrance_zone:
    rect: [20,100,100,260]
  waiting_zone:
    polygon: [[20,300],[220,300],[220,460],[20,460]]
```

## Output state shape

Each frame produces a dictionary with:
- `frame_index`
- `timestamp`
- `tables[]`
  - `table_id`, `capacity`, `state`, `party_size`, `assigned_track_ids`
- `tracks[]`
  - `track_id`, `bbox`, `anchor_point`, `current_zone`, `zone_dwell_seconds`, `assigned_table_id`, `history`
- `occupancy_summary`

## Thresholds to tune first

Edit in `sample_restaurant.yaml -> thresholds`:
- `table_assignment_seconds`: how long someone must stay in a table zone before assignment
- `min_frames_for_assignment`: frame stability guard
- `vacancy_timeout_seconds`: how long to wait before removing an assigned person
- `reassignment_seconds`: resistance to jitter-based cross-table switching
- `track_stale_seconds`: active-track freshness for party-size counting
- `recently_vacated_seconds`: display grace period after table empties

## Polygon helper

Click table polygon points from an image or first video frame:

```bash
python vision/tools/polygon_picker.py --input /path/to/frame_or_video.mp4 --output vision/output/table_polygon.json
```

Controls:
- Left click: add point
- Right click: undo last point
- `c`: clear points
- `s`: save JSON
- `q`/`Esc`: quit

## Employee table configuration UI

Draw table boxes directly on a live camera feed and set seats/table metadata:

```bash
python vision/tools/table_config_ui.py \
  --config vision/config/sample_restaurant.yaml \
  --source 0
```

Controls:
- `p`: pause/resume (draw only when paused)
- Mouse drag (left button): draw a table rectangle
- `u`: undo last table
- `c`: clear all tables
- `l`: list tables in terminal
- `s`: save tables to YAML
- `q`/`Esc`: quit

Optional output path:

```bash
python vision/tools/table_config_ui.py \
  --config vision/config/sample_restaurant.yaml \
  --output vision/config/my_restaurant.yaml \
  --source /path/to/video.mp4
```




Run live feed:
vision/.venv/bin/python vision/main.py --config vision/config/sample_restaurant.yaml --source 0


Run with test footage from /test_footage
vision/.venv/bin/python vision/main.py --config vision/config/sample_restaurant.yaml --source test_footage/footage.mp4


Use this exact flow.

Install deps once
python3 -m venv vision/.venv
source vision/.venv/bin/activate
pip install -r vision/requirements.txt

## Dashboard Integration (Admin Zone Setup)

The business dashboard now persists table zones/capacity in Supabase and uses
`/detect` bounding boxes to infer occupied/free tables + dwell time.

1. Run SQL setup once:
```bash
# Run in Supabase SQL Editor
docs/sql/table_zones.sql
```

2. API routes used by the dashboard:
- `GET /api/cameras/CAM-FLOOR/table-zones` - load table zones
- `PUT /api/cameras/CAM-FLOOR/table-zones` - save table zones + capacities
- `POST /api/cameras/CAM-FLOOR/table-occupancy` - update occupied/free + `seated_at`

3. `/detect` response now includes:
- `count`
- `annotated_frame`
- `boxes` (`[[x1,y1,x2,y2], ...]`)
- `frame_width`, `frame_height`

4. Vision camera bridge endpoints (fallback when browser cannot enumerate iPhone camera):
- `POST /cameras` with `{ source, name, zone }` to start a camera stream
- `GET /stream/{camera_id}` for MJPEG feed
- `GET /cameras/{camera_id}/state` for latest `{ people_count, boxes, frame_width, frame_height }`
- `DELETE /cameras/{camera_id}` to stop stream
