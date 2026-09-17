#!/usr/bin/env bash
# EC2: run BOTH daily progress sends (two separate Zepto emails).
# - AWS PRODUCTION via localhost
# - Vercel TESTING via curl
# - Subject time = real wall-clock IST (no fake schedule stamp)
# - Bearer synced from .env every run; AWS 401 → pm2 reload env + retry once
# - AWS + Vercel started in parallel so neither waits on the other
set -euo pipefail

APP="${HOME}/internship-portal"
LOG_DIR="${HOME}/logs"
AWS_LOG="${LOG_DIR}/daily-progress-report.log"
VERCEL_LOG="${LOG_DIR}/vercel-daily-progress-report.log"
BEARER_FILE="${HOME}/vercel-cron-bearer.txt"
VERCEL_URL="${IP_VERCEL_DAILY_URL:-https://internship-portal-sigma-mauve.vercel.app/api/ip/cron/daily-progress-report}"

mkdir -p "$LOG_DIR"
cd "$APP"

# Sync Bearer from live .env every run (prevents auth drift)
python3 - <<'PY'
from pathlib import Path
secret = ""
for line in Path.home().joinpath("internship-portal/.env").read_text(encoding="utf-8", errors="replace").splitlines():
    s = line.strip()
    if s.startswith("IP_CRON_SECRET="):
        secret = s.split("=", 1)[1].strip().strip('"').strip("'")
        break
if len(secret) < 8:
    raise SystemExit("IP_CRON_SECRET missing/too short in .env")
p = Path.home() / "vercel-cron-bearer.txt"
p.write_text(secret, encoding="utf-8")
p.chmod(0o600)
print(f"BEARER_SYNCED_LEN={len(secret)}")
PY

# Only wait if app is down (normally instant)
for i in $(seq 1 60); do
  if curl -sS -m 2 -o /dev/null http://127.0.0.1:3000/api/auth/captcha; then
    echo "APP_READY after ${i}s" >>"$AWS_LOG"
    break
  fi
  sleep 1
done

run_aws() {
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) AWS start ===" >>"$AWS_LOG"
  set +e
  /usr/bin/node scripts/process-ip-daily-progress-report.mjs >>"$AWS_LOG" 2>&1
  aws_rc=$?
  set -e
  if [[ "$aws_rc" -ne 0 ]]; then
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) AWS fail rc=${aws_rc}; pm2 reload + retry ===" >>"$AWS_LOG"
    pm2 restart internsafar --update-env >>"$AWS_LOG" 2>&1 || true
    for i in $(seq 1 30); do
      curl -sS -m 2 -o /dev/null http://127.0.0.1:3000/api/auth/captcha && break
      sleep 1
    done
    set +e
    /usr/bin/node scripts/process-ip-daily-progress-report.mjs >>"$AWS_LOG" 2>&1
    aws_rc=$?
    set -e
  fi
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) AWS done rc=${aws_rc} ===" >>"$AWS_LOG"
  return "$aws_rc"
}

run_vercel() {
  TOKEN=$(tr -d '\r\n' < "$BEARER_FILE")
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) Vercel start ===" >>"$VERCEL_LOG"
  set +e
  /usr/bin/curl -sS -m 120 \
    -H "Authorization: Bearer ${TOKEN}" \
    "${VERCEL_URL}" \
    >>"$VERCEL_LOG" 2>&1
  vercel_rc=$?
  set -e
  echo "" >>"$VERCEL_LOG"
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) Vercel done rc=${vercel_rc} ===" >>"$VERCEL_LOG"
  return "$vercel_rc"
}

# Parallel: both start immediately after app-ready
run_aws &
aws_pid=$!
run_vercel &
vercel_pid=$!
aws_rc=0
vercel_rc=0
wait "$aws_pid" || aws_rc=$?
wait "$vercel_pid" || vercel_rc=$?

if [[ "$aws_rc" -ne 0 || "$vercel_rc" -ne 0 ]]; then
  exit 1
fi
exit 0
