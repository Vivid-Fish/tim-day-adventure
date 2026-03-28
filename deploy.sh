#!/bin/bash
# Sync fresh Vana data, commit, push, and deploy
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Sync latest Vana data
echo "Syncing Vana data..."
mkdir -p data
cp ~/.vana/results/*.json data/ 2>/dev/null || true

# Commit if changed
if ! git diff --quiet data/; then
  git add data/
  git commit -m "Update Vana data $(date +%Y-%m-%d)"
fi

# Push and deploy
git push origin main
source ~/.env
curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  "https://coolify.vivid.fish/api/v1/deploy?uuid=xsoccs44c4gc0w0gkcs8sc84"
echo "Deployed!"
