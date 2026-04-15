#!/bin/bash
# Iris Chrome Extension Auto Installer
# Downloads and installs the latest release from GitHub (private repo)
# Usage: ./install.sh [version]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST_JSON="${SCRIPT_DIR}/../manifest.json"
REPO="Lightblues/easons_agent"
EXTENSION_NAME="iris"
INSTALL_DIR="$HOME/.ea/iris"

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "❌ Error: gh CLI is not installed"
    echo "   Install it from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Error: Not authenticated with GitHub"
    echo "   Run: gh auth login"
    exit 1
fi

# Get version from argument or manifest.json
if [ -n "$1" ]; then
    VERSION="$1"
elif [ -f "$MANIFEST_JSON" ]; then
    VERSION=$(grep '"version"' "$MANIFEST_JSON" | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')
    echo "Read version ${VERSION} from manifest.json"
else
    echo "Error: No version specified and manifest.json not found"
    exit 1
fi

TAG="iris-v${VERSION}"
echo "📦 Installing ${EXTENSION_NAME} v${VERSION}..."

# Create install directory
mkdir -p "$INSTALL_DIR"

# Backup existing installation if present
if [ -d "$INSTALL_DIR/iris" ]; then
    BACKUP_DIR="$INSTALL_DIR/iris.bak.$(date +%Y%m%d%H%M%S)"
    echo "📁 Backing up existing installation to: $BACKUP_DIR"
    mv "$INSTALL_DIR/iris" "$BACKUP_DIR"
fi

# Download to temp, then move to install dir
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

echo "⬇️  Downloading..."
gh release download "$TAG" --repo "$REPO" --pattern "iris.zip"
unzip -q iris.zip -d iris

# Move to install directory
mv iris "$INSTALL_DIR/"
rm -rf "$TMP_DIR"

echo "✅ Installed to: $INSTALL_DIR/iris"
echo ""
echo "📋 Next steps:"
echo "   1. Open Chrome and go to: chrome://extensions/"
echo "   2. Enable 'Developer mode' (top right toggle)"
echo "   3. Click 'Load unpacked'"
echo "   4. Select this folder: $INSTALL_DIR/iris"
echo ""
echo "💡 To update: run this script again, Chrome will auto-reload the extension"
