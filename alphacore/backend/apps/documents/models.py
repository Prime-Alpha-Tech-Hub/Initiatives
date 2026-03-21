from django.db import models
from django.contrib.auth.models import User
from apps.deals.models import Deal


def upload_path(instance, filename):
    return f"documents/{instance.category}/{filename}"


class Document(models.Model):
    CATEGORY_CHOICES = [
        ('deal',        'Deal Document'),
        ('dd',          'Due Diligence'),
        ('ic_memo',     'IC Memo'),
        ('legal',       'Legal'),
        ('financial',   'Financial Model'),
        ('report',      'Report'),
        ('portfolio',   'Portfolio'),
        ('compliance',  'Compliance'),
        ('other',       'Other'),
    ]
    ACCESS_CHOICES = [
        ('all',       'All Users'),
        ('team',      'Deal Team Only'),
        ('ic',        'IC Members Only'),
        ('admin',     'Admins Only'),
    ]

    # Core
    title        = models.CharField(max_length=255)
    description  = models.TextField(blank=True)
    file         = models.FileField(upload_to=upload_path)
    file_size    = models.PositiveBigIntegerField(default=0)
    mime_type    = models.CharField(max_length=100, blank=True)
    category     = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    access_level = models.CharField(max_length=10, choices=ACCESS_CHOICES, default='team')
    version      = models.PositiveIntegerField(default=1)

    # Relationships
    deal         = models.ForeignKey(Deal, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='documents')
    uploaded_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                     related_name='uploaded_docs')
    tags         = models.JSONField(default=list, blank=True)

    # Metadata
    is_active    = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} v{self.version}"

    @property
    def file_size_display(self):
        size = self.file_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"


class DocumentVersion(models.Model):
    """Version history for documents."""
    document    = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='versions')
    version     = models.PositiveIntegerField()
    file        = models.FileField(upload_to='documents/versions/')
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    change_note = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version']


class DocumentAccessLog(models.Model):
    """Who accessed what document and when — full audit trail."""
    document   = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='access_logs')
    user       = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    action     = models.CharField(max_length=20)  # view, download, edit, delete
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    accessed_at= models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-accessed_at']
