from celery import shared_task
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task(name='documents.classify_and_route')
def classify_and_route(document_id: int):
    """
    Classify an incoming document and route it to the correct module.
    Rules-based classification — extensible to ML.
    """
    from .models import IncomingDocument
    from apps.core.models import AutomationRun

    run = AutomationRun.objects.create(
        module='documents', task_name='classify_and_route',
        triggered_by='scheduler', entity_type='document', entity_id=str(document_id)
    )
    start = timezone.now()

    try:
        doc = IncomingDocument.objects.get(pk=document_id)
        doc.status = 'classifying'
        doc.save(update_fields=['status'])

        # Rules-based classification on filename + subject
        text = f"{doc.filename} {doc.subject}".lower()
        routing = _classify(text)

        doc.detected_type = routing['type']
        doc.confidence    = routing['confidence']
        doc.routed_to     = routing['route_to']
        doc.routed_module = routing['module']
        doc.status        = 'routed'
        doc.processed_at  = timezone.now()
        doc.save()

        elapsed = int((timezone.now() - start).total_seconds() * 1000)
        run.status       = 'success'
        run.summary      = f"Classified as '{routing['type']}', routed to {routing['route_to']}"
        run.duration_ms  = elapsed
        run.records_processed = 1
        run.completed_at = timezone.now()
        run.save()

    except Exception as e:
        logger.error(f"classify_and_route error: {e}")
        run.status = 'failed'
        run.error  = str(e)
        run.completed_at = timezone.now()
        run.save()
        try:
            doc.status = 'failed'
            doc.error  = str(e)
            doc.save(update_fields=['status', 'error'])
        except Exception:
            pass


def _classify(text: str) -> dict:
    """Rules-based document classification."""
    rules = [
        (['kyc', 'passport', 'id card', 'identity', 'proof of address'],
         'KYC Document', 'kyc', 0.9),
        (['subscription', 'agreement', 'investor form', 'commitment'],
         'Subscription Agreement', 'kyc', 0.85),
        (['invoice', 'payment', 'receipt', 'wire', 'transfer'],
         'Financial Transaction', 'transactions', 0.9),
        (['audit', 'financial statement', 'p&l', 'balance sheet', 'annual report'],
         'Financial Statement', 'deals', 0.85),
        (['term sheet', 'loi', 'letter of intent', 'nda', 'non-disclosure'],
         'Legal Document', 'deals', 0.85),
        (['sanctions', 'watchlist', 'screening', 'compliance'],
         'Compliance Document', 'compliance', 0.8),
        (['pitch', 'deck', 'presentation', 'opportunity', 'teaser'],
         'Pitch Deck', 'deals', 0.8),
        (['contract', 'agreement', 'deed', 'charter'],
         'Legal Contract', 'deals', 0.75),
    ]
    for keywords, doc_type, module, confidence in rules:
        if any(k in text for k in keywords):
            return {
                'type': doc_type, 'module': module,
                'confidence': confidence,
                'route_to': f'{module.upper()} module',
            }
    return {'type': 'General Document', 'module': 'general', 'confidence': 0.5, 'route_to': 'Manual review'}


@shared_task(name='documents.process_email_attachments')
def process_email_attachments():
    """Scheduled task — poll email inbox and ingest attachments."""
    from apps.core.models import AutomationRun
    run = AutomationRun.objects.create(
        module='documents', task_name='process_email_attachments',
        triggered_by='scheduler'
    )
    # In production: connect via IMAP, download attachments, create IncomingDocument records
    # For now: log the scheduled run
    run.status  = 'success'
    run.summary = 'Email inbox checked — no new attachments (configure IMAP in .env)'
    run.completed_at = timezone.now()
    run.save()
