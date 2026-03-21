#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  AlphaCore — Start Script
#
#  Builds the React frontend and serves everything through Django.
#  One command, one port, one process.
#
#  Usage:
#    chmod +x start.sh
#    ./start.sh              # production mode (builds frontend first)
#    ./start.sh --dev        # dev mode (Django + Vite run separately)
#    ./start.sh --port 9000  # custom port (default: 8080)
# ═══════════════════════════════════════════════════════════════════════════

set -e

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step()  { echo -e "\n${BLUE}▶ $1${NC}"; }
ok()    { echo -e "${GREEN}✓ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }
error() { echo -e "${RED}✗ $1${NC}"; exit 1; }

# ── Parse arguments ───────────────────────────────────────────────────────────
DEV_MODE=false
PORT=8080

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --dev)   DEV_MODE=true ;;
    --port)  PORT="$2"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║         AlphaCore — Investment Platform      ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

# ── Check Python venv ─────────────────────────────────────────────────────────
step "Checking Python environment"

if [ ! -d "$BACKEND_DIR/venv" ]; then
  warn "No venv found — creating one"
  python3 -m venv "$BACKEND_DIR/venv"
fi

source "$BACKEND_DIR/venv/bin/activate"

# Check Django installed
if ! python3 -c "import django" 2>/dev/null; then
  step "Installing Python dependencies"
  pip install -r "$BACKEND_DIR/requirements.txt" -q
  ok "Dependencies installed"
else
  ok "Python environment ready"
fi

# ── Copy .env if missing ──────────────────────────────────────────────────────
if [ ! -f "$BACKEND_DIR/.env" ]; then
  warn ".env not found — copying from .env.example"
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  warn "Edit backend/.env before running in production!"
fi

# ── Run migrations ────────────────────────────────────────────────────────────
step "Running database migrations"
cd "$BACKEND_DIR"
python3 manage.py migrate --run-syncdb 2>&1 | tail -3
python3 manage.py setup_tables 2>&1 | tail -3
ok "Database + DynamoDB tables ready"

# ── Create staticfiles dir ────────────────────────────────────────────────────
mkdir -p "$BACKEND_DIR/staticfiles"
mkdir -p "$BACKEND_DIR/media"

# ── DEV MODE — run Django + Vite separately ───────────────────────────────────
if [ "$DEV_MODE" = true ]; then
  step "Starting in DEV mode"
  echo ""
  echo "  Django API  → http://localhost:$PORT"
  echo "  Vite UI     → http://localhost:5173"
  echo ""
  echo "  Press Ctrl+C to stop both servers"
  echo ""

  # Check Node
  if ! command -v node &>/dev/null; then
    error "Node.js not found. Install from nodejs.org"
  fi

  # Install frontend deps if needed
  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    step "Installing frontend dependencies"
    cd "$FRONTEND_DIR" && npm install -q
    ok "Frontend dependencies installed"
  fi

  # Update vite proxy to use correct port
  cd "$FRONTEND_DIR"

  # Start Django
  cd "$BACKEND_DIR"
  python3 manage.py runserver "0.0.0.0:$PORT" &
  DJANGO_PID=$!

  # Start Vite
  cd "$FRONTEND_DIR"
  npm run dev &
  VITE_PID=$!

  # Trap Ctrl+C to kill both
  trap "echo ''; echo 'Stopping...'; kill $DJANGO_PID $VITE_PID 2>/dev/null; exit 0" INT TERM

  wait $DJANGO_PID $VITE_PID
  exit 0
fi

# ── PRODUCTION MODE — build frontend, serve everything through Django ──────────
step "Building frontend"

if ! command -v node &>/dev/null; then
  error "Node.js not found. Install from nodejs.org"
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  step "Installing frontend dependencies"
  cd "$FRONTEND_DIR" && npm install -q
  ok "Frontend dependencies installed"
fi

cd "$FRONTEND_DIR"
npm run build 2>&1 | tail -5
ok "Frontend built → backend/staticfiles/frontend/"

# ── Collect static files ──────────────────────────────────────────────────────
step "Collecting static files"
cd "$BACKEND_DIR"
python3 manage.py collectstatic --noinput -v 0 2>/dev/null || true
ok "Static files collected"

# ── Update Django settings to serve the React app ────────────────────────────
# Django serves the React build via whitenoise + a catch-all view

# Add catch-all URL for React SPA if not already present
cd "$BACKEND_DIR"
python3 << 'PYEOF'
import os

urls_path = 'config/urls.py'
with open(urls_path) as f:
    content = f.read()

SPA_VIEW = """
from django.views.generic import TemplateView
from django.conf import settings
import os

def serve_spa(request, *args, **kwargs):
    \"\"\"Serve the React SPA for all non-API routes.\"\"\"
    from django.http import FileResponse, Http404
    spa_path = os.path.join(settings.BASE_DIR, 'staticfiles', 'frontend', 'index.html')
    if os.path.exists(spa_path):
        return FileResponse(open(spa_path, 'rb'), content_type='text/html')
    from django.http import HttpResponse
    return HttpResponse('<h2>Frontend not built. Run: ./start.sh</h2>', status=503)
"""

CATCH_ALL = "    path('', serve_spa),  # React SPA catch-all — must be last"

if 'serve_spa' not in content:
    # Add the view function before urlpatterns
    content = SPA_VIEW + content
    # Add catch-all as last URL pattern
    content = content.replace(
        "] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)",
        "    " + CATCH_ALL + "\n] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)"
    )
    with open(urls_path, 'w') as f:
        f.write(content)
    print('SPA catch-all route added')
else:
    print('SPA catch-all already present')
PYEOF

# ── Start server ──────────────────────────────────────────────────────────────
echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║         ALPHACORE IS RUNNING  ✓              ║"
echo "  ╠══════════════════════════════════════════════╣"
printf  "  ║  App    →  http://localhost:%-16s║\n" "$PORT"
printf  "  ║  Admin  →  http://localhost:$PORT/admin/        ║\n"
printf  "  ║  API    →  http://localhost:$PORT/api/          ║\n"
echo "  ╠══════════════════════════════════════════════╣"
echo "  ║  Press Ctrl+C to stop                        ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

cd "$BACKEND_DIR"
python3 manage.py runserver "0.0.0.0:$PORT"
