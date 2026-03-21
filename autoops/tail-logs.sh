#!/bin/bash
# AutoOps — Log Monitor
# Usage:
#   ./tail-logs.sh          # watch all logs
#   ./tail-logs.sh errors   # errors only
#   ./tail-logs.sh celery   # celery tasks only
#   ./tail-logs.sh kyc      # KYC screening only

LOGS="$(dirname "$0")/backend/logs"

if [ ! -d "$LOGS" ]; then
  echo "No logs directory yet — start the server first: ./start.sh"
  exit 1
fi

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

case "${1:-all}" in
  errors)
    echo -e "${RED}=== Watching errors.log ===${NC}"
    tail -f "$LOGS/errors.log" 2>/dev/null || echo "No errors.log yet"
    ;;
  celery)
    echo -e "${BLUE}=== Watching celery.log ===${NC}"
    tail -f "$LOGS/celery.log" 2>/dev/null || echo "No celery.log yet"
    ;;
  kyc)
    echo -e "${GREEN}=== Watching kyc.log ===${NC}"
    tail -f "$LOGS/kyc.log" 2>/dev/null || echo "No kyc.log yet"
    ;;
  requests)
    echo -e "${YELLOW}=== Watching requests.log ===${NC}"
    tail -f "$LOGS/requests.log" 2>/dev/null || echo "No requests.log yet"
    ;;
  all|*)
    echo -e "${BLUE}=== Watching all logs (Ctrl+C to stop) ===${NC}"
    echo "Files: app.log | errors.log | celery.log | kyc.log"
    echo ""
    # Tail all log files simultaneously with labels
    tail -f \
      "$LOGS/app.log" \
      "$LOGS/errors.log" \
      "$LOGS/celery.log" \
      "$LOGS/kyc.log" \
      "$LOGS/requests.log" \
      2>/dev/null || echo "No log files yet — start the server first"
    ;;
esac
