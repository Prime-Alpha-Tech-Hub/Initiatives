from celery import shared_task
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


def _classify_transaction(description: str, amount: float) -> dict:
    desc = description.lower()
    rules = [
        (['capital call', 'drawdown', 'call notice'],          'capital_call',    'Investor Capital'),
        (['distribution', 'dividend', 'return of capital'],    'distribution',    'Investor Returns'),
        (['management fee', 'mgmt fee', 'advisory fee'],       'management_fee',  'Fees'),
        (['performance fee', 'carried interest', 'carry'],     'performance_fee', 'Fees'),
        (['investment', 'acquisition', 'purchase', 'deploy'],  'investment',      'Investments'),
        (['disposal', 'exit', 'sale proceeds', 'divestment'],  'divestment',      'Realisations'),
        (['rent', 'lease', 'property income'],                 'income',          'Real Estate'),
        (['interest', 'coupon', 'loan repayment'],             'income',          'Private Credit'),
        (['expense', 'legal fee', 'audit', 'professional'],    'expense',         'Operating Costs'),
    ]
    for keywords, tx_type, category in rules:
        if any(k in desc for k in keywords):
            return {'transaction_type': tx_type, 'category': category}
    return {'transaction_type': 'other', 'category': 'Unclassified'}


@shared_task(name='transactions.sync_feed')
def sync_feed(feed_id: int):
    from .models import BankFeed
    from apps.core.models import AutomationRun
    run = AutomationRun.objects.create(
        module='transactions', task_name='sync_feed',
        triggered_by='scheduler', entity_type='feed', entity_id=str(feed_id)
    )
    start = timezone.now()
    try:
        feed = BankFeed.objects.get(pk=feed_id)
        feed.last_synced = timezone.now()
        feed.sync_count += 1
        feed.save(update_fields=['last_synced', 'sync_count'])
        elapsed = int((timezone.now() - start).total_seconds() * 1000)
        run.status = 'success'
        run.summary = f"Synced {feed.name} — configure bank API credentials to fetch live data"
        run.duration_ms = elapsed
        run.completed_at = timezone.now()
        run.save()
    except Exception as e:
        run.status = 'failed'; run.error = str(e)
        run.completed_at = timezone.now(); run.save()


@shared_task(name='transactions.auto_classify')
def auto_classify_pending():
    from .models import Transaction
    from apps.core.models import AutomationRun
    run = AutomationRun.objects.create(
        module='transactions', task_name='auto_classify', triggered_by='scheduler'
    )
    pending = Transaction.objects.filter(status='pending', transaction_type='other')
    count = 0
    for tx in pending:
        result = _classify_transaction(tx.description, float(tx.amount))
        tx.transaction_type = result['transaction_type']
        tx.category = result['category']
        tx.auto_posted = True
        tx.status = 'posted'
        tx.save(update_fields=['transaction_type', 'category', 'auto_posted', 'status'])
        count += 1
    run.status = 'success'
    run.summary = f"Auto-classified {count} transactions"
    run.records_processed = count
    run.completed_at = timezone.now()
    run.save()
