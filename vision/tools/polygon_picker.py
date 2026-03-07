from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np

Point = Tuple[int, int]


class PolygonPicker:
    def __init__(self, frame):
        self.frame = frame
        self.points: List[Point] = []

    def on_mouse(self, event, x, y, _flags, _param):
        if event == cv2.EVENT_LBUTTONDOWN:
            self.points.append((int(x), int(y)))
        elif event == cv2.EVENT_RBUTTONDOWN and self.points:
            self.points.pop()

    def draw(self):
        canvas = self.frame.copy()
        for idx, p in enumerate(self.points):
            cv2.circle(canvas, p, 4, (0, 255, 255), -1)
            cv2.putText(canvas, str(idx), (p[0] + 5, p[1] - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
        if len(self.points) > 1:
            poly = np.array(self.points, dtype=np.int32)
            cv2.polylines(canvas, [poly], False, (0, 200, 255), 2)
        return canvas


def load_frame(path: str):
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(path)

    if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}:
        frame = cv2.imread(str(p))
        if frame is None:
            raise RuntimeError(f"Failed to read image: {path}")
        return frame

    cap = cv2.VideoCapture(str(p))
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise RuntimeError(f"Failed to read first frame from video: {path}")
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description="Click polygon points from an image or video frame")
    parser.add_argument("--input", required=True, help="Path to image or video")
    parser.add_argument("--output", default="vision/output/polygon_points.json", help="Output JSON file path")
    args = parser.parse_args()

    frame = load_frame(args.input)
    picker = PolygonPicker(frame)

    window = "Polygon Picker"
    cv2.namedWindow(window)
    cv2.setMouseCallback(window, picker.on_mouse)

    while True:
        canvas = picker.draw()
        cv2.putText(canvas, "LMB:add point | RMB:undo | c:clear | s:save | q:quit", (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
        cv2.imshow(window, canvas)

        key = cv2.waitKey(16) & 0xFF
        if key == ord("c"):
            picker.points.clear()
        elif key == ord("s"):
            out = Path(args.output)
            out.parent.mkdir(parents=True, exist_ok=True)
            payload = {"polygon": [list(p) for p in picker.points]}
            out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            print(f"Saved polygon with {len(picker.points)} points to {out}")
        elif key in (ord("q"), 27):
            break

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
