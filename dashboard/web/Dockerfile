# syntax=docker/dockerfile:1.7
#
# Dev-mode image for the WOS simulator dashboard.
#
# docker-compose bind-mounts dashboard/web/ over /app so on-disk edits are
# picked up by the Next.js dev server with no image rebuild. The image itself
# only exists to pre-install node_modules (including the native better-sqlite3
# build) and provide the dev command — everything under /app is expected to be
# replaced by the host bind mount at runtime.
#
# The container uses Turbopack with Next's watchOptions.pollIntervalMs enabled
# from docker-compose. Native inotify can miss host-side edits on WSL2/Windows-
# backed bind mounts; polling keeps hot reload reliable in that setup.
#
# The dashboard spawns two Python CLIs inside the container:
#   - dashboard/ocr_report.py  (Import report flow; needs tesseract + Pillow
#     + pytesseract)
#   - dashboard/simulate_battle.py  (Simulate battle page; imports the
#     Base_classes simulator package, which depends on tabulate)
# compose mounts the host dashboard/, Base_classes/, assets/, and
# fighters_data/ trees read-only at the matching container paths so those
# scripts can reach them. A dedicated /opt/sim-venv holds the Python deps
# for both flows and SIMULATOR_PYTHON points the routes at that venv.

FROM node:20-bookworm-slim
WORKDIR /app

# better-sqlite3 is a native module; node-gyp needs python + a C++ toolchain.
# tesseract-ocr + Pillow/pytesseract are needed for the OCR flow. tabulate is
# imported by Base_classes.Fight, which simulate_battle.py pulls in. A
# dedicated /opt/sim-venv keeps those deps out of the system Python and
# avoids --break-system-packages.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-venv \
      make g++ \
      tesseract-ocr \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/sim-venv \
 && /opt/sim-venv/bin/pip install --no-cache-dir \
      "Pillow==12.2.0" "pytesseract==0.3.13" "tabulate==0.9.0"

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1 \
    SIMULATOR_PYTHON=/opt/sim-venv/bin/python

EXPOSE 3000
CMD ["npm", "run", "dev:docker", "--", "--hostname", "0.0.0.0", "--port", "3000"]
