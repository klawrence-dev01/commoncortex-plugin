#!/usr/bin/env bash
# CommonCortex Plugin Installer
# Usage: ./install.sh /path/to/your/obsidian-vault
#
# Downloads the latest plugin bundle from GitHub and installs it
# into any Obsidian vault you point it at.

set -e

VAULT_PATH="${1:?Usage: $0 /path/to/your/obsidian-vault}"
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/commoncortex"
REPO="klawrence-dev01/commoncortex-plugin"
BASE_URL="https://raw.githubusercontent.com/$REPO/main"

echo "📦 Installing CommonCortex plugin..."
echo "   Vault: $VAULT_PATH"

# Validate vault path
if [ ! -d "$VAULT_PATH" ]; then
  echo "❌ Vault path does not exist: $VAULT_PATH"
  exit 1
fi

# Create plugin directory
mkdir -p "$PLUGIN_DIR"

# Download plugin files
echo "   Downloading main.js..."
curl -fsSL "$BASE_URL/main.js" -o "$PLUGIN_DIR/main.js"

echo "   Downloading manifest.json..."
curl -fsSL "$BASE_URL/manifest.json" -o "$PLUGIN_DIR/manifest.json"

echo "   Downloading styles.css..."
curl -fsSL "$BASE_URL/styles.css" -o "$PLUGIN_DIR/styles.css"

echo ""
echo "✅ CommonCortex installed to: $PLUGIN_DIR"
echo ""
echo "Next steps:"
echo "  1. Open Obsidian and load your vault at: $VAULT_PATH"
echo "  2. Go to Settings → Community Plugins"
echo "  3. Disable Safe Mode if prompted"
echo "  4. Find CommonCortex in the installed plugins list and enable it"
echo "  5. Go to Settings → CommonCortex"
echo "  6. Set your Author Name and Email"
echo "  7. Add a sync source (GitHub repo URL + folders + destination)"
echo "  8. Hit Sync — your content will flow in"
