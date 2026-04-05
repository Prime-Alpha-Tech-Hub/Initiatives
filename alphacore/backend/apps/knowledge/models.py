"""
Initiative 10 — Internal Knowledge Base
Models: KBCollection, Article, ArticleVersion, ArticleComment
"""
from django.db import models
from django.contrib.auth.models import User


class KBCollection(models.Model):
    """A named collection grouping related articles."""
    company_id  = models.CharField(max_length=100, db_index=True)
    name        = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    icon        = models.CharField(max_length=10, default='◧')   # emoji/symbol
    color       = models.CharField(max_length=20, default='#3b82f6')
    order       = models.PositiveSmallIntegerField(default=0)
    created_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering        = ['order', 'name']
        unique_together = ['company_id', 'name']

    def __str__(self):
        return self.name


class Article(models.Model):
    """A knowledge base article — the core content unit."""
    CATEGORY_CHOICES = [
        ('deal_note',       'Deal Note'),
        ('sector_research', 'Sector Research'),
        ('investment_thesis','Investment Thesis'),
        ('meeting_minutes', 'Meeting Minutes'),
        ('regulatory',      'Regulatory Guidance'),
        ('country_profile', 'Country Profile'),
        ('legal',           'Legal Reference'),
        ('post_mortem',     'Deal Post-Mortem'),
        ('process',         'Process & Playbook'),
        ('other',           'Other'),
    ]
    LANG_CHOICES = [('en', 'English'), ('fr', 'French')]

    company_id  = models.CharField(max_length=100, db_index=True)
    title       = models.CharField(max_length=500)
    content     = models.TextField()          # Markdown
    summary     = models.TextField(blank=True) # Auto or manual abstract
    category    = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='other')
    language    = models.CharField(max_length=5, choices=LANG_CHOICES, default='en')
    tags        = models.JSONField(default=list, blank=True)  # ["ohada","cameroon","pe"]
    collection  = models.ForeignKey(KBCollection, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='articles')

    # Optional links to other AlphaCore objects
    linked_deal_id = models.CharField(max_length=100, blank=True)
    linked_deal_name = models.CharField(max_length=255, blank=True)
    linked_doc_id  = models.CharField(max_length=100, blank=True)

    is_pinned   = models.BooleanField(default=False)
    is_draft    = models.BooleanField(default=False)
    view_count  = models.PositiveIntegerField(default=0)

    author      = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                    related_name='kb_articles')
    last_edited_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                        blank=True, related_name='kb_edited')
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.title


class ArticleVersion(models.Model):
    """Immutable snapshot of an article at each save."""
    article     = models.ForeignKey(Article, on_delete=models.CASCADE,
                                    related_name='versions')
    version_num = models.PositiveIntegerField()
    title       = models.CharField(max_length=500)
    content     = models.TextField()
    changed_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    change_note = models.CharField(max_length=255, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering        = ['-version_num']
        unique_together = ['article', 'version_num']

    def __str__(self):
        return f'{self.article.title} v{self.version_num}'


class ArticleComment(models.Model):
    """Comment thread on an article."""
    article    = models.ForeignKey(Article, on_delete=models.CASCADE,
                                   related_name='comments')
    author     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    content    = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'Comment on {self.article.title}'
