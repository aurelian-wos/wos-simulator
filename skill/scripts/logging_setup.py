from __future__ import annotations

import logging
import sys
from datetime import datetime
from pathlib import Path


def configure_daily_file_logging(base_dir: Path, *, level: int = logging.INFO) -> Path:
    """Route root logging to ./logs/YYYYMMDD.log with per-line timestamps."""
    logs_dir = base_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)

    log_path = logs_dir / f"{datetime.now().strftime('%Y%m%d')}.log"
    logging.basicConfig(
        level=level,
        format="[%(asctime)s] [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
        handlers=[logging.FileHandler(log_path, encoding="utf-8")],
        force=True,
    )
    return log_path


def add_stderr_logging(*, level: int = logging.INFO) -> None:
    """Mirror root logs to stderr without disturbing JSON stdout."""
    root = logging.getLogger()
    for handler in root.handlers:
        if getattr(handler, "_wos_stderr_handler", False):
            return

    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%H:%M:%S"))
    handler._wos_stderr_handler = True
    root.addHandler(handler)
