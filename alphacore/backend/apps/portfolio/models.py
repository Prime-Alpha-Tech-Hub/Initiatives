from django.db import models
from django.contrib.auth.models import User
from apps.deals.models import Deal


class PortfolioPosition(models.Model):
    """A live portfolio holding — created when a deal is marked closed_won."""
    deal             = models.OneToOneField(Deal, on_delete=models.CASCADE, related_name='position')
    entry_date       = models.DateField()
    entry_value      = models.DecimalField(max_digits=18, decimal_places=2)
    current_value    = models.DecimalField(max_digits=18, decimal_places=2)
    currency         = models.CharField(max_length=10, default='USD')
    ownership_pct    = models.DecimalField(max_digits=6, decimal_places=3, null=True, blank=True)
    is_active        = models.BooleanField(default=True)
    exit_date        = models.DateField(null=True, blank=True)
    exit_value       = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    notes            = models.TextField(blank=True)
    updated_at       = models.DateTimeField(auto_now=True)

    @property
    def unrealised_gain(self):
        return self.current_value - self.entry_value

    @property
    def moic(self):
        if self.entry_value and self.entry_value > 0:
            return round(float(self.current_value) / float(self.entry_value), 2)
        return None

    def __str__(self):
        return f"Position: {self.deal.name}"


class PerformanceSnapshot(models.Model):
    """Monthly/quarterly performance snapshots per position."""
    position     = models.ForeignKey(PortfolioPosition, on_delete=models.CASCADE,
                                     related_name='snapshots')
    period_end   = models.DateField()
    nav          = models.DecimalField(max_digits=18, decimal_places=2)
    revenue      = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    ebitda       = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    net_income   = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    cash_flow    = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    kpi_data     = models.JSONField(default=dict, blank=True)
    notes        = models.TextField(blank=True)
    created_by   = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-period_end']
        unique_together = ['position', 'period_end']


class KPIAlert(models.Model):
    """Automated alerts when KPIs breach thresholds."""
    SEVERITY_CHOICES = [('critical','Critical'),('warning','Warning'),('info','Info')]
    STATUS_CHOICES   = [('open','Open'),('acknowledged','Acknowledged'),('resolved','Resolved')]

    position   = models.ForeignKey(PortfolioPosition, on_delete=models.CASCADE,
                                   related_name='alerts')
    severity   = models.CharField(max_length=10, choices=SEVERITY_CHOICES)
    status     = models.CharField(max_length=15, choices=STATUS_CHOICES, default='open')
    title      = models.CharField(max_length=255)
    detail     = models.TextField()
    kpi_name   = models.CharField(max_length=100, blank=True)
    kpi_value  = models.CharField(max_length=50, blank=True)
    threshold  = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at= models.DateTimeField(null=True, blank=True)
    resolved_by= models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
