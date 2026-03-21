from django.db import models


class Pipeline(models.Model):
    SCHEDULE_CHOICES = [
        ('hourly',  'Every Hour'), ('daily',   'Daily'),
        ('weekly',  'Weekly'),     ('monthly', 'Monthly'), ('manual', 'Manual Only'),
    ]
    STATUS_CHOICES = [
        ('active', 'Active'), ('paused', 'Paused'), ('error', 'Error'),
    ]
    SOURCE_CHOICES = [
        ('api', 'External API'), ('database', 'Database'),
        ('file', 'File / SFTP'),  ('webhook', 'Webhook'), ('manual', 'Manual Upload'),
    ]
    name          = models.CharField(max_length=255)
    description   = models.TextField(blank=True)
    source_type   = models.CharField(max_length=10, choices=SOURCE_CHOICES)
    source_config = models.JSONField(default=dict, blank=True)
    destination   = models.CharField(max_length=255, blank=True)
    schedule      = models.CharField(max_length=10, choices=SCHEDULE_CHOICES, default='daily')
    status        = models.CharField(max_length=10, choices=STATUS_CHOICES, default='active')
    last_run      = models.DateTimeField(null=True, blank=True)
    last_status   = models.CharField(max_length=20, blank=True)
    run_count     = models.PositiveIntegerField(default=0)
    records_total = models.PositiveBigIntegerField(default=0)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} [{self.schedule}]"


class PipelineRun(models.Model):
    STATUS_CHOICES = [
        ('running', 'Running'), ('success', 'Success'),
        ('failed',  'Failed'),  ('partial', 'Partial Success'),
    ]
    pipeline        = models.ForeignKey(Pipeline, on_delete=models.CASCADE, related_name='runs')
    status          = models.CharField(max_length=10, choices=STATUS_CHOICES)
    records_fetched = models.PositiveIntegerField(default=0)
    records_loaded  = models.PositiveIntegerField(default=0)
    records_failed  = models.PositiveIntegerField(default=0)
    started_at      = models.DateTimeField(auto_now_add=True)
    completed_at    = models.DateTimeField(null=True, blank=True)
    duration_ms     = models.PositiveIntegerField(default=0)
    error           = models.TextField(blank=True)
    log             = models.TextField(blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"{self.pipeline.name} [{self.status}]"
