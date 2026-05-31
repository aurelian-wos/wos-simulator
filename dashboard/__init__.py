"""Dashboard support package.

Ingestion helpers used by `check_testcases.py` to record exact-state context
for every run. Public API is intentionally small; see `state_capture`.
"""

# The legacy Python simulator (check_testcases.py, Base_classes) moved to
# archived/v1/ during the monorepo reorg. Some dashboard modules import
# `check_testcases` directly (e.g. ingest.waiver_for). Make archived/v1
# importable so those imports resolve even when the dashboard package is used
# standalone (pytest, backfill) rather than spawned by check_testcases itself.
import os as _os
import sys as _sys

_REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
_V1_DIR = _os.path.join(_REPO_ROOT, "archived", "v1")
if _os.path.isdir(_V1_DIR) and _V1_DIR not in _sys.path:
    _sys.path.insert(0, _V1_DIR)
