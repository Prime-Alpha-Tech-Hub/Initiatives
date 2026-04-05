"""
AlphaCore — Integration Layer
------------------------------
Outbound calls to DD Engine and AutoOps.
All calls are fire-and-forget in a background thread.
AlphaCore works as a standalone product with no peers configured.
"""
import logging
from django.conf import settings
from .integration_client import _fire

logger = logging.getLogger(__name__)


# ── 1. Push new deal context → DD Engine ─────────────────────────────────────
def push_deal_to_dd_engine(deal) -> None:
    """
    Called when a new deal is created in AlphaCore pipeline.
    DD Engine uses this to link uploaded documents to the correct deal.

    DD Engine endpoint: POST /dd/api/documents/deal_context/
    """
    url = getattr(settings, 'DD_ENGINE_URL', '')
    key = getattr(settings, 'DD_ENGINE_API_KEY', '')
    if not url:
        return  # standalone

    payload = {
        'source':       'alphacore',
        'deal_id':      str(deal.deal_id),
        'deal_name':    deal.name or '',
        'strategy':     deal.strategy or '',
        'company_name': deal.company_name or '',
        'stage':        deal.stage or '',
        'currency':     deal.currency or 'USD',
    }

    logger.info(f"[AlphaCore→DD] Pushing deal context: {deal.deal_id}")
    _fire(url, 'api/documents/deal_context/', key, payload)


# ── 2. Push new investor → AutoOps KYC onboarding ────────────────────────────
def push_investor_to_autoops(investor) -> None:
    """
    Called when a new LP/investor is added to AlphaCore CRM.
    AutoOps runs the full KYC/AML onboarding workflow and posts the
    result back to: POST /alphacore/api/core/compliance_event/

    AutoOps endpoint: POST /ao/api/kyc/onboard/
    """
    url = getattr(settings, 'AUTOOPS_URL', '')
    key = getattr(settings, 'AUTOOPS_API_KEY', '')
    if not url:
        return  # standalone

    callback_url = getattr(settings, 'ALPHACORE_URL', '')

    payload = {
        'source':        'alphacore',
        'investor_id':   str(investor.investor_id),
        'name':          investor.full_name or '',
        'entity_type':   investor.entity_type or 'individual',
        'country':       investor.country or '',
        'email':         investor.email or '',
        'callback_url':  f"{callback_url.rstrip('/')}/alphacore/api/core/compliance_event/" if callback_url else '',
    }

    logger.info(f"[AlphaCore→AutoOps] KYC onboard: {investor.investor_id}")
    _fire(url, 'api/kyc/onboard/', key, payload)
