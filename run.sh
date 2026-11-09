#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f frontend/dist/index.html ]; then
  echo "Frontend bundle not found. Run: cd frontend && pnpm install && pnpm build" >&2
  exit 1
fi

PYTHON=python3
if printenv PYTHON >/dev/null 2>&1; then
  PYTHON="$(printenv PYTHON)"
fi
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "Python 3.10 or newer is required. Set PYTHON to its executable path." >&2
  exit 1
fi
if ! "$PYTHON" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'; then
  echo "Python 3.10 or newer is required." >&2
  exit 1
fi

exec "$PYTHON" backend/run.py
