from django.db import models


class IncomingDocument(models.Model):
    """A document received via email, upload, or API — queued for processing."""

    SOURCE_CHOICES = [
        ('email',  'Email Attachment'),
        ('upload', 'Manual Upload'),
        ('api',    'API Push'),
        ('ftp',    'SFTP Drop'),
    ]
    STATUS_CHOICES = [
        ('received',    'Received'),
        ('classifying', 'Classifying'),
        ('routing',     'Routing'),
        ('routed',      'Routed'),
        ('failed',      'Failed'),
    ]

    filename      = models.CharField(max_length=255)
    file          = models.FileField(upload_to='incoming/', blank=True)
    source        = models.CharField(max_length=10, choices=SOURCE_CHOICES)
    status        = models.CharField(max_length=15, choices=STATUS_CHOICES, default='received')

    # Classification result
    detected_type = models.CharField(max_length=100, blank=True)
    confidence    = models.FloatField(default=0.0)
    sender        = models.EmailField(blank=True)
    subject       = models.CharField(max_length=500, blank=True)

    # Routing result
    routed_to     = models.CharField(max_length=255, blank=True)
    routed_module = models.CharField(max_length=50, blank=True)  # kyc|deals|compliance|etc
    routed_entity = models.CharField(max_length=255, blank=True)

    error         = models.TextField(blank=True)
    received_at   = models.DateTimeField(auto_now_add=True)
    processed_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-received_at']

    def __str__(self):
        return f"{self.filename} [{self.status}]"
