# AlphaCore — Initiative 01/15
## Central Investment Data Platform · Prime Alpha Securities

---

### Overview

AlphaCore is the unified investment data platform for Prime Alpha Securities. It consolidates deal pipeline management, due diligence tracking, Investment Committee governance, portfolio monitoring, and document storage into a single, role-based application.

**Status:** Built & Deployed  
**Stack:** Django REST Framework + React 18 + Vite  
**Port:** 8080 (default)

---

### Architecture

```
alphacore/
├── backend/
│   ├── accounts/       # Auth: email/password + Google OAuth, roles
│   ├── deals/          # Deal pipeline — all 4 strategies
│   ├── diligence/      # DD workflow, document linkage
│   ├── ic/             # IC voting, quorum, audit trail
│   ├── portfolio/       # MOIC/IRR, covenant tracking, MTM
│   └── documents/      # Document vault, version control
├── frontend/
│   ├── src/
│   │   ├── pages/      # Dashboard, Deals, DD, IC, Portfolio, Docs
│   │   ├── components/ # Shared UI — Layout, Table, Modal, Charts
│   │   └── utils/      # api.js, auth hooks
│   └── vite.config.js
├── shared/             # Shared utilities, DynamoDB helpers
└── start.sh            # Boot script — backend + frontend
```

---

### Quick Start

```bash
# 1. Install dependencies
cd backend && pip install -r requirements.txt
cd ../frontend && npm install

# 2. Configure environment
cp backend/.env.example backend/.env
# Add: ANTHROPIC_API_KEY, AWS credentials (or IAM role), SECRET_KEY

# 3. Run
chmod +x start.sh && ./start.sh

# Backend runs on :8080, frontend proxied via Vite
```

---

### Core Modules

| Module | Description |
|--------|-------------|
| **Deal Pipeline** | Track PE, Credit, RE, Commodities deals through stages |
| **Due Diligence** | Document upload + DD Engine integration |
| **IC Workflow** | Quorum-based voting, memo versioning, audit trail |
| **Portfolio Monitor** | Real-time MOIC/IRR, covenant breach alerts |
| **Document Repository** | Encrypted vault, version control, access log |

---

### Authentication

- Email/password login with JWT tokens
- Google OAuth (one-click for team members)
- Role-based permissions: Admin, Analyst, IC Member, Read-only
- Onboarding wizard for new users

---

### Data

All business data stored in AWS DynamoDB (eu-west-2). Access via IAM role — no hardcoded credentials.

Relevant tables: `portfolios`, `documents`, `pe_companies`, `credit_application`, `real_estate`, `calendar`

---

### Integration

AlphaCore integrates with:
- **DD Engine (06)** — receives completed due diligence reports
- **AutoOps (13)** — receives routed documents and KYC data
- **IC Workflow (07)** — step function triggers from deal approval

---

*Prime Alpha Securities · Confidential · Initiative 01/15*
