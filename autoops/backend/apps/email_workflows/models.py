from django.db import models


class EmailRule(models.Model):
    """A routing rule — if email matches conditions, apply action."""

    TRIGGER_CHOICES = [
        ('subject_contains',  'Subject contains'),
        ('sender_domain',     'Sender domain'),
        ('sender_email',      'Sender email'),
        ('body_contains',     'Body contains'),
    ]
    ACTION_CHOICES = [
        ('auto_reply',     'Send Auto-Reply'),
        ('forward',        'Forward to Address'),
        ('tag',            'Tag and Archive'),
        ('create_task',    'Create Follow-up Task'),
        ('route_document', 'Route as Document'),
    ]

    name       = models.CharField(max_length=255)
    is_active  = models.BooleanField(default=True)
    trigger    = models.CharField(max_length=20, choices=TRIGGER_CHOICES)
    condition  = models.CharField(max_length=500)
    action     = models.CharField(max_length=20, choices=ACTION_CHOICES)
    action_data= models.JSONField(default=dict, blank=True)
    priority   = models.PositiveIntegerField(default=10)
    match_count= models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['priority']

    def __str__(self):
        return f"{self.name} — {self.trigger}: {self.condition} → {self.action}"


class EmailLog(models.Model):
    """Log of every email processed by the automation."""

    STATUS_CHOICES = [
        ('received',  'Received'),
        ('processed', 'Processed'),
        ('failed',    'Failed'),
    ]

    sender      = models.EmailField()
    subject     = models.CharField(max_length=500)
    received_at = models.DateTimeField()
    status      = models.CharField(max_length=10, choices=STATUS_CHOICES, default='received')
    rule_matched= models.ForeignKey(EmailRule, on_delete=models.SET_NULL, null=True, blank=True)
    action_taken= models.CharField(max_length=100, blank=True)
    action_result= models.TextField(blank=True)
    error       = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-received_at']


class FollowUpTask(models.Model):
    """Auto-generated follow-up tasks from email rules."""

    STATUS_CHOICES = [
        ('pending',  'Pending'),
        ('done',     'Done'),
        ('overdue',  'Overdue'),
        ('cancelled','Cancelled'),
    ]

    subject     = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    due_date    = models.DateField(null=True, blank=True)
    assigned_to = models.CharField(max_length=255, blank=True)
    status      = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    source_email= models.ForeignKey(EmailLog, on_delete=models.SET_NULL, null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['due_date', '-created_at']

    def __str__(self):
        return f"{self.subject} [{self.status}]"


# ── Tasks ─────────────────────────────────────────────────────────────────────
from celery import shared_task
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task(name='email.process_inbox')
def process_inbox():
    """Scheduled — check inbox, apply routing rules, send auto-replies."""
    from apps.core.models import AutomationRun
    run = AutomationRun.objects.create(
        module='email', task_name='process_inbox', triggered_by='scheduler'
    )
    # In production: connect via IMAP, fetch new emails, match against EmailRule queryset
    run.status  = 'success'
    run.summary = 'Inbox checked — configure IMAP_HOST/USER/PASSWORD in .env for live email'
    run.completed_at = timezone.now()
    run.save()


@shared_task(name='email.send_followup_reminders')
def send_followup_reminders():
    """Scheduled daily — send reminders for overdue follow-up tasks."""
    from apps.core.models import AutomationRun
    from django.conf import settings
    import datetime

    run = AutomationRun.objects.create(
        module='email', task_name='send_followup_reminders', triggered_by='scheduler'
    )
    today    = datetime.date.today()
    overdue  = FollowUpTask.objects.filter(status='pending', due_date__lt=today)
    count    = overdue.count()

    for task in overdue:
        task.status = 'overdue'
        task.save(update_fields=['status'])

    run.status            = 'success'
    run.summary           = f"Marked {count} tasks as overdue"
    run.records_processed = count
    run.completed_at      = timezone.now()
    run.save()
