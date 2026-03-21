from django.db import models
from django.contrib.auth.models import User


class AutomationRun(models.Model):
    """Universal log entry for every automation execution."""

    STATUS_CHOICES = [
        ('pending',   'Pending'),
        ('running',   'Running'),
        ('success',   'Success'),
        ('failed',    'Failed'),
        ('skipped',   'Skipped'),
    ]
    MODULE_CHOICES = [
        ('documents',    'Document Processor'),
        ('kyc',          'KYC/AML Engine'),
        ('compliance',   'Compliance Monitor'),
        ('transactions', 'Transaction Recorder'),
        ('email',        'Email Workflow'),
        ('pipeline',     'Data Pipeline'),
    ]

    module       = models.CharField(max_length=20, choices=MODULE_CHOICES)
    task_name    = models.CharField(max_length=255)
    status       = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    triggered_by = models.CharField(max_length=50, default='scheduler')  # scheduler|user|api
    entity_type  = models.CharField(max_length=100, blank=True)
    entity_id    = models.CharField(max_length=100, blank=True)
    summary      = models.TextField(blank=True)
    detail       = models.JSONField(default=dict, blank=True)
    error        = models.TextField(blank=True)
    started_at   = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_ms  = models.PositiveIntegerField(default=0)
    records_processed = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"[{self.module}] {self.task_name} — {self.status}"
