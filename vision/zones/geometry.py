from __future__ import annotations

from typing import Iterable, List, Sequence, Tuple

import cv2
import numpy as np

Point = Tuple[int, int]
Polygon = List[Point]


def rect_to_polygon(rect: Sequence[float]) -> Polygon:
    if len(rect) != 4:
        raise ValueError("Rectangle must contain exactly 4 values: [x1, y1, x2, y2].")
    x1, y1, x2, y2 = [int(v) for v in rect]
    return [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]


def normalize_polygon(points: Iterable[Sequence[float]]) -> Polygon:
    normalized = [(int(p[0]), int(p[1])) for p in points]
    if len(normalized) < 3:
        raise ValueError("Polygon must have at least 3 points.")
    return normalized


def polygon_to_ndarray(polygon: Polygon) -> np.ndarray:
    return np.array(polygon, dtype=np.int32)


def point_in_polygon(point: Point, polygon: Polygon) -> bool:
    poly = polygon_to_ndarray(polygon)
    result = cv2.pointPolygonTest(poly, point, False)
    return result >= 0


def bbox_bottom_center(bbox_xyxy: Sequence[float]) -> Point:
    x1, y1, x2, y2 = bbox_xyxy
    cx = int((x1 + x2) / 2)
    cy = int(y2)
    return (cx, cy)
