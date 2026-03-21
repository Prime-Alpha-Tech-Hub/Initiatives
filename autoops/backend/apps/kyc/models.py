from django.db import models


class KYCRecord(models.Model):
    """Investor / counterparty KYC record."""

    ENTITY_TYPE_CHOICES = [
        ('individual',  'Individual'),
        ('corporate',   'Corporate'),
        ('fund',        'Fund'),
        ('trust',       'Trust'),
    ]
    STATUS_CHOICES = [
        ('pending',   'Pending Review'),
        ('screening', 'Screening in Progress'),
        ('approved',  'Approved'),
        ('flagged',   'Flagged for Review'),
        ('rejected',  'Rejected'),
        ('expired',   'Expired — Refresh Required'),
    ]
    RISK_CHOICES = [
        ('low',      'Low Risk'),
        ('medium',   'Medium Risk'),
        ('high',     'High Risk'),
        ('critical', 'Critical — Do Not Proceed'),
    ]

    # Entity details
    entity_name   = models.CharField(max_length=255)
    entity_type   = models.CharField(max_length=15, choices=ENTITY_TYPE_CHOICES)
    nationality   = models.CharField(max_length=100, blank=True)
    country       = models.CharField(max_length=100, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    id_number     = models.CharField(max_length=100, blank=True)

    # Corporate fields
    registration_number = models.CharField(max_length=100, blank=True)
    jurisdiction        = models.CharField(max_length=100, blank=True)
    ubo_name            = models.CharField(max_length=255, blank=True)  # Ultimate Beneficial Owner

    # Screening results
    status          = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    risk_level      = models.CharField(max_length=10, choices=RISK_CHOICES, blank=True)
    sanctions_clear = models.BooleanField(null=True)
    pep_clear       = models.BooleanField(null=True)   # Politically Exposed Person
    adverse_media_clear = models.BooleanField(null=True)

    # Screening detail
    screening_notes  = models.TextField(blank=True)
    screening_data   = models.JSONField(default=dict, blank=True)
    flags            = models.JSONField(default=list, blank=True)

    # Documents
    id_document_received   = models.BooleanField(default=False)
    address_proof_received = models.BooleanField(default=False)
    source_of_funds_received = models.BooleanField(default=False)

    # Review
    reviewed_by      = models.CharField(max_length=255, blank=True)
    review_notes     = models.TextField(blank=True)

    # Linkage
    alphacore_investor_id = models.CharField(max_length=100, blank=True)

    # Timestamps
    created_at       = models.DateTimeField(auto_now_add=True)
    screened_at      = models.DateTimeField(null=True, blank=True)
    approved_at      = models.DateTimeField(null=True, blank=True)
    expiry_date      = models.DateField(null=True, blank=True)  # KYC refresh date

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.entity_name} — {self.status}"

    @property
    def documents_complete(self):
        return all([self.id_document_received,
                    self.address_proof_received,
                    self.source_of_funds_received])
