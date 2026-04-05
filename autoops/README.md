# AutoOps — Initiative 13/15
## Operational Automation & RPA Platform · Prime Alpha Securities

---

### Overview

AutoOps is the operational backbone of Prime Alpha Securities — a Python-based robotic process automation (RPA) and document intelligence platform. It handles KYC/AML workflows, document routing, scheduled data pipelines, and multi-language processing for OHADA-region documents.

**Status:** Built & Deployed  
**Stack:** Django REST + React/Vite + AWS Lambda + Textract + Translate  
**Port:** 8082 (default)

---

### Architecture

```
autoops/
├── backend/
│   ├── pipelines/      # Scheduled Lambda jobs, DLQ handlers
│   ├── kyc/            # KYC/AML workflow engine
│   ├── routing/        # Document classifier + deal router
│   ├── extraction/     # AWS Textract wrapper
│   └── translate/      # AWS Translate — EN/FR
├── frontend/
│   └── src/
│       ├── pages/      # Pipeline dashboard, KYC queue, routing log
│       └── components/
├── shared/             # DynamoDB helpers, S3 utilities
└── start.sh
```

---

### Quick Start

```bash
cd backend && pip install -r requirements.txt
cd ../frontend && npm install
chmod +x start.sh && ./start.sh
```

---

### Capabilities

#### Document Intelligence
AWS Textract extracts structured data from:
- Contracts and legal agreements
- Invoices and payment orders
- KYC identity documents
- Warehouse receipts and trade documents

Claude AI validates extraction results, classifies document type, and routes to the correct workflow.

#### KYC / AML Workflow
Automated onboarding pipeline:
1. Identity extraction via Textract
2. Watchlist check (configurable provider)
3. Risk score computation
4. Routing to compliance officer queue
5. Decision recorded to DynamoDB

#### Scheduled Pipelines
Lambda-based daily jobs:
- Portfolio position refresh (18:30 UTC)
- Covenant threshold monitoring
- FX exposure aggregation
- Performance metric calculation
- Dead Letter Queue (DLQ) on every Lambda

#### Document Routing
Inbound documents classified and routed:
- DOCX/PDF → type classification → strategy deal record
- Supports all 4 strategies (PE, Credit, RE, Commodities)
- Creates draft deal record in AlphaCore on match

#### Multi-language Processing
- AWS Translate for French/English document processing
- Full support for OHADA-region documents
- EN/FR bilingual output for all pipeline results

---

### Integration

AutoOps feeds into:
- **AlphaCore (01)** — creates deal records from routed documents
- **DD Engine (06)** — forwards documents for analysis
- **Data Warehouse (05)** — writes processed records to S3 Parquet

---

### Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
AWS_REGION=eu-west-2
# IAM role handles S3, DynamoDB, Textract, Translate — no hardcoded keys
```

---

*Prime Alpha Securities · Confidential · Initiative 13/15*
