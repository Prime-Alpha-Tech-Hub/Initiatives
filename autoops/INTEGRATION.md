# PAS SaaS Suite — Integration Guide

**Prime Alpha Securities · Alternative Investment Fund Manager · African Markets**

---

## Overview

Every initiative in the PAS Technology Suite is a **self-contained, standalone product**. Each runs on its own port, has its own database, its own authentication, and its own URL prefix. A client can buy and run any single app with zero dependency on the others.

When a client holds more than one app, they can be **connected at will** by setting environment variables. No code changes. No redeployment. No migrations. Set the peer URL and a shared API key in `.env`, restart the app, and the integration is live.

When a peer URL is blank, every outbound call silently skips. No errors. No logs beyond a debug note. The app behaves exactly as it did standalone.

---

## App Registry

| App | Port | URL Prefix | Purpose |
|---|---|---|---|
| AlphaCore | 8080 | `/alphacore/` | Central investment data platform — deals, IC workflow, portfolio |
| DD Engine | 8081 | `/dd/` | Automated due diligence — document analysis, risk scoring, IC memo |
| AutoOps | 8082 | `/ao/` | Operational automation — KYC/AML, compliance, transaction recording |

Future initiatives follow the same pattern: own port, own prefix starting at `8083`, same integration contract.

---

## Architecture Principles

### Standalone by default
Every `INTEGRATION_API_KEY`, `*_URL`, and `*_API_KEY` setting defaults to blank. Blank = disabled. A client running only DD Engine sees zero integration code run.

### Fire-and-forget
Every outbound call runs in a **background thread**. The user's HTTP request completes immediately regardless of whether the peer responds. A peer being down never causes a 500 in the calling app.

### One retry, then log
If a peer call fails with a network error, the client retries once after a 5-second timeout. On second failure it logs a warning and moves on. Nothing is lost from the calling app's perspective.

### Shared API key authentication
Every inbound endpoint checks the `X-PAS-Key` header against `settings.INTEGRATION_API_KEY`. If the key is not configured, the endpoint is open (development mode). In production, set the same `INTEGRATION_API_KEY` value across all connected apps.

### Files involved (per app)

```
apps/{module}/integration_client.py   # shared HTTP client — same in all apps
apps/{module}/integration.py          # outbound calls this app makes to peers
apps/{module}/integration_views.py    # inbound endpoints this app exposes
```

---

## The Five Integration Points

### 1 · DD Engine → AlphaCore
**Trigger:** A DD report is marked complete.  
**What happens:** DD Engine posts the completed IC memo fields to the linked AlphaCore deal. The analyst opens the deal in AlphaCore and finds the risk score, grade, PD/LGD, required rate, risk flags, and summary already populated. No re-entry.

**Outbound function (DD Engine):**
```python
from apps.reports.integration import push_report_to_alphacore
push_report_to_alphacore(report)
```

**Inbound endpoint (AlphaCore):**
```
POST /alphacore/api/deals/{deal_id}/dd_import/
```

**Payload sent:**
```json
{
  "source": "dd_engine",
  "dd_report_id": "uuid",
  "deal_name": "Acme Manufacturing SA",
  "borrower": "Jean-Baptiste Kamga",
  "strategy": "credit",
  "overall_risk_score": 6,
  "overall_risk_level": "medium",
  "recommendation": "proceed_with_caution",
  "risk_flags": [{"severity": "high", "title": "...", "detail": "..."}],
  "summary": "3-4 sentence IC summary",
  "diligence_gaps": ["Audited accounts for FY2024 not yet provided"],
  "grade": 5,
  "pd": 0.10,
  "lgd": 0.55,
  "expected_loss": 5.5,
  "required_rate": 17.25,
  "structure": "Senior Secured / Unitranche"
}
```

**Prerequisite:** The DD report must have `alphacore_deal_id` set. This is populated automatically if AlphaCore pushed the deal context first (see Integration 3).

---

### 2 · DD Engine → AutoOps
**Trigger:** A new borrower or counterparty is submitted via the DD intake form.  
**What happens:** DD Engine sends an async KYC screen request to AutoOps. AutoOps runs OpenSanctions and SCUML checks, then posts the result back to DD Engine via the callback URL.

**Outbound function (DD Engine):**
```python
from apps.reports.integration import request_kyc_screen
request_kyc_screen(
    entity_name="Acme Manufacturing SA",
    entity_type="business",
    country="Cameroon",
    directors=["Jean-Baptiste Kamga"],
    reference_id="report_uuid"
)
```

**Inbound endpoint (AutoOps):**
```
POST /ao/api/kyc/screen/
```

**Callback to DD Engine (AutoOps posts back):**
```
POST /dd/api/documents/kyc_result/
```

**Callback payload:**
```json
{
  "source": "autoops",
  "reference_id": "report_uuid",
  "kyc_status": "clear|flagged|rejected",
  "detail": "No matches on OpenSanctions. SCUML check passed.",
  "flags": []
}
```

---

### 3 · AlphaCore → DD Engine
**Trigger:** A new deal is created in the AlphaCore pipeline.  
**What happens:** AlphaCore sends deal context to DD Engine so that when the analyst uploads documents in DD Engine, they can select the deal from a populated list rather than typing it manually. Reports generated in DD Engine link back to the AlphaCore deal ID.

**Outbound function (AlphaCore):**
```python
from apps.core.integration import push_deal_to_dd_engine
push_deal_to_dd_engine(deal)
```

**Inbound endpoint (DD Engine):**
```
POST /dd/api/documents/deal_context/
```

**Payload sent:**
```json
{
  "source": "alphacore",
  "deal_id": "uuid",
  "deal_name": "Acme Manufacturing SA — Series B",
  "strategy": "private_equity",
  "company_name": "Acme Manufacturing SA",
  "stage": "due_diligence",
  "currency": "USD"
}
```

---

### 4 · AlphaCore → AutoOps
**Trigger:** A new LP or investor is added to the AlphaCore CRM.  
**What happens:** AlphaCore requests full KYC onboarding from AutoOps. AutoOps runs the complete onboarding workflow — SCUML registration check, OpenSanctions screening, adverse media — and posts the result back to AlphaCore. The investor record is automatically updated with KYC status.

**Outbound function (AlphaCore):**
```python
from apps.core.integration import push_investor_to_autoops
push_investor_to_autoops(investor)
```

**Inbound endpoint (AutoOps):**
```
POST /ao/api/kyc/onboard/
```

**Callback to AlphaCore (AutoOps posts back):**
```
POST /alphacore/api/core/compliance_event/
```

**Callback payload:**
```json
{
  "source": "autoops",
  "entity_id": "investor_uuid",
  "entity_type": "investor",
  "alert_type": "kyc_onboarding_complete",
  "severity": "low",
  "detail": "KYC passed. No sanctions matches. SCUML compliant.",
  "kyc_status": "clear"
}
```

---

### 5 · AutoOps → AlphaCore
**Trigger:** AutoOps raises a compliance alert — watchlist hit, KYC status change, covenant breach, or regulatory filing issue.  
**What happens:** AutoOps posts the event to AlphaCore. If severity is `critical` or `high`, AlphaCore flags the deal or investor record and logs the event. The portfolio manager sees the flag on their next login.

**Outbound function (AutoOps):**
```python
from apps.kyc.integration import push_compliance_event
push_compliance_event(
    entity_id="deal_or_investor_uuid",
    entity_type="deal|investor|counterparty",
    alert_type="watchlist_hit|kyc_failed|covenant_breach|regulatory",
    severity="critical|high|medium|low",
    detail="Entity appeared on OFAC SDN list. Immediate review required.",
    source_ref="autoops_alert_id"
)
```

**Inbound endpoint (AlphaCore):**
```
POST /alphacore/api/core/compliance_event/
```

**Payload:**
```json
{
  "source": "autoops",
  "entity_id": "uuid",
  "entity_type": "investor",
  "alert_type": "watchlist_hit",
  "severity": "critical",
  "detail": "Entity appeared on OFAC SDN list.",
  "source_ref": "ao_alert_id"
}
```

---

## Configuration

### Step 1 — Generate a shared API key

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
# Example output: 7f3a9c2e1b4d8f6a0e5c3b7d2a9f1e4c...
```

Use the **same value** as `INTEGRATION_API_KEY` in every `.env` you want to connect.

---

### Step 2 — Set environment variables

**AlphaCore `.env`:**
```env
INTEGRATION_API_KEY=your-shared-key-here

# Connect DD Engine (leave blank to disable)
DD_ENGINE_URL=http://localhost:8081
DD_ENGINE_API_KEY=your-shared-key-here

# Connect AutoOps (leave blank to disable)
AUTOOPS_URL=http://localhost:8082
AUTOOPS_API_KEY=your-shared-key-here
```

**DD Engine `.env`:**
```env
INTEGRATION_API_KEY=your-shared-key-here

# Connect AlphaCore (leave blank to disable)
ALPHACORE_URL=http://localhost:8080
ALPHACORE_API_KEY=your-shared-key-here

# Connect AutoOps (leave blank to disable)
AUTOOPS_URL=http://localhost:8082
AUTOOPS_API_KEY=your-shared-key-here

# Required for callback routing
DD_ENGINE_URL=http://localhost:8081
```

**AutoOps `.env`:**
```env
INTEGRATION_API_KEY=your-shared-key-here

# Connect AlphaCore (leave blank to disable)
ALPHACORE_URL=http://localhost:8080
ALPHACORE_API_KEY=your-shared-key-here

# Connect DD Engine (leave blank to disable)
DD_ENGINE_URL=http://localhost:8081
DD_ENGINE_API_KEY=your-shared-key-here
```

### Step 3 — Restart the apps

No migrations. No code changes. The settings are read at startup.

```bash
# Each app — restart Django
./start.sh
```

---

## Testing the Integration

### Verify connectivity between two apps

```bash
# From the host running AlphaCore, test that DD Engine is reachable
curl -X POST http://localhost:8081/dd/api/documents/deal_context/ \
  -H "Content-Type: application/json" \
  -H "X-PAS-Key: your-shared-key-here" \
  -d '{"deal_id":"test-001","deal_name":"Test Deal","strategy":"pe","company_name":"Test Co","stage":"screening","currency":"USD"}'

# Expected response
{"status": "stored", "deal_id": "test-001"}
```

### Test the full DD → AlphaCore flow

```bash
# 1. Create a deal in AlphaCore
curl -X POST http://localhost:8080/alphacore/api/deals/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme PE Deal","strategy":"private_equity","company_name":"Acme SA"}'

# 2. AlphaCore automatically pushes deal context to DD Engine (check logs)
# grep "AlphaCore→DD" alphacore/logs/django.log

# 3. Upload a document in DD Engine and select the deal from the dropdown
# 4. Mark the report complete — DD Engine pushes to AlphaCore
# grep "DD→AlphaCore" dd-engine/logs/django.log

# 5. Check the deal in AlphaCore — dd_risk_score, dd_recommendation fields populated
curl http://localhost:8080/alphacore/api/deals/<deal_id>/ \
  -H "Authorization: Bearer <token>"
```

### Check integration logs

Every integration call is logged at `INFO` level with a `[App→Peer]` prefix:

```bash
# AlphaCore outbound
grep "\[AlphaCore→" logs/django.log

# DD Engine outbound
grep "\[DD→" logs/django.log

# AutoOps outbound
grep "\[AutoOps→" logs/django.log

# Inbound received by AlphaCore
grep "\[AlphaCore inbound\]" logs/django.log

# Inbound received by DD Engine
grep "\[DD inbound\]" logs/django.log

# Inbound received by AutoOps
grep "\[AutoOps inbound\]" logs/django.log
```

---

## Production Deployment

When deploying behind a reverse proxy or on separate EC2 instances, replace `localhost` with the actual hostname or internal IP:

```env
# Example: apps on separate EC2 instances in the same VPC
ALPHACORE_URL=http://10.0.1.10:8080
DD_ENGINE_URL=http://10.0.1.11:8081
AUTOOPS_URL=http://10.0.1.12:8082
```

Use **internal IP addresses** within the same VPC — do not route integration traffic over the public internet.

If all three apps run on the same EC2 instance:
```env
ALPHACORE_URL=http://127.0.0.1:8080
DD_ENGINE_URL=http://127.0.0.1:8081
AUTOOPS_URL=http://127.0.0.1:8082
```

---

## Adding Integration to Future Initiatives

Every new initiative follows the same contract. When coding a new app:

**1. Copy `integration_client.py`** into the app's primary Django app package.

**2. Create `integration.py`** — outbound functions only. One function per integration point. All fire-and-forget via `_fire()`.

**3. Create `integration_views.py`** — inbound endpoints only. Decorated with `@csrf_exempt` and `@require_POST`. Always check `_auth(request)` first. Always return `JsonResponse` within a `try/except`.

**4. Wire inbound URLs** in the app's `urls.py`. Pattern: `path('integration_action/', view_fn, name='...')`.

**5. Add to `.env.example`:**
```env
# ── Integration settings (leave blank for standalone mode) ──────────────────
INTEGRATION_API_KEY=
ALPHACORE_URL=
ALPHACORE_API_KEY=
DD_ENGINE_URL=
DD_ENGINE_API_KEY=
AUTOOPS_URL=
AUTOOPS_API_KEY=
NEW_APP_URL=
NEW_APP_API_KEY=
```

**6. Add to `settings.py`:**
```python
# ── Integration peers (blank = standalone) ───────────────────────────────────
INTEGRATION_API_KEY = config('INTEGRATION_API_KEY', default='')
ALPHACORE_URL       = config('ALPHACORE_URL',  default='')
ALPHACORE_API_KEY   = config('ALPHACORE_API_KEY', default='')
# ... one line per peer
```

**7. Document the new integration point** in this file under a new numbered section following the same format: trigger, outbound function, inbound endpoint, payload, expected response.

---

## Integration Map (Current State)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PAS Technology Suite                         │
│                  Prime Alpha Securities                         │
└─────────────────────────────────────────────────────────────────┘

  AlphaCore (:8080)          DD Engine (:8081)
  /alphacore/                /dd/
  ┌──────────────┐           ┌──────────────┐
  │              │──[3]──→  │              │
  │              │←──[1]── │              │──[2]──→ ┐
  │              │           │              │←──[2cb]─┤
  │              │           └──────────────┘         │
  │              │                                     │
  │              │──[4]──→ ┌──────────────┐           │
  │              │←──[4cb]─│   AutoOps    │ (:8082)   │
  │              │←──[5]── │   /ao/       │←──────────┘
  └──────────────┘          └──────────────┘

  [1]   DD Engine  →  AlphaCore  : DD report → IC memo pre-fill
  [2]   DD Engine  →  AutoOps    : KYC screen request
  [2cb] AutoOps    →  DD Engine  : KYC screen result (callback)
  [3]   AlphaCore  →  DD Engine  : New deal context
  [4]   AlphaCore  →  AutoOps    : New investor KYC onboarding
  [4cb] AutoOps    →  AlphaCore  : Onboarding result (callback)
  [5]   AutoOps    →  AlphaCore  : Compliance alert / status change

  All arrows are optional. Blank URL = arrow disabled.
  All calls fire-and-forget in a background thread.
  All inbound endpoints protected by X-PAS-Key header.
```

---

*Prime Alpha Securities · Alternative Investment Fund Manager · African Markets · Confidential*
