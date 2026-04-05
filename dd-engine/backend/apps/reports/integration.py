"""
DD Engine — Integration Layer
------------------------------
Outbound calls to AlphaCore and AutoOps.
All calls are fire-and-forget in a background thread.
If ALPHACORE_URL or AUTOOPS_URL is blank, the call is silently skipped.
DD Engine works as a standalone product with no peers configured.
"""
import logging
from django.conf import settings
from .integration_client import _fire

logger = logging.getLogger(__name__)


# ── 1. Push completed DD report → AlphaCore ──────────────────────────────────
def push_report_to_alphacore(report) -> None:
    """
    Called when a DD report is marked complete.
    Pre-fills the IC memo fields in the linked AlphaCore deal.

    AlphaCore endpoint: POST /alphacore/api/deals/{deal_id}/dd_import/
    """
    url = getattr(settings, 'ALPHACORE_URL', '')
    key = getattr(settings, 'ALPHACORE_API_KEY', '')
    if not url or not report.alphacore_deal_id:
        return  # standalone — nothing to do

    # Build the IC memo payload from the report
    analysis = {}
    try:
        from apps.analysis.models import DDAnalysis
        risk_analysis = DDAnalysis.objects.filter(
            document__report=report,
            analysis_type='risk',
            status='completed',
        ).first()
        if risk_analysis and risk_analysis.result_json:
            analysis = risk_analysis.result_json
    except Exception as e:
        logger.warning(f"[DD→AlphaCore] Could not load analysis: {e}")

    payload = {
        'source':           'dd_engine',
        'dd_report_id':     str(report.report_id),
        'deal_name':        report.deal_name or '',
        'borrower':         report.borrower_name or '',
        'strategy':         report.strategy or '',
        'overall_risk_score': analysis.get('overall_risk_score'),
        'overall_risk_level': analysis.get('overall_risk_level'),
        'recommendation':     analysis.get('investment_recommendation') or analysis.get('credit_decision'),
        'risk_flags':         analysis.get('risk_flags', []),
        'summary':            analysis.get('summary', ''),
        'diligence_gaps':     analysis.get('diligence_gaps', []),
        # Credit-specific
        'grade':              getattr(report, 'internal_grade', None),
        'pd':                 getattr(report, 'pd_mid', None),
        'lgd':                getattr(report, 'lgd_mid', None),
        'expected_loss':      getattr(report, 'expected_loss', None),
        'required_rate':      getattr(report, 'required_rate', None),
        'structure':          getattr(report, 'loan_structure', None),
    }

    path = f'api/deals/{report.alphacore_deal_id}/dd_import/'
    logger.info(f"[DD→AlphaCore] Pushing report {report.report_id} to deal {report.alphacore_deal_id}")
    _fire(url, path, key, payload)


# ── 2. Request KYC screen from AutoOps ───────────────────────────────────────
def request_kyc_screen(entity_name: str, entity_type: str, country: str,
                        directors: list = None, reference_id: str = None) -> None:
    """
    Called when a new borrower/counterparty is submitted in DD Engine intake.
    AutoOps runs OpenSanctions + SCUML check and POSTs the result back to:
      POST /dd/api/documents/kyc_result/

    AutoOps endpoint: POST /ao/api/kyc/screen/
    """
    url = getattr(settings, 'AUTOOPS_URL', '')
    key = getattr(settings, 'AUTOOPS_API_KEY', '')
    if not url:
        return  # standalone

    callback_url = getattr(settings, 'DD_ENGINE_URL', '')

    payload = {
        'source':        'dd_engine',
        'reference_id':  reference_id or '',
        'entity_name':   entity_name,
        'entity_type':   entity_type,   # 'business' | 'individual'
        'country':       country,
        'directors':     directors or [],
        'callback_url':  f"{callback_url.rstrip('/')}/dd/api/documents/kyc_result/" if callback_url else '',
    }

    logger.info(f"[DD→AutoOps] KYC screen request: {entity_name}")
    _fire(url, 'api/kyc/screen/', key, payload)
