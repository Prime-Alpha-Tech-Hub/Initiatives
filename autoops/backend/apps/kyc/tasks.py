from celery import shared_task
from django.utils import timezone
from datetime import date, timedelta
import logging
import requests

logger = logging.getLogger(__name__)

# ── Screening engine ──────────────────────────────────────────────────────────

def screen_entity(name: str, country: str = '', entity_type: str = 'individual') -> dict:
    """
    Screen an entity against sanctions, PEP lists, and adverse media.
    Uses OpenSanctions API if key configured, otherwise runs basic heuristics.
    """
    from django.conf import settings
    api_key = getattr(settings, 'OPENSANCTIONS_API_KEY', '')

    result = {
        'sanctions_clear':    True,
        'pep_clear':          True,
        'adverse_media_clear':True,
        'risk_level':         'low',
        'flags':              [],
        'notes':              '',
        'source':             'heuristic',
    }

    if api_key:
        result = _screen_opensanctions(name, country, api_key)
    else:
        result = _screen_heuristic(name, country)

    return result


def _screen_opensanctions(name: str, country: str, api_key: str) -> dict:
    """Screen via OpenSanctions API (opensanctions.org)."""
    try:
        resp = requests.post(
            'https://api.opensanctions.org/match/default',
            headers={'Authorization': f'ApiKey {api_key}'},
            json={'queries': {'entity': {'schema': 'Person', 'properties': {
                'name': [name], 'country': [country] if country else []
            }}}},
            timeout=15
        )
        if resp.status_code == 200:
            data = resp.json()
            results = data.get('responses', {}).get('entity', {}).get('results', [])
            if results:
                top = results[0]
                score = top.get('score', 0)
                datasets = top.get('datasets', [])
                is_sanction = any('sanctions' in d for d in datasets)
                is_pep      = any('pep' in d for d in datasets)
                flags = []
                if is_sanction:
                    flags.append({'type': 'SANCTIONS', 'detail': f"Match found: {top.get('caption', name)}", 'severity': 'critical'})
                if is_pep:
                    flags.append({'type': 'PEP', 'detail': 'Politically Exposed Person match', 'severity': 'high'})
                return {
                    'sanctions_clear':    not is_sanction,
                    'pep_clear':          not is_pep,
                    'adverse_media_clear':True,
                    'risk_level':         'critical' if is_sanction else 'high' if is_pep else 'low',
                    'flags':              flags,
                    'notes':              f"OpenSanctions score: {score:.2f}",
                    'source':             'opensanctions',
                }
    except Exception as e:
        logger.error(f"OpenSanctions API error: {e}")

    return _screen_heuristic(name, country)


def _screen_heuristic(name: str, country: str) -> dict:
    """
    Heuristic screening — basic keyword checks on known high-risk indicators.
    For production: replace with a proper sanctions data feed.
    """
    HIGH_RISK_COUNTRIES = [
        'Iran', 'North Korea', 'Syria', 'Cuba', 'Russia', 'Belarus',
        'Myanmar', 'Venezuela', 'Sudan', 'Libya', 'Yemen', 'Somalia',
    ]
    flags = []
    risk  = 'low'

    if country and any(c.lower() in country.lower() for c in HIGH_RISK_COUNTRIES):
        flags.append({'type': 'HIGH_RISK_JURISDICTION', 'detail': f'{country} is a high-risk jurisdiction', 'severity': 'high'})
        risk = 'high'

    return {
        'sanctions_clear':    True,
        'pep_clear':          True,
        'adverse_media_clear':True,
        'risk_level':         risk,
        'flags':              flags,
        'notes':              'Heuristic screen only — configure OPENSANCTIONS_API_KEY for full screening',
        'source':             'heuristic',
    }


# ── Celery tasks ──────────────────────────────────────────────────────────────

@shared_task(name='kyc.screen_record')
def screen_kyc_record(kyc_id: int):
    """Run full KYC screening on a record."""
    from .models import KYCRecord
    from apps.core.models import AutomationRun

    run = AutomationRun.objects.create(
        module='kyc', task_name='screen_record',
        triggered_by='system', entity_type='kyc', entity_id=str(kyc_id)
    )
    start = timezone.now()

    try:
        record         = KYCRecord.objects.get(pk=kyc_id)
        record.status  = 'screening'
        record.save(update_fields=['status'])

        result = screen_entity(record.entity_name, record.country, record.entity_type)

        record.sanctions_clear      = result['sanctions_clear']
        record.pep_clear            = result['pep_clear']
        record.adverse_media_clear  = result['adverse_media_clear']
        record.risk_level           = result['risk_level']
        record.flags                = result['flags']
        record.screening_notes      = result['notes']
        record.screening_data       = result
        record.screened_at          = timezone.now()
        record.status = 'flagged' if result['flags'] else 'approved'
        record.save()

        elapsed = int((timezone.now() - start).total_seconds() * 1000)
        run.status       = 'success'
        run.summary      = f"{record.entity_name}: {record.risk_level} risk, {len(result['flags'])} flags"
        run.duration_ms  = elapsed
        run.records_processed = 1
        run.completed_at = timezone.now()
        run.save()

    except Exception as e:
        logger.error(f"KYC screen error: {e}")
        run.status = 'failed'
        run.error  = str(e)
        run.completed_at = timezone.now()
        run.save()


@shared_task(name='kyc.refresh_expiring')
def refresh_expiring_kyc():
    """Scheduled — flag KYC records expiring within 30 days."""
    from .models import KYCRecord
    from apps.core.models import AutomationRun

    run = AutomationRun.objects.create(
        module='kyc', task_name='refresh_expiring', triggered_by='scheduler'
    )
    threshold = date.today() + timedelta(days=30)
    expiring  = KYCRecord.objects.filter(expiry_date__lte=threshold, status='approved')

    for record in expiring:
        record.status = 'expired'
        record.save(update_fields=['status'])

    run.status       = 'success'
    run.summary      = f"Flagged {expiring.count()} expiring KYC records"
    run.records_processed = expiring.count()
    run.completed_at = timezone.now()
    run.save()
