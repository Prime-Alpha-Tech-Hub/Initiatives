"""
AutoOps — Integration Layer
-----------------------------
Outbound compliance events and KYC results to AlphaCore and DD Engine.
All calls are fire-and-forget in a background thread.
AutoOps works as a standalone product with no peers configured.
"""
import logging
from django.conf import settings
from .integration_client import _fire

logger = logging.getLogger(__name__)


# ── 1. Push compliance alert → AlphaCore ─────────────────────────────────────
def push_compliance_event(entity_id: str, entity_type: str, alert_type: str,
                           severity: str, detail: str, source_ref: str = '') -> None:
    """
    Called when AutoOps raises a compliance alert (watchlist hit,
    KYC status change, covenant breach, regulatory filing issue).
    AlphaCore flags the deal or investor record and notifies the PM.

    AlphaCore endpoint: POST /alphacore/api/core/compliance_event/
    """
    url = getattr(settings, 'ALPHACORE_URL', '')
    key = getattr(settings, 'ALPHACORE_API_KEY', '')
    if not url:
        return  # standalone

    payload = {
        'source':       'autoops',
        'entity_id':    entity_id,
        'entity_type':  entity_type,   # 'investor' | 'deal' | 'counterparty'
        'alert_type':   alert_type,    # 'watchlist_hit' | 'kyc_failed' | 'kyc_passed' | 'covenant_breach' | 'regulatory'
        'severity':     severity,      # 'critical' | 'high' | 'medium' | 'low'
        'detail':       detail,
        'source_ref':   source_ref,    # AutoOps internal alert ID
    }

    logger.info(f"[AutoOps→AlphaCore] Compliance event: {alert_type} on {entity_id}")
    _fire(url, 'api/core/compliance_event/', key, payload)


# ── 2. Post KYC result → DD Engine (callback) ────────────────────────────────
def push_kyc_result_to_dd(callback_url: str, reference_id: str,
                           status: str, detail: str, flags: list = None) -> None:
    """
    Called after AutoOps completes a KYC screen requested by DD Engine.
    Posts the result to the callback URL supplied in the original request.

    DD Engine endpoint: POST /dd/api/documents/kyc_result/
    """
    if not callback_url:
        return  # no callback registered — standalone

    key = getattr(settings, 'DD_ENGINE_API_KEY', '')

    payload = {
        'source':       'autoops',
        'reference_id': reference_id,
        'kyc_status':   status,   # 'clear' | 'flagged' | 'rejected'
        'detail':       detail,
        'flags':        flags or [],
    }

    logger.info(f"[AutoOps→DD] KYC result: {status} for ref {reference_id}")
    _fire(callback_url, '', key, payload)


# ── 3. Post KYC onboarding result → AlphaCore (callback) ─────────────────────
def push_onboarding_result_to_alphacore(callback_url: str, investor_id: str,
                                         status: str, detail: str) -> None:
    """
    Called after AutoOps completes KYC onboarding for an LP
    requested by AlphaCore. Posts result to the callback URL.

    AlphaCore endpoint: POST /alphacore/api/core/compliance_event/
    """
    if not callback_url:
        return  # no callback

    key = getattr(settings, 'ALPHACORE_API_KEY', '')

    payload = {
        'source':      'autoops',
        'entity_id':   investor_id,
        'entity_type': 'investor',
        'alert_type':  'kyc_onboarding_complete',
        'severity':    'low' if status == 'clear' else 'high',
        'detail':      detail,
        'kyc_status':  status,
    }

    logger.info(f"[AutoOps→AlphaCore] Onboarding result: {status} for {investor_id}")
    _fire(callback_url, '', key, payload)
