#!/bin/bash
set -e

ANKICONNECT_ID="2055492159"
ADDON_DIR="/data/addons21/$ANKICONNECT_ID"
# Anki version 25.9.2 -> 250902 for AnkiWeb download URL
ANKI_VERSION="250902"

echo "=== Anki MCP Server E2E Setup ==="

# Download and install AnkiConnect if not present
if [ ! -d "$ADDON_DIR" ] || [ -z "$(ls -A $ADDON_DIR 2>/dev/null)" ]; then
    echo "Downloading AnkiConnect addon from AnkiWeb..."
    mkdir -p "$ADDON_DIR"

    # Download from AnkiWeb (requires version params)
    curl -sL "https://ankiweb.net/shared/download/${ANKICONNECT_ID}?v=2.1&p=${ANKI_VERSION}" -o /tmp/ankiconnect.zip

    # Unpack
    unzip -q /tmp/ankiconnect.zip -d "$ADDON_DIR"
    rm /tmp/ankiconnect.zip

    echo "AnkiConnect installed to $ADDON_DIR"
fi

# Create manifest.json and meta.json to prevent update prompts
echo "Creating manifest.json and meta.json..."
CURRENT_MOD=$(date +%s)
cat > "$ADDON_DIR/manifest.json" << EOF
{
    "package": "2055492159",
    "name": "AnkiConnect",
    "conflicts": [],
    "mod": $CURRENT_MOD
}
EOF

# Disable update checks in meta.json
cat > "$ADDON_DIR/meta.json" << EOF
{
    "disabled": false,
    "mod": $CURRENT_MOD,
    "conflicts": [],
    "update_enabled": false
}
EOF

# Apply AnkiConnect config (bind to 0.0.0.0 for Docker access)
if [ -f /app/ankiconnect-config.json ]; then
    echo "Applying AnkiConnect config..."
    cp /app/ankiconnect-config.json "$ADDON_DIR/config.json"
fi

# Fix permissions
chown -R anki:anki /data/addons21

echo "Starting Anki..."
exec /startup.sh
