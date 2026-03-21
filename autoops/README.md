# AutoOps — Operational Automation Platform
**Initiative 13 of 15 · Prime Alpha Securities Technology Roadmap**

Eliminates manual process overhead across firm operations. Six automation
modules, each independently functional, all running on a single Django
backend with Celery for scheduled and async task execution.

---

## Quick Start

```bash
chmod +x start.sh
./start.sh              # runs on port 8082
./start.sh 9000         # custom port
```

Open `http://localhost:8082`

**For scheduled automation** (Celery), run in a separate terminal:
```bash
cd backend && source venv/bin/activate
celery -A config worker -B -l info
```

Redis is required for Celery. Install it:
```bash
# macOS
brew install redis && brew services start redis
# Ubuntu
sudo apt install redis-server && sudo systemctl start redis
```

---

## Six Automation Modules

| Module | What it automates |
|---|---|
| Document Processor | Ingests, classifies, and routes incoming documents automatically |
| KYC / AML Engine | Screens investors against sanctions lists and PEP databases |
| Compliance Monitor | Runs daily watchlist checks, flags expiring KYC, generates alerts |
| Transaction Recorder | Syncs bank feeds, auto-classifies transactions, posts to ledger |
| Email Workflows | Routes emails by rules, sends auto-replies, creates follow-up tasks |
| Data Pipelines | Scheduled ETL jobs with run history and failure tracking |

---

## Architecture

```
autoops/
├── backend/
│   ├── apps/
│   │   ├── core/           Automation run log (shared across all modules)
│   │   ├── documents/      Document ingestion and classification
│   │   ├── kyc/            KYC/AML screening engine
│   │   ├── compliance/     Watchlist and compliance alerts
│   │   ├── transactions/   Bank feeds and transaction recording
│   │   ├── email_workflows/Email routing rules and follow-up tasks
│   │   └── pipelines/      Scheduled data pipelines
│   └── config/             Django settings, Celery config, URLs
└── frontend/               React dashboard
```

---

## Scheduled Tasks (Celery Beat)

Once Celery is running, these tasks execute automatically:

| Task | Schedule |
|---|---|
| `documents.process_email_attachments` | Every 15 min |
| `kyc.refresh_expiring` | Daily |
| `compliance.run_watchlist_screen` | Daily |
| `compliance.check_kyc_completeness` | Daily |
| `transactions.auto_classify` | Every hour |
| `email.process_inbox` | Every 15 min |
| `email.send_followup_reminders` | Daily |
| `pipelines.run_all_due` | Every hour |

Configure schedule in Django admin → Periodic Tasks.

---

## API

| Endpoint | Description |
|---|---|
| `POST /auth/login/` | Get JWT tokens |
| `GET /api/documents/` | Incoming documents |
| `GET /api/kyc/` | KYC records |
| `POST /api/kyc/{id}/rescreen/` | Re-run KYC screening |
| `GET /api/compliance/alerts/` | Open compliance alerts |
| `GET /api/compliance/watchlist/` | Watchlist entries |
| `GET /api/transactions/transactions/` | Transaction ledger |
| `GET /api/transactions/feeds/` | Bank feed connections |
| `GET /api/email/rules/` | Email routing rules |
| `GET /api/pipelines/` | Data pipelines |
| `POST /api/pipelines/{id}/run_now/` | Trigger pipeline immediately |
| `GET /api/core/runs/dashboard/` | 7-day automation stats |

---

## Configuration (.env)

```bash
# Required
SECRET_KEY=your-secret-key
REDIS_URL=redis://localhost:6379/0

# Sanctions screening (optional — heuristics used if not set)
OPENSANCTIONS_API_KEY=your-key

# Email automation (optional)
RESEND_API_KEY=your-resend-key
IMAP_HOST=imap.gmail.com
IMAP_USER=your@email.com
IMAP_PASSWORD=your-app-password

# Integration with AlphaCore (optional)
ALPHACORE_API_URL=http://localhost:8080/api
```
