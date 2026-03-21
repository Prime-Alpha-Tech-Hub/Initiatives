"""
DD Engine — Claude AI Analysis Service
Uses Claude to analyse due diligence documents and extract structured data.
"""
import json
import time
import logging
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def get_client():
    """Get Anthropic client. Raises if API key not configured."""
    try:
        import anthropic
        key = settings.ANTHROPIC_API_KEY
        if not key:
            raise ValueError("ANTHROPIC_API_KEY not set in .env")
        return anthropic.Anthropic(api_key=key)
    except ImportError:
        raise ImportError("anthropic package not installed. Run: pip install anthropic")


def _call_claude(prompt: str, system: str, max_tokens: int = 4096) -> tuple[str, int]:
    """Call Claude and return (response_text, tokens_used)."""
    client = get_client()
    start = time.time()

    message = client.messages.create(
        model     = "claude-sonnet-4-6",
        max_tokens= max_tokens,
        system    = system,
        messages  = [{"role": "user", "content": prompt}],
    )

    elapsed = int((time.time() - start) * 1000)
    tokens  = message.usage.input_tokens + message.usage.output_tokens
    text    = message.content[0].text if message.content else ''

    logger.info(f"Claude call: {tokens} tokens, {elapsed}ms")
    return text, tokens


def _parse_json(text: str) -> dict:
    """Extract JSON from Claude response, handling markdown code blocks."""
    text = text.strip()
    if text.startswith('```'):
        lines = text.split('\n')
        text  = '\n'.join(lines[1:-1] if lines[-1] == '```' else lines[1:])
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object in the response
        import re
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
        return {'raw_response': text, 'parse_error': True}


# ── Analysis functions ────────────────────────────────────────────────────────

def analyse_document(document, analysis_type: str) -> dict:
    """
    Run a specific analysis on a document.
    Returns structured result dict.
    """
    HANDLERS = {
        'classification': _classify_document,
        'financial':      _analyse_financials,
        'legal':          _analyse_legal,
        'risk':           _assess_risk,
        'summary':        _generate_summary,
        'full':           _full_analysis,
    }

    handler = HANDLERS.get(analysis_type)
    if not handler:
        raise ValueError(f"Unknown analysis type: {analysis_type}")

    if not document.raw_text:
        raise ValueError("Document has no extracted text. Process the document first.")

    return handler(document)


def _classify_document(document) -> dict:
    """Classify document type and extract key metadata."""
    system = """You are a financial document analyst specialising in private equity and investment due diligence.
Classify the document and extract key metadata. Respond only with valid JSON."""

    prompt = f"""Classify this document and extract metadata.

Document title: {document.title}
First 3000 characters of content:
{document.raw_text[:3000]}

Respond with JSON:
{{
  "document_type": "pitch_deck|financial_model|income_statement|balance_sheet|cash_flow|audit_report|legal_contract|term_sheet|shareholder_agreement|cim|management_cv|market_report|other",
  "confidence": 0.0-1.0,
  "company_name": "extracted company name or null",
  "period": "time period covered e.g. FY2023 or null",
  "language": "en|fr|other",
  "summary": "2-3 sentence summary of what this document is",
  "key_topics": ["list", "of", "main", "topics"],
  "data_quality": "high|medium|low",
  "completeness_notes": "any notes on what seems missing or incomplete"
}}"""

    text, tokens = _call_claude(prompt, system, max_tokens=1024)
    result = _parse_json(text)
    result['tokens_used'] = tokens
    return result


def _analyse_financials(document) -> dict:
    """Extract financial metrics from financial statements."""
    system = """You are a CFA-qualified financial analyst specialising in private equity due diligence.
Extract all financial metrics precisely. If a value is not present, use null. Respond only with valid JSON."""

    prompt = f"""Extract all financial data from this document.

Document: {document.title}
Company: {document.company_name or 'Unknown'}
Content:
{document.raw_text[:8000]}

Respond with JSON:
{{
  "period": "e.g. FY2023 or Q3 2024",
  "currency": "USD|EUR|XAF|GBP|other",
  "income_statement": {{
    "revenue": null,
    "cost_of_goods_sold": null,
    "gross_profit": null,
    "operating_expenses": null,
    "ebitda": null,
    "ebit": null,
    "interest_expense": null,
    "tax": null,
    "net_income": null
  }},
  "balance_sheet": {{
    "cash": null,
    "total_current_assets": null,
    "total_assets": null,
    "total_current_liabilities": null,
    "total_debt": null,
    "total_liabilities": null,
    "total_equity": null
  }},
  "cash_flow": {{
    "operating_cash_flow": null,
    "capex": null,
    "free_cash_flow": null
  }},
  "ratios": {{
    "gross_margin_pct": null,
    "ebitda_margin_pct": null,
    "net_margin_pct": null,
    "debt_to_equity": null,
    "current_ratio": null,
    "revenue_growth_pct": null
  }},
  "historical_data": [
    {{"year": "2021", "revenue": null, "ebitda": null, "net_income": null}},
    {{"year": "2022", "revenue": null, "ebitda": null, "net_income": null}},
    {{"year": "2023", "revenue": null, "ebitda": null, "net_income": null}}
  ],
  "analyst_notes": "observations about data quality, unusual items, or concerns",
  "red_flags": ["list any financial red flags observed"]
}}"""

    text, tokens = _call_claude(prompt, system, max_tokens=2048)
    result = _parse_json(text)
    result['tokens_used'] = tokens
    return result


def _analyse_legal(document) -> dict:
    """Extract key legal terms from contracts and agreements."""
    system = """You are a legal analyst specialising in private equity transactions.
Extract all key legal terms and flag any unusual or concerning provisions. Respond only with valid JSON."""

    prompt = f"""Analyse this legal document and extract key terms.

Document: {document.title}
Content:
{document.raw_text[:8000]}

Respond with JSON:
{{
  "document_type": "type of legal document",
  "parties": ["list of parties involved"],
  "governing_law": "jurisdiction",
  "effective_date": "date or null",
  "expiry_date": "date or null",
  "key_terms": {{
    "valuation": "any valuation mentioned",
    "consideration": "deal price or consideration",
    "conditions_precedent": ["list of CPs"],
    "representations_warranties": ["key reps and warranties"],
    "indemnities": "summary of indemnity provisions",
    "termination_rights": "summary of termination clauses",
    "change_of_control": "change of control provisions",
    "exclusivity": "any exclusivity period",
    "non_compete": "non-compete terms if any",
    "ip_ownership": "IP ownership provisions"
  }},
  "obligations": [
    {{"party": "who", "obligation": "what they must do", "deadline": "by when"}}
  ],
  "risk_provisions": ["unusual or high-risk clauses identified"],
  "missing_standard_provisions": ["standard clauses that appear absent"],
  "analyst_notes": "overall assessment of the document"
}}"""

    text, tokens = _call_claude(prompt, system, max_tokens=2048)
    result = _parse_json(text)
    result['tokens_used'] = tokens
    return result


def _assess_risk(document) -> dict:
    """Comprehensive risk assessment of the document."""
    system = """You are a senior investment risk analyst at a private equity firm.
Assess all risks systematically. Be direct and specific. Respond only with valid JSON."""

    prompt = f"""Conduct a comprehensive risk assessment of this document.

Document: {document.title}
Company: {document.company_name or 'Unknown'}
Content:
{document.raw_text[:8000]}

Respond with JSON:
{{
  "overall_risk_score": 1-10,
  "overall_risk_level": "low|medium|high|critical",
  "investment_recommendation": "proceed|proceed_with_caution|further_diligence_required|do_not_proceed",
  "risk_flags": [
    {{
      "severity": "critical|high|medium|low|info",
      "category": "financial|legal|operational|market|management|compliance|esg",
      "title": "short title",
      "detail": "detailed explanation",
      "source_text": "verbatim quote from document if available",
      "mitigation": "suggested mitigation"
    }}
  ],
  "strengths": ["list of positive factors"],
  "key_uncertainties": ["what we don't know that matters"],
  "diligence_gaps": ["what additional documents or information are needed"],
  "sector_risks": "industry-specific risks",
  "management_assessment": "assessment of management quality based on available info",
  "summary": "3-4 sentence executive risk summary"
}}"""

    text, tokens = _call_claude(prompt, system, max_tokens=3000)
    result = _parse_json(text)
    result['tokens_used'] = tokens
    return result


def _generate_summary(document) -> dict:
    """Generate executive summary of the document."""
    system = """You are an investment analyst writing executive summaries for an IC memo.
Be concise, precise and objective. Respond only with valid JSON."""

    prompt = f"""Write an executive summary of this due diligence document.

Document: {document.title}
Company: {document.company_name or 'Unknown'}
Content:
{document.raw_text[:6000]}

Respond with JSON:
{{
  "headline": "one sentence headline",
  "executive_summary": "3-5 paragraph executive summary suitable for an IC memo",
  "key_highlights": ["5-7 most important facts"],
  "key_concerns": ["top 3-5 concerns"],
  "next_steps": ["recommended next diligence steps"],
  "pages_reviewed": "description of what was covered"
}}"""

    text, tokens = _call_claude(prompt, system, max_tokens=2000)
    result = _parse_json(text)
    result['tokens_used'] = tokens
    return result


def _full_analysis(document) -> dict:
    """Run all analysis types and combine results."""
    results = {}
    total_tokens = 0

    for analysis_type in ['classification', 'financial', 'risk', 'summary']:
        try:
            handler = {
                'classification': _classify_document,
                'financial':      _analyse_financials,
                'risk':           _assess_risk,
                'summary':        _generate_summary,
            }[analysis_type]
            result = handler(document)
            total_tokens += result.pop('tokens_used', 0)
            results[analysis_type] = result
        except Exception as e:
            logger.error(f"Full analysis — {analysis_type} failed: {e}")
            results[analysis_type] = {'error': str(e)}

    # Add legal analysis if it looks like a legal document
    doc_type = results.get('classification', {}).get('document_type', '')
    if doc_type in ('legal_contract', 'term_sheet', 'shareholder_agreement'):
        try:
            legal = _analyse_legal(document)
            total_tokens += legal.pop('tokens_used', 0)
            results['legal'] = legal
        except Exception as e:
            results['legal'] = {'error': str(e)}

    results['tokens_used'] = total_tokens
    return results
