#!/usr/bin/env python3
"""Set up the tasks context for a feature.

Reads .specify/feature.json and ensures tasks.md template is ready.
Outputs JSON with paths needed by speckit-tasks.
"""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SPECIFY_DIR = REPO_ROOT / ".specify"
FEATURE_JSON = SPECIFY_DIR / "feature.json"
TEMPLATES_DIR = SPECIFY_DIR / "templates"


def main() -> None:
    if not FEATURE_JSON.is_file():
        print("ERROR: .specify/feature.json not found.", file=sys.stderr)
        sys.exit(1)

    feature = json.loads(FEATURE_JSON.read_text())
    feature_dir = feature.get("feature_directory", "")
    if not feature_dir:
        print("ERROR: feature_directory not set.", file=sys.stderr)
        sys.exit(1)

    spec_dir = REPO_ROOT / feature_dir
    spec_file = spec_dir / "spec.md"
    plan_file = spec_dir / "plan.md"
    tasks_file = spec_dir / "tasks.md"

    # Copy tasks template if tasks.md doesn't exist
    if not tasks_file.is_file():
        template = TEMPLATES_DIR / "tasks-template.md"
        if template.is_file():
            tasks_file.write_text(template.read_text())

    output = {
        "FEATURE_SPEC": str(spec_file),
        "IMPL_PLAN": str(plan_file),
        "TASKS_FILE": str(tasks_file),
        "SPECS_DIR": str(REPO_ROOT / "specs"),
        "FEATURE_DIRECTORY": feature_dir,
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
