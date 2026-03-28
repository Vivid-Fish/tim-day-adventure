#!/bin/bash
# Build the infographic by baking Vana data into index.html
# Run before deploy: ./build.sh

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

# Process Vana data into summary JSON
python3 "$DIR/process-data.py" > "$DIR/data.json"

# Inject into template
DATA=$(cat "$DIR/data.json")
sed "s|VANA_DATA_PLACEHOLDER|$DATA|" "$DIR/template.html" > "$DIR/index.html"

echo "Built index.html with $(wc -c < "$DIR/data.json") bytes of data"
