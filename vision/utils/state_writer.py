from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Optional


class JsonStateWriter:
    def __init__(self, output_dir: str, every_n_frames: int = 15, write_latest: bool = True) -> None:
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.every_n_frames = max(1, int(every_n_frames))
        self.write_latest = write_latest

    def maybe_write(self, state: Dict) -> Optional[Path]:
        frame_index = int(state["frame_index"])
        if frame_index % self.every_n_frames != 0:
            return None

        target = self.output_dir / f"state_{frame_index:06d}.json"
        target.write_text(json.dumps(state, indent=2), encoding="utf-8")

        if self.write_latest:
            latest = self.output_dir / "latest_state.json"
            latest.write_text(json.dumps(state, indent=2), encoding="utf-8")

        return target
