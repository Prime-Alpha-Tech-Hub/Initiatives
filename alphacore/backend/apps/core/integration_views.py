"""
AlphaCore — Inbound Integration Views
---------------------------------------
Receives payloads from DD Engine and AutoOps.
Protected by X-PAS-Key header matching settings.INTEGRATION_API_KEY.
Returns 200 immediately — all processing is synchronous and lightweight.
"""
import logging
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
import json

logger = logging.getLogger(__name__)


def _auth(request) -> bool:
    """Validate the shared X-PAS-Key header."""
    expected = getattr(settings, 'INTEGRATION_API_KEY', '')
    if not expected:
        return True  # key not configured — open (dev mode)
    return request.headers.get('X-PAS-Key', '') == expected


def _body(request) -> dict:
    try:
        return json.loads(request.body)
    except Exception:
        return {}


# ── Endpoint 1: Receive DD report from DD Engine ─────────────────────────────
@csrf_exempt
@require_POST
def dd_import(request, deal_id: str):
    """
    POST /alphacore/api/deals/{deal_id}/dd_import/

    Receives a completed DD report from DD Engine and pre-fills
    the IC memo fields on the AlphaCore deal record.
    """
    if not _auth(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    data = _body(request)
    if not data:
        return JsonResponse({'error': 'Empty payload'}, status=400)

    try:
        from apps.core.dynamo import get_item, update_item
        from apps.core.dynamo import now_iso

        # Fetch the deal to confirm it exists
        deal = get_item('deals', deal_id, 'company_id')
        if not deal:
            return JsonResponse({'error': 'Deal not found'}, status=404)

        # Store DD report reference and key fields on the deal record
        update_item('deals', deal_id, {
            'dd_report_id':       data.get('dd_report_id'),
            'dd_risk_score':      data.get('overall_risk_score'),
            'dd_risk_level':      data.get('overall_risk_level'),
            'dd_recommendation':  data.get('recommendation'),
            'dd_summary':         data.get('summary'),
            'dd_risk_flags':      data.get('risk_flags', []),
            'dd_diligence_gaps':  data.get('diligence_gaps', []),
            # Credit fields
            'dd_grade':           data.get('grade'),
            'dd_pd':              data.get('pd'),
            'dd_lgd':             data.get('lgd'),
            'dd_expected_loss':   data.get('expected_loss'),
            'dd_required_rate':   data.get('required_rate'),
            'dd_structure':       data.get('structure'),
            'dd_imported_at':     now_iso(),
            'dd_source':          'dd_engine',
        })

        # Log to activity
        try:
            from apps.core.dynamo import put_item, new_id
            put_item('activity_log', {
                'log_id':      new_id(),
                'deal_id':     deal_id,
                'action':      'dd_report_imported',
                'actor':       'dd_engine',
                'description': f"DD report {data.get('dd_report_id')} imported. Risk: {data.get('overall_risk_level')}",
                'created_at':  now_iso(),
            })
        except Exception:
            pass  # activity log failure must never fail the import

        logger.info(f"[AlphaCore inbound] DD import: deal {deal_id} ← report {data.get('dd_report_id')}")
        return JsonResponse({'status': 'imported', 'deal_id': deal_id})

    except Exception as e:
        logger.error(f"[AlphaCore inbound] dd_import error: {e}")
        return JsonResponse({'error': 'Internal error'}, status=500)


# ── Endpoint 2: Receive compliance event from AutoOps ────────────────────────
@csrf_exempt
@require_POST
def compliance_event(request):
    """
    POST /alphacore/api/core/compliance_event/

    Receives compliance alerts and KYC results from AutoOps.
    Flags the relevant deal or investor record and logs the event.
    """
    if not _auth(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    data = _body(request)
    if not data:
        return JsonResponse({'error': 'Empty payload'}, status=400)

    try:
        from apps.core.dynamo import put_item, update_item, new_id, now_iso

        entity_id   = data.get('entity_id', '')
        entity_type = data.get('entity_type', '')
        alert_type  = data.get('alert_type', '')
        severity    = data.get('severity', 'medium')
        detail      = data.get('detail', '')
        kyc_status  = data.get('kyc_status')

        # Store the compliance event
        put_item('activity_log', {
            'log_id':       new_id(),
            'entity_id':    entity_id,
            'entity_type':  entity_type,
            'action':       f'compliance_{alert_type}',
            'actor':        'autoops',
            'severity':     severity,
            'description':  detail,
            'created_at':   now_iso(),
            'source':       'autoops',
        })

        # If KYC onboarding complete — update the investor record
        if alert_type == 'kyc_onboarding_complete' and kyc_status and entity_type == 'investor':
            try:
                update_item('investor', entity_id, {
                    'kyc_status':     kyc_status,
                    'kyc_checked_at': now_iso(),
                    'kyc_detail':     detail,
                })
            except Exception as e:
                logger.warning(f"[AlphaCore inbound] investor kyc update failed: {e}")

        # If it's a watchlist hit or high severity — flag the deal/investor
        if severity in ('critical', 'high') and entity_type in ('deal', 'investor'):
            table = 'ac_deals' if entity_type == 'deal' else 'investor'
            try:
                update_item(table, entity_id, {
                    'compliance_flag':    True,
                    'compliance_alert':   alert_type,
                    'compliance_severity':severity,
                    'compliance_detail':  detail,
                    'compliance_at':      now_iso(),
                })
            except Exception as e:
                logger.warning(f"[AlphaCore inbound] flag update failed: {e}")

        logger.info(f"[AlphaCore inbound] compliance_event: {alert_type} on {entity_id}")
        return JsonResponse({'status': 'received', 'entity_id': entity_id})

    except Exception as e:
        logger.error(f"[AlphaCore inbound] compliance_event error: {e}")
        return JsonResponse({'error': 'Internal error'}, status=500)
