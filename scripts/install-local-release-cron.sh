#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)
CRON_MINUTE="${1:-30}"
DRY_RUN=0
if [ "${CRON_MINUTE}" = "--dry-run" ]; then
  DRY_RUN=1
  CRON_MINUTE="${2:-30}"
fi
CRON_LINE="${CRON_MINUTE} 9 * * * /bin/sh ${REPO_ROOT}/scripts/run-local-release-automation.sh >> ${HOME}/.codex-release-cicd/cron.log 2>&1"

if command -v crontab >/dev/null 2>&1; then
  current_file=$(mktemp)
  next_file=$(mktemp)
  backup_file="${HOME}/.codex-release-cicd/crontab.backup.$(date -u +%Y%m%dT%H%M%SZ)"
  trap 'rm -f "${current_file}" "${next_file}"' EXIT
  crontab -l > "${current_file}" 2>/dev/null || true
  mkdir -p "${HOME}/.codex-release-cicd"
  cp "${current_file}" "${backup_file}" 2>/dev/null || true
  grep -v 'run-local-release-automation.sh' "${current_file}" > "${next_file}" || true
  printf '%s\n' "${CRON_LINE}" >> "${next_file}"
  if [ "${DRY_RUN}" -eq 1 ]; then
    printf 'dry-run cron entry:\n%s\nbackup: %s\n' "${CRON_LINE}" "${backup_file}"
    exit 0
  fi
  crontab "${next_file}"
  printf 'installed cron entry:\n%s\nbackup: %s\n' "${CRON_LINE}" "${backup_file}"
  exit 0
fi

printf 'crontab command not found. install a cron package, then add:\n%s\n' "${CRON_LINE}"
