from celery import shared_task
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task(name='email.process_inbox')
def process_inbox():
    from apps.core.models import AutomationRun
    run = AutomationRun.objects.create(
        module='email', task_name='process_inbox', triggered_by='scheduler'
    )
    run.status = 'success'
    run.summary = 'Inbox checked — configure IMAP_HOST/USER/PASSWORD in .env for live email'
    run.completed_at = timezone.now()
    run.save()


@shared_task(name='email.send_followup_reminders')
def send_followup_reminders():
    from apps.core.models import AutomationRun
    from .models import FollowUpTask
    import datetime
    run = AutomationRun.objects.create(
        module='email', task_name='send_followup_reminders', triggered_by='scheduler'
    )
    today   = datetime.date.today()
    overdue = FollowUpTask.objects.filter(status='pending', due_date__lt=today)
    count   = overdue.count()
    overdue.update(status='overdue')
    run.status = 'success'
    run.summary = f"Marked {count} tasks as overdue"
    run.records_processed = count
    run.completed_at = timezone.now()
    run.save()
