#!/bin/sh
# Builds build/papyrio-mcp-<version>.mcpb: a one-click Claude Desktop extension,
# also the format Smithery takes for local stdio servers. The bundle has to ship
# its own production node_modules, so it is staged outside the source tree.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
STAGE="$ROOT/build/stage"

cd "$ROOT"
npm run build
npx -y @anthropic-ai/mcpb validate manifest.json

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R dist manifest.json icon.png package.json package-lock.json LICENSE README.md "$STAGE/"
(cd "$STAGE" && npm ci --omit=dev --ignore-scripts --silent)

npx -y @anthropic-ai/mcpb pack "$STAGE" "$ROOT/build/papyrio-mcp-$VERSION.mcpb"
rm -rf "$STAGE"
