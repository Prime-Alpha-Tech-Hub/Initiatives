"""
DD Engine — Inbound Integration Views
---------------------------------------
Receives deal context from AlphaCore and KYC results from AutoOps.
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


# ── Endpoint 1: Receive deal context from AlphaCore ──────────────────────────
@csrf_exempt
@require_POST
def deal_context(request):
    """
    POST /dd/api/documents/deal_context/

    AlphaCore tells DD Engine about a new deal so uploaded documents
    can be linked to the correct deal record. Stored in DynamoDB for
    lookup when a document is uploaded.
    """
    if not _auth(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    data = _body(request)
    if not data or not data.get('deal_id'):
        return JsonResponse({'error': 'deal_id required'}, status=400)

    try:
        from apps.core.dynamo import put_item, now_iso

        # Store deal context — used when analyst uploads documents
        put_item('dd_deal_context', {
            'deal_id':      data['deal_id'],
            'deal_name':    data.get('deal_name', ''),
            'strategy':     data.get('strategy', ''),
            'company_name': data.get('company_name', ''),
            'stage':        data.get('stage', ''),
            'currency':     data.get('currency', 'USD'),
            'source':       'alphacore',
            'received_at':  now_iso(),
        })

        logger.info(f"[DD inbound] deal_context: {data['deal_id']} ({data.get('deal_name')})")
        return JsonResponse({'status': 'stored', 'deal_id': data['deal_id']})

    except Exception as e:
        logger.error(f"[DD inbound] deal_context error: {e}")
        return JsonResponse({'error': 'Internal error'}, status=500)


# ── Endpoint 2: Receive KYC result from AutoOps ──────────────────────────────
@csrf_exempt
@require_POST
def kyc_result(request):
    """
    POST /dd/api/documents/kyc_result/

    AutoOps posts the KYC screening result back to DD Engine
    after completing a screen requested during intake.
    Updates the document/report record with KYC status.
    """
    if not _auth(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    data = _body(request)
    if not data or not data.get('reference_id'):
        return JsonResponse({'error': 'reference_id required'}, status=400)

    try:
        from apps.core.dynamo import update_item, put_item, new_id, now_iso, query_table

        reference_id = data['reference_id']
        kyc_status   = data.get('kyc_status', 'unknown')
        detail       = data.get('detail', '')
        flags        = data.get('flags', [])

        # Find the report by reference_id and update its KYC status
        reports = query_table('dd_reports', 'reference_id', reference_id, index='reference-index')
        if reports:
            for report in reports:
                update_item('dd_reports', report['report_id'], {
                    'kyc_status':     kyc_status,
                    'kyc_detail':     detail,
                    'kyc_flags':      flags,
                    'kyc_checked_at': now_iso(),
                    'kyc_source':     'autoops',
                })

        logger.info(f"[DD inbound] kyc_result: ref={reference_id} status={kyc_status}")
        return JsonResponse({'status': 'updated', 'kyc_status': kyc_status})

    except Exception as e:
        logger.error(f"[DD inbound] kyc_result error: {e}")
        return JsonResponse({'error': 'Internal error'}, status=500)
