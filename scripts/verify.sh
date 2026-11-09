#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
python3 -m py_compile scripts/deploy.py
python3 - <<'PYCODE'
import json
from pathlib import Path
for path in Path('layouts').glob('*.json'):
    json.loads(path.read_text())
PYCODE
bun test
python3 -m unittest discover -s tests -p 'test_*.py'
