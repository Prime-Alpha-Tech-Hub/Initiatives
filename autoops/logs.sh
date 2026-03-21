#!/bin/bash
# AutoOps — Logs Viewer
# Usage:
#   ./logs.sh          # show all recent logs
#   ./logs.sh django   # Django server logs only
#   ./logs.sh celery   # Celery worker logs only
#   ./logs.sh db       # Automation run log from database
#   ./logs.sh -f       # Follow / tail all logs live

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"
LOG_DIR="$BACKEND/logs"
DJANGO_LOG="$LOG_DIR/django.log"
CELERY_LOG="$LOG_DIR/celery.log"

BLUE='\033[0;34m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
header() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

mkdir -p "$LOG_DIR"
MODE=${1:-all}

show_db_log() {
  header "Automation Run Log (last 30)"
  source "$BACKEND/venv/bin/activate" 2>/dev/null
  cd "$BACKEND"
  python3 - << 'PYEOF'
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django; django.setup()
from apps.core.models import AutomationRun

runs = AutomationRun.objects.order_by('-started_at')[:30]
if not runs:
    print("  No automation runs yet.")
else:
    C = {
        'success':'\033[0;32m','failed':'\033[0;31m',
        'running':'\033[0;34m','pending':'\033[1;33m','skipped':'\033[0;36m'
    }
    NC = '\033[0m'
    print(f"  {'Time':<20} {'Module':<14} {'Task':<28} {'Status':<10} Summary")
    print(f"  {'-'*20} {'-'*14} {'-'*28} {'-'*10} {'-'*30}")
    for r in runs:
        ts = r.started_at.strftime('%Y-%m-%d %H:%M:%S')
        s  = (r.summary or r.error or '—')[:48]
        c  = C.get(r.status,'')
        print(f"  {ts:<20} {r.module:<14} {r.task_name:<28} {c}{r.status:<10}{NC} {s}")
PYEOF
}

show_django_log() {
  header "Django Server Log"
  if [ -f "$DJANGO_LOG" ]; then
    tail -50 "$DJANGO_LOG"
  else
    echo -e "  ${YELLOW}No log yet. Start server with:${NC}"
    echo -e "  ./start.sh 2>&1 | tee $DJANGO_LOG"
  fi
}

show_celery_log() {
  header "Celery Worker Log"
  if [ -f "$CELERY_LOG" ]; then
    tail -50 "$CELERY_LOG"
  else
    echo -e "  ${YELLOW}No log yet. Start Celery with:${NC}"
    echo -e "  cd backend && source venv/bin/activate"
    echo -e "  celery -A config worker -B -l info 2>&1 | tee $CELERY_LOG"
  fi
}

follow_logs() {
  header "Following all logs (Ctrl+C to stop)"
  FILES=()
  [ -f "$DJANGO_LOG" ] && FILES+=("$DJANGO_LOG")
  [ -f "$CELERY_LOG" ] && FILES+=("$CELERY_LOG")
  if [ ${#FILES[@]} -eq 0 ]; then
    echo -e "  ${YELLOW}No log files yet. Start the server and Celery first, then re-run.${NC}"
    echo ""
    echo "  Terminal 1:  ./start.sh 2>&1 | tee $DJANGO_LOG"
    echo "  Terminal 2:  cd backend && source venv/bin/activate"
    echo "               celery -A config worker -B -l info 2>&1 | tee $CELERY_LOG"
    exit 1
  fi
  tail -f "${FILES[@]}"
}

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║          AutoOps — Log Viewer                ║"
echo "  ╚══════════════════════════════════════════════╝"

case "$MODE" in
  django)     show_django_log ;;
  celery)     show_celery_log ;;
  db)         show_db_log ;;
  -f|follow)  follow_logs ;;
  *)
    show_db_log
    show_django_log
    show_celery_log
    echo ""
    echo -e "  ${CYAN}Usage:${NC}  ./logs.sh [django|celery|db|-f]"
    echo ""
    ;;
esac
