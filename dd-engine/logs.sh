#!/bin/bash
# DD Engine — Logs Viewer
# Usage:
#   ./logs.sh          # show all logs
#   ./logs.sh docs     # document processing log
#   ./logs.sh analysis # analysis results log
#   ./logs.sh django   # Django server log
#   ./logs.sh -f       # follow logs live

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"
LOG_DIR="$BACKEND/logs"
DJANGO_LOG="$LOG_DIR/django.log"

BLUE='\033[0;34m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
RED='\033[0;31m'; AMBER='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
header() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

mkdir -p "$LOG_DIR"
MODE=${1:-all}

show_docs_log() {
  header "Documents (last 20)"
  source "$BACKEND/venv/bin/activate" 2>/dev/null
  cd "$BACKEND"
  python3 - << 'PYEOF'
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django; django.setup()
try:
    from apps.documents.models import DDDocument
    docs = DDDocument.objects.order_by('-created_at')[:20]
    if not docs:
        print("  No documents uploaded yet.")
    else:
        SC = {'uploaded':'\033[0;36m','queued':'\033[1;33m','processing':'\033[0;34m',
              'complete':'\033[0;32m','failed':'\033[0;31m'}
        NC = '\033[0m'
        print(f"  {'Time':<20} {'Title':<35} {'Type':<18} {'Status':<12} Pages")
        print(f"  {'-'*20} {'-'*35} {'-'*18} {'-'*12} {'-'*5}")
        for d in docs:
            ts    = d.created_at.strftime('%Y-%m-%d %H:%M:%S')
            title = d.title[:33]
            c     = SC.get(d.status,'')
            pages = str(d.page_count) if d.page_count else '—'
            print(f"  {ts:<20} {title:<35} {d.doc_type:<18} {c}{d.status:<12}{NC} {pages}")
except Exception as e:
    print(f"  Error: {e}")
    print("  Run: python3 manage.py migrate")
PYEOF
}

show_analysis_log() {
  header "Analysis Results (last 20)"
  source "$BACKEND/venv/bin/activate" 2>/dev/null
  cd "$BACKEND"
  python3 - << 'PYEOF'
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django; django.setup()
try:
    from apps.analysis.models import DDAnalysis
    analyses = DDAnalysis.objects.order_by('-created_at')[:20]
    if not analyses:
        print("  No analyses run yet.")
    else:
        SC = {'pending':'\033[1;33m','running':'\033[0;34m',
              'complete':'\033[0;32m','failed':'\033[0;31m'}
        NC = '\033[0m'
        print(f"  {'Time':<20} {'Document':<30} {'Type':<16} {'Status':<10} {'Tokens':>8} {'Duration':>10}")
        print(f"  {'-'*20} {'-'*30} {'-'*16} {'-'*10} {'-'*8} {'-'*10}")
        for a in analyses:
            ts    = a.created_at.strftime('%Y-%m-%d %H:%M:%S')
            doc   = a.document.title[:28]
            c     = SC.get(a.status,'')
            dur   = f"{a.duration_ms/1000:.1f}s" if a.duration_ms else '—'
            tok   = f"{a.tokens_used:,}" if a.tokens_used else '—'
            print(f"  {ts:<20} {doc:<30} {a.analysis_type:<16} {c}{a.status:<10}{NC} {tok:>8} {dur:>10}")
except Exception as e:
    print(f"  Error: {e}")
PYEOF
}

show_risk_flags() {
  header "Open Risk Flags"
  source "$BACKEND/venv/bin/activate" 2>/dev/null
  cd "$BACKEND"
  python3 - << 'PYEOF'
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django; django.setup()
try:
    from apps.analysis.models import RiskFlag
    flags = RiskFlag.objects.order_by('severity','category')[:30]
    if not flags:
        print("  No risk flags found.")
    else:
        SC = {'critical':'\033[0;31m','high':'\033[1;33m',
              'medium':'\033[0;34m','low':'\033[0;32m','info':'\033[0;36m'}
        NC = '\033[0m'
        print(f"  {'Severity':<10} {'Category':<14} {'Title':<40} Document")
        print(f"  {'-'*10} {'-'*14} {'-'*40} {'-'*25}")
        for f in flags:
            c   = SC.get(f.severity,'')
            doc = f.analysis.document.title[:23]
            print(f"  {c}{f.severity:<10}{NC} {f.category:<14} {f.title[:38]:<40} {doc}")
except Exception as e:
    print(f"  Error: {e}")
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
    echo -e "  ${YELLOW}No log file yet. Start server first:${NC}"
    echo -e "  ./start.sh 2>&1 | tee $DJANGO_LOG"
    exit 1
  fi
  tail -f "$DJANGO_LOG"
}

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║          DD Engine — Log Viewer              ║"
echo "  ╚══════════════════════════════════════════════╝"

case "$MODE" in
  docs|documents) show_docs_log ;;
  analysis)       show_analysis_log ;;
  risks)          show_risk_flags ;;
  django)         show_django_log ;;
  -f|follow)      follow_logs ;;
  *)
    show_docs_log
    show_analysis_log
    show_risk_flags
    show_django_log
    echo ""
    echo -e "  ${CYAN}Usage:${NC}  ./logs.sh [docs|analysis|risks|django|-f]"
    echo ""
    ;;
esac
