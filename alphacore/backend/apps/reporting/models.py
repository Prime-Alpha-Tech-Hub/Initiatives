from django.db import models
from django.contrib.auth.models import User


class ReportRecipient(models.Model):
    """LP / investor email addresses that receive reports."""
    LANG_CHOICES = [('en', 'English'), ('fr', 'French')]

    company_id   = models.CharField(max_length=100, db_index=True)  # AlphaCore company scope
    name         = models.CharField(max_length=255)
    email        = models.EmailField()
    organisation = models.CharField(max_length=255, blank=True)
    language     = models.CharField(max_length=5, choices=LANG_CHOICES, default='en')
    is_active    = models.BooleanField(default=True)
    added_by     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    added_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['company_id', 'email']
        ordering        = ['name']

    def __str__(self):
        return f"{self.name} <{self.email}>"


class LPReport(models.Model):
    """A generated LP/investor report — one record per report run."""
    STATUS_CHOICES = [
        ('draft',   'Draft'),
        ('ready',   'Ready to send'),
        ('sent',    'Sent'),
        ('failed',  'Failed'),
    ]
    PERIOD_CHOICES = [
        ('Q1', 'Q1'), ('Q2', 'Q2'), ('Q3', 'Q3'), ('Q4', 'Q4'),
        ('annual', 'Annual'), ('custom', 'Custom'),
    ]
    TYPE_CHOICES = [
        ('quarterly',  'Quarterly LP Report'),
        ('annual',     'Annual Report'),
        ('flash',      'Flash Update'),
        ('custom',     'Custom Report'),
    ]

    company_id      = models.CharField(max_length=100, db_index=True)
    title           = models.CharField(max_length=255)
    report_type     = models.CharField(max_length=20, choices=TYPE_CHOICES, default='quarterly')
    period          = models.CharField(max_length=10, choices=PERIOD_CHOICES, default='Q1')
    period_year     = models.PositiveSmallIntegerField()
    status          = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')

    # Scope — which strategies to include
    include_pe          = models.BooleanField(default=True)
    include_credit      = models.BooleanField(default=True)
    include_commodities = models.BooleanField(default=True)
    include_re          = models.BooleanField(default=True)

    # Content — the rendered HTML stored for preview and re-send
    html_content    = models.TextField(blank=True)
    s3_key          = models.CharField(max_length=500, blank=True)  # PDF in S3 (future)

    # Delivery tracking
    recipients_count = models.PositiveIntegerField(default=0)
    sent_count       = models.PositiveIntegerField(default=0)
    failed_count     = models.PositiveIntegerField(default=0)

    # People
    prepared_by     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                         related_name='prepared_reports')
    sent_by         = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                         related_name='sent_reports')
    sent_at         = models.DateTimeField(null=True, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} [{self.status}]"


class ReportDelivery(models.Model):
    """Tracks per-recipient delivery status for each report."""
    report      = models.ForeignKey(LPReport, on_delete=models.CASCADE, related_name='deliveries')
    recipient   = models.ForeignKey(ReportRecipient, on_delete=models.CASCADE)
    resend_id   = models.CharField(max_length=100, blank=True)
    success     = models.BooleanField(default=False)
    error       = models.TextField(blank=True)
    sent_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-sent_at']
