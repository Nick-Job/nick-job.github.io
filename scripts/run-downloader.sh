#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv-downloader"
PYTHON="${PYTHON:-python3}"
PORT="${DOWNLOAD_PORT:-8788}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "需要先安装 ffmpeg。macOS 可运行：brew install ffmpeg" >&2
  exit 1
fi

if [ ! -x "$VENV/bin/python" ]; then
  "$PYTHON" -m venv "$VENV"
fi

"$VENV/bin/python" -m pip install --quiet --upgrade pip
"$VENV/bin/python" -m pip install --quiet -r "$ROOT/downloader/requirements.txt"

echo "NickWork Downloader: http://localhost:$PORT"
exec "$VENV/bin/uvicorn" app:app --app-dir "$ROOT/downloader" --host 0.0.0.0 --port "$PORT"
