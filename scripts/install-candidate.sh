#!/usr/bin/env sh
# Install current candidate version from local source (Device A pre-publish verification).
# Run after the automation intake PR is merged to main.
set -eu

# shellcheck disable=SC1007
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck disable=SC1007
REPO_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)
PKG_DIR="${REPO_ROOT}/packages/claude-code"
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/claude-code-pack.XXXXXX")
TGZ=""

case "$TMP_DIR" in
  "$REPO_ROOT"/*)
    echo "ERROR: temporary pack directory is inside repository: $TMP_DIR" >&2
    exit 1
    ;;
esac

cleanup() {
  if [ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

echo "=== Pulling latest main ==="
if [ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no)" ]; then
  echo "ERROR: tracked files have uncommitted changes. Stash or commit first." >&2
  exit 1
fi
git -C "$REPO_ROOT" pull origin main --ff-only

version=$(node -p "require('${PKG_DIR}/package.json').version")
echo "=== Candidate: ${version} ==="
TGZ="bash0816-claude-code-${version}.tgz"

cd "$PKG_DIR"
npm pack --quiet --pack-destination "$TMP_DIR"
test -f "${TMP_DIR}/${TGZ}"
echo "=== Installing ${TGZ} ==="
npm install -g "${TMP_DIR}/${TGZ}"

echo "=== Version check ==="
version_ok=false
if claude --version; then
  version_ok=true
else
  echo "warn: claude --version returned non-zero" >&2
fi
echo "=== Done: @bash0816/claude-code@${version} installed on Device A (version_ok=${version_ok}) ==="
