# DD Engine — Automated Due Diligence System
**Initiative 06 of 15 · Prime Alpha Securities Technology Roadmap**

AI-powered document analysis and risk assessment. Upload deal documents — 
DD Engine extracts financial data, identifies risks, analyses legal terms, 
and produces IC-ready summaries automatically.

---

## Quick Start

```bash
chmod +x start.sh
./start.sh              # runs on port 8081
./start.sh 9000         # custom port
```

Then open `http://localhost:8081`

**Required:** Add your Anthropic API key to `backend/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```
Get one at: console.anthropic.com

---

## What it does

| Capability | Description |
|---|---|
| Document Upload | PDF, DOCX, XLSX, TXT — auto text extraction |
| Classification | Identifies document type, company, period, data quality |
| Financial Analysis | Revenue, EBITDA, debt, ratios, multi-year history |
| Legal Analysis | Parties, key terms, obligations, risk provisions |
| Risk Assessment | Score 1-10, categorised flags with mitigations |
| Executive Summary | IC memo-ready summary with highlights and next steps |
| Full Analysis | All of the above in one click |

---

## Architecture

```
dd-engine/
├── backend/                Django REST API
│   ├── apps/
│   │   ├── documents/      Upload, extract text, manage files
│   │   ├── analysis/       Claude AI engine (6 analysis types)
│   │   ├── reports/        DD package compiler per deal
│   │   └── core/           Shared utilities
│   └── config/             Settings, URLs, WSGI
└── frontend/               React UI
    └── src/App.jsx          Upload zone, document list, results panels
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login/` | Get JWT tokens |
| GET  | `/api/documents/` | List all documents |
| POST | `/api/documents/` | Upload document (multipart) |
| POST | `/api/analysis/run/` | Trigger AI analysis |
| GET  | `/api/analysis/{id}/poll/` | Poll analysis status |
| GET  | `/api/analysis/by_document/?document_id=` | All analyses for a doc |
| GET  | `/api/reports/` | List DD reports |
| POST | `/api/reports/{id}/compile/` | Compile report from all docs |
| GET  | `/api/reports/{id}/ic_memo_data/` | Export for AlphaCore IC memo |

---

## Integration with AlphaCore (Initiative 01)

The `/api/reports/{id}/ic_memo_data/` endpoint returns structured JSON
that AlphaCore can consume to pre-fill an IC memo:

```bash
curl http://localhost:8081/api/reports/1/ic_memo_data/ \
  -H "Authorization: Bearer <token>"
```

Set `ALPHACORE_API_URL=http://localhost:8080/api` in `.env` to enable 
direct push to AlphaCore deal records.

---

## Database

Defaults to SQLite. Change `DATABASE_URL` in `.env` for production:
```
DATABASE_URL=postgres://user:pass@localhost:5432/dd_engine
```
