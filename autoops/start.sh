#!/bin/bash
# AutoOps — Start Script
set -e

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
step() { echo -e "\n${BLUE}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

PORT=${1:-8082}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"
FRONTEND="$SCRIPT_DIR/frontend"

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║  AutoOps — Operational Automation Platform   ║"
echo "  ║         Initiative 13 of 15                  ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

# Python env
if [ ! -d "$BACKEND/venv" ]; then
  step "Creating Python environment"
  python3 -m venv "$BACKEND/venv"
fi
source "$BACKEND/venv/bin/activate"

if ! python3 -c "import django" 2>/dev/null; then
  step "Installing dependencies"
  pip install -r "$BACKEND/requirements.txt" -q
  ok "Dependencies installed"
fi

# .env
if [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  warn ".env created — edit to add credentials"
fi

# Migrations
step "Migrating database"
cd "$BACKEND"
python3 manage.py makemigrations --noinput 2>&1 | tail -2
python3 manage.py migrate --noinput 2>&1 | tail -3
python3 manage.py setup_tables 2>&1 | tail -3
ok "Database + DynamoDB tables ready"

# Frontend
if command -v node &>/dev/null; then
  step "Building frontend"
  if [ ! -d "$FRONTEND/node_modules" ]; then
    cd "$FRONTEND" && npm install -q
  fi
  cd "$FRONTEND" && npm run build 2>&1 | tail -3
  ok "Frontend built"
fi

mkdir -p "$BACKEND/staticfiles" "$BACKEND/media"
cd "$BACKEND"
python3 manage.py collectstatic --noinput -v 0 2>/dev/null || true

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║         AutoOps RUNNING  ✓                   ║"
printf  "  ║  App   →  http://localhost:%-16s║\n" "$PORT"
printf  "  ║  API   →  http://localhost:$PORT/api/          ║\n"
printf  "  ║  Admin →  http://localhost:$PORT/admin/        ║\n"
echo "  ╠══════════════════════════════════════════════╣"
echo "  ║  Logs →  backend/logs/                       ║"
echo "  ║    app.log      all activity                 ║"
echo "  ║    errors.log   errors only                  ║"
echo "  ║    celery.log   scheduled tasks              ║"
echo "  ║    kyc.log      KYC/AML screening            ║"
echo "  ║    requests.log HTTP requests                ║"
echo "  ╠══════════════════════════════════════════════╣"
echo "  ║  For scheduled tasks, run in another terminal:║"
echo "  ║  celery -A config worker -B -l info           ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""
echo "  Browse to: http://localhost:$PORT"
echo "  (not http://0.0.0.0:$PORT — that is the bind address)"
echo ""
echo "  → Open in browser: http://localhost:$PORT"
echo ""

python3 manage.py runserver "0.0.0.0:$PORT"
