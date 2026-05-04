#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
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
WORKFLOW_REF="${CLAUDE_TERMUX_AUTOMATION_WORKFLOW_REF:-main}"
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

candidate_version=$(read_json_field "${status_json}" latest_candidate_version)
audited_version=$(read_json_field "${status_json}" latest_audited_version)
published_version=$(read_json_field "${status_json}" published_version)
needs_verification=$(read_json_field "${status_json}" needs_verification)
needs_publish=$(read_json_field "${status_json}" needs_publish)
needs_legacy_sync=$(read_json_field "${status_json}" needs_legacy_sync)
local_verification_locked=$(read_json_field "${status_json}" local_verification_locked)
local_state_file=$(read_json_field "${status_json}" local_state_file)

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
  if [ "${result_candidate}" = "${candidate_version}" ] && [ "${result_passed}" = "true" ] && [ "${result_dispatched}" = "true" ]; then
    write_state "${candidate_version}" "promotion_dispatched"
    return
  fi
  write_state "${candidate_version}" "verification_failed"
}

if [ "${needs_verification}" != "true" ]; then
  note="no candidate verification required"
  if [ "${local_verification_locked}" = "true" ]; then
    note="candidate verification locked by local state"
  elif [ "${needs_publish}" = "true" ]; then
    note="canonical publish pending in GitHub Actions follow-up"
  elif [ "${needs_legacy_sync}" = "true" ]; then
    note="legacy sync pending in GitHub Actions follow-up"
  fi
  cat > "${result_json}" <<EOF
{"mode":"no_action","candidate_version":null,"audited_version":"${audited_version}","published_version":"${published_version}","verification_passed":false,"promotion_dispatched":false,"publish_dispatched":false,"notes":["${note}","state_file=${local_state_file}"]} 
EOF
  cat "${result_json}"
  exit 0
fi

prompt_file="${log_dir}/prompt.txt"
cat > "${prompt_file}" <<EOF
Use skill cluade-termux-release-cicd.

Facts:
- Repository: ${run_dir}/repo
- Latest audited version on main manifest: ${audited_version}
- Latest candidate version on main manifest: ${candidate_version}
- Promotion target base branch: ${BASE_BRANCH}
- Promotion workflow ref: ${WORKFLOW_REF}
- Local state file: ${local_state_file}

Task:
1. Verify candidate version ${candidate_version} on this Termux environment.
2. Run prepare-native, claude --version, claude auth status, claude update --dry-run, and temp-prefix npm install checks through the wrapper path.
3. If and only if all checks pass, run:
   gh workflow run promote-verified-candidate.yml --repo bash0816/ClaudeCode-Termux --ref ${WORKFLOW_REF} -f version=${candidate_version} -f base_branch=${BASE_BRANCH}
4. Do not push code changes.
5. Final answer must be JSON matching the provided schema.
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
