#!/usr/bin/env bash
# Zips src/ into dist/dark-modern-for-scrumlaunch-teams-<version>.zip, with
# manifest.json at the zip root (unpacked-loadable as-is and Web-Store-uploadable
# as-is). Version comes from src/manifest.json, the single source of truth.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p "require('./src/manifest.json').version")"
NAME="dark-modern-for-scrumlaunch-teams-${VERSION}.zip"

mkdir -p dist
rm -f "dist/${NAME}"

(cd src && zip -r -X "../dist/${NAME}" .)

echo ""
echo "Wrote dist/${NAME}"
unzip -l "dist/${NAME}"
