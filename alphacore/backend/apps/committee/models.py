from django.db import models
from django.contrib.auth.models import User
from apps.deals.models import Deal


class ICMemo(models.Model):
    STATUS_CHOICES = [
        ('draft',       'Draft'),
        ('submitted',   'Submitted for Review'),
        ('voting',      'Voting Open'),
        ('approved',    'Approved'),
        ('rejected',    'Rejected'),
        ('deferred',    'Deferred'),
        ('withdrawn',   'Withdrawn'),
    ]
    MEMO_TYPE_CHOICES = [
        ('initial',     'Initial Investment'),
        ('follow_on',   'Follow-on Investment'),
        ('exit',        'Exit Approval'),
        ('write_off',   'Write-off'),
        ('amendment',   'Amendment / Waiver'),
    ]

    deal          = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name='ic_memos')
    memo_type     = models.CharField(max_length=20, choices=MEMO_TYPE_CHOICES, default='initial')
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    title         = models.CharField(max_length=255)

    # Memo content sections
    executive_summary  = models.TextField(blank=True)
    investment_thesis  = models.TextField(blank=True)
    transaction_summary= models.TextField(blank=True)
    financial_analysis = models.TextField(blank=True)
    risk_factors       = models.TextField(blank=True)
    esg_considerations = models.TextField(blank=True)
    recommendation     = models.TextField(blank=True)

    # Amounts
    recommended_amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    approved_amount    = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)

    # People
    prepared_by   = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                       related_name='prepared_memos')
    submitted_at  = models.DateTimeField(null=True, blank=True)
    voting_deadline = models.DateTimeField(null=True, blank=True)
    decided_at    = models.DateTimeField(null=True, blank=True)

    # Quorum
    quorum_required = models.PositiveIntegerField(default=3)

    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"IC Memo — {self.title} [{self.status}]"

    @property
    def vote_summary(self):
        votes = self.votes.all()
        return {
            'approve': votes.filter(vote='approve').count(),
            'reject':  votes.filter(vote='reject').count(),
            'abstain': votes.filter(vote='abstain').count(),
            'pending': votes.filter(vote='pending').count(),
            'total':   votes.count(),
        }

    @property
    def quorum_met(self):
        decisive = self.votes.exclude(vote='pending').count()
        return decisive >= self.quorum_required


class ICVote(models.Model):
    VOTE_CHOICES = [
        ('pending', 'Pending'),
        ('approve', 'Approve'),
        ('reject',  'Reject'),
        ('abstain', 'Abstain'),
        ('more_info','Request More Info'),
    ]

    memo        = models.ForeignKey(ICMemo, on_delete=models.CASCADE, related_name='votes')
    member      = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ic_votes')
    vote        = models.CharField(max_length=10, choices=VOTE_CHOICES, default='pending')
    rationale   = models.TextField(blank=True)
    conditions  = models.TextField(blank=True)  # Conditions attached to approval
    voted_at    = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ['memo', 'member']
        ordering = ['-voted_at']

    def __str__(self):
        return f"{self.member.get_full_name()} — {self.vote} on {self.memo.title}"


class ICComment(models.Model):
    memo       = models.ForeignKey(ICMemo, on_delete=models.CASCADE, related_name='comments')
    author     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    content    = models.TextField()
    is_dissent = models.BooleanField(default=False)  # Formal dissent logged per PAS culture
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


# ── IC Memo Version — immutable snapshot on every significant save ────────────
class ICMemoVersion(models.Model):
    """
    Immutable audit record. Created every time a memo moves stage
    or is materially edited. Never deleted.
    """
    memo         = models.ForeignKey(ICMemo, on_delete=models.CASCADE, related_name='versions')
    version_num  = models.PositiveIntegerField()           # 1, 2, 3 …
    changed_by   = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    change_note  = models.CharField(max_length=255, blank=True)  # e.g. "Submitted for voting"
    snapshot     = models.JSONField()                      # Full memo state as JSON
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering            = ['-version_num']
        unique_together     = ['memo', 'version_num']

    def __str__(self):
        return f"Memo {self.memo_id} v{self.version_num}"


# ── IC Memo Attachment ────────────────────────────────────────────────────────
class ICMemoAttachment(models.Model):
    """
    Documents attached to a memo (DD reports, financials, term sheets).
    Stores S3 key — actual file lives in S3.
    """
    CATEGORY_CHOICES = [
        ('dd_report',    'DD Report'),
        ('financial',    'Financial Model'),
        ('legal',        'Legal Document'),
        ('term_sheet',   'Term Sheet'),
        ('other',        'Other'),
    ]
    memo         = models.ForeignKey(ICMemo, on_delete=models.CASCADE, related_name='attachments')
    filename     = models.CharField(max_length=255)
    s3_key       = models.CharField(max_length=500)
    category     = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    size_bytes   = models.PositiveIntegerField(default=0)
    uploaded_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    uploaded_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at']

    def __str__(self):
        return self.filename


# ── IC Notification log ───────────────────────────────────────────────────────
class ICNotification(models.Model):
    """
    Tracks every email notification sent for IC actions.
    Prevents double-sending and provides a delivery audit trail.
    """
    EVENT_CHOICES = [
        ('submitted',    'Memo Submitted'),
        ('vote_reminder','Vote Reminder'),
        ('approved',     'Memo Approved'),
        ('rejected',     'Memo Rejected'),
        ('deferred',     'Memo Deferred'),
        ('more_info',    'More Info Requested'),
        ('revised',      'Memo Revised'),
    ]
    memo        = models.ForeignKey(ICMemo, on_delete=models.CASCADE, related_name='notifications')
    recipient   = models.ForeignKey(User, on_delete=models.CASCADE)
    event       = models.CharField(max_length=20, choices=EVENT_CHOICES)
    sent_at     = models.DateTimeField(auto_now_add=True)
    resend_id   = models.CharField(max_length=100, blank=True)   # Resend message ID
    success     = models.BooleanField(default=True)

    class Meta:
        ordering = ['-sent_at']
