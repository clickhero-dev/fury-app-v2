#!/usr/bin/env python3
"""Set up the planning context for a feature.

Reads .specify/feature.json and outputs JSON with paths needed by speckit-plan.
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
        print("ERROR: .specify/feature.json not found. Run create-new-feature first.", file=sys.stderr)
        sys.exit(1)

    feature = json.loads(FEATURE_JSON.read_text())
    feature_dir = feature.get("feature_directory", "")
    if not feature_dir:
        print("ERROR: feature_directory not set in feature.json", file=sys.stderr)
        sys.exit(1)

    spec_dir = REPO_ROOT / feature_dir
    spec_file = spec_dir / "spec.md"
    plan_file = spec_dir / "plan.md"

    # Get current branch
    import subprocess
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        capture_output=True, text=True, cwd=REPO_ROOT
    )
    branch = result.stdout.strip()

    # Copy plan template if plan.md doesn't exist
    if not plan_file.is_file():
        template = TEMPLATES_DIR / "plan-template.md"
        if template.is_file():
            plan_file.write_text(template.read_text())

    output = {
        "FEATURE_SPEC": str(spec_file),
        "IMPL_PLAN": str(plan_file),
        "SPECS_DIR": str(REPO_ROOT / "specs"),
        "BRANCH": branch,
        "FEATURE_DIRECTORY": feature_dir,
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
