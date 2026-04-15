#!/bin/bash
# Bump version in manifest.json and package.json
set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <new_version>"
    exit 1
fi

NEW_VERSION=$1
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR/.."

# Update manifest.json
sed -i.bak 's/"version": "[^"]*"/"version": "'$NEW_VERSION'"/' manifest.json && rm manifest.json.bak

# Update package.json
sed -i.bak 's/"version": "[^"]*"/"version": "'$NEW_VERSION'"/' package.json && rm package.json.bak

echo "$NEW_VERSION"
