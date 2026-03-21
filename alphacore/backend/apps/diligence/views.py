from rest_framework import serializers, viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import DiligenceChecklist, DiligenceItem, DiligenceFinding, CHECKLIST_TEMPLATES
from apps.deals.models import Deal


class DiligenceItemSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    class Meta:
        model  = DiligenceItem
        fields = '__all__'
    def get_assigned_to_name(self, obj):
        return obj.assigned_to.get_full_name() if obj.assigned_to else ''


class DiligenceFindingSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    class Meta:
        model  = DiligenceFinding
        fields = '__all__'
    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else ''


class DiligenceChecklistSerializer(serializers.ModelSerializer):
    items           = DiligenceItemSerializer(many=True, read_only=True)
    findings        = DiligenceFindingSerializer(many=True, read_only=True)
    completion_pct  = serializers.ReadOnlyField()
    assigned_to_name= serializers.SerializerMethodField()

    class Meta:
        model  = DiligenceChecklist
        fields = '__all__'

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.get_full_name() if obj.assigned_to else ''


class DiligenceChecklistViewSet(viewsets.ModelViewSet):
    queryset           = DiligenceChecklist.objects.all().prefetch_related('items', 'findings')
    serializer_class   = DiligenceChecklistSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['deal']

    @action(detail=False, methods=['post'])
    def create_from_deal(self, request):
        """Auto-create checklist from strategy template."""
        deal_id  = request.data.get('deal_id')
        deal     = Deal.objects.get(pk=deal_id)
        checklist, created = DiligenceChecklist.objects.get_or_create(deal=deal)

        if created:
            template = CHECKLIST_TEMPLATES.get(deal.strategy, [])
            for i, (cat, title, priority) in enumerate(template):
                DiligenceItem.objects.create(
                    checklist=checklist, category=cat,
                    title=title, priority=priority, order=i
                )

        return Response(DiligenceChecklistSerializer(checklist).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class DiligenceItemViewSet(viewsets.ModelViewSet):
    queryset           = DiligenceItem.objects.all()
    serializer_class   = DiligenceItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['checklist', 'status', 'category', 'priority']

    @action(detail=True, methods=['post'])
    def mark_complete(self, request, pk=None):
        from django.utils import timezone
        item = self.get_object()
        item.status       = 'complete'
        item.completed_at = timezone.now()
        item.save()
        return Response(DiligenceItemSerializer(item).data)


class DiligenceFindingViewSet(viewsets.ModelViewSet):
    queryset           = DiligenceFinding.objects.all()
    serializer_class   = DiligenceFindingSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['checklist', 'severity', 'resolved']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
