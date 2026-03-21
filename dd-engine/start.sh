#!/bin/bash
# DD Engine — Start Script
set -e

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
step() { echo -e "\n${BLUE}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }

PORT=${1:-8081}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"
FRONTEND="$SCRIPT_DIR/frontend"

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   DD Engine — Automated Due Diligence  ✓    ║"
echo "  ║         Initiative 06 of 15                  ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

# Activate or create venv
if [ ! -d "$BACKEND/venv" ]; then
  step "Creating Python environment"
  python3 -m venv "$BACKEND/venv"
fi
source "$BACKEND/venv/bin/activate"

# Install deps
if ! python3 -c "import django" 2>/dev/null; then
  step "Installing Python dependencies"
  pip install -r "$BACKEND/requirements.txt" -q
  ok "Dependencies installed"
fi

# .env
if [ ! -f "$BACKEND/.env" ]; then
  cat > "$BACKEND/.env" << 'ENV'
SECRET_KEY=dd-engine-dev-key-change-in-production
DEBUG=True
ALLOWED_HOSTS=*
DATABASE_URL=sqlite:///dd_engine.sqlite3
ANTHROPIC_API_KEY=your-api-key-here
ALPHACORE_API_URL=http://localhost:8080/api
ENV
  echo -e "${GREEN}✓ .env created — add your ANTHROPIC_API_KEY${NC}"
fi

# Migrations
step "Running migrations"
cd "$BACKEND"
python3 manage.py makemigrations --noinput 2>&1 | tail -2
python3 manage.py migrate --noinput 2>&1 | tail -3
python3 manage.py setup_tables 2>&1 | tail -3
ok "Database + DynamoDB tables ready"

# Build frontend
step "Building frontend"
if ! command -v node &>/dev/null; then
  echo "Node.js not found — skipping frontend build"
else
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
echo "  ║  DD Engine running on port $PORT              ║"
printf  "  ║  App   →  http://localhost:%-16s║\n" "$PORT"
printf  "  ║  API   →  http://localhost:$PORT/api/          ║\n"
echo "  ╠══════════════════════════════════════════════╣"
echo "  ║  Set ANTHROPIC_API_KEY in backend/.env       ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

python3 manage.py runserver "0.0.0.0:$PORT"
