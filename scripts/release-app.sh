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
# Flow:
#   1. Check prerequisites
#   2. Build renderer + main (with CURRENT version)
#   3. Package Mac arm64 + x64 DMGs
#   4. Bump version in package.json (only after successful build)
#   5. Upload Mac DMGs + meta.json to OSS
#   6. Update Homebrew Cask
#   7. Commit, tag, push → triggers GitHub Actions for Windows
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

# ── Step 0: Prerequisites ─────────────────────────────────

step "Checking prerequisites"

command -v node >/dev/null || fail "node not found"
command -v npx >/dev/null || fail "npx not found"
command -v gh >/dev/null || fail "gh CLI not found (brew install gh)"
command -v python3 >/dev/null || fail "python3 not found"
python3 -c "import oss2" 2>/dev/null || fail "python3 oss2 module not found (pip3 install oss2)"

[ -n "$OSS_ACCESS_KEY_ID" ] || warn "OSS_ACCESS_KEY_ID not set — OSS upload will be skipped"
[ -d "$HOME/work-inkess/homebrew-tap" ] || warn "Homebrew tap not found at ~/work-inkess/homebrew-tap"

echo "  All checks passed"

# ── Step 1: Determine version ─────────────────────────────

CURRENT_VERSION=$(node -p "require('./package.json').version")

if [ -n "$1" ]; then
  NEW_VERSION="$1"
else
  IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
  NEW_VERSION="$major.$minor.$((patch + 1))"
fi

TAG="v$NEW_VERSION"
echo ""
echo "=== Releasing $TAG (current: $CURRENT_VERSION) ==="

if git rev-parse "$TAG" >/dev/null 2>&1; then
  fail "Tag $TAG already exists"
fi

# ── Step 2: Bump version ──────────────────────────────────

step "Bumping version to $NEW_VERSION"
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
echo "  package.json → $NEW_VERSION"

# ── Step 3: Build ─────────────────────────────────────────

step "Building app"
if ! npx electron-vite build; then
  # Rollback version on build failure
  sed -i '' "s/\"version\": \"$NEW_VERSION\"/\"version\": \"$CURRENT_VERSION\"/" package.json
  fail "Build failed — version rolled back to $CURRENT_VERSION"
fi
echo "  Build complete"

# ── Step 4: Package Mac DMGs ──────────────────────────────

step "Packaging Mac DMGs (arm64 + x64)"

DMGBUILD_DIR="$HOME/Library/Caches/electron-builder/dmg-builder@1.2.0/dmgbuild-bundle-arm64-75c8a6c"
if [ -f "$DMGBUILD_DIR/dmgbuild" ]; then
  export CUSTOM_DMGBUILD_PATH="$DMGBUILD_DIR/dmgbuild"
fi

rm -rf release/mac release/mac-arm64 release/*.dmg release/*.blockmap release/*.yml 2>/dev/null || true

if ! npx electron-builder --mac --arm64 --x64; then
  sed -i '' "s/\"version\": \"$NEW_VERSION\"/\"version\": \"$CURRENT_VERSION\"/" package.json
  fail "Packaging failed — version rolled back to $CURRENT_VERSION"
fi

ARM64_DMG="release/Inkess Claude Code CLI-${NEW_VERSION}-arm64.dmg"
X64_DMG="release/Inkess Claude Code CLI-${NEW_VERSION}.dmg"

[ -f "$ARM64_DMG" ] || fail "arm64 DMG not found"
[ -f "$X64_DMG" ] || fail "x64 DMG not found"

echo "  $(ls -lh "$ARM64_DMG" | awk '{print $5}') arm64"
echo "  $(ls -lh "$X64_DMG" | awk '{print $5}') x64"

# ── Step 5: Upload Mac to OSS ────────────────────────────

if [ -n "$OSS_ACCESS_KEY_ID" ] && [ -n "$OSS_ACCESS_KEY_SECRET" ]; then
  step "Uploading Mac artifacts to OSS"
  python3 -c "
import oss2, os, glob, json, urllib.parse
auth = oss2.Auth(os.environ['OSS_ACCESS_KEY_ID'], os.environ['OSS_ACCESS_KEY_SECRET'])
bucket = oss2.Bucket(auth, 'https://oss-cn-beijing.aliyuncs.com', 'inkess-install-file')

# Upload versioned files
for f in glob.glob('release/*.dmg') + glob.glob('release/*.dmg.blockmap') + glob.glob('release/latest-mac.yml'):
    name = os.path.basename(f)
    key = f'app-releases/{name}'
    size_mb = os.path.getsize(f) / 1024 / 1024
    print(f'  {name} ({size_mb:.1f} MB)...')
    oss2.resumable_upload(bucket, key, f, part_size=10*1024*1024, num_threads=3)

# Create latest/ copies (permanent download URLs)
v = '$NEW_VERSION'
copies = {
    f'app-releases/Inkess Claude Code CLI-{v}-arm64.dmg': 'app-releases/latest/macos-arm64.dmg',
    f'app-releases/Inkess Claude Code CLI-{v}.dmg': 'app-releases/latest/macos-x64.dmg',
}
for src, dst in copies.items():
    bucket.copy_object(bucket.bucket_name, src, dst)
    print(f'  latest/ ← {os.path.basename(src)}')

# Upload meta.json
base = 'https://download.starapp.net/app-releases'
meta = {
    'version': v,
    'mac_arm64': f'{base}/latest/macos-arm64.dmg',
    'mac_x64': f'{base}/latest/macos-x64.dmg',
    'win_x64': f'{base}/latest/windows-x64.exe',
    'homebrew': 'brew tap gezhigang000/tap && brew install --cask inkess-claude-code-cli'
}
bucket.put_object('app-releases/meta.json', json.dumps(meta, ensure_ascii=False).encode())
print('  OSS upload complete + latest/ updated + meta.json updated')
" || warn "OSS upload failed (non-fatal)"
else
  warn "Skipping OSS upload (no credentials)"
fi

# ── Step 6: Update Homebrew Cask ──────────────────────────

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

# ── Step 7: Commit, tag, push ─────────────────────────────

step "Committing and pushing"
git add -A
git commit -m "release: v$NEW_VERSION" || true
git tag "$TAG"
git push github main
git push github "$TAG"
echo "  Pushed $TAG → GitHub Actions will build Windows exe"

# ── Done ──────────────────────────────────────────────────

echo ""
echo -e "${GREEN}=== Release $TAG complete ===${NC}"
echo ""
echo "  Mac arm64 DMG : OSS ✓"
echo "  Mac x64 DMG   : OSS ✓"
echo "  Homebrew Cask : updated ✓"
echo "  Windows exe   : GitHub Actions building..."
echo ""
echo "  Monitor: gh run list --limit 1"
