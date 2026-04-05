# DD Engine — Initiative 06/15
## Automated Due Diligence System · Prime Alpha Securities

---

### What's in this package

```
dd-engine-complete/
├── backend/          Django REST API — document processing, AI analysis, reports
├── frontend/         React 18 + Vite frontend (production SPA)
├── standalone/       Self-contained HTML files — open in any browser, no server
├── desktop/          Electron native app — cross-platform desktop installer
├── start.sh          Boot script — starts backend + frontend together
├── logs.sh           Tail all service logs
├── INTEGRATION.md    How DD Engine connects to AlphaCore, AutoOps
└── .env.example      Environment variable template
```

---

### Three ways to run DD Engine

#### 1 — Standalone (fastest, no install)
```
Open standalone/documents.html in Chrome or Firefox.
No server. No install. Works from any folder, USB drive, or temp path.
All three pages are fully self-contained (everything inlined).
```

#### 2 — Electron Desktop App
```bash
cd desktop/
npm install
npm start                 # Run in development
npm run dist-win          # Build Windows .exe installer → dist/
npm run dist-mac          # Build macOS .dmg
npm run dist-linux        # Build Linux AppImage
```
The desktop app uses Electron IPC to persist reviews to a local JSON file
(in the OS user data directory) and exposes a native file picker.

#### 3 — Full Django + React Production App
```bash
# Install backend
cd backend/
pip install -r requirements.txt
cp .env.example .env       # Fill in ANTHROPIC_API_KEY, AWS config

# Install frontend
cd ../frontend/
npm install

# Start everything
cd ..
chmod +x start.sh && ./start.sh
# Backend: http://localhost:8081
# Frontend: proxied via Vite dev server
```

---

### Environment variables

```bash
# Required for AI analysis
ANTHROPIC_API_KEY=sk-ant-...

# AWS (use IAM role in production — no hardcoded keys)
AWS_REGION=eu-west-2
# S3 bucket for document storage (optional)
S3_BUCKET=pas-dd-engine-documents

# Django
SECRET_KEY=your-secret-key
DEBUG=False
ALLOWED_HOSTS=localhost,your-domain.com

# AlphaCore integration (optional)
ALPHACORE_URL=http://localhost:8080
ALPHACORE_TOKEN=your-token
```

---

### Standalone / Desktop Pages

#### ◆ Documents
- Opens with 6 pre-loaded sample DDs: CIM · Audit · Legal · Pitch Deck · Warehouse Receipt · Valuation
- Upload any file: PDF, DOCX, XLSX, TXT, CSV, PNG, JPG, WEBP
- Filter by document type (10 types)
- Analysis tabs: Classification · Financial · Legal · Risk · Summary · Commodity
- Commodity tab: exchange comparison table (AFEX, ECX, GCX, JSE) + viability factors
- PDF preview via lazy-loaded pdf.js
- Full Analysis → auto-saved to DD Reviews

#### ＋ New Intake
- 4 strategy forms: Private Equity · Private Credit · Commodities · Real Estate
- PE: EBITDA guard (prompts Credit strategy if EBITDA < $500K)
- Credit: internal PD/LGD/DSCR grading engine, required rate = Base + EL + IL + CX + 4%
- Commodities: cross-exchange pricing (AFEX, ECX, GCX, JSE), viability assessment
- RE: title, occupancy, IRR, FTZ compliance notes
- Attach financial document (PDF/DOCX/XLSX)
- Submit → AI analysis → results appear in Documents + DD Reviews

#### 📄 DD Reviews
- All DDs in one searchable view: seed samples + intake forms + document analyses
- Stats bar: total · avg risk · critical flags · this month · strategies
- Strategy filter pills: PE · Credit · Commodities · Real Estate
- Expandable cards: Summary · Risk Flags · Credit · Diligence Gaps · Commodity · Details
- Auto-refresh every 5 seconds — new submissions appear without reload
- Delete user reviews (sample reviews protected)

---

### Connect panel (top-right on all pages)

| Field | Purpose |
|-------|---------|
| Anthropic API key | `sk-ant-…` — enables live Claude AI analysis |
| AlphaCore URL | Sync reviews to the AlphaCore platform |
| DD Engine URL | This instance's URL (for external reference) |
| AutoOps URL | Operational automation integration |

Without an API key, all analysis uses the **LocalEngine** — a fully offline rule-based analyser built into each HTML file.

---

### Django Backend — Apps

| App | Description |
|-----|-------------|
| `documents` | Upload, extract text (PDF/DOCX/XLSX/TXT), S3 storage, DynamoDB metadata |
| `analysis` | Claude API integration, LocalEngine fallback, analysis result storage |
| `reports` | IC memo generation, S3 PDF export, report versioning |
| `core` | DynamoDB client, shared utilities, management commands |

---

### DynamoDB Tables used

- `documents` — doc_id (PK), strategy (SK), S3 key, analysis status
- `portfolios` — links DD results to live positions

---

### Integration with other initiatives

See `INTEGRATION.md` for full details.

- **AlphaCore (01)** — DD results flow into deal pipeline; document repository shared
- **AutoOps (13)** — Inbound routed documents arrive as intake submissions
- **IC Workflow (07)** — Completed DD triggers IC memo generation and voting

---

### Theme & Language

All three standalone/desktop pages support:
- **Dark / Light** mode toggle — preference saved to localStorage
- **EN / FR** language toggle — bilingual interface throughout

---

*Prime Alpha Securities · Confidential · Initiative 06/15*
