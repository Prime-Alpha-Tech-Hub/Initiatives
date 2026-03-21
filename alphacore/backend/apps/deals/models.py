from django.db import models
from django.contrib.auth.models import User


class Deal(models.Model):
    STRATEGY_CHOICES = [
        ('pe',           'Private Equity'),
        ('private_credit','Private Credit'),
        ('commodities',  'Commodities'),
        ('real_estate',  'Real Estate'),
    ]
    STAGE_CHOICES = [
        ('sourcing',      'Sourcing'),
        ('screening',     'Screening'),
        ('due_diligence', 'Due Diligence'),
        ('ic_review',     'IC Review'),
        ('negotiation',   'Negotiation'),
        ('closed_won',    'Closed — Won'),
        ('closed_lost',   'Closed — Lost'),
        ('on_hold',       'On Hold'),
    ]
    STATUS_CHOICES = [
        ('active',    'Active'),
        ('monitoring','Monitoring'),
        ('exited',    'Exited'),
        ('written_off','Written Off'),
    ]

    # Identity
    name         = models.CharField(max_length=255)
    strategy     = models.CharField(max_length=20, choices=STRATEGY_CHOICES)
    stage        = models.CharField(max_length=20, choices=STAGE_CHOICES, default='sourcing')
    status       = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    # Classification
    sector       = models.CharField(max_length=100, blank=True)
    geography    = models.CharField(max_length=100, blank=True)
    currency     = models.CharField(max_length=10, default='USD')

    # Financials
    deal_size       = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    equity_check    = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    revenue         = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    ebitda          = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    ev_multiple     = models.DecimalField(max_digits=8,  decimal_places=2, null=True, blank=True)
    target_irr      = models.DecimalField(max_digits=6,  decimal_places=2, null=True, blank=True)
    target_moic     = models.DecimalField(max_digits=6,  decimal_places=2, null=True, blank=True)

    # Strategy-specific fields (JSON for flexibility)
    strategy_data   = models.JSONField(default=dict, blank=True)
    # PE:           {hold_period, entry_ev, exit_ev, ownership_pct}
    # Credit:       {loan_type, tenor, rate, ltv, collateral}
    # Commodities:  {commodity_type, volume, unit, spot_price}
    # Real Estate:  {asset_type, sqft, location, occupancy, cap_rate}

    # People
    lead_analyst    = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                        related_name='led_deals')
    team_members    = models.ManyToManyField(User, blank=True, related_name='team_deals')

    # Counterparty
    company_name    = models.CharField(max_length=255, blank=True)
    company_website = models.URLField(blank=True)
    contact_name    = models.CharField(max_length=255, blank=True)
    contact_email   = models.EmailField(blank=True)

    # Dates
    sourced_date    = models.DateField(null=True, blank=True)
    target_close    = models.DateField(null=True, blank=True)
    closed_date     = models.DateField(null=True, blank=True)

    # Content
    summary         = models.TextField(blank=True)
    investment_thesis = models.TextField(blank=True)
    key_risks       = models.TextField(blank=True)
    notes           = models.TextField(blank=True)

    # Meta
    created_by      = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                        related_name='created_deals')
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.name} ({self.get_strategy_display()} — {self.get_stage_display()})"


class DealNote(models.Model):
    deal       = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name='deal_notes')
    author     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    content    = models.TextField()
    is_private = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Note on {self.deal.name} by {self.author}"


class DealStageHistory(models.Model):
    deal        = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name='stage_history')
    from_stage  = models.CharField(max_length=20, blank=True)
    to_stage    = models.CharField(max_length=20)
    changed_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    note        = models.TextField(blank=True)
    changed_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-changed_at']
