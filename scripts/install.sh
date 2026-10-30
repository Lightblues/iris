#!/usr/bin/env bash
# Install or update the Iris extension from GitHub Releases.
#   curl -fsSL https://raw.githubusercontent.com/Lightblues/iris/main/scripts/install.sh | bash
#   ... | bash -s -- 0.6.0          # a specific release
#   ... | bash -s -- beta           # the rolling beta built from every push to main
#   ... | bash -s -- beta --watch   # and keep it updated every 5 minutes (macOS launchd)
#   ... | bash -s -- --unwatch      # stop the automatic updates
# IRIS_DIR overrides the install folder (default ~/.iris/extension). Load it once with
# chrome://extensions → Load unpacked; later runs replace it in place and Iris reloads itself.
set -euo pipefail

REPO="Lightblues/iris"
RAW="https://raw.githubusercontent.com/$REPO/main/scripts/install.sh"
DIR="${IRIS_DIR:-$HOME/.iris/extension}"
AGENT="$HOME/Library/LaunchAgents/site.easonsi.iris-update.plist"

CHANNEL="" WATCH="" QUIET=""
for arg in "$@"; do
  case "$arg" in
    --watch) WATCH=1 ;;
    --unwatch) WATCH=0 ;;
    --quiet) QUIET=1 ;;
    *) CHANNEL="${arg#v}" ;;
  esac
done

if [ "$WATCH" = 0 ]; then
  launchctl unload "$AGENT" 2>/dev/null || true
  rm -f "$AGENT"
  echo "Automatic updates stopped."
  exit 0
fi

if [ "$CHANNEL" = beta ]; then
  VERSION=$(curl -fsSL "https://github.com/$REPO/releases/download/beta/version.txt" | tr -d '[:space:]')
  ZIP_URL="https://github.com/$REPO/releases/download/beta/iris-beta.zip"
elif [ -n "$CHANNEL" ]; then
  VERSION="$CHANNEL"
  ZIP_URL="https://github.com/$REPO/releases/download/v$VERSION/iris-v$VERSION.zip"
else
  URL=$(curl -fsSIL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest")
  VERSION="${URL##*/v}"
  ZIP_URL="https://github.com/$REPO/releases/download/v$VERSION/iris-v$VERSION.zip"
fi
[[ "$VERSION" =~ ^[0-9]+(\.[0-9]+){2,3}$ ]] || { echo "Could not resolve a version (got '$VERSION')" >&2; exit 1; }

if [ "$WATCH" = 1 ]; then
  [ "$(uname)" = Darwin ] || { echo "--watch uses launchd (macOS). Elsewhere, add to crontab: */5 * * * * curl -fsSL $RAW | bash -s -- ${CHANNEL:-} --quiet"; exit 1; }
  mkdir -p "$(dirname "$AGENT")" "$HOME/.iris"
  cat > "$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>site.easonsi.iris-update</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>-c</string>
    <string>curl -fsSL $RAW | IRIS_DIR="$DIR" /bin/bash -s -- ${CHANNEL:-} --quiet</string>
  </array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/.iris/update.log</string>
  <key>StandardErrorPath</key><string>$HOME/.iris/update.log</string>
</dict></plist>
PLIST
  launchctl unload "$AGENT" 2>/dev/null || true
  launchctl load "$AGENT"
  echo "Checking for ${CHANNEL:-release} updates every 5 minutes (log: ~/.iris/update.log; stop: --unwatch)."
fi

CURRENT=""
[ -f "$DIR/manifest.json" ] && CURRENT=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$DIR/manifest.json" | head -1)
if [ "$CURRENT" = "$VERSION" ]; then
  [ -n "$QUIET" ] || echo "Iris $VERSION is already installed at $DIR"
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
echo "$(date '+%F %T') Downloading Iris $VERSION..."
curl -fsSL -o "$TMP/iris.zip" "$ZIP_URL"
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
