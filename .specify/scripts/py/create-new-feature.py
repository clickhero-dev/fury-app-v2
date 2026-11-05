#!/usr/bin/env python3
"""Create a new feature branch and spec directory.

Usage: python create-new-feature.py "feature short name" [GIT_BRANCH_NAME]

Outputs JSON with BRANCH_NAME, FEATURE_NUM, SPEC_DIR on stdout.
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SPECIFY_DIR = REPO_ROOT / ".specify"
SPECS_DIR = REPO_ROOT / "specs"
INIT_OPTIONS_PATH = SPECIFY_DIR / "init-options.json"


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT, **kwargs)


def next_sequential_number(existing_dirs: list[str]) -> int:
    nums = []
    for d in existing_dirs:
        m = re.match(r"^(\d{3})-", d)
        if m:
            nums.append(int(m.group(1)))
    return max(nums) + 1 if nums else 1


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: create-new-feature.py <short-name> [GIT_BRANCH_NAME]", file=sys.stderr)
        sys.exit(1)

    short_name = sys.argv[1].strip().lower().replace(" ", "-")
    git_branch_name = sys.argv[2] if len(sys.argv) > 2 else None

    # Determine numbering
    init_options = {}
    if INIT_OPTIONS_PATH.is_file():
        init_options = json.loads(INIT_OPTIONS_PATH.read_text())

    numbering = init_options.get("feature_numbering", "sequential")

    SPECS_DIR.mkdir(parents=True, exist_ok=True)
    existing = [d.name for d in SPECS_DIR.iterdir() if d.is_dir()]

    if numbering == "timestamp":
        prefix = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    else:
        num = next_sequential_number(existing)
        prefix = f"{num:03d}"

    dir_name = f"{prefix}-{short_name}"
    spec_dir = SPECS_DIR / dir_name

    # Create git branch
    branch = git_branch_name or dir_name
    result = run(["git", "rev-parse", "--verify", branch])
    if result.returncode != 0:
        run(["git", "checkout", "-b", branch], check=True)

    # Create spec directory
    spec_dir.mkdir(parents=True, exist_ok=True)

    # Update feature.json
    feature_json = SPECIFY_DIR / "feature.json"
    feature_json.write_text(json.dumps({"feature_directory": f"specs/{dir_name}"}, indent=2) + "\n")

    output = {
        "BRANCH_NAME": branch,
        "FEATURE_NUM": prefix,
        "SPEC_DIR": str(spec_dir),
        "FEATURE_DIRECTORY": f"specs/{dir_name}",
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
