#!/usr/bin/env python3
"""Check that spec-kit prerequisites are met for the current repo."""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SPECIFY_DIR = REPO_ROOT / ".specify"
FEATURE_JSON = SPECIFY_DIR / "feature.json"
INIT_OPTIONS = SPECIFY_DIR / "init-options.json"
CONSTITUTION = SPECIFY_DIR / "memory" / "constitution.md"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if not SPECIFY_DIR.is_dir():
        fail(".specify/ directory not found — run spec-kit init first")

    if not CONSTITUTION.is_file():
        fail("constitution.md missing — run /speckit-constitution first")

    # Load feature context if available
    result = {"status": "ok", "specify_dir": str(SPECIFY_DIR)}

    if FEATURE_JSON.is_file():
        feature = json.loads(FEATURE_JSON.read_text())
        result["feature_directory"] = feature.get("feature_directory", "")

    if INIT_OPTIONS.is_file():
        result["init_options"] = json.loads(INIT_OPTIONS.read_text())

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
