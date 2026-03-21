from celery import shared_task
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task(name='compliance.run_watchlist_screen')
def run_watchlist_screen():
    """
    Scheduled daily task — re-screen all active watchlist entries
    and generate alerts for any changes.
    """
    from .models import WatchlistEntry, ComplianceAlert
    from apps.core.models import AutomationRun
    from apps.kyc.tasks import screen_entity

    run = AutomationRun.objects.create(
        module='compliance', task_name='run_watchlist_screen',
        triggered_by='scheduler'
    )
    start    = timezone.now()
    count    = 0
    alerts   = 0

    try:
        entries = WatchlistEntry.objects.filter(status='active')
        for entry in entries:
            result = screen_entity(entry.entity_name, entry.country)
            entry.last_checked = timezone.now()
            entry.save(update_fields=['last_checked'])
            count += 1

            if result.get('flags'):
                for flag in result['flags']:
                    ComplianceAlert.objects.create(
                        alert_type  = flag.get('type', 'WATCHLIST_HIT'),
                        severity    = flag.get('severity', 'high'),
                        entity_name = entry.entity_name,
                        title       = f"Watchlist match: {flag.get('type', 'Flag')}",
                        detail      = flag.get('detail', ''),
                        source      = 'watchlist_screen',
                    )
                    alerts += 1

        elapsed = int((timezone.now() - start).total_seconds() * 1000)
        run.status            = 'success'
        run.summary           = f"Screened {count} entries, generated {alerts} alerts"
        run.duration_ms       = elapsed
        run.records_processed = count
        run.completed_at      = timezone.now()
        run.save()

    except Exception as e:
        logger.error(f"Watchlist screen error: {e}")
        run.status       = 'failed'
        run.error        = str(e)
        run.completed_at = timezone.now()
        run.save()


@shared_task(name='compliance.check_kyc_completeness')
def check_kyc_completeness():
    """
    Scheduled — flag KYC records with missing documents.
    """
    from apps.kyc.models import KYCRecord
    from .models import ComplianceAlert
    from apps.core.models import AutomationRun

    run = AutomationRun.objects.create(
        module='compliance', task_name='check_kyc_completeness',
        triggered_by='scheduler'
    )
    flagged = 0
    records = KYCRecord.objects.filter(status='approved')

    for r in records:
        if not r.documents_complete:
            missing = []
            if not r.id_document_received:       missing.append('ID document')
            if not r.address_proof_received:     missing.append('proof of address')
            if not r.source_of_funds_received:   missing.append('source of funds')

            ComplianceAlert.objects.get_or_create(
                alert_type='INCOMPLETE_KYC',
                entity_name=r.entity_name,
                status='open',
                defaults={
                    'severity': 'medium',
                    'title':    f"Incomplete KYC: {r.entity_name}",
                    'detail':   f"Missing: {', '.join(missing)}",
                    'source':   'kyc_completeness_check',
                }
            )
            flagged += 1

    run.status            = 'success'
    run.summary           = f"Flagged {flagged} records with incomplete KYC"
    run.records_processed = flagged
    run.completed_at      = timezone.now()
    run.save()
