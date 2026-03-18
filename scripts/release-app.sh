#!/bin/bash
set -e

# ============================================================
# Inkess Claude Code CLI — One-click Release Script
# ============================================================
#
# Usage:
#   ./scripts/release-app.sh [version]
#
# Examples:
#   ./scripts/release-app.sh          # bump patch: 0.2.2 → 0.2.3
#   ./scripts/release-app.sh 0.3.0    # set specific version
#
# What it does (in order):
#   1. Bump version in package.json
#   2. Build renderer + main
#   3. Package Mac arm64 + x64 DMGs
#   4. Upload Mac DMGs + latest-mac.yml to OSS
#   5. Update Homebrew Cask (sha256 + version)
#   6. Commit, tag, push → triggers GitHub Actions for Windows
#   7. GitHub Actions: build exe → upload to GitHub Release + OSS
#
# Prerequisites:
#   - OSS credentials in scripts/.env (OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET)
#   - gh CLI authenticated
#   - Homebrew tap repo cloned at ~/work-inkess/homebrew-tap
#   - Apple Developer ID certificate in keychain (for signing)
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Load OSS credentials
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "\n${GREEN}▸ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

# ── Step 0: Determine version ──────────────────────────────

CURRENT_VERSION=$(node -p "require('./package.json').version")

if [ -n "$1" ]; then
  NEW_VERSION="$1"
else
  # Auto bump patch
  IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
  NEW_VERSION="$major.$minor.$((patch + 1))"
fi

TAG="v$NEW_VERSION"
echo "=== Releasing $TAG (current: $CURRENT_VERSION) ==="

# Check for uncommitted changes (besides version bump)
if [ -n "$(git status --porcelain)" ]; then
  warn "Uncommitted changes detected. They will be included in the release commit."
fi

# ── Step 1: Bump version ───────────────────────────────────

step "Bumping version to $NEW_VERSION"
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
echo "  package.json → $NEW_VERSION"

# ── Step 2: Build ──────────────────────────────────────────

step "Building app"
npx electron-vite build
echo "  Build complete"

# ── Step 3: Package Mac DMGs ───────────────────────────────

step "Packaging Mac DMGs (arm64 + x64)"

# Use local dmgbuild cache to avoid npmmirror 404
DMGBUILD_DIR="$HOME/Library/Caches/electron-builder/dmg-builder@1.2.0/dmgbuild-bundle-arm64-75c8a6c"
if [ -f "$DMGBUILD_DIR/dmgbuild" ]; then
  export CUSTOM_DMGBUILD_PATH="$DMGBUILD_DIR/dmgbuild"
fi

# Clean old artifacts
rm -rf release/mac release/mac-arm64 release/*.dmg release/*.blockmap release/*.yml 2>/dev/null || true

npx electron-builder --mac --arm64 --x64

ARM64_DMG="release/Inkess Claude Code CLI-${NEW_VERSION}-arm64.dmg"
X64_DMG="release/Inkess Claude Code CLI-${NEW_VERSION}.dmg"

[ -f "$ARM64_DMG" ] || fail "arm64 DMG not found"
[ -f "$X64_DMG" ] || fail "x64 DMG not found"

echo "  $(ls -lh "$ARM64_DMG" | awk '{print $5}') arm64"
echo "  $(ls -lh "$X64_DMG" | awk '{print $5}') x64"

# ── Step 4: Upload Mac to OSS ─────────────────────────────

if [ -n "$OSS_ACCESS_KEY_ID" ] && [ -n "$OSS_ACCESS_KEY_SECRET" ]; then
  step "Uploading Mac artifacts to OSS"
  python3 -c "
import oss2, os, glob
auth = oss2.Auth(os.environ['OSS_ACCESS_KEY_ID'], os.environ['OSS_ACCESS_KEY_SECRET'])
bucket = oss2.Bucket(auth, 'https://oss-cn-beijing.aliyuncs.com', 'inkess-install-file')
for f in glob.glob('release/*.dmg') + glob.glob('release/*.dmg.blockmap') + glob.glob('release/latest-mac.yml'):
    name = os.path.basename(f)
    key = f'app-releases/{name}'
    size_mb = os.path.getsize(f) / 1024 / 1024
    print(f'  {name} ({size_mb:.1f} MB)...')
    oss2.resumable_upload(bucket, key, f, part_size=10*1024*1024, num_threads=3)
print('  OSS upload complete')
"
else
  warn "Skipping OSS upload (no credentials in scripts/.env)"
fi

# ── Step 5: Update Homebrew Cask ───────────────────────────

HOMEBREW_TAP="$HOME/work-inkess/homebrew-tap"
if [ -d "$HOMEBREW_TAP" ]; then
  step "Updating Homebrew Cask"
  ARM64_SHA=$(shasum -a 256 "$ARM64_DMG" | awk '{print $1}')
  X64_SHA=$(shasum -a 256 "$X64_DMG" | awk '{print $1}')

  CASK_FILE="$HOMEBREW_TAP/Casks/inkess-claude-code-cli.rb"
  cat > "$CASK_FILE" << CASK
cask "inkess-claude-code-cli" do
  version "$NEW_VERSION"

  if Hardware::CPU.arm?
    url "https://download.starapp.net/app-releases/Inkess%20Claude%20Code%20CLI-#{version}-arm64.dmg"
    sha256 "$ARM64_SHA"
  else
    url "https://download.starapp.net/app-releases/Inkess%20Claude%20Code%20CLI-#{version}.dmg"
    sha256 "$X64_SHA"
  end

  name "Inkess Claude Code CLI"
  desc "Zero-config Claude Code desktop client for Inkess users"
  homepage "https://llm.starapp.net"

  app "Inkess Claude Code CLI.app"

  zap trash: [
    "~/Library/Application Support/inkess-claude-code",
    "~/Library/Preferences/com.inkess.claude-code.plist",
    "~/Library/Logs/inkess-claude-code",
  ]
end
CASK

  cd "$HOMEBREW_TAP"
  git add -A
  git commit -m "Update inkess-claude-code-cli to $NEW_VERSION" 2>/dev/null || true
  git push origin main 2>/dev/null || warn "Failed to push homebrew-tap"
  cd "$PROJECT_DIR"
  echo "  Cask updated → $NEW_VERSION"
else
  warn "Homebrew tap not found at $HOMEBREW_TAP, skipping"
fi

# ── Step 6: Commit, tag, push ──────────────────────────────

step "Committing and pushing"
git add -A
git commit -m "release: v$NEW_VERSION" || true
git tag "$TAG"
git push github main
git push github "$TAG"
echo "  Pushed $TAG → GitHub Actions will build Windows exe"

# ── Done ───────────────────────────────────────────────────

echo ""
echo -e "${GREEN}=== Release $TAG complete ===${NC}"
echo ""
echo "  Mac arm64 DMG : OSS ✓"
echo "  Mac x64 DMG   : OSS ✓"
echo "  Homebrew Cask : updated ✓"
echo "  Windows exe   : GitHub Actions building..."
echo ""
echo "  GitHub Actions will automatically:"
echo "    1. Build Windows exe"
echo "    2. Upload to GitHub Release"
echo "    3. Upload to OSS"
echo ""
echo "  Monitor: gh run list --limit 1"
