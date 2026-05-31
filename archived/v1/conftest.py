"""Pytest bootstrap for the archived v1 Python simulator.

After the monorepo reorg the legacy simulator lives under archived/v1/. Its
tests import the ``Base_classes`` package and ``check_testcases`` as top-level
modules, so make this directory importable for any test collected beneath it.
"""

import os
import sys

_V1_DIR = os.path.dirname(os.path.abspath(__file__))
if _V1_DIR not in sys.path:
    sys.path.insert(0, _V1_DIR)
