from django.db import models
from apps.documents.models import DDDocument
from apps.analysis.models import DDAnalysis


class DDReport(models.Model):
    """
    A compiled due diligence report for a deal.
    Aggregates all document analyses into a single package.
    """
    STATUS_CHOICES = [
        ('draft',     'Draft'),
        ('complete',  'Complete'),
        ('exported',  'Exported'),
    ]

    # Deal linkage
    deal_id      = models.CharField(max_length=100, blank=True)
    deal_name    = models.CharField(max_length=255)
    company_name = models.CharField(max_length=255, blank=True)
    strategy     = models.CharField(max_length=30, blank=True)

    # Status
    status       = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')

    # Linked documents and analyses
    documents    = models.ManyToManyField(DDDocument, blank=True, related_name='reports')

    # AI-generated report sections
    executive_summary    = models.TextField(blank=True)
    financial_summary    = models.TextField(blank=True)
    legal_summary        = models.TextField(blank=True)
    risk_summary         = models.TextField(blank=True)
    overall_risk_score   = models.PositiveSmallIntegerField(null=True, blank=True)
    recommendation       = models.CharField(max_length=50, blank=True)

    # Aggregated data
    consolidated_risks   = models.JSONField(default=list, blank=True)
    diligence_gaps       = models.JSONField(default=list, blank=True)
    next_steps           = models.JSONField(default=list, blank=True)

    created_by   = models.CharField(max_length=255, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"DD Report: {self.deal_name} [{self.status}]"
