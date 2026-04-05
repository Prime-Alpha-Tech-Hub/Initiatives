from django.db import models
from django.contrib.auth.models import User


def upload_path(instance, filename):
    return f"dd_documents/{instance.deal_id or 'unlinked'}/{filename}"


class DDDocument(models.Model):
    """A document uploaded for due diligence processing."""

    TYPE_CHOICES = [
        ('pitch_deck',       'Pitch Deck'),
        ('financial_model',  'Financial Model'),
        ('income_statement', 'Income Statement'),
        ('balance_sheet',    'Balance Sheet'),
        ('cash_flow',        'Cash Flow Statement'),
        ('audit_report',     'Audit Report'),
        ('legal_contract',   'Legal Contract'),
        ('term_sheet',       'Term Sheet'),
        ('shareholder_agmt', 'Shareholder Agreement'),
        ('cim',              'Confidential Info Memorandum'),
        ('management_cv',    'Management CV / Bio'),
        ('market_report',    'Market Report'),
        ('other',            'Other'),
    ]

    STATUS_CHOICES = [
        ('uploaded',    'Uploaded'),
        ('queued',      'Queued for Analysis'),
        ('processing',  'Processing'),
        ('complete',    'Analysis Complete'),
        ('failed',      'Analysis Failed'),
    ]

    # Identity
    title         = models.CharField(max_length=255)
    doc_type      = models.CharField(max_length=30, choices=TYPE_CHOICES, default='other')
    status        = models.CharField(max_length=15, choices=STATUS_CHOICES, default='uploaded')

    # File
    file          = models.FileField(upload_to=upload_path)
    file_size     = models.PositiveBigIntegerField(default=0)
    mime_type     = models.CharField(max_length=100, blank=True)
    page_count    = models.PositiveIntegerField(null=True, blank=True)
    raw_text      = models.TextField(blank=True)   # extracted plain text

    # Linkage — can be standalone or linked to an AlphaCore deal
    deal_id       = models.CharField(max_length=100, blank=True)  # AlphaCore deal ID
    deal_name     = models.CharField(max_length=255, blank=True)
    company_name  = models.CharField(max_length=255, blank=True)

    # People
    uploaded_by   = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

    # Timestamps
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)
    processed_at  = models.DateTimeField(null=True, blank=True)

    # Error tracking
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} [{self.doc_type}] — {self.status}"

    @property
    def file_size_display(self):
        size = self.file_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"

class DDDocumentArchive(models.Model):
    """Analyst-managed ordered list of reviewed documents."""
    document    = models.OneToOneField(DDDocument, on_delete=models.CASCADE, related_name='archive_entry')
    sort_order  = models.PositiveIntegerField(default=0)
    group_label = models.CharField(max_length=100, blank=True)  # deal/company group
    analyst_note= models.TextField(blank=True)
    archived_at = models.DateTimeField(auto_now_add=True)
    archived_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

    class Meta:
        ordering = ['sort_order', '-archived_at']

    def __str__(self):
        return f"Archive: {self.document.title} (order {self.sort_order})"
