"""
AutoOps — Inbound Integration Views
--------------------------------------
Receives KYC screen requests from DD Engine and
KYC onboarding requests from AlphaCore.
Protected by X-PAS-Key header.
"""
import logging, json
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

logger = logging.getLogger(__name__)


def _auth(request) -> bool:
    expected = getattr(settings, 'INTEGRATION_API_KEY', '')
    if not expected:
        return True
    return request.headers.get('X-PAS-Key', '') == expected


def _body(request) -> dict:
    try:
        return json.loads(request.body)
    except Exception:
        return {}


# ── Endpoint 1: Screen request from DD Engine ────────────────────────────────
@csrf_exempt
@require_POST
def kyc_screen(request):
    """
    POST /ao/api/kyc/screen/

    DD Engine requests a quick KYC screen on a new borrower/counterparty.
    AutoOps queues the check and POSTs the result to the callback_url.
    """
    if not _auth(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    data = _body(request)
    if not data or not data.get('entity_name'):
        return JsonResponse({'error': 'entity_name required'}, status=400)

    try:
        from apps.core.dynamo import put_item, new_id, now_iso
        from apps.kyc.tasks import run_kyc_screen_task  # Celery task

        record_id = new_id()

        # Store the inbound request
        put_item('ao_kyc_records', {
            'kyc_id':       record_id,
            'entity_name':  data['entity_name'],
            'entity_type':  data.get('entity_type', 'business'),
            'country':      data.get('country', ''),
            'directors':    data.get('directors', []),
            'reference_id': data.get('reference_id', ''),
            'callback_url': data.get('callback_url', ''),
            'source':       data.get('source', 'external'),
            'status':       'queued',
            'created_at':   now_iso(),
        })

        # Queue the actual screen — runs asynchronously via Celery
        try:
            run_kyc_screen_task.delay(record_id)
        except Exception as e:
            logger.warning(f"[AutoOps inbound] Celery unavailable, running sync: {e}")
            # Fallback: run inline (slower but never drops the request)
            run_kyc_screen_task(record_id)

        logger.info(f"[AutoOps inbound] kyc_screen queued: {record_id} for {data['entity_name']}")
        return JsonResponse({'status': 'queued', 'kyc_id': record_id})

    except Exception as e:
        logger.error(f"[AutoOps inbound] kyc_screen error: {e}")
        return JsonResponse({'error': 'Internal error'}, status=500)


# ── Endpoint 2: Onboarding request from AlphaCore ────────────────────────────
@csrf_exempt
@require_POST
def kyc_onboard(request):
    """
    POST /ao/api/kyc/onboard/

    AlphaCore requests full KYC onboarding for a new LP/investor.
    AutoOps runs the complete onboarding workflow (SCUML, sanctions,
    adverse media) and POSTs the result back to callback_url.
    """
    if not _auth(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    data = _body(request)
    if not data or not data.get('investor_id'):
        return JsonResponse({'error': 'investor_id required'}, status=400)

    try:
        from apps.core.dynamo import put_item, new_id, now_iso
        from apps.kyc.tasks import run_kyc_onboard_task  # Celery task

        record_id = new_id()

        put_item('ao_kyc_records', {
            'kyc_id':       record_id,
            'investor_id':  data['investor_id'],
            'entity_name':  data.get('name', ''),
            'entity_type':  data.get('entity_type', 'individual'),
            'country':      data.get('country', ''),
            'email':        data.get('email', ''),
            'callback_url': data.get('callback_url', ''),
            'source':       data.get('source', 'alphacore'),
            'workflow':     'full_onboarding',
            'status':       'queued',
            'created_at':   now_iso(),
        })

        try:
            run_kyc_onboard_task.delay(record_id)
        except Exception as e:
            logger.warning(f"[AutoOps inbound] Celery unavailable, running sync: {e}")
            run_kyc_onboard_task(record_id)

        logger.info(f"[AutoOps inbound] kyc_onboard queued: {record_id} for investor {data['investor_id']}")
        return JsonResponse({'status': 'queued', 'kyc_id': record_id})

    except Exception as e:
        logger.error(f"[AutoOps inbound] kyc_onboard error: {e}")
        return JsonResponse({'error': 'Internal error'}, status=500)
