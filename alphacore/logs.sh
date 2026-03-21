#!/bin/bash
# AlphaCore — Logs Viewer
# Usage:
#   ./logs.sh          # show all recent logs
#   ./logs.sh django   # Django server logs only
#   ./logs.sh -f       # Follow / tail logs live

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"
LOG_DIR="$BACKEND/logs"
DJANGO_LOG="$LOG_DIR/django.log"

BLUE='\033[0;34m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
header() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

mkdir -p "$LOG_DIR"
MODE=${1:-all}

show_db_log() {
  header "Activity Log (last 30)"
  source "$BACKEND/venv/bin/activate" 2>/dev/null
  cd "$BACKEND"
  python3 - << 'PYEOF'
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django; django.setup()

from django.contrib.auth.models import User

try:
    from apps.core.models import ActivityLog
    logs = ActivityLog.objects.order_by('-created_at')[:30]
    if not logs:
        print("  No activity logs yet.")
    else:
        print(f"  {'Time':<20} {'User':<20} {'Action':<30} Entity")
        print(f"  {'-'*20} {'-'*20} {'-'*30} {'-'*20}")
        for l in logs:
            ts   = l.created_at.strftime('%Y-%m-%d %H:%M:%S')
            user = (l.user.get_full_name() or l.user.username) if l.user else 'system'
            ent  = f"{l.entity} #{l.entity_id}" if l.entity_id else l.entity or '—'
            print(f"  {ts:<20} {user:<20} {l.action:<30} {ent}")
except Exception as e:
    print(f"  Could not load logs: {e}")
    print("  Run migrations first: python3 manage.py migrate")
PYEOF
}

show_db_users() {
  header "Registered Users"
  source "$BACKEND/venv/bin/activate" 2>/dev/null
  cd "$BACKEND"
  python3 - << 'PYEOF'
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django; django.setup()
from django.contrib.auth.models import User
try:
    from apps.accounts.models import Membership
    users = User.objects.all().prefetch_related('memberships')
    if not users:
        print("  No users registered yet.")
    else:
        print(f"  {'Username':<25} {'Email':<30} {'Company':<25} {'Role'}")
        print(f"  {'-'*25} {'-'*30} {'-'*25} {'-'*15}")
        for u in users:
            m = u.memberships.filter(status='active').first()
            company = m.company.name if m else '—'
            role    = m.role.name if m and m.role else '—'
            print(f"  {u.username:<25} {u.email:<30} {company:<25} {role}")
except Exception as e:
    print(f"  Could not load users: {e}")
PYEOF
}

show_django_log() {
  header "Django Server Log"
  if [ -f "$DJANGO_LOG" ]; then
    tail -60 "$DJANGO_LOG"
  else
    echo -e "  ${YELLOW}No log file yet. Start server with:${NC}"
    echo -e "  ./start.sh 2>&1 | tee $DJANGO_LOG"
  fi
}

follow_logs() {
  header "Following logs (Ctrl+C to stop)"
  if [ ! -f "$DJANGO_LOG" ]; then
    echo -e "  ${YELLOW}No log files yet. Start the server first:${NC}"
    echo -e "  ./start.sh 2>&1 | tee $DJANGO_LOG"
    exit 1
  fi
  tail -f "$DJANGO_LOG"
}

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║          AlphaCore — Log Viewer              ║"
echo "  ╚══════════════════════════════════════════════╝"

case "$MODE" in
  django)     show_django_log ;;
  users)      show_db_users ;;
  -f|follow)  follow_logs ;;
  *)
    show_db_log
    show_db_users
    show_django_log
    echo ""
    echo -e "  ${CYAN}Usage:${NC}  ./logs.sh [django|users|-f]"
    echo ""
    ;;
esac
