from django.db import models
from apps.documents.models import DDDocument


class DDAnalysis(models.Model):
    """AI analysis result for a document."""

    ANALYSIS_TYPE_CHOICES = [
        ('classification',  'Document Classification'),
        ('financial',       'Financial Statement Analysis'),
        ('legal',           'Legal Document Analysis'),
        ('risk',            'Risk Assessment'),
        ('summary',         'Executive Summary'),
        ('full',            'Full Due Diligence'),
    ]

    STATUS_CHOICES = [
        ('pending',    'Pending'),
        ('running',    'Running'),
        ('complete',   'Complete'),
        ('failed',     'Failed'),
    ]

    document      = models.ForeignKey(DDDocument, on_delete=models.CASCADE,
                                      related_name='analyses')
    analysis_type = models.CharField(max_length=20, choices=ANALYSIS_TYPE_CHOICES)
    status        = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')

    # AI output — structured JSON
    result        = models.JSONField(default=dict, blank=True)

    # Token usage tracking
    tokens_used   = models.PositiveIntegerField(default=0)
    model_used    = models.CharField(max_length=50, default='claude-sonnet-4-6')

    # Timing
    created_at    = models.DateTimeField(auto_now_add=True)
    completed_at  = models.DateTimeField(null=True, blank=True)
    duration_ms   = models.PositiveIntegerField(default=0)

    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['document', 'analysis_type']

    def __str__(self):
        return f"{self.document.title} — {self.analysis_type} [{self.status}]"


class RiskFlag(models.Model):
    """Individual risk flags surfaced during analysis."""

    SEVERITY_CHOICES = [
        ('critical', 'Critical'),
        ('high',     'High'),
        ('medium',   'Medium'),
        ('low',      'Low'),
        ('info',     'Info'),
    ]
    CATEGORY_CHOICES = [
        ('financial',   'Financial'),
        ('legal',       'Legal'),
        ('operational', 'Operational'),
        ('market',      'Market'),
        ('management',  'Management'),
        ('compliance',  'Compliance'),
        ('esg',         'ESG'),
    ]

    analysis    = models.ForeignKey(DDAnalysis, on_delete=models.CASCADE,
                                    related_name='risk_flags')
    severity    = models.CharField(max_length=10, choices=SEVERITY_CHOICES)
    category    = models.CharField(max_length=15, choices=CATEGORY_CHOICES)
    title       = models.CharField(max_length=255)
    detail      = models.TextField()
    source_text = models.TextField(blank=True)  # verbatim from document
    mitigation  = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['severity', 'category']


class ExtractedFinancial(models.Model):
    """Structured financial data extracted from statements."""

    analysis    = models.OneToOneField(DDAnalysis, on_delete=models.CASCADE,
                                       related_name='financials')
    currency    = models.CharField(max_length=10, default='USD')
    period      = models.CharField(max_length=50, blank=True)  # e.g. "FY2023"

    # P&L
    revenue     = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    gross_profit= models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    ebitda      = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    ebit        = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    net_income  = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)

    # Balance sheet
    total_assets      = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    total_liabilities = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    total_equity      = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    total_debt        = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    cash              = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)

    # Computed ratios
    gross_margin      = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    ebitda_margin     = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    net_margin        = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    debt_to_equity    = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    current_ratio     = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    # Multi-year data (JSON array of {year, revenue, ebitda, ...})
    historical_data   = models.JSONField(default=list, blank=True)

    # Raw extracted (everything Claude found)
    raw_extracted     = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Financials: {self.analysis.document.title} — {self.period}"
