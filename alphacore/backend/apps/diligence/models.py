from django.db import models
from django.contrib.auth.models import User
from apps.deals.models import Deal


class DiligenceChecklist(models.Model):
    """One checklist per deal, auto-created when deal enters due_diligence."""
    deal        = models.OneToOneField(Deal, on_delete=models.CASCADE, related_name='checklist')
    assigned_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    notes       = models.TextField(blank=True)

    @property
    def completion_pct(self):
        items = self.items.all()
        if not items:
            return 0
        completed = items.filter(status='complete').count()
        return round(completed / items.count() * 100)

    def __str__(self):
        return f"Checklist — {self.deal.name}"


class DiligenceItem(models.Model):
    CATEGORY_CHOICES = [
        ('financial',   'Financial'),
        ('legal',       'Legal'),
        ('commercial',  'Commercial'),
        ('operational', 'Operational'),
        ('esg',         'ESG'),
        ('technical',   'Technical'),
        ('other',       'Other'),
    ]
    STATUS_CHOICES = [
        ('pending',     'Pending'),
        ('in_progress', 'In Progress'),
        ('complete',    'Complete'),
        ('waived',      'Waived'),
        ('flagged',     'Flagged'),
    ]
    PRIORITY_CHOICES = [('high','High'),('medium','Medium'),('low','Low')]

    checklist   = models.ForeignKey(DiligenceChecklist, on_delete=models.CASCADE, related_name='items')
    category    = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    title       = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    priority    = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    assigned_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    due_date    = models.DateField(null=True, blank=True)
    completed_at= models.DateTimeField(null=True, blank=True)
    notes       = models.TextField(blank=True)
    order       = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'category', 'title']

    def __str__(self):
        return f"{self.title} [{self.status}]"


class DiligenceFinding(models.Model):
    """Red flags, yellow flags, and key findings from DD."""
    SEVERITY_CHOICES = [('critical','Critical'),('high','High'),('medium','Medium'),('low','Low'),('info','Info')]

    checklist   = models.ForeignKey(DiligenceChecklist, on_delete=models.CASCADE, related_name='findings')
    severity    = models.CharField(max_length=10, choices=SEVERITY_CHOICES)
    title       = models.CharField(max_length=255)
    detail      = models.TextField()
    mitigation  = models.TextField(blank=True)
    created_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    resolved    = models.BooleanField(default=False)

    class Meta:
        ordering = ['severity', '-created_at']


# Default checklist templates per strategy
CHECKLIST_TEMPLATES = {
    'pe': [
        ('financial', 'Audited financial statements (3 years)', 'high'),
        ('financial', 'Management accounts (YTD)', 'high'),
        ('financial', 'Financial model review', 'high'),
        ('financial', 'Working capital analysis', 'medium'),
        ('legal', 'Corporate structure and cap table', 'high'),
        ('legal', 'Material contracts review', 'high'),
        ('legal', 'IP and technology ownership', 'medium'),
        ('legal', 'Litigation and regulatory review', 'high'),
        ('commercial', 'Market sizing and competitive analysis', 'high'),
        ('commercial', 'Customer concentration analysis', 'high'),
        ('commercial', 'Key management interviews', 'high'),
        ('operational', 'Management team background checks', 'high'),
        ('operational', 'Operations site visit', 'medium'),
        ('esg', 'ESG risk assessment', 'medium'),
    ],
    'private_credit': [
        ('financial', 'Borrower financial statements', 'high'),
        ('financial', 'Cash flow analysis and debt service coverage', 'high'),
        ('financial', 'Collateral valuation', 'high'),
        ('legal', 'Security documentation', 'high'),
        ('legal', 'Guarantor review', 'high'),
        ('legal', 'Loan agreement review', 'high'),
        ('commercial', 'Business plan review', 'medium'),
        ('operational', 'KYC / AML checks', 'high'),
        ('operational', 'Sanctions screening', 'high'),
    ],
    'commodities': [
        ('commercial', 'Commodity specification and quality', 'high'),
        ('commercial', 'Market price verification', 'high'),
        ('commercial', 'Counterparty credit assessment', 'high'),
        ('operational', 'Logistics and delivery plan', 'high'),
        ('operational', 'Storage and insurance', 'medium'),
        ('legal', 'Trade contract review', 'high'),
        ('legal', 'Export/import compliance', 'high'),
        ('financial', 'Trade finance facility review', 'medium'),
    ],
    'real_estate': [
        ('financial', 'Valuation report (independent)', 'high'),
        ('financial', 'Cash flow and rent roll analysis', 'high'),
        ('financial', 'Capital expenditure plan', 'medium'),
        ('legal', 'Title search and ownership verification', 'high'),
        ('legal', 'Zoning and planning review', 'high'),
        ('legal', 'Tenancy agreements review', 'high'),
        ('technical', 'Building inspection report', 'high'),
        ('technical', 'Environmental assessment', 'medium'),
        ('commercial', 'Market comparables', 'medium'),
        ('operational', 'Property management plan', 'low'),
    ],
}
