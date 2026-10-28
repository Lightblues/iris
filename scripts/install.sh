#!/usr/bin/env bash
# Install or update the Iris extension from GitHub Releases.
#   curl -fsSL https://raw.githubusercontent.com/Lightblues/iris/main/scripts/install.sh | bash
#   ... | bash -s -- 0.6.0      # a specific version
# IRIS_DIR overrides the install folder (default ~/.iris/extension). Load it once with
# chrome://extensions → Load unpacked; later runs replace it in place and Iris reloads itself.
set -euo pipefail

REPO="Lightblues/iris"
DIR="${IRIS_DIR:-$HOME/.iris/extension}"

if [ -n "${1:-}" ]; then
  VERSION="${1#v}"
else
  URL=$(curl -fsSIL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest")
  VERSION="${URL##*/v}"
fi
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Could not resolve a release version (got '$VERSION')" >&2; exit 1; }

CURRENT=""
[ -f "$DIR/manifest.json" ] && CURRENT=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$DIR/manifest.json" | head -1)
if [ "$CURRENT" = "$VERSION" ]; then
  echo "Iris $VERSION is already installed at $DIR"
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
echo "Downloading Iris $VERSION..."
curl -fsSL -o "$TMP/iris.zip" "https://github.com/$REPO/releases/download/v$VERSION/iris-v$VERSION.zip"
unzip -q "$TMP/iris.zip" -d "$TMP/new"
[ -f "$TMP/new/manifest.json" ] || { echo "Release zip has no manifest.json" >&2; exit 1; }

mkdir -p "$(dirname "$DIR")"
rm -rf "$DIR"
mv "$TMP/new" "$DIR"

if [ -n "$CURRENT" ]; then
  echo "Updated Iris $CURRENT → $VERSION. It reloads itself within a minute (or click reload in chrome://extensions)."
else
  echo "Installed Iris $VERSION at $DIR"
  echo "Load it once: chrome://extensions → Developer mode → Load unpacked → $DIR"
  if command -v pbcopy >/dev/null; then
    printf '%s' "$DIR" | pbcopy
    echo "(Path copied. In the folder picker press Cmd+Shift+G and paste.)"
  fi
fi
