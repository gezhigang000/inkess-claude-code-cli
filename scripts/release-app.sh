#!/bin/bash
set -e

# Inkess Claude Code CLI — local release script
# Builds Mac DMGs (arm64 + x64), uploads to GitHub Release + OSS
#
# Usage:
#   ./scripts/release-app.sh           # auto-detect version from package.json
#   ./scripts/release-app.sh v0.2.0    # specify version tag

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CODE_DIR="$SCRIPT_DIR/../code"
cd "$CODE_DIR"

# Version
VERSION="${1:-v$(node -p "require('./package.json').version")}"
echo "=== Releasing $VERSION ==="

# 1. Build + package Mac arm64 & x64
echo ""
echo "--- Building Mac DMGs ---"
npm run build

# Use npmmirror for Electron download (GitHub blocked in some regions)
# CUSTOM_DMGBUILD_PATH avoids dmg-builder download being affected by ELECTRON_MIRROR
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
DMGBUILD_DIR="$HOME/Library/Caches/electron-builder/dmg-builder@1.2.0/dmgbuild-bundle-arm64-75c8a6c"
if [ -f "$DMGBUILD_DIR/dmgbuild" ]; then
  export CUSTOM_DMGBUILD_PATH="$DMGBUILD_DIR/dmgbuild"
fi

npx electron-builder --mac --arm64
npx electron-builder --mac --x64

echo ""
echo "--- Built artifacts ---"
ls -lh release/*.dmg 2>/dev/null
ls -lh release/*.exe 2>/dev/null

# 2. Create git tag if not exists
if ! git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo ""
  echo "--- Creating tag $VERSION ---"
  git tag "$VERSION"
  echo "Tag created. Push with: git push origin $VERSION"
fi

# 3. Upload to GitHub Release
echo ""
echo "--- Uploading to GitHub Release ---"
if gh release view "$VERSION" >/dev/null 2>&1; then
  echo "Release $VERSION exists, uploading assets..."
  gh release upload "$VERSION" release/*.dmg --clobber
else
  echo "Creating release $VERSION..."
  gh release create "$VERSION" release/*.dmg \
    --title "$VERSION" \
    --notes "Inkess Claude Code CLI $VERSION" \
    --draft
fi

# 4. Upload to OSS (optional, requires OSS env vars)
if [ -n "$OSS_ACCESS_KEY_ID" ] && [ -n "$OSS_ACCESS_KEY_SECRET" ]; then
  echo ""
  echo "--- Uploading to OSS ---"
  RELEASE_DIR="$CODE_DIR/release"

  python3 -c "
import oss2, os, glob

auth = oss2.Auth(os.environ['OSS_ACCESS_KEY_ID'], os.environ['OSS_ACCESS_KEY_SECRET'])
bucket = oss2.Bucket(auth, 'https://oss-cn-beijing.aliyuncs.com', 'inkess-install-file', connect_timeout=30)

version = '$VERSION'.lstrip('v')
files = glob.glob('$RELEASE_DIR/*.dmg') + glob.glob('$RELEASE_DIR/*.exe')

for f in files:
    name = os.path.basename(f)
    key = f'app-releases/{version}/{name}'
    size_mb = os.path.getsize(f) / 1024 / 1024
    print(f'  Uploading {key} ({size_mb:.1f} MB)...')
    oss2.resumable_upload(bucket, key, f, part_size=10*1024*1024, num_threads=2)
    print(f'  Done: {name}')

# Update latest pointer
bucket.put_object('app-releases/latest', version.encode())
print(f'  Updated latest -> {version}')
print('  OSS upload complete.')
"
else
  echo ""
  echo "--- Skipping OSS upload (set OSS_ACCESS_KEY_ID + OSS_ACCESS_KEY_SECRET to enable) ---"
fi

echo ""
echo "=== Release $VERSION done ==="
echo ""
echo "Next steps:"
echo "  1. git push origin main && git push origin $VERSION"
echo "  2. GitHub Actions will build Windows .exe and attach to the release"
echo "  3. Go to GitHub releases and publish the draft (if created as draft)"
