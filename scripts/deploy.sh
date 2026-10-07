#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch (served by GitHub Pages).
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
npm run build
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy $(git -C .. rev-parse --short HEAD)"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Deployed to gh-pages."
