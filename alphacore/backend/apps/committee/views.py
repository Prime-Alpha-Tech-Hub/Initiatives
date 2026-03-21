from rest_framework import serializers, viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import ICMemo, ICVote, ICComment


class ICVoteSerializer(serializers.ModelSerializer):
    member_name = serializers.SerializerMethodField()
    class Meta:
        model  = ICVote
        fields = '__all__'
        read_only_fields = ['member', 'voted_at']
    def get_member_name(self, obj):
        return obj.member.get_full_name()


class ICCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    class Meta:
        model  = ICComment
        fields = '__all__'
        read_only_fields = ['author', 'created_at']
    def get_author_name(self, obj):
        return obj.author.get_full_name() if obj.author else ''


class ICMemoSerializer(serializers.ModelSerializer):
    votes        = ICVoteSerializer(many=True, read_only=True)
    comments     = ICCommentSerializer(many=True, read_only=True)
    vote_summary = serializers.ReadOnlyField()
    quorum_met   = serializers.ReadOnlyField()
    prepared_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = ICMemo
        fields = '__all__'
        read_only_fields = ['prepared_by', 'submitted_at', 'decided_at', 'created_at', 'updated_at']

    def get_prepared_by_name(self, obj):
        return obj.prepared_by.get_full_name() if obj.prepared_by else ''


class ICMemoListSerializer(serializers.ModelSerializer):
    vote_summary     = serializers.ReadOnlyField()
    prepared_by_name = serializers.SerializerMethodField()
    class Meta:
        model  = ICMemo
        fields = ['id', 'deal', 'title', 'memo_type', 'status', 'recommended_amount',
                  'prepared_by_name', 'submitted_at', 'voting_deadline', 'vote_summary', 'created_at']
    def get_prepared_by_name(self, obj):
        return obj.prepared_by.get_full_name() if obj.prepared_by else ''


class ICMemoViewSet(viewsets.ModelViewSet):
    queryset           = ICMemo.objects.all().prefetch_related('votes', 'comments')
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['status', 'memo_type', 'deal']

    def get_serializer_class(self):
        return ICMemoListSerializer if self.action == 'list' else ICMemoSerializer

    def perform_create(self, serializer):
        serializer.save(prepared_by=self.request.user)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit memo for IC review — opens voting."""
        memo = self.get_object()
        if memo.status != 'draft':
            return Response({'error': 'Only draft memos can be submitted.'}, status=400)

        # Add IC members as voters (pass member_ids in request)
        member_ids = request.data.get('member_ids', [])
        for mid in member_ids:
            from django.contrib.auth.models import User
            try:
                ICVote.objects.get_or_create(memo=memo, member_id=mid)
            except User.DoesNotExist:
                pass

        memo.status       = 'voting'
        memo.submitted_at = timezone.now()
        deadline = request.data.get('deadline')
        if deadline:
            memo.voting_deadline = deadline
        memo.save()
        return Response(ICMemoSerializer(memo).data)

    @action(detail=True, methods=['post'])
    def cast_vote(self, request, pk=None):
        """Cast a vote on a memo."""
        memo = self.get_object()
        if memo.status != 'voting':
            return Response({'error': 'Voting is not open for this memo.'}, status=400)

        vote_value = request.data.get('vote')
        rationale  = request.data.get('rationale', '')
        conditions = request.data.get('conditions', '')

        if vote_value not in ['approve', 'reject', 'abstain', 'more_info']:
            return Response({'error': 'Invalid vote value.'}, status=400)

        vote, _ = ICVote.objects.get_or_create(memo=memo, member=request.user)
        vote.vote       = vote_value
        vote.rationale  = rationale
        vote.conditions = conditions
        vote.voted_at   = timezone.now()
        vote.save()

        # Auto-close if all votes cast
        summary = memo.vote_summary
        if summary['pending'] == 0 and memo.quorum_met:
            if summary['approve'] > summary['reject']:
                memo.status = 'approved'
            else:
                memo.status = 'rejected'
            memo.decided_at = timezone.now()
            memo.save()

        return Response(ICMemoSerializer(memo).data)

    @action(detail=True, methods=['post'])
    def decide(self, request, pk=None):
        """Manually close voting with a decision."""
        memo = self.get_object()
        decision = request.data.get('decision')  # approved / rejected / deferred
        if decision not in ['approved', 'rejected', 'deferred']:
            return Response({'error': 'Invalid decision.'}, status=400)
        memo.status      = decision
        memo.decided_at  = timezone.now()
        memo.approved_amount = request.data.get('approved_amount', memo.recommended_amount)
        memo.save()
        return Response(ICMemoSerializer(memo).data)

    @action(detail=True, methods=['post'])
    def add_comment(self, request, pk=None):
        memo = self.get_object()
        s = ICCommentSerializer(data=request.data)
        if s.is_valid():
            s.save(memo=memo, author=request.user)
            return Response(s.data, status=201)
        return Response(s.errors, status=400)
