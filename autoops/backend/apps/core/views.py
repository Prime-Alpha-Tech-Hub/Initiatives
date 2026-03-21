from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count
from .models import AutomationRun


class AutomationRunSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AutomationRun
        fields = '__all__'


class AutomationRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset           = AutomationRun.objects.all()
    serializer_class   = AutomationRunSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['module', 'status', 'triggered_by']
    search_fields      = ['task_name', 'summary']
    ordering_fields    = ['started_at', 'duration_ms']

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Aggregate stats for the main dashboard."""
        from django.utils import timezone
        from datetime import timedelta
        since = timezone.now() - timedelta(days=7)
        runs  = AutomationRun.objects.filter(started_at__gte=since)

        by_module = list(
            runs.values('module').annotate(
                total=Count('id'),
                success=Count('id', filter=models.Q(status='success')),
                failed=Count('id', filter=models.Q(status='failed')),
            )
        )
        return Response({
            'total_runs':    runs.count(),
            'success_rate':  round(runs.filter(status='success').count() / max(runs.count(), 1) * 100, 1),
            'failed':        runs.filter(status='failed').count(),
            'by_module':     by_module,
            'recent':        AutomationRunSerializer(runs.order_by('-started_at')[:10], many=True).data,
        })


from django.db import models
from django.urls import path, include
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register('runs', AutomationRunViewSet, basename='run')
urlpatterns = [path('', include(router.urls))]
