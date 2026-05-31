#!/usr/bin/env sh
set -eu

# shellcheck disable=SC1007
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck disable=SC1007,SC2034
CANONICAL_REPO_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)
LEGACY_REPO_ROOT="${CLAUDE_TERMUX_LEGACY_REPO_ROOT:-${HOME}/CluadeCode-Termux-public}"
LEGACY_REPO_SLUG="${CLAUDE_TERMUX_LEGACY_REPO_SLUG:-bash0816/CluadeCode-Termux}"
CANONICAL_SOURCE_REF="${CLAUDE_TERMUX_CANONICAL_SOURCE_REF:-origin/main}"
DRY_RUN=0
ACTIVE_LEGACY_REPO_ROOT="${LEGACY_REPO_ROOT}"
TMP_REPO_ROOT=""

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
  shift
fi

TARGET_VERSION="${1:-}"
if [ -z "${TARGET_VERSION}" ]; then
  echo "usage: $0 [--dry-run] <version>" >&2
  exit 1
fi

NOTES_FILE=$(mktemp)
PRS_FILE=$(mktemp)
cleanup() {
  rm -f "${NOTES_FILE}" "${PRS_FILE}"
  if [ -n "${TMP_REPO_ROOT}" ] && [ -d "${TMP_REPO_ROOT}" ]; then
    rm -rf "${TMP_REPO_ROOT}"
  fi
}
trap cleanup EXIT

SYNC_COMPLETED=false
SYNC_STAGE="init"
SYNC_BRANCH=""

add_note() {
  printf '%s\n' "$1" >> "${NOTES_FILE}"
}

add_pr() {
  printf '%s\n' "$1" >> "${PRS_FILE}"
}

emit_result() {
  node - <<'NODE' "${TARGET_VERSION}" "${SYNC_COMPLETED}" "${SYNC_BRANCH}" "${SYNC_STAGE}" "${NOTES_FILE}" "${PRS_FILE}"
const fs = require('fs');
const auditedVersion = process.argv[2];
const completed = process.argv[3] === 'true';
const branch = process.argv[4];
const stage = process.argv[5];
const notesFile = process.argv[6];
const prsFile = process.argv[7];
function readLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
const result = {
  mode: 'legacy_sync',
  audited_version: auditedVersion,
  legacy_sync_completed: completed,
  legacy_sync_branch: branch || '',
  legacy_sync_stage: stage || '',
  legacy_sync_prs: readLines(prsFile),
  notes: readLines(notesFile),
};
process.stdout.write(JSON.stringify(result) + '\n');
NODE
}

fail() {
  add_note "$1"
  emit_result
  exit 1
}

ensure_clean_worktree() {
  if [ -n "$(git -C "${ACTIVE_LEGACY_REPO_ROOT}" status --porcelain)" ]; then
    fail "legacy repo worktree is dirty"
  fi
}

compare_versions() {
  node - <<'NODE' "$1" "$2"
function compareVersions(a, b) {
  const aParts = String(a || '').split('.').map(Number);
  const bParts = String(b || '').split('.').map(Number);
  const len = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < len; index += 1) {
    const diff = (aParts[index] || 0) - (bParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
process.stdout.write(String(compareVersions(process.argv[2], process.argv[3])));
NODE
}

version_ge() {
  [ "$(compare_versions "$1" "$2")" -ge 0 ]
}

branch_exists_remote() {
  git -C "${ACTIVE_LEGACY_REPO_ROOT}" show-ref --verify --quiet "refs/remotes/origin/$1"
}

git_config_value() {
  git -C "${CANONICAL_REPO_ROOT}" config --get "$1" 2>/dev/null || true
}

legacy_origin_url() {
  git -C "${LEGACY_REPO_ROOT}" config --get remote.origin.url 2>/dev/null || true
}

manifest_version_from_ref() {
  git -C "${ACTIVE_LEGACY_REPO_ROOT}" show "$1:config/claude-termux-release-manifest.json" 2>/dev/null | \
    node -e 'const fs=require("fs"); const raw=fs.readFileSync(0,"utf8"); if (!raw.trim()) process.exit(0); const data=JSON.parse(raw); process.stdout.write(String(data.latest_audited_version || ""));'
}

current_stage() {
  main_version=$(manifest_version_from_ref "origin/main")
  staging_version=$(manifest_version_from_ref "origin/staging")
  dev_version=$(manifest_version_from_ref "origin/dev")

  if version_ge "${main_version}" "${TARGET_VERSION}"; then
    printf '%s' "complete"
    return
  fi
  if version_ge "${staging_version}" "${TARGET_VERSION}"; then
    printf '%s' "promote_main"
    return
  fi
  if version_ge "${dev_version}" "${TARGET_VERSION}"; then
    printf '%s' "promote_staging"
    return
  fi
  printf '%s' "promote_dev"
}

read_pr_record() {
  if [ "${DRY_RUN}" -eq 1 ]; then
    return 0
  fi
  gh pr list --repo "${LEGACY_REPO_SLUG}" --state all --base "$1" --head "$2" --json number,state,mergedAt,url --limit 20 2>/dev/null | \
    node -e 'const fs=require("fs"); const rows=JSON.parse(fs.readFileSync(0,"utf8") || "[]"); if (!rows.length) process.exit(0); process.stdout.write(JSON.stringify(rows[0]));'
}

pr_number() {
  node -e 'const value = process.argv[1]; if (!value) process.exit(0); const row = JSON.parse(value); process.stdout.write(String(row.number || ""));' "$1"
}

pr_state() {
  node -e 'const value = process.argv[1]; if (!value) process.exit(0); const row = JSON.parse(value); process.stdout.write(String(row.state || ""));' "$1"
}

pr_url() {
  node -e 'const value = process.argv[1]; if (!value) process.exit(0); const row = JSON.parse(value); process.stdout.write(String(row.url || ""));' "$1"
}

merge_pr() {
  pr_number_value="$1"
  if [ "${DRY_RUN}" -eq 1 ]; then
    add_note "dry-run merge skipped for pr=${pr_number_value}"
    return
  fi
  gh pr merge "${pr_number_value}" --repo "${LEGACY_REPO_SLUG}" --merge >/dev/null
}

push_branch() {
  branch="$1"
  if [ "${DRY_RUN}" -eq 1 ]; then
    add_note "dry-run push skipped for branch=${branch}"
    return
  fi
  git -C "${LEGACY_REPO_ROOT}" push --force-with-lease origin "${branch}" >/dev/null
}

delete_temp_branch() {
  branch="$1"
  if [ "${DRY_RUN}" -eq 1 ]; then
    return
  fi
  git -C "${LEGACY_REPO_ROOT}" push origin --delete "${branch}" >/dev/null 2>&1 || true
}

create_pr() {
  base="$1"
  head="$2"
  title="$3"
  body="$4"
  if [ "${DRY_RUN}" -eq 1 ]; then
    add_note "dry-run pr create skipped for ${head} -> ${base}"
    return 0
  fi
  output=$(gh pr create --repo "${LEGACY_REPO_SLUG}" --base "${base}" --head "${head}" --title "${title}" --body "${body}" 2>&1) || {
    printf '%s' "${output}"
    return 1
  }
  printf '%s' "${output}"
}

prepare_temp_promotion_branch() {
  temp_branch="$1"
  base="$2"
  source="$3"
  git -C "${ACTIVE_LEGACY_REPO_ROOT}" checkout -B "${temp_branch}" "origin/${base}" >/dev/null 2>&1
  git -C "${ACTIVE_LEGACY_REPO_ROOT}" merge --no-edit "origin/${source}" >/dev/null 2>&1 || fail "temp promotion merge failed: ${source} -> ${base}"
  push_branch "${temp_branch}"
}

ensure_pr_merged() {
  base="$1"
  head="$2"
  title="$3"
  body="$4"
  temp_branch="$5"

  effective_head="${head}"

  if [ -n "${temp_branch}" ] && [ "${DRY_RUN}" -ne 1 ]; then
    prepare_temp_promotion_branch "${temp_branch}" "${base}" "${head}"
    effective_head="${temp_branch}"
  fi

  record=$(read_pr_record "${base}" "${effective_head}" || true)
  state=$(pr_state "${record}")
  number=$(pr_number "${record}")
  url=$(pr_url "${record}")

  if [ "${DRY_RUN}" -eq 1 ]; then
    add_note "dry-run promotion skipped for ${head} -> ${base}"
    [ -n "${temp_branch}" ] && add_note "dry-run fallback branch available: ${temp_branch}"
    return 0
  fi

  if [ "${state}" = "MERGED" ]; then
    [ -n "${url}" ] && add_pr "${url}"
    add_note "already merged ${effective_head} -> ${base}"
    return
  fi

  if [ -z "${number}" ]; then
    # shellcheck disable=SC2034
    create_output=$(create_pr "${base}" "${effective_head}" "${title}" "${body}" || true)
    record=$(read_pr_record "${base}" "${effective_head}" || true)
    number=$(pr_number "${record}")
    state=$(pr_state "${record}")
    url=$(pr_url "${record}")
    [ -n "${number}" ] || fail "pr create failed: ${effective_head} -> ${base}"
  fi

  [ -n "${url}" ] && add_pr "${url}"
  if [ "${state}" = "OPEN" ] || [ -z "${state}" ]; then
    merge_pr "${number}" || fail "pr merge failed: ${number}"
  elif [ "${state}" != "MERGED" ]; then
    fail "unexpected pr state for ${head} -> ${base}: ${state}"
  fi

  git -C "${ACTIVE_LEGACY_REPO_ROOT}" fetch --prune origin >/dev/null 2>&1 || true

  if [ -n "${temp_branch}" ]; then
    delete_temp_branch "${temp_branch}"
  fi
}

if [ ! -d "${LEGACY_REPO_ROOT}" ]; then
  fail "legacy repo root not found: ${LEGACY_REPO_ROOT}"
fi

git_user_name=$(git_config_value user.name)
git_user_email=$(git_config_value user.email)
[ -n "${git_user_name}" ] || fail "missing canonical git user.name"
[ -n "${git_user_email}" ] || fail "missing canonical git user.email"

if [ "${DRY_RUN}" -eq 1 ]; then
  TMP_REPO_ROOT=$(mktemp -d)
  legacy_origin=$(legacy_origin_url)
  [ -n "${legacy_origin}" ] || fail "legacy dry-run origin url not found"
  git clone "${legacy_origin}" "${TMP_REPO_ROOT}/repo" >/dev/null 2>&1 || fail "legacy dry-run clone failed"
  ACTIVE_LEGACY_REPO_ROOT="${TMP_REPO_ROOT}/repo"
  add_note "dry-run uses temporary clone"
fi

git -C "${ACTIVE_LEGACY_REPO_ROOT}" fetch --prune origin >/dev/null 2>&1 || fail "legacy fetch failed"
git -C "${CANONICAL_REPO_ROOT}" fetch --prune origin >/dev/null 2>&1 || fail "canonical fetch failed"
ensure_clean_worktree
git -C "${ACTIVE_LEGACY_REPO_ROOT}" config user.name "${git_user_name}"
git -C "${ACTIVE_LEGACY_REPO_ROOT}" config user.email "${git_user_email}"

SYNC_STAGE=$(current_stage)
if [ "${SYNC_STAGE}" = "complete" ]; then
  SYNC_COMPLETED=true
  add_note "legacy main already synced to ${TARGET_VERSION}"
  emit_result
  exit 0
fi

feature_branch="feature/sync-legacy-${TARGET_VERSION}"
SYNC_BRANCH="${feature_branch}"

git -C "${ACTIVE_LEGACY_REPO_ROOT}" checkout -B "${feature_branch}" "origin/main" >/dev/null 2>&1

CLAUDE_TERMUX_LEGACY_REPO_ROOT="${ACTIVE_LEGACY_REPO_ROOT}" CLAUDE_TERMUX_CANONICAL_SOURCE_REF="${CANONICAL_SOURCE_REF}" node "${CANONICAL_REPO_ROOT}/scripts/sync-legacy-metadata.js" || fail "legacy metadata sync failed"
node "${ACTIVE_LEGACY_REPO_ROOT}/scripts/update-release-manifest.js" || fail "legacy manifest update failed"
node "${ACTIVE_LEGACY_REPO_ROOT}/scripts/update-readme-version-guidance.js" || fail "legacy readme update failed"

if ! git -C "${ACTIVE_LEGACY_REPO_ROOT}" diff --quiet -- README.md packages/cluade-code/README.md config/claude-native-audited-versions.json packages/cluade-code/config/claude-native-audited-versions.json config/claude-termux-release-manifest.json packages/cluade-code/config/claude-termux-release-manifest.json; then
  git -C "${ACTIVE_LEGACY_REPO_ROOT}" add README.md packages/cluade-code/README.md config/claude-native-audited-versions.json packages/cluade-code/config/claude-native-audited-versions.json config/claude-termux-release-manifest.json packages/cluade-code/config/claude-termux-release-manifest.json
  git -C "${ACTIVE_LEGACY_REPO_ROOT}" commit -m "Sync legacy metadata for ${TARGET_VERSION}" >/dev/null 2>&1 || fail "legacy commit failed"
  push_branch "${feature_branch}"
elif ! branch_exists_remote "${feature_branch}" && [ "${SYNC_STAGE}" = "promote_dev" ]; then
  fail "no diff and no resumable branch/pr state for ${TARGET_VERSION}"
fi

if [ "${SYNC_STAGE}" = "promote_dev" ]; then
  ensure_pr_merged "dev" "${feature_branch}" "Sync legacy metadata for ${TARGET_VERSION}" "Sync legacy bridge metadata to ${TARGET_VERSION}." ""
  if [ "${DRY_RUN}" -eq 1 ]; then
    emit_result
    exit 0
  fi
  SYNC_STAGE="promote_staging"
fi

if [ "$(current_stage)" = "promote_staging" ]; then
  ensure_pr_merged "staging" "dev" "Promote legacy dev to staging for ${TARGET_VERSION}" "Promote synced legacy metadata for ${TARGET_VERSION} from dev to staging." "feature/promote-legacy-${TARGET_VERSION}-staging"
  if [ "${DRY_RUN}" -eq 1 ]; then
    emit_result
    exit 0
  fi
  SYNC_STAGE="promote_main"
fi

if [ "$(current_stage)" = "promote_main" ]; then
  ensure_pr_merged "main" "staging" "Promote legacy staging to main for ${TARGET_VERSION}" "Promote synced legacy metadata for ${TARGET_VERSION} from staging to main." "feature/promote-legacy-${TARGET_VERSION}-main"
  if [ "${DRY_RUN}" -eq 1 ]; then
    emit_result
    exit 0
  fi
fi

if [ "$(current_stage)" = "complete" ]; then
  SYNC_COMPLETED=true
  SYNC_STAGE="complete"
  add_note "legacy main synced to ${TARGET_VERSION}"
  emit_result
  exit 0
fi

fail "legacy sync did not reach main for ${TARGET_VERSION}"
