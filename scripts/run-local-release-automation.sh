#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)
AUTOMATION_ROOT="${CLAUDE_TERMUX_AUTOMATION_ROOT:-${HOME}/.codex-release-cicd}"
WORK_ROOT="${AUTOMATION_ROOT}/work"
LOG_ROOT="${AUTOMATION_ROOT}/logs"
SCHEMA_FILE="${REPO_ROOT}/scripts/codex-release-automation-output.schema.json"
SOURCE_REF="${CLAUDE_TERMUX_AUTOMATION_SOURCE_REF:-$(git -C "${REPO_ROOT}" branch --show-current 2>/dev/null || printf 'main')}"
BASE_BRANCH="${CLAUDE_TERMUX_AUTOMATION_BASE_BRANCH:-main}"
WORKFLOW_REF="${CLAUDE_TERMUX_AUTOMATION_WORKFLOW_REF:-main}"
NPM_TAG="${CLAUDE_TERMUX_AUTOMATION_NPM_TAG:-latest}"
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

git clone "${REPO_ROOT}" "${run_dir}/repo" >/dev/null 2>&1
git -C "${run_dir}/repo" fetch --prune origin >/dev/null 2>&1
git -C "${run_dir}/repo" checkout "${SOURCE_REF}" >/dev/null 2>&1 || true
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

if [ "${needs_verification}" != "true" ] && [ "${needs_publish}" != "true" ]; then
  cat > "${result_json}" <<EOF
{"mode":"no_action","candidate_version":null,"audited_version":"${audited_version}","published_version":"${published_version}","verification_passed":false,"promotion_dispatched":false,"publish_dispatched":false,"notes":["no candidate verification or publish action required"]} 
EOF
  cat "${result_json}"
  exit 0
fi

if [ "${needs_verification}" = "true" ]; then
  prompt_file="${log_dir}/prompt.txt"
  cat > "${prompt_file}" <<EOF
Use skill cluade-termux-release-cicd.

Facts:
- Repository: ${run_dir}/repo
- Latest audited version on main manifest: ${audited_version}
- Latest candidate version on main manifest: ${candidate_version}
- Promotion target base branch: ${BASE_BRANCH}
- Promotion workflow ref: ${WORKFLOW_REF}

Task:
1. Verify candidate version ${candidate_version} on this Termux environment.
2. Run prepare-native, claude --version, claude auth status, claude update --dry-run, and temp-prefix npm install checks through the wrapper path.
3. If and only if all checks pass, run:
   gh workflow run promote-verified-candidate.yml --repo bash0816/ClaudeCode-Termux --ref ${WORKFLOW_REF} -f version=${candidate_version} -f base_branch=${BASE_BRANCH}
4. Do not push code changes.
5. Final answer must be JSON matching the provided schema.
EOF
elif [ "${needs_publish}" = "true" ]; then
  prompt_file="${log_dir}/prompt.txt"
  cat > "${prompt_file}" <<EOF
Use skill cluade-termux-release-cicd.

Facts:
- Repository: ${run_dir}/repo
- Latest audited version on main manifest: ${audited_version}
- Currently published npm version: ${published_version}
- Publish workflow ref: ${WORKFLOW_REF}
- npm tag: ${NPM_TAG}

Task:
1. Confirm that audited version ${audited_version} is the intended release version.
2. Run lightweight consistency checks for manifest and package state.
3. If and only if publish is still required, run:
   gh workflow run npm-package.yml --repo bash0816/ClaudeCode-Termux --ref ${WORKFLOW_REF} -f publish=true -f package_version=${audited_version} -f npm_tag=${NPM_TAG}
4. Do not push code changes.
5. Final answer must be JSON matching the provided schema.
EOF
else
  exit 1
fi

if [ "${DRY_RUN}" -eq 1 ]; then
  cat "${status_json}"
  cat "${prompt_file}"
  exit 0
fi

codex exec \
  --full-auto \
  --skip-git-repo-check \
  -C "${run_dir}/repo" \
  --output-schema "${SCHEMA_FILE}" \
  -o "${last_message}" \
  "$(cat "${prompt_file}")" > "${result_json}"

cat "${result_json}"
