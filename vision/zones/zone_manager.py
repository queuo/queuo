from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from zones.geometry import normalize_polygon, point_in_polygon, rect_to_polygon

Point = Tuple[int, int]


@dataclass
class TableZone:
    table_id: str
    capacity: int
    polygon: List[Point]
    label: Optional[str] = None
    priority: int = 9999


@dataclass
class SpecialZone:
    zone_id: str
    polygon: List[Point]


class ZoneManager:
    def __init__(self, config: Dict):
        self.tables = self._load_table_zones(config.get("tables", []))
        self.special_zones = self._load_special_zones(config.get("zones", {}))

    @staticmethod
    def _zone_polygon(zone_cfg: Dict) -> List[Point]:
        if "polygon" in zone_cfg and zone_cfg["polygon"]:
            return normalize_polygon(zone_cfg["polygon"])
        if "rect" in zone_cfg and zone_cfg["rect"]:
            return rect_to_polygon(zone_cfg["rect"])
        raise ValueError("Zone must define either `polygon` or `rect`.")

    def _load_table_zones(self, table_cfgs: Sequence[Dict]) -> List[TableZone]:
        tables: List[TableZone] = []
        for idx, cfg in enumerate(table_cfgs):
            table_id = cfg.get("table_id")
            capacity = cfg.get("capacity")
            if not table_id:
                raise ValueError(f"Table at index {idx} is missing `table_id`.")
            if capacity is None:
                raise ValueError(f"Table {table_id} is missing `capacity`.")

            tables.append(
                TableZone(
                    table_id=str(table_id),
                    capacity=int(capacity),
                    polygon=self._zone_polygon(cfg),
                    label=cfg.get("label"),
                    priority=int(cfg.get("priority", 9999)),
                )
            )

        # Highest precedence first when zones overlap.
        return sorted(tables, key=lambda t: (t.priority, t.table_id))

    def _load_special_zones(self, zone_cfgs: Dict) -> List[SpecialZone]:
        special_zones: List[SpecialZone] = []
        for zone_id, cfg in zone_cfgs.items():
            special_zones.append(SpecialZone(zone_id=zone_id, polygon=self._zone_polygon(cfg)))
        return special_zones

    def get_table_capacities(self) -> Dict[str, int]:
        return {table.table_id: table.capacity for table in self.tables}

    def get_table_polygons(self) -> Dict[str, List[Point]]:
        return {table.table_id: table.polygon for table in self.tables}

    def find_table_for_point(self, point: Point) -> Optional[str]:
        for table in self.tables:
            if point_in_polygon(point, table.polygon):
                return table.table_id
        return None

    def find_special_zone_for_point(self, point: Point) -> Optional[str]:
        for zone in self.special_zones:
            if point_in_polygon(point, zone.polygon):
                return zone.zone_id
        return None

    def compose_zone_label(self, table_id: Optional[str], special_zone_id: Optional[str]) -> str:
        if table_id:
            return f"table:{table_id}"
        if special_zone_id:
            return f"zone:{special_zone_id}"
        return "zone:none"
