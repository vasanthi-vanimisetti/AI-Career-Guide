"""Small atomic JSON storage helpers."""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_WRITE_LOCK = threading.RLock()


def read_json(filename: str, default: Any) -> Any:
    """Read JSON data, returning a caller-provided default when unavailable."""
    path = DATA_DIR / filename
    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except (OSError, json.JSONDecodeError):
        return default


def save_record(filename: str, record: dict[str, Any]) -> None:
    """Append one record and atomically replace the JSON file."""
    path = DATA_DIR / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    with _WRITE_LOCK:
        existing = read_json(filename, [])
        if not isinstance(existing, list):
            existing = []
        existing.append(record)
        temporary_path = path.with_suffix(path.suffix + ".tmp")
        with temporary_path.open("w", encoding="utf-8") as file:
            json.dump(existing, file, ensure_ascii=False, indent=2)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary_path, path)