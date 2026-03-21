from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Count
from .models import PortfolioPosition, PerformanceSnapshot, KPIAlert


class PerformanceSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PerformanceSnapshot
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at']


class KPIAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model  = KPIAlert
        fields = '__all__'


class PortfolioPositionSerializer(serializers.ModelSerializer):
    snapshots      = PerformanceSnapshotSerializer(many=True, read_only=True)
    alerts         = KPIAlertSerializer(many=True, read_only=True)
    unrealised_gain= serializers.ReadOnlyField()
    moic           = serializers.ReadOnlyField()
    deal_name      = serializers.SerializerMethodField()
    strategy       = serializers.SerializerMethodField()

    class Meta:
        model  = PortfolioPosition
        fields = '__all__'

    def get_deal_name(self, obj):
        return obj.deal.name
    def get_strategy(self, obj):
        return obj.deal.strategy


class PortfolioPositionListSerializer(serializers.ModelSerializer):
    unrealised_gain = serializers.ReadOnlyField()
    moic            = serializers.ReadOnlyField()
    deal_name       = serializers.SerializerMethodField()
    strategy        = serializers.SerializerMethodField()

    class Meta:
        model  = PortfolioPosition
        fields = ['id', 'deal', 'deal_name', 'strategy', 'entry_date', 'entry_value',
                  'current_value', 'unrealised_gain', 'moic', 'is_active', 'currency']

    def get_deal_name(self, obj): return obj.deal.name
    def get_strategy(self, obj):  return obj.deal.strategy


class PortfolioPositionViewSet(viewsets.ModelViewSet):
    queryset           = PortfolioPosition.objects.all().select_related('deal')
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['is_active', 'deal__strategy']

    def get_serializer_class(self):
        return PortfolioPositionListSerializer if self.action == 'list' else PortfolioPositionSerializer

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Aggregate portfolio metrics for the dashboard."""
        positions = PortfolioPosition.objects.filter(is_active=True).select_related('deal')

        total_invested = sum(p.entry_value   for p in positions)
        total_current  = sum(p.current_value for p in positions)
        total_gain     = total_current - total_invested

        by_strategy = {}
        for p in positions:
            s = p.deal.strategy
            if s not in by_strategy:
                by_strategy[s] = {'count': 0, 'invested': 0, 'current': 0}
            by_strategy[s]['count']    += 1
            by_strategy[s]['invested'] += float(p.entry_value)
            by_strategy[s]['current']  += float(p.current_value)

        return Response({
            'total_positions':  len(positions),
            'total_invested':   float(total_invested),
            'total_current':    float(total_current),
            'total_gain':       float(total_gain),
            'total_return_pct': round(float(total_gain) / float(total_invested) * 100, 2) if total_invested else 0,
            'by_strategy':      by_strategy,
            'open_alerts':      KPIAlert.objects.filter(status='open').count(),
        })

    @action(detail=True, methods=['post'])
    def add_snapshot(self, request, pk=None):
        position = self.get_object()
        s = PerformanceSnapshotSerializer(data=request.data)
        if s.is_valid():
            s.save(position=position, created_by=request.user)
            # Update current_value from snapshot NAV
            position.current_value = s.validated_data['nav']
            position.save(update_fields=['current_value', 'updated_at'])
            return Response(s.data, status=201)
        return Response(s.errors, status=400)


class KPIAlertViewSet(viewsets.ModelViewSet):
    queryset           = KPIAlert.objects.all()
    serializer_class   = KPIAlertSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['status', 'severity', 'position']

    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        alert = self.get_object()
        alert.status = 'acknowledged'
        alert.save()
        return Response(KPIAlertSerializer(alert).data)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        from django.utils import timezone
        alert = self.get_object()
        alert.status      = 'resolved'
        alert.resolved_at = timezone.now()
        alert.resolved_by = request.user
        alert.save()
        return Response(KPIAlertSerializer(alert).data)


# ── URLs ──────────────────────────────────────────────────────────────────────
from django.urls import path, include
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register('positions', PortfolioPositionViewSet, basename='position')
router.register('alerts',    KPIAlertViewSet,          basename='kpi-alert')

urlpatterns = [path('', include(router.urls))]
