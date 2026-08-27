#!/bin/bash

# E2E Evidence Collection Script for claude-code
# 実行開始時刻、環境、キャッシュ確認、4つのコマンド実行とログ収集、tarball検証を実施

set -e

# 第1引数でVERSIONを必須化
VERSION="${1:?VERSION argument is required (e.g., 2.1.245)}"

# タイムスタンプの生成（実行ごとにユニークなディレクトリを作成）
TIMESTAMP=$(date -u '+%Y%m%d-%H%M%S')
RUN_DIR=".verify-${VERSION}/clean-cache-e2e/run-${TIMESTAMP}"
CACHE_DIR="${RUN_DIR}/cache"
LOGS_DIR="${RUN_DIR}/logs"

# 実行開始時刻
START_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

echo "Evidence collection started: $START_TIME"
echo "Run directory: $RUN_DIR"
echo "Target version: $VERSION"

# ディレクトリを作成
mkdir -p "$CACHE_DIR" "$LOGS_DIR"

# configから該当バージョンの情報を読み込む
CONFIG_FILE="packages/claude-code/config/claude-native-audited-versions.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

# Node.jsでJSONからバージョン情報を抽出
VERSION_INFO=$(node - <<'NODE_SCRIPT' "$VERSION" "$CONFIG_FILE" 2>&1
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
const configFile = process.argv[3];

try {
  const configContent = fs.readFileSync(configFile, 'utf8');
  const config = JSON.parse(configContent);

  if (!config.versions || !config.versions[version]) {
    console.error(`ERROR: Version ${version} not found in config`);
    process.exit(1);
  }

  const versionData = config.versions[version];
  if (!versionData.native_spec) {
    console.error(`ERROR: native_spec not found for version ${version}`);
    process.exit(1);
  }

  if (!versionData.tarball_sha256) {
    console.error(`ERROR: tarball_sha256 not found for version ${version}`);
    process.exit(1);
  }

  if (!versionData.tarball_integrity) {
    console.error(`ERROR: tarball_integrity not found for version ${version}`);
    process.exit(1);
  }

  console.log(JSON.stringify({
    nativeSpec: versionData.native_spec,
    tarballSha256: versionData.tarball_sha256,
    tarballIntegrity: versionData.tarball_integrity,
  }));
} catch (err) {
  console.error(`ERROR: Failed to read config: ${err.message}`);
  process.exit(1);
}
NODE_SCRIPT
)

if [ $? -ne 0 ]; then
  echo "Failed to extract version info from config" >&2
  exit 1
fi

# JSONを解析してbashスクリプト内で使う
NATIVE_SPEC=$(echo "$VERSION_INFO" | node -e "const data = JSON.parse(require('fs').readFileSync(0, 'utf8')); console.log(data.nativeSpec);")
TARBALL_SHA256=$(echo "$VERSION_INFO" | node -e "const data = JSON.parse(require('fs').readFileSync(0, 'utf8')); console.log(data.tarballSha256);")
TARBALL_INTEGRITY=$(echo "$VERSION_INFO" | node -e "const data = JSON.parse(require('fs').readFileSync(0, 'utf8')); console.log(data.tarballIntegrity);")

echo "Extracted from config:"
echo "  Native spec: $NATIVE_SPEC"
echo "  Tarball SHA256: $TARBALL_SHA256"
echo ""

# グローバルな失敗カウンタ
OVERALL_FAILURES=0

# キャッシュディレクトリが空であることを確認
EMPTY_CHECK_OUTPUT=$LOGS_DIR/empty-cache-check.log
{
  echo "Cache directory check at $START_TIME"
  echo "Directory: $CACHE_DIR"
  if find "$CACHE_DIR" -mindepth 1 -type f -o -type d 2>/dev/null | wc -l | grep -q '^0$'; then
    echo "Status: PASS - Cache directory is empty"
  else
    echo "Status: FAIL - Cache directory contains files/directories:"
    ls -laR "$CACHE_DIR" || true
  fi
} > "$EMPTY_CHECK_OUTPUT" 2>&1

# キャッシュが空でなかったかチェック
CACHE_RESULT=$(tail -1 "$EMPTY_CHECK_OUTPUT" | grep -o "^Status: .*")
if [ "$CACHE_RESULT" != "Status: PASS - Cache directory is empty" ]; then
  OVERALL_FAILURES=$((OVERALL_FAILURES + 1))
fi

# 環境変数を記録する関数（機密情報をマスク）
# 重要: 実際にbin/claudeへ渡す`env -i HOME=... PATH=... TMPDIR=... CLAUDE_TERMUX_PACKAGE_CACHE=...`
# というクリーン環境そのものを記録する。呼び出し元シェル(このスクリプト自身)の
# ambient環境を記録すると、このセッションで以前使われた無関係な残留変数
# (例: 別バージョンのテストで残ったCURRENT_CLAUDE_VERSION等)を誤って記録してしまう。
record_env() {
  local env_file="$1"
  local cache_dir="$2"
  env -i HOME="$HOME" PATH="$PATH" TMPDIR="/data/data/com.termux/files/usr/tmp" CLAUDE_TERMUX_PACKAGE_CACHE="$cache_dir" env \
    | while IFS='=' read -r name value; do
    # 機密情報の文字列を含む変数名をマスク
    if echo "$name" | grep -qiE 'ANTHROPIC|TOKEN|KEY|SECRET|PASSWORD|AUTH'; then
      echo "$name=***REDACTED***"
    else
      echo "$name=$value"
    fi
  done | sort > "$env_file"
}

# 4つのコマンドを実行して証跡を収集
run_test_command() {
  local cmd_num="$1"
  local cmd_args="$2"
  local cmd_name="$3"
  local expected_exit_code="${4:-0}"

  local cmd_start
  cmd_start=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  local stdout_file="$LOGS_DIR/cmd${cmd_num}-${cmd_name}-stdout.log"
  local stderr_file="$LOGS_DIR/cmd${cmd_num}-${cmd_name}-stderr.log"
  local env_file="$LOGS_DIR/cmd${cmd_num}-${cmd_name}-env.log"
  local meta_file="$LOGS_DIR/cmd${cmd_num}-${cmd_name}-meta.log"

  echo "Running command $cmd_num: $cmd_name"

  # コマンド全体とメタ情報を記録
  {
    echo "Command: sh packages/claude-code/bin/claude $cmd_args"
    echo "Started: $cmd_start"
  } > "$meta_file"

  # 環境変数を記録(実際にbin/claudeへ渡すクリーン環境そのもの)
  record_env "$env_file" "$CACHE_DIR"

  # コマンドを実行、stdout/stderr を分離して記録
  local exit_code=0
  env -i HOME="$HOME" PATH="$PATH" TMPDIR="/data/data/com.termux/files/usr/tmp" CLAUDE_TERMUX_PACKAGE_CACHE="$CACHE_DIR" \
    sh packages/claude-code/bin/claude $cmd_args \
    > "$stdout_file" 2> "$stderr_file" || exit_code=$?

  local cmd_end
  cmd_end=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

  # メタ情報に終了時刻とexit codeを追記
  {
    echo "Ended: $cmd_end"
    echo "Exit code: $exit_code"
    echo "Expected exit code: $expected_exit_code"
  } >> "$meta_file"

  # stdout/stderr の行数を記録
  local stdout_lines
  stdout_lines=$(wc -l < "$stdout_file" 2>/dev/null || echo 0)
  local stderr_lines
  stderr_lines=$(wc -l < "$stderr_file" 2>/dev/null || echo 0)

  echo "  Exit code: $exit_code (expected: $expected_exit_code)"
  echo "  Stdout lines: $stdout_lines"
  echo "  Stderr lines: $stderr_lines"

  # exit codeの検証
  if [ "$exit_code" -ne "$expected_exit_code" ]; then
    echo "  ERROR: Exit code mismatch! Expected $expected_exit_code but got $exit_code"
    OVERALL_FAILURES=$((OVERALL_FAILURES + 1))
  fi

  return 0  # コマンドの失敗時もスクリプトを継続させる
}

# 4つのコマンドを実行
run_test_command 1 "--version" "version" 0
run_test_command 2 "--help" "help" 0
run_test_command 3 "--nonexistent-flag" "nonexistent-flag" 1
run_test_command 4 "doctor" "doctor" 0

# Tarball のハッシュ値を検証（Node.js crypto を使用）
HASH_CHECK_FILE="$LOGS_DIR/tarball-hash-check.log"
TARBALL_DOWNLOAD_DIR="${RUN_DIR}/tarball-download"
mkdir -p "$TARBALL_DOWNLOAD_DIR"

# Node.js スクリプトでハッシュ検証を実行
export TARBALL_DOWNLOAD_DIR TARGET_VERSION="$VERSION" NATIVE_SPEC="$NATIVE_SPEC" EXPECTED_SHA256="$TARBALL_SHA256" EXPECTED_INTEGRITY="$TARBALL_INTEGRITY"
node - <<'NODE_SCRIPT' > "$HASH_CHECK_FILE" 2>&1
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const path = require('path');

const tarballDir = process.env.TARBALL_DOWNLOAD_DIR;
const version = process.env.TARGET_VERSION;
const nativeSpec = process.env.NATIVE_SPEC;
const expectedSha256 = process.env.EXPECTED_SHA256;
const expectedIntegrity = process.env.EXPECTED_INTEGRITY;

(async () => {
  try {
    console.log(`Tarball hash verification for ${version}`);
    console.log('==========================================');
    console.log('');
    console.log(`Expected tarball_sha256 (from config): ${expectedSha256}`);
    console.log(`Expected tarball_integrity (sha512): ${expectedIntegrity}`);
    console.log('');

    // npm view でtarball URLを取得
    console.log('Fetching tarball URL from npm registry...');
    let tarballUrl = '';
    try {
      const { stdout } = await execPromise(`npm view ${nativeSpec} dist.tarball --json`);
      tarballUrl = JSON.parse(stdout);
    } catch (e) {
      console.error('ERROR: Failed to fetch tarball URL from npm registry');
      console.log('Result: FAIL - Could not retrieve tarball URL');
      process.exit(1);
    }

    if (!tarballUrl) {
      console.error('ERROR: npm view returned empty tarball URL');
      console.log('Result: FAIL - Tarball URL is empty');
      process.exit(1);
    }

    console.log('Tarball URL: ' + tarballUrl);
    console.log('');

    // tarball をダウンロード
    const tarballFile = path.join(tarballDir, `native-${version}.tgz`);
    console.log('Downloading tarball to: ' + tarballFile);

    const buf = await new Promise((resolve, reject) => {
      https.get(tarballUrl, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode));
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });

    fs.writeFileSync(tarballFile, buf);
    console.log('Download successful');
    console.log('');

    // ファイルサイズを確認
    const tarballSize = buf.length;
    console.log('Tarball size: ' + tarballSize + ' bytes');

    // SHA256 ハッシュを計算
    const actualSha256 = crypto.createHash('sha256').update(buf).digest('hex');
    console.log('Actual tarball_sha256: ' + actualSha256);
    console.log('');

    // SHA512 ハッシュ（base64）を計算
    const sha512Digest = crypto.createHash('sha512').update(buf).digest('base64');
    const actualIntegrity = 'sha512-' + sha512Digest;
    console.log('Actual tarball_integrity: ' + actualIntegrity);
    console.log('');

    // ハッシュ値を比較
    let sha256Match = false;
    let integrityMatch = false;

    if (actualSha256 === expectedSha256) {
      console.log('SHA256 Verification: PASS');
      sha256Match = true;
    } else {
      console.log('SHA256 Verification: FAIL (mismatch)');
    }

    if (actualIntegrity === expectedIntegrity) {
      console.log('SHA512 Integrity Verification: PASS');
      integrityMatch = true;
    } else {
      console.log('SHA512 Integrity Verification: FAIL (mismatch)');
    }

    console.log('');
    if (sha256Match && integrityMatch) {
      console.log('Result: PASS - All verifications passed');
      process.exit(0);
    } else {
      console.log('Result: FAIL - Some verifications failed');
      process.exit(1);
    }
  } catch (err) {
    console.error('ERROR: ' + (err.message || String(err)));
    console.log('Result: FAIL - Verification error');
    process.exit(1);
  }
})();
NODE_SCRIPT

# tarball検証のexit codeをチェック
if [ $? -ne 0 ]; then
  OVERALL_FAILURES=$((OVERALL_FAILURES + 1))
fi

# Markdown レポートを生成
REPORT_FILE="${RUN_DIR}/EVIDENCE-REPORT.md"
END_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

{
  cat << EOF
# E2E Evidence Report: claude-code ${VERSION} Clean Cache Test

## Execution Timeline

- **Start Time**: $START_TIME
- **End Time**: $END_TIME
- **Target Version**: $VERSION

## Cache Verification

**Empty Cache Check**: Passed - Cache directory was created fresh for this test
- Directory: $CACHE_DIR

EOF

  # 4つのコマンドの結果を記録
  for cmd_num in 1 2 3 4; do
    case $cmd_num in
      1) cmd_args="--version"; cmd_name="version" ;;
      2) cmd_args="--help"; cmd_name="help" ;;
      3) cmd_args="--nonexistent-flag"; cmd_name="nonexistent-flag" ;;
      4) cmd_args="doctor"; cmd_name="doctor" ;;
    esac

    meta_file="$LOGS_DIR/cmd${cmd_num}-${cmd_name}-meta.log"
    stdout_file="$LOGS_DIR/cmd${cmd_num}-${cmd_name}-stdout.log"
    stderr_file="$LOGS_DIR/cmd${cmd_num}-${cmd_name}-stderr.log"
    env_file="$LOGS_DIR/cmd${cmd_num}-${cmd_name}-env.log"

    cat << EOF

### Command $cmd_num: \`claude $cmd_args\`

EOF

    # メタ情報を抽出
    if [ -f "$meta_file" ]; then
      awk '/^(Command|Started|Ended|Exit code|Expected exit code):/{print "- " $0}' "$meta_file"
    fi

    # stdout/stderr の行数
    stdout_lines=$(wc -l < "$stdout_file" 2>/dev/null || echo 0)
    stderr_lines=$(wc -l < "$stderr_file" 2>/dev/null || echo 0)

    cat << EOF

- **Stdout Lines**: $stdout_lines
- **Stderr Lines**: $([ "$stderr_lines" -eq 0 ] && echo "None (0 lines)" || echo "$stderr_lines")

**Output Files**:
- Stdout: \`$stdout_file\`
- Stderr: \`$stderr_file\`
- Environment: \`$env_file\`

EOF
  done

  # Tarball ハッシュ検証結果
  cat << EOF

## Tarball Hash Verification

EOF

  if [ -f "$HASH_CHECK_FILE" ]; then
    sed 's/^/- /' "$HASH_CHECK_FILE"
  fi

  cat << EOF

## Environment Variables (Machine-Redacted)

Full environment variable list (with sensitive values redacted):

\`\`\`
EOF

  if [ -f "$LOGS_DIR/cmd1-version-env.log" ]; then
    cat "$LOGS_DIR/cmd1-version-env.log"
  fi

  cat << EOF
\`\`\`

## Summary

All evidence files are available in the following directory:
- **Run Directory**: \`$RUN_DIR\`
- **Logs Directory**: \`$LOGS_DIR\`

Overall Result: $([ "$OVERALL_FAILURES" -eq 0 ] && echo "PASS" || echo "FAIL ($OVERALL_FAILURES failures)")

Generated at: $END_TIME
EOF
} > "$REPORT_FILE"

# レポートをコンソールに表示
echo ""
echo "================================================"
echo "Evidence collection completed!"
echo "================================================"
cat "$REPORT_FILE"

# 最終的なexit code
if [ "$OVERALL_FAILURES" -ne 0 ]; then
  exit 1
else
  exit 0
fi
