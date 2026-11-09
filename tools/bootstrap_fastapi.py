"""One-off local wheel bootstrapper for verifying the FastAPI adapter.

The shipped default runtime is dependency-free. This script exists because the
execution sandbox blocks pip's temp-file workflow; it downloads only the pinned
runtime wheels into .runtime-packages so the optional adapter can be tested.
"""
from __future__ import annotations

import json
import sys
import urllib.request
import zipfile
from pathlib import Path

PACKAGES = [
    ("fastapi", "0.115.6"),
    ("starlette", "0.41.3"),
    ("pydantic", "2.10.4"),
    ("pydantic_core", "2.27.2"),
    ("annotated_types", "0.7.0"),
    ("typing_extensions", "4.12.2"),
    ("anyio", "4.7.0"),
    ("idna", "3.10"),
    ("sniffio", "1.3.1"),
    ("uvicorn", "0.34.0"),
    ("click", "8.1.8"),
    ("h11", "0.14.0"),
    ("colorama", "0.4.6"),
]

ROOT = Path(__file__).resolve().parent.parent
WHEELS = ROOT / ".wheels"
TARGET = ROOT / ".runtime-packages"


def wheel_url(name: str, version: str) -> str:
    with urllib.request.urlopen(f"https://pypi.org/pypi/{name}/{version}/json", timeout=30) as response:
        data = json.load(response)
    candidates = [item for item in data["urls"] if item["filename"].endswith(".whl")]
    if name == "pydantic_core":
        candidates = [item for item in candidates if "cp312-cp312-win_amd64" in item["filename"]]
    else:
        candidates = [item for item in candidates if "py3-none-any" in item["filename"]] or candidates
    if not candidates:
        raise RuntimeError(f"No compatible wheel for {name}=={version}")
    return candidates[0]["url"]


def main() -> int:
    WHEELS.mkdir(exist_ok=True)
    TARGET.mkdir(exist_ok=True)
    for name, version in PACKAGES:
        url = wheel_url(name, version)
        filename = url.rsplit("/", 1)[-1]
        destination = WHEELS / filename
        if not destination.exists():
            print(f"downloading {filename}")
            urllib.request.urlretrieve(url, destination)
        with zipfile.ZipFile(destination) as archive:
            archive.extractall(TARGET)
    print(f"installed {len(PACKAGES)} wheels into {TARGET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
