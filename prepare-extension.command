#!/bin/zsh
set -e
cd "${0:A:h}"
"${PYTHON:-python3.11}" -m venv .venv-ddddocr
.venv-ddddocr/bin/python -m pip install -r requirements-ddddocr.txt
npm --cache "$PWD/.npm-cache" --prefix "$PWD/extension-deps" ci --ignore-scripts --no-audit --no-fund
.venv-ddddocr/bin/python build_extension.py
