# AlphaCore — Central Investment Data Platform

**Initiative 01 of 15 · Prime Alpha Securities Technology Roadmap**

A standalone SaaS platform for investment firms. Single-tenant — each client
gets their own isolated instance. Five modules built on Django + React.

---

## Modules

| Module | Description |
|---|---|
| Deal Pipeline | Kanban board across PE, Private Credit, Commodities, Real Estate |
| Due Diligence | Auto-generated checklists per strategy, findings tracker |
| IC Workflow | Memo submission, voting, approval with full audit trail |
| Portfolio Monitoring | Live NAV, MOIC, performance history per position |
| Document Repository | Upload, version, permission-control all firm documents |

---

## Quick Start (Development)

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies (SQLite is the default — no extra config needed)
pip install -r requirements.txt

# Copy env file (default uses SQLite — works out of the box)
cp .env.example .env

# Run migrations and create your admin user
python3 manage.py migrate
python3 manage.py createsuperuser
python3 manage.py runserver
```

> **MySQL users only:** before running `pip install`, first install system libs:
> ```bash
> # Ubuntu/Debian
> sudo apt install python3-dev default-libmysqlclient-dev build-essential pkg-config
> # macOS
> brew install mysql-client pkg-config
> ```
> Then uncomment `mysqlclient==2.2.4` in `requirements.txt`.

Backend runs at: http://localhost:8000
Admin panel:     http://localhost:8000/admin

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:5173

---

## Database Configuration

Set `DATABASE_URL` in `.env` — no code changes needed:

```bash
# SQLite (development — default)
DATABASE_URL=sqlite:///db.sqlite3

# PostgreSQL (production recommended)
DATABASE_URL=postgres://user:password@localhost:5432/alphacore

# MySQL
DATABASE_URL=mysql://user:password@localhost:3306/alphacore
```

---

## Deploying for a New Client (SaaS)

Each client = one server + one database. Steps:

1. Clone the repo onto the client's server (or a new EC2 instance)
2. Set `.env` with client's `DATABASE_URL`, `FIRM_NAME`, `FIRM_DOMAIN`
3. Run `python manage.py migrate && python manage.py createsuperuser`
4. Build frontend: `cd frontend && npm run build`
5. Serve with gunicorn + nginx (or behind existing ALB)

---

## Embedding in PAS Worker Portal

The AlphaCore frontend can be embedded in the existing PAS website
worker portal via iframe or by linking to the standalone instance:

```javascript
// In PAS App.jsx worker portal — add a new tab:
{ key: 'alphacore', label: 'Investment Platform', icon: '⬡' }

// Render as iframe:
<iframe src="https://platform.primealphasecurities.com" 
        style={{ width:'100%', height:'100%', border:'none' }} />
```

Or expose the AlphaCore API to the PAS backend and render data natively.

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `POST /api/auth/login/` | Get JWT tokens |
| `GET /api/deals/` | List deals with filters |
| `POST /api/deals/` | Create deal |
| `POST /api/deals/{id}/advance_stage/` | Move deal stage |
| `POST /api/diligence/checklists/create_from_deal/` | Auto-create DD checklist |
| `GET /api/committee/memos/` | List IC memos |
| `POST /api/committee/memos/{id}/cast_vote/` | Vote on memo |
| `GET /api/portfolio/positions/summary/` | Firm-level portfolio summary |
| `POST /api/documents/` | Upload document |

Full REST API with filtering, search, ordering on all endpoints.

---

## Tech Stack

- **Backend:** Django 4.2, Django REST Framework, SimpleJWT
- **Database:** Configurable via `DATABASE_URL` (SQLite / PostgreSQL / MySQL)
- **Frontend:** React 18, Vite 5, Zustand, Recharts, Axios
- **Auth:** JWT (8-hour access tokens, 7-day refresh)
- **Storage:** Local filesystem (swap to S3 by overriding `DEFAULT_FILE_STORAGE`)

---

## Roadmap

This is Initiative 01. Built to extend with:

- **Initiative 02** — Deal Flow Intelligence (automated sourcing)
- **Initiative 06** — AI Due Diligence (LLM document analysis)
- **Initiative 07** — Digital IC Workflow (already partially here)
- **Initiative 08** — Automated Investor Reporting
- **Initiative 09** — Risk Analytics Platform
