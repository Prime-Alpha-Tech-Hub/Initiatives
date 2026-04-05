from rest_framework import serializers, viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.contrib.auth.models import User
from .models import ICMemo, ICVote, ICComment, ICMemoVersion, ICMemoAttachment, ICNotification
import requests as _req
from django.conf import settings as _settings
import logging
logger = logging.getLogger(__name__)


# ── Resend helper (mirrors accounts/views.py pattern) ────────────────────────
def _send(to, subject, html):
    api_key = getattr(_settings, 'RESEND_API_KEY', '')
    if not api_key:
        return None
    try:
        r = _req.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={'from': 'aurel.botouli@primealphasecurities.com',
                  'to': [to], 'subject': subject, 'html': html},
            timeout=8,
        )
        data = r.json()
        return data.get('id') if r.ok else None
    except Exception as e:
        logger.error(f'[Resend IC] {e}')
        return None


def _ic_email_html(title, body, cta_text='', cta_url=''):
    cta = (f'<div style="margin-top:20px"><a href="{cta_url}" style="background:#c9a84c;color:#000;'
           f'padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px">'
           f'{cta_text}</a></div>') if cta_text else ''
    return (
        '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
        '<body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px;margin:0">'
        '<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:8px;'
        'overflow:hidden;border:1px solid #ddd">'
        '<div style="background:#07090f;padding:18px 24px;border-bottom:3px solid #c9a84c">'
        '<div style="font-size:10px;color:#c9a84c;letter-spacing:.18em;text-transform:uppercase;'
        'margin-bottom:4px">Prime Alpha Securities · IC Committee</div>'
        f'<h1 style="color:#fff;font-size:17px;margin:0;font-weight:700">{title}</h1></div>'
        f'<div style="padding:22px 24px"><div style="font-size:13px;color:#444;line-height:1.75">'
        f'{body}</div>{cta}'
        '<p style="font-size:11px;color:#aaa;margin-top:22px;border-top:1px solid #eee;'
        'padding-top:12px">Prime Alpha Securities · Investment Committee · Confidential</p>'
        '</div></div></body></html>'
    )


def _notify(memo, user, event):
    """Send IC notification and log it."""
    subj_map = {
        'submitted':     f'[IC] Vote required — {memo.title}',
        'vote_reminder': f'[IC] Reminder: vote pending — {memo.title}',
        'approved':      f'[IC] Approved — {memo.title}',
        'rejected':      f'[IC] Rejected — {memo.title}',
        'deferred':      f'[IC] Deferred — {memo.title}',
        'more_info':     f'[IC] More information requested — {memo.title}',
        'revised':       f'[IC] Memo revised — {memo.title}',
    }
    body_map = {
        'submitted': (
            f'An IC memo has been submitted for your vote.<br><br>'
            f'<strong>{memo.title}</strong><br>'
            f'Type: {memo.get_memo_type_display()}<br>'
            f'Recommended amount: ${memo.recommended_amount:,.0f}<br><br>'
            f'Please log in to AlphaCore to cast your vote before the deadline.'
        ),
        'approved':  f'IC Memo <strong>{memo.title}</strong> has been <strong style="color:#22d3a0">approved</strong>.',
        'rejected':  f'IC Memo <strong>{memo.title}</strong> has been <strong style="color:#ef4444">rejected</strong>.',
        'deferred':  f'IC Memo <strong>{memo.title}</strong> has been <strong style="color:#f59e0b">deferred</strong> for further review.',
        'more_info': f'More information has been requested on <strong>{memo.title}</strong>. Please review and resubmit.',
        'revised':   f'IC Memo <strong>{memo.title}</strong> has been revised. Please review the updated version.',
        'vote_reminder': f'Your vote on <strong>{memo.title}</strong> is still pending. Please cast your vote before the deadline.',
    }
    msg_id = _send(
        to      = user.email,
        subject = subj_map.get(event, f'[IC] {memo.title}'),
        html    = _ic_email_html(
            title = subj_map.get(event, 'IC Update'),
            body  = body_map.get(event, ''),
        ),
    )
    ICNotification.objects.create(
        memo=memo, recipient=user, event=event,
        resend_id=msg_id or '', success=bool(msg_id),
    )


def _snapshot(memo, user, note=''):
    """Create a version snapshot of the current memo state."""
    last = memo.versions.order_by('-version_num').first()
    num  = (last.version_num + 1) if last else 1
    snap = {
        'status': memo.status, 'title': memo.title,
        'memo_type': memo.memo_type,
        'executive_summary': memo.executive_summary,
        'investment_thesis': memo.investment_thesis,
        'transaction_summary': memo.transaction_summary,
        'financial_analysis': memo.financial_analysis,
        'risk_factors': memo.risk_factors,
        'esg_considerations': memo.esg_considerations,
        'recommendation': memo.recommendation,
        'recommended_amount': str(memo.recommended_amount or ''),
        'quorum_required': memo.quorum_required,
    }
    ICMemoVersion.objects.create(
        memo=memo, version_num=num,
        changed_by=user, change_note=note, snapshot=snap,
    )
    return num


# ── Serializers ───────────────────────────────────────────────────────────────
class ICAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    class Meta:
        model  = ICMemoAttachment
        fields = '__all__'
        read_only_fields = ['uploaded_by', 'uploaded_at']
    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() if obj.uploaded_by else ''


class ICVersionSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()
    class Meta:
        model  = ICMemoVersion
        fields = ['id', 'version_num', 'changed_by_name', 'change_note', 'created_at', 'snapshot']
    def get_changed_by_name(self, obj):
        return obj.changed_by.get_full_name() if obj.changed_by else ''


class ICVoteSerializer(serializers.ModelSerializer):
    member_name  = serializers.SerializerMethodField()
    member_email = serializers.SerializerMethodField()
    class Meta:
        model  = ICVote
        fields = '__all__'
        read_only_fields = ['member', 'voted_at']
    def get_member_name(self, obj):
        return obj.member.get_full_name() or obj.member.email
    def get_member_email(self, obj):
        return obj.member.email


class ICCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    class Meta:
        model  = ICComment
        fields = '__all__'
        read_only_fields = ['author', 'created_at']
    def get_author_name(self, obj):
        return obj.author.get_full_name() if obj.author else ''


class ICNotificationSerializer(serializers.ModelSerializer):
    recipient_name = serializers.SerializerMethodField()
    class Meta:
        model  = ICNotification
        fields = '__all__'
    def get_recipient_name(self, obj):
        return obj.recipient.get_full_name() or obj.recipient.email


class ICMemoSerializer(serializers.ModelSerializer):
    votes        = ICVoteSerializer(many=True, read_only=True)
    comments     = ICCommentSerializer(many=True, read_only=True)
    attachments  = ICAttachmentSerializer(many=True, read_only=True)
    versions     = ICVersionSerializer(many=True, read_only=True)
    notifications= ICNotificationSerializer(many=True, read_only=True)
    vote_summary = serializers.ReadOnlyField()
    quorum_met   = serializers.ReadOnlyField()
    prepared_by_name = serializers.SerializerMethodField()
    deal_name    = serializers.SerializerMethodField()

    class Meta:
        model  = ICMemo
        fields = '__all__'
        read_only_fields = ['prepared_by', 'submitted_at', 'decided_at',
                            'created_at', 'updated_at']

    def get_prepared_by_name(self, obj):
        return obj.prepared_by.get_full_name() if obj.prepared_by else ''

    def get_deal_name(self, obj):
        return obj.deal.name if obj.deal else ''


class ICMemoListSerializer(serializers.ModelSerializer):
    vote_summary     = serializers.ReadOnlyField()
    quorum_met       = serializers.ReadOnlyField()
    prepared_by_name = serializers.SerializerMethodField()
    deal_name        = serializers.SerializerMethodField()
    attachment_count = serializers.SerializerMethodField()

    class Meta:
        model  = ICMemo
        fields = ['id', 'deal', 'deal_name', 'title', 'memo_type', 'status',
                  'recommended_amount', 'approved_amount',
                  'prepared_by_name', 'submitted_at', 'voting_deadline',
                  'decided_at', 'vote_summary', 'quorum_met',
                  'quorum_required', 'created_at', 'attachment_count']

    def get_prepared_by_name(self, obj):
        return obj.prepared_by.get_full_name() if obj.prepared_by else ''

    def get_deal_name(self, obj):
        return obj.deal.name if obj.deal else ''

    def get_attachment_count(self, obj):
        return obj.attachments.count()


# ── ViewSet ───────────────────────────────────────────────────────────────────
class ICMemoViewSet(viewsets.ModelViewSet):
    queryset = ICMemo.objects.all().prefetch_related(
        'votes', 'comments', 'attachments', 'versions', 'notifications'
    ).select_related('deal', 'prepared_by')
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['status', 'memo_type', 'deal']

    def get_serializer_class(self):
        return ICMemoListSerializer if self.action == 'list' else ICMemoSerializer

    def perform_create(self, serializer):
        memo = serializer.save(prepared_by=self.request.user)
        _snapshot(memo, self.request.user, 'Memo created')

    def perform_update(self, serializer):
        memo = serializer.save()
        _snapshot(memo, self.request.user, 'Memo edited')

    # ── Submit for voting ─────────────────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """
        Submit memo for IC review.
        Body: { member_ids: [1,2,3], deadline: 'ISO datetime', quorum_required: 3 }
        Creates pending votes for each member, emails them all via Resend.
        """
        memo = self.get_object()
        if memo.status not in ('draft', 'revision'):
            return Response({'error': 'Only draft or revised memos can be submitted.'}, status=400)

        member_ids = request.data.get('member_ids', [])
        if not member_ids:
            return Response({'error': 'At least one IC member required.'}, status=400)

        deadline = request.data.get('deadline')
        quorum   = request.data.get('quorum_required', len(member_ids))

        # Create pending votes
        for mid in member_ids:
            try:
                ICVote.objects.get_or_create(memo=memo, member_id=mid)
            except Exception:
                pass

        memo.status          = 'voting'
        memo.submitted_at    = timezone.now()
        memo.quorum_required = int(quorum)
        if deadline:
            memo.voting_deadline = deadline
        memo.save()

        v = _snapshot(memo, request.user, 'Submitted for voting')

        # Email all IC members
        for mid in member_ids:
            try:
                member = User.objects.get(pk=mid)
                _notify(memo, member, 'submitted')
            except User.DoesNotExist:
                pass

        return Response(ICMemoSerializer(memo).data)

    # ── Cast vote ─────────────────────────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def cast_vote(self, request, pk=None):
        """
        Body: { vote: 'approve'|'reject'|'abstain'|'more_info',
                rationale: str, conditions: str }
        Auto-closes memo when quorum is met.
        """
        memo = self.get_object()
        if memo.status != 'voting':
            return Response({'error': 'Voting is not open for this memo.'}, status=400)

        vote_value = request.data.get('vote')
        if vote_value not in ('approve', 'reject', 'abstain', 'more_info'):
            return Response({'error': 'Invalid vote.'}, status=400)

        vote, _ = ICVote.objects.get_or_create(memo=memo, member=request.user)
        vote.vote       = vote_value
        vote.rationale  = request.data.get('rationale', '')
        vote.conditions = request.data.get('conditions', '')
        vote.voted_at   = timezone.now()
        vote.save()

        # If more_info — notify preparer
        if vote_value == 'more_info':
            _notify(memo, memo.prepared_by, 'more_info')

        # Auto-close when all decisive votes cast and quorum met
        self._check_auto_close(memo)
        memo.refresh_from_db()
        return Response(ICMemoSerializer(memo).data)

    def _check_auto_close(self, memo):
        summary = memo.vote_summary
        if summary['pending'] == 0 and memo.quorum_met:
            if summary['approve'] > summary['reject']:
                decision = 'approved'
            else:
                decision = 'rejected'
            memo.status     = decision
            memo.decided_at = timezone.now()
            memo.save()
            _snapshot(memo, memo.prepared_by, f'Auto-closed: {decision}')
            # Notify all voters of outcome
            for vote in memo.votes.select_related('member').all():
                _notify(memo, vote.member, decision)

    # ── Manual decide ─────────────────────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def decide(self, request, pk=None):
        """
        Override / close voting manually.
        Body: { decision: 'approved'|'rejected'|'deferred',
                approved_amount: decimal, conditions: str }
        """
        memo     = self.get_object()
        decision = request.data.get('decision')
        if decision not in ('approved', 'rejected', 'deferred'):
            return Response({'error': 'Invalid decision.'}, status=400)

        memo.status          = decision
        memo.decided_at      = timezone.now()
        memo.approved_amount = request.data.get('approved_amount', memo.recommended_amount)
        memo.save()
        _snapshot(memo, request.user, f'Manual decision: {decision}')

        for vote in memo.votes.select_related('member').all():
            _notify(memo, vote.member, decision)

        return Response(ICMemoSerializer(memo).data)

    # ── Request revision ──────────────────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def request_revision(self, request, pk=None):
        """
        Send memo back to preparer for revision.
        Body: { note: str }
        """
        memo = self.get_object()
        note = request.data.get('note', '')
        memo.status = 'draft'
        memo.save()
        _snapshot(memo, request.user, f'Sent back for revision: {note}')
        _notify(memo, memo.prepared_by, 'more_info')
        return Response(ICMemoSerializer(memo).data)

    # ── Add comment ───────────────────────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def add_comment(self, request, pk=None):
        memo = self.get_object()
        s    = ICCommentSerializer(data=request.data)
        if s.is_valid():
            s.save(memo=memo, author=request.user)
            return Response(s.data, status=201)
        return Response(s.errors, status=400)

    # ── Version history ───────────────────────────────────────────────────────
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        memo     = self.get_object()
        versions = memo.versions.order_by('-version_num')
        return Response(ICVersionSerializer(versions, many=True).data)

    # ── Vote reminder (manual trigger) ────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def send_reminders(self, request, pk=None):
        """Email pending voters a reminder."""
        memo     = self.get_object()
        pending  = memo.votes.filter(vote='pending').select_related('member')
        count    = 0
        for v in pending:
            _notify(memo, v.member, 'vote_reminder')
            count += 1
        return Response({'reminders_sent': count})

    # ── Structured export (for PDF generation) ────────────────────────────────
    @action(detail=True, methods=['get'])
    def export(self, request, pk=None):
        """
        Returns a clean structured JSON representation of the memo
        suitable for WeasyPrint PDF rendering.
        """
        memo    = self.get_object()
        summary = memo.vote_summary
        data = {
            'meta': {
                'title':           memo.title,
                'memo_type':       memo.get_memo_type_display(),
                'status':          memo.status,
                'deal':            memo.deal.name if memo.deal else '',
                'strategy':        memo.deal.get_strategy_display() if memo.deal else '',
                'prepared_by':     memo.prepared_by.get_full_name() if memo.prepared_by else '',
                'submitted_at':    memo.submitted_at.isoformat() if memo.submitted_at else '',
                'decided_at':      memo.decided_at.isoformat() if memo.decided_at else '',
                'recommended_amount': str(memo.recommended_amount or ''),
                'approved_amount':    str(memo.approved_amount or ''),
                'quorum_required': memo.quorum_required,
            },
            'sections': {
                'executive_summary':   memo.executive_summary,
                'investment_thesis':   memo.investment_thesis,
                'transaction_summary': memo.transaction_summary,
                'financial_analysis':  memo.financial_analysis,
                'risk_factors':        memo.risk_factors,
                'esg_considerations':  memo.esg_considerations,
                'recommendation':      memo.recommendation,
            },
            'votes': [
                {
                    'member': v.member.get_full_name() or v.member.email,
                    'vote':   v.vote,
                    'rationale': v.rationale,
                    'conditions': v.conditions,
                    'voted_at': v.voted_at.isoformat() if v.voted_at else '',
                }
                for v in memo.votes.select_related('member').all()
            ],
            'vote_summary': summary,
            'attachments': [
                {'filename': a.filename, 's3_key': a.s3_key, 'category': a.category}
                for a in memo.attachments.all()
            ],
        }
        return Response(data)
