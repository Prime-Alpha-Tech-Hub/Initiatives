from rest_framework import serializers, viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Deal, DealNote, DealStageHistory


class DealNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model  = DealNote
        fields = '__all__'
        read_only_fields = ['author', 'created_at', 'updated_at']

    def get_author_name(self, obj):
        return obj.author.get_full_name() if obj.author else ''


class DealStageHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = DealStageHistory
        fields = '__all__'

    def get_changed_by_name(self, obj):
        return obj.changed_by.get_full_name() if obj.changed_by else ''


class DealSerializer(serializers.ModelSerializer):
    deal_notes    = DealNoteSerializer(many=True, read_only=True)
    stage_history = DealStageHistorySerializer(many=True, read_only=True)
    lead_analyst_name = serializers.SerializerMethodField()
    ebitda_margin = serializers.SerializerMethodField()

    class Meta:
        model  = Deal
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def get_lead_analyst_name(self, obj):
        return obj.lead_analyst.get_full_name() if obj.lead_analyst else ''

    def get_ebitda_margin(self, obj):
        if obj.revenue and obj.ebitda and obj.revenue > 0:
            return round((obj.ebitda / obj.revenue) * 100, 1)
        return None


class DealListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    lead_analyst_name = serializers.SerializerMethodField()

    class Meta:
        model  = Deal
        fields = ['id', 'name', 'strategy', 'stage', 'status', 'sector',
                  'geography', 'deal_size', 'equity_check', 'target_irr',
                  'lead_analyst_name', 'sourced_date', 'target_close',
                  'updated_at']

    def get_lead_analyst_name(self, obj):
        return obj.lead_analyst.get_full_name() if obj.lead_analyst else ''


class DealViewSet(viewsets.ModelViewSet):
    queryset           = Deal.objects.all().select_related('lead_analyst', 'created_by')
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['strategy', 'stage', 'status', 'sector', 'geography']
    search_fields      = ['name', 'company_name', 'sector', 'summary']
    ordering_fields    = ['updated_at', 'created_at', 'deal_size', 'name']

    def get_serializer_class(self):
        if self.action == 'list':
            return DealListSerializer
        return DealSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def advance_stage(self, request, pk=None):
        """Move deal to next stage with optional note."""
        deal = self.get_object()
        new_stage = request.data.get('stage')
        note      = request.data.get('note', '')

        if new_stage not in dict(Deal.STAGE_CHOICES):
            return Response({'error': 'Invalid stage'}, status=status.HTTP_400_BAD_REQUEST)

        DealStageHistory.objects.create(
            deal=deal, from_stage=deal.stage, to_stage=new_stage,
            changed_by=request.user, note=note
        )
        old_stage  = deal.stage
        deal.stage = new_stage
        deal.save(update_fields=['stage', 'updated_at'])
        return Response({'previous': old_stage, 'current': new_stage})

    @action(detail=True, methods=['post'])
    def add_note(self, request, pk=None):
        deal = self.get_object()
        serializer = DealNoteSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(deal=deal, author=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def pipeline_summary(self, request):
        """Aggregate counts and deal sizes per strategy and stage."""
        from django.db.models import Count, Sum
        summary = (
            Deal.objects
            .filter(status='active')
            .values('strategy', 'stage')
            .annotate(count=Count('id'), total_size=Sum('deal_size'))
            .order_by('strategy', 'stage')
        )
        return Response(list(summary))


class DealNoteViewSet(viewsets.ModelViewSet):
    queryset           = DealNote.objects.all()
    serializer_class   = DealNoteSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['deal']

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
