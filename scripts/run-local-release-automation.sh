#!/usr/bin/env sh
set -eu

# shellcheck disable=SC1007
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck disable=SC1007
REPO_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)
ORIGIN_URL="${CLAUDE_TERMUX_AUTOMATION_ORIGIN_URL:-$(git -C "${REPO_ROOT}" config --get remote.origin.url 2>/dev/null || printf '%s' "${REPO_ROOT}")}"
AUTOMATION_ROOT="${CLAUDE_TERMUX_AUTOMATION_ROOT:-${HOME}/.codex-release-cicd}"
WORK_ROOT="${AUTOMATION_ROOT}/work"
LOG_ROOT="${AUTOMATION_ROOT}/logs"
STATE_ROOT="${AUTOMATION_ROOT}/state"
STATE_FILE="${CLAUDE_TERMUX_STATE_FILE:-${STATE_ROOT}/canonical-release-state.json}"
SCHEMA_FILE="${REPO_ROOT}/scripts/codex-release-automation-output.schema.json"
SOURCE_REF="${CLAUDE_TERMUX_AUTOMATION_SOURCE_REF:-main}"
BASE_BRANCH="${CLAUDE_TERMUX_AUTOMATION_BASE_BRANCH:-dev}"
LEGACY_SYNC_SCRIPT="${REPO_ROOT}/scripts/sync-legacy-metadata.sh"
DRY_RUN=0

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
run_dir="${WORK_ROOT}/${timestamp}"
log_dir="${LOG_ROOT}/${timestamp}"
status_json="${log_dir}/status.json"
result_json="${log_dir}/result.json"
last_message="${log_dir}/last-message.json"

mkdir -p "${run_dir}" "${log_dir}"
mkdir -p "${STATE_ROOT}"

git clone "${ORIGIN_URL}" "${run_dir}/repo" >/dev/null 2>&1
git -C "${run_dir}/repo" fetch --prune origin >/dev/null 2>&1
git -C "${run_dir}/repo" checkout -B "${SOURCE_REF}" "origin/${SOURCE_REF}" >/dev/null 2>&1 || true
git -C "${run_dir}/repo" pull --ff-only origin "${SOURCE_REF}" >/dev/null 2>&1 || true

node "${run_dir}/repo/scripts/release-automation-status.js" --json > "${status_json}"

read_json_field() {
  node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const v=j[process.argv[2]]; process.stdout.write(v === undefined ? "" : String(v));' "$1" "$2"
}

read_git_config() {
  git -C "${REPO_ROOT}" config --get "$1" 2>/dev/null || true
}

read_global_git_config() {
  git config --global --get "$1" 2>/dev/null || true
}

resolve_identity_fallback() {
  field="$1"
  if [ "$field" = "user.name" ]; then
    gh api user --jq '.login' 2>/dev/null || true
    return
  fi
  if [ "$field" = "user.email" ]; then
    login="$(gh api user --jq '.login' 2>/dev/null || true)"
    if [ -n "$login" ]; then
      printf '%s\n' "${login}@users.noreply.github.com"
    fi
    return
  fi
}

is_valid_json_file() {
  [ -f "$1" ] || return 1
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));' "$1" >/dev/null 2>&1
}

candidate_version=$(read_json_field "${status_json}" latest_candidate_version)
audited_version=$(read_json_field "${status_json}" latest_audited_version)
published_version=$(read_json_field "${status_json}" published_version)
needs_verification=$(read_json_field "${status_json}" needs_verification)
needs_publish=$(read_json_field "${status_json}" needs_publish)
needs_legacy_sync=$(read_json_field "${status_json}" needs_legacy_sync)
local_verification_locked=$(read_json_field "${status_json}" local_verification_locked)
candidate_state_status=$(read_json_field "${status_json}" candidate_state_status)
local_state_file=$(read_json_field "${status_json}" local_state_file)
candidate_branch="automation/native-claude-${candidate_version}"
candidate_remote_ref="origin/${candidate_branch}"

compare_versions() {
  node -e '
const a = String(process.argv[1] || "").split(".").map(Number);
const b = String(process.argv[2] || "").split(".").map(Number);
const len = Math.max(a.length, b.length);
for (let i = 0; i < len; i += 1) {
  const diff = (a[i] || 0) - (b[i] || 0);
  if (diff !== 0) {
    process.exit(diff > 0 ? 0 : 1);
  }
}
process.exit(0);
' "$1" "$2"
}

write_state() {
  version="$1"
  status="$2"
  node - <<'NODE' "${STATE_FILE}" "${version}" "${status}"
const fs = require('fs');
const file = process.argv[2];
const version = process.argv[3];
const status = process.argv[4];
let state = { candidates: {} };
try {
  state = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {}
if (!state.candidates) state.candidates = {};
state.candidates[version] = {
  status,
  updated_at: new Date().toISOString()
};
fs.mkdirSync(require('path').dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
NODE
}

apply_result_state() {
  if [ ! -f "${result_json}" ]; then
    write_state "${candidate_version}" "verification_failed"
    return
  fi
  result_candidate=$(read_json_field "${result_json}" candidate_version)
  result_passed=$(read_json_field "${result_json}" verification_passed)
  result_dispatched=$(read_json_field "${result_json}" promotion_dispatched)
  result_publish=$(read_json_field "${result_json}" publish_dispatched)
  if [ "${result_candidate}" = "${candidate_version}" ] && [ "${result_passed}" = "true" ] && [ "${result_publish}" = "true" ]; then
    write_state "${candidate_version}" "publish_dispatched"
    return
  fi
  if [ "${result_candidate}" = "${candidate_version}" ] && [ "${result_passed}" = "true" ] && [ "${result_dispatched}" = "true" ]; then
    write_state "${candidate_version}" "promotion_dispatched"
    return
  fi
  write_state "${candidate_version}" "verification_failed"
}

if [ "${needs_verification}" != "true" ]; then
  if [ -n "${candidate_version}" ] && \
     [ "${needs_publish}" != "true" ] && \
     [ "${needs_legacy_sync}" != "true" ] && \
     { [ "${candidate_state_status}" = "promotion_dispatched" ] || [ "${candidate_state_status}" = "publish_dispatched" ]; }; then
    if compare_versions "${audited_version}" "${candidate_version}" && compare_versions "${published_version}" "${audited_version}" && compare_versions "${audited_version}" "${latest_legacy_synced_version:-${audited_version}}"; then
      write_state "${candidate_version}" "complete"
      candidate_state_status="complete"
    fi
  fi
  if [ "${needs_publish}" != "true" ] && [ "${needs_legacy_sync}" = "true" ]; then
    if [ "${DRY_RUN}" -eq 1 ]; then
      sh "${LEGACY_SYNC_SCRIPT}" --dry-run "${audited_version}"
      exit 0
    fi
    helper_status=0
    sh "${LEGACY_SYNC_SCRIPT}" "${audited_version}" > "${result_json}" || helper_status=$?
    if [ "${helper_status}" -ne 0 ]; then
      if ! is_valid_json_file "${result_json}"; then
        cat > "${result_json}" <<EOF
{"mode":"legacy_sync","audited_version":"${audited_version}","legacy_sync_completed":false,"legacy_sync_branch":"","legacy_sync_stage":"error","legacy_sync_prs":[],"notes":["legacy sync helper failed without valid result json"]} 
EOF
      fi
    fi
    cat "${result_json}"
    [ "${helper_status}" -eq 0 ] || exit "${helper_status}"
    exit 0
  fi
  note="no candidate verification required"
  if [ "${local_verification_locked}" = "true" ]; then
    note="candidate verification locked by local state"
  elif [ "${candidate_state_status}" = "promotion_dispatched" ] || [ "${candidate_state_status}" = "pending_promotion" ] || [ "${candidate_state_status}" = "publish_dispatched" ]; then
    note="candidate promotion follow-up is pending a fresh reconcile run"
  elif [ "${needs_publish}" = "true" ]; then
    note="canonical publish pending in GitHub Actions follow-up"
  elif [ "${needs_legacy_sync}" = "true" ]; then
    note="follow-up pending in GitHub Actions"
  fi
  cat > "${result_json}" <<EOF
{"mode":"no_action","candidate_version":null,"audited_version":"${audited_version}","published_version":"${published_version}","verification_passed":false,"promotion_dispatched":false,"publish_dispatched":false,"notes":["${note}","state_file=${local_state_file}"]} 
EOF
  cat "${result_json}"
  exit 0
fi

git_user_name=$(read_git_config user.name)
git_user_email=$(read_git_config user.email)

if [ -z "${git_user_name}" ]; then
  git_user_name=$(read_global_git_config user.name)
fi
if [ -z "${git_user_email}" ]; then
  git_user_email=$(read_global_git_config user.email)
fi
if [ -z "${git_user_name}" ]; then
  git_user_name=$(resolve_identity_fallback user.name)
fi
if [ -z "${git_user_email}" ]; then
  git_user_email=$(resolve_identity_fallback user.email)
fi

if [ -z "${git_user_name}" ] || [ -z "${git_user_email}" ]; then
  cat > "${result_json}" <<EOF
{"mode":"no_action","candidate_version":"${candidate_version}","audited_version":"${audited_version}","published_version":"${published_version}","verification_passed":false,"promotion_dispatched":false,"publish_dispatched":false,"notes":["identity missing; stopped before verification","user_name_present=$([ -n "${git_user_name}" ] && printf true || printf false)","user_email_present=$([ -n "${git_user_email}" ] && printf true || printf false)","state_file=${local_state_file}"]} 
EOF
  cat "${result_json}"
  exit 0
fi

git -C "${run_dir}/repo" config user.name "${git_user_name}"
git -C "${run_dir}/repo" config user.email "${git_user_email}"

if ! git -C "${run_dir}/repo" show-ref --verify --quiet "refs/remotes/${candidate_remote_ref}"; then
  cat > "${result_json}" <<EOF
{"mode":"no_action","candidate_version":"${candidate_version}","audited_version":"${audited_version}","published_version":"${published_version}","verification_passed":false,"promotion_dispatched":false,"publish_dispatched":false,"notes":["candidate branch missing; stopped before verification","branch=${candidate_branch}","state_file=${local_state_file}"]} 
EOF
  cat "${result_json}"
  exit 0
fi

git -C "${run_dir}/repo" checkout -B "${candidate_branch}" "${candidate_remote_ref}" >/dev/null 2>&1

prompt_file="${log_dir}/prompt.txt"
cat > "${prompt_file}" <<EOF
Use skill cluade-termux-release-cicd.

Facts:
- Repository: ${run_dir}/repo
- Repository checked out at candidate branch: ${candidate_branch}
- Latest audited version on main manifest: ${audited_version}
- Latest candidate version on main manifest: ${candidate_version}
- Promotion target base branch: ${BASE_BRANCH}
- Local state file: ${local_state_file}

Task:
1. Verify candidate version ${candidate_version} on checked out candidate branch ${candidate_branch}.
2. Run prepare-native, claude --version, claude auth status, claude update --dry-run, and temp-prefix npm install checks through the wrapper path.
   - use a temp prefix under /data/data/com.termux/files/usr/tmp
   - for the install-path check, use the local package path ./packages/claude-code and never the bare spec packages/claude-code
3. If and only if all checks pass, run:
   node scripts/promote-verified-version.js ${candidate_version}
   node scripts/update-release-manifest.js
   node scripts/update-readme-version-guidance.js
   git add README.md config/claude-native-audited-versions.json config/claude-termux-release-manifest.json packages/claude-code/README.md packages/claude-code/config/claude-native-audited-versions.json packages/claude-code/config/claude-termux-release-manifest.json packages/claude-code/package.json
   git commit -m "Promote native Claude ${candidate_version}"
   git push --force-with-lease origin ${candidate_branch}
   if no open PR exists, gh pr create --repo bash0816/ClaudeCode-Termux --base ${BASE_BRANCH} --head ${candidate_branch}
4. Then continue the canonical release flow automatically.
   - check candidate PR ${candidate_branch} -> ${BASE_BRANCH}
   - if the candidate PR is DIRTY because ${BASE_BRANCH} advanced after intake, rebuild ${candidate_branch} from origin/${BASE_BRANCH} before retrying:
     1. reset local ${candidate_branch} to origin/${BASE_BRANCH}
     2. run WORKDIR=<temp-dir> node scripts/termux-prepare-claude-native-version.js @${candidate_version} --json > <prepare-json>
     3. run node scripts/add-candidate-metadata.js ${candidate_version} <prepare-json>
     4. rerun node scripts/update-release-manifest.js
     5. rerun node scripts/promote-verified-version.js ${candidate_version}
     6. rerun node scripts/update-release-manifest.js
     7. rerun node scripts/update-readme-version-guidance.js
     8. commit and force-push ${candidate_branch} again
   - if README drift or similar sync-only drift is the reason checks failed, repair it on ${candidate_branch}, push it, and wait for the PR check to rerun
   - merge candidate PR when state is OPEN, not draft, merge state is acceptable, and all visible checks are completed without failure
   - promote ${BASE_BRANCH} -> staging by using a versioned temp branch named automation/promote-dev-to-staging-${candidate_version}
   - promote staging -> main by using a versioned temp branch named automation/promote-staging-to-main-${candidate_version}
   - after origin/main reaches ${candidate_version}, dispatch npm-package.yml with release_action=publish_candidate
   - wait for the workflow_dispatch run of Npm Package on main to succeed
   - verify npm dist-tag ls @bash0816/claude-code shows candidate=${candidate_version} while latest still points to the pre-promotion stable version
   - after Device A verification passes, dispatch npm-package.yml with release_action=promote_latest
   - wait for the latest promotion run of Npm Package on main to succeed
   - verify npm view @bash0816/claude-code version reaches ${candidate_version}
   - if legacy sync is still needed, run sh scripts/sync-legacy-metadata.sh ${candidate_version}
5. Hard-stop instead of guessing when:
   - merge conflict
   - draft PR
   - failed checks that are not simple sync drift
   - publish workflow failure
   - npm published version does not advance
6. Final answer must be JSON matching the provided schema.
7. Set promotion_dispatched=true only when promotion moved beyond candidate verification into PR merge / branch promotion / publish follow-up.
8. Set publish_dispatched=true only when candidate publish and latest promotion follow-up were both dispatched and confirmed successful.
EOF

if [ "${DRY_RUN}" -eq 1 ]; then
  cat "${status_json}"
  cat "${prompt_file}"
  exit 0
fi

write_state "${candidate_version}" "verification_in_progress"
codex exec \
  --full-auto \
  --skip-git-repo-check \
  -C "${run_dir}/repo" \
  --output-schema "${SCHEMA_FILE}" \
  -o "${last_message}" \
  "$(cat "${prompt_file}")" > "${result_json}" || true

apply_result_state

cat "${result_json}"

post_status_json="${log_dir}/post-status.json"
node "${run_dir}/repo/scripts/release-automation-status.js" --json > "${post_status_json}" || true
post_needs_verification=$(read_json_field "${post_status_json}" needs_verification)
post_needs_publish=$(read_json_field "${post_status_json}" needs_publish)
post_needs_legacy_sync=$(read_json_field "${post_status_json}" needs_legacy_sync)

if [ "${post_needs_verification}" != "true" ] && [ "${post_needs_publish}" != "true" ] && [ "${post_needs_legacy_sync}" != "true" ]; then
  gh workflow run claude-native-version-watch.yml \
    --repo bash0816/ClaudeCode-Termux \
    --ref main \
    -f version=@latest >/dev/null 2>&1 || true
fi
