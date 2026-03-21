from django.db import models


class BankFeed(models.Model):
    """A configured bank/custodian data source."""

    TYPE_CHOICES = [
        ('bank',      'Bank Account'),
        ('custodian', 'Custodian'),
        ('broker',    'Broker'),
        ('wallet',    'Digital Wallet'),
    ]
    STATUS_CHOICES = [
        ('active',   'Active'),
        ('paused',   'Paused'),
        ('error',    'Connection Error'),
    ]

    name         = models.CharField(max_length=255)
    institution  = models.CharField(max_length=255)
    feed_type    = models.CharField(max_length=15, choices=TYPE_CHOICES)
    status       = models.CharField(max_length=10, choices=STATUS_CHOICES, default='active')
    currency     = models.CharField(max_length=10, default='USD')
    account_ref  = models.CharField(max_length=255, blank=True)
    last_synced  = models.DateTimeField(null=True, blank=True)
    sync_count   = models.PositiveIntegerField(default=0)
    created_at   = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.institution})"


class Transaction(models.Model):
    """An automatically recorded transaction from a bank feed or manual entry."""

    TYPE_CHOICES = [
        ('capital_call',    'Capital Call'),
        ('distribution',    'Distribution'),
        ('management_fee',  'Management Fee'),
        ('performance_fee', 'Performance Fee'),
        ('investment',      'Investment'),
        ('divestment',      'Divestment'),
        ('expense',         'Expense'),
        ('income',          'Income'),
        ('transfer',        'Transfer'),
        ('other',           'Other'),
    ]
    STATUS_CHOICES = [
        ('pending',   'Pending Review'),
        ('posted',    'Posted'),
        ('reconciled','Reconciled'),
        ('disputed',  'Disputed'),
        ('voided',    'Voided'),
    ]

    feed          = models.ForeignKey(BankFeed, on_delete=models.SET_NULL,
                                      null=True, blank=True, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    status        = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')

    # Core fields
    amount        = models.DecimalField(max_digits=20, decimal_places=2)
    currency      = models.CharField(max_length=10, default='USD')
    date          = models.DateField()
    description   = models.CharField(max_length=500)
    reference     = models.CharField(max_length=255, blank=True)

    # Classification
    counterparty  = models.CharField(max_length=255, blank=True)
    category      = models.CharField(max_length=100, blank=True)
    strategy      = models.CharField(max_length=50, blank=True)
    deal_id       = models.CharField(max_length=100, blank=True)

    # Raw bank data
    raw_data      = models.JSONField(default=dict, blank=True)

    # Auto-posting result
    auto_posted   = models.BooleanField(default=False)
    posting_note  = models.TextField(blank=True)

    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.date} | {self.description} | {self.amount} {self.currency}"
