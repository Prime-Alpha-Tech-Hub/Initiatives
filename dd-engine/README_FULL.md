# DD Engine — Initiative 06/15
## Automated Due Diligence System · Prime Alpha Securities

---

### Overview

DD Engine is a standalone AI-powered due diligence platform. It processes financial documents (PDF, DOCX, XLSX, TXT, images), runs structured analysis via Claude AI, and stores results as searchable DD reviews. It ships as both a web application (three self-contained HTML files) and an Electron desktop app.

**Status:** Built — Web + Electron Native  
**AI Model:** claude-sonnet-4-20250514 (Anthropic)  
**Deployment:** File-based (no server required)

---

### Files

**Web version** (`dd-engine-web.zip`):
```
documents.html    # Main page — document library + analysis
intake.html       # New deal intake forms (4 strategies)
reviews.html      # All DD reviews — searchable, grouped
```

**Electron version** (`dd-engine-electron.zip`):
```
main.js           # Electron main process
preload.js        # Context bridge — IPC to renderer
package.json      # npm scripts: start, dist-win, dist-mac
renderer/
  documents.html
  intake.html
  reviews.html
  local-engine.js  # Offline analysis fallback (no API needed)
  shared.js        # Theme, language, connection, storage
```

---

### Quick Start — Web

```
1. Extract dd-engine-web.zip
2. Open documents.html in Chrome or Firefox
3. No server, no install — works from any folder
```

### Quick Start — Electron Desktop App

```bash
cd dd-engine-electron/
npm install
npm start          # Run in development
npm run dist-win   # Build Windows .exe installer
npm run dist-mac   # Build macOS .dmg
npm run dist-linux # Build Linux AppImage
```

---

### Pages

#### ◆ Documents
- 6 sample DDs pre-loaded: CIM, Audit, Legal, Pitch Deck, Warehouse Receipt, Valuation
- Upload any file: PDF, DOCX, XLSX, TXT, CSV, PNG, JPG
- Auto-detect document type from filename; reassign via dropdown
- Filter by type: Financial Model · CIM · Audit · Legal · Pitch Deck · Term Sheet · Mgmt Accounts · Warehouse Receipt · Valuation · Other
- Analysis tabs: Classification · Financial · Legal · Risk · Summary · Commodity
- PDF page preview (lazy-loaded via pdf.js CDN)
- Full Analysis → auto-saves to DD Reviews

#### ＋ New Intake
- Four strategy forms: Private Equity · Private Credit · Commodities · Real Estate
- PE: EBITDA guard (redirect to Credit if EBITDA < $500K)
- Credit: full PD/LGD/DSCR internal grading engine, required rate calculation
- Commodities: cross-exchange price comparison (AFEX, ECX, GCX, JSE), viability assessment
- Attach financial document (PDF, DOCX, XLSX)
- Submit → AI analysis → saved to Reviews + Documents

#### 📄 DD Reviews
- All reviews in one place — seeds + submitted forms + document analyses
- Stats bar: total DDs, avg risk score, critical flags, this month, strategies
- Strategy filter pills: PE · Credit · Commodities · RE
- Expandable cards with tabs: Summary · Risk Flags · Credit · Diligence Gaps · Commodity · Details
- Search across company, submitter, strategy, key
- Auto-refresh every 5 seconds
- Delete user reviews (sample reviews protected)

---

### Connect Panel

Click **Connect** (top-right) to add:
- **Anthropic API key** (`sk-ant-…`) — enables live AI analysis
- **AlphaCore URL** — syncs reviews to AlphaCore platform
- **DD Engine URL / AutoOps URL** — future integration endpoints

Without an API key, the app uses the offline **LocalEngine** for analysis.

---

### Theme & Language

- **Dark/Light** toggle — persists across all three pages
- **EN/FR** toggle — bilingual interface

---

### Commodity Analysis

When a commodity submission is processed, the AI generates:
- Submitted price vs reference price (% delta)
- Cross-exchange comparison: AFEX Nigeria · ECX Ethiopia · GCX Ghana · JSE South Africa
- Viability assessment checklist (price, grade, warehouse, FX, moisture, counterparty)
- Viability verdict paragraph

---

### Storage

- **Web:** localStorage (persists in the same browser)
- **Electron:** Electron IPC → local JSON file in `userData` directory

---

*Prime Alpha Securities · Confidential · Initiative 06/15*
